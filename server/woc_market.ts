// $WOC Exchange service: the server-side marketplace's lifecycle logic
// (docs/prd/woc/marketplace.md), behind injected seams so tests run with an
// in-memory WocMarketDb and a scripted economy, the SocialService/SocialDb
// split. Pure decisions live in woc_market_rules.ts; SQL in woc_market_db.ts;
// the economy-service client in woc_market_proxy.ts; item custody crosses
// into the Sim only through the WocMarketCustody bridge (game.ts wiring).
//
// Money model: every stored value is INTEGER USD CENTS. Token amounts exist
// only inside economy-service quotes (base-unit strings plus display token
// numbers the service computed); this module never converts between the two.
//
// Fail-closed: with the feature flag off, the wallet unlinked, or the economy
// service unavailable/unhealthy, every mutating flow refuses with a typed
// reason and no custody or database action. Existing auctions keep counting
// down while paused; only irreversible steps (new bids, buy-now, quotes,
// confirmations) suspend, per the PRD's "Price source and health".

import { ITEMS } from '../src/sim/data';
import type { ExtractRef, ExtractRefusal } from '../src/sim/inventory_extract';
import type { CharacterState } from '../src/sim/sim';
import type { InvSlot } from '../src/sim/types';
import {
  antiSnipeExtendedEndMs,
  bondCents,
  type ListingParamsRefusal,
  listingEligibility,
  listingReturnCustodyRef,
  listingSoldNoticeCustodyRef,
  minNextBidCents,
  settlementCustodyRef,
  strikeSuspensionMs,
  validListingParams,
  WOC_MARKET_BOND_PENDING_TTL_SECONDS,
  WOC_MARKET_BOND_POLL_PARK_SECONDS,
  WOC_MARKET_BUY_NOW_LOCK_SECONDS,
  WOC_MARKET_CONFIRM_UNAVAILABLE_REASON,
  WOC_MARKET_DIRECTED_OFFER_TTL_SECONDS,
  WOC_MARKET_DURATION_HOURS,
  WOC_MARKET_MAX_ACTIVE_LISTINGS,
  WOC_MARKET_SETTLEMENT_WINDOW_SECONDS,
  WOC_MARKET_STRANDED_RECLAIM_SECONDS,
  type WocBidStatus,
  type WocEligibilityPolicy,
  type WocEligibilityRefusal,
  type WocListingFormat,
  type WocListingParams,
  type WocSettlementState,
} from './woc_market_rules';

// ---------------------------------------------------------------------------
// Row shapes (persisted by woc_market_db.ts)
// ---------------------------------------------------------------------------

export type WocListingLifecycle = 'active' | 'ending' | 'settling' | 'closed';
export type WocListingResolution =
  | 'sold'
  | 'no_bids'
  | 'reserve_not_met'
  | 'unsettled'
  | 'cancelled'
  | 'suspended';

export interface WocListingRow {
  id: number;
  realm: string;
  sellerAccount: number;
  sellerCharacter: number;
  sellerName: string;
  sellerWallet: string;
  item: InvSlot;
  itemId: string;
  quality: string;
  format: WocListingFormat;
  startCents: number;
  reserveCents: number | null;
  buyNowCents: number | null;
  offerNext: boolean;
  status: WocListingLifecycle;
  resolution: WocListingResolution | null;
  itemDisposed: boolean;
  currentBidCents: number | null;
  currentBidId: number | null;
  endsAtMs: number;
  baseEndsAtMs: number;
  buyNowLockAccount: number | null;
  buyNowLockExpiresMs: number | null;
  createdAtMs: number;
  /** The one account this sale is addressed to, or null for a public listing.
   *  A non-null value means the row is invisible to browse and buyable only by
   *  that account (docs/prd/woc/p2p-woc-trade.md). */
  directedBuyerAccount: number | null;
  /** Seller cancel-intent stamped on a LOCKED listing: no new lock claims or
   *  bids from that moment; an unpaid lock expiry closes the listing
   *  cancelled (the converge arm), a paid window proceeds to settlement. */
  cancelRequestedAtMs: number | null;
}

export type WocDirectedOfferStatus =
  | 'pending' // awaiting the named buyer
  | 'accepted' // became a directed listing; the item is now in escrow
  | 'declined' // the buyer said no
  | 'withdrawn' // the seller pulled it before acceptance
  | 'expired'; // the TTL elapsed unanswered

export interface WocDirectedOfferRow {
  id: number;
  realm: string;
  sellerAccount: number;
  sellerCharacter: number;
  sellerName: string;
  buyerAccount: number;
  buyerName: string;
  /** The copy the SELLER named when accepting, or null while the offer is still
   *  just a price. The buyer opens the deal, so the item is unknown until then. */
  itemRef: ExtractRef | null;
  itemId: string | null;
  usdCents: number;
  status: WocDirectedOfferStatus;
  listingId: number | null;
  createdAtMs: number;
  expiresAtMs: number;
  /** Each side agrees through the trade window's ordinary Accept button; the
   *  SECOND acceptance is what escrows. */
  buyerAccepted: boolean;
  sellerAccepted: boolean;
  /** The directed listing's own state, once one exists. Lets the seller tell
   *  "waiting for payment" from "paid" without a second round trip. */
  listingStatus: string | null;
  listingResolution: string | null;
  /**
   * The latest settlement's state for this listing, or null while none exists.
   *
   * This is what lets the SELLER see that a payment is in flight. Without it
   * their window shows "waiting for payment" from the moment they accept until
   * the item silently vanishes, so a buyer signing in their wallet and a buyer
   * who walked away look identical for as long as confirmation takes.
   */
  settlementState: string | null;
}

export type WocBondState =
  | 'pending' // intent issued, transfer unconfirmed
  | 'held' // confirmed, refund owed on outbid/close/cancel
  | 'void' // never confirmed (lapsed bid); nothing to move
  | 'refund_due'
  | 'refunded'
  | 'forfeit_due'
  | 'forfeited';

export interface WocBidRow {
  id: number;
  listingId: number;
  account: number;
  characterId: number;
  characterName: string;
  wallet: string;
  amountCents: number;
  status: WocBidStatus;
  bondCents: number;
  bondState: WocBondState;
  bondReference: string | null;
  bondQuoteExpiresAtMs: number | null;
  /** The signature the bidder handed back, recorded before the chain decides so
   *  an undecided bond can be re-checked instead of refused. */
  bondSignature: string | null;
  /** When the signature was recorded (null on legacy rows: age falls back
   *  to placedAtMs). The poll park axis and nothing else. */
  bondSignatureAtMs: number | null;
  placedAtMs: number;
}

export interface WocSettlementRow {
  id: number;
  listingId: number;
  bidId: number | null; // null on a buy-now settlement
  attempt: number; // 0 buy-now, 1 close winner, 2.. cascade offers
  buyerAccount: number;
  buyerCharacter: number;
  buyerName: string;
  buyerWallet: string;
  amountCents: number;
  state: WocSettlementState;
  quoteReference: string | null;
  quoteExpiresAtMs: number | null;
  txSignature: string | null;
  failReason: string | null;
  /** Base-unit token amount from the confirmed quote, for sale provenance. */
  settledAmountBase: string | null;
  deadlineAtMs: number;
  createdAtMs: number;
}

export interface WocSaleRow {
  id: number;
  realm: string;
  listingId: number;
  itemId: string;
  item: InvSlot;
  priceCents: number;
  amountBase: string | null;
  sellerAccount: number;
  buyerAccount: number;
  sellerName: string;
  buyerName: string;
  excluded: boolean;
  atMs: number;
}

export interface WocStrikeRow {
  accountId: number;
  strikes: number;
  suspendedUntilMs: number | null;
}

export interface WocBrowseQuery {
  page: number;
  pageSize: number;
  quality: string | null;
  format: WocListingFormat | null;
  /** Client-resolved item ids for a name search (the server stays
   *  language-agnostic; the client owns localized names). */
  itemIds: readonly string[] | null;
  sort: 'ending' | 'newest' | 'price_asc' | 'price_desc';
}

// ---------------------------------------------------------------------------
// Injected seams
// ---------------------------------------------------------------------------

export interface NewWocListing {
  realm: string;
  sellerAccount: number;
  sellerCharacter: number;
  sellerName: string;
  sellerWallet: string;
  item: InvSlot;
  itemId: string;
  quality: string;
  params: WocListingParams;
  endsAtMs: number;
}

export interface CharacterSaveArgs {
  characterId: number;
  level: number;
  state: CharacterState;
  leaseNonce: string | undefined;
}

export interface WocMarketDb {
  // Listing custody edge: character UPDATE (the bags just lost the copy) and
  // the listing INSERT commit in ONE transaction, with the per-account active
  // cap enforced under a lock (the insertAssetCapped shape).
  escrowInsertListing(
    save: CharacterSaveArgs,
    listing: NewWocListing,
  ): Promise<{ ok: true; id: number } | { ok: false; reason: 'lease_lost' | 'cap_reached' }>;
  listingById(realm: string, id: number): Promise<WocListingRow | null>;
  /** A has-more PROBE, never a full count: the window count forced a read of
   *  every live listing per page (measured as a parallel seq scan plus an
   *  external merge sort at a realm's listing cap). */
  browseListings(
    realm: string,
    q: WocBrowseQuery,
  ): Promise<{ rows: WocListingRow[]; hasMore: boolean }>;
  listingsBySeller(realm: string, account: number): Promise<WocListingRow[]>;
  countActiveBySeller(realm: string, account: number): Promise<number>;

