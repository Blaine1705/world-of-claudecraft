// Synchronous pre-mutation admission for bank-ledger command brackets. The
// outbox owns capacity, stable key generation, serialization, and immutable
// batches; this adapter only reserves a command's worst-case row count and the
// session's entire remaining byte allowance while one event-loop turn mutates
// the Sim and computes its exact rows.

import type { BankLedgerOutbox } from './bank_ledger_outbox';
import type { BankLedgerRow } from './db';

export interface BankLedgerAdmissionHandle {
  /** Commit one logical command. Empty rows cancel the reservation. */
  commit(rows: readonly BankLedgerRow[]): boolean;
  /** Release a no-op or refused mutation. Repeated completion is a no-op. */
  cancel(): boolean;
}

/** Structural seam accepted by synchronous bank and vault wire dispatchers. */
export interface BankLedgerAdmission {
  tryReserve(maxRows: number): BankLedgerAdmissionHandle | null;
}

/**
 * Adapt one character-owned outbox to synchronous wire commands. No key is
 * accepted here: BankLedgerOutbox invokes its injected globally unique key
 * factory only after both row and byte capacity checks pass.
 */
export class BankLedgerOutboxAdmission implements BankLedgerAdmission {
  constructor(private readonly outbox: BankLedgerOutbox) {}

  tryReserve(maxRows: number): BankLedgerAdmissionHandle | null {
    const usage = this.outbox.usage;
    const remainingEncodedBytes =
      this.outbox.limits.maxEncodedBytes - usage.queuedEncodedBytes - usage.reservedEncodedBytes;
    if (remainingEncodedBytes <= 0) return null;

    const reservation = this.outbox.tryReserve({
      maxRows,
      maxEncodedBytes: remainingEncodedBytes,
    });
    if (!reservation) return null;

    let active = true;
    return Object.freeze({
      commit: (rows: readonly BankLedgerRow[]): boolean => {
        if (!active) return false;
        if (rows.length === 0) {
          active = false;
          return this.outbox.cancel(reservation);
        }
        this.outbox.commit(reservation, rows);
        active = false;
        return true;
      },
      cancel: (): boolean => {
        if (!active) return false;
        active = false;
        return this.outbox.cancel(reservation);
      },
    });
  }
}
