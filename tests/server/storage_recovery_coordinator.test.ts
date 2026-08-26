import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_RECOVERY_BACKOFF_MS,
  STORAGE_RECOVERY_DRIVE_CONCURRENCY,
  STORAGE_RECOVERY_MAX_TRACKED,
  STORAGE_RECOVERY_SCAN_CONCURRENCY,
  STORAGE_RECOVERY_START_BURST,
  STORAGE_RECOVERY_START_RATE_PER_SECOND,
  STORAGE_RECOVERY_WARNING_WINDOW_MS,
  StorageRecoveryCoordinator,
  type StorageRecoveryScheduler,
  storageRecoveryRetryDelay,
} from '../../server/storage_recovery_coordinator';

interface Row {
  idempotencyKey: string;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeScheduler(random = 0) {
  let nowMs = 0;
  const timers: { delay: number; dueAt: number; run: () => void; cancelled: boolean }[] = [];
  const turns: (() => void)[] = [];
  const scheduler: StorageRecoveryScheduler = {
    schedule: (delay, run) => {
      const timer = { delay, dueAt: nowMs + delay, run, cancelled: false };
      timers.push(timer);
      return { cancel: () => (timer.cancelled = true) };
    },
    now: () => nowMs,
    random: () => random,
    yieldTurn: (run) => turns.push(run),
  };
  const fireNext = (): void => {
    const timer = timers
      .filter((candidate) => !candidate.cancelled)
      .sort((a, b) => a.dueAt - b.dueAt)[0];
    if (!timer) throw new Error('no live timer');
    timer.cancelled = true;
    nowMs = Math.max(nowMs, timer.dueAt);
    timer.run();
  };
  const yieldNext = (): void => {
    const run = turns.shift();
    if (!run) throw new Error('no yielded turn');
    run();
  };
  return {
    scheduler,
    timers,
    turns,
    fireNext,
    yieldNext,
    now: () => nowMs,
    setNow: (value: number) => {
      nowMs = value;
    },
  };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('StorageRecoveryCoordinator', () => {
  it('pins the hard population and concurrency bounds', () => {
    expect(STORAGE_RECOVERY_MAX_TRACKED).toBe(5_000);
    expect(STORAGE_RECOVERY_SCAN_CONCURRENCY).toBe(2);
    expect(STORAGE_RECOVERY_DRIVE_CONCURRENCY).toBe(2);
    expect(STORAGE_RECOVERY_START_RATE_PER_SECOND).toBe(10);
    expect(STORAGE_RECOVERY_START_BURST).toBe(2);
    expect(STORAGE_RECOVERY_WARNING_WINDOW_MS).toBe(60_000);
    expect(STORAGE_RECOVERY_BACKOFF_MS).toEqual([2_000, 5_000, 15_000, 30_000, 60_000]);
  });

  it('coalesces duplicate kicks and admits no more than the tracked-key cap', () => {
    const scheduler = fakeScheduler();
    const never = new Promise<Row | null>(() => {});
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => never,
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    expect(coordinator.kick(1)).toBe(true);
    for (let n = 1; n < 20; n++) expect(coordinator.kick(1)).toBe(true);
    for (let n = 2; n <= STORAGE_RECOVERY_MAX_TRACKED; n++) {
      expect(coordinator.kick(n)).toBe(true);
    }
    expect(coordinator.kick(STORAGE_RECOVERY_MAX_TRACKED + 1)).toBe(false);
    expect(coordinator.metrics()).toMatchObject({
      tracked: STORAGE_RECOVERY_MAX_TRACKED,
      scanActive: STORAGE_RECOVERY_SCAN_CONCURRENCY,
      scanQueued: STORAGE_RECOVERY_MAX_TRACKED - STORAGE_RECOVERY_SCAN_CONCURRENCY,
      coalescedKicks: 19,
      capacityRefusals: 1,
    });
    coordinator.reset();
  });

  it('evicts the exact offline key in O(1), even behind thousands of live entries', () => {
    const scheduler = fakeScheduler();
    const never = new Promise<Row | null>(() => {});
    const released: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => never,
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: (characterId) => released.push(characterId),
        canEvict: (characterId) => characterId <= STORAGE_RECOVERY_MAX_TRACKED,
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= STORAGE_RECOVERY_MAX_TRACKED; id++) {
      expect(coordinator.kick(id)).toBe(true);
    }
    coordinator.characterOffline(33);

    expect(coordinator.kick(STORAGE_RECOVERY_MAX_TRACKED + 1)).toBe(true);
    expect(coordinator.kick(STORAGE_RECOVERY_MAX_TRACKED + 1)).toBe(true);
    expect(coordinator.metrics()).toMatchObject({
      tracked: STORAGE_RECOVERY_MAX_TRACKED,
      capacityEvictions: 1,
      capacityEvictionProbes: 1,
      capacityRefusals: 0,
      coalescedKicks: 1,
    });
    expect(released).toEqual([33]);
    coordinator.reset();
  });

  it('does no candidate scan when saturation has no teardown-confirmed offline key', () => {
    const scheduler = fakeScheduler();
    const never = new Promise<Row | null>(() => {});
    const canEvict = vi.fn(() => false);
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => never,
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: vi.fn(),
        canEvict,
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= STORAGE_RECOVERY_MAX_TRACKED; id++) coordinator.kick(id);

    expect(coordinator.kick(STORAGE_RECOVERY_MAX_TRACKED + 1)).toBe(false);
    expect(canEvict).not.toHaveBeenCalled();
    expect(coordinator.metrics()).toMatchObject({
      tracked: STORAGE_RECOVERY_MAX_TRACKED,
      capacityRefusals: 1,
      capacityEvictions: 0,
      capacityEvictionProbes: 0,
    });
    coordinator.reset();
  });

  it('removes an offline entry from eviction eligibility when a newer kick marks it live', () => {
    const scheduler = fakeScheduler();
    const never = new Promise<Row | null>(() => {});
    const released: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => never,
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: (characterId) => released.push(characterId),
        canEvict: () => true,
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= STORAGE_RECOVERY_MAX_TRACKED; id++) coordinator.kick(id);
    coordinator.characterOffline(33);
    expect(coordinator.kick(33)).toBe(true);

    expect(coordinator.kick(STORAGE_RECOVERY_MAX_TRACKED + 1)).toBe(false);
    expect(released).toEqual([]);
    coordinator.reset();
  });

