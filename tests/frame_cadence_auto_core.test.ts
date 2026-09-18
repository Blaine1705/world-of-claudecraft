import { describe, expect, it } from 'vitest';
import {
  AUTO_FIRST_RETURN_WAIT_S,
  AUTO_MAX_RETURN_WAIT_S,
  AUTO_TRIAL_WINDOW_S,
  AUTO_WATCH_WINDOW_S,
  autoStepDown,
  autoStepUp,
  createFrameCadenceAuto,
  type FrameCadenceAutoState,
  stepFrameCadenceAuto,
} from '../src/game/frame_cadence_auto_core';

interface WindowOpts {
  /** Every `lateEvery`-th frame is late; 0 for a clean window. */
  lateEvery: number;
  refreshHz?: number;
  governorShedding?: boolean;
  /** Frame delta; the window closes once the deltas add up to its length. */
  dtSeconds?: number;
}

/** Feed frames until one window closes; returns what the closing step said. */
function runWindow(state: FrameCadenceAutoState, opts: WindowOpts): boolean {
  const dtSeconds = opts.dtSeconds ?? 1 / 60;
  const length = state.trial ? AUTO_TRIAL_WINDOW_S : AUTO_WATCH_WINDOW_S;
  const frames = Math.ceil(length / dtSeconds) + 2;
  for (let i = 0; i < frames; i++) {
    const changed = stepFrameCadenceAuto(state, {
      dtSeconds,
      late: opts.lateEvery > 0 && i % opts.lateEvery === 0,
      refreshHz: opts.refreshHz ?? 60,
      governorShedding: opts.governorShedding ?? false,
    });
    if (state.windowFrames === 0) return changed;
    expect(changed).toBe(false);
  }
  throw new Error('the window never closed');
}

const UNEVEN = { lateEvery: 3 };
const CLEAN = { lateEvery: 0 };

