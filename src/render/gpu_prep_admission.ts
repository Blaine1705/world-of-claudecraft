// The adapter between the two halves of GPU-preparation pacing: the queue's
// admission seam (background_gpu_queue.ts, which knows a candidate only by its
// label and priority) and the budget core (gpu_prep_budget_core.ts, which
// decides in terms of a cost KIND and an admission CLASS).
//
// It is deliberately the only place the two vocabularies meet, so the queue
// never learns what a class is and the core never learns what a queue unit is.
import type { GpuWorkAdmission } from './background_gpu_queue';
import {
  type GpuPrepBudget,
  gpuPrepClassForPriority,
  gpuPrepKindOfLabel,
} from './gpu_prep_budget_core';

/** Wrap a budget as the queue's admission: label to kind, priority to class,
 *  and a spend that both LEARNS the piece's real cost and charges the frame. */
export function createGpuPrepAdmission(budget: GpuPrepBudget): GpuWorkAdmission {
  return {
    admit(candidate): boolean {
      return budget.admit({
        kind: gpuPrepKindOfLabel(candidate.label),
        cls: gpuPrepClassForPriority(candidate.priority),
        deferredFrames: candidate.deferredFrames,
      }).admit;
    },
    spend(syncMs, label): void {
      // Record BEFORE spending: both are per-piece bookkeeping, but only the
      // record survives the frame, and it is what prices the next candidate of
      // this kind rather than the unknown prior.
      budget.record(gpuPrepKindOfLabel(label), syncMs);
      budget.spend(syncMs);
    },
  };
}
