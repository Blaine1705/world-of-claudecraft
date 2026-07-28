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
  WOC_MARKET_MAX_ACTIVE_LISTINGS,
  WOC_MARKET_RESTRICTED_POLICY,
  WOC_MARKET_SETTLEMENT_WINDOW_SECONDS,
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
  browseListings(
    realm: string,
    q: WocBrowseQuery,
  ): Promise<{ rows: WocListingRow[]; total: number }>;
  listingsBySeller(realm: string, account: number): Promise<WocListingRow[]>;
  countActiveBySeller(realm: string, account: number): Promise<number>;
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
  markItemDisposed(id: number): Promise<void>;
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
  bidById(id: number): Promise<WocBidRow | null>;
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
  lapsePendingBids(nowMs: number, limit: number): Promise<number>;
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
  setSettlementQuote(id: number, reference: string, expiresAtMs: number): Promise<boolean>;
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

export interface WocEstimate {
  available: boolean;
  usdCents: number;
  amount: WocQuoteLeg | null;
  asOfMs: number | null;
}

export interface WocQuoteIntent {
  ok: boolean;
  reference: string | null;
  /** The full transfer the buyer signs (service-built transaction). */
  transactionBase64: string | null;
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

/** The one bridge into the live Sim (game.ts wiring). Every method is
 *  synchronous-in-memory except persistMailParcel, which books at most once
 *  by custodyRef and then persists the realm mail blob. */
export interface WocMarketCustody {
  extractCopy(accountId: number, characterId: number, ref: ExtractRef): WocCustodyExtract;
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
  totpThresholdCents: number;
}

export interface WocMarketDeps {
  db: WocMarketDb;
  economy: WocMarketEconomy;
  custody: WocMarketCustody;
  verifiedWallet(account: number): Promise<string | null>;
  balanceTokens(pubkey: string): Promise<number | null>;
  totpEnabled(account: number): Promise<boolean>;
  totpVerify(account: number, code: string): Promise<boolean>;
  config: WocMarketConfig;
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Service results
// ---------------------------------------------------------------------------

export type WocMarketRefusal =
  | 'disabled'
  | 'market_paused' // economy service down or oracle unhealthy
  | 'wallet_required'
  | 'terms_required'
  | 'totp_required'
  | 'totp_invalid'
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
  | ExtractRefusal
  | WocEligibilityRefusal
  | ListingParamsRefusal;

export type Refused = { ok: false; reason: WocMarketRefusal };
const refuse = (reason: WocMarketRefusal): Refused => ({ ok: false, reason });

// Sweep pass budgets: every arm is bounded per pass so one huge backlog can
// never starve the others; the next pass continues where this one stopped.
const SWEEP_BATCH = 25;

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
    totpThresholdCents: number;
    maxActiveListings: number;
  }> {
    const price = this.cfg.enabled
      ? await this.deps.economy.price()
      : { available: false, healthy: false, reason: 'disabled', tokensPerUsd: null, asOfMs: null };
    return {
      enabled: this.cfg.enabled,
      price,
      totpThresholdCents: this.cfg.totpThresholdCents,
      maxActiveListings: WOC_MARKET_MAX_ACTIVE_LISTINGS,
    };
  }

  async browse(q: WocBrowseQuery): Promise<{ rows: WocListingRow[]; total: number }> {
    if (!this.cfg.enabled) return { rows: [], total: 0 };
    return this.deps.db.browseListings(this.cfg.realm, q);
  }

  async listingDetail(
    id: number,
  ): Promise<{ listing: WocListingRow; estimate: WocEstimate | null } | null> {
    if (!this.cfg.enabled) return null;
    const listing = await this.deps.db.listingById(this.cfg.realm, id);
    if (!listing) return null;
    const estimateCents = listing.currentBidCents ?? listing.startCents;
    const estimate = await this.deps.economy.estimate(estimateCents).catch(() => null);
    return { listing, estimate };
  }

