// The SQL half of the directed-sale boundary.
//
// tests/server/woc_market_service.test.ts drives the service against FakeWocMarketDb,
// so it proves the RULES but never the QUERIES: deleting the browse exclusion from
// the real SQL leaves that suite entirely green, because the fake reimplements
// browse in TypeScript. These tests drive PgWocMarketDb itself against a mock pool
// and assert on the statement text, which is the only thing that ships.
//
// The predicate under test is a security boundary (a directed sale is addressed to
// one named account and must never enter a public result set), so it is pinned to a
// literal rather than a shape.

import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PgWocMarketDb, SETTLED_OFFER_GRACE_MS } from '../../server/woc_market_db';
import type { CharacterState } from '../../src/sim/sim';

const REALM = 'Claudemoon';

/** A pool that records every statement (and its bound parameters) and answers
 *  with no rows. */
function recordingPool(): { pool: Pool; sql: () => string[]; params: () => unknown[][] } {
  const seen: string[] = [];
  const bound: unknown[][] = [];
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    seen.push(text);
    bound.push(values ?? []);
    return { rows: [], rowCount: 0 };
  });
  return { pool: { query } as unknown as Pool, sql: () => seen, params: () => bound };
}

const browseQuery = {
  page: 0,
  pageSize: 20,
  quality: null,
  format: null,
  itemIds: null,
  sort: 'ending',
} as const;

describe('the public browse query excludes directed sales in SQL', () => {
  it('carries the directed_buyer_account IS NULL predicate', async () => {
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).browseListings(REALM, browseQuery);
    const [text] = sql();
    expect(text).toContain('directed_buyer_account IS NULL');
  });

  it('keeps the predicate on EVERY sort, not just the default', async () => {
    // Each sort builds its own ORDER BY against the same WHERE. A refactor that
    // rebuilt the clause per sort could drop the exclusion from one of them, and
    // one leaking sort is a full leak.
    for (const sort of ['ending', 'newest', 'price_asc', 'price_desc'] as const) {
      const { pool, sql } = recordingPool();
      await new PgWocMarketDb(pool).browseListings(REALM, { ...browseQuery, sort });
      expect(sql()[0], sort).toContain('directed_buyer_account IS NULL');
    }
  });

  it('keeps the predicate when the caller also filters by quality, format and item', async () => {
    // The optional filters append to the same WHERE array; appending must never
    // displace the unconditional exclusion.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).browseListings(REALM, {
      ...browseQuery,
      quality: 'epic',
      format: 'buy_now',
      itemIds: ['sword'],
    });
    expect(sql()[0]).toContain('directed_buyer_account IS NULL');
  });
});

describe('the seller listing cap counts public listings only, in SQL', () => {
  it('excludes directed rows from the count', async () => {
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).countActiveBySeller(REALM, 7);
    expect(sql()[0]).toContain('directed_buyer_account IS NULL');
  });
});

describe('the schema carries the directed column additively', () => {
  it('adds the column with ADD COLUMN IF NOT EXISTS, never a bare CREATE TABLE', async () => {
    // ensureSchema re-applies this DDL at every boot against tables that already
    // exist, so a column introduced only inside CREATE TABLE IF NOT EXISTS would
    // never appear on a deployed realm and every directed query would error.
    const { WOC_MARKET_SCHEMA } = await import('../../server/woc_market_db');
    expect(WOC_MARKET_SCHEMA).toContain('ADD COLUMN IF NOT EXISTS directed_buyer_account');
    expect(WOC_MARKET_SCHEMA).toContain('woc_market_listings_directed_buyer');
  });
});

describe('the listing-id stamp is reachable on an already-accepted offer', () => {
  // The bug this pins cost a full test cycle to find, and every existing test
  // passed through it, because FakeWocMarketDb modelled the arm that the real
  // SQL was missing. The service claims the offer ('pending' -> 'accepted'),
  // creates the listing, then calls back to stamp the id. By then the row is
  // 'accepted', so a WHERE narrowed to 'pending' matched zero rows: the offer
  // never learned its listing, both windows sat at "review" forever, and the
  // buyer was never offered the chance to pay.
  //
  // Asserted on the STATEMENT, because that is the half the fake cannot vouch
  // for and the half that actually ships.
  it('accepts a stamp when the row is accepted with no listing yet', async () => {
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).resolveDirectedOffer(REALM, 3, 'accepted', { listingId: 41 });
    const [text] = sql();
    expect(text).toContain("status = 'pending'");
    expect(text, 'the stamp arm must exist at all').toContain("status = 'accepted'");
    expect(text, 'and only while no listing is set').toContain('listing_id IS NULL');
  });

  it('still compare-and-sets on pending, so two accepts cannot both escrow', () => {
    // The stamp arm must not weaken the claim: it changes no status and refuses
    // once a listing is present, so it can never resurrect a resolved offer.
    const { pool, sql } = recordingPool();
    return new PgWocMarketDb(pool).resolveDirectedOffer(REALM, 3, 'declined').then(() => {
      const [text] = sql();
      expect(text).toContain("status = 'pending'");
    });
  });
});

