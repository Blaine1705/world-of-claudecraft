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

  it('runs an intent unit without the scheduled lane or an idle slot', async () => {
    const h = harness();
    // A scheduled unit is parked in front, exactly as the real lane is when a
    // player opens the store: about 130 units at 750 ms spacing.
    let releaseParked!: () => void;
    const parked = h.lane.queueScheduled(
      'parked',
      () => new Promise<void>((resolve) => (releaseParked = resolve)),
    );
    await Promise.resolve();
    await h.lane.queueIntent('intent', () => {});
    // The whole point: the intent unit ran while the scheduled one was still in
    // flight. Riding that lane would have made it wait minutes.
    expect(h.order).toContain('end:intent');
    expect(h.order).not.toContain('end:parked');
    expect(h.idleSlots()).toBe(1);
    releaseParked();
    await parked;
  });

  it('gives intent work the approaching-content priority and holds its tail', async () => {
    const h = harness();
    await h.lane.queueIntent('intent', () => {});
    await h.lane.queueScheduled('scheduled', () => {});
    const intent = h.calls.find((c) => c.label === 'intent');
    const scheduled = h.calls.find((c) => c.label === 'scheduled');
    expect(intent).toMatchObject({
      priority: GPU_WORK_PRIORITY.VISIBLE_PREWARM,
      // Held: an intent warm is a synchronous build, so declaring the tail
      // released would hand the queue a claim it cannot honour.
      releaseTail: undefined,
    });
    expect(scheduled).toMatchObject({
      priority: GPU_WORK_PRIORITY.BACKGROUND,
      releaseTail: true,
    });
    expect(GPU_WORK_PRIORITY.VISIBLE_PREWARM).toBeGreaterThan(GPU_WORK_PRIORITY.BACKGROUND);
  });
});
