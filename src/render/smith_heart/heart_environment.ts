// The Smith's Heart's air and light per area (the renderer's fog scene state
// and interior light rig dispatch here, the way the Ignivar raid's rooms do):
//   - the main map keeps the storm-dusk grade it shares with the Sunken
//     Bastion (`sunkenBastion`) until the per-room phases give each vein its
//     own;
//   - the Heart (the separate final room) gets its own state,
//     `smithHeartCore`: an ember-violet night air, nearer than the storm's so
//     the chamber's crown closes round the platform, and a light rig lit from
//     BELOW (the hemisphere's ground colour is the heart's gold), a pale key
//     from high over the oculus and a warm rim on every silhouette.
// The area is the camera's (the frame resolves the fog from the camera), read
// in the slot's own frame.
//
// Three-free, DOM-free, deterministic.

import { inSmithHeartRoom } from '../../sim/content/smith_heart_layout';
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
