// How scheduled secondary-context preview warming reaches the GPU.
//
// The post-entry paperdoll and portrait caches are cosmetic and nobody is
// waiting for them, so they serialise: one bounded unit per idle slot,
// arbitrated against every other lane that reaches WebGL, at BACKGROUND.
// Serialising is the point, not an accident: a dozen preview units starting
// together would pile their driver work into one frame.
//
// This module exists because that policy was inline in renderer.ts, which is a
// coordinator held to a line ceiling. It is a lane, not a framework: an
// intent-driven second entry point was written here and REMOVED once measurement
// showed the warming it served did not reduce anything (see
// tmp/armory-prewarm-measurement.md, round 5). Do not reintroduce one
// speculatively; add it when a caller has a measurement behind it.

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
  };
}
