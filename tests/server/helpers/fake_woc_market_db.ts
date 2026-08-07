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
// (the compensation/restore paths), and `escrowSaves` records every character
// save the escrow edge received.

import type {
  CharacterSaveArgs,
  NewWocListing,
  WocBidRow,
  WocBondState,
  WocBrowseQuery,
  WocDirectedOfferRow,
  WocDirectedOfferStatus,
  WocListingResolution,
  WocListingRow,
  WocMarketDb,
  WocSaleRow,
  WocSettlementRow,
  WocStrikeRow,
} from '../../../server/woc_market';
import type { WocBidStatus, WocSettlementState } from '../../../server/woc_market_rules';
import { WOC_MARKET_MAX_ACTIVE_LISTINGS } from '../../../server/woc_market_rules';
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

const LIVE_SETTLEMENT_STATES: readonly WocSettlementState[] = [
  'offered',
  'confirming',
  'confirmed',
  'delivering',
];

export class FakeWocMarketDb implements WocMarketDb {
  /** Force the NEXT escrowInsertListing to refuse (consumed on use). */
  failNextEscrow: 'lease_lost' | 'cap_reached' | null = null;
  /** Every character save escrowInsertListing received, in order. */
  readonly escrowSaves: CharacterSaveArgs[] = [];
  /** The durable book-once ledger (woc_market_custody_claims), exposed so
   *  tests can assert claim/book/unclaim lifecycles directly. */
  readonly custodyClaims = new Map<
    string,
    { realm: string; claimedAtMs: number; bookedAtMs: number | null }
  >();

  private readonly characters: FakeWocMarketCharacter[];
  private readonly now: () => number;

  private readonly listings = new Map<number, WocListingRow>();
  private readonly bids = new Map<number, BidRec>();
  private readonly settlements = new Map<number, SettlementRec>();
  private readonly sales = new Map<number, WocSaleRow>();
  private readonly strikes = new Map<number, WocStrikeRow>();
  private readonly terms = new Map<number, number>();

