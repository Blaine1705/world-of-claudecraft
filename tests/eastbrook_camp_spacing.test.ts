import { describe, expect, it } from 'vitest';
import { campSpawnOffset } from '../src/sim/camp_scatter';
import { isBlocked } from '../src/sim/colliders';
import { LAKE, ZONE1_CAMPS } from '../src/sim/content/zone1';
import { PLAYER_SWIM_DEPTH } from '../src/sim/pathfind';
import { rideSteepnessAt } from '../src/sim/ride_height';
import type { CampDef } from '../src/sim/types';
import {
  groundHeight,
  isInWaterBody,
  terrainHeight,
  WATER_LEVEL,
  waterLevel,
  waterLevelAt,
} from '../src/sim/world';

// The starter zone's hostile camps used to chain-pull: mobs stood about 8 yd apart
// inside a camp while their aggro radii are 9-13 yd, so tagging one dragged its
// neighbours, and the wolf/boar discs reached to within ~34 yd of the town hub.
// The lever is SPACING (camp radius and camp separation), never a global aggro
// nerf: aggroRadius and the flee-rally in src/sim/mob/social_aggro.ts are
// deliberately untouched by this suite.

// The production world seed (server/game.ts WORLD_SEED, server/main.ts).
const SEED = 20061;

// Nominal nearest-neighbour spacing of a sunflower camp disc (camp_scatter.ts:51).
const NOMINAL_SPACING = (camp: CampDef) => camp.radius / Math.sqrt(camp.count);

// Floors this suite enforces.
const MIN_NEIGHBOUR_SPACING = 11.5; // yd between adjacent mobs in one camp
const MIN_TOWN_CLEARANCE = 38; // yd from the town hub at origin to a camp's disc edge
const SEPARATION_SLOPE = 0.75; // discs may lightly abut, never interleave deeply
const SEPARATION_INTERCEPT = 8;
const STARTER_BAND = 100; // "close to town": disc edge within this many yd of origin
const MAX_BEARING_DRIFT_DEG = 15; // camps push outward, they do not relocate across the map

const requiredSeparation = (a: CampDef, b: CampDef) =>
  (a.radius + b.radius) * SEPARATION_SLOPE + SEPARATION_INTERCEPT;

const centerDistance = (c: CampDef) => Math.hypot(c.center.x, c.center.z);
const discEdgeToTown = (c: CampDef) => centerDistance(c) - c.radius;
const campDistance = (a: CampDef, b: CampDef) =>
  Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z);

// Every ZONE1_CAMPS row as shipped TODAY, in author order. Author order is a
// determinism contract (src/sim/data.ts: a camp inserted mid-array shifts every
// later camp's world-gen rng draws), and the roster pin is what stops a spacing
// retune from "fixing" density by quietly deleting or thinning a pack.
const PINNED_ROSTER: { mobId: string; count: number }[] = [
  { mobId: 'forest_wolf', count: 7 },
  { mobId: 'forest_wolf', count: 6 },
  { mobId: 'old_greyjaw', count: 1 },
  { mobId: 'wild_boar', count: 6 },
  { mobId: 'wild_boar', count: 5 },
  { mobId: 'mogger', count: 1 },
  { mobId: 'webwood_spider', count: 7 },
  { mobId: 'mudfin_murloc', count: 8 },
  { mobId: 'tunnel_rat', count: 9 },
  { mobId: 'vale_bandit', count: 7 },
  { mobId: 'vale_bandit', count: 5 },
  { mobId: 'gorrak', count: 1 },
  { mobId: 'restless_bones', count: 8 },
  { mobId: 'captain_verlan', count: 1 },
];

// The camps this suite governs, pinned by author index so the set can never
// silently shrink when a camp is pushed past the starter band. A packed camp is
// one with at least two mobs (a named rare spawns alone, so it has no
// intra-camp spacing to fix) whose disc reaches into the starter band.
const GOVERNED_INDICES = [0, 1, 3, 4, 6, 7, 8, 9, 12];

// The shipped bearing and radial distance of each governed camp before this
// retune, so the fix is provably an outward push along the same bearing rather
// than a relocation. Index-aligned with GOVERNED_INDICES.
const SHIPPED_PLACEMENT: { x: number; z: number }[] = [
  { x: -15, z: 55 },
  { x: 20, z: 70 },
  { x: 55, z: 12 },
  { x: 80, z: -15 },
  { x: -60, z: 5 },
  { x: -75, z: 57 },
  { x: -82, z: -62 },
  { x: 65, z: -65 },
  { x: 80, z: 78 },
];

