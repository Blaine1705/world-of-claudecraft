// Pure post-projection pass: nudges apart nameplates whose screen positions
// would otherwise fully overlap (e.g. two same-named mobs standing close
// together). Most visible on short mobile-landscape viewports, where entities
// need to be much farther apart in world space before their projections
// separate on their own. DOM/Three-free so it unit-tests directly.
//
// This runs for EVERY visible plate on EVERY rendered frame, so the hot path
// (`declutterNameplatesInPlace`) allocates nothing and finds each anchor's
// collision cluster through a reusable spatial hash rather than rescanning all
// anchors, which made the pass quadratic in a crowd.

export interface NameplateAnchor {
  id: number;
  sx: number;
  sy: number;
}

// Anchors within this horizontal distance are treated as colliding: nameplate
// labels render much wider than the anchor point itself (name + level + hp
// bar), so this approximates half of a typical label's on-screen width rather
// than the anchor point spacing.
const OVERLAP_THRESHOLD_X_PX = 80;
// Vertical anchors this close are considered the "same row" (labels are a
// single text line anchored at their bottom, so the tolerance is much
// tighter than the horizontal one).
const OVERLAP_THRESHOLD_Y_PX = 18;
// Vertical gap applied between stacked members of a cluster.
const STACK_OFFSET_PX = 20;

// Cell size equals the collision thresholds, so two colliding anchors are never
// more than one cell apart on either axis and a 3x3 neighbourhood is exhaustive.
const CELL_BIAS = 1 << 15; // keeps negative (just-offscreen) cells non-negative
const CELL_STRIDE = 1 << 16;
// A point projected near the camera plane lands arbitrarily far off-screen, so
// clamp each cell coord into 16 bits. `cx * STRIDE + cy` is then an INJECTIVE
// packing of the clamped cell (both fields fit their lane), never a lossy hash.
//
// Anchors beyond the clamp collapse onto an edge cell. That only makes one bucket
// hold extra candidates: membership is decided by the exact |dx| / |dy| test
// below, never by the key, and a true neighbour always lands in the scanned 3x3
// neighbourhood. So clustering is identical to the reference at any coordinate.
const CELL_MIN = -CELL_BIAS;
const CELL_MAX = CELL_BIAS - 1;

function cellCoord(v: number, size: number): number {
  const c = Math.floor(v / size);
  if (!(c > CELL_MIN)) return CELL_MIN + CELL_BIAS; // also catches NaN
  return (c > CELL_MAX ? CELL_MAX : c) + CELL_BIAS;
}

// ---------------------------------------------------------------------------
// Reusable workspace. The painter calls this once per frame on one thread, so a
// module-level scratch is safe and keeps the pass allocation-free.
// ---------------------------------------------------------------------------
const order: number[] = [];
const cluster: number[] = [];
let visited = new Uint8Array(64);
let cellKeys = new Uint32Array(64);
let cellHeads = new Int32Array(64);
let cellGenerations = new Uint32Array(64);
let cellNext = new Int32Array(64);
let cellGeneration = 0;

function sortIndicesByAnchorId(indices: number[], anchors: NameplateAnchor[]): void {
  // Insertion sort is allocation-free and fast here: view-map order is stable
  // between frames, while collision clusters normally contain only 2-3 plates.
  for (let i = 1; i < indices.length; i++) {
    const value = indices[i];
    const id = anchors[value].id;
    let j = i - 1;
    while (j >= 0 && anchors[indices[j]].id > id) {
      indices[j + 1] = indices[j];
      j--;
    }
    indices[j + 1] = value;
  }
}

function beginCellFrame(anchorCount: number): void {
  let capacity = cellKeys.length;
  while (capacity < anchorCount * 2) capacity *= 2;
  if (capacity !== cellKeys.length) {
    cellKeys = new Uint32Array(capacity);
    cellHeads = new Int32Array(capacity);
    cellGenerations = new Uint32Array(capacity);
    cellNext = new Int32Array(capacity);
    cellGeneration = 0;
  } else if (cellNext.length < anchorCount) {
    cellNext = new Int32Array(capacity);
  }
  cellGeneration = (cellGeneration + 1) >>> 0;
  if (cellGeneration === 0) {
    cellGenerations.fill(0);
    cellGeneration = 1;
  }
}

