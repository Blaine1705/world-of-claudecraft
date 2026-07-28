// Self-clocked $WOC Exchange sweep: the timing shell around
// WocMarketService.sweepPass() (auction closes, settlement expiry and
// cascades, delivery and return reconciliation, bond refunds/forfeits). The
// pass itself is idempotent and batch-bounded, so this shell only owns the
// clock, the re-entrancy guard, the per-realm advisory lock, and stop().
//
// Locking: realm processes share one database, and a realm may be restarted
// side by side during a deploy, so each pass takes the two-int session
// advisory lock (WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY, hashtext(realm)) and a
// loser simply skips its pass; the peer holding the lock IS this realm's
// sweep. Distinct-key cross-reference: db.ts boot DDL holds "WOC\x01"
// (0x57_4f_43_01), retention_sweep.ts holds "WOC\x02" (0x57_4f_43_02); this
// key is "WOC\x03" in the int4 space of the two-arg lock family, so the three
// can never collide.
//
// Unlike the nightly retention sweep this polls every few seconds: auction
// ends and settlement windows are minute-scale deadlines, and every arm it
// drives is a bounded no-op when nothing is due.

export const WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY = 0x57_4f_43_03; // "WOC\x03"
export const WOC_MARKET_SWEEP_POLL_MS = 5_000;

export interface WocMarketSweepLockClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(): void;
}

export interface WocMarketSweepDeps {
  realm: string;
  /** One pool checkout per pass, held only for the lock lifetime. */
  connect(): Promise<WocMarketSweepLockClient>;
  /** The whole pass body (WocMarketService.sweepPass). */
  pass(): Promise<void>;
  onError(err: unknown): void;
  pollMs?: number;
}

export interface WocMarketSweep {
  start(): void;
  stop(): Promise<void>;
  /** One guarded pass; exposed for tests and for eager pokes. */
  runOnce(): Promise<void>;
}

export function createWocMarketSweep(deps: WocMarketSweepDeps): WocMarketSweep {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running: Promise<void> | null = null;
  let stopped = false;

  async function guardedPass(): Promise<void> {
    const client = await deps.connect();
    try {
      const res = await client.query('SELECT pg_try_advisory_lock($1, hashtext($2)) AS ok', [
        WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY,
        deps.realm,
      ]);
      if (res.rows[0]?.ok !== true) return; // a peer is sweeping this realm
      try {
        await deps.pass();
      } finally {
        await client
          .query('SELECT pg_advisory_unlock($1, hashtext($2))', [
            WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY,
            deps.realm,
          ])
          .catch(() => {});
      }
    } finally {
      client.release();
    }
  }

  async function runOnce(): Promise<void> {
    if (stopped || running) return; // never overlap passes
    running = guardedPass()
      .catch((err) => deps.onError(err))
      .finally(() => {
        running = null;
      });
    await running;
  }

  return {
    start(): void {
      if (timer || stopped) return;
      timer = setInterval(() => {
        void runOnce();
      }, deps.pollMs ?? WOC_MARKET_SWEEP_POLL_MS);
      timer.unref();
    },
    async stop(): Promise<void> {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (running) await running.catch(() => {});
    },
    runOnce,
  };
}
