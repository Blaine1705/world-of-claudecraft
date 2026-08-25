// The local player's DISPLAY pose, one frame at a time: the intent-driven
// predictor while it owns the position, the lead-smoothed authoritative
// interpolation otherwise, and the one-time offset that hands the two over
// without a camera step. Pure ({x,y,z} in and out, no Three), so the renderer
// is a thin consumer and a headless latency harness can drive the same math.

import type { Entity } from '../sim/types';
import {
  type SelfMotionFrame,
  SelfMotionPredictor,
  updateSelfRenderFallback,
  type Vec3Like,
} from './self_motion';

// Decay rate of the one-time offset captured when the self-motion predictor
// takes over from the lead-smoothing path (gone in ~0.3 s, no camera step).
const SELF_MOTION_HANDOFF_RATE = 15;

export function selfSnapshotAlpha(alpha: number, lead: number): number {
  return Math.min(1.25, alpha + Math.max(0, lead));
}

export interface SelfRenderPositionState {
  /** The pose the frame draws. The caller owns the object, so the renderer can
   *  pass the THREE.Vector3 the camera and the entity loop already read (and
   *  keep writing, as the step-smoothing pass does). */
  position: Vec3Like;
  /** Predictor-handoff gap, captured once and decayed to zero. */
  offset: Vec3Like;
  ready: boolean;
  active: boolean;
  lastSelfId: number | null;
  predictor: SelfMotionPredictor | null;
}

export function createSelfRenderPositionState(
  position: Vec3Like = { x: 0, y: 0, z: 0 },
): SelfRenderPositionState {
  return {
    position,
    offset: { x: 0, y: 0, z: 0 },
    ready: false,
    active: false,
    lastSelfId: null,
    predictor: null,
  };
}

/**
 * Bind the display pose to the character it belongs to. Returns true on the
 * frame the identity changed, when the caller must also drop its own
 * per-character carry-over.
 */
export function noteSelfIdentity(state: SelfRenderPositionState, selfId: number): boolean {
  if (state.lastSelfId === selfId) return false;
  state.lastSelfId = selfId;
  state.ready = false;
  // A still-decaying predictor-handoff offset belongs to the previous
  // character; leaking it would displace the new one for a few frames.
  state.offset.x = 0;
  state.offset.y = 0;
  state.offset.z = 0;
  return true;
}

export function updateSelfRenderPosition(
  state: SelfRenderPositionState,
  p: Entity,
  seed: number,
  alpha: number,
  dt: number,
  selfAlphaLead: number,
  selfMotion: SelfMotionFrame | null,
  authoritativeDiscontinuity: boolean,
): Vec3Like {
  // Online intent-driven extrapolation: when active it owns the position and
  // the lead-smoothing path below becomes the fallback (both write the same
  // position, so enable/disable hands off without a pop, absorbed by the
  // snap/smooth rules on the next frame).
  if (selfMotion) {
    if (!state.predictor) {
      state.predictor = new SelfMotionPredictor(seed);
    }
    const predicted = state.predictor.step(p, selfMotion, authoritativeDiscontinuity);
    if (predicted) {
      // Follow the predictor output exactly (it is already continuous;
      // smoothing it again would re-add the display lag this exists to
      // remove). The only discontinuity is the handoff frame from the
      // lead-smoothing path below: capture that gap once as an offset and
      // decay it, so the camera glides instead of stepping.
      if (authoritativeDiscontinuity) {
        state.offset.x = 0;
        state.offset.y = 0;
        state.offset.z = 0;
      } else if (state.ready && !state.active) {
        state.offset.x = state.position.x - predicted.x;
        state.offset.y = state.position.y - predicted.y;
        state.offset.z = state.position.z - predicted.z;
      }
      const decay = Math.exp(-SELF_MOTION_HANDOFF_RATE * Math.max(0, dt));
      state.offset.x *= decay;
      state.offset.y *= decay;
      state.offset.z *= decay;
      state.position.x = predicted.x + state.offset.x;
      state.position.y = predicted.y + state.offset.y;
      state.position.z = predicted.z + state.offset.z;
      state.ready = true;
      state.active = true;
      return state.position;
    }
  }
  state.active = false;
  const playerAlpha = selfSnapshotAlpha(alpha, selfAlphaLead);
  const px = p.prevPos.x + (p.pos.x - p.prevPos.x) * playerAlpha;
  const py = p.prevPos.y + (p.pos.y - p.prevPos.y) * playerAlpha;
  const pz = p.prevPos.z + (p.pos.z - p.prevPos.z) * playerAlpha;
  updateSelfRenderFallback(
    state.position,
    px,
    py,
    pz,
    state.ready,
    dt,
    selfAlphaLead > 0,
    authoritativeDiscontinuity,
  );
  state.ready = true;
  return state.position;
}
