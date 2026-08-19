// The Exchange service's process-local ledger arithmetic, extracted from the
// coordinator (the monolith ratchet's own rule: growth pays with extraction).
// These are pure walkers over the service's in-memory maps: the park ledgers
// (row id to next-retry time), the pending-grant and pending-mail intent
// stamps. The MAPS stay on WocMarketService (they are its live state, keyed
// to its process lifetime); only the arithmetic lives here, so a Vitest can
// drive it without a service.

/** Entries in the process-local ledgers older than this are dead weight: a
 *  pending grant is only usable while its exact session lives, a pending
 *  mail attempt retries within a pass or two, and a parked entry's skip
 *  window is minute-scale. Pruned on the delivery beat so an abandoned
 *  reference cannot pin memory for the process lifetime. */
export const WOC_LOCAL_LEDGER_TTL_MS = 10 * 60_000;

/** The ids inside their backoff window (retry still in the future): the
 *  batch reads EXCLUDE them so a parked row costs no batch slot. */
export function wocBackedOffIds(parked: ReadonlyMap<number, number>, nowMs: number): number[] {
  const out: number[] = [];
  for (const [id, retryAtMs] of parked) {
    if (retryAtMs > nowMs) out.push(id);
  }
  return out;
}

/** One prune beat over every process-local ledger. Stamp maps age on their
 *  stamp; park maps store RETRY times, not stamps, so they prune once the
 *  retry itself has been stale for the ledger horizon. */
export function pruneWocLocalLedgers(
  nowMs: number,
  stamped: ReadonlyArray<Map<string, { stampMs: number }>>,
  parks: ReadonlyArray<Map<number, number>>,
  ttlMs: number = WOC_LOCAL_LEDGER_TTL_MS,
): void {
  const cutoff = nowMs - ttlMs;
  for (const ledger of stamped) {
    for (const [ref, entry] of ledger) {
      if (entry.stampMs <= cutoff) ledger.delete(ref);
    }
  }
  for (const park of parks) {
    for (const [id, retryAtMs] of park) {
      if (nowMs - retryAtMs > ttlMs) park.delete(id);
    }
  }
}
