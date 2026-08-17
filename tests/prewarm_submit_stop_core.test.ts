import { describe, expect, it } from 'vitest';
import {
  type AdaptiveLinkBudgetConfig,
  createAdaptiveLinkBudget,
} from '../src/render/adaptive_link_budget_core';
import { prewarmSubmitShouldStop } from '../src/render/prewarm_policy';
import {
  createPrewarmSubmitStop,
  PREWARM_SUBMIT_LANE_MAX_MS,
  PREWARM_SUBMIT_NO_USEFUL_LINK_MS,
  PREWARM_SUBMIT_STOP_CONFIG,
  PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT,
} from '../src/render/prewarm_submit_stop_core';

const ADAPTIVE_CONFIG: AdaptiveLinkBudgetConfig = {
  initialWindowLinks: 16,
  minWindowLinks: 8,
  maxWindowLinks: 32,
  initialLinkEstimate: 8,
  increaseLinks: 4,
  fastSettlementMs: 1_200,
  slowSettlementMs: 2_000,
  noProgressMs: 3_000,
  maxSleepMs: 16,
};

describe('prewarm submit stop core', () => {
  it('ships the constants the design measured, and never stops before a submission', () => {
    expect(PREWARM_SUBMIT_STOP_CONFIG).toEqual({
      laneMaxMs: 6_000,
      noUsefulLinkMs: 1_500,
      zeroDeltaStreakLimit: 8,
    });
    const stop = createPrewarmSubmitStop();
    // A lane that has not submitted anything has no wall clock yet: the
    // manifest entries before it must not spend its budget.
    expect(stop.shouldStop(60_000)).toEqual({
      stop: false,
      reason: null,
      elapsedMs: 0,
      submissions: 0,
    });
  });

  it('runs its wall clock from the FIRST submission, not from creation', () => {
    const stop = createPrewarmSubmitStop();
    // 20 s of manifest ran before the lane's first unit; the lane owns none of it.
    stop.noteSubmitted(20_000);
    expect(stop.shouldStop(20_000 + PREWARM_SUBMIT_LANE_MAX_MS - 1).stop).toBe(false);
    const verdict = stop.shouldStop(20_000 + PREWARM_SUBMIT_LANE_MAX_MS);
    expect(verdict).toMatchObject({
      stop: true,
      reason: 'lane-max',
      elapsedMs: PREWARM_SUBMIT_LANE_MAX_MS,
      submissions: 1,
    });
    // Latching: the reason a capture reads is the rule that truncated the lane.
    expect(stop.shouldStop(20_001).reason).toBe('lane-max');
    expect(stop.snapshot()).toMatchObject({ stopped: true, reason: 'lane-max' });
  });

  it('stops after a run of settles that linked nothing', () => {
    const stop = createPrewarmSubmitStop();
    let now = 0;
    for (let i = 0; i < PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT - 1; i++) {
      stop.noteSubmitted(now);
      stop.noteSyncEnd(0);
      stop.noteSettled(now, 0);
      expect(stop.shouldStop(now).stop).toBe(false);
      now += 1;
    }
    stop.noteSubmitted(now);
    stop.noteSyncEnd(0);
    stop.noteSettled(now, 0);
    const verdict = stop.shouldStop(now);
    expect(verdict.stop).toBe(true);
    expect(verdict.reason).toBe('no-useful-link');
    // Well inside the lane max: the streak, not the clock, caught this.
    expect(verdict.elapsedMs).toBeLessThan(PREWARM_SUBMIT_LANE_MAX_MS);
    expect(stop.snapshot()).toMatchObject({
      submissions: PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT,
      usefulSettles: 0,
      zeroDeltaSettles: PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT,
      zeroDeltaStreak: PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT,
      syncEnds: PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT,
      zeroDeltaSyncEnds: PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT,
    });
  });

  it('resets the no-useful-link window on every positive program delta', () => {
    // laneMaxMs is lifted out of the way so this case answers for the
    // no-useful-link rule alone; the lane max has its own case above.
    const stop = createPrewarmSubmitStop({ ...PREWARM_SUBMIT_STOP_CONFIG, laneMaxMs: 600_000 });
    stop.noteSubmitted(0);
    // Zero-delta settles arm the window, then real work disarms it: the window
    // measures time since the last USEFUL link, so a lane that keeps linking
    // programs is never stopped by this rule.
    for (let i = 0; i < 20; i++) {
      const at = i * 1_000;
      stop.noteSubmitted(at);
      stop.noteSettled(at, 0);
      expect(stop.shouldStop(at + PREWARM_SUBMIT_NO_USEFUL_LINK_MS - 1).stop).toBe(false);
      stop.noteSettled(at + PREWARM_SUBMIT_NO_USEFUL_LINK_MS - 1, 4);
    }
    expect(stop.snapshot()).toMatchObject({ stopped: false, zeroDeltaStreak: 0 });
    expect(stop.snapshot().usefulSettles).toBe(20);
  });

  it('never fires the no-useful-link window on silence alone', () => {
    // A slow machine whose first unit is still linking has settled nothing, so
    // it reports no evidence of cheap work: only the lane max may stop it (a
    // genuinely stuck lane is the adaptive budget's noProgress case).
    const stop = createPrewarmSubmitStop();
    stop.noteSubmitted(0);
    stop.noteSyncEnd(24);
    expect(stop.shouldStop(PREWARM_SUBMIT_NO_USEFUL_LINK_MS * 3).stop).toBe(false);
    expect(stop.shouldStop(PREWARM_SUBMIT_LANE_MAX_MS).reason).toBe('lane-max');
  });

  it('fires the time window when only zero-delta settles land', () => {
    const stop = createPrewarmSubmitStop({
      laneMaxMs: 60_000,
      noUsefulLinkMs: PREWARM_SUBMIT_NO_USEFUL_LINK_MS,
      zeroDeltaStreakLimit: 1_000,
    });
    stop.noteSubmitted(1_000);
    stop.noteSettled(1_000, 0);
    expect(stop.shouldStop(1_000 + PREWARM_SUBMIT_NO_USEFUL_LINK_MS - 1).stop).toBe(false);
    expect(stop.shouldStop(1_000 + PREWARM_SUBMIT_NO_USEFUL_LINK_MS)).toMatchObject({
      stop: true,
      reason: 'no-useful-link',
    });
  });

  it('normalizes a junk config and survives junk readings and deltas', () => {
    const stop = createPrewarmSubmitStop({
      laneMaxMs: Number.NaN,
      noUsefulLinkMs: -1,
      zeroDeltaStreakLimit: 0,
    });
    // A junk reading is not an observation: it can neither start the lane
    // clock nor stop the lane.
    stop.noteSubmitted(Number.NaN);
    expect(stop.shouldStop(Number.POSITIVE_INFINITY).stop).toBe(false);
    expect(stop.snapshot()).toMatchObject({ submissions: 1, elapsedMs: 0, stopped: false });
    stop.noteSubmitted(0);
    stop.noteSyncEnd(Number.NaN);
    stop.noteSettled(0, Number.NEGATIVE_INFINITY);
    expect(stop.snapshot().zeroDeltaSyncEnds).toBe(1);
    expect(stop.snapshot().zeroDeltaSettles).toBe(1);
    // The defaults replaced every junk knob, so the fallbacks still bound it.
    expect(stop.shouldStop(PREWARM_SUBMIT_LANE_MAX_MS - 1).reason).toBe('no-useful-link');
  });

  it('bounds the lane on BOTH rules whatever finishFullManifestBeforeReveal says', () => {
    // The design's exemption rule: finishFull may exempt the manifest
    // DEADLINE clause, never the lane's own hard stop.
    const laneMax = createPrewarmSubmitStop();
    laneMax.noteSubmitted(0);
    const laneVerdict = laneMax.shouldStop(PREWARM_SUBMIT_LANE_MAX_MS);
    expect(prewarmSubmitShouldStop(0, Number.POSITIVE_INFINITY, true, laneVerdict)).toBe(true);
    expect(prewarmSubmitShouldStop(0, Number.POSITIVE_INFINITY, false, laneVerdict)).toBe(true);

    const useless = createPrewarmSubmitStop();
    useless.noteSubmitted(0);
    for (let i = 0; i < PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT; i++) useless.noteSettled(0, 0);
    const uselessVerdict = useless.shouldStop(0);
    expect(uselessVerdict.reason).toBe('no-useful-link');
    expect(prewarmSubmitShouldStop(0, Number.POSITIVE_INFINITY, true, uselessVerdict)).toBe(true);
  });

  it('stops the instant-settle runaway early and leaves the AIMD window unopened', () => {
    // The reveal-gate wiring's measured runaway, on a fake clock: 200 units
    // whose programs are already linked settle at 0 ms having linked nothing.
    // Before the discount every one of those settles grew windowLinks, which
    // is how the lane reached the wall.
    const clock = { now: () => 0, sleep: async () => {} };
    const budget = createAdaptiveLinkBudget(ADAPTIVE_CONFIG, clock);
    const stop = createPrewarmSubmitStop();
    let submitted = 0;
    for (let i = 0; i < 200; i++) {
      if (stop.shouldStop(0).stop) break;
      const id = `hidden:${i}`;
      submitted++;
      budget.markSubmitted(id);
      stop.noteSubmitted(0);
      budget.markSyncEnd(id, 0);
      stop.noteSyncEnd(0);
      budget.markSettled(id);
      stop.noteSettled(0, 0);
    }
    expect(submitted).toBe(PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT);
    expect(stop.shouldStop(0)).toMatchObject({ stop: true, reason: 'no-useful-link' });
    // The lane stopped on a virtual clock that never advanced, so the lane max
    // could not have been what caught it.
    expect(stop.snapshot().elapsedMs).toBe(0);
    expect(budget.snapshot().windowLinks).toBe(ADAPTIVE_CONFIG.initialWindowLinks);
    expect(budget.snapshot().maxWindowObserved).toBe(ADAPTIVE_CONFIG.initialWindowLinks);
  });
});
