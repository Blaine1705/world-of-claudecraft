// Pure decisions for the trade window's standing $WOC offer: which server row
// the open window adopts, how a held offer advances through its phases, and the
// projection from a service row to the client's held-offer shape. DOM-free and
// host-free so the transitions are unit-testable directly
// (tests/woc_trade_offer_view.test.ts). The EFFECTS (REST calls, log lines,
// repaint invalidation, closing the sim trade) stay with the controller.

import type { WocOfferPhase, WocPendingOffer } from '../../trade_woc_view';

/** The slice of the service's offer row these decisions read. Structural on
 *  purpose: the pure core must not import the REST SDK. */
export interface WocOfferRowLike {
  id: number;
  status: string;
  role: 'buyer' | 'seller';
  buyerName: string;
  sellerName: string;
  usdCents: number;
  listingId: number | null;
  buyerAccepted: boolean;
  sellerAccepted: boolean;
}

/**
 * The one standing offer between these two players, or undefined.
 *
 * 'accepted' as well as 'pending': the deal is not over when it is agreed,
 * and dropping it at that moment is what made the payment phase unreachable
 * and left both windows with a stale id to press.
 */
export function selectStandingWocOffer<T extends WocOfferRowLike>(
  offers: readonly T[],
  otherName: string,
  finished: ReadonlySet<number>,
): T | undefined {
  return offers.find(
    (o) =>
      (o.status === 'pending' || o.status === 'accepted') &&
      (o.role === 'buyer' ? o.sellerName : o.buyerName) === otherName &&
      // Already reported and closed. The row lingers for a grace window so
      // both sides can see the sale finish; re-adopting it here would reopen
      // the window we just closed and block the next deal.
      !finished.has(o.id),
  );
}

export type WocOfferPollStep =
  | { readonly kind: 'settle' }
  | { readonly kind: 'keep' }
  | { readonly kind: 'adopt' };

/**
 * What the poll does with the row it found.
 *
 * 'settle': the deal is DONE and gets reported exactly once, then the window
 * has nothing left to offer. 'keep': nothing a repaint would show has moved.
 * Compare the phase AND the acceptance flags, not just the id: one side
 * accepting moves neither the id nor the phase, so an id-and-phase check left
 * the button reading "Accept" after the player had already accepted, and the
 * other side never learned they were waited on.
 */
export function wocOfferPollStep(
  cur: WocPendingOffer | null,
  mine: WocOfferRowLike,
  phase: WocOfferPhase,
): WocOfferPollStep {
  if (phase === 'settled') return { kind: 'settle' };
  if (
    cur?.id === mine.id &&
    cur.phase === phase &&
    cur.buyerAccepted === mine.buyerAccepted &&
    cur.sellerAccepted === mine.sellerAccepted
  ) {
    return { kind: 'keep' };
  }
  return { kind: 'adopt' };
}

/** The service row projected into the held-offer shape the window repaints
 *  from, with the quoted token figure riding beside the agreed USD price. */
export function adoptedWocOffer(
  mine: WocOfferRowLike,
  phase: WocOfferPhase,
  tokens: number | null,
): WocPendingOffer {
  return {
    id: mine.id,
    usdCents: mine.usdCents,
    tokens,
    role: mine.role,
    phase,
    listingId: mine.listingId,
    buyerAccepted: mine.buyerAccepted,
    sellerAccepted: mine.sellerAccepted,
  };
}
