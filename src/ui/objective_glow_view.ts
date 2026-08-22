// "You are facing the wrong way": a golden bloom down one edge of the screen
// pointing at the objective the coach is currently asking for.
//
// The island already paints a golden ground ribbon toward the next station
// (render/coach_trail_core.ts), but a ribbon is only useful once you are
// LOOKING at it. New players turn the camera away and then have nothing to
// steer by, which is what the CX pass caught. This is the affordance for
// exactly that moment: turn toward the objective and the glow fades out on
// its own, so the cue teaches the correction rather than nagging about it.
//
// Bearings, not projection: the objective can be behind the camera, where
// worldToScreen's x is meaningless, so the side is decided from the angle
// between where the view points and where the objective lies. The convention
// is compass.ts's, reused rather than re-derived: facing 0 = +Z = north,
// turning right DECREASES facing, and angleDelta > 0 means "to the right".
//
// Pure: no DOM, no Three, no wall clock, no rng. Registered in UI_PURE_CORES
// (tests/architecture.test.ts); driven directly by
// tests/objective_glow_view.test.ts. The thin painter is bootcamp.ts.

import { bearingDegrees } from './compass';

export type GlowSide = 'left' | 'right';

export interface ObjectiveGlowPlan {
  /** Which edge blooms: the side the player has to turn TOWARD. */
  side: GlowSide;
  /** 0 (just past the dead zone) to 1 (the objective is behind them). */
  intensity: number;
}

/**
 * How far off-centre the objective may sit before the glow starts.
 *
 * A player is not "facing the wrong way" merely because the objective is not
 * dead centre: at a 60 degree horizontal field of view anything inside about
 * 30 degrees is already on screen. 40 leaves a margin past that, so walking
 * a curved path never strobes the edge.
 */
export const GLOW_ONSET_DEG = 40;

/**
 * Where the glow reaches full strength. Past 140 degrees the objective is
 * behind the player's shoulder and no amount of squinting will find it, so
 * that is the loudest the cue ever needs to be.
 */
export const GLOW_FULL_DEG = 140;

/** Signed shortest angular distance b-a in degrees, wrapped to (-180, 180].
 *  Positive means b lies to the RIGHT of a (compass.ts's convention). */
function angleDelta(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}

/**
 * The facing that would point from `from` at `to`.
 *
 * Facing 0 is +Z and turning right decreases it, so a target at +X (due east,
 * bearing 90) has to come out as -PI/2. That is atan2(-dx, dz), NOT the
 * atan2(dx, dz) a camera-space derivation would give.
 */
export function facingToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), to.z - from.z);
}

/**
 * The glow for this view, or null while the player is looking near enough at
 * the objective (including standing on top of it, where there is no
 * meaningful direction to point).
 *
 * `viewFacing` is the CAMERA's facing, not the character's: a player can run
 * one way while looking another, and the cue is about what they can see.
 */
export function objectiveGlowPlan(
  viewFacing: number,
  objectiveFacing: number,
): ObjectiveGlowPlan | null {
  if (!Number.isFinite(viewFacing) || !Number.isFinite(objectiveFacing)) return null;
  const delta = angleDelta(bearingDegrees(viewFacing), bearingDegrees(objectiveFacing));
  const off = Math.abs(delta);
  if (off <= GLOW_ONSET_DEG) return null;
  const span = GLOW_FULL_DEG - GLOW_ONSET_DEG;
  const intensity = Math.min(1, (off - GLOW_ONSET_DEG) / span);
  return { side: delta > 0 ? 'right' : 'left', intensity };
}

/**
 * The same decision from world positions, the shape the painter actually
 * has. Null when the player is standing essentially on the objective, where
 * the bearing is noise and an edge would flicker as they shuffle.
 */
export const GLOW_MIN_DISTANCE_YD = 3;

export function objectiveGlowPlanAt(
  viewFacing: number,
  playerPos: { x: number; z: number },
  objective: { x: number; z: number },
): ObjectiveGlowPlan | null {
  const dx = objective.x - playerPos.x;
  const dz = objective.z - playerPos.z;
  if (Math.hypot(dx, dz) < GLOW_MIN_DISTANCE_YD) return null;
  return objectiveGlowPlan(viewFacing, facingToward(playerPos, objective));
}