describe('abandoning a bid is a compare-and-set, not a read-then-write', () => {
  it('narrows on the owner AND the pending status in the statement', async () => {
    // Both arms matter and neither is decorative. The owner arm stops one player
    // cancelling another's bid; the status arm is what makes the button safe to
    // press at all, since a bond can land while the player is reaching for "Not
    // now", and cancelling THEN would drop a bid the auction already counts.
    const { pool, sql, params } = recordingPool();
    await new PgWocMarketDb(pool).abandonPendingBid(REALM, 12, 34);
    const [text] = sql();
    expect(text).toContain("status = 'cancelled'");
    expect(text).toContain("bond_state = 'void'");
    expect(text).toContain("status = 'pending_bond'");
    expect(text).toContain('account = $3');
    expect(text).toContain('realm = $1');
    expect(params()[0]).toEqual([REALM, 12, 34]);
  });

  it('reports whether it actually matched, so the service can refuse', async () => {
    // rowCount is the only evidence the row was still pending. Returning true
    // unconditionally would tell a player their bid was withdrawn while it was
    // still holding the listing lock.
    const seen: string[] = [];
    const zero = {
      query: vi.fn(async (t: string) => {
        seen.push(t);
        return { rows: [], rowCount: 0 };
      }),
    } as unknown as Pool;
    expect(await new PgWocMarketDb(zero).abandonPendingBid(REALM, 12, 34)).toBe(false);
    const one = {
      query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
    } as unknown as Pool;
    expect(await new PgWocMarketDb(one).abandonPendingBid(REALM, 12, 34)).toBe(true);
  });
});

describe('a finished sale stops being a live offer', () => {
  it('excludes offers whose listing has closed', async () => {
    // Otherwise a completed deal stays in both trade windows forever, showing
    // "Paid" and blocking the same two players from starting a fresh one.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).directedOffersForAccount(REALM, 7);
    const [text] = sql();
    expect(text).toContain("l.status <> 'closed'");
    // And an offer with no listing yet (still under review) must survive it.
    expect(text).toContain('o.listing_id IS NULL');
  });

  it('keeps a JUST-closed sale readable, so both sides can see it complete', async () => {
    // The exclusion above, taken alone, is the opposite bug and it shipped: an
    // offer vanished the instant its listing closed, so the client's 'settled'
    // phase was unreachable and the trade window simply emptied. That reads as
    // the item being sent without payment. The grace window is what makes the
    // completion observable, so it is pinned as a THIRD arm of the predicate,
    // not merely as a parameter.
    const { pool, sql, params } = recordingPool();
    const now = 1_800_000_000_000;
    await new PgWocMarketDb(pool).directedOffersForAccount(REALM, 7, now);
    const [text] = sql();
    expect(text).toContain('l.updated_at > $3');
    // Bound to the constant, not to a number repeated here: a test that restates
    // the literal passes when the two drift apart, which is the whole failure.
    expect(params()[0]?.[2]).toEqual(new Date(now - SETTLED_OFFER_GRACE_MS));
    // Long enough that both clients (2s poll) observe it before it drops.
    expect(SETTLED_OFFER_GRACE_MS).toBeGreaterThan(10_000);
  });

  it('joins the LATEST settlement, so a payment in flight is visible', async () => {
    // Without this the seller cannot distinguish a buyer signing in their wallet
    // from a buyer who walked away: both look like "waiting for payment" until
    // the item disappears. ORDER BY id DESC because a buyer may retry, and only
    // the newest attempt describes what is happening now.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).directedOffersForAccount(REALM, 7);
    const [text] = sql();
    expect(text).toContain('s.state AS settlement_state');
    expect(text).toContain('woc_market_settlements');
    expect(text).toContain('ORDER BY id DESC LIMIT 1');
  });
});

describe('the bond finality queue, in SQL', () => {
  it('excludes a SIGNED bond from the TTL lapse sweep', async () => {
    // The fake models this too, so the statement is pinned separately: reaping
    // a bond the bidder has already funded voids their money while the chain is
    // still deciding.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).lapsePendingBids(REALM, 1_000, 50);
    expect(sql()[0]).toContain('bond_signature IS NULL');
  });

  it('re-checks only bonds that HAVE a signature', async () => {
    // Without one there is nothing to ask the chain about, and the row belongs
    // to the TTL arm instead.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).confirmingBonds(REALM, 50);
    const [text] = sql();
    expect(text).toContain("status = 'pending_bond'");
    expect(text).toContain('bond_signature IS NOT NULL');
  });

  it('records a signature only against a still-pending bid', async () => {
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).submitBondSignature(7, 'sig');
    const [text] = sql();
    expect(text).toContain("status = 'pending_bond'");
    // Idempotent on a retry of the SAME signature, so a client re-send is not
    // mistaken for a reuse.
    expect(text).toContain('bond_signature IS NULL OR bond_signature = $2');
  });

  it('lapses a decided-against bond only while it is still pending', async () => {
    // A bid that activated in the meantime must not be torn down by a late
    // verdict arriving after the fact.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).lapseBid(7);
    const [text] = sql();
    expect(text).toContain("status = 'lapsed'");
    expect(text).toContain("bond_state = 'void'");
    expect(text).toContain("status = 'pending_bond'");
  });
});

