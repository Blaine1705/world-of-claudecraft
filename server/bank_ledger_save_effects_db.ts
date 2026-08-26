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

/** An opaque, one-use proof that this exact transaction client already holds
 *  a parent account lock strong enough for character save effects. Callers
 *  cannot construct or move a proof to another client: the private WeakMap is
 *  the authority, while accountId remains visible only for diagnostics. */
const characterSaveAccountLockProofBrand: unique symbol = Symbol('CharacterSaveAccountLockProof');
export interface CharacterSaveAccountLockProof {
  readonly [characterSaveAccountLockProofBrand]: true;
  readonly accountId: number;
}

interface AccountLockProofState {
  readonly db: Queryable;
  readonly accountId: number;
  consumed: boolean;
}

const accountLockProofs = new WeakMap<CharacterSaveAccountLockProof, AccountLockProofState>();

function assertPositiveAccountId(accountId: number): void {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    throw new RangeError('character save account lock id must be a positive safe integer');
  }
}

/** Take the accounts-first NO KEY UPDATE lock used by a capped WOC escrow
 *  insert and return a proof the later character-save helper can consume.
 *  This is stronger than the KEY SHARE lock save effects otherwise acquire,
 *  while still admitting unrelated FK-child inserts. */
export async function lockCharacterSaveAccountParentOnClient(
  db: Queryable,
  accountId: number,
): Promise<CharacterSaveAccountLockProof> {
  assertPositiveAccountId(accountId);
  const locked = await db.query('SELECT id FROM accounts WHERE id = $1 FOR NO KEY UPDATE', [
    accountId,
  ]);
  if (Number(locked.rows[0]?.id) !== accountId) {
    throw new Error('character save account disappeared before parent lock');
  }
  const proof = Object.freeze({
    [characterSaveAccountLockProofBrand]: true as const,
    accountId,
  });
  accountLockProofs.set(proof, { db, accountId, consumed: false });
  return proof;
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
  allowedGuildIds: readonly number[] = [],
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
  const allowedGuilds = new Set(allowedGuildIds);
  for (const batch of batches) {
    for (const row of batch.rows) {
      if (
        row.container === 'guild' &&
        (row.containerId === null || !allowedGuilds.has(row.containerId))
      ) {
        throw new Error('bank ledger guild rows require a matching guild bank save');
      }
    }
  }
  return batches.length > 0 ? ledgerEffects : undefined;
}

/** Lock account parents in lifecycle order before the character UPDATE. */
export async function lockCharacterSaveEffectAccountsOnClient(
  db: Queryable,
  storageEffects: readonly StorageAppliedEffect[],
  ledgerEffects: BankLedgerSaveEffects | undefined,
  existingLock?: CharacterSaveAccountLockProof,
): Promise<void> {
  if (existingLock) {
    const state = accountLockProofs.get(existingLock);
    if (!state || state.db !== db || state.consumed) {
      throw new Error('invalid or consumed character save account lock proof');
    }
    const effectAccountIds = new Set(storageEffects.map((effect) => effect.accountId));
    if (ledgerEffects) effectAccountIds.add(ledgerEffects.owner.accountId);
    // A save without external effects needs no parent lock. Do not consume a
    // proof the helper did not rely on, although the WOC caller keeps it local.
    if (effectAccountIds.size === 0) return;
    if (effectAccountIds.size !== 1 || !effectAccountIds.has(state.accountId)) {
      throw new Error('character save account lock proof does not match save effects');
    }
    state.consumed = true;
    return;
  }
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
