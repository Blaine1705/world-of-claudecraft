// In-memory WocMarketDb for the $WOC Exchange service tests: a faithful
// stand-in for server/woc_market_db.ts (PgWocMarketDb) with zero runtime pg.
// Every method mirrors the SQL semantics, including the check ORDER inside the
// guarded transactions (insertPendingBid's refusal ladder, activateBid's
// supersede arms, claimBuyNowLock's diagnosis order, the one-live-settlement
// rule, addStrike's GREATEST-of-epochs quirk on the conflict arm), so the
// service under test exercises the same decision surface it sees in
// production. Rows are deep-copied (structuredClone) on the way in AND out, so
// a test can never mutate internal state by aliasing a returned row.
//
// Test hooks: `failNextEscrow` forces the next escrowInsertListing to refuse
// (the compensation/restore paths); `escrowSaves` records every character
// save the escrow edge received; `failNextMarkBooked` fails the next
// markCustodyRefBooked (the written-flag twins); `failNextDeliveredSave`
// forces the next saveDeliveredCharacterBooked outcome ('lease_lost',
// 'throw', or 'throw_after_commit') with `deliveredSaves` recording every
// save it received; `failNextFinalize` forces the next finalize to report
// contention.

import type {
  CharacterSaveArgs,
  NewWocListing,
  WocBidRow,
  WocBondState,
  WocBrowseQuery,
  WocCustodyRefState,
  WocDirectedOfferRow,
  WocDirectedOfferStatus,
  WocListingResolution,
  WocListingRow,
  WocMarketDb,
  WocOpsP2pTradeRow,
  WocSaleRow,
  WocSettlementRow,
  WocStrikeRow,
  WocStuckCustodyClasses,
} from '../../../server/woc_market';
import type { WocBidStatus, WocSettlementState } from '../../../server/woc_market_rules';
import {
  WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS,
  WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR,
  WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS,
  WOC_MARKET_MAX_ACTIVE_LISTINGS,
} from '../../../server/woc_market_rules';
import type { ExtractRef } from '../../../src/sim/inventory_extract';

export interface FakeWocMarketCharacter {
  characterId: number;
  accountId: number;
  name: string;
  realm: string;
}

// The realm column exists on the bids/settlements TABLES but not on the row
// shapes woc_market.ts consumes; the fake carries it internally and strips it
// on the way out, like the Pg column list does.
type BidRec = WocBidRow & { realm: string };
type SettlementRec = WocSettlementRow & { realm: string };

// Mirrors the woc_market_settlements_open2 partial unique index: 'delivered'
// stays open until the listing row closes, so liveness checks keep seeing it,
// and 'review' (an over-aged confirming parked for the operator) stays open
// because the payment may have landed. Exported so the DB-free structural pin
// (woc_market_directed_sql.test.ts) can hold this list and the shipped index
// predicate to the same literals.
export const OPEN_SETTLEMENT_STATES: readonly WocSettlementState[] = [
  'offered',
  'confirming',
  'review',
  'confirmed',
  'delivering',
  'delivered',
];

export class FakeWocMarketDb implements WocMarketDb {
  /** Force the NEXT escrowInsertListing to refuse (consumed on use). */
  failNextEscrow: 'lease_lost' | 'cap_reached' | null = null;
  /** The buy-now abandon ledger (claim cooldowns), the Pg table's mirror. */
  readonly buyNowAbandons: {
    realm: string;
    listingId: number;
    account: number;
    lockExpiresMs: number;
  }[] = [];
  /** Every character save escrowInsertListing received, in order. */
  readonly escrowSaves: CharacterSaveArgs[] = [];
  /** The durable book-once ledger (woc_market_custody_claims), exposed so
   *  tests can assert claim/book/grant-intent lifecycles directly. */
  readonly custodyClaims = new Map<
    string,
    {
      realm: string;
      claimedAtMs: number;
      bookedAtMs: number | null;
      grantCharacterId: number | null;
      mailIntentAtMs: number | null;
    }
  >();

  private readonly characters: FakeWocMarketCharacter[];
  private readonly now: () => number;

  private readonly listings = new Map<number, WocListingRow>();
  private readonly bids = new Map<number, BidRec>();
  private readonly settlements = new Map<number, SettlementRec>();
  private readonly sales = new Map<number, WocSaleRow>();
  private readonly strikes = new Map<number, WocStrikeRow>();
  private readonly terms = new Map<number, number>();

  // updated_at mirrors (the readout's age signals; stamped on every real
  // mutation, exactly where the Pg UPDATEs set updated_at = now()).
  private readonly listingTouchMs = new Map<number, number>();
  private readonly settlementTouchMs = new Map<number, number>();
  // sweep_parked_at mirrors: the rotation column the park writes. Kept apart
  // from the touch maps so a parked row cycles to the batch tail WITHOUT
  // refreshing its age (the Pg split this fake must model faithfully).
  private readonly listingParkedMs = new Map<number, number>();
  private readonly settlementParkedMs = new Map<number, number>();

  private nextListingId = 1;
  private nextBidId = 1;
  private nextSettlementId = 1;
  private nextSaleId = 1;

  constructor(seed: { characters: FakeWocMarketCharacter[]; now?: () => number }) {
    this.characters = seed.characters.map((c) => ({ ...c }));
    this.now = seed.now ?? (() => 0);
  }

  // -------------------------------------------------------------------------
  // Internal copy/order helpers
  // -------------------------------------------------------------------------

  private listingOut(row: WocListingRow): WocListingRow {
    return structuredClone(row);
  }

  private bidOut(rec: BidRec): WocBidRow {
    const copy = structuredClone(rec) as WocBidRow & { realm?: string };
    delete copy.realm;
    return copy;
  }

  private settlementOut(rec: SettlementRec): WocSettlementRow {
    const copy = structuredClone(rec) as WocSettlementRow & { realm?: string };
    delete copy.realm;
    return copy;
  }

  private touchListing(id: number): void {
    this.listingTouchMs.set(id, this.now());
  }

  private touchSettlement(id: number): void {
    this.settlementTouchMs.set(id, this.now());
  }

  private byTouch(map: Map<number, number>) {
    return (a: { id: number }, b: { id: number }): number =>
      (map.get(a.id) ?? 0) - (map.get(b.id) ?? 0) || a.id - b.id;
  }

  /** The batch order the parked-row rotation feeds: COALESCE(sweep_parked_at,
   *  updated_at), mirroring PARK_ROTATION_ORDER in the Pg module. */
  private byRotation(parked: Map<number, number>, touch: Map<number, number>) {
    return (a: { id: number }, b: { id: number }): number =>
      (parked.get(a.id) ?? touch.get(a.id) ?? 0) - (parked.get(b.id) ?? touch.get(b.id) ?? 0) ||
      a.id - b.id;
  }

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  async escrowInsertListing(
    save: CharacterSaveArgs,
    listing: NewWocListing,
  ): Promise<{ ok: true; id: number } | { ok: false; reason: 'lease_lost' | 'cap_reached' }> {
    // The Pg transaction runs the character save first, then the cap check;
    // the fake records the save it received either way (a refused escrow rolls
    // the save back in Pg, but the SAVE ARGS still crossed the edge).
    this.escrowSaves.push(structuredClone(save));
    if (this.failNextEscrow !== null) {
      const reason = this.failNextEscrow;
      this.failNextEscrow = null;
      return { ok: false, reason };
    }
    let active = 0;
    for (const row of this.listings.values()) {
      if (
        row.realm === listing.realm &&
        row.sellerAccount === listing.sellerAccount &&
        row.status !== 'closed' &&
        row.directedBuyerAccount === null
      ) {
        active += 1;
      }
    }
    // Public-listing-only in both directions, mirroring the real transaction.
    if (listing.params.directedBuyerAccount === null && active >= WOC_MARKET_MAX_ACTIVE_LISTINGS) {
      return { ok: false, reason: 'cap_reached' };
    }
    const id = this.nextListingId++;
    const row: WocListingRow = {
      id,
      realm: listing.realm,
      directedBuyerAccount: listing.params.directedBuyerAccount,
      sellerAccount: listing.sellerAccount,
      sellerCharacter: listing.sellerCharacter,
      sellerName: listing.sellerName,
      sellerWallet: listing.sellerWallet,
      item: structuredClone(listing.item),
      itemId: listing.itemId,
      quality: listing.quality,
      format: listing.params.format,
      startCents: listing.params.startCents,
      reserveCents: listing.params.reserveCents,
      buyNowCents: listing.params.buyNowCents,
      offerNext: listing.params.offerNext,
      status: 'active',
      resolution: null,
      itemDisposed: false,
      currentBidCents: null,
      currentBidId: null,
      endsAtMs: listing.endsAtMs,
      baseEndsAtMs: listing.endsAtMs,
      buyNowLockAccount: null,
      buyNowLockExpiresMs: null,
      createdAtMs: this.now(),
      cancelRequestedAtMs: null,
    };
    this.listings.set(id, row);
    this.touchListing(id);
    return { ok: true, id };
  }

