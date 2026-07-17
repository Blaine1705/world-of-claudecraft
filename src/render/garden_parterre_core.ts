// The Evergarden's formal planting plan (pure core, no Three/DOM). The realm
// reads as a Victorian palace garden: every flower and bush belongs to an
// authored arrangement instead of a random scatter. Three bed archetypes
// (quatrefoil, concentric rings, knot stripes) sit on hand-placed plots
// across the lawns, low ribbon beds flank the walks, and clipped topiary
// stands in avenue pairs along the roads and as sentinels at plot corners.
// Consumers: foliage.ts (ground flowers via parterreFlowerTintAt, hedge and
// rose bushes via parterreBushSpots) and garden_features.ts (topiary via
// gardenAvenueSpots + parterrePlots). Placement is deterministic; the plot
// sites are validated against terrain, water, roads, the Great Maze, camps,
// gather nodes, and the great trees by tests/garden_parterre.test.ts.

import { EVERGARDEN_PROPS, EVERGARDEN_ROADS, EVERGARDEN_ZONE } from '../sim/content/evergarden';
import { fbm2, hash2 } from '../sim/rng';
import {
  gardenLandness,
  MAZE_CELL,
  MAZE_COLS,
  MAZE_X0,
  MAZE_Z0,
  MAZE_Z1,
  roadDistance,
  terrainHeight,
  WATER_LEVEL,
} from '../sim/world';

export type ParterreKind = 'quatrefoil' | 'concentric' | 'knot';

export interface ParterrePlot {
  x: number;
  z: number;
  r: number;
  kind: ParterreKind;
  /** 'windmill': a decor prop stands at the heart instead of the big bush
   * (the prop itself is placed via EVERGARDEN_PROPS.decorProps) */
  centerpiece?: 'windmill';
}

export interface ParterreBushSpot {
  x: number;
  z: number;
  kind: 'bush' | 'bushFlowers';
  scale: number;
  /** raw instance tint for bushFlowers; hedges (plain bush) leave it unset */
  bloomTint?: number;
}

export interface TopiarySpot {
  x: number;
  z: number;
  rot: number;
  /** index into the consumer's topiary form set. Always 0 (the clipped
   * ball): the cone and tiered "snowman" forms were retired from the
   * Evergarden by request. */
  form: number;
}

// Hand-placed beds, one to three per lawn: compact plantings pulled in tight
// around their centerpieces. Every site sits on flat dry lawn clear of the
// maze, the hamlet, the walks, camps, nodes, and great trees (the paired
// test re-validates all of that against the live terrain).
export const PARTERRE_PLOTS: readonly ParterrePlot[] = [
  { x: 322, z: 878, r: 10, kind: 'quatrefoil' }, // west of the Statuary Walk
  // three smaller satellite beds orbiting the grand west quatrefoil
  { x: 300, z: 872, r: 5, kind: 'concentric' },
  { x: 306, z: 894, r: 5, kind: 'knot' },
  { x: 334, z: 896, r: 5, kind: 'quatrefoil' },
  { x: 400, z: 866, r: 9, kind: 'quatrefoil' }, // east of the Statuary Walk
  // (the Rose Wilds lawn now belongs to Dawnhold castle and its knights)
  { x: 256, z: 952, r: 9, kind: 'knot' }, // west maze forecourt
  // two smaller knots squaring off the forecourt
  { x: 244, z: 938, r: 4.5, kind: 'knot' },
  { x: 270, z: 940, r: 4.5, kind: 'knot' },
  // the mill lawn: three windmills turning over their own ring beds
  { x: 504, z: 760, r: 8.5, kind: 'concentric', centerpiece: 'windmill' },
  { x: 492, z: 744, r: 7, kind: 'concentric', centerpiece: 'windmill' },
  { x: 516, z: 750, r: 6.5, kind: 'concentric', centerpiece: 'windmill' },
  // east of the Garden Gate road, clear of the new gate-wall towers
  { x: 430, z: 756, r: 7.5, kind: 'quatrefoil' },
  { x: 476, z: 1010, r: 7.5, kind: 'knot' }, // east of the maze road
  { x: 466, z: 996, r: 4.5, kind: 'knot' }, // its smaller companion square
  { x: 300, z: 1118, r: 6, kind: 'concentric' }, // the north lawn
] as const;