  // updated_at mirrors (ordering keys for the sweep queues).
  private readonly listingTouchMs = new Map<number, number>();
  private readonly settlementTouchMs = new Map<number, number>();

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
  ): Promise<WocListingRow | 'not_found' | 'not_yours' | 'has_bids' | 'not_active'> {
    const row = this.listings.get(id);
    if (!row || row.realm !== realm) return 'not_found';
    if (row.sellerAccount !== sellerAccount) return 'not_yours';
    if (row.status !== 'active') return 'not_active';
    for (const bid of this.bids.values()) {
      if (bid.listingId === id && (bid.status === 'pending_bond' || bid.status === 'active')) {
        return 'has_bids';
      }
    }
    row.status = 'closed';
    row.resolution = 'cancelled';
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

  async markListingSettling(id: number): Promise<void> {
    const row = this.listings.get(id);
    if (!row) return;
    if (row.status === 'ending' || row.status === 'active' || row.status === 'settling') {
      row.status = 'settling';
      this.touchListing(id);
    }
  }

  async undisposedClosedListings(realm: string, limit: number): Promise<WocListingRow[]> {
    return [...this.listings.values()]
      .filter((row) => row.realm === realm && row.status === 'closed' && !row.itemDisposed)
      .sort(this.byTouch(this.listingTouchMs))
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
    if (row.status === 'ending' || row.status === 'settling') {
      row.status = 'active';
      this.touchListing(id);
    }
  }

  async claimCustodyRef(realm: string, custodyRef: string): Promise<boolean> {
    // ON CONFLICT (custody_ref) DO NOTHING: only the FIRST claim inserts.
    if (this.custodyClaims.has(custodyRef)) return false;
    this.custodyClaims.set(custodyRef, { realm, claimedAtMs: this.now(), bookedAtMs: null });
    return true;
  }

  async markCustodyRefBooked(custodyRef: string): Promise<void> {
    const claim = this.custodyClaims.get(custodyRef);
    if (claim && claim.bookedAtMs === null) claim.bookedAtMs = this.now();
  }

  async unclaimCustodyRef(custodyRef: string): Promise<void> {
    // The Pg DELETE is guarded on booked_at IS NULL: a booked claim is the
    // durable record of a delivered parcel and is never released.
    const claim = this.custodyClaims.get(custodyRef);
    if (claim && claim.bookedAtMs === null) this.custodyClaims.delete(custodyRef);
  }

  async markItemDisposed(id: number): Promise<void> {
    const row = this.listings.get(id);
    if (!row) return;
    row.itemDisposed = true;
    this.touchListing(id);
  }

  async claimBuyNowLock(
    realm: string,
    id: number,
    account: number,
    nowMs: number,
    expiresAtMs: number,
  ): Promise<WocListingRow | 'not_found' | 'not_active' | 'locked' | 'no_buy_now' | 'own_listing'> {
    const row = this.listings.get(id);
    const lockFree =
      row !== undefined &&
      (row.buyNowLockAccount === null ||
        (row.buyNowLockExpiresMs !== null && row.buyNowLockExpiresMs <= nowMs));
    if (
      row &&
      row.realm === realm &&
      row.status === 'active' &&
      row.buyNowCents !== null &&
      row.sellerAccount !== account &&
      lockFree
    ) {
      row.buyNowLockAccount = account;
      row.buyNowLockExpiresMs = expiresAtMs;
      this.touchListing(id);
      return this.listingOut(row);
    }
    // Mirror the Pg diagnosis order for a precise client error.
    if (!row || row.realm !== realm) return 'not_found';
    if (row.sellerAccount === account) return 'own_listing';
    if (row.status !== 'active') return 'not_active';
    if (row.buyNowCents === null) return 'no_buy_now';
    return 'locked';
  }

  async clearBuyNowLock(id: number): Promise<void> {
    const row = this.listings.get(id);
    if (!row) return;
    row.buyNowLockAccount = null;
    row.buyNowLockExpiresMs = null;
    this.touchListing(id);
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
    extendEndsToMs: (row: WocListingRow) => number | null;
    minNext: (row: WocListingRow) => number;
  }): Promise<
    | { ok: true; bid: WocBidRow }
    | {
        ok: false;
        reason: 'not_found' | 'not_active' | 'own_listing' | 'bid_too_low' | 'already_pending';
      }
  > {
    const row = this.listings.get(args.listingId);
    if (!row || row.realm !== args.realm) return { ok: false, reason: 'not_found' };
    // The callbacks see the row as it was read (a copy), the Pg SELECT shape.
    const snapshot = this.listingOut(row);
    if (snapshot.status !== 'active') return { ok: false, reason: 'not_active' };
    if (snapshot.endsAtMs <= args.nowMs) return { ok: false, reason: 'not_active' };
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
      placedAtMs: args.nowMs,
    };
    this.bids.set(id, rec);
    // Anti-snipe extension applies at PLACEMENT (even for a bond that never
    // confirms), matching the Pg transaction.
    const extended = args.extendEndsToMs(snapshot);
    if (extended !== null) {
      row.endsAtMs = extended;
      this.touchListing(row.id);
    }
    return { ok: true, bid: this.bidOut(rec) };
  }

  async setBidBondQuote(bidId: number, reference: string, expiresAtMs: number): Promise<void> {
    const bid = this.bids.get(bidId);
    if (!bid || bid.status !== 'pending_bond') return;
    bid.bondReference = reference;
    bid.bondQuoteExpiresAtMs = expiresAtMs;
  }

  async bidById(id: number): Promise<WocBidRow | null> {
    const bid = this.bids.get(id);
    return bid ? this.bidOut(bid) : null;
  }

  /** Mirrors the real UPDATE's predicate exactly (realm + id + account +
   *  status). A fake that checked fewer arms would let the service's tests pass
   *  over SQL that never matched, which this suite has been bitten by before. */
  async abandonPendingBid(realm: string, bidId: number, account: number): Promise<boolean> {
    const bid = this.bids.get(bidId);
    if (!bid || bid.realm !== realm || bid.account !== account || bid.status !== 'pending_bond') {
      return false;
    }
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
        (bid) => bid.realm === realm && bid.status === 'pending_bond' && bid.placedAtMs <= cutoffMs,
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

  async promoteNextBidder(
    listingId: number,
    minCents: number,
    excludedAccounts: readonly number[],
  ): Promise<WocBidRow | null> {
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
    next.status = 'won';
    return this.bidOut(next);
  }

  async markBidStatus(bidId: number, status: WocBidStatus): Promise<void> {
    const bid = this.bids.get(bidId);
    if (bid) bid.status = status;
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

  async cancelOpenBidsForListing(listingId: number): Promise<WocBidRow[]> {
    const cancelled: WocBidRow[] = [];
    for (const bid of this.bids.values()) {
      if (
        bid.listingId === listingId &&
        (bid.status === 'pending_bond' || bid.status === 'active')
      ) {
        bid.status = 'cancelled';
        cancelled.push(this.bidOut(bid));
      }
    }
    return cancelled;
  }

  // -------------------------------------------------------------------------
  // Settlements
  // -------------------------------------------------------------------------

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
  }): Promise<WocSettlementRow | 'live_settlement_exists'> {
    const listing = this.listings.get(args.listingId);
    // Pg mirrors: INSERT..SELECT from a missing listing inserts no row.
    if (!listing) return 'live_settlement_exists';
    for (const s of this.settlements.values()) {
      if (s.listingId === args.listingId && LIVE_SETTLEMENT_STATES.includes(s.state)) {
        return 'live_settlement_exists';
      }
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
      if (s.listingId === listingId && LIVE_SETTLEMENT_STATES.includes(s.state)) {
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
    // The tx_signature UNIQUE constraint: any settlement already carrying the
    // signature refuses the reuse.
    for (const other of this.settlements.values()) {
      if (other.txSignature === signature) return 'signature_reused';
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

  async deliveringSettlements(realm: string, limit: number): Promise<WocSettlementRow[]> {
    return [...this.settlements.values()]
      .filter((s) => s.realm === realm && s.state === 'delivering')
      .sort(this.byTouch(this.settlementTouchMs))
      .slice(0, limit)
      .map((s) => this.settlementOut(s));
  }

  async overdueSettlements(
    realm: string,
    nowMs: number,
    limit: number,
  ): Promise<WocSettlementRow[]> {
    return [...this.settlements.values()]
      .filter(
        (s) =>
          s.realm === realm &&
          (s.state === 'offered' || s.state === 'failed') &&
          s.deadlineAtMs <= nowMs,
      )
      .sort((a, b) => a.deadlineAtMs - b.deadlineAtMs || a.id - b.id)
      .slice(0, limit)
      .map((s) => this.settlementOut(s));
  }

  // -------------------------------------------------------------------------
  // Sales, strikes, terms, delivery targets
  // -------------------------------------------------------------------------

  async insertSale(args: Omit<WocSaleRow, 'id' | 'excluded' | 'atMs'>): Promise<number> {
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

  async setSaleExcluded(id: number, excluded: boolean): Promise<boolean> {
    const row = this.sales.get(id);
    if (!row) return false;
    row.excluded = excluded;
    return true;
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