  async estimate(usdCents: number): Promise<WocEstimate> {
    if (!this.cfg.enabled || !Number.isInteger(usdCents) || usdCents <= 0) {
      return { available: false, usdCents, amount: null, asOfMs: null };
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

  private async guardTotp(
    account: number,
    amountCents: number,
    code: string | null,
  ): Promise<Refused | null> {
    if (amountCents < this.cfg.totpThresholdCents) return null;
    const enabled = await this.deps.totpEnabled(account);
    // Above the threshold, 2FA is REQUIRED: an unenrolled account is told to
    // enroll (the PRD's "2FA for bids over a configurable threshold").
    if (!enabled) return refuse('totp_required');
    if (!code) return refuse('totp_required');
    return (await this.deps.totpVerify(account, code)) ? null : refuse('totp_invalid');
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
    const gate = await this.guardEnabledHealthy();
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
    const active = await this.deps.db.countActiveBySeller(this.cfg.realm, args.account);
    if (active >= WOC_MARKET_MAX_ACTIVE_LISTINGS) return refuse('cap_reached');

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
    totpCode: string | null;
    acceptTerms: boolean;
  }): Promise<{ ok: true; bid: WocBidRow; bond: WocQuoteIntent } | Refused> {
    const gate =
      (await this.guardEnabledHealthy()) ??
      (await this.guardSuspended(args.account)) ??
      (await this.guardTotp(args.account, args.amountCents, args.totpCode)) ??
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
  ): Promise<{ ok: true; standing: boolean } | Refused> {
    if (!this.cfg.enabled) return refuse('disabled');
    const bid = await this.deps.db.bidById(bidId);
    if (!bid) return refuse('not_found');
    if (bid.account !== account) return refuse('not_yours');
    if (bid.status !== 'pending_bond') return refuse('not_pending');
    if (bid.bondReference === null) return refuse('quote_unavailable');
    const confirmed = await this.deps.economy.confirm(bid.bondReference, signature);
    if (confirmed.pending) return refuse('confirm_failed');
    if (!confirmed.settled) return refuse('confirm_failed');
    await this.deps.db.markBondHeld(bid.id);
    const activated = await this.deps.db.activateBid(bid.id, this.now());
    // A racer confirmed a higher bid first: this bond flips straight to
    // refund_due inside activateBid's superseded arm.
    return { ok: true, standing: activated === 'activated' };
  }

  // -------------------------------------------------------------------------
  // Buy-now
  // -------------------------------------------------------------------------

  async buyNow(args: {
    account: number;
    characterId: number;
    listingId: number;
    totpCode: string | null;
    acceptTerms: boolean;
  }): Promise<{ ok: true; settlement: WocSettlementRow; quote: WocQuoteIntent } | Refused> {
    const nowMs = this.now();
    const listingPeek = await this.deps.db.listingById(this.cfg.realm, args.listingId);
    if (!listingPeek) return refuse('not_found');
    if (listingPeek.buyNowCents === null) return refuse('no_buy_now');
    const gate =
      (await this.guardEnabledHealthy()) ??
      (await this.guardSuspended(args.account)) ??
      (await this.guardTotp(args.account, listingPeek.buyNowCents, args.totpCode)) ??
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

  async sweepPass(): Promise<void> {
    if (!this.cfg.enabled) return;
    const nowMs = this.now();
    await this.deps.db.lapsePendingBids(
      nowMs - WOC_MARKET_BOND_PENDING_TTL_SECONDS * 1000,
      SWEEP_BATCH,
    );
    await this.closeDueAuctions(nowMs);
    await this.expireOverdueSettlements(nowMs);
    await this.pollConfirmingSettlements();
    await this.deliverConfirmedSettlements();
    await this.reconcileDelivering();
    await this.returnUndisposedItems();
    await this.processDueBonds();
  }

  private async closeDueAuctions(nowMs: number): Promise<void> {
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
      if (settlement !== 'live_settlement_exists') {
        await this.deps.db.markListingSettling(listing.id);
      }
    }
  }

  private async expireOverdueSettlements(nowMs: number): Promise<void> {
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
        // An abandoned buy-now: unlock and resume the auction untouched.
        await this.deps.db.clearBuyNowLock(listing.id);
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
  }

  private async pollConfirmingSettlements(): Promise<void> {
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
  }

  private async deliverConfirmedSettlements(): Promise<void> {
    const claimed = await this.deps.db.claimDeliverableSettlements(this.cfg.realm, SWEEP_BATCH);
    for (const settlement of claimed) await this.deliverOne(settlement);
  }

  /** Crash recovery: rows stuck in 'delivering' resume here; the custody
   *  book-once dedupe makes re-running the whole arm safe. */
  private async reconcileDelivering(): Promise<void> {
    const stuck = await this.deps.db.deliveringSettlements(this.cfg.realm, SWEEP_BATCH);
    for (const settlement of stuck) await this.deliverOne(settlement);
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
    await this.deps.custody.persistMailParcel(
      { key: String(target.characterId), name: target.name },
      'delivery',
      [listing.item],
      settlementCustodyRef(settlement.id),
    );
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
      amountBase: null,
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
      await this.deps.custody
        .persistMailParcel(
          { key: String(seller.characterId), name: seller.name },
          'sold_notice',
          [],
          listingSoldNoticeCustodyRef(listing.id),
        )
        .catch(() => {});
    }
  }

  private async returnListingItem(listing: WocListingRow): Promise<void> {
    const target = await this.deps.db.deliveryTarget(
      this.cfg.realm,
      listing.sellerAccount,
      listing.sellerCharacter,
    );
    if (!target) return;
    await this.deps.custody.persistMailParcel(
      { key: String(target.characterId), name: target.name },
      'return',
      [listing.item],
      listingReturnCustodyRef(listing.id),
    );
    await this.deps.db.markItemDisposed(listing.id);
  }

  private async returnUndisposedItems(): Promise<void> {
    const backlog = await this.deps.db.undisposedClosedListings(this.cfg.realm, SWEEP_BATCH);
    for (const listing of backlog) {
      if (listing.resolution === 'sold') continue;
      await this.returnListingItem(listing).catch(() => {});
    }
  }

  private async processDueBonds(): Promise<void> {
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
  }
}
