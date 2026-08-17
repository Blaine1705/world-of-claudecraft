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

/**
 * Run one queue unit per linked program under `target`, in order, and resolve
 * with how many were touched. The programs are collected ONCE up front: the
 * walk is cheap, and re-walking between pieces would re-touch what earlier
 * pieces already warmed. `gatePriority` is the GATE's priority; the pieces
 * ride at `linkedProgramTouchPriority(gatePriority)`.
 */
export async function runLinkedProgramTouchLane(
  queue: LinkedProgramTouchQueue,
  properties: MaterialPropertiesLike,
  target: THREE.Object3D,
  gatePriority: number,
  label: string = LINKED_PROGRAM_TOUCH_LABEL,
): Promise<number> {
  const programs = collectLinkedPrograms(properties, target);
  const priority = linkedProgramTouchPriority(gatePriority);
  for (const program of programs) {
    await queue.run(() => touchLinkedProgram(program), priority, label);
  }
  return programs.length;
}
