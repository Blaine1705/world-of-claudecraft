import { STORAGE_SKUS } from '../src/sim/content/storage_charters';
import type { StorageAppliedEffect } from './storage_purchase_db';

export type StorageAppliedEffectDraft = Omit<
  StorageAppliedEffect,
  'purchasedSlotsBefore' | 'purchasedSlotsAfter'
> &
  Partial<Pick<StorageAppliedEffect, 'purchasedSlotsBefore' | 'purchasedSlotsAfter'>>;

function sameEffect(a: StorageAppliedEffect, b: StorageAppliedEffect): boolean {
  return (
    a.realm === b.realm &&
    a.accountId === b.accountId &&
    a.characterId === b.characterId &&
    a.itemId === b.itemId &&
    a.expectedCostClaudium === b.expectedCostClaudium &&
    a.idempotencyKey === b.idempotencyKey &&
    a.purchasedSlotsBefore === b.purchasedSlotsBefore &&
    a.purchasedSlotsAfter === b.purchasedSlotsAfter
  );
}

function sameFingerprint(a: StorageAppliedEffect, b: StorageAppliedEffectDraft): boolean {
  return (
    a.realm === b.realm &&
    a.accountId === b.accountId &&
    a.characterId === b.characterId &&
    a.itemId === b.itemId &&
    a.expectedCostClaudium === b.expectedCostClaudium &&
    a.idempotencyKey === b.idempotencyKey
  );
}

function resolvedEffect(
  draft: StorageAppliedEffectDraft,
  purchasedSlotsNow: number,
): StorageAppliedEffect {
  const hasBefore = draft.purchasedSlotsBefore !== undefined;
  const hasAfter = draft.purchasedSlotsAfter !== undefined;
  if (hasBefore !== hasAfter) {
    throw new Error(
      `storage purchase staged effect has incomplete bounds for ${draft.idempotencyKey}`,
    );
  }
  const sku = STORAGE_SKUS[draft.itemId];
  const before = hasBefore
    ? (draft.purchasedSlotsBefore as number)
    : purchasedSlotsNow - (sku?.grantSlots ?? 0);
  const after = hasAfter ? (draft.purchasedSlotsAfter as number) : purchasedSlotsNow;
  if (
    !sku ||
    !Number.isInteger(purchasedSlotsNow) ||
    purchasedSlotsNow < 0 ||
    !Number.isInteger(before) ||
    !Number.isInteger(after) ||
    before < 0 ||
    after <= before ||
    after !== purchasedSlotsNow ||
    after - before !== sku.grantSlots
  ) {
    throw new Error(`storage purchase ${draft.idempotencyKey} has invalid progression`);
  }
  return {
    ...draft,
    purchasedSlotsBefore: before,
    purchasedSlotsAfter: after,
  };
}

/** Stage one paid grant on its live-session queue. Exact retries are no-ops;
 * conflicting reuse fails closed before a save can consume the wrong row. */
export function stageStorageAppliedEffect(
  queue: StorageAppliedEffect[],
  draft: StorageAppliedEffectDraft,
  purchasedSlotsNow: number,
): StorageAppliedEffect {
  const existing = queue.find((candidate) => candidate.idempotencyKey === draft.idempotencyKey);
  if (existing) {
    const noBounds =
      draft.purchasedSlotsBefore === undefined && draft.purchasedSlotsAfter === undefined;
    if (
      !sameFingerprint(existing, draft) ||
      (!noBounds &&
        (draft.purchasedSlotsBefore !== existing.purchasedSlotsBefore ||
          draft.purchasedSlotsAfter !== existing.purchasedSlotsAfter))
    ) {
      throw new Error(`storage purchase staged effect conflict for ${draft.idempotencyKey}`);
    }
    return existing;
  }
  const effect = resolvedEffect(draft, purchasedSlotsNow);
  queue.push(effect);
  return effect;
}

/** Capture the exact prefix paired with one serialized character blob. */
export function snapshotStorageAppliedEffects(
  queue: readonly StorageAppliedEffect[],
): StorageAppliedEffect[] {
  return queue.map((effect) => ({ ...effect }));
}

/** Release only work proven durable by one committed save. Additions appended
 * while that save awaited remain behind the captured prefix. */
export function acknowledgeStorageAppliedEffects(
  queue: StorageAppliedEffect[],
  committed: readonly StorageAppliedEffect[],
): void {
  for (let i = 0; i < committed.length; i++) {
    const pending = queue[i];
    if (!pending || !sameEffect(pending, committed[i])) {
      throw new Error('storage purchase effect acknowledgement mismatch');
    }
  }
  queue.splice(0, committed.length);
}
