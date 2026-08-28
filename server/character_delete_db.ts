import {
  type BackgroundDbGateStats,
  type BackgroundDbPermit,
  createBackgroundDbGate,
} from './background_db_gate';
import { CHARACTER_SAVE_STATEMENT_TIMEOUT_MS } from './character_save_transaction';
import {
  backendCancelViaPool,
  createDbTransactionDeadline,
  DbTransactionAborted,
  type DbTransactionDeadlineClient,
  DbTransactionDeadlineExceeded,
} from './db_transaction_deadline';

// 65s wall over a 60s DELETE statement bound, the character-save shape: the
// widened DELETE below is useless if this driver-side deadline destroys the
// socket at 15s while the cascade is still running. Every statement before
// the DELETE keeps the tight 15s server bound.
export const CHARACTER_DELETE_TRANSACTION_TIMEOUT_MS = 65_000;

/** The tight bound for every statement except the widened DELETE. Mirrors
 * server/db.ts DB_STATEMENT_TIMEOUT_MS (not imported: db.ts already imports
 * character-save siblings, and this module must stay cycle-free). */
export const DELETE_RESTORE_STATEMENT_TIMEOUT_MS = 15_000;

export type OpenStoragePurchaseStatus = 'pending' | 'unresolved';

/** Stable domain refusal for a character whose paid storage rail is still open. */
export class CharacterStoragePurchaseOpen extends Error {
  readonly code = 'CHARACTER_STORAGE_PURCHASE_OPEN' as const;

  constructor(
    readonly characterId: number,
    readonly status: OpenStoragePurchaseStatus,
  ) {
    super(`character ${characterId} has an open ${status} storage purchase`);
    this.name = 'CharacterStoragePurchaseOpen';
  }
}

/** Retryable refusal: the realm's background-DB gate had no permit inside the
 * bounded wait, so the delete never took a pool client. */
export class CharacterDeleteQueueSaturated extends Error {
  readonly code = 'CHARACTER_DELETE_QUEUE_SATURATED' as const;

  constructor(readonly characterId: number) {
    super(`character ${characterId} delete refused: background database gate saturated`);
    this.name = 'CharacterDeleteQueueSaturated';
  }
}

/** The requester vanished during the bounded permit wait: the socket is
 * closed, so no refusal can reach anyone and the HTTP arms write NOTHING.
 * Distinct from CharacterDeleteQueueSaturated so a dead client is never
 * booked as gate saturation (the 503 and its counter keep meaning
 * saturation). */
export class CharacterDeleteClientGone extends Error {
  readonly code = 'CHARACTER_DELETE_CLIENT_GONE' as const;

  constructor(readonly characterId: number) {
    super(`character ${characterId} delete abandoned: the requesting client disconnected`);
    this.name = 'CharacterDeleteClientGone';
  }
}

export interface CharacterDeleteBackgroundPermit {
  release(): void;
}

export type CharacterDeleteAcquireBackgroundPermit = (
  signal: AbortSignal,
) => Promise<CharacterDeleteBackgroundPermit | null>;

/** Same bounded wait as the paid-guild sibling: past it the player retries. */
export const CHARACTER_DELETE_PERMIT_WAIT_MS = 15_000;

/** At most this many concurrent deletes may hold realm background permits.
 * A delete's 65s wall is the longest hold the gate admits, and the gate's
 * signal-less consumers (autosave, the market and mail saves, the shutdown
 * saveAll) wait UNBOUNDED by design: their only retry is the next periodic
 * sweep, and at shutdown there is none, so refusing them on a timer would
 * trade durability for latency. Sub-capping delete concurrency instead keeps
 * a delete stampede from occupying the whole gate: past the cap the extra
 * deletes wait the same bounded 15s and refuse retryably, and every other
 * permit stays available to the durability writers. */
export const CHARACTER_DELETE_PERMIT_SUB_CAP = 2;

// The sub-cap is the same FIFO permit gate the realm uses, at delete-local
// capacity (zero headroom arithmetic). Acquired BEFORE the realm gate, so a
// parked delete queues here without ever claiming a realm permit.
const deleteSubGate = createBackgroundDbGate(CHARACTER_DELETE_PERMIT_SUB_CAP, 0);

// Lifetime CharacterDeleteQueueSaturated throws (the 503 bookings).
// Client-gone abandonments deliberately never count here.
let saturationRefusals = 0;

/** The delete sub-gate's readout plus the lifetime saturation refusals. */
export interface CharacterDeleteGateStats extends BackgroundDbGateStats {
  busyRefusals: number;
}

/** Scrape-time read for the woc_character_delete_gate metric family: the
 * sub-cap parks a delete stampede BEFORE the realm gate, so the realm gate's
 * waiting gauge structurally cannot see it, and without this readout a leaked
 * sub slot would be undiagnosable and CHARACTER_DELETE_PERMIT_SUB_CAP
 * untunable from production. */
