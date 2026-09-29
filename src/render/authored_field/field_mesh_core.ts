// Pure mesh plan for an authored open-air field (src/sim/instances/
// authored_field): the walkable tops of every surface and the cliff faces
// under every generated cliff run, as plain typed arrays the painter wraps in
// Three geometry. Heights come from the SAME sim records (the surfaces and
// their cliff runs), so what you see is what you stand on: every top vertex
// sits exactly on its surface, and the cliff tops meet the walkable edge.
//
// Three-free, DOM-free, deterministic (hash noise, no Math.random).

import {
  type AuthoredFieldDef,
  authoredFieldCliffRuns,
  type FieldCliffRun,
  type FieldGround,
  type FieldSurface,
  surfaceOutline,
} from '../../sim/instances/authored_field';

export interface FieldMeshData {
  positions: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
}

export type Rgb = readonly [number, number, number];

/** Linear-ish colours per ground kind (the painter's vertex paint). */
export const FIELD_GROUND_COLORS: Readonly<Record<FieldGround, Rgb>> = {
  flagstone: [0.46, 0.44, 0.42],
  earth: [0.3, 0.25, 0.2],
  grave: [0.27, 0.23, 0.19],
  frost: [0.56, 0.62, 0.68],
  bone: [0.62, 0.58, 0.5],
  ritual: [0.3, 0.3, 0.34],
};

/** Which texture family a ground kind draws with. */
export function fieldGroundFamily(ground: FieldGround): 'stone' | 'soil' {
  return ground === 'earth' || ground === 'grave' || ground === 'frost' ? 'soil' : 'stone';
}

// ---- deterministic noise ----------------------------------------------------

