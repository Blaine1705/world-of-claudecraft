// Plan-class pins for the marketplace's hot reads: the consolidated EXPLAIN
// list the earlier hardening rounds deferred here (the redrive page probe, the
// stuck-readout classes, the rotation-order batch reads, the sold-residue
// dispose, the buy-now cooldown ledger probes, the offer expiry and converge
// probes, the cascade pick, the price_desc browse sort, and the poll read's
// LATERAL latest-settlement probe).
//
// Method: every case runs the REAL PgWocMarketDb method through a recording
// pool wrapper, so the pinned statement is the shipped one, then EXPLAINs the
// capture inside a rolled-back transaction under SET LOCAL enable_seqscan =
// off. That setting is a cost penalty, not a prohibition: a statement with NO
// usable index still plans 'Seq Scan on <table>', which is what makes these
// pins decisive on small fixture tables. The one realistic-row-count case
// (the poll read, the acceptance criterion from the db-retention round) seeds
// 5,000 offers, ANALYZEs, and EXPLAINs at NATURAL costs, proving the planner
// PREFERS the account indexes at a scale where the old shape seq-scanned.
//
// The pins assert plan CLASS (which index, no seq scan, no sort), anchored to
// the captured query, never plan text: row estimates and node flavors may
// drift across Postgres versions, index reachability must not.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PgWocMarketDb } from '../server/woc_market_db';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const VERIFY_DB = 'wocc_woc_market_plans_verify';

function verifyUrl(admin: string): string {
  const u = new URL(admin);
  u.pathname = `/${VERIFY_DB}`;
  return u.toString();
}

// server/db.ts reads DATABASE_URL at module load and builds its pool from it.
// Nothing above is a static import of a server module, so this assignment runs
// first and points the boot path at the disposable database.
if (ADMIN_URL) process.env.DATABASE_URL = verifyUrl(ADMIN_URL);

const describeDb = ADMIN_URL ? describe : describe.skip;

