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
// an ellipse per quadrant and deliberately lopsided. South, where the pier
// points and the opening rings fly out, the face is a short cliff so the
// ground falls away under the glider the moment it leaves the planks
// (glider_flight.ts ends a run on terrain contact) and the stables hamlet on
// the shelf below (content/galecrest.ts: the riding paddock, the homes and
// the barn along the Wreckfields road) keeps the flat ground it was built on.
// East it drops to the sea. North the slope is a walk: the spur road up to
// the wharf climbs it under PLAYER_MAX_CLIMB_SLOPE, while the Wickharbor to
// Wreckfields road itself passes around the western foot
// (tests/glider_wharf_layout.test.ts walks both). The Shear reads as the sea
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
  /** Skirt widths beyond the plateau, per compass side (an ellipse per quadrant). */
  // North stops short of the Wickharbor shore (herb_galecrest_2's old spot at
  // 406,412 must stay a wet one: tests/gather_node_placement.test.ts). South
  // ends above the hamlet's shelf (the paddock's north fence is at z 546).
  // West ends short of the Wreckfields road's bypass and the cliff road up
  // to the Mirror Tarn.
  skirt: { east: 35, west: 80, north: 100, south: 26 },
  /** The stables' riding-lesson paddock (content/mounts.ts RACE_RING plus its
   *  fences) sits at the knoll's south-western foot. The regrade is carved out
   *  of the fenced box and feathers to nothing across `feather` yards around
   *  it, so the race ring stays on the flat shelf it was authored on and the
   *  face above it is the sea-cliff drop the name describes. */
  paddock: { xMin: 330, xMax: 426, zMin: 546, zMax: 588, feather: 14 },
} as const;

/** 0 inside the paddock box, 1 at `feather` yards out, smooth between. */
function paddockClearance(x: number, z: number): number {
  const { paddock } = GALE_LAUNCH_KNOLL;
  const dx = Math.max(paddock.xMin - x, 0, x - paddock.xMax);
  const dz = Math.max(paddock.zMin - z, 0, z - paddock.zMax);
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance >= paddock.feather) return 1;
  const t = distance / paddock.feather;
  return t * t * (3 - 2 * t);
}

/** The knoll's outer radius in the direction (ex, ez) (a unit vector): the
 *  ellipse through the two compass skirts of that quadrant, so a short side
 *  stays short right up to the diagonal instead of bleeding into it. */
export function galeLaunchKnollOuterRadius(ex: number, ez: number): number {
  const { skirt } = GALE_LAUNCH_KNOLL;
  const alongX = ex >= 0 ? skirt.east : skirt.west;
  const alongZ = ez >= 0 ? skirt.south : skirt.north;
  const inverse = Math.sqrt((ex * ex) / (alongX * alongX) + (ez * ez) / (alongZ * alongZ)) || 1;
  return GALE_LAUNCH_KNOLL.plateauRadius + 1 / inverse;
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
  const weight = (1 - t * t * (3 - 2 * t)) * paddockClearance(x, z);
  return h + (crest - h) * weight;
}
