import { CHARACTER_SAVE_STATEMENT_TIMEOUT_MS } from './character_save_transaction';
import {
  backendCancelViaPool,
  createDbTransactionDeadline,
  type DbTransactionDeadlineClient,
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

export interface CharacterDeleteBackgroundPermit {
  release(): void;
}

export type CharacterDeleteAcquireBackgroundPermit = (
  signal: AbortSignal,
) => Promise<CharacterDeleteBackgroundPermit | null>;

/** Same bounded wait as the paid-guild sibling: past it the player retries. */
export const CHARACTER_DELETE_PERMIT_WAIT_MS = 15_000;

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
 * the delete under the realm's one background gate instead. A null permit is
 * a prompt retryable refusal that never touched the pool.
 */
async function acquireCharacterDeletePermit(
  characterId: number,
  signal: AbortSignal | undefined,
): Promise<CharacterDeleteBackgroundPermit | null> {
  const acquirePermit = registeredAcquireBackgroundPermit;
  if (!acquirePermit) return null;
  const waitController = new AbortController();
  const waitTimer = setTimeout(() => waitController.abort(), CHARACTER_DELETE_PERMIT_WAIT_MS);
  waitTimer.unref();
  let permit: CharacterDeleteBackgroundPermit | null;
  try {
    permit = await acquirePermit(
      signal ? AbortSignal.any([signal, waitController.signal]) : waitController.signal,
    );
  } finally {
    clearTimeout(waitTimer);
  }
  if (!permit) throw new CharacterDeleteQueueSaturated(characterId);
  return permit;
}

/**
 * Delete one owned character after serializing with storage purchase starts.
 * Account parent locks always precede the character lifecycle lock.
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
    permit?.release();
    throw error;
  }
  const transaction = createDbTransactionDeadline(client, {
    operation: 'character delete',
    timeoutMs: CHARACTER_DELETE_TRANSACTION_TIMEOUT_MS,
    signal,
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
    throw error;
  } finally {
    // Permit release AFTER the transaction returns its client: its lifetime
    // covers the whole pool hold, the clientWithPermit contract.
    try {
      transaction.release();
    } finally {
      permit?.release();
    }
  }
}
