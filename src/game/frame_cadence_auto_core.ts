// The automatic Frame Rate Limit: it lowers the ceiling only on a machine that
// demonstrably cannot hold its display's rhythm, and raises it back slowly.
//
// Two controllers share the frame: the quality governor (render_budget.ts) and
// this one. Their hierarchy is what keeps them from chasing each other:
// - quality is shed first: the ceiling only steps down once the governor has
//   stopped shedding and the rhythm is still uneven;
// - while an automatic ceiling is active the governor holds its quality levels
//   (the wiring publishes the hold), so new headroom goes to the cadence, never
//   to quality that would then fail the next return trial;
// - the descent is fast and the return is a timed trial whose wait doubles on
//   every failure, so a machine that cannot hold full cadence stops being asked.
//
// Pure: rendered frames in, the ceiling intent out. Every threshold is a share
// of frames or a duration of play, never a frame time calibrated on a machine.

import { ceilingDivisor, type FrameCeilingIntent } from './frame_cadence_core';

/** A window is uneven from this share of late frames (the Iris Xe laptop reads
 *  39 to 50 percent on the preset it cannot hold, 0 to 2 on the one it can). */
export const AUTO_UNEVEN_SHARE = 0.15;
/** A window is clean, and a return trial is passed, under this share. */
export const AUTO_CLEAN_SHARE = 0.05;
export const AUTO_WATCH_WINDOW_S = 15;
export const AUTO_TRIAL_WINDOW_S = 10;
export const AUTO_FIRST_RETURN_WAIT_S = 60;
export const AUTO_MAX_RETURN_WAIT_S = 960;
/** Fewer frames than this in a window is a stall or a pause, not a reading. */
const MIN_WINDOW_FRAMES = 60;

export interface FrameCadenceAutoState {
  ceiling: FrameCeilingIntent;
  trial: boolean;
  /** The ceiling a failed trial falls back to. */
  trialFrom: FrameCeilingIntent;
  windowSeconds: number;
  windowFrames: number;
  windowLate: number;
  cleanSeconds: number;
  returnWaitS: number;
}

export function createFrameCadenceAuto(): FrameCadenceAutoState {
  return {
    ceiling: 0,
    trial: false,
    trialFrom: 0,
    windowSeconds: 0,
    windowFrames: 0,
    windowLate: 0,
    cleanSeconds: 0,
    returnWaitS: AUTO_FIRST_RETURN_WAIT_S,
  };
}

/** Start the session at a remembered ceiling (the wiring owns the storage). */
export function restoreFrameCadenceAuto(
  state: FrameCadenceAutoState,
  ceiling: FrameCeilingIntent,
): void {
  state.ceiling = ceiling;
  resetWindow(state);
  state.trial = false;
  state.cleanSeconds = 0;
}

/** Drop the window in flight: a loading cover, a hidden span, a display change. */
export function resetFrameCadenceAutoWindow(state: FrameCadenceAutoState): void {
  resetWindow(state);
}

function resetWindow(state: FrameCadenceAutoState): void {
  state.windowSeconds = 0;
  state.windowFrames = 0;
  state.windowLate = 0;
}

/** The next ceiling down on this display, or the same one at the bottom. A step
 *  that changes nothing here (60 on a 60 Hz display) is skipped. */
export function autoStepDown(ceiling: FrameCeilingIntent, refreshHz: number): FrameCeilingIntent {
  if (ceiling === 0 && ceilingDivisor(refreshHz, 60) > 1) return 60;
  if (ceiling !== 30 && ceilingDivisor(refreshHz, 30) > 1) return 30;
  return ceiling;
}

export function autoStepUp(ceiling: FrameCeilingIntent, refreshHz: number): FrameCeilingIntent {
  if (ceiling === 30 && ceilingDivisor(refreshHz, 60) > 1) return 60;
  return 0;
}

export interface FrameCadenceAutoFrame {
  dtSeconds: number;
  /** The frame arrived late for the rhythm in force: a slot and a half of the
   *  display with no ceiling, its chosen slot missed under one. */
  late: boolean;
  refreshHz: number;
  /** The quality governor is still shedding: its turn, not ours. */
  governorShedding: boolean;
}

/**
 * Feed one rendered frame (paced display only; the wiring feeds nothing when
 * the display is unread or rAF is uncapped). Returns true when the ceiling
 * changed or a trial settled it.
 */
export function stepFrameCadenceAuto(
  state: FrameCadenceAutoState,
  frame: FrameCadenceAutoFrame,
): boolean {
  if (!(frame.dtSeconds > 0) || !(frame.refreshHz > 0)) return false;
  state.windowSeconds += frame.dtSeconds;
  state.windowFrames++;
  if (frame.late) state.windowLate++;
  const length = state.trial ? AUTO_TRIAL_WINDOW_S : AUTO_WATCH_WINDOW_S;
  if (state.windowSeconds < length) return false;
  const seconds = state.windowSeconds;
  const enough = state.windowFrames >= MIN_WINDOW_FRAMES;
  const share = state.windowLate / Math.max(1, state.windowFrames);
  resetWindow(state);
  if (!enough) return false;

  if (state.trial) {
    state.trial = false;
    state.cleanSeconds = 0;
    if (share < AUTO_CLEAN_SHARE) {
      // Passed: the trial ceiling is now the settled one (and worth remembering).
      state.returnWaitS = AUTO_FIRST_RETURN_WAIT_S;
      return true;
    }
    state.returnWaitS = Math.min(AUTO_MAX_RETURN_WAIT_S, state.returnWaitS * 2);
    state.ceiling = state.trialFrom;
    return true;
  }

  if (share >= AUTO_UNEVEN_SHARE) {
    state.cleanSeconds = 0;
    if (frame.governorShedding) return false;
    const down = autoStepDown(state.ceiling, frame.refreshHz);
    if (down === state.ceiling) return false;
    state.ceiling = down;
    return true;
  }

  if (state.ceiling === 0) return false;
  state.cleanSeconds = share < AUTO_CLEAN_SHARE ? state.cleanSeconds + seconds : 0;
  if (state.cleanSeconds < state.returnWaitS) return false;
  state.trial = true;
  state.trialFrom = state.ceiling;
  state.cleanSeconds = 0;
  state.ceiling = autoStepUp(state.ceiling, frame.refreshHz);
  return true;
}
