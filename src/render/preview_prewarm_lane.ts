// How secondary-context preview warming reaches the GPU: two lanes, because
// scheduled warming and intent-driven warming want opposite things.
//
// SCHEDULED warming (the post-entry paperdoll and portrait caches) is cosmetic
// and nobody is waiting for it, so it serialises: one bounded unit per idle
// slot, arbitrated against every other lane that reaches WebGL, at BACKGROUND.
// Serialising is the point, not an accident: a dozen preview units starting
// together would pile their driver work into one frame.
//
// INTENT warming is the opposite case and must not ride that lane. The player
// has just opened the surface, so the warm is worth a frame now rather than in
// several minutes, and the scheduled lane is minutes deep by construction (about
// 130 units at 750 ms spacing). It therefore gets its own entry point: no
// serialising promise, no idle slot, and VISIBLE_PREWARM, which is the priority
// meaning "content the player is approaching or revealing".
//
// Neither lane releases its tail for intent work. A released tail is only
// correct when everything after the work function's synchronous return is
// dominated by an off-thread wait; an intent warm is a synchronous build, so
// releasing would hand the queue a claim it cannot honour. The scheduled lane
// keeps the released tail it has always had.

import { GPU_WORK_PRIORITY, type GpuWorkRunOptions } from './background_gpu_queue';

export interface PreviewPrewarmLaneDeps {
  /** Wait for a browser idle slot. Scheduled units only. */
  idleSlot: () => Promise<unknown>;
  /** Hand one unit to the shared GPU arbiter. */
  run: (
    unit: () => void | Promise<void>,
    priority: number,
    label: string,
    options?: GpuWorkRunOptions,
  ) => Promise<unknown>;
}

export interface PreviewPrewarmLane {
  /** Cosmetic, scheduled, serialised behind every earlier unit. Rejections
   *  propagate to the caller per unit; the lane itself never wedges on one. */
  queueScheduled(label: string, unit: () => void | Promise<void>): Promise<void>;
  /** The player just asked for this surface. Skips the scheduled lane and the
   *  idle slot, and holds its tail. */
  queueIntent(label: string, unit: () => void | Promise<void>): Promise<void>;
}

export function createPreviewPrewarmLane(deps: PreviewPrewarmLaneDeps): PreviewPrewarmLane {
  let lane: Promise<void> = Promise.resolve();
  return {
    queueScheduled(label, unit): Promise<void> {
      const queued = lane
        .then(() => deps.idleSlot())
        .then(() => deps.run(unit, GPU_WORK_PRIORITY.BACKGROUND, label, { releaseTail: true }));
      // The lane advances on settle either way: one failed unit must not stop
      // every later one.
      lane = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued.then(() => undefined);
    },
    queueIntent(label, unit): Promise<void> {
      return deps.run(unit, GPU_WORK_PRIORITY.VISIBLE_PREWARM, label).then(() => undefined);
    },
  };
}
