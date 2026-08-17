import { GPU_WORK_PRIORITY } from './background_gpu_queue';

/** The subset of a scene node the priority walk reads (Three-free). */
export interface CompilePriorityNode {
  userData: { entityId?: unknown };
  parent: CompilePriorityNode | null;
}

/** A live compile gate rides ACTIONABLE_VIEW when the target sits under the
 *  player's current target entity, LIVE_VIEW otherwise. */
export function compilePriorityForTarget(
  target: CompilePriorityNode,
  playerTargetId: number | null,
): number {
  let current: CompilePriorityNode | null = target;
  while (current) {
    if (current.userData.entityId === playerTargetId) return GPU_WORK_PRIORITY.ACTIONABLE_VIEW;
    current = current.parent;
  }
  return GPU_WORK_PRIORITY.LIVE_VIEW;
}
