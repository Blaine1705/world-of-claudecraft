// The Shear itself: the headland Flightmaster Zephyr launches from. The
// Windrider Slalom used to start from a stone flight tower standing on the
// flat coastal shelf at (450, 520) (glider_tower_layout.ts, a walk-surface
// lift the render terrain never saw). World quests round 2 replaced the tower
// with a real hill and a launch wharf on its crest (glider_wharf_layout.ts):
// this module is the hill, an authored regrade applied to the finished height
// like the Farshore shipwreck apron (farshore_shipwreck_shore.ts), so mesh,
// movement and every height query agree.
//
// Shape: a small flat crest (the plateau) at exactly the old deck height less
// the plank lift, so the wharf's planks sit at Y = 74 and all three authored
// courses (rings, wind tunnels, medal times) stay valid untouched. The skirt is
// deliberately lopsided. South, where the pier points and the opening rings
// fly out, the face is steep so the ground falls away under the glider the
// moment it leaves the planks (glider_flight.ts ends a run on terrain contact).
// East it drops to the sea. North and west the slopes are gentle: the
// Wickharbor to Wreckfields road climbs the crest from the north and leaves
// down the south-west under PLAYER_MAX_CLIMB_SLOPE
// (tests/glider_wharf_layout.test.ts walks it). The Shear reads as the sea
// cliff its name and Zephyr's greeting describe.
import { GALE_DECK_LIFT } from './gale_harbor';

/** The plank plane of the launch wharf: the flight tower's old deck height. */
export const GLIDER_WHARF_DECK_Y = 74;

export const GALE_LAUNCH_KNOLL = {
  x: 449,
  z: 512,
  /** The crest is flat out to this radius. */
  plateauRadius: 10,
  /** Crest terrain height: the wharf's shore root sits here, so its planks land on the deck plane. */
  crestHeight: GLIDER_WHARF_DECK_Y - GALE_DECK_LIFT,
  /** Skirt widths beyond the plateau, per compass side (blended by direction). */
  // North stops short of the Wickharbor shore (herb_galecrest_2's old spot at
  // 406,412 must stay a wet one: tests/gather_node_placement.test.ts).
  skirt: { east: 35, west: 130, north: 80, south: 55 },
} as const;

/** The knoll's outer radius in the direction (ex, ez) (a unit vector). */
export function galeLaunchKnollOuterRadius(ex: number, ez: number): number {
  const ax = Math.abs(ex);
  const az = Math.abs(ez);
  const total = ax + az || 1;
  const { skirt } = GALE_LAUNCH_KNOLL;
  const alongX = ex >= 0 ? skirt.east : skirt.west;
  const alongZ = ez >= 0 ? skirt.south : skirt.north;
  return GALE_LAUNCH_KNOLL.plateauRadius + (ax * alongX + az * alongZ) / total;
}

/** Bounding radius for the cheap early-out. */
const KNOLL_REACH =
  GALE_LAUNCH_KNOLL.plateauRadius +
  Math.max(
    GALE_LAUNCH_KNOLL.skirt.east,
    GALE_LAUNCH_KNOLL.skirt.west,
    GALE_LAUNCH_KNOLL.skirt.north,
    GALE_LAUNCH_KNOLL.skirt.south,
  );

/** The finished height with the launch knoll raised into it. Raise only: ground
 *  already above the crest (none on the shelf today) is left alone. */
export function applyGaleLaunchKnoll(x: number, z: number, h: number): number {
  const dx = x - GALE_LAUNCH_KNOLL.x;
  const dz = z - GALE_LAUNCH_KNOLL.z;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= KNOLL_REACH * KNOLL_REACH) return h;
  const distance = Math.sqrt(distanceSq);
  const crest = GALE_LAUNCH_KNOLL.crestHeight;
  if (h >= crest) return h;
  if (distance <= GALE_LAUNCH_KNOLL.plateauRadius) return crest;
  const outer = galeLaunchKnollOuterRadius(dx / distance, dz / distance);
  if (distance >= outer) return h;
  const t =
    (distance - GALE_LAUNCH_KNOLL.plateauRadius) / (outer - GALE_LAUNCH_KNOLL.plateauRadius);
  const weight = 1 - t * t * (3 - 2 * t);
  return h + (crest - h) * weight;
}
