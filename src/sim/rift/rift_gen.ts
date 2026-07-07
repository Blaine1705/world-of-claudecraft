// The procedural Rift generator: pure, deterministic functions that turn a
// compact descriptor (seed + baseLevel + floorIndex) into a fully-resolved floor
// (geometry + visual style + spawn plan + gate). The authoritative server and
// every client call these identical functions, so no rift geometry is ever
// transmitted, only the descriptor. This mirrors how terrainHeight(x,z,seed) is a
// pure function both the sim and the renderer sample (see src/sim/world.ts).
//
// Sim layer: no DOM/Three imports. Randomness uses a LOCAL Rng seeded from the
// descriptor (NOT the live sim rng), so generation never perturbs the sim's
// global draw order and is reproducible anywhere.

import type { Collider } from '../colliders';
import { RIFT_THEMES, type RiftTheme } from '../content/rift/themes';
import {
  type DungeonLayout,
  type GridPoint,
  type InteriorStyle,
  layoutColliders,
  type WallStub,
} from '../dungeon_layout';
import { polygonIsStarShaped, polygonSelfIntersects, polygonSignedArea } from '../geometry2d';
import { Rng } from '../rng';
import type { RiftFloorPlan, RiftObjectPlan, RiftPlan, RiftPuzzle, RiftSpawn } from './types';

// ---- Tuning -----------------------------------------------------------------
const MIN_FLOORS = 3;
const MAX_FLOORS = 6;
const LEVEL_CAP = 60;
const ENTRY_Z_OFFSET = 8; // player arrival, past the entrance porch
const AISLE_HALF = 5.5; // centre column kept clear of all obstacles (walkable spine)
const BODY_R = 0.6; // player body radius used for clearance checks

const RIFT_SUFFIXES = [
  'Abyss',
  'Depths',
  'Descent',
  'Hollow',
  'Labyrinth',
  'Warren',
  'Sanctum',
  'Rift',
] as const;

// Deterministic 32-bit mix so each floor gets an independent, reproducible seed
// from (seed, floorIndex) without consuming any external rng.
function mix(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** How many floors this rift runs (deterministic from the seed). */
export function riftFloorCount(seed: number): number {
  return new Rng(mix(seed, 0x510f)).int(MIN_FLOORS, MAX_FLOORS);
}

function themeForFloor(seed: number, floorIndex: number): RiftTheme {
  const rng = new Rng(mix(seed, 0x7000 + floorIndex));
  return rng.pick(RIFT_THEMES as RiftTheme[]);
}

// Small deterministic per-channel jitter of a 0xRRGGBB colour, so two floors that
// happen to share a theme still read a little differently. `amt` is a fraction.
function jitterColor(rng: Rng, hex: number, amt: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const f = () => 1 + rng.range(-amt, amt);
  return (clamp(r * f()) << 16) | (clamp(g * f()) << 8) | clamp(b * f());
}

function buildStyle(rng: Rng, theme: RiftTheme): InteriorStyle {
  return {
    kit: theme.kit,
    torch: {
      flame: jitterColor(rng, theme.torch.flame, 0.08),
      emissive: jitterColor(rng, theme.torch.emissive, 0.08),
      light: jitterColor(rng, theme.torch.light, 0.08),
    },
    fog: {
      color: jitterColor(rng, theme.fog.color, 0.12),
      near: Math.round(theme.fog.near + rng.range(-2, 2)),
      far: Math.round(theme.fog.far + rng.range(-6, 6)),
    },
    wallTint: theme.wallTint !== undefined ? jitterColor(rng, theme.wallTint, 0.06) : undefined,
    floorTint: theme.floorTint !== undefined ? jitterColor(rng, theme.floorTint, 0.06) : undefined,
    daisRaised: theme.daisRaised ?? false,
  };
}

// ---- Geometry ---------------------------------------------------------------

/** Whether (x,z) clears every obstacle by the body radius (walkable). Handles
 * rotated OBBs (polygon-shell wall segments carry a non-zero rot) by testing the
 * point in each box's local frame, matching colliders.ts pushOut. */
function isClear(colliders: readonly Collider[], x: number, z: number, r = BODY_R): boolean {
  for (const c of colliders) {
    if (c.type === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return false;
    } else {
      // Match colliders.ts pushOut exactly: it computes the box-local point via
      // rotY(dx, dz, -c.rot), which expands to (dx*cos(rot) - dz*sin(rot),
      // dx*sin(rot) + dz*cos(rot)) because rotY carries a z-sign flip. Using -rot
      // in cos/sin here (an earlier bug) swapped the dz sign and disagreed with
      // pushOut on tilted polygon-wall segments.
      const dx = x - c.x;
      const dz = z - c.z;
      const cos = Math.cos(c.rot);
      const sin = Math.sin(c.rot);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r) return false;
    }
  }
  return true;
}

