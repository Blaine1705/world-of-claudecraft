// Pure window-pane derivation for the Eastbrook kit buildings (Three/DOM
// free). The hexb kit GLBs carry no emissive materials or window markers:
// their windows are just small recessed frame assemblies modeled into the one
// building mesh. This core finds those assemblies in the raw geometry and
// emits one amber pane rectangle per window, so the lit-window meshes sit
// exactly in the models' real openings instead of guessed wall positions.
//
// How: split vertices are merged by exact position triple, triangles are
// grouped into connected components via shared merged vertices, and each
// component is classified against the model's bounding box. A window assembly
// is a small component (bounded triangle count), short relative to the model,
// off the ground, thin across one horizontal axis, and not tall-and-narrow
// near the ground (that shape is a door frame). The pane fills 70 percent of
// the assembly's thick horizontal extent and height, across its thin axis.
//
// The thresholds below were validated in-browser against all five shipped
// hexb kit models (hexb_home_a, hexb_home_b, hexb_tavern, hexb_workshop,
// hexb_townhall): every authored window gained exactly one pane and no door,
// chimney, or wall body was selected. All classification inputs are
// normalized by the model bounding box (or are ratios), so the function works
// identically in raw quantized attribute units and in float model units.
const MIN_TRIANGLES = 6;
const MAX_TRIANGLES = 130;
const MIN_NORMALIZED_HEIGHT = 0.04;
const MAX_NORMALIZED_HEIGHT = 0.32;
const MIN_NORMALIZED_BOTTOM = 0.1;
const MAX_THIN_AXIS_FRACTION = 0.12;
const MAX_THICK_AXIS_FRACTION = 0.42;
const DOOR_MAX_NORMALIZED_BOTTOM = 0.3;
const DOOR_MIN_HEIGHT_TO_WIDTH = 1.5;
const PANE_FRACTION = 0.7;

export interface KitWindowPane {
  /** Pane center, in the same units as the input positions. */
  cx: number;
  cy: number;
  cz: number;
  /** Pane extent along its thick horizontal axis, same units as positions. */
  width: number;
  /** Pane extent along y, same units as positions. */
  height: number;
  /** The assembly is thin along x: the pane lies in the YZ plane. */
  thinX: boolean;
}

interface ComponentStats {
  triangles: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Derives one window pane per detected window assembly from a kit GLB's mesh
 * geometry. Pass the position attribute values (three components per vertex,
 * raw quantized integers or floats) and the triangle indices (null for
 * non-indexed geometry). Output coordinates stay in the input's units.
 */
export function kitWindowPanes(
  positions: ArrayLike<number>,
  vertexCount: number,
  indices: ArrayLike<number> | null,
): KitWindowPane[] {
  if (vertexCount < 3) return [];

  // Merge split vertices by exact position triple, so a component is
  // connected through seams the exporter duplicated for normals or UVs.
  const mergedByKey = new Map<string, number>();
  const mergedByVertex = new Int32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const base = vertex * 3;
    const key = `${positions[base]},${positions[base + 1]},${positions[base + 2]}`;
    let merged = mergedByKey.get(key);
    if (merged === undefined) {
      merged = mergedByKey.size;
      mergedByKey.set(key, merged);
    }
    mergedByVertex[vertex] = merged;
  }

  // Union-find over merged vertices; every triangle unions its corners.
  const parent = new Int32Array(mergedByKey.size);
  for (let index = 0; index < parent.length; index++) parent[index] = index;
  const find = (start: number): number => {
    let node = start;
    while (parent[node] !== node) {
      parent[node] = parent[parent[node]];
      node = parent[node];
    }
    return node;
  };
  const triangleCount = Math.floor((indices ? indices.length : vertexCount) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const base = triangle * 3;
    const a = find(mergedByVertex[indices ? indices[base] : base]);
    const b = find(mergedByVertex[indices ? indices[base + 1] : base + 1]);
    const c = find(mergedByVertex[indices ? indices[base + 2] : base + 2]);
    if (b !== a) parent[b] = a;
    if (c !== a) parent[c] = a;
  }

