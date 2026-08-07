// Postgres-backed WocMarketDb plus the $WOC Exchange schema. The schema is
// appended to the main ensureSchema() run in db.ts (idempotent CREATE/ALTER
// only, applied at every boot under the advisory lock). All SQL for the
// marketplace lives here; the lifecycle logic lives in woc_market.ts and the
// pure rules in woc_market_rules.ts.
//
// Concurrency model: every state transition is an atomic guarded UPDATE (or a
// short SELECT ... FOR UPDATE transaction), never check-then-write; sweep
// claims use FOR UPDATE SKIP LOCKED so a slow item never blocks the batch.
// Money is INTEGER USD CENTS end to end. Item snapshots are JSONB InvSlot
// copies (the escrow-by-removal custody model in docs/prd/woc/marketplace.md).

import type { Pool, PoolClient } from 'pg';
import type { ExtractRef } from '../src/sim/inventory_extract';
import type { InvSlot } from '../src/sim/types';
import {
  DB_HEAVY_STATEMENT_TIMEOUT_MS,
  saveCharacterState,
  saveCharacterStateOnClient,
} from './db';
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
} from './woc_market';
import type { WocBidStatus, WocSettlementState } from './woc_market_rules';
import { WOC_MARKET_MAX_ACTIVE_LISTINGS } from './woc_market_rules';