/** Nudge a candidate point toward the always-clear centre spine until it clears
 * every obstacle. Deterministic (fixed march), and guaranteed to terminate
 * because |x| <= AISLE_HALF is kept obstacle-free by construction. */
function toClear(colliders: readonly Collider[], x: number, z: number): GridPoint {
  if (isClear(colliders, x, z)) return { x, z };
  const step = x >= 0 ? -1 : 1;
  let cx = x;
  for (let i = 0; i < 40; i++) {
    cx += step;
    if (Math.abs(cx) <= AISLE_HALF) cx = 0;
    if (isClear(colliders, cx, z)) return { x: cx, z };
    if (cx === 0) break;
  }
  return { x: 0, z };
}

interface GeneratedGeometry {
  layout: DungeonLayout;
  colliders: Collider[];
  /** Room half-width at instance-local z (the walkable envelope; obstacles + spawns
   * are kept inside it). For a rectangle this is a constant. */
  halfWidthAt: (z: number) => number;
  archetype: string;
}

// Room silhouettes. Each is a symmetric half-width PROFILE over the room length
// (t in [0,1]); the centre spine (x=0) always stays inside and walkable. `hall`
// is the plain rectangle; the rest become star-shaped `shellPolygon` rooms that
// render + collide as their true shape. Boss floors bias to wide-open shapes so
// the giant boss has room to fight.
type Profile = (t: number) => number;
const ROOM_ARCHETYPES = [
  'hall',
  'rotunda',
  'taper',
  'apse',
  'hourglass',
  'chambers',
  'cavern',
] as const;
// Boss floors only use shapes that are WIDE at the back (where the boss + dais
// sit), so the giant boss always has an open arena.
const BOSS_ARCHETYPES = ['hall', 'taper', 'apse'] as const;

