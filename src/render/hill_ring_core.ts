// King of the Hill ring: the pure per-frame plan for the circle drawn on the
// ground (src/render/hill_ring.ts owns the meshes). The ring's colour says who
// holds it from anywhere in the zone (nobody: the neutral gold; your group:
// the friendly green; another group: the hostile red), its rim pulses while
// a challenge is running so a contested hill reads as one before the bar is
// looked at, and the interior wash stays faint so the circle marks ground
// without hiding it. Colours are hex literals here rather than CSS tokens
// because they feed Three materials, the rift death zone precedent.

import type { HillInfo } from '../world_api/world_pvp';

export interface HillRingPlan {
  color: number;
  ringOpacity: number;
  fillOpacity: number;
}

export const HILL_COLOR_UNHELD = 0xd9a441;
export const HILL_COLOR_YOURS = 0x4fd36a;
export const HILL_COLOR_OTHERS = 0xff4f3f;

export const HILL_RING_MAX_OPACITY = 0.9;
export const HILL_RING_MIN_OPACITY = 0.55;
/** A calm hill barely breathes; a contested one pulses visibly. */
export const HILL_PULSE_SPEED_CALM = 1.2;
export const HILL_PULSE_SPEED_CONTESTED = 5.0;
export const HILL_FILL_OPACITY = 0.12;

export function hillRingColor(holder: HillInfo['holder']): number {
  if (holder === 'you') return HILL_COLOR_YOURS;
  if (holder === 'other') return HILL_COLOR_OTHERS;
  return HILL_COLOR_UNHELD;
}

export function hillPulseSpeed(contested: boolean): number {
  return contested ? HILL_PULSE_SPEED_CONTESTED : HILL_PULSE_SPEED_CALM;
}

/** The full per-frame plan. `phase` is the caller-advanced pulse clock
 *  (radians, advanced by hillPulseSpeed * dt). */
export function hillRingPlan(
  phase: number,
  info: Pick<HillInfo, 'holder' | 'challenger'>,
): HillRingPlan {
  const contested = info.challenger !== 'none';
  const wave = contested ? 0.5 + 0.5 * Math.sin(phase) : 1;
  return {
    color: hillRingColor(info.holder),
    ringOpacity: HILL_RING_MIN_OPACITY + (HILL_RING_MAX_OPACITY - HILL_RING_MIN_OPACITY) * wave,
    fillOpacity: HILL_FILL_OPACITY,
  };
}

/** The identity a ring visual is keyed by: a new hill is a new mesh set, a
 *  holder change only retints the one that stands. */
export function hillRingKey(info: Pick<HillInfo, 'x' | 'z' | 'radius'>): string {
  return `${info.x},${info.z},${info.radius}`;
}
