// The compile host every streamed-decor reveal gate shares (reveal_gate.ts):
// one root in, its programs linked and its uniform tables warmed out. Lifted
// out of the renderer constructor so the reveal lane's policy is nameable and
// testable on its own; the renderer keeps only the five bindings below.
//
// Reveal compiles ride BELOW the live entity gates (VISIBLE_PREWARM, not
// LIVE_VIEW): a teleport can queue dozens of far cells at once, and cosmetic
// scenery must never delay an actionable mob or player reveal.
//
// The tail matters as much as the link. Streamed decor used to pay the
// uniform-table round trip on its reveal DRAW (40 to 390 ms on the Intel
// iGPU) because the reveal host stopped at the shadow arm; the live gates'
// touch tail applies here too, per program, under the same budget.

import type * as THREE from 'three';
import { GPU_WORK_PRIORITY } from './background_gpu_queue';
import { type RevealCompileHost, revealSoftDeadlineMs } from './reveal_gate';

/** The gpu-prep label prefix, and therefore the budget's cost KIND, of every
 *  reveal compile. One constant so the label and the cost lookup cannot
 *  drift apart (gpu_prep_budget_core gpuPrepKindOfLabel). */
export const REVEAL_GATE_PREP_KIND = 'reveal-gate';

export interface RevealCompileHostDeps {
  /** Run one root's link as a gated queue unit. */
  gate(
    work: () => Promise<unknown>,
    options: { priority: number; label: string },
  ): Promise<unknown>;
  compileColor(target: THREE.Object3D): Promise<unknown>;
  compileShadow(target: THREE.Object3D): Promise<unknown>;
  touch(target: THREE.Object3D, priority: number): Promise<unknown>;
  /** The frame budget's learned cost of ONE reveal compile, which becomes the
   *  key's soft deadline once multiplied by its root count. What it learns is
   *  the compileAsync PROLOGUE (1 to 3 ms), not the driver's link wall time,
   *  so the deadline sits at its REVEAL_SOFT_DEADLINE_MIN_MS floor in
   *  practice; a learned wall time is future work. Harmless either way: the
   *  soft deadline is telemetry and never reveals anything. */
  predictRevealMs(): number;
}

export function createRevealCompileHost(deps: RevealCompileHostDeps): RevealCompileHost {
  return {
    compile(root: object): Promise<unknown> {
      const target = root as THREE.Object3D;
      const linked = deps.gate(
        () => deps.compileColor(target).then(() => deps.compileShadow(target)),
        {
          priority: GPU_WORK_PRIORITY.VISIBLE_PREWARM,
          label: `${REVEAL_GATE_PREP_KIND}:${target.name || target.type}`,
        },
      );
      return linked.then(() => deps.touch(target, GPU_WORK_PRIORITY.VISIBLE_PREWARM));
    },
    expectedMs(_key: string, rootCount: number): number {
      return revealSoftDeadlineMs(deps.predictRevealMs(), rootCount);
    },
  };
}
