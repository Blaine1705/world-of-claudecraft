// The sampling behind the streamed-prewarm report lists. The caps exist
// because the server's raw-summary budget is 16 KB and a compile unit costs
// about 280 bytes on a real capture; WHICH members survive the cap is what
// decides whether the diagnostic is worth carrying at all.
import { describe, expect, it } from 'vitest';
import {
  PREWARM_REPORT_BUDGET_VARIANTS,
  PREWARM_REPORT_COMPILE_UNITS,
  PREWARM_REPORT_TRANSITIONS,
  sampleCompileUnits,
  sampleTransitions,
} from '../src/game/perf_prewarm_lists_core';

describe('prewarm report list sampling', () => {
  it('pins the caps to literals', () => {
    // A silent widening here is what pushes a real report over the server cap
    // and into the compact path, so these are literals, not derived values.
    expect(PREWARM_REPORT_COMPILE_UNITS).toBe(12);
    expect(PREWARM_REPORT_BUDGET_VARIANTS).toBe(8);
    expect(PREWARM_REPORT_TRANSITIONS).toBe(12);
  });

  it('returns a short list unchanged, as a copy', () => {
    const units = [{ syncMs: 1 }, { syncMs: 2 }];
    const sampled = sampleCompileUnits(units, 12);
    expect(sampled).toEqual(units);
    expect(sampled).not.toBe(units);
  });

  it('keeps the slowest units, not the first ones', () => {
    // The defect this replaces: slice(0, N) over a submission-ordered list
    // keeps the units that happened to be submitted first, which on a boot is
    // the cheap ones, and drops the stall the report exists to explain.
    const units = [
      { id: 'a', syncMs: 1 },
      { id: 'b', syncMs: 90 },
      { id: 'c', syncMs: 2 },
      { id: 'd', syncMs: 50 },
    ];
    expect(sampleCompileUnits(units, 2).map((u) => u.id)).toEqual(['b', 'd']);
  });

  it('ranks every failure above every slow success', () => {
    // Membership, not order: 'failed' has syncMs 0 and would lose to both
    // successes on time alone, so its presence here is the failure rule.
    // 'mid' is the one dropped, and the two survivors keep source order.
    const units = [
      { id: 'slow', syncMs: 500, failedAtMs: null },
      { id: 'failed', syncMs: 0, failedAtMs: 1200 },
      { id: 'mid', syncMs: 200, failedAtMs: null },
    ];
    expect(sampleCompileUnits(units, 2).map((u) => u.id)).toEqual(['slow', 'failed']);
  });

  it('emits the sample in original order, not in rank order', () => {
    // A reader still gets a timeline: the ranking decides membership only.
    const units = [
      { id: 'first', syncMs: 10 },
      { id: 'second', syncMs: 900 },
      { id: 'third', syncMs: 400 },
    ];
    expect(sampleCompileUnits(units, 2).map((u) => u.id)).toEqual(['second', 'third']);
    const reordered = sampleCompileUnits(
      [
        { id: 'slowest', syncMs: 900 },
        { id: 'quick', syncMs: 1 },
        { id: 'slower', syncMs: 400 },
      ],
      2,
    );
    expect(reordered.map((u) => u.id)).toEqual(['slowest', 'slower']);
  });

  it('breaks ties by settle duration, then stably by position', () => {
    const units = [
      { id: 'a', syncMs: 5, settledDurationMs: 1 },
      { id: 'b', syncMs: 5, settledDurationMs: 90 },
      { id: 'c', syncMs: 5, settledDurationMs: 1 },
    ];
    expect(sampleCompileUnits(units, 2).map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('treats missing timings as zero rather than dropping the unit', () => {
    const units = [
      { id: 'a', syncMs: null },
      { id: 'b', syncMs: null },
      { id: 'c', syncMs: null },
    ];
    expect(sampleCompileUnits(units, 2).map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('keeps the most recent transitions, which carry the end state', () => {
    const transitions = [1, 2, 3, 4, 5].map((atMs) => ({ atMs }));
    expect(sampleTransitions(transitions, 2).map((t) => t.atMs)).toEqual([4, 5]);
    expect(sampleTransitions(transitions, 9)).toEqual(transitions);
    expect(sampleTransitions(transitions, 9)).not.toBe(transitions);
  });
});
