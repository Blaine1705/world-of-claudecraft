import { getActiveWorldContent, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z } from './data';
import type { WorldContent } from './types';
import { roadDistance, terrainHeight, WATER_LEVEL } from './world';

// Cliff-scree placement, pure and shared by the renderer's moving detail
// grid. The rocks are tier-gated visual dressing, so they deliberately do
// not alter groundHeight or deterministic simulation. Making them solid
// would create invisible walls on tiers that omit this detail layer.

// Placement tunables. These MUST stay identical to the renderer's read of
// them (it imports from here); re-tuning them re-seats every boulder.
export const SCREE_CELL = 6.5; // yards between candidate spots
const PROBE = 1.5; // relief probe reach
const SLOPE_MIN = 0.45; // height delta over PROBE where the cliff band starts
const SLOPE_MAX = 1.6; // past this the face is a sheer smear: rocks would float
const APRON_ELIGIBLE = 0.12; // minimum local incline for cliff-base rubble
const APRON_PROBE = 3; // how far uphill the apron looks for its cliff
const CLIFF_DENSITY = 0.65; // hash acceptance inside the band
const APRON_DENSITY = 0.4; // sparser rubble below it
export const SCREE_SINK = 0.15; // fraction of rock height buried in the ground
const EDGE = 16; // keep-out margin from the world rectangle
const HUB_EXCLUSION_RADIUS = 15; // same radius the grass hub exclusion uses

// Kit rock dimensions at scale 1, baked from the shipped GLBs
// (models/foliage/rock_1..3) via gltf-transform getBounds — constants so the
// sim never parses a model. The renderer derives its origin sink from the
// same rows, keeping the visual mesh and the walkable dome in agreement.
export const SCREE_ROCK_DIMS = [
  { minY: -0.271, maxY: 1.989, halfW: 1.613 },
  { minY: -0.051, maxY: 1.848, halfW: 1.524 },
  { minY: -0.316, maxY: 2.001, halfW: 1.738 },
] as const;

/** Origin y-offset that buries SCREE_SINK of the rock's height at scale 1. */
export function screeSinkY(variant: number): number {
  const d = SCREE_ROCK_DIMS[variant];
  return d.minY + (d.maxY - d.minY) * SCREE_SINK;
}

export interface ScreeSpot {
  x: number;
  z: number;
  /** terrain height at the spot centre */
  baseY: number;
  variant: number;
  scale: number;
  apron: boolean;
  yaw: number;
  /** downhill gradient at the spot (unnormalised), for the visual settle-lean */
  gx: number;
  gz: number;
  /** local relief at the spot, for the visual lean strength */
  slope: number;
  /** absolute world y of the rendered boulder crown */
  topY: number;
  /** approximate rendered footprint radius */
  footR: number;
}

