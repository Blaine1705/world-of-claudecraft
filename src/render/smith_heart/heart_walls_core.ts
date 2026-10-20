// Pure plan for the Smith's Heart's mountain rock: jagged spires, crags and
// broken slabs rising out of the fissures' depth along the field's OUTER
// cliff edges, so each vein reads as an open crack inside Stormcrag and the
// Ring as a gallery round a caldera. Render only (no collider): the field's
// own cliff colliders already hold every lip.
//
// Rules the plan keeps (pinned by tests/smith_heart_render_core.test.ts):
//   - every block, its lean included, stands at least HEART_WALL_CLEAR yards
//     from any walkable floor (HEART_WALL_PATH_CLEAR beside a narrow path),
//     so a third-person camera behind a player at a lip is never inside rock;
//   - the rock starts LOW by the walks and climbs as it recedes (a slope of
//     scree and broken teeth below the mountain's real walls), so a camera
//     20 to 25 yd back sees over the near teeth;
//   - each block is irregular: one of three faceted shapes (heartRockShape),
//     squashed across, turned, and leaning OUT, away from the floor it faces;
//   - the caldera stays open: no block enters the disc inside the Ring's inner
//     edge, so the seal is in sight from every point of the Ring; the Wind
//     Bridge's chasm and the Anvil's molten channels stay open too.
//
// Three-free, DOM-free, deterministic (hashed jitter, no rng).

import { RING, SMITH_HEART_FIELD, WIND_BRIDGE } from '../../sim/content/smith_heart_layout';
import { authoredFieldHeight, authoredFieldSurfaceAt } from '../../sim/instances/authored_field';
import { HEART_ANVIL_CHANNEL_X, heartHash } from './heart_plan_core';

/** One rock block: shape `variant` (heartRockShape) scaled to `rx` x `rz`
 *  across at its foot (its unit radius), from `base` to `top`, turned by
 *  `yaw`, its top sheared by (`leanX`, `leanZ`) yards. Instance-local. */
export interface HeartWallBlock {
  x: number;
  z: number;
  base: number;
  top: number;
  rx: number;
  rz: number;
  yaw: number;
  leanX: number;
  leanZ: number;
  variant: number;
}

/** How far any block stays from walkable floor (yards). */
export const HEART_WALL_CLEAR = 8;
/** ... and beside a narrow path (a stair, a ramp, a bridge). */
export const HEART_WALL_PATH_CLEAR = 10.5;
/** How far past the clearance the rock reaches (yards of void covered). */
export const HEART_WALL_BAND = 30;
/** The largest foot radius. */
export const HEART_WALL_MAX_R = 6;
/** The number of rock shapes. */
export const HEART_ROCK_VARIANTS = 3;
const MIN_R = 1.4;
/** The distance field's cell (yards). */
const CELL = 2;
/** The Wind Bridge's chasm: no block within this of the arch's span. */
const BRIDGE_CLEAR = 22;
/** The Anvil's molten channels: no block this close to the platform. */
const CHANNEL_CLEAR = 12;

interface DistanceField {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Distance to the nearest walkable cell centre (yards). */
  dist: Float32Array;
  /** Index of that nearest walkable cell. */
  nearest: Int32Array;
  /** Floor height of the walkable cells (void elsewhere). */
  height: Float32Array;
  /** 1 where the walkable cell belongs to a path surface. */
  path: Uint8Array;
}

let cachedField: DistanceField | null = null;

/** Chamfer distance from every cell to the nearest walkable cell, carrying
 *  that cell's index along. Built once (the layout is static). */
function distanceField(): DistanceField {
  if (cachedField) return cachedField;
  const def = SMITH_HEART_FIELD;
  const pad = HEART_WALL_PATH_CLEAR + HEART_WALL_BAND + HEART_WALL_MAX_R + 8;
  const x0 = def.bounds.minX - pad;
  const z0 = def.bounds.minZ - pad;
  const nx = Math.ceil((def.bounds.maxX + pad - x0) / CELL) + 1;
  const nz = Math.ceil((def.bounds.maxZ + pad - z0) / CELL) + 1;
  const dist = new Float32Array(nx * nz).fill(Number.POSITIVE_INFINITY);
  const nearest = new Int32Array(nx * nz).fill(-1);
  const height = new Float32Array(nx * nz).fill(def.voidHeight);
  const path = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * CELL;
      const z = z0 + j * CELL;
      const s = authoredFieldSurfaceAt(def, x, z);
      if (!s) continue;
      const k = j * nx + i;
      dist[k] = 0;
      nearest[k] = k;
      height[k] = authoredFieldHeight(def, x, z);
      path[k] = s.kind === 'path' ? 1 : 0;
    }
  }
  const diag = CELL * Math.SQRT2;
  const relax = (k: number, from: number, step: number) => {
    const d = dist[from] + step;
    if (d < dist[k]) {
      dist[k] = d;
      nearest[k] = nearest[from];
    }
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i > 0) relax(k, k - 1, CELL);
      if (j > 0) {
        relax(k, k - nx, CELL);
        if (i > 0) relax(k, k - nx - 1, diag);
        if (i < nx - 1) relax(k, k - nx + 1, diag);
      }
    }
  }
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (i < nx - 1) relax(k, k + 1, CELL);
      if (j < nz - 1) {
        relax(k, k + nx, CELL);
        if (i < nx - 1) relax(k, k + nx + 1, diag);
        if (i > 0) relax(k, k + nx - 1, diag);
      }
    }
  }
  cachedField = { x0, z0, nx, nz, dist, nearest, height, path };
  return cachedField;
}