// The bed colorways: a much wider wheel than the old three-rose palette.
export const GARDEN_BED_TINTS: readonly number[] = [
  0xd8385a, // crimson
  0xf27ba6, // rose pink
  0xf7c6d9, // blush
  0xffffff, // white
  0xf2c94c, // gold
  0xf5a25d, // apricot
  0xb07bd8, // violet
  0x7b9bd8, // cornflower
  0xc9b8e8, // lavender
  0xf27b62, // coral
] as const;

// Walk-ribbon colorway: a repeating white / rose / gold border along roads,
// planted just behind the clipped path hedge line (HEDGE_OFFSET below).
const RIBBON_TINTS = [0xffffff, 0xf27ba6, 0xf2c94c] as const;
const RIBBON_NEAR = 5.2;
const RIBBON_FAR = 6.6;
// the path hedge: a continuous clipped bush line edging every walk
const HEDGE_OFFSET = 4.15;
const HEDGE_STEP = 2.1;

const GARDEN_X0 = EVERGARDEN_ZONE.xMin ?? 180;
const GARDEN_X1 = EVERGARDEN_ZONE.xMax ?? 540;
const GARDEN_Z0 = EVERGARDEN_ZONE.zMin;
const GARDEN_Z1 = EVERGARDEN_ZONE.zMax;
const MAZE_MARGIN = 6;
const MAZE_X1 = MAZE_X0 + MAZE_COLS * MAZE_CELL;
// the Statuary Walk keeps its marble pairs: no avenue topiary between them
// (its path hedges DO run: the clipped line reads well at the statues' feet)
const STATUE_LANE = { x0: 343, x1: 377, z0: 830, z1: 935 } as const;

// The Garden Gate's welcome front: the doubled stone arch at the zone entry
// with flanking walls (EVERGARDEN_PROPS.decorProps), dressed on the garden
// side with a clipped hedge line and a flower border. Wall-line coordinates:
// u runs along the wall line, v is the offset toward the garden (north).
const GATE = { x: 391, z: 747, rot: 2.97 } as const;
const GATE_P = { x: Math.cos(GATE.rot), z: -Math.sin(GATE.rot) } as const; // wall line dir
const GATE_N = { x: -Math.sin(GATE.rot), z: -Math.cos(GATE.rot) } as const; // garden side
const GATE_HALF = 24; // the dressed frontage on each side of the arch
const GATE_MOUTH = 7; // clear of the arch opening

function smoothstep(e0: number, e1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Visual footprints of the garden's built structures, so no planting grows
// through a wall or floor. Walls use their thin VISUAL depth, not their fat
// movement collider circle (a hedge alongside a wall face is the whole
// point); everything else uses its collider footprint.
const BUILT_FOOTPRINTS: { x: number; z: number; r: number }[] = (() => {
  const out: { x: number; z: number; r: number }[] = [];
  for (const d of EVERGARDEN_PROPS.decorProps ?? []) {
    if (d.key === 'hexWall') out.push({ x: d.x, z: d.z, r: 1.8 });
    else if (d.r) out.push({ x: d.x, z: d.z, r: d.r });
  }
  for (const b of EVERGARDEN_PROPS.buildings) {
    out.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) * 0.6 });
  }
  for (const w of EVERGARDEN_PROPS.wells) out.push({ x: w.x, z: w.z, r: w.r });
  for (const s of EVERGARDEN_PROPS.stalls) out.push({ x: s.x, z: s.z, r: s.r });
  return out;
})();

/** True when (x, z) stands clear of every built structure by the margin. */
export function clearOfGardenBuildings(x: number, z: number, margin = 0.8): boolean {
  for (const f of BUILT_FOOTPRINTS) {
    if (Math.hypot(x - f.x, z - f.z) < f.r + margin) return false;
  }
  return true;
}

