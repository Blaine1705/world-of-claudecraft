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

export interface CharacterDeletePool {
  connect(): Promise<DbTransactionDeadlineClient>;
  /** Optional so narrow fakes stay valid; with it, a deadline that destroys the
   * socket also fires pg_cancel_backend so the cascade's locks drop early. */
  query?(sql: string, values: unknown[]): Promise<unknown>;
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
  const client = await db.connect();
  const transaction = createDbTransactionDeadline(client, {
    operation: 'character delete',
    timeoutMs: CHARACTER_DELETE_TRANSACTION_TIMEOUT_MS,
    signal,
    cancelBackend: db.query ? backendCancelViaPool({ query: db.query.bind(db) }) : undefined,
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
    transaction.release();
  }
}