  // --- Directed p2p offers (pre-escrow; acceptance is what creates a listing) --
  insertDirectedOffer(offer: {
    realm: string;
    sellerAccount: number;
    sellerCharacter: number;
    sellerName: string;
    buyerAccount: number;
    buyerName: string;
    usdCents: number;
    expiresAtMs: number;
  }): Promise<WocDirectedOfferRow>;
  directedOfferById(realm: string, id: number): Promise<WocDirectedOfferRow | null>;
  /** Pending offers this account may act on, both directions. */
  directedOffersForAccount(realm: string, account: number): Promise<WocDirectedOfferRow[]>;
  /**
   * Move a PENDING offer to a terminal status, atomically.
   *
   * Returns the row on success and null when it was not pending, which is what
   * makes accept idempotent under a double-click: the second call loses the
   * compare-and-set and never reaches the escrow path, so one offer can never
   * extract two copies.
   */
  resolveDirectedOffer(
    realm: string,
    id: number,
    to: Exclude<WocDirectedOfferStatus, 'pending'>,
    opts?: { listingId?: number },
  ): Promise<WocDirectedOfferRow | null>;
  /** Expire pending offers past their TTL. Returns how many were expired. */
  expireDueDirectedOffers(realm: string, nowMs: number, limit: number): Promise<number>;
  /**
   * Resolve a character NAME to its character and owning account, or null.
   *
   * A directed offer names its counterparty by NAME, because that is the only
   * stable handle the trade window has: TradeInfo carries a sim entity id
   * (`otherPid`), which is not a character id, plus the display name.
   * `characters.name` is globally UNIQUE, so the name identifies exactly one
   * character, and resolving here means no account id ever crosses the wire.
   */
  characterByName(
    realm: string,
    name: string,
  ): Promise<{ characterId: number; accountId: number; name: string } | null>;
  /**
   * Put an 'accepted' offer back to pending after its escrow failed.
   *
   * The compensating half of the claim-then-escrow ordering: the status flip has
   * to happen first (it is the lock that stops a double accept extracting twice),
   * so a failed escrow must undo it or the deal is silently dead while both
   * players still believe it is live. Narrowed to 'accepted' with no listing, so
   * it can never resurrect an offer that really did become a listing.
   */
  acceptDirectedOfferSide(
    realm: string,
    id: number,
    side: 'buyer' | 'seller',
    itemRef: ExtractRef | null,
  ): Promise<WocDirectedOfferRow | null>;
  reopenDirectedOffer(realm: string, id: number): Promise<void>;
  /** Cancel iff still active with no pending/active bid and no open
   *  settlement, all checked atomically under the listing row lock. An
   *  UNEXPIRED buy-now lock over an unpaid window stamps CANCEL-INTENT
   *  instead of refusing ('cancel_pending': no new claims or bids; the
   *  converge arm closes the listing once the window ends unpaid); a paid
   *  window still refuses 'settlement_live'. A leftover 'failed' settlement
   *  is expired in the same transaction so its retry arm cannot revive a
   *  payment against a cancelled listing. Returns the row for the return
   *  flight. */
  cancelListingIfUnbid(
    realm: string,
    id: number,
    sellerAccount: number,
    nowMs: number,
  ): Promise<
    | WocListingRow
    | 'not_found'
    | 'not_yours'
    | 'has_bids'
    | 'not_active'
    | 'cancel_pending'
    | 'settlement_live'
    | 'contended'
  >;
  /** The cancel-intent converge read: stamped, active listings whose lock
   *  window ended, on the shared rotation order; excludeIds are the caller's
   *  backing-off skipped rows. */
  cancelPendingListings(
    realm: string,
    nowMs: number,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocListingRow[]>;
  /** Close one cancel-pending listing whose window ended unpaid (the converge
   *  arm); 'skip' when anything still rides it. Returns the closed row for
   *  the return flight. */
  closeCancelPendingListing(
    realm: string,
    id: number,
    nowMs: number,
  ): Promise<WocListingRow | 'skip' | 'contended'>;
  /** Admin suspend, atomically and only while no payment can be moving: an
   *  unexpired buy-now lock, a settlement in 'confirming' or beyond (a
   *  signature exists, so the chain may still land it), or an 'offered'
   *  settlement holding a live quote (the buyer may already have broadcast
   *  the transfer; the signature only reaches us at confirm) refuses the
   *  suspend. A settlement no payment can be riding ('failed', or 'offered'
   *  with no live quote) is expired, open bids cancel with held bonds queued
   *  for refund, and the listing closes 'suspended', all in one transaction.
   *  'contended' is the bounded-lock-wait refusal (55P03/40P01). */
  suspendListingIfSafe(
    realm: string,
    id: number,
    nowMs: number,
  ): Promise<
    WocListingRow | 'not_found' | 'not_active' | 'buy_now_pending' | 'settlement_live' | 'contended'
  >;
  /** Claim due auctions: active AND endsAt <= now become 'ending' (SKIP
   *  LOCKED), returned for resolution. */
  claimDueListings(realm: string, nowMs: number, limit: number): Promise<WocListingRow[]>;
  closeListing(id: number, resolution: WocListingResolution): Promise<void>;
  /** The no-winner close arms ride this guard: lock the listing, refuse
   *  (false) when an open settlement rides it, close otherwise. The caller
   *  parks a refused listing 'settling'. */
  closeListingIfNoOpenSettlement(id: number, resolution: WocListingResolution): Promise<boolean>;
  markListingSettling(id: number): Promise<void>;
  /** closed && !itemDisposed && resolution != 'sold': the return-flight
   *  reconciliation backlog. excludeIds are rows inside their in-process
   *  park backoff, excluded in the QUERY (see deliveringSettlements). */
  undisposedClosedListings(
    realm: string,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocListingRow[]>;
  /** Listings stuck mid-resolution ('ending' / 'settling') past a grace. */
  strandedListings(realm: string, olderThanMs: number, limit: number): Promise<WocListingRow[]>;
  /** Re-open a stranded listing so the ordinary close arm resolves it;
   *  fail-closed no-op while an open OR retry-eligible 'failed' settlement
   *  rides the listing (the failed row belongs to the overdue sweep's
   *  default/forfeit/strike/cascade pass, never to a reopen). */
  reopenListing(id: number): Promise<void>;
  markItemDisposed(id: number): Promise<void>;
  /** Durable book-once claim: true only for the FIRST claim of this ref. */
  claimCustodyRef(realm: string, custodyRef: string): Promise<boolean>;
  markCustodyRefBooked(custodyRef: string): Promise<void>;
  opsListings(q: {
    realm: string;
    status: 'active' | 'ending' | 'settling' | 'closed' | 'all';
    fromMs: number;
    toMs: number;
    page: number;
    pageSize: number;
  }): Promise<{ rows: WocListingRow[]; hasMore: boolean }>;
  opsP2pTrades(q: {
    realm: string;
    status: WocDirectedOfferStatus | 'all';
    fromMs: number;
    toMs: number;
    page: number;
    pageSize: number;
  }): Promise<{ rows: WocOpsP2pTradeRow[]; hasMore: boolean }>;
  /** The claim row for a ref (booked flag plus rail intents), or null when
   *  no claim exists. What the resume paths consult when a claim is not fresh:
   *  booked means done; a grant intent parks; a mail intent may resume only
   *  with evidence the parcel was not already collected (B2b/B2c). */
  custodyRefState(custodyRef: string): Promise<WocCustodyRefState | null>;
  /** Stamp the durable grant intent on an UNBOOKED claim before the in-memory
   *  bag grant. False means the claim vanished or booked under us; the caller
   *  parks rather than granting against a ref it no longer holds. */
  markCustodyGrantIntent(custodyRef: string, characterId: number): Promise<boolean>;
  /** Stamp the mail-rail intent on an UNBOOKED claim before the parcel is
   *  handed to the post office, withdrawing any grant intent in the same
   *  statement (legal only after a grantCopy refusal, which provably left
   *  nothing in the bags). False parks the caller. */
  markCustodyMailIntent(custodyRef: string): Promise<boolean>;
  /** Persist a buyer's bags after a hand-to-hand delivery AND book the custody
   *  ref in one transaction: the granted bags and the delivered record cannot
   *  tear apart, so an ambiguous throw is resolvable afterwards from
   *  booked_at. 'lease_lost': the fence rejected the write (this process no
   *  longer owns the character; nothing landed). 'claim_missing': the claim
   *  row was gone or already booked (hand intervention); the save rolled back
   *  with it. */
  saveDeliveredCharacterBooked(
    save: CharacterSaveArgs,
    custodyRef: string,
  ): Promise<'booked' | 'lease_lost' | 'claim_missing'>;
  /** The delivery close tail as one transaction (delivered CAS, sale row,
   *  listing close + dispose, bond flips). 'stale': the settlement left
   *  delivering/delivered, or the listing row is gone; nothing was written.
   *  'already_final': the listing was already closed AND disposed, so this
   *  run converged nothing new (do not count it, do not re-notify).
   *  'contended': the bounded lock wait expired, retry on a later pass.
   *  Re-running it converges (every write is a compare-and-set and the sale
   *  insert dedupes on woc_market_sales_listing_once). */
  finalizeDeliveredSettlement(args: {
    settlementId: number;
    listingId: number;
    bidId: number | null;
    sale: Omit<WocSaleRow, 'id' | 'excluded' | 'atMs'>;
  }): Promise<'finalized' | 'already_final' | 'stale' | 'contended'>;
  /** The stuck classes for the ops monitor (unbooked claims, stuck
   *  'delivering' settlements, closed-but-undisposed listings, 'review'
   *  settlements, and over-aged paid-but-undecided bonds). Counts SATURATE at
   *  countCap and samples are capped, so the read is O(cap) even at
   *  incident-sized backlogs. The monitor stamps asOfMs on top.
   *  bondOlderThanMs is the stuck-bond age cutoff (the H15-scale bound). */
  stuckCustodyReadout(
    realm: string,
    olderThanMs: number,
    sampleLimit: number,
    countCap: number,
    bondOlderThanMs: number,
  ): Promise<WocStuckCustodyClasses>;
  claimBuyNowLock(
    realm: string,
    id: number,
    account: number,
    nowMs: number,
    expiresAtMs: number,
  ): Promise<
    | WocListingRow
    | 'not_found'
    | 'not_active'
    | 'locked'
    | 'no_buy_now'
    | 'own_listing'
    | 'cancel_pending'
    | 'claim_cooldown'
    | 'contended'
  >;
  /** Release a lock, HOLDER-guarded: only holderAccount's lock clears. */
  clearBuyNowLock(id: number, holderAccount: number): Promise<void>;
  /** Record a public buy-now abandonment (the overdue sweep's recorder;
   *  dedupes with the steal-time recorder on the lock_expires window key). */
  recordBuyNowAbandon(
    realm: string,
    listingId: number,
    account: number,
    lockExpiresAtMs: number,
  ): Promise<void>;

  // Bids
  insertPendingBid(args: {
    realm: string;
    listingId: number;
    account: number;
    characterId: number;
    characterName: string;
    wallet: string;
    amountCents: number;
    bondCents: number;
    nowMs: number;
    minNext: (row: WocListingRow) => number;
  }): Promise<
    | { ok: true; bid: WocBidRow }
    | {
        ok: false;
        reason:
          | 'not_found'
          | 'not_active'
          | 'cancel_pending'
          | 'own_listing'
          | 'bid_too_low'
          | 'already_pending';
      }
  >;
  /** Anti-snipe at bond progress: extend the auction end for a bid whose
   *  signature was just recorded. Best-effort (see PgWocMarketDb). */
  extendAuctionForBondProgress(
    realm: string,
    listingId: number,
    extendEndsToMs: (row: WocListingRow) => number | null,
  ): Promise<'extended' | 'skip' | 'contended'>;
  /** CAS: applies only to an unpaid quote (status pending_bond AND no
   *  recorded signature); false = nothing written. See PgWocMarketDb. */
  setBidBondQuote(bidId: number, reference: string, expiresAtMs: number): Promise<boolean>;
  /** Record the bidder's signature while the chain is still deciding;
   *  nowMs stamps bond_signature_at (first recording wins). Success returns
   *  the STAMPED moment (the first arrival, not this retry), the extension
   *  anchor; 'not_pending' also covers a DIFFERENT signature against a
   *  signed pending bond (the caller re-reads for the precise refusal). */
  submitBondSignature(
    bidId: number,
    signature: string,
    nowMs: number,
  ): Promise<{ signatureAtMs: number } | 'not_pending' | 'signature_reused'>;
  /** Paid-but-undecided bonds, for the sweep to re-check, on the poll
   *  rotation order; excludeIds are the caller's backing-off parked rows. */
  confirmingBonds(
    realm: string,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocBidRow[]>;
  /** Rotate one bond to the poll tail (writes poll_parked_at only). */
  touchBidPollRow(id: number): Promise<void>;
  /** A bond the chain decided against: the bid lapses and the bond voids.
   *  No-ops on a HELD bond (see PgWocMarketDb: a reorg-flipped verdict must
   *  never void held money into an unreachable state). */
  lapseBid(bidId: number): Promise<void>;
  bidById(id: number): Promise<WocBidRow | null>;
  /** pending_bond -> cancelled for the bidder who never funded it. */
  abandonPendingBid(realm: string, bidId: number, account: number): Promise<boolean>;
  /** pending_bond -> active; the previous active bid (if any) flips to
   *  'outbid' with bond refund_due, and the listing's standing bid updates.
   *  Refuses when the listing is no longer active or the amount no longer
   *  clears the standing bid (the racer arm: bid -> outbid, bond refund_due
   *  when held). */
  activateBid(
    bidId: number,
    nowMs: number,
  ): Promise<'activated' | 'superseded' | 'listing_closed' | 'not_pending' | 'contended'>;
  markBondHeld(bidId: number): Promise<void>;
  lapsePendingBids(realm: string, cutoffMs: number, limit: number): Promise<number>;
  bidsByAccount(realm: string, account: number, limit: number): Promise<WocBidRow[]>;
  bidsForListing(listingId: number): Promise<WocBidRow[]>;
  /** Cascade pick: the highest 'outbid' bid meeting `minCents` whose account
   *  is not among `excludedAccounts`. Selection only; the 'won' stamp rides
   *  the settlement insert (insertSettlement winnerBidId). */
  nextCascadeBidder(
    listingId: number,
    minCents: number,
    excludedAccounts: readonly number[],
  ): Promise<WocBidRow | null>;
  /** With `from`, a compare-and-set (no-op when the bid left those states). */
  markBidStatus(bidId: number, status: WocBidStatus, from?: WocBidStatus[]): Promise<void>;
  /** Atomic loser demote: outbid + queue the held bond for refund in one
   *  statement, compare-and-set from 'active' (a bid a concurrent suspend
   *  already cancelled is left alone). */
  markBidOutbidQueueRefund(bidId: number): Promise<void>;
  setBondState(bidId: number, from: WocBondState[], to: WocBondState): Promise<boolean>;
  bondsDue(realm: string, limit: number): Promise<WocBidRow[]>;

  // Settlements
  /** Insert the one open settlement for a listing, serialized on the listing
   *  row lock (bid stamp first, then the listing: the file-wide lock order).
   *  When `winnerBidId` is set, that bid is stamped 'won' in the same
   *  transaction as the insert, compare-and-set from `winnerFrom` (default
   *  active/outbid): a conflict rolls both back, so no bid can sit 'won' with
   *  no settlement, and a winner that left the pickable states aborts as
   *  'winner_gone' (treated like 'live_settlement_exists' by every caller).
   *  'listing_closed' means a cancel or suspend closed the listing first
   *  (callers answer not_active); a missing listing keeps the historical
   *  'live_settlement_exists' conflation; 'contended' is the bounded
   *  lock-wait refusal. */
  insertSettlement(args: {
    listingId: number;
    bidId: number | null;
    attempt: number;
    buyerAccount: number;
    buyerCharacter: number;
    buyerName: string;
    buyerWallet: string;
    amountCents: number;
    deadlineAtMs: number;
    nowMs: number;
    winnerBidId?: number;
    winnerFrom?: WocBidStatus[];
  }): Promise<
    WocSettlementRow | 'live_settlement_exists' | 'listing_closed' | 'winner_gone' | 'contended'
  >;
  settlementById(id: number): Promise<WocSettlementRow | null>;
  settlementsByAccount(realm: string, account: number, limit: number): Promise<WocSettlementRow[]>;
  liveSettlementForListing(listingId: number): Promise<WocSettlementRow | null>;
  setSettlementQuote(
    id: number,
    reference: string,
    expiresAtMs: number,
    amountBase: string | null,
  ): Promise<boolean>;
  /** offered -> confirming with the signature recorded (unique). */
  submitSettlementSignature(
    id: number,
    signature: string,
  ): Promise<'ok' | 'not_offered' | 'signature_reused'>;
  /** False on a CAS miss AND on a 23505 from the one-open-settlement index
   *  (the failed -> offered revival racing a second open settlement): callers
   *  must treat false as a typed refusal, never assume the row moved. */
  transitionSettlement(
    id: number,
    from: WocSettlementState[],
    to: WocSettlementState,
    failReason?: string,
  ): Promise<boolean>;
  confirmingSettlements(realm: string, limit: number): Promise<WocSettlementRow[]>;
  /** confirmed -> delivering (SKIP LOCKED claim). */
  claimDeliverableSettlements(realm: string, limit: number): Promise<WocSettlementRow[]>;
  /** Stuck 'delivering' rows (crash recovery). excludeIds are rows inside
   *  their in-process park backoff: excluded in the QUERY so a standing
   *  parked set costs no batch slots and no per-pass writes. */
  deliveringSettlements(
    realm: string,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocSettlementRow[]>;
  /** One page of 'delivered' settlements whose LISTING never closed: the
   *  residue an older binary's separately-committed close tail leaves behind.
   *  Cursor-paged over open listing ids so the cost is O(page) regardless of
   *  the planner; the residue fetch is bounded by maxSettlements (each row
   *  costs the caller a finalize transaction plus a mail-book write), and a
   *  truncated fetch returns the last RETURNED row's listing as the cursor.
   *  lastListingId null means the cycle is exhausted. */
  deliveredUnclosedSettlementsPage(
    realm: string,
    afterListingId: number,
    pageSize: number,
    maxSettlements: number,
  ): Promise<{ settlements: WocSettlementRow[]; lastListingId: number | null }>;
  /** Dispose closed sold listings that carry a STANDING sale row (an older
   *  binary's crash residue between its close and dispose statements);
   *  returns how many converged. Sold rows with no sale stay parked; a row a
   *  concurrent transaction holds is skipped (never waited on). */
  disposeSoldResidueListings(realm: string, limit: number): Promise<number>;
  /** Rotate a parked settlement to the back of the sweep batch queue. Writes
   *  the dedicated rotation column ONLY: the stuck readout's age signals
   *  (updated_at) must never move on a park, or the parked row can never age
   *  past the stuck threshold and the monitor is blind to it. */
  touchSettlementRow(id: number): Promise<void>;
  /** The listing twin, for a parked return in the undisposed backlog. */
  touchListingRow(id: number): Promise<void>;
  /** Deadline-overdue offered/failed rows, plus 'confirming' rows older than
   *  confirmingCutoffMs (the H15 bound; aged on updated_at). */
  overdueSettlements(
    realm: string,
    nowMs: number,
    limit: number,
    confirmingCutoffMs: number,
  ): Promise<WocSettlementRow[]>;

  // Sales, strikes, terms
  /** Raw provenance insert; throws 23505 on a standing non-excluded row for
   *  the listing (woc_market_sales_listing_once). The delivery path itself
   *  writes its sale inside finalizeDeliveredSettlement (which dedupes on
   *  that index); this stays the primitive for corrections and tests. */
  insertSale(args: Omit<WocSaleRow, 'id' | 'excluded' | 'atMs'>): Promise<number>;
  salesForItem(realm: string, itemId: string, limit: number): Promise<WocSaleRow[]>;
  /** 'conflict': re-including a voided row while a standing non-excluded row
   *  holds the listing's slot (woc_market_sales_listing_once). */
  setSaleExcluded(id: number, excluded: boolean): Promise<'ok' | 'miss' | 'conflict'>;
  strikeInfo(account: number): Promise<WocStrikeRow | null>;
  addStrike(account: number, suspendedUntilMs: number | null): Promise<WocStrikeRow>;
  clearStrikes(account: number): Promise<void>;
  termsAcceptedAt(account: number): Promise<number | null>;
  recordTermsAccepted(account: number, nowMs: number): Promise<void>;
  /** The buyer's delivery character, revalidated at delivery time: the stored
   *  character when it still exists on this realm under this account, else
   *  any character of the account on the realm, else null (hold and retry). */
  deliveryTarget(
    realm: string,
    account: number,
    preferredCharacter: number,
  ): Promise<{ characterId: number; name: string } | null>;
}

/** Token-side quote leg: the base-unit string is exact, the tokens number is
 *  the service-computed display value. The game renders both verbatim. */
export interface WocQuoteLeg {
  base: string;
  tokens: number;
}

export interface WocPriceInfo {
  available: boolean;
  healthy: boolean;
  reason: string | null;
  /** Service-computed display rate (tokens per 1 USD); null when down. */
  tokensPerUsd: number | null;
  asOfMs: number | null;
}

/** The fee split for an amount, in USD CENTS, as computed by the economy
 *  service. The game NEVER derives these: the real split rounds each fee leg up
 *  and gives the seller the remainder, so a percentage recomputed here would
 *  disagree with the settlement by a cent. Null whenever the estimate is
 *  unavailable, and also on an older service build that does not send it. */
export interface WocEstimateSplit {
  sellerCents: number;
  burnCents: number;
  treasuryCents: number;
}

export interface WocEstimate {
  available: boolean;
  usdCents: number;
  amount: WocQuoteLeg | null;
  asOfMs: number | null;
  split: WocEstimateSplit | null;
}

export interface WocQuoteIntent {
  ok: boolean;
  reference: string | null;
  /** The full transfer the buyer signs (service-built transaction). */
  transactionBase64: string | null;
  /** Whether the buyer must sign it. False only under the service's dev chain,
   *  whose stand-in transaction no wallet can sign. Defaults TRUE on anything
   *  the service does not say, so a missing field can never skip a signature. */
  signatureRequired: boolean;
  amount: WocQuoteLeg | null;
  seller: WocQuoteLeg | null;
  burn: WocQuoteLeg | null;
  treasury: WocQuoteLeg | null;
  expiresAtMs: number | null;
  reason: string | null;
}

export interface WocMarketEconomy {
  price(): Promise<WocPriceInfo>;
  estimate(usdCents: number): Promise<WocEstimate>;
  bondQuote(args: {
    memoRef: string;
    usdCents: number;
    buyerWallet: string;
  }): Promise<WocQuoteIntent>;
  settlementQuote(args: {
    memoRef: string;
    usdCents: number;
    buyerWallet: string;
    sellerWallet: string;
  }): Promise<WocQuoteIntent>;
  confirm(
    reference: string,
    signature: string,
  ): Promise<{ settled: boolean; pending: boolean; reason: string | null }>;
  refundBond(reference: string): Promise<{ done: boolean; reason: string | null }>;
  forfeitBond(reference: string): Promise<{ done: boolean; reason: string | null }>;
}

export type WocCustodyExtract =
  | { ok: true; extracted: InvSlot; characterName: string; save: CharacterSaveArgs }
  | { ok: false; reason: ExtractRefusal | 'offline' | 'not_yours' };

/**
 * The result of handing a held copy straight to a live buyer.
 *
 * Every refusal is ORDINARY, not an error: the buyer logged out, or their bags
 * are full, or the character is not theirs. The caller mails the parcel instead,
 * so the item is never dropped and never duplicated.
 */
export type WocCustodyGrant =
  | { ok: true; save: CharacterSaveArgs }
  /** 'ambiguous' is the one refusal that is NOT clean: the grant already
   *  mutated the live bags and the session state is unprovable, so the
   *  caller must PARK (never convert to mail; that is a second copy). */
  | { ok: false; reason: 'offline' | 'not_yours' | 'no_space' | 'ambiguous' };

/** The durable claim row for a custody ref (see custodyRefState). */
export interface WocCustodyRefState {
  booked: boolean;
  /** Non-null while a direct bag grant is (or may be) in flight under this
   *  ref: the character it was granted to. See the DDL comment on
   *  woc_market_custody_claims.grant_character_id. */
  grantCharacterId: number | null;
  /** True once the mail rail durably recorded its intent for this ref;
   *  a claim with NEITHER intent and no booking is unattributable and parks. */
  mailIntent: boolean;
}

/** The stuck classes the ops monitor surfaces (stuckCustodyReadout).
 *  Counts SATURATE at the readout's countCap; saturated makes the "cap or
 *  more" case explicit on the wire. Samples are separately capped. */
export interface WocStuckCustodyClasses {
  unbookedClaims: {
    count: number;
    saturated: boolean;
    sample: {
      custodyRef: string;
      claimedAtMs: number;
      grantCharacterId: number | null;
      mailIntent: boolean;
    }[];
  };
  stuckDelivering: {
    count: number;
    saturated: boolean;
    /** updatedAtMs is the class's age signal (stamped at the delivering
     *  claim); createdAtMs is kept for provenance (when the settlement
     *  itself began). */
    sample: { id: number; listingId: number; createdAtMs: number; updatedAtMs: number }[];
  };
  undisposedListings: {
    count: number;
    saturated: boolean;
    sample: { id: number; resolution: string | null; updatedAtMs: number }[];
  };
  /** Settlements the overdue sweep parked in 'review' (the H15 bound): every
   *  row is operator-actionable NOW, so this class carries no age filter.
   *  Operator semantics: verify the payment reference on chain (the service
   *  release tooling), then transitionSettlement review -> confirmed (paid:
   *  delivery resumes) or review -> failed (unpaid: the overdue default pass
   *  takes it from there). updatedAtMs is when the row entered review. */
  reviewSettlements: {
    count: number;
    saturated: boolean;
    sample: { id: number; listingId: number; createdAtMs: number; updatedAtMs: number }[];
  };
  /** Paid-but-undecided bonds (pending_bond with a recorded signature) older
   *  than the same H15-scale bound: the poll still re-checks them, but past
   *  this age the chain verdict is overdue and an operator should verify the
   *  signature by hand (the exit paths are the chain deciding, or an operator
   *  resolving via the service tooling; there is deliberately no automatic
   *  time-based void, because the money may have landed). */
  stuckBonds: {
    count: number;
    saturated: boolean;
    sample: { id: number; listingId: number; account: number; placedAtMs: number }[];
  };
}

/** What the monitor serves: the classes plus the refresh stamp. The cached
 *  read stale-serves through a DB outage, so asOfMs is what lets a consumer
 *  (and the log beat) tell a fresh readout from an hour-old one. */
export interface WocStuckCustodyReadout extends WocStuckCustodyClasses {
  asOfMs: number;
}

/** The one bridge into the live Sim (game.ts wiring). Every method is
 *  synchronous-in-memory except persistMailParcel, which books at most once
 *  by custodyRef and then persists the realm mail blob. */
export interface WocMarketCustody {
  extractCopy(accountId: number, characterId: number, ref: ExtractRef): WocCustodyExtract;
  /** Hand a held copy straight to a live buyer's bags. Returns the save the
   *  caller must persist before treating the delivery as done. */
  grantCopy(accountId: number, characterId: number, slot: InvSlot): WocCustodyGrant;
  /** Re-serialize a live session WITHOUT granting anything: the resume path
   *  for a direct hand-off whose atomic save threw mid-flight. The bags in
   *  the returned save already hold the earlier grant (same live session), so
   *  persisting it retries the delivery without minting a second copy. */
  snapshotCopy(accountId: number, characterId: number): WocCustodyGrant;
  /** Compensation for a failed escrow persist: the copy goes straight back. */
  restoreCopy(characterId: number, slot: InvSlot): void;
  /** Book-once (by custodyRef) + persist. 'booked' covers the already-booked
   *  reconciliation case too: after this resolves, the parcel is durably in
   *  the realm mail blob. */
  persistMailParcel(
    recipient: { key: string; name: string },
    letter: 'delivery' | 'return' | 'sold_notice',
    items: InvSlot[],
    custodyRef: string,
  ): Promise<void>;
  /** Whether the LIVE mail book still holds a parcel under this ref. Advisory
   *  (a collected letter can be deleted), which is exactly why the resume
   *  paths treat presence as permission and absence as ambiguity. */
  hasParcel(custodyRef: string): boolean;
}

export interface WocMarketConfig {
  enabled: boolean;
  realm: string;
  policy: WocEligibilityPolicy;
  /** H15 bound: how long a settlement may sit in 'confirming' before the
   *  overdue sweep parks it in the operator 'review' state. Config-read
   *  (WOC_MARKET_CONFIRMING_REVIEW_HOURS via wocMarketConfig); hours-scale by
   *  design, so a routine finality delay or a short economy outage self-heals
   *  through the poll before an operator is ever paged. */
  confirmingReviewMs: number;
}

export interface WocMarketDeps {
  db: WocMarketDb;
  economy: WocMarketEconomy;
  custody: WocMarketCustody;
  verifiedWallet(account: number): Promise<string | null>;
  balanceTokens(pubkey: string): Promise<number | null>;
  config: WocMarketConfig;
  now?: () => number;
  /** Per-pass observability sink (main.ts logs it). `saturated` names every arm
   *  that came back with a FULL batch, i.e. a backlog that is not draining.
   *  `elapsedMs` is the pass wall-clock through the injected now() (zero under
   *  a fixed test clock), so a slow pass is measurable before it becomes pool
   *  contention. */
  onSweepPass?(stats: WocSweepPassStats, saturated: readonly string[], elapsedMs: number): void;
  /** Per-arm failure sink: one poisoned row or one failing arm is reported
   *  here and the REST of the pass still runs (per-arm isolation). Defaults
   *  to console.error when absent. */
  onSweepError?(arm: string, err: unknown): void;
}

// ---------------------------------------------------------------------------
// Service results
// ---------------------------------------------------------------------------

export type WocMarketRefusal =
  | 'disabled'
  | 'market_paused' // economy service down or oracle unhealthy
  | 'wallet_required'
  | 'terms_required'
  | 'account_suspended'
  | 'character_invalid'
  | 'not_found'
  | 'not_yours'
  | 'not_active'
  | 'own_listing'
  | 'has_bids'
  | 'bid_too_low'
  | 'already_pending'
  | 'insufficient_balance'
  | 'quote_unavailable'
  | 'quote_expired'
  | 'not_pending'
  | 'confirm_failed'
  // A recorded signature is awaiting the chain's verdict: quote refreshes and
  // abandons must wait for it rather than orphan or void money in flight.
  | 'confirm_in_flight'
  | 'buy_now_locked'
  // The seller stamped cancel-intent on this listing: no new lock claims or
  // bids; the current window resolves and then the listing closes.
  | 'cancel_pending'
  // The claimer recently abandoned a buy-now window (this listing's re-claim
  // cooldown, or the account-wide abandons-per-hour cap).
  | 'claim_cooldown'
  // A payment for the listing is past 'offered' (or delivered but unclosed):
  // cancel and suspend must wait for it to resolve, never race it.
  | 'settlement_in_flight'
  // The bounded lock wait on a guard transaction expired (55P03) or the
  // transaction was a deadlock victim (40P01): plain contention, retryable.
  | 'contended'
  // An admin sale correction is blocked by a standing non-excluded sale row
  // for the same listing (woc_market_sales_listing_once).
  | 'sale_conflict'
  | 'no_buy_now'
  | 'cap_reached'
  | 'lease_lost'
  | 'signature_reused'
  | 'stale_copy'
  // Directed p2p offers
  | 'recipient_wallet_required' // the named buyer has no verified wallet
  | 'self_offer' // seller and buyer are the same account
  | 'offer_expired'
  | ExtractRefusal
  | WocEligibilityRefusal
  | ListingParamsRefusal;

export type Refused = { ok: false; reason: WocMarketRefusal };
const refuse = (reason: WocMarketRefusal): Refused => ({ ok: false, reason });

// Sweep pass budgets: every arm is bounded per pass so one huge backlog can
// never starve the others; the next pass continues where this one stopped.
const SWEEP_BATCH = 25;

/** Per-arm counts for one sweep pass, so a wedged marketplace is visible: a
 *  silent idle pass and a permanently starved backlog look identical without
 *  it. An arm returning a FULL batch is the "backlog is not draining" signal. */
/** A directed offer plus the outcome it reached, for the operator p2p view. */
export interface WocOpsP2pTradeRow extends WocDirectedOfferRow {
  settledAmountBase: string | null;
  txSignature: string | null;
}

export interface WocSweepPassStats {
  lapsedBids: number;
  /** Directed p2p offers that timed out unanswered. */
  expiredOffers: number;
  reclaimed: number;
  closed: number;
  expired: number;
  /** Cancel-pending listings whose lock window ended unpaid, closed
   *  'cancelled' with the return flight home (the cancel-intent converge). */
  cancelClosed: number;
  polled: number;
  /** Bonds paid but not yet decided by the chain, re-checked this pass. */
  polledBonds: number;
  delivered: number;
  reconciled: number;
  /** Delivered-but-unclosed settlements whose close tail was re-driven
   *  forward (an older binary's crash residue converging). */
  redriven: number;
  /** Sold-but-undisposed residue rows whose dispose flag converged (the
   *  sibling residue class; counted apart from redriven so a page-walk beat
   *  and a dispose beat cannot trip the saturation signal together). */
  disposed: number;
  returned: number;
  /** Rows PARKED this pass (delivery or return refusals rotating to the
   *  tail). Parked work is real work: without this a fully parked pass
   *  scored zero everywhere and the pass looked idle exactly when wedged. */
  parked: number;
  bonds: number;
}

/** Sweep failure tags: every per-arm stats key, plus the delivery sub-steps
 *  that report row-level failures from inside an arm (the grant commit and
 *  the seller notice), which carry their own tags so an operator can tell
 *  WHERE in the delivery a row is failing. */
export type WocSweepErrorTag = keyof WocSweepPassStats | 'deliver_grant' | 'deliver_notice';

/** Contention and park accounting for ONE delivery entry: the sweep pass
 *  owns one scope across its arm sequence, and the eager confirm entry mints
 *  its own, so a request-thread delivery can neither clobber a pass's
 *  contention verdict mid-flight nor inherit a stale one. */
interface WocDeliveryScope {
  /** One 'contended' outcome stops the scope's remaining SETTLEMENT work
   *  (the claim, both runDeliveryBatch arms, and the two residue beats):
   *  the rows a break leaves behind are already 'delivering', and retrying
   *  them seconds later only spends the lock_timeout budget the break
   *  conserved. The return arm deliberately ignores it: it writes different
   *  listings and only contributes park events here. */
  contended: boolean;
  /** Park EVENTS in this scope (rows newly parked or re-parked on a retry). */
  parked: number;
}

export class WocMarketService {
  constructor(private readonly deps: WocMarketDeps) {}

  /** Direct grants THIS process applied to a live session whose atomic
   *  save-and-book has not committed yet: custodyRef to the session identity
   *  the grant landed in. Process-local ON PURPOSE: the in-memory grant lives
   *  exactly as long as this process and this session, so a marker that
   *  outlived either would authorize a resume against reloaded bags that may
   *  not hold the item. After a restart (or a session change) an unbooked
   *  grant claim parks for the operator instead (handToBuyer). */
  private readonly pendingGrants = new Map<
    string,
    { characterId: number; leaseNonce: string | undefined; stampMs: number }
  >();

  /** Mail attempts THIS process has stamped an intent for. `written` flips
   *  the moment an attempt REACHES the post office (set before the call, so
   *  a throw anywhere inside still counts): an unwritten entry proves no
   *  parcel can exist yet and authorizes the first write; a WRITTEN entry
   *  proves nothing about collection, so from then on only the parcel still
   *  being IN the book authorizes a re-attempt (a collected letter re-mails
   *  a second copy otherwise). Lost on restart, at which point the in-book
   *  check is the only evidence (bookCustodyOnce). */
  private readonly pendingMail = new Map<string, { stampMs: number; written: boolean }>();

  /** Parked deliveries and their next-retry time: a parked settlement rotates
   *  ONCE (at park time) onto the sweep_parked_at batch order and is then
   *  EXCLUDED from the batch reads until its retry, so a standing parked set
   *  costs no batch slots, no per-pass writes, and cannot starve fresh rows. */
  private readonly parkedDeliveries = new Map<number, number>();

  /** Parked returns, same shape, keyed by listing id: the return backlog
   *  shares the rotation order, so a permanently refused return would
   *  otherwise own the head of its batch and busy-loop exactly like a
   *  parked delivery. */
  private readonly parkedReturns = new Map<number, number>();

  /** Parked cancel-intent converges, same shape, keyed by listing id: a
   *  stamped listing whose buyer PAID skips the converge until that
   *  settlement resolves, which can take operator-scale time. */
  private readonly parkedCancelIntents = new Map<number, number>();

  /** Parked bond polls, keyed by bid id: a signed bond the chain leaves
   *  undecided past the poll park delay (WOC_MARKET_BOND_POLL_PARK_SECONDS,
   *  deliberately its own tunable, not the pending TTL) rotates out of the
   *  poll head (60s backoff) instead of occupying one of the batch's slots
   *  every pass forever; young confirming bonds keep the full poll cadence. */
  private readonly parkedBondPolls = new Map<number, number>();

  /** Next time the delivered-residue arm may run (minute-scale: it converges
   *  an OLDER binary's crash residue, so every-pass cost bought nothing). */
  private redriveDueAtMs = 0;
  /** Listing-id cursor for the residue page walk; resets on an exhausted
   *  cycle. */
  private redriveCursor = 0;
  /** The dispose arm's own minute gate (same cadence, independent clock so
   *  the two residue arms cannot hide each other's failures). */
  private disposeDueAtMs = 0;

  /** Entries in the process-local ledgers older than this are dead weight:
   *  a pending grant is only usable while its exact session lives, a pending
   *  mail attempt retries within a pass or two, and a parked delivery's skip
   *  window is a minute. */
  private static readonly LOCAL_LEDGER_TTL_MS = 10 * 60_000;
  private static readonly PARK_RETRY_MS = 60_000;
  private static readonly REDRIVE_INTERVAL_MS = 60_000;
  private static readonly REDRIVE_PAGE = 500;

  private pruneLocalLedgers(nowMs: number): void {
    const cutoff = nowMs - WocMarketService.LOCAL_LEDGER_TTL_MS;
    for (const [ref, entry] of this.pendingGrants) {
      if (entry.stampMs <= cutoff) this.pendingGrants.delete(ref);
    }
    for (const [ref, entry] of this.pendingMail) {
      if (entry.stampMs <= cutoff) this.pendingMail.delete(ref);
    }
    // The park maps store RETRY times, not stamps: prune once the retry
    // itself has been stale for the ledger horizon.
    for (const [id, retryAtMs] of this.parkedDeliveries) {
      if (nowMs - retryAtMs > WocMarketService.LOCAL_LEDGER_TTL_MS) {
        this.parkedDeliveries.delete(id);
      }
    }
    for (const [id, retryAtMs] of this.parkedCancelIntents) {
      if (nowMs - retryAtMs > WocMarketService.LOCAL_LEDGER_TTL_MS) {
        this.parkedCancelIntents.delete(id);
      }
    }
    for (const [id, retryAtMs] of this.parkedBondPolls) {
      if (nowMs - retryAtMs > WocMarketService.LOCAL_LEDGER_TTL_MS) {
        this.parkedBondPolls.delete(id);
      }
    }
    for (const [id, retryAtMs] of this.parkedReturns) {
      if (nowMs - retryAtMs > WocMarketService.LOCAL_LEDGER_TTL_MS) {
        this.parkedReturns.delete(id);
      }
    }
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private get cfg(): WocMarketConfig {
    return this.deps.config;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async status(): Promise<{
    enabled: boolean;
    price: WocPriceInfo;
    maxActiveListings: number;
  }> {
    const price = this.cfg.enabled
      ? await this.deps.economy.price()
      : { available: false, healthy: false, reason: 'disabled', tokensPerUsd: null, asOfMs: null };
    return {
      enabled: this.cfg.enabled,
      price,
      maxActiveListings: WOC_MARKET_MAX_ACTIVE_LISTINGS,
    };
  }

  async browse(q: WocBrowseQuery): Promise<{ rows: WocListingRow[]; hasMore: boolean }> {
    if (!this.cfg.enabled) return { rows: [], hasMore: false };
    return this.deps.db.browseListings(this.cfg.realm, q);
  }

  /**
   * One listing, for the detail pane.
   *
   * `viewerAccount` is REQUIRED rather than optional, even though a public
   * listing ignores it. A directed sale is visible only to its two parties, and
   * an optional parameter is a defence a caller can forget to pass: making it
   * required means a new call site cannot silently become a leak. Absent or
   * unmatched, a directed row reads as `null`, the same answer a missing id
   * gives, so the two are indistinguishable to a caller probing ids.
   */
  async listingDetail(
    id: number,
    viewerAccount: number | null,
  ): Promise<{ listing: WocListingRow; estimate: WocEstimate | null } | null> {
    if (!this.cfg.enabled) return null;
    const listing = await this.deps.db.listingById(this.cfg.realm, id);
    if (!listing) return null;
    if (listing.directedBuyerAccount !== null) {
      const isParty =
        viewerAccount !== null &&
        (viewerAccount === listing.directedBuyerAccount || viewerAccount === listing.sellerAccount);
      if (!isParty) return null;
    }
    const estimateCents = listing.currentBidCents ?? listing.startCents;
    const estimate = await this.deps.economy.estimate(estimateCents).catch(() => null);
    return { listing, estimate };
  }

  async estimate(usdCents: number): Promise<WocEstimate> {
    if (!this.cfg.enabled || !Number.isInteger(usdCents) || usdCents <= 0) {
      return { available: false, usdCents, amount: null, asOfMs: null, split: null };
    }
    return this.deps.economy.estimate(usdCents);
  }

  async myActivity(account: number): Promise<{
    listings: WocListingRow[];
    bids: WocBidRow[];
    settlements: WocSettlementRow[];
    strikes: WocStrikeRow | null;
    termsAcceptedAtMs: number | null;
    wallet: string | null;
  }> {
    const realm = this.cfg.realm;
    const [listings, bids, settlements, strikes, termsAcceptedAtMs, wallet] = await Promise.all([
      this.deps.db.listingsBySeller(realm, account),
      this.deps.db.bidsByAccount(realm, account, 50),
      this.deps.db.settlementsByAccount(realm, account, 50),
      this.deps.db.strikeInfo(account),
      this.deps.db.termsAcceptedAt(account),
      this.deps.verifiedWallet(account),
    ]);
    return { listings, bids, settlements, strikes, termsAcceptedAtMs, wallet };
  }

  async salesHistory(itemId: string, limit = 20): Promise<WocSaleRow[]> {
    if (!this.cfg.enabled) return [];
    return this.deps.db.salesForItem(this.cfg.realm, itemId, limit);
  }

  // -------------------------------------------------------------------------
  // Shared guards
  // -------------------------------------------------------------------------

  private async guardEnabledHealthy(): Promise<Refused | null> {
    if (!this.cfg.enabled) return refuse('disabled');
    const price = await this.deps.economy.price();
    if (!price.available || !price.healthy) return refuse('market_paused');
    return null;
  }

  private async guardSuspended(account: number): Promise<Refused | null> {
    const row = await this.deps.db.strikeInfo(account);
    if (row?.suspendedUntilMs !== null && row !== null && row.suspendedUntilMs > this.now()) {
      return refuse('account_suspended');
    }
    return null;
  }

  private async guardTerms(account: number, acceptTerms: boolean): Promise<Refused | null> {
    const at = await this.deps.db.termsAcceptedAt(account);
    if (at !== null) return null;
    if (!acceptTerms) return refuse('terms_required');
    await this.deps.db.recordTermsAccepted(account, this.now());
    return null;
  }

  /** Balance is a bid-time plausibility gate, never a guarantee (the bond is
   *  the enforcement). Compares service-computed token estimates against the
   *  cached chain read; when either side is unreadable the gate refuses
   *  closed. */
  private async guardBalance(wallet: string, usdCents: number): Promise<Refused | null> {
    const [estimate, balance] = await Promise.all([
      this.deps.economy.estimate(usdCents),
      this.deps.balanceTokens(wallet),
    ]);
    if (!estimate.available || estimate.amount === null) return refuse('market_paused');
    if (balance === null) return refuse('insufficient_balance');
    return balance >= estimate.amount.tokens ? null : refuse('insufficient_balance');
  }

  // -------------------------------------------------------------------------
  // Listing lifecycle (seller)
  // -------------------------------------------------------------------------

  async createListing(args: {
    account: number;
    characterId: number;
    itemRef: ExtractRef;
    params: WocListingParams;
  }): Promise<{ ok: true; listing: WocListingRow } | Refused> {
    // A suspended defaulter cannot list either, not just bid: the suspension is
    // a marketplace-wide hold (PRD "Integrity").
    const gate = (await this.guardEnabledHealthy()) ?? (await this.guardSuspended(args.account));
    if (gate) return gate;
    const wallet = await this.deps.verifiedWallet(args.account);
    if (!wallet) return refuse('wallet_required');
    const params = validListingParams(args.params);
    if (!params.ok) return refuse(params.reason);
    const def = ITEMS[args.itemRef.itemId];
    const eligible = listingEligibility(
      def,
      args.itemRef.expectInstance ?? undefined,
      this.cfg.policy,
    );
    if (!eligible.ok) return refuse(eligible.reason);
    // The cap governs PUBLIC listings only, in both directions: a directed offer
    // neither counts toward it (see countActiveBySeller) nor is blocked by it. A
    // private deal with a named friend must not be refused because the seller
    // happens to have twelve auctions running.
    if (args.params.directedBuyerAccount === null) {
      const active = await this.deps.db.countActiveBySeller(this.cfg.realm, args.account);
      if (active >= WOC_MARKET_MAX_ACTIVE_LISTINGS) return refuse('cap_reached');
    }

    // Custody edge: the copy leaves the live bags in memory, then the
    // character save and the listing insert commit together. Any persist
    // refusal restores the copy before reporting.
    const extract = this.deps.custody.extractCopy(args.account, args.characterId, args.itemRef);
    if (!extract.ok) {
      return refuse(
        extract.reason === 'offline' || extract.reason === 'not_yours'
          ? 'character_invalid'
          : extract.reason,
      );
    }
    // Re-decide eligibility against the AUTHORITATIVE extracted copy, not the
    // payload the client claimed: a copy whose rolled quality sits below its
    // def quality must not slip through on the def alone.
    const eligibleReal = listingEligibility(def, extract.extracted.instance, this.cfg.policy);
    if (!eligibleReal.ok) {
      this.deps.custody.restoreCopy(args.characterId, extract.extracted);
      return refuse(eligibleReal.reason);
    }
    const nowMs = this.now();
    const listing: NewWocListing = {
      realm: this.cfg.realm,
      sellerAccount: args.account,
      sellerCharacter: args.characterId,
      sellerName: extract.characterName,
      sellerWallet: wallet,
      item: extract.extracted,
      itemId: extract.extracted.itemId,
      quality: extract.extracted.instance?.rolled?.quality ?? def?.quality ?? 'common',
      params: args.params,
      endsAtMs: nowMs + args.params.durationHours * 3600 * 1000,
    };
    let inserted: Awaited<ReturnType<WocMarketDb['escrowInsertListing']>>;
    try {
      inserted = await this.deps.db.escrowInsertListing(extract.save, listing);
    } catch (err) {
      this.deps.custody.restoreCopy(args.characterId, extract.extracted);
      throw err;
    }
    if (!inserted.ok) {
      this.deps.custody.restoreCopy(args.characterId, extract.extracted);
      return refuse(inserted.reason === 'cap_reached' ? 'cap_reached' : 'lease_lost');
    }
    const row = await this.deps.db.listingById(this.cfg.realm, inserted.id);
    if (!row) throw new Error('woc_market: listing vanished after insert');
    return { ok: true, listing: row };
  }

  // -------------------------------------------------------------------------
  // Directed p2p offers (docs/prd/woc/p2p-woc-trade.md)
  // -------------------------------------------------------------------------

  /** The listing a directed offer becomes. One agreed price, so start and
   *  buy-now are the same number; validListingParams requires that for a
   *  directed sale and refuses any attempt to smuggle a second price in. */
  private directedParams(usdCents: number, buyerAccount: number): WocListingParams {
    return {
      format: 'buy_now',
      startCents: usdCents,
      reserveCents: null,
      buyNowCents: usdCents,
      // The shortest duration on the allowlist. A directed listing is bought
      // immediately or not at all, and this is only the backstop that returns
      // the item if the buyer never pays.
      durationHours: WOC_MARKET_DURATION_HOURS[0],
      offerNext: false,
      directedBuyerAccount: buyerAccount,
    };
  }

  /**
   * The BUYER proposes a p2p purchase: a price, named to one player, with no
   * item yet. The seller answers by staging goods and accepting.
   *
   * Nothing is escrowed here, so a stream of offers cannot lock anyone's goods;
   * acceptance is what takes the item.
   */
  async createDirectedOffer(args: {
    account: number;
    characterId: number;
    /** The counterparty's character NAME, the one handle the trade window has.
     *  Resolved here so no account id crosses the wire. */
    sellerCharacterName: string;
    usdCents: number;
  }): Promise<{ ok: true; offer: WocDirectedOfferRow } | Refused> {
    const gate = (await this.guardEnabledHealthy()) ?? (await this.guardSuspended(args.account));
    if (gate) return gate;
    const seller = await this.deps.db.characterByName(this.cfg.realm, args.sellerCharacterName);
    if (!seller) return refuse('character_invalid');
    const sellerAccount = seller.accountId;
    // Same ACCOUNT, not same character: an alt is still yourself, and dealing
    // between your own characters would be a fee-free self-deal that still
    // consumed escrow and settlement machinery.
    if (sellerAccount === args.account) return refuse('self_offer');
    // The BUYER's wallet: they are the one about to pay.
    if (!(await this.deps.verifiedWallet(args.account))) return refuse('wallet_required');
    // The SELLER's wallet: they cannot be PAID in $WOC without one. This is the
    // refusal the buyer's trade window turns into "that player must connect a
    // wallet". Re-checked at acceptance, since a wallet can be unlinked between.
    if (!(await this.deps.verifiedWallet(sellerAccount))) {
      return refuse('recipient_wallet_required');
    }
    // Validate the params acceptance WILL use, not a looser approximation, so an
    // offer can never be created that its own acceptance would refuse. The ITEM
    // is not checked here because there is not one yet: eligibility is the
    // seller's to satisfy when they stage goods and accept.
    const params = validListingParams(this.directedParams(args.usdCents, args.account));
    if (!params.ok) return refuse(params.reason);
    const buyer = await this.deps.db.deliveryTarget(this.cfg.realm, args.account, args.characterId);
    if (!buyer || buyer.characterId !== args.characterId) return refuse('character_invalid');

    const offer = await this.deps.db.insertDirectedOffer({
      realm: this.cfg.realm,
      sellerAccount,
      sellerCharacter: seller.characterId,
      sellerName: seller.name,
      buyerAccount: args.account,
      buyerName: buyer.name,
      usdCents: args.usdCents,
      expiresAtMs: this.now() + WOC_MARKET_DIRECTED_OFFER_TTL_SECONDS * 1000,
    });
    return { ok: true, offer };
  }

  /**
   * One side agrees, through the trade window's ordinary Accept button.
   *
   * Both sides must accept, exactly as a gold trade requires, and the SECOND
   * acceptance is what escrows: the seller's copy leaves their bags and the
   * directed listing is created. Order does not matter, so whoever presses last
   * triggers it.
   *
   * This never routes through the sim's own confirm. That confirm performs the
   * atomic swap the instant both sides accept, and a $WOC deal carries no gold
   * and no buyer items, so it would hand the goods over for nothing. Agreement
   * is tracked here instead, on the offer, and the sim trade is left alone.
   */
  async acceptDirectedOffer(
    account: number,
    offerId: number,
    itemRef: ExtractRef | null,
    characterId: number,
  ): Promise<{ ok: true; listing: WocListingRow | null } | Refused> {
    const gate = (await this.guardEnabledHealthy()) ?? (await this.guardSuspended(account));
    if (gate) return gate;
    const offer = await this.deps.db.directedOfferById(this.cfg.realm, offerId);
    if (!offer) return refuse('not_found');
    const side =
      offer.sellerAccount === account ? 'seller' : offer.buyerAccount === account ? 'buyer' : null;
    // not_found for a stranger, matching the directed-listing convention.
    if (side === null) return refuse('not_found');
    if (offer.status !== 'pending') return refuse('not_pending');
    if (offer.expiresAtMs <= this.now()) return refuse('offer_expired');
    if (!(await this.deps.verifiedWallet(account))) return refuse('wallet_required');
    // The seller's acceptance carries the goods, because acceptance is the only
    // moment they are known; the buyer brings only money.
    if (side === 'seller') {
      if (!itemRef) return refuse('character_invalid');
      const eligible = listingEligibility(
        ITEMS[itemRef.itemId],
        itemRef.expectInstance ?? undefined,
        this.cfg.policy,
      );
      if (!eligible.ok) return refuse(eligible.reason);
    }

    const after = await this.deps.db.acceptDirectedOfferSide(
      this.cfg.realm,
      offerId,
      side,
      side === 'seller' ? itemRef : null,
    );
    if (!after) return refuse('not_pending');
    // Still waiting on the other side: agreed, nothing moved.
    if (!after.buyerAccepted || !after.sellerAccepted) return { ok: true, listing: null };
    if (!after.itemRef) return refuse('character_invalid');

    // Both agreed. Claim the offer BEFORE escrowing, so two simultaneous second
    // acceptances cannot both reach createListing and extract two copies.
    const claimed = await this.deps.db.resolveDirectedOffer(this.cfg.realm, offerId, 'accepted');
    if (!claimed) return refuse('not_pending');
    const created = await this.createListing({
      account: after.sellerAccount,
      characterId: side === 'seller' ? characterId : after.sellerCharacter,
      itemRef: after.itemRef,
      params: this.directedParams(after.usdCents, after.buyerAccount),
    });
    if (!created.ok) {
      await this.deps.db.reopenDirectedOffer(this.cfg.realm, offerId);
      return created;
    }
    await this.deps.db.resolveDirectedOffer(this.cfg.realm, offerId, 'accepted', {
      listingId: created.listing.id,
    });
    return { ok: true, listing: created.listing };
  }

  /** The seller says no, or the buyer pulls their offer. Nothing was escrowed,
   *  so this is a status flip and nothing else. */
  async resolveDirectedOffer(
    account: number,
    offerId: number,
    action: 'decline' | 'withdraw',
  ): Promise<{ ok: true } | Refused> {
    if (!this.cfg.enabled) return refuse('disabled');
    const offer = await this.deps.db.directedOfferById(this.cfg.realm, offerId);
    if (!offer) return refuse('not_found');
    const actor = action === 'decline' ? offer.sellerAccount : offer.buyerAccount;
    if (actor !== account) return refuse('not_found');
    if (offer.status !== 'pending') return refuse('not_pending');
    const to = action === 'decline' ? 'declined' : 'withdrawn';
    const done = await this.deps.db.resolveDirectedOffer(this.cfg.realm, offerId, to);
    return done ? { ok: true } : refuse('not_pending');
  }

  /**
   * Can this character be paid in $WOC?
   *
   * The trade window asks before offering the $WOC arm, so it can show "they
   * must connect a wallet" instead of a refusal after the fact. It answers for a
   * CHARACTER and returns no account id, and it exposes nothing new: holder-tier
   * flair already broadcasts per entity, so whether a player has a linked wallet
   * is visible on their nameplate today.
   *
   * Deliberately NOT a member of TradeInfo. That shape is built by the sim,
   * which sits inside the token firewall and may not know a wallet exists; this
   * rides beside it as server-fed data instead.
   */
  async tradePartner(
    viewerAccount: number,
    characterName: string,
  ): Promise<{ name: string; walletVerified: boolean } | null> {
    if (!this.cfg.enabled) return null;
    const target = await this.deps.db.characterByName(this.cfg.realm, characterName);
    if (!target) return null;
    const account = target.accountId;
    return {
      name: target.name,
      // Your own characters read as not payable, so the window never offers a
      // self-deal it would refuse at creation.
      walletVerified:
        account !== viewerAccount && (await this.deps.verifiedWallet(account)) !== null,
    };
  }

  /** Pending offers this account may act on, both directions. */
  async directedOffers(account: number): Promise<WocDirectedOfferRow[]> {
    if (!this.cfg.enabled) return [];
    return this.deps.db.directedOffersForAccount(this.cfg.realm, account);
  }

  async cancelListing(
    account: number,
    listingId: number,
  ): Promise<{ ok: true; cancelPending?: boolean } | Refused> {
    if (!this.cfg.enabled) return refuse('disabled');
    const out = await this.deps.db.cancelListingIfUnbid(
      this.cfg.realm,
      listingId,
      account,
      this.now(),
    );
    if (out === 'not_found') return refuse('not_found');
    if (out === 'not_yours') return refuse('not_yours');
    if (out === 'has_bids') return refuse('has_bids');
    if (out === 'not_active') return refuse('not_active');
    // An unpaid locked window accepted the cancel as INTENT: the current
    // holder keeps their window, no new claims or bids land, and the converge
    // arm closes the listing (return flight home) once the window ends
    // unpaid. Reported ok with the pending flag, not a refusal: the seller's
    // cancel WILL happen unless the holder pays.
    if (out === 'cancel_pending') return { ok: true, cancelPending: true };
    // A settlement past 'offered' resolves only when the payment does; plain
    // row contention retries immediately.
    if (out === 'settlement_live') return refuse('settlement_in_flight');
    if (out === 'contended') return refuse('contended');
    // The return flight rides the sweep's reconciliation (closed, undisposed,
    // resolution != sold), so a crash right here still returns the item.
    await this.returnListingItem(out).catch(() => {});
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Bidding
  // -------------------------------------------------------------------------

  async placeBid(args: {
    account: number;
    characterId: number;
    listingId: number;
    amountCents: number;
    acceptTerms: boolean;
  }): Promise<{ ok: true; bid: WocBidRow; bond: WocQuoteIntent } | Refused> {
    const gate =
      (await this.guardEnabledHealthy()) ??
      (await this.guardSuspended(args.account)) ??
      (await this.guardTerms(args.account, args.acceptTerms));
    if (gate) return gate;
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) return refuse('bid_too_low');
    const wallet = await this.deps.verifiedWallet(args.account);
    if (!wallet) return refuse('wallet_required');
    // The delivery character is validated server-side, never client-named.
    const target = await this.deps.db.deliveryTarget(
      this.cfg.realm,
      args.account,
      args.characterId,
    );
    if (!target || target.characterId !== args.characterId) return refuse('character_invalid');
    const bond = bondCents(args.amountCents);
    const balanceGate = await this.guardBalance(wallet, args.amountCents + bond);
    if (balanceGate) return balanceGate;

    const nowMs = this.now();
    const inserted = await this.deps.db.insertPendingBid({
      realm: this.cfg.realm,
      listingId: args.listingId,
      account: args.account,
      characterId: target.characterId,
      characterName: target.name,
      wallet,
      amountCents: args.amountCents,
      bondCents: bond,
      nowMs,
      minNext: (row) => minNextBidCents(row.currentBidCents, row.startCents),
    });
    if (!inserted.ok) return refuse(inserted.reason);
    const intent = await this.deps.economy.bondQuote({
      memoRef: `woc_bond:${inserted.bid.id}`,
      usdCents: bond,
      buyerWallet: wallet,
    });
    if (!intent.ok || intent.reference === null || intent.expiresAtMs === null) {
      // The pending bid lapses on its own TTL; nothing was transferred.
      return refuse('quote_unavailable');
    }
    const applied = await this.deps.db.setBidBondQuote(
      inserted.bid.id,
      intent.reference,
      intent.expiresAtMs,
    );
    if (!applied) {
      // Only reachable if this brand-new bid left 'pending_bond' (or somehow
      // gained a signature) in the milliseconds since the insert: answer as
      // plain contention, retryable, with nothing written.
      return refuse('contended');
    }
    return { ok: true, bid: { ...inserted.bid, bondReference: intent.reference }, bond: intent };
  }

  /**
   * Withdraw a bid whose bond was never paid.
   *
   * The counterpart the refusal text already promised: placing a bid takes a
   * listing-wide lock ("Confirm or abandon your pending bid on this listing
   * first"), and until this existed the only abandon was waiting out a
   * five-minute TTL. A player who declined the wallet was told to do something
   * the client could not do, on their own bid, with their own money untouched.
   *
   * Deliberately NOT gated on market health. Every other bid path needs a live
   * price because it quotes one; giving up needs nothing, and refusing to let a
   * player release their own listing lock because the oracle is unhappy would
   * strand them for exactly as long as the outage lasts.
   */
  async abandonBid(account: number, bidId: number): Promise<{ ok: true } | Refused> {
    if (!this.cfg.enabled) return refuse('disabled');
    const bid = await this.deps.db.bidById(bidId);
    if (!bid) return refuse('not_found');
    if (bid.account !== account) return refuse('not_yours');
    if (bid.status !== 'pending_bond') return refuse('not_pending');
    // A recorded signature means the bidder's money may already be riding
    // this bond (broadcast, awaiting finality). Abandoning would void a
    // payment the chain may still land, so the abandon refuses until the
    // verdict arrives; the poll resolves it either way within its pass.
    if (bid.bondSignature !== null) return refuse('confirm_in_flight');
    // The status AND the signature are re-checked inside the UPDATE, so a bond
    // that landed (or a signature recorded) between the read and the write
    // keeps its bid rather than losing it to this call.
    const done = await this.deps.db.abandonPendingBid(this.cfg.realm, bidId, account);
    if (done) return { ok: true };
    const after = await this.deps.db.bidById(bidId);
    return refuse(
      after !== null && after.status === 'pending_bond' && after.bondSignature !== null
        ? 'confirm_in_flight'
        : 'not_pending',
    );
  }

  /**
   * Operator reads for the internal dashboard. Read-only and realm-scoped; the
   * realm comes from this service's own config rather than the caller, so a
   * dashboard cannot ask one realm's process about another's.
   */
  async opsListings(q: {
    status: 'active' | 'ending' | 'settling' | 'closed' | 'all';
    fromMs: number;
    toMs: number;
    page: number;
    pageSize: number;
  }): Promise<{ rows: WocListingRow[]; hasMore: boolean }> {
    return this.deps.db.opsListings({ ...q, realm: this.cfg.realm });
  }

  async opsP2pTrades(q: {
    status: WocDirectedOfferStatus | 'all';
    fromMs: number;
    toMs: number;
    page: number;
    pageSize: number;
  }): Promise<{ rows: WocOpsP2pTradeRow[]; hasMore: boolean }> {
    return this.deps.db.opsP2pTrades({ ...q, realm: this.cfg.realm });
  }

  /** A fresh bond quote for a still-pending bid whose previous quote expired. */
  async refreshBondQuote(
    account: number,
    bidId: number,
  ): Promise<{ ok: true; bond: WocQuoteIntent } | Refused> {
    const gate = await this.guardEnabledHealthy();
    if (gate) return gate;
    const bid = await this.deps.db.bidById(bidId);
    if (!bid) return refuse('not_found');
    if (bid.account !== account) return refuse('not_yours');
    if (bid.status !== 'pending_bond') return refuse('not_pending');
    // A recorded signature means the bond may already be PAID and merely
    // awaiting finality. Its reference must survive: the poller re-checks the
    // reference and signature as a pair, so overwriting the reference here
    // would read a real payment as refused and lapse a funded bond. This read
    // answers the common case without a wasted economy quote; the atomic arm
    // is the setBidBondQuote compare-and-set below.
    if (bid.bondSignature !== null) return refuse('confirm_in_flight');
    const intent = await this.deps.economy.bondQuote({
      memoRef: `woc_bond:${bid.id}`,
      usdCents: bid.bondCents,
      buyerWallet: bid.wallet,
    });
    if (!intent.ok || intent.reference === null || intent.expiresAtMs === null) {
      return refuse('quote_unavailable');
    }
    const applied = await this.deps.db.setBidBondQuote(
      bid.id,
      intent.reference,
      intent.expiresAtMs,
    );
    if (!applied) {
      // The CAS lost a race: a signature landed (or the bid left pending)
      // between the read above and this write. Re-read for the precise
      // refusal; the unused economy quote simply expires on its own.
      const after = await this.deps.db.bidById(bid.id);
      return refuse(
        after !== null && after.status === 'pending_bond' ? 'confirm_in_flight' : 'not_pending',
      );
    }
    return { ok: true, bond: intent };
  }

  async confirmBond(
    account: number,
    bidId: number,
    signature: string,
  ): Promise<{ ok: true; standing: boolean; pending?: boolean } | Refused> {
    if (!this.cfg.enabled) return refuse('disabled');
    const bid = await this.deps.db.bidById(bidId);
    if (!bid) return refuse('not_found');
    if (bid.account !== account) return refuse('not_yours');
    if (bid.status !== 'pending_bond') return refuse('not_pending');
    if (bid.bondReference === null) return refuse('quote_unavailable');
    // Record the signature BEFORE any expiry verdict and BEFORE asking the
    // chain. The signature is the only trace of a payment that may already be
    // broadcast, so every refusal past this point would discard money in
    // flight. An EXPIRED quote is deliberately no exception: the transfer may
    // have left the wallet moments before expiry, and refusing it here with
    // no ledger trace was exactly the loss that cost a real settlement its
    // money. The row lands in the confirming set instead, and the chain's
    // verdict (here or on the poll) decides between completion and lapse.
    // The submission moment: captured BEFORE the chain round trip (or the
    // target drifts with RPC latency and a slow confirm pushes the anchor
    // past the close, nulling the extension the settled arm depends on).
    // The extension ANCHOR and the poll park axis are both the FIRST
    // recording (bond_signature_at, which the submit returns): anchoring a
    // resubmit on a fresh clock let one pending-forever signature re-post its
    // way to holding the close at now plus the extension, all the way to the
    // cap.
    const progressAtMs = this.now();
    const submitted = await this.deps.db.submitBondSignature(bid.id, signature, progressAtMs);
    if (submitted === 'not_pending') {
      // Zero rows can mean the bid left pending_bond, OR a DIFFERENT
      // signature is already recorded and being decided. Re-read for the
      // truthful refusal: 'not_pending' on a still-pending bid misreads as
      // "bid gone" when the honest answer is "a payment is already in
      // flight; wait for its verdict". The second signature has no ledger
      // slot (one column, first claim wins); the reference-scoped service
      // verdict is the backstop for a genuine double broadcast.
      const after = await this.deps.db.bidById(bid.id);
      return refuse(
        after !== null && after.status === 'pending_bond' && after.bondSignature !== null
          ? 'confirm_in_flight'
          : 'not_pending',
      );
    }
    if (submitted === 'signature_reused') return refuse('signature_reused');
    const anchorMs = submitted.signatureAtMs;
    const confirmed = await this.deps.economy.confirm(bid.bondReference, signature);
    // Anti-snipe rides BOND PROGRESS, and progress means the CHAIN has seen
    // the transfer (settled, or pending finality), never merely that a string
    // was posted: extending on the raw submission let a fabricated signature
    // move the authoritative clock for free. A verdict AGAINST extends
    // nothing. Best-effort ON PURPOSE: the signature above is already
    // durable, and a contended extension only fails toward a shorter
    // auction, so it must never turn a recorded payment into a refusal.
    const extend = async (): Promise<void> => {
      await this.deps.db
        .extendAuctionForBondProgress(this.cfg.realm, bid.listingId, (row) =>
          antiSnipeExtendedEndMs(anchorMs, row.endsAtMs, row.baseEndsAtMs),
        )
        .catch(() => {});
    };
    if (confirmed.settled) {
      // Extend BEFORE activating: a verdict landing seconds from the close
      // must move the end first, or its own activation reads the auction as
      // already over.
      await extend();
      return this.holdBondAndActivate(bid.id);
    }
    if (confirmed.pending) {
      // UNDECIDED, not refused. The payment may be perfectly good and merely
      // unfinalized (tens of seconds on mainnet), so the bid stays pending with
      // its signature and pollConfirmingBonds finishes it. Refusing here is the
      // mistake that cost a real settlement its money before the same shape was
      // found in this leg. The extension fires ONLY when the pending verdict
      // came from the chain: the proxy maps an unreachable service to
      // pending + service_unavailable (correct for money, which must never
      // fail toward refusal), and extending on THAT arm would hand a
      // fabricated signature the clock again for the length of any outage.
      if (confirmed.reason !== WOC_MARKET_CONFIRM_UNAVAILABLE_REASON) await extend();
      return { ok: true, standing: false, pending: true };
    }
    return refuse('confirm_failed');
  }

  /** The two writes a decided, settled bond owes: hold it, then let it stand. */
  private async holdBondAndActivate(
    bidId: number,
  ): Promise<{ ok: true; standing: boolean; pending?: boolean }> {
    await this.deps.db.markBondHeld(bidId);
    const activated = await this.deps.db.activateBid(bidId, this.now());
    if (activated === 'contended') {
      // The bond IS held and the activation merely lost a lock race; the bid
      // stays in the confirmingBonds set (its select keys on status plus
      // signature, not bond_state), so the next pass retries. Report it as
      // PENDING: collapsing it into standing:false reads as "outbid" to the
      // client, the exact false verdict the undecided arm exists to avoid.
      return { ok: true, standing: false, pending: true };
    }
    // A racer confirmed a higher bid first: this bond flips straight to
    // refund_due inside activateBid's superseded arm.
    return { ok: true, standing: activated === 'activated' };
  }

  /**
   * Bonds paid but not yet decided by the chain, re-checked on the sweep.
   *
   * The bid leg's twin of pollConfirmingSettlements. `continue` on an undecided
   * verdict is the load-bearing line: the row stays exactly as it is and the
   * next pass asks again, which is what makes waiting for finality free.
   */
  private async pollConfirmingBonds(): Promise<number> {
    const nowMs = this.now();
    const bonds = await this.deps.db.confirmingBonds(
      this.cfg.realm,
      SWEEP_BATCH,
      this.backedOffIds(this.parkedBondPolls, nowMs),
    );
    for (const bid of bonds) {
      try {
        if (bid.bondReference === null || bid.bondSignature === null) continue;
        const confirmed = await this.deps.economy
          .confirm(bid.bondReference, bid.bondSignature)
          .catch(() => null);
        if (!confirmed || confirmed.pending) {
          // Undecided. YOUNG bonds (inside the park window, the normal
          // finality span) keep the full poll cadence; a bond the chain
          // still has not decided past it rotates to the poll tail with an
          // in-process backoff, so a standing set of never-decided
          // signatures (a fabricated one, a service that answers pending
          // forever) cannot occupy the batch head and starve fresh bonds.
          // Aged from the SIGNATURE recording (placed_at only for legacy
          // rows): placement age says nothing about how long the chain has
          // had the transfer, and a bidder who signs late in their window
          // must not be parked twenty seconds after submitting. Rotation
          // only: the money policy is untouched (no automatic void; the
          // stuckBonds readout carries the visibility).
          const signedAtMs = bid.bondSignatureAtMs ?? bid.placedAtMs;
          if (nowMs - signedAtMs > WOC_MARKET_BOND_POLL_PARK_SECONDS * 1000) {
            this.parkedBondPolls.set(bid.id, nowMs + WocMarketService.PARK_RETRY_MS);
            await this.deps.db.touchBidPollRow(bid.id);
          }
          continue;
        }
        this.parkedBondPolls.delete(bid.id);
        if (confirmed.settled) {
          await this.holdBondAndActivate(bid.id);
        } else {
          // Decided AGAINST: the bond never landed, so the bid lapses and its
          // bond voids. Only a decided verdict may end it.
          await this.deps.db.lapseBid(bid.id);
        }
      } catch (err) {
        // Per-row isolation: this backlog returns UNCLAIMED rows in order, so
        // a persistently failing head row would otherwise starve every later
        // bond of this arm on every pass.
        this.sweepError('polledBonds', err);
      }
    }
    return bonds.length;
  }

  // -------------------------------------------------------------------------
  // Buy-now
  // -------------------------------------------------------------------------

  async buyNow(args: {
    account: number;
    characterId: number;
    listingId: number;
    acceptTerms: boolean;
  }): Promise<{ ok: true; settlement: WocSettlementRow; quote: WocQuoteIntent } | Refused> {
    const nowMs = this.now();
    // The flag/health gate runs BEFORE any database read: with the feature off
    // or pricing unhealthy, this flow performs no query and no custody action.
    const preGate = await this.guardEnabledHealthy();
    if (preGate) return preGate;
    const listingPeek = await this.deps.db.listingById(this.cfg.realm, args.listingId);
    if (!listingPeek) return refuse('not_found');
    // A directed sale is buyable ONLY by the account it was addressed to. This
    // is the second of two independent defences (browse already excludes the
    // row), because the row id is guessable and browse exclusion alone would
    // leave a stranger who guesses one able to buy it.
    //
    // The refusal is `not_found`, deliberately, NOT a distinct "not for you":
    // the anti-enumeration convention already used by not_yours. A caller
    // probing ids must not be able to tell "no such listing" from "a listing
    // exists here and it is not yours", because the second answer confirms both
    // that the id is real and that a private trade is in flight.
    if (
      listingPeek.directedBuyerAccount !== null &&
      listingPeek.directedBuyerAccount !== args.account
    ) {
      return refuse('not_found');
    }
    if (listingPeek.buyNowCents === null) return refuse('no_buy_now');
    const gate =
      (await this.guardSuspended(args.account)) ??
      (await this.guardTerms(args.account, args.acceptTerms));
    if (gate) return gate;
    const wallet = await this.deps.verifiedWallet(args.account);
    if (!wallet) return refuse('wallet_required');
    const target = await this.deps.db.deliveryTarget(
      this.cfg.realm,
      args.account,
      args.characterId,
    );
    if (!target || target.characterId !== args.characterId) return refuse('character_invalid');
    const balanceGate = await this.guardBalance(wallet, listingPeek.buyNowCents);
    if (balanceGate) return balanceGate;

    const lockExpiresAtMs = nowMs + WOC_MARKET_BUY_NOW_LOCK_SECONDS * 1000;
    const claimed = await this.deps.db.claimBuyNowLock(
      this.cfg.realm,
      args.listingId,
      args.account,
      nowMs,
      lockExpiresAtMs,
    );
    if (claimed === 'not_found') return refuse('not_found');
    if (claimed === 'not_active') return refuse('not_active');
    if (claimed === 'locked') return refuse('buy_now_locked');
    if (claimed === 'no_buy_now') return refuse('no_buy_now');
    if (claimed === 'own_listing') return refuse('own_listing');
    if (claimed === 'cancel_pending') return refuse('cancel_pending');
    if (claimed === 'claim_cooldown') return refuse('claim_cooldown');
    if (claimed === 'contended') return refuse('contended');

    const settlement = await this.deps.db.insertSettlement({
      listingId: claimed.id,
      bidId: null,
      attempt: 0,
      buyerAccount: args.account,
      buyerCharacter: target.characterId,
      buyerName: target.name,
      buyerWallet: wallet,
      amountCents: claimed.buyNowCents ?? 0,
      deadlineAtMs: lockExpiresAtMs,
      nowMs,
    });
    if (settlement === 'live_settlement_exists' || settlement === 'winner_gone') {
      // winner_gone is unreachable here (no winnerBidId is passed); it rides
      // this arm so the union stays exhaustively narrowed.
      await this.deps.db.clearBuyNowLock(claimed.id, args.account);
      return refuse('buy_now_locked');
    }
    if (settlement === 'contended') {
      // A guard transaction holds the listing row; nothing was inserted.
      // Release the lock and let the buyer retry immediately.
      await this.deps.db.clearBuyNowLock(claimed.id, args.account);
      return refuse('contended');
    }
    if (settlement === 'listing_closed') {
      // Belt-and-braces: cancel and suspend refuse while the lock is
      // unexpired, so this arm needs the listing to close in the sliver
      // between the claim and the insert. Answer honestly rather than with a
      // phantom lock.
      await this.deps.db.clearBuyNowLock(claimed.id, args.account);
      return refuse('not_active');
    }
    const quote = await this.quoteFor(settlement, claimed.sellerWallet);
    if (!quote.ok) {
      await this.deps.db.transitionSettlement(settlement.id, ['offered'], 'expired');
      await this.deps.db.clearBuyNowLock(claimed.id, args.account);
      return refuse('quote_unavailable');
    }
    return { ok: true, settlement, quote };
  }

  // -------------------------------------------------------------------------
  // Settlement (winner or buy-now buyer)
  // -------------------------------------------------------------------------

  private async quoteFor(
    settlement: WocSettlementRow,
    sellerWallet: string,
  ): Promise<WocQuoteIntent> {
    const intent = await this.deps.economy.settlementQuote({
      memoRef: settlementCustodyRef(settlement.id),
      usdCents: settlement.amountCents,
      buyerWallet: settlement.buyerWallet,
      sellerWallet,
    });
    if (intent.ok && intent.reference !== null && intent.expiresAtMs !== null) {
      const stamped = await this.deps.db.setSettlementQuote(
        settlement.id,
        intent.reference,
        intent.expiresAtMs,
        intent.amount?.base ?? null,
      );
      if (!stamped) return { ...intent, ok: false, reason: 'settlement_not_open' };
    }
    return intent;
  }

  async settlementQuote(
    account: number,
    settlementId: number,
  ): Promise<{ ok: true; quote: WocQuoteIntent } | Refused> {
    const gate = await this.guardEnabledHealthy();
    if (gate) return gate;
    const settlement = await this.deps.db.settlementById(settlementId);
    if (!settlement) return refuse('not_found');
    if (settlement.buyerAccount !== account) return refuse('not_yours');
    // Deadline first, BEFORE any revival: a past-deadline 'failed' row must
    // stay 'failed' for the overdue sweep's default pass, never be revived
    // into an open row this method then refuses anyway.
    if (settlement.deadlineAtMs <= this.now()) return refuse('quote_expired');
    if (settlement.state === 'failed') {
      // A refused confirmation returns to offered for a retry inside the
      // window. The revival is a CAS and can also lose to the
      // one-open-settlement index (a second open settlement raced in over the
      // retry window; the db layer reports that 23505 as false): a failed
      // revival must refuse HERE, before any quote is issued, or the buyer
      // could broadcast a payment no settlement will ever carry.
      const revived = await this.deps.db.transitionSettlement(settlement.id, ['failed'], 'offered');
      if (!revived) return refuse('not_active');
    } else if (settlement.state !== 'offered') {
      return refuse('not_active');
    }
    const listing = await this.deps.db.listingById(this.cfg.realm, settlement.listingId);
    if (!listing) return refuse('not_found');
    const quote = await this.quoteFor({ ...settlement, state: 'offered' }, listing.sellerWallet);
    if (!quote.ok) return refuse('quote_unavailable');
    return { ok: true, quote };
  }

  async confirmSettlement(
    account: number,
    settlementId: number,
    signature: string,
  ): Promise<{ ok: true; state: WocSettlementState } | Refused> {
    if (!this.cfg.enabled) return refuse('disabled');
    const settlement = await this.deps.db.settlementById(settlementId);
    if (!settlement) return refuse('not_found');
    if (settlement.buyerAccount !== account) return refuse('not_yours');
    // Idempotent retry (the bond leg's rule): resubmitting the RECORDED
    // signature against a 'confirming' row re-asks the chain instead of
    // refusing, so a network blip between the recording and the response
    // cannot strand the buyer behind a false refusal. The retry skips the
    // recording write entirely: nothing new to record, and re-stamping
    // updated_at would push out the confirming-age review bound, re-opening
    // the unbounded hold that bound exists to close. A DIFFERENT signature
    // on a confirming row refuses typed: a payment is already being decided.
    const retryOfRecorded =
      settlement.state === 'confirming' && settlement.txSignature === signature;
    if (settlement.state === 'confirming' && !retryOfRecorded) return refuse('confirm_in_flight');
    if (!retryOfRecorded && settlement.state !== 'offered') return refuse('not_active');
    if (settlement.quoteReference === null || settlement.quoteExpiresAtMs === null) {
      return refuse('quote_unavailable');
    }
    if (!retryOfRecorded) {
      // No expiry refusal past this point: the signature is recorded FIRST (the
      // bond leg's rule, and originally this leg's lesson). A payment broadcast
      // near quote expiry lands in 'confirming' with its ledger trace, and the
      // chain's verdict decides; refusing an expired quote here would discard
      // the only trace of money already in flight. Deadline-expired rows are
      // still bounded: the overdue sweep owns them, and a 'confirming' row that
      // never resolves ages into the operator review state.
      if (settlement.txSignature !== null && settlement.txSignature !== signature) {
        // A revived row (failed -> offered) still carries its refused
        // attempt's signature, and the new recording replaces it. The refusal
        // reason survives on fail_reason and the economy service's own ledger
        // keeps the refused transfer; this line is the game-side trace of the
        // replacement (dev-channel, deliberately not player text).
        console.warn(
          `[woc_market] settlement ${settlement.id} records a new payment attempt over refused signature ${settlement.txSignature}`,
        );
      }
      const submitted = await this.deps.db.submitSettlementSignature(settlement.id, signature);
      if (submitted === 'not_offered') return refuse('not_active');
      if (submitted === 'signature_reused') return refuse('signature_reused');
    }
    const confirmed = await this.deps.economy.confirm(settlement.quoteReference, signature);
    if (confirmed.settled) {
      await this.deps.db.transitionSettlement(settlement.id, ['confirming'], 'confirmed');
      // Deliver eagerly; the sweep is the backstop for any failure past here.
      // A fresh LOCAL scope: this entry runs outside any sweep pass, so it
      // must neither inherit a pass's contention verdict nor clobber one
      // mid-flight. Its park count is deliberately discarded (the monitor
      // still carries the row; only the pass stat line loses the event).
      await this.deliverConfirmedSettlements(this.now(), { contended: false, parked: 0 }).catch(
        () => {},
      );
      const after = await this.deps.db.settlementById(settlement.id);
      return { ok: true, state: after?.state ?? 'confirmed' };
    }
    if (confirmed.pending) return { ok: true, state: 'confirming' };
    await this.deps.db.transitionSettlement(
      settlement.id,
      ['confirming'],
      'failed',
      confirmed.reason ?? 'refused',
    );
    return refuse('confirm_failed');
  }

  // -------------------------------------------------------------------------
  // Admin / moderation
  // -------------------------------------------------------------------------

  // Account-scoped owned lookups for the route layer's requireOwned loaders
  // (the BOLA load-then-authorize seam): null for absent OR non-owned, so the
  // middleware's uniform 404 never leaks existence.
  async ownedListing(account: number, id: number): Promise<WocListingRow | null> {
    const row = await this.deps.db.listingById(this.cfg.realm, id);
    return row !== null && row.sellerAccount === account ? row : null;
  }

  async ownedBid(account: number, id: number): Promise<WocBidRow | null> {
    const row = await this.deps.db.bidById(id);
    return row !== null && row.account === account ? row : null;
  }

  async ownedSettlement(account: number, id: number): Promise<WocSettlementRow | null> {
    const row = await this.deps.db.settlementById(id);
    return row !== null && row.buyerAccount === account ? row : null;
  }

  /** Operator support view: a seller's listings, any status. */
  async adminListingsBySeller(account: number): Promise<WocListingRow[]> {
    return this.deps.db.listingsBySeller(this.cfg.realm, account);
  }

  /** The safe path only: the atomic guard refuses whenever a payment may
   *  already be moving (see suspendListingIfSafe), so a suspend can never
   *  expire a settlement whose broadcast payment still lands. The operator
   *  retries once the settlement resolves; the item return still rides the
   *  sweep's reconciliation of closed undisposed listings. */
  async adminSuspendListing(listingId: number): Promise<{ ok: true } | Refused> {
    const out = await this.deps.db.suspendListingIfSafe(this.cfg.realm, listingId, this.now());
    if (out === 'not_found') return refuse('not_found');
    if (out === 'not_active') return refuse('not_active');
    if (out === 'contended') return refuse('contended');
    if (out === 'buy_now_pending' || out === 'settlement_live') {
      return refuse('settlement_in_flight');
    }
    return { ok: true };
  }

  async adminSetSaleExcluded(saleId: number, excluded: boolean): Promise<{ ok: true } | Refused> {
    const done = await this.deps.db.setSaleExcluded(saleId, excluded);
    if (done === 'ok') return { ok: true };
    // Distinct refusals: a missing row and a correction blocked by a standing
    // non-excluded sale row are different operator problems.
    return done === 'conflict' ? refuse('sale_conflict') : refuse('not_found');
  }

  async adminClearStrikes(account: number): Promise<{ ok: true }> {
    await this.deps.db.clearStrikes(account);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // The sweep pass (called by woc_market_sweep.ts on its own clock)
  // -------------------------------------------------------------------------

  async sweepPass(): Promise<WocSweepPassStats | null> {
    // Contention and park accounting are SCOPED to this pass: the eager
    // confirm entry mints its own scope, so a request thread can neither
    // clobber a pass mid-flight nor inherit a finished pass's verdict (a
    // shared field raced both ways).
    const scope: WocDeliveryScope = { contended: false, parked: 0 };
    if (!this.cfg.enabled) return null;
    const nowMs = this.now();
    // Every arm runs through arm(): one failing arm (or one poisoned row
    // inside an arm's own loop) is reported to onSweepError and the REST of
    // the pass still runs. Without this, a single throw skipped every later
    // arm of the pass, and the new sale-dedupe index makes a throw here
    // strictly more likely than it used to be.
    const stats: WocSweepPassStats = {
      lapsedBids: await this.arm('lapsedBids', () =>
        this.deps.db.lapsePendingBids(
          this.cfg.realm,
          nowMs - WOC_MARKET_BOND_PENDING_TTL_SECONDS * 1000,
          SWEEP_BATCH,
        ),
      ),
      // Directed offers escrow nothing, so an unanswered one costs no custody.
      // It still has to expire: left pending it stays visible in both players'
      // trade windows as a deal that can never be accepted, and the retention
      // prune only reaches resolved rows, so the table would grow forever.
      expiredOffers: await this.arm('expiredOffers', () =>
        this.deps.db.expireDueDirectedOffers(this.cfg.realm, nowMs, SWEEP_BATCH),
      ),
      reclaimed: await this.arm('reclaimed', () => this.reclaimStrandedListings(nowMs)),
      // BEFORE the close/expiry arms on purpose: a delivered-but-unclosed
      // listing must converge to its finished sale before anything else can
      // misread it as resolvable. Minute-scale (REDRIVE_INTERVAL_MS): the arm
      // converges an OLDER binary's residue, so an every-pass run bought
      // nothing but query load; counts rows ADVANCED, not rows examined.
      redriven: await this.arm('redriven', () => this.redriveDeliveredTails(nowMs, scope)),
      // The sibling residue class, its own arm so a throw here can never
      // discard the page walk's count (and vice versa); shares the minute
      // cadence and honors a contended pass.
      disposed: await this.arm('disposed', () => this.disposeSoldResidue(nowMs, scope)),
      closed: await this.arm('closed', () => this.closeDueAuctions(nowMs)),
      expired: await this.arm('expired', () => this.expireOverdueSettlements(nowMs)),
      // AFTER the expiry arm on purpose: the overdue arm is the canonical
      // abandon recorder and expires the abandoned window's settlement, so a
      // cancel-pending listing converges in the same pass its window dies.
      cancelClosed: await this.arm('cancelClosed', () => this.closeCancelPendingListings(nowMs)),
      polled: await this.arm('polled', () => this.pollConfirmingSettlements()),
      // BEFORE the lapse arm above would matter: a paid-but-undecided bond is
      // excluded from lapsing by its signature, and this is what resolves it.
      polledBonds: await this.arm('polledBonds', () => this.pollConfirmingBonds()),
      delivered: await this.arm('delivered', () => this.deliverConfirmedSettlements(nowMs, scope)),
      reconciled: await this.arm('reconciled', () => this.reconcileDelivering(nowMs, scope)),
      returned: await this.arm('returned', () => this.returnUndisposedItems(nowMs, scope)),
      // Evaluated AFTER the three arms above (object literals evaluate in
      // source order), so it sees every park event of this pass. New park
      // EVENTS only: a row skipped inside its backoff window counts nothing,
      // so a standing parked set cannot flood this the way counting parked
      // rows as delivered once flooded the saturation warning.
      parked: scope.parked,
      bonds: await this.arm('bonds', () => this.processDueBonds()),
    };
    // A FULL batch means the arm did not drain: that is the one signal that
    // separates a healthy idle marketplace from a permanently starved backlog,
    // so it is reported rather than left to look identical. The delivery arms
    // count rows ADVANCED; park events ride their own stat so a parked-only
    // pass still reads as work without turning the saturation warning into a
    // permanent 5-second flood.
    const saturated = Object.entries(stats)
      .filter(([, n]) => n >= SWEEP_BATCH)
      .map(([arm]) => arm);
    this.deps.onSweepPass?.(stats, saturated, this.now() - nowMs);
    return stats;
  }

  /** Per-arm error isolation: report the failure and score 0 for this pass;
   *  the next pass retries from the durable state. */
  private async arm(name: keyof WocSweepPassStats, run: () => Promise<number>): Promise<number> {
    try {
      return await run();
    } catch (err) {
      this.sweepError(name, err);
      return 0;
    }
  }

  private sweepError(arm: WocSweepErrorTag, err: unknown): void {
    if (this.deps.onSweepError) {
      this.deps.onSweepError(arm, err);
      return;
    }
    console.error(`[woc_market] sweep arm ${arm} failed:`, err);
  }

  private async closeDueAuctions(nowMs: number): Promise<number> {
    const due = await this.deps.db.claimDueListings(this.cfg.realm, nowMs, SWEEP_BATCH);
    for (const listing of due) {
      try {
        await this.closeOneDueAuction(listing, nowMs);
      } catch (err) {
        // Per-listing isolation: one poisoned row must not strand the rest of
        // the batch (its own claim is re-opened by the stranded reclaim).
        this.sweepError('closed', err);
      }
    }
    return due.length;
  }

  private async closeOneDueAuction(listing: WocListingRow, nowMs: number): Promise<void> {
    const bids = await this.deps.db.bidsForListing(listing.id);
    const standing = bids.find((b) => b.status === 'active');
    const reserve = listing.reserveCents;
    if (!standing) {
      // Guarded close: a buy-now settlement placed inside the closing
      // window may be riding this listing, and this arm never reaches
      // insertSettlement's unique-index arbiter, so an unguarded close here
      // was the item-dupe hole (return sweep mails the escrow home while
      // the buyer can still pay). A refusal parks the listing 'settling';
      // the delivery and overdue sweeps resolve the settlement and the
      // ordinary close paths finish the job.
      if (!(await this.deps.db.closeListingIfNoOpenSettlement(listing.id, 'no_bids'))) {
        await this.deps.db.markListingSettling(listing.id);
      }
      return;
    }
    if (reserve !== null && standing.amountCents < reserve) {
      // Atomic demote: outbid plus the held-bond refund ride ONE statement,
      // so a crash between them can never strand a held bond no sweep arm
      // reaches. Same guarded close as the no-bids arm above. Demote BEFORE
      // the close on purpose (a crash between the two must never leave a
      // closed listing holding an active bid); the known cosmetic edge is a
      // purely CONTENDED close refusal, where the reclaimed re-run finds no
      // active bid and records 'no_bids' instead of 'reserve_not_met'.
      await this.deps.db.markBidOutbidQueueRefund(standing.id);
      if (!(await this.deps.db.closeListingIfNoOpenSettlement(listing.id, 'reserve_not_met'))) {
        await this.deps.db.markListingSettling(listing.id);
      }
      return;
    }
    const settlement = await this.deps.db.insertSettlement({
      listingId: listing.id,
      bidId: standing.id,
      attempt: 1,
      buyerAccount: standing.account,
      buyerCharacter: standing.characterId,
      buyerName: standing.characterName,
      buyerWallet: standing.wallet,
      amountCents: standing.amountCents,
      deadlineAtMs: nowMs + WOC_MARKET_SETTLEMENT_WINDOW_SECONDS * 1000,
      nowMs,
      // Stamped 'won' inside the insert's transaction, so the race below can
      // never leave a settlement-less winner. The close-time winner is
      // always read as 'active' just above, so the pickable set is exactly
      // that: a bid something else moved off 'active' meanwhile has lost
      // its claim and must not be stamped.
      winnerBidId: standing.id,
      winnerFrom: ['active'],
    });
    if (settlement === 'listing_closed') {
      // A suspend closed the listing under our 'ending' claim; it already
      // resolved the bid book and the bonds, so there is nothing to settle.
      return;
    }
    if (settlement === 'contended') {
      // A guard transaction holds the listing row; nothing was written.
      // Leave the claim as-is: the stranded reclaim re-opens an 'ending'
      // row after its grace and the next pass retries the close.
      return;
    }
    if (settlement === 'live_settlement_exists' || settlement === 'winner_gone') {
      // A buy-now settlement is already in flight (or a concurrent suspend
      // took the winner off 'active'): that racer won. The standing bid
      // loses its claim (the insert and its 'won' stamp rolled back
      // together) and its bond rides the refund pipeline, atomically; the
      // demote's own compare-and-set from 'active' cannot resurrect a bid
      // a concurrent suspend already cancelled.
      await this.deps.db.markBidOutbidQueueRefund(standing.id);
    }
    // Either way the listing leaves 'ending': a claimed row that stays there
    // is unreachable forever (claimDueListings only selects 'active'), which
    // would strand the escrowed copy and the winner's bond with no
    // reconciliation path. On the buy-now race above the live settlement is
    // the one that drives it, and it also becomes 'settling'.
    await this.deps.db.markListingSettling(listing.id);
  }

  /**
   * Reclaim listings stranded mid-resolution: a query failure or a crash
   * between the claimDueListings UPDATE and the per-listing resolution leaves
   * rows in 'ending' (or in 'settling' with no live settlement) that no other
   * arm can reach. Both are re-opened to 'active' with their original end, so
   * the next pass resolves them normally; the anti-snipe cap keeps the end
   * from drifting.
   */
  private async reclaimStrandedListings(nowMs: number): Promise<number> {
    const stranded = await this.deps.db.strandedListings(
      this.cfg.realm,
      nowMs - WOC_MARKET_STRANDED_RECLAIM_SECONDS * 1000,
      SWEEP_BATCH,
    );
    let reopened = 0;
    for (const listing of stranded) {
      // Per-listing isolation: one poisoned row must not starve the rest of
      // the stranded batch until the next pass.
      try {
        const live = await this.deps.db.liveSettlementForListing(listing.id);
        // Genuinely settling: every live state has its own arm (a stranded
        // 'delivered' converges through the redriven beat; this arm's only
        // job is to never REOPEN over it, which the live check guarantees).
        if (live) continue;
        // A 'failed' settlement is NOT reclaimable either, and must not be
        // expired here: it is still inside the overdue sweep's jurisdiction,
        // whose deadline pass is what defaults the winner, forfeits the bond,
        // records the strike, and runs the offerNext cascade. Expiring it from
        // this arm would silently drop all four (a bond left 'held' is
        // unreachable by every sweep arm). The reopen statement itself refuses
        // while any open OR failed settlement rides the listing, so a row that
        // lands between the read above and the write stays parked.
        await this.deps.db.reopenListing(listing.id);
        reopened++;
      } catch (err) {
        this.sweepError('reclaimed', err);
      }
    }
    return reopened;
  }

  /** The cancel-intent converge: stamped listings whose lock window ended
   *  unpaid close 'cancelled' with the return flight home. 'skip' and
   *  'contended' rows simply wait for the next pass (a paid window converges
   *  through settlement instead, and its finalize closes the listing sold). */
  private async closeCancelPendingListings(nowMs: number): Promise<number> {
    // A 'skip' (a paid window converging through settlement instead, whose
    // finalize closes the listing sold) PARKS: rotate once on
    // sweep_parked_at, back off in-process, and stay excluded from the batch
    // read while waiting, the delivery arms' seam, because a paid window can
    // sit unresolved for operator-scale time and must not head the batch
    // every pass. 'contended' just retries next pass.
    const pending = await this.deps.db.cancelPendingListings(
      this.cfg.realm,
      nowMs,
      SWEEP_BATCH,
      this.backedOffIds(this.parkedCancelIntents, nowMs),
    );
    let closed = 0;
    for (const listing of pending) {
      try {
        const out = await this.deps.db.closeCancelPendingListing(this.cfg.realm, listing.id, nowMs);
        if (out === 'skip') {
          this.parkedCancelIntents.set(listing.id, nowMs + WocMarketService.PARK_RETRY_MS);
          await this.deps.db.touchListingRow(listing.id);
          continue;
        }
        if (out === 'contended') continue;
        closed++;
        this.parkedCancelIntents.delete(listing.id);
        // Eager return flight, best-effort: the sweep's undisposed
        // reconciliation (closed, undisposed, resolution != sold) backstops a
        // crash right here.
        await this.returnListingItem(out).catch(() => {});
      } catch (err) {
        // Per-row isolation, the sweep-wide rule.
        this.sweepError('cancelClosed', err);
      }
    }
    return closed;
  }

  private async expireOverdueSettlements(nowMs: number): Promise<number> {
    const overdue = await this.deps.db.overdueSettlements(
      this.cfg.realm,
      nowMs,
      SWEEP_BATCH,
      nowMs - this.cfg.confirmingReviewMs,
    );
    for (const settlement of overdue) {
      try {
        await this.expireOneOverdueSettlement(settlement, nowMs);
      } catch (err) {
        // Per-row isolation: this backlog returns UNCLAIMED rows in deadline
        // order, so a persistently failing head row would otherwise starve
        // every later expiry (and its bond and strike work) forever.
        this.sweepError('expired', err);
      }
    }
    return overdue.length;
  }

  private async expireOneOverdueSettlement(
    settlement: WocSettlementRow,
    nowMs: number,
  ): Promise<void> {
    if (settlement.state === 'confirming') {
      // The H15 exit: a signature exists and the chain never decided, so the
      // row is AMBIGUOUS by construction. It must not default, forfeit,
      // strike, or cascade (the buyer may have paid), and it must not be
      // polled forever either. 'review' parks it for an operator verdict:
      // out of the polling set, still OPEN (the listing cannot re-auction),
      // surfaced by the stuck readout. The operator resolution arms are
      // review -> confirmed (payment verified on chain: delivery resumes) and
      // review -> failed (verified unpaid: the ordinary overdue default pass
      // takes it from there); the ops tooling drives them.
      await this.deps.db.transitionSettlement(
        settlement.id,
        ['confirming'],
        'review',
        'confirming_overdue',
      );
      return;
    }
    // A 'failed' row KEEPS its refusal reason across the expiry (COALESCE in
    // the transition): the abandon recorders' exempt predicate reads it, and
    // 'window_elapsed' would erase exactly the fact that distinguishes a
    // chain-refused try from a walk-away. Offered rows (no refusal ever)
    // stamp window_elapsed as before.
    const moved = await this.deps.db.transitionSettlement(
      settlement.id,
      ['offered', 'failed'],
      'expired',
      settlement.state === 'failed' ? undefined : 'window_elapsed',
    );
    if (!moved) return;
    const listing = await this.deps.db.listingById(this.cfg.realm, settlement.listingId);
    if (!listing) return;
    if (settlement.bidId !== null) {
      // The close-time winner defaulted: forfeit the held bond, strike them.
      // CAS from 'won': a bid something else already resolved (a suspend's
      // CTE cancelled it with its refund queued) must not be re-labelled a
      // default on top of that resolution.
      await this.deps.db.markBidStatus(settlement.bidId, 'defaulted', ['won']);
      await this.deps.db.setBondState(settlement.bidId, ['held'], 'forfeit_due');
      const strikes = await this.deps.db.strikeInfo(settlement.buyerAccount);
      const count = (strikes?.strikes ?? 0) + 1;
      const suspension = strikeSuspensionMs(count);
      await this.deps.db.addStrike(
        settlement.buyerAccount,
        suspension > 0 ? nowMs + suspension : null,
      );
    } else {
      // An abandoned buy-now. On a PUBLIC listing the buyer committed no
      // money, the lock clears and the listing resumes for the next person,
      // so no strike is warranted; what it DOES cost them now is a cooldown
      // (the abandon-loop ruling): the recorded abandonment blocks re-claims
      // of this listing and counts toward the account-wide hourly cap.
      // Recorded BEFORE the clear (a crash between the two must not lose the
      // row), keyed by the window (the settlement deadline IS the lock
      // expiry), deduped against the steal-time recorder. The clear is
      // holder-guarded: if a new claimer already stole the expired lock,
      // their live window survives this arm.
      //
      // A DIRECTED sale keeps its strike instead (and records no cooldown
      // row). Its buyer accepted a named offer, and that acceptance is what
      // pulled a specific player's item out of their bags into escrow;
      // walking away leaves that seller holding an unsellable listing they
      // have to notice and cancel. This is the requester's rule that strikes
      // apply to p2p non-payment once both parties have accepted, and
      // acceptance is exactly the moment escrow happened. There is no bond
      // to forfeit here (a directed sale carries none).
      // The abandon-vs-tried distinction lives in ONE place, the recorder's
      // own exempt-window predicate (recordBuyNowAbandon refuses windows
      // whose refusal class says the chain plausibly saw money), shared with
      // the steal-time recorder so the two can never disagree. A bare
      // signature does NOT exempt: it proves only that a string was posted,
      // and exempting on it let one fabricated request bypass the whole
      // cooldown arm.
      if (listing.directedBuyerAccount === null) {
        await this.deps.db.recordBuyNowAbandon(
          this.cfg.realm,
          listing.id,
          settlement.buyerAccount,
          settlement.deadlineAtMs,
        );
      }
      await this.deps.db.clearBuyNowLock(listing.id, settlement.buyerAccount);
      if (listing.directedBuyerAccount !== null) {
        const strikes = await this.deps.db.strikeInfo(settlement.buyerAccount);
        const count = (strikes?.strikes ?? 0) + 1;
        const suspension = strikeSuspensionMs(count);
        await this.deps.db.addStrike(
          settlement.buyerAccount,
          suspension > 0 ? nowMs + suspension : null,
        );
      }
      return;
    }
    // Cascade to the next eligible bidder when the seller opted in.
    if (listing.offerNext) {
      const priorWinners = (await this.deps.db.bidsForListing(listing.id))
        .filter((b) => b.status === 'won' || b.status === 'defaulted')
        .map((b) => b.account);
      const next = await this.deps.db.nextCascadeBidder(
        listing.id,
        listing.reserveCents ?? listing.startCents,
        priorWinners,
      );
      if (next) {
        // The promoted bidder's bond was released when they were outbid, so
        // re-arm it: a cascade winner with nothing at risk cannot be made to
        // forfeit (PRD "A winner who fails to settle forfeits the bond").
        // 'refunded' is terminal, so only a still-held or refund-pending bond
        // is re-held; an already-refunded one is re-quoted by the client
        // through the ordinary bond flow before the settlement can confirm.
        await this.deps.db.setBondState(next.id, ['refund_due', 'held'], 'held');
        const cascaded = await this.deps.db.insertSettlement({
          listingId: listing.id,
          bidId: next.id,
          attempt: settlement.attempt + 1,
          buyerAccount: next.account,
          buyerCharacter: next.characterId,
          buyerName: next.characterName,
          buyerWallet: next.wallet,
          amountCents: next.amountCents,
          deadlineAtMs: nowMs + WOC_MARKET_SETTLEMENT_WINDOW_SECONDS * 1000,
          nowMs,
          // The cascade only ever promotes an 'outbid' runner-up
          // (nextCascadeBidder's selection), so that is the whole pickable
          // set here.
          winnerBidId: next.id,
          winnerFrom: ['outbid'],
        });
        if (typeof cascaded === 'string') {
          // live_settlement_exists / listing_closed: a cancel or suspend
          // closed the listing between this arm's listingById read and the
          // insert (the insert's own listing lock is what refuses now), or
          // a second open settlement raced in over the retry window of the
          // 'failed' row this arm expired. winner_gone: a suspend cancelled
          // the runner-up under us. contended: a guard holds the listing
          // row and nothing was written. In every arm the insert (and any
          // 'won' stamp) rolled back; unwind the re-hold so the bond cannot
          // sit held on a bid with no claim.
          await this.deps.db.setBondState(next.id, ['held'], 'refund_due');
        }
        return;
      }
    }
    await this.deps.db.closeListing(listing.id, 'unsettled');
  }

  private async pollConfirmingSettlements(): Promise<number> {
    const confirming = await this.deps.db.confirmingSettlements(this.cfg.realm, SWEEP_BATCH);
    for (const settlement of confirming) {
      try {
        if (settlement.quoteReference === null || settlement.txSignature === null) continue;
        const confirmed = await this.deps.economy
          .confirm(settlement.quoteReference, settlement.txSignature)
          .catch(() => null);
        if (!confirmed || confirmed.pending) continue;
        if (confirmed.settled) {
          await this.deps.db.transitionSettlement(settlement.id, ['confirming'], 'confirmed');
        } else {
          await this.deps.db.transitionSettlement(
            settlement.id,
            ['confirming'],
            'failed',
            confirmed.reason ?? 'refused',
          );
        }
      } catch (err) {
        // Per-row isolation: an unclaimed ordered backlog, same rationale as
        // the expiry arm.
        this.sweepError('polled', err);
      }
    }
    return confirming.length;
  }

  /** Shared loop for the two delivery arms: per-row isolation, park handling
   *  (a parked row rotates ONCE, at park time, onto the sweep_parked_at
   *  batch order; while its backoff runs the batch reads EXCLUDE it, so it
   *  costs neither a batch slot nor a write per pass), and a SCOPE-WIDE stop
   *  on the first 'contended' outcome: the rows a break leaves behind are
   *  already 'delivering', so without the flag the reconcile arm would
   *  re-attempt them seconds later in the same pass and spend the
   *  lock_timeout budget the break conserved. Returns rows ADVANCED. */
  private async runDeliveryBatch(
    arm: 'delivered' | 'reconciled',
    batch: readonly WocSettlementRow[],
    nowMs: number,
    scope: WocDeliveryScope,
  ): Promise<number> {
    // Pruned here rather than only at pass start (the eager confirm path
    // enters through this method without ever winning the sweep lock), and
    // BEFORE the contended return so a contended pass still ages the ledgers.
    // A pass where BOTH delivery arms throw before reaching here skips one
    // prune beat, which is harmless: backedOffIds filters on retryAtMs, so a
    // stale entry can never exclude a row, only linger until the next prune.
    this.pruneLocalLedgers(nowMs);
    if (scope.contended) return 0;
    let advanced = 0;
    for (const settlement of batch) {
      const retryAt = this.parkedDeliveries.get(settlement.id);
      // Belt only: the batch reads already exclude rows inside their backoff
      // window. The reachable case is an EAGER-confirm park landing between
      // the reconcile arm's read and this row's turn in the loop (a freshly
      // claimed 'confirmed' row can never be parked: parks live in
      // 'delivering').
      if (retryAt !== undefined && retryAt > nowMs) continue;
      try {
        const out = await this.deliverOne(settlement);
        if (out === 'advanced') {
          advanced++;
          this.parkedDeliveries.delete(settlement.id);
        } else if (out === 'parked') {
          this.parkedDeliveries.set(settlement.id, nowMs + WocMarketService.PARK_RETRY_MS);
          scope.parked++;
          await this.deps.db.touchSettlementRow(settlement.id);
        } else if (out === 'skip') {
          // 'skip' after custody was booked means the settlement or listing
          // row left the shape only a hand edit can produce: it is invisible
          // to every monitor class, so the ONE place that saw it must say so.
          this.parkedDeliveries.delete(settlement.id);
          this.sweepError(
            arm,
            new Error(
              `settlement ${settlement.id} vanished mid-delivery (listing ${settlement.listingId}): hand-moved row?`,
            ),
          );
        } else if (out === 'contended') {
          scope.contended = true;
          break;
        }
      } catch (err) {
        // Per-settlement isolation: one poisoned row must not strand the rest
        // of the batch until the next pass.
        this.sweepError(arm, err);
      }
    }
    return advanced;
  }

  private async deliverConfirmedSettlements(
    nowMs: number,
    scope: WocDeliveryScope,
  ): Promise<number> {
    // Honor a contended scope BEFORE claiming: the claim UPDATE moves rows
    // into 'delivering', and claiming a batch this pass will not deliver
    // only feeds the stuck-delivering readout for nothing.
    if (scope.contended) return 0;
    const claimed = await this.deps.db.claimDeliverableSettlements(this.cfg.realm, SWEEP_BATCH);
    return this.runDeliveryBatch('delivered', claimed, nowMs, scope);
  }

  /** Crash recovery: rows stuck in 'delivering' resume here; the custody
   *  book-once dedupe makes re-running the whole arm safe. Rows inside their
   *  in-process backoff window are excluded in the QUERY, so a standing
   *  parked set consumes no batch slots and costs no writes while it waits. */
  private async reconcileDelivering(nowMs: number, scope: WocDeliveryScope): Promise<number> {
    const stuck = await this.deps.db.deliveringSettlements(
      this.cfg.realm,
      SWEEP_BATCH,
      this.backedOffIds(this.parkedDeliveries, nowMs),
    );
    return this.runDeliveryBatch('reconciled', stuck, nowMs, scope);
  }

  /** The ids a batch read should skip: parked rows still inside their
   *  backoff window. Process-local by design, like the park ledgers. */
  private backedOffIds(parked: ReadonlyMap<number, number>, nowMs: number): number[] {
    const out: number[] = [];
    for (const [id, retryAtMs] of parked) {
      if (retryAtMs > nowMs) out.push(id);
    }
    return out;
  }

  /** Drive an older binary's delivered-but-unclosed residue FORWARD: custody
   *  completed ('delivered') but the separately-committed close tail never
   *  ran, leaving a listing nothing else may touch (cancel, suspend, reclaim
   *  and the close arms all refuse over the live settlement). The finalize
   *  transaction converges it to the finished sale exactly once; under the
   *  new binary the tail cannot tear, so this converges a FINITE set and runs
   *  at minute scale over a bounded id page. The FINALIZE work per beat is
   *  bounded at SWEEP_BATCH like every other arm (each finalized row also
   *  costs a realm mail-book write on the shared serial writer, and the one
   *  time residue is plentiful, the first boot after a legacy upgrade, is
   *  exactly when the realm can least absorb an unbounded burst); a truncated
   *  page resumes right behind the last processed row on the next beat. */
  private async redriveDeliveredTails(nowMs: number, scope: WocDeliveryScope): Promise<number> {
    if (nowMs < this.redriveDueAtMs || scope.contended) return 0;
    this.redriveDueAtMs = nowMs + WocMarketService.REDRIVE_INTERVAL_MS;
    const page = await this.deps.db.deliveredUnclosedSettlementsPage(
      this.cfg.realm,
      this.redriveCursor,
      WocMarketService.REDRIVE_PAGE,
      SWEEP_BATCH,
    );
    // The cursor advances past the page even when a break below leaves rows
    // unfinished: those wait for the cursor to wrap (a later beat), which
    // converges, just slower than the beat interval on a contended cycle.
    this.redriveCursor = page.lastListingId ?? 0;
    let advanced = 0;
    for (const settlement of page.settlements) {
      try {
        // The listing read only costs when residue actually exists, which is
        // the rare case (usually zero rows survive the page probe).
        const listing = await this.deps.db.listingById(this.cfg.realm, settlement.listingId);
        if (!listing) continue;
        const out = await this.finalizeDelivered(settlement, listing);
        if (out === 'finalized') {
          // Counted and notified ONLY on a real transition: a re-run whose
          // close already landed reports 'already_final', which keeps this
          // beat from re-mailing the seller's sold notice (item-free, but a
          // collected-and-deleted notice would still re-appear) and from
          // reporting converged work as fresh.
          advanced++;
          await this.notifySellerSold(listing);
        } else if (out === 'contended') {
          scope.contended = true;
          break;
        }
      } catch (err) {
        this.sweepError('redriven', err);
      }
    }
    return advanced;
  }

  /** The sibling residue: a closed sold listing with a STANDING sale row
   *  whose dispose flag never landed (the old binary crashed between its
   *  close and dispose statements). Its own arm so a throw or a contended
   *  pass can never cost the page walk its count. */
  private async disposeSoldResidue(nowMs: number, scope: WocDeliveryScope): Promise<number> {
    if (nowMs < this.disposeDueAtMs || scope.contended) return 0;
    this.disposeDueAtMs = nowMs + WocMarketService.REDRIVE_INTERVAL_MS;
    return this.deps.db.disposeSoldResidueListings(this.cfg.realm, SWEEP_BATCH);
  }

  /**
   * Book a custody parcel exactly once, with the claim in POSTGRES rather than
   * in the mail blob: the blob's own marker is advisory (a player can delete an
   * emptied letter, and an older binary's loader strips the field), so it can
   * never be the authority.
   *
   * An existing claim is CONSULTED, never adopted: booked means a prior pass
   * really delivered (done). An unbooked claim may resume the write under the
   * SAME ref only with evidence the parcel was not already collected: either
   * this process stamped the intent and has NOT yet handed a parcel to the
   * post office (an UNWRITTEN pendingMail entry: nothing exists to collect),
   * or the parcel is still IN the live book (presence is permission). Once an
   * attempt has reached the post office, in-process memory proves nothing
   * about collection, so only the in-book check authorizes from then on. An
   * unbooked claim that fails both is ambiguous, the mailed item may already
   * sit in the buyer's bags with its letter deleted, so it PARKS (false), as
   * do a grant-intent claim (the hand-off may have landed) and a claim with
   * no intent at all (a legacy row, or a claim whose process died before
   * stamping): visible in the unbooked-claims read, never duplicated.
   *
   * A booking failure KEEPS the claim, unbooked and visible: releasing it
   * made a repeatedly failing mail write invisible to the operator, and the
   * resume above makes the kept claim converge once the write succeeds.
   *
   * An ITEM-FREE letter (the seller's sold notice) never touches the ledger
   * at all: it can duplicate nothing and destroy nothing, its only writer
   * runs once per finalized sale, and a durable claim for it would park
   * forever on a transient failure (no arm ever re-notifies), polluting the
   * one readout the operator watches. The in-book dedupe still absorbs
   * same-process retries.
   */
  private async bookCustodyOnce(
    recipient: { key: string; name: string },
    letter: 'delivery' | 'return' | 'sold_notice',
    items: InvSlot[],
    custodyRef: string,
  ): Promise<boolean> {
    if (items.length === 0) {
      await this.deps.custody.persistMailParcel(recipient, letter, items, custodyRef);
      return true;
    }
    const fresh = await this.deps.db.claimCustodyRef(this.cfg.realm, custodyRef);
    if (fresh) {
      // Stamp the durable mail intent BEFORE the parcel exists anywhere, so a
      // crash at any later point leaves a claim that says which rail owns it.
      if (!(await this.deps.db.markCustodyMailIntent(custodyRef))) return false;
      this.pendingMail.set(custodyRef, { stampMs: this.now(), written: false });
    } else {
      const state = await this.deps.db.custodyRefState(custodyRef);
      if (state === null) {
        // The row vanished between the claim attempt and this read, which
        // only hand intervention can cause; park this pass and let the next
        // one mint a fresh claim.
        return false;
      }
      if (state.booked) {
        this.pendingMail.delete(custodyRef);
        return true;
      }
      if (state.grantCharacterId !== null) return false;
      if (!state.mailIntent) return false;
      const attempt = this.pendingMail.get(custodyRef);
      const unwritten = attempt !== undefined && !attempt.written;
      if (!unwritten && !this.deps.custody.hasParcel(custodyRef)) {
        return false;
      }
      // Attributed to the mail rail with the parcel provably uncollected:
      // fall through and resume the durable write (the in-book dedupe makes
      // the re-mail idempotent, and booked_at still gates the advance).
    }
    // Flip written BEFORE the call: a throw anywhere inside persistMailParcel
    // can still leave the parcel in the LIVE book (the blob half failing),
    // so from this line on only the in-book check may authorize a retry.
    const attempt = this.pendingMail.get(custodyRef);
    if (attempt) attempt.written = true;
    await this.deps.custody.persistMailParcel(recipient, letter, items, custodyRef);
    await this.deps.db.markCustodyRefBooked(custodyRef);
    this.pendingMail.delete(custodyRef);
    return true;
  }

  /**
   * Put a directed sale's item straight into the buyer's bags.
   *
   * Rides the SAME custodyRef as the mail parcel would, deliberately: the claim
   * is the one key that decides an item is delivered, so hand-off and mail are
   * mutually exclusive by construction and no sequence of retries can do both.
   *
   * Three outcomes, and the difference is load-bearing (B2b):
   * - 'handed': the grant AND its booking committed atomically; done.
   * - 'mail': nothing durable happened (an ordinary grantCopy refusal:
   *   offline, wrong owner, bags full; or a claim the mail side already
   *   owns); the caller mails instead. The refusal path CONVERTS the claim's
   *   intent to the mail rail in one statement, which is the only legal
   *   conversion (grantCopy declining proves the bags are untouched).
   * - 'abort': the outcome is unknown or owed to a later pass. A TRANSIENT
   *   save throw lands here: the grant sits in the live bags, an autosave may
   *   persist it, and the old fall-through-to-mail was exactly the second
   *   copy. The claim keeps its grant intent, the pendingGrants entry keeps
   *   the session identity, and the next pass retries the SAME ref
   *   idempotently (snapshotCopy, never a second grantCopy). A lease-fence
   *   rejection ALSO keeps the intent and parks: the fence proves this write
   *   lost, not that an earlier autosave under the then-valid nonce did, so
   *   only an operator can attribute the item. An unbooked grant claim whose
   *   session is gone parks the same way (visible in the unbooked-claims
   *   read), as does an 'ambiguous' grantCopy refusal (the grant touched the
   *   live bags but the session state is unprovable: never mail over it).
   */
  private async handToBuyer(
    settlement: WocSettlementRow,
    item: InvSlot,
    target: { characterId: number; name: string },
    custodyRef: string,
  ): Promise<'handed' | 'mail' | 'abort'> {
    const fresh = await this.deps.db.claimCustodyRef(this.cfg.realm, custodyRef);
    if (!fresh) {
      const state = await this.deps.db.custodyRefState(custodyRef);
      // Vanished under us (hand intervention only): park this pass.
      if (state === null) return 'abort';
      // A prior pass really delivered (either route).
      if (state.booked) return 'handed';
      // A claim the mail rail owns (or an unattributable one): the mail
      // route decides its own resume-or-park.
      if (state.grantCharacterId === null) return 'mail';
      // A grant was in flight under this ref. Resume it ONLY while the very
      // session it landed in is still live in this process: the live bags are
      // then known to hold the earlier grant, so re-persisting them retries
      // the delivery without a second copy. Anything else (a restart, a
      // relog, a nonce rotation) makes the bags unprovable and parks the
      // claim for the operator: never mail, never re-grant, never advance.
      const pending = this.pendingGrants.get(custodyRef);
      if (!pending || pending.characterId !== state.grantCharacterId) {
        // No usable session memory for this ref (restart, or a claim another
        // process granted): drop any mismatched entry and park.
        this.pendingGrants.delete(custodyRef);
        return 'abort';
      }
      const snap = this.deps.custody.snapshotCopy(settlement.buyerAccount, pending.characterId);
      if (
        !snap.ok ||
        snap.save.leaseNonce === undefined ||
        snap.save.leaseNonce !== pending.leaseNonce
      ) {
        // The session ended or rotated: the continuous-memory retry is dead
        // for good, so drop the entry (the claim itself keeps the park).
        this.pendingGrants.delete(custodyRef);
        return 'abort';
      }
      // The proof of resumability is the SESSION IDENTITY plus nonce match,
      // not the entry's age: refresh the stamp on every provable attempt, or
      // ten minutes of ordinary lock contention (a slow-database incident)
      // would expire a still-live, still-provable retry into a permanent
      // operator-only park.
      pending.stampMs = this.now();
      return this.commitGrant(custodyRef, snap.save);
    }
    // Fresh claim: stamp the durable grant intent BEFORE touching the bags, so
    // a crash at any later point leaves a claim that says "a grant may have
    // landed" and no automatic path will mail over it.
    const stamped = await this.deps.db.markCustodyGrantIntent(custodyRef, target.characterId);
    if (!stamped) return 'abort';
    const granted = this.deps.custody.grantCopy(settlement.buyerAccount, target.characterId, item);
    if (!granted.ok) {
      // 'ambiguous' is NOT a clean refusal: the grant already touched the
      // live bags and the session state is unprovable, so the claim keeps
      // its grant intent and PARKS (mailing here is the second-copy rail).
      if (granted.reason === 'ambiguous') return 'abort';
      // Nothing durable happened (grantCopy declines cleanly), so convert
      // the claim to the mail rail in one statement and record the not-yet-
      // written attempt: that pair is what lets bookCustodyOnce proceed.
      if (!(await this.deps.db.markCustodyMailIntent(custodyRef))) return 'abort';
      this.pendingMail.set(custodyRef, { stampMs: this.now(), written: false });
      return 'mail';
    }
    this.pendingGrants.set(custodyRef, {
      characterId: target.characterId,
      leaseNonce: granted.save.leaseNonce,
      stampMs: this.now(),
    });
    return this.commitGrant(custodyRef, granted.save);
  }

  /** The durable half of a direct hand-off: persist the granted bags and book
   *  the ref in ONE transaction (saveDeliveredCharacterBooked). See
   *  handToBuyer for what each outcome means to the caller. */
  private async commitGrant(
    custodyRef: string,
    save: CharacterSaveArgs,
  ): Promise<'handed' | 'abort'> {
    let out: 'booked' | 'lease_lost' | 'claim_missing';
    try {
      out = await this.deps.db.saveDeliveredCharacterBooked(save, custodyRef);
    } catch (err) {
      // Transient throw (pool exhaustion, timeout, connection reset): the
      // transaction may or may not have committed. Keep the claim, the grant
      // intent, and the pendingGrants entry; the next pass reads booked_at
      // and either sees the commit (handed) or retries this same session.
      // NEVER fall through to mail here: that was the B2b double copy.
      this.sweepError('deliver_grant', err);
      return 'abort';
    }
    if (out === 'booked') {
      this.pendingGrants.delete(custodyRef);
      return 'handed';
    }
    if (out === 'lease_lost') {
      // The fence rejected the write: another process owns this character now
      // and every FUTURE save from this zombie session is fenced out too. But
      // the fence says nothing about a save that already landed while the
      // nonce was still valid (the ordinary autosave), so the grant may
      // ALREADY be durable. Keep the intent, park, and let the operator
      // attribute the item; mailing here was a dupe against exactly that
      // autosave.
      this.pendingGrants.delete(custodyRef);
      return 'abort';
    }
    // claim_missing: the claim row was gone or already booked under us, which
    // only hand intervention can cause; the save rolled back with it. Park
    // loudly rather than guessing.
    this.pendingGrants.delete(custodyRef);
    this.sweepError(
      'deliver_grant',
      new Error(`woc_market: custody claim missing at grant commit for ${custodyRef}`),
    );
    return 'abort';
  }

  /** One delivery attempt. 'advanced' finished the sale; 'parked' made no
   *  progress and cannot without outside change (the caller rotates and
   *  backs the row off); 'skip' means another actor owns the row now;
   *  'contended' means a bounded lock wait expired (the caller stops the
   *  batch and the next pass retries). */
  private async deliverOne(
    settlement: WocSettlementRow,
  ): Promise<'advanced' | 'parked' | 'skip' | 'contended'> {
    const listing = await this.deps.db.listingById(this.cfg.realm, settlement.listingId);
    if (!listing) return 'parked';
    if (listing.itemDisposed) {
      // The escrowed copy already left custody (delivered once, or returned
      // to the seller): delivering over it would mint a second copy (the
      // return-then-deliver shape). Park in 'delivering', visible to the
      // stuck monitor; an operator decides between failing the settlement
      // and correcting the flag.
      return 'parked';
    }
    const target = await this.deps.db.deliveryTarget(
      this.cfg.realm,
      settlement.buyerAccount,
      settlement.buyerCharacter,
    );
    // No character to deliver to right now: hold in 'delivering'; a later
    // beat retries (the account may recreate a character; admins can act).
    if (!target) return 'parked';
    const custodyRef = settlementCustodyRef(settlement.id);
    // A DIRECTED sale is a hand-to-hand deal: the two players agreed in a trade
    // window, so the goods belong in the buyer's bags, not in their mailbox.
    // An Exchange sale is anonymous and asynchronous, and keeps the parcel.
    //
    // Mail remains the fallback for BOTH, and every reason to fall back is
    // ordinary rather than exceptional (logged out, bags full). It is NOT the
    // fallback for an ambiguous grant: 'abort' holds the settlement in
    // 'delivering' with the claim visible, and never mails (B2b).
    let handed = false;
    if (listing.directedBuyerAccount !== null) {
      const hand = await this.handToBuyer(settlement, listing.item, target, custodyRef);
      if (hand === 'abort') return 'parked';
      handed = hand === 'handed';
    }
    if (!handed) {
      const booked = await this.bookCustodyOnce(
        { key: String(target.characterId), name: target.name },
        'delivery',
        [listing.item],
        custodyRef,
      );
      // A parked claim: stay in 'delivering', visible, and try again later.
      if (!booked) return 'parked';
    }
    // The whole close tail commits as ONE transaction (delivered CAS, sale
    // row, listing close + dispose, bond flips): no crash point can exist
    // between them, so the only resumable states are BEFORE it (custody
    // booked, still 'delivering': this method re-runs) and AFTER it (done).
    const finalized = await this.finalizeDelivered(settlement, listing);
    if (finalized === 'stale') return 'skip';
    if (finalized === 'contended') return 'contended';
    // 'already_final' converged with nothing new written: no second notice.
    if (finalized === 'finalized') await this.notifySellerSold(listing);
    return 'advanced';
  }

  private finalizeDelivered(
    settlement: WocSettlementRow,
    listing: WocListingRow,
  ): Promise<'finalized' | 'already_final' | 'stale' | 'contended'> {
    return this.deps.db.finalizeDeliveredSettlement({
      settlementId: settlement.id,
      listingId: listing.id,
      bidId: settlement.bidId,
      sale: {
        realm: this.cfg.realm,
        listingId: listing.id,
        itemId: listing.itemId,
        item: listing.item,
        priceCents: settlement.amountCents,
        // The settled base-unit amount when the quote leg is still on the row;
        // provenance keeps the USD price as the authoritative figure either way.
        amountBase: settlement.quoteReference === null ? null : settlement.settledAmountBase,
        sellerAccount: listing.sellerAccount,
        buyerAccount: settlement.buyerAccount,
        sellerName: listing.sellerName,
        buyerName: settlement.buyerName,
      },
    });
  }

  /** Best-effort seller notice (no attachment, book-once): it follows a
   *  finalized sale and must never fail or retry-block the delivery. The
   *  whole body is guarded (the target read included): no arm ever
   *  re-notifies, so a crash or throw between the finalize and this notice
   *  loses the notice for good (an ACCEPTED loss: the letter is item-free
   *  and the sale itself is durable), and the error line below is the only
   *  trace that it happened. */
  private async notifySellerSold(listing: WocListingRow): Promise<void> {
    try {
      const seller = await this.deps.db.deliveryTarget(
        this.cfg.realm,
        listing.sellerAccount,
        listing.sellerCharacter,
      );
      if (!seller) return;
      await this.bookCustodyOnce(
        { key: String(seller.characterId), name: seller.name },
        'sold_notice',
        [],
        listingSoldNoticeCustodyRef(listing.id),
      );
    } catch (err) {
      this.sweepError('deliver_notice', err);
    }
  }

  /** True only when the return flight completed and the listing was
   *  disposed; false is the caller's park signal (seller unresolvable, or a
   *  parked return claim, which must NOT dispose: the flag is what keeps the
   *  backlog retrying, and the claim stays visible meanwhile). */
  private async returnListingItem(listing: WocListingRow): Promise<boolean> {
    const target = await this.deps.db.deliveryTarget(
      this.cfg.realm,
      listing.sellerAccount,
      listing.sellerCharacter,
    );
    if (!target) return false;
    const booked = await this.bookCustodyOnce(
      { key: String(target.characterId), name: target.name },
      'return',
      [listing.item],
      listingReturnCustodyRef(listing.id),
    );
    if (!booked) return false;
    await this.deps.db.markItemDisposed(listing.id);
    return true;
  }

  /** Same park treatment as the delivery arms: a return that cannot proceed
   *  (seller gone, parked claim) rotates ONCE onto the sweep_parked_at batch
   *  order, backs off in-process, and is EXCLUDED from the backlog read
   *  until its retry; the stat counts rows DISPOSED, so a parked backlog can
   *  neither own the batch head nor flood the saturation warning. */
  private async returnUndisposedItems(nowMs: number, scope: WocDeliveryScope): Promise<number> {
    const backlog = await this.deps.db.undisposedClosedListings(
      this.cfg.realm,
      SWEEP_BATCH,
      this.backedOffIds(this.parkedReturns, nowMs),
    );
    let advanced = 0;
    for (const listing of backlog) {
      // Belt over the SQL's own resolution filter: a sold listing's copy went
      // to its buyer and must never take the return flight home.
      if (listing.resolution === 'sold') continue;
      const retryAt = this.parkedReturns.get(listing.id);
      // Belt only, and unlike the delivery twin's belt this one is currently
      // UNREACHABLE (nothing but this serialized arm writes parkedReturns and
      // the backlog read excludes backing-off rows): pure defense in depth.
      if (retryAt !== undefined && retryAt > nowMs) continue;
      try {
        if (await this.returnListingItem(listing)) {
          advanced++;
          this.parkedReturns.delete(listing.id);
        } else {
          this.parkedReturns.set(listing.id, nowMs + WocMarketService.PARK_RETRY_MS);
          scope.parked++;
          await this.deps.db.touchListingRow(listing.id);
        }
      } catch (err) {
        // Per-listing isolation, REPORTED rather than swallowed: a return
        // that fails every pass was invisible before.
        this.sweepError('returned', err);
      }
    }
    return advanced;
  }

  private async processDueBonds(): Promise<number> {
    const due = await this.deps.db.bondsDue(this.cfg.realm, SWEEP_BATCH);
    for (const bid of due) {
      try {
        if (bid.bondReference === null) {
          // Nothing was ever transferred; close the loop locally.
          await this.deps.db.setBondState(bid.id, ['refund_due', 'forfeit_due'], 'void');
          continue;
        }
        if (bid.bondState === 'refund_due') {
          const out = await this.deps.economy.refundBond(bid.bondReference).catch(() => null);
          if (out?.done) await this.deps.db.setBondState(bid.id, ['refund_due'], 'refunded');
        } else if (bid.bondState === 'forfeit_due') {
          const out = await this.deps.economy.forfeitBond(bid.bondReference).catch(() => null);
          if (out?.done) await this.deps.db.setBondState(bid.id, ['forfeit_due'], 'forfeited');
        }
      } catch (err) {
        // Per-row isolation: bondsDue returns UNCLAIMED rows in deadline
        // order, so a persistently failing head row (a pg error out of
        // setBondState; the economy calls are already caught) would starve
        // every other player's refund forever.
        this.sweepError('bonds', err);
      }
    }
    return due.length;
  }
}
