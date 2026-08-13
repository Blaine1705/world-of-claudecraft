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
import { DB_HEAVY_STATEMENT_TIMEOUT_MS, saveCharacterStateOnClient } from './db';
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
} from './woc_market';
import type { WocBidStatus, WocSettlementState } from './woc_market_rules';
import {
  WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS,
  WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS,
  WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR,
  WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS,
  WOC_MARKET_MAX_ACTIVE_LISTINGS,
} from './woc_market_rules';

/** The OPEN settlement states, shared VERBATIM between the one-open-settlement
 *  unique index predicate and every liveness check (the LIFETIME_XP_EXPR
 *  shared-text rule). 'review' is open on purpose: an over-aged 'confirming'
 *  parked for an operator verdict still owns its listing, because the payment
 *  may have landed on chain, so nothing may re-auction or double-sell around
 *  it. 'delivered' stays open until the listing row closes (see the index
 *  comment below). */
const OPEN_SETTLEMENT_STATES_SQL = `('offered', 'confirming', 'review', 'confirmed', 'delivering', 'delivered')`;
/** The PAID subset: OPEN minus 'offered' (a recorded signature is in and the
 *  money may land). The cancel-intent probe reads this, and the structural
 *  floor pins the subset relationship so the two lists cannot drift apart. */
const PAID_SETTLEMENT_STATES_SQL = `('confirming', 'review', 'confirmed', 'delivering', 'delivered')`;

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
-- updated_at is the stuck readout's age signal for this class, so park
-- rotation never writes it (it writes sweep_parked_at; see the settlements
-- twin for the full rationale).
CREATE INDEX IF NOT EXISTS woc_market_listings_undisposed
  ON woc_market_listings(realm, updated_at)
  WHERE status = 'closed' AND item_disposed = false;
ALTER TABLE woc_market_listings
  ADD COLUMN IF NOT EXISTS sweep_parked_at TIMESTAMPTZ;
-- The return arm's batch order: parked rows rotate on sweep_parked_at so a
-- refused return cycles to the tail without aging the readout column. The
-- expression is shared verbatim with the query via PARK_ROTATION_ORDER.
CREATE INDEX IF NOT EXISTS woc_market_listings_undisposed_rotation
  ON woc_market_listings(realm, (COALESCE(sweep_parked_at, updated_at)))
  WHERE status = 'closed' AND item_disposed = false;
-- The sold-residue dispose probe (steady-state EMPTY: only an old binary's
-- torn close tail populates it); without this the probe walked the whole
-- undisposed backlog once a minute to learn there was nothing to do.
CREATE INDEX IF NOT EXISTS woc_market_listings_sold_undisposed
  ON woc_market_listings(realm, id)
  WHERE status = 'closed' AND item_disposed = false AND resolution = 'sold';
-- The redrive page walk pages LIVE listings by id; no other index yields id
-- order under a realm+status filter, so without this the planner sorts the
-- whole live set once a minute forever.
CREATE INDEX IF NOT EXISTS woc_market_listings_live_ids
  ON woc_market_listings(realm, id)
  WHERE status <> 'closed';
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

-- Seller cancel-intent on a LOCKED listing (the abandon-loop ruling's second
-- arm): instead of refusing, the cancel stamps this and the listing stops
-- taking new lock claims and new bids; the CURRENT holder keeps their full
-- window (a paid window proceeds to settlement as usual), and an unpaid
-- expiry closes the listing cancelled with the return flight home. Bounds the
-- seller's worst-case cancel denial at exactly one lock window. Additive.
ALTER TABLE woc_market_listings
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;
-- The converge arm's read, on the shared rotation order (a stamped listing
-- whose buyer PAID skips every pass until that settlement resolves, which
-- can be operator-scale time; rotation plus the caller's backoff exclusion
-- is what keeps a standing skip set from occupying the batch head forever,
-- the delivering/undisposed arms' seam). _rotation REPLACES the short-lived
-- (realm, id) shape that briefly shipped under the _cancel_pending name:
-- IF NOT EXISTS matches on NAME only, so an in-place redefinition would
-- leave any database that booted the old shape sorting forever (this
-- file's own predicate-change rule).
CREATE INDEX IF NOT EXISTS woc_market_listings_cancel_rotation
  ON woc_market_listings(realm, (COALESCE(sweep_parked_at, updated_at)))
  WHERE cancel_requested_at IS NOT NULL AND status = 'active';
DROP INDEX IF EXISTS woc_market_listings_cancel_pending;

-- The abandon ledger (the ruling's first arm): one row per abandoned public
-- buy-now lock window, keyed by the lock instance (lock_expires) so the two
-- recorders (the overdue sweep's abandon arm, and a claim that steals an
-- expired lock) dedupe instead of double-counting one abandonment. Directed
-- locks never record here (they keep their strike instead). lock_expires is
-- both the dedupe key and the age axis for the two cooldown reads (the moment
-- the abandon HAPPENED); created_at is forensics only. App clock throughout,
-- consistent with the lock predicates (the 02 clock decision).
CREATE TABLE IF NOT EXISTS woc_market_buy_now_abandons (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  listing_id BIGINT NOT NULL REFERENCES woc_market_listings(id) ON DELETE CASCADE,
  account INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lock_expires TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Dedupe key; also serves the per-listing cooldown probe and the FK-cascade
-- scan from the listings prune (listing_id leads).
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_buy_now_abandons_once
  ON woc_market_buy_now_abandons(listing_id, account, lock_expires);
-- The account-wide rolling-window count (realm is a residual filter over one
-- account's handful of rows) AND the accounts FK-cascade scan: account leads
-- so both are index probes.
CREATE INDEX IF NOT EXISTS woc_market_buy_now_abandons_account
  ON woc_market_buy_now_abandons(account, lock_expires DESC);

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
-- The signature the bidder handed back for their bond, recorded BEFORE the
-- chain has decided. Without somewhere to keep it, a bond that had landed but
-- not yet finalized could only be refused, and the money was already gone: the
-- settlement leg learned this the expensive way and the bid leg had the same
-- hole. UNIQUE for the same reason the settlement's is: one broadcast pays for
-- one thing, and a replayed signature must not fund a second bond.
ALTER TABLE woc_market_bids
  ADD COLUMN IF NOT EXISTS bond_signature TEXT;
-- WHEN the signature was recorded: the bond poll's park threshold ages on
-- this (falling back to placed_at for legacy rows), because placement age
-- says nothing about how long the CHAIN has had the transfer: a bidder who
-- signs late in their window must still get the full poll cadence for
-- finality, not an instant park.
ALTER TABLE woc_market_bids
  ADD COLUMN IF NOT EXISTS bond_signature_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_bids_bond_signature
  ON woc_market_bids(bond_signature)
  WHERE bond_signature IS NOT NULL;
-- The awaiting-finality queue: pending bonds that HAVE a signature are re-checked
-- by the sweep, and are exactly the rows the lapse sweep must not reap.
-- (This placed_at index still serves the stuck-bond readout's age reads.)
CREATE INDEX IF NOT EXISTS woc_market_bids_bond_confirming
  ON woc_market_bids(realm, placed_at)
  WHERE status = 'pending_bond' AND bond_signature IS NOT NULL;
-- Poll rotation for the awaiting-finality queue: a bond the chain leaves
-- undecided past the poll park delay rotates to the tail (poll_parked_at) with
-- an in-process backoff, so a standing set of never-decided signatures
-- cannot occupy the poll batch's head every pass and starve fresh bonds of
-- their finality checks. Rotation never touches placed_at (the readout's
-- age signal, the sweep_parked_at lesson); this DDL spells the expression
-- as its own literal (a template constant cannot reach this SQL string) and
-- confirmingBonds orders on BOND_POLL_ROTATION_ORDER, with the structural
-- floor pinning BOTH texts so drift fails a test rather than an index. A stale
-- poll_parked_at on a bid that left 'pending_bond' is inert: the partial
-- predicate drops the row from the queue, and no path re-enters it.
ALTER TABLE woc_market_bids
  ADD COLUMN IF NOT EXISTS poll_parked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS woc_market_bids_bond_confirming_rotation
  ON woc_market_bids(realm, (COALESCE(poll_parked_at, placed_at)))
  WHERE status = 'pending_bond' AND bond_signature IS NOT NULL;

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
    CHECK (state IN ('offered', 'confirming', 'review', 'confirmed', 'delivering', 'delivered', 'expired', 'failed')),
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
-- Constraint evolution for a database created before the 'review' state: the
-- inline CHECK above only applies to a FRESH table, so a legacy table keeps
-- its old list and the first confirming -> review transition would abort with
-- a check violation. Gated on the constraint text, so it runs once per legacy
-- database and never rescans a healthy one. NOT VALID (the
-- AUTH_TOKENS_SCOPE_CONSTRAINT_SQL house pattern): new and updated rows are
-- still enforced, every STANDING value is in the wider list by construction
-- (the new list is a superset), and skipping validation keeps the
-- AccessExclusive hold inside the unbounded boot transaction to catalog-only
-- work instead of a table scan.
DO $woc_settle_state_ck$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'woc_market_settlements'::regclass
       AND conname = 'woc_market_settlements_state_check'
       AND pg_get_constraintdef(oid) NOT LIKE '%''review''%') THEN
    ALTER TABLE woc_market_settlements DROP CONSTRAINT woc_market_settlements_state_check;
    ALTER TABLE woc_market_settlements ADD CONSTRAINT woc_market_settlements_state_check
      CHECK (state IN ('offered', 'confirming', 'review', 'confirmed', 'delivering', 'delivered', 'expired', 'failed'))
      NOT VALID;
  END IF;
END $woc_settle_state_ck$;
-- Pre-flight repair for a database that ran the pre-guard code: the old
-- narrower index legally allowed a 'delivered' settlement to coexist with a
-- second open one (the reopen-after-delivered double-sell), and the wider
-- unique index below would abort the WHOLE realm boot on such a pair. Keep
-- the most-advanced settlement per listing and expire the rest under a
-- greppable reason. A no-op on healthy databases; idempotent after repair.
-- Gated on a VALID index of that name not existing yet, so the scan runs
-- once per legacy database and never again. The Var-free qual is not
-- constant-folded (these catalog reads are STABLE, not IMMUTABLE); the
-- planner treats it as a pseudoconstant and emits a one-time filter, so the
-- ranked subquery is planned but never executed on a healthy boot. Validity,
-- not bare existence: a failed CONCURRENTLY build (an incident-response hand
-- build; boot DDL itself is transactional and leaves no carcass) satisfies
-- to_regclass AND the IF NOT EXISTS below while enforcing nothing, which
-- would silently skip both the repair and the rebuild. Unbatched by design:
-- safe only while this table is pre-enable empty or scanned once per
-- upgrade; a re-use of this pattern on a populated table batches it.
-- The demotion keeps any prior fail_reason behind the greppable marker, and
-- delivered -> expired here is a deliberate exception to the
-- SETTLEMENT_TRANSITIONS terminality in woc_market_rules.ts (raw repair SQL,
-- not the runtime transition path). Retargeting the gate from _open to
-- _open2 deliberately re-runs this scan ONCE MORE on databases that already
-- carried the _open generation (measured trivial); after that it never
-- rescans a healthy database.
-- Operator note for a legacy upgrade: rows this demoted carry
-- fail_reason LIKE 'schema_dedupe%'; any demoted row that had reached
-- 'confirming' or beyond was a payment that may still land, so sweep
-- SELECT * FROM woc_market_settlements WHERE fail_reason LIKE 'schema_dedupe%'
-- after the first boot and reconcile by hand.
UPDATE woc_market_settlements
   SET state = 'expired',
       fail_reason = 'schema_dedupe' || COALESCE(':' || fail_reason, ''),
       updated_at = now()
 WHERE NOT EXISTS (
     SELECT 1 FROM pg_index i
      WHERE i.indexrelid = to_regclass('woc_market_settlements_open2')
        AND i.indisvalid)
   AND id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (
       PARTITION BY listing_id
       ORDER BY CASE state
         WHEN 'delivered' THEN 6 WHEN 'delivering' THEN 5 WHEN 'confirmed' THEN 4
         WHEN 'review' THEN 3 WHEN 'confirming' THEN 2 ELSE 1 END DESC, id ASC
     ) AS rn
     FROM woc_market_settlements
     WHERE state IN ${OPEN_SETTLEMENT_STATES_SQL}
   ) ranked
   WHERE ranked.rn > 1);
-- Exactly one OPEN settlement per listing: the live payment states plus
-- 'delivered', which stays open until the listing row closes so the
-- cancel/suspend/reclaim liveness checks and the insert guard keep seeing it
-- (a delivered-but-unclosed listing must never re-auction or double-sell).
-- Replaces woc_market_settlements_live, which excluded 'delivered'; the
-- corrected index is created first and the stale one dropped after, both
-- idempotent, so uniqueness never lapses across the swap. Deliberately boot
-- DDL rather than concurrent_indexes.ts: the marketplace is config-gated off,
-- these tables are empty until it launches, and the unique index is the
-- correctness authority the insert path relies on from the first request (a
-- CONCURRENTLY build can leave an INVALID carcass, which would silently drop
-- the invariant). Any post-launch index work here rides concurrent_indexes.ts.
-- Drop an INVALID same-named carcass first: IF NOT EXISTS matches on NAME
-- only, so a carcass would otherwise be kept and enforce nothing. The same
-- name-only matching means any future change to this index's predicate needs
-- a NEW index name (or an explicit DROP); it cannot be edited in place.
-- open2 IS that rename: it adds 'review' to the predicate (the operator
-- review state stays open) and replaces woc_market_settlements_open, which
-- is dropped only AFTER the wider index exists, so uniqueness never lapses
-- across the swap (the _live -> _open precedent).
DO $woc_open_idx$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = to_regclass('woc_market_settlements_open2')
       AND NOT i.indisvalid) THEN
    EXECUTE 'DROP INDEX woc_market_settlements_open2';
  END IF;
END $woc_open_idx$;
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_open2
  ON woc_market_settlements(listing_id)
  WHERE state IN ${OPEN_SETTLEMENT_STATES_SQL};
DROP INDEX IF EXISTS woc_market_settlements_open;
DROP INDEX IF EXISTS woc_market_settlements_live;
CREATE INDEX IF NOT EXISTS woc_market_settlements_state
  ON woc_market_settlements(realm, state, deadline_at);
-- The confirming backlog and the stuck readout's delivering class order and
-- age on updated_at; without this they scanned the one-open-settlement index
-- and sorted. updated_at is stamped when the row ENTERS 'delivering' (the
-- claim UPDATE) and park rotation deliberately never moves it (it writes
-- sweep_parked_at instead), so it is both the batch order for unparked work
-- and the readout's honest age signal.
CREATE INDEX IF NOT EXISTS woc_market_settlements_state_updated
  ON woc_market_settlements(realm, state, updated_at);
-- Park rotation rides its OWN column: rotating the readout's age column made
-- a permanently parked row invisible to the monitor (re-stamped every retry,
-- it could never age past the stuck threshold). The delivering reconcile
-- batch orders on the rotation expression so a parked row still cycles to
-- the tail; the expression is shared verbatim with the queries through
-- PARK_ROTATION_ORDER (the hot-path SQL-shape rule).
ALTER TABLE woc_market_settlements
  ADD COLUMN IF NOT EXISTS sweep_parked_at TIMESTAMPTZ;
DROP INDEX IF EXISTS woc_market_settlements_state_created;
CREATE INDEX IF NOT EXISTS woc_market_settlements_delivering_rotation
  ON woc_market_settlements(realm, (COALESCE(sweep_parked_at, updated_at)))
  WHERE state = 'delivering';
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
-- Pre-flight repair, same shape as the settlements one above: a historical
-- double delivery left two non-excluded sale rows for one listing, and the
-- unique index below would abort the boot on them. Keep the EARLIEST row and
-- void later duplicates (excluded = true preserves them for audit). The
-- validity gate matters MORE here: sales are keep-forever, so an ungated
-- repair would re-scan the whole provenance table at every boot (the same
-- pseudoconstant one-time-filter mechanics as the settlements repair above,
-- and the same INVALID-carcass reasoning for gating on indisvalid).
UPDATE woc_market_sales SET excluded = true
 WHERE NOT EXISTS (
     SELECT 1 FROM pg_index i
      WHERE i.indexrelid = to_regclass('woc_market_sales_listing_once')
        AND i.indisvalid)
   AND id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (PARTITION BY listing_id ORDER BY id ASC) AS rn
     FROM woc_market_sales
     WHERE excluded = false
   ) ranked
   WHERE ranked.rn > 1);
