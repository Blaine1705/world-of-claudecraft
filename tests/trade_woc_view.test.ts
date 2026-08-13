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
import {
  buildWocTradeModel,
  inventoryIndexOfStaged,
  wocTradableSlot,
} from '../src/ui/trade_woc_view';

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
    walletTokens: null,
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

  it('refuses an ARMED bind-on-trade copy, and accepts the same copy disarmed', () => {
    // The two arms of this one window answer differently on purpose: a gold
    // trade has a named recipient for a bind-on-trade stamp to land on, so an
    // armed copy passes there, while the $WOC arm sells through the exchange
    // and has nobody to bind to. The control is the SAME payload minus the
    // flag, so the refusal is attributable to the arming alone.
    const armed: InvSlot = {
      itemId: EPIC.id,
      count: 1,
      instance: { signer: 'Aldan', bindOnTrade: true },
    };
    const disarmed: InvSlot = { itemId: EPIC.id, count: 1, instance: { signer: 'Aldan' } };
    expect(wocTradableSlot(armed, TABLE)).toBe(false);
    expect(wocTradableSlot(disarmed, TABLE)).toBe(true);
    // And through the model, because that is what the window renders: the
    // armed copy lands in the ineligible list, so the arm reports it is still
    // waiting for goods rather than offering to buy something it cannot.
    const model = buildWocTradeModel(input({ theirStaged: [armed] }));
    expect(model.eligible).toEqual([]);
    expect(model.ineligible).toEqual([armed]);
    expect(model.sendHint).toBe('hudChrome.trade.woc.hintAwaitTheirItems');
    expect(model.canSend).toBe(false);
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

  it('closes gold for BOTH sides once a $WOC deal is standing', () => {
    // The seller is in GOLD mode and has typed nothing, yet a deal priced in
    // $WOC is on the table between them. Leaving their coin fields live would
    // let them add gold to a settlement that has no copper field to carry it.
    const standing = {
      id: 7,
      usdCents: 100,
      tokens: null,
      role: 'seller' as const,
      phase: 'review' as const,
      listingId: null,
      buyerAccepted: false,
      sellerAccepted: false,
    };
    const m = buildWocTradeModel(input({ mode: 'gold', pendingOffer: standing }));
    expect(m.goldDisabled, 'the coin inputs are dead').toBe(true);
    expect(m.wocDealStanding, 'and gone from the window entirely').toBe(true);
  });

  it('keeps the Gold tab live while a price is merely being COMPOSED', () => {
    // The tab is the way back. Disabling it the moment the arm opens would trap
    // a player who only wanted to look at what a $WOC price would be.
    const m = buildWocTradeModel(input({ mode: 'woc', usdCents: 500 }));
    expect(m.goldDisabled, 'the fields still close, so nothing is half-entered').toBe(true);
    expect(m.wocDealStanding, 'but the tab stays reachable').toBe(false);
  });

  it('closes $WOC when the OTHER player has put gold down', () => {
    // goldOffered is a property of the TABLE, not of your own half. A rule that
    // watched only your side offered you the $WOC arm while your counterparty
    // had coin on the table.
    const m = buildWocTradeModel(input({ mode: 'gold', goldOffered: true }));
    expect(m.wocDisabled, 'the tab cannot be entered').toBe(true);
    // And a player already inside the arm is told WHY, rather than getting a
    // dead Send button with no reason.
    const inside = buildWocTradeModel(input({ mode: 'woc', goldOffered: true }));
    expect(inside.canSend).toBe(false);
    expect(inside.sendHint).toBe('hudChrome.trade.woc.hintGoldOffered');
  });

  it('falls back to gold mode whenever the arm is blocked', () => {
    // A blocked arm must never leave the window in a mode it cannot act on.
    const m = buildWocTradeModel(input({ selfWalletVerified: false }));
    expect(m.mode).toBe('gold');
    expect(m.goldDisabled).toBe(false);
  });
});

