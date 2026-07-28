// The accept-time re-grant predicate (quests/quest_item_presence.ts): where a
// quest-required item still counts as HELD, so the fallback grant stops
// minting duplicates the moment a copy is merely stashed rather than lost.
//
// The unit arms drive each store INDIVIDUALLY with every other store empty,
// because a disjunction can pass an all-true fixture while reading the wrong
// member; the all-false case pins the re-grant side. The Sim arms below prove
// the two non-trivial seam reads (mailbox, real accept path) against the real
// stores rather than fakes.
import { describe, expect, it } from 'vitest';
import type { MarketListing } from '../src/sim/market';
import {
  playerHoldsQuestItem,
  type QuestItemPresenceCtx,
} from '../src/sim/quests/quest_item_presence';
import { type PlayerMeta, Sim } from '../src/sim/sim';

const TOOL = 'gathering_sickle';

function fakeMeta(bankItems: { itemId: string; count: number }[] = []): PlayerMeta {
  return { entityId: 7, bank: { inventory: bankItems } } as unknown as PlayerMeta;
}

function fakeCtx(overrides: Partial<QuestItemPresenceCtx> = {}): QuestItemPresenceCtx {
  return {
    countItem: () => 0,
    mailboxHoldsItem: () => false,
    marketListings: [],
    marketListingBelongsTo: () => false,
    ...overrides,
  };
}

function listing(overrides: Partial<MarketListing>): MarketListing {
  return {
    id: 1,
    sellerKey: '7',
    sellerName: 'Seller',
    itemId: TOOL,
    count: 1,
    price: 10,
    expiresAt: Infinity,
    house: false,
    ...overrides,
  };
}

describe('playerHoldsQuestItem, one store at a time', () => {
  it('nothing anywhere: not held, so the fallback WOULD re-grant', () => {
    expect(playerHoldsQuestItem(fakeCtx(), fakeMeta(), TOOL)).toBe(false);
  });

  it('a copy in the bags counts', () => {
    const ctx = fakeCtx({ countItem: (id) => (id === TOOL ? 1 : 0) });
    expect(playerHoldsQuestItem(ctx, fakeMeta(), TOOL)).toBe(true);
  });

  it('a copy in the bank counts, and an unrelated bank item does not', () => {
    expect(playerHoldsQuestItem(fakeCtx(), fakeMeta([{ itemId: TOOL, count: 1 }]), TOOL)).toBe(
      true,
    );
    expect(
      playerHoldsQuestItem(fakeCtx(), fakeMeta([{ itemId: 'iron_ore', count: 5 }]), TOOL),
    ).toBe(false);
  });

  it('a mailbox attachment counts', () => {
    const ctx = fakeCtx({ mailboxHoldsItem: (_meta, id) => id === TOOL });
    expect(playerHoldsQuestItem(ctx, fakeMeta(), TOOL)).toBe(true);
  });

  it('market escrow counts only when the listing is MINE and non-empty', () => {
    const mine = fakeCtx({
      marketListings: [listing({})],
      marketListingBelongsTo: () => true,
    });
    expect(playerHoldsQuestItem(mine, fakeMeta(), TOOL)).toBe(true);
    // Someone else's listing of the same item is not my copy.
    const theirs = fakeCtx({
      marketListings: [listing({})],
      marketListingBelongsTo: () => false,
    });
    expect(playerHoldsQuestItem(theirs, fakeMeta(), TOOL)).toBe(false);
    // A different item id never matches, whoever owns it.
    const other = fakeCtx({
      marketListings: [listing({ itemId: 'iron_ore' })],
      marketListingBelongsTo: () => true,
    });
    expect(playerHoldsQuestItem(other, fakeMeta(), TOOL)).toBe(false);
  });
});

describe('the real seams', () => {
  it('sees a REAL mailbox attachment, in-flight letters included', () => {
    const sim = new Sim({ seed: 31, playerClass: 'warrior', autoEquip: false });
    const pid = sim.playerId;
    const meta = sim.players.get(pid) as PlayerMeta;
    expect(playerHoldsQuestItem(sim.ctx, meta, TOOL)).toBe(false);
    // Books a system letter carrying the item, with the standard delivery
    // delay: the raven is still ON THE WING when we ask, which is exactly the
    // window a re-accept exploit would use.
    sim.ctx.mailHeroicMarks(pid, TOOL, 1);
    expect(playerHoldsQuestItem(sim.ctx, meta, TOOL)).toBe(true);
    expect(sim.countItem(TOOL, pid)).toBe(0);
  });

  it('sees a REAL banked copy', () => {
    const sim = new Sim({ seed: 32, playerClass: 'warrior', autoEquip: false });
    const pid = sim.playerId;
    const meta = sim.players.get(pid) as PlayerMeta;
    meta.bank.inventory.push({ itemId: TOOL, count: 1 });
    expect(playerHoldsQuestItem(sim.ctx, meta, TOOL)).toBe(true);
    expect(sim.countItem(TOOL, pid)).toBe(0);
  });
});