export const WOC_MARKET_SCHEMA = `
CREATE TABLE IF NOT EXISTS woc_market_listings (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  seller_account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Deliberately NOT an FK: deleting the seller's character must never
  -- destroy an escrowed copy; returns re-resolve a target at flight time.
  seller_character INT NOT NULL,
  seller_name TEXT NOT NULL,
  seller_wallet TEXT NOT NULL,
  item JSONB NOT NULL CHECK (jsonb_typeof(item) = 'object'),
  item_id TEXT NOT NULL,
  quality TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('auction', 'buy_now', 'auction_buy_now')),
  start_cents INT NOT NULL,
  reserve_cents INT,
  buy_now_cents INT,
  offer_next BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ending', 'settling', 'closed')),
  resolution TEXT
    CHECK (resolution IN ('sold', 'no_bids', 'reserve_not_met', 'unsettled', 'cancelled', 'suspended')),
  -- The custody flag: the escrowed copy has left the broker (delivered to the
  -- buyer or returned to the seller). Closed rows reconcile until it is true.
  item_disposed BOOLEAN NOT NULL DEFAULT false,
  current_bid_cents INT,
  current_bid_id BIGINT,
  ends_at TIMESTAMPTZ NOT NULL,
  base_ends_at TIMESTAMPTZ NOT NULL,
  buy_now_lock_account INT,
  buy_now_lock_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The sweep's due-claim seeks on this (realm + status='active' + ends_at).
CREATE INDEX IF NOT EXISTS woc_market_listings_realm_status_ends
  ON woc_market_listings(realm, status, ends_at);
-- Browse sorts: a three-status IN() over the index above is not an ordered
-- path, so each sort gets a partial index over the live set instead. Measured
-- before these existed: a realm at its listing cap planned a parallel seq scan
-- with a 3 MB external merge sort per page.
CREATE INDEX IF NOT EXISTS woc_market_listings_live_ends
  ON woc_market_listings(realm, ends_at, id)
  WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS woc_market_listings_live_created
  ON woc_market_listings(realm, created_at DESC, id)
  WHERE status <> 'closed';
-- The price sorts order by this exact expression; the index text must match
-- the query text verbatim for the planner to use it (the LIFETIME_XP_EXPR rule).
CREATE INDEX IF NOT EXISTS woc_market_listings_live_price
  ON woc_market_listings(realm, COALESCE(current_bid_cents, start_cents), id)
  WHERE status <> 'closed';
-- The item-id search filter.
CREATE INDEX IF NOT EXISTS woc_market_listings_live_item
  ON woc_market_listings(realm, item_id)
  WHERE status <> 'closed';
-- Seller reads: the activity tab pages newest-first, and the cap counts the
-- live set. Both were previously filtering realm after seeking the account.
CREATE INDEX IF NOT EXISTS woc_market_listings_seller_created
  ON woc_market_listings(realm, seller_account, created_at DESC);
CREATE INDEX IF NOT EXISTS woc_market_listings_seller_live
  ON woc_market_listings(realm, seller_account)
  WHERE status <> 'closed';
-- The return-flight reconciliation backlog: closed rows still holding a copy.
CREATE INDEX IF NOT EXISTS woc_market_listings_undisposed
  ON woc_market_listings(realm, updated_at)
  WHERE status = 'closed' AND item_disposed = false;
-- Retention prune cursor (closed, disposed, oldest first).
CREATE INDEX IF NOT EXISTS woc_market_listings_closed_updated
  ON woc_market_listings(updated_at)
  WHERE status = 'closed' AND item_disposed = true;

-- A DIRECTED sale: one named counterparty, agreed in the trade window and sold
-- on this same rail (docs/prd/woc/p2p-woc-trade.md). NULL is the ordinary public
-- listing, so every existing row keeps its meaning and the column is additive.
--
-- Keyed on ACCOUNT, not character, because the wallet check that decides whether
-- the buyer can pay is account-level, and the delivery character is already
-- recorded separately on the settlement. ON DELETE CASCADE matches
-- seller_account: a deleted account cannot be owed a directed sale.
ALTER TABLE woc_market_listings
  ADD COLUMN IF NOT EXISTS directed_buyer_account INT REFERENCES accounts(id) ON DELETE CASCADE;
-- The buyer's "offers made to me" read. Partial, because directed rows are a
-- small minority of the table and the public browse must never touch them.
CREATE INDEX IF NOT EXISTS woc_market_listings_directed_buyer
  ON woc_market_listings(realm, directed_buyer_account, created_at DESC)
  WHERE directed_buyer_account IS NOT NULL AND status <> 'closed';

CREATE TABLE IF NOT EXISTS woc_market_bids (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES woc_market_listings(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  character_id INT NOT NULL,
  character_name TEXT NOT NULL,
  wallet TEXT NOT NULL,
  amount_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_bond'
    CHECK (status IN ('pending_bond', 'active', 'outbid', 'lapsed', 'won', 'defaulted', 'cancelled')),
  bond_cents INT NOT NULL,
  bond_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (bond_state IN ('pending', 'held', 'void', 'refund_due', 'refunded', 'forfeit_due', 'forfeited')),
  bond_reference TEXT UNIQUE,
  bond_quote_expires TIMESTAMPTZ,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS woc_market_bids_listing ON woc_market_bids(listing_id, status);
CREATE INDEX IF NOT EXISTS woc_market_bids_account ON woc_market_bids(account, placed_at DESC);
-- The bond worker's queue (refunds and forfeits owed).
CREATE INDEX IF NOT EXISTS woc_market_bids_bond_due
  ON woc_market_bids(realm, placed_at)
  WHERE bond_state IN ('refund_due', 'forfeit_due');
-- The lapse sweep (unconfirmed bonds past their TTL), realm-scoped so one
-- realm's pass cannot spend its batch budget on a peer realm's bids.
CREATE INDEX IF NOT EXISTS woc_market_bids_pending
  ON woc_market_bids(realm, placed_at)
  WHERE status = 'pending_bond';

CREATE TABLE IF NOT EXISTS woc_market_settlements (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES woc_market_listings(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  bid_id BIGINT REFERENCES woc_market_bids(id) ON DELETE SET NULL,
  attempt INT NOT NULL,
  buyer_account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  buyer_character INT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_wallet TEXT NOT NULL,
  amount_cents INT NOT NULL,
  state TEXT NOT NULL DEFAULT 'offered'
    CHECK (state IN ('offered', 'confirming', 'confirmed', 'delivering', 'delivered', 'expired', 'failed')),
  quote_reference TEXT,
  quote_expires TIMESTAMPTZ,
  -- Base-unit token amount from the stamped quote, kept for sale provenance.
  settled_amount_base TEXT,
  tx_signature TEXT UNIQUE,
  fail_reason TEXT,
  deadline_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Exactly one live settlement per listing (offers, confirmations, delivery).
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_live
  ON woc_market_settlements(listing_id)
  WHERE state IN ('offered', 'confirming', 'confirmed', 'delivering');
CREATE INDEX IF NOT EXISTS woc_market_settlements_state
  ON woc_market_settlements(realm, state, deadline_at);
-- The confirming/delivering backlog arms order by updated_at; without this
-- they scanned the live-settlement index and sorted.
CREATE INDEX IF NOT EXISTS woc_market_settlements_state_updated
  ON woc_market_settlements(realm, state, updated_at);
CREATE INDEX IF NOT EXISTS woc_market_settlements_buyer
  ON woc_market_settlements(buyer_account, created_at DESC);
-- Postgres does not auto-index the referencing side of an FK. Without these,
-- every listing the retention prune deletes runs one sequential scan of the
-- settlements table per row (ON DELETE CASCADE), and every cascaded bid
-- delete runs another (ON DELETE SET NULL on bid_id).
CREATE INDEX IF NOT EXISTS woc_market_settlements_listing
  ON woc_market_settlements(listing_id);
CREATE INDEX IF NOT EXISTS woc_market_settlements_bid
  ON woc_market_settlements(bid_id);

-- Provenance and public price history. KEEP FOREVER by default: sales are the
-- marketplace's provenance record (docs/prd/woc/marketplace.md "Integrity");
-- no FK to listings so the listing prune never erases history.
CREATE TABLE IF NOT EXISTS woc_market_sales (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  listing_id BIGINT NOT NULL,
  item_id TEXT NOT NULL,
  item JSONB NOT NULL CHECK (jsonb_typeof(item) = 'object'),
  price_cents INT NOT NULL,
  amount_base TEXT,
  seller_account INT NOT NULL,
  buyer_account INT NOT NULL,
  seller_name TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  excluded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS woc_market_sales_item
  ON woc_market_sales(realm, item_id, created_at DESC);

-- The DURABLE book-once ledger for custody parcels. The mail book lives in a
-- JSONB blob whose per-letter marker a player can delete (an emptied letter is
-- deletable) and which an older binary's loader would strip, so the blob can
-- never be the authority for "this parcel was already booked". A worker CLAIMS
-- the ref here first and books the parcel only on a fresh claim: the unique
-- constraint makes a retry a no-op. Failure direction is deliberate: a claim
-- with no parcel leaves the item held and VISIBLE to the operator (the row's
-- booked_at stays null), never silently duplicated.
CREATE TABLE IF NOT EXISTS woc_market_custody_claims (
  custody_ref TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  booked_at TIMESTAMPTZ
);
-- The operator/diagnostic read: claims that never completed their booking.
CREATE INDEX IF NOT EXISTS woc_market_custody_claims_unbooked
  ON woc_market_custody_claims(realm, claimed_at)
  WHERE booked_at IS NULL;

-- Account-scoped (deliberately realm-free): defaults follow the account.
CREATE TABLE IF NOT EXISTS woc_market_strikes (
  account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  strikes INT NOT NULL DEFAULT 0,
  suspended_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Account-scoped (deliberately realm-free): one acceptance of the
-- variable-token settlement terms per account.
CREATE TABLE IF NOT EXISTS woc_market_terms (
  account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A directed OFFER: the BUYER's proposed p2p purchase, before the seller agrees.
--
-- The buyer opens the deal by naming a price in the trade window, exactly the
-- way they would push gold across, and the seller answers by staging the goods.
-- So the offer carries a price and NO item: item_ref and item_id stay null
-- until acceptance, when the seller names the copy they are parting with.
--
-- This precedes the listing rather than being one, because escrow happens at
-- mutual acceptance (docs/prd/woc/p2p-woc-trade.md): escrowing earlier would
-- let anyone lock a chosen player's goods by proposing deals they never intend
-- to complete. Accepting is what creates the directed listing and takes the
-- item into custody, and from there the ordinary buy-now settlement runs.
--
-- The item is REFERENCED, not held: item_ref carries the same {index, itemId,
-- expectInstance} an extraction takes, captured at acceptance and validated in
-- the same call, so a copy that moved refuses as a stale copy.
CREATE TABLE IF NOT EXISTS woc_market_directed_offers (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  seller_account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Deliberately NOT an FK, matching woc_market_listings.seller_character.
  seller_character INT NOT NULL,
  seller_name TEXT NOT NULL,
  buyer_account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  -- Null until the seller accepts and names the copy (see the header).
  item_ref JSONB CHECK (item_ref IS NULL OR jsonb_typeof(item_ref) = 'object'),
  item_id TEXT,
  usd_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  -- Set when accepted: the directed listing this offer became.
  listing_id BIGINT REFERENCES woc_market_listings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The buyer's inbox and the seller's outbox: both page the pending set only.
CREATE INDEX IF NOT EXISTS woc_market_offers_buyer_pending
  ON woc_market_directed_offers(realm, buyer_account, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS woc_market_offers_seller_pending
  ON woc_market_directed_offers(realm, seller_account, created_at DESC)
  WHERE status = 'pending';
-- The expiry sweep's due-claim seek.
CREATE INDEX IF NOT EXISTS woc_market_offers_due
  ON woc_market_directed_offers(realm, expires_at)
  WHERE status = 'pending';
-- Retention prune cursor (resolved offers, oldest first). This table grows per
-- offer, so it registers a prune primitive rather than keeping forever.
CREATE INDEX IF NOT EXISTS woc_market_offers_resolved_updated
  ON woc_market_directed_offers(updated_at)
  WHERE status <> 'pending';
-- The offer inverted after the table first shipped (the buyer now opens the
-- deal, so the item is unknown until acceptance). Dropping the NOT NULL is
-- additive and idempotent; a pre-existing row keeps its item.
ALTER TABLE woc_market_directed_offers ALTER COLUMN item_ref DROP NOT NULL;
ALTER TABLE woc_market_directed_offers ALTER COLUMN item_id DROP NOT NULL;
-- Both sides accept through the trade window's ordinary Accept button, so the
-- offer tracks each side's agreement and only the LAST one escrows. Additive.
ALTER TABLE woc_market_directed_offers
  ADD COLUMN IF NOT EXISTS buyer_accepted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE woc_market_directed_offers
  ADD COLUMN IF NOT EXISTS seller_accepted BOOLEAN NOT NULL DEFAULT false;
`;

/** Lock-wait ceiling for the escrow transaction's accounts row. Short on
 *  purpose: a blocked escrow holds a pooled client, and the pool is shared
 *  with the game loop's autosave and the WS handshake. */
const ESCROW_LOCK_TIMEOUT_MS = 2_000;

const LISTING_COLS =
  'id, realm, seller_account, seller_character, seller_name, seller_wallet, item, item_id, ' +
  'quality, format, start_cents, reserve_cents, buy_now_cents, offer_next, status, resolution, ' +
  'item_disposed, current_bid_cents, current_bid_id, ends_at, base_ends_at, ' +
  'buy_now_lock_account, buy_now_lock_expires, created_at, directed_buyer_account';

const OFFER_COLS =
  'id, realm, seller_account, seller_character, seller_name, buyer_account, buyer_name, ' +
  'item_ref, item_id, usd_cents, status, listing_id, created_at, expires_at, ' +
  'buyer_accepted, seller_accepted';

