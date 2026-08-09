import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBackgroundGpuQueue, GPU_WORK_PRIORITY } from '../src/render/background_gpu_queue';
import { withHiddenPrewarmGroups } from '../src/render/prewarm_pass';

describe('createBackgroundGpuQueue', () => {
  it('serializes independent GPU lanes without overlap', async () => {
    const queue = createBackgroundGpuQueue();
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    let releaseFirst!: () => void;
    const first = queue.run(
      () =>
        new Promise<void>((resolve) => {
          active++;
          maxActive = Math.max(maxActive, active);
          events.push('first:start');
          releaseFirst = () => {
            active--;
            events.push('first:end');
            resolve();
          };
        }),
    );
    const second = queue.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      events.push('second:start');
      active--;
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    expect(maxActive).toBe(1);
  });

  it('continues the queue after a failed lane', async () => {
    const queue = createBackgroundGpuQueue();
    const failed = queue.run(async () => {
      throw new Error('gpu lane failed');
    });
    const later = queue.run(async () => 'later');

    await expect(failed).rejects.toThrow('gpu lane failed');
    await expect(later).resolves.toBe('later');
  });

  it('cancels queued work, rejects new work, and quiesces the active unit', async () => {
    const queue = createBackgroundGpuQueue();
    const events: string[] = [];
    let releaseActive!: () => void;
    const active = queue.run(
      () =>
        new Promise<void>((resolve) => {
          events.push('active:start');
          releaseActive = resolve;
        }),
    );
    const pending = queue.run(async () => {
      events.push('pending');
    });
    await Promise.resolve();

    const shutdownError = new Error('renderer generation ended');
    const pendingRejected = expect(pending).rejects.toBe(shutdownError);
    const shutdown = queue.shutdown(shutdownError).then(() => events.push('shutdown'));
    expect(queue.shutdown()).toBe(queue.shutdown());
    await expect(queue.run(async () => {})).rejects.toBe(shutdownError);
    expect(events).toEqual(['active:start']);

    releaseActive();
    await Promise.all([active, pendingRejected, shutdown]);
    expect(events).toEqual(['active:start', 'shutdown']);
  });

  it('shuts down idempotently while idle', async () => {
    const queue = createBackgroundGpuQueue();
    const first = queue.shutdown();
    expect(queue.shutdown()).toBe(first);
    await expect(first).resolves.toBeUndefined();
  });

  it('runs higher-priority pending work first and preserves FIFO within a priority', async () => {
    const queue = createBackgroundGpuQueue();
    const events: string[] = [];
    let releaseActive!: () => void;
    const active = queue.run(
      () =>
        new Promise<void>((resolve) => {
          events.push('active');
          releaseActive = resolve;
        }),
      GPU_WORK_PRIORITY.BACKGROUND,
    );
    await Promise.resolve();

    const low = queue.run(async () => {
      events.push('low');
    }, GPU_WORK_PRIORITY.BOOT_RESUME);
    const highOne = queue.run(async () => {
      events.push('high-one');
    }, GPU_WORK_PRIORITY.LIVE_VIEW);
    const medium = queue.run(async () => {
      events.push('medium');
    }, GPU_WORK_PRIORITY.VISIBLE_PREWARM);
    const highTwo = queue.run(async () => {
      events.push('high-two');
    }, GPU_WORK_PRIORITY.LIVE_VIEW);

    releaseActive();
    await Promise.all([active, low, highOne, medium, highTwo]);
    expect(events).toEqual(['active', 'high-one', 'high-two', 'medium', 'low']);
    expect(GPU_WORK_PRIORITY.ACTIONABLE_VIEW).toBeGreaterThan(GPU_WORK_PRIORITY.LIVE_VIEW);
    expect(GPU_WORK_PRIORITY.LIVE_VIEW).toBeGreaterThan(GPU_WORK_PRIORITY.VISIBLE_PREWARM);
    expect(GPU_WORK_PRIORITY.VISIBLE_PREWARM).toBeGreaterThan(GPU_WORK_PRIORITY.BACKGROUND);
    expect(GPU_WORK_PRIORITY.BACKGROUND).toBeGreaterThan(GPU_WORK_PRIORITY.BOOT_RESUME);
  });

  it('hides a queued group synchronously before an occupied GPU lane releases', async () => {
    const queue = createBackgroundGpuQueue();
    let releaseActive!: () => void;
    const active = queue.run(
      () =>
        new Promise<void>((resolve) => {
          releaseActive = resolve;
        }),
    );
    await Promise.resolve();
    const group = { visible: true, children: [] };
    const queued = withHiddenPrewarmGroups([group], () => queue.run(async () => {}));

    expect(group.visible).toBe(false);
    releaseActive();
    await Promise.all([active, queued]);
    expect(group.visible).toBe(true);
  });

  it('records label, priority, and the sync slice separately from wall time', async () => {
    let clock = 0;
    const queue = createBackgroundGpuQueue({ now: () => clock });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pending = queue.run(
      () => {
        // The synchronous prologue is the main-thread block; the awaited tail
        // is the off-thread link wait and must NOT count as sync cost.
        clock += 12;
        return gate;
      },
      GPU_WORK_PRIORITY.LIVE_VIEW,
      'live-view-gate',
    );
    await Promise.resolve();
    await Promise.resolve();
    clock += 500;
    release();
    await pending;
    const stats = queue.stats();
    expect(stats.units).toBe(1);
    expect(stats.slowest[0].label).toBe('live-view-gate');
    expect(stats.slowest[0].priority).toBe(GPU_WORK_PRIORITY.LIVE_VIEW);
    expect(stats.slowest[0].syncMs).toBe(12);
    expect(stats.slowest[0].wallMs).toBe(512);
  });

  it('keeps the slowest units by sync slice, bounded, defaulting the label', async () => {
    let clock = 0;
    const queue = createBackgroundGpuQueue({ now: () => clock, slowestLimit: 2 });
    for (const ms of [5, 30, 10, 20]) {
      await queue.run(() => {
        clock += ms;
      });
    }
    const stats = queue.stats();
    expect(stats.units).toBe(4);
    expect(stats.slowest.map((unit) => unit.syncMs)).toEqual([30, 20]);
    expect(stats.slowest[0].label).toBe('unlabeled');
    expect(stats.totalSyncMs).toBe(65);
    expect(stats.worstSyncMs).toBe(30);
  });

  it('exposes the running unit with its age and reports none while idle', async () => {
    let clock = 0;
    const queue = createBackgroundGpuQueue({ now: () => clock });
    expect(queue.stats().active).toBeNull();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const running = queue.run(() => gate, GPU_WORK_PRIORITY.LIVE_VIEW, 'live-view-compile');
    const behind = queue.run(async () => {}, GPU_WORK_PRIORITY.BACKGROUND, 'texture-chunk');
    await Promise.resolve();
    clock += 250;

    const busy = queue.stats();
    expect(busy.active).toEqual({
      label: 'live-view-compile',
      priority: GPU_WORK_PRIORITY.LIVE_VIEW,
      ageMs: 250,
      atMs: 0,
    });
    expect(busy.pending).toBe(1);
    expect(busy.units).toBe(0);

    release();
    await Promise.all([running, behind]);
    const idle = queue.stats();
    expect(idle.active).toBeNull();
    expect(idle.pending).toBe(0);
    expect(idle.units).toBe(2);
  });

  it('records a never-settling unit past the threshold without counting it as completed', async () => {
    let clock = 0;
    const queue = createBackgroundGpuQueue({ now: () => clock, stallMs: 4000 });
    // The shape of the r165 compileAsync deadlock: the unit's promise never
    // settles, so no completion callback ever runs for it.
    void queue.run(
      () => new Promise<void>(() => {}),
      GPU_WORK_PRIORITY.ACTIONABLE_VIEW,
      'wedged-compile',
    );
    void queue.run(async () => {}, GPU_WORK_PRIORITY.BACKGROUND, 'texture-chunk');
    await Promise.resolve();

    clock += 3999;
    expect(queue.stats().stalls).toEqual([]);
    clock += 1;
    const stalled = queue.stats();
    expect(stalled.stallCount).toBe(1);
    expect(stalled.stalls).toEqual([
      {
        label: 'wedged-compile',
        priority: GPU_WORK_PRIORITY.ACTIONABLE_VIEW,
        ageMs: 4000,
        atMs: 0,
        settled: false,
      },
    ]);
    expect(stalled.active?.label).toBe('wedged-compile');
    expect(stalled.pending).toBe(1);
    // It is a stall, not a completed unit: nothing lands in the completed-unit
    // reporting, which is exactly why it used to be invisible.
    expect(stalled.units).toBe(0);
    expect(stalled.totalSyncMs).toBe(0);
    expect(stalled.worstSyncMs).toBe(0);
    expect(stalled.slowest).toEqual([]);

    clock += 10_000;
    const later = queue.stats();
    expect(later.stallCount).toBe(1);
    expect(later.stalls[0].ageMs).toBe(14_000);
    expect(later.stalls[0].settled).toBe(false);
    expect(later.active?.ageMs).toBe(14_000);
  });

  it('settles a stall when the unit finishes and leaves the slowest ring on sync time', async () => {
    let clock = 0;
    const queue = createBackgroundGpuQueue({ now: () => clock, stallMs: 1000 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = queue.run(
      () => {
        clock += 8;
        return gate;
      },
      GPU_WORK_PRIORITY.VISIBLE_PREWARM,
      'zone-prewarm',
    );
    await Promise.resolve();
    await Promise.resolve();
    clock += 5000;
    release();
    await slow;

    const stats = queue.stats();
    expect(stats.active).toBeNull();
    expect(stats.stallCount).toBe(1);
    expect(stats.stalls).toEqual([
      {
        label: 'zone-prewarm',
        priority: GPU_WORK_PRIORITY.VISIBLE_PREWARM,
        ageMs: 5008,
        atMs: 0,
        settled: true,
      },
    ]);
    // Completed-unit reporting is unchanged: the sync slice, not the wall time,
    // still drives worstSyncMs and the slowest ring.
    expect(stats.units).toBe(1);
    expect(stats.worstSyncMs).toBe(8);
    expect(stats.slowest[0].syncMs).toBe(8);
    expect(stats.slowest[0].wallMs).toBe(5008);
  });

  it('bounds the retained stalls while counting every one of them', async () => {
    let clock = 0;
    const queue = createBackgroundGpuQueue({ now: () => clock, stallMs: 100, stallLimit: 2 });
    for (const label of ['first', 'second', 'third']) {
      await queue.run(
        () => {
          clock += 500;
        },
        GPU_WORK_PRIORITY.BACKGROUND,
        label,
      );
    }
    const stats = queue.stats();
    expect(stats.stallCount).toBe(3);
    expect(stats.stalls.map((stall) => stall.label)).toEqual(['second', 'third']);
    expect(stats.stalls.every((stall) => stall.settled)).toBe(true);
    expect(stats.units).toBe(3);
  });

  it('wires sky, feature, archetype, and boot-resume units through one renderer queue', () => {
    const source = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const method = (startText: string, endText: string): string => {
      const start = source.indexOf(startText);
      const end = source.indexOf(endText, start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end);
    };
    const sky = method('private async prepareZoneSky(', '\n  /**\n   * Materialize the terrain');
    const features = method('prepareZoneAt(', '\n  /** Stage wall-times');
    const archetypes = method('async prewarmZoneAt(', '\n  /** Blocking-path neighborhood prepare');
    const texture = method('private prewarmTextureInIdle(', '\n  private prewarmMaterialTextures(');
    const initial = method('async prewarmInitialScene(', '\n  // Visual reactions to sim events');
    expect(source).toContain('private backgroundGpuWork = createBackgroundGpuQueue()');
    expect(sky).toContain('this.backgroundGpuWork.run(');
    expect(features).toContain('this.backgroundGpuWork.run(');
    expect(archetypes).toContain('this.backgroundGpuWork.run(');
    expect(texture).toContain('this.backgroundGpuWork.run(');
    expect(initial).toContain(
      'this.backgroundGpuWork.run(unit.run, GPU_WORK_PRIORITY.BOOT_RESUME, unit.id)',
    );
  });
});