  // Model bounding box plus per-component triangle counts and bounding boxes.
  let modelMinX = Infinity;
  let modelMinY = Infinity;
  let modelMinZ = Infinity;
  let modelMaxX = -Infinity;
  let modelMaxY = -Infinity;
  let modelMaxZ = -Infinity;
  const components = new Map<number, ComponentStats>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const base = triangle * 3;
    const root = find(mergedByVertex[indices ? indices[base] : base]);
    let stats = components.get(root);
    if (!stats) {
      stats = {
        triangles: 0,
        minX: Infinity,
        minY: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        maxZ: -Infinity,
      };
      components.set(root, stats);
    }
    stats.triangles++;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = indices ? indices[base + corner] : base + corner;
      const x = positions[vertex * 3];
      const y = positions[vertex * 3 + 1];
      const z = positions[vertex * 3 + 2];
      if (x < stats.minX) stats.minX = x;
      if (y < stats.minY) stats.minY = y;
      if (z < stats.minZ) stats.minZ = z;
      if (x > stats.maxX) stats.maxX = x;
      if (y > stats.maxY) stats.maxY = y;
      if (z > stats.maxZ) stats.maxZ = z;
      if (x < modelMinX) modelMinX = x;
      if (y < modelMinY) modelMinY = y;
      if (z < modelMinZ) modelMinZ = z;
      if (x > modelMaxX) modelMaxX = x;
      if (y > modelMaxY) modelMaxY = y;
      if (z > modelMaxZ) modelMaxZ = z;
    }
  }
  const modelSpanX = modelMaxX - modelMinX;
  const modelSpanY = modelMaxY - modelMinY;
  const modelSpanZ = modelMaxZ - modelMinZ;
  if (modelSpanX <= 0 || modelSpanY <= 0 || modelSpanZ <= 0) return [];

  const panes: KitWindowPane[] = [];
  for (const stats of components.values()) {
    if (stats.triangles < MIN_TRIANGLES || stats.triangles > MAX_TRIANGLES) continue;
    const spanX = stats.maxX - stats.minX;
    const spanY = stats.maxY - stats.minY;
    const spanZ = stats.maxZ - stats.minZ;
    const normalizedHeight = spanY / modelSpanY;
    if (normalizedHeight < MIN_NORMALIZED_HEIGHT || normalizedHeight > MAX_NORMALIZED_HEIGHT) {
      continue;
    }
    const normalizedBottom = (stats.minY - modelMinY) / modelSpanY;
    if (normalizedBottom < MIN_NORMALIZED_BOTTOM) continue;
    const normalizedSpanX = spanX / modelSpanX;
    const normalizedSpanZ = spanZ / modelSpanZ;
    if (Math.min(normalizedSpanX, normalizedSpanZ) > MAX_THIN_AXIS_FRACTION) continue;
    if (Math.max(normalizedSpanX, normalizedSpanZ) > MAX_THICK_AXIS_FRACTION) continue;
    // Door shape: tall and narrow near the ground. Ratio of absolute extents,
    // so it is unit-independent like the normalized filters above.
    if (
      normalizedBottom < DOOR_MAX_NORMALIZED_BOTTOM &&
      spanY / Math.max(spanX, spanZ) > DOOR_MIN_HEIGHT_TO_WIDTH
    ) {
      continue;
    }
    const thinX = spanX <= spanZ;
    panes.push({
      cx: (stats.minX + stats.maxX) / 2,
      cy: (stats.minY + stats.maxY) / 2,
      cz: (stats.minZ + stats.maxZ) / 2,
      width: PANE_FRACTION * (thinX ? spanZ : spanX),
      height: PANE_FRACTION * spanY,
      thinX,
    });
  }
  return panes;
}
