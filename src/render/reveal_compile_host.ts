// The compile host every streamed-decor reveal gate shares (reveal_gate.ts):
// one root in, its programs linked, its cold textures uploaded and its
// uniform tables warmed out. Lifted out of the renderer constructor so the
// reveal lane's policy is nameable and testable on its own; the renderer keeps
// only the bindings below.
//
// Ordinary reveal compiles ride BELOW the live entity gates (VISIBLE_PREWARM,
// not LIVE_VIEW): a teleport can queue dozens of far cells at once, and
// cosmetic scenery must never delay an actionable mob or player reveal.
//
// An IMMINENT key is the exception, and only about ORDER. It is the decor the
// camera already stands among at an arrival, which nothing else in the scene
// can stand in for and which stays hidden until its own compile lands, so its
// link, upload and touch pieces ride at LIVE_VIEW: still under the actionable
// gates (mobs and players keep their floor), still above every other reveal
// and every background warmer. It buys queue position, never an early draw.
//
// The tail matters as much as the link. Streamed decor used to pay the
// uniform-table round trip on its reveal DRAW (40 to 390 ms on the Intel
// iGPU) because the reveal host stopped at the shadow arm; the live gates'
// touch tail applies here too, per program, under the same budget.

import type * as THREE from 'three';
import { GPU_WORK_PRIORITY } from './background_gpu_queue';
import type { CompileGateResult } from './compile_gate';
import { linkPieceWork } from './compile_gate_pieces';
import { type RevealCompileHost, revealSoftDeadlineMs } from './reveal_gate';

/** The gpu-prep label prefix, and therefore the budget's cost KIND, of every
 *  reveal compile. One constant so the label and the cost lookup cannot
 *  drift apart (gpu_prep_budget_core gpuPrepKindOfLabel). */
export const REVEAL_GATE_PREP_KIND = 'reveal-gate';

export interface RevealCompileHostDeps {
  /** Run one root's link as a gate of queue units, one per material group
   *  of the root (compile_gate_pieces.ts), under one deadline. Its result
   *  says whether the whole link SETTLED, which is what the touch tail's
   *  readiness rests on. */
  gate(
    pieces: Array<() => Promise<unknown>>,
    options: { priority: number; label: string },
  ): Promise<CompileGateResult>;
  compileColor(target: THREE.Object3D): Promise<unknown>;
  compileShadow(target: THREE.Object3D): Promise<unknown>;
  /** Every cold texture under the root, one budgeted queue unit each. Between
   *  the link and the touch: the touch's driver round trip flushes behind
   *  everything already queued, so uploads paid after it are measured by it. */
  upload(target: THREE.Object3D, priority: number): Promise<unknown>;
  /** The touch tail. It carries the gate's own result: a timed-out or failed
   *  link proved nothing, so its tail may warm only what an earlier settle
   *  already proved ready (linked_program_readiness.ts). */
  touch(target: THREE.Object3D, priority: number, gate: CompileGateResult): Promise<unknown>;
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
    compile(root: object, imminent: boolean): Promise<unknown> {
      const target = root as THREE.Object3D;
      const priority = imminent ? GPU_WORK_PRIORITY.LIVE_VIEW : GPU_WORK_PRIORITY.VISIBLE_PREWARM;
      const linked = deps.gate(linkPieceWork(target, deps.compileColor, deps.compileShadow), {
        priority,
        label: `${REVEAL_GATE_PREP_KIND}:${target.name || target.type}`,
      });
      return linked
        .then((gate) => deps.upload(target, priority).then(() => gate))
        .then((gate) => deps.touch(target, priority, gate));
    },
    expectedMs(_key: string, rootCount: number): number {
      return revealSoftDeadlineMs(deps.predictRevealMs(), rootCount);
    },
  };
}
