// The Old Beacon's outside stair: a stone walkway winding up the lighthouse
// with its treads butted straight against the tower column (no gap between
// stair and drum), rising most of a turn from the headland lawn to a wide
// C-shaped balcony that keeps hugging the tower where the stair tops out.
// WALKABLE raised ground, the Sowfield grandstand idiom: groundHeight ADDS
// beaconSpiralLift, and render/gale_features.ts draws the slab geometry from
// the same samples, so the deck the player stands on is exactly the deck
// they see. The tower's own column is an unwalkable core plug (a sheer
// terrain riser the climb gate refuses), which is also what keeps players
// from walking through the lighthouse at ground level. Pure leaf:
// deterministic, no SimContext, tested directly by tests/beacon_spiral.test.ts.

export const BEACON_SPIRAL = {
  x: 498,
  z: 308,
  /** the tower column: an unwalkable plug out to this radius */
  coreR: 2.9,
  /** the plug's sheer height (never stood on, only refused) */
  coreH: 45,
  /** deck height of the balcony (and the stair's top) */
  deck: 15,
  /** stair outer radius; the inner edge is the column itself (coreR) */
  stairOut: 6.2,
  /** where the stair leaves the lawn (radians, atan2(dx, dz) convention) */
  a0: 2.4,
  /** how far around the stair winds before the balcony takes over */
  sweep: Math.PI * 2 * 0.62,
  /** the C balcony: flat continuation past the stair top, hugging the tower */
  balconyArc: Math.PI * 2 * 0.34,
  /** balcony outer radius (wider than the stair band) */
  balconyOut: 6.8,
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
 * over the tower column, the deck height on the balcony, the winding rise
 * on the stair band.
 */
export function beaconSpiralLift(x: number, z: number): number {
  const s = BEACON_SPIRAL;
  const dx = x - s.x;
  const dz = z - s.z;
  const gate = s.balconyOut + 0.6;
  const d2 = dx * dx + dz * dz;
  if (d2 >= gate * gate) return 0;
  const d = Math.sqrt(d2);
  if (d < s.coreR) return s.coreH; // the tower column
  // unwrapped stair angle from the foot, 0..2PI
  let a = Math.atan2(dx, dz) - s.a0;
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  // the C balcony: flat at deck height, wrapping on from the stair top
  // (the arc past sweep + balconyArc stays open: the C's mouth)
  if (a > s.sweep && a <= s.sweep + s.balconyArc && d <= s.balconyOut) return s.deck;
  // the stair band: column face out to stairOut, winding up across the sweep
  if (a <= s.sweep && d <= s.stairOut) {
    return beaconStairHeight(a / s.sweep);
  }
  return 0;
}
