import type { BankLedgerSaveEffects } from './bank_ledger_save_effects_db';
import { prepareBankLedgerSaveEffects } from './bank_ledger_save_effects_db';
import {
  createDbTransactionDeadline,
  type DbTransactionDeadline,
  type DbTransactionDeadlineClient,
} from './db_transaction_deadline';
import { assertStorageAppliedEffectBatch, type StorageAppliedEffect } from './storage_purchase_db';

export const CHARACTER_SAVE_STATEMENT_TIMEOUT_MS = 60_000;
export const CHARACTER_SAVE_TRANSACTION_TIMEOUT_MS = 65_000;

/** Validate bounded cross-effect input synchronously, before any pool checkout. */
export function prepareCharacterSaveEffects(
  characterId: number,
  storageEffects: readonly StorageAppliedEffect[],
  ledgerEffects: BankLedgerSaveEffects | undefined,
  allowedGuildIds: readonly number[] = [],
): BankLedgerSaveEffects | undefined {
  assertStorageAppliedEffectBatch(storageEffects);
  return prepareBankLedgerSaveEffects(characterId, storageEffects, ledgerEffects, allowedGuildIds);
}

/** Start one character-save transaction with both server and wall-clock bounds. */
export async function beginCharacterSaveTx(
  client: DbTransactionDeadlineClient,
  operation: string,
  signal?: AbortSignal,
): Promise<DbTransactionDeadline> {
  const transaction = createDbTransactionDeadline(client, {
    operation,
    timeoutMs: CHARACTER_SAVE_TRANSACTION_TIMEOUT_MS,
    signal,
  });
  try {
    await transaction.query('BEGIN');
    await transaction.query(
      `SET LOCAL statement_timeout = ${CHARACTER_SAVE_STATEMENT_TIMEOUT_MS};
       SET LOCAL lock_timeout = '2s';
       SET LOCAL idle_in_transaction_session_timeout = '10s'`,
    );
    return transaction;
  } catch (error) {
    await transaction.rollback();
    transaction.release();
    throw error;
  }
}