export function characterDeleteGateStats(): CharacterDeleteGateStats {
  return { ...deleteSubGate.stats(), busyRefusals: saturationRefusals };
}

let registeredAcquireBackgroundPermit: CharacterDeleteAcquireBackgroundPermit | null = null;

/** main.ts registers the realm's one major-background gate here at boot, the
 * configurePaidGuildCreateBackgroundGate pattern; null unregisters (tests). */
export function configureCharacterDeleteBackgroundGate(
  acquire: CharacterDeleteAcquireBackgroundPermit | null,
): void {
  registeredAcquireBackgroundPermit = acquire;
}

export interface CharacterDeletePool {
  connect(): Promise<DbTransactionDeadlineClient>;
  /** Optional so narrow fakes stay valid; with it, a deadline that destroys the
   * socket also fires pg_cancel_backend so the cascade's locks drop early. */
  query?(sql: string, values: unknown[]): Promise<unknown>;
  /** Overrides the pool-derived canceller: db.ts wires its dedicated,
   * side-pool-backed hook so an expiry cancel never rides the saturated main
   * pool it exists to relieve. */
  cancelBackend?(processId: number): Promise<void>;
}

/**
 * Gate-then-checkout, the paid-guild-creation shape: a 65s wall over a 60s
 * DELETE bound can hold a pool client for a minute on a player-reachable
 * route, so a handful of concurrent deletes of ledger-heavy characters would
 * otherwise hold most of the 10-client pool while holding accounts/characters
 * row locks. Acquiring a major-background permit BEFORE the checkout composes
 * the delete under the realm's one background gate instead. A refused wait is
 * a prompt retryable refusal that never touched the pool; the caller's signal
 * bounds ONLY this wait (see deleteOwnedCharacterRow), and a caller gone
 * mid-wait throws CharacterDeleteClientGone, never the saturation refusal.
 */
async function acquireCharacterDeletePermit(
  characterId: number,
  signal: AbortSignal | undefined,
): Promise<CharacterDeleteBackgroundPermit> {
  const acquirePermit = registeredAcquireBackgroundPermit;
  const waitController = new AbortController();
  const waitTimer = setTimeout(() => waitController.abort(), CHARACTER_DELETE_PERMIT_WAIT_MS);
  waitTimer.unref();
  const composed = signal
    ? AbortSignal.any([signal, waitController.signal])
    : waitController.signal;
  let subPermit: BackgroundDbPermit | null = null;
  let permit: CharacterDeleteBackgroundPermit | null = null;
  try {
    // Sub-cap first, and UNCONDITIONALLY: a delete past
    // CHARACTER_DELETE_PERMIT_SUB_CAP parks here and never claims (or queues
    // on) a realm permit, and an unregistered realm gate (tests, a boot
    // window) must not bypass the delete concurrency bound. Both waits share
    // the one 15s bound above.
    subPermit = await deleteSubGate.acquire(composed);
    if (subPermit && acquirePermit) {
      try {
        permit = await acquirePermit(composed);
      } catch (error) {
        subPermit.release();
        throw error;
      }
    }
  } finally {
    clearTimeout(waitTimer);
  }
  if (!subPermit || (acquirePermit && !permit)) {
    subPermit?.release();
    // The requester vanished mid-wait: an abandonment, never gate pressure,
    // so it must not book the saturation refusal (or its 503).
    if (signal?.aborted) throw new CharacterDeleteClientGone(characterId);
    saturationRefusals++;
    throw new CharacterDeleteQueueSaturated(characterId);
  }
  const realmPermit = permit;
  const subSlot = subPermit;
  return {
    release(): void {
      // Realm permit first, then the delete slot; both releases are
      // idempotent, and a throwing realm release must not leak the slot.
      try {
        realmPermit?.release();
      } finally {
        subSlot.release();
      }
    },
  };
}

/**
 * Delete one owned character after serializing with storage purchase starts.
 * Account parent locks always precede the character lifecycle lock. The
 * caller's signal bounds ONLY the permit wait: once BEGIN has run, a client
 * disconnect must not tear the transaction, because an abort landing during
 * COMMIT would leave a committed DELETE whose world-state purge (run by the
 * HTTP arms on success) never runs, permanently orphaning the character's
 * market listings and Ravenpost mail. The 65s wall is the transaction's own
 * bound, and an ambiguous COMMIT under it is verified below.
 */
