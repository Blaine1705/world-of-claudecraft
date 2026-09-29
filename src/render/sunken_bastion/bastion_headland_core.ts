// Pure plan of the Sunken Bastion's headland rock: the living cliff the
// fortress is built on, draped between and under the terraces so the route
// reads as ONE headland rising out of the sea instead of islands over a void.
// Render only: every rock vertex lies in the void (unwalkable) or hidden under
// a terrace, so the rock never changes what a player can stand on.
//
// The rock climbs toward every terrace and falls away from it: a masonry lip
// keeps a band of wall face showing above the rock (the fortress walls), a
// rock lip meets the stone at the floor's edge (the gaol cleft's walls rise
// from the rampart and the keep stair around it), and past a few yards out
// the rock drops under the waves. Three-free, deterministic.

import {
  SUNKEN_BASTION_FIELD,
  SUNKEN_BASTION_SEA_LEVEL,
} from '../../sim/content/sunken_bastion_layout';
import { authoredFieldHeight, surfaceOutline } from '../../sim/instances/authored_field';
import type { FieldSurface } from '../../sim/instances/authored_field/types';

const FIELD = SUNKEN_BASTION_FIELD;

/** How far a terrace's lip keeps its wall face bare above the rock, and how
 *  steeply the rock falls away from it (yards down per yard out). */
function lipOf(s: FieldSurface): { bare: number; fall: number } {
  if (s.edge === 'masonry') return { bare: 7, fall: 0.5 };
  if (s.edge === 'balustrade') return { bare: 3, fall: 0.5 };
  return { bare: 1.2, fall: 0.42 };
}

function surfaceTop(s: FieldSurface): number {
  if (s.kind === 'path') return Math.max(...s.points.map((p) => p[2]));
  return s.h;
}

/** Distance from (x, z) to a closed ring (0 inside is not detected here). */
function ringDistance(ring: readonly [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}

function hash2(x: number, z: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const w = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

export function rockNoise(x: number, z: number): number {
  return (
    vnoise(x * 0.07, z * 0.07) * 0.55 +
    vnoise(x * 0.19 + 7, z * 0.19 - 3) * 0.3 +
    vnoise(x * 0.5 - 11, z * 0.5 + 5) * 0.15
  );
}

export interface HeadlandGrid {
  minX: number;
  minZ: number;
  step: number;
  cols: number;
  rows: number;
  /** Rock height per vertex, row-major from minZ. */
  heights: Float32Array;
  /** 1 where the vertex hides under a walkable terrace (its triangles skip
   *  when every corner hides), 0 in the void. */
  under: Uint8Array;
}

/** Beyond this far from every terrace no rock is laid (open sea). */
const REACH = 46;
/** Rock this far under the waves is not drawn at all. */
export const HEADLAND_DROWNED = SUNKEN_BASTION_SEA_LEVEL - 5;

/** The rock height at a void point, or HEADLAND_DROWNED when none rises there. */
export function headlandRockHeight(
  x: number,
  z: number,
  rings: readonly { ring: [number, number][]; top: number; bare: number; fall: number }[],
): number {
  let best = HEADLAND_DROWNED;
  for (const r of rings) {
    const d = ringDistance(r.ring, x, z);
    if (d > REACH) continue;
    // Past a stretch of slope the rock plunges, so the headland ends in the
    // waves instead of a shelf cut off at the reach.
    const h = r.top - r.bare - r.fall * d - Math.max(0, d - 24) * 1.3;
    if (h > best) best = h;
  }
  if (best <= HEADLAND_DROWNED) return HEADLAND_DROWNED;
  // Crags: broad lumps and a finer grain, none right at a lip (the fit).
  const grain = (rockNoise(x, z) - 0.45) * 7;
  return best + grain;
}

/** The whole headland heightfield at `step` yards. */
export function planHeadlandRock(step = 3): HeadlandGrid {
  const b = FIELD.bounds;
  const minX = b.minX - 40;
  const minZ = b.minZ - 40;
  const cols = Math.ceil((b.maxX + 40 - minX) / step) + 1;
  const rows = Math.ceil((b.maxZ + 40 - minZ) / step) + 1;
  const rings = FIELD.surfaces.map((s) => ({
    ring: surfaceOutline(s),
    top: surfaceTop(s),
    ...lipOf(s),
  }));
  const heights = new Float32Array(cols * rows);
  const under = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const z = minZ + j * step;
    for (let i = 0; i < cols; i++) {
      const x = minX + i * step;
      const g = authoredFieldHeight(FIELD, x, z);
      const k = j * cols + i;
      if (g > FIELD.voidHeight + 0.5) {
        // Under a terrace: tucked below its floor, never poking through.
        heights[k] = g - 3;
        under[k] = 1;
      } else {
        heights[k] = headlandRockHeight(x, z, rings);
      }
    }
  }
  return { minX, minZ, step, cols, rows, heights, under };
}
