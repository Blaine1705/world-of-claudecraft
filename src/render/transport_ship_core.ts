// Pure per-frame decisions for a moored transport ship (render/transport_ship.ts is
// the Three.js painter): which level of detail draws, whether the idle clip runs,
// and whether a sail sits between the player's eye and the chase camera. Three-,
// DOM- and i18n-free, so tests import it directly.
//
// Everything here is cosmetic (graphics settings stay gameplay-neutral): the deck
// collision never changes with the level of detail, and a sail that fades while it
// blocks the camera is exactly the building occluder fade applied to cloth.

/** Camera distance (yards) at which each level hands over to the next:
 *  LOD0 (full) below the first, LOD1 (reduced) below the second, LOD2
 *  (silhouette) below the third, LOD3 (far silhouette) beyond. */
export const TRANSPORT_SHIP_LOD_DISTANCES: readonly number[] = [80, 180, 380];

/** The low graphics tier hands over sooner (cheaper materials, smaller budget). */
export const TRANSPORT_SHIP_LOW_TIER_SCALE = 0.65;

/** A level only switches back once the camera is this fraction past the edge,
 *  so a camera parked on a threshold never flickers between two levels. */
export const TRANSPORT_SHIP_LOD_HYSTERESIS = 0.08;

/** The idle clip (bob, sail breath, flag ripple) runs only on the full model and
 *  within this range: past it the motion is sub-pixel. */
export const TRANSPORT_SHIP_ANIMATE_RANGE = 110;

/** Beyond the fog's far plane plus this margin the whole ship is hidden. */
export const TRANSPORT_SHIP_FOG_MARGIN = 40;

/**
 * The level of detail for a camera `distance` yards away, given the level drawn
 * last frame (`current`, -1 for none yet). Moving outward switches at the edge;
 * moving back inward switches only once `TRANSPORT_SHIP_LOD_HYSTERESIS` inside it.
 */
export function transportShipLod(distance: number, current: number, lowTier = false): number {
  const scale = lowTier ? TRANSPORT_SHIP_LOW_TIER_SCALE : 1;
  const edges = TRANSPORT_SHIP_LOD_DISTANCES;
  let raw: number = edges.length;
  for (let i = 0; i < edges.length; i++) {
    if (distance < edges[i] * scale) {
      raw = i;
      break;
    }
  }
  if (current < 0 || raw >= current) return raw;
  // Moving to a finer level: require the camera to clear the edge by the margin.
  const edge = edges[raw] * scale;
  return distance < edge * (1 - TRANSPORT_SHIP_LOD_HYSTERESIS) ? raw : current;
}

/** Whether the idle clip advances this frame. Reduced motion freezes it. */
export function transportShipAnimates(
  lod: number,
  distance: number,
  reducedMotion: boolean,
): boolean {
  return !reducedMotion && lod === 0 && distance < TRANSPORT_SHIP_ANIMATE_RANGE;
}

/** Whether the ship draws at all this frame (fog culling). */
export function transportShipVisible(distance: number, fogFar: number): boolean {
  return distance < fogFar + TRANSPORT_SHIP_FOG_MARGIN;
}

/** An axis-aligned box in the ship's own frame (yards). */
export interface ShipLocalBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** A world point in the ship frame: undo the placement (position, then yaw). */
export function toShipLocal(
  x: number,
  y: number,
  z: number,
  shipX: number,
  shipY: number,
  shipZ: number,
  shipRot: number,
  out: { x: number; y: number; z: number },
): void {
  const dx = x - shipX;
  const dz = z - shipZ;
  const c = Math.cos(shipRot);
  const s = Math.sin(shipRot);
  out.x = dx * c - dz * s;
  out.y = y - shipY;
  out.z = dx * s + dz * c;
}

/** Slab state shared by the three axis steps (module scratch: no per-call allocation). */
const slab = { t0: 0, t1: 1 };

function clipSlab(p: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
  let near = (lo - p) / d;
  let far = (hi - p) / d;
  if (near > far) {
    const t = near;
    near = far;
    far = t;
  }
  if (near > slab.t0) slab.t0 = near;
  if (far < slab.t1) slab.t1 = far;
  return slab.t0 <= slab.t1;
}

/**
 * Whether the segment from a to b crosses `box` (the slab test). An endpoint
 * inside the box counts. Used to fade a sail that stands between the player's
 * eye and the chase camera. Allocation-free: it runs per sail per frame.
 */
export function segmentHitsShipBox(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  box: ShipLocalBox,
): boolean {
  slab.t0 = 0;
  slab.t1 = 1;
  return (
    clipSlab(ax, bx - ax, box.minX, box.maxX) &&
    clipSlab(ay, by - ay, box.minY, box.maxY) &&
    clipSlab(az, bz - az, box.minZ, box.maxZ)
  );
}