  async listingById(realm: string, id: number): Promise<WocListingRow | null> {
    const row = this.listings.get(id);
    return row && row.realm === realm ? this.listingOut(row) : null;
  }

  async browseListings(
    realm: string,
    q: WocBrowseQuery,
  ): Promise<{ rows: WocListingRow[]; hasMore: boolean }> {
    const itemIds = q.itemIds && q.itemIds.length > 0 ? q.itemIds.slice(0, 50) : null;
    const matched = [...this.listings.values()].filter(
      (row) =>
        row.realm === realm &&
        (row.status === 'active' || row.status === 'settling' || row.status === 'ending') &&
        // Mirrors the real query's unconditional exclusion. Without this the
        // fake would report a directed row as publicly browsable and the test
        // asserting it is hidden would pass against a fake that never hides it.
        row.directedBuyerAccount === null &&
        (q.quality === null || row.quality === q.quality) &&
        (q.format === null || row.format === q.format) &&
        (itemIds === null || itemIds.includes(row.itemId)),
    );
    const price = (row: WocListingRow): number => row.currentBidCents ?? row.startCents;
    matched.sort((a, b) => {
      if (q.sort === 'newest') return b.createdAtMs - a.createdAtMs || b.id - a.id;
      if (q.sort === 'price_asc') return price(a) - price(b) || a.id - b.id;
      if (q.sort === 'price_desc') return price(b) - price(a) || a.id - b.id;
      return a.endsAtMs - b.endsAtMs || a.id - b.id;
    });
    const pageSize = Math.min(Math.max(1, q.pageSize), 50);
    const offset = Math.max(0, q.page) * pageSize;
    // The Pg has-more PROBE mirrored: select one row past the page, report
    // hasMore when it existed, and slice the page back to pageSize.
    const probe = matched.slice(offset, offset + pageSize + 1);
    const hasMore = probe.length > pageSize;
    const rows = hasMore ? probe.slice(0, pageSize) : probe;
    return { rows: rows.map((r) => this.listingOut(r)), hasMore };
  }