export interface HeartClearance {
  /** Conservative distance to the nearest walkable floor (yards). */
  d: number;
  /** That floor's height. */
  floor: number;
  /** Is that floor a path (a stair, a ramp, a bridge)? */
  path: boolean;
  /** Unit direction from the point toward that floor (xz). */
  toX: number;
  toZ: number;
}

/** Distance from (x, z) to the nearest walkable floor, conservative: the
 *  field's cell distance less a cell's half-diagonal and a cell (the floor's
 *  own edge can lie that much nearer than its nearest cell centre). */
export function heartFloorClearance(x: number, z: number): HeartClearance {
  const f = distanceField();
  const i = Math.round((x - f.x0) / CELL);
  const j = Math.round((z - f.z0) / CELL);
  const none = {
    d: Number.POSITIVE_INFINITY,
    floor: SMITH_HEART_FIELD.voidHeight,
    path: false,
    toX: 0,
    toZ: 1,
  };
  if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) return none;
  const k = j * f.nx + i;
  const n = f.nearest[k];
  if (n < 0) return none;
  const fx = f.x0 + (n % f.nx) * CELL;
  const fz = f.z0 + Math.floor(n / f.nx) * CELL;
  const len = Math.hypot(fx - x, fz - z) || 1;
  return {
    d: Math.max(0, f.dist[k] - CELL * 1.5),
    floor: f.height[n],
    path: f.path[n] === 1,
    toX: (fx - x) / len,
    toZ: (fz - z) / len,
  };
}

/** Distance from a point to a segment (2D). */
function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Is the disc at (x, z) of radius r inside an area that stays open air? */
export function heartOpenAir(x: number, z: number, r: number, clearance: number): boolean {
  // The caldera: from the Ring's inner edge to the Heart, all open.
  if (Math.hypot(x - RING.x, z - RING.z) - r < RING.innerR) return true;
  // The Wind Bridge's gulf.
  if (
    segmentDistance(x, z, WIND_BRIDGE.fromX, WIND_BRIDGE.fromZ, WIND_BRIDGE.toX, WIND_BRIDGE.toZ) -
      r <
    BRIDGE_CLEAR
  ) {
    return true;
  }
  // The Anvil's molten channels (the void hugging the platform).
  if (x < HEART_ANVIL_CHANNEL_X && clearance - r < CHANNEL_CLEAR) return true;
  return false;
}

/** The horizontal radius that bounds a whole block (its lean included). */
export function heartWallReach(b: HeartWallBlock): number {
  return Math.max(b.rx, b.rz) + Math.hypot(b.leanX, b.leanZ);
}

/**
 * Every rock block, on a jittered grid of `spacing` yards (the low tier
 * passes a wider spacing: a cosmetic shed; what stays open stays open on
 * every tier).
 */
