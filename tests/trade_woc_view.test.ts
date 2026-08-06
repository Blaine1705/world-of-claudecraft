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

const PARTNER = { name: 'Aldan', walletVerified: true };

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
    partnerResolved: true,
    staged: [],
    theirStaged: [slot(EPIC.id)],
    items: TABLE,
    mode: 'woc' as const,
    usdCents: 5000,
    tokens: 1234.5,
    split: { sellerCents: 4500, burnCents: 150, treasuryCents: 350 },
    goldOffered: false,
    pendingOffer: null,
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

  it('does NOT accuse the other player when the lookup has not answered', () => {
    // The bug this pins: `partner === null` means "we do not know yet" (the
    // request is in flight, or it failed, or the server is older than this
    // client). Rendering that as "they must connect a wallet" tells a player
    // something false about someone else and sends them to fix a wallet that is
    // already fine. It happened in real testing against a stale server.
    const m = buildWocTradeModel(input({ partner: null, partnerResolved: false }));
    expect(m.block).toBe('partner_unknown');
    expect(m.blockKey).toBe('hudChrome.trade.woc.blockPartnerUnknown');
  });

  it('accuses only on a definite answer of no wallet', () => {
    const m = buildWocTradeModel(input({ partner: { ...PARTNER, walletVerified: false } }));
    expect(m.block).toBe('recipient_no_wallet');
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

describe('a disabled send button always says WHY', () => {
  // The defect this pins: with nothing staged the button was simply dead, with
  // no message anywhere. A seller saw a working price field, typed a price, and
  // got a button that did nothing and explained nothing. Every reason send is
  // withheld must name itself.
  it('tells you to clear your own items, because offering $WOC means buying', () => {
    const m = buildWocTradeModel(input({ staged: [slot(EPIC.id)] }));
    expect(m.canSend).toBe(false);
    expect(m.sendHint).toBe('hudChrome.trade.woc.hintClearYourItems');
    expect(m.block, 'this is a prompt, not an unavailable arm').toBeNull();
  });

  it('waits for THEM to stage something eligible', () => {
    const m = buildWocTradeModel(input({ theirStaged: [slot(QUEST.id)] }));
    expect(m.canSend).toBe(false);
    expect(m.sendHint).toBe('hudChrome.trade.woc.hintAwaitTheirItems');
    expect(m.block, 'an empty other side must not hide the price field').toBeNull();
  });

  it('disables the $WOC tab entirely while you hold items', () => {
    // Holding items means you are the SELLER here, so the tab is not yours to
    // use: the requester's rule that the button is disabled once you offer one.
    expect(buildWocTradeModel(input({ staged: [slot(EPIC.id)] })).wocDisabled).toBe(true);
    expect(buildWocTradeModel(input()).wocDisabled).toBe(false);
  });

  it('names the missing price', () => {
    expect(buildWocTradeModel(input({ usdCents: null })).sendHint).toBe(
      'hudChrome.trade.woc.hintEnterPrice',
    );
  });

  it('names the gold conflict', () => {
    expect(buildWocTradeModel(input({ goldOffered: true })).sendHint).toBe(
      'hudChrome.trade.woc.hintGoldOffered',
    );
  });

  it('has NO hint when the offer is actually sendable', () => {
    const m = buildWocTradeModel(input());
    expect(m.canSend).toBe(true);
    expect(m.sendHint).toBeNull();
  });

  it('reports your own items before the price prompt', () => {
    // Ordering is the order a buyer hits them: clear your side, then price.
    expect(buildWocTradeModel(input({ staged: [slot(EPIC.id)], usdCents: null })).sendHint).toBe(
      'hudChrome.trade.woc.hintClearYourItems',
    );
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

  it('refuses to send when they have staged nothing eligible', () => {
    expect(buildWocTradeModel(input({ theirStaged: [slot(QUEST.id)] })).canSend).toBe(false);
  });

  it('separates eligible from ineligible so the window can say which', () => {
    const m = buildWocTradeModel(input({ theirStaged: [slot(EPIC.id), slot(QUEST.id)] }));
    expect(m.eligible.map((s) => s.itemId)).toEqual([EPIC.id]);
    expect(m.ineligible.map((s) => s.itemId)).toEqual([QUEST.id]);
    expect(m.canSend, 'a partly-eligible stage can still send the eligible part').toBe(true);
  });
});

describe('a standing offer changes what each side may do', () => {
  // These are asserted on the MODEL, not through the rendered panel. The panel
  // branches on role and pendingOffer before it ever consults these flags, so
  // driving it would pass even with the rules deleted: the two layers encode
  // the same guard on purpose, and only this level tests the inner one.
  const offer = {
    id: 7,
    usdCents: 100,
    tokens: 7812.5,
    role: 'buyer' as const,
    phase: 'review' as const,
    listingId: null,
    buyerAccepted: false,
    sellerAccepted: false,
  };

  it('forbids a SECOND offer while one is standing', () => {
    const m = buildWocTradeModel(input({ pendingOffer: offer }));
    expect(m.canSend, 'a standing offer must not be stackable').toBe(false);
  });

  it('lets only the SELLER accept, and only with eligible goods staged', () => {
    const asSeller = (staged: InvSlot[]) =>
      buildWocTradeModel(input({ pendingOffer: { ...offer, role: 'seller' }, staged }));
    expect(asSeller([slot(EPIC.id)]).canAccept).toBe(true);
    // Acceptance escrows the goods, so there must be goods, and eligible ones.
    expect(asSeller([]).canAccept).toBe(false);
    expect(asSeller([slot(QUEST.id)]).canAccept).toBe(false);
  });

  it('never lets the BUYER accept their own offer', () => {
    const m = buildWocTradeModel(input({ pendingOffer: offer, staged: [slot(EPIC.id)] }));
    expect(m.canAccept).toBe(false);
  });

  it('passes the offer through untouched for both sides to read', () => {
    expect(buildWocTradeModel(input({ pendingOffer: offer })).pendingOffer).toEqual(offer);
  });
});
