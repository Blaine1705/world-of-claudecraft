// The Old Beacon's outside stair: a plank walkway winding most of one turn
// around the lighthouse from the headland lawn up to a gallery ring, with a
// short bridge joining stair top to ring. WALKABLE raised ground, the
// Sowfield grandstand idiom: groundHeight ADDS beaconSpiralLift, and
// render/gale_features.ts draws the plank geometry from the same samples,
// so the deck the player stands on is exactly the deck they see. The
// tower's own column is an unwalkable core plug (a sheer terrain riser the
// climb gate refuses), which is also what keeps players from walking
// through the lighthouse at ground level. Pure leaf: deterministic, no
// SimContext, tested directly by tests/beacon_spiral.test.ts.

export const BEACON_SPIRAL = {
  x: 498,
  z: 308,
  /** the tower column: an unwalkable plug out to this radius */
  coreR: 2.55,
  /** the plug's sheer height (never stood on, only refused) */
  coreH: 45,
  /** the gallery ring: flat deck from coreR out to this radius */
  ringR: 4.7,
  /** deck height of the gallery ring (and the stair's top) */
  deck: 14,
  /** the stair band: inner and outer radius of the winding walkway */
  stairIn: 5.1,
  stairOut: 7.3,
  /** where the stair leaves the lawn (radians, atan2(dx, dz) convention) */
  a0: 2.4,
  /** how far around the stair winds (under one full turn: no self-overlap) */
  sweep: Math.PI * 2 * 0.85,
  /** the bridge joining stair top to ring: arc half-width in radians */
  bridgeArc: 0.42,
} as const;

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Deck height along the stair at progress t in [0, 1] (0 = lawn end). */
export function beaconStairHeight(t: number): number {
  const s = BEACON_SPIRAL;
  // ease the first stretch so the stair foot meets the lawn flush
  return s.deck * Math.min(1, t / 0.96) * smooth01(t * 8 + 0.04);
}

/**
 * The raised-deck lift at (x, z): 0 away from the Beacon, the plug height
 * over the tower column, the deck height on the ring, bridge, and stair.
 */
export function beaconSpiralLift(x: number, z: number): number {
  const s = BEACON_SPIRAL;
  const dx = x - s.x;
  const dz = z - s.z;
  const gate = s.stairOut + 0.6;
  const d2 = dx * dx + dz * dz;
  if (d2 >= gate * gate) return 0;
  const d = Math.sqrt(d2);
  if (d < s.coreR) return s.coreH; // the tower column
  if (d < s.ringR) return s.deck; // the gallery ring
  // unwrapped stair angle from the foot, 0..2PI
  let a = Math.atan2(dx, dz) - s.a0;
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  // the bridge: a short flat spur joining the stair top to the ring
  if (d < s.stairIn + 0.2 && Math.abs(a - s.sweep) < s.bridgeArc) return s.deck;
  // the stair band, winding up across the sweep
  if (d <= s.stairOut && d >= s.stairIn - 0.15 && a <= s.sweep) {
    return beaconStairHeight(a / s.sweep);
  }
  return 0;
}
