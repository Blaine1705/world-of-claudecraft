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
  WOC_MARKET_BUY_NOW_LOCK_SECONDS,
  WOC_MARKET_DIRECTED_OFFER_TTL_SECONDS,
  WOC_MARKET_DURATION_HOURS,
  WOC_MARKET_MAX_ACTIVE_LISTINGS,
  WOC_MARKET_RESTRICTED_POLICY,
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
  /** Cancel iff still active with no pending/active bid. Returns the row for
   *  the return flight. */
  cancelListingIfUnbid(
    realm: string,
    id: number,
    sellerAccount: number,
  ): Promise<WocListingRow | 'not_found' | 'not_yours' | 'has_bids' | 'not_active'>;
  /** Claim due auctions: active AND endsAt <= now become 'ending' (SKIP
   *  LOCKED), returned for resolution. */
  claimDueListings(realm: string, nowMs: number, limit: number): Promise<WocListingRow[]>;
  closeListing(id: number, resolution: WocListingResolution): Promise<void>;
  markListingSettling(id: number): Promise<void>;
  /** closed && !itemDisposed && resolution != 'sold': the return-flight
   *  reconciliation backlog. */
  undisposedClosedListings(realm: string, limit: number): Promise<WocListingRow[]>;
  /** Listings stuck mid-resolution ('ending' / 'settling') past a grace. */
  strandedListings(realm: string, olderThanMs: number, limit: number): Promise<WocListingRow[]>;
  /** Re-open a stranded listing so the ordinary close arm resolves it. */
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
  /** Persist a buyer's bags after a hand-to-hand delivery. False when the lease
   *  fence rejected the write, which means this process no longer owns the
   *  character and the delivery must take the mail route instead. */
  saveDeliveredCharacter(save: CharacterSaveArgs): Promise<boolean>;
  /** Release an unbooked claim so a failed booking can be retried. */
  unclaimCustodyRef(custodyRef: string): Promise<void>;
  claimBuyNowLock(
    realm: string,
    id: number,
    account: number,
    nowMs: number,
    expiresAtMs: number,
  ): Promise<WocListingRow | 'not_found' | 'not_active' | 'locked' | 'no_buy_now' | 'own_listing'>;
  clearBuyNowLock(id: number): Promise<void>;

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
    /** Anti-snipe: the new end when this placement extends the auction. */
    extendEndsToMs: (row: WocListingRow) => number | null;
    minNext: (row: WocListingRow) => number;
  }): Promise<
    | { ok: true; bid: WocBidRow }
    | {
        ok: false;
        reason: 'not_found' | 'not_active' | 'own_listing' | 'bid_too_low' | 'already_pending';
      }
  >;
  setBidBondQuote(bidId: number, reference: string, expiresAtMs: number): Promise<void>;
  /** Record the bidder's signature while the chain is still deciding. */
  submitBondSignature(
    bidId: number,
    signature: string,
  ): Promise<'recorded' | 'not_pending' | 'signature_reused'>;
  /** Paid-but-undecided bonds, for the sweep to re-check. */
  confirmingBonds(realm: string, limit: number): Promise<WocBidRow[]>;
  /** A bond the chain decided against: the bid lapses and the bond voids. */
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
  ): Promise<'activated' | 'superseded' | 'listing_closed' | 'not_pending'>;
  markBondHeld(bidId: number): Promise<void>;
  lapsePendingBids(realm: string, cutoffMs: number, limit: number): Promise<number>;
  bidsByAccount(realm: string, account: number, limit: number): Promise<WocBidRow[]>;
  bidsForListing(listingId: number): Promise<WocBidRow[]>;
  /** Cascade pick: the highest 'outbid' bid meeting `minCents` whose account
   *  is not among `excludedAccounts`, flipped to 'won' atomically. */
  promoteNextBidder(
    listingId: number,
    minCents: number,
    excludedAccounts: readonly number[],
  ): Promise<WocBidRow | null>;
  markBidStatus(bidId: number, status: WocBidStatus): Promise<void>;
  setBondState(bidId: number, from: WocBondState[], to: WocBondState): Promise<boolean>;
  bondsDue(realm: string, limit: number): Promise<WocBidRow[]>;
  cancelOpenBidsForListing(listingId: number): Promise<WocBidRow[]>;

  // Settlements
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
  }): Promise<WocSettlementRow | 'live_settlement_exists'>;
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
  transitionSettlement(
    id: number,
    from: WocSettlementState[],
    to: WocSettlementState,
    failReason?: string,
  ): Promise<boolean>;
  confirmingSettlements(realm: string, limit: number): Promise<WocSettlementRow[]>;
  /** confirmed -> delivering (SKIP LOCKED claim). */
  claimDeliverableSettlements(realm: string, limit: number): Promise<WocSettlementRow[]>;
  /** Stuck 'delivering' rows (crash recovery). */
  deliveringSettlements(realm: string, limit: number): Promise<WocSettlementRow[]>;
  overdueSettlements(realm: string, nowMs: number, limit: number): Promise<WocSettlementRow[]>;

  // Sales, strikes, terms
  insertSale(args: Omit<WocSaleRow, 'id' | 'excluded' | 'atMs'>): Promise<number>;
  salesForItem(realm: string, itemId: string, limit: number): Promise<WocSaleRow[]>;
  setSaleExcluded(id: number, excluded: boolean): Promise<boolean>;
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
  | { ok: false; reason: 'offline' | 'not_yours' | 'no_space' };