describe('the operator reads behind the internal dashboard', () => {
  it('keeps DIRECTED rows out of the listings read', async () => {
    // The player browse withholds directed sales as a security boundary. This
    // read withholds them for a different reason: they are p2p trades and have
    // their own view, where the counterparty is the point. Same predicate,
    // pinned separately, so relaxing one can never quietly relax the other.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).opsListings({
      realm: REALM,
      status: 'active',
      fromMs: 0,
      toMs: 1_000,
      page: 0,
      pageSize: 50,
    });
    expect(sql()[0]).toContain('directed_buyer_account IS NULL');
  });

  it('bounds the window and the page, never scanning the whole table', async () => {
    const { pool, sql, params } = recordingPool();
    await new PgWocMarketDb(pool).opsListings({
      realm: REALM,
      status: 'all',
      fromMs: 1_000,
      toMs: 2_000,
      page: 0,
      // Over the ceiling on purpose: an ops caller must not be able to ask for
      // an unbounded page.
      pageSize: 9_999,
    });
    const [text] = sql();
    expect(text).toContain('created_at >= $2');
    expect(text).toContain('created_at <= $3');
    // 200 cap, +1 for the has-more probe.
    expect(params()[0]).toContain(201);
    // 'all' means no status predicate at all, rather than a list of every value.
    expect(text).not.toContain('status = $4');
  });

  it('reads p2p trades from OFFERS, so failed attempts are visible', async () => {
    // Sourcing from sales would show the successes and silently omit every
    // declined, withdrawn, expired or unpaid attempt, which is usually the half
    // an operator is looking for.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).opsP2pTrades({
      realm: REALM,
      status: 'all',
      fromMs: 0,
      toMs: 1_000,
      page: 0,
      pageSize: 50,
    });
    const [text] = sql();
    expect(text).toContain('FROM woc_market_directed_offers o');
    // With the outcome joined on, so a completed trade still reports what it
    // settled for and under which signature.
    expect(text).toContain('s.state AS settlement_state');
    expect(text).toContain('s.settled_amount_base');
    expect(text).toContain('ORDER BY id DESC LIMIT 1');
  });

  it('narrows the p2p read by status only when one is asked for', async () => {
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).opsP2pTrades({
      realm: REALM,
      status: 'accepted',
      fromMs: 0,
      toMs: 1_000,
      page: 0,
      pageSize: 50,
    });
    expect(sql()[0]).toContain('o.status = $4');
  });
});

// ---------------------------------------------------------------------------
// DB-free structural pins for the settlement-state guards: the real-Postgres
// suite skips green without TEST_DATABASE_URL, so these hold the shipped DDL
// text (and the fake's mirror of it) in ordinary CI, where the fake-backed
// suites would stay green over a reverted predicate.
// ---------------------------------------------------------------------------

