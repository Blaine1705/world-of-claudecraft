// The indoor chase camera on screen: the registry of walk-in interiors and the per-frame
// clamp the renderer's updateCamera calls once (the decisions are interior_camera_core.ts).
//
// A building registers its air when it is built (registerCameraInterior) and drops it when
// torn down. Each frame, when the player's eye stands in a registered interior, the drawn
// camera is pulled in along the chase ray to stay in that air (a pull-in lands the same
// frame, a release eases out), and the look point is brought back to the eye when the
// lagged pivot would sit across a wall. Where the ray is cramped (a player against the stair
// tower's wall, backed into a room's corner), the camera glides to the nearest comfortable
// framing, up over the obstruction or round it along the wall, rather than sitting in the
// player's head, and glides back as the view clears. Walking out releases the last shortened boom over at
// most INTERIOR_RELEASE_MAX_SEC; outdoors with no release pending nothing here touches the
// camera. The requested yaw, pitch and distance stay owned by the camera stack: only the
// drawn position moves (the pinned exception in tests/graphics_overhaul_integration.test.ts).
//
// Draw-time shake (the Fiesta trauma jitter and the warrior's impact kick) is applied after
// updateCamera, so the renderer re-checks the shaken pose just before the draw
// (constrainInteriorCameraDraw) and puts the unclamped shaken pose back after it
// (restoreInteriorCameraDraw), so the shake's own subtraction undoes exactly its offset.
//
// A corner no framing escapes (the camera within SELF_HIDE_BOOM of the eye) cuts to the
// player's eyes, looking out the way the requested camera looks, and hides the player's own
// body for the frame (hideSelfInCloseCamera), the classic MMO first-person cut.
//
// Nameplates: while the player is indoors, a plate on a body outside the interior draws
// only when the camera sees it through an opening (interiorHidesNameplate, the nameplate
// painter's gate), so the plates of the mobs outside never float through the walls.
//
// Per frame: a few slab tests, no allocation.

import type * as THREE from 'three';
import { BOOM_SNAP_DIST } from './camera_boom_core';
import {
  type CameraInterior,
  chooseInteriorFraming,
  frameBoomInto,
  INTERIOR_RELEASE_MAX_SEC,
  interiorCameraPadding,
  interiorContains,
  interiorHoldsEye,
  interiorSeesOut,
  interiorSegmentFraction,
  stepInteriorBoom,
  stepInteriorFraming,
} from './interior_camera_core';

/** The eye (the look point) stands this high over the feet (renderer.ts eyeY). */
const EYE_OVER_FEET = 2.0;
/** A body's plate test point stands this high over its feet (the chest, not the plate). */
const BODY_OVER_FEET = 1.0;
/** Closer than this to the look point after every framing (a corner no framing escapes),
 *  the camera cuts to the player's eyes and the player's own body hides; it draws back out
 *  past SELF_SHOW_BOOM (hysteresis: no flicker at the edge). */
export const SELF_HIDE_BOOM = 1.5;
export const SELF_SHOW_BOOM = 1.8;
/** In the cut to the eyes, the aim point stands this far ahead of the eye. */
const FIRST_PERSON_AIM = 4;
/** Farther than this from the pose updateCamera left, the drawn camera is not the chase
 *  camera (the editor's free camera): the draw-time re-check leaves it alone. */
const DRAW_SHIFT_MAX = 2.5;

const interiors: CameraInterior[] = [];
/** Scratch for a lifted boom (no allocation per frame). */
const scratch = { x: 0, y: 0, z: 0 };

/** Register (or replace, by id) a building's interior; the returned function drops it. */
export function registerCameraInterior(vol: CameraInterior): () => void {
  unregisterCameraInterior(vol.id);
  interiors.push(vol);
  return () => unregisterCameraInterior(vol.id);
}

export function unregisterCameraInterior(id: string): void {
  const i = interiors.findIndex((v) => v.id === id);
  if (i >= 0) interiors.splice(i, 1);
  if (state.active?.id === id) state.active = null;
}

const state = {
  /** The interior the player's eye stands in this frame. */
  active: null as CameraInterior | null,
  /** The drawn boom length along the chase ray, from `start`. */
  dist: 0,
  /** The eased framing of a cramped spot: the lift (radians over the requested elevation)
   *  and the swing (radians of yaw round the look point). */
  lift: 0,
  swing: 0,
  /** Seconds of release left after walking out (0: free). */
  release: 0,
  /** The camera has cut to the player's eyes (a corner no framing escapes). */
  firstPerson: false,
  pad: 0.3,
  startX: 0,
  startY: 0,
  startZ: 0,
  lastSelfX: Number.NaN,
  lastSelfY: 0,
  lastSelfZ: 0,
  /** The pose updateCamera left (the draw-time re-check's anchor). */
  poseX: 0,
  poseY: 0,
  poseZ: 0,
  /** The shaken pose before the draw-time re-check moved it. */
  drawnX: 0,
  drawnY: 0,
  drawnZ: 0,
  drawnSaved: false,
};