const governed = () => GOVERNED_INDICES.map((i) => ZONE1_CAMPS[i]);
const label = (c: CampDef) => `${c.mobId}@(${c.center.x},${c.center.z})`;

// The ONE camp that cannot reach MIN_NEIGHBOUR_SPACING, and why. The murloc camp
// sits on Mirror Lake, and terrainHeightUnpadded (src/sim/world.ts) flattens a
// disc of radius * 1.8 around every camp center toward the ground height at that
// center. Widening this camp to 11.5 yd spacing (radius 32.6 for 8 mobs) drags a
// 59 yd flatten disc across the lake and raises its bed from -7.6 to about -2.7,
// which is above WATER_LEVEL - PLAYER_SWIM_DEPTH: the lake stops needing a swim,
// fish stop leaping, and the map stops painting it as water
// (tests/water_terrain_awareness.test.ts). Measured ceiling with the lake bed
// preserved and no dry shore sunk: radius ~16.5, i.e. ~5.8 yd spacing. Spacing is
// therefore the wrong lever here; fixing this camp needs a lower mob count, which
// is out of scope for a spacing pass. The lake-integrity test below is what stops
// a future widening from "fixing" the spacing by filling in the lake.
const LAKE_BOUND_MOB_IDS = new Set(['mudfin_murloc']);

// Why (x, z) is not a usable spawn point, or null when it is. Mirrors the dry-land
// floor the camp spawn loop applies in sim.ts (minHeight for a non-swimmer) plus
// the collider and rideability gates. Every camp checked here is a land camp; the
// one amphibious camp (mudfin, which the sim lets wade) is exempt below.
function unspawnableReason(x: number, z: number): string | null {
  const height = groundHeight(x, z, SEED);
  const floor = waterLevel() + 0.4;
  if (height < floor) return `below the spawn floor (h=${height.toFixed(2)} < ${floor})`;
  const surface = waterLevelAt(x, z);
  if (surface !== -Infinity && height < surface + 0.4) {
    return `submerged in a lake (h=${height.toFixed(2)} < ${surface + 0.4})`;
  }
  if (isBlocked(SEED, x, z, 0.5)) return 'inside a collider';
  const steepness = rideSteepnessAt(x, z, SEED);
  if (steepness >= 1.5) return `too steep (${steepness.toFixed(2)})`;
  return null;
}

// The points the camp actually scatters its mobs to (campSpawnOffset with the
// jitter zeroed), plus an 8-point sunflower probe at the same radius so a sparse
// camp is still sampled densely across its whole disc.
function scatterProbe(camp: CampDef): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  for (const count of [camp.count, 8]) {
    for (let i = 0; i < count; i++) {
      const offset = campSpawnOffset(i, count, camp.radius, 0, 0);
      points.push({ x: camp.center.x + offset.x, z: camp.center.z + offset.z });
    }
  }
  return points;
}

