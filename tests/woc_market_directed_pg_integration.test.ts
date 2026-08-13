// Real-Postgres coverage for the $WOC Exchange DIRECTED rail: the agreed-item
// fingerprint, the settlement-window hold, the shared listing cap, the
// same-wallet self-deal guard, the non-payment strike and auto-close, and the
// accepted-offer converge arm. Interleaved transactions simulate the races;
// the disposable database boots through the REAL ensureSchema so every index
// and constraint under test is the one production gets.
//
// Gate: TEST_DATABASE_URL (an admin URL on the dev Postgres from npm run
// db:up). The suite creates and drops its own database and never touches the
// database the URL points at. Pattern: tests/woc_market_settlement_pg_integration.test.ts.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WocCustodyExtract, WocMarketCustody, WocMarketService } from '../server/woc_market';
import type { PgWocMarketDb } from '../server/woc_market_db';
import { itemCopyPin } from '../src/sim/item_copy_ref';
import type { CharacterState } from '../src/sim/sim';
import type { InvSlot } from '../src/sim/types';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const VERIFY_DB = 'wocc_woc_market_directed_verify';

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

describeDb('woc market directed rail against real Postgres', () => {
  let admin: Pool;
  let pool: Pool;
  let db: typeof import('../server/db');
  let marketDb: PgWocMarketDb;
  let marketMod: typeof import('../server/woc_market');
  let proxyMod: typeof import('../server/woc_market_proxy');
  let rulesMod: typeof import('../server/woc_market_rules');
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
  // the one-open-settlement index stays the authority)
  // -------------------------------------------------------------------------

  const SAVE_STATE = { questLog: [], questsDone: [], inventory: [] } as unknown as CharacterState;

  async function seedAccount(): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO accounts (username, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`woc-directed-fixture-${seq}`],
    );
    return Number(res.rows[0].id);
  }

  async function seedCharacter(realm: string, accountId: number, name?: string): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO characters (account_id, name, class, realm, level, state)
       VALUES ($1, $2, 'warrior', $3, 10, '{}'::jsonb) RETURNING id`,
      [accountId, name ?? `DirectedChar${seq}`, realm],
    );
    return Number(res.rows[0].id);
  }

  async function linkWallet(accountId: number, pubkey: string): Promise<void> {
    await pool.query(
      `INSERT INTO wallet_links (account_id, pubkey) VALUES ($1, $2)
       ON CONFLICT (account_id) DO UPDATE SET pubkey = EXCLUDED.pubkey`,
      [accountId, pubkey],
    );
  }

  async function unlinkWallet(accountId: number): Promise<void> {
    await pool.query(`DELETE FROM wallet_links WHERE account_id = $1`, [accountId]);
  }

  async function seedListing(
    realm: string,
    sellerAccount: number,
    over: {
      status?: string;
      endsAtMs?: number;
      buyNowCents?: number | null;
      directedBuyerAccount?: number | null;
      sellerWallet?: string;
    } = {},
  ): Promise<number> {
    seq++;
    const endsAtMs = over.endsAtMs ?? BASE_MS + 60 * MINUTE_MS;
    const res = await pool.query(
      `INSERT INTO woc_market_listings (
         realm, seller_account, seller_character, seller_name, seller_wallet,
         item, item_id, quality, format, start_cents, buy_now_cents,
         offer_next, status, ends_at, base_ends_at, directed_buyer_account
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'epic', 'buy_now', 500, $8,
         false, $9, to_timestamp($10 / 1000.0), to_timestamp($10 / 1000.0), $11
       ) RETURNING id`,
      [
        realm,
        sellerAccount,
        9000 + seq,
        `Seller${seq}`,
        over.sellerWallet ?? `wallet-seller-${seq}`,
        JSON.stringify({ itemId: 'amber_crimson_armor_plate', count: 1 }),
        'amber_crimson_armor_plate',
        over.buyNowCents === undefined ? 1000 : over.buyNowCents,
        over.status ?? 'active',
        endsAtMs,
        over.directedBuyerAccount ?? null,
      ],
    );
    return Number(res.rows[0].id);
  }

  async function listingRow(
    id: number,
  ): Promise<{ status: string; resolution: string | null; endsAtMs: number }> {
    const res = await pool.query(
      `SELECT status, resolution, (EXTRACT(EPOCH FROM ends_at) * 1000)::bigint AS ends_ms
         FROM woc_market_listings WHERE id = $1`,
      [id],
    );
    return {
      status: res.rows[0].status,
      resolution: res.rows[0].resolution ?? null,
      endsAtMs: Number(res.rows[0].ends_ms),
    };
  }

  async function strikeCount(account: number): Promise<number> {
    const res = await pool.query(`SELECT strikes FROM woc_market_strikes WHERE account_id = $1`, [
      account,
    ]);
    return res.rows[0] ? Number(res.rows[0].strikes) : 0;
  }

  /**
   * A service whose custody fake really executes the escrow job: extractCopy
   * answers from the per-character copy map (validating expectInstance like
   * the real extraction), runSerialized runs the job inline, and the lease is
   * skipped (leaseNonce undefined saves unfenced, matching the delivery
   * suite's unfenced arm).
   */
  function makeService(
    realm: string,
    opts: {
      wallets: Map<number, string | null>;
      copies?: Map<number, InvSlot>;
      nowMs?: () => number;
    },
  ): WocMarketService {
    const custody: WocMarketCustody = {
      runSerialized: async <T>(_characterId: number, job: () => Promise<T>) => await job(),
      ownsLiveCharacter: () => true,
      escrowSessionLost: () => {},
      extractCopy: (_account, characterId, ref): WocCustodyExtract => {
        const copy = opts.copies?.get(characterId);
        if (!copy || copy.itemId !== ref.itemId) return { ok: false, reason: 'stale_copy' };
        return {
          ok: true,
          pid: 100_000 + characterId,
          extracted: copy,
          characterName: `DirectedChar${characterId}`,
          save: { characterId, level: 10, state: SAVE_STATE, leaseNonce: undefined },
        };
      },
      grantCopy: () => {
        throw new Error('grant not exercised by this suite');
      },
      snapshotCopy: () => {
        throw new Error('snapshot not exercised by this suite');
      },
      restoreCopy: () => {},
      persistMailParcel: async () => {},
      hasParcel: () => false,
    };
    return new marketMod.WocMarketService({
      db: marketDb,
      economy: proxyMod.createDevWocMarketEconomy(opts.nowMs ?? (() => BASE_MS)),
      custody,
      verifiedWallet: async (account) => opts.wallets.get(account) ?? null,
      balanceTokens: async () => 1_000_000,
      config: {
        enabled: true,
        realm,
        policy: rulesMod.WOC_MARKET_RESTRICTED_POLICY,
        confirmingReviewMs: 6 * 3600 * 1000,
      },
      now: opts.nowMs ?? (() => BASE_MS),
    });
  }

  /** Drive one directed deal to the both-accepted escrow: buyer opens the
   *  offer naming the agreed copy, seller accepts naming theirs, buyer
   *  completes. Returns the final accept outcome. */
  async function acceptDirectedDeal(args: {
    realm: string;
    service: WocMarketService;
    buyer: number;
    buyerCharacter: number;
    sellerName: string;
    sellerCharacter: number;
    agreed: { itemId: string; instance?: InvSlot['instance']; craftedRecipeId?: string };
    acceptRef: { index: number; itemId: string; expectInstance?: InvSlot['instance'] | null };
    seller: number;
  }): Promise<
    | { ok: true; listing: { id: number; endsAtMs: number } | null }
    | { ok: false; reason: string }
    | { created: unknown }
  > {
    const created = await args.service.createDirectedOffer({
      account: args.buyer,
      characterId: args.buyerCharacter,
      sellerCharacterName: args.sellerName,
      usdCents: 1000,
      item: args.agreed,
    } as Parameters<WocMarketService['createDirectedOffer']>[0]);
    if (!created.ok) return created as { ok: false; reason: string };
    const offerId = (created as { ok: true; offer: { id: number } }).offer.id;
    const sellerSide = await args.service.acceptDirectedOffer(
      args.seller,
      offerId,
      {
        index: args.acceptRef.index,
        itemId: args.acceptRef.itemId,
        ...(args.acceptRef.expectInstance == null
          ? {}
          : { expectInstance: args.acceptRef.expectInstance }),
      },
      args.sellerCharacter,
    );
    if (!sellerSide.ok) return sellerSide as { ok: false; reason: string };
    const buyerSide = await args.service.acceptDirectedOffer(
      args.buyer,
      offerId,
      null,
      args.buyerCharacter,
    );
    return buyerSide as
      | { ok: true; listing: { id: number; endsAtMs: number } | null }
      | { ok: false; reason: string };
  }

  // -------------------------------------------------------------------------
  // H14: same-wallet self-deal (the relink dance) refuses in the claim SQL
  // -------------------------------------------------------------------------

  describe('same-wallet self-deal guard', () => {
    it('refuses a buy-now claim from an account now holding the listing seller wallet', async () => {
      const realm = 'directed-wallet-twin';
      const seller = await seedAccount();
      const twin = await seedAccount();
      // The listing recorded the seller wallet at creation; the seller then
      // unlinked it and the twin account linked the SAME pubkey (pubkey is
      // UNIQUE, so the twin is sequential, never concurrent).
      const listingId = await seedListing(realm, seller, { sellerWallet: 'wallet-twin-shared' });
      await linkWallet(twin, 'wallet-twin-shared');
      const claimed = await marketDb.claimBuyNowLock(
        realm,
        listingId,
        twin,
        BASE_MS,
        BASE_MS + 270_000,
      );
      expect(claimed).toBe('own_listing');
      // Positive control: a genuinely different wallet claims fine.
      const stranger = await seedAccount();
      await linkWallet(stranger, 'wallet-twin-distinct');
      const ok = await marketDb.claimBuyNowLock(
        realm,
        listingId,
        stranger,
        BASE_MS,
        BASE_MS + 270_000,
      );
      expect(typeof ok).toBe('object');
    });

    it('a claimer with NO wallet row never trips the twin guard', async () => {
      const realm = 'directed-wallet-null';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller, { sellerWallet: 'wallet-null-seller' });
      // Degenerate arm: the LISTING wallet is never null by DDL, but the
      // claimer-side read can be. A buyer with NO wallet row must not trip
      // the twin guard (the route refuses wallet_required upstream; the SQL
      // guard must simply not fire).
      await unlinkWallet(buyer);
      const claimed = await marketDb.claimBuyNowLock(
        realm,
        listingId,
        buyer,
        BASE_MS,
        BASE_MS + 270_000,
      );
      expect(typeof claimed).toBe('object');
    });
  });

  // -------------------------------------------------------------------------
  // H12: the directed hold is the settlement window, not the auction duration
  // -------------------------------------------------------------------------

  describe('directed hold and cap', () => {
    it('an accepted directed offer escrows for the settlement window, not 12 hours', async () => {
      const realm = 'directed-hold-window';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const sellerCharacter = await seedCharacter(realm, seller, `HoldSeller${seq}`);
      const sellerName = `HoldSeller${seq - 1}`;
      const buyerCharacter = await seedCharacter(realm, buyer);
      const copy: InvSlot = { itemId: 'amber_crimson_armor_plate', count: 1 };
      const service = makeService(realm, {
        wallets: new Map([
          [seller, 'wallet-hold-seller'],
          [buyer, 'wallet-hold-buyer'],
        ]),
        copies: new Map([[sellerCharacter, copy]]),
      });
      const out = await acceptDirectedDeal({
        realm,
        service,
        buyer,
        buyerCharacter,
        sellerName,
        sellerCharacter,
        seller,
        agreed: { itemId: 'amber_crimson_armor_plate' },
        acceptRef: { index: 0, itemId: 'amber_crimson_armor_plate' },
      });
      expect(out).toMatchObject({ ok: true });
      const listing = (out as { ok: true; listing: { id: number } }).listing;
      expect(listing).not.toBeNull();
      const row = await listingRow(listing.id);
      expect(row.endsAtMs - BASE_MS).toBe(rulesMod.WOC_MARKET_SETTLEMENT_WINDOW_SECONDS * 1000);
    });

    it('a directed acceptance refuses cap_reached when the seller already holds 12 live listings', async () => {
      const realm = 'directed-cap-blocks';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const sellerCharacter = await seedCharacter(realm, seller, `CapSeller${seq}`);
      const sellerName = `CapSeller${seq - 1}`;
      const buyerCharacter = await seedCharacter(realm, buyer);
      for (let i = 0; i < rulesMod.WOC_MARKET_MAX_ACTIVE_LISTINGS; i++) {
        await seedListing(realm, seller);
      }
      const copy: InvSlot = { itemId: 'amber_crimson_armor_plate', count: 1 };
      const service = makeService(realm, {
        wallets: new Map([
          [seller, 'wallet-cap-seller'],
          [buyer, 'wallet-cap-buyer'],
        ]),
        copies: new Map([[sellerCharacter, copy]]),
      });
      const out = await acceptDirectedDeal({
        realm,
        service,
        buyer,
        buyerCharacter,
        sellerName,
        sellerCharacter,
        seller,
        agreed: { itemId: 'amber_crimson_armor_plate' },
        acceptRef: { index: 0, itemId: 'amber_crimson_armor_plate' },
      });
      expect(out).toMatchObject({ ok: false, reason: 'cap_reached' });
    });

    it('directed listings count toward the cap in the authoritative in-transaction check', async () => {
      const realm = 'directed-cap-counts';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      for (let i = 0; i < rulesMod.WOC_MARKET_MAX_ACTIVE_LISTINGS; i++) {
        await seedListing(realm, seller, { directedBuyerAccount: buyer });
      }
      const out = await marketDb.escrowInsertListing(
        {
          characterId: await seedCharacter(realm, seller),
          level: 10,
          state: SAVE_STATE,
          leaseNonce: undefined,
        },
        {
          realm,
          sellerAccount: seller,
          sellerCharacter: 1,
          sellerName: 'CapCounter',
          sellerWallet: 'wallet-cap-counter',
          item: { itemId: 'amber_crimson_armor_plate', count: 1 },
          itemId: 'amber_crimson_armor_plate',
          quality: 'epic',
          params: {
            format: 'buy_now',
            startCents: 1000,
            reserveCents: null,
            buyNowCents: 1000,
            offerNext: false,
            durationHours: 12,
            directedBuyerAccount: null,
          },
          endsAtMs: BASE_MS + 60 * MINUTE_MS,
          directedOfferId: null,
        } as Parameters<PgWocMarketDb['escrowInsertListing']>[1],
      );
      expect(out).toMatchObject({ ok: false, reason: 'cap_reached' });
    });
  });

  // -------------------------------------------------------------------------
  // H12: non-payment consequences (strike + auto-close + return)
  // -------------------------------------------------------------------------

  describe('directed non-payment', () => {
    it('a directed settlement that expires unpaid strikes the buyer AND auto-closes the listing', async () => {
      const realm = 'directed-autoclose';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const buyerCharacter = await seedCharacter(realm, buyer);
      const listingId = await seedListing(realm, seller, { directedBuyerAccount: buyer });
      const inserted = await marketDb.insertSettlement({
        listingId,
        bidId: null,
        attempt: 0,
        buyerAccount: buyer,
        buyerCharacter,
        buyerName: 'DirectedBuyer',
        buyerWallet: 'wallet-autoclose-buyer',
        amountCents: 1000,
        deadlineAtMs: BASE_MS - MINUTE_MS,
        nowMs: BASE_MS - 11 * MINUTE_MS,
      });
      expect(typeof inserted).toBe('object');
      const service = makeService(realm, { wallets: new Map() });
      await service.sweepPass();
      expect(await strikeCount(buyer)).toBe(1);
      const row = await listingRow(listingId);
      expect(row.status).toBe('closed');
      expect(row.resolution).toBe('unsettled');
    });

    it('a directed listing whose buyer never claims closes struck at hold expiry, exactly once', async () => {
      const realm = 'directed-neverclaim';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller, {
        directedBuyerAccount: buyer,
        endsAtMs: BASE_MS - MINUTE_MS,
      });
      const service = makeService(realm, { wallets: new Map() });
      await service.sweepPass();
      expect(await strikeCount(buyer)).toBe(1);
      const row = await listingRow(listingId);
      expect(row.status).toBe('closed');
      // A second pass over durable state must not strike again.
      await service.sweepPass();
      expect(await strikeCount(buyer)).toBe(1);
    });

    it('a directed listing with a FAILED settlement reaching hold expiry produces exactly one strike', async () => {
      const realm = 'directed-onestrike';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const buyerCharacter = await seedCharacter(realm, buyer);
      const listingId = await seedListing(realm, seller, {
        directedBuyerAccount: buyer,
        endsAtMs: BASE_MS - MINUTE_MS,
      });
      const inserted = await marketDb.insertSettlement({
        listingId,
        bidId: null,
        attempt: 0,
        buyerAccount: buyer,
        buyerCharacter,
        buyerName: 'DirectedBuyer',
        buyerWallet: 'wallet-onestrike-buyer',
        amountCents: 1000,
        deadlineAtMs: BASE_MS - MINUTE_MS,
        nowMs: BASE_MS - 11 * MINUTE_MS,
      });
      expect(typeof inserted).toBe('object');
      await pool.query(
        `UPDATE woc_market_settlements SET state = 'failed', fail_reason = 'confirm_failed' WHERE id = $1`,
        [(inserted as { id: number }).id],
      );
      const service = makeService(realm, { wallets: new Map() });
      await service.sweepPass();
      await service.sweepPass();
      expect(await strikeCount(buyer)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Judgment (a): the atomic stamp and the accepted-offer converge arm
  // -------------------------------------------------------------------------

  async function seedOffer(
    realm: string,
    sellerAccount: number,
    buyerAccount: number,
    over: {
      status?: string;
      listingId?: number | null;
      expiresAtMs?: number;
      updatedAtMs?: number;
      buyerAccepted?: boolean;
      sellerAccepted?: boolean;
    } = {},
  ): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO woc_market_directed_offers (
         realm, seller_account, seller_character, seller_name, buyer_account,
         buyer_name, usd_cents, status, listing_id, expires_at, updated_at,
         buyer_accepted, seller_accepted, item_id, item_pin
       ) VALUES ($1, $2, $3, $4, $5, $6, 1000, $7, $8,
                 to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0), $11, $12,
                 'amber_crimson_armor_plate', 'pin')
       RETURNING id`,
      [
        realm,
        sellerAccount,
        9000 + seq,
        `OfferSeller${seq}`,
        buyerAccount,
        `OfferBuyer${seq}`,
        over.status ?? 'pending',
        over.listingId ?? null,
        over.expiresAtMs ?? BASE_MS + 10 * MINUTE_MS,
        over.updatedAtMs ?? BASE_MS - 10 * MINUTE_MS,
        over.buyerAccepted ?? false,
        over.sellerAccepted ?? false,
      ],
    );
    return Number(res.rows[0].id);
  }

  async function offerRow(id: number): Promise<{ status: string; listingId: number | null }> {
    const res = await pool.query(
      `SELECT status, listing_id FROM woc_market_directed_offers WHERE id = $1`,
      [id],
    );
    return {
      status: res.rows[0].status,
      listingId: res.rows[0].listing_id === null ? null : Number(res.rows[0].listing_id),
    };
  }

  describe('the accepted-offer converge arm, in real SQL', () => {
    it('reopens an aged unstamped acceptance, expires a lapsed one, and skips a stamped one', async () => {
      const realm = 'directed-converge';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller, { directedBuyerAccount: buyer });
      const reopenable = await seedOffer(realm, seller, buyer, {
        status: 'accepted',
        buyerAccepted: true,
        sellerAccepted: true,
      });
      const lapsed = await seedOffer(realm, seller, buyer, {
        status: 'accepted',
        expiresAtMs: BASE_MS - MINUTE_MS,
        buyerAccepted: true,
        sellerAccepted: true,
      });
      const stamped = await seedOffer(realm, seller, buyer, {
        status: 'accepted',
        listingId,
        buyerAccepted: true,
        sellerAccepted: true,
      });
      const service = makeService(realm, { wallets: new Map() });
      const stats = await service.sweepPass();
      expect(stats?.convergedOffers).toBe(2);
      expect(await offerRow(reopenable)).toEqual({ status: 'pending', listingId: null });
      expect(await offerRow(lapsed)).toEqual({ status: 'expired', listingId: null });
      expect(await offerRow(stamped)).toEqual({ status: 'accepted', listingId });
    });

    it('keeps a YOUNG unstamped acceptance out of the batch (the in-flight guard)', async () => {
      const realm = 'directed-converge-young';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const young = await seedOffer(realm, seller, buyer, {
        status: 'accepted',
        updatedAtMs: BASE_MS - 60_000,
        buyerAccepted: true,
        sellerAccepted: true,
      });
      const service = makeService(realm, { wallets: new Map() });
      const stats = await service.sweepPass();
      expect(stats?.convergedOffers).toBe(0);
      expect((await offerRow(young)).status).toBe('accepted');
    });

    it('leaves a row OLDER than the max age alone (the prune-fallout guard)', async () => {
      // Past the upper window bound the accepted-unstamped shape stops being
      // rollback evidence (the listings prune's ON DELETE SET NULL produces
      // it for completed deals); the arm must not touch it.
      const realm = 'directed-converge-ancient';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const ancient = await seedOffer(realm, seller, buyer, {
        status: 'accepted',
        updatedAtMs: BASE_MS - 25 * 3600 * 1000,
        expiresAtMs: BASE_MS - 24 * 3600 * 1000,
        buyerAccepted: true,
        sellerAccepted: true,
      });
      const service = makeService(realm, { wallets: new Map() });
      const stats = await service.sweepPass();
      expect(stats?.convergedOffers).toBe(0);
      expect((await offerRow(ancient)).status).toBe('accepted');
    });

    it('never relabels a COMPLETED deal whose listing the retention prune deleted', async () => {
      // The end-to-end F3 regression: a stamped offer survives its pruned
      // listing with listing_id SET-NULLed by the FK, and the converge arm
      // must leave its status and updated_at untouched.
      const realm = 'directed-converge-pruned';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const listingId = await seedListing(realm, seller, {
        directedBuyerAccount: buyer,
        status: 'closed',
      });
      await pool.query(
        `UPDATE woc_market_listings SET item_disposed = true, resolution = 'sold' WHERE id = $1`,
        [listingId],
      );
      const done = await seedOffer(realm, seller, buyer, {
        status: 'accepted',
        listingId,
        // A completed deal from months ago: outside the converge window.
        updatedAtMs: BASE_MS - 30 * 24 * 3600 * 1000,
        expiresAtMs: BASE_MS - 30 * 24 * 3600 * 1000,
        buyerAccepted: true,
        sellerAccepted: true,
      });
      // The prune's FK effect, applied directly (the prune itself keys on the
      // real wall clock while this suite's fixtures ride BASE_MS).
      await pool.query(`DELETE FROM woc_market_listings WHERE id = $1`, [listingId]);
      expect((await offerRow(done)).listingId, 'the FK SET-NULLed the stamp').toBeNull();
      const before = await pool.query(
        `SELECT updated_at FROM woc_market_directed_offers WHERE id = $1`,
        [done],
      );
      const service = makeService(realm, { wallets: new Map() });
      const stats = await service.sweepPass();
      expect(stats?.convergedOffers).toBe(0);
      expect((await offerRow(done)).status).toBe('accepted');
      const after = await pool.query(
        `SELECT updated_at FROM woc_market_directed_offers WHERE id = $1`,
        [done],
      );
      expect(after.rows[0].updated_at).toEqual(before.rows[0].updated_at);
    });

    it('bounds a pair to ONE pending offer at the database (the unique index)', async () => {
      const realm = 'directed-pair-bound';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const first = await marketDb.insertDirectedOffer({
        realm,
        sellerAccount: seller,
        sellerCharacter: 1,
        sellerName: 'PairSeller',
        buyerAccount: buyer,
        buyerName: 'PairBuyer',
        usdCents: 1000,
        expiresAtMs: BASE_MS + 10 * MINUTE_MS,
        itemId: 'amber_crimson_armor_plate',
        itemPin: 'p'.repeat(64),
      });
      expect(typeof first).toBe('object');
      const second = await marketDb.insertDirectedOffer({
        realm,
        sellerAccount: seller,
        sellerCharacter: 1,
        sellerName: 'PairSeller',
        buyerAccount: buyer,
        buyerName: 'PairBuyer',
        usdCents: 2000,
        expiresAtMs: BASE_MS + 10 * MINUTE_MS,
        itemId: 'amber_crimson_armor_plate',
        itemPin: 'p'.repeat(64),
      });
      expect(second, 'the unique index answers typed').toBe('offer_pending');
    });

    it('a reopen NO-OPS while a fresh pending offer occupies the pair, then lands once it frees', async () => {
      // The conditional UPDATE's own behavior in real SQL (the service-level
      // arc is proven against the fake; this is what keeps the fake honest):
      // a blocked reopen touches nothing and reports so, a freed pair
      // reopens, and the CAS refuses the now-pending row on a re-call.
      const realm = 'directed-reopen-pair';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const stuck = await seedOffer(realm, seller, buyer, {
        status: 'accepted',
        buyerAccepted: true,
        sellerAccepted: true,
      });
      const fresh = await seedOffer(realm, seller, buyer, { status: 'pending' });
      expect(await marketDb.reopenDirectedOffer(realm, stuck), 'the occupied pair blocks').toBe(
        false,
      );
      expect((await offerRow(stuck)).status).toBe('accepted');
      await pool.query(`UPDATE woc_market_directed_offers SET status = 'expired' WHERE id = $1`, [
        fresh,
      ]);
      expect(await marketDb.reopenDirectedOffer(realm, stuck), 'the freed pair reopens').toBe(true);
      expect((await offerRow(stuck)).status).toBe('pending');
      expect(await marketDb.reopenDirectedOffer(realm, stuck), 'the CAS refuses pending').toBe(
        false,
      );
    });
  });

  describe('the offer-expiry sweep against a concurrent stamp, in real SQL', () => {
    it('SKIP LOCKED walks past a row a concurrent transaction holds', async () => {
      // The OUTER status qual (the EvalPlanQual guard beside the escrow
      // stamp) is deliberately NOT exercised here: the subselect's own
      // locked re-check shares the predicate, so only a genuine snapshot
      // race can reach it, and no test rig can schedule one. Its presence
      // is pinned structurally in woc_market_directed_sql.test.ts.
      const realm = 'directed-expiry-race';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const buyerTwo = await seedAccount();
      // Both rows are pending and past their TTL (distinct buyers: the
      // pair-pending unique index allows one live deal per pair): one gets
      // locked by a concurrent transaction (the escrow stamp holding the
      // row), the other is free. The sweep must expire ONLY the free one,
      // without blocking.
      const held = await seedOffer(realm, seller, buyer, {
        expiresAtMs: BASE_MS - MINUTE_MS,
      });
      const free = await seedOffer(realm, seller, buyerTwo, {
        expiresAtMs: BASE_MS - MINUTE_MS,
      });
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN');
        await holder.query(`SELECT 1 FROM woc_market_directed_offers WHERE id = $1 FOR UPDATE`, [
          held,
        ]);
        const expired = await marketDb.expireDueDirectedOffers(realm, BASE_MS, 25);
        expect(expired).toBe(1);
        expect((await offerRow(free)).status).toBe('expired');
        expect((await offerRow(held)).status).toBe('pending');
      } finally {
        await holder.query('ROLLBACK').catch(() => {});
        holder.release();
      }
    });
  });

  describe('concurrent escrow and offer writers, interleave smoke', () => {
    // Honesty note: three of the four concurrent participants are
    // single-statement autocommit writes that cannot hold one lock while
    // waiting on another, so this CANNOT deadlock by construction; the
    // lock-order safety argument is static (no transaction takes
    // offers-then-listings since the post-hoc stamp hop was deleted). What
    // this run does prove live: the stamp CAS, the racing expiry, and the
    // sibling writers compose without errors or lost writes.
    it('the stamp, the expiry, and the sibling offer writers compose cleanly under concurrency', async () => {
      const realm = 'directed-deadlock';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const characterId = await seedCharacter(realm, seller);
      for (let i = 0; i < 5; i++) {
        const offerId = await seedOffer(realm, seller, buyer, {
          status: 'accepted',
          buyerAccepted: true,
          sellerAccepted: true,
        });
        // A FRESH buyer each round: the pair-pending unique index binds one
        // live deal per pair, and whether the racing expiry below resolves
        // the sibling before the next round is exactly the nondeterminism
        // this smoke run exists to exercise.
        const sibling = await seedOffer(realm, seller, await seedAccount(), {});
        const results = await Promise.allSettled([
          marketDb.escrowInsertListing(
            { characterId, level: 10, state: SAVE_STATE, leaseNonce: undefined },
            {
              realm,
              sellerAccount: seller,
              sellerCharacter: characterId,
              sellerName: `Deadlock${i}`,
              sellerWallet: `wallet-deadlock-${i}`,
              item: { itemId: 'amber_crimson_armor_plate', count: 1 },
              itemId: 'amber_crimson_armor_plate',
              quality: 'epic',
              params: {
                format: 'buy_now',
                startCents: 1000,
                reserveCents: null,
                buyNowCents: 1000,
                offerNext: false,
                durationHours: 12,
                directedBuyerAccount: buyer,
              },
              endsAtMs: BASE_MS + 10 * MINUTE_MS,
              directedOfferId: offerId,
            },
          ),
          marketDb.expireDueDirectedOffers(realm, BASE_MS + 20 * MINUTE_MS, 25),
          marketDb.acceptDirectedOfferSide(realm, sibling, 'buyer', null),
          marketDb.reopenDirectedOffer(realm, sibling),
        ]);
        for (const r of results) {
          if (r.status === 'rejected') {
            expect((r.reason as { code?: string }).code, String(r.reason)).not.toBe('40P01');
            throw r.reason;
          }
        }
        // The escrow either landed with its stamp or refused typed; a
        // deadlock would have surfaced as a rejection above.
        const escrow = results[0] as PromiseFulfilledResult<
          Awaited<ReturnType<PgWocMarketDb['escrowInsertListing']>>
        >;
        if (escrow.value.ok) {
          expect((await offerRow(offerId)).listingId).toBe(escrow.value.id);
          // Free the cap slot for the next iteration.
          await pool.query(
            `UPDATE woc_market_listings SET status = 'closed', resolution = 'cancelled' WHERE id = $1`,
            [escrow.value.id],
          );
        }
      }
    });
  });

  describe('resolved-offer retention, in real SQL', () => {
    it('prunes resolved rows past the window, keeps pending rows forever', async () => {
      const realm = 'directed-prune';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      // The retention cutoff is the DATABASE clock (now() minus the window),
      // unlike every other fixture stamp in this suite, so these rows date
      // relative to the real wall clock on purpose.
      const realNowMs = Date.now();
      const old = realNowMs - 200 * 24 * 3600 * 1000;
      const resolvedOld = await seedOffer(realm, seller, buyer, {
        status: 'declined',
        updatedAtMs: old,
      });
      const pendingOld = await seedOffer(realm, seller, buyer, { updatedAtMs: old });
      const resolvedFresh = await seedOffer(realm, seller, buyer, {
        status: 'expired',
        updatedAtMs: realNowMs - MINUTE_MS,
      });
      const marketDbMod = await import('../server/woc_market_db');
      // The retention clock is now(); the seeded rows are dated far behind it.
      const pruned = await marketDbMod.pruneResolvedWocOffersBatch(pool, 180, 100);
      expect(pruned).toBeGreaterThanOrEqual(1);
      const remaining = await pool.query(
        `SELECT id FROM woc_market_directed_offers WHERE realm = $1 ORDER BY id`,
        [realm],
      );
      const ids = remaining.rows.map((r) => Number(r.id));
      expect(ids).not.toContain(resolvedOld);
      expect(ids).toContain(pendingOld);
      expect(ids).toContain(resolvedFresh);
    });
  });

  // -------------------------------------------------------------------------
  // H10: the agreed-item fingerprint refuses bait-and-switch at acceptance
  // -------------------------------------------------------------------------

  describe('agreed-item fingerprint', () => {
    it('accepting with a re-rolled instance of the agreed item id refuses item_mismatch', async () => {
      const realm = 'directed-bait-reroll';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const sellerCharacter = await seedCharacter(realm, seller, `BaitSeller${seq}`);
      const sellerName = `BaitSeller${seq - 1}`;
      const buyerCharacter = await seedCharacter(realm, buyer);
      // The buyer agreed to the +9 roll; the seller's bags now hold a +3.
      const agreedInstance = { rolled: { stats: { str: 9 } } };
      const heldCopy: InvSlot = {
        itemId: 'amber_crimson_armor_plate',
        count: 1,
        instance: { rolled: { stats: { str: 3 } } } as InvSlot['instance'],
      };
      const service = makeService(realm, {
        wallets: new Map([
          [seller, 'wallet-bait-seller'],
          [buyer, 'wallet-bait-buyer'],
        ]),
        copies: new Map([[sellerCharacter, heldCopy]]),
      });
      const out = await acceptDirectedDeal({
        realm,
        service,
        buyer,
        buyerCharacter,
        sellerName,
        sellerCharacter,
        seller,
        agreed: {
          itemId: 'amber_crimson_armor_plate',
          instance: agreedInstance as InvSlot['instance'],
        },
        acceptRef: {
          index: 0,
          itemId: 'amber_crimson_armor_plate',
          expectInstance: heldCopy.instance,
        },
      });
      expect(out).toMatchObject({ ok: false, reason: 'item_mismatch' });
      // The pin the guard compares against is the canonical copy pin.
      expect(
        itemCopyPin({ itemId: 'amber_crimson_armor_plate', count: 1, instance: heldCopy.instance }),
      ).not.toBe(
        itemCopyPin({
          itemId: 'amber_crimson_armor_plate',
          count: 1,
          instance: agreedInstance as InvSlot['instance'],
        }),
      );
    });
  });
});