function interiorAt(x: number, y: number, z: number): CameraInterior | null {
  for (const vol of interiors) if (interiorHoldsEye(vol, x, y, z)) return vol;
  return null;
}

/**
 * Keep the chase camera inside the interior the player stands in. `camera.position` is the
 * desired camera (updateCamera's one pose) and `look` its look point, both adjusted in
 * place; `self` is the avatar's display position (its feet).
 */
export function clampChaseCameraToInterior(
  camera: THREE.PerspectiveCamera,
  look: THREE.Vector3,
  self: THREE.Vector3,
  dt: number,
  reducedMotion: boolean,
): void {
  const pos = camera.position;
  const teleported =
    Number.isNaN(state.lastSelfX) ||
    Math.hypot(self.x - state.lastSelfX, self.y - state.lastSelfY, self.z - state.lastSelfZ) >
      BOOM_SNAP_DIST;
  state.lastSelfX = self.x;
  state.lastSelfY = self.y;
  state.lastSelfZ = self.z;
  const eyeX = self.x;
  const eyeY = self.y + EYE_OVER_FEET;
  const eyeZ = self.z;
  const was = state.active;
  const vol = interiorAt(eyeX, eyeY, eyeZ);
  state.active = vol;
  if (!vol) {
    state.firstPerson = false;
    // walked out: ease the last shortened boom back to the requested one, briefly
    if (was) state.release = INTERIOR_RELEASE_MAX_SEC;
    if (reducedMotion || teleported) state.release = 0;
    if (state.release <= 0) return;
    state.release = Math.max(0, state.release - Math.max(0, dt));
    const len = pos.distanceTo(look);
    state.dist = stepInteriorBoom(state.dist, len, dt, state.release === 0);
    state.lift = stepInteriorFraming(state.lift, 0, dt, state.release === 0);
    state.swing = stepInteriorFraming(state.swing, 0, dt, state.release === 0);
    if (
      len < 1e-9 ||
      (len - state.dist < 1e-3 && Math.abs(state.lift) < 1e-3 && Math.abs(state.swing) < 1e-3)
    ) {
      state.release = 0;
      state.lift = 0;
      state.swing = 0;
      return;
    }
    const d = frameBoomInto(
      scratch,
      pos.x - look.x,
      pos.y - look.y,
      pos.z - look.z,
      state.lift,
      state.swing,
    );
    const f = state.dist / len;
    pos.set(look.x + d.x * f, look.y + d.y * f, look.z + d.z * f);
    return;
  }
  state.release = 0;
  state.pad = interiorCameraPadding(camera.near, camera.fov, camera.aspect);
  // the lagged (or shoulder-shifted) look point must stand in the air on the eye's side of
  // every wall; otherwise the ray starts at the eye, the whole boom shifted with it
  let sx = look.x;
  let sy = look.y;
  let sz = look.z;
  if (
    !interiorContains(vol, sx, sy, sz) ||
    interiorSegmentFraction(vol, eyeX, eyeY, eyeZ, sx, sy, sz, 0) < 1
  ) {
    pos.set(pos.x + eyeX - sx, pos.y + eyeY - sy, pos.z + eyeZ - sz);
    look.set(eyeX, eyeY, eyeZ);
    sx = eyeX;
    sy = eyeY;
    sz = eyeZ;
  }
  state.startX = sx;
  state.startY = sy;
  state.startZ = sz;
  let dx = pos.x - sx;
  let dy = pos.y - sy;
  let dz = pos.z - sz;
  const len = Math.hypot(dx, dy, dz);
  // the requested view's direction (the cut to the eyes looks out along it)
  const aimX = len > 1e-9 ? -dx / len : 0;
  const aimY = len > 1e-9 ? -dy / len : 0;
  const aimZ = len > 1e-9 ? -dz / len : 0;
  const pad = state.pad;
  // cramped (a player against the tower's wall on the stair, backed into a corner): the
  // least departure from the requested view that frames the player comfortably, a lift over
  // what cramps it or a swing along the wall, eased in and out
  const choice = chooseInteriorFraming(vol, sx, sy, sz, dx, dy, dz, pad, state.swing);
  let allowed = choice.boom;
  const immediate = reducedMotion || teleported || was !== vol;
  state.lift = stepInteriorFraming(state.lift, choice.lift, dt, immediate);
  state.swing = stepInteriorFraming(state.swing, choice.swing, dt, immediate);
  if (Math.abs(state.lift) > 1e-4 || Math.abs(state.swing) > 1e-4) {
    frameBoomInto(scratch, dx, dy, dz, state.lift, state.swing);
    dx = scratch.x;
    dy = scratch.y;
    dz = scratch.z;
    allowed = len * interiorSegmentFraction(vol, sx, sy, sz, sx + dx, sy + dy, sz + dz, pad);
  }
  state.dist = stepInteriorBoom(state.dist, allowed, dt, immediate);
  const f = len > 1e-9 ? Math.min(1, state.dist / len) : 0;
  // a corner no framing escapes: the classic cut to the player's eyes, looking out the way
  // the requested camera looks (never a screen filled with the back of a head)
  const boom = f * len;
  state.firstPerson = state.firstPerson ? boom < SELF_SHOW_BOOM : boom < SELF_HIDE_BOOM;
  if (state.firstPerson && len > 1e-9) {
    pos.set(sx, sy, sz);
    const k = FIRST_PERSON_AIM;
    look.set(sx + aimX * k, sy + aimY * k, sz + aimZ * k);
  } else {
    pos.set(sx + dx * f, sy + dy * f, sz + dz * f);
  }
  state.poseX = pos.x;
  state.poseY = pos.y;
  state.poseZ = pos.z;
}

