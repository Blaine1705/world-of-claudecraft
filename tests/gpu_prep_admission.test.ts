// The adapter between the queue's admission seam and the budget core
// (src/render/gpu_prep_admission.ts). Its whole job is translation, so these
// cases pin the translation: label to cost KIND, priority to admission CLASS,
// and a spend that both learns the piece's cost and charges the frame.
import { describe, expect, it } from 'vitest';
import { GPU_WORK_PRIORITY } from '../src/render/background_gpu_queue';
import { createGpuPrepAdmission } from '../src/render/gpu_prep_admission';
import { createGpuPrepBudget } from '../src/render/gpu_prep_budget_core';

describe('createGpuPrepAdmission', () => {
  it('admits an actionable-priority candidate whatever the frame costs', () => {
    const budget = createGpuPrepBudget({ targetFrameMs: 16.7 });
    const admission = createGpuPrepAdmission(budget);
    budget.noteFrame(90);

    expect(
      admission.admit({
        label: 'live-gate:target',
        priority: GPU_WORK_PRIORITY.ACTIONABLE_VIEW,
        deferredFrames: 0,
      }),
    ).toBe(true);
    expect(budget.snapshot().decisions['actionable-floor']).toBe(1);
  });

  it('prices a candidate by its label KIND, so every piece of a family shares one estimate', () => {
    const budget = createGpuPrepBudget({ targetFrameMs: 16.7, minSliceMs: 1.5 });
    const admission = createGpuPrepAdmission(budget);
    budget.noteFrame(16.7);

    // The first piece of an unmeasured kind rides the first-sample slot and
    // teaches the ledger what the kind costs...
    expect(
      admission.admit({
        label: 'reveal-gate:tavern:1',
        priority: GPU_WORK_PRIORITY.VISIBLE_PREWARM,
        deferredFrames: 0,
      }),
    ).toBe(true);
    admission.spend(40, 'reveal-gate:tavern:1');
    expect(budget.snapshot().kinds).toEqual([{ kind: 'reveal-gate', emaMs: 40, samples: 1 }]);

    // ...so a DIFFERENT instance of the same family is priced by it, not by the
    // unknown prior, and 40 ms does not fit a frame already at its target
    // (the frame has spent, so the per-frame progress slot is closed).
    budget.noteFrame(16.7);
    budget.spend(0.1);
    expect(
      admission.admit({
        label: 'reveal-gate:forge:7',
        priority: GPU_WORK_PRIORITY.VISIBLE_PREWARM,
        deferredFrames: 0,
      }),
    ).toBe(false);
    expect(budget.snapshot().decisions['no-headroom']).toBe(1);
  });

  it('maps a background priority onto the cosmetic class, which pressure defers', () => {
    const budget = createGpuPrepBudget({ targetFrameMs: 16.7 });
    const admission = createGpuPrepAdmission(budget);
    budget.noteFrame(8);
    budget.record('touch', 0.2);
    budget.notePressure(true);

    expect(
      admission.admit({
        label: 'touch:program',
        priority: GPU_WORK_PRIORITY.BACKGROUND,
        deferredFrames: 0,
      }),
    ).toBe(false);
    expect(budget.snapshot().decisions.pressure).toBe(1);
    // The same piece for a LIVE view is the 'visible' class, which pressure
    // never touches: a graphics knob may not delay what a player reacts to.
    expect(
      admission.admit({
        label: 'touch:program',
        priority: GPU_WORK_PRIORITY.LIVE_VIEW,
        deferredFrames: 0,
      }),
    ).toBe(true);
  });

  it('honours the starvation bound the queue counts for it', () => {
    const budget = createGpuPrepBudget({
      targetFrameMs: 16.7,
      maxDeferFrames: 4,
      cosmeticMaxDeferFrames: 6,
    });
    const admission = createGpuPrepAdmission(budget);
    budget.noteFrame(60);
    budget.spend(0.1);
    budget.record('touch', 99);

    // BACKGROUND is cosmetic: its own, longer bound applies.
    const candidate = { label: 'touch:program', priority: GPU_WORK_PRIORITY.BACKGROUND };
    expect(admission.admit({ ...candidate, deferredFrames: 4 })).toBe(false);
    expect(admission.admit({ ...candidate, deferredFrames: 6 })).toBe(true);
    // VISIBLE_PREWARM is approaching: the general bound.
    const approaching = { label: 'touch:program', priority: GPU_WORK_PRIORITY.VISIBLE_PREWARM };
    expect(admission.admit({ ...approaching, deferredFrames: 3 })).toBe(false);
    expect(admission.admit({ ...approaching, deferredFrames: 4 })).toBe(true);
    expect(budget.snapshot().decisions.starvation).toBe(2);
  });

  it('spends the frame it charges, so a second piece sees the smaller headroom', () => {
    const budget = createGpuPrepBudget({ targetFrameMs: 30, minSliceMs: 1 });
    const admission = createGpuPrepAdmission(budget);
    budget.noteFrame(20);
    expect(budget.headroomMs()).toBe(10);

    admission.spend(4, 'touch:program');

    expect(budget.headroomMs()).toBe(6);
    expect(budget.predictMs('touch:anything')).toBe(4);
  });

  it('admits everything while the legacy kill switch is on, and keeps learning', () => {
    const budget = createGpuPrepBudget({ targetFrameMs: 16.7 });
    const admission = createGpuPrepAdmission(budget);
    budget.noteFrame(120);
    budget.setLegacy(true);

    expect(
      admission.admit({
        label: 'touch:program',
        priority: GPU_WORK_PRIORITY.BOOT_RESUME,
        deferredFrames: 0,
      }),
    ).toBe(true);
    admission.spend(3, 'touch:program');

    const snapshot = budget.snapshot();
    expect(snapshot.decisions.legacy).toBe(1);
    expect(snapshot.kinds).toEqual([{ kind: 'touch', emaMs: 3, samples: 1 }]);
  });
});