export async function deleteOwnedCharacterRow(
  db: CharacterDeletePool,
  accountId: number,
  characterId: number,
  realm: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const permit = await acquireCharacterDeletePermit(characterId, signal);
  let client: DbTransactionDeadlineClient;
  try {
    client = await db.connect();
  } catch (error) {
    permit.release();
    throw error;
  }
  const transaction = createDbTransactionDeadline(client, {
    operation: 'character delete',
    timeoutMs: CHARACTER_DELETE_TRANSACTION_TIMEOUT_MS,
    // Deliberately NO caller signal past this point (see the doc above); the
    // request-close abort is spent at the permit wait.
    cancelBackend:
      db.cancelBackend ??
      (db.query ? backendCancelViaPool({ query: db.query.bind(db) }) : undefined),
  });
  try {
    await transaction.query('BEGIN');
    await transaction.query(`SET LOCAL statement_timeout = ${DELETE_RESTORE_STATEMENT_TIMEOUT_MS};
      SET LOCAL lock_timeout = '2s';
      SET LOCAL idle_in_transaction_session_timeout = '2s'`);

    const account = await transaction.query('SELECT id FROM accounts WHERE id = $1 FOR KEY SHARE', [
      accountId,
    ]);
    if ((account.rowCount ?? 0) === 0) {
      await transaction.rollback();
      return false;
    }

    const character = await transaction.query(
      `SELECT id FROM characters
        WHERE id = $1 AND account_id = $2 AND realm = $3
        FOR UPDATE`,
      [characterId, accountId, realm],
    );
    if ((character.rowCount ?? 0) === 0) {
      await transaction.rollback();
      return false;
    }

    // READ COMMITTED takes a fresh snapshot after the character lock wait. A
    // purchase start takes the same character lock before INSERT, so either its
    // open row is visible here or it cannot start until this delete finishes.
    const openPurchase = await transaction.query(
      `SELECT status FROM storage_purchases
        WHERE character_id = $1 AND status IN ('pending', 'unresolved')
        LIMIT 1`,
      [characterId],
    );
    if (openPurchase.rows[0]) {
      throw new CharacterStoragePurchaseOpen(
        characterId,
        String(openPurchase.rows[0].status) as OpenStoragePurchaseStatus,
      );
    }

    // The DELETE cascade now spans bank_ledger and bank_ledger_batch_receipts,
    // both keep-forever tables whose per-character row counts grow without
    // bound, so a heavy character's cascade can exceed the transaction's 15s
    // statement bound. Under that bound a large enough history would make
    // deletion PERMANENTLY impossible for exactly the accounts most likely to
    // request it. Widen the bound for this one statement (matching the heavy
    // character-save allowance) and restore the tighter bound afterward so
    // COMMIT keeps the transaction's own ceiling.
    await transaction.query(`SET LOCAL statement_timeout = ${CHARACTER_SAVE_STATEMENT_TIMEOUT_MS}`);
    const deleted = await transaction.query(
      'DELETE FROM characters WHERE id = $1 AND account_id = $2 AND realm = $3',
      [characterId, accountId, realm],
    );
    // Deliberately skipped when the DELETE throws: the catch below rolls the
    // whole transaction back, which clears every SET LOCAL with it.
    await transaction.query(`SET LOCAL statement_timeout = ${DELETE_RESTORE_STATEMENT_TIMEOUT_MS}`);
    await transaction.commit();
    return (deleted.rowCount ?? 0) > 0;
  } catch (error) {
    await transaction.rollback();
    // The 65s wall can expire DURING COMMIT. Verify before propagating: a
    // propagated ambiguity would skip the caller's success side (link change,
    // admin busts, the HTTP arms' world-state purge) for a delete that
    // actually landed. Runs while the permit is still held, so the verify
    // read rides the delete's own admission.
    if (await ambiguousCommitLanded(db, error, accountId, characterId, realm)) return true;
    throw error;
  } finally {
    // Permit release AFTER the transaction returns its client: its lifetime
    // covers the whole pool hold, the clientWithPermit contract.
    try {
      transaction.release();
    } finally {
      permit.release();
    }
  }
}

/**
 * The commit-ambiguity resolver, the guild_create_db reconcile precedent: on
 * an error carrying commitMayHaveSucceeded, a fresh read decides whether the
 * COMMIT landed. The row gone proves it did (this transaction held the row
 * FOR UPDATE, so no rival delete could have removed it first) and the delete
 * reports success so every success-side effect runs. The row still present,
 * or the verify read itself failing, leaves the original failure standing:
 * the refusal stays retryable, and a retry re-answers honestly either way.
 */
async function ambiguousCommitLanded(
  db: CharacterDeletePool,
  error: unknown,
  accountId: number,
  characterId: number,
  realm: string,
): Promise<boolean> {
  const ambiguous =
    (error instanceof DbTransactionAborted || error instanceof DbTransactionDeadlineExceeded) &&
    error.commitMayHaveSucceeded;
  if (!ambiguous) return false;
  let verify: DbTransactionDeadlineClient;
  try {
    verify = await db.connect();
  } catch {
    // Unresolved ambiguity: the original failure is the honest answer.
    return false;
  }
  try {
    const row = await verify.query(
      'SELECT 1 FROM characters WHERE id = $1 AND account_id = $2 AND realm = $3',
      [characterId, accountId, realm],
    );
    return (row.rowCount ?? 0) === 0;
  } catch {
    // Same posture as a failed checkout: propagate the original ambiguity.
    return false;
  } finally {
    verify.release();
  }
}
