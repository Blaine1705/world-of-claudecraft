// The compile gate's touch tail, spread over the GPU work queue instead of
// landing in one burst.
//
// Why per program. Touching a linked program's uniform and attribute tables
// costs a driver round trip that waits behind everything the GPU process has
// queued (see linked_program_touch.ts for the measurements: 40 to 390 ms on the
// Intel iGPU for a whole far bake). As ONE unit the tail is unbudgetable: the
// queue can only decide to start it or not, and once started it runs to the
// end. As one unit PER PROGRAM the per-frame admission can let two through in a
// frame with headroom and none in a frame without, which is the whole point of
// pacing it.
//
// Sequential on purpose: the pieces are main-thread work, so overlapping them
// would only make one frame carry several round trips. The gate's own promise
// still settles after the last piece, so a gated reveal is no earlier than it
// was before.
import type * as THREE from 'three';
import { GPU_WORK_PRIORITY } from './background_gpu_queue';
import { isProgramKnownReady, markProgramsReadyUnder } from './linked_program_readiness';
import {
  collectLinkedPrograms,
  type MaterialPropertiesLike,
  touchLinkedProgram,
} from './linked_program_touch';

/** The slice of the background GPU queue this lane needs. */
export interface LinkedProgramTouchQueue {
  run<T>(work: () => T | Promise<T>, priority?: number, label?: string): Promise<T>;
}

/** The label every touch piece carries. Its KIND (the part before the colon)
 *  is what the budget learns a cost for, so all pieces share one estimate. */
export const LINKED_PROGRAM_TOUCH_LABEL = 'touch:program';

/** The queue priority a gate's touch pieces ride at: an actionable gate keeps
 *  its own (the actionable floor); every other gate's pieces drop to
 *  TAIL_PIECE, below every link submission (see GPU_WORK_PRIORITY). */
export function linkedProgramTouchPriority(gatePriority: number): number {
  return gatePriority >= GPU_WORK_PRIORITY.ACTIONABLE_VIEW
    ? gatePriority
    : GPU_WORK_PRIORITY.TAIL_PIECE;
}

/** The PREVIEW context's own kind. Deliberately not the world label: the world
 *  touch kind has learned an EMA near zero over thousands of samples (its
 *  programs are warm by the time the tail runs), while a paperdoll program on
 *  a second context measures 15 to 17 ms per first-use query on the Intel
 *  iGPU. Sharing one estimate would let the budget admit a whole open's worth
 *  of preview pieces into one frame. */
export const PREVIEW_LINKED_PROGRAM_TOUCH_LABEL = 'touch-preview:program';

export interface LinkedProgramTouchLaneOptions {
  /** A caller on a SECOND context passes its own label so the budget prices it
   *  apart from the world tail; see the preview label above. */
  label?: string;
  /** Whether the compile this tail follows actually SETTLED over `target`.
   *  True (the default) records the target's current programs as linked before
   *  the walk, which is the only thing that ever proves a program ready here.
   *  A caller whose gate timed out or failed passes false: it warms whatever an
   *  earlier settle already proved and claims nothing new. */
  settled?: boolean;
}

/**
 * Run one queue unit per linked program under `target`, in order, and resolve
 * with how many were touched. The programs are collected ONCE up front: the
 * walk is cheap, and re-walking between pieces would re-touch what earlier
 * pieces already warmed. `gatePriority` is the GATE's priority; the pieces
 * ride at `linkedProgramTouchPriority(gatePriority)`.
 *
 * Readiness comes from the settle, never from the driver: see
 * linked_program_readiness.ts for the 5.6 s live freeze one `isReady()` cost.
 */
export async function runLinkedProgramTouchLane(
  queue: LinkedProgramTouchQueue,
  properties: MaterialPropertiesLike,
  target: THREE.Object3D,
  gatePriority: number,
  options: LinkedProgramTouchLaneOptions = {},
): Promise<number> {
  const { label = LINKED_PROGRAM_TOUCH_LABEL, settled = true } = options;
  if (settled) markProgramsReadyUnder(properties, target);
  const programs = collectLinkedPrograms(properties, target, isProgramKnownReady);
  const priority = linkedProgramTouchPriority(gatePriority);
  for (const program of programs) {
    await queue.run(() => touchLinkedProgram(program), priority, label);
  }
  return programs.length;
}