function inMazeRect(x: number, z: number): boolean {
  return (
    x > MAZE_X0 - MAZE_MARGIN &&
    x < MAZE_X1 + MAZE_MARGIN &&
    z > MAZE_Z0 - MAZE_MARGIN &&
    z < MAZE_Z1 + MAZE_MARGIN
  );
}

// Each plot draws four distinct colors from the wheel, seeded by position:
// two pattern colors, a boss color, and a filler for the ground between.
function plotPalette(p: ParterrePlot): [number, number, number, number] {
  const n = GARDEN_BED_TINTS.length;
  const a = Math.floor(hash2(p.x, p.z, 7101) * n) % n;
  const b = (a + 2 + Math.floor(hash2(p.x, p.z, 7111) * (n - 4))) % n;
  let cIdx = (b + 2 + Math.floor(hash2(p.x, p.z, 7121) * (n - 4))) % n;
  if (cIdx === a) cIdx = (cIdx + 1) % n;
  let dIdx = (cIdx + 3 + Math.floor(hash2(p.x, p.z, 7131) * (n - 5))) % n;
  if (dIdx === a || dIdx === b || dIdx === cIdx) dIdx = (dIdx + 2) % n;
  return [GARDEN_BED_TINTS[a], GARDEN_BED_TINTS[b], GARDEN_BED_TINTS[cIdx], GARDEN_BED_TINTS[dIdx]];
}

/**
 * The ground-flower plan: returns the raw tint for a flower at (x, z), or -1
 * where no bed reaches. Beds fill their whole hedge line edge to edge, the
 * way a real planting does: the pattern (lobes, rings, stripes) reads in
 * color blocks and the filler color carries every gap.
 */
export function parterreFlowerTintAt(x: number, z: number): number {
  for (const p of PARTERRE_PLOTS) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
    const [ca, cb, cc, cd] = plotPalette(p);
    if (p.kind === 'quatrefoil') {
      const d = Math.hypot(dx, dz);
      if (d > p.r * 0.9) continue; // outside the hedge line
      if (d < p.r * 0.2) return cc; // the center boss
      const lr = p.r * 0.55;
      const lobeR = p.r * 0.34;
      // four petal lobes on the diagonals, opposite pairs sharing a color
      if (Math.hypot(dx - lr * 0.707, dz - lr * 0.707) < lobeR) return ca;
      if (Math.hypot(dx + lr * 0.707, dz + lr * 0.707) < lobeR) return ca;
      if (Math.hypot(dx - lr * 0.707, dz + lr * 0.707) < lobeR) return cb;
      if (Math.hypot(dx + lr * 0.707, dz - lr * 0.707) < lobeR) return cb;
      return cd; // filler blooms between the lobes: no bare soil
    }
    if (p.kind === 'concentric') {
      const d = Math.hypot(dx, dz);
      if (d > p.r * 0.9) continue;
      if (d < p.r * 0.16) return cc; // the center boss
      // solid alternating rings edge to edge
      const band = Math.floor((d - p.r * 0.16) / (p.r * 0.15));
      return band % 2 === 0 ? ca : cb;
    }
    // knot: solid diagonal color stripes filling the hedge square
    if (Math.abs(dx) > p.r * 0.76 || Math.abs(dz) > p.r * 0.76) continue;
    if (Math.hypot(dx, dz) < p.r * 0.18) return cc; // the center boss
    const u = (dx + dz) * 0.7071;
    const stripeW = p.r * 0.3;
    const s = u / stripeW + 8; // shift positive so floor() is stable
    const stripe = Math.floor(s) % 3;
    return stripe === 0 ? ca : stripe === 1 ? cb : cd;
  }
  // the Garden Gate's flower border, along the garden face of its walls
  {
    const gdx = x - GATE.x;
    const gdz = z - GATE.z;
    const u = gdx * GATE_P.x + gdz * GATE_P.z;
    const v = gdx * GATE_N.x + gdz * GATE_N.z;
    if (Math.abs(u) > GATE_MOUTH && Math.abs(u) < GATE_HALF && v > 2.8 && v < 4.6) {
      if (!clearOfGardenBuildings(x, z, 0.5)) return -1;
      const block = Math.abs(Math.floor((u + 60) / 6));
      return RIBBON_TINTS[block % RIBBON_TINTS.length];
    }
  }
  // the walk ribbons: continuous border beds behind the path hedges
  if (x > GARDEN_X0 + 12 && x < GARDEN_X1 - 12 && z > GARDEN_Z0 + 10 && z < GARDEN_Z1 - 10) {
    if (inMazeRect(x, z)) return -1;
    const hub = EVERGARDEN_ZONE.hub;
    if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + 5) return -1;
    const rd = roadDistance(x, z);
    if (rd >= RIBBON_NEAR && rd < RIBBON_FAR) {
      if (!clearOfGardenBuildings(x, z, 0.5)) return -1;
      // color repeats in fixed blocks down the walk, a stitched border
      const block = Math.abs(Math.floor((x + z * 0.618) / 8));
      return RIBBON_TINTS[block % RIBBON_TINTS.length];
    }
  }
  return -1;
}

