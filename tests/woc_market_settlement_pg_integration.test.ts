// Real-Postgres coverage for the $WOC Exchange settlement-state guards: the
// money predicates the fake db can only imitate. Interleaved transactions
// simulate the races; the disposable database boots through the REAL
// ensureSchema so the partial unique indexes under test are genuinely present.
//
// Gate: TEST_DATABASE_URL (an admin URL on the dev Postgres from npm run
// db:up). The suite creates and drops its own database and never touches the
// database the URL points at. Pattern: tests/guild_bank_pg_integration.test.ts.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WocMarketCustody, WocMarketService, WocSettlementRow } from '../server/woc_market';
import type { PgWocMarketDb } from '../server/woc_market_db';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const VERIFY_DB = 'wocc_woc_market_verify';

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

const BASE_MS = 1_820_000_000_000;
const MINUTE_MS = 60_000;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describeDb('woc market settlement guards against real Postgres', () => {
  let admin: Pool;
  let pool: Pool;
  let db: typeof import('../server/db');
  let marketDb: PgWocMarketDb;
  let marketMod: typeof import('../server/woc_market');
  let proxyMod: typeof import('../server/woc_market_proxy');
  let rulesMod: typeof import('../server/woc_market_rules');
  let schemaSql: string;
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

    db = await import('../server/db');
    const marketDbMod = await import('../server/woc_market_db');
    marketMod = await import('../server/woc_market');
    proxyMod = await import('../server/woc_market_proxy');
    rulesMod = await import('../server/woc_market_rules');
    schemaSql = marketDbMod.WOC_MARKET_SCHEMA;

    // The REAL boot path, so every constraint and index under test is the one
    // production gets.
    await db.ensureSchema();
    await db.runConcurrentIndexMigrations();

    pool = new Pool({ connectionString: verifyUrl(ADMIN_URL as string), max: 12 });
    marketDb = new marketDbMod.PgWocMarketDb(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await db?.pool?.end().catch(() => {});
    await admin?.end().catch(() => {});
  }, 30_000);

  // -------------------------------------------------------------------------
  // Fixtures (direct SQL; settlements go through the real insertSettlement so
  // the partial unique index stays the authority)
  // -------------------------------------------------------------------------

  async function seedAccount(): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO accounts (username, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`woc-guard-fixture-${seq}`],
    );
    return Number(res.rows[0].id);
  }

  async function seedListing(
    realm: string,
    sellerAccount: number,
    over: {
      status?: string;
      endsAtMs?: number;
      buyNowCents?: number | null;
      offerNext?: boolean;
      reserveCents?: number | null;
    } = {},
  ): Promise<number> {
    seq++;
    const endsAtMs = over.endsAtMs ?? BASE_MS + 60 * MINUTE_MS;
    const res = await pool.query(
      `INSERT INTO woc_market_listings (
         realm, seller_account, seller_character, seller_name, seller_wallet,
         item, item_id, quality, format, start_cents, reserve_cents,
         buy_now_cents, offer_next, status, ends_at, base_ends_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'epic', 'auction_buy_now', 500, $8, $9,
         $10, $11, to_timestamp($12 / 1000.0), to_timestamp($12 / 1000.0)
       ) RETURNING id`,
      [
        realm,
        sellerAccount,
        9000 + seq,
        `Seller${seq}`,
        `wallet-seller-${seq}`,
        JSON.stringify({ itemId: 'crown_of_embers', count: 1 }),
        'crown_of_embers',
        over.reserveCents ?? null,
        over.buyNowCents === undefined ? 1000 : over.buyNowCents,
        over.offerNext ?? false,
        over.status ?? 'active',
        endsAtMs,
      ],
    );
    return Number(res.rows[0].id);
  }

  async function seedBid(
    realm: string,
    listingId: number,
    account: number,
    over: {
      status?: string;
      bondState?: string;
      amountCents?: number;
      placedAtMs?: number;
      bondReference?: string;
    } = {},
  ): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO woc_market_bids (
         listing_id, realm, account, character_id, character_name, wallet,
         amount_cents, status, bond_cents, bond_state, placed_at, bond_reference
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11 / 1000.0), $12)
       RETURNING id`,
      [
        listingId,
        realm,
        account,
        8000 + seq,
        `Bidder${seq}`,
        `wallet-bidder-${seq}`,
        over.amountCents ?? 700,
        over.status ?? 'active',
        70,
        over.bondState ?? 'held',
        over.placedAtMs ?? BASE_MS - 10 * MINUTE_MS,
        over.bondReference ?? null,
      ],
    );
    return Number(res.rows[0].id);
  }

  async function seedSettlement(
    _realm: string,
    listingId: number,
    buyerAccount: number,
    over: { state?: string; bidId?: number | null; deadlineAtMs?: number } = {},
  ): Promise<WocSettlementRow> {
    // _realm is unused: the settlement inherits its realm from the listing via
    // the INSERT..SELECT; call sites keep passing it for fixture readability.
    const out = await marketDb.insertSettlement({
      listingId,
      bidId: over.bidId ?? null,
      attempt: over.bidId ? 1 : 0,
      buyerAccount,
      buyerCharacter: 7000 + seq,
      buyerName: `Buyer${seq}`,
      buyerWallet: `wallet-buyer-${seq}`,
      amountCents: 1000,
      deadlineAtMs: over.deadlineAtMs ?? BASE_MS + 15 * MINUTE_MS,
      nowMs: BASE_MS,
    });
    if (out === 'live_settlement_exists' || out === 'listing_closed') {
      throw new Error(`fixture settlement refused: ${out}`);
    }
    if (over.state && over.state !== 'offered') await setSettlementState(out.id, over.state);
    return out;
  }

  async function setSettlementState(id: number, state: string): Promise<void> {
    await pool.query(
      `UPDATE woc_market_settlements SET state = $2, updated_at = now() WHERE id = $1`,
      [id, state],
    );
  }

  async function listingRow(
    id: number,
  ): Promise<{ status: string; resolution: string | null; lockAccount: number | null }> {
    const res = await pool.query(
      `SELECT status, resolution, buy_now_lock_account FROM woc_market_listings WHERE id = $1`,
      [id],
    );
    return {
      status: res.rows[0].status,
      resolution: res.rows[0].resolution,
      lockAccount: res.rows[0].buy_now_lock_account,
    };
  }

  async function bidRow(id: number): Promise<{ status: string; bondState: string }> {
    const res = await pool.query(`SELECT status, bond_state FROM woc_market_bids WHERE id = $1`, [
      id,
    ]);
    return { status: res.rows[0].status, bondState: res.rows[0].bond_state };
  }

  async function settlementRow(id: number): Promise<{ state: string; failReason: string | null }> {
    const res = await pool.query(
      `SELECT state, fail_reason FROM woc_market_settlements WHERE id = $1`,
      [id],
    );
    return { state: res.rows[0].state, failReason: res.rows[0].fail_reason };
  }

  function makeService(realm: string): WocMarketService {
    const custody: WocMarketCustody = {
      extractCopy: () => {
        throw new Error('custody not exercised by this suite');
      },
      grantCopy: () => {
        throw new Error('custody not exercised by this suite');
      },
      restoreCopy: () => {},
      persistMailParcel: async () => {},
    };
    return new marketMod.WocMarketService({
      db: marketDb,
      economy: proxyMod.createDevWocMarketEconomy(() => BASE_MS),
      custody,
      verifiedWallet: async () => 'wallet-fixture',
      balanceTokens: async () => 1_000_000,
      config: { enabled: true, realm, policy: rulesMod.WOC_MARKET_RESTRICTED_POLICY },
      now: () => BASE_MS,
    });
  }

  // -------------------------------------------------------------------------
  // B1: seller cancel versus a live settlement
  // -------------------------------------------------------------------------

  describe('settlement-aware seller cancel', () => {
    it('refuses the cancel at every non-terminal settlement state', async () => {
      const realm = 'guard-cancel-live';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const settlement = await seedSettlement(realm, listingId, buyer);
      for (const state of ['offered', 'confirming', 'confirmed', 'delivering', 'delivered']) {
        await setSettlementState(settlement.id, state);
        const out = await marketDb.cancelListingIfUnbid(realm, listingId, seller, BASE_MS);
        expect(out, `state ${state}`).toBe('settlement_live');
        const row = await listingRow(listingId);
        expect(row.status, `state ${state}`).toBe('active');
        expect(row.resolution, `state ${state}`).toBeNull();
      }
    });

    it('refuses the cancel while the buy-now lock is claimed, allows it after expiry', async () => {
      const realm = 'guard-cancel-lock';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const claimed = await marketDb.claimBuyNowLock(
        realm,
        listingId,
        buyer,
        BASE_MS,
        BASE_MS + 2 * MINUTE_MS,
      );
      expect(claimed).toMatchObject({ id: listingId });
      expect(await marketDb.cancelListingIfUnbid(realm, listingId, seller, BASE_MS)).toBe(
        'buy_now_pending',
      );
      expect((await listingRow(listingId)).status).toBe('active');
      // Past the lock expiry (and with no settlement created) the cancel lands.
      const out = await marketDb.cancelListingIfUnbid(
        realm,
        listingId,
        seller,
        BASE_MS + 3 * MINUTE_MS,
      );
      expect(out).toMatchObject({ id: listingId, status: 'closed', resolution: 'cancelled' });
    });

    it('a successful cancel expires a failed settlement so a retry cannot revive it', async () => {
      const realm = 'guard-cancel-failed';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const settlement = await seedSettlement(realm, listingId, buyer, { state: 'failed' });
      const out = await marketDb.cancelListingIfUnbid(realm, listingId, seller, BASE_MS);
      expect(out).toMatchObject({ id: listingId, status: 'closed', resolution: 'cancelled' });
      const after = await settlementRow(settlement.id);
      expect(after.state).toBe('expired');
      expect(after.failReason).toBe('listing_cancelled');
      // The retry path's own compare-and-set arms find nothing to revive.
      expect(await marketDb.transitionSettlement(settlement.id, ['failed'], 'offered')).toBe(false);
      expect(
        await marketDb.setSettlementQuote(settlement.id, 'ref-x', BASE_MS + MINUTE_MS, null),
      ).toBe(false);
    });

    it('a refused cancel rolls its speculative failed-expiry back', async () => {
      const realm = 'guard-cancel-rollback';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const failed = await seedSettlement(realm, listingId, buyer, { state: 'failed' });
      const open = await seedSettlement(realm, listingId, buyer);
      const out = await marketDb.cancelListingIfUnbid(realm, listingId, seller, BASE_MS);
      expect(out).toBe('settlement_live');
      // The transaction expires failed rows BEFORE finding the open one; the
      // abort must roll that expiry back, never leak it past a refusal.
      expect((await settlementRow(failed.id)).state).toBe('failed');
      expect((await settlementRow(open.id)).state).toBe('offered');
    });

    it('the real cancel blocks behind the row lock and refuses a lock claimed under it', async () => {
      const realm = 'guard-cancel-race';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const client = await pool.connect();
      try {
        // Hold the listing row lock the way any writer would, then fire the
        // REAL cancelListingIfUnbid: it must sit blocked on its own SELECT
        // FOR UPDATE (the assertion that pins the production row lock), never
        // interleave past it.
        await client.query('BEGIN');
        await client.query(
          `SELECT 1 FROM woc_market_listings WHERE realm = $1 AND id = $2 FOR UPDATE`,
          [realm, listingId],
        );
        const cancel = marketDb.cancelListingIfUnbid(realm, listingId, seller, BASE_MS);
        const first = await Promise.race([
          cancel.then(() => 'resolved'),
          delay(200).then(() => 'blocked'),
        ]);
        expect(first).toBe('blocked');
        // The lock holder claims the buy-now lock and commits; the unblocked
        // cancel re-reads the committed row and must refuse it.
        await client.query(
          `UPDATE woc_market_listings
              SET buy_now_lock_account = $2,
                  buy_now_lock_expires = to_timestamp($3 / 1000.0),
                  updated_at = now()
            WHERE id = $1`,
          [listingId, buyer, BASE_MS + MINUTE_MS],
        );
        await client.query('COMMIT');
        expect(await cancel).toBe('buy_now_pending');
        expect((await listingRow(listingId)).status).toBe('active');
      } finally {
        client.release();
      }
    }, 20_000);
  });

  // -------------------------------------------------------------------------
  // Admin suspend: the defined safe path
  // -------------------------------------------------------------------------

  describe('admin suspend safe path', () => {
    it('suspends over an offered settlement: expires it, cancels bids, queues bond refunds', async () => {
      const realm = 'guard-suspend-offered';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const bidder = await seedAccount();
      const pendingBidder = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const heldBid = await seedBid(realm, listingId, bidder);
      const pendingBid = await seedBid(realm, listingId, pendingBidder, {
        status: 'pending_bond',
        bondState: 'pending',
      });
      const settlement = await seedSettlement(realm, listingId, buyer);
      const out = await marketDb.suspendListingIfSafe(realm, listingId, BASE_MS);
      expect(out).toMatchObject({ id: listingId, status: 'closed', resolution: 'suspended' });
      const row = await listingRow(listingId);
      expect(row.status).toBe('closed');
      expect(row.resolution).toBe('suspended');
      const after = await settlementRow(settlement.id);
      expect(after.state).toBe('expired');
      expect(after.failReason).toBe('listing_suspended');
      expect(await bidRow(heldBid)).toEqual({ status: 'cancelled', bondState: 'refund_due' });
      // An unfunded bond has nothing to refund; only the bid is cancelled.
      expect(await bidRow(pendingBid)).toEqual({ status: 'cancelled', bondState: 'pending' });
    });

    it('refuses the suspend at every state where the payment may already be moving', async () => {
      const realm = 'guard-suspend-live';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const bidder = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const bid = await seedBid(realm, listingId, bidder);
      const settlement = await seedSettlement(realm, listingId, buyer);
      for (const state of ['confirming', 'confirmed', 'delivering', 'delivered']) {
        await setSettlementState(settlement.id, state);
        const out = await marketDb.suspendListingIfSafe(realm, listingId, BASE_MS);
        expect(out, `state ${state}`).toBe('settlement_live');
        expect((await listingRow(listingId)).status, `state ${state}`).toBe('active');
        // A refused suspend must leave the bid book untouched.
        expect(await bidRow(bid), `state ${state}`).toEqual({
          status: 'active',
          bondState: 'held',
        });
      }
    });

    it('refuses the suspend under an unexpired buy-now lock, proceeds after expiry', async () => {
      const realm = 'guard-suspend-lock';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      await marketDb.claimBuyNowLock(realm, listingId, buyer, BASE_MS, BASE_MS + 2 * MINUTE_MS);
      expect(await marketDb.suspendListingIfSafe(realm, listingId, BASE_MS)).toBe(
        'buy_now_pending',
      );
      expect((await listingRow(listingId)).status).toBe('active');
      const out = await marketDb.suspendListingIfSafe(realm, listingId, BASE_MS + 3 * MINUTE_MS);
      expect(out).toMatchObject({ id: listingId, status: 'closed', resolution: 'suspended' });
      expect((await listingRow(listingId)).resolution).toBe('suspended');
    });

    it('suspending over a failed settlement expires it and still tears the bid book down', async () => {
      const realm = 'guard-suspend-failed';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const bidder = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const heldBid = await seedBid(realm, listingId, bidder);
      const settlement = await seedSettlement(realm, listingId, buyer, { state: 'failed' });
      const out = await marketDb.suspendListingIfSafe(realm, listingId, BASE_MS);
      expect(out).toMatchObject({ id: listingId, status: 'closed', resolution: 'suspended' });
      const after = await settlementRow(settlement.id);
      expect(after.state).toBe('expired');
      expect(after.failReason).toBe('listing_suspended');
      // The atomic teardown holds on this arm too, not only over 'offered'.
      expect(await bidRow(heldBid)).toEqual({ status: 'cancelled', bondState: 'refund_due' });
    });

    it('refuses a missing or already-closed listing', async () => {
      const realm = 'guard-suspend-refusals';
      const seller = await seedAccount();
      expect(await marketDb.suspendListingIfSafe(realm, 999_999_999, BASE_MS)).toBe('not_found');
      const closed = await seedListing(realm, seller, { status: 'closed' });
      expect(await marketDb.suspendListingIfSafe(realm, closed, BASE_MS)).toBe('not_active');
    });

    it('a suspend interleaved with a bond activation cannot deadlock', async () => {
      const realm = 'guard-suspend-deadlock';
      const seller = await seedAccount();
      const bidder = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const bidId = await seedBid(realm, listingId, bidder);
      const client = await pool.connect();
      try {
        // Replay activateBid's lock order (its bid row first, the listing row
        // second) around a live suspend. The suspend takes bids before the
        // listing too, so it queues behind the held bid lock; the old
        // listing-first order formed a cycle here and one side died 40P01.
        await client.query('BEGIN');
        await client.query(`SELECT 1 FROM woc_market_bids WHERE id = $1 FOR UPDATE`, [bidId]);
        const suspend = marketDb.suspendListingIfSafe(realm, listingId, BASE_MS);
        const first = await Promise.race([
          suspend.then(() => 'resolved'),
          delay(200).then(() => 'blocked'),
        ]);
        expect(first).toBe('blocked');
        await client.query(`SELECT 1 FROM woc_market_listings WHERE id = $1 FOR UPDATE`, [
          listingId,
        ]);
        await client.query('COMMIT');
        expect(await suspend).toMatchObject({
          id: listingId,
          status: 'closed',
          resolution: 'suspended',
        });
        expect(await bidRow(bidId)).toEqual({ status: 'cancelled', bondState: 'refund_due' });
      } finally {
        client.release();
      }
    }, 20_000);
  });

  // -------------------------------------------------------------------------
  // Delivered-but-unclosed visibility (the liveness groundwork)
  // -------------------------------------------------------------------------

  describe('delivered-but-unclosed listings stay visible to the liveness checks', () => {
    it('liveSettlementForListing reports a delivered settlement', async () => {
      const realm = 'guard-delivered-visible';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const settlement = await seedSettlement(realm, listingId, buyer, { state: 'delivered' });
      const live = await marketDb.liveSettlementForListing(listingId);
      expect(live?.id).toBe(settlement.id);
      expect(live?.state).toBe('delivered');
    });

    it('a second settlement for a delivered-but-unclosed listing fails closed at the index', async () => {
      const realm = 'guard-delivered-unique';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      await seedSettlement(realm, listingId, buyer, { state: 'delivered' });
      const second = await marketDb.insertSettlement({
        listingId,
        bidId: null,
        attempt: 0,
        buyerAccount: buyer,
        buyerCharacter: 7999,
        buyerName: 'SecondBuyer',
        buyerWallet: 'wallet-second',
        amountCents: 1000,
        deadlineAtMs: BASE_MS + 15 * MINUTE_MS,
        nowMs: BASE_MS,
      });
      expect(second).toBe('live_settlement_exists');
    });

    it('the reclaim sweep leaves a delivered-but-unclosed listing alone and still reopens a dead one', async () => {
      const realm = 'guard-delivered-reclaim';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const deliveredListing = await seedListing(realm, seller, { status: 'settling' });
      await seedSettlement(realm, deliveredListing, buyer, { state: 'delivered' });
      const deadListing = await seedListing(realm, seller, { status: 'settling' });
      const dead = await seedSettlement(realm, deadListing, buyer, { state: 'failed' });
      // The failed settlement is past its retry window, so its listing really
      // is stranded; the delivered one is mid-custody and must not reopen.
      await pool.query(
        `UPDATE woc_market_settlements SET deadline_at = to_timestamp($2 / 1000.0) WHERE id = $1`,
        [dead.id, BASE_MS - 60 * MINUTE_MS],
      );
      await pool.query(
        `UPDATE woc_market_listings SET updated_at = to_timestamp($2 / 1000.0) WHERE realm = $1`,
        [realm, BASE_MS - 24 * 60 * MINUTE_MS],
      );
      await makeService(realm).sweepPass();
      expect((await listingRow(deliveredListing)).status).toBe('settling');
      expect((await listingRow(deadListing)).status).not.toBe('settling');
    }, 20_000);

    it('the schema swaps the live index for the open one, and re-applies cleanly', async () => {
      const names = async (): Promise<string[]> => {
        const res = await pool.query(
          `SELECT indexname FROM pg_indexes WHERE tablename = 'woc_market_settlements'`,
        );
        return res.rows.map((r) => r.indexname);
      };
      const first = await names();
      expect(first).toContain('woc_market_settlements_open');
      expect(first).not.toContain('woc_market_settlements_live');
      const def = await pool.query(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'woc_market_settlements_open'`,
      );
      const indexdef: string = def.rows[0].indexdef;
      expect(indexdef).toContain('UNIQUE');
      expect(indexdef).toContain('(listing_id)');
      // The whole five-state predicate, member by member: dropping any one of
      // them would quietly narrow the invariant this index exists to widen.
      for (const state of ['offered', 'confirming', 'confirmed', 'delivering', 'delivered']) {
        expect(indexdef, state).toContain(`'${state}'`);
      }
      // A database created before the swap still carries the stale index; a
      // re-boot must drop it. Recreate it, re-apply the schema, and re-check.
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS woc_market_settlements_live
           ON woc_market_settlements(listing_id)
           WHERE state IN ('offered', 'confirming', 'confirmed', 'delivering')`,
      );
      await pool.query(schemaSql);
      const second = await names();
      expect(second).toContain('woc_market_settlements_open');
      expect(second).not.toContain('woc_market_settlements_live');
    }, 20_000);

    it('the boot repair demotes a legacy delivered-plus-open pair instead of failing the boot', async () => {
      const realm = 'guard-repair-settlements';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      // Recreate the legacy shape: with the wide index dropped, a delivered
      // row and a later revived one can coexist, exactly what the pre-guard
      // reclaim/re-auction bug produced. The next boot must repair it, not
      // die on the CREATE UNIQUE INDEX.
      await pool.query('DROP INDEX woc_market_settlements_open');
      const delivered = await seedSettlement(realm, listingId, buyer, { state: 'delivered' });
      const revived = await seedSettlement(realm, listingId, buyer);
      await pool.query(schemaSql);
      expect((await settlementRow(delivered.id)).state).toBe('delivered');
      const demoted = await settlementRow(revived.id);
      expect(demoted.state).toBe('expired');
      expect(demoted.failReason).toBe('schema_dedupe');
      const rebuilt = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'woc_market_settlements_open'`,
      );
      expect(rebuilt.rows).toHaveLength(1);
    }, 20_000);

    it('a closed listing refuses a new settlement distinctly from a missing one', async () => {
      const realm = 'guard-insert-closed';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const closed = await seedListing(realm, seller, { status: 'closed' });
      const insertFor = (listingId: number) =>
        marketDb.insertSettlement({
          listingId,
          bidId: null,
          attempt: 0,
          buyerAccount: buyer,
          buyerCharacter: 7800,
          buyerName: 'ClosedBuyer',
          buyerWallet: 'wallet-closed',
          amountCents: 1000,
          deadlineAtMs: BASE_MS + 15 * MINUTE_MS,
          nowMs: BASE_MS,
        });
      expect(await insertFor(closed)).toBe('listing_closed');
      expect(await insertFor(999_999_999)).toBe('live_settlement_exists');
    });
  });

  // -------------------------------------------------------------------------
  // H9: buy-now racing the auction close
  // -------------------------------------------------------------------------

  describe('buy-now versus auction close', () => {
    it('the auction close loses to a live buy-now settlement: bid outbid, bond refunded, one winner', async () => {
      const realm = 'guard-h9-race';
      const seller = await seedAccount();
      const bidder = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller, { endsAtMs: BASE_MS - MINUTE_MS });
      const bidId = await seedBid(realm, listingId, bidder, { bondReference: 'bond-ref-h9-race' });
      const buyNow = await seedSettlement(realm, listingId, buyer);
      await makeService(realm).sweepPass();
      // Exactly one winner: the buy-now settlement stands alone and the
      // standing bid holds no claim; its bond rode the refund pipeline to its
      // terminal state inside the same pass (the dev economy always settles).
      expect(await bidRow(bidId)).toEqual({ status: 'outbid', bondState: 'refunded' });
      const settlements = await pool.query(
        `SELECT id, state FROM woc_market_settlements WHERE listing_id = $1`,
        [listingId],
      );
      expect(settlements.rows.map((r) => Number(r.id))).toEqual([buyNow.id]);
      expect((await listingRow(listingId)).status).toBe('settling');
    }, 20_000);

    it('a clean auction close still stamps the winner atomically with its settlement', async () => {
      const realm = 'guard-h9-clean';
      const seller = await seedAccount();
      const bidder = await seedAccount();
      const listingId = await seedListing(realm, seller, { endsAtMs: BASE_MS - MINUTE_MS });
      const bidId = await seedBid(realm, listingId, bidder);
      await makeService(realm).sweepPass();
      expect((await bidRow(bidId)).status).toBe('won');
      const settlements = await pool.query(
        `SELECT bid_id, state FROM woc_market_settlements WHERE listing_id = $1`,
        [listingId],
      );
      expect(settlements.rows).toHaveLength(1);
      expect(Number(settlements.rows[0].bid_id)).toBe(bidId);
      expect(settlements.rows[0].state).toBe('offered');
      expect((await listingRow(listingId)).status).toBe('settling');
    }, 20_000);

    it('a conflicting winner insert rolls the won stamp back with the settlement', async () => {
      const realm = 'guard-h9-atomic';
      const seller = await seedAccount();
      const bidder = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const bidId = await seedBid(realm, listingId, bidder);
      await seedSettlement(realm, listingId, buyer);
      const out = await marketDb.insertSettlement({
        listingId,
        bidId,
        attempt: 1,
        buyerAccount: bidder,
        buyerCharacter: 7500,
        buyerName: 'RacerBidder',
        buyerWallet: 'wallet-racer',
        amountCents: 700,
        deadlineAtMs: BASE_MS + 15 * MINUTE_MS,
        nowMs: BASE_MS,
        winnerBidId: bidId,
      });
      expect(out).toBe('live_settlement_exists');
      // The atomic pair: no settlement means no won stamp survives.
      expect((await bidRow(bidId)).status).toBe('active');
    });

    it('the winner stamp lands with the settlement and never resurrects a cancelled bid', async () => {
      const realm = 'guard-h9-stamp';
      const seller = await seedAccount();
      const bidder = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const bidId = await seedBid(realm, listingId, bidder);
      const won = await marketDb.insertSettlement({
        listingId,
        bidId,
        attempt: 1,
        buyerAccount: bidder,
        buyerCharacter: 7501,
        buyerName: 'StampBidder',
        buyerWallet: 'wallet-stamp',
        amountCents: 700,
        deadlineAtMs: BASE_MS + 15 * MINUTE_MS,
        nowMs: BASE_MS,
        winnerBidId: bidId,
      });
      // The positive control for the rollback test above: on a clean insert
      // the stamp really does land.
      expect(won).toMatchObject({ listingId, bidId });
      expect((await bidRow(bidId)).status).toBe('won');
      // The converse guard: naming a cancelled bid as winner aborts the whole
      // insert, so no settlement can exist whose winner holds no claim.
      const otherListing = await seedListing(realm, seller);
      const cancelledBid = await seedBid(realm, otherListing, bidder, { status: 'cancelled' });
      const out = await marketDb.insertSettlement({
        listingId: otherListing,
        bidId: cancelledBid,
        attempt: 1,
        buyerAccount: bidder,
        buyerCharacter: 7502,
        buyerName: 'GhostBidder',
        buyerWallet: 'wallet-ghost',
        amountCents: 700,
        deadlineAtMs: BASE_MS + 15 * MINUTE_MS,
        nowMs: BASE_MS,
        winnerBidId: cancelledBid,
      });
      expect(out).toBe('live_settlement_exists');
      expect((await bidRow(cancelledBid)).status).toBe('cancelled');
      const none = await pool.query(
        `SELECT count(*)::int AS n FROM woc_market_settlements WHERE listing_id = $1`,
        [otherListing],
      );
      expect(none.rows[0].n).toBe(0);
    });

    it('two racing settlement inserts resolve to exactly one winner under the index', async () => {
      const realm = 'guard-h9-concurrent';
      const seller = await seedAccount();
      const bidder = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const bidId = await seedBid(realm, listingId, bidder);
      // A genuine interleave: both transactions race the partial unique index
      // itself, not a pre-seeded loser.
      const [buyNowOut, winnerOut] = await Promise.all([
        marketDb.insertSettlement({
          listingId,
          bidId: null,
          attempt: 0,
          buyerAccount: buyer,
          buyerCharacter: 7601,
          buyerName: 'RaceBuyer',
          buyerWallet: 'wallet-race-buyer',
          amountCents: 1000,
          deadlineAtMs: BASE_MS + 15 * MINUTE_MS,
          nowMs: BASE_MS,
        }),
        marketDb.insertSettlement({
          listingId,
          bidId,
          attempt: 1,
          buyerAccount: bidder,
          buyerCharacter: 7602,
          buyerName: 'RaceBidder',
          buyerWallet: 'wallet-race-bidder',
          amountCents: 700,
          deadlineAtMs: BASE_MS + 15 * MINUTE_MS,
          nowMs: BASE_MS,
          winnerBidId: bidId,
        }),
      ]);
      const survivors = [buyNowOut, winnerOut].filter((o) => typeof o === 'object');
      expect(survivors).toHaveLength(1);
      const count = await pool.query(
        `SELECT count(*)::int AS n FROM woc_market_settlements WHERE listing_id = $1`,
        [listingId],
      );
      expect(count.rows[0].n).toBe(1);
      // The stamp exists exactly when the winner insert is the survivor: a
      // rolled-back loser leaves no settlement-less won bid behind.
      expect((await bidRow(bidId)).status).toBe(typeof winnerOut === 'object' ? 'won' : 'active');
    }, 20_000);

    it('the settle cascade promotes the next bidder atomically with the new settlement', async () => {
      const realm = 'guard-h9-cascade';
      const seller = await seedAccount();
      const winner = await seedAccount();
      const runnerUp = await seedAccount();
      const listingId = await seedListing(realm, seller, { status: 'settling', offerNext: true });
      const winnerBid = await seedBid(realm, listingId, winner, {
        amountCents: 900,
        bondReference: 'bond-ref-cascade-winner',
      });
      await pool.query(`UPDATE woc_market_bids SET status = 'won' WHERE id = $1`, [winnerBid]);
      const runnerUpBid = await seedBid(realm, listingId, runnerUp, {
        amountCents: 800,
        status: 'outbid',
        bondState: 'refund_due',
        bondReference: 'bond-ref-cascade-runner-up',
      });
      await seedSettlement(realm, listingId, winner, {
        bidId: winnerBid,
        deadlineAtMs: BASE_MS - MINUTE_MS,
      });
      await makeService(realm).sweepPass();
      // The defaulted winner's forfeit also resolves inside the same pass.
      expect(await bidRow(winnerBid)).toEqual({ status: 'defaulted', bondState: 'forfeited' });
      expect(await bidRow(runnerUpBid)).toEqual({ status: 'won', bondState: 'held' });
      const settlements = await pool.query(
        `SELECT bid_id, state, attempt FROM woc_market_settlements WHERE listing_id = $1 ORDER BY id`,
        [listingId],
      );
      expect(settlements.rows).toHaveLength(2);
      expect(Number(settlements.rows[1].bid_id)).toBe(runnerUpBid);
      expect(settlements.rows[1].state).toBe('offered');
      expect(settlements.rows[1].attempt).toBe(2);
    }, 20_000);

    it('the cascade unwinds its bond re-hold when a settlement raced into the retry window', async () => {
      const realm = 'guard-h9-cascade-conflict';
      const seller = await seedAccount();
      const winner = await seedAccount();
      const runnerUp = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller, { status: 'settling', offerNext: true });
      const winnerBid = await seedBid(realm, listingId, winner, {
        amountCents: 900,
        bondReference: 'bond-ref-cc-winner',
      });
      await pool.query(`UPDATE woc_market_bids SET status = 'won' WHERE id = $1`, [winnerBid]);
      const runnerUpBid = await seedBid(realm, listingId, runnerUp, {
        amountCents: 800,
        status: 'outbid',
        bondState: 'held',
        bondReference: 'bond-ref-cc-runner-up',
      });
      // The winner's settlement failed and its window lapsed, but a second
      // open settlement raced into the freed index slot before the sweep
      // reached the listing (the 'failed' retry window is exactly where the
      // one-open-settlement index momentarily has no row).
      const failed = await seedSettlement(realm, listingId, winner, {
        bidId: winnerBid,
        deadlineAtMs: BASE_MS - MINUTE_MS,
      });
      await setSettlementState(failed.id, 'failed');
      const racer = await seedSettlement(realm, listingId, buyer);
      await makeService(realm).sweepPass();
      // The cascade picked the runner-up, its insert refused against the
      // racer, the won stamp rolled back, and the re-held bond went straight
      // back through the refund pipeline (terminal in the same pass).
      expect((await settlementRow(failed.id)).state).toBe('expired');
      expect(await bidRow(runnerUpBid)).toEqual({ status: 'outbid', bondState: 'refunded' });
      const offered = await pool.query(
        `SELECT id FROM woc_market_settlements WHERE listing_id = $1 AND state = 'offered'`,
        [listingId],
      );
      expect(offered.rows.map((r) => Number(r.id))).toEqual([racer.id]);
    }, 20_000);
  });

  // -------------------------------------------------------------------------
  // One sale row per listing
  // -------------------------------------------------------------------------

  describe('the sales table refuses a second sale for one listing', () => {
    async function saleArgs(realm: string, listingId: number, seller: number, buyer: number) {
      return {
        realm,
        listingId,
        itemId: 'crown_of_embers',
        item: { itemId: 'crown_of_embers', count: 1 },
        priceCents: 1000,
        amountBase: '1000000',
        sellerAccount: seller,
        buyerAccount: buyer,
        sellerName: 'SellerSale',
        buyerName: 'BuyerSale',
      };
    }

    it('a duplicate sale insert fails closed at the constraint', async () => {
      const realm = 'guard-sale-unique';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const args = await saleArgs(realm, listingId, seller, buyer);
      await marketDb.insertSale(args);
      await expect(marketDb.insertSale(args)).rejects.toMatchObject({ code: '23505' });
    });

    it('the boot repair voids a legacy duplicate sale instead of failing the boot', async () => {
      const realm = 'guard-repair-sales';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      // Two non-excluded rows for one listing were legal before the index;
      // re-applying the schema must keep the earliest and void the rest, not
      // die on the CREATE UNIQUE INDEX.
      await pool.query('DROP INDEX woc_market_sales_listing_once');
      const args = await saleArgs(realm, listingId, seller, buyer);
      const firstId = await marketDb.insertSale(args);
      const secondId = await marketDb.insertSale(args);
      await pool.query(schemaSql);
      const rows = await pool.query(
        `SELECT id, excluded FROM woc_market_sales WHERE listing_id = $1 ORDER BY id`,
        [listingId],
      );
      expect(rows.rows.map((r) => [Number(r.id), r.excluded])).toEqual([
        [firstId, false],
        [secondId, true],
      ]);
      const rebuilt = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'woc_market_sales_listing_once'`,
      );
      expect(rebuilt.rows).toHaveLength(1);
    }, 20_000);

    it('an operator-voided sale row admits its correction', async () => {
      const realm = 'guard-sale-excluded';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller);
      const args = await saleArgs(realm, listingId, seller, buyer);
      const firstId = await marketDb.insertSale(args);
      expect(await marketDb.setSaleExcluded(firstId, true)).toBe(true);
      const secondId = await marketDb.insertSale(args);
      expect(secondId).not.toBe(firstId);
      const rows = await pool.query(
        `SELECT excluded FROM woc_market_sales WHERE listing_id = $1 ORDER BY id`,
        [listingId],
      );
      expect(rows.rows.map((r) => r.excluded)).toEqual([true, false]);
      // Re-including the voided row while its correction stands refuses as a
      // typed miss, never a thrown 23505.
      expect(await marketDb.setSaleExcluded(firstId, false)).toBe(false);
      expect(await marketDb.setSaleExcluded(secondId, true)).toBe(true);
      expect(await marketDb.setSaleExcluded(firstId, false)).toBe(true);
    });
  });
});
