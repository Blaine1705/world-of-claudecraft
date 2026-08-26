// The narrow bridge between a fenced character save and the transactional
// bank-ledger batch writer. Validation stays query-free, account parents lock
// before their character child, and callers keep ownership of BEGIN/COMMIT.

import { type BankLedgerBatchOwner, writeBankLedgerCommandBatches } from './bank_ledger_batch_db';
import type { BankLedgerCommandBatch } from './bank_ledger_outbox';
import { REALM } from './realm';
import {
  lockStorageAppliedEffectAccountsOnClient,
  type StorageAppliedEffect,
} from './storage_purchase_db';

export interface BankLedgerSaveEffects {
  readonly owner: BankLedgerBatchOwner;
  readonly batches: readonly BankLedgerCommandBatch[];
}

interface Queryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

/** Build the one UPDATE whose EXISTS clause is the character-lease fence. */
export function characterUpdateStatement(
  characterId: number,
  level: number,
  stateJson: string,
  leaseHolder: string,
  leaseNonce: string | undefined,
): { text: string; values: unknown[] } {
  return leaseNonce === undefined
    ? {
        text: 'UPDATE characters SET level = $2, state = $3, updated_at = now() WHERE id = $1',
        values: [characterId, level, stateJson],
      }
    : {
        text: `UPDATE characters SET level = $2, state = $3, updated_at = now()
            WHERE id = $1
              AND EXISTS (
                SELECT 1 FROM character_leases
                 WHERE character_id = $1 AND holder = $4 AND nonce = $5
              )`,
        values: [characterId, level, stateJson, leaseHolder, leaseNonce],
      };
}

/** Validate all cross-effect identity before a save issues its first query. */
export function prepareBankLedgerSaveEffects(
  characterId: number,
  storageEffects: readonly StorageAppliedEffect[],
  ledgerEffects: BankLedgerSaveEffects | undefined,
): BankLedgerSaveEffects | undefined {
  if (!ledgerEffects) return undefined;
  const { owner, batches } = ledgerEffects;
  if (
    !owner ||
    !Array.isArray(batches) ||
    owner.realm !== REALM ||
    owner.characterId !== characterId ||
    !Number.isSafeInteger(owner.accountId) ||
    owner.accountId <= 0
  ) {
    throw new Error('bank ledger save owner does not match the character save');
  }
  if (
    storageEffects.some(
      (effect) =>
        effect.realm !== owner.realm ||
        effect.characterId !== owner.characterId ||
        effect.accountId !== owner.accountId,
    )
  ) {
    throw new Error('bank ledger and storage save owners do not match');
  }
  return batches.length > 0 ? ledgerEffects : undefined;
}

/** Lock account parents in lifecycle order before the character UPDATE. */
export async function lockCharacterSaveEffectAccountsOnClient(
  db: Queryable,
  storageEffects: readonly StorageAppliedEffect[],
  ledgerEffects: BankLedgerSaveEffects | undefined,
): Promise<void> {
  await lockStorageAppliedEffectAccountsOnClient(db, storageEffects);
  if (!ledgerEffects || storageEffects.length > 0) return;
  const locked = await db.query('SELECT id FROM accounts WHERE id = $1 FOR KEY SHARE', [
    ledgerEffects.owner.accountId,
  ]);
  if (Number(locked.rows[0]?.id) !== ledgerEffects.owner.accountId) {
    throw new Error('bank ledger account disappeared before character save');
  }
}

/** Persist the already-validated exact prefix inside the caller's transaction. */
export async function writeBankLedgerSaveEffectsOnClient(
  db: Queryable,
  effects: BankLedgerSaveEffects | undefined,
): Promise<void> {
  if (effects) await writeBankLedgerCommandBatches(db, effects.owner, effects.batches);
}