// Open-lawn meadow tints: soft pastels growing mixed through one another,
// the way the Veiled Hollow's wild meadows read.
const MEADOW_TINTS = [0xffffff, 0xf7c6d9, 0xf2c94c, 0xc9b8e8, 0xf27ba6, 0x7b9bd8] as const;

/**
 * Flower fields on the open lawns: irregular noise-shaped patches bloom
 * between the formal features, colors mixed per flower inside each patch,
 * keeping clear of walks, beds, the maze, and the hamlet. Returns a tint or
 * -1, sampled per candidate flower position.
 */
export function gardenMeadowTintAt(x: number, z: number): number {
  if (x < GARDEN_X0 + 12 || x > GARDEN_X1 - 12 || z < GARDEN_Z0 + 10 || z > GARDEN_Z1 - 10) {
    return -1;
  }
  if (inMazeRect(x, z)) return -1;
  if (inParterrePlot(x, z, 4)) return -1;
  const hub = EVERGARDEN_ZONE.hub;
  if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + 10) return -1;
  // patchy blob fields: two noise octaves shape ragged meadow edges instead
  // of square cells, so drifts wander the lawn the way wild growth does
  const patch = fbm2(x * 0.045, z * 0.045, 7301, 2);
  if (patch < 0.62) return -1;
  // denser toward each patch heart, airy at the ragged edge
  const density = 0.35 + smoothstep(0.62, 0.8, patch) * 0.4;
  if (hash2(x * 3.1, z * 3.1, 7311) > density) return -1;
  if (roadDistance(x, z) < 7.5) return -1; // clear of walks, hedges, ribbons
  if (!clearOfGardenBuildings(x, z, 0.5)) return -1;
  // colors grow mixed within the patch, flower by flower
  return MEADOW_TINTS[
    Math.floor(hash2(x * 7.3, z * 7.3, 7321) * MEADOW_TINTS.length) % MEADOW_TINTS.length
  ];
}

/**
 * True inside any parterre plot (plus margin): the beds stay clear of the
 * random decoration trees and boulders, the way a gardener would keep them.
 */
export function inParterrePlot(x: number, z: number, margin = 0): boolean {
  for (const p of PARTERRE_PLOTS) {
    if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return true;
  }
  return false;
}

const SLOPE_EPS = 1.2;
function flatDryLawn(x: number, z: number, seed: number): boolean {
  const h = terrainHeight(x, z, seed);
  if (h < WATER_LEVEL + 1.6) return false;
  if (gardenLandness(x, z) < 0.25) return false;
  const hx = terrainHeight(x + SLOPE_EPS, z, seed) - terrainHeight(x - SLOPE_EPS, z, seed);
  const hz = terrainHeight(x, z + SLOPE_EPS, seed) - terrainHeight(x, z - SLOPE_EPS, seed);
  return Math.hypot(hx, hz) / (2 * SLOPE_EPS) <= 0.62;
}

