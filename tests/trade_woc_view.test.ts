// The trade window's $WOC arm, as a pure function of its inputs.
//
// Two properties here are load-bearing beyond "does it render":
//
//  1. Eligibility shares exchange_eligibility.ts with the server's policy and
//     the sim's escrow extraction, so the window cannot offer to sell something
//     the server would refuse.
//  2. The client derives NO economic value. Tokens and the fee split are
//     passthroughs, because the real split rounds each fee leg up and gives the
//     seller the remainder; a percentage recomputed here would disagree with
//     the settlement by a cent.

import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import type { InvSlot, ItemDef } from '../src/sim/types';
import { buildWocTradeModel, wocTradableSlot } from '../src/ui/trade_woc_view';

const PARTNER = { characterId: 21, name: 'Aldan', walletVerified: true };

/** A minimal item table: one epic weapon, one quest item, one plain junk item. */
const EPIC: ItemDef = {
  id: 'test_epic_blade',
  name: 'Test Blade',
  quality: 'epic',
  slot: 'mainhand',
} as unknown as ItemDef;
const QUEST: ItemDef = {
  id: 'test_quest_seal',
  name: 'Sealed Orders',
  quality: 'common',
  kind: 'quest',
} as unknown as ItemDef;
const JUNK: ItemDef = {
  id: 'test_cloth_scrap',
  name: 'Cloth Scrap',
  quality: 'common',
} as unknown as ItemDef;
const TABLE: Record<string, ItemDef> = {
  [EPIC.id]: EPIC,
  [QUEST.id]: QUEST,
  [JUNK.id]: JUNK,
};

const slot = (id: string): InvSlot => ({ itemId: id, count: 1 });

function input(over: Partial<Parameters<typeof buildWocTradeModel>[0]> = {}) {
  return {
    marketEnabled: true,
    selfWalletVerified: true,
    partner: PARTNER,
    staged: [slot(EPIC.id)],
    items: TABLE,
    mode: 'woc' as const,
    usdCents: 5000,
    tokens: 1234.5,
    split: { sellerCents: 4500, burnCents: 150, treasuryCents: 350 },
    goldOffered: false,
    ...over,
  };
}

describe('eligibility is shared with the server, not restated', () => {
  it('accepts equipment and refuses a quest item', () => {
    expect(wocTradableSlot(slot(EPIC.id), TABLE)).toBe(true);
    expect(wocTradableSlot(slot(QUEST.id), TABLE)).toBe(false);
  });

  it('refuses an item in no exchange category at all', () => {
    expect(wocTradableSlot(slot(JUNK.id), TABLE)).toBe(false);
  });

  it('refuses an id this bundle cannot resolve', () => {
    // A stale client must not offer to sell something it cannot identify.
    expect(wocTradableSlot(slot('no_such_item'), TABLE)).toBe(false);
  });

  it('agrees with the real ITEMS table on a real mount', () => {
    // Guards against the fixture above quietly diverging from shipped content:
    // mounts trade at every rarity, which is a deliberate policy decision.
    const mount = Object.values(ITEMS).find((d) => d.kind === 'mount');
    expect(mount, 'content should ship at least one mount').toBeTruthy();
    if (mount) expect(wocTradableSlot(slot(mount.id), ITEMS)).toBe(true);
  });
});

