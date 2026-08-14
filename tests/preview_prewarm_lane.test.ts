import { describe, expect, it } from 'vitest';
import { GPU_WORK_PRIORITY } from '../src/render/background_gpu_queue';
import { createPreviewPrewarmLane } from '../src/render/preview_prewarm_lane';

interface RunCall {
  label: string;
  priority: number;
  releaseTail: boolean | undefined;
}

function harness() {
  const calls: RunCall[] = [];
  const order: string[] = [];
  let idleSlots = 0;
  const gates = new Map<string, () => void>();
  const lane = createPreviewPrewarmLane({
    idleSlot: () => {
      idleSlots++;
      return Promise.resolve();
    },
    run: (unit, priority, label, options) => {
      calls.push({ label, priority, releaseTail: options?.releaseTail });
      order.push(`start:${label}`);
      return Promise.resolve(unit()).then(() => {
        order.push(`end:${label}`);
      });
    },
  });
  return { lane, calls, order, gates, idleSlots: () => idleSlots };
}

describe('preview prewarm lane', () => {
  it('runs scheduled work at BACKGROUND with a released tail', async () => {
    const h = harness();
    await h.lane.queueScheduled('scheduled', () => {});
    expect(h.calls[0]).toMatchObject({
      priority: GPU_WORK_PRIORITY.BACKGROUND,
      // Released because a scheduled unit's cost is dominated by compileAsync
      // links settling off-thread.
      releaseTail: true,
    });
  });

  it('serialises scheduled units and takes an idle slot before each', async () => {
    const h = harness();
    const first = h.lane.queueScheduled('a', () => {});
    const second = h.lane.queueScheduled('b', () => {});
    await Promise.all([first, second]);
    expect(h.order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
    expect(h.idleSlots()).toBe(2);
  });

  it('keeps the scheduled lane draining past a failed unit', async () => {
    const h = harness();
    const boom = h.lane.queueScheduled('boom', () => {
      throw new Error('unit failed');
    });
    const after = h.lane.queueScheduled('after', () => {});
    // The rejection reaches the CALLER, which is how a caller learns its own
    // unit failed, and the lane still advances.
    await expect(boom).rejects.toThrow('unit failed');
    await after;
    expect(h.order).toContain('end:after');
  });
});