/** The one bridge into the live Sim (game.ts wiring). Every method is
 *  synchronous-in-memory except persistMailParcel, which books at most once
 *  by custodyRef and then persists the realm mail blob. */
export interface WocMarketCustody {
  extractCopy(accountId: number, characterId: number, ref: ExtractRef): WocCustodyExtract;
  /** Hand a held copy straight to a live buyer's bags. Returns the save the
   *  caller must persist before treating the delivery as done. */
  grantCopy(accountId: number, characterId: number, slot: InvSlot): WocCustodyGrant;
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
}

export interface WocMarketConfig {
  enabled: boolean;
  realm: string;
  policy: WocEligibilityPolicy;
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
   *  that came back with a FULL batch, i.e. a backlog that is not draining. */
  onSweepPass?(stats: WocSweepPassStats, saturated: readonly string[]): void;
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
  | 'buy_now_locked'
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
  polled: number;
  /** Bonds paid but not yet decided by the chain, re-checked this pass. */
  polledBonds: number;
  delivered: number;
  reconciled: number;
  returned: number;
  bonds: number;
}

export class WocMarketService {
  constructor(private readonly deps: WocMarketDeps) {}

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

  async cancelListing(account: number, listingId: number): Promise<{ ok: true } | Refused> {
    if (!this.cfg.enabled) return refuse('disabled');
    const out = await this.deps.db.cancelListingIfUnbid(this.cfg.realm, listingId, account);
    if (out === 'not_found') return refuse('not_found');
    if (out === 'not_yours') return refuse('not_yours');
    if (out === 'has_bids') return refuse('has_bids');
    if (out === 'not_active') return refuse('not_active');
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
      extendEndsToMs: (row) => antiSnipeExtendedEndMs(nowMs, row.endsAtMs, row.baseEndsAtMs),
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
    await this.deps.db.setBidBondQuote(inserted.bid.id, intent.reference, intent.expiresAtMs);
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
    // The status is re-checked inside the UPDATE, so a bond that landed between
    // the read and the write keeps its bid rather than losing it to this call.
    const done = await this.deps.db.abandonPendingBid(this.cfg.realm, bidId, account);
    return done ? { ok: true } : refuse('not_pending');
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
    const intent = await this.deps.economy.bondQuote({
      memoRef: `woc_bond:${bid.id}`,
      usdCents: bid.bondCents,
      buyerWallet: bid.wallet,
    });
    if (!intent.ok || intent.reference === null || intent.expiresAtMs === null) {
      return refuse('quote_unavailable');
    }
    await this.deps.db.setBidBondQuote(bid.id, intent.reference, intent.expiresAtMs);
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
    // An expired quote is never accepted for confirmation (the PRD rule, with
    // no carve-out for the bond leg): the bidder requests a fresh one.
    if (bid.bondQuoteExpiresAtMs !== null && bid.bondQuoteExpiresAtMs <= this.now()) {
      return refuse('quote_expired');
    }
    // Record the signature BEFORE asking the chain. An undecided verdict has to
    // leave something behind that the sweep can re-check, or the only available
    // answer is a refusal with the bidder's money already spent.
    const submitted = await this.deps.db.submitBondSignature(bid.id, signature);
    if (submitted === 'not_pending') return refuse('not_pending');
    if (submitted === 'signature_reused') return refuse('signature_reused');
    const confirmed = await this.deps.economy.confirm(bid.bondReference, signature);
    if (confirmed.settled) return this.holdBondAndActivate(bid.id);
    if (confirmed.pending) {
      // UNDECIDED, not refused. The payment may be perfectly good and merely
      // unfinalized (tens of seconds on mainnet), so the bid stays pending with
      // its signature and pollConfirmingBonds finishes it. Refusing here is the
      // mistake that cost a real settlement its money before the same shape was
      // found in this leg.
      return { ok: true, standing: false, pending: true };
    }
    return refuse('confirm_failed');
  }

