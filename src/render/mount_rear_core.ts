// The standing rear-up: a rider who jumps while standing still on a mount that can rear (the
// Lantern Hall Destrier, MountVisualSpec.rear) sees the horse rise onto its hind legs with a
// whinny instead of the in-place hop. Every other jump, and every other mount, is untouched.
//
// Pure presentation. The sim's jump is unchanged (the entity still leaves the ground and lands
// on its normal arc); the renderer only plays the mount's rear clip and holds the mount, and the
// rider on its saddle bone, on the ground for the length of the hop. The trigger reads only the
// airborne and moving facts the renderer already derives for every rider, so another player's
// rear plays on every client that sees them, offline and online alike. No Three, no clock: the
// caller passes the frame time. Pinned by tests/mount_rear_core.test.ts.

/** The rear clip's length (build_steed.py author_rear: 36 frames at 24 fps). */
export const MOUNT_REAR_SECONDS = 1.5;

export interface MountRearState {
  /** Whether the rider was airborne last frame (the take-off edge is what starts a rear). */
  wasAirborne: boolean;
  /** When the current rear ends; -Infinity when none is playing. */
  until: number;
  /** The first frame only seeds `wasAirborne`, so a rider first seen mid-air never rears. */
  seeded: boolean;
}

export function createMountRearState(): MountRearState {
  return { wasAirborne: false, until: Number.NEGATIVE_INFINITY, seeded: false };
}

export interface MountRearInput {
  now: number;
  airborne: boolean;
  moving: boolean;
  /** This mount can rear (its spec names a rear clip). */
  canRear: boolean;
}

/** Advance one frame. `start` is true on the one frame a rear begins (play the clip and the
 *  whinny then); `active` while it runs. Moving off breaks it off at once. */
export function stepMountRear(
  s: MountRearState,
  input: MountRearInput,
): { start: boolean; active: boolean } {
  const takeOff = s.seeded && input.airborne && !s.wasAirborne;
  s.wasAirborne = input.airborne;
  s.seeded = true;
  if (!input.canRear || input.moving) {
    s.until = Number.NEGATIVE_INFINITY;
    return { start: false, active: false };
  }
  const running = input.now < s.until;
  if (takeOff && !running) {
    s.until = input.now + MOUNT_REAR_SECONDS;
    return { start: true, active: true };
  }
  return { start: false, active: running };
}

/** How far to drop the mount's root (world units, never positive) so it stays on the ground
 *  while the entity rides its jump arc above it: the rear replaces the hop. */
export function mountRearHopCancel(active: boolean, entityY: number, groundY: number): number {
  if (!active) return 0;
  const lift = entityY - groundY;
  return lift > 0 ? -lift : 0;
}
