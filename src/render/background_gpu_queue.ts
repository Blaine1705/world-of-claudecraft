// Shared priority arbiter for work that reaches WebGL. A browser idle callback
// only says when a unit may start; it does not prevent independent zone,
// texture, PMREM, archetype, and live compile lanes from starting together.

export const GPU_WORK_PRIORITY = {
  BOOT_RESUME: 0,
  BACKGROUND: 10,
  VISIBLE_PREWARM: 20,
  LIVE_VIEW: 30,
  ACTIONABLE_VIEW: 40,
} as const;

interface PendingGpuWork<T> {
  order: number;
  priority: number;
  label: string;
  work: () => T | Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

/** One completed unit's timing. syncMs is the MAIN-THREAD block (the call up
 *  to its return, i.e. a compileAsync prologue or a whole synchronous upload);
 *  wallMs adds the awaited tail, which for an async link waits off-thread. */
export interface GpuWorkUnitStat {
  label: string;
  priority: number;
  syncMs: number;
  wallMs: number;
  atMs: number;
}

/** The unit the drain loop is awaiting right now. The queue is serial, so this
 *  one unit is what every pending unit in every lane is waiting on. */
export interface GpuWorkActiveUnit {
  label: string;
  priority: number;
  /** Wall time since the unit started, i.e. how long it has been running. */
  ageMs: number;
  atMs: number;
}

/** A unit observed past the stall threshold. `settled: false` is the case a
 *  completed-unit ring can never show: it had still not finished when the
 *  stats were read. */
export interface GpuWorkStallStat {
  label: string;
  priority: number;
  /** Longest unsettled age observed, or the final wall time once it settled. */
  ageMs: number;
  atMs: number;
  settled: boolean;
}

export interface BackgroundGpuQueueStats {
  units: number;
  totalSyncMs: number;
  worstSyncMs: number;
  /** Slowest units by sync slice, worst first, bounded. */
  slowest: GpuWorkUnitStat[];
  /** Units queued behind the running one: the backlog a wedge accumulates. */
  pending: number;
  /** The running unit, or null when the queue is idle. */
  active: GpuWorkActiveUnit | null;
  /** Every unit seen past the stall threshold, including evicted records. A
   *  non-zero count is not by itself a wedged queue: a long hold that ended
   *  counts too. A wedge is an unsettled stall plus an `active` naming it. */
  stallCount: number;
  /** Most recent stalls, bounded. */
  stalls: GpuWorkStallStat[];
}

export interface BackgroundGpuQueue {
  run<T>(work: () => T | Promise<T>, priority?: number, label?: string): Promise<T>;
  /** Per-unit timing plus the running unit: names which lane's units block the
   *  main thread, and which one is currently blocking the whole queue. */
  stats(): BackgroundGpuQueueStats;
  /** Reject queued work, stop accepting more, and await the active unit. */
  shutdown(reason?: Error): Promise<void>;
}

const DEFAULT_SLOWEST_LIMIT = 20;
// Low on purpose, because a hold this long is worth seeing whether or not it
// ends. A live compile gate waiting out a non-cancellable driver link really
// does occupy the serial queue for seconds (a local run measured 7.5 s on a
// unit that cost 2.5 ms of main-thread time), and every other lane waits behind
// it. Those records settle; a wedge is the record that never does.
const DEFAULT_STALL_MS = 4000;
const DEFAULT_STALL_LIMIT = 8;

interface RunningGpuWork {
  entry: PendingGpuWork<unknown>;
  startedAt: number;
  stall: GpuWorkStallStat | null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function createBackgroundGpuQueue(opts?: {
  now?: () => number;
  slowestLimit?: number;
  stallMs?: number;
  stallLimit?: number;
}): BackgroundGpuQueue {
  const now = opts?.now ?? ((): number => performance.now());
  const slowestLimit = Math.max(1, opts?.slowestLimit ?? DEFAULT_SLOWEST_LIMIT);
  const stallMs = Math.max(1, opts?.stallMs ?? DEFAULT_STALL_MS);
  const stallLimit = Math.max(1, opts?.stallLimit ?? DEFAULT_STALL_LIMIT);
  const pending: PendingGpuWork<unknown>[] = [];
  const slowest: GpuWorkUnitStat[] = [];
  const stalls: GpuWorkStallStat[] = [];
  let units = 0;
  let totalSyncMs = 0;
  let worstSyncMs = 0;
  let stallCount = 0;
  let running: RunningGpuWork | null = null;
  let active = false;
  let accepting = true;
  let nextOrder = 0;
  let shutdownReason: Error | null = null;
  let shutdownPromise: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;

  // A unit that never settles has no completion callback to record it, so the
  // threshold is evaluated wherever the queue is observed instead: at every
  // stats() read while the unit is still running, and once more if it settles.
  const noteStall = (unit: RunningGpuWork, ageMs: number): void => {
    if (ageMs < stallMs) return;
    if (unit.stall) {
      if (ageMs > unit.stall.ageMs) unit.stall.ageMs = ageMs;
      return;
    }
    stallCount++;
    unit.stall = {
      label: unit.entry.label,
      priority: unit.entry.priority,
      ageMs,
      atMs: unit.startedAt,
      settled: false,
    };
    stalls.push(unit.stall);
    if (stalls.length > stallLimit) stalls.shift();
  };

  const recordUnit = (unit: RunningGpuWork, syncMs: number): void => {
    units++;
    totalSyncMs += syncMs;
    if (syncMs > worstSyncMs) worstSyncMs = syncMs;
    const wallMs = now() - unit.startedAt;
    noteStall(unit, wallMs);
    if (unit.stall) unit.stall.settled = true;
    const stat: GpuWorkUnitStat = {
      label: unit.entry.label,
      priority: unit.entry.priority,
      syncMs,
      wallMs,
      atMs: unit.startedAt,
    };
    let index = slowest.length;
    while (index > 0 && slowest[index - 1].syncMs < stat.syncMs) index--;
    slowest.splice(index, 0, stat);
    if (slowest.length > slowestLimit) slowest.length = slowestLimit;
  };

  const settleShutdownIfIdle = (): void => {
    if (accepting || active || pending.length > 0) return;
    resolveShutdown?.();
    resolveShutdown = null;
  };

  const drain = async (): Promise<void> => {
    while (pending.length > 0) {
      let selectedIndex = 0;
      for (let index = 1; index < pending.length; index++) {
        const candidate = pending[index];
        const selected = pending[selectedIndex];
        if (
          candidate.priority > selected.priority ||
          (candidate.priority === selected.priority && candidate.order < selected.order)
        ) {
          selectedIndex = index;
        }
      }
      const [next] = pending.splice(selectedIndex, 1);
      const unit: RunningGpuWork = { entry: next, startedAt: now(), stall: null };
      running = unit;
      let syncMs = 0;
      try {
        const returned = next.work();
        syncMs = now() - unit.startedAt;
        next.resolve(await returned);
      } catch (error) {
        if (syncMs === 0) syncMs = now() - unit.startedAt;
        next.reject(error);
      } finally {
        running = null;
        recordUnit(unit, syncMs);
      }
    }
    active = false;
    // A run() call can land after the loop observes an empty queue but before
    // this async continuation clears active. Start another drain in that case.
    if (pending.length > 0) scheduleDrain();
    else settleShutdownIfIdle();
  };

  const scheduleDrain = (): void => {
    if (active) return;
    active = true;
    void Promise.resolve().then(drain);
  };

  return {
    run<T>(
      work: () => T | Promise<T>,
      priority = GPU_WORK_PRIORITY.BACKGROUND,
      label = 'unlabeled',
    ): Promise<T> {
      if (!accepting) {
        return Promise.reject(shutdownReason ?? new Error('Background GPU queue is shut down'));
      }
      const result = new Promise<T>((resolve, reject) => {
        pending.push({
          order: nextOrder++,
          priority,
          label,
          work,
          resolve,
          reject,
        } as PendingGpuWork<unknown>);
      });
      scheduleDrain();
      return result;
    },
    stats(): BackgroundGpuQueueStats {
      let activeUnit: GpuWorkActiveUnit | null = null;
      if (running) {
        const ageMs = now() - running.startedAt;
        noteStall(running, ageMs);
        activeUnit = {
          label: running.entry.label,
          priority: running.entry.priority,
          ageMs: round1(ageMs),
          atMs: Math.round(running.startedAt),
        };
      }
      return {
        units,
        totalSyncMs: round1(totalSyncMs),
        worstSyncMs: round1(worstSyncMs),
        slowest: slowest.map((stat) => ({
          ...stat,
          syncMs: round1(stat.syncMs),
          wallMs: round1(stat.wallMs),
          atMs: Math.round(stat.atMs),
        })),
        pending: pending.length,
        active: activeUnit,
        stallCount,
        stalls: stalls.map((stall) => ({
          ...stall,
          ageMs: round1(stall.ageMs),
          atMs: Math.round(stall.atMs),
        })),
      };
    },
    shutdown(reason = new Error('Background GPU queue is shut down')): Promise<void> {
      if (shutdownPromise) return shutdownPromise;
      accepting = false;
      shutdownReason = reason;
      for (const entry of pending.splice(0)) entry.reject(reason);
      shutdownPromise = new Promise<void>((resolve) => {
        resolveShutdown = resolve;
      });
      settleShutdownIfIdle();
      return shutdownPromise;
    },
  };
}
