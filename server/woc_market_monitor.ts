// Stuck-custody monitor for the $WOC Exchange: the CONSUMER of the "visible
// and stuck" failure direction. Delivery code parks anything it cannot prove
// (an unbooked custody claim, a settlement held in 'delivering', a closed
// listing whose escrowed copy never left) instead of guessing; this module is
// what makes those parked states reachable by a human. Two consumers share
// one cached read: the secret-gated ops endpoint (server/internal.ts,
// GET /internal/woc-market/stuck) and a slow periodic log line.
//
// Cost model: the readout is viewer-identical, so it rides createCachedRead
// (TTL + single-flight + stale-serve), and the underlying queries are O(cap):
// samples are LIMIT reads over the stuck-class indexes, and the counts
// SATURATE at countCap (a bare count consumed the whole stuck set per
// refresh, which is exactly wrong during the incident that grows it).
// Nothing here runs per tick or per request: a cold endpoint hit refreshes at
// most once per TTL, and the log interval is minutes. Deliberately NOT
// bust-wired: no moderation action changes what is stuck, so TTL staleness
// only delays an operator diagnostic, never enforcement (the cached-read bust
// rule in server/CLAUDE.md "Hot paths").

import { type CachedRead, createCachedRead } from './cached_read';
import type { WocStuckCustodyReadout } from './woc_market';

/** The one db read the monitor needs (PgWocMarketDb implements it). */
export interface WocMarketMonitorDb {
  stuckCustodyReadout(
    realm: string,
    olderThanMs: number,
    sampleLimit: number,
    countCap: number,
  ): Promise<WocStuckCustodyReadout>;
}

export interface WocMarketMonitorDeps {
  db: WocMarketMonitorDb;
  realm: string;
  /** Log sink for the periodic stuck line (main.ts wires console.warn). */
  log(line: string): void;
  /** Injected clock for tests; production omits it (Date.now). */
  now?: () => number;
  /** Cache freshness for the endpoint read. */
  ttlMs?: number;
  /** A row must be at least this old to count as stuck: everything the sweep
   *  is still actively converging (claims mid-pass, deliveries in flight)
   *  stays out of the readout. */
  stuckAgeMs?: number;
  /** How many rows each class returns beside its count. */
  sampleLimit?: number;
  /** Cadence of the periodic log line. */
  logIntervalMs?: number;
}

export interface WocMarketMonitor {
  /** The cached three-class readout (the ops endpoint serves this). */
  read(): Promise<WocStuckCustodyReadout>;
  /** One log-cadence beat: logs ONLY when something is stuck (a healthy
   *  marketplace stays silent; the endpoint answers the affirmative case). */
  logTick(): Promise<void>;
  start(): void;
  stop(): void;
}

export const WOC_MONITOR_TTL_MS = 30_000;
export const WOC_MONITOR_STUCK_AGE_MS = 10 * 60_000;
export const WOC_MONITOR_SAMPLE_LIMIT = 20;
export const WOC_MONITOR_COUNT_CAP = 1000;
export const WOC_MONITOR_LOG_INTERVAL_MS = 5 * 60_000;

/** Freeze the readout before it is shared: read() hands the SAME object to
 *  every caller for a TTL window, so an in-place sort or redaction by one
 *  consumer would corrupt it for the rest. */
function freezeReadout(readout: WocStuckCustodyReadout): WocStuckCustodyReadout {
  for (const cls of [
    readout.unbookedClaims,
    readout.stuckDelivering,
    readout.undisposedListings,
  ] as const) {
    for (const row of cls.sample) Object.freeze(row);
    Object.freeze(cls.sample);
    Object.freeze(cls);
  }
  return Object.freeze(readout);
}

export function createWocMarketMonitor(deps: WocMarketMonitorDeps): WocMarketMonitor {
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? WOC_MONITOR_TTL_MS;
  const stuckAgeMs = deps.stuckAgeMs ?? WOC_MONITOR_STUCK_AGE_MS;
  const sampleLimit = deps.sampleLimit ?? WOC_MONITOR_SAMPLE_LIMIT;
  const logIntervalMs = deps.logIntervalMs ?? WOC_MONITOR_LOG_INTERVAL_MS;

  const cached: CachedRead<WocStuckCustodyReadout> = createCachedRead(
    async () =>
      freezeReadout(
        await deps.db.stuckCustodyReadout(
          deps.realm,
          now() - stuckAgeMs,
          sampleLimit,
          WOC_MONITOR_COUNT_CAP,
        ),
      ),
    { ttlMs, now },
  );

  let timer: ReturnType<typeof setInterval> | null = null;
  // Warn once per failure STREAK: the cached read's own stale-serve warning
  // only fires after a first success, so a monitor that fails from boot (a
  // migration lag, a revoked grant) would otherwise be silent forever, which
  // is the one failure mode the visibility module must not have.
  let failStreak = false;

  const logTick = async (): Promise<void> => {
    let readout: WocStuckCustodyReadout;
    try {
      readout = await cached.read();
      failStreak = false;
    } catch (err) {
      if (!failStreak) {
        failStreak = true;
        deps.log(`[woc_market] stuck custody readout failing: ${String(err)}`);
      }
      return;
    }
    const counts = {
      unbookedClaims: readout.unbookedClaims.count,
      stuckDelivering: readout.stuckDelivering.count,
      undisposedListings: readout.undisposedListings.count,
    };
    const stuck =
      counts.unbookedClaims > 0 || counts.stuckDelivering > 0 || counts.undisposedListings > 0;
    if (!stuck) return;
    deps.log(`[woc_market] stuck custody ${JSON.stringify(counts)}`);
  };

  return {
    read: () => cached.read(),
    logTick,
    start(): void {
      if (timer !== null) return;
      timer = setInterval(() => {
        void logTick();
      }, logIntervalMs);
      timer.unref?.();
    },
    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
