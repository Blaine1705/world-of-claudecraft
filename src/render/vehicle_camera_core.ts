import type { CannonField } from '../sim/types';
import type { CameraDirectorPose } from './camera_director_core';

export interface VehicleCameraFrame extends CameraDirectorPose {
  x: number;
  y: number;
  z: number;
}
export interface VehicleCameraTarget {
  field: CannonField;
  x: number;
  y: number;
  z: number;
}
export interface VehicleCameraState {
  weight: number;
  target: VehicleCameraTarget | null;
  readonly frame: VehicleCameraFrame;
}

export function createVehicleCamera(): VehicleCameraState {
  return { weight: 0, target: null, frame: { yaw: 0, pitch: 0, dist: 0, x: 0, y: 0, z: 0 } };
}

/** Pure composition over the normal orbit; never changes the player's saved camera.
 * Fit the complete field AND station, including perspective foreshortening and
 * a margin for the bottom action bar. Portrait gets distance, not a cropped lane.
 * Retain the last target during the 600ms exit so every exit path restores smoothly. */
export function stepVehicleCamera(
  state: VehicleCameraState,
  live: VehicleCameraFrame,
  target: VehicleCameraTarget | null,
  aspect: number,
  verticalFovDegrees: number,
  dt: number,
  reducedMotion: boolean,
): VehicleCameraFrame {
  if (target) state.target = target;
  const delta = Number.isFinite(dt) ? Math.max(0, dt) / 0.6 : 0;
  state.weight = reducedMotion
    ? target
      ? 1
      : 0
    : Math.max(0, Math.min(1, state.weight + (target ? delta : -delta)));
  const out = state.frame;
  Object.assign(out, live);
  const last = state.target;
  if (!last || state.weight === 0) {
    state.target = target;
    return out;
  }
  const minX = Math.min(last.field.minX, last.x),
    maxX = Math.max(last.field.maxX, last.x);
  const minZ = Math.min(last.field.minZ, last.z),
    maxZ = Math.max(last.field.maxZ, last.z);
  const pitch = (70 * Math.PI) / 180;
  const halfWidth = (maxX - minX) / 2 + 4,
    halfDepth = (maxZ - minZ) / 2 + 4;
  const tanV = Math.tan((Math.max(20, Math.min(100, verticalFovDegrees)) * Math.PI) / 360);
  const tanH = tanV * Math.max(0.2, aspect);
  const dist =
    Math.max(halfWidth / tanH, (halfDepth * Math.sin(pitch)) / tanV) +
    halfDepth * Math.cos(pitch) +
    12;
  const w = state.weight * state.weight * (3 - 2 * state.weight);
  const yawDelta = Math.atan2(Math.sin(Math.PI - live.yaw), Math.cos(Math.PI - live.yaw));
  out.yaw += yawDelta * w;
  out.pitch += (pitch - live.pitch) * w;
  out.dist += (dist - live.dist) * w;
  out.x += ((minX + maxX) / 2 - live.x) * w;
  out.y += (last.y - live.y) * w;
  out.z += ((minZ + maxZ) / 2 - live.z) * w;
  return out;
}
