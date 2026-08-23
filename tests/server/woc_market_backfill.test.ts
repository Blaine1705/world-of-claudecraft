// The category-stamp boot backfill (server/woc_market_backfill.ts): rows
// escrowed before the category columns existed carry NULL and sat outside
// every category-filtered browse (the dev repro: Thronebane invisible under
// Category = Weapons). The derivations run against the LIVE catalog here, so
// a vocabulary drift in the sim helpers fails this file, not dev testing.
import { describe, expect, it } from 'vitest';
import { backfillListingCategoryStamps } from '../../server/woc_market_backfill';

describe('the category-stamp boot backfill', () => {
  it('derives stamps from the live catalog and converges every walked row', async () => {
    const stamps = new Map<string, { category: string; subcategory: string | null }>();
    const db = {
      listingItemIdsMissingCategory: async () => [
        'heroic_kingsbane_last_oath',
        'no_such_item_anymore',
      ],
      stampListingCategory: async (
        itemId: string,
        category: string,
        subcategory: string | null,
      ) => {
        stamps.set(itemId, { category, subcategory });
        return 1;
      },
    };
    expect(await backfillListingCategoryStamps(db)).toBe(2);
    // The dev repro's row: a heroic sword derives weapon/sword through the
    // heroic_ prefix arm of the weapon-type vocabulary.
    expect(stamps.get('heroic_kingsbane_last_oath')).toEqual({
      category: 'weapon',
      subcategory: 'sword',
    });
    // A def the catalog no longer names stamps 'other': unreachable by the
    // category filters (honest), and the pass converges instead of
    // re-walking the same row every boot.
    expect(stamps.get('no_such_item_anymore')).toEqual({
      category: 'other',
      subcategory: null,
    });
  });

  it('does nothing on a converged database', async () => {
    let writes = 0;
    const db = {
      listingItemIdsMissingCategory: async () => [],
      stampListingCategory: async () => {
        writes += 1;
        return 1;
      },
    };
    expect(await backfillListingCategoryStamps(db)).toBe(0);
    expect(writes).toBe(0);
  });
});