/**
 * The bush plan: clipped hedge rings and edges (plain bush, uniform scale,
 * the gardener's shears) packed shoulder to shoulder so the bed outline
 * reads solid, one BIG rose centerpiece per bed, lobe/corner roses in the
 * bed palette, and continuous hedge lines edging every walk.
 */
export function parterreBushSpots(seed: number): ParterreBushSpot[] {
  const out: ParterreBushSpot[] = [];
  const hedge = (x: number, z: number): void => {
    // never grow a hedge through a wall, floor, or well
    if (!clearOfGardenBuildings(x, z, 0.8)) return;
    if (flatDryLawn(x, z, seed)) out.push({ x, z, kind: 'bush', scale: 0.82 });
  };
  const rose = (x: number, z: number, scale: number, tint: number): void => {
    if (flatDryLawn(x, z, seed)) out.push({ x, z, kind: 'bushFlowers', scale, bloomTint: tint });
  };
  const hedgeRing = (cx: number, cz: number, radius: number): void => {
    const n = Math.round((Math.PI * 2 * radius) / HEDGE_STEP);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      hedge(cx + Math.sin(a) * radius, cz + Math.cos(a) * radius);
    }
  };
  for (const p of PARTERRE_PLOTS) {
    const [ca, cb, cc] = plotPalette(p);
    if (p.kind === 'quatrefoil') {
      // solid hedge circle around the whole bed, roses on the lobe hearts
      hedgeRing(p.x, p.z, p.r);
      const lr = p.r * 0.55 * 0.707;
      rose(p.x + lr, p.z + lr, 1.0, ca);
      rose(p.x - lr, p.z - lr, 1.0, ca);
      rose(p.x + lr, p.z - lr, 1.0, cb);
      rose(p.x - lr, p.z + lr, 1.0, cb);
    } else if (p.kind === 'concentric') {
      // solid hedge ring outside the flower rings, roses at the cardinals
      hedgeRing(p.x, p.z, p.r * 0.98);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        rose(p.x + Math.sin(a) * p.r * 0.62, p.z + Math.cos(a) * p.r * 0.62, 0.95, i % 2 ? ca : cb);
      }
    } else {
      // knot: tight hedge square with roses on the corners
      const half = p.r * 0.84;
      const per = Math.max(4, Math.round((half * 2) / 2.0));
      for (let i = 0; i <= per; i++) {
        const t = -half + (i / per) * half * 2;
        hedge(p.x + t, p.z - half);
        hedge(p.x + t, p.z + half);
        if (i > 0 && i < per) {
          hedge(p.x - half, p.z + t);
          hedge(p.x + half, p.z + t);
        }
      }
      rose(p.x - half, p.z - half, 1.1, ca);
      rose(p.x + half, p.z + half, 1.1, ca);
      rose(p.x - half, p.z + half, 1.1, cb);
      rose(p.x + half, p.z - half, 1.1, cb);
    }
    // the centerpiece: one big rose bush at the heart of every bed (unless
    // a built centerpiece such as the windmill stands there instead)
    if (!p.centerpiece) rose(p.x, p.z, 1.85, cc);
  }
  // the walk hedges: clipped lines flanking every road, broken at junctions,
  // the hamlet, the statue lane, and the maze mouth
  const hub = EVERGARDEN_ZONE.hub;
  for (const road of EVERGARDEN_ROADS) {
    let carry = HEDGE_STEP * 0.5;
    for (let s = 0; s < road.length - 1; s++) {
      const a = road[s];
      const b = road[s + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (segLen < 1e-6) continue;
      const ux = (b.x - a.x) / segLen;
      const uz = (b.z - a.z) / segLen;
      for (let t = carry; t <= segLen; t += HEDGE_STEP) {
        const cx = a.x + ux * t;
        const cz = a.z + uz * t;
        for (const side of [-1, 1]) {
          const x = cx - uz * side * HEDGE_OFFSET;
          const z = cz + ux * side * HEDGE_OFFSET;
          if (inMazeRect(x, z)) continue;
          if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + 4) continue;
          // a crossing road runs closer than this spot's own: a junction gap
          if (roadDistance(x, z) < HEDGE_OFFSET - 0.8) continue;
          if (inParterrePlot(x, z, 1)) continue;
          hedge(x, z);
        }
      }
      carry = ((carry - segLen) % HEDGE_STEP) + HEDGE_STEP;
      if (carry >= HEDGE_STEP) carry -= HEDGE_STEP;
    }
  }
  // the Garden Gate's hedge line, hugging the garden face of its walls
  for (const side of [-1, 1]) {
    for (let u = GATE_MOUTH + 1; u <= GATE_HALF - 1; u += HEDGE_STEP) {
      const x = GATE.x + GATE_P.x * u * side + GATE_N.x * 2.0;
      const z = GATE.z + GATE_P.z * u * side + GATE_N.z * 2.0;
      hedge(x, z);
    }
  }
  return out;
}