describe('automatic frame rate limit core', () => {
  it('pins the return waits', () => {
    expect(AUTO_FIRST_RETURN_WAIT_S).toBe(60);
    expect(AUTO_MAX_RETURN_WAIT_S).toBe(960);
  });

  it('steps down on an uneven window and leaves the wait alone off probation', () => {
    const s = createFrameCadenceAuto();
    expect(runWindow(s, UNEVEN)).toBe(true);
    expect(s.ceiling).toBe(30);
    expect(s.returnWaitS).toBe(60);
    expect(s.lastShare).toBeCloseTo(1 / 3, 2);
  });

  it('doubles the return wait when it steps back down while on probation', () => {
    const s = createFrameCadenceAuto();
    s.onProbation = true;
    expect(runWindow(s, UNEVEN)).toBe(true);
    expect(s.ceiling).toBe(30);
    expect(s.onProbation).toBe(false);
    expect(s.returnWaitS).toBe(120);
  });

  it('keeps the probation when the governor is still shedding: nothing was decided', () => {
    const s = createFrameCadenceAuto();
    s.onProbation = true;
    expect(runWindow(s, { ...UNEVEN, governorShedding: true })).toBe(false);
    expect(s.ceiling).toBe(0);
    expect(s.onProbation).toBe(true);
    expect(s.returnWaitS).toBe(60);
  });

  it('ends a probation that outlasts the wait it took, and starts over from the first wait', () => {
    const s = createFrameCadenceAuto();
    s.onProbation = true;
    s.returnWaitS = 120;
    for (let w = 0; w < 7; w++) expect(runWindow(s, CLEAN)).toBe(false);
    expect(s.onProbation).toBe(true);
    expect(s.returnWaitS).toBe(120);
    expect(runWindow(s, CLEAN)).toBe(false);
    expect(s.onProbation).toBe(false);
    expect(s.returnWaitS).toBe(60);
    expect(s.ceiling).toBe(0);
  });

  it('falls back from a failed trial with a doubled wait, and puts a passed one on probation', () => {
    const s = createFrameCadenceAuto();
    runWindow(s, UNEVEN);
    for (let w = 0; w < 3; w++) expect(runWindow(s, CLEAN)).toBe(false);
    expect(runWindow(s, CLEAN)).toBe(true);
    expect(s.trial).toBe(true);
    expect(s.trialFrom).toBe(30);
    expect(s.ceiling).toBe(0);
    expect(runWindow(s, UNEVEN)).toBe(true);
    expect(s.trial).toBe(false);
    expect(s.ceiling).toBe(30);
    expect(s.returnWaitS).toBe(120);
    expect(s.onProbation).toBe(false);

    for (let w = 0; w < 7; w++) expect(runWindow(s, CLEAN)).toBe(false);
    expect(runWindow(s, CLEAN)).toBe(true);
    expect(s.trial).toBe(true);
    expect(runWindow(s, CLEAN)).toBe(true);
    expect(s.trial).toBe(false);
    expect(s.ceiling).toBe(0);
    expect(s.onProbation).toBe(true);
    expect(s.probationS).toBe(0);
    expect(s.returnWaitS).toBe(120);
  });

  it('clamps the doubled wait at 960 seconds, on a failed trial and on a probation step down', () => {
    const failed = createFrameCadenceAuto();
    failed.ceiling = 0;
    failed.trial = true;
    failed.trialFrom = 30;
    failed.returnWaitS = 480;
    runWindow(failed, UNEVEN);
    expect(failed.returnWaitS).toBe(960);
    failed.trial = true;
    runWindow(failed, UNEVEN);
    expect(failed.returnWaitS).toBe(960);

    const probation = createFrameCadenceAuto();
    probation.onProbation = true;
    probation.returnWaitS = 600;
    runWindow(probation, UNEVEN);
    expect(probation.returnWaitS).toBe(960);
  });

  it('decides nothing from a window with too few frames', () => {
    const stalled = createFrameCadenceAuto();
    // 59 frames over the window, every one late: a stall, not a reading.
    expect(runWindow(stalled, { lateEvery: 1, dtSeconds: AUTO_WATCH_WINDOW_S / 58.5 })).toBe(false);
    expect(stalled.ceiling).toBe(0);
    expect(stalled.lastShare).toBe(0);
    const enough = createFrameCadenceAuto();
    expect(runWindow(enough, { lateEvery: 1, dtSeconds: AUTO_WATCH_WINDOW_S / 59.5 })).toBe(true);
    expect(enough.ceiling).toBe(30);
    expect(enough.lastShare).toBe(1);
  });

  it('ignores a frame with no duration or no display reading', () => {
    const s = createFrameCadenceAuto();
    const frame = { dtSeconds: 0, late: true, refreshHz: 60, governorShedding: false };
    expect(stepFrameCadenceAuto(s, frame)).toBe(false);
    expect(stepFrameCadenceAuto(s, { ...frame, dtSeconds: 1, refreshHz: 0 })).toBe(false);
    expect(s.windowFrames).toBe(0);
  });

  it('pins the step down table', () => {
    expect(autoStepDown(0, 60)).toBe(30);
    expect(autoStepDown(30, 60)).toBe(30);
    expect(autoStepDown(60, 60)).toBe(30);
    expect(autoStepDown(0, 75)).toBe(30);
    expect(autoStepDown(30, 75)).toBe(30);
    expect(autoStepDown(0, 120)).toBe(60);
    expect(autoStepDown(60, 120)).toBe(30);
    expect(autoStepDown(30, 120)).toBe(30);
    expect(autoStepDown(0, 144)).toBe(60);
    expect(autoStepDown(60, 144)).toBe(30);
    expect(autoStepDown(30, 144)).toBe(30);
    // Nothing to step down to on a display already at the lowest ceiling.
    expect(autoStepDown(0, 30)).toBe(0);
  });

  it('pins the step up table', () => {
    expect(autoStepUp(30, 60)).toBe(0);
    expect(autoStepUp(30, 75)).toBe(0);
    expect(autoStepUp(30, 120)).toBe(60);
    expect(autoStepUp(30, 144)).toBe(60);
    for (const hz of [60, 75, 120, 144]) {
      expect(autoStepUp(60, hz)).toBe(0);
      expect(autoStepUp(0, hz)).toBe(0);
    }
  });
});