/** Hide the player's own body (its view group) while the indoor camera has cut to the
 *  player's eyes. Called once a frame after the camera update; the view's own visibility
 *  pass shows it again next frame, so outdoors (or once the camera draws back) nothing
 *  stays hidden. The camera argument is the drawn one (unused: the cut is decided in the
 *  clamp), kept so the call reads at the renderer's one site. */
export function hideSelfInCloseCamera(
  group: THREE.Object3D | undefined,
  _camera: THREE.PerspectiveCamera,
): void {
  if (state.active && state.firstPerson && group) group.visible = false;
}

/** Re-check the shaken camera just before the draw (after every draw-time shake). */
export function constrainInteriorCameraDraw(camera: THREE.PerspectiveCamera): void {
  state.drawnSaved = false;
  const vol = state.active;
  if (!vol) return;
  const pos = camera.position;
  const sx = pos.x - state.poseX;
  const sy = pos.y - state.poseY;
  const sz = pos.z - state.poseZ;
  if (sx * sx + sy * sy + sz * sz > DRAW_SHIFT_MAX * DRAW_SHIFT_MAX) return;
  const f = interiorSegmentFraction(
    vol,
    state.startX,
    state.startY,
    state.startZ,
    pos.x,
    pos.y,
    pos.z,
    state.pad,
  );
  if (f >= 1) return;
  state.drawnX = pos.x;
  state.drawnY = pos.y;
  state.drawnZ = pos.z;
  state.drawnSaved = true;
  pos.set(
    state.startX + (pos.x - state.startX) * f,
    state.startY + (pos.y - state.startY) * f,
    state.startZ + (pos.z - state.startZ) * f,
  );
}

/** Put the shaken pose back after the draw (before the shakes subtract their offsets). */
export function restoreInteriorCameraDraw(camera: THREE.PerspectiveCamera): void {
  if (!state.drawnSaved) return;
  state.drawnSaved = false;
  camera.position.set(state.drawnX, state.drawnY, state.drawnZ);
}

/**
 * Whether the plate of a body whose feet stand at (x, y, z), its plate at `plateY`, hides
 * this frame: the player is indoors, the body is not, and the camera does not see it
 * through an opening onto the world.
 */
export function interiorHidesNameplate(
  camera: THREE.PerspectiveCamera,
  x: number,
  y: number,
  z: number,
  plateY: number,
): boolean {
  const vol = state.active;
  if (!vol) return false;
  if (interiorContains(vol, x, y + BODY_OVER_FEET, z)) return false;
  const c = camera.position;
  return !interiorSeesOut(vol, c.x, c.y, c.z, x, plateY, z);
}

/** The interior the player's eye stood in at the last camera update (null outdoors). */
export function activeCameraInterior(): CameraInterior | null {
  return state.active;
}

/** Whether the camera update has run (a building's own cutaway may follow the clamp's
 *  indoor verdict from then on; before it, as in a test, the building decides alone). */
export function interiorCameraRunning(): boolean {
  return !Number.isNaN(state.lastSelfX);
}

export const interiorCameraInternalsForTest = {
  reset(): void {
    interiors.length = 0;
    state.active = null;
    state.dist = 0;
    state.lift = 0;
    state.swing = 0;
    state.release = 0;
    state.lastSelfX = Number.NaN;
    state.drawnSaved = false;
    state.firstPerson = false;
  },
  interiors: (): readonly CameraInterior[] => interiors,
  state: () => state,
};