/**
 * True where lawn grass should grow back around the plantings: inside and
 * just beyond every bed's hedge line, and across the meadow patches a bit
 * past where the flowers stop, so both read lush instead of clipped edges.
 */
export function gardenLushGrassAt(x: number, z: number): boolean {
  if (inParterrePlot(x, z, 1.8)) return true;
  if (x < GARDEN_X0 + 12 || x > GARDEN_X1 - 12 || z < GARDEN_Z0 + 10 || z > GARDEN_Z1 - 10) {
    return false;
  }
  if (inMazeRect(x, z)) return false;
  const hub = EVERGARDEN_ZONE.hub;
  if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + 10) return false;
  if (roadDistance(x, z) < 6.5) return false;
  if (!clearOfGardenBuildings(x, z, 0.5)) return false;
  // the meadow patch shape at a looser threshold than the flowers (0.62), so
  // the grass halo runs a little beyond the blooms
  return fbm2(x * 0.045, z * 0.045, 7301, 2) >= 0.58;
}

/**
 * Avenue topiary: clipped pairs flanking every garden road at a steady
 * interval (alternating tiered and cone forms), plus four cone sentinels at
 * each plot's cardinal points. The Statuary Walk keeps its marble instead.
 */
export function gardenAvenueSpots(seed: number): TopiarySpot[] {
  const out: TopiarySpot[] = [];
  const hub = EVERGARDEN_ZONE.hub;
  const AVENUE_STEP = 18;
  // behind the path hedge and the ribbon bed: hedge 4.15, ribbon to 6.6
  const AVENUE_OFFSET = 7.6;
  for (const road of EVERGARDEN_ROADS) {
    let carry = AVENUE_STEP * 0.5;
    for (let s = 0; s < road.length - 1; s++) {
      const a = road[s];
      const b = road[s + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (segLen < 1e-6) continue;
      const ux = (b.x - a.x) / segLen;
      const uz = (b.z - a.z) / segLen;
      for (let t = carry; t <= segLen; t += AVENUE_STEP) {
        const cx = a.x + ux * t;
        const cz = a.z + uz * t;
        for (const side of [-1, 1]) {
          const x = cx - uz * side * AVENUE_OFFSET;
          const z = cz + ux * side * AVENUE_OFFSET;
          if (inMazeRect(x, z)) continue;
          if (
            x > STATUE_LANE.x0 &&
            x < STATUE_LANE.x1 &&
            z > STATUE_LANE.z0 &&
            z < STATUE_LANE.z1
          ) {
            continue;
          }
          if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + 6) continue;
          if (!flatDryLawn(x, z, seed)) continue;
          out.push({
            x,
            z,
            rot: Math.atan2(ux, uz) + (side < 0 ? Math.PI : 0),
            form: 0,
          });
        }
      }
      carry = ((carry - segLen) % AVENUE_STEP) + AVENUE_STEP;
      if (carry >= AVENUE_STEP) carry -= AVENUE_STEP;
    }
  }
  for (const p of PARTERRE_PLOTS) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const x = p.x + Math.sin(a) * (p.r + 2.4);
      const z = p.z + Math.cos(a) * (p.r + 2.4);
      if (!flatDryLawn(x, z, seed)) continue;
      out.push({ x, z, rot: a, form: 0 });
    }
  }
  return out;
}
