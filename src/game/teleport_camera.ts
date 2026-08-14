// Snap the chase camera behind a teleported player.
//
// A walked frame moves the player a fraction of a yard and the camera yaw is
// the player's own business. A TELEPORT (the ferry bells, portals, dungeon
// doors, hearthstone) sets the player down facing whatever the landing
// authored, and leaving the camera pointed wherever it was makes the landing
// disorienting: the Proving Shore arrival deliberately faces Warden Tam's
// Gauntlet gate, and a stale yaw would have a brand-new player staring at
// open sea. Snapping the yaw to the landed facing shows them exactly what
// the landing meant them to see.
//
// The teleport test reuses zone_transition.ts's displacement classifier: the
// same per-frame threshold that decides a blocking loading screen decides a
// camera snap, so the two can never disagree about what a teleport is.
//
// Pure and host-agnostic: the caller (main.ts's frame loop, which already
// measures per-frame displacement for zone warmup) applies the returned yaw.

import { TELEPORT_DISPLACEMENT_YD } from './zone_transition';

/** The camera yaw to use this frame: the player's landed facing after a
 *  teleport-scale displacement, the current yaw otherwise. */
export function teleportCameraYaw(
  displacementYd: number,
  landedFacing: number,
  currentYaw: number,
): number {
  return displacementYd > TELEPORT_DISPLACEMENT_YD ? landedFacing : currentYaw;
}