describe('an offer the wallet cannot cover', () => {
  it('refuses to send, and says so, when the quote exceeds the balance', () => {
    const m = buildWocTradeModel(input({ tokens: 6000, walletTokens: 5999 }));
    expect(m.insufficientBalance).toBe(true);
    expect(m.canSend).toBe(false);
    expect(m.sendHint).toBe('hudChrome.trade.woc.hintInsufficientBalance');
  });

  it('allows exactly the whole balance: short is short, equal is not', () => {
    const m = buildWocTradeModel(input({ tokens: 6000, walletTokens: 6000 }));
    expect(m.insufficientBalance).toBe(false);
    expect(m.canSend).toBe(true);
  });

  it('compares TOKENS to tokens, never the USD price to a token balance', () => {
    // The fee legs come out of the quoted amount rather than being added on
    // top, so the quote is exactly what leaves the wallet. Comparing the cents
    // figure instead would be comparing two different units, and would pass a
    // $50 offer against a 60-token balance.
    const m = buildWocTradeModel(input({ usdCents: 50, tokens: 6000, walletTokens: 100 }));
    expect(m.insufficientBalance).toBe(true);
  });

  it('does NOT refuse while the balance is unknown', () => {
    // Null is "not loaded", not "zero". Blocking here would refuse a player who
    // can pay, on no evidence, every time the read is slow or an RPC blips.
    const m = buildWocTradeModel(input({ tokens: 6000, walletTokens: null }));
    expect(m.insufficientBalance).toBe(false);
    expect(m.canSend, 'the server still re-checks at payment time').toBe(true);
  });

  it('does NOT refuse before the price has been quoted', () => {
    // An unquoted price is not evidence of a shortfall either.
    const m = buildWocTradeModel(input({ tokens: null, walletTokens: 0 }));
    expect(m.insufficientBalance).toBe(false);
  });

  it('reports the EMPTIER problem first when the offer is also incomplete', () => {
    // A shortfall is only worth naming once there is a price to be short of;
    // "enter a price" outranks it.
    const m = buildWocTradeModel(input({ usdCents: null, tokens: 6000, walletTokens: 0 }));
    expect(m.sendHint).toBe('hudChrome.trade.woc.hintEnterPrice');
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

  it('demands EXACTLY one eligible item on the table, and pins that copy (H10)', () => {
    // The offer fingerprints one copy at creation and the server refuses
    // acceptance of any other, so a table with several eligible items is
    // ambiguous about which one the price buys. Silently pinning the first
    // would be the bait-and-switch surface inverted.
    const two = buildWocTradeModel(input({ theirStaged: [slot(EPIC.id), slot(EPIC.id)] }));
    expect(two.canSend).toBe(false);
    expect(two.sendHint).toBe('hudChrome.trade.woc.hintOneItem');
    expect(two.agreedItem).toBeNull();
    // With one eligible item the model pins EXACTLY it, instance payload and
    // all, because that identity is what the wire will carry.
    const pinned: InvSlot = {
      itemId: EPIC.id,
      count: 1,
      instance: { signer: 'Aldan' },
      craftedRecipeId: 'recipe_epic',
    };
    const one = buildWocTradeModel(input({ theirStaged: [pinned] }));
    expect(one.canSend).toBe(true);
    expect(one.agreedItem).toBe(pinned);
    // Ineligible extras do not make the table ambiguous: the quest item can
    // never be part of the deal, so the one eligible copy still pins.
    const mixed = buildWocTradeModel(input({ theirStaged: [pinned, slot(QUEST.id)] }));
    expect(mixed.canSend).toBe(true);
    expect(mixed.agreedItem).toBe(pinned);
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

describe('a staged slot resolves to its INVENTORY index', () => {
  // The bug this pins: escrow extraction keys on an inventory index, while the
  // trade window works in its own staged array. Passing the staged position
  // straight through reads as 0 for a single staged item, which extracts
  // whatever sits first in the bags and refuses the sale on the mismatch. It
  // made the whole p2p flow fail at the last step, silently.
  const inv: InvSlot[] = [
    { itemId: 'cloth', count: 5 },
    { itemId: 'potion', count: 2 },
    { itemId: EPIC.id, count: 1 },
  ];

  it('finds the real index, not the staged one', () => {
    expect(inventoryIndexOfStaged(inv, slot(EPIC.id))).toBe(2);
  });

  it('reports -1 for something not held, never 0', () => {
    // 0 is a VALID index, so a not-found that returned it would extract the
    // wrong item rather than refusing.
    expect(inventoryIndexOfStaged(inv, slot('not_held'))).toBe(-1);
  });

  it('does not confuse an instanced copy with a plain one in the same bags', () => {
    const enchanted: InvSlot = {
      itemId: EPIC.id,
      count: 1,
      instance: { rolled: { quality: 'epic' } } as InvSlot['instance'],
    };
    const both: InvSlot[] = [{ itemId: EPIC.id, count: 1 }, enchanted];
    expect(inventoryIndexOfStaged(both, enchanted)).toBe(1);
    expect(inventoryIndexOfStaged(both, slot(EPIC.id))).toBe(0);
  });
});
