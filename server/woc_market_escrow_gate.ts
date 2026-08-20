// The realm-global bound on escrow sequences in flight (the escrow write-path
// rider). The per-character depth cap in woc_market_custody.ts bounds each
// character to ONE queued-or-running escrow sequence, but nothing bounded how
// many CHARACTERS could hold one at once: the shared pg pool (10 clients by
// default) was the only realm-wide backstop, and saturating it with
// escrow-shaped work (each sequence can hold a pool client through the
// guild-flush heavy allowance and the escrow transaction's own ceiling)
// starves every other guard transaction, the sweep's locked segments, and the
// autosave wave. This gate is that missing bound: a counted in-flight cap
// with an immediate typed refusal at saturation, the seeker-executor idiom
// minus the queue (a queued waiter would just recreate the pile-up the
// refusal exists to prevent; the client's retry loop is the queue).
//
// Scope: acquired ONLY by the custody module's runSerialized entry (the
// listing escrow path). The sweep and the monitor never touch it: the sweep's
// delivery work is bounded by its own batch sizes, and taking this gate while
// holding the sweep's advisory lock would couple the two backpressure systems
// (the enqueueMarketWrite latency chain recorded in the rider spec).

/** Realm-global cap on escrow sequences in flight (queued plus running).
 *  Sized to the autosave wave's own SAVE_CONCURRENCY (4): the realm already
 *  prices in four concurrent character-save writes, so four escrow sequences
 *  add at most four more save-shaped holds, and even with BOTH saturated the
 *  10-client pool keeps at least two clients for the guard transactions and
 *  the sweep's locked segments. The tunables ladder pins the relation to the
 *  scraped SAVE_CONCURRENCY and to the pool default, so re-tuning either
 *  forces this sizing to be re-decided rather than silently diverging. */
export const WOC_ESCROW_GATE_MAX_IN_FLIGHT = 4;

export interface WocEscrowGateStats {
  inFlight: number;
  max: number;
  /** Process-lifetime refusals at cap (the realm_refused counter's twin on
   *  the ops readout: the counter alerts, this number dates the readout). */
  refused: number;
}

export interface WocEscrowGate {
  /** Take a slot. False means the realm is at cap and the caller refuses the
   *  typed 'contended' without holding anything. */
  tryAcquire(): boolean;
  /** Release a slot when the WORK settles (the depth-cap slot's own
   *  lifecycle, not the waiter's return). */
  release(): void;
  stats(): WocEscrowGateStats;
}

export function createWocEscrowGate(max: number = WOC_ESCROW_GATE_MAX_IN_FLIGHT): WocEscrowGate {
  let inFlight = 0;
  let refused = 0;
  return {
    tryAcquire(): boolean {
      if (inFlight >= max) {
        refused++;
        return false;
      }
      inFlight++;
      return true;
    },
    release(): void {
      // Floor at zero: a double release must never mint capacity.
      if (inFlight > 0) inFlight--;
    },
    stats(): WocEscrowGateStats {
      return { inFlight, max, refused };
    },
  };
}