-- One sale row per listing, forever: a double delivery fails closed here
-- rather than minting a second provenance row. Partial on excluded so an
-- operator who voids a bogus row (excluded = true) can land its correction.
-- Same carcass rule as the settlements index: drop an INVALID leftover so
-- IF NOT EXISTS cannot keep a name-matching index that enforces nothing.
DO $woc_sale_idx$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = to_regclass('woc_market_sales_listing_once')
       AND NOT i.indisvalid) THEN
    EXECUTE 'DROP INDEX woc_market_sales_listing_once';
  END IF;
END $woc_sale_idx$;
CREATE UNIQUE INDEX IF NOT EXISTS woc_market_sales_listing_once
  ON woc_market_sales(listing_id)
  WHERE excluded = false;

-- The DURABLE book-once ledger for custody parcels. The mail book lives in a
-- JSONB blob whose per-letter marker a player can delete (an emptied letter is
-- deletable) and which an older binary's loader would strip, so the blob can
-- never be the authority for "this parcel was already booked". A worker CLAIMS
-- the ref here first (the primary key makes the claim race single-winner); an
-- EXISTING claim is consulted, never adopted: booked_at set means delivered,
-- and an unbooked claim resumes only with rail-attributed proof (the column
-- comments below), else it PARKS. Failure direction is deliberate: a claim
-- with no parcel leaves the item held and VISIBLE to the operator (the row's
-- booked_at stays null), never silently duplicated.
-- OPERATOR WARNING: NEVER delete an unbooked claim row to unstick a delivery.
-- The next pass would mint a FRESH claim, and a fresh claim skips the
-- parcel-in-book check by construction; if the buyer already collected and
-- deleted the letter, that deletion re-arms the exact duplication this ledger
-- exists to prevent. Resolve a parked row by hand-delivering (then stamping
-- booked_at) or by confirming non-delivery before any reset. The one class
-- where hand-delivery is ITSELF the dupe: a parked GRANT claim (non-null
-- grant_character_id) may mean the item already sits in the buyer's bags
-- (an ambiguous grant, or an autosave that landed after a fence); confirm
-- the buyer does NOT have the item before delivering anything by hand.
CREATE TABLE IF NOT EXISTS woc_market_custody_claims (
  custody_ref TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  booked_at TIMESTAMPTZ
);
-- Rail attribution for a claim, and the whole exactly-once story hangs on it.
-- grant_character_id is the DIRECT hand-off intent: stamped BEFORE the
-- in-memory bag grant, converted to a mail intent only when the grant
-- provably left nothing behind (an ordinary grantCopy refusal). An unbooked
-- claim still carrying it means a grant MAY have persisted (an autosave can
-- land the granted bags even when the explicit save threw, and a lease fence
-- rejection says nothing about earlier saves under the then-valid nonce), so
-- no automatic path may mail or re-grant under this ref: it parks, visible in
-- the unbooked-claims read, for the operator. mail_intent_at is the MAIL rail
-- intent, stamped BEFORE the parcel is handed to the post office: the resume
-- may re-mail only while the parcel is still IN the live book (the in-blob
-- marker is advisory, a player can delete an emptied letter, so an absent
-- parcel may mean it was already collected, never that it was never sent).
-- A claim with NEITHER marker and no booking is unattributable (a legacy row
-- from before these columns, or a claim whose process died before stamping):
-- it parks, never mails. Legacy NULLs mean UNKNOWN, not "no attempt"; the
-- pre-enable deploy note is that woc_market_custody_claims must be empty (or
-- fully booked) before the first boot of this schema.
-- Retention: KEEP FOREVER for now, deliberately. Unbooked rows are the
-- operator's queue and are NEVER pruned; booked rows are delivery provenance
-- and stay until the dedicated market retention work registers their prune
-- beside the listing prune (a booked row is one short line per completed
-- delivery or return, so the growth rate is the sale rate).
-- INT to match every other character-id column. IF NOT EXISTS makes this a
-- no-op on a database that already ran an earlier BIGINT build of this ALTER
-- (dev databases only; the market never shipped): the width difference is
-- harmless there (no FK, and the reader converts through Number()).
ALTER TABLE woc_market_custody_claims
  ADD COLUMN IF NOT EXISTS grant_character_id INT;
ALTER TABLE woc_market_custody_claims
  ADD COLUMN IF NOT EXISTS mail_intent_at TIMESTAMPTZ;
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
export const ESCROW_LOCK_TIMEOUT_MS = 2_000;

/** How long one of the NEW guard transactions may sit IDLE inside its
 *  transaction before the server terminates the session (25P03, surfaced as
 *  the typed 'contended'). lock_timeout bounds how long a statement WAITS
 *  for a lock; nothing else bounds how long a stalled event loop (a GC
 *  pause, a heavy tick on the shared box) HOLDS one between statements, and
 *  the holder is what amplifies every waiter. Equal to
 *  ESCROW_LOCK_TIMEOUT_MS BY RULING: the two bounds tell one story (we give
 *  our own scheduling at least the tolerance we give lock waits; the
 *  original 500ms was four times tighter with no measurement behind it, and
 *  a false fire terminates the session AND discards its pool client, so on
 *  a shared four-core box under load the tighter bound was the riskier
 *  one). Applied to the guards this change introduced; retrofitting the
 *  older guards rides the hot-path work. */
export const GUARD_IDLE_TX_TIMEOUT_MS = ESCROW_LOCK_TIMEOUT_MS;

/** Per-statement allowance for the escrow listing transaction, WORKLOAD
 *  scoped (exported for the tunables-ladder pin). It sits between the lock
 *  wait ceiling and the session default: the transaction now runs inside the
 *  per-character save FIFO, so its worst case bounds the seller's own
 *  autosave chain, a saveAll worker slot, and leave/takeover, and it must
 *  stay well under the 30s autosave period even across all four real
 *  statements. Measured against Postgres 16 with a 27KB character blob:
 *  p50 3.5ms, max 8.3ms over 25 passes, whole-transaction timings (the
 *  delivery pg suite's escrow-cost test re-measures and asserts the
 *  observed MAX stays under a twenty-fifth of this allowance, 200ms; an
 *  env-gated local gate per tests/CLAUDE.md, not a CI floor), so 5s is
 *  orders of magnitude of headroom while a genuinely wedged statement can
 *  no longer hold the FIFO for the 60s heavy allowance. Honest ceiling
 *  accounting: this allowance bounds the FOUR workload statements (the
 *  tunables relation pins exactly those, plus the lock wait and the pool
 *  checkout, about 27s; the two later SET LOCALs also run under it but are
 *  protocol statements with no locks, IO, or planning, excluded from the
 *  worst-case sum on that ground); BEGIN and the SET LOCAL that installs
 *  the allowance necessarily run under the 15s session default, and
 *  COMMIT's only hard bound is the 65s driver query_timeout backstop
 *  (measured: statement_timeout does not bound COMMIT), so a genuinely
 *  wedged transaction can exceed one 30s autosave interval, and reaching
 *  the driver backstop also costs the DISCARDED connection (withTx's
 *  codeless-failure rule below). What bounds the player-facing impact in
 *  that tail is the queue wait deadline plus the depth cap (later requests
 *  refuse typed instead of stacking); tightening the tail itself rides the
 *  hot-path follow-up with the guild-flush 60s term. The heavy allowance remains correct for the
 *  LOGOUT-shaped saves (losing one is data loss; losing a listing attempt
 *  is a refusal the player retries). */
export const ESCROW_STATEMENT_TIMEOUT_MS = 5_000;

const LISTING_COLS =
  'id, realm, seller_account, seller_character, seller_name, seller_wallet, item, item_id, ' +
  'quality, format, start_cents, reserve_cents, buy_now_cents, offer_next, status, resolution, ' +
  'item_disposed, current_bid_cents, current_bid_id, ends_at, base_ends_at, ' +
  'buy_now_lock_account, buy_now_lock_expires, created_at, directed_buyer_account, ' +
  'cancel_requested_at';

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

/** The parked-row batch order: rotation stamps sweep_parked_at (never the
 *  readout's age column), and unparked rows keep their updated_at slot. The
 *  text is shared VERBATIM by the two rotation indexes in the DDL above and
 *  the batch reads below (the hot-path SQL-shape rule: an expression index
 *  only serves a query that spells the identical expression). */
const PARK_ROTATION_ORDER = 'COALESCE(sweep_parked_at, updated_at)';
/** The bond poll's twin: rotation on poll_parked_at, age on placed_at. */
const BOND_POLL_ROTATION_ORDER = 'COALESCE(poll_parked_at, placed_at)';

/** ONE abandon-recording statement for BOTH recorders (the overdue sweep and
 *  the steal arm), so their exempt predicate can never disagree. The NOT
 *  EXISTS refuses the window only for a refusal class that is NOT mintable
 *  on demand (WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS, currently the
 *  infrastructure verdict alone; the rules constant carries the full
 *  rationale incl. why quote_expired and bare signatures do NOT exempt).
 *  The list rides a BOUND parameter ($5), never interpolation, so a future
 *  reason string cannot break or inject. Window key: deadline_at IS the
 *  lock expiry (buyNow sets them equal), and the unique index dedupes the
 *  two recorders. Params: $1 realm, $2 listing, $3 account,
 *  $4 lockExpiresMs, $5 the exempt reason list. */
const RECORD_ABANDON_SQL = `INSERT INTO woc_market_buy_now_abandons (realm, listing_id, account, lock_expires)
 SELECT $1, $2, $3, to_timestamp($4 / 1000.0)
  WHERE NOT EXISTS (
    SELECT 1 FROM woc_market_settlements s
     WHERE s.listing_id = $2 AND s.buyer_account = $3
       AND s.deadline_at = to_timestamp($4 / 1000.0)
       AND s.tx_signature IS NOT NULL
       AND s.fail_reason = ANY($5::text[]))
 ON CONFLICT (listing_id, account, lock_expires) DO NOTHING`;
const ABANDON_EXEMPT_REASONS: readonly string[] = WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS;

const BID_COLS =
  'id, listing_id, account, character_id, character_name, wallet, amount_cents, status, ' +
  'bond_cents, bond_state, bond_reference, bond_quote_expires, bond_signature, ' +
  'bond_signature_at, placed_at';

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
    cancelRequestedAtMs: msOrNull(row.cancel_requested_at),
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
    bondSignature: row.bond_signature ?? null,
    bondSignatureAtMs: msOrNull(row.bond_signature_at),
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
 *  write already made this transaction) and resolve with `value` instead.
 *  The payload is NOT type-checked against the enclosing withTx<T> (the catch
 *  casts), so spell the value exactly; an annotation on the throw would be
 *  decorative, never write one. */
class TxAbort<T> {
  constructor(readonly value: T) {}
}

/** A withTx transaction that provably NEVER STARTED: the pool checkout
 *  itself failed (no client, no BEGIN). pg-pool's timeout and the fresh-
 *  connect socket errors carry no SQLSTATE, so without this tag they would
 *  classify as AMBIGUOUS at a compensating caller and park work that
 *  provably did nothing; a checkout timeout is a saturation symptom that
 *  arrives in volume, exactly when a park-and-kick hurts most. Callers with
 *  compensation logic map it to their typed retry refusal. */
export class TxNeverStarted extends Error {
  constructor(readonly reason: unknown) {
    // cause keeps the real pg error and its stack in default Node error
    // formatting; .reason predates it and stays for existing readers.
    super(`transaction never started: ${String(reason)}`, { cause: reason });
  }
}