function hash2(x: number, z: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function valueNoise(x: number, z: number): number {
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

/** Fractal value noise in [0, 1). */
export function fieldNoise(x: number, z: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// ---- polygon triangulation --------------------------------------------------

function signedArea(pts: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  }
  return a / 2;
}

function pointInTri(
  px: number,
  pz: number,
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): boolean {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (pz - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (pz - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (pz - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Ear-clipping triangulation of a simple polygon: index triples into `pts`. */
export function triangulatePolygon(pts: readonly (readonly [number, number])[]): number[] {
  const n = pts.length;
  if (n < 3) return [];
  // Work with a positive shoelace area so a convex corner has a positive cross.
  const order = Array.from({ length: n }, (_, i) => i);
  if (signedArea(pts) < 0) order.reverse();
  const out: number[] = [];
  let guard = 0;
  while (order.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < order.length; i++) {
      const ia = order[(i + order.length - 1) % order.length];
      const ib = order[i];
      const ic = order[(i + 1) % order.length];
      const a = pts[ia];
      const b = pts[ib];
      const c = pts[ic];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 1e-9) continue; // reflex or degenerate
      let inside = false;
      for (const k of order) {
        if (k === ia || k === ib || k === ic) continue;
        if (pointInTri(pts[k][0], pts[k][1], a, b, c)) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      out.push(ia, ib, ic);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (order.length === 3) out.push(order[0], order[1], order[2]);
  return out;
}

// ---- walkable tops ------------------------------------------------------------

/** Height a surface gives at (x, z), extended past its band for paths (the
 *  outline's own vertices sit exactly on the edge, where containment is
 *  ambiguous), so every top vertex gets its surface's own height. */
export function surfaceTopHeight(s: FieldSurface, x: number, z: number): number {
  if (s.kind !== 'path') return s.h;
  let bestD2 = Infinity;
  let bestH = s.points[0][2];
  for (let i = 0; i + 1 < s.points.length; i++) {
    const [ax, az, ah] = s.points[i];
    const [bx, bz, bh] = s.points[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    const d2 = px * px + pz * pz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestH = ah + (bh - ah) * t;
    }
  }
  return bestH;
}

interface Tri {
  a: [number, number];
  b: [number, number];
  c: [number, number];
}

function subdivide(tri: Tri, maxEdge: number, out: Tri[], depth = 0): void {
  const ab = Math.hypot(tri.a[0] - tri.b[0], tri.a[1] - tri.b[1]);
  const bc = Math.hypot(tri.b[0] - tri.c[0], tri.b[1] - tri.c[1]);
  const ca = Math.hypot(tri.c[0] - tri.a[0], tri.c[1] - tri.a[1]);
  if (Math.max(ab, bc, ca) <= maxEdge || depth > 9) {
    out.push(tri);
    return;
  }
  const mid = (p: [number, number], q: [number, number]): [number, number] => [
    (p[0] + q[0]) / 2,
    (p[1] + q[1]) / 2,
  ];
  // Split across the longest edge: no slivers, and neighbours sharing that
  // edge split it at the same midpoint.
  if (ab >= bc && ab >= ca) {
    const m = mid(tri.a, tri.b);
    subdivide({ a: tri.a, b: m, c: tri.c }, maxEdge, out, depth + 1);
    subdivide({ a: m, b: tri.b, c: tri.c }, maxEdge, out, depth + 1);
  } else if (bc >= ca) {
    const m = mid(tri.b, tri.c);
    subdivide({ a: tri.a, b: tri.b, c: m }, maxEdge, out, depth + 1);
    subdivide({ a: tri.a, b: m, c: tri.c }, maxEdge, out, depth + 1);
  } else {
    const m = mid(tri.c, tri.a);
    subdivide({ a: tri.a, b: tri.b, c: m }, maxEdge, out, depth + 1);
    subdivide({ a: m, b: tri.b, c: tri.c }, maxEdge, out, depth + 1);
  }
}

export interface FieldTopOptions {
  /** Longest triangle edge on the walkable tops (yards). */
  maxEdge: number;
  /** Each later surface floats this much above the one before (z-fight guard). */
  layerLift: number;
}

/** Vertex paint of a walkable top: ground colour, broad mottling, grit. */
export function topColor(ground: FieldGround, x: number, z: number, onPath: boolean): Rgb {
  const base = FIELD_GROUND_COLORS[ground];
  const broad = fieldNoise(x * 0.045, z * 0.045, 3);
  const grit = hash2(Math.floor(x * 1.7), Math.floor(z * 1.7));
  let k = 0.72 + broad * 0.5 + (grit - 0.5) * 0.08;
  if (onPath) k *= 1.08;
  // A cold moss/lichen bloom on the stone, deeper in the damp hollows.
  const moss = ground === 'flagstone' || ground === 'bone' ? Math.max(0, broad - 0.62) * 1.4 : 0;
  return [
    base[0] * k * (1 - moss * 0.3),
    base[1] * k * (1 - moss * 0.1),
    base[2] * k * (1 - moss * 0.35),
  ];
}

function pushVertex(
  out: FieldMeshData,
  x: number,
  y: number,
  z: number,
  color: Rgb,
  uvScale: number,
): number {
  const index = out.positions.length / 3;
  out.positions.push(x, y, z);
  out.colors.push(color[0], color[1], color[2]);
  out.uvs.push(x * uvScale, z * uvScale);
  return index;
}

/**
 * The walkable tops of the field, one batch per texture family. Each surface
 * is its outline triangulated then split down to `maxEdge`, every vertex on
 * the surface's own height (paths slope with their centreline).
 */
export function planFieldTops(
  def: AuthoredFieldDef,
  opts: FieldTopOptions,
): Record<'stone' | 'soil', FieldMeshData> {
  const out: Record<'stone' | 'soil', FieldMeshData> = {
    stone: { positions: [], colors: [], uvs: [], indices: [] },
    soil: { positions: [], colors: [], uvs: [], indices: [] },
  };
  def.surfaces.forEach((s, layer) => {
    if (s.hidden) return;
    const ground: FieldGround = s.ground ?? (s.kind === 'path' ? 'flagstone' : 'earth');
    const batch = out[fieldGroundFamily(ground)];
    const ring = surfaceOutline(s);
    const tris = triangulatePolygon(ring);
    const fine: Tri[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      subdivide(
        {
          a: [ring[tris[i]][0], ring[tris[i]][1]],
          b: [ring[tris[i + 1]][0], ring[tris[i + 1]][1]],
          c: [ring[tris[i + 2]][0], ring[tris[i + 2]][1]],
        },
        opts.maxEdge,
        fine,
      );
    }
    const lift = layer * opts.layerLift;
    const onPath = s.kind === 'path';
    for (const t of fine) {
      for (const p of [t.a, t.b, t.c]) {
        const y = surfaceTopHeight(s, p[0], p[1]) + lift;
        const idx = pushVertex(batch, p[0], y, p[1], topColor(ground, p[0], p[1], onPath), 0.25);
        batch.indices.push(idx);
      }
    }
  });
  return out;
}

// ---- cliff faces ------------------------------------------------------------------

export interface FieldCliffOptions {
  /** Where a drop into the void bottoms out (below the mist). */
  voidFloor: number;
  /** Horizontal and vertical sampling of a face (yards). */
  columnStep: number;
  rowStep: number;
  /** How far a face bulges out per yard of depth below its top (massif flare). */
  flare: number;
}

/** Cliff rock tint: cold strata banding, darker with depth. */
export function cliffColor(run: FieldCliffRun, x: number, y: number, z: number, top: number): Rgb {
  const depth = Math.max(0, top - y);
  const strata = 0.5 + 0.5 * Math.sin(y * 1.9 + fieldNoise(x * 0.1, z * 0.1, 2) * 6);
  const n = fieldNoise(x * 0.3 + y * 0.2, z * 0.3 - y * 0.15, 3);
  const dark = Math.max(0.35, 1 - depth / 55);
  const masonry = run.style === 'masonry' || run.style === 'balustrade';
  const base: Rgb = masonry && depth < 3.2 ? [0.44, 0.41, 0.38] : [0.3, 0.29, 0.31];
  const k = (0.7 + strata * 0.18 + n * 0.3) * dark;
  return [base[0] * k, base[1] * k, base[2] * k * 1.05];
}

/**
 * Every cliff run as a displaced face from the walkable edge down to the
 * lower ground (or deep into the chasm), its top row pinned to the exact
 * edge so the wall you collide with is the wall you see.
 */
export function planFieldCliffs(def: AuthoredFieldDef, opts: FieldCliffOptions): FieldMeshData {
  const out: FieldMeshData = { positions: [], colors: [], uvs: [], indices: [] };
  const hidden = new Set(def.surfaces.filter((s) => s.hidden).map((s) => s.id));
  for (const run of authoredFieldCliffRuns(def)) {
    const len = Math.hypot(run.bx - run.ax, run.bz - run.az);
    if (len < 0.2 || hidden.has(run.surface)) continue;
    const intoVoid = run.low <= def.voidHeight + 0.5;
    const bottom = intoVoid ? opts.voidFloor : run.low - 0.4;
    const cols = Math.max(1, Math.ceil(len / opts.columnStep));
    const rows = Math.max(1, Math.ceil((run.high - bottom) / opts.rowStep));
    const base = out.positions.length / 3;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const y = run.high + (bottom - run.high) * t;
      const depth = run.high - y;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const ex = run.ax + (run.bx - run.ax) * u;
        const ez = run.az + (run.bz - run.az) * u;
        // Pinned top row; below it the rock bulges out and jags (the terrace
        // sits on a massif that widens into the mist). Masonry keeps a
        // straight retaining course for its first few yards.
        const masonry = (run.style === 'masonry' || run.style === 'balustrade') && depth < 3.2;
        const jag =
          r === 0 || masonry
            ? 0
            : (fieldNoise(ex * 0.35 + y * 0.21, ez * 0.35 - y * 0.17, 3) - 0.3) * 2.4;
        const push = r === 0 ? 0 : Math.max(0, (intoVoid ? depth * opts.flare : 0) + jag);
        const x = ex + run.nx * push;
        const z = ez + run.nz * push;
        const color = cliffColor(run, ex, y, ez, run.high);
        out.positions.push(x, y, z);
        out.colors.push(color[0], color[1], color[2]);
        out.uvs.push((ex + ez) * 0.25, y * 0.25);
      }
    }
    const stride = cols + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i0 = base + r * stride + c;
        const i1 = i0 + 1;
        const i2 = i0 + stride;
        const i3 = i2 + 1;
        out.indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
  }
  return out;
}
