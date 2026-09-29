// Ground height of an authored field: the ONE height function the sim
// (world.ts groundHeight) and the renderer (terrain mesh) both sample.
//
// A point takes the height of the LAST surface that contains it (the list is
// ordered), or the field's void height when none does. Flat surfaces are
// single-valued by construction; a path blends linearly along its nearest
// segment. The limit the design notes holds: one height per point, so an upper
// level is a terrace beside a lower one, never above it.
//
// Pure and allocation-free on the hot path: each surface is compiled once
// (bounding box, segment lengths) and cached per def.

import type { AuthoredFieldDef, FieldPathSurface, FieldSurface } from './types';

interface CompiledSurface {
  surface: FieldSurface;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const compiled = new WeakMap<AuthoredFieldDef, CompiledSurface[]>();

function boundsOf(s: FieldSurface): Omit<CompiledSurface, 'surface'> {
  if (s.kind === 'circle') {
    return { minX: s.x - s.r, maxX: s.x + s.r, minZ: s.z - s.r, maxZ: s.z + s.r };
  }
  const pad = s.kind === 'path' ? s.halfWidth : 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of s.points) {
    minX = Math.min(minX, p[0] - pad);
    maxX = Math.max(maxX, p[0] + pad);
    minZ = Math.min(minZ, p[1] - pad);
    maxZ = Math.max(maxZ, p[1] + pad);
  }
  return { minX, maxX, minZ, maxZ };
}

function compile(def: AuthoredFieldDef): CompiledSurface[] {
  let list = compiled.get(def);
  if (!list) {
    list = def.surfaces.map((surface) => ({ surface, ...boundsOf(surface) }));
    compiled.set(def, list);
  }
  return list;
}

/** Even-odd point-in-polygon. */
export function pointInPolygon(
  points: readonly (readonly [number, number])[],
  x: number,
  z: number,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const zi = points[i][1];
    const xj = points[j][0];
    const zj = points[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const pathOutlines = new WeakMap<FieldPathSurface, [number, number][]>();

/**
 * The closed band outline of a path: both sides offset by the half width with
 * mitred joints (capped for sharp turns), flat end caps. This ring IS the
 * path's footprint: height only answers inside it, and the cliff derivation
 * walks the same ring, so the walkable band and its walls never disagree.
 */
export function pathOutline(s: FieldPathSurface): [number, number][] {
  let ring = pathOutlines.get(s);
  if (ring) return ring;
  const pts = s.points;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Mitre length: halfWidth / cos(half the turn), capped for sharp turns.
    let miter = 1;
    if (i > 0 && i < pts.length - 1) {
      const ax = pts[i][0] - prev[0];
      const az = pts[i][1] - prev[1];
      const al = Math.hypot(ax, az) || 1;
      const cos = (ax / al) * dx + (az / al) * dz;
      miter = Math.min(2, 1 / Math.max(0.5, cos));
    }
    const w = s.halfWidth * miter;
    left.push([pts[i][0] - dz * w, pts[i][1] + dx * w]);
    right.push([pts[i][0] + dz * w, pts[i][1] - dx * w]);
  }
  ring = [...left, ...right.reverse()];
  pathOutlines.set(s, ring);
  return ring;
}

/** Height a path gives (x, z), or NaN when the point is outside its band.
 *  Inside the band the height blends along the nearest centreline segment. */
export function pathHeightAt(s: FieldPathSurface, x: number, z: number): number {
  if (!pointInPolygon(pathOutline(s), x, z)) return Number.NaN;
  let bestD2 = Infinity;
  let bestH = Number.NaN;
  const pts = s.points;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0];
    const az = pts[i][1];
    const dx = pts[i + 1][0] - ax;
    const dz = pts[i + 1][1] - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    const d2 = px * px + pz * pz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestH = pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t;
    }
  }
  return bestH;
}

/** Height one surface gives (x, z), or NaN when it does not contain it. */
export function surfaceHeightAt(s: FieldSurface, x: number, z: number): number {
  if (s.kind === 'circle') {
    const dx = x - s.x;
    const dz = z - s.z;
    return dx * dx + dz * dz <= s.r * s.r ? s.h : Number.NaN;
  }
  if (s.kind === 'poly') return pointInPolygon(s.points, x, z) ? s.h : Number.NaN;
  return pathHeightAt(s, x, z);
}

/** The surface that owns (x, z), or null over the void. */
export function authoredFieldSurfaceAt(
  def: AuthoredFieldDef,
  x: number,
  z: number,
): FieldSurface | null {
  const list = compile(def);
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
    if (!Number.isNaN(surfaceHeightAt(c.surface, x, z))) return c.surface;
  }
  return null;
}

/** Instance-local ground height of the field at (x, z). */
export function authoredFieldHeight(def: AuthoredFieldDef, x: number, z: number): number {
  const list = compile(def);
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
    const h = surfaceHeightAt(c.surface, x, z);
    if (!Number.isNaN(h)) return h;
  }
  return def.voidHeight;
}