/**
 * How long a SETTLED offer stays readable after its listing closes.
 *
 * The completion moment has to survive long enough for both clients to observe
 * it on their own poll (2s) and act on it: show the outcome, then close. Sized
 * with a wide margin over that, because the cost of being generous is only that
 * a finished deal lingers in a read, while the cost of being tight is a sale
 * that silently disappears, which is the bug this exists to fix.
 *
 * It does NOT gate starting a fresh trade: each client retires an offer id once
 * it has shown the outcome, so the window's length is invisible to players.
 */
export const SETTLED_OFFER_GRACE_MS = 90_000;

const BID_COLS =
  'id, listing_id, account, character_id, character_name, wallet, amount_cents, status, ' +
  'bond_cents, bond_state, bond_reference, bond_quote_expires, placed_at';

const SETTLEMENT_COLS =
  'id, listing_id, bid_id, attempt, buyer_account, buyer_character, buyer_name, buyer_wallet, ' +
  'amount_cents, state, quote_reference, quote_expires, settled_amount_base, tx_signature, ' +
  'fail_reason, deadline_at, created_at';

function ms(value: unknown): number {
  return value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
}

function msOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : ms(value);
}

// biome-ignore lint/suspicious/noExplicitAny: raw pg rows are untyped by nature.
type Row = Record<string, any>;

function toListing(row: Row): WocListingRow {
  return {
    id: Number(row.id),
    realm: row.realm,
    sellerAccount: row.seller_account,
    sellerCharacter: row.seller_character,
    sellerName: row.seller_name,
    sellerWallet: row.seller_wallet,
    item: row.item as InvSlot,
    itemId: row.item_id,
    quality: row.quality,
    format: row.format,
    startCents: row.start_cents,
    reserveCents: row.reserve_cents ?? null,
    buyNowCents: row.buy_now_cents ?? null,
    offerNext: row.offer_next === true,
    status: row.status,
    resolution: (row.resolution ?? null) as WocListingResolution | null,
    itemDisposed: row.item_disposed === true,
    currentBidCents: row.current_bid_cents ?? null,
    currentBidId: row.current_bid_id === null ? null : Number(row.current_bid_id),
    endsAtMs: ms(row.ends_at),
    baseEndsAtMs: ms(row.base_ends_at),
    buyNowLockAccount: row.buy_now_lock_account ?? null,
    buyNowLockExpiresMs: msOrNull(row.buy_now_lock_expires),
    createdAtMs: ms(row.created_at),
    directedBuyerAccount: row.directed_buyer_account ?? null,
  };
}

function toOffer(row: Row): WocDirectedOfferRow {
  return {
    id: Number(row.id),
    realm: row.realm,
    sellerAccount: row.seller_account,
    sellerCharacter: row.seller_character,
    sellerName: row.seller_name,
    buyerAccount: row.buyer_account,
    buyerName: row.buyer_name,
    itemRef: (row.item_ref ?? null) as ExtractRef | null,
    itemId: row.item_id ?? null,
    usdCents: row.usd_cents,
    status: row.status as WocDirectedOfferStatus,
    listingId: row.listing_id === null ? null : Number(row.listing_id),
    createdAtMs: ms(row.created_at),
    expiresAtMs: ms(row.expires_at),
    buyerAccepted: row.buyer_accepted === true,
    sellerAccepted: row.seller_accepted === true,
    listingStatus: (row.listing_status ?? null) as string | null,
    listingResolution: (row.listing_resolution ?? null) as string | null,
    settlementState: (row.settlement_state ?? null) as string | null,
  };
}

function toBid(row: Row): WocBidRow {
  return {
    id: Number(row.id),
    listingId: Number(row.listing_id),
    account: row.account,
    characterId: row.character_id,
    characterName: row.character_name,
    wallet: row.wallet,
    amountCents: row.amount_cents,
    status: row.status as WocBidStatus,
    bondCents: row.bond_cents,
    bondState: row.bond_state as WocBondState,
    bondReference: row.bond_reference ?? null,
    bondQuoteExpiresAtMs: msOrNull(row.bond_quote_expires),
    placedAtMs: ms(row.placed_at),
  };
}

function toSettlement(row: Row): WocSettlementRow {
  return {
    id: Number(row.id),
    listingId: Number(row.listing_id),
    bidId: row.bid_id === null ? null : Number(row.bid_id),
    attempt: row.attempt,
    buyerAccount: row.buyer_account,
    buyerCharacter: row.buyer_character,
    buyerName: row.buyer_name,
    buyerWallet: row.buyer_wallet,
    amountCents: row.amount_cents,
    state: row.state as WocSettlementState,
    quoteReference: row.quote_reference ?? null,
    quoteExpiresAtMs: msOrNull(row.quote_expires),
    txSignature: row.tx_signature ?? null,
    failReason: row.fail_reason ?? null,
    settledAmountBase: row.settled_amount_base ?? null,
    deadlineAtMs: ms(row.deadline_at),
    createdAtMs: ms(row.created_at),
  };
}

function toSale(row: Row): WocSaleRow {
  return {
    id: Number(row.id),
    realm: row.realm,
    listingId: Number(row.listing_id),
    itemId: row.item_id,
    item: row.item as InvSlot,
    priceCents: row.price_cents,
    amountBase: row.amount_base ?? null,
    sellerAccount: row.seller_account,
    buyerAccount: row.buyer_account,
    sellerName: row.seller_name,
    buyerName: row.buyer_name,
    excluded: row.excluded === true,
    atMs: ms(row.created_at),
  };
}

/** Control-flow marker: abort the enclosing withTx (ROLLBACK, discarding any
 *  write already made this transaction) and resolve with `value` instead. */
class TxAbort<T> {
  constructor(readonly value: T) {}
}

export class PgWocMarketDb implements WocMarketDb {
  constructor(private readonly pool: Pool) {}