  it('keeps FIFO strong-reference storage bounded through more than twice-cap eviction churn', () => {
    const scheduler = fakeScheduler();
    const never = new Promise<Row | null>(() => {});
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => never,
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: vi.fn(),
        canEvict: () => true,
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= STORAGE_RECOVERY_MAX_TRACKED; id++) coordinator.kick(id);
    for (let offset = 0; offset < STORAGE_RECOVERY_MAX_TRACKED * 2 + 1; offset++) {
      const victim = 3 + offset;
      const replacement = STORAGE_RECOVERY_MAX_TRACKED + 1 + offset;
      coordinator.characterOffline(victim);
      expect(coordinator.kick(replacement)).toBe(true);
    }
    expect(coordinator.metrics()).toMatchObject({
      tracked: STORAGE_RECOVERY_MAX_TRACKED,
      capacityEvictions: STORAGE_RECOVERY_MAX_TRACKED * 2 + 1,
      queuedStorage: STORAGE_RECOVERY_MAX_TRACKED - STORAGE_RECOVERY_SCAN_CONCURRENCY,
    });
    coordinator.reset();
  });

  it('aggregates repeated recovery warnings by fixed failure kind and reports suppression', () => {
    const scheduler = fakeScheduler();
    const warn = vi.fn();
    const never = new Promise<Row | null>(() => {});
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => never,
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn,
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= STORAGE_RECOVERY_MAX_TRACKED; id++) coordinator.kick(id);
    for (let id = 1; id <= 100; id++) {
      expect(coordinator.kick(STORAGE_RECOVERY_MAX_TRACKED + id)).toBe(false);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(coordinator.metrics()).toMatchObject({
      warningsEmitted: 1,
      warningsSuppressed: 99,
    });

    scheduler.setNow(STORAGE_RECOVERY_WARNING_WINDOW_MS);
    expect(coordinator.kick(STORAGE_RECOVERY_MAX_TRACKED + 101)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toContain('99 similar failures suppressed');
    coordinator.reset();
  });

  it('aggregates host-construction failures without allocating per-key state', () => {
    const scheduler = fakeScheduler();
    const warn = vi.fn();
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: async () => null,
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn,
      },
      scheduler.scheduler,
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      coordinator.reportHostFailure(new Error('runtime unavailable'));
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(coordinator.metrics()).toMatchObject({
      tracked: 0,
      warningsEmitted: 1,
      warningsSuppressed: 99,
    });
  });

  it('rate-limits a 5,000-key fast-drive burst after two immediate starts', async () => {
    const scheduler = fakeScheduler();
    const startedAt: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: async (characterId) => ({ idempotencyKey: `k${characterId}` }),
        reserve: () => true,
        drive: async () => {
          startedAt.push(scheduler.now());
          return 'stop';
        },
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= STORAGE_RECOVERY_MAX_TRACKED; id++) coordinator.kick(id);
    await vi.waitFor(() => {
      expect(coordinator.metrics().scansStarted).toBe(STORAGE_RECOVERY_MAX_TRACKED);
    });

    expect(startedAt.filter((time) => time === 0)).toHaveLength(2);
    expect(coordinator.metrics()).toMatchObject({
      rateLimitedQueued: STORAGE_RECOVERY_MAX_TRACKED - 2,
      startRateGateTimers: 1,
    });
    for (let count = 0; count < 10; count++) {
      scheduler.fireNext();
      await tick();
    }
    expect(startedAt.filter((time) => time > 0 && time <= 1_000)).toHaveLength(10);
    expect(startedAt).toHaveLength(12);
    coordinator.reset();
  });

  it('starts a failed-scan retry while both drive slots are saturated', async () => {
    const scheduler = fakeScheduler();
    const driveGates = [deferred<'stop'>(), deferred<'stop'>()];
    let retryScans = 0;
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: async (characterId) => {
          if (characterId === 3) {
            retryScans++;
            if (retryScans === 1) throw new Error('pool unavailable');
            return null;
          }
          return { idempotencyKey: `k${characterId}` };
        },
        reserve: () => true,
        drive: async (characterId) => driveGates[characterId - 1].promise,
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    coordinator.kick(1);
    coordinator.kick(2);
    await vi.waitFor(() => expect(coordinator.metrics().driveActive).toBe(2));
    coordinator.kick(3);
    await vi.waitFor(() => expect(coordinator.metrics().retryTimers).toBe(1));

    scheduler.fireNext();
    await tick();
    expect(retryScans).toBe(2);
    expect(coordinator.metrics().driveActive).toBe(2);
    coordinator.reset();
  });

  it('starts a queued drive while both scan slots are saturated', async () => {
    const scheduler = fakeScheduler();
    const scanGate = deferred<Row | null>();
    const drives: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => scanGate.promise,
        reserve: () => true,
        drive: async (characterId) => {
          drives.push(characterId);
          return 'stop';
        },
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    coordinator.kick(1);
    coordinator.kick(2);
    expect(coordinator.metrics().scanActive).toBe(2);
    expect(coordinator.defer(3, { idempotencyKey: 'known-row' })).toBe(true);

    scheduler.fireNext();
    await tick();
    expect(drives).toEqual([3]);
    expect(coordinator.metrics().scanActive).toBe(2);
    coordinator.reset();
  });

  it('recovers token refill immediately after an injected clock regression', async () => {
    const scheduler = fakeScheduler();
    const startedAt: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: async (characterId) => ({ idempotencyKey: `k${characterId}` }),
        reserve: () => true,
        drive: async () => {
          startedAt.push(scheduler.now());
          return 'stop';
        },
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    coordinator.kick(1);
    coordinator.kick(2);
    coordinator.kick(3);
    await vi.waitFor(() => expect(startedAt).toHaveLength(2));

    scheduler.setNow(-1_000);
    coordinator.kick(4);
    await tick();
    expect(startedAt).toHaveLength(2);
    scheduler.setNow(-900);
    coordinator.kick(5);
    await vi.waitFor(() => expect(startedAt).toHaveLength(3));
    coordinator.reset();
  });

  it('uses an indexed queue rather than quadratic Array.shift under the cap burst', () => {
    const source = readFileSync(
      new URL('../../server/storage_recovery_coordinator.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('.shift()');
    expect(source).toContain('this.dequeueScan()');
    expect(source).toContain('this.dequeueRateLimited(kind)');
  });

  it('reports only the live suffix after indexed dequeue advances', async () => {
    const scheduler = fakeScheduler();
    const gates = new Map<number, ReturnType<typeof deferred<Row | null>>>();
    const started: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: (characterId) => {
          started.push(characterId);
          const gate = deferred<Row | null>();
          gates.set(characterId, gate);
          return gate.promise;
        },
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= 5; id++) coordinator.kick(id);
    expect(coordinator.metrics()).toMatchObject({ scanActive: 2, scanQueued: 3 });

    const first = gates.get(1);
    if (!first) throw new Error('first scan did not start');
    first.resolve(null);
    await tick();
    expect(started).toEqual([1, 2, 3]);
    // Entries 1, 2, and 3 remain in the backing array's consumed prefix, but
    // only characters 4 and 5 are queued work an operator should see.
    expect(coordinator.metrics()).toMatchObject({ scanActive: 2, scanQueued: 2 });
    coordinator.reset();
  });

  it('runs at most two scans and two drives while preserving every admitted key', async () => {
    const scheduler = fakeScheduler();
    const scanGates: ReturnType<typeof deferred<Row | null>>[] = [];
    const driveGates: ReturnType<typeof deferred<'done'>>[] = [];
    const startedScans: number[] = [];
    const startedDrives: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: (characterId) => {
          startedScans.push(characterId);
          const gate = deferred<Row | null>();
          scanGates.push(gate);
          return gate.promise;
        },
        reserve: () => true,
        drive: (characterId) => {
          startedDrives.push(characterId);
          const gate = deferred<'done'>();
          driveGates.push(gate);
          return gate.promise;
        },
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= 7; id++) coordinator.kick(id);
    expect(startedScans).toEqual([1, 2]);
    scanGates[0].resolve({ idempotencyKey: 'k1' });
    scanGates[1].resolve({ idempotencyKey: 'k2' });
    await tick();
    expect(startedDrives).toEqual([1, 2]);
    expect(coordinator.metrics()).toMatchObject({ scanActive: 2, driveActive: 2 });

    driveGates[0].resolve('done');
    driveGates[1].resolve('done');
    await tick();
    expect(scheduler.turns).toHaveLength(2);
    scheduler.yieldNext();
    scheduler.yieldNext();
    await tick();
    expect(Math.max(coordinator.metrics().scanActive, 0)).toBeLessThanOrEqual(2);
    expect(Math.max(coordinator.metrics().driveActive, 0)).toBeLessThanOrEqual(2);
    coordinator.reset();
  });

  it('processes one row per turn and reserves it before drive starts', async () => {
    const scheduler = fakeScheduler();
    const events: string[] = [];
    const rows: (Row | null)[] = [{ idempotencyKey: 'a' }, { idempotencyKey: 'b' }, null];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: async () => rows.shift() ?? null,
        reserve: (_characterId, row) => {
          events.push(`reserve:${row.idempotencyKey}`);
          return true;
        },
        drive: async (_characterId, row) => {
          events.push(`drive:${row.idempotencyKey}`);
          return 'done';
        },
        prepareScan: (_characterId, row) => events.push(`rescan:${row?.idempotencyKey}`),
        release: (_characterId, row) => events.push(`release:${row?.idempotencyKey ?? 'scan'}`),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    coordinator.kick(7);
    await tick();
    expect(events).toEqual(['reserve:a', 'drive:a', 'rescan:a']);
    expect(scheduler.turns).toHaveLength(1);
    scheduler.yieldNext();
    await tick();
    expect(events).toEqual([
      'reserve:a',
      'drive:a',
      'rescan:a',
      'reserve:b',
      'drive:b',
      'rescan:b',
    ]);
    scheduler.yieldNext();
    await tick();
    expect(events.at(-1)).toBe('release:scan');
    expect(coordinator.metrics().tracked).toBe(0);
  });

  it('the default scheduler crosses a macrotask boundary between rows', async () => {
    let scans = 0;
    const coordinator = new StorageRecoveryCoordinator<Row>({
      scan: async () => (++scans === 1 ? { idempotencyKey: 'first' } : null),
      reserve: () => true,
      drive: async () => 'done',
      prepareScan: vi.fn(),
      release: vi.fn(),
      warn: vi.fn(),
    });
    coordinator.kick(12);
    await tick();
    expect(scans).toBe(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await tick();
    expect(scans).toBe(2);
    coordinator.reset();
  });

  it('a known-row defer racing an older empty scan demands a follow-up and returns unadopted', async () => {
    const scheduler = fakeScheduler();
    const firstScan = deferred<Row | null>();
    let scans = 0;
    const driven: string[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => {
          scans++;
          return scans === 1
            ? firstScan.promise
            : Promise.resolve({ idempotencyKey: 'inserted-after-snapshot' });
        },
        reserve: () => true,
        drive: async (_characterId, row) => {
          driven.push(row.idempotencyKey);
          return 'stop';
        },
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    expect(coordinator.kick(13)).toBe(true);
    expect(coordinator.defer(13, { idempotencyKey: 'inserted-after-snapshot' })).toBe(false);
    firstScan.resolve(null);
    await tick();
    expect(scheduler.turns).toHaveLength(1);
    scheduler.yieldNext();
    await tick();
    expect(scans).toBe(2);
    expect(driven).toEqual(['inserted-after-snapshot']);
    expect(coordinator.metrics().tracked).toBe(0);
  });

  it('a coalesced kick racing an older empty scan demands one follow-up scan', async () => {
    const scheduler = fakeScheduler();
    const firstScan = deferred<Row | null>();
    let scans = 0;
    const driven: string[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => {
          scans++;
          return scans === 1
            ? firstScan.promise
            : Promise.resolve({ idempotencyKey: 'inserted-after-snapshot' });
        },
        reserve: () => true,
        drive: async (_characterId, row) => {
          driven.push(row.idempotencyKey);
          return 'stop';
        },
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    expect(coordinator.kick(14)).toBe(true);
    expect(coordinator.kick(14)).toBe(true);
    firstScan.resolve(null);
    await tick();
    expect(scheduler.turns).toHaveLength(1);
    scheduler.yieldNext();
    await tick();
    expect(scans).toBe(2);
    expect(driven).toEqual(['inserted-after-snapshot']);
    expect(coordinator.metrics().tracked).toBe(0);
  });

  it('uses one equal-jitter timer per key across the capped backoff ladder', async () => {
    const scheduler = fakeScheduler(0.5);
    const attempts: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: async () => ({ idempotencyKey: 'retry-me' }),
        reserve: () => true,
        drive: async () => {
          attempts.push(attempts.length);
          return 'retry';
        },
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    coordinator.kick(9);
    await tick();
    for (let attempt = 0; attempt < 7; attempt++) {
      const base = STORAGE_RECOVERY_BACKOFF_MS[Math.min(attempt, 4)];
      const live = scheduler.timers.filter((timer) => !timer.cancelled);
      expect(live).toHaveLength(1);
      expect(live[0].delay).toBe(storageRecoveryRetryDelay(base, 0.5));
      scheduler.fireNext();
      await tick();
    }
    expect(attempts).toHaveLength(8);
    coordinator.reset();
  });

  it('cancels queued and timed work on stop, then drains active work', async () => {
    const scheduler = fakeScheduler();
    const activeScan = deferred<Row | null>();
    const releases: string[] = [];
    let scans = 0;
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: () => {
          scans++;
          return activeScan.promise;
        },
        reserve: () => true,
        drive: async () => 'done',
        prepareScan: vi.fn(),
        release: (characterId) => releases.push(String(characterId)),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    coordinator.kick(1);
    coordinator.kick(2);
    coordinator.kick(3);
    expect(scans).toBe(2);
    let stopped = false;
    const stopping = coordinator.stop().then(() => {
      stopped = true;
    });
    await tick();
    expect(stopped).toBe(false);
    expect(releases).toContain('3');
    activeScan.resolve(null);
    // Both active calls share the same promise in this fixture.
    await stopping;
    expect(stopped).toBe(true);
    expect(coordinator.kick(4)).toBe(false);
    expect(coordinator.metrics().tracked).toBe(0);
  });

  it('a stopped queued drive never starts and its current guard turns false', async () => {
    const scheduler = fakeScheduler();
    const firstDrive = deferred<'stop'>();
    const guards: (() => boolean)[] = [];
    const started: number[] = [];
    const coordinator = new StorageRecoveryCoordinator<Row>(
      {
        scan: async (characterId) => ({ idempotencyKey: `k${characterId}` }),
        reserve: () => true,
        drive: (characterId, _row, isCurrent) => {
          started.push(characterId);
          guards.push(isCurrent);
          return firstDrive.promise;
        },
        prepareScan: vi.fn(),
        release: vi.fn(),
        warn: vi.fn(),
      },
      scheduler.scheduler,
    );
    for (let id = 1; id <= 4; id++) coordinator.kick(id);
    await tick();
    expect(started).toEqual([1, 2]);
    expect(guards.every((guard) => guard())).toBe(true);
    const stopping = coordinator.stop();
    expect(guards.every((guard) => !guard())).toBe(true);
    expect(started).toEqual([1, 2]);
    firstDrive.resolve('stop');
    await stopping;
    expect(started).toEqual([1, 2]);
  });
});
