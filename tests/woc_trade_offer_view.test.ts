// The p2p $WOC offer state machine's pure decisions
// (src/ui/hud/woc_trade/woc_trade_offer_view.ts): which server row the open
// trade window adopts, when a repaint is owed, and how the held offer advances
// review -> awaiting_payment -> paying -> settled. These transitions had no
// unit tests while the machine lived on the Hud coordinator; the regressions
// each case names shipped for real (review.md, H7 context).

import { describe, expect, it } from 'vitest';
import {
  adoptedWocOffer,
  selectStandingWocOffer,
  type WocOfferRowLike,
  wocOfferPollStep,
} from '../src/ui/hud/woc_trade/woc_trade_offer_view';
import { wocOfferPhase } from '../src/ui/trade_woc_panel';
import type { WocPendingOffer } from '../src/ui/trade_woc_view';

type Row = WocOfferRowLike & {
  listingStatus: string | null;
  listingResolution: string | null;
  settlementState?: string | null;
};

function row(over: Partial<Row> = {}): Row {
  return {
    id: 7,
    status: 'pending',
    role: 'buyer',
    buyerName: 'Aldric',
    sellerName: 'Bree',
    usdCents: 100,
    listingId: null,
    buyerAccepted: false,
    sellerAccepted: false,
    listingStatus: null,
    listingResolution: null,
    ...over,
  };
}

function held(over: Partial<WocPendingOffer> = {}): WocPendingOffer {
  return {
    id: 7,
    usdCents: 100,
    tokens: null,
    role: 'buyer',
    phase: 'review',
    listingId: null,
    buyerAccepted: false,
    sellerAccepted: false,
    ...over,
  };
}

describe('selectStandingWocOffer', () => {
  it('matches the counterparty by role: a buyer looks at sellerName, a seller at buyerName', () => {
    const asBuyer = row({ role: 'buyer', sellerName: 'Bree' });
    expect(selectStandingWocOffer([asBuyer], 'Bree', new Set())).toBe(asBuyer);
    expect(selectStandingWocOffer([asBuyer], 'Aldric', new Set())).toBeUndefined();
    const asSeller = row({ role: 'seller', buyerName: 'Aldric' });
    expect(selectStandingWocOffer([asSeller], 'Aldric', new Set())).toBe(asSeller);
    expect(selectStandingWocOffer([asSeller], 'Bree', new Set())).toBeUndefined();
  });

  it("adopts 'accepted' rows too: the deal is not over when it is agreed", () => {
    // Dropping the offer at agreement made the payment phase unreachable and
    // left both windows holding a stale id to press.
    const agreed = row({ status: 'accepted' });
    expect(selectStandingWocOffer([agreed], 'Bree', new Set())).toBe(agreed);
  });

  it('ignores resolved rows (declined, withdrawn, expired)', () => {
    for (const status of ['declined', 'withdrawn', 'expired']) {
      expect(selectStandingWocOffer([row({ status })], 'Bree', new Set()), status).toBeUndefined();
    }
  });

  it('skips ids already reported finished, so a settled row is never re-adopted', () => {
    // The row lingers server-side for a grace window; re-adopting it reopened
    // the window just closed and blocked the pair from starting a new deal.
    expect(selectStandingWocOffer([row()], 'Bree', new Set([7]))).toBeUndefined();
    const next = row({ id: 8 });
    expect(selectStandingWocOffer([row(), next], 'Bree', new Set([7]))).toBe(next);
  });
});

describe('wocOfferPollStep', () => {
  it('settled wins over everything: the deal is done whatever is held locally', () => {
    expect(wocOfferPollStep(null, row(), 'settled')).toEqual({ kind: 'settle' });
    expect(wocOfferPollStep(held({ phase: 'paying' }), row(), 'settled')).toEqual({
      kind: 'settle',
    });
  });

  it('keeps the held offer only when id, phase, AND both acceptance flags match', () => {
    expect(wocOfferPollStep(held(), row(), 'review')).toEqual({ kind: 'keep' });
  });

  it('one side accepting forces a repaint even though id and phase are unchanged', () => {
    // The shipped regression: an id-and-phase check left the button reading
    // "Accept" after the player had already accepted, and the other side never
    // learned they were waited on.
    expect(wocOfferPollStep(held(), row({ buyerAccepted: true }), 'review')).toEqual({
      kind: 'adopt',
    });
    expect(wocOfferPollStep(held(), row({ sellerAccepted: true }), 'review')).toEqual({
      kind: 'adopt',
    });
  });

  it('adopts on a phase move, a different offer id, or no held offer at all', () => {
    expect(wocOfferPollStep(held(), row(), 'awaiting_payment')).toEqual({ kind: 'adopt' });
    expect(wocOfferPollStep(held(), row({ id: 8 }), 'review')).toEqual({ kind: 'adopt' });
    expect(wocOfferPollStep(null, row(), 'review')).toEqual({ kind: 'adopt' });
  });
});

describe('adoptedWocOffer', () => {
  it('projects the service row plus the derived phase and the quoted tokens', () => {
    const mine = row({
      id: 9,
      usdCents: 250,
      role: 'seller',
      listingId: 41,
      buyerAccepted: true,
      sellerAccepted: true,
    });
    expect(adoptedWocOffer(mine, 'awaiting_payment', 19531.25)).toEqual({
      id: 9,
      usdCents: 250,
      tokens: 19531.25,
      role: 'seller',
      phase: 'awaiting_payment',
      listingId: 41,
      buyerAccepted: true,
      sellerAccepted: true,
    });
  });

  it('carries a missing quote as null rather than inventing a figure', () => {
    expect(adoptedWocOffer(row(), 'review', null).tokens).toBeNull();
  });
});

describe('the canonical deal walks review -> awaiting_payment -> paying -> settled', () => {
  // Drives wocOfferPhase (the phase derivation the controller feeds this
  // machine) together with the poll decision, so the whole arc is pinned as
  // behavior rather than as source text.
  it('each server-side move advances the held offer exactly once', () => {
    // Offer made: no listing yet, both reviewing.
    let mine = row();
    let phase = wocOfferPhase(mine, false);
    expect(phase).toBe('review');
    expect(wocOfferPollStep(null, mine, phase)).toEqual({ kind: 'adopt' });
    let cur = adoptedWocOffer(mine, phase, 100);
    expect(wocOfferPollStep(cur, mine, phase)).toEqual({ kind: 'keep' });

    // Both agreed and the escrow listing exists: the buyer owes payment.
    mine = row({ status: 'accepted', buyerAccepted: true, sellerAccepted: true, listingId: 41 });
    mine.listingStatus = 'open';
    phase = wocOfferPhase(mine, false);
    expect(phase).toBe('awaiting_payment');
    expect(wocOfferPollStep(cur, mine, phase)).toEqual({ kind: 'adopt' });
    cur = adoptedWocOffer(mine, phase, 100);

    // The buyer pressed Pay: locally in flight before any server round trip.
    phase = wocOfferPhase(mine, true);
    expect(phase).toBe('paying');
    expect(wocOfferPollStep(cur, mine, phase)).toEqual({ kind: 'adopt' });
    cur = adoptedWocOffer(mine, phase, 100);

    // The chain settled the sale: report once and close.
    mine.listingResolution = 'sold';
    phase = wocOfferPhase(mine, false);
    expect(phase).toBe('settled');
    expect(wocOfferPollStep(cur, mine, phase)).toEqual({ kind: 'settle' });
  });
});