describe('what blocks the arm, and in what order', () => {
  it('is offerable when everything lines up', () => {
    const m = buildWocTradeModel(input());
    expect(m.block).toBeNull();
    expect(m.mode).toBe('woc');
    expect(m.canSend).toBe(true);
  });

  it('reports YOUR wallet before theirs', () => {
    // Order is "what can this player act on". Reporting the recipient first
    // would send someone to badger a friend when their own wallet is missing.
    const m = buildWocTradeModel(
      input({ selfWalletVerified: false, partner: { ...PARTNER, walletVerified: false } }),
    );
    expect(m.block).toBe('no_wallet');
  });

  it('reports the recipient when only theirs is missing', () => {
    const m = buildWocTradeModel(input({ partner: { ...PARTNER, walletVerified: false } }));
    expect(m.block).toBe('recipient_no_wallet');
    expect(m.blockKey).toBe('hudChrome.trade.woc.blockRecipientNoWallet');
  });

  it('treats an unknown partner as unable to be paid', () => {
    expect(buildWocTradeModel(input({ partner: null })).block).toBe('recipient_no_wallet');
  });

  it('reports no eligible items only once something is staged', () => {
    expect(buildWocTradeModel(input({ staged: [slot(QUEST.id)] })).block).toBe('no_eligible_items');
    // An empty trade window is not an error, it is the starting state.
    expect(buildWocTradeModel(input({ staged: [] })).block).toBeNull();
  });

  it('keeps the arm VISIBLE while blocked, so the reason can be shown', () => {
    // Hiding it would leave a player who expected to trade for $WOC with no
    // explanation, which is exactly the case the recipient copy exists for.
    const m = buildWocTradeModel(input({ partner: { ...PARTNER, walletVerified: false } }));
    expect(m.armVisible).toBe(true);
    expect(m.blockKey).toBeTruthy();
  });

  it('hides the arm entirely when the realm has no exchange', () => {
    const m = buildWocTradeModel(input({ marketEnabled: false }));
    expect(m.armVisible).toBe(false);
    expect(m.block).toBe('market_disabled');
  });
});

describe('gold and $WOC are mutually exclusive', () => {
  it('disables gold while in $WOC mode', () => {
    expect(buildWocTradeModel(input()).goldDisabled).toBe(true);
  });

  it('disables $WOC once gold is offered', () => {
    const m = buildWocTradeModel(input({ goldOffered: true }));
    expect(m.wocDisabled).toBe(true);
    expect(m.canSend, 'and the deal cannot be sent').toBe(false);
  });

  it('leaves gold alone in gold mode', () => {
    const m = buildWocTradeModel(input({ mode: 'gold' }));
    expect(m.goldDisabled).toBe(false);
    expect(m.canSend).toBe(false);
  });

  it('falls back to gold mode whenever the arm is blocked', () => {
    // A blocked arm must never leave the window in a mode it cannot act on.
    const m = buildWocTradeModel(input({ selfWalletVerified: false }));
    expect(m.mode).toBe('gold');
    expect(m.goldDisabled).toBe(false);
  });
});

describe('economic values are passthroughs, never derived here', () => {
  it('passes the server split through byte-for-byte', () => {
    const split = { sellerCents: 4500, burnCents: 150, treasuryCents: 350 };
    expect(buildWocTradeModel(input({ split })).split).toEqual(split);
  });

  it('shows nothing rather than guessing when the server sent no split', () => {
    // The alternative (a client-side percentage) disagrees with settlement by a
    // cent on most amounts, and it would be shown as the money a seller nets.
    const m = buildWocTradeModel(input({ split: null, tokens: null }));
    expect(m.split).toBeNull();
    expect(m.tokens).toBeNull();
    // And the deal is still sendable: the price is USD, which the seller typed.
    expect(m.canSend).toBe(true);
  });

  it('withholds token and split figures outside $WOC mode', () => {
    const m = buildWocTradeModel(input({ mode: 'gold' }));
    expect(m.tokens).toBeNull();
    expect(m.split).toBeNull();
  });
});

describe('sending is gated on a real, positive price', () => {
  it.each([
    ['empty', null],
    ['zero', 0],
    ['negative', -100],
  ])('refuses to send on a %s price', (_label, usdCents) => {
    expect(buildWocTradeModel(input({ usdCents })).canSend).toBe(false);
  });

  it('refuses to send with nothing eligible staged', () => {
    expect(buildWocTradeModel(input({ staged: [slot(QUEST.id)] })).canSend).toBe(false);
  });

  it('separates eligible from ineligible so the window can say which', () => {
    const m = buildWocTradeModel(input({ staged: [slot(EPIC.id), slot(QUEST.id)] }));
    expect(m.eligible.map((s) => s.itemId)).toEqual([EPIC.id]);
    expect(m.ineligible.map((s) => s.itemId)).toEqual([QUEST.id]);
    expect(m.canSend, 'a partly-eligible stage can still send the eligible part').toBe(true);
  });
});