function smoothstep(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

function makeProfile(rng: Rng, archetype: string, wMin: number, wMax: number): Profile {
  const span = wMax - wMin;
  switch (archetype) {
    case 'rotunda': // bulging round hall
      return (t) => wMin + span * Math.sin(Math.PI * t);
    case 'taper': // widens toward the boss end
      return (t) => wMin + span * t;
    case 'apse': // narrow nave, then a wide round chamber at the boss end
      return (t) => (t < 0.5 ? wMin : wMin + span * smoothstep((t - 0.5) / 0.5));
    case 'hourglass': // wide ends, a narrow passage at the waist
      return (t) => wMin + span * (1 - Math.sin(Math.PI * t));
    case 'chambers': {
      // Two bulges joined by a passage: cos(4*pi*t) gives wide/narrow/wide/narrow/wide.
      return (t) => wMin + span * (0.5 + 0.5 * Math.cos(4 * Math.PI * t));
    }
    case 'cavern': {
      // Organic wobble from a few fixed-phase harmonics (deterministic per rng).
      const p1 = rng.range(0, Math.PI * 2);
      const p2 = rng.range(0, Math.PI * 2);
      const p3 = rng.range(0, Math.PI * 2);
      return (t) => {
        const w =
          0.55 +
          0.22 * Math.sin(3 * Math.PI * t + p1) +
          0.14 * Math.sin(5 * Math.PI * t + p2) +
          0.09 * Math.sin(8 * Math.PI * t + p3);
        return wMin + span * Math.max(0, Math.min(1, w));
      };
    }
    default: // 'hall'
      return () => wMax;
  }
}

function buildLayout(rng: Rng, _floorIndex: number, isBoss: boolean): GeneratedGeometry {
  const zMin = -19;
  const length = isBoss ? rng.int(104, 132) : rng.int(104, 152);
  const zMax = zMin + length;
  const midZ = (zMin + zMax) / 2;
  const range = zMax - zMin;

  const archetype = isBoss
    ? rng.pick(BOSS_ARCHETYPES as unknown as string[])
    : rng.pick(ROOM_ARCHETYPES as unknown as string[]);
  // Narrowest half-width keeps the spine + a walkable margin (>= AISLE_HALF + ~4);
  // widest drives how grand the room feels. Boss chambers skew wide.
  const wMin = rng.range(10, 13);
  const wMax = isBoss ? rng.range(24, 38) : rng.range(16, 34);
  const profile = makeProfile(rng, archetype, wMin, Math.max(wMin + 4, wMax));
  const halfWidthAt = (z: number): number =>
    Math.max(wMin, profile(Math.max(0, Math.min(1, (z - zMin) / range))));

  // Assemble the shell polygon for non-rectangular archetypes; validate it is
  // simple + star-shaped from the centre pole (so render/collision/pathing all
  // behave), else fall back to a plain rectangle.
  let shellPolygon: Array<{ x: number; z: number }> | undefined;
  let shellPole: { x: number; z: number } | undefined;
  let wallX: number;
  if (archetype === 'hall') {
    wallX = Math.round(wMax);
  } else {
    const zs: number[] = [];
    for (let z = zMin; z <= zMax; z += 6) zs.push(z);
    if (zs[zs.length - 1] !== zMax) zs.push(zMax);
    const right = zs.map((z) => ({ x: Math.round(halfWidthAt(z) * 10) / 10, z }));
    const left = zs.map((z) => ({ x: -Math.round(halfWidthAt(z) * 10) / 10, z })).reverse();
    let poly = [...right, ...left];
    if (polygonSignedArea(poly) < 0) poly = poly.slice().reverse();
    const pole = { x: 0, z: midZ };
    if (!polygonSelfIntersects(poly) && polygonIsStarShaped(poly, pole)) {
      shellPolygon = poly;
      shellPole = pole;
      wallX = Math.ceil(Math.max(...poly.map((p) => Math.abs(p.x)))) + 2;
    } else {
      wallX = Math.round(wMax); // fall back to a rectangle
    }
  }
  const isPoly = shellPolygon !== undefined;

  const daisR = Math.min(
    isBoss ? rng.range(12, 15) : rng.range(8, 10.5),
    halfWidthAt(zMax - 12) - 2,
  );
  const dais = { x: 0, z: zMax - Math.round(daisR + 5), r: Math.max(6, daisR) };

  // Pillar rows down the nave, off the centre spine but inside the local width.
  const pillars: GridPoint[] = [];
  const pillarBase = rng.pick([12, 14, 16]);
  const rowGap = rng.pick([14, 16, 18, 20]);
  for (let z = zMin + rng.int(22, 30); z <= dais.z - 16; z += rowGap) {
    const inset = Math.min(pillarBase, halfWidthAt(z) - 3);
    if (inset < AISLE_HALF + 2) continue; // too narrow here for flanking pillars
    if (rng.chance(0.25)) pillars.push({ x: rng.chance(0.5) ? -inset : inset, z });
    else pillars.push({ x: -inset, z }, { x: inset, z });
  }

  // Wall-side obstacles hugging the (possibly curved) walls.
  const tombs: GridPoint[] = [];
  if (rng.chance(0.8)) {
    const tombGap = rng.pick([20, 24, 28]);
    for (let z = zMin + rng.int(16, 24); z <= dais.z - 20; z += tombGap) {
      const inset = halfWidthAt(z) - 4;
      if (inset < AISLE_HALF + 2) continue;
      if (rng.chance(0.85)) tombs.push({ x: -inset, z });
      if (rng.chance(0.85)) tombs.push({ x: inset, z });
    }
  }

  // Chamber-waist stubs only for the rectangular hall (polygon rooms get their
  // structure from the shell itself; a stub could poke outside a narrow section).
  const stubs: WallStub[] = [];
  if (!isPoly && rng.chance(0.5)) {
    const waistCount = rng.pick([1, 2]);
    for (let i = 0; i < waistCount; i++) {
      const wz = zMin + Math.round(((i + 1) / (waistCount + 1)) * (dais.z - 20 - zMin)) + 20;
      const passageHalf = AISLE_HALF + rng.range(1.5, 3);
      const hw = (wallX - passageHalf) / 2;
      if (hw <= 0.5) continue;
      const centerMag = (wallX + passageHalf) / 2;
      const hd = rng.pick([3, 4, 5]);
      stubs.push({ x: -centerMag, z: wz, hw, hd }, { x: centerMag, z: wz, hw, hd });
    }
  }

  // Floor clutter, scattered off-centre, inside the local width.
  const clutter: GridPoint[] = [];
  const clutterCount = rng.int(4, 10);
  for (let i = 0; i < clutterCount; i++) {
    const z = zMin + rng.range(14, dais.z - 18 - zMin);
    const hw = halfWidthAt(z);
    if (hw - AISLE_HALF < 4) continue;
    const side = rng.chance(0.5) ? -1 : 1;
    const x = side * rng.range(AISLE_HALF + 2, hw - 2);
    clutter.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }

  const layout: DungeonLayout = {
    zMin,
    zMax,
    sideWallZ: midZ,
    sideWallHd: range / 2 + 1,
    wallX,
    endWallHw: wallX + 1,
    floorHalfX: wallX,
    doorZ: zMin + 2,
    pillars,
    tombs,
    stubs,
    dais,
    clutter,
    shellPolygon,
    shellPole,
  };
  return { layout, colliders: layoutColliders(layout), halfWidthAt, archetype };
}

// ---- Spawns + objects -------------------------------------------------------

function planSpawns(
  rng: Rng,
  theme: RiftTheme,
  geo: GeneratedGeometry,
  floorLevel: number,
  isBoss: boolean,
): RiftSpawn[] {
  const { layout, colliders, halfWidthAt } = geo;
  const out: RiftSpawn[] = [];

  const packStartZ = layout.zMin + 22;
  const packEndZ = layout.dais.z - (isBoss ? 22 : 14);
  const packGap = rng.pick([16, 18, 20]);
  const packCount = Math.max(2, Math.floor((packEndZ - packStartZ) / packGap));

  for (let i = 0; i < packCount; i++) {
    const z = packStartZ + i * packGap;
    const size = isBoss ? rng.int(1, 2) : rng.int(2, 3);
    for (let j = 0; j < size; j++) {
      const templateId = rng.pick(theme.trash as string[]);
      // Spread the pack across the aisle within the local width, then pull any
      // blocked spawn to a clear tile. Round BEFORE the clearance march so the
      // stored point is exactly the one validated as clear (no rounding drift).
      const spread = Math.max(2, halfWidthAt(z) - 4);
      const rawX = Math.round(rng.range(-spread, spread) * 10) / 10;
      const rawZ = Math.round((z + rng.range(-2, 2)) * 10) / 10;
      const p = toClear(colliders, rawX, rawZ);
      // color/scale left undefined: the base template's (theme-appropriate) values
      // are used, then lightly jittered per-entity at spawn time (rift/runs.ts).
      out.push({ templateId, x: p.x, z: p.z, level: floorLevel });
    }
  }

  if (isBoss) {
    const boss: RiftSpawn = {
      templateId: theme.boss,
      x: 0,
      z: layout.dais.z,
      level: floorLevel,
      boss: true,
    };
    out.push(boss);
    // Two dais guards flanking the boss.
    for (const gx of [-6, 6]) {
      const p = toClear(colliders, gx, layout.dais.z - 6);
      out.push({
        templateId: rng.pick(theme.trash as string[]),
        x: p.x,
        z: p.z,
        level: floorLevel,
      });
    }
  }
  return out;
}

function planPuzzle(rng: Rng, isBoss: boolean): RiftPuzzle {
  if (isBoss) return { kind: 'none', pylonCount: 0 };
  if (rng.chance(0.4)) return { kind: 'rune_pylons', pylonCount: rng.int(2, 3) };
  return { kind: 'none', pylonCount: 0 };
}

function planObjects(
  geo: GeneratedGeometry,
  isBoss: boolean,
  puzzle: RiftPuzzle,
): RiftObjectPlan[] {
  const { layout, colliders } = geo;
  const out: RiftObjectPlan[] = [];
  if (isBoss) {
    // The reward chest sits on the dais; the exit portal is spawned by runs.ts
    // only after the boss dies (so it can't be used to skip the fight).
    out.push({
      kind: 'chest',
      x: 0,
      z: layout.dais.z + Math.round(layout.dais.r * 0.6),
      name: 'Rift Cache',
    });
  } else {
    // Descent portal centred just past the dais, always on the clear spine.
    out.push({
      kind: 'descent',
      x: 0,
      z: layout.dais.z + Math.round(layout.dais.r + 2),
      name: 'Rift Descent',
    });
    if (puzzle.kind === 'rune_pylons') {
      const zBase = layout.zMin + 40;
      for (let i = 0; i < puzzle.pylonCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = zBase + i * 22;
        const x = side * Math.max(AISLE_HALF + 2, geo.halfWidthAt(z) - 5);
        const p = toClear(colliders, x, z);
        out.push({ kind: 'rune_pylon', x: p.x, z: p.z, name: 'Rune Pylon' });
      }
    }
  }
  return out;
}

// ---- Public generation ------------------------------------------------------

const FLOOR_CACHE = new Map<string, RiftFloorPlan>();
const CACHE_LIMIT = 128;

function floorLevelFor(baseLevel: number, floorIndex: number): number {
  return Math.max(1, Math.min(LEVEL_CAP, Math.round(baseLevel) + floorIndex));
}

/** The rift as a whole: name + floor count (derived from seed + baseLevel). */
export function generateRiftPlan(seed: number, baseLevel: number): RiftPlan {
  const floorCount = riftFloorCount(seed);
  const bossTheme = themeForFloor(seed, floorCount - 1);
  const nameRng = new Rng(mix(seed, 0x9a3e));
  const noun = nameRng.pick(bossTheme.nouns as string[]);
  const suffix = nameRng.pick(RIFT_SUFFIXES as unknown as string[]);
  return {
    seed,
    baseLevel,
    name: `The ${noun} ${suffix}`,
    themeId: bossTheme.id,
    floorCount,
  };
}

/** A fully-resolved floor. Memoised (bounded) since both the sim spawn path and
 * the renderer regenerate the same floor repeatedly. */
export function generateRiftFloor(
  seed: number,
  baseLevel: number,
  floorIndex: number,
): RiftFloorPlan {
  const key = `${seed >>> 0}:${Math.round(baseLevel)}:${floorIndex}`;
  const cached = FLOOR_CACHE.get(key);
  if (cached) return cached;

  const floorCount = riftFloorCount(seed);
  const clampedIndex = Math.max(0, Math.min(floorCount - 1, floorIndex));
  const isBoss = clampedIndex === floorCount - 1;
  const theme = themeForFloor(seed, clampedIndex);
  const rng = new Rng(mix(seed, 0xf100 + clampedIndex));

  const geo = buildLayout(rng, clampedIndex, isBoss);
  const style = buildStyle(rng, theme);
  const floorLevel = floorLevelFor(baseLevel, clampedIndex);
  const puzzle = planPuzzle(rng, isBoss);
  const spawns = planSpawns(rng, theme, geo, floorLevel, isBoss);
  const objects = planObjects(geo, isBoss, puzzle);

  const plan: RiftFloorPlan = {
    seed: seed >>> 0,
    baseLevel: Math.round(baseLevel),
    floorIndex: clampedIndex,
    floorCount,
    isBoss,
    name: `${theme.name} ${isBoss ? 'Sanctum' : 'Reaches'}: Depth ${clampedIndex + 1}`,
    themeName: theme.name,
    layout: geo.layout,
    style,
    entry: { x: 0, z: geo.layout.zMin + ENTRY_Z_OFFSET },
    spawns,
    objects,
    puzzle,
  };

  if (FLOOR_CACHE.size >= CACHE_LIMIT) FLOOR_CACHE.clear();
  FLOOR_CACHE.set(key, plan);
  return plan;
}

/** Instance-local collider set for a rift floor (pure, from the generated layout). */
export function riftFloorColliders(
  seed: number,
  baseLevel: number,
  floorIndex: number,
): Collider[] {
  return layoutColliders(generateRiftFloor(seed, baseLevel, floorIndex).layout);
}