describe('the settlement guards ship their DDL (structural floor)', () => {
  // Strip SQL line comments FIRST (the rationale comments name the same
  // keywords), then collapse whitespace so the pins survive reflowing.
  const strippedSchema = async (): Promise<string> => {
    const { WOC_MARKET_SCHEMA } = await import('../../server/woc_market_db');
    return WOC_MARKET_SCHEMA.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');
  };

  it('carries both unique indexes and drops both stale settlement indexes', async () => {
    const schema = await strippedSchema();
    expect(schema).toContain('CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_open2');
    expect(schema).toContain('CREATE UNIQUE INDEX IF NOT EXISTS woc_market_sales_listing_once');
    // The two superseded names: _live (pre-'delivered') and _open
    // (pre-'review'). Each swap creates the wider index FIRST, so these drops
    // must sit AFTER the open2 create (pinned by order below).
    expect(schema).toContain('DROP INDEX IF EXISTS woc_market_settlements_live');
    expect(schema).toContain('DROP INDEX IF EXISTS woc_market_settlements_open;');
    expect(
      schema.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_open2'),
    ).toBeLessThan(schema.indexOf('DROP INDEX IF EXISTS woc_market_settlements_open;'));
    expect(schema).toContain('ON woc_market_sales(listing_id) WHERE excluded = false');
  });

  it('the open-settlement index predicate is exactly the six open states', async () => {
    const schema = await strippedSchema();
    const m = schema.match(
      /CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_open2 ON woc_market_settlements\(listing_id\) WHERE state IN \(([^)]*)\)/,
    );
    expect(m, 'index creation shape').not.toBeNull();
    const states = (m as RegExpMatchArray)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
    const { OPEN_SETTLEMENT_STATES } = await import('./helpers/fake_woc_market_db');
    // One list, three holders: the shipped predicate, the fake's mirror, and
    // the literal spelling here. A seventh state (or a dropped sixth) fails
    // all three comparisons. 'review' is open BY RULING: the payment may have
    // landed, so its listing must never re-auction around it.
    expect(states).toEqual([
      'offered',
      'confirming',
      'review',
      'confirmed',
      'delivering',
      'delivered',
    ]);
    expect([...OPEN_SETTLEMENT_STATES]).toEqual(states);
    expect(states).not.toContain('failed');
    expect(states).not.toContain('expired');
  });

  it('the settlements state CHECK evolves in place and carries review', async () => {
    const schema = await strippedSchema();
    // Fresh tables get the widened inline CHECK; legacy tables get the gated
    // DROP+ADD (the gate reads the constraint text, so it runs once).
    expect(schema).toContain(
      "CHECK (state IN ('offered', 'confirming', 'review', 'confirmed', 'delivering', 'delivered', 'expired', 'failed'))",
    );
    expect(schema).toContain("pg_get_constraintdef(oid) NOT LIKE '%''review''%'");
    expect(schema).toContain(
      'ALTER TABLE woc_market_settlements DROP CONSTRAINT woc_market_settlements_state_check',
    );
    expect(schema).toContain(
      'ALTER TABLE woc_market_settlements ADD CONSTRAINT woc_market_settlements_state_check',
    );
  });

  it('both boot repairs gate on index VALIDITY, and both creates drop an invalid carcass', async () => {
    const schema = await strippedSchema();
    // The repair gates: an INVALID carcass must re-open the repair, so the
    // gate reads pg_index.indisvalid through the search_path-aware
    // to_regclass house idiom (a hardcoded nspname breaks the runs-once
    // property under a non-public search_path), never bare existence.
    expect(schema).toContain(
      "WHERE i.indexrelid = to_regclass('woc_market_settlements_open2') AND i.indisvalid",
    );
    expect(schema).toContain(
      "WHERE i.indexrelid = to_regclass('woc_market_sales_listing_once') AND i.indisvalid",
    );
    // The carcass drops ahead of each CREATE (IF NOT EXISTS matches by name
    // and would keep an index that enforces nothing).
    expect(schema).toContain(
      "WHERE i.indexrelid = to_regclass('woc_market_settlements_open2') AND NOT i.indisvalid",
    );
    expect(schema).toContain(
      "WHERE i.indexrelid = to_regclass('woc_market_sales_listing_once') AND NOT i.indisvalid",
    );
    expect(schema).toContain("EXECUTE 'DROP INDEX woc_market_settlements_open2'");
    expect(schema).toContain("EXECUTE 'DROP INDEX woc_market_sales_listing_once'");
  });

  it('the settlements repair ranks every open state above the ELSE arm', async () => {
    const schema = await strippedSchema();
    // The survivor CASE and the index predicate must stay in lockstep: a
    // state added to the predicate but not ranked here would fall to ELSE 1
    // and the repair would prefer to demote it. 'offered' rides ELSE 1 by
    // construction (the lowest rank), so five WHEN arms cover the other five.
    expect(schema).toContain(
      "CASE state WHEN 'delivered' THEN 6 WHEN 'delivering' THEN 5 WHEN 'confirmed' THEN 4 WHEN 'review' THEN 3 WHEN 'confirming' THEN 2 ELSE 1 END",
    );
    // The forensic demotion marker keeps any prior reason attached.
    expect(schema).toContain("fail_reason = 'schema_dedupe' || COALESCE(':' || fail_reason, '')");
  });

  it('carries the intent columns additively, plus the readout and rotation indexes', async () => {
    const schema = await strippedSchema();
    // Same additive rule as directed_buyer_account: the claims table exists on
    // deployed realms, so the columns must ride ALTER, never only CREATE TABLE.
    expect(schema).toContain('ADD COLUMN IF NOT EXISTS grant_character_id');
    expect(schema).toContain('ADD COLUMN IF NOT EXISTS mail_intent_at');
    // The rotation column is additive on BOTH rotated tables.
    expect(schema).toContain(
      'ALTER TABLE woc_market_settlements ADD COLUMN IF NOT EXISTS sweep_parked_at TIMESTAMPTZ',
    );
    expect(schema).toContain(
      'ALTER TABLE woc_market_listings ADD COLUMN IF NOT EXISTS sweep_parked_at TIMESTAMPTZ',
    );
    // The stuck-custody readout's indexes: the monitor reads unbooked claims
    // and aged delivering settlements through them, so their predicates are
    // load-bearing, not decorative (the delivering class ages and orders on
    // updated_at, stamped at the delivering claim; park rotation writes only
    // sweep_parked_at, so the age signal never moves on a park).
    expect(schema).toContain(
      'CREATE INDEX IF NOT EXISTS woc_market_custody_claims_unbooked ' +
        'ON woc_market_custody_claims(realm, claimed_at) WHERE booked_at IS NULL',
    );
    expect(schema).toContain(
      'CREATE INDEX IF NOT EXISTS woc_market_settlements_state_updated ' +
        'ON woc_market_settlements(realm, state, updated_at)',
    );
    // The batch-rotation partials spell PARK_ROTATION_ORDER verbatim (an
    // expression index only serves a query with the identical text), and the
    // superseded full created_at index is dropped, not left to rot.
    expect(schema).toContain(
      'CREATE INDEX IF NOT EXISTS woc_market_settlements_delivering_rotation ' +
        "ON woc_market_settlements(realm, (COALESCE(sweep_parked_at, updated_at))) WHERE state = 'delivering'",
    );
    expect(schema).toContain(
      'CREATE INDEX IF NOT EXISTS woc_market_listings_undisposed_rotation ' +
        'ON woc_market_listings(realm, (COALESCE(sweep_parked_at, updated_at))) ' +
        "WHERE status = 'closed' AND item_disposed = false",
    );
    expect(schema).toContain('DROP INDEX IF EXISTS woc_market_settlements_state_created');
    // The redrive page walk and the sold-residue probe get their partials.
    expect(schema).toContain(
      'CREATE INDEX IF NOT EXISTS woc_market_listings_live_ids ' +
        "ON woc_market_listings(realm, id) WHERE status <> 'closed'",
    );
    expect(schema).toContain(
      'CREATE INDEX IF NOT EXISTS woc_market_listings_sold_undisposed ' +
        'ON woc_market_listings(realm, id) ' +
        "WHERE status = 'closed' AND item_disposed = false AND resolution = 'sold'",
    );
  });

  it('makes custody_ref the claims table PRIMARY KEY, which is what makes a claim unique', async () => {
    // The book-once ledger's whole guarantee rests on ONE row per ref: without
    // the key, claimCustodyRef's ON CONFLICT arm has nothing to conflict on and
    // two passes both read fresh, both stamp an intent, and both deliver.
    const schema = await strippedSchema();
    expect(schema).toContain('custody_ref TEXT PRIMARY KEY');
  });
});

