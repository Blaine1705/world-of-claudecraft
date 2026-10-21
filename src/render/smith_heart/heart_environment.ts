// The Smith's Heart's air and light per area (the renderer's fog scene state
// and interior light rig dispatch here, the way the Ignivar raid's rooms do):
//   - the Hammer vein (the Cleft, the Gallery, the Quarry, the Slab) has
//     its own state, `smithHeartHammer`: a warm dusty quarry dusk, the low
//     sun raking in from the west down the fissure so the colossi's faces
//     catch it across the pit, a warm sky and a warmer bounce off the cut
//     stone, quarry dust thickening the distance (phase 2B);
//   - the rest of the main map keeps the storm-dusk grade it shares with the
//     Sunken Bastion (`sunkenBastion`) until the per-room phases give each
//     vein its own;
//   - the Heart (the separate final room) gets its own state,
//     `smithHeartCore`: an ember-violet night air, nearer than the storm's so
//     the chamber's crown closes round the platform, and a light rig lit from
//     BELOW (the hemisphere's ground colour is the heart's gold), a pale key
//     from high over the oculus and a warm rim on every silhouette.
// The area is the camera's (the frame resolves the fog from the camera), read
// in the slot's own frame.
//
// Three-free, DOM-free, deterministic.

import { inSmithHeartRoom, smithHeartAreaAt } from '../../sim/content/smith_heart_layout';
import { DUNGEONS, instanceOrigin, instanceSlotForZ } from '../../sim/data';

/** The fog state of the Heart. */
export const SMITH_HEART_CORE_FOG_STATE = 'smithHeartCore';

/** Is the camera at world (x, z) inside the Heart of its Smith's Heart slot? */
export function smithHeartCameraInHeart(x: number, z: number): boolean {
  const def = DUNGEONS.smith_heart;
  if (!def) return false;
  const o = instanceOrigin(def.index, instanceSlotForZ(z));
  return inSmithHeartRoom(x - o.x, z - o.z);
}

/** The fog state of the Hammer vein. */
export const SMITH_HEART_HAMMER_FOG_STATE = 'smithHeartHammer';

/** Is the camera at world (x, z) in the Hammer vein of its Smith's Heart slot? */
export function smithHeartCameraInHammer(x: number, z: number): boolean {
  const def = DUNGEONS.smith_heart;
  if (!def) return false;
  const o = instanceOrigin(def.index, instanceSlotForZ(z));
  return smithHeartAreaAt(x - o.x, z - o.z) === 'hammer';
}

/** The Hammer's air: a grey quarry dust, thin near (the pit reads crisp
 *  across) and thickening past the terraces into the fissure's far rock. It
 *  is neutral on purpose (phase 2C): a warm haze washed the whole vein to one
 *  orange-tan, so the warm stays in the sunlight and the vein's own glow. */
export const SMITH_HEART_HAMMER_FOG = { color: 0x6c6c70, near: 90, far: 600 } as const;

/** The Hammer's light rig (phase 2C, the warm-key cool-fill grade of the
 *  Wildheart Basin): a strong warm low key from the south-west (the dusk
 *  down the fissure, raking the terraces), and a COOL slate-violet sky fill
 *  over a warm grey ground bounce, so every face turned from the sun falls
 *  to a cool slate-violet shadow (never black, never a saturated blue: the
 *  painted world's L1) and the lit faces, the vein's ochre glow, the geodes
 *  and the colossi's warm rims read against it. Phase 2D lifted the fill:
 *  under 2C's the fissure's shaded rock sank to a near-black navy that ate
 *  every form (the descent's foreground, the Gallery's walls). */
export const SMITH_HEART_HAMMER_LIGHT = {
  sun: 2.7,
  hemi: 2.0,
  env: 0.15,
  rim: 1.6,
  sunColor: 0xffd3a0,
  hemiSky: 0x9a96aa,
  hemiGround: 0x665a52,
  rimColor: 0xffa858,
  /** Low in the south-west (from the ground toward it): it rakes across
   *  the east terraces as the raid enters (every bench and block throws its
   *  shadow), lights the Vigil from the side and rims the Bearer from
   *  behind. */
  keyDirection: [-0.5, 0.62, -0.6] as const,
} as const;

/** The Heart's fog: an ember-violet dark, pushed back past the platform and
 *  its chasm so the chains read to the crown, closing before the crown's far
 *  side. */
export const SMITH_HEART_CORE_FOG = { color: 0x1c1424, near: 80, far: 520 } as const;

/** The Heart's light rig. */
export const SMITH_HEART_CORE_LIGHT = {
  sun: 1.5,
  hemi: 0.9,
  env: 0.26,
  rim: 2.3,
  sunColor: 0xffe2b8,
  hemiSky: 0x3a2e58,
  /** The heart's gold from below. */
  hemiGround: 0x8a5424,
  rimColor: 0xffc880,
  /** High over the oculus, a little north-east (from the ground toward it). */
  keyDirection: [0.25, 0.92, 0.3] as const,
} as const;