  /** Mirrors the real predicates: public rows only, the created_at window
   *  INCLUSIVE at both ends, and status narrowed unless 'all'. */
  async opsListings(q: {
    realm: string;
    status: 'active' | 'ending' | 'settling' | 'closed' | 'all';
    fromMs: number;
    toMs: number;
    page: number;
    pageSize: number;
  }): Promise<{ rows: WocListingRow[]; hasMore: boolean }> {
    const matched = [...this.listings.values()]
      .filter(
        (r) =>
          r.realm === q.realm &&
          r.directedBuyerAccount === null &&
          r.createdAtMs >= q.fromMs &&
          r.createdAtMs <= q.toMs &&
          (q.status === 'all' || r.status === q.status),
      )
      .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id - a.id);
    const pageSize = Math.min(Math.max(1, q.pageSize), 200);
    const offset = Math.max(0, q.page) * pageSize;
    const page = matched.slice(offset, offset + pageSize + 1);
    const hasMore = page.length > pageSize;
    return {
      rows: (hasMore ? page.slice(0, pageSize) : page).map((r) => this.listingOut(r)),
      hasMore,
    };
  }

  async opsP2pTrades(q: {
    realm: string;
    status: WocDirectedOfferStatus | 'all';
    fromMs: number;
    toMs: number;
    page: number;
    pageSize: number;
  }): Promise<{ rows: WocOpsP2pTradeRow[]; hasMore: boolean }> {
    const matched = [...this.offers.values()]
      .filter(
        (o) =>
          o.realm === q.realm &&
          o.createdAtMs >= q.fromMs &&
          o.createdAtMs <= q.toMs &&
          (q.status === 'all' || o.status === q.status),
      )
      .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id - a.id);
    const pageSize = Math.min(Math.max(1, q.pageSize), 200);
    const offset = Math.max(0, q.page) * pageSize;
    const page = matched.slice(offset, offset + pageSize + 1);
    const hasMore = page.length > pageSize;
    const settlementFor = (listingId: number | null) =>
      listingId === null
        ? null
        : ([...this.settlements.values()]
            .filter((s) => s.listingId === listingId)
            .sort((a, b) => b.id - a.id)[0] ?? null);
    return {
      rows: (hasMore ? page.slice(0, pageSize) : page).map((o) => {
        const s = settlementFor(o.listingId);
        return {
          ...structuredClone(o),
          settlementState: s?.state ?? null,
          settledAmountBase: s?.settledAmountBase ?? null,
          txSignature: s?.txSignature ?? null,
        };
      }),
      hasMore,
    };
  }

  async listingsBySeller(realm: string, account: number): Promise<WocListingRow[]> {
    return [...this.listings.values()]
      .filter((row) => row.realm === realm && row.sellerAccount === account)
      .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id - a.id)
      .slice(0, 50)
      .map((r) => this.listingOut(r));
  }

  // --- Directed p2p offers ---------------------------------------------------
  // The real table's semantics that the service depends on: a compare-and-set
  // resolve (so a double accept cannot escrow twice) and a reopen narrowed to an
  // accepted offer with no listing.
  readonly offers = new Map<number, WocDirectedOfferRow>();
  private nextOfferId = 1;

  async insertDirectedOffer(offer: {
    realm: string;
    sellerAccount: number;
    sellerCharacter: number;
    sellerName: string;
    buyerAccount: number;
    buyerName: string;
    itemRef: ExtractRef;
    itemId: string;
    usdCents: number;
    expiresAtMs: number;
  }): Promise<WocDirectedOfferRow> {
    const row: WocDirectedOfferRow = {
      id: this.nextOfferId++,
      ...offer,
      itemRef: null,
      itemId: null,
      status: 'pending',
      listingId: null,
      createdAtMs: 0,
      buyerAccepted: false,
      sellerAccepted: false,
      listingStatus: null,
      listingResolution: null,
      settlementState: null,
    };
    this.offers.set(row.id, row);
    return row;
  }

  async directedOfferById(realm: string, id: number): Promise<WocDirectedOfferRow | null> {
    const row = this.offers.get(id);
    return row && row.realm === realm ? row : null;
  }

  async directedOffersForAccount(realm: string, account: number): Promise<WocDirectedOfferRow[]> {
    return [...this.offers.values()].filter(
      (o) =>
        o.realm === realm &&
        o.status === 'pending' &&
        (o.buyerAccount === account || o.sellerAccount === account),
    );
  }

  async resolveDirectedOffer(
    realm: string,
    id: number,
    to: Exclude<WocDirectedOfferStatus, 'pending'>,
    opts: { listingId?: number } = {},
  ): Promise<WocDirectedOfferRow | null> {
    const row = this.offers.get(id);
    if (!row || row.realm !== realm) return null;
    // The compare-and-set. Without this the fake would let a second accept
    // through and the double-escrow test would pass against a fake that cannot
    // reproduce the race it is meant to prove is closed.
    if (row.status !== 'pending') {
      // An accepted offer being stamped with its listing id is the one legal
      // non-pending write (the service's second call after createListing).
      if (to === 'accepted' && row.status === 'accepted' && opts.listingId !== undefined) {
        row.listingId = opts.listingId;
        return row;
      }
      return null;
    }
    row.status = to;
    if (opts.listingId !== undefined) row.listingId = opts.listingId;
    return row;
  }

  async characterByName(
    realm: string,
    name: string,
  ): Promise<{ characterId: number; accountId: number; name: string } | null> {
    const c = this.characters.find((x) => x.name === name && x.realm === realm);
    return c ? { characterId: c.characterId, accountId: c.accountId, name: c.name } : null;
  }

  async acceptDirectedOfferSide(
    realm: string,
    id: number,
    side: 'buyer' | 'seller',
    itemRef: ExtractRef | null,
  ): Promise<WocDirectedOfferRow | null> {
    const row = this.offers.get(id);
    // Narrowed to pending, mirroring the real UPDATE: a resolved offer cannot
    // gain an acceptance, which is what stops a late click reviving one.
    if (!row || row.realm !== realm || row.status !== 'pending') return null;
    if (side === 'buyer') row.buyerAccepted = true;
    else row.sellerAccepted = true;
    if (itemRef !== null) {
      row.itemRef = itemRef;
      row.itemId = itemRef.itemId;
    }
    return { ...row };
  }

  async reopenDirectedOffer(realm: string, id: number): Promise<void> {
    const row = this.offers.get(id);
    if (row && row.realm === realm && row.status === 'accepted' && row.listingId === null) {
      row.status = 'pending';
    }
  }

  async expireDueDirectedOffers(realm: string, nowMs: number, limit: number): Promise<number> {
    let n = 0;
    for (const row of this.offers.values()) {
      if (n >= limit) break;
      if (row.realm === realm && row.status === 'pending' && row.expiresAtMs <= nowMs) {
        row.status = 'expired';
        n += 1;
      }
    }
    return n;
  }

  async countActiveBySeller(realm: string, account: number): Promise<number> {
    let n = 0;
    for (const row of this.listings.values()) {
      // Directed offers are exempt from the cap (see countActiveBySeller in
      // server/woc_market_db.ts); the fake must exempt them too.
      if (
        row.realm === realm &&
        row.sellerAccount === account &&
        row.status !== 'closed' &&
        row.directedBuyerAccount === null
      ) {
        n += 1;
      }
    }
    return n;
  }

  async cancelListingIfUnbid(
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
  > {
    const row = this.listings.get(id);
    if (!row || row.realm !== realm) return 'not_found';
    if (row.sellerAccount !== sellerAccount) return 'not_yours';
    if (row.status !== 'active') return 'not_active';
    for (const bid of this.bids.values()) {
      if (bid.listingId === id && (bid.status === 'pending_bond' || bid.status === 'active')) {
        return 'has_bids';
      }
    }
    if (
      row.buyNowLockAccount !== null &&
      row.buyNowLockExpiresMs !== null &&
      row.buyNowLockExpiresMs > nowMs
    ) {
      // Mirrors the Pg cancel-intent branch: a PAID window (any settlement
      // past 'offered') refuses; an unpaid one stamps and reports pending.
      for (const s of this.settlements.values()) {
        if (
          s.listingId === id &&
          OPEN_SETTLEMENT_STATES.includes(s.state) &&
          s.state !== 'offered'
        ) {
          return 'settlement_live';
        }
      }
      row.cancelRequestedAtMs = row.cancelRequestedAtMs ?? nowMs;
      this.touchListing(id);
      return 'cancel_pending';
    }
    // The Pg method expires 'failed' rows FIRST and rolls the expiry back via
    // TxAbort when the open check trips (its ordering exists for row-lock
    // serialization); single-threaded, check-then-expire is observably
    // identical because 'failed' is disjoint from the open set.
    for (const s of this.settlements.values()) {
      if (s.listingId === id && OPEN_SETTLEMENT_STATES.includes(s.state)) {
        return 'settlement_live';
      }
    }
    // A leftover 'failed' settlement is expired with the close, so its retry
    // arm cannot revive a payment against a cancelled listing.
    for (const s of this.settlements.values()) {
      if (s.listingId === id && s.state === 'failed') {
        s.state = 'expired';
        s.failReason = 'listing_cancelled';
        this.touchSettlement(s.id);
      }
    }
    row.status = 'closed';
    row.resolution = 'cancelled';
    this.touchListing(id);
    return this.listingOut(row);
  }

  async suspendListingIfSafe(
    realm: string,
    id: number,
    nowMs: number,
  ): Promise<
    WocListingRow | 'not_found' | 'not_active' | 'buy_now_pending' | 'settlement_live' | 'contended'
  > {
    const row = this.listings.get(id);
    if (!row || row.realm !== realm) return 'not_found';
    if (row.status === 'closed') return 'not_active';
    if (
      row.buyNowLockAccount !== null &&
      row.buyNowLockExpiresMs !== null &&
      row.buyNowLockExpiresMs > nowMs
    ) {
      return 'buy_now_pending';
    }
    // The blocking set DERIVES from the shared open list rather than
    // hand-copying it (a sixth open state must block here without a second
    // edit): everything open blocks except an expirable 'offered', and
    // 'offered' is only expirable while it holds NO live quote (a stamped,
    // unexpired quote means the buyer may already have broadcast payment).
    const expirableOffered = (s: SettlementRec): boolean =>
      s.state === 'offered' &&
      (s.quoteReference === null || s.quoteExpiresAtMs === null || s.quoteExpiresAtMs <= nowMs);
    for (const s of this.settlements.values()) {
      if (s.listingId === id && OPEN_SETTLEMENT_STATES.includes(s.state) && !expirableOffered(s)) {
        return 'settlement_live';
      }
    }
    for (const s of this.settlements.values()) {
      if (s.listingId === id && (expirableOffered(s) || s.state === 'failed')) {
        s.state = 'expired';
        s.failReason = 'listing_suspended';
        this.touchSettlement(s.id);
        // The Pg CTE releases the expired settlement's close-time WINNER in
        // the same statement: cancelled, held bond queued for refund (an
        // administrative expiry is not the buyer's fault; the deadline pass
        // is the one that defaults and forfeits).
        if (s.bidId !== null) {
          const winner = this.bids.get(s.bidId);
          if (winner && winner.status === 'won') {
            winner.status = 'cancelled';
            if (winner.bondState === 'held') winner.bondState = 'refund_due';
          }
        }
      }
    }
    for (const bid of this.bids.values()) {
      if (bid.listingId === id && (bid.status === 'pending_bond' || bid.status === 'active')) {
        // Mirrors the real teardown's paid-but-undecided carve-out: a signed,
        // unheld bond stays with the bond poll instead of being cancelled out
        // of the polling set.
        if (
          bid.status === 'pending_bond' &&
          bid.bondSignature !== null &&
          bid.bondState === 'pending'
        ) {
          continue;
        }
        bid.status = 'cancelled';
        if (bid.bondState === 'held') bid.bondState = 'refund_due';
      }
    }
    row.status = 'closed';
    row.resolution = 'suspended';
    this.touchListing(id);
    return this.listingOut(row);
  }

  async claimDueListings(realm: string, nowMs: number, limit: number): Promise<WocListingRow[]> {
    const due = [...this.listings.values()]
      .filter((row) => row.realm === realm && row.status === 'active' && row.endsAtMs <= nowMs)
      .sort((a, b) => a.endsAtMs - b.endsAtMs || a.id - b.id)
      .slice(0, limit);
    for (const row of due) {
      row.status = 'ending';
      this.touchListing(row.id);
    }
    return due.map((r) => this.listingOut(r));
  }

  async closeListing(id: number, resolution: WocListingResolution): Promise<void> {
    const row = this.listings.get(id);
    if (!row || row.status === 'closed') return;
    row.status = 'closed';
    row.resolution = resolution;
    this.touchListing(id);
  }

  async closeListingIfNoOpenSettlement(
    id: number,
    resolution: WocListingResolution,
  ): Promise<boolean> {
    const row = this.listings.get(id);
    if (!row || row.status === 'closed') return false;
    for (const s of this.settlements.values()) {
      if (s.listingId === id && OPEN_SETTLEMENT_STATES.includes(s.state)) return false;
    }
    row.status = 'closed';
    row.resolution = resolution;
    this.touchListing(id);
    return true;
  }

  async markListingSettling(id: number): Promise<void> {
    const row = this.listings.get(id);
    if (!row) return;
    if (row.status === 'ending' || row.status === 'active' || row.status === 'settling') {
      row.status = 'settling';
      this.touchListing(id);
    }
  }

  async undisposedClosedListings(
    realm: string,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocListingRow[]> {
    // Mirrors the Pg predicate: sold rows never enter the return backlog (a
    // sold undisposed row is stuck residue the readout surfaces instead),
    // and the caller's backing-off parked rows are excluded in the READ.
    const excluded = new Set(excludeIds);
    return [...this.listings.values()]
      .filter(
        (row) =>
          row.realm === realm &&
          row.status === 'closed' &&
          !row.itemDisposed &&
          !excluded.has(row.id) &&
          // Mirrors the SQL's (resolution IS NULL OR resolution <> 'sold'):
          // in SQL the IS NULL arm is load-bearing (NULL <> 'sold' is NULL);
          // in TS the inequality already covers null, so one arm suffices.
          row.resolution !== 'sold',
      )
      .sort(this.byRotation(this.listingParkedMs, this.listingTouchMs))
      .slice(0, limit)
      .map((r) => this.listingOut(r));
  }

  async strandedListings(
    realm: string,
    olderThanMs: number,
    limit: number,
  ): Promise<WocListingRow[]> {
    // updated_at mirror: listingTouchMs is stamped by touchListing on every
    // mutation, exactly where the Pg UPDATEs set updated_at = now().
    return [...this.listings.values()]
      .filter(
        (row) =>
          row.realm === realm &&
          (row.status === 'ending' || row.status === 'settling') &&
          (this.listingTouchMs.get(row.id) ?? 0) <= olderThanMs,
      )
      .sort(this.byTouch(this.listingTouchMs))
      .slice(0, limit)
      .map((r) => this.listingOut(r));
  }

  async reopenListing(id: number): Promise<void> {
    const row = this.listings.get(id);
    if (!row) return;
    // Fail-closed: an open OR retry-eligible 'failed' settlement refuses the
    // reopen (the Pg statement carries the same NOT EXISTS predicate; the
    // failed row belongs to the overdue sweep's default pass).
    for (const s of this.settlements.values()) {
      if (
        s.listingId === id &&
        (OPEN_SETTLEMENT_STATES.includes(s.state) || s.state === 'failed')
      ) {
        return;
      }
    }
    if (row.status === 'ending' || row.status === 'settling') {
      row.status = 'active';
      this.touchListing(id);
    }
  }

  async claimCustodyRef(realm: string, custodyRef: string): Promise<boolean> {
    // ON CONFLICT (custody_ref) DO NOTHING: only the FIRST claim inserts.
    if (this.custodyClaims.has(custodyRef)) return false;
    this.custodyClaims.set(custodyRef, {
      realm,
      claimedAtMs: this.now(),
      bookedAtMs: null,
      grantCharacterId: null,
      mailIntentAtMs: null,
    });
    return true;
  }

  /** Throw ONCE on the next booking (the crash window between the mail write
   *  and the booking; consumed on use). */
  failNextMarkBooked = false;

  async markCustodyRefBooked(custodyRef: string): Promise<void> {
    if (this.failNextMarkBooked) {
      this.failNextMarkBooked = false;
      throw new Error('booking failed');
    }
    const claim = this.custodyClaims.get(custodyRef);
    if (claim && claim.bookedAtMs === null) claim.bookedAtMs = this.now();
  }

  async custodyRefState(custodyRef: string): Promise<WocCustodyRefState | null> {
    const claim = this.custodyClaims.get(custodyRef);
    if (!claim) return null;
    return {
      booked: claim.bookedAtMs !== null,
      grantCharacterId: claim.grantCharacterId,
      mailIntent: claim.mailIntentAtMs !== null,
    };
  }

  async markCustodyGrantIntent(custodyRef: string, characterId: number): Promise<boolean> {
    // The Pg UPDATE is guarded on booked_at IS NULL, and matching no row is
    // the caller's park signal.
    const claim = this.custodyClaims.get(custodyRef);
    if (!claim || claim.bookedAtMs !== null) return false;
    claim.grantCharacterId = characterId;
    return true;
  }

  async markCustodyMailIntent(custodyRef: string): Promise<boolean> {
    // One statement in Pg: stamp the mail intent AND withdraw any grant
    // intent (the only legal conversion follows a grantCopy refusal).
    const claim = this.custodyClaims.get(custodyRef);
    if (!claim || claim.bookedAtMs !== null) return false;
    claim.mailIntentAtMs = this.now();
    claim.grantCharacterId = null;
    return true;
  }

  /** Outcome forcing for the atomic save-and-book edge, consumed on use.
   *  'lease_lost' models the fence (nothing lands); 'throw' models a
   *  transient failure whose transaction never committed; 'throw_after_commit'
   *  models the ambiguous case (the booking COMMITTED, then the reply was
   *  lost), which is exactly what booked_at exists to resolve. */
  failNextDeliveredSave: 'lease_lost' | 'throw' | 'throw_after_commit' | null = null;
  /** Every atomic save-and-book the delivery edge received, in order. */
  readonly deliveredSaves: CharacterSaveArgs[] = [];

  async saveDeliveredCharacterBooked(
    save: CharacterSaveArgs,
    custodyRef: string,
  ): Promise<'booked' | 'lease_lost' | 'claim_missing'> {
    this.deliveredSaves.push(structuredClone(save));
    const forced = this.failNextDeliveredSave;
    this.failNextDeliveredSave = null;
    if (forced === 'lease_lost') return 'lease_lost';
    if (forced === 'throw') throw new Error('delivered save failed');
    const claim = this.custodyClaims.get(custodyRef);
    if (!claim || claim.bookedAtMs !== null) return 'claim_missing';
    claim.bookedAtMs = this.now();
    if (forced === 'throw_after_commit') throw new Error('delivered save reply lost');
    return 'booked';
  }

  async stuckCustodyReadout(
    realm: string,
    olderThanMs: number,
    sampleLimit: number,
    countCap: number,
    bondOlderThanMs: number,
  ): Promise<WocStuckCustodyClasses> {
    // Counts SATURATE at countCap, mirroring the Pg inner-LIMIT subqueries.
    // Age signals mirror the Pg predicates: rotation (the parked maps) never
    // moves them, so a permanently parked row still ages into the readout;
    // the delivering class ages on the updated_at mirror stamped when the
    // row ENTERED 'delivering'.
    const claims = [...this.custodyClaims.entries()]
      .filter(([, c]) => c.realm === realm && c.bookedAtMs === null && c.claimedAtMs <= olderThanMs)
      .sort((a, b) => a[1].claimedAtMs - b[1].claimedAtMs || a[0].localeCompare(b[0]));
    const delivering = [...this.settlements.values()]
      .filter(
        (s) =>
          s.realm === realm &&
          s.state === 'delivering' &&
          (this.settlementTouchMs.get(s.id) ?? 0) <= olderThanMs,
      )
      .sort(this.byTouch(this.settlementTouchMs));
    const undisposed = [...this.listings.values()]
      .filter(
        (l) =>
          l.realm === realm &&
          l.status === 'closed' &&
          !l.itemDisposed &&
          (this.listingTouchMs.get(l.id) ?? 0) <= olderThanMs,
      )
      .sort(this.byTouch(this.listingTouchMs));
    // 'review' rows carry NO age filter (the sweep's bound already aged them);
    // stuck bonds age on placed_at past the caller's bond cutoff.
    const review = [...this.settlements.values()]
      .filter((s) => s.realm === realm && s.state === 'review')
      .sort(this.byTouch(this.settlementTouchMs));
    const stuckBonds = [...this.bids.values()]
      .filter(
        (b) =>
          b.realm === realm &&
          b.status === 'pending_bond' &&
          b.bondSignature !== null &&
          b.placedAtMs <= bondOlderThanMs,
      )
      .sort((a, b) => a.placedAtMs - b.placedAtMs || a.id - b.id);
    return {
      unbookedClaims: {
        count: Math.min(claims.length, countCap),
        saturated: claims.length >= countCap,
        sample: claims.slice(0, sampleLimit).map(([ref, c]) => ({
          custodyRef: ref,
          claimedAtMs: c.claimedAtMs,
          grantCharacterId: c.grantCharacterId,
          mailIntent: c.mailIntentAtMs !== null,
        })),
      },
      stuckDelivering: {
        count: Math.min(delivering.length, countCap),
        saturated: delivering.length >= countCap,
        sample: delivering.slice(0, sampleLimit).map((s) => ({
          id: s.id,
          listingId: s.listingId,
          createdAtMs: s.createdAtMs,
          updatedAtMs: this.settlementTouchMs.get(s.id) ?? 0,
        })),
      },
      undisposedListings: {
        count: Math.min(undisposed.length, countCap),
        saturated: undisposed.length >= countCap,
        sample: undisposed.slice(0, sampleLimit).map((l) => ({
          id: l.id,
          resolution: l.resolution,
          updatedAtMs: this.listingTouchMs.get(l.id) ?? 0,
        })),
      },
      reviewSettlements: {
        count: Math.min(review.length, countCap),
        saturated: review.length >= countCap,
        sample: review.slice(0, sampleLimit).map((s) => ({
          id: s.id,
          listingId: s.listingId,
          createdAtMs: s.createdAtMs,
          updatedAtMs: this.settlementTouchMs.get(s.id) ?? 0,
        })),
      },
      stuckBonds: {
        count: Math.min(stuckBonds.length, countCap),
        saturated: stuckBonds.length >= countCap,
        sample: stuckBonds.slice(0, sampleLimit).map((b) => ({
          id: b.id,
          listingId: b.listingId,
          account: b.account,
          placedAtMs: b.placedAtMs,
        })),
      },
    };
  }

  async markItemDisposed(id: number): Promise<void> {
    const row = this.listings.get(id);
    if (!row) return;
    row.itemDisposed = true;
    this.touchListing(id);
    // Terminal transition clears the rotation stamp (mirrors the SQL).
    this.listingParkedMs.delete(id);
  }

  async claimBuyNowLock(
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
  > {
    const row = this.listings.get(id);
    // Mirror the Pg diagnosis order for a precise client error.
    if (!row || row.realm !== realm) return 'not_found';
    if (row.sellerAccount === account) return 'own_listing';
    if (row.status !== 'active') return 'not_active';
    if (row.buyNowCents === null) return 'no_buy_now';
    if (row.cancelRequestedAtMs !== null) return 'cancel_pending';
    const lockHeld =
      row.buyNowLockAccount !== null &&
      row.buyNowLockExpiresMs !== null &&
      row.buyNowLockExpiresMs > nowMs;
    if (lockHeld) return 'locked';
    // Steal-time abandon recording (public only), then the claimer's two
    // cooldown guards, mirroring the Pg transaction's order so a self-steal
    // refuses in the same call.
    if (
      row.buyNowLockAccount !== null &&
      row.buyNowLockExpiresMs !== null &&
      row.directedBuyerAccount === null
    ) {
      this.recordAbandon(realm, id, row.buyNowLockAccount, row.buyNowLockExpiresMs);
    }
    if (row.directedBuyerAccount === null) {
      const reclaimCutoff = nowMs - WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS * 1000;
      const windowCutoff = nowMs - WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS * 1000;
      const mine = this.buyNowAbandons.filter((a) => a.realm === realm && a.account === account);
      if (mine.some((a) => a.listingId === id && a.lockExpiresMs > reclaimCutoff)) {
        return 'claim_cooldown';
      }
      if (
        mine.filter((a) => a.lockExpiresMs > windowCutoff).length >=
        WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR
      ) {
        return 'claim_cooldown';
      }
    }
    row.buyNowLockAccount = account;
    row.buyNowLockExpiresMs = expiresAtMs;
    this.touchListing(id);
    return this.listingOut(row);
  }

  /** Holder-guarded, mirroring the Pg UPDATE's WHERE. */
  async clearBuyNowLock(id: number, holderAccount: number): Promise<void> {
    const row = this.listings.get(id);
    if (!row || row.buyNowLockAccount !== holderAccount) return;
    row.buyNowLockAccount = null;
    row.buyNowLockExpiresMs = null;
    this.touchListing(id);
  }

  /** The in-memory abandon ledger, deduped on the (listing, account,
   *  lock_expires) window key like the real unique index. */
  private recordAbandon(
    realm: string,
    listingId: number,
    account: number,
    lockExpiresMs: number,
  ): void {
    if (
      this.buyNowAbandons.some(
        (a) =>
          a.listingId === listingId && a.account === account && a.lockExpiresMs === lockExpiresMs,
      )
    ) {
      return;
    }
    this.buyNowAbandons.push({ realm, listingId, account, lockExpiresMs });
  }

  async recordBuyNowAbandon(
    realm: string,
    listingId: number,
    account: number,
    lockExpiresAtMs: number,
  ): Promise<void> {
    this.recordAbandon(realm, listingId, account, lockExpiresAtMs);
  }

  async cancelPendingListings(
    realm: string,
    nowMs: number,
    limit: number,
  ): Promise<WocListingRow[]> {
    return [...this.listings.values()]
      .filter(
        (l) =>
          l.realm === realm &&
          l.status === 'active' &&
          l.cancelRequestedAtMs !== null &&
          (l.buyNowLockAccount === null ||
            l.buyNowLockExpiresMs === null ||
            l.buyNowLockExpiresMs <= nowMs),
      )
      .sort((a, b) => a.id - b.id)
      .slice(0, limit)
      .map((l) => this.listingOut(l));
  }

  async closeCancelPendingListing(
    realm: string,
    id: number,
    nowMs: number,
  ): Promise<WocListingRow | 'skip' | 'contended'> {
    const row = this.listings.get(id);
    if (
      !row ||
      row.realm !== realm ||
      row.status !== 'active' ||
      row.cancelRequestedAtMs === null
    ) {
      return 'skip';
    }
    if (
      row.buyNowLockAccount !== null &&
      row.buyNowLockExpiresMs !== null &&
      row.buyNowLockExpiresMs > nowMs
    ) {
      return 'skip';
    }
    for (const bid of this.bids.values()) {
      if (bid.listingId === id && (bid.status === 'pending_bond' || bid.status === 'active')) {
        return 'skip';
      }
    }
    // 'failed' rows expire here (the cancelListingIfUnbid shape); any OPEN
    // settlement skips (the overdue arm owns the abandoned window's expiry).
    for (const s of this.settlements.values()) {
      if (s.listingId === id && s.state === 'failed') {
        s.state = 'expired';
        s.failReason = 'listing_cancelled';
        this.touchSettlement(s.id);
      }
    }
    for (const s of this.settlements.values()) {
      if (s.listingId === id && OPEN_SETTLEMENT_STATES.includes(s.state)) return 'skip';
    }
    row.status = 'closed';
    row.resolution = 'cancelled';
    this.touchListing(id);
    return this.listingOut(row);
  }

  // -------------------------------------------------------------------------
  // Bids
  // -------------------------------------------------------------------------

  async insertPendingBid(args: {
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
  > {
    const row = this.listings.get(args.listingId);
    if (!row || row.realm !== args.realm) return { ok: false, reason: 'not_found' };
    // The callbacks see the row as it was read (a copy), the Pg SELECT shape.
    const snapshot = this.listingOut(row);
    if (snapshot.status !== 'active') return { ok: false, reason: 'not_active' };
    if (snapshot.endsAtMs <= args.nowMs) return { ok: false, reason: 'not_active' };
    // Cancel-intent blocks new bids (mirrors the Pg guard).
    if (snapshot.cancelRequestedAtMs !== null) return { ok: false, reason: 'cancel_pending' };
    if (snapshot.sellerAccount === args.account) return { ok: false, reason: 'own_listing' };
    // One wallet is one bidder: a seller cannot bid through a second account
    // sharing the payout wallet.
    if (snapshot.sellerWallet === args.wallet) return { ok: false, reason: 'own_listing' };
    if (args.amountCents < args.minNext(snapshot)) return { ok: false, reason: 'bid_too_low' };
    for (const bid of this.bids.values()) {
      if (
        bid.listingId === args.listingId &&
        bid.account === args.account &&
        bid.status === 'pending_bond'
      ) {
        return { ok: false, reason: 'already_pending' };
      }
    }
    const id = this.nextBidId++;
    const rec: BidRec = {
      id,
      realm: args.realm,
      listingId: args.listingId,
      account: args.account,
      characterId: args.characterId,
      characterName: args.characterName,
      wallet: args.wallet,
      amountCents: args.amountCents,
      status: 'pending_bond',
      bondCents: args.bondCents,
      bondState: 'pending',
      bondReference: null,
      bondQuoteExpiresAtMs: null,
      bondSignature: null,
      placedAtMs: args.nowMs,
    };
    this.bids.set(id, rec);
    // Placement does NOT extend the auction (the extension moved to bond
    // progress: extendAuctionForBondProgress below), matching Pg.
    return { ok: true, bid: this.bidOut(rec) };
  }

  /** Mirrors the Pg arm: the callback sees the listing as read (a copy), and
   *  only an 'active' listing extends. */
  async extendAuctionForBondProgress(
    realm: string,
    listingId: number,
    extendEndsToMs: (row: WocListingRow) => number | null,
  ): Promise<'extended' | 'skip' | 'contended'> {
    const row = this.listings.get(listingId);
    if (!row || row.realm !== realm || row.status !== 'active') return 'skip';
    const extended = extendEndsToMs(this.listingOut(row));
    if (extended === null) return 'skip';
    row.endsAtMs = extended;
    this.touchListing(row.id);
    return 'extended';
  }

  /** Mirrors the real UPDATE: narrowed to pending_bond, idempotent on the same
   *  signature, and refusing one already recorded against a DIFFERENT bid (the
   *  unique index's 23505). */
  async submitBondSignature(
    bidId: number,
    signature: string,
  ): Promise<'recorded' | 'not_pending' | 'signature_reused'> {
    for (const [id, other] of this.bids) {
      if (id !== bidId && other.bondSignature === signature) return 'signature_reused';
    }
    const bid = this.bids.get(bidId);
    if (!bid || bid.status !== 'pending_bond') return 'not_pending';
    if (bid.bondSignature !== null && bid.bondSignature !== signature) return 'not_pending';
    bid.bondSignature = signature;
    return 'recorded';
  }

  async confirmingBonds(realm: string, limit: number): Promise<WocBidRow[]> {
    return [...this.bids.values()]
      .filter((b) => b.realm === realm && b.status === 'pending_bond' && b.bondSignature !== null)
      .sort((a, b) => a.placedAtMs - b.placedAtMs || a.id - b.id)
      .slice(0, limit)
      .map((b) => this.bidOut(b));
  }

  async lapseBid(bidId: number): Promise<void> {
    const bid = this.bids.get(bidId);
    if (!bid || bid.status !== 'pending_bond') return;
    bid.status = 'lapsed';
    bid.bondState = 'void';
  }

  /** Mirrors the real CAS: a quote applies only to an UNPAID bond (status
   *  pending_bond AND no recorded signature); false = nothing written. */
  async setBidBondQuote(bidId: number, reference: string, expiresAtMs: number): Promise<boolean> {
    const bid = this.bids.get(bidId);
    if (!bid || bid.status !== 'pending_bond' || bid.bondSignature !== null) return false;
    bid.bondReference = reference;
    bid.bondQuoteExpiresAtMs = expiresAtMs;
    return true;
  }

  async bidById(id: number): Promise<WocBidRow | null> {
    const bid = this.bids.get(id);
    return bid ? this.bidOut(bid) : null;
  }

  /** Mirrors the real UPDATE's predicate exactly (realm + id + account +
   *  status + no recorded signature). A fake that checked fewer arms would let
   *  the service's tests pass over SQL that never matched, which this suite
   *  has been bitten by before. */
  async abandonPendingBid(realm: string, bidId: number, account: number): Promise<boolean> {
    const bid = this.bids.get(bidId);
    if (!bid || bid.realm !== realm || bid.account !== account || bid.status !== 'pending_bond') {
      return false;
    }
    if (bid.bondSignature !== null) return false;
    bid.status = 'cancelled';
    bid.bondState = 'void';
    return true;
  }

  async activateBid(
    bidId: number,
    nowMs: number,
  ): Promise<'activated' | 'superseded' | 'listing_closed' | 'not_pending'> {
    const bid = this.bids.get(bidId);
    if (!bid || bid.status !== 'pending_bond') return 'not_pending';
    const supersede = (): void => {
      bid.status = 'outbid';
      if (bid.bondState === 'held') bid.bondState = 'refund_due';
    };
    const listing = this.listings.get(bid.listingId);
    if (!listing) {
      supersede();
      return 'listing_closed';
    }
    if (listing.status !== 'active' || listing.endsAtMs <= nowMs) {
      supersede();
      return 'listing_closed';
    }
    if (listing.currentBidCents !== null && bid.amountCents <= listing.currentBidCents) {
      supersede();
      return 'superseded';
    }
    if (listing.currentBidId !== null) {
      const previous = this.bids.get(listing.currentBidId);
      if (previous && previous.status === 'active') {
        previous.status = 'outbid';
        if (previous.bondState === 'held') previous.bondState = 'refund_due';
      }
    }
    bid.status = 'active';
    listing.currentBidCents = bid.amountCents;
    listing.currentBidId = bidId;
    this.touchListing(listing.id);
    return 'activated';
  }

  async markBondHeld(bidId: number): Promise<void> {
    const bid = this.bids.get(bidId);
    if (bid && bid.bondState === 'pending') bid.bondState = 'held';
  }

  async lapsePendingBids(realm: string, cutoffMs: number, limit: number): Promise<number> {
    const due = [...this.bids.values()]
      .filter(
        (bid) =>
          bid.realm === realm &&
          bid.status === 'pending_bond' &&
          bid.placedAtMs <= cutoffMs &&
          // A signed bond is PAID and merely awaiting the chain: the real SQL
          // excludes it, and a fake that reaped it would hide the very defect
          // this arm exists to prevent.
          bid.bondSignature === null,
      )
      .sort((a, b) => a.placedAtMs - b.placedAtMs || a.id - b.id)
      .slice(0, limit);
    for (const bid of due) {
      bid.status = 'lapsed';
      bid.bondState = 'void';
    }
    return due.length;
  }

  async bidsByAccount(realm: string, account: number, limit: number): Promise<WocBidRow[]> {
    return [...this.bids.values()]
      .filter((bid) => bid.realm === realm && bid.account === account)
      .sort((a, b) => b.placedAtMs - a.placedAtMs || b.id - a.id)
      .slice(0, limit)
      .map((b) => this.bidOut(b));
  }

  async bidsForListing(listingId: number): Promise<WocBidRow[]> {
    return [...this.bids.values()]
      .filter((bid) => bid.listingId === listingId)
      .sort((a, b) => b.amountCents - a.amountCents || a.placedAtMs - b.placedAtMs || a.id - b.id)
      .map((b) => this.bidOut(b));
  }

  async nextCascadeBidder(
    listingId: number,
    minCents: number,
    excludedAccounts: readonly number[],
  ): Promise<WocBidRow | null> {
    // Selection only, like the Pg SELECT: the 'won' stamp rides the
    // settlement insert (insertSettlement winnerBidId).
    const next = [...this.bids.values()]
      .filter(
        (bid) =>
          bid.listingId === listingId &&
          bid.status === 'outbid' &&
          bid.amountCents >= minCents &&
          !excludedAccounts.includes(bid.account),
      )
      .sort(
        (a, b) => b.amountCents - a.amountCents || a.placedAtMs - b.placedAtMs || a.id - b.id,
      )[0];
    if (!next) return null;
    return this.bidOut(next);
  }

  async markBidStatus(bidId: number, status: WocBidStatus, from?: WocBidStatus[]): Promise<void> {
    const bid = this.bids.get(bidId);
    if (!bid) return;
    if (from && !from.includes(bid.status)) return;
    bid.status = status;
  }

  async markBidOutbidQueueRefund(bidId: number): Promise<void> {
    // One statement in Pg: outbid + queue the held bond, CAS from 'active'.
    const bid = this.bids.get(bidId);
    if (!bid || bid.status !== 'active') return;
    bid.status = 'outbid';
    if (bid.bondState === 'held') bid.bondState = 'refund_due';
  }

  async setBondState(bidId: number, from: WocBondState[], to: WocBondState): Promise<boolean> {
    const bid = this.bids.get(bidId);
    if (!bid || !from.includes(bid.bondState)) return false;
    bid.bondState = to;
    return true;
  }

  async bondsDue(realm: string, limit: number): Promise<WocBidRow[]> {
    return [...this.bids.values()]
      .filter(
        (bid) =>
          bid.realm === realm &&
          (bid.bondState === 'refund_due' || bid.bondState === 'forfeit_due'),
      )
      .sort((a, b) => a.placedAtMs - b.placedAtMs || a.id - b.id)
      .slice(0, limit)
      .map((b) => this.bidOut(b));
  }

  // -------------------------------------------------------------------------
  // Settlements
  // -------------------------------------------------------------------------

  /** Force the NEXT finalize verdict (consumed on use): 'contended' models a
   *  lock-timeout loser, 'stale' models a hand-moved row vanishing between
   *  the batch read and the transaction (only an operator can produce it). */
  failNextFinalize: 'contended' | 'stale' | null = null;

  async finalizeDeliveredSettlement(args: {
    settlementId: number;
    listingId: number;
    bidId: number | null;
    sale: Omit<WocSaleRow, 'id' | 'excluded' | 'atMs'>;
  }): Promise<'finalized' | 'already_final' | 'stale' | 'contended'> {
    if (this.failNextFinalize) {
      const forced = this.failNextFinalize;
      this.failNextFinalize = null;
      return forced;
    }
    const rec = this.settlements.get(args.settlementId);
    const listing = this.listings.get(args.listingId);
    if (!rec || !listing) return 'stale';
    // The CAS accepts 'delivered' too: that is what makes the re-drive and a
    // re-run converge (mirrors the Pg transaction).
    if (rec.state !== 'delivering' && rec.state !== 'delivered') return 'stale';
    rec.state = 'delivered';
    this.touchSettlement(rec.id);
    // Terminal transition clears the rotation stamp (mirrors the SQL).
    this.settlementParkedMs.delete(rec.id);
    // ON CONFLICT (listing_id) WHERE excluded = false DO NOTHING.
    const standing = [...this.sales.values()].some(
      (s) => s.listingId === args.listingId && !s.excluded,
    );
    if (!standing) {
      const id = this.nextSaleId++;
      this.sales.set(id, {
        ...structuredClone(args.sale),
        id,
        excluded: false,
        atMs: this.now(),
      });
    }
    // The close is a real compare-and-set (mirrors the Pg WHERE): a listing
    // already closed AND disposed downgrades the whole run to already_final.
    const closedNow = listing.status !== 'closed' || !listing.itemDisposed;
    if (listing.status !== 'closed') {
      listing.status = 'closed';
      listing.resolution = 'sold';
    }
    listing.itemDisposed = true;
    if (closedNow) {
      this.touchListing(listing.id);
      this.listingParkedMs.delete(listing.id);
    }
    if (args.bidId !== null) {
      const winner = this.bids.get(args.bidId);
      if (winner && winner.bondState === 'held') winner.bondState = 'refund_due';
    }
    for (const bid of this.bids.values()) {
      if (
        bid.listingId === args.listingId &&
        (bid.status === 'pending_bond' || bid.status === 'active')
      ) {
        // Mirrors the real teardown's paid-but-undecided carve-out: a signed,
        // unheld bond stays with the bond poll instead of being cancelled out
        // of the polling set.
        if (
          bid.status === 'pending_bond' &&
          bid.bondSignature !== null &&
          bid.bondState === 'pending'
        ) {
          continue;
        }
        bid.status = 'cancelled';
        if (bid.bondState === 'held') bid.bondState = 'refund_due';
      }
    }
    return closedNow ? 'finalized' : 'already_final';
  }

  async insertSettlement(args: {
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
  > {
    // Pg aborts before the INSERT when the named winner left the caller's
    // pickable states (a concurrent suspend cancelled it): no settlement may
    // exist whose winner holds no claim. Checked first, matching the Pg
    // statement order. 'contended' never occurs here (no lock waits in a
    // Map); it exists only to satisfy the interface union.
    if (args.winnerBidId !== undefined) {
      const winner = this.bids.get(args.winnerBidId);
      const pickable = args.winnerFrom ?? ['active', 'outbid'];
      if (!winner || !pickable.includes(winner.status)) {
        return 'winner_gone';
      }
    }
    const listing = this.listings.get(args.listingId);
    // Pg mirrors: INSERT..SELECT from a missing listing inserts no row; a
    // CLOSED listing gets its own value (the guard that stops a cascade
    // insert landing on a listing an admin suspend just closed).
    if (!listing) return 'live_settlement_exists';
    if (listing.status === 'closed') return 'listing_closed';
    for (const s of this.settlements.values()) {
      if (s.listingId === args.listingId && OPEN_SETTLEMENT_STATES.includes(s.state)) {
        // The Pg transaction rolls the winner stamp back with the insert, so
        // the fake refuses BEFORE touching the bid: same observable order.
        return 'live_settlement_exists';
      }
    }
    if (args.winnerBidId !== undefined) {
      const winner = this.bids.get(args.winnerBidId);
      if (winner) winner.status = 'won';
    }
    const id = this.nextSettlementId++;
    const rec: SettlementRec = {
      id,
      realm: listing.realm,
      listingId: args.listingId,
      bidId: args.bidId,
      attempt: args.attempt,
      buyerAccount: args.buyerAccount,
      buyerCharacter: args.buyerCharacter,
      buyerName: args.buyerName,
      buyerWallet: args.buyerWallet,
      amountCents: args.amountCents,
      state: 'offered',
      quoteReference: null,
      quoteExpiresAtMs: null,
      txSignature: null,
      failReason: null,
      settledAmountBase: null,
      deadlineAtMs: args.deadlineAtMs,
      createdAtMs: args.nowMs,
    };
    this.settlements.set(id, rec);
    this.touchSettlement(id);
    return this.settlementOut(rec);
  }

  async settlementById(id: number): Promise<WocSettlementRow | null> {
    const rec = this.settlements.get(id);
    return rec ? this.settlementOut(rec) : null;
  }

  async settlementsByAccount(
    realm: string,
    account: number,
    limit: number,
  ): Promise<WocSettlementRow[]> {
    return [...this.settlements.values()]
      .filter((s) => s.realm === realm && s.buyerAccount === account)
      .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id - a.id)
      .slice(0, limit)
      .map((s) => this.settlementOut(s));
  }

  async liveSettlementForListing(listingId: number): Promise<WocSettlementRow | null> {
    for (const s of this.settlements.values()) {
      if (s.listingId === listingId && OPEN_SETTLEMENT_STATES.includes(s.state)) {
        return this.settlementOut(s);
      }
    }
    return null;
  }

  async setSettlementQuote(
    id: number,
    reference: string,
    expiresAtMs: number,
    amountBase: string | null,
  ): Promise<boolean> {
    const rec = this.settlements.get(id);
    if (!rec || rec.state !== 'offered') return false;
    rec.quoteReference = reference;
    rec.quoteExpiresAtMs = expiresAtMs;
    rec.settledAmountBase = amountBase;
    this.touchSettlement(id);
    return true;
  }

  async submitSettlementSignature(
    id: number,
    signature: string,
  ): Promise<'ok' | 'not_offered' | 'signature_reused'> {
    const rec = this.settlements.get(id);
    if (!rec || rec.state !== 'offered') return 'not_offered';
    // The tx_signature UNIQUE constraint: any OTHER settlement already
    // carrying the signature refuses the reuse. The row under test is
    // skipped, matching Pg: re-writing the same value onto the same row adds
    // no new index entry, so a buyer retrying the same signature after a
    // failed -> offered revival proceeds.
    for (const other of this.settlements.values()) {
      if (other.id !== id && other.txSignature === signature) return 'signature_reused';
    }
    rec.state = 'confirming';
    rec.txSignature = signature;
    this.touchSettlement(id);
    return 'ok';
  }

  async transitionSettlement(
    id: number,
    from: WocSettlementState[],
    to: WocSettlementState,
    failReason?: string,
  ): Promise<boolean> {
    const rec = this.settlements.get(id);
    if (!rec || !from.includes(rec.state)) return false;
    // The one-open-settlement unique index is a CONSTRAINT, not an insert-time
    // check: a transition INTO the open set (the failed -> offered revival)
    // refuses when another open settlement holds the listing's slot, exactly
    // as Pg reports that 23505 (the fake must never reach a two-open state Pg
    // makes structurally impossible).
    if (OPEN_SETTLEMENT_STATES.includes(to) && !OPEN_SETTLEMENT_STATES.includes(rec.state)) {
      for (const other of this.settlements.values()) {
        if (
          other.id !== id &&
          other.listingId === rec.listingId &&
          OPEN_SETTLEMENT_STATES.includes(other.state)
        ) {
          return false;
        }
      }
    }
    rec.state = to;
    // COALESCE($4, fail_reason): a transition without a reason keeps the old one.
    rec.failReason = failReason ?? rec.failReason;
    this.touchSettlement(id);
    return true;
  }

  async confirmingSettlements(realm: string, limit: number): Promise<WocSettlementRow[]> {
    return [...this.settlements.values()]
      .filter((s) => s.realm === realm && s.state === 'confirming')
      .sort(this.byTouch(this.settlementTouchMs))
      .slice(0, limit)
      .map((s) => this.settlementOut(s));
  }

  async claimDeliverableSettlements(realm: string, limit: number): Promise<WocSettlementRow[]> {
    const claimed = [...this.settlements.values()]
      .filter((s) => s.realm === realm && s.state === 'confirmed')
      .sort(this.byTouch(this.settlementTouchMs))
      .slice(0, limit);
    for (const rec of claimed) {
      rec.state = 'delivering';
      this.touchSettlement(rec.id);
    }
    return claimed.map((s) => this.settlementOut(s));
  }

  async deliveringSettlements(
    realm: string,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocSettlementRow[]> {
    const excluded = new Set(excludeIds);
    return [...this.settlements.values()]
      .filter((s) => s.realm === realm && s.state === 'delivering' && !excluded.has(s.id))
      .sort(this.byRotation(this.settlementParkedMs, this.settlementTouchMs))
      .slice(0, limit)
      .map((s) => this.settlementOut(s));
  }

  async deliveredUnclosedSettlementsPage(
    realm: string,
    afterListingId: number,
    pageSize: number,
    maxSettlements: number,
  ): Promise<{ settlements: WocSettlementRow[]; lastListingId: number | null }> {
    // Mirrors the Pg two-statement page: a bounded slice of open listing ids
    // (the same three-status literal the SQL spells; the four-way lifecycle
    // means "not closed", pinned in woc_market_directed_sql.test.ts), then
    // the delivered settlements riding them, bounded by maxSettlements with
    // the truncation-cursor semantics (next beat resumes behind the last
    // RETURNED row instead of skipping the remainder to the wrap).
    const openIds = [...this.listings.values()]
      .filter(
        (l) =>
          l.realm === realm &&
          (l.status === 'active' || l.status === 'ending' || l.status === 'settling') &&
          l.id > afterListingId,
      )
      .map((l) => l.id)
      .sort((a, b) => a - b)
      .slice(0, pageSize);
    if (openIds.length === 0) return { settlements: [], lastListingId: null };
    const idSet = new Set(openIds);
    const matched = [...this.settlements.values()]
      .filter((s) => s.realm === realm && s.state === 'delivered' && idSet.has(s.listingId))
      .sort((a, b) => a.listingId - b.listingId)
      .map((s) => this.settlementOut(s));
    if (matched.length > maxSettlements) {
      const kept = matched.slice(0, maxSettlements);
      return {
        settlements: kept,
        lastListingId: kept[kept.length - 1]?.listingId ?? null,
      };
    }
    return { settlements: matched, lastListingId: openIds[openIds.length - 1] ?? null };
  }

  async disposeSoldResidueListings(realm: string, limit: number): Promise<number> {
    let disposed = 0;
    // id order, mirroring the SQL's ORDER BY l.id (deterministic lock order).
    const rows = [...this.listings.values()].sort((a, b) => a.id - b.id);
    for (const listing of rows) {
      if (disposed >= limit) break;
      if (
        listing.realm !== realm ||
        listing.status !== 'closed' ||
        listing.resolution !== 'sold' ||
        listing.itemDisposed
      ) {
        continue;
      }
      const standing = [...this.sales.values()].some(
        (s) => s.listingId === listing.id && !s.excluded,
      );
      if (!standing) continue;
      listing.itemDisposed = true;
      this.touchListing(listing.id);
      disposed++;
    }
    return disposed;
  }

  async touchSettlementRow(id: number): Promise<void> {
    // Rotation writes the parked mirror ONLY, never the age signal.
    if (this.settlements.has(id)) this.settlementParkedMs.set(id, this.now());
  }

  async touchListingRow(id: number): Promise<void> {
    if (this.listings.has(id)) this.listingParkedMs.set(id, this.now());
  }

  async overdueSettlements(
    realm: string,
    nowMs: number,
    limit: number,
    confirmingCutoffMs: number,
  ): Promise<WocSettlementRow[]> {
    // Mirrors the real predicate's two arms: deadline-overdue offered/failed,
    // plus 'confirming' aged on updated_at (the touch mirror) past the H15
    // cutoff.
    return [...this.settlements.values()]
      .filter(
        (s) =>
          s.realm === realm &&
          (((s.state === 'offered' || s.state === 'failed') && s.deadlineAtMs <= nowMs) ||
            (s.state === 'confirming' &&
              (this.settlementTouchMs.get(s.id) ?? 0) <= confirmingCutoffMs)),
      )
      .sort((a, b) => a.deadlineAtMs - b.deadlineAtMs || a.id - b.id)
      .slice(0, limit)
      .map((s) => this.settlementOut(s));
  }

  // -------------------------------------------------------------------------
  // Sales, strikes, terms, delivery targets
  // -------------------------------------------------------------------------

  async insertSale(args: Omit<WocSaleRow, 'id' | 'excluded' | 'atMs'>): Promise<number> {
    // woc_market_sales_listing_once: one non-excluded sale row per listing,
    // surfaced as the same pg error shape the real INSERT throws.
    for (const sale of this.sales.values()) {
      if (sale.listingId === args.listingId && !sale.excluded) {
        throw Object.assign(
          new Error(
            'duplicate key value violates unique constraint "woc_market_sales_listing_once"',
          ),
          { code: '23505' },
        );
      }
    }
    const id = this.nextSaleId++;
    const row: WocSaleRow = {
      ...structuredClone(args),
      id,
      excluded: false,
      atMs: this.now(),
    };
    this.sales.set(id, row);
    return id;
  }

  async salesForItem(realm: string, itemId: string, limit: number): Promise<WocSaleRow[]> {
    return [...this.sales.values()]
      .filter((s) => s.realm === realm && s.itemId === itemId && !s.excluded)
      .sort((a, b) => b.atMs - a.atMs || b.id - a.id)
      .slice(0, limit)
      .map((s) => structuredClone(s));
  }

  async setSaleExcluded(id: number, excluded: boolean): Promise<'ok' | 'miss' | 'conflict'> {
    const row = this.sales.get(id);
    if (!row) return 'miss';
    if (!excluded) {
      // woc_market_sales_listing_once: re-including while another non-excluded
      // row stands for the listing refuses as a distinct conflict (Pg catches
      // its 23505 to 'conflict').
      for (const other of this.sales.values()) {
        if (other.id !== id && other.listingId === row.listingId && !other.excluded) {
          return 'conflict';
        }
      }
    }
    row.excluded = excluded;
    return 'ok';
  }

  async strikeInfo(account: number): Promise<WocStrikeRow | null> {
    const row = this.strikes.get(account);
    return row ? { ...row } : null;
  }

  async addStrike(account: number, suspendedUntilMs: number | null): Promise<WocStrikeRow> {
    const existing = this.strikes.get(account);
    if (!existing) {
      const row: WocStrikeRow = { accountId: account, strikes: 1, suspendedUntilMs };
      this.strikes.set(account, row);
      return { ...row };
    }
    existing.strikes += 1;
    // The Pg conflict arm computes GREATEST over COALESCE(.., 'epoch'), so two
    // null suspensions produce epoch (0 ms), never null. Mirrored on purpose.
    existing.suspendedUntilMs = Math.max(existing.suspendedUntilMs ?? 0, suspendedUntilMs ?? 0);
    return { ...existing };
  }

  async clearStrikes(account: number): Promise<void> {
    this.strikes.delete(account);
  }

  async termsAcceptedAt(account: number): Promise<number | null> {
    return this.terms.get(account) ?? null;
  }

  async recordTermsAccepted(account: number, nowMs: number): Promise<void> {
    // ON CONFLICT DO NOTHING: the first acceptance wins.
    if (!this.terms.has(account)) this.terms.set(account, nowMs);
  }

  async deliveryTarget(
    realm: string,
    account: number,
    preferredCharacter: number,
  ): Promise<{ characterId: number; name: string } | null> {
    const preferred = this.characters.find(
      (c) => c.characterId === preferredCharacter && c.accountId === account && c.realm === realm,
    );
    if (preferred) return { characterId: preferred.characterId, name: preferred.name };
    // The Pg fallback orders by updated_at DESC; the fake treats later seed
    // entries as newer.
    const fallback = [...this.characters]
      .reverse()
      .find((c) => c.accountId === account && c.realm === realm);
    if (fallback) return { characterId: fallback.characterId, name: fallback.name };
    return null;
  }
}
