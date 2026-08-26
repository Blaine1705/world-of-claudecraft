// Realm-local admission for database-heavy background work.
//
// The pg Pool is shared with login, auth, and player request traffic. Autosave,
// storage-purchase recovery, and World Market escrow each have useful local
// concurrency limits, but independent limits can still add up past the pool's
// capacity. This one gate composes those producers and leaves an interactive
// reserve instead of making the pool checkout queue the first backpressure
// boundary.

export const BACKGROUND_DB_INTERACTIVE_RESERVE = 2;

export interface BackgroundDbPermit {
  /** Idempotent: a stale finally block cannot over-release the gate. */
  release(): void;
}

export interface BackgroundDbGateStats {
  inFlight: number;
  waiting: number;
  max: number;
  interactiveReserve: number;
  acquired: number;
  refused: number;
  cancelled: number;
}

export interface BackgroundDbGate {
  /** FIFO wait for background work that is safe to delay. Null means the
   * caller's AbortSignal fired before a permit was granted. */
  acquire(signal?: AbortSignal): Promise<BackgroundDbPermit | null>;
  /** Immediate admission for request-path work whose caller owns the retry. */
  tryAcquire(): BackgroundDbPermit | null;
  stats(): BackgroundDbGateStats;
}

interface Waiter {
  readonly resolve: (permit: BackgroundDbPermit | null) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}

/** At very small operator-configured pools, keep one background lane so
 * durability can still make progress. The full two-client reserve therefore
 * exists whenever the pool has at least three clients; smaller pools report
 * their reduced effective reserve truthfully in stats(). */
export function backgroundDbCapacity(
  poolMaxClients: number,
  requestedReserve = BACKGROUND_DB_INTERACTIVE_RESERVE,
): number {
  const poolMax = Math.max(1, Math.floor(poolMaxClients));
  const reserve = Math.max(0, Math.floor(requestedReserve));
  return Math.max(1, poolMax - reserve);
}

export function createBackgroundDbGate(
  poolMaxClients: number,
  requestedReserve = BACKGROUND_DB_INTERACTIVE_RESERVE,
): BackgroundDbGate {
  const poolMax = Math.max(1, Math.floor(poolMaxClients));
  const max = backgroundDbCapacity(poolMax, requestedReserve);
  const waiters = new Map<object, Waiter>();
  let inFlight = 0;
  let acquired = 0;
  let refused = 0;
  let cancelled = 0;

  function permit(): BackgroundDbPermit {
    let held = true;
    inFlight++;
    acquired++;
    return {
      release(): void {
        if (!held) return;
        held = false;
        inFlight = Math.max(0, inFlight - 1);
        grantWaiters();
      },
    };
  }

  function grantWaiters(): void {
    while (inFlight < max) {
      const next = waiters.entries().next().value as [object, Waiter] | undefined;
      if (!next) return;
      const [token, waiter] = next;
      waiters.delete(token);
      if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort);
      if (waiter.signal?.aborted) {
        cancelled++;
        waiter.resolve(null);
        continue;
      }
      waiter.resolve(permit());
    }
  }

  return {
    acquire(signal?: AbortSignal): Promise<BackgroundDbPermit | null> {
      if (signal?.aborted) {
        cancelled++;
        return Promise.resolve(null);
      }
      if (inFlight < max && waiters.size === 0) return Promise.resolve(permit());
      return new Promise((resolve) => {
        const token = {};
        const onAbort = signal
          ? () => {
              if (!waiters.delete(token)) return;
              signal.removeEventListener('abort', onAbort);
              cancelled++;
              resolve(null);
            }
          : undefined;
        waiters.set(token, { resolve, signal, onAbort });
        if (signal && onAbort) signal.addEventListener('abort', onAbort, { once: true });
      });
    },
    tryAcquire(): BackgroundDbPermit | null {
      // Never jump ahead of an older asynchronous waiter.
      if (inFlight >= max || waiters.size > 0) {
        refused++;
        return null;
      }
      return permit();
    },
    stats(): BackgroundDbGateStats {
      return {
        inFlight,
        waiting: waiters.size,
        max,
        interactiveReserve: Math.max(0, poolMax - max),
        acquired,
        refused,
        cancelled,
      };
    },
  };
}
