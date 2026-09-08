import type { Vec3 } from './types';

export interface ShadowPatrol {
  x: number;
  z: number;
  period: number;
  pause: number;
}
/** Both ends have a visible watch pause; period is travel time for one leg. */
export function shadowPatrolPosition(
  start: { x: number; z: number },
  patrol: ShadowPatrol,
  seconds: number,
) {
  const leg = patrol.period + patrol.pause;
  const phase = ((seconds % (2 * leg)) + 2 * leg) % (2 * leg);
  const returning = phase >= leg;
  const travel = Math.max(0, (phase % leg) - patrol.pause) / patrol.period;
  const fraction = returning ? 1 - travel : travel;
  return {
    x: start.x + (patrol.x - start.x) * fraction,
    z: start.z + (patrol.z - start.z) * fraction,
    facing: Math.atan2(patrol.x - start.x, patrol.z - start.z) + (returning ? Math.PI : 0),
  };
}
/** A broad rear pocket, not an extra detection cone. The lantern circles remain the danger cues. */
export function shadowBehindCarrier(
  player: Pick<Vec3, 'x' | 'z'>,
  carrier: { pos: Pick<Vec3, 'x' | 'z'>; facing: number },
): boolean {
  const dx = player.x - carrier.pos.x,
    dz = player.z - carrier.pos.z;
  const distance = Math.hypot(dx, dz);
  return (
    distance > 0.1 &&
    (dx * Math.sin(carrier.facing) + dz * Math.cos(carrier.facing)) / distance <= -0.5
  );
}
