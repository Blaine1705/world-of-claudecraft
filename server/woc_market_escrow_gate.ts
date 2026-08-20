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
// listing escrow path). The sweep, the monitor, and the grant persist never
// touch it: the sweep's delivery work is bounded by its own batch sizes and
// busy budget, and taking this gate while holding the sweep's advisory lock
// would couple the two backpressure systems (the enqueueMarketWrite latency
// chain recorded in the rider spec).

/** Realm-global cap on escrow sequences in flight (queued plus running).
 *  Sized to the autosave wave's own SAVE_CONCURRENCY (4): the realm already
 *  prices in four concurrent character-save writes, so four escrow sequences
 *  add at most four more save-shaped holds. The tunables ladder pins the
 *  relation to the scraped SAVE_CONCURRENCY and to the pool default, so
 *  re-tuning either forces this sizing to be re-decided rather than
 *  silently diverging. (The pool-default relation is sizing arithmetic, not
 *  an enforced reserve: nothing fences the remaining clients, which also
 *  serve every non-market read on the shared pool.) */
export const WOC_ESCROW_GATE_MAX_IN_FLIGHT = 4;

/** A held slot older than this is treated as LEAKED and reclaimed, counted
 *  and loud: a save FIFO that never settles would otherwise pin its slot for
 *  the process lifetime, and four such wedges would close the realm's
 *  listing path until a restart (the per-character cap made that a
 *  one-character outage; a realm-global bound must not amplify it into a
 *  realm one). The ceiling sits far above any legitimate sequence (the
 *  tunables ladder pins it above the honest started-request ceiling PLUS
 *  the guild-flush heavy allowance), so a reclaim is always an incident
 *  signal, never ordinary capacity churn; the pg pool's own bounds remain
 *  the backstop for whatever the wedged sequence still holds. */
export const WOC_ESCROW_GATE_HOLD_CEILING_MS = 300_000;

export interface WocEscrowGateStats {
  inFlight: number;
  max: number;
  /** Process-lifetime refusals at cap (the realm_refused counter's twin on
   *  the ops readout: the counter alerts, this number dates the readout). */
  refused: number;
  /** Process-lifetime leaked-slot reclaims (each one was a sequence that
   *  outlived the hold ceiling: an incident, not churn). */
  reclaimed: number;
  /** Age of the oldest standing hold, or 0 when idle. Releases retire the
   *  OLDEST stamp, so with out-of-order settlements this over-reports age
   *  rather than hiding a wedge, the safe side for an alarm. */
  oldestHoldMs: number;
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

export function createWocEscrowGate(
  max: number = WOC_ESCROW_GATE_MAX_IN_FLIGHT,
  opts: { holdCeilingMs?: number; now?: () => number } = {},
): WocEscrowGate {
  const holdCeilingMs = opts.holdCeilingMs ?? WOC_ESCROW_GATE_HOLD_CEILING_MS;
  const now = opts.now ?? Date.now;
  /** Acquisition stamps, oldest first. release() retires the head: when
   *  settles happen out of acquisition order this ages the survivors
   *  pessimistically, which keeps a genuine wedge visible (and reclaimable)
   *  instead of letting a newer release erase the oldest stamp. */
  const holds: number[] = [];
  let refused = 0;
  let reclaimed = 0;

  function reclaimLeaked(): void {
    // A reclaimed sequence that LATER settles will release a younger
    // sequence's stamp, transiently over-freeing by at most the reclaim
    // count: bounded, rare (a reclaim is already an incident), and cheaper
    // than identity-tokened holds against the realm outage this prevents.
    const cutoff = now() - holdCeilingMs;
    while (holds.length > 0 && (holds[0] as number) <= cutoff) {
      holds.shift();
      reclaimed++;
      console.error(
        `[woc_market] escrow gate reclaimed a slot held past ${holdCeilingMs}ms: a listing sequence never settled (wedged save FIFO?); capacity restored, the wedge itself still needs an operator`,
      );
    }
  }

  return {
    tryAcquire(): boolean {
      reclaimLeaked();
      if (holds.length >= max) {
        refused++;
        return false;
      }
      holds.push(now());
      return true;
    },
    release(): void {
      // Floor at zero: a double release must never mint capacity.
      holds.shift();
    },
    stats(): WocEscrowGateStats {
      return {
        inFlight: holds.length,
        max,
        refused,
        reclaimed,
        oldestHoldMs: holds.length > 0 ? now() - (holds[0] as number) : 0,
      };
    },
  };
}
