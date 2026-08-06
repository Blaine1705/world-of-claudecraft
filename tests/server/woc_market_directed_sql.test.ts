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
import { PgWocMarketDb } from '../../server/woc_market_db';

const REALM = 'Claudemoon';

/** A pool that records every statement and answers with no rows. */
function recordingPool(): { pool: Pool; sql: () => string[] } {
  const seen: string[] = [];
  const query = vi.fn(async (text: string) => {
    seen.push(text);
    return { rows: [], rowCount: 0 };
  });
  return { pool: { query } as unknown as Pool, sql: () => seen };
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
    return new PgWocMarketDb(pool)
      .resolveDirectedOffer(REALM, 3, 'declined')
      .then(() => {
        const [text] = sql();
        expect(text).toContain("status = 'pending'");
      });
  });
});