function cellSlot(key: number): number {
  const mask = cellKeys.length - 1;
  let slot = Math.imul((key ^ (key >>> 16)) >>> 0, 0x45d9f3b) & mask;
  while (cellGenerations[slot] === cellGeneration && cellKeys[slot] !== key) {
    slot = (slot + 1) & mask;
  }
  return slot;
}

function insertCellAnchor(key: number, anchorIndex: number): void {
  const slot = cellSlot(key);
  if (cellGenerations[slot] !== cellGeneration) {
    cellGenerations[slot] = cellGeneration;
    cellKeys[slot] = key;
    cellHeads[slot] = -1;
  }
  cellNext[anchorIndex] = cellHeads[slot];
  cellHeads[slot] = anchorIndex;
}

function firstCellAnchor(key: number): number {
  const slot = cellSlot(key);
  return cellGenerations[slot] === cellGeneration ? cellHeads[slot] : -1;
}

/**
 * Stack overlapping anchors apart, MUTATING `anchors` in place.
 *
 * Anchors are processed in ascending id order so the same entities always stack
 * the same way frame to frame, independent of render order.
 *
 * `count` bounds the live prefix, so the caller can hand in a pooled array that
 * is longer than this frame's anchor list without any slicing.
 */
export function declutterNameplatesInPlace(
  anchors: NameplateAnchor[],
  count = anchors.length,
): NameplateAnchor[] {
  const n = Math.min(count, anchors.length);
  if (n < 2) return anchors;

  if (visited.length < n) visited = new Uint8Array(Math.max(n, visited.length * 2));
  else visited.fill(0, 0, n);

  order.length = 0;
  for (let i = 0; i < n; i++) order.push(i);
  sortIndicesByAnchorId(order, anchors);

  beginCellFrame(n);
  for (let i = 0; i < n; i++) {
    const cx = cellCoord(anchors[i].sx, OVERLAP_THRESHOLD_X_PX);
    const cy = cellCoord(anchors[i].sy, OVERLAP_THRESHOLD_Y_PX);
    const key = cx * CELL_STRIDE + cy;
    insertCellAnchor(key, i);
  }

  for (let o = 0; o < n; o++) {
    const i = order[o];
    if (visited[i]) continue;
    const ax = anchors[i].sx;
    const ay = anchors[i].sy;

    // gather this anchor's collision cluster from the 3x3 cell neighbourhood
    cluster.length = 0;
    const cx = cellCoord(ax, OVERLAP_THRESHOLD_X_PX);
    const cy = cellCoord(ay, OVERLAP_THRESHOLD_Y_PX);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbourX = cx + dx;
        const neighbourY = cy + dy;
        if (neighbourX < 0 || neighbourX > 0xffff || neighbourY < 0 || neighbourY > 0xffff) {
          continue;
        }
        const key = neighbourX * CELL_STRIDE + neighbourY;
        for (let j = firstCellAnchor(key); j !== -1; j = cellNext[j]) {
          if (visited[j]) continue;
          if (Math.abs(anchors[j].sx - ax) > OVERLAP_THRESHOLD_X_PX) continue;
          if (Math.abs(anchors[j].sy - ay) > OVERLAP_THRESHOLD_Y_PX) continue;
          cluster.push(j);
        }
      }
    }

    if (cluster.length < 2) {
      visited[i] = 1;
      continue;
    }
    // the whole pass stacks in ascending id order
    sortIndicesByAnchorId(cluster, anchors);

    let sum = 0;
    for (let k = 0; k < cluster.length; k++) sum += anchors[cluster[k]].sy;
    const baseSy = sum / cluster.length;
    const mid = (cluster.length - 1) / 2;
    for (let k = 0; k < cluster.length; k++) {
      const j = cluster[k];
      anchors[j].sy = baseSy + (k - mid) * STACK_OFFSET_PX;
      visited[j] = 1;
    }
  }

  return anchors;
}

/**
 * Non-mutating wrapper: returns fresh anchors and leaves the input untouched.
 * It allocates, so it is NOT the per-frame path.
 */
export function declutterNameplates(anchors: NameplateAnchor[]): NameplateAnchor[] {
  return declutterNameplatesInPlace(anchors.map((a) => ({ ...a })));
}