  /** The two writes a decided, settled bond owes: hold it, then let it stand. */
  private async holdBondAndActivate(bidId: number): Promise<{ ok: true; standing: boolean }> {
    await this.deps.db.markBondHeld(bidId);
    const activated = await this.deps.db.activateBid(bidId, this.now());
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
    const bonds = await this.deps.db.confirmingBonds(this.cfg.realm, SWEEP_BATCH);
    for (const bid of bonds) {
      if (bid.bondReference === null || bid.bondSignature === null) continue;
      const confirmed = await this.deps.economy
        .confirm(bid.bondReference, bid.bondSignature)
        .catch(() => null);
      if (!confirmed || confirmed.pending) continue;
      if (confirmed.settled) {
        await this.holdBondAndActivate(bid.id);
      } else {
        // Decided AGAINST: the bond never landed, so the bid lapses and its
        // bond voids. Only a decided verdict may end it.
        await this.deps.db.lapseBid(bid.id);
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
    if (settlement === 'live_settlement_exists') {
      await this.deps.db.clearBuyNowLock(claimed.id);
      return refuse('buy_now_locked');
    }
    const quote = await this.quoteFor(settlement, claimed.sellerWallet);
    if (!quote.ok) {
      await this.deps.db.transitionSettlement(settlement.id, ['offered'], 'expired');
      await this.deps.db.clearBuyNowLock(claimed.id);
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
    if (settlement.state === 'failed') {
      // A refused confirmation returns to offered for a retry inside the window.
      await this.deps.db.transitionSettlement(settlement.id, ['failed'], 'offered');
    } else if (settlement.state !== 'offered') {
      return refuse('not_active');
    }
    if (settlement.deadlineAtMs <= this.now()) return refuse('quote_expired');
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
    if (settlement.state !== 'offered') return refuse('not_active');
    if (settlement.quoteReference === null || settlement.quoteExpiresAtMs === null) {
      return refuse('quote_unavailable');
    }
    if (settlement.quoteExpiresAtMs <= this.now()) return refuse('quote_expired');
    const submitted = await this.deps.db.submitSettlementSignature(settlement.id, signature);
    if (submitted === 'not_offered') return refuse('not_active');
    if (submitted === 'signature_reused') return refuse('signature_reused');
    const confirmed = await this.deps.economy.confirm(settlement.quoteReference, signature);
    if (confirmed.settled) {
      await this.deps.db.transitionSettlement(settlement.id, ['confirming'], 'confirmed');
      // Deliver eagerly; the sweep is the backstop for any failure past here.
      await this.deliverConfirmedSettlements().catch(() => {});
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

  async adminSuspendListing(listingId: number): Promise<{ ok: true } | Refused> {
    const listing = await this.deps.db.listingById(this.cfg.realm, listingId);
    if (!listing) return refuse('not_found');
    if (listing.status === 'closed') return refuse('not_active');
    const openBids = await this.deps.db.cancelOpenBidsForListing(listingId);
    for (const bid of openBids) {
      if (bid.bondState === 'held') {
        await this.deps.db.setBondState(bid.id, ['held'], 'refund_due');
      }
    }
    const live = await this.deps.db.liveSettlementForListing(listingId);
    if (live) {
      await this.deps.db.transitionSettlement(
        live.id,
        ['offered', 'confirming', 'failed'],
        'expired',
        'listing_suspended',
      );
    }
    await this.deps.db.closeListing(listingId, 'suspended');
    return { ok: true };
  }

  async adminSetSaleExcluded(saleId: number, excluded: boolean): Promise<{ ok: true } | Refused> {
    const done = await this.deps.db.setSaleExcluded(saleId, excluded);
    return done ? { ok: true } : refuse('not_found');
  }

  async adminClearStrikes(account: number): Promise<{ ok: true }> {
    await this.deps.db.clearStrikes(account);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // The sweep pass (called by woc_market_sweep.ts on its own clock)
  // -------------------------------------------------------------------------

  async sweepPass(): Promise<WocSweepPassStats | null> {
    if (!this.cfg.enabled) return null;
    const nowMs = this.now();
    const stats: WocSweepPassStats = {
      lapsedBids: await this.deps.db.lapsePendingBids(
        this.cfg.realm,
        nowMs - WOC_MARKET_BOND_PENDING_TTL_SECONDS * 1000,
        SWEEP_BATCH,
      ),
      // Directed offers escrow nothing, so an unanswered one costs no custody.
      // It still has to expire: left pending it stays visible in both players'
      // trade windows as a deal that can never be accepted, and the retention
      // prune only reaches resolved rows, so the table would grow forever.
      expiredOffers: await this.deps.db.expireDueDirectedOffers(this.cfg.realm, nowMs, SWEEP_BATCH),
      reclaimed: await this.reclaimStrandedListings(nowMs),
      closed: await this.closeDueAuctions(nowMs),
      expired: await this.expireOverdueSettlements(nowMs),
      polled: await this.pollConfirmingSettlements(),
      // BEFORE the lapse arm above would matter: a paid-but-undecided bond is
      // excluded from lapsing by its signature, and this is what resolves it.
      polledBonds: await this.pollConfirmingBonds(),
      delivered: await this.deliverConfirmedSettlements(),
      reconciled: await this.reconcileDelivering(),
      returned: await this.returnUndisposedItems(),
      bonds: await this.processDueBonds(),
    };
    // A FULL batch means the arm did not drain: that is the one signal that
    // separates a healthy idle marketplace from a permanently starved backlog,
    // so it is reported rather than left to look identical.
    const saturated = Object.entries(stats)
      .filter(([, n]) => n >= SWEEP_BATCH)
      .map(([arm]) => arm);
    this.deps.onSweepPass?.(stats, saturated);
    return stats;
  }

  private async closeDueAuctions(nowMs: number): Promise<number> {
    const due = await this.deps.db.claimDueListings(this.cfg.realm, nowMs, SWEEP_BATCH);
    for (const listing of due) {
      const bids = await this.deps.db.bidsForListing(listing.id);
      const standing = bids.find((b) => b.status === 'active');
      const reserve = listing.reserveCents;
      if (!standing) {
        await this.deps.db.closeListing(listing.id, 'no_bids');
        continue;
      }
      if (reserve !== null && standing.amountCents < reserve) {
        await this.deps.db.markBidStatus(standing.id, 'outbid');
        await this.deps.db.setBondState(standing.id, ['held'], 'refund_due');
        await this.deps.db.closeListing(listing.id, 'reserve_not_met');
        continue;
      }
      await this.deps.db.markBidStatus(standing.id, 'won');
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
      });
      // Either way the listing leaves 'ending': a claimed row that stays there
      // is unreachable forever (claimDueListings only selects 'active'), which
      // would strand the escrowed copy and the winner's bond with no
      // reconciliation path. A pre-existing live settlement (a buy-now already
      // confirming) is the benign case and also becomes 'settling'.
      await this.deps.db.markListingSettling(listing.id);
      void settlement;
    }
    return due.length;
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
      const live = await this.deps.db.liveSettlementForListing(listing.id);
      if (live) continue; // genuinely settling; leave it alone
      await this.deps.db.reopenListing(listing.id);
      reopened++;
    }
    return reopened;
  }

  private async expireOverdueSettlements(nowMs: number): Promise<number> {
    const overdue = await this.deps.db.overdueSettlements(this.cfg.realm, nowMs, SWEEP_BATCH);
    for (const settlement of overdue) {
      const moved = await this.deps.db.transitionSettlement(
        settlement.id,
        ['offered', 'failed'],
        'expired',
        'window_elapsed',
      );
      if (!moved) continue;
      const listing = await this.deps.db.listingById(this.cfg.realm, settlement.listingId);
      if (!listing) continue;
      if (settlement.bidId !== null) {
        // The close-time winner defaulted: forfeit the held bond, strike them.
        await this.deps.db.markBidStatus(settlement.bidId, 'defaulted');
        await this.deps.db.setBondState(settlement.bidId, ['held'], 'forfeit_due');
        const strikes = await this.deps.db.strikeInfo(settlement.buyerAccount);
        const count = (strikes?.strikes ?? 0) + 1;
        const suspension = strikeSuspensionMs(count);
        await this.deps.db.addStrike(
          settlement.buyerAccount,
          suspension > 0 ? nowMs + suspension : null,
        );
      } else {
        // An abandoned buy-now. On a PUBLIC listing that costs nobody anything:
        // the buyer committed to nothing, the lock clears and the listing simply
        // resumes for the next person, so no strike is warranted.
        //
        // A DIRECTED sale is the opposite case and takes one. Its buyer accepted
        // a named offer, and that acceptance is what pulled a specific player's
        // item out of their bags into escrow; walking away leaves that seller
        // holding an unsellable listing they have to notice and cancel. This is
        // the requester's rule that strikes apply to p2p non-payment once both
        // parties have accepted, and acceptance is exactly the moment escrow
        // happened. There is no bond to forfeit here (a directed sale carries
        // none), so the strike is the only consequence available.
        await this.deps.db.clearBuyNowLock(listing.id);
        if (listing.directedBuyerAccount !== null) {
          const strikes = await this.deps.db.strikeInfo(settlement.buyerAccount);
          const count = (strikes?.strikes ?? 0) + 1;
          const suspension = strikeSuspensionMs(count);
          await this.deps.db.addStrike(
            settlement.buyerAccount,
            suspension > 0 ? nowMs + suspension : null,
          );
        }
        continue;
      }
      // Cascade to the next eligible bidder when the seller opted in.
      if (listing.offerNext) {
        const priorWinners = (await this.deps.db.bidsForListing(listing.id))
          .filter((b) => b.status === 'won' || b.status === 'defaulted')
          .map((b) => b.account);
        const next = await this.deps.db.promoteNextBidder(
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
          await this.deps.db.insertSettlement({
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
          });
          continue;
        }
      }
      await this.deps.db.closeListing(listing.id, 'unsettled');
    }
    return overdue.length;
  }

  private async pollConfirmingSettlements(): Promise<number> {
    const confirming = await this.deps.db.confirmingSettlements(this.cfg.realm, SWEEP_BATCH);
    for (const settlement of confirming) {
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
    }
    return confirming.length;
  }

  private async deliverConfirmedSettlements(): Promise<number> {
    const claimed = await this.deps.db.claimDeliverableSettlements(this.cfg.realm, SWEEP_BATCH);
    for (const settlement of claimed) await this.deliverOne(settlement);
    return claimed.length;
  }

  /** Crash recovery: rows stuck in 'delivering' resume here; the custody
   *  book-once dedupe makes re-running the whole arm safe. */
  private async reconcileDelivering(): Promise<number> {
    const stuck = await this.deps.db.deliveringSettlements(this.cfg.realm, SWEEP_BATCH);
    for (const settlement of stuck) await this.deliverOne(settlement);
    return stuck.length;
  }

  /**
   * Book a custody parcel exactly once, with the claim in POSTGRES rather than
   * in the mail blob: the blob's own marker is advisory (a player can delete an
   * emptied letter, and an older binary's loader strips the field), so it can
   * never be the authority. On a booking failure the claim is released so the
   * next pass retries; a crash between claim and book leaves the claim unbooked,
   * which holds the item and shows up in the unbooked-claims read rather than
   * duplicating it.
   */
  private async bookCustodyOnce(
    recipient: { key: string; name: string },
    letter: 'delivery' | 'return' | 'sold_notice',
    items: InvSlot[],
    custodyRef: string,
  ): Promise<boolean> {
    const fresh = await this.deps.db.claimCustodyRef(this.cfg.realm, custodyRef);
    if (!fresh) return true; // already booked (or being booked) by a prior pass
    try {
      await this.deps.custody.persistMailParcel(recipient, letter, items, custodyRef);
    } catch (err) {
      await this.deps.db.unclaimCustodyRef(custodyRef).catch(() => {});
      throw err;
    }
    await this.deps.db.markCustodyRefBooked(custodyRef);
    return true;
  }

  /**
   * Put a directed sale's item straight into the buyer's bags.
   *
   * Rides the SAME custodyRef as the mail parcel would, deliberately: the claim
   * is the one key that decides an item is delivered, so hand-off and mail are
   * mutually exclusive by construction and no sequence of retries can do both.
   *
   * Returns false for every reason a hand-off cannot complete, and leaves the
   * ref unclaimed when it does, so the caller's mail fallback can claim it. The
   * ORDER is claim, hand over, persist, mark: a crash before the mark leaves an
   * unbooked claim, which is the existing "held, visible to ops" state rather
   * than a duplicate.
   */
  private async handToBuyer(
    settlement: WocSettlementRow,
    item: InvSlot,
    target: { characterId: number; name: string },
    custodyRef: string,
  ): Promise<boolean> {
    const fresh = await this.deps.db.claimCustodyRef(this.cfg.realm, custodyRef);
    // Already claimed means a prior pass delivered it (by either route). Report
    // handled so the caller does not mail a second copy.
    if (!fresh) return true;
    const granted = this.deps.custody.grantCopy(settlement.buyerAccount, target.characterId, item);
    if (!granted.ok) {
      await this.deps.db.unclaimCustodyRef(custodyRef).catch(() => {});
      return false;
    }
    let saved = false;
    try {
      saved = await this.deps.db.saveDeliveredCharacter(granted.save);
    } catch {
      saved = false;
    }
    if (!saved) {
      // The lease fence rejected: another process owns this character now, and
      // this one's session is a zombie whose state can never be persisted. The
      // in-memory grant therefore evaporates with it, so mailing the copy is
      // safe and is the only route that still reaches the player.
      await this.deps.db.unclaimCustodyRef(custodyRef).catch(() => {});
      return false;
    }
    await this.deps.db.markCustodyRefBooked(custodyRef);
    return true;
  }

  private async deliverOne(settlement: WocSettlementRow): Promise<void> {
    const listing = await this.deps.db.listingById(this.cfg.realm, settlement.listingId);
    if (!listing) return;
    const target = await this.deps.db.deliveryTarget(
      this.cfg.realm,
      settlement.buyerAccount,
      settlement.buyerCharacter,
    );
    // No character to deliver to right now: hold in 'delivering'; a later
    // pass retries (the account may recreate a character; admins can act).
    if (!target) return;
    const custodyRef = settlementCustodyRef(settlement.id);
    // A DIRECTED sale is a hand-to-hand deal: the two players agreed in a trade
    // window, so the goods belong in the buyer's bags, not in their mailbox.
    // An Exchange sale is anonymous and asynchronous, and keeps the parcel.
    //
    // Mail remains the fallback for BOTH, and every reason to fall back is
    // ordinary rather than exceptional (logged out, bags full, lease lost).
    const handed =
      listing.directedBuyerAccount !== null &&
      (await this.handToBuyer(settlement, listing.item, target, custodyRef));
    if (!handed) {
      await this.bookCustodyOnce(
        { key: String(target.characterId), name: target.name },
        'delivery',
        [listing.item],
        custodyRef,
      );
    }
    const advanced = await this.deps.db.transitionSettlement(
      settlement.id,
      ['delivering'],
      'delivered',
    );
    if (!advanced) return;
    await this.deps.db.insertSale({
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
    });
    await this.deps.db.closeListing(listing.id, 'sold');
    await this.deps.db.markItemDisposed(listing.id);
    // The winner's held bond flows home after a completed settlement.
    if (settlement.bidId !== null) {
      await this.deps.db.setBondState(settlement.bidId, ['held'], 'refund_due');
    }
    // A buy-now can land over standing auction bids: every still-open bid is
    // cancelled and its held bond returned (proposal section 9).
    const open = await this.deps.db.cancelOpenBidsForListing(listing.id);
    for (const bid of open) {
      if (bid.bondState === 'held') {
        await this.deps.db.setBondState(bid.id, ['held'], 'refund_due');
      }
    }
    // Best-effort seller notice (no attachment, book-once).
    const seller = await this.deps.db.deliveryTarget(
      this.cfg.realm,
      listing.sellerAccount,
      listing.sellerCharacter,
    );
    if (seller) {
      await this.bookCustodyOnce(
        { key: String(seller.characterId), name: seller.name },
        'sold_notice',
        [],
        listingSoldNoticeCustodyRef(listing.id),
      ).catch(() => {});
    }
  }

  private async returnListingItem(listing: WocListingRow): Promise<void> {
    const target = await this.deps.db.deliveryTarget(
      this.cfg.realm,
      listing.sellerAccount,
      listing.sellerCharacter,
    );
    if (!target) return;
    await this.bookCustodyOnce(
      { key: String(target.characterId), name: target.name },
      'return',
      [listing.item],
      listingReturnCustodyRef(listing.id),
    );
    await this.deps.db.markItemDisposed(listing.id);
  }

  private async returnUndisposedItems(): Promise<number> {
    const backlog = await this.deps.db.undisposedClosedListings(this.cfg.realm, SWEEP_BATCH);
    for (const listing of backlog) {
      if (listing.resolution === 'sold') continue;
      await this.returnListingItem(listing).catch(() => {});
    }
    return backlog.length;
  }

  private async processDueBonds(): Promise<number> {
    const due = await this.deps.db.bondsDue(this.cfg.realm, SWEEP_BATCH);
    for (const bid of due) {
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
    }
    return due.length;
  }
}