// ---------------------------------------------------------------------------
// The delivery close tail and the custody claim primitives. The real-Postgres
// crash-matrix suite (tests/woc_market_delivery_pg_integration.test.ts) skips
// green without TEST_DATABASE_URL, so the statement shapes that make delivery
// exactly-once are ALSO pinned here, where ordinary CI always runs.
// ---------------------------------------------------------------------------

/** A pool whose transactions run on a recording CLIENT (withTx methods call
 *  pool.connect()). Every statement lands in one sequence; the listing lock
 *  read answers one open row so the tail past it is reachable. An optional
 *  responder overrides the answer for chosen statements (e.g. a close CAS
 *  that matches nothing, driving the already_final arm). */
function recordingTxPool(
  respond?: (text: string) => { rows: unknown[]; rowCount: number } | undefined,
): {
  pool: Pool;
  sql: () => string[];
} {
  const seen: string[] = [];
  const query = async (text: string) => {
    seen.push(text);
    const forced = respond?.(text);
    if (forced) return forced;
    if (text.includes('FROM woc_market_listings') && text.includes('FOR UPDATE')) {
      return { rows: [{ status: 'settling' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
  const client = { query, release: () => {} };
  const pool = { query, connect: async () => client } as unknown as Pool;
  return { pool, sql: () => seen };
}

/** A raw settlements row (snake_case, as pg returns it) for page fixtures. */
const settlementRowFixture = (id: number, listingId: number) => ({
  id,
  listing_id: listingId,
  bid_id: null,
  attempt: 1,
  buyer_account: 1,
  buyer_character: 1,
  buyer_name: 'b',
  buyer_wallet: 'w',
  amount_cents: 100,
  state: 'delivered',
  quote_reference: null,
  quote_expires: null,
  settled_amount_base: null,
  tx_signature: null,
  fail_reason: null,
  deadline_at: new Date(0),
  created_at: new Date(0),
});

const FINALIZE_ARGS = {
  settlementId: 5,
  listingId: 9,
  bidId: 3,
  sale: {
    realm: REALM,
    listingId: 9,
    itemId: 'sword',
    item: { itemId: 'sword', count: 1 },
    priceCents: 5000,
    amountBase: null,
    sellerAccount: 1,
    buyerAccount: 2,
    sellerName: 'S',
    buyerName: 'B',
  },
} as const;

describe('the delivery close tail is ONE transaction, in SQL', () => {
  it('runs the whole tail between one BEGIN and one COMMIT, waits bounded', async () => {
    const { pool, sql } = recordingTxPool();
    expect(
      await new PgWocMarketDb(pool).finalizeDeliveredSettlement(structuredClone(FINALIZE_ARGS)),
    ).toBe('finalized');
    const seq = sql();
    expect(seq[0]).toBe('BEGIN');
    expect(seq.at(-1)).toBe('COMMIT');
    expect(seq[1]).toContain('SET LOCAL lock_timeout');
    // The whole tail holds the listing plus bid locks, so it carries the
    // heavy statement allowance too (the pool default would abort a slow
    // money-path commit mid-flight).
    expect(seq[2]).toContain('SET LOCAL statement_timeout');
    // Every write the old code committed separately now sits inside the one
    // transaction: the CAS, the sale, the close, the dispose, the bond flips.
    const inside = seq.slice(1, -1).join('\n');
    expect(inside).toContain('UPDATE woc_market_settlements');
    expect(inside).toContain('INSERT INTO woc_market_sales');
    expect(inside).toContain("SET status = 'closed'");
    expect(inside).toContain('item_disposed = true');
    expect(inside).toContain("SET bond_state = 'refund_due'");
    // The settlement CAS clears the rotation stamp on the terminal move.
    const cas = seq.find((t) => t.includes("SET state = 'delivered'"));
    expect(cas).toContain('sweep_parked_at = NULL');
    // Close and dispose share ONE statement (two UPDATEs on the same row per
    // sale doubled the version churn), an already-closed row keeps its
    // resolution, and the WHERE makes it a real compare-and-set (the
    // already_final downgrade reads its rowCount).
    const closeStmt = seq.find((t) => t.includes("SET status = 'closed'"));
    expect(closeStmt).toContain('item_disposed = true');
    expect(closeStmt).toContain("CASE WHEN status = 'closed' THEN resolution ELSE $2 END");
    expect(closeStmt).toContain("(status <> 'closed' OR item_disposed = false)");
    expect(closeStmt).toContain('sweep_parked_at = NULL');
  });

  it('reports already_final when the close CAS matches nothing', async () => {
    // A re-run over a closed-and-disposed listing converges nothing new: the
    // caller must neither count it as fresh work nor re-send the seller
    // notice, and the verdict is what carries that.
    const { pool } = recordingTxPool((text) =>
      text.includes("SET status = 'closed'") ? { rows: [], rowCount: 0 } : undefined,
    );
    expect(
      await new PgWocMarketDb(pool).finalizeDeliveredSettlement(structuredClone(FINALIZE_ARGS)),
    ).toBe('already_final');
  });

  it('locks bids FIRST (open set plus the winner, by id), the listing second, then RE-LOCKS', async () => {
    // The file-wide lock order: the reverse deadlocks against the suspend and
    // activate guards, which pre-lock the bid set the same way. The SECOND
    // bid lock, after the listing lock is held, is load-bearing on its own: a
    // buy-now finalize runs while the listing is still 'active', so a bid
    // inserted between the pre-lock and the listing lock (insertPendingBid is
    // listing-lock-first) would otherwise reach the cancel UPDATE unlocked.
    const { pool, sql } = recordingTxPool();
    await new PgWocMarketDb(pool).finalizeDeliveredSettlement(structuredClone(FINALIZE_ARGS));
    const seq = sql();
    const bidLocks = seq
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.includes('FROM woc_market_bids') && t.includes('FOR UPDATE'));
    const listingLock = seq.findIndex(
      (t) => t.includes('FROM woc_market_listings') && t.includes('FOR UPDATE'),
    );
    expect(bidLocks, 'exactly the pre-lock and the re-lock').toHaveLength(2);
    const [preLock, reLock] = bidLocks;
    expect(preLock.i).toBeGreaterThan(0);
    expect(listingLock).toBeGreaterThan(preLock.i);
    expect(reLock.i, 'the re-lock runs AFTER the listing lock').toBeGreaterThan(listingLock);
    expect(preLock.t).toContain('ORDER BY id');
    expect(preLock.t, 'the winner bid joins the pre-lock set').toContain('OR id = $2');
    expect(reLock.t).toContain('ORDER BY id');
    expect(reLock.t, 'the re-lock covers only the OPEN set').not.toContain('OR id = $2');
  });

  it('accepts delivering AND delivered, which is what makes the re-drive converge', async () => {
    const { pool, sql } = recordingTxPool();
    await new PgWocMarketDb(pool).finalizeDeliveredSettlement(structuredClone(FINALIZE_ARGS));
    const cas = sql().find((t) => t.includes('UPDATE woc_market_settlements'));
    expect(cas).toContain("state IN ('delivering', 'delivered')");
  });

  it('dedupes the sale on the provenance index, never by throwing', async () => {
    const { pool, sql } = recordingTxPool();
    await new PgWocMarketDb(pool).finalizeDeliveredSettlement(structuredClone(FINALIZE_ARGS));
    const insert = sql().find((t) => t.includes('INSERT INTO woc_market_sales'));
    expect(insert).toContain('ON CONFLICT (listing_id) WHERE excluded = false DO NOTHING');
  });

  it('demotes every still-open loser in ONE statement, bond flip included', async () => {
    const { pool, sql } = recordingTxPool();
    await new PgWocMarketDb(pool).finalizeDeliveredSettlement(structuredClone(FINALIZE_ARGS));
    const demote = sql().find(
      (t) => t.includes("SET status = 'cancelled'") && t.includes('woc_market_bids'),
    );
    expect(demote).toContain("CASE WHEN bond_state = 'held' THEN 'refund_due' ELSE bond_state END");
    expect(demote).toContain("status IN ('pending_bond', 'active')");
  });
});

describe('the atomic save-and-book, in SQL', () => {
  // The save path sanitizes the state (the removed-zone strip walks questLog,
  // questsDone and the bags), so the fixture carries those, unlike the
  // service fakes whose db never touches the blob.
  const SAVE = {
    characterId: 21,
    level: 10,
    state: { questLog: [], questsDone: [], inventory: [] } as unknown as CharacterState,
    leaseNonce: 'nonce-1',
  };

  it('persists the fenced character write and the booking in one transaction', async () => {
    const { pool, sql } = recordingTxPool();
    expect(await new PgWocMarketDb(pool).saveDeliveredCharacterBooked(SAVE, 'ref-1')).toBe(
      'booked',
    );
    const seq = sql();
    expect(seq[0]).toBe('BEGIN');
    expect(seq.at(-1)).toBe('COMMIT');
    const character = seq.findIndex((t) => t.includes('UPDATE characters'));
    const booking = seq.findIndex((t) => t.includes('UPDATE woc_market_custody_claims'));
    expect(character).toBeGreaterThan(0);
    expect(booking).toBeGreaterThan(character);
    // The character half carries the in-statement lease fence, and the
    // booking half is monotonic (unbooked rows only).
    expect(seq[character]).toContain('character_leases');
    expect(seq[booking]).toContain('SET booked_at = now()');
    expect(seq[booking]).toContain('booked_at IS NULL');
  });

  it('rolls the WHOLE transaction back when the lease fence matches no row', async () => {
    // The recording client answers rowCount 0 for the fenced UPDATE here, so
    // the booking must never run and the transaction must end in ROLLBACK:
    // a displaced session can neither persist the grant nor book the ref.
    const seen: string[] = [];
    const query = vi.fn(async (text: string) => {
      seen.push(text);
      return { rows: [], rowCount: 0 };
    });
    const client = { query, release: vi.fn() };
    const pool = { query, connect: async () => client } as unknown as Pool;
    expect(await new PgWocMarketDb(pool).saveDeliveredCharacterBooked(SAVE, 'ref-1')).toBe(
      'lease_lost',
    );
    expect(seen.some((t) => t.includes('woc_market_custody_claims'))).toBe(false);
    expect(seen.at(-1)).toBe('ROLLBACK');
  });
});

describe('the custody claim primitives stay monotonic, in SQL', () => {
  it('books and stamps ONLY while unbooked', async () => {
    for (const run of [
      (db: PgWocMarketDb) => db.markCustodyRefBooked('ref-1'),
      (db: PgWocMarketDb) => db.markCustodyGrantIntent('ref-1', 21),
      (db: PgWocMarketDb) => db.markCustodyMailIntent('ref-1'),
    ]) {
      const { pool, sql } = recordingPool();
      await run(new PgWocMarketDb(pool));
      expect(sql()[0]).toContain('booked_at IS NULL');
    }
  });

  it('the mail-intent stamp WITHDRAWS the grant intent in the same statement', async () => {
    // The one legal conversion (a grantCopy refusal proves the bags are
    // untouched); two statements here would leave a crash window in which a
    // claim carries both rails.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).markCustodyMailIntent('ref-1');
    const [text] = sql();
    expect(text).toContain('mail_intent_at = now()');
    expect(text).toContain('grant_character_id = NULL');
  });

  it('claims a ref with an INSERT that loses the race rather than raising', async () => {
    // The claim IS the mutual exclusion: two passes racing the same ref must
    // leave exactly one holder, and the loser must learn it lost (rowCount 0)
    // instead of taking a 23505 through the sweep's error path. The conflict
    // target names the primary key column pinned in the DDL floor above.
    const { pool, sql, params } = recordingPool();
    await new PgWocMarketDb(pool).claimCustodyRef(REALM, 'ref-1');
    const [text] = sql();
    expect(text).toContain('INSERT INTO woc_market_custody_claims');
    expect(text).toContain('ON CONFLICT (custody_ref) DO NOTHING');
    expect(params()[0]).toEqual([REALM, 'ref-1']);
  });

  it('reads the claim state (booked flag plus both rail intents) from the row', async () => {
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).custodyRefState('ref-1');
    const [text] = sql();
    expect(text).toContain('booked_at IS NOT NULL AS booked');
    expect(text).toContain('grant_character_id');
    expect(text).toContain('mail_intent_at IS NOT NULL AS mail_intent');
  });
});

describe('the sweep reads that keep delivery converging, in SQL', () => {
  it('pages delivered-but-unclosed residue over bounded id slices', async () => {
    // Delivered settlements grow with sale history forever. The single-join
    // form let the planner hash-join the WHOLE settlements table under a
    // LIMIT it could not push down (measured); the page shape is two bounded
    // statements the planner cannot reorder into a scan.
    const { pool, sql, params } = recordingPool();
    await new PgWocMarketDb(pool).deliveredUnclosedSettlementsPage(REALM, 40, 500, 25);
    const seq = sql();
    // No rows from the id read means the second statement never runs.
    expect(seq).toHaveLength(1);
    expect(seq[0]).toContain('FROM woc_market_listings');
    expect(seq[0]).toContain("status IN ('active', 'ending', 'settling')");
    expect(seq[0]).toContain('id > $2');
    expect(seq[0]).toContain('ORDER BY id');
    expect(seq[0]).toContain('LIMIT $3');
    expect(params()[0]).toEqual([REALM, 40, 500]);
  });

  it('probes the settlements ONLY by the page ids, delivered state pinned and BOUNDED', async () => {
    const seen: string[] = [];
    const bound: unknown[][] = [];
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      seen.push(text);
      bound.push(values ?? []);
      if (text.includes('SELECT id FROM woc_market_listings')) {
        return { rows: [{ id: 7 }, { id: 9 }], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = { query } as unknown as Pool;
    const out = await new PgWocMarketDb(pool).deliveredUnclosedSettlementsPage(REALM, 0, 500, 25);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain('listing_id = ANY($1::bigint[])');
    expect(seen[1]).toContain("state = 'delivered'");
    expect(seen[1]).toContain('ORDER BY listing_id');
    // Bounded residue fetch: every returned row costs a finalize transaction
    // plus a mail-book write, so the LIMIT (maxSettlements + 1, the +1 being
    // the truncation probe) is load-bearing, not cosmetic.
    expect(seen[1]).toContain('LIMIT $2');
    expect(bound[1]).toEqual([[7, 9], 26]);
    expect(out.lastListingId, 'the cursor advances to the page tail').toBe(9);
  });

  it('a truncated residue fetch moves the cursor to the last RETURNED row', async () => {
    const query = vi.fn(async (text: string) => {
      if (text.includes('SELECT id FROM woc_market_listings')) {
        return { rows: [{ id: 7 }, { id: 9 }, { id: 11 }], rowCount: 3 };
      }
      // Three delivered rows against maxSettlements = 2: the third is the
      // truncation probe and must be dropped, with the cursor at row two.
      return {
        rows: [7, 9, 11].map((listingId, i) => settlementRowFixture(100 + i, listingId)),
        rowCount: 3,
      };
    });
    const pool = { query } as unknown as Pool;
    const out = await new PgWocMarketDb(pool).deliveredUnclosedSettlementsPage(REALM, 0, 500, 2);
    expect(out.settlements).toHaveLength(2);
    expect(out.settlements.map((s) => s.listingId)).toEqual([7, 9]);
    expect(out.lastListingId, 'resume right behind the last processed row').toBe(9);
  });

  it('converges sold residue only over a STANDING sale row, bounded, never waiting', async () => {
    const { pool, sql, params } = recordingPool();
    await new PgWocMarketDb(pool).disposeSoldResidueListings(REALM, 25);
    const [text] = sql();
    expect(text).toContain('SET item_disposed = true');
    expect(text).toContain("l.resolution = 'sold'");
    expect(text).toContain('s.excluded = false');
    expect(text).toContain('LIMIT $2');
    // Deterministic lock order plus SKIP LOCKED: the arm never waits on (and
    // so can never deadlock against) a concurrent finalize holding a listing
    // row; a skipped row is the next beat's business.
    expect(text).toContain('ORDER BY l.id');
    expect(text).toContain('FOR UPDATE OF l SKIP LOCKED');
    expect(params()[0]).toEqual([REALM, 25]);
  });

  it('keeps SOLD rows out of the return backlog read', async () => {
    // A sold listing whose dispose flag never landed (old-binary residue)
    // must not occupy a return batch slot forever; the stuck readout is what
    // surfaces it instead.
    const { pool, sql } = recordingPool();
    await new PgWocMarketDb(pool).undisposedClosedListings(REALM, 25, []);
    expect(sql()[0]).toContain("(resolution IS NULL OR resolution <> 'sold')");
  });

  it('rotates a parked row on sweep_parked_at ONLY, never the age signal', async () => {
    // The stuck classes age on updated_at; a rotation that touched it would
    // re-stamp a parked row every retry and hide it from the monitor forever
    // (the retry cadence is far inside the stuck threshold).
    const { pool, sql } = recordingPool();
    const db = new PgWocMarketDb(pool);
    await db.touchSettlementRow(7);
    await db.touchListingRow(9);
    for (const text of sql()) {
      expect(text).toContain('SET sweep_parked_at = now()');
      expect(text).not.toContain('updated_at');
      expect(text).not.toContain('created_at');
    }
    expect(sql()).toHaveLength(2);
  });

  it('orders both park-rotated batch reads by the rotation expression', async () => {
    // COALESCE(sweep_parked_at, updated_at), shared verbatim with the two
    // partial indexes: a drifted spelling silently loses the index.
    const { pool, sql, params } = recordingPool();
    const db = new PgWocMarketDb(pool);
    await db.deliveringSettlements(REALM, 25, [7, 9]);
    await db.undisposedClosedListings(REALM, 25, [11]);
    for (const text of sql()) {
      expect(text).toContain('ORDER BY COALESCE(sweep_parked_at, updated_at)');
      // Backing-off parked rows are excluded in the QUERY, so a standing
      // parked set costs neither batch slots nor per-pass rotation writes.
      expect(text).toContain('id <> ALL($3::bigint[])');
    }
    expect(sql()).toHaveLength(2);
    expect(params()[0]).toEqual([REALM, 25, [7, 9]]);
    expect(params()[1]).toEqual([REALM, 25, [11]]);
  });
});

describe('the stuck-custody readout saturates, in SQL', () => {
  it('samples and counts each class separately, counts capped by an inner LIMIT', async () => {
    const { pool, sql, params } = recordingPool();
    await new PgWocMarketDb(pool).stuckCustodyReadout(REALM, 1_000, 20, 1000, 1_000);
    const seq = sql();
    // Five sample reads and five capped counts, interleaved per class (the
    // three custody classes, plus review settlements and stuck bonds).
    expect(seq).toHaveLength(10);
    const samples = [seq[0], seq[2], seq[4], seq[6], seq[8]];
    const counts = [seq[1], seq[3], seq[5], seq[7], seq[9]];
    for (const [i, text] of samples.entries()) {
      expect(text, `sample ${i} is realm-scoped`).toContain('realm = $1');
    }
    // The three age-filtered custody classes share one param shape.
    for (const i of [0, 1, 2]) {
      expect(samples[i], `sample ${i} is capped`).toContain('LIMIT $3');
      expect(params()[i * 2]).toEqual([REALM, 1_000, 20]);
      expect(params()[i * 2 + 1]).toEqual([REALM, 1_000]);
    }
    for (const [i, text] of counts.entries()) {
      // The saturating shape: a bare count consumed the whole stuck set.
      expect(text, `count ${i} saturates`).toContain('SELECT count(*)::int AS n FROM (SELECT 1');
      expect(text, `count ${i} caps the inner read`).toContain('LIMIT 1000');
    }
    expect(samples[0]).toContain('booked_at IS NULL');
    expect(samples[0]).toContain('mail_intent_at');
    expect(samples[1]).toContain("state = 'delivering'");
    // Aged on updated_at (stamped at the delivering claim): rotation writes
    // sweep_parked_at, so a parked row's age keeps counting, and a slow
    // payment leg is not reported stuck the moment delivery begins.
    expect(samples[1]).toContain('updated_at <= to_timestamp($2 / 1000.0)');
    expect(samples[1]).not.toContain('created_at <=');
    expect(samples[1]).not.toContain('sweep_parked_at');
    expect(samples[2]).toContain("status = 'closed' AND item_disposed = false");
    expect(samples[2]).toContain('updated_at <= to_timestamp($2 / 1000.0)');
    expect(samples[2]).not.toContain('sweep_parked_at');
    // The review class carries NO age filter (the sweep's confirming bound
    // already aged it) and orders on updated_at (entry into review).
    expect(samples[3]).toContain("state = 'review'");
    expect(samples[3]).not.toContain('to_timestamp');
    expect(samples[3]).toContain('ORDER BY updated_at');
    expect(params()[6]).toEqual([REALM, 20]);
    expect(params()[7]).toEqual([REALM]);
    // Stuck bonds: the confirming-set predicate (matching its partial index)
    // plus the caller's bond age cutoff.
    expect(samples[4]).toContain("status = 'pending_bond' AND bond_signature IS NOT NULL");
    expect(samples[4]).toContain('placed_at <= to_timestamp($2 / 1000.0)');
    expect(params()[8]).toEqual([REALM, 1_000, 20]);
    expect(params()[9]).toEqual([REALM, 1_000]);
  });
});
