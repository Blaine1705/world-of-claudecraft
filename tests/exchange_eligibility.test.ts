// The shared exchange taxonomy + lock predicate (src/sim/exchange_eligibility.ts).
//
// Driven against the REAL merged content table wherever it can be, not only
// synthetic defs: the whole reason this module exists is that three enforcement
// points disagreed about real items (every mount is soulbound, every chroma
// plate is noMarketList), and a fixture-only suite would have passed while the
// live catalog stayed unsellable.

import { describe, expect, it } from 'vitest';
import { MOUNTS } from '../src/sim/content/mounts';
import { MECH_CHROMAS, mechChromaItemId } from '../src/sim/content/skins';
import { ITEMS } from '../src/sim/data';
import {
  exchangeCategoryUsesQualityFloor,
  exchangeHardLock,
  exchangeItemCategory,
} from '../src/sim/exchange_eligibility';
import type { ItemDef } from '../src/sim/types';

const def = (over: Record<string, unknown>): ItemDef =>
  ({
    id: 'syn',
    name: 'Syn',
    kind: 'armor',
    quality: 'epic',
    sellValue: 1,
    ...over,
  }) as unknown as ItemDef;

describe('exchangeItemCategory: the content taxonomy', () => {
  it('classifies by the explicit discriminators before falling back to the slot', () => {
    expect(exchangeItemCategory(def({ kind: 'mount', mount: 'valorsteed' }))).toBe('mount');
    expect(exchangeItemCategory(def({ use: { type: 'mechChroma', chromaId: 'onyx_gold' } }))).toBe(
      'mech_chroma',
    );
    expect(exchangeItemCategory(def({ slot: 'chest' }))).toBe('equipment');
  });

  it('keeps a mount a mount even if one ever gains an equip slot', () => {
    // Order, stated as a property: classifying by slot first would drop a
    // slotted mount into equipment and silently apply the epic floor to it.
    expect(exchangeItemCategory(def({ kind: 'mount', mount: 'valorsteed', slot: 'trinket' }))).toBe(
      'mount',
    );
    expect(
      exchangeItemCategory(
        def({ use: { type: 'mechChroma', chromaId: 'onyx_gold' }, slot: 'chest' }),
      ),
    ).toBe('mech_chroma');
  });

  it('defaults CLOSED: an unrecognized def is not tradable', () => {
    // 'other' is what keeps a new content kind off the Exchange until someone
    // decides it belongs there, rather than it arriving by accident.
    expect(exchangeItemCategory(def({ kind: 'tool', slot: undefined }))).toBe('other');
    expect(exchangeItemCategory(def({ kind: 'consumable', slot: undefined }))).toBe('other');
  });
});

describe('exchangeHardLock: which locks a category tolerates', () => {
  it('refuses a quest item and a bound copy for EVERY category', () => {
    for (const d of [def({ kind: 'quest' }), def({ kind: 'quest', mount: 'valorsteed' })]) {
      expect(exchangeHardLock(d, undefined)).toBe('quest_item');
    }
    for (const d of [
      def({ slot: 'chest' }),
      def({ kind: 'mount', mount: 'valorsteed', soulbound: true }),
      def({ use: { type: 'mechChroma', chromaId: 'onyx_gold' }, noMarketList: true }),
    ]) {
      expect(exchangeHardLock(d, { boundTo: 7 })).toBe('bound_copy');
    }
  });

  it('tolerates soulbound ONLY for a mount', () => {
    expect(
      exchangeHardLock(def({ kind: 'mount', mount: 'valorsteed', soulbound: true }), undefined),
    ).toBe(null);
    expect(exchangeHardLock(def({ slot: 'chest', soulbound: true }), undefined)).toBe('soulbound');
    expect(
      exchangeHardLock(
        def({ use: { type: 'mechChroma', chromaId: 'onyx_gold' }, soulbound: true }),
        undefined,
      ),
    ).toBe('soulbound');
  });

  it('tolerates noMarketList ONLY for a chroma plate', () => {
    expect(
      exchangeHardLock(
        def({ use: { type: 'mechChroma', chromaId: 'onyx_gold' }, noMarketList: true }),
        undefined,
      ),
    ).toBe(null);
    expect(exchangeHardLock(def({ slot: 'chest', noMarketList: true }), undefined)).toBe(
      'no_market_list',
    );
    expect(
      exchangeHardLock(def({ kind: 'mount', mount: 'valorsteed', noMarketList: true }), undefined),
    ).toBe('no_market_list');
  });

  it('leaves ordinary equipment exactly as it was', () => {
    expect(exchangeHardLock(def({ slot: 'chest' }), undefined)).toBe(null);
  });
});

describe('the REAL catalog clears every mount and every chroma plate', () => {
  it('has a mount item per catalog mount, and all of them pass the locks', () => {
    const mountItems = Object.values(ITEMS).filter((i) => exchangeItemCategory(i) === 'mount');
    // One tradable handle per catalog mount: a mount with no item behind it
    // would be untradable no matter what the policy said.
    expect(mountItems.length).toBe(Object.keys(MOUNTS).length);
    const blocked = mountItems.filter((i) => exchangeHardLock(i, undefined) !== null);
    expect(blocked.map((i) => i.id)).toEqual([]);
    // Non-vacuity: these really are the soulbound items, so the tolerance is
    // load-bearing and not passing because the flag happens to be absent.
    expect(mountItems.every((i) => i.soulbound === true)).toBe(true);
    expect(mountItems.length).toBeGreaterThanOrEqual(8);
  });

  it('has a plate per mech chroma, and all of them pass the locks', () => {
    const plates = MECH_CHROMAS.map((c) => ITEMS[mechChromaItemId(c.id) ?? '']).filter(Boolean);
    expect(plates.length).toBe(MECH_CHROMAS.length);
    for (const plate of plates) {
      expect(exchangeItemCategory(plate)).toBe('mech_chroma');
      expect(exchangeHardLock(plate, undefined)).toBe(null);
    }
    // Same non-vacuity check from the other side: every plate really is flagged
    // off the gold market, which is the flag this category tolerates.
    expect(plates.every((p) => p.noMarketList === true)).toBe(true);
    expect(plates.length).toBeGreaterThanOrEqual(15);
  });

  it('covers every rarity the two collections actually ship', () => {
    // "Regardless of rarity or tier" is the requirement; this pins that the
    // collections really do span more than one tier, so a floor would bite.
    const mountRarities = new Set(Object.values(MOUNTS).map((m) => m.rarity));
    expect(mountRarities.size).toBeGreaterThan(1);
    const chromaRanks = new Set(MECH_CHROMAS.map((c) => c.rank));
    expect(chromaRanks.size).toBeGreaterThan(1);
  });
});

describe('exchangeCategoryUsesQualityFloor', () => {
  it('applies the floor to equipment only', () => {
    expect(exchangeCategoryUsesQualityFloor('equipment')).toBe(true);
    expect(exchangeCategoryUsesQualityFloor('mount')).toBe(false);
    expect(exchangeCategoryUsesQualityFloor('mech_chroma')).toBe(false);
    expect(exchangeCategoryUsesQualityFloor('other')).toBe(false);
  });
});
