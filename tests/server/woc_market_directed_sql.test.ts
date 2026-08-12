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

  it('carries both unique indexes and drops the stale live index', async () => {
    const schema = await strippedSchema();
    expect(schema).toContain('CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_open');
    expect(schema).toContain('CREATE UNIQUE INDEX IF NOT EXISTS woc_market_sales_listing_once');
    expect(schema).toContain('DROP INDEX IF EXISTS woc_market_settlements_live');
    expect(schema).toContain('ON woc_market_sales(listing_id) WHERE excluded = false');
  });

  it('the open-settlement index predicate is exactly the five open states', async () => {
    const schema = await strippedSchema();
    const m = schema.match(
      /CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_open ON woc_market_settlements\(listing_id\) WHERE state IN \(([^)]*)\)/,
    );
    expect(m, 'index creation shape').not.toBeNull();
    const states = (m as RegExpMatchArray)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
    const { OPEN_SETTLEMENT_STATES } = await import('./helpers/fake_woc_market_db');
    // One list, three holders: the shipped predicate, the fake's mirror, and
    // the literal spelling here. A sixth state (or a dropped fifth) fails all
    // three comparisons.
    expect(states).toEqual(['offered', 'confirming', 'confirmed', 'delivering', 'delivered']);
    expect([...OPEN_SETTLEMENT_STATES]).toEqual(states);
    expect(states).not.toContain('failed');
    expect(states).not.toContain('expired');
  });

  it('both boot repairs gate on index VALIDITY, and both creates drop an invalid carcass', async () => {
    const schema = await strippedSchema();
    // The repair gates: an INVALID carcass must re-open the repair, so the
    // gate reads pg_index.indisvalid, never bare existence.
    expect(schema).toContain(
      "WHERE n.nspname = 'public' AND c.relname = 'woc_market_settlements_open' AND i.indisvalid",
    );
    expect(schema).toContain(
      "WHERE n.nspname = 'public' AND c.relname = 'woc_market_sales_listing_once' AND i.indisvalid",
    );
    // The carcass drops ahead of each CREATE (IF NOT EXISTS matches by name
    // and would keep an index that enforces nothing).
    expect(schema).toContain("c.relname = 'woc_market_settlements_open' AND NOT i.indisvalid");
    expect(schema).toContain("c.relname = 'woc_market_sales_listing_once' AND NOT i.indisvalid");
    expect(schema).toContain("EXECUTE 'DROP INDEX public.woc_market_settlements_open'");
    expect(schema).toContain("EXECUTE 'DROP INDEX public.woc_market_sales_listing_once'");
  });

  it('the settlements repair ranks every open state above the ELSE arm', async () => {
    const schema = await strippedSchema();
    // The survivor CASE and the index predicate must stay in lockstep: a
    // state added to the predicate but not ranked here would fall to ELSE 1
    // and the repair would prefer to demote it. 'offered' rides ELSE 1 by
    // construction (the lowest rank), so four WHEN arms cover the other four.
    expect(schema).toContain(
      "CASE state WHEN 'delivered' THEN 5 WHEN 'delivering' THEN 4 WHEN 'confirmed' THEN 3 WHEN 'confirming' THEN 2 ELSE 1 END",
    );
    // The forensic demotion marker keeps any prior reason attached.
    expect(schema).toContain("fail_reason = 'schema_dedupe' || COALESCE(':' || fail_reason, '')");
  });
});