describeDb('woc market plan-class pins against real Postgres', () => {
  let admin: Pool;
  let pool: Pool;
  let marketDbMod: typeof import('../server/woc_market_db');
  let marketDb: PgWocMarketDb;
  let captured: { text: string; values: unknown[] }[] = [];
  let seq = 0;

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL, max: 2 });
    const own = new URL(ADMIN_URL as string).pathname.replace(/^\//, '');
    // Never drop the database the caller pointed us at.
    expect(own).not.toBe(VERIFY_DB);
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [VERIFY_DB],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${VERIFY_DB}`);
    await admin.query(`CREATE DATABASE ${VERIFY_DB}`);
    const db = await import('../server/db');
    marketDbMod = await import('../server/woc_market_db');
    // The REAL boot path, so every index under test is the one production gets.
    await db.ensureSchema();
    await db.runConcurrentIndexMigrations();
    pool = new Pool({ connectionString: verifyUrl(ADMIN_URL as string), max: 12 });
    // The recording wrapper: statements pass through to the real pool, and the
    // capture is what gets EXPLAINed, so the pin can never drift from the
    // shipped SQL. connect() forwards so transaction paths still work (their
    // client-side statements are simply not captured).
    const wrapped = {
      query: (text: string, values?: unknown[]) => {
        captured.push({ text, values: values ?? [] });
        return pool.query(text, values as never[]);
      },
      connect: () => pool.connect(),
    } as unknown as Pool;
    marketDb = new marketDbMod.PgWocMarketDb(wrapped);
    // A block of accounts for FK-bearing fixture rows, minted with explicit
    // high ids so the serial sequence can never collide with them.
    await pool.query(
      `INSERT INTO accounts (id, username, password_hash)
       SELECT g, 'plan-fixture-' || g, 'x' FROM generate_series(10000, 10199) g`,
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.end();
  });

  /** The captured statements minted since the last take(). */
  function take(): { text: string; values: unknown[] }[] {
    const out = captured;
    captured = [];
    return out;
  }

  /** EXPLAIN a captured statement in a rolled-back transaction. seqscanOff
   *  penalizes sequential scans so index USABILITY is what the plan shows;
   *  natural mode EXPLAINs at real costs (the preference proof). */
  async function planOf(
    text: string,
    values: unknown[],
    mode: 'seqscan-off' | 'natural' = 'seqscan-off',
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (mode === 'seqscan-off') await client.query('SET LOCAL enable_seqscan = off');
      const res = await client.query(`EXPLAIN ${text}`, values);
      return res.rows.map((r) => String(r['QUERY PLAN'])).join('\n');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  }

  async function seedListing(
    realm: string,
    over: { status?: string; itemDisposed?: boolean; resolution?: string | null } = {},
  ): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO woc_market_listings (
         realm, seller_account, seller_character, seller_name, seller_wallet,
         item, item_id, quality, format, start_cents, buy_now_cents,
         offer_next, status, item_disposed, resolution, ends_at, base_ends_at
       ) VALUES (
         $1, 10001, $2, $3, $4, $5, 'crown_of_embers', 'epic',
         'auction_buy_now', 500, 1000, false, $6, $7, $8,
         now() + interval '1 hour', now() + interval '1 hour'
       ) RETURNING id`,
      [
        realm,
        9000 + seq,
        `PlanSeller${seq}`,
        `wallet-plan-${seq}`,
        JSON.stringify({ itemId: 'crown_of_embers', count: 1 }),
        over.status ?? 'active',
        over.itemDisposed ?? false,
        over.resolution ?? null,
      ],
    );
    return Number(res.rows[0].id);
  }

  it('the poll read prefers the account indexes at realistic row counts, and its LATERAL probe seeks the settlements composite', async () => {
    const realm = 'plans-offers';
    // 5,000 offers across 100 accounts: the scale where the retired partial
    // indexes left the old shape planning a seq scan per 2s poll. Mixed
    // statuses so the candidate set is realistic. Beneath them, 1,000
    // listings each carrying three TERMINAL settlement attempts ('failed' and
    // 'expired' sit outside the one-open-settlement partial, so bulk rows
    // cannot trip it), with a fifth of the offers stamped onto a listing:
    // that is the shape the LATERAL latest-settlement probe pays for per
    // offer row, so the planner's choice below is made on real statistics.
    await pool.query(
      `INSERT INTO woc_market_listings (
         realm, seller_account, seller_character, seller_name, seller_wallet,
         item, item_id, quality, format, start_cents, buy_now_cents,
         offer_next, status, item_disposed, ends_at, base_ends_at)
       SELECT $1, 10001, 9000 + g, 'LS' || g, 'w-ls-' || g,
              '{"itemId":"crown_of_embers","count":1}'::jsonb, 'crown_of_embers',
              'epic', 'buy_now', 500, 1000, false, 'settling', false,
              now() + interval '1 hour', now() + interval '1 hour'
         FROM generate_series(1, 1000) g`,
      [realm],
    );
    const bounds = await pool.query(
      `SELECT min(id)::bigint AS lo FROM woc_market_listings WHERE realm = $1`,
      [realm],
    );
    const lo = Number(bounds.rows[0].lo);
    await pool.query(
      `INSERT INTO woc_market_settlements (
         listing_id, realm, bid_id, attempt, buyer_account, buyer_character,
         buyer_name, buyer_wallet, amount_cents, state, deadline_at)
       SELECT $2 + (g % 1000), $1, NULL, g, 10002, 7000, 'PB', 'w-pb', 1000,
              CASE WHEN g % 2 = 0 THEN 'failed' ELSE 'expired' END, now()
         FROM generate_series(1, 3000) g`,
      [realm, lo],
    );
    await pool.query(
      `INSERT INTO woc_market_directed_offers (
         realm, seller_account, seller_character, seller_name, buyer_account,
         buyer_name, usd_cents, status, listing_id, expires_at, updated_at)
       SELECT $1, 10000 + (g % 100), 9000 + g, 'S' || g, 10000 + ((g - 1) / 100),
              'B' || g, 1000, CASE WHEN g % 10 = 0 THEN 'pending' ELSE 'declined' END,
              CASE WHEN g % 5 = 0 THEN $2 + (g % 1000) END,
              now() + interval '10 minutes', now() - interval '1 minute'
         FROM generate_series(1, 5000) g`,
      [realm, lo],
    );
    await pool.query('ANALYZE woc_market_directed_offers');
    await pool.query('ANALYZE woc_market_settlements');
    await pool.query('ANALYZE woc_market_listings');
    await marketDb.directedOffersForAccount(realm, 10_042, Date.now());
    const [poll] = take();
    expect(poll.text).toContain('FROM woc_market_directed_offers o');
    // The acceptance proof, at NATURAL costs: the planner PREFERS the
    // per-account probes over walking the realm, and the LATERAL probe seeks
    // (listing_id, id DESC) instead of sorting settlement attempts per row
    // (the terminal attempts sit outside the one-open partial, so no other
    // index can serve the latest-attempt read).
    const natural = await planOf(poll.text, poll.values, 'natural');
    expect(natural).not.toMatch(/Seq Scan on woc_market_directed_offers/);
    expect(natural).toMatch(/woc_market_offers_(buyer|seller)_all/);
    expect(natural).toContain('woc_market_settlements_listing_latest');
    // And under the seqscan penalty, the whole statement stays index-reachable.
    const plan = await planOf(poll.text, poll.values);
    expect(plan).not.toMatch(/Seq Scan on woc_market_directed_offers/);
    expect(plan).not.toMatch(/Seq Scan on woc_market_settlements/);
    expect(plan).toContain('woc_market_settlements_listing_latest');
  }, 60_000);

  it('every browse sort is an ordered index walk: price_desc now has its own direction', async () => {
    const realm = 'plans-browse';
    // A realistic live page: with only a stray row in the realm the planner
    // happily bitmap-scans and sorts (one row is cheap to sort), which would
    // pass a no-seq-scan pin while missing the whole point; at 500 live rows
    // the ordered walk with LIMIT is the only sortless plan and the direction
    // mismatch this index closes becomes visible again if it regresses.
    await pool.query(
      `INSERT INTO woc_market_listings (
         realm, seller_account, seller_character, seller_name, seller_wallet,
         item, item_id, quality, format, start_cents, buy_now_cents,
         offer_next, status, item_disposed, ends_at, base_ends_at, created_at,
         current_bid_cents)
       SELECT $1, 10001, 19000 + g, 'BS' || g, 'w-bs-' || g,
              '{"itemId":"crown_of_embers","count":1}'::jsonb, 'crown_of_embers',
              'epic', 'auction_buy_now', g, 10 * g, false, 'active', false,
              now() + (g || ' minutes')::interval,
              now() + (g || ' minutes')::interval,
              now() - (g || ' minutes')::interval,
              CASE WHEN g % 3 = 0 THEN 2 * g END
         FROM generate_series(1, 500) g`,
      [realm],
    );
    await pool.query('ANALYZE woc_market_listings');
    const q = { page: 0, pageSize: 24, quality: null, format: null, itemIds: null } as const;
    for (const [sort, index] of [
      ['price_desc', 'woc_market_listings_live_price_desc'],
      ['price_asc', 'woc_market_listings_live_price'],
      ['newest', 'woc_market_listings_live_created'],
      ['ending', 'woc_market_listings_live_ends'],
    ] as const) {
      take();
      await marketDb.browseListings(realm, { ...q, sort });
      const [browse] = take();
      const plan = await planOf(browse.text, browse.values);
      expect(plan, sort).not.toMatch(/Seq Scan on woc_market_listings/);
      expect(plan, sort).toContain(index);
      // The index SERVES THE ORDER: no sort node may appear, or the direction
      // mismatch this index exists to close has come back.
      expect(plan, `${sort} must not plan a sort`).not.toMatch(/Sort/);
    }
  }, 60_000);

  it('the five stuck-readout classes are index-reachable end to end', async () => {
    take();
    await marketDb.stuckCustodyReadout('plans-readout', Date.now() - 600_000, 10, 1000, 0);
    const statements = take();
    expect(statements.length).toBeGreaterThanOrEqual(5);
    const plans: string[] = [];
    for (const s of statements) plans.push(await planOf(s.text, s.values));
    const joined = plans.join('\n');
    // No class may scan a marketplace table; each class's own index appears.
    expect(joined).not.toMatch(/Seq Scan on woc_market_/);
    expect(joined, 'unbooked claims').toContain('woc_market_custody_claims_unbooked');
    expect(joined, 'delivering + review age').toContain('woc_market_settlements_state_updated');
    expect(joined, 'undisposed listings').toContain('woc_market_listings_undisposed');
    expect(joined, 'stuck bonds').toContain('woc_market_bids_bond_confirming');
  }, 60_000);

  it('the redrive page walks live ids and probes settlements through the composite', async () => {
    // The distribution this partial index exists for: a long dead prefix in
    // id order (what retention and other realms leave behind as the id space
    // grows) followed by a small live band at high ids. A bare primary-key
    // walk from the caller's id > 0 cursor pays a skip per dead id before
    // reaching the band; the live partial holds only the band and wins
    // outright. The ballast sits in its OWN realm so the statistics show the
    // realm's true selectivity (in-realm ballast inflates the row estimate,
    // and the uniform-distribution assumption then makes the pkey walk look
    // cheap). An all-live fixture lets the pkey walk tie on cost and the pin
    // could not tell a dropped index from a planner whim.
    const realm = 'plans-redrive';
    await pool.query(
      `INSERT INTO woc_market_listings (
         realm, seller_account, seller_character, seller_name, seller_wallet,
         item, item_id, quality, format, start_cents, buy_now_cents,
         offer_next, status, item_disposed, resolution, ends_at, base_ends_at)
       SELECT 'plans-ballast', 10001, 29000 + g, 'CL' || g, 'w-cl-' || g,
              '{"itemId":"crown_of_embers","count":1}'::jsonb, 'crown_of_embers',
              'epic', 'buy_now', 500, 1000, false, 'closed', true, 'cancelled',
              now() - interval '1 hour', now() - interval '1 hour'
         FROM generate_series(1, 5000) g`,
    );
    await pool.query(
      `INSERT INTO woc_market_listings (
         realm, seller_account, seller_character, seller_name, seller_wallet,
         item, item_id, quality, format, start_cents, buy_now_cents,
         offer_next, status, item_disposed, ends_at, base_ends_at)
       SELECT $1, 10001, 39000 + g, 'RL' || g, 'w-rl-' || g,
              '{"itemId":"crown_of_embers","count":1}'::jsonb, 'crown_of_embers',
              'epic', 'buy_now', 500, 1000, false, 'settling', false,
              now() + interval '1 hour', now() + interval '1 hour'
         FROM generate_series(1, 2000) g`,
      [realm],
    );
    // A few delivered residue settlements on the band, so the second
    // statement (the ANY-probe) really fires; distinct listings keep the
    // one-open-settlement unique index happy.
    await pool.query(
      `INSERT INTO woc_market_settlements (
         listing_id, realm, bid_id, attempt, buyer_account, buyer_character,
         buyer_name, buyer_wallet, amount_cents, state, deadline_at)
       SELECT id, $1, NULL, 0, 10002, 7000, 'RB', 'w-rb', 1000, 'delivered', now()
         FROM woc_market_listings
        WHERE realm = $1 AND status = 'settling'
        ORDER BY id
        LIMIT 3`,
      [realm],
    );
    await pool.query('ANALYZE woc_market_listings');
    await pool.query('ANALYZE woc_market_settlements');
    take();
    // The production page size over a live band it does not exhaust.
    await marketDb.deliveredUnclosedSettlementsPage(realm, 0, 500, 25);
    const [idsPage, residue] = take();
    const idsPlan = await planOf(idsPage.text, idsPage.values);
    // JUDGED plan class, deliberately looser than the siblings: under the
    // LIMIT, the planner's uniform-distribution assumption credits a filtered
    // primary-key walk with early termination, so at fixture scales the pick
    // alternates between woc_market_listings_live_ids, the pkey walk, and a
    // bitmap over a sibling live partial: every one is an index plan bounded
    // by the live set or the id walk, and which wins is a cost-model whim,
    // not a shape property. The regression class the 2026-08-11 finding named
    // is the SEQ SCAN, so that is the decisive assert; live_ids' existence
    // and exact columns are literally pinned in the DB-free SQL floor
    // (tests/server/woc_market_directed_sql.test.ts).
    expect(idsPlan).not.toMatch(/Seq Scan on woc_market_listings/);
    expect(idsPlan).toMatch(/Index Scan|Bitmap Index Scan/);
    // The second statement only fires when the page found live listings; the
    // two seeded rows above guarantee it, so the probe half is really pinned.
    expect(residue, 'the settlements probe must have run').toBeDefined();
    const residuePlan = await planOf(residue.text, residue.values);
    expect(residuePlan).not.toMatch(/Seq Scan on woc_market_settlements/);
    // Three legitimate paths, all O(small): the composite seeks per listing
    // id; 'delivered' is INSIDE the one-open partial's predicate, so the tiny
    // open2 unique index is a complete listing_id-ordered path; and the
    // (realm, state, updated_at) index seeks the handful of delivered rows
    // state-first, which at the real cardinality (a few residue rows per
    // realm) is often the cheapest of the three. Which one wins is a
    // cost-model choice; the regression class is the seq scan.
    expect(residuePlan).toMatch(/woc_market_settlements_(listing_latest|open2|state_updated)/);
  }, 60_000);

  it('both rotation-order batch reads ride their COALESCE partials without a sort', async () => {
    take();
    await marketDb.deliveringSettlements('plans-rotation', 25, []);
    const [delivering] = take();
    const deliveringPlan = await planOf(delivering.text, delivering.values);
    expect(deliveringPlan).not.toMatch(/Seq Scan on woc_market_settlements/);
    expect(deliveringPlan).toContain('woc_market_settlements_delivering_rotation');
    expect(deliveringPlan).not.toMatch(/Sort/);
    await marketDb.undisposedClosedListings('plans-rotation', 25, []);
    const [returns] = take();
    const returnsPlan = await planOf(returns.text, returns.values);
    expect(returnsPlan).not.toMatch(/Seq Scan on woc_market_listings/);
    expect(returnsPlan).toContain('woc_market_listings_undisposed_rotation');
    expect(returnsPlan).not.toMatch(/Sort/);
  }, 60_000);

  it('the sold-residue dispose seeks its partial and proves the sale through the once index', async () => {
    take();
    await marketDb.disposeSoldResidueListings('plans-residue', 25);
    const [dispose] = take();
    const plan = await planOf(dispose.text, dispose.values);
    expect(plan).not.toMatch(/Seq Scan on woc_market_listings/);
    expect(plan).toContain('woc_market_listings_sold_undisposed');
    expect(plan).not.toMatch(/Seq Scan on woc_market_sales/);
    expect(plan).toContain('woc_market_sales_listing_once');
  }, 60_000);

  it('the offer expiry and converge probes ride their partials', async () => {
    const realm = 'plans-probes';
    // Enough pending rows that the expiry seek is a real planner decision:
    // most are far from due, so the (realm, expires_at) partial's range seek
    // beats the pair-pending index's scan-all-pending-and-filter shape. Every
    // (buyer, seller) pair is distinct, clear of the pair-pending unique.
    await pool.query(
      `INSERT INTO woc_market_directed_offers (
         realm, seller_account, seller_character, seller_name, buyer_account,
         buyer_name, usd_cents, status, expires_at, updated_at)
       SELECT $1, 10000 + (g % 20), 9000 + g, 'S' || g, 10100 + ((g - 1) / 20),
              'B' || g, 1000, 'pending',
              now() + (g || ' minutes')::interval, now() - interval '1 minute'
         FROM generate_series(1, 400) g`,
      [realm],
    );
    await pool.query('ANALYZE woc_market_directed_offers');
    take();
    await marketDb.expireDueDirectedOffers(realm, Date.now(), 25);
    const [expiry] = take();
    const expiryPlan = await planOf(expiry.text, expiry.values);
    expect(expiryPlan).not.toMatch(/Seq Scan on woc_market_directed_offers/);
    expect(expiryPlan).toContain('woc_market_offers_due');
    await marketDb.acceptedUnstampedOffers(realm, Date.now(), Date.now() - 86_400_000, 25);
    const [converge] = take();
    const convergePlan = await planOf(converge.text, converge.values);
    expect(convergePlan).not.toMatch(/Seq Scan on woc_market_directed_offers/);
    expect(convergePlan).toContain('woc_market_offers_accepted_unstamped');
  }, 60_000);

  it('the buy-now cooldown ledger probes are index probes on the abandons table', async () => {
    const realm = 'plans-cooldown';
    const listingId = await seedListing(realm);
    take();
    await marketDb.claimBuyNowLock(realm, listingId, 10_002, Date.now(), Date.now() + 270_000);
    const statements = take();
    const abandonProbes = statements.filter((s) => s.text.includes('woc_market_buy_now_abandons'));
    // The advisory pre-pass runs its one-round-trip cooldown probes on the
    // shared pool; a shape change that moved or dropped them must fail here.
    expect(abandonProbes.length).toBeGreaterThanOrEqual(1);
    for (const probe of abandonProbes) {
      const plan = await planOf(probe.text, probe.values);
      expect(plan).not.toMatch(/Seq Scan on woc_market_buy_now_abandons/);
      expect(plan).toMatch(/woc_market_buy_now_abandons_(once|account)/);
    }
  }, 60_000);

  it('the cascade pick derives prior winners store-side and stays on the bids index', async () => {
    const realm = 'plans-cascade';
    const listingId = await seedListing(realm);
    const bid = async (account: number, amountCents: number, status: string): Promise<number> => {
      seq++;
      const res = await pool.query(
        `INSERT INTO woc_market_bids (
           listing_id, realm, account, character_id, character_name, wallet,
           amount_cents, status, bond_cents, bond_state, placed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 70, 'held', now())
         RETURNING id`,
        [
          listingId,
          realm,
          account,
          8000 + seq,
          `PlanBidder${seq}`,
          `wallet-pb-${seq}`,
          amountCents,
          status,
        ],
      );
      return Number(res.rows[0].id);
    };
    // The prior winner's CANDIDATE row is an eligible 'outbid' and the highest
    // amount on the listing; only the sibling defaulted row disqualifies the
    // ACCOUNT, so the pick falling through to the runner-up proves the NOT
    // EXISTS is per account, not per row.
    await bid(10_010, 900, 'outbid');
    await bid(10_010, 950, 'defaulted');
    const runnerUp = await bid(10_011, 800, 'outbid');
    take();
    const picked = await marketDb.nextCascadeBidder(listingId, 0);
    const [pick] = take();
    expect(picked?.id).toBe(runnerUp);
    const plan = await planOf(pick.text, pick.values);
    expect(plan).not.toMatch(/Seq Scan on woc_market_bids/);
    expect(plan).toContain('woc_market_bids_listing');
  }, 60_000);
});