/** 55P03 (lock_timeout) and 40P01 (deadlock victim): the row set is contended
 *  by another market transaction. The guards surface these as a typed
 *  'contended' retry refusal; without the mapping they 500 as internal.error,
 *  which contradicts the lock_timeout rationale comments and logs contention
 *  as a server fault. */
function isLockContention(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  // 25P03: the guard transaction sat idle past its in-transaction timeout
  // (an event-loop stall on the shared box) and the server terminated the
  // session rather than let it hold the row lock unbounded. Plain
  // contention to the caller: retry immediately.
  return code === '55P03' || code === '40P01' || code === '25P03';
}

export class PgWocMarketDb implements WocMarketDb {
  constructor(private readonly pool: Pool) {}

  private async withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (err) {
      throw new TxNeverStarted(err);
    }
    // The idle-in-transaction timeout TERMINATES THE SESSION, and its
    // SQLSTATE (25P03) arrives asynchronously on the client's 'error' event
    // while no statement is in flight; the statement that then fails carries
    // only a generic "not queryable" shell with no code. Capture the first
    // async error so (a) the catch below can rethrow the REAL error and the
    // 25P03 contention arm is live rather than dead code, and (b) Node never
    // sees an 'error' event with zero listeners on the checked-out client,
    // which is an uncaught exception (pg-pool detaches its own idle listener
    // while a client is checked out).
    let asyncErr: unknown = null;
    const onError = (err: unknown): void => {
      if (asyncErr === null) asyncErr = err;
    };
    client.on('error', onError);
    let beginFailed = false;
    let rollbackFailed = false;
    let codelessFailure = false;
    try {
      // BEGIN rides the never-started tag too: a pooled client whose socket
      // died since its last use (a NAT idle-reap, a Postgres restart the
      // pool's own eviction raced) is not validated at checkout, so it fails
      // HERE with a codeless connection error rather than at connect, and in
      // the same correlated volume as checkout timeouts. Nothing can have
      // committed before BEGIN returns, so the typed retry refusal is as
      // provably correct as it is for the checkout arm; without this tag the
      // class parked as ambiguous, which is the quarantine-kick loop the tag
      // exists to prevent, one statement later.
      try {
        await client.query('BEGIN');
      } catch (err) {
        beginFailed = true;
        throw new TxNeverStarted(err);
      }
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      // A never-started transaction owes no ROLLBACK, and it must skip the
      // code-preference below: a coded async close arriving on the same dead
      // socket would replace the tag and re-park a provably-nothing-ran
      // failure as ambiguous. If fn itself ever minted the tag (none does
      // today), a transaction IS open, so that arm still rolls back.
      if (err instanceof TxNeverStarted) {
        if (!beginFailed) {
          await client.query('ROLLBACK').catch(() => {
            rollbackFailed = true;
          });
        }
        throw err;
      }
      await client.query('ROLLBACK').catch(() => {
        rollbackFailed = true;
      });
      if (err instanceof TxAbort) return err.value as T;
      // Prefer whichever error carries the SQLSTATE: under an event-loop
      // stall the buffered 25P03 is parsed into the NEXT query's rejection
      // and the async event is the codeless close; under an async stall the
      // ordering flips (both measured). Either way the coded error is the
      // honest one. When NEITHER carries a code, the thrown error (fn's own
      // bug) stays primary: a codeless connection close must not mask it.
      // Known residual of that preference: a CODELESS bug thrown by fn while
      // a coded async termination is buffered gets labeled with the async
      // code. The mislabel is item-safe for the compensating callers (fn
      // threw, so COMMIT was never issued and rollback is certain) but can
      // hide the bug behind a typed retry; accepted as the price of keeping
      // the 25P03 arm live.
      // Null-safe on purpose: asyncErr is null until an 'error' event fires,
      // and a codeless thrown error evaluates the asyncErr side; a plain cast
      // dereferenced the null here and replaced the real failure (and its
      // stack) with a TypeError from this very line.
      const code = (e: unknown): string | undefined =>
        (e as { code?: string } | null | undefined)?.code;
      const chosen = code(err) !== undefined ? err : code(asyncErr) !== undefined ? asyncErr : err;
      // A failure with NO SQLSTATE means no server verdict reached us, so the
      // connection's protocol state is unknown: the driver-side query_timeout
      // in particular rejects with a codeless error, cancels nothing
      // server-side, and leaves the response outstanding; a best-effort
      // ROLLBACK can then consume THAT response and "succeed", handing the
      // pool a desynchronized client whose stale reply would be attributed
      // to the next borrower. Codeless therefore always discards.
      if (code(chosen) === undefined) codelessFailure = true;
      throw chosen;
    } finally {
      client.removeListener('error', onError);
      // A terminated, begin-broken, rollback-swallowed, or codeless-failed
      // session must be DISCARDED, not returned to the pool: any of them can
      // hand the next checkout a client with an open transaction or an
      // outstanding response still aboard.
      client.release(
        asyncErr !== null || beginFailed || rollbackFailed || codelessFailure ? true : undefined,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Listings
  // ---------------------------------------------------------------------

  async escrowInsertListing(
    save: CharacterSaveArgs,
    listing: NewWocListing,
  ): Promise<
    { ok: true; id: number } | { ok: false; reason: 'lease_lost' | 'cap_reached' | 'contended' }
  > {
    try {
      return await this.withTx(async (client) => {
        // LOCK ORDER carve-out: no bid row lock and no listing row lock is
        // taken here (this transaction locks the ACCOUNTS row, then only
        // INSERTs a listing), so it can never close a cycle with the
        // bids-then-listing order the market transactions follow.
        // The statement allowance is WORKLOAD-SCOPED, not the heavy save
        // allowance: this transaction now runs inside the per-character save
        // FIFO, so its worst case is the head-of-line bound on the seller's
        // own autosaves, one of the four saveAll worker slots, and
        // leave/lease-release/takeover. Every failure mode here is fully
        // compensated (the copy restores or the request refuses), unlike a
        // logout flush, so it gets a short deadline instead of the 60s one;
        // the LOCK wait is bounded tighter still, and the idle bound stops a
        // stalled event loop from holding the accounts row between
        // statements (those two surface as the typed 'contended' refusal;
        // the statement bound's 57014 deliberately does NOT: it proves
        // rollback, so the copy restores, and then it 500s, because a
        // statement blowing a 5s allowance measured at single-digit
        // milliseconds is an incident to surface, not contention to retry).
        await client.query(`SET LOCAL statement_timeout = ${ESCROW_STATEMENT_TIMEOUT_MS}`);
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        await client.query(
          `SET LOCAL idle_in_transaction_session_timeout = ${GUARD_IDLE_TX_TIMEOUT_MS}`,
        );
        // Lock ORDER is accounts-then-characters, matching every established
        // capped-insert path (db.ts createCharacterCapped, maps_db, user_assets_db),
        // so no future accounts-first path can deadlock against this one. The cap
        // is counted under the lock and NOT re-counted outside it. Blast radius,
        // honestly: FOR UPDATE conflicts with the FOR KEY SHARE every FK-child
        // INSERT takes on this row, so while the transaction runs the account
        // cannot insert into ANY table referencing accounts(id); that width is
        // what the 2s idle bound is really protecting (a NO KEY UPDATE
        // narrowing is recorded follow-up work, measured to preserve the cap
        // serialization).
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
    } catch (err) {
      // TxNeverStarted joins the contention codes: nothing ran, so the typed
      // retry refusal (which restores the copy) is strictly correct, and the
      // ambiguous quarantine arm must never fire for a checkout failure.
      if (err instanceof TxNeverStarted || isLockContention(err)) {
        return { ok: false as const, reason: 'contended' as const };
      }
      throw err;
    }
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

  /**
   * The OPERATOR listing read: every public listing, any status, over a window.
   *
   * Deliberately not a widened browseListings. That one carries a security
   * boundary (a directed sale must never reach a stranger) and a shape tuned for
   * players; bending it to also serve ops would put an "and show me everything"
   * switch on the query whose whole job is to withhold things. This is a
   * separate read with its own predicate, so neither can loosen the other.
   *
   * Directed rows stay out here too: they are p2p trades and have their own
   * read below, where the counterparty and the offer lifecycle are the point.
   */
  async opsListings(q: {
    realm: string;
    status: 'active' | 'ending' | 'settling' | 'closed' | 'all';
    fromMs: number;
    toMs: number;
    page: number;
    pageSize: number;
  }): Promise<{ rows: WocListingRow[]; hasMore: boolean }> {
    const where: string[] = ['realm = $1', 'directed_buyer_account IS NULL'];
    const params: unknown[] = [q.realm];
    params.push(new Date(q.fromMs));
    where.push(`created_at >= $${params.length}`);
    params.push(new Date(q.toMs));
    where.push(`created_at <= $${params.length}`);
    if (q.status !== 'all') {
      params.push(q.status);
      where.push(`status = $${params.length}`);
    }
    const pageSize = Math.min(Math.max(1, q.pageSize), 200);
    const offset = Math.max(0, q.page) * pageSize;
    // The same has-more PROBE the player browse uses, for the same reason: a
    // window count re-reads the whole matching set on every page, and an ops
    // range can be far wider than a player's.
    params.push(pageSize + 1, offset);
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS}
         FROM woc_market_listings
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const hasMore = res.rows.length > pageSize;
    return { rows: (hasMore ? res.rows.slice(0, pageSize) : res.rows).map(toListing), hasMore };
  }

  /**
   * The OPERATOR p2p read: directed offers with the outcome each one reached.
   *
   * Sourced from the OFFERS table rather than from sales, because an offer is
   * the only row that exists for a trade that did not complete. Reading sales
   * would show the successes and silently omit every declined, withdrawn,
   * expired or unpaid attempt, which is the half an operator is usually looking
   * for. The listing and settlement are joined on so a completed trade still
   * reports what it settled for.
   */
  async opsP2pTrades(q: {
    realm: string;
    status: WocDirectedOfferStatus | 'all';
    fromMs: number;
    toMs: number;
    page: number;
    pageSize: number;
  }): Promise<{ rows: WocOpsP2pTradeRow[]; hasMore: boolean }> {
    const cols = OFFER_COLS.split(', ')
      .map((c) => `o.${c}`)
      .join(', ');
    const where: string[] = ['o.realm = $1'];
    const params: unknown[] = [q.realm];
    params.push(new Date(q.fromMs));
    where.push(`o.created_at >= $${params.length}`);
    params.push(new Date(q.toMs));
    where.push(`o.created_at <= $${params.length}`);
    if (q.status !== 'all') {
      params.push(q.status);
      where.push(`o.status = $${params.length}`);
    }
    const pageSize = Math.min(Math.max(1, q.pageSize), 200);
    const offset = Math.max(0, q.page) * pageSize;
    params.push(pageSize + 1, offset);
    const res = await this.pool.query(
      `SELECT ${cols},
              l.status AS listing_status, l.resolution AS listing_resolution,
              s.state AS settlement_state, s.settled_amount_base, s.tx_signature
         FROM woc_market_directed_offers o
         LEFT JOIN woc_market_listings l ON l.id = o.listing_id
         LEFT JOIN LATERAL (
           SELECT state, settled_amount_base, tx_signature
             FROM woc_market_settlements
            WHERE listing_id = o.listing_id
            ORDER BY id DESC LIMIT 1
         ) s ON o.listing_id IS NOT NULL
        WHERE ${where.join(' AND ')}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const hasMore = res.rows.length > pageSize;
    const rows = (hasMore ? res.rows.slice(0, pageSize) : res.rows).map(
      (row): WocOpsP2pTradeRow => ({
        ...toOffer(row),
        settlementState: (row.settlement_state ?? null) as string | null,
        settledAmountBase: row.settled_amount_base ?? null,
        txSignature: row.tx_signature ?? null,
      }),
    );
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
    try {
      return await this.withTx(async (client) => {
        // Fail fast on a contended row instead of pinning a pooled client for
        // the 15 s session bound (the escrowInsertListing rationale; the rare
        // 55P03 surfaces as the typed 'contended' refusal below). The idle
        // bound joined when the cancel-intent work grew this transaction two
        // extra round trips inside the FOR UPDATE window (the paid-window
        // probe and the intent stamp): the guard-transaction rule, not the
        // older-guard retrofit deferral.
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        await client.query(
          `SET LOCAL idle_in_transaction_session_timeout = ${GUARD_IDLE_TX_TIMEOUT_MS}`,
        );
        // LOCK ORDER note: this transaction takes the LISTING row first and
        // never acquires any bid row lock (the bid probe below is a plain
        // read), which is the only reason listing-first is deadlock-free
        // here. Any future bid-row WRITE in this transaction must first take
        // the ordered open-bid-set lock the way suspendListingIfSafe and
        // activateBid do (bids by id, then the listing).
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
        // The row lock above serializes this against claimBuyNowLock (an UPDATE
        // on the same row), and a buy-now settlement is only ever created behind
        // a claimed lock, so the unexpired-lock branch covers the whole
        // claim-then-insert window: a racer either landed before the lock
        // (visible here) or blocks on the row and re-checks against the
        // stamped or closed listing.
        //
        // CANCEL-INTENT (the abandon-loop ruling's second arm): an unexpired
        // lock no longer refuses the cancel outright. A PAID window (any
        // settlement past 'offered': the signature is in and the money may
        // land) still refuses settlement_live, because cancel-pending must
        // never tear a live settlement. An UNPAID window stamps the intent:
        // no new lock claims or bids from this moment, the current holder
        // keeps their full window, and the converge arm closes the listing
        // cancelled (return flight home) once the window ends unpaid. This
        // bounds the seller's worst-case cancel denial at exactly one lock
        // window.
        if (
          row.buy_now_lock_account !== null &&
          row.buy_now_lock_expires !== null &&
          ms(row.buy_now_lock_expires) > nowMs
        ) {
          const paid = await client.query(
            `SELECT 1 FROM woc_market_settlements
              WHERE listing_id = $1
                AND state IN ${PAID_SETTLEMENT_STATES_SQL}
              LIMIT 1`,
            [id],
          );
          if ((paid.rowCount ?? 0) > 0) throw new TxAbort('settlement_live' as const);
          // Race note: submitSettlementSignature takes no listing lock, so a
          // payment can move offered -> confirming between this probe and
          // the stamp below. Harmless downstream (the converge arm re-probes
          // and aborts over any open settlement, and a paid window's
          // finalize closes the listing sold, the stamp dying with the row),
          // but the seller may hear cancelPending for a sale that will
          // complete: cosmetic, accepted.
          await client.query(
            `UPDATE woc_market_listings
                SET cancel_requested_at = COALESCE(cancel_requested_at, to_timestamp($2 / 1000.0)),
                    updated_at = now()
              WHERE id = $1`,
            [id, nowMs],
          );
          return 'cancel_pending' as const;
        }
        // Expire-then-check, in that order. A leftover 'failed' settlement is
        // retry-eligible (failed -> offered) and the retry CAS never touches the
        // listing row, so a plain read here could miss a retry committing
        // mid-transaction. The expire UPDATE takes the settlement row locks: a
        // concurrent retry either loses its CAS against the expired row, or won
        // first and the check below sees the revived 'offered' and aborts,
        // rolling the expiry back.
        await client.query(
          `UPDATE woc_market_settlements
            SET state = 'expired', fail_reason = 'listing_cancelled', updated_at = now()
          WHERE listing_id = $1 AND state = 'failed'`,
          [id],
        );
        const open = await client.query(
          `SELECT 1 FROM woc_market_settlements
          WHERE listing_id = $1
            AND state IN ${OPEN_SETTLEMENT_STATES_SQL}
          LIMIT 1`,
          [id],
        );
        if ((open.rowCount ?? 0) > 0) throw new TxAbort('settlement_live' as const);
        const updated = await client.query(
          `UPDATE woc_market_listings
            SET status = 'closed', resolution = 'cancelled', updated_at = now()
          WHERE id = $1
          RETURNING ${LISTING_COLS}`,
          [id],
        );
        return toListing(updated.rows[0]);
      });
    } catch (err) {
      if (isLockContention(err)) return 'contended' as const;
      throw err;
    }
  }

  async suspendListingIfSafe(
    realm: string,
    id: number,
    nowMs: number,
  ): Promise<
    WocListingRow | 'not_found' | 'not_active' | 'buy_now_pending' | 'settlement_live' | 'contended'
  > {
    try {
      return await this.withTx(async (client) => {
        // Fail fast on contention (the escrowInsertListing rationale; the rare
        // 55P03 or 40P01 surfaces as the typed 'contended' refusal below).
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        // Lock order is bids THEN listing, matching activateBid (which locks its
        // bid row before the listing row): the reverse order deadlocks against a
        // concurrent bond activation. Bids inserted after this pass block on the
        // listing lock below (insertPendingBid locks the listing row), and the
        // cancel UPDATE further down re-scans by listing_id, so none are missed.
        // 'won' joins the pre-lock set because the expiry CTE below cancels a
        // dead settlement's winner: touching that row only after the listing
        // lock would cross finalizeDeliveredSettlement, which pre-locks the
        // winner before the listing (a genuine cycle, seen as 40P01).
        await client.query(
          `SELECT id FROM woc_market_bids
          WHERE listing_id = $1 AND status IN ('pending_bond', 'active', 'won')
          ORDER BY id
          FOR UPDATE`,
          [id],
        );
        const res = await client.query(
          `SELECT ${LISTING_COLS} FROM woc_market_listings
          WHERE realm = $1 AND id = $2 FOR UPDATE`,
          [realm, id],
        );
        const row = res.rows[0];
        if (!row) return 'not_found' as const;
        if (row.status === 'closed') return 'not_active' as const;
        if (
          row.buy_now_lock_account !== null &&
          row.buy_now_lock_expires !== null &&
          ms(row.buy_now_lock_expires) > nowMs
        ) {
          return 'buy_now_pending' as const;
        }
        // Only a pre-signature settlement ('offered', or 'failed' awaiting a
        // retry) is safe to expire; 'confirming' and beyond means a signature
        // exists and the payment may still land no matter what this transaction
        // does. Expire-then-check: the expire UPDATE locks the settlement rows,
        // so a buyer's offered -> confirming CAS either loses against the
        // expired row or won first, in which case the check below sees the open
        // settlement and aborts, rolling the expiry back.
        // Only a settlement no payment can be riding is safe to expire: 'failed'
        // (awaiting a retry), or 'offered' with NO live quote. A stamped,
        // unexpired quote means the buyer may already have broadcast the
        // on-chain transfer (the signature only reaches the server at confirm,
        // which is what moves the row to 'confirming'), so a quoted 'offered'
        // row refuses the suspend exactly like 'confirming' and beyond.
        // The CTE releases each expired settlement's close-time WINNER in the
        // same statement: a 'won' bid whose settlement dies administratively
        // must go 'cancelled' with its held bond queued for refund, or the
        // bond is stranded forever (bondsDue only reads refund_due and
        // forfeit_due; the pending/active teardown below never touches 'won'
        // rows, and the deadline path is the one that defaults and forfeits).
        await client.query(
          `WITH expired AS (
            UPDATE woc_market_settlements
               SET state = 'expired', fail_reason = 'listing_suspended', updated_at = now()
             WHERE listing_id = $1
               AND (state = 'failed'
                 OR (state = 'offered'
                   AND (quote_reference IS NULL OR quote_expires IS NULL
                     OR quote_expires <= to_timestamp($2 / 1000.0))))
             RETURNING bid_id
          )
          UPDATE woc_market_bids b
             SET status = 'cancelled',
                 bond_state = CASE WHEN b.bond_state = 'held' THEN 'refund_due' ELSE b.bond_state END
            FROM expired e
           WHERE b.id = e.bid_id AND b.status = 'won'`,
          [id, nowMs],
        );
        const open = await client.query(
          `SELECT 1 FROM woc_market_settlements
          WHERE listing_id = $1
            AND state IN ${OPEN_SETTLEMENT_STATES_SQL}
          LIMIT 1`,
          [id],
        );
        if ((open.rowCount ?? 0) > 0) throw new TxAbort('settlement_live' as const);
        // Cancel the open bid book and queue every funded bond for refund in the
        // same statement (the activateBid CASE idiom), so a crash can never
        // leave a suspended listing holding live bids or a stranded bond.
        // EXCEPT a paid-but-undecided bond (pending_bond, recorded signature,
        // unheld): it stays with the bond poll rather than being cancelled
        // out of the polling set with money possibly in flight (the finalize
        // teardown carries the full rationale). The suspended listing closes
        // either way; the late verdict resolves against it.
        await client.query(
          `UPDATE woc_market_bids
            SET status = 'cancelled',
                bond_state = CASE WHEN bond_state = 'held' THEN 'refund_due' ELSE bond_state END
          WHERE listing_id = $1 AND status IN ('pending_bond', 'active')
            AND NOT (status = 'pending_bond' AND bond_signature IS NOT NULL
              AND bond_state = 'pending')`,
          [id],
        );
        const updated = await client.query(
          `UPDATE woc_market_listings
            SET status = 'closed', resolution = 'suspended', updated_at = now()
          WHERE id = $1
          RETURNING ${LISTING_COLS}`,
          [id],
        );
        return toListing(updated.rows[0]);
      });
    } catch (err) {
      if (isLockContention(err)) return 'contended' as const;
      throw err;
    }
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

  /** The no-winner close arms (no_bids, reserve_not_met) ride this guarded
   *  variant: those arms never reach insertSettlement's unique-index arbiter,
   *  so an unguarded close would land under a live buy-now settlement (a
   *  buy-now placed inside the closing window; the lock has no ends_at fence
   *  by design), and the return sweep would mail the escrowed item home while
   *  the buyer can still pay and be delivered a second copy. Lock first, then
   *  check, then close: a single guarded UPDATE is NOT enough here, because a
   *  blocked UPDATE re-checks its qual via EvalPlanQual, whose subquery still
   *  reads the OLD statement snapshot and can miss a settlement that
   *  committed while we waited. Under the held row lock, insertSettlement
   *  (which takes the same lock first) cannot be mid-flight, and a fresh
   *  statement sees everything committed before the lock was granted. A
   *  false return means a settlement is riding the listing (or the row is
   *  contended); the caller parks it 'settling' and the delivery or overdue
   *  sweeps resolve it. */
  async closeListingIfNoOpenSettlement(
    id: number,
    resolution: WocListingResolution,
  ): Promise<boolean> {
    try {
      return await this.withTx(async (client) => {
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        const row = await client.query(
          `SELECT status FROM woc_market_listings WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (!row.rows[0] || row.rows[0].status === 'closed') return false;
        const open = await client.query(
          `SELECT 1 FROM woc_market_settlements
            WHERE listing_id = $1
              AND state IN ${OPEN_SETTLEMENT_STATES_SQL}
            LIMIT 1`,
          [id],
        );
        if ((open.rowCount ?? 0) > 0) return false;
        await client.query(
          `UPDATE woc_market_listings
              SET status = 'closed', resolution = $2, updated_at = now()
            WHERE id = $1`,
          [id, resolution],
        );
        return true;
      });
    } catch (err) {
      // Contention here means a settlement insert is landing; treat it like a
      // live settlement and let the caller park the listing.
      if (isLockContention(err)) return false;
      throw err;
    }
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

  async undisposedClosedListings(
    realm: string,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocListingRow[]> {
    // Sold rows are excluded HERE, not just by the caller's skip: a sold row
    // that keeps its undisposed flag (an old-binary crash between close and
    // dispose) would otherwise occupy a batch slot on every pass forever and
    // could saturate the return arm; the stuck-custody readout is what
    // surfaces those rows instead. NULL resolution (which no close path
    // writes) stays included: returning an unaccounted close is the fail-safe.
    // excludeIds are the caller's backing-off parked rows: excluding them in
    // the query is what lets a parked row cost neither a batch slot nor a
    // rotation write per pass while it waits.
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS} FROM woc_market_listings
        WHERE realm = $1 AND status = 'closed' AND item_disposed = false
          AND (resolution IS NULL OR resolution <> 'sold')
          AND id <> ALL($3::bigint[])
        ORDER BY ${PARK_ROTATION_ORDER}
        LIMIT $2`,
      [realm, limit, excludeIds],
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
    // Fail-closed twin of the reclaim arm's liveness read: the read and this
    // write are separate statements, so a settlement that lands between them
    // (a buy-now inside the closing window) must refuse the reopen here
    // rather than re-auction a listing a payment is riding. 'failed' is in
    // the refusal set alongside the five open states: a retry-eligible row
    // belongs to the overdue sweep's deadline pass (default, forfeit, strike,
    // cascade), and reopening around it would let that pass be skipped. The
    // next reclaim pass re-evaluates.
    await this.pool.query(
      `UPDATE woc_market_listings SET status = 'active', updated_at = now()
        WHERE id = $1 AND status IN ('ending', 'settling')
          AND NOT EXISTS (
            SELECT 1 FROM woc_market_settlements s
             WHERE s.listing_id = woc_market_listings.id
               AND (s.state = 'failed' OR s.state IN ${OPEN_SETTLEMENT_STATES_SQL}))`,
      [id],
    );
  }

  /** Atomic loser demote: outbid the bid and queue its held bond for refund
   *  in ONE statement (the activateBid CASE idiom), compare-and-set from
   *  'active' so a bid a concurrent suspend already cancelled is left alone.
   *  The old two-statement shape could crash between the status write and the
   *  bond write, leaving a held bond no sweep arm would ever reach. */
  async markBidOutbidQueueRefund(bidId: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_bids
          SET status = 'outbid',
              bond_state = CASE WHEN bond_state = 'held' THEN 'refund_due' ELSE bond_state END
        WHERE id = $1 AND status = 'active'`,
      [bidId],
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

  async custodyRefState(custodyRef: string): Promise<WocCustodyRefState | null> {
    const res = await this.pool.query(
      `SELECT booked_at IS NOT NULL AS booked, grant_character_id,
              mail_intent_at IS NOT NULL AS mail_intent
         FROM woc_market_custody_claims
        WHERE custody_ref = $1`,
      [custodyRef],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      booked: Boolean(row.booked),
      grantCharacterId: row.grant_character_id === null ? null : Number(row.grant_character_id),
      mailIntent: Boolean(row.mail_intent),
    };
  }

  async markCustodyGrantIntent(custodyRef: string, characterId: number): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_custody_claims SET grant_character_id = $2
        WHERE custody_ref = $1 AND booked_at IS NULL`,
      [custodyRef, characterId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Stamp the mail-rail intent, WITHDRAWING any grant intent in the same
   *  statement: the one legal conversion is a grantCopy refusal (nothing
   *  entered the bags, so the hand-off provably left nothing behind). */
  async markCustodyMailIntent(custodyRef: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_custody_claims
          SET mail_intent_at = now(), grant_character_id = NULL
        WHERE custody_ref = $1 AND booked_at IS NULL`,
      [custodyRef],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** The buyer's bags after a hand-to-hand delivery, lease-fenced like every
   *  other character write here, PLUS the booking, in ONE transaction: the
   *  granted bags and the "this ref is delivered" record can never tear apart,
   *  so an ambiguous throw (a commit whose reply was lost) is resolvable
   *  afterwards by reading booked_at. 'lease_lost' means the fence matched no
   *  row (a takeover rotated the nonce): NOTHING landed, and this process must
   *  not claim the delivery happened. 'claim_missing' means the claim row was
   *  gone or already booked under us, which only hand intervention can cause;
   *  the character half rolls back with it (fail toward stuck, never toward an
   *  unaccounted grant). No bid or listing row is locked here: the transaction
   *  touches only the characters row and the claim row, so the market lock
   *  order does not apply (carve-out, see server/CLAUDE.md).
   */
  async saveDeliveredCharacterBooked(
    save: CharacterSaveArgs,
    custodyRef: string,
  ): Promise<'booked' | 'lease_lost' | 'claim_missing'> {
    return this.withTx(async (client) => {
      // A delivery save should wait out a slow database rather than lose the
      // grant (the saveCharacterState rationale); still bounded by the heavy
      // allowance so a sweep pass cannot hang past the container stop grace.
      // The LOCK wait is bounded separately and tightly: this is the one
      // market transaction that takes a characters row lock (the game loop's
      // autosave contends it), and holding a pooled client for the heavy
      // allowance while queued on that row would starve the loop's own saves.
      // A 55P03 here surfaces as the transient-throw arm and retries.
      await client.query(`SET LOCAL statement_timeout = ${DB_HEAVY_STATEMENT_TIMEOUT_MS}`);
      await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
      const saved = await saveCharacterStateOnClient(
        client,
        save.characterId,
        save.level,
        save.state,
        save.leaseNonce,
      );
      if (!saved) throw new TxAbort('lease_lost' as const);
      const booked = await client.query(
        `UPDATE woc_market_custody_claims SET booked_at = now()
          WHERE custody_ref = $1 AND booked_at IS NULL`,
        [custodyRef],
      );
      if ((booked.rowCount ?? 0) === 0) throw new TxAbort('claim_missing' as const);
      return 'booked' as const;
    });
  }

  /** The stuck classes the ops monitor reads. Every read is O(cap), not
   *  O(stuck set): the counts SATURATE at countCap through an inner LIMIT
   *  subquery (a bare count consumed every stuck row per refresh, measured as
   *  a temp spill at incident-sized backlogs), and the samples are their own
   *  capped index reads. One honest exception: the stuckBonds COUNT must
   *  exhaust the signed-pending candidate set to prove fewer than cap
   *  matches, so its sparse-match cost tracks that set (bounded by the
   *  listings retention cascade), not the cap; the sample itself is a capped
   *  ordered index read on placed_at. Age signals are columns the
   *  park-and-rotate machinery never touches (rotation writes
   *  sweep_parked_at only): the delivering class ages on updated_at, stamped
   *  when the row entered 'delivering', so a slow payment leg is not
   *  reported stuck the moment delivery begins. */
  async stuckCustodyReadout(
    realm: string,
    olderThanMs: number,
    sampleLimit: number,
    countCap: number,
    bondOlderThanMs: number,
  ): Promise<WocStuckCustodyClasses> {
    // Fail CLOSED on a bad cap: a non-finite value would interpolate as NaN
    // and error at runtime; clamping to 1 keeps the read tiny instead.
    const cap = Number.isFinite(countCap) && countCap >= 1 ? Math.trunc(countCap) : 1;
    // count === cap means "cap or more" (the LIMIT saturates); saturated makes
    // that explicit on the wire so 1000 cannot read as "exactly 1000".
    const count = async (body: string, params: unknown[]): Promise<number> => {
      const res = await this.pool.query(
        `SELECT count(*)::int AS n FROM (SELECT 1 ${body} LIMIT ${cap}) capped`,
        params,
      );
      return Number(res.rows[0]?.n ?? 0);
    };
    const claimsWhere = `FROM woc_market_custody_claims
        WHERE realm = $1 AND booked_at IS NULL AND claimed_at <= to_timestamp($2 / 1000.0)`;
    const claims = await this.pool.query(
      `SELECT custody_ref, claimed_at, grant_character_id, mail_intent_at
         ${claimsWhere}
        ORDER BY claimed_at
        LIMIT $3`,
      [realm, olderThanMs, sampleLimit],
    );
    const claimCount = await count(claimsWhere, [realm, olderThanMs]);
    const deliveringWhere = `FROM woc_market_settlements
        WHERE realm = $1 AND state = 'delivering' AND updated_at <= to_timestamp($2 / 1000.0)`;
    const delivering = await this.pool.query(
      `SELECT id, listing_id, created_at, updated_at
         ${deliveringWhere}
        ORDER BY updated_at
        LIMIT $3`,
      [realm, olderThanMs, sampleLimit],
    );
    const deliveringCount = await count(deliveringWhere, [realm, olderThanMs]);
    const undisposedWhere = `FROM woc_market_listings
        WHERE realm = $1 AND status = 'closed' AND item_disposed = false
          AND updated_at <= to_timestamp($2 / 1000.0)`;
    const undisposed = await this.pool.query(
      `SELECT id, resolution, updated_at
         ${undisposedWhere}
        ORDER BY updated_at
        LIMIT $3`,
      [realm, olderThanMs, sampleLimit],
    );
    const undisposedCount = await count(undisposedWhere, [realm, olderThanMs]);
    // No age filter: a 'review' row was ALREADY aged by the overdue sweep's
    // confirming bound before it got here, and every one is operator-owed
    // now. Ordered and served by woc_market_settlements_state_updated.
    const reviewWhere = `FROM woc_market_settlements
        WHERE realm = $1 AND state = 'review'`;
    const review = await this.pool.query(
      `SELECT id, listing_id, created_at, updated_at
         ${reviewWhere}
        ORDER BY updated_at
        LIMIT $2`,
      [realm, sampleLimit],
    );
    const reviewCount = await count(reviewWhere, [realm]);
    // Paid-but-undecided bonds past the bound: still polled, but the verdict
    // is overdue and an operator should verify the signature by hand. Aged on
    // the SIGNATURE recording (placed_at only for legacy rows), the same axis
    // the poll park uses: placement age says nothing about how long the chain
    // has had the transfer. The partial-index predicate (status + signature)
    // narrows the candidate set; the age filter applies after it, fine for a
    // 30s-cached diagnostic read.
    const stuckBondsWhere = `FROM woc_market_bids
        WHERE realm = $1 AND status = 'pending_bond' AND bond_signature IS NOT NULL
          AND COALESCE(bond_signature_at, placed_at) <= to_timestamp($2 / 1000.0)`;
    // The sample ORDERS on placed_at, which woc_market_bids_bond_confirming
    // serves ordered with the LIMIT pushed down; ordering on the COALESCE
    // age axis had no matching expression index, so it materialized and
    // top-N sorted EVERY signed pending bond in the realm per refresh
    // (measured about 4,000 buffers at 5k confirming bonds), a cost that
    // grows with total bid volume exactly during the incident this readout
    // exists to report. placed_at diverges from the signature axis by at
    // most minutes (a signature lands within the quote and lock windows)
    // while the stuck threshold is hours, so WHICH rows appear in the
    // 20-row sample is effectively unchanged; stuck_since still reports the
    // honest age axis per row.
    const stuckBonds = await this.pool.query(
      `SELECT id, listing_id, account, placed_at,
              COALESCE(bond_signature_at, placed_at) AS stuck_since
         ${stuckBondsWhere}
        ORDER BY placed_at
        LIMIT $3`,
      [realm, bondOlderThanMs, sampleLimit],
    );
    const stuckBondCount = await count(stuckBondsWhere, [realm, bondOlderThanMs]);
    return {
      unbookedClaims: {
        count: claimCount,
        saturated: claimCount >= cap,
        sample: claims.rows.map((r) => ({
          custodyRef: String(r.custody_ref),
          claimedAtMs: ms(r.claimed_at),
          grantCharacterId: r.grant_character_id === null ? null : Number(r.grant_character_id),
          mailIntent: r.mail_intent_at !== null,
        })),
      },
      stuckDelivering: {
        count: deliveringCount,
        saturated: deliveringCount >= cap,
        sample: delivering.rows.map((r) => ({
          id: Number(r.id),
          listingId: Number(r.listing_id),
          createdAtMs: ms(r.created_at),
          updatedAtMs: ms(r.updated_at),
        })),
      },
      undisposedListings: {
        count: undisposedCount,
        saturated: undisposedCount >= cap,
        sample: undisposed.rows.map((r) => ({
          id: Number(r.id),
          resolution: r.resolution === null ? null : String(r.resolution),
          updatedAtMs: ms(r.updated_at),
        })),
      },
      reviewSettlements: {
        count: reviewCount,
        saturated: reviewCount >= cap,
        sample: review.rows.map((r) => ({
          id: Number(r.id),
          listingId: Number(r.listing_id),
          createdAtMs: ms(r.created_at),
          updatedAtMs: ms(r.updated_at),
        })),
      },
      stuckBonds: {
        count: stuckBondCount,
        saturated: stuckBondCount >= cap,
        sample: stuckBonds.rows.map((r) => ({
          id: Number(r.id),
          listingId: Number(r.listing_id),
          account: Number(r.account),
          placedAtMs: ms(r.placed_at),
          stuckSinceMs: ms(r.stuck_since),
        })),
      },
    };
  }

  async markItemDisposed(id: number): Promise<void> {
    // The rotation stamp clears with the terminal flag (see the finalize
    // transaction's settlement CAS for the rationale).
    await this.pool.query(
      `UPDATE woc_market_listings
          SET item_disposed = true, updated_at = now(), sweep_parked_at = NULL
        WHERE id = $1`,
      [id],
    );
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
    // The REFUSAL path stays LOCK-FREE (the old single-UPDATE's property):
    // on a hot listing the refusal is the common path, and diagnosing it
    // under FOR UPDATE serialized every hopeful behind the holder while each
    // held a pooled client (measured at two orders of magnitude of latency
    // amplification). This advisory pre-read answers every refusal class from
    // plain SELECTs (diagnose() owns six, cooldownRefused the seventh);
    // every check is RE-RUN under the row lock below, so a stale advisory
    // verdict only ever tells a caller to retry, never corrupts a claim.
    const diagnose = (
      row: Row | undefined,
    ):
      | 'not_found'
      | 'own_listing'
      | 'not_active'
      | 'no_buy_now'
      | 'cancel_pending'
      | 'locked'
      | null => {
      // The old single-UPDATE's diagnosis order, kept verbatim; cancel_pending
      // sits before 'locked' (a locked, cancel-pending listing is going away,
      // and "try again in a moment" would be a lie).
      if (!row) return 'not_found';
      if (row.seller_account === account) return 'own_listing';
      if (row.status !== 'active') return 'not_active';
      if (row.buy_now_cents === null) return 'no_buy_now';
      if (row.cancel_requested_at !== null) return 'cancel_pending';
      const lockHeld =
        row.buy_now_lock_account !== null &&
        row.buy_now_lock_expires !== null &&
        ms(row.buy_now_lock_expires) > nowMs;
      return lockHeld ? 'locked' : null;
    };
    // An OPEN settlement outlives its lock window (a buy-now listing stays
    // 'active' through confirming and delivery), so an expired lock is NOT
    // evidence of abandonment while one stands: the holder may be
    // mid-payment. Refuse the claim outright (the insert would refuse
    // live_settlement_exists anyway) and record NOTHING, or a rival's probe
    // could stamp a PAYING buyer with an unearned abandon. Served by the
    // one-open-settlement unique index.
    const openSettlement = async (q: Pick<Pool, 'query'>): Promise<boolean> => {
      const open = await q.query(
        `SELECT 1 FROM woc_market_settlements
          WHERE listing_id = $1 AND state IN ${OPEN_SETTLEMENT_STATES_SQL}
          LIMIT 1`,
        [id],
      );
      return (open.rowCount ?? 0) > 0;
    };
    // The two CLAIMER-scoped cooldown probes over committed ledger rows,
    // shared by the advisory pass and the authoritative in-transaction
    // re-check. In the advisory pass they are safe BECAUSE the rows are
    // committed and only the 30-day retention can remove one, far outside
    // every cooldown window, so a stale advisory refusal cannot occur; what
    // the advisory pass CANNOT see is a self-steal's own abandon, which is
    // recorded moments earlier in the same transaction and is exactly why
    // the in-tx re-check stays.
    const cooldownRefused = async (q: Pick<Pool, 'query'>): Promise<boolean> => {
      const cooled = await q.query(
        `SELECT 1 FROM woc_market_buy_now_abandons
          WHERE listing_id = $1 AND account = $2
            AND lock_expires > to_timestamp($3 / 1000.0)
          LIMIT 1`,
        [id, account, nowMs - WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS * 1000],
      );
      if ((cooled.rowCount ?? 0) > 0) return true;
      // Saturating count: the LIMIT caps what is COUNTED, but the plan
      // still materializes the account's in-window index entries before
      // the limit applies, so the read is O(this account's last-hour
      // rows), which the cap's own refusals bound to a handful.
      const capped = await q.query(
        `SELECT count(*)::int AS n FROM (
           SELECT 1 FROM woc_market_buy_now_abandons
            WHERE account = $1 AND realm = $2
              AND lock_expires > to_timestamp($3 / 1000.0)
            LIMIT ${WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR}) c`,
        [account, realm, nowMs - WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS * 1000],
      );
      return Number(capped.rows[0]?.n ?? 0) >= WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR;
    };
    // The advisory reads share the transaction path's contention mapping: a
    // plain SELECT can still block on boot DDL's AccessExclusive hold, and
    // an asymmetric raw throw here would 500 exactly the callers the
    // lock-free path exists to protect. The advisory pass answers all SEVEN
    // refusal classes for evidence already committed; the one cooldown case
    // it cannot answer is the self-steal (its abandon row does not exist
    // yet), which falls through and pays the transaction, where the
    // recording plus the re-check refuse it. Before the probes moved up
    // here, a cooled-down account's retries (20/min under the bid policy)
    // each took the listing FOR UPDATE just to be refused, handing the
    // proven-abusive caller a lock that blocks bids and the seller cancel.
    try {
      const peek = await this.pool.query(
        `SELECT ${LISTING_COLS} FROM woc_market_listings WHERE realm = $1 AND id = $2`,
        [realm, id],
      );
      const advisory = diagnose(peek.rows[0]);
      if (advisory !== null) return advisory;
      if (await openSettlement(this.pool)) return 'locked' as const;
      // The lock-free cooldown answer applies ONLY when the row carries no
      // recordable expired lock: past diagnose(), any standing lock here is
      // EXPIRED, and refusing lock-free over one would skip the steal-time
      // recording (an at-cap account self-stealing its own expired window
      // would never book THAT abandon, so its per-listing cooldown never
      // started). With a dead lock present the claim pays the transaction
      // once, records, and every later retry is answered lock-free off the
      // committed row.
      if (
        peek.rows[0].directed_buyer_account === null &&
        peek.rows[0].buy_now_lock_account === null &&
        (await cooldownRefused(this.pool))
      ) {
        return 'claim_cooldown' as const;
      }
    } catch (err) {
      if (isLockContention(err)) return 'contended' as const;
      throw err;
    }
    try {
      return await this.withTx(async (client) => {
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        await client.query(
          `SET LOCAL idle_in_transaction_session_timeout = ${GUARD_IDLE_TX_TIMEOUT_MS}`,
        );
        // LOCK ORDER carve-out: no bid row lock is ever taken here (the
        // cancelListingIfUnbid rationale), so listing-first is deadlock-free.
        // Beyond the listing row this transaction also takes the settlement
        // reads (plain) and, on the recorder arm, the abandons INSERT's FK
        // share locks (accounts, listings): a non-cyclic blocking edge,
        // bounded by lock_timeout and retryable. In practice the edge is
        // thinner than it reads: FOR KEY SHARE does not conflict with the
        // FOR NO KEY UPDATE an ordinary accounts UPDATE takes, so only an
        // explicit FOR UPDATE on the abandoner's accounts row (today:
        // escrowInsertListing, which locks accounts BEFORE any listing work
        // and so cannot close a cycle with this listing-first hold) can make
        // a claim wait here.
        const res = await client.query(
          `SELECT ${LISTING_COLS} FROM woc_market_listings
            WHERE realm = $1 AND id = $2 FOR UPDATE`,
          [realm, id],
        );
        // The AUTHORITATIVE re-checks: everything the advisory pass answered,
        // re-read under the lock.
        const row = res.rows[0];
        const verdict = diagnose(row);
        if (verdict !== null) return verdict;
        if (await openSettlement(client)) return 'locked' as const;
        // A dead lock still on the row (with no live settlement) is a
        // recorded abandonment of its holder: the steal is the first moment
        // anyone LOOKS at an expired lock, and recording here (not only in
        // the overdue sweep) is what stops the holder from re-claiming their
        // own expired lock in the crash window between the sweep's recording
        // and its lock clear. Public only: a directed buyer's walk-away keeps
        // its strike instead (the resolved ruling). THE ONE SHARED STATEMENT
        // (RECORD_ABANDON_SQL): the exempt-window predicate and the dedupe
        // key are identical to the sweep recorder's by construction, so the
        // two can never disagree on what counts as a walk-away.
        if (
          row.buy_now_lock_account !== null &&
          row.buy_now_lock_expires !== null &&
          row.directed_buyer_account === null
        ) {
          await client.query(RECORD_ABANDON_SQL, [
            realm,
            id,
            row.buy_now_lock_account,
            ms(row.buy_now_lock_expires),
            ABANDON_EXEMPT_REASONS,
          ]);
        }
        // The authoritative cooldown re-check, CLAIMER-scoped and public-only
        // (a directed buyer claims the sale their seller addressed to them
        // regardless of their public-loop history; the directed rail has its
        // own strike). Runs under the held listing lock, AFTER the recording
        // above, so a self-steal's own fresh abandon refuses it in the same
        // transaction, which the advisory copy of these probes can never see.
        if (row.directed_buyer_account === null && (await cooldownRefused(client))) {
          return 'claim_cooldown' as const;
        }
        const updated = await client.query(
          `UPDATE woc_market_listings
              SET buy_now_lock_account = $2,
                  buy_now_lock_expires = to_timestamp($3 / 1000.0),
                  updated_at = now()
            WHERE id = $1
            RETURNING ${LISTING_COLS}`,
          [id, account, expiresAtMs],
        );
        return toListing(updated.rows[0]);
      });
    } catch (err) {
      if (isLockContention(err)) return 'contended' as const;
      throw err;
    }
  }

  /** Release a buy-now lock, but only the HOLDER'S: the guard makes call-site
   *  safety local (the 02 handoff). Without it the overdue sweep's abandon
   *  arm, clearing for a settlement whose window ended long ago, could wipe a
   *  NEW claimer's live lock that stole the expired one in between. */
  async clearBuyNowLock(id: number, holderAccount: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_listings
          SET buy_now_lock_account = NULL, buy_now_lock_expires = NULL, updated_at = now()
        WHERE id = $1 AND buy_now_lock_account = $2`,
      [id, holderAccount],
    );
  }

  /** The overdue sweep's abandon recorder (public buy-now windows that
   *  expired unpaid): the ONE shared statement (RECORD_ABANDON_SQL, also the
   *  steal arm's), whose window key dedupes the recorders. The exempt
   *  predicate is NARROW on purpose: only a signed window whose refusal is
   *  an infrastructure verdict (the bound WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS
   *  list, service_unavailable alone) escapes recording. A genuinely
   *  chain-refused payment (refused / quote_expired / any service verdict)
   *  still records: those classes are attacker-reachable, and the honest
   *  buyer they occasionally catch eats one recoverable abandon row (the
   *  rules-file comment carries the full rationale). */
  async recordBuyNowAbandon(
    realm: string,
    listingId: number,
    account: number,
    lockExpiresAtMs: number,
  ): Promise<void> {
    await this.pool.query(RECORD_ABANDON_SQL, [
      realm,
      listingId,
      account,
      lockExpiresAtMs,
      ABANDON_EXEMPT_REASONS,
    ]);
  }

  /** The cancel-intent converge read: stamped, still-active listings whose
   *  lock window has ended (expired or cleared). Served by the partial
   *  woc_market_listings_cancel_rotation index on the shared rotation order;
   *  excludeIds are the caller's backing-off skipped rows (a paid window
   *  converges through settlement, not here, so its listing would otherwise
   *  head the batch every pass until that settlement resolves). */
  async cancelPendingListings(
    realm: string,
    nowMs: number,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocListingRow[]> {
    const res = await this.pool.query(
      `SELECT ${LISTING_COLS} FROM woc_market_listings
        WHERE realm = $1 AND status = 'active' AND cancel_requested_at IS NOT NULL
          AND (buy_now_lock_account IS NULL
            OR buy_now_lock_expires IS NULL
            OR buy_now_lock_expires <= to_timestamp($2 / 1000.0))
          AND id <> ALL($4::bigint[])
        ORDER BY ${PARK_ROTATION_ORDER}
        LIMIT $3`,
      [realm, nowMs, limit, excludeIds],
    );
    return res.rows.map(toListing);
  }

  /**
   * Close one cancel-pending listing whose window ended unpaid: the converge
   * arm's twin of cancelListingIfUnbid's close tail, under the same listing
   * lock and the same open-settlement guard, so it can NEVER tear a live
   * settlement (a paid window proceeds to settlement and the finalize closes
   * the listing 'sold' instead; the stamp dies with the closed row).
   *
   * LOCK ORDER carve-out: no bid row lock (the cancelListingIfUnbid
   * rationale; the bid probe is a plain read). The failed-settlement expiry
   * UPDATE does take settlement row locks after the listing lock, the same
   * listing-then-settlements order every settlement-touching transaction
   * uses.
   */
  async closeCancelPendingListing(
    realm: string,
    id: number,
    nowMs: number,
  ): Promise<WocListingRow | 'skip' | 'contended'> {
    try {
      return await this.withTx(async (client) => {
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        await client.query(
          `SET LOCAL idle_in_transaction_session_timeout = ${GUARD_IDLE_TX_TIMEOUT_MS}`,
        );
        const res = await client.query(
          `SELECT ${LISTING_COLS} FROM woc_market_listings
            WHERE realm = $1 AND id = $2 FOR UPDATE`,
          [realm, id],
        );
        const row = res.rows[0];
        if (!row || row.status !== 'active' || row.cancel_requested_at === null) {
          return 'skip' as const;
        }
        // Re-check the window under the lock: a racing claim cannot exist
        // (claims refuse cancel_pending), but the read above ran unlocked.
        if (
          row.buy_now_lock_account !== null &&
          row.buy_now_lock_expires !== null &&
          ms(row.buy_now_lock_expires) > nowMs
        ) {
          return 'skip' as const;
        }
        // Belt: bids cannot land after the stamp (insertPendingBid refuses
        // cancel_pending) and the seller cancel that stamped it verified the
        // book was empty, so a live bid here is a hand-moved row.
        const bids = await client.query(
          `SELECT 1 FROM woc_market_bids
            WHERE listing_id = $1 AND status IN ('pending_bond', 'active') LIMIT 1`,
          [id],
        );
        if ((bids.rowCount ?? 0) > 0) return 'skip' as const;
        // Expire-then-check, exactly the cancelListingIfUnbid shape ('failed'
        // rows only, ON PURPOSE: the abandoned window's expired-deadline
        // 'offered' settlement belongs to the overdue arm, which is also the
        // canonical abandon recorder, so this arm waits a pass rather than
        // expire it and lose the abandon row). Any OPEN settlement (a paid
        // window included) ABORTS the close below, rolling the speculative
        // failed-expiry back with it: an expired 'failed' row that skipped
        // the overdue deadline pass would strand its held bond (the sibling
        // cancel's TxAbort rationale, kept identical here).
        await client.query(
          `UPDATE woc_market_settlements
            SET state = 'expired', fail_reason = 'listing_cancelled', updated_at = now()
          WHERE listing_id = $1 AND state = 'failed'`,
          [id],
        );
        const open = await client.query(
          `SELECT 1 FROM woc_market_settlements
          WHERE listing_id = $1
            AND state IN ${OPEN_SETTLEMENT_STATES_SQL}
          LIMIT 1`,
          [id],
        );
        if ((open.rowCount ?? 0) > 0) throw new TxAbort('skip' as const);
        const updated = await client.query(
          `UPDATE woc_market_listings
            SET status = 'closed', resolution = 'cancelled', updated_at = now()
          WHERE id = $1
          RETURNING ${LISTING_COLS}`,
          [id],
        );
        return toListing(updated.rows[0]);
      });
    } catch (err) {
      if (isLockContention(err)) return 'contended' as const;
      throw err;
    }
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
    return this.withTx(async (client) => {
      // LOCK ORDER carve-out: no EXISTING bid row lock is ever taken here
      // (the INSERT below mints a fresh row), so listing-first is
      // deadlock-free; a crossing finalize re-locks the open set AFTER its
      // listing lock precisely because this path can commit a new bid.
      const res = await client.query(
        `SELECT ${LISTING_COLS} FROM woc_market_listings
          WHERE realm = $1 AND id = $2 FOR UPDATE`,
        [args.realm, args.listingId],
      );
      if (!res.rows[0]) return { ok: false, reason: 'not_found' as const };
      const listing = toListing(res.rows[0]);
      if (listing.status !== 'active') return { ok: false, reason: 'not_active' as const };
      if (listing.endsAtMs <= args.nowMs) return { ok: false, reason: 'not_active' as const };
      // Cancel-intent blocks NEW bids too, not only lock claims: a bid landing
      // after the stamp would re-deny the seller's cancel past the one-window
      // bound the ruling promises (has_bids refuses the converge close).
      if (listing.cancelRequestedAtMs !== null) {
        return { ok: false, reason: 'cancel_pending' as const };
      }
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
      // Placement deliberately does NOT extend the auction any more: an
      // unpaid pending bid is free to mint, so extending here let wallets
      // with no money down burn the whole anti-snipe cap. The extension now
      // rides BOND PROGRESS (extendAuctionForBondProgress, fired when the
      // signature is recorded), which keeps the in-flight-confirmation
      // protection while pricing the grief at a real broadcast payment.
      return { ok: true as const, bid: toBid(inserted.rows[0]) };
    });
  }

  /**
   * Anti-snipe, at BOND PROGRESS: called once when a bid's signature is
   * recorded (the moment it becomes 'confirming', which held/paid then
   * follows). The extension math is the caller's injected pure rule; the cap
   * behavior is unchanged from the old placement-time arm.
   *
   * LOCK ORDER carve-out: this transaction takes the LISTING row only and
   * never a bid row lock (the signature UPDATE it follows is its own
   * committed single statement), so listing-first is deadlock-free here, the
   * cancelListingIfUnbid rationale. Best-effort by design: on 'contended' the
   * signature is already safely recorded and only the extension is lost,
   * which fails toward a shorter auction, never toward lost money.
   */
  async extendAuctionForBondProgress(
    realm: string,
    listingId: number,
    extendEndsToMs: (row: WocListingRow) => number | null,
  ): Promise<'extended' | 'skip' | 'contended'> {
    try {
      return await this.withTx(async (client) => {
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        await client.query(
          `SET LOCAL idle_in_transaction_session_timeout = ${GUARD_IDLE_TX_TIMEOUT_MS}`,
        );
        const res = await client.query(
          `SELECT ${LISTING_COLS} FROM woc_market_listings
            WHERE realm = $1 AND id = $2 FOR UPDATE`,
          [realm, listingId],
        );
        if (!res.rows[0]) return 'skip' as const;
        const listing = toListing(res.rows[0]);
        if (listing.status !== 'active') return 'skip' as const;
        const extended = extendEndsToMs(listing);
        if (extended === null) return 'skip' as const;
        await client.query(
          `UPDATE woc_market_listings SET ends_at = to_timestamp($2 / 1000.0), updated_at = now()
            WHERE id = $1`,
          [listingId, extended],
        );
        return 'extended' as const;
      });
    } catch (err) {
      if (isLockContention(err)) return 'contended' as const;
      throw err;
    }
  }

  /**
   * Record the signature a bidder handed back, BEFORE the chain has decided.
   *
   * Mirrors submitSettlementSignature, and for the same reason: a bond that has
   * landed but not finalized must stay re-checkable rather than be refused with
   * the money already gone. The UNIQUE index on the column is what makes a
   * replayed signature a diagnosable refusal instead of a second funded bond.
   */
  async submitBondSignature(
    bidId: number,
    signature: string,
    nowMs: number,
  ): Promise<{ signatureAtMs: number } | 'not_pending' | 'signature_reused'> {
    try {
      // COALESCE: an idempotent resubmission of the same signature keeps the
      // FIRST recording moment (the poll park axis and the extension anchor
      // both mean "when the payment claim arrived", not "the latest retry").
      // RETURNING hands that moment back so the caller's extension anchors on
      // the first arrival too: a fresh-clock anchor per resubmit let one
      // pending-forever signature hold the close at now plus the extension
      // continuously up to the cap. The CASE closes the legacy corner: a
      // pre-column row (signature set, stamp NULL) must fall back to
      // placed_at like every reader, never adopt the RESUBMIT's clock as its
      // first arrival.
      const res = await this.pool.query(
        `UPDATE woc_market_bids
            SET bond_signature = $2,
                bond_signature_at = COALESCE(
                  bond_signature_at,
                  CASE WHEN bond_signature IS NOT NULL THEN placed_at
                       ELSE to_timestamp($3 / 1000.0) END
                )
          WHERE id = $1 AND status = 'pending_bond'
            AND (bond_signature IS NULL OR bond_signature = $2)
          RETURNING bond_signature_at`,
        [bidId, signature, nowMs],
      );
      const row = res.rows[0];
      return row ? { signatureAtMs: ms(row.bond_signature_at) } : 'not_pending';
    } catch (err) {
      // 23505: the unique index caught this signature against ANOTHER bid.
      if ((err as { code?: string }).code === '23505') return 'signature_reused';
      throw err;
    }
  }

  /** Bonds that were paid but whose chain verdict was still undecided. The
   *  sweep re-checks these; without the signature there is nothing to
   *  re-check, so the predicate matches the partial index exactly. Ordered
   *  on the poll rotation (parked rows cycle to the tail); excludeIds are
   *  the caller's backing-off parked rows. */
  async confirmingBonds(
    realm: string,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocBidRow[]> {
    const res = await this.pool.query(
      `SELECT ${BID_COLS} FROM woc_market_bids
        WHERE realm = $1 AND status = 'pending_bond' AND bond_signature IS NOT NULL
          AND id <> ALL($3::bigint[])
        ORDER BY ${BOND_POLL_ROTATION_ORDER} LIMIT $2`,
      [realm, limit, excludeIds],
    );
    return res.rows.map(toBid);
  }

  /** Rotate one bond to the poll tail (see the rotation index's rationale).
   *  Writes poll_parked_at ONLY, never placed_at (the readout's age).
   *  Measured write cost (2026-08-12, disposable-instance EXPLAIN): one park
   *  dirties about 11 pages, because poll_parked_at sits inside an indexed
   *  expression (never HOT) and woc_market_bids carries nine indexes; four
   *  rotation arms at 25 rows per 5s pass bound the bookkeeping at roughly
   *  1,200 such writes per minute under a standing backlog. Size the
   *  autovacuum posture for woc_market_bids against that, not against the
   *  player-driven write rate. */
  async touchBidPollRow(id: number): Promise<void> {
    await this.pool.query(`UPDATE woc_market_bids SET poll_parked_at = now() WHERE id = $1`, [id]);
  }

  /** One bond the chain decided against. Narrowed to pending_bond so a bid that
   *  activated in the meantime is never torn down by a late verdict, AND to an
   *  unheld bond: a HELD bond (a settled verdict whose activation is still
   *  retrying its lock race) must never void on a later contradictory verdict
   *  (a reorg flip), or held money strands in a state no refund arm reads.
   *  The no-op leaves such a row with confirmingBonds (visible via the
   *  stuckBonds readout class); the exits are a settled re-verdict retrying
   *  the activation, or operator resolution. Returns whether a row lapsed,
   *  so the poll can park the held survivor instead of re-polling it at the
   *  batch head every pass. */
  async lapseBid(bidId: number): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_bids SET status = 'lapsed', bond_state = 'void'
        WHERE id = $1 AND status = 'pending_bond' AND bond_state = 'pending'`,
      [bidId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Compare-and-set: a quote applies only to an UNPAID bond. A recorded
   *  signature means a payment may already be broadcast against the CURRENT
   *  reference, and the poller re-checks reference and signature as a pair:
   *  overwriting the reference would read a real payment as refused and lapse
   *  a funded bond (the H4 awaiting-finality loss). False = nothing written. */
  async setBidBondQuote(bidId: number, reference: string, expiresAtMs: number): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_bids
          SET bond_reference = $2, bond_quote_expires = to_timestamp($3 / 1000.0)
        WHERE id = $1 AND status = 'pending_bond' AND bond_signature IS NULL`,
      [bidId, reference, expiresAtMs],
    );
    return (res.rowCount ?? 0) > 0;
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
   * to 'void' with no refund leg. The signature arm is what makes that claim
   * atomic: a bond with a recorded signature may be PAID and merely awaiting
   * finality, and voiding it here would discard money in flight, so such a
   * bid stays with its poller until the chain decides.
   */
  async abandonPendingBid(realm: string, bidId: number, account: number): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE woc_market_bids
          SET status = 'cancelled', bond_state = 'void'
        WHERE realm = $1 AND id = $2 AND account = $3 AND status = 'pending_bond'
          AND bond_signature IS NULL`,
      [realm, bidId, account],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async activateBid(
    bidId: number,
    nowMs: number,
  ): Promise<'activated' | 'superseded' | 'listing_closed' | 'not_pending' | 'contended'> {
    try {
      return await this.activateBidTx(bidId, nowMs);
    } catch (err) {
      // A deadlock victim or lock-timeout loser (a crossing finalize holds
      // the listing while re-locking a bid this transaction pre-locked)
      // retries on the bond poll's next pass instead of surfacing as a raw
      // sweep-arm failure.
      if (isLockContention(err)) return 'contended';
      throw err;
    }
  }

  private async activateBidTx(
    bidId: number,
    nowMs: number,
  ): Promise<'activated' | 'superseded' | 'listing_closed' | 'not_pending'> {
    return this.withTx(async (client) => {
      // Lock the whole open bid set for the listing in id order BEFORE the
      // listing row (the file-wide order; suspendListingIfSafe scans the same
      // way). The old shape locked only its own bid here and acquired the
      // PREVIOUS current bid later, after the listing, which crossed the
      // suspend guard's ordered scan and deadlocked 40P01 whenever the
      // previous bid had the lower id. The unlocked peek is only a router: a
      // bid that changes state before the ordered lock lands is re-read under
      // the lock below and answered 'not_pending'.
      const peek = await client.query(`SELECT listing_id FROM woc_market_bids WHERE id = $1`, [
        bidId,
      ]);
      if (!peek.rows[0]) return 'not_pending' as const;
      await client.query(
        `SELECT id FROM woc_market_bids
          WHERE listing_id = $1 AND status IN ('pending_bond', 'active')
          ORDER BY id
          FOR UPDATE`,
        [peek.rows[0].listing_id],
      );
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
             -- A bond with a signature is PAID and merely awaiting the chain's
             -- verdict. Lapsing it would void a bond the bidder already funded.
             AND bond_signature IS NULL
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

  async nextCascadeBidder(
    listingId: number,
    minCents: number,
    excludedAccounts: readonly number[],
  ): Promise<WocBidRow | null> {
    // Selection only: the 'won' stamp rides the settlement insert
    // (insertSettlement winnerBidId), so a crash between pick and insert
    // leaves nothing to unwind and the next pass simply re-picks. Lock-free
    // on the single-sweeper premise (woc_market_sweep.ts holds the per-realm
    // advisory lock, pinned by tests/woc_market_sweep.test.ts); the one-open-
    // settlement index is the arbiter if that premise is ever broken.
    const res = await this.pool.query(
      `SELECT ${BID_COLS} FROM woc_market_bids
        WHERE listing_id = $1 AND status = 'outbid' AND amount_cents >= $2
          AND NOT (account = ANY($3::int[]))
        ORDER BY amount_cents DESC, placed_at ASC, id ASC
        LIMIT 1`,
      [listingId, minCents, excludedAccounts],
    );
    return res.rows[0] ? toBid(res.rows[0]) : null;
  }

  async markBidStatus(bidId: number, status: WocBidStatus, from?: WocBidStatus[]): Promise<void> {
    if (from) {
      await this.pool.query(
        `UPDATE woc_market_bids SET status = $2 WHERE id = $1 AND status = ANY($3::text[])`,
        [bidId, status, from],
      );
      return;
    }
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
    winnerBidId?: number;
    winnerFrom?: WocBidStatus[];
  }): Promise<
    WocSettlementRow | 'live_settlement_exists' | 'listing_closed' | 'winner_gone' | 'contended'
  > {
    try {
      return await this.withTx(async (client) => {
        // Bounded waits: this transaction takes the listing row lock below,
        // and the cancel/suspend guards hold theirs across several statements
        // (the escrowInsertListing rationale); a 55P03 or 40P01 surfaces as
        // the typed 'contended' refusal.
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        // The winner stamp comes FIRST so the lock order is bid then listing,
        // the same order activateBid and suspendListingIfSafe use; the
        // reverse order deadlocks against a concurrent bond activation. A
        // conflict or a closed listing aborts the transaction and rolls the
        // stamp back, so no bid can ever sit 'won' with no settlement behind
        // it. The compare-and-set holds the CONVERSE too: a named winner that
        // left the caller's pickable states (a concurrent suspend cancelled
        // it) aborts as the distinct 'winner_gone', so no settlement can
        // exist whose winner holds no claim; callers treat it exactly like
        // 'live_settlement_exists' (their unwind CAS writes no-op either
        // way), the label only stops the next reader from misdiagnosing.
        if (args.winnerBidId !== undefined) {
          const stamped = await client.query(
            `UPDATE woc_market_bids SET status = 'won'
              WHERE id = $1 AND status = ANY($2::text[])`,
            [args.winnerBidId, args.winnerFrom ?? ['active', 'outbid']],
          );
          if ((stamped.rowCount ?? 0) === 0) throw new TxAbort('winner_gone' as const);
        }
        // Serialize against cancel, suspend, and the guarded no-winner close:
        // the INSERT's own status predicate below is evaluated on the
        // statement snapshot, and the FK's KEY SHARE lock only DELAYS a
        // concurrent closer's commit, never refuses it (the FK re-check only
        // needs the row to EXIST, so a settlement could land on a listing the
        // closer just closed; reproduced against a real database). The
        // explicit row lock plus a status re-read under it is what refuses.
        const lockRow = await client.query(
          `SELECT status FROM woc_market_listings WHERE id = $1 FOR UPDATE`,
          [args.listingId],
        );
        if (!lockRow.rows[0]) {
          // A missing listing keeps the historical conflation.
          throw new TxAbort('live_settlement_exists' as const);
        }
        if (lockRow.rows[0].status === 'closed') {
          // A cancel or suspend landed first (callers answer not_active).
          throw new TxAbort('listing_closed' as const);
        }
        const res = await client.query(
          `INSERT INTO woc_market_settlements (
             listing_id, realm,
             bid_id, attempt, buyer_account, buyer_character, buyer_name,
             buyer_wallet, amount_cents, deadline_at
           )
           SELECT $1, realm, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0)
             FROM woc_market_listings WHERE id = $1 AND status <> 'closed'
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
        if (!res.rows[0]) {
          // Unreachable belt: the row was present and open under the lock
          // held above, so the INSERT's own status predicate cannot miss.
          throw new TxAbort('live_settlement_exists' as const);
        }
        return toSettlement(res.rows[0]);
      });
    } catch (err) {
      // The partial unique index (one open settlement per listing) is the
      // authority; a racer sees 23505 and the whole transaction, winner stamp
      // included, rolls back.
      if ((err as { code?: string }).code === '23505') return 'live_settlement_exists';
      if (isLockContention(err)) return 'contended';
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
    // The state list mirrors the woc_market_settlements_open2 partial unique
    // index: 'delivered' stays open until the listing row closes, so the
    // reclaim/cancel/suspend liveness checks keep seeing it.
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE listing_id = $1
          AND state IN ${OPEN_SETTLEMENT_STATES_SQL}
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
    try {
      const res = await this.pool.query(
        `UPDATE woc_market_settlements
            SET state = $3, fail_reason = COALESCE($4, fail_reason), updated_at = now()
          WHERE id = $1 AND state = ANY($2::text[])`,
        [id, from, to, failReason ?? null],
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      // The failed -> offered retry revival is the one transition that moves
      // a row INTO the one-open-settlement index predicate, and a second open
      // settlement may legally exist beside a 'failed' row (the cascade
      // builds exactly that pair). The index refuses the revival with 23505;
      // report it as an ordinary CAS miss so the caller answers a typed
      // refusal instead of a 500.
      if ((err as { code?: string }).code === '23505') return false;
      throw err;
    }
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

  async deliveringSettlements(
    realm: string,
    limit: number,
    excludeIds: readonly number[],
  ): Promise<WocSettlementRow[]> {
    // excludeIds: the caller's backing-off parked rows (see the listing twin).
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE realm = $1 AND state = 'delivering'
          AND id <> ALL($3::bigint[])
        ORDER BY ${PARK_ROTATION_ORDER}
        LIMIT $2`,
      [realm, limit, excludeIds],
    );
    return res.rows.map(toSettlement);
  }

  /** One PAGE of the delivered-but-unclosed sweep: a bounded slice of open
   *  listing ids (by id, after the caller's cursor), probed through the
   *  settlements listing_id index. Two statements ON PURPOSE: the single-join
   *  form handed the planner a hash join that read the ENTIRE settlements
   *  table under a LIMIT it could not push down (measured as a parallel seq
   *  scan at realistic listing counts), while this shape is O(page) no matter
   *  what the planner prefers. lastListingId null means the cycle is
   *  exhausted and the caller's cursor resets.
   *
   *  The RESIDUE fetch is bounded separately (maxSettlements): every returned
   *  row costs the caller a full finalize transaction plus a realm mail-book
   *  write on the shared serial writer, so an unbounded page (a legacy
   *  upgrade's backlog, at exactly the boot least able to absorb it) must
   *  converge over several beats, not one. When the fetch truncates,
   *  lastListingId is the last RETURNED row's listing so the next beat
   *  resumes right behind it instead of skipping the remainder to the next
   *  cursor wrap. */
  async deliveredUnclosedSettlementsPage(
    realm: string,
    afterListingId: number,
    pageSize: number,
    maxSettlements: number,
  ): Promise<{ settlements: WocSettlementRow[]; lastListingId: number | null }> {
    const ids = await this.pool.query(
      `SELECT id FROM woc_market_listings
        WHERE realm = $1 AND status IN ('active', 'ending', 'settling') AND id > $2
        ORDER BY id
        LIMIT $3`,
      [realm, afterListingId, pageSize],
    );
    if (ids.rows.length === 0) return { settlements: [], lastListingId: null };
    const listingIds = ids.rows.map((r) => Number(r.id));
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE listing_id = ANY($1::bigint[]) AND state = 'delivered'
        ORDER BY listing_id
        LIMIT $2`,
      [listingIds, maxSettlements + 1],
    );
    const settlements = res.rows.map(toSettlement);
    if (settlements.length > maxSettlements) {
      const kept = settlements.slice(0, maxSettlements);
      // The cursor lands ON the last kept row's listing, so a further
      // 'delivered' settlement sharing that listing id is skipped this
      // cycle. That converges anyway: the kept row's finalize closes the
      // listing, and a closed listing's delivered settlements are the
      // terminal shape (they leave this page's id set for good).
      return {
        settlements: kept,
        lastListingId: kept[kept.length - 1]?.listingId ?? null,
      };
    }
    return {
      settlements,
      lastListingId: listingIds[listingIds.length - 1] ?? null,
    };
  }

  /** Converge an older binary's sold-but-undisposed residue: a closed sold
   *  listing with a STANDING sale row provably completed its delivery, so the
   *  dispose flag is pure bookkeeping the crashed tail owed. A sold row with
   *  NO standing sale stays parked (the stuck readout carries it; only an
   *  operator can say what happened). Lock-order carve-out: this takes ONLY
   *  listing rows and SKIP LOCKED means it never waits on one, so it can
   *  neither deadlock nor stall behind a concurrent finalize; a skipped row
   *  is the next beat's business. */
  async disposeSoldResidueListings(realm: string, limit: number): Promise<number> {
    const res = await this.pool.query(
      `UPDATE woc_market_listings
          SET item_disposed = true, updated_at = now()
        WHERE id IN (
          SELECT l.id FROM woc_market_listings l
           WHERE l.realm = $1 AND l.status = 'closed' AND l.item_disposed = false
             AND l.resolution = 'sold'
             AND EXISTS (
               SELECT 1 FROM woc_market_sales s
                WHERE s.listing_id = l.id AND s.excluded = false)
           ORDER BY l.id
           LIMIT $2
           FOR UPDATE OF l SKIP LOCKED)`,
      [realm, limit],
    );
    return res.rowCount ?? 0;
  }

  /** Rotate a parked settlement to the back of the batch queue so it cannot
   *  own the head of a batch forever. Writes sweep_parked_at ONLY: the stuck
   *  readout ages this class on updated_at (stamped when the row entered
   *  'delivering'), and rotating that column faster than the stuck threshold
   *  made a permanently parked row invisible to the monitor by construction. */
  async touchSettlementRow(id: number): Promise<void> {
    await this.pool.query(
      `UPDATE woc_market_settlements SET sweep_parked_at = now() WHERE id = $1`,
      [id],
    );
  }

  /** The listing twin, for a parked RETURN: the undisposed backlog orders by
   *  the rotation expression, so a permanently refused return still cycles to
   *  the tail while its updated_at age keeps counting for the readout. */
  async touchListingRow(id: number): Promise<void> {
    await this.pool.query(`UPDATE woc_market_listings SET sweep_parked_at = now() WHERE id = $1`, [
      id,
    ]);
  }

  /** The delivery close tail as ONE transaction: the 'delivered' transition,
   *  the sale row, the listing close + dispose, and every bond flip commit
   *  together or not at all, so no crash point between them can exist. The
   *  compare-and-set accepts 'delivered' as well as 'delivering' on purpose:
   *  that is what lets the reclaim arm re-drive a settlement an older binary
   *  (whose tail was separately-committed statements) left delivered with the
   *  listing still open, and it makes a re-run of the whole method converge
   *  (the sale insert dedupes on the partial unique index, the close and the
   *  bond flips are all compare-and-set). A re-run whose close CAS matches
   *  nothing reports 'already_final', so the caller neither re-counts nor
   *  re-notifies converged work. Lock order: this transaction touches bid
   *  rows AND the listing row, so it pre-locks the open bid set plus the
   *  winner bid by id, then the listing, matching every other market guard
   *  (server/CLAUDE.md); 55P03/40P01 surface as 'contended' and the caller
   *  retries on a later pass. */
  async finalizeDeliveredSettlement(args: {
    settlementId: number;
    listingId: number;
    bidId: number | null;
    sale: Omit<WocSaleRow, 'id' | 'excluded' | 'atMs'>;
  }): Promise<'finalized' | 'already_final' | 'stale' | 'contended'> {
    try {
      return await this.withTx(async (client) => {
        await client.query(`SET LOCAL lock_timeout = ${ESCROW_LOCK_TIMEOUT_MS}`);
        // The whole tail holds the listing plus open-bid locks, so its total
        // hold must be bounded by more than the per-statement pool default:
        // the same explicit allowance the escrow and delivered-save guards
        // set. The cost of the allowance is that a pathologically slow
        // finalize can refuse bids/cancels/suspends on this one listing for
        // up to the heavy window (each surfaces as its typed 'contended'
        // after its own 2s lock_timeout), which is the accepted trade
        // against aborting a money-path commit mid-flight.
        await client.query(`SET LOCAL statement_timeout = ${DB_HEAVY_STATEMENT_TIMEOUT_MS}`);
        // Bids first (open set plus the winner, in id order), listing second.
        await client.query(
          `SELECT id FROM woc_market_bids
            WHERE listing_id = $1 AND (status IN ('pending_bond', 'active') OR id = $2)
            ORDER BY id
            FOR UPDATE`,
          [args.listingId, args.bidId],
        );
        const listing = await client.query(
          `SELECT status FROM woc_market_listings WHERE id = $1 FOR UPDATE`,
          [args.listingId],
        );
        if (!listing.rows[0]) throw new TxAbort('stale' as const);
        // Re-lock the open set now that the listing lock is held: a buy-now
        // finalize can run while the listing is still 'active', so a bid
        // inserted between the pre-lock and the listing lock (insertPendingBid
        // is listing-lock-first) would otherwise reach the cancel UPDATE
        // below unlocked. With the listing held no further insert can land;
        // a crossing activateBid surfaces as 40P01 and both sides retry
        // typed ('contended' here, the bond poll's next pass there).
        await client.query(
          `SELECT id FROM woc_market_bids
            WHERE listing_id = $1 AND status IN ('pending_bond', 'active')
            ORDER BY id
            FOR UPDATE`,
          [args.listingId],
        );
        // sweep_parked_at clears on the terminal transition so a row that
        // parked, recovered, and somehow re-entered a rotation class cannot
        // carry a stale rotation key that outranks its true age.
        const advanced = await client.query(
          `UPDATE woc_market_settlements
              SET state = 'delivered', updated_at = now(), sweep_parked_at = NULL
            WHERE id = $1 AND state IN ('delivering', 'delivered')`,
          [args.settlementId],
        );
        if ((advanced.rowCount ?? 0) === 0) throw new TxAbort('stale' as const);
        // Dedupe on the provenance invariant, not an error path: a re-driven
        // tail (or an admin correction race) leaves the standing row alone.
        await client.query(
          `INSERT INTO woc_market_sales (
             realm, listing_id, item_id, item, price_cents, amount_base,
             seller_account, buyer_account, seller_name, buyer_name
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (listing_id) WHERE excluded = false DO NOTHING`,
          [
            args.sale.realm,
            args.sale.listingId,
            args.sale.itemId,
            JSON.stringify(args.sale.item),
            args.sale.priceCents,
            args.sale.amountBase,
            args.sale.sellerAccount,
            args.sale.buyerAccount,
            args.sale.sellerName,
            args.sale.buyerName,
          ],
        );
        // Close and dispose in ONE statement: two UPDATEs on the same row
        // wrote two row versions (and two sets of entries across this table's
        // many partial indexes) per sale, measured at 64 percent extra churn.
        // The CASE keeps an already-closed row's resolution, and the WHERE
        // makes this a real compare-and-set: a row already closed AND
        // disposed matches nothing, which is what downgrades the whole
        // re-run to 'already_final' below.
        const closed = await client.query(
          `UPDATE woc_market_listings
              SET status = 'closed',
                  resolution = CASE WHEN status = 'closed' THEN resolution ELSE $2 END,
                  item_disposed = true,
                  updated_at = now(),
                  sweep_parked_at = NULL
            WHERE id = $1 AND (status <> 'closed' OR item_disposed = false)`,
          [args.listingId, 'sold'],
        );
        if (args.bidId !== null) {
          // The winner's held bond flows home after a completed settlement.
          await client.query(
            `UPDATE woc_market_bids SET bond_state = 'refund_due'
              WHERE id = $1 AND bond_state = 'held'`,
            [args.bidId],
          );
        }
        // Every still-open bid cancels with its held bond queued for refund,
        // atomically per row (the markBidOutbidQueueRefund CASE idiom): the
        // old per-bid loop could crash between the cancel and the refund.
        // EXCEPT a paid-but-undecided bond (pending_bond with a recorded
        // signature and an unheld bond): cancelling it would drop it out of
        // the polling set with money possibly in flight and no arm ever able
        // to move it again. It stays 'pending_bond'; the bond poll resolves
        // it (a settled verdict activates against the closed listing, whose
        // supersede arm routes the held bond to refund_due; a verdict against
        // lapses it), so cancellation can never orphan a bond.
        await client.query(
          `UPDATE woc_market_bids
              SET status = 'cancelled',
                  bond_state = CASE WHEN bond_state = 'held' THEN 'refund_due' ELSE bond_state END
            WHERE listing_id = $1 AND status IN ('pending_bond', 'active')
              AND NOT (status = 'pending_bond' AND bond_signature IS NOT NULL
                AND bond_state = 'pending')`,
          [args.listingId],
        );
        // The verdict reads the CLOSE CAS alone. A racing close CAN land
        // between deliverOne's itemDisposed read and this transaction, in
        // which case the settlement CAS matches while the close does not and
        // the run reports already_final; that is benign (the racing finalize
        // already counted and notified, and deliverOne treats both verdicts
        // as advanced), so the close verdict stays the single source.
        return (closed.rowCount ?? 0) > 0 ? ('finalized' as const) : ('already_final' as const);
      });
    } catch (err) {
      if (isLockContention(err)) return 'contended';
      throw err;
    }
  }

  /** The deadline backlog. Single-arm on purpose (the H15 confirming bound
   *  is its sibling read below): the former OR across the two arms planned
   *  as a BitmapOr plus a sort before the LIMIT, and worse, confirming
   *  backlogs carry the OLDEST deadlines by construction, so they owned the
   *  whole shared batch head and starved the offered/failed expiry work
   *  (whose abandon recording and bond forfeits then stall). */
  async overdueSettlements(
    realm: string,
    nowMs: number,
    limit: number,
  ): Promise<WocSettlementRow[]> {
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE realm = $1
          AND state IN ('offered', 'failed') AND deadline_at <= to_timestamp($2 / 1000.0)
        ORDER BY deadline_at
        LIMIT $3`,
      [realm, nowMs, limit],
    );
    return res.rows.map(toSettlement);
  }

  /** The H15 bound's own read: 'confirming' rows older than the cutoff
   *  (aged on updated_at, which nothing re-stamps while the poll returns
   *  undecided), oldest first, with its own batch budget. Served ordered by
   *  woc_market_settlements_state_updated (realm, state, updated_at) with
   *  the LIMIT pushed down, which the shared OR arm could not do. */
  async confirmingOverdueSettlements(
    realm: string,
    cutoffMs: number,
    limit: number,
  ): Promise<WocSettlementRow[]> {
    const res = await this.pool.query(
      `SELECT ${SETTLEMENT_COLS} FROM woc_market_settlements
        WHERE realm = $1 AND state = 'confirming' AND updated_at <= to_timestamp($2 / 1000.0)
        ORDER BY updated_at
        LIMIT $3`,
      [realm, cutoffMs, limit],
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

  async setSaleExcluded(id: number, excluded: boolean): Promise<'ok' | 'miss' | 'conflict'> {
    try {
      const res = await this.pool.query(`UPDATE woc_market_sales SET excluded = $2 WHERE id = $1`, [
        id,
        excluded,
      ]);
      return (res.rowCount ?? 0) > 0 ? 'ok' : 'miss';
    } catch (err) {
      // Re-including a voided row while its correction stands would violate
      // woc_market_sales_listing_once; refuse as a typed conflict (distinct
      // from a missing row, so the operator hears what is actually wrong),
      // never a 500.
      if ((err as { code?: string }).code === '23505') return 'conflict';
      throw err;
    }
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

/** Nightly retention for the buy-now abandon ledger: a row is dead once it is
 *  outside every cooldown window (minutes to an hour), so any positive
 *  retention is generous forensics headroom. 0 keeps rows forever (the sweep
 *  contract's fail-safe). No ORDER BY: the cutoff column has no global index
 *  (lock_expires leads only per account), per the prune rules. The accepted
 *  plan (measured 2026-08-12, disposable instance, 20k rows): the zero-match
 *  probe walks one full index (about 100 buffers) and the match case seq
 *  scans twice (about 1,100 buffers), so cost tracks table size, not batch
 *  size. Acceptable BECAUSE the cap bounds the table (three rows per account
 *  per hour, 30-day window); if the ledger ever grows past that shape, add
 *  the cursor index the sibling listings prune carries instead of an ORDER
 *  BY. */
export async function pruneWocBuyNowAbandonsBatch(
  pool: Pool,
  retentionDays: number,
  batchSize: number,
): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const days = Math.max(1, Math.floor(retentionDays));
  const res = await pool.query(
    `DELETE FROM woc_market_buy_now_abandons
      WHERE id IN (
        SELECT id FROM woc_market_buy_now_abandons
         WHERE lock_expires < now() - ($1 || ' days')::interval
         LIMIT $2)`,
    [String(days), Math.max(1, Math.floor(batchSize))],
  );
  return res.rowCount ?? 0;
}

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
