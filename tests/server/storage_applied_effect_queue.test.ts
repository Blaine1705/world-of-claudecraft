import { describe, expect, it } from 'vitest';
import {
  acknowledgeStorageAppliedEffects,
  snapshotStorageAppliedEffects,
  stageStorageAppliedEffect,
  storageAppliedEffectsMatchPrefix,
} from '../../server/storage_applied_effect_queue';
import type { StorageAppliedEffect } from '../../server/storage_purchase_db';

const base = {
  realm: 'realm-a',
  accountId: 7,
  characterId: 42,
  itemId: 'strongbox_rung_01',
  expectedCostClaudium: 100,
  idempotencyKey: 'purchase-a',
};

describe('storage applied effect queue', () => {
  it('deduplicates an exact stage and rejects a conflicting reuse', () => {
    const queue: StorageAppliedEffect[] = [];
    const exact = { ...base, purchasedSlotsBefore: 0, purchasedSlotsAfter: 6 };

    stageStorageAppliedEffect(queue, exact, 6);
    stageStorageAppliedEffect(queue, exact, 6);
    expect(queue).toEqual([exact]);

    expect(() =>
      stageStorageAppliedEffect(queue, { ...exact, purchasedSlotsAfter: 12 }, 12),
    ).toThrow(/staged effect conflict/);
    expect(queue).toEqual([exact]);

    // A replay can omit historical bounds after later ladder progress. The
    // exact staged record wins instead of being reconstructed from 12.
    expect(stageStorageAppliedEffect(queue, base, 12)).toEqual(exact);
    expect(queue).toEqual([exact]);
  });

  it('rejects malformed or SKU-inconsistent progression before it reaches SQL', () => {
    const queue: StorageAppliedEffect[] = [];
    for (const draft of [
      { ...base, purchasedSlotsBefore: 0, purchasedSlotsAfter: 12 },
      { ...base, purchasedSlotsBefore: -6, purchasedSlotsAfter: 0 },
      { ...base, purchasedSlotsBefore: 0.5, purchasedSlotsAfter: 6.5 },
      { ...base, purchasedSlotsBefore: 0, purchasedSlotsAfter: 6 },
      { ...base, itemId: 'unknown', purchasedSlotsBefore: 0, purchasedSlotsAfter: 6 },
    ]) {
      expect(() => stageStorageAppliedEffect(queue, draft, 12)).toThrow(/invalid progression/);
    }
    expect(queue).toEqual([]);
  });

  it('reconstructs a legacy already-applied replay from the SKU grant', () => {
    const queue: StorageAppliedEffect[] = [];

    stageStorageAppliedEffect(queue, base, 6);

    expect(queue).toEqual([{ ...base, purchasedSlotsBefore: 0, purchasedSlotsAfter: 6 }]);
  });

  it('acknowledges only the committed prefix and retains additions made mid-save', () => {
    const queue: StorageAppliedEffect[] = [];
    const first = { ...base, purchasedSlotsBefore: 0, purchasedSlotsAfter: 6 };
    const second = {
      ...base,
      itemId: 'strongbox_rung_02',
      idempotencyKey: 'purchase-b',
      purchasedSlotsBefore: 6,
      purchasedSlotsAfter: 12,
    };
    stageStorageAppliedEffect(queue, first, 6);
    const captured = snapshotStorageAppliedEffects(queue);
    stageStorageAppliedEffect(queue, second, 12);

    expect(storageAppliedEffectsMatchPrefix(queue, captured)).toBe(true);
    acknowledgeStorageAppliedEffects(queue, captured);

    expect(queue).toEqual([second]);
    expect(captured).toEqual([first]);
    expect(storageAppliedEffectsMatchPrefix(queue, captured)).toBe(false);
  });

  it('never splices work when the committed prefix does not match', () => {
    const queue: StorageAppliedEffect[] = [];
    const exact = { ...base, purchasedSlotsBefore: 0, purchasedSlotsAfter: 6 };
    stageStorageAppliedEffect(queue, exact, 6);

    const mismatch = [{ ...exact, itemId: 'strongbox_rung_02' }];
    expect(storageAppliedEffectsMatchPrefix(queue, mismatch)).toBe(false);
    expect(() => acknowledgeStorageAppliedEffects(queue, mismatch)).toThrow(
      /acknowledgement mismatch/,
    );
    expect(queue).toEqual([exact]);
  });
});