export function planHeartWalls(spacing = 5): HeartWallBlock[] {
  const def = SMITH_HEART_FIELD;
  const out: HeartWallBlock[] = [];
  const pad = HEART_WALL_PATH_CLEAR + HEART_WALL_BAND;
  const i0 = Math.floor((def.bounds.minX - pad) / spacing);
  const i1 = Math.ceil((def.bounds.maxX + pad) / spacing);
  const j0 = Math.floor((def.bounds.minZ - pad) / spacing);
  const j1 = Math.ceil((def.bounds.maxZ + pad) / spacing);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const jx = (heartHash(i, j) - 0.5) * spacing * 0.7;
      const jz = (heartHash(j + 7919, i - 104729) - 0.5) * spacing * 0.7;
      const x = i * spacing + jx;
      const z = j * spacing + jz;
      const c = heartFloorClearance(x, z);
      const clear = c.path ? HEART_WALL_PATH_CLEAR : HEART_WALL_CLEAR;
      const back = c.d - clear;
      if (back < 0 || back > HEART_WALL_BAND) continue;
      const h1 = heartHash(i * 31 + 5, j * 17 - 3);
      const h2 = heartHash(i - 11, j + 13);
      const h3 = heartHash(i + 101, j * 7 + 1);
      // Small teeth by the walks, great crags behind.
      const want = Math.min(HEART_WALL_MAX_R, 1.6 + back * 0.17 + h1 * 1.4);
      // Lean: the top lies out, away from the floor it faces.
      const height = 2 + 0.05 * back * back + back * 0.5 + h2 * (3 + back * 0.6);
      const lean = Math.min(0.09, 0.03 + h3 * 0.06) * height;
      // The whole block (lean included) keeps its clearance.
      const r = Math.min(want, back - lean);
      if (r < MIN_R) continue;
      const reach = r + lean;
      if (heartOpenAir(x, z, reach, c.d)) continue;
      out.push({
        x,
        z,
        base: def.voidHeight - 2,
        top: c.floor + height,
        rx: r,
        rz: r * (0.55 + h2 * 0.45),
        yaw: h3 * Math.PI * 2,
        leanX: -c.toX * lean,
        leanZ: -c.toZ * lean,
        variant: Math.floor(h1 * HEART_ROCK_VARIANTS) % HEART_ROCK_VARIANTS,
      });
    }
  }
  return out;
}

// ---- the rock shapes ------------------------------------------------------------------

/**
 * One rock shape as flat triangles (xyz, outward wound), in a unit frame:
 * y from 0 (its foot) to 1 (its highest tip), every vertex within radius 1
 * of the axis, the foot ring the widest. Variant 0 is a jagged spire with an
 * off-centre tip, 1 a crag with a broken, slanted crown of teeth, 2 a split
 * slab with an oblique top. Deterministic.
 */
export function heartRockShape(variant: number): number[] {
  const v = ((variant % HEART_ROCK_VARIANTS) + HEART_ROCK_VARIANTS) % HEART_ROCK_VARIANTS;
  const sides = v === 2 ? 4 : v === 1 ? 7 : 6;
  // Rings (height, radius scale) up the shape, then the crown.
  const rings: [number, number][] =
    v === 0
      ? [
          [0, 1],
          [0.42, 0.68],
          [0.74, 0.36],
        ]
      : v === 1
        ? [
            [0, 1],
            [0.5, 0.82],
          ]
        : [
            [0, 1],
            [0.55, 0.9],
          ];
  const ringPts: [number, number, number][][] = rings.map(([y, s], ri) => {
    const pts: [number, number, number][] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + (v === 2 ? Math.PI / 4 : 0);
      const jr = 0.78 + heartHash(v * 97 + ri * 13, k) * 0.22;
      const rr = Math.min(1, s * (ri === 0 ? Math.max(0.86, jr) : jr));
      const jy = ri === 0 ? 0 : (heartHash(k + 7, v * 5 + ri) - 0.5) * 0.08;
      pts.push([Math.cos(a) * rr, y + jy, Math.sin(a) * rr]);
    }
    return pts;
  });
  const tris: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => tris.push(...a, ...b, ...c);
  for (let ri = 0; ri < ringPts.length - 1; ri++) {
    const lo = ringPts[ri];
    const hi = ringPts[ri + 1];
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      tri(lo[k], hi[k], lo[k1]);
      tri(lo[k1], hi[k], hi[k1]);
    }
  }
  const top = ringPts[ringPts.length - 1];
  if (v === 0) {
    // A single off-centre tip.
    const apex = [0.12, 1, -0.08];
    for (let k = 0; k < sides; k++) tri(top[k], apex, top[(k + 1) % sides]);
  } else if (v === 1) {
    // A crown of teeth: every other rim vertex thrust up, a low centre.
    const teeth = top.map((p, k) => {
      const tall = k % 2 === 0 ? 0.88 + heartHash(k, 3) * 0.12 : p[1] + 0.08;
      return [p[0] * 0.8, Math.min(1, tall), p[2] * 0.8];
    });
    const centre = [0.05, 0.62, 0.02];
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      tri(top[k], teeth[k], top[k1]);
      tri(top[k1], teeth[k], teeth[k1]);
      tri(teeth[k], centre, teeth[k1]);
    }
  } else {
    // An oblique break: the crown rises from one face to the opposite.
    const crown = top.map((p) => [p[0] * 0.85, Math.min(1, 0.68 + (p[0] + 1) * 0.16), p[2] * 0.85]);
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      tri(top[k], crown[k], top[k1]);
      tri(top[k1], crown[k], crown[k1]);
    }
    tri(crown[0], crown[2], crown[1]);
    tri(crown[0], crown[3], crown[2]);
  }
  return tris;
}