const hash = (i: number, j: number, k: number): number => {
  let h = (i * 374761393 + j * 668265263 + k * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Spot cache: keyed on the active WorldContent identity (hub exclusions come
// from its zones; editor swaps drop the whole cache with the object, the
// collider-grid idiom), then seed, then packed cell. Bounded by world area /
// CELL^2 and filled lazily around live actors.
const spotCache = new WeakMap<WorldContent, Map<number, Map<number, ScreeSpot | null>>>();

function cellsFor(seed: number): Map<number, ScreeSpot | null> {
  const content = getActiveWorldContent();
  let bySeed = spotCache.get(content);
  if (!bySeed) {
    bySeed = new Map();
    spotCache.set(content, bySeed);
  }
  let cells = bySeed.get(seed);
  if (!cells) {
    cells = new Map();
    bySeed.set(seed, cells);
  }
  return cells;
}

function computeSpot(seed: number, ci: number, cj: number): ScreeSpot | null {
  const r1 = hash(ci, cj, 1);
  // density gate up front: the cheapest reject, and APRON_DENSITY sits
  // under CLIFF_DENSITY so a cell that fails here can never place at all
  if (r1 >= CLIFF_DENSITY) return null;
  const x = ci * SCREE_CELL + (hash(ci, cj, 2) - 0.5) * SCREE_CELL * 0.9;
  const z = cj * SCREE_CELL + (hash(ci, cj, 3) - 0.5) * SCREE_CELL * 0.9;
  if (Math.abs(x) > WORLD_MAX_X - EDGE || z < WORLD_MIN_Z + EDGE || z > WORLD_MAX_Z - EDGE) {
    return null;
  }
  const h = terrainHeight(x, z, seed);
  if (h < WATER_LEVEL + 0.5) return null; // shorelines keep their own dressing
  // local relief: max height delta over four short probes, the same signal
  // the terrain shader's slope treatment keys from
  const hE = terrainHeight(x + PROBE, z, seed);
  const hW = terrainHeight(x - PROBE, z, seed);
  const hS = terrainHeight(x, z + PROBE, seed);
  const hN = terrainHeight(x, z - PROBE, seed);
  const slope = Math.max(Math.abs(hE - h), Math.abs(hW - h), Math.abs(hS - h), Math.abs(hN - h));
  if (slope > SLOPE_MAX) return null;
  // uphill direction from the probe stencil; doubles as the lean direction
  const gx = hE - hW;
  const gz = hS - hN;
  const glen = Math.hypot(gx, gz);
  let apron = false;
  if (slope < SLOPE_MIN) {
    // Scree apron: a moderate incline directly below a cliff collects its
    // fallen rock. Probe uphill and require a genuine band there; flats
    // and gentle meadows (no meaningful gradient) never qualify.
    if (slope < APRON_ELIGIBLE || glen < 1e-4 || r1 >= APRON_DENSITY) return null;
    const ux = x + (gx / glen) * APRON_PROBE;
    const uz = z + (gz / glen) * APRON_PROBE;
    const uh = terrainHeight(ux, uz, seed);
    const uSlope = Math.max(
      Math.abs(terrainHeight(ux + PROBE, uz, seed) - uh),
      Math.abs(terrainHeight(ux - PROBE, uz, seed) - uh),
      Math.abs(terrainHeight(ux, uz + PROBE, seed) - uh),
      Math.abs(terrainHeight(ux, uz - PROBE, seed) - uh),
    );
    if (uSlope < SLOPE_MIN || uSlope > SLOPE_MAX) return null;
    apron = true;
  }
  if (roadDistance(x, z) < 3) return null;
  for (const zone of getActiveWorldContent().zones) {
    const dx = x - zone.hub.x;
    const dz = z - zone.hub.z;
    if (dx * dx + dz * dz < HUB_EXCLUSION_RADIUS * HUB_EXCLUSION_RADIUS) return null;
  }
  const variant = Math.min(
    SCREE_ROCK_DIMS.length - 1,
    Math.floor(hash(ci, cj, 4) * SCREE_ROCK_DIMS.length),
  );
  // apron rubble runs smaller (and so mostly hop- or mount-able); the band
  // itself holds the boulders, which read as walls by design
  const scale = apron ? 0.45 + hash(ci, cj, 5) * 0.55 : 0.5 + hash(ci, cj, 5) * 1.3;
  const yaw = hash(ci, cj, 6) * Math.PI * 2;
  const d = SCREE_ROCK_DIMS[variant];
  return {
    x,
    z,
    baseY: h,
    variant,
    scale,
    apron,
    yaw,
    gx,
    gz,
    slope,
    topY: h + (d.maxY - d.minY) * (1 - SCREE_SINK) * scale,
    // tighter than the visual half-width: the mesh silhouette narrows toward
    // the crown, and a dome wider than the rock would float feet in air
    footR: d.halfW * scale * 0.85,
  };
}

export function screeSpotAt(seed: number, ci: number, cj: number): ScreeSpot | null {
  const cells = cellsFor(seed);
  const key = ((ci & 0xffff) << 16) | (cj & 0xffff);
  const cached = cells.get(key);
  if (cached !== undefined) return cached;
  const spot = computeSpot(seed, ci, cj);
  cells.set(key, spot);
  return spot;
}

// Approximate visual envelope used by placement tests: a dome from the
// rendered crown to the terrain at the footprint rim. It is not part of the
// shared walkable heightfield because the detail layer is tier-gated.
export function screeSurfaceHeight(x: number, z: number, seed: number): number {
  const ci0 = Math.round(x / SCREE_CELL);
  const cj0 = Math.round(z / SCREE_CELL);
  let best = Number.NEGATIVE_INFINITY;
  for (let cj = cj0 - 1; cj <= cj0 + 1; cj++) {
    for (let ci = ci0 - 1; ci <= ci0 + 1; ci++) {
      const spot = screeSpotAt(seed, ci, cj);
      if (!spot) continue;
      const dx = x - spot.x;
      const dz = z - spot.z;
      const dSq = dx * dx + dz * dz;
      if (dSq >= spot.footR * spot.footR) continue;
      const t = Math.sqrt(dSq) / spot.footR;
      // dome: (1 - t^2)^0.3 — flat-ish crown, near-vertical rim. On sloped
      // ground the uphill flank sits nearly flush and CAN be stepped onto,
      // like real embedded rubble; the downhill flank is always a refusal.
      const dome = (1 - t * t) ** 0.3;
      const y = spot.baseY + (spot.topY - spot.baseY) * dome;
      if (y > best) best = y;
    }
  }
  return best;
}

/** Every spot whose centre lies inside the bounds (renderer/tools/tests). */
export function screeSpotsInBounds(
  seed: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): ScreeSpot[] {
  const out: ScreeSpot[] = [];
  for (
    let cj = Math.floor(bounds.minZ / SCREE_CELL);
    cj <= Math.ceil(bounds.maxZ / SCREE_CELL);
    cj++
  ) {
    for (
      let ci = Math.floor(bounds.minX / SCREE_CELL);
      ci <= Math.ceil(bounds.maxX / SCREE_CELL);
      ci++
    ) {
      const spot = screeSpotAt(seed, ci, cj);
      if (!spot) continue;
      if (
        spot.x >= bounds.minX &&
        spot.x < bounds.maxX &&
        spot.z >= bounds.minZ &&
        spot.z < bounds.maxZ
      ) {
        out.push(spot);
      }
    }
  }
  return out;
}
