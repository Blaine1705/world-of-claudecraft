// The live day/night clock: turns the shared UTC-anchored cycle into the current
// phase, with a dev-only override so the /daynight chat command can freeze the
// world at any time of day for testing. This is deliberately NOT a pure core (it
// reads Date.now and holds the override state), so it lives outside
// day_night_core.ts and its determinism scan. The renderer (sky + lighting) and
// the HUD (minimap dial) both read currentDayNightPhase(), so a single override
// drives them together and they never disagree.

import { cyclePhase } from './day_night_core';

let phaseOverride: number | null = null;

/** Freeze the cycle at a phase in [0,1) (0 = midnight, 0.5 = noon), or pass null
 *  to resume the real UTC-anchored clock. Out-of-range input wraps into [0,1). */
export function setDayNightPhaseOverride(phase: number | null): void {
  phaseOverride = phase == null ? null : ((phase % 1) + 1) % 1;
}

/** The active override phase, or null while the real clock is running. */
export function dayNightPhaseOverride(): number | null {
  return phaseOverride;
}

/** The current cycle phase in [0,1): the dev override when set, otherwise the
 *  live UTC-anchored clock. Read by both the world lighting and the minimap dial. */
export function currentDayNightPhase(): number {
  return phaseOverride ?? cyclePhase(Date.now());
}
