// Pure plan for the Smith's Heart's mountain walls: tall rough rock blocks
// rising out of the fissures' depth along the field's OUTER cliff edges, so
// each vein reads as an open crack inside Stormcrag and the Ring as a gallery
// round a caldera. Render only (no collider): the field's own cliff colliders
// already hold every lip.
//
// Rules the plan keeps (pinned by tests/smith_heart_render_core.test.ts):
//   - no block's footprint reaches walkable floor: a block stands only in the
//     void, its radius kept `HEART_WALL_CLEAR` short of the nearest floor;
//   - the caldera stays open: no block enters the disc inside the Ring's inner
//     edge, so the seal is in sight from every point of the Ring;
//   - the Wind Bridge's chasm and the Anvil's molten channels stay open (an
//     arch over a gulf, a platform between channels, never a slot canyon);
//   - a block's top climbs with its distance from the lip, from about
//     `HEART_WALL_RISE` over the nearest floor, so the walls lean back from
//     each terrace like a cliff and tower over the highest ledge they flank.
//
// Three-free, DOM-free, deterministic (hashed jitter, no rng).

import { RING, SMITH_HEART_FIELD, WIND_BRIDGE } from '../../sim/content/smith_heart_layout';
import { authoredFieldHeight, authoredFieldSurfaceAt } from '../../sim/instances/authored_field';
import { HEART_ANVIL_CHANNEL_X, heartHash } from './heart_plan_core';

/** One rock block: a tapered six-sided prism from `base` to `top`, footprint
 *  radius `r` at its foot, turned by `yaw`. Instance-local. */
export interface HeartWallBlock {
  x: number;
  z: number;
  base: number;
  top: number;
  r: number;
  yaw: number;
}

/** How far a block's foot stays from the nearest walkable floor (yards). */
export const HEART_WALL_CLEAR = 2.5;
/** How far out from a lip the walls reach (yards of void covered). */
export const HEART_WALL_BAND = 16;
/** A wall's height over the floor it flanks, at the lip (yards). */
export const HEART_WALL_RISE = 20;
/** The largest block radius. */
export const HEART_WALL_MAX_R = 4.2;
/** The smallest block worth drawing. */
const MIN_R = 1.1;
/** The distance field's cell (yards). */
const CELL = 2;
/** The Wind Bridge's chasm: no block within this of the arch's span. */
const BRIDGE_CLEAR = 22;
/** The Anvil's molten channels: no block this close to the platform. */
const CHANNEL_CLEAR = 10;

interface DistanceField {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Distance to the nearest walkable cell centre (yards). */
  dist: Float32Array;
  /** Floor height of that nearest walkable cell. */
  near: Float32Array;
}

let cachedField: DistanceField | null = null;

/** Chamfer distance from every cell to the nearest walkable cell, carrying
 *  the floor height of that cell along. Built once (the layout is static). */
function distanceField(): DistanceField {
  if (cachedField) return cachedField;
  const def = SMITH_HEART_FIELD;
  const pad = HEART_WALL_BAND + HEART_WALL_MAX_R + 4;
  const x0 = def.bounds.minX - pad;
  const z0 = def.bounds.minZ - pad;
  const nx = Math.ceil((def.bounds.maxX + pad - x0) / CELL) + 1;
  const nz = Math.ceil((def.bounds.maxZ + pad - z0) / CELL) + 1;
  const dist = new Float32Array(nx * nz).fill(Number.POSITIVE_INFINITY);
  const near = new Float32Array(nx * nz).fill(def.voidHeight);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * CELL;
      const z = z0 + j * CELL;
      if (!authoredFieldSurfaceAt(def, x, z)) continue;
      dist[j * nx + i] = 0;
      near[j * nx + i] = authoredFieldHeight(def, x, z);
    }
  }
  const diag = CELL * Math.SQRT2;
  const relax = (k: number, from: number, step: number) => {
    const d = dist[from] + step;
    if (d < dist[k]) {
      dist[k] = d;
      near[k] = near[from];
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
  cachedField = { x0, z0, nx, nz, dist, near };
  return cachedField;
}

/** Distance from (x, z) to the nearest walkable floor, conservative: the
 *  field's cell distance less a cell's half-diagonal and a cell (the floor's
 *  own edge can lie that much nearer than its nearest cell centre). */
export function heartFloorClearance(x: number, z: number): { d: number; floor: number } {
  const f = distanceField();
  const i = Math.round((x - f.x0) / CELL);
  const j = Math.round((z - f.z0) / CELL);
  if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) {
    return { d: Number.POSITIVE_INFINITY, floor: SMITH_HEART_FIELD.voidHeight };
  }
  const k = j * f.nx + i;
  return { d: Math.max(0, f.dist[k] - CELL * 1.5), floor: f.near[k] };
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

/**
 * Every wall block, on a jittered grid of `spacing` yards (the low tier
 * passes a wider spacing: a cosmetic shed, the caldera, lips and gulfs stay
 * exactly as open).
 */
export function planHeartWalls(spacing = 5): HeartWallBlock[] {
  const def = SMITH_HEART_FIELD;
  const out: HeartWallBlock[] = [];
  const pad = HEART_WALL_BAND;
  const maxR = Math.min(HEART_WALL_MAX_R, spacing * 0.85);
  const i0 = Math.floor((def.bounds.minX - pad) / spacing);
  const i1 = Math.ceil((def.bounds.maxX + pad) / spacing);
  const j0 = Math.floor((def.bounds.minZ - pad) / spacing);
  const j1 = Math.ceil((def.bounds.maxZ + pad) / spacing);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const jx = (heartHash(i, j) - 0.5) * spacing * 0.6;
      const jz = (heartHash(j + 7919, i - 104729) - 0.5) * spacing * 0.6;
      const x = i * spacing + jx;
      const z = j * spacing + jz;
      const { d, floor } = heartFloorClearance(x, z);
      if (d > HEART_WALL_BAND) continue;
      const r = Math.min(maxR, d - HEART_WALL_CLEAR);
      if (r < MIN_R) continue;
      if (heartOpenAir(x, z, r, d)) continue;
      const h = heartHash(i * 31 + 5, j * 17 - 3);
      out.push({
        x,
        z,
        base: def.voidHeight - 2,
        top: floor + HEART_WALL_RISE + (d - HEART_WALL_CLEAR) * 1.8 + h * 8,
        r,
        yaw: heartHash(i - 11, j + 13) * Math.PI * 2,
      });
    }
  }
  return out;
}