describe('eastbrook starter camp spacing', () => {
  it('pins the camp roster: same mobs, same counts, same author order', () => {
    expect(ZONE1_CAMPS.map((c) => ({ mobId: c.mobId, count: c.count }))).toEqual(PINNED_ROSTER);
  });

  it('governs every packed camp whose disc reaches the starter band', () => {
    // Derive the set independently and require it to match the pinned indices, so
    // the geometry assertions below can never be weakened by a camp drifting out
    // of the band (or a new dense camp drifting in unchecked).
    const derived = ZONE1_CAMPS.reduce<number[]>((acc, camp, i) => {
      if (camp.count >= 2 && discEdgeToTown(camp) <= STARTER_BAND) acc.push(i);
      return acc;
    }, []);
    expect(derived).toEqual(GOVERNED_INDICES);
  });

  it('spreads mobs at least 11.5 yd apart inside every governed camp', () => {
    const checked = governed().filter((c) => !LAKE_BOUND_MOB_IDS.has(c.mobId));
    // Guard the exemption itself: exactly one camp claims it, so a future retune
    // cannot quietly widen the waiver to whichever camp is inconvenient.
    expect(governed().length - checked.length).toBe(1);
    for (const camp of checked) {
      expect(
        NOMINAL_SPACING(camp),
        `${label(camp)} packs ${camp.count} mobs into r=${camp.radius}`,
      ).toBeGreaterThanOrEqual(MIN_NEIGHBOUR_SPACING);
    }
  });

  it('keeps the lake-bound murloc camp from filling in Mirror Lake', () => {
    // The exemption above is only legitimate while the camp stays small enough to
    // leave the lake swimmable. Any widening must re-prove this.
    const murloc = ZONE1_CAMPS.find((c) => LAKE_BOUND_MOB_IDS.has(c.mobId));
    expect(murloc, 'the lake-bound camp must still exist').toBeDefined();
    if (!murloc) return;
    const swimFloor = WATER_LEVEL - PLAYER_SWIM_DEPTH;
    let deepCells = 0;
    for (let x = LAKE.x - LAKE.radius * 2; x <= LAKE.x + LAKE.radius * 2; x += 4) {
      for (let z = LAKE.z - LAKE.radius * 2; z <= LAKE.z + LAKE.radius * 2; z += 4) {
        if (!isInWaterBody(x, z)) continue;
        if (terrainHeight(x, z, SEED) < swimFloor) deepCells++;
      }
    }
    // Mirror Lake keeps a swimmable core. The shipped world has ~111 such cells on
    // this 4 yd grid; the floor leaves room for unrelated terrain tuning but fails
    // hard on the ~0 a 11.5 yd murloc camp produces.
    expect(deepCells, 'Mirror Lake lost its swimmable depth').toBeGreaterThanOrEqual(80);
  });

  it('keeps governed camp discs from interleaving with each other', () => {
    const list = governed();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        expect(
          campDistance(a, b),
          `${label(a)} vs ${label(b)} are ${campDistance(a, b).toFixed(2)} apart, need ${requiredSeparation(a, b).toFixed(2)}`,
        ).toBeGreaterThanOrEqual(requiredSeparation(a, b));
      }
    }
  });

  it('leaves the road ring out of town calm', () => {
    for (const camp of governed()) {
      expect(
        discEdgeToTown(camp),
        `${label(camp)} disc reaches ${discEdgeToTown(camp).toFixed(2)} yd from the town hub`,
      ).toBeGreaterThanOrEqual(MIN_TOWN_CLEARANCE);
    }
  });

  it('places every retuned camp on ground the sim can actually spawn on', () => {
    // The lake-bound camp is excluded because this pass does not move it: its
    // shipped scatter already clips its own mud huts, which the spawn loop's
    // findSafePos walk resolves. Every camp this pass DOES place must need no
    // such rescue, or findSafePos would bunch the mobs back together and undo
    // the spacing.
    for (const camp of governed().filter((c) => !LAKE_BOUND_MOB_IDS.has(c.mobId))) {
      expect(
        unspawnableReason(camp.center.x, camp.center.z),
        `${label(camp)} center is unusable`,
      ).toBeNull();
      for (const point of scatterProbe(camp)) {
        expect(
          unspawnableReason(point.x, point.z),
          `${label(camp)} scatters a mob to (${point.x.toFixed(1)}, ${point.z.toFixed(1)}), which is unusable`,
        ).toBeNull();
      }
    }
  });

  it('pushes each camp outward along its own bearing, not across the map', () => {
    const list = governed();
    for (let i = 0; i < list.length; i++) {
      const camp = list[i];
      const shipped = SHIPPED_PLACEMENT[i];
      const drift = Math.abs(
        ((Math.atan2(camp.center.z, camp.center.x) - Math.atan2(shipped.z, shipped.x)) * 180) /
          Math.PI,
      );
      expect(
        Math.min(drift, 360 - drift),
        `${label(camp)} swung off its shipped bearing`,
      ).toBeLessThanOrEqual(MAX_BEARING_DRIFT_DEG);
    }
  });

  it('keeps Old Greyjaw north of both wolf runs and clear of their packs', () => {
    // q_greyjaw sends the player to "the deep woods north of the wolf runs", and a
    // lone rare elite must not sit inside an enlarged pack's scatter disc.
    const greyjaw = ZONE1_CAMPS[2];
    const wolves = [ZONE1_CAMPS[0], ZONE1_CAMPS[1]];
    for (const wolf of wolves) {
      expect(greyjaw.center.z, `greyjaw must stay north of ${label(wolf)}`).toBeGreaterThan(
        wolf.center.z,
      );
      expect(
        campDistance(greyjaw, wolf) - wolf.radius,
        `greyjaw sits inside ${label(wolf)}`,
      ).toBeGreaterThanOrEqual(10);
    }
  });
});
