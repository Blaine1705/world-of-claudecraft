import {
  createDbTransactionDeadline,
  type DbTransactionDeadlineClient,
} from './db_transaction_deadline';

export const CHARACTER_DELETE_TRANSACTION_TIMEOUT_MS = 15_000;

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
  });
  try {
    await transaction.query('BEGIN');
    await transaction.query(`SET LOCAL statement_timeout = '15s';
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

    const deleted = await transaction.query(
      'DELETE FROM characters WHERE id = $1 AND account_id = $2 AND realm = $3',
      [characterId, accountId, realm],
    );
    await transaction.commit();
    return (deleted.rowCount ?? 0) > 0;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.release();
  }
}