  private async withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof TxAbort) return err.value as T;
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------
  // Listings
  // ---------------------------------------------------------------------

  async escrowInsertListing(
    save: CharacterSaveArgs,
    listing: NewWocListing,
  ): Promise<{ ok: true; id: number } | { ok: false; reason: 'lease_lost' | 'cap_reached' }> {
    return this.withTx(async (client) => {
      // A logout-race save should wait out a slow database, not lose the
      // escrow halves (the saveCharacterAndMarketState rationale). The LOCK
      // wait is bounded separately and tightly: without lock_timeout, ten
      // rate-limit-compliant listings for one account can each block up to the
      // heavy allowance on the same accounts row and pin the whole pool
      // (DB_POOL_MAX_CLIENTS), starving the game loop's own saves.
      await client.query(`SET LOCAL statement_timeout = ${DB_HEAVY_STATEMENT_TIMEOUT_MS}`);
      await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
      // Lock ORDER is accounts-then-characters, matching every established
      // capped-insert path (db.ts createCharacterCapped, maps_db, user_assets_db),
      // so no future accounts-first path can deadlock against this one. The cap
      // is counted under the lock and NOT re-counted outside it.
      await client.query('SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE', [
        listing.sellerAccount,
      ]);
      // The cap is PUBLIC-listing-only in both directions, matching the service's
      // pre-check: a directed offer is exempt from it and invisible to it. This
      // is the AUTHORITATIVE half (the pre-check races; this runs under the row
      // lock), so the exemption has to be spelled here too or a directed offer
      // would pass the pre-check and abort in the transaction.
      if (listing.params.directedBuyerAccount === null) {
        const count = await client.query(
          `SELECT COUNT(*)::int AS n FROM woc_market_listings
            WHERE realm = $1 AND seller_account = $2 AND status <> 'closed'
              AND directed_buyer_account IS NULL`,
          [listing.realm, listing.sellerAccount],
        );
        if ((count.rows[0]?.n ?? 0) >= WOC_MARKET_MAX_ACTIVE_LISTINGS) {
          throw new TxAbort({ ok: false as const, reason: 'cap_reached' as const });
        }
      }
      const saved = await saveCharacterStateOnClient(
        client,
        save.characterId,
        save.level,
        save.state,
        save.leaseNonce,
      );
      if (!saved) {
        throw new TxAbort({ ok: false as const, reason: 'lease_lost' as const });
      }
      const inserted = await client.query(
        `INSERT INTO woc_market_listings (
           realm, seller_account, seller_character, seller_name, seller_wallet,
           item, item_id, quality, format, start_cents, reserve_cents,
           buy_now_cents, offer_next, ends_at, base_ends_at, directed_buyer_account
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   to_timestamp($14 / 1000.0), to_timestamp($14 / 1000.0), $15)
         RETURNING id`,
        [
          listing.realm,
          listing.sellerAccount,
          listing.sellerCharacter,
          listing.sellerName,
          listing.sellerWallet,
          JSON.stringify(listing.item),
          listing.itemId,
          listing.quality,
          listing.params.format,
          listing.params.startCents,
          listing.params.reserveCents,
          listing.params.buyNowCents,
          listing.params.offerNext,
          listing.endsAtMs,
          listing.params.directedBuyerAccount,
        ],
      );
      return { ok: true as const, id: Number(inserted.rows[0].id) };
    });
  }

  async listingById(realm: string, id: number): Promise<WocListingRow | null> {
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS} FROM woc_market_listings WHERE realm = $1 AND id = $2`,
      [realm, id],
    );
    return res.rows[0] ? toListing(res.rows[0]) : null;
  }

  async browseListings(
    realm: string,
    q: WocBrowseQuery,
  ): Promise<{ rows: WocListingRow[]; hasMore: boolean }> {
    // A directed sale is addressed to ONE named account, so it must never enter
    // the public result set: a stranger who saw it could buy an item meant for
    // someone else. This is a security boundary, not a display preference, which
    // is why it is unconditional here rather than an option on WocBrowseQuery.
    // The buyNow guard refuses a non-designated buyer as well, so this and that
    // are two independent defences over the same rule.
    const where: string[] = [
      'realm = $1',
      "status IN ('active', 'settling', 'ending')",
      'directed_buyer_account IS NULL',
    ];
    const params: unknown[] = [realm];
    if (q.quality) {
      params.push(q.quality);
      where.push(`quality = $${params.length}`);
    }
    if (q.format) {
      params.push(q.format);
      where.push(`format = $${params.length}`);
    }
    if (q.itemIds && q.itemIds.length > 0) {
      params.push(q.itemIds.slice(0, 50));
      where.push(`item_id = ANY($${params.length})`);
    }
    const order =
      q.sort === 'newest'
        ? 'created_at DESC'
        : q.sort === 'price_asc'
          ? 'COALESCE(current_bid_cents, start_cents) ASC, id'
          : q.sort === 'price_desc'
            ? 'COALESCE(current_bid_cents, start_cents) DESC, id'
            : 'ends_at ASC, id';
    const pageSize = Math.min(Math.max(1, q.pageSize), 50);
    const offset = Math.max(0, q.page) * pageSize;
    // A has-more PROBE, never COUNT(*) OVER(): the window count forces a read
    // of every live listing on every page, which measured as a parallel seq
    // scan plus an external merge sort at a realm's listing cap. The client
    // pager only needs to know whether a next page exists.
    params.push(pageSize + 1, offset);
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS}
         FROM woc_market_listings
        WHERE ${where.join(' AND ')}
        ORDER BY ${order}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const hasMore = res.rows.length > pageSize;
    const rows = (hasMore ? res.rows.slice(0, pageSize) : res.rows).map(toListing);
    return { rows, hasMore };
  }

  async listingsBySeller(realm: string, account: number): Promise<WocListingRow[]> {
    // Ordered by the woc_market_listings_seller_created index.
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS} FROM woc_market_listings
        WHERE realm = $1 AND seller_account = $2
        ORDER BY created_at DESC LIMIT 50`,
      [realm, account],
    );
    return res.rows.map(toListing);
  }

  /**
   * The 12-listing cap counts PUBLIC listings only.
   *
   * The cap exists to bound two things: how much of one seller's inventory sits
   * in escrow, and how far one seller can flood the public browse. A directed
   * offer is addressed to a single named account and never appears in browse, so
   * it cannot flood anything, and the requester chose to exempt it: a private
   * deal with a friend should not be blocked because the seller happens to have
   * twelve auctions running.
   *
   * The escrow half of the bound is genuinely loosened by that, and the
   * mitigation is elsewhere: a directed offer holds its item only for the
   * settlement window, which is far shorter than an auction's 12 to 48 hours.
   */
  async countActiveBySeller(realm: string, account: number): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM woc_market_listings
        WHERE realm = $1 AND seller_account = $2 AND status <> 'closed'
          AND directed_buyer_account IS NULL`,
      [realm, account],
    );
    return res.rows[0]?.n ?? 0;
  }

  // --- Directed p2p offers ---------------------------------------------------

  async insertDirectedOffer(offer: {
    realm: string;
    sellerAccount: number;
    sellerCharacter: number;
    sellerName: string;
    buyerAccount: number;
    buyerName: string;
    usdCents: number;
    expiresAtMs: number;
  }): Promise<WocDirectedOfferRow> {
    const res = await this.pool.query(
      `INSERT INTO woc_market_directed_offers (
         realm, seller_account, seller_character, seller_name,
         buyer_account, buyer_name, usd_cents, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
       RETURNING ${OFFER_COLS}`,
      [
        offer.realm,
        offer.sellerAccount,
        offer.sellerCharacter,
        offer.sellerName,
        offer.buyerAccount,
        offer.buyerName,
        offer.usdCents,
        offer.expiresAtMs,
      ],
    );
    return toOffer(res.rows[0]);
  }

  async directedOfferById(realm: string, id: number): Promise<WocDirectedOfferRow | null> {
    const res = await this.pool.query(
      `SELECT ${OFFER_COLS} FROM woc_market_directed_offers WHERE realm = $1 AND id = $2`,
      [realm, id],
    );
    return res.rows[0] ? toOffer(res.rows[0]) : null;
  }

  async directedOffersForAccount(
    realm: string,
    account: number,
    nowMs: number = Date.now(),
  ): Promise<WocDirectedOfferRow[]> {
    // 'accepted' rides along with 'pending' because the deal is not over when it
    // is agreed: the buyer still has to pay, and BOTH windows need to show that
    // phase. The listing's own status comes with it so the seller can tell
    // "waiting for payment" from "paid", without a second round trip.
    const cols = OFFER_COLS.split(', ')
      .map((c) => `o.${c}`)
      .join(', ');
    const res = await this.pool.query(
      `SELECT ${cols}, l.status AS listing_status, l.resolution AS listing_resolution,
              s.state AS settlement_state
         FROM woc_market_directed_offers o
         LEFT JOIN woc_market_listings l ON l.id = o.listing_id
         -- The LATEST settlement for the listing, which is the one in flight.
         -- A buyer may retry after a failure, so the newest row is the only one
         -- that describes what is happening now; older attempts are history.
         LEFT JOIN LATERAL (
           SELECT state FROM woc_market_settlements
            WHERE listing_id = o.listing_id
            ORDER BY id DESC LIMIT 1
         ) s ON o.listing_id IS NOT NULL
        WHERE o.realm = $1
          AND o.status IN ('pending', 'accepted')
          AND (o.buyer_account = $2 OR o.seller_account = $2)
          -- A finished sale is history, not a live deal: left visible forever a
          -- completed offer sits in both trade windows showing "Paid" and blocks
          -- the pair from starting a fresh one, because the arm believes a deal
          -- is already standing.
          --
          -- But dropping it the INSTANT the listing closes is the opposite bug,
          -- and it is the one that shipped: 'settled' became unreachable, so
          -- neither side ever saw the sale complete. The window simply emptied,
          -- which reads as the item being sent for nothing. A closed listing
          -- therefore stays visible for a short grace window, long enough for
          -- both clients to poll it, show the outcome and close themselves.
          AND (
            o.listing_id IS NULL
            OR l.status <> 'closed'
            OR l.updated_at > $3
          )
        ORDER BY o.created_at DESC LIMIT 50`,
      [realm, account, new Date(nowMs - SETTLED_OFFER_GRACE_MS)],
    );
    return res.rows.map(toOffer);
  }

  async resolveDirectedOffer(
    realm: string,
    id: number,
    to: Exclude<WocDirectedOfferStatus, 'pending'>,
    opts: { listingId?: number } = {},
  ): Promise<WocDirectedOfferRow | null> {
    // Two arms, and the second one is easy to lose.
    //
    // The 'pending' predicate is the compare-and-set: two concurrent accepts
    // both read 'pending', only one UPDATE matches, so only one reaches escrow.
    //
    // The service then calls back a SECOND time to stamp the listing id onto the
    // offer it just created, and by then the row is 'accepted', not 'pending'.
    // Narrowed to the first arm alone that write matched zero rows and the offer
    // never learned its listing, so both windows saw a deal stuck at "review"
    // forever and the buyer was never offered the chance to pay. The stamp is
    // therefore allowed on an accepted row that has no listing yet, which cannot
    // resurrect anything: it changes no status and refuses once one is set.
    const res = await this.pool.query(
      `UPDATE woc_market_directed_offers
          SET status = $3, listing_id = COALESCE($4, listing_id), updated_at = now()
        WHERE realm = $1 AND id = $2
          AND (
            status = 'pending'
            OR ($3 = 'accepted' AND status = 'accepted'
                AND listing_id IS NULL AND $4::bigint IS NOT NULL)
          )
        RETURNING ${OFFER_COLS}`,
      [realm, id, to, opts.listingId ?? null],
    );
    return res.rows[0] ? toOffer(res.rows[0]) : null;
  }

  async characterByName(
    realm: string,
    name: string,
  ): Promise<{ characterId: number; accountId: number; name: string } | null> {
    // Exact match on the UNIQUE name column, realm-scoped like every other read
    // here. Not case-insensitive: the client passes back the name the server
    // itself sent on the trade, so a fold would only widen what resolves.
    const res = await this.pool.query(
      'SELECT id, account_id, name FROM characters WHERE name = $1 AND realm = $2',
      [name, realm],
    );
    const row = res.rows[0];
    return row ? { characterId: row.id, accountId: row.account_id, name: row.name } : null;
  }

  /**
   * Record one side's acceptance, and the seller's chosen copy with it.
   *
   * Returns the row AFTER the write, so the caller can see whether that
   * acceptance was the second one. Narrowed to pending, so a resolved offer
   * cannot gain an acceptance.
   */
  async acceptDirectedOfferSide(
    realm: string,
    id: number,
    side: 'buyer' | 'seller',
    itemRef: ExtractRef | null,
  ): Promise<WocDirectedOfferRow | null> {
    const col = side === 'buyer' ? 'buyer_accepted' : 'seller_accepted';
    const res = await this.pool.query(
      `UPDATE woc_market_directed_offers
          SET ${col} = true,
              item_ref = COALESCE($3::jsonb, item_ref),
              item_id = COALESCE($4, item_id),
              updated_at = now()
        WHERE realm = $1 AND id = $2 AND status = 'pending'
        RETURNING ${OFFER_COLS}`,
      [realm, id, itemRef === null ? null : JSON.stringify(itemRef), itemRef?.itemId ?? null],
    );
    return res.rows[0] ? toOffer(res.rows[0]) : null;
  }

  async reopenDirectedOffer(realm: string, id: number): Promise<void> {
    // listing_id IS NULL is the safety: an offer that genuinely became a listing
    // must never be reopened, or the item could be escrowed a second time.
    await this.pool.query(
      `UPDATE woc_market_directed_offers
          SET status = 'pending', updated_at = now()
        WHERE realm = $1 AND id = $2 AND status = 'accepted' AND listing_id IS NULL`,
      [realm, id],
    );
  }

  async expireDueDirectedOffers(realm: string, nowMs: number, limit: number): Promise<number> {
    const res = await this.pool.query(
      `UPDATE woc_market_directed_offers
          SET status = 'expired', updated_at = now()
        WHERE id IN (
          SELECT id FROM woc_market_directed_offers
           WHERE realm = $1 AND status = 'pending' AND expires_at <= to_timestamp($2 / 1000.0)
           LIMIT $3
        )`,
      [realm, nowMs, limit],
    );
    return res.rowCount ?? 0;
  }

  /** The buyer's side: directed offers addressed to this account. Rides the
   *  woc_market_listings_directed_buyer partial index. */
  async directedOffersForBuyer(realm: string, account: number): Promise<WocListingRow[]> {
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS} FROM woc_market_listings
        WHERE realm = $1 AND directed_buyer_account = $2 AND status <> 'closed'
        ORDER BY created_at DESC LIMIT 50`,
      [realm, account],
    );
    return res.rows.map(toListing);
  }

  async cancelListingIfUnbid(
    realm: string,
    id: number,
    sellerAccount: number,
  ): Promise<WocListingRow | 'not_found' | 'not_yours' | 'has_bids' | 'not_active'> {
    return this.withTx(async (client) => {
      const res = await client.query(
        `SELECT ${LISTING_COLS} FROM woc_market_listings
          WHERE realm = $1 AND id = $2 FOR UPDATE`,
        [realm, id],
      );
      const row = res.rows[0];
      if (!row) return 'not_found' as const;
      if (row.seller_account !== sellerAccount) return 'not_yours' as const;
      if (row.status !== 'active') return 'not_active' as const;
      const bids = await client.query(
        `SELECT 1 FROM woc_market_bids
          WHERE listing_id = $1 AND status IN ('pending_bond', 'active') LIMIT 1`,
        [id],
      );
      if ((bids.rowCount ?? 0) > 0) return 'has_bids' as const;
      const updated = await client.query(
        `UPDATE woc_market_listings
            SET status = 'closed', resolution = 'cancelled', updated_at = now()
          WHERE id = $1
          RETURNING ${LISTING_COLS}`,
        [id],
      );
      return toListing(updated.rows[0]);
    });
  }

  async claimDueListings(realm: string, nowMs: number, limit: number): Promise<WocListingRow[]> {
    const res = await this.pool.query(
      `UPDATE woc_market_listings SET status = 'ending', updated_at = now()
        WHERE id IN (
          SELECT id FROM woc_market_listings
           WHERE realm = $1 AND status = 'active' AND ends_at <= to_timestamp($2 / 1000.0)
           ORDER BY ends_at
           LIMIT $3
           FOR UPDATE SKIP LOCKED)
        RETURNING ${LISTING_COLS}`,
      [realm, nowMs, limit],
    );
    return res.rows.map(toListing);
  }

  async closeListing(id: number, resolution: WocListingResolution): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_listings
          SET status = 'closed', resolution = $2, updated_at = now()
        WHERE id = $1 AND status <> 'closed'`,
      [id, resolution],
    );
  }

  async markListingSettling(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_listings SET status = 'settling', updated_at = now()
        WHERE id = $1 AND status IN ('ending', 'active', 'settling')`,
      [id],
    );
  }

  async undisposedClosedListings(realm: string, limit: number): Promise<WocListingRow[]> {
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS} FROM woc_market_listings
        WHERE realm = $1 AND status = 'closed' AND item_disposed = false
        ORDER BY updated_at
        LIMIT $2`,
      [realm, limit],
    );
    return res.rows.map(toListing);
  }

  async strandedListings(
    realm: string,
    olderThanMs: number,
    limit: number,
  ): Promise<WocListingRow[]> {
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS} FROM woc_market_listings
        WHERE realm = $1 AND status IN ('ending', 'settling')
          AND updated_at <= to_timestamp($2 / 1000.0)
        ORDER BY updated_at
        LIMIT $3`,
      [realm, olderThanMs, limit],
    );
    return res.rows.map(toListing);
  }

  async reopenListing(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_listings SET status = 'active', updated_at = now()
        WHERE id = $1 AND status IN ('ending', 'settling')`,
      [id],
    );
  }

  async claimCustodyRef(realm: string, custodyRef: string): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO woc_market_custody_claims (custody_ref, realm)
       VALUES ($2, $1)
       ON CONFLICT (custody_ref) DO NOTHING`,
      [realm, custodyRef],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async markCustodyRefBooked(custodyRef: string): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_custody_claims SET booked_at = now()
        WHERE custody_ref = $1 AND booked_at IS NULL`,
      [custodyRef],
    );
  }

  /** The buyer's bags after a hand-to-hand delivery, lease-fenced like every
   *  other character write here: false means a takeover rotated the nonce and
   *  this process must not claim the delivery landed. */
  async saveDeliveredCharacter(save: CharacterSaveArgs): Promise<boolean> {
    return saveCharacterState(save.characterId, save.level, save.state, save.leaseNonce);
  }

  async unclaimCustodyRef(custodyRef: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM woc_market_custody_claims
        WHERE custody_ref = $1 AND booked_at IS NULL`,
      [custodyRef],
    );
  }

  async markItemDisposed(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_listings SET item_disposed = true, updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async claimBuyNowLock(
    realm: string,
    id: number,
    account: number,
    nowMs: number,
    expiresAtMs: number,
  ): Promise<WocListingRow | 'not_found' | 'not_active' | 'locked' | 'no_buy_now' | 'own_listing'> {
    const res = await this.pool.query(
      `UPDATE woc_market_listings
          SET buy_now_lock_account = $3,
              buy_now_lock_expires = to_timestamp($5 / 1000.0),
              updated_at = now()
        WHERE realm = $1 AND id = $2 AND status = 'active'
          AND buy_now_cents IS NOT NULL
          AND seller_account <> $3
          AND (buy_now_lock_account IS NULL OR buy_now_lock_expires <= to_timestamp($4 / 1000.0))
        RETURNING ${LISTING_COLS}`,
      [realm, id, account, nowMs, expiresAtMs],
    );
    if (res.rows[0]) return toListing(res.rows[0]);
    // Diagnose the refusal for a precise client error.
    const peek = await this.pool.query(
      'SELECT seller_account, status, buy_now_cents, buy_now_lock_expires FROM woc_market_listings WHERE realm = $1 AND id = $2',
      [realm, id],
    );
    const row = peek.rows[0];
    if (!row) return 'not_found';
    if (row.seller_account === account) return 'own_listing';
    if (row.status !== 'active') return 'not_active';
    if (row.buy_now_cents === null) return 'no_buy_now';
    return 'locked';
  }

  async clearBuyNowLock(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_listings
          SET buy_now_lock_account = NULL, buy_now_lock_expires = NULL, updated_at = now()
        WHERE id = $1`,
      [id],
    );
  }

  // ---------------------------------------------------------------------
  // Bids
  // ---------------------------------------------------------------------

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
    return this.withTx(async (client) => {
      const res = await client.query(
        `SELECT ${LISTING_COLS} FROM woc_market_listings
          WHERE realm = $1 AND id = $2 FOR UPDATE`,
        [args.realm, args.listingId],
      );
      if (!res.rows[0]) return { ok: false, reason: 'not_found' as const };
      const listing = toListing(res.rows[0]);
      if (listing.status !== 'active') return { ok: false, reason: 'not_active' as const };
      if (listing.endsAtMs <= args.nowMs) return { ok: false, reason: 'not_active' as const };
      if (listing.sellerAccount === args.account) {
        return { ok: false, reason: 'own_listing' as const };
      }
      // One wallet is one bidder: a seller cannot bid through a second
      // account sharing the payout wallet.
      if (listing.sellerWallet === args.wallet) {
        return { ok: false, reason: 'own_listing' as const };
      }
      if (args.amountCents < args.minNext(listing)) {
        return { ok: false, reason: 'bid_too_low' as const };
      }
      const pending = await client.query(
        `SELECT 1 FROM woc_market_bids
          WHERE listing_id = $1 AND account = $2 AND status = 'pending_bond' LIMIT 1`,
        [args.listingId, args.account],
      );
      if ((pending.rowCount ?? 0) > 0) return { ok: false, reason: 'already_pending' as const };
      const inserted = await client.query(
        `INSERT INTO woc_market_bids (
           listing_id, realm, account, character_id, character_name, wallet,
           amount_cents, bond_cents
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${BID_COLS}`,
        [
          args.listingId,
          args.realm,
          args.account,
          args.characterId,
          args.characterName,
          args.wallet,
          args.amountCents,
          args.bondCents,
        ],
      );
      // Anti-snipe extension applies at PLACEMENT: a pending bid near the
      // close extends the clock (bounded by the cap) even if its bond never
      // confirms, so a confirmation in flight can never land after a close.
      const extended = args.extendEndsToMs(listing);
      if (extended !== null) {
        await client.query(
          `UPDATE woc_market_listings SET ends_at = to_timestamp($2 / 1000.0), updated_at = now()
            WHERE id = $1`,
          [args.listingId, extended],
        );
      }
      return { ok: true as const, bid: toBid(inserted.rows[0]) };
    });
  }

  async setBidBondQuote(bidId: number, reference: string, expiresAtMs: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_bids
          SET bond_reference = $2, bond_quote_expires = to_timestamp($3 / 1000.0)
        WHERE id = $1 AND status = 'pending_bond'`,
      [bidId, reference, expiresAtMs],
    );
  }

  async bidById(id: number): Promise<WocBidRow | null> {
    const res = await this.pool.query(`SELECT ${BID_COLS} FROM woc_market_bids WHERE id = $1`, [
      id,
    ]);
    return res.rows[0] ? toBid(res.rows[0]) : null;
  }

  /**
   * Withdraw a bid the bidder never funded.
   *
   * Compare-and-set on BOTH the owner and the status, in the statement rather
   * than around it. The status arm is what makes this safe to call from a UI
   * button: a bid that activated a moment ago (the bond landed while the player
   * was reaching for "Not now") matches nothing and stays a real bid, instead of
   * being cancelled out from under an auction that already counts it.
   *
   * Nothing was ever transferred for a pending bond, so the bond goes straight
   * to 'void' with no refund leg.
   */
  async abandonPendingBid(realm: string, bidId: number, account: number): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_bids
          SET status = 'cancelled', bond_state = 'void'
        WHERE realm = $1 AND id = $2 AND account = $3 AND status = 'pending_bond'`,
      [realm, bidId, account],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async activateBid(
    bidId: number,
    nowMs: number,
  ): Promise<'activated' | 'superseded' | 'listing_closed' | 'not_pending'> {
    return this.withTx(async (client) => {
      const bidRes = await client.query(
        `SELECT ${BID_COLS} FROM woc_market_bids WHERE id = $1 FOR UPDATE`,
        [bidId],
      );
      if (!bidRes.rows[0]) return 'not_pending' as const;
      const bid = toBid(bidRes.rows[0]);
      if (bid.status !== 'pending_bond') return 'not_pending' as const;
      const listingRes = await client.query(
        `SELECT ${LISTING_COLS} FROM woc_market_listings WHERE id = $1 FOR UPDATE`,
        [bid.listingId],
      );
      const supersede = async (): Promise<void> => {
        await client.query(
          `UPDATE woc_market_bids
              SET status = 'outbid',
                  bond_state = CASE WHEN bond_state = 'held' THEN 'refund_due' ELSE bond_state END
            WHERE id = $1`,
          [bidId],
        );
      };
      if (!listingRes.rows[0]) {
        await supersede();
        return 'listing_closed' as const;
      }
      const listing = toListing(listingRes.rows[0]);
      if (listing.status !== 'active' || listing.endsAtMs <= nowMs) {
        await supersede();
        return 'listing_closed' as const;
      }
      if (listing.currentBidCents !== null && bid.amountCents <= listing.currentBidCents) {
        await supersede();
        return 'superseded' as const;
      }
      if (listing.currentBidId !== null) {
        await client.query(
          `UPDATE woc_market_bids
              SET status = 'outbid',
                  bond_state = CASE WHEN bond_state = 'held' THEN 'refund_due' ELSE bond_state END
            WHERE id = $1 AND status = 'active'`,
          [listing.currentBidId],
        );
      }
      await client.query(`UPDATE woc_market_bids SET status = 'active' WHERE id = $1`, [bidId]);
      await client.query(
        `UPDATE woc_market_listings
            SET current_bid_cents = $2, current_bid_id = $3, updated_at = now()
          WHERE id = $1`,
        [listing.id, bid.amountCents, bidId],
      );
      return 'activated' as const;
    });
  }

  async markBondHeld(bidId: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_bids SET bond_state = 'held' WHERE id = $1 AND bond_state = 'pending'`,
      [bidId],
    );
  }

  async lapsePendingBids(realm: string, cutoffMs: number, limit: number): Promise<number> {
    const res = await this.pool.query(
      `UPDATE woc_market_bids
          SET status = 'lapsed', bond_state = 'void'
        WHERE id IN (
          SELECT id FROM woc_market_bids
           WHERE realm = $1
             AND status = 'pending_bond' AND placed_at <= to_timestamp($2 / 1000.0)
           ORDER BY placed_at
           LIMIT $3
           FOR UPDATE SKIP LOCKED)`,
      [realm, cutoffMs, limit],
    );
    return res.rowCount ?? 0;
  }

  async bidsByAccount(realm: string, account: number, limit: number): Promise<WocBidRow[]> {
    const res = await this.pool.query(
      `SELECT ${BID_COLS} FROM woc_market_bids
        WHERE realm = $1 AND account = $2
        ORDER BY placed_at DESC LIMIT $3`,
      [realm, account, limit],
    );
    return res.rows.map(toBid);
  }

  async bidsForListing(listingId: number): Promise<WocBidRow[]> {
    const res = await this.pool.query(
      `SELECT ${BID_COLS} FROM woc_market_bids
        WHERE listing_id = $1 ORDER BY amount_cents DESC, placed_at ASC`,
      [listingId],
    );
    return res.rows.map(toBid);
  }

  async promoteNextBidder(
    listingId: number,
    minCents: number,
    excludedAccounts: readonly number[],
  ): Promise<WocBidRow | null> {
    const res = await this.pool.query(
      `UPDATE woc_market_bids SET status = 'won'
        WHERE id = (
          SELECT id FROM woc_market_bids
           WHERE listing_id = $1 AND status = 'outbid' AND amount_cents >= $2
             AND NOT (account = ANY($3::int[]))
           ORDER BY amount_cents DESC, placed_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED)
        RETURNING ${BID_COLS}`,
      [listingId, minCents, excludedAccounts],
    );
    return res.rows[0] ? toBid(res.rows[0]) : null;
  }

  async markBidStatus(bidId: number, status: WocBidStatus): Promise<void> {
    await this.pool.query(`UPDATE woc_market_bids SET status = $2 WHERE id = $1`, [bidId, status]);
  }

  async setBondState(bidId: number, from: WocBondState[], to: WocBondState): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_bids SET bond_state = $3
        WHERE id = $1 AND bond_state = ANY($2::text[])`,
      [bidId, from, to],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async bondsDue(realm: string, limit: number): Promise<WocBidRow[]> {
    const res = await this.pool.query(
      `SELECT ${BID_COLS} FROM woc_market_bids
        WHERE realm = $1 AND bond_state IN ('refund_due', 'forfeit_due')
        ORDER BY placed_at
        LIMIT $2`,
      [realm, limit],
    );
    return res.rows.map(toBid);
  }

  async cancelOpenBidsForListing(listingId: number): Promise<WocBidRow[]> {
    const res = await this.pool.query(
      `UPDATE woc_market_bids SET status = 'cancelled'
        WHERE listing_id = $1 AND status IN ('pending_bond', 'active')
        RETURNING ${BID_COLS}`,
      [listingId],
    );
    return res.rows.map(toBid);
  }

  // ---------------------------------------------------------------------
  // Settlements
  // ---------------------------------------------------------------------

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
    try {
      const res = await this.pool.query(
        `INSERT INTO woc_market_settlements (
           listing_id, realm,
           bid_id, attempt, buyer_account, buyer_character, buyer_name,
           buyer_wallet, amount_cents, deadline_at
         )
         SELECT $1, realm, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0)
           FROM woc_market_listings WHERE id = $1
         RETURNING ${SETTLEMENT_COLS}`,
        [
          args.listingId,
          args.bidId,
          args.attempt,
          args.buyerAccount,
          args.buyerCharacter,
          args.buyerName,
          args.buyerWallet,
          args.amountCents,
          args.deadlineAtMs,
        ],
      );
      if (!res.rows[0]) return 'live_settlement_exists';
      return toSettlement(res.rows[0]);
    } catch (err) {
      // The partial unique index (one live settlement per listing) is the
      // authority; a racer sees 23505.
      if ((err as { code?: string }).code === '23505') return 'live_settlement_exists';
      throw err;
    }
  }

  async settlementById(id: number): Promise<WocSettlementRow | null> {
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? toSettlement(res.rows[0]) : null;
  }

  async settlementsByAccount(
    realm: string,
    account: number,
    limit: number,
  ): Promise<WocSettlementRow[]> {
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE realm = $1 AND buyer_account = $2
        ORDER BY created_at DESC LIMIT $3`,
      [realm, account, limit],
    );
    return res.rows.map(toSettlement);
  }

  async liveSettlementForListing(listingId: number): Promise<WocSettlementRow | null> {
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE listing_id = $1 AND state IN ('offered', 'confirming', 'confirmed', 'delivering')
        LIMIT 1`,
      [listingId],
    );
    return res.rows[0] ? toSettlement(res.rows[0]) : null;
  }

  async setSettlementQuote(
    id: number,
    reference: string,
    expiresAtMs: number,
    amountBase: string | null,
  ): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_settlements
          SET quote_reference = $2, quote_expires = to_timestamp($3 / 1000.0),
              settled_amount_base = $4, updated_at = now()
        WHERE id = $1 AND state = 'offered'`,
      [id, reference, expiresAtMs, amountBase],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async submitSettlementSignature(
    id: number,
    signature: string,
  ): Promise<'ok' | 'not_offered' | 'signature_reused'> {
    try {
      const res = await this.pool.query(
        `UPDATE woc_market_settlements
            SET state = 'confirming', tx_signature = $2, updated_at = now()
          WHERE id = $1 AND state = 'offered'`,
        [id, signature],
      );
      return (res.rowCount ?? 0) > 0 ? 'ok' : 'not_offered';
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return 'signature_reused';
      throw err;
    }
  }

  async transitionSettlement(
    id: number,
    from: WocSettlementState[],
    to: WocSettlementState,
    failReason?: string,
  ): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_settlements
          SET state = $3, fail_reason = COALESCE($4, fail_reason), updated_at = now()
        WHERE id = $1 AND state = ANY($2::text[])`,
      [id, from, to, failReason ?? null],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async confirmingSettlements(realm: string, limit: number): Promise<WocSettlementRow[]> {
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE realm = $1 AND state = 'confirming'
        ORDER BY updated_at
        LIMIT $2`,
      [realm, limit],
    );
    return res.rows.map(toSettlement);
  }

  async claimDeliverableSettlements(realm: string, limit: number): Promise<WocSettlementRow[]> {
    const res = await this.pool.query(
      `UPDATE woc_market_settlements SET state = 'delivering', updated_at = now()
        WHERE id IN (
          SELECT id FROM woc_market_settlements
           WHERE realm = $1 AND state = 'confirmed'
           ORDER BY updated_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED)
        RETURNING ${SETTLEMENT_COLS}`,
      [realm, limit],
    );
    return res.rows.map(toSettlement);
  }

  async deliveringSettlements(realm: string, limit: number): Promise<WocSettlementRow[]> {
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE realm = $1 AND state = 'delivering'
        ORDER BY updated_at
        LIMIT $2`,
      [realm, limit],
    );
    return res.rows.map(toSettlement);
  }

  async overdueSettlements(
    realm: string,
    nowMs: number,
    limit: number,
  ): Promise<WocSettlementRow[]> {
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE realm = $1 AND state IN ('offered', 'failed')
          AND deadline_at <= to_timestamp($2 / 1000.0)
        ORDER BY deadline_at
        LIMIT $3`,
      [realm, nowMs, limit],
    );
    return res.rows.map(toSettlement);
  }

  // ---------------------------------------------------------------------
  // Sales, strikes, terms, delivery targets
  // ---------------------------------------------------------------------

  async insertSale(args: Omit<WocSaleRow, 'id' | 'excluded' | 'atMs'>): Promise<number> {
    const res = await this.pool.query(
      `INSERT INTO woc_market_sales (
         realm, listing_id, item_id, item, price_cents, amount_base,
         seller_account, buyer_account, seller_name, buyer_name
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        args.realm,
        args.listingId,
        args.itemId,
        JSON.stringify(args.item),
        args.priceCents,
        args.amountBase,
        args.sellerAccount,
        args.buyerAccount,
        args.sellerName,
        args.buyerName,
      ],
    );
    return Number(res.rows[0].id);
  }

  async salesForItem(realm: string, itemId: string, limit: number): Promise<WocSaleRow[]> {
    const res = await this.pool.query(
      `SELECT * FROM woc_market_sales
        WHERE realm = $1 AND item_id = $2 AND excluded = false
        ORDER BY created_at DESC LIMIT $3`,
      [realm, itemId, limit],
    );
    return res.rows.map(toSale);
  }

  async setSaleExcluded(id: number, excluded: boolean): Promise<boolean> {
    const res = await this.pool.query(`UPDATE woc_market_sales SET excluded = $2 WHERE id = $1`, [
      id,
      excluded,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  async strikeInfo(account: number): Promise<WocStrikeRow | null> {
    const res = await this.pool.query(
      'SELECT account_id, strikes, suspended_until FROM woc_market_strikes WHERE account_id = $1',
      [account],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      accountId: row.account_id,
      strikes: row.strikes,
      suspendedUntilMs: msOrNull(row.suspended_until),
    };
  }

  async addStrike(account: number, suspendedUntilMs: number | null): Promise<WocStrikeRow> {
    const res = await this.pool.query(
      `INSERT INTO woc_market_strikes (account_id, strikes, suspended_until, updated_at)
       VALUES ($1, 1, to_timestamp($2 / 1000.0), now())
       ON CONFLICT (account_id) DO UPDATE
         SET strikes = woc_market_strikes.strikes + 1,
             suspended_until = GREATEST(
               COALESCE(woc_market_strikes.suspended_until, 'epoch'::timestamptz),
               COALESCE(to_timestamp($2 / 1000.0), 'epoch'::timestamptz)),
             updated_at = now()
       RETURNING account_id, strikes, suspended_until`,
      [account, suspendedUntilMs],
    );
    const row = res.rows[0];
    return {
      accountId: row.account_id,
      strikes: row.strikes,
      suspendedUntilMs: msOrNull(row.suspended_until),
    };
  }

  async clearStrikes(account: number): Promise<void> {
    await this.pool.query('DELETE FROM woc_market_strikes WHERE account_id = $1', [account]);
  }

  async termsAcceptedAt(account: number): Promise<number | null> {
    const res = await this.pool.query(
      'SELECT accepted_at FROM woc_market_terms WHERE account_id = $1',
      [account],
    );
    return res.rows[0] ? ms(res.rows[0].accepted_at) : null;
  }

  async recordTermsAccepted(account: number, nowMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO woc_market_terms (account_id, accepted_at)
       VALUES ($1, to_timestamp($2 / 1000.0))
       ON CONFLICT (account_id) DO NOTHING`,
      [account, nowMs],
    );
  }

  async deliveryTarget(
    realm: string,
    account: number,
    preferredCharacter: number,
  ): Promise<{ characterId: number; name: string } | null> {
    const preferred = await this.pool.query(
      'SELECT id, name FROM characters WHERE id = $1 AND account_id = $2 AND realm = $3',
      [preferredCharacter, account, realm],
    );
    if (preferred.rows[0]) {
      return { characterId: preferred.rows[0].id, name: preferred.rows[0].name };
    }
    const fallback = await this.pool.query(
      `SELECT id, name FROM characters
        WHERE account_id = $1 AND realm = $2
        ORDER BY updated_at DESC LIMIT 1`,
      [account, realm],
    );
    if (fallback.rows[0]) {
      return { characterId: fallback.rows[0].id, name: fallback.rows[0].name };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Retention prune primitives (registered with retention_sweep in main.ts).
// Sales are deliberately NOT pruned: they are the provenance record (comment
// at the DDL above). Bids and settlements ride the listing prune via their
// ON DELETE CASCADE FKs.
// ---------------------------------------------------------------------------

/** Closed, fully-disposed listings older than the window; 0/garbage days =
 *  keep forever (the retention_sweep contract). Bids and settlements ride the
 *  delete via their ON DELETE CASCADE FKs; sales are FK-free and survive. */
export async function pruneClosedWocListingsBatch(
  pool: Pool,
  retentionDays: number,
  batchSize: number,
): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const days = Math.max(1, Math.floor(retentionDays));
  const res = await pool.query(
    `DELETE FROM woc_market_listings
      WHERE id IN (
        SELECT id FROM woc_market_listings
         WHERE status = 'closed' AND item_disposed = true
           AND updated_at < now() - ($1 || ' days')::interval
         ORDER BY updated_at
         LIMIT $2)`,
    [String(days), Math.max(1, Math.floor(batchSize))],
  );
  return res.rowCount ?? 0;
}
