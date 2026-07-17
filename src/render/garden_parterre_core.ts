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

import { EVERGARDEN_ROADS, EVERGARDEN_ZONE } from '../sim/content/evergarden';
import { hash2 } from '../sim/rng';
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
  /** index into the consumer's topiary form set (0 ball, 1 tiered, 2 cone) */
  form: number;
}

// Hand-placed beds, one to three per lawn. Every site sits on flat dry lawn
// clear of the maze, the hamlet, the walks, camps, nodes, and great trees
// (the paired test re-validates all of that against the live terrain).
export const PARTERRE_PLOTS: readonly ParterrePlot[] = [
  { x: 322, z: 878, r: 12, kind: 'quatrefoil' }, // west of the Statuary Walk
  { x: 400, z: 866, r: 11, kind: 'quatrefoil' }, // east of the Statuary Walk
  { x: 252, z: 880, r: 11, kind: 'concentric' }, // the Rose Wilds lawn
  { x: 256, z: 952, r: 11, kind: 'knot' }, // west maze forecourt
  { x: 470, z: 780, r: 11, kind: 'concentric' }, // the Petal Pond east lawn
  { x: 504, z: 760, r: 10, kind: 'knot' }, // the far southeast lawn
  { x: 420, z: 750, r: 9, kind: 'quatrefoil' }, // east of the Garden Gate road
  { x: 476, z: 1010, r: 9, kind: 'knot' }, // east of the maze road
  { x: 300, z: 1118, r: 7, kind: 'concentric' }, // the north lawn
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

// Walk-ribbon colorway: a repeating white / rose / gold border along roads.
const RIBBON_TINTS = [0xffffff, 0xf27ba6, 0xf2c94c] as const;
const RIBBON_NEAR = 4.0;
const RIBBON_FAR = 5.4;

const GARDEN_X0 = EVERGARDEN_ZONE.xMin ?? 180;
const GARDEN_X1 = EVERGARDEN_ZONE.xMax ?? 540;
const GARDEN_Z0 = EVERGARDEN_ZONE.zMin;
const GARDEN_Z1 = EVERGARDEN_ZONE.zMax;
const MAZE_MARGIN = 6;
const MAZE_X1 = MAZE_X0 + MAZE_COLS * MAZE_CELL;
// the Statuary Walk keeps its marble pairs: no avenue topiary between them
const STATUE_LANE = { x0: 343, x1: 377, z0: 830, z1: 935 } as const;

function inMazeRect(x: number, z: number): boolean {
  return (
    x > MAZE_X0 - MAZE_MARGIN &&
    x < MAZE_X1 + MAZE_MARGIN &&
    z > MAZE_Z0 - MAZE_MARGIN &&
    z < MAZE_Z1 + MAZE_MARGIN
  );
}

// Each plot draws three distinct colors from the wheel, seeded by position.
function plotPalette(p: ParterrePlot): [number, number, number] {
  const n = GARDEN_BED_TINTS.length;
  const a = Math.floor(hash2(p.x, p.z, 7101) * n) % n;
  const b = (a + 2 + Math.floor(hash2(p.x, p.z, 7111) * (n - 4))) % n;
  let cIdx = (b + 2 + Math.floor(hash2(p.x, p.z, 7121) * (n - 4))) % n;
  if (cIdx === a) cIdx = (cIdx + 1) % n;
  return [GARDEN_BED_TINTS[a], GARDEN_BED_TINTS[b], GARDEN_BED_TINTS[cIdx]];
}

/**
 * The ground-flower plan: returns the raw tint for a flower at (x, z), or -1
 * where no bed reaches. Beds are solid color regions (lobes, rings, stripes)
 * so each arrangement reads as one deliberate planting from lawn level.
 */
export function parterreFlowerTintAt(x: number, z: number): number {
  for (const p of PARTERRE_PLOTS) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
    const [ca, cb, cc] = plotPalette(p);
    if (p.kind === 'quatrefoil') {
      const d = Math.hypot(dx, dz);
      if (d < p.r * 0.2) return cc; // the center boss
      const lr = p.r * 0.55;
      const lobeR = p.r * 0.32;
      // four petal lobes on the diagonals, opposite pairs sharing a color
      if (Math.hypot(dx - lr * 0.707, dz - lr * 0.707) < lobeR) return ca;
      if (Math.hypot(dx + lr * 0.707, dz + lr * 0.707) < lobeR) return ca;
      if (Math.hypot(dx - lr * 0.707, dz + lr * 0.707) < lobeR) return cb;
      if (Math.hypot(dx + lr * 0.707, dz - lr * 0.707) < lobeR) return cb;
      return -1;
    }
    if (p.kind === 'concentric') {
      const d = Math.hypot(dx, dz);
      if (d < p.r * 0.16) return cc; // the center boss
      if (d < p.r * 0.8) {
        const band = Math.floor((d - p.r * 0.16) / (p.r * 0.16));
        const frac = (d - p.r * 0.16) / (p.r * 0.16) - band;
        if (frac > 0.86) return -1; // thin soil line between rings
        return band % 2 === 0 ? ca : cb;
      }
      return -1;
    }
    // knot: diagonal color stripes inside a square bed with soil gaps
    if (Math.abs(dx) > p.r * 0.74 || Math.abs(dz) > p.r * 0.74) continue;
    const u = (dx + dz) * 0.7071;
    const stripeW = p.r * 0.3;
    const s = u / stripeW + 8; // shift positive so floor() is stable
    const frac = s - Math.floor(s);
    if (frac > 0.84) return -1;
    const stripe = Math.floor(s) % 3;
    return stripe === 0 ? ca : stripe === 1 ? cb : cc;
  }
  // the walk ribbons: continuous border beds flanking every garden road
  if (x > GARDEN_X0 + 12 && x < GARDEN_X1 - 12 && z > GARDEN_Z0 + 10 && z < GARDEN_Z1 - 10) {
    if (inMazeRect(x, z)) return -1;
    const hub = EVERGARDEN_ZONE.hub;
    if (Math.hypot(x - hub.x, z - hub.z) < hub.radius + 5) return -1;
    const rd = roadDistance(x, z);
    if (rd >= RIBBON_NEAR && rd < RIBBON_FAR) {
      // color repeats in fixed blocks down the walk, a stitched border
      const block = Math.abs(Math.floor((x + z * 0.618) / 8));
      return RIBBON_TINTS[block % RIBBON_TINTS.length];
    }
  }
  return -1;
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
 * the gardener's shears) plus rose centerpieces (bushFlowers) whose bloom
 * tints come from the same plot palette as the ground flowers below them.
 */
export function parterreBushSpots(seed: number): ParterreBushSpot[] {
  const out: ParterreBushSpot[] = [];
  const hedge = (x: number, z: number): void => {
    if (flatDryLawn(x, z, seed)) out.push({ x, z, kind: 'bush', scale: 0.82 });
  };
  const rose = (x: number, z: number, scale: number, tint: number): void => {
    if (flatDryLawn(x, z, seed)) out.push({ x, z, kind: 'bushFlowers', scale, bloomTint: tint });
  };
  for (const p of PARTERRE_PLOTS) {
    const [ca, cb, cc] = plotPalette(p);
    if (p.kind === 'quatrefoil') {
      // hedge circle around the whole bed, roses on the lobe hearts
      const n = Math.round((Math.PI * 2 * p.r) / 3.4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        hedge(p.x + Math.sin(a) * p.r, p.z + Math.cos(a) * p.r);
      }
      const lr = p.r * 0.55 * 0.707;
      rose(p.x + lr, p.z + lr, 1.0, ca);
      rose(p.x - lr, p.z - lr, 1.0, ca);
      rose(p.x + lr, p.z - lr, 1.0, cb);
      rose(p.x - lr, p.z + lr, 1.0, cb);
      rose(p.x, p.z, 1.25, cc);
    } else if (p.kind === 'concentric') {
      // hedge ring outside the flower rings, roses at the four cardinals
      const n = Math.round((Math.PI * 2 * p.r * 0.95) / 3.4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        hedge(p.x + Math.sin(a) * p.r * 0.95, p.z + Math.cos(a) * p.r * 0.95);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        rose(p.x + Math.sin(a) * p.r * 0.62, p.z + Math.cos(a) * p.r * 0.62, 0.95, i % 2 ? ca : cb);
      }
      rose(p.x, p.z, 1.3, cc);
    } else {
      // knot: hedge square with roses on the corners
      const half = p.r * 0.8;
      const per = Math.max(4, Math.round((half * 2) / 2.6));
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
  }
  return out;
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
  const AVENUE_OFFSET = 5.6;
  let pairIndex = 0;
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
        pairIndex++;
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
            form: pairIndex % 2 === 0 ? 1 : 2,
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
      out.push({ x, z, rot: a, form: 2 });
    }
  }
  return out;
}
