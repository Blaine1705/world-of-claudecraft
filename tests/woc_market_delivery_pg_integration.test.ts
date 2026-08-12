// Real-Postgres coverage for the $WOC Exchange delivery finalization: the
// exactly-once story under every crash point. The matrix seeds the durable
// residue each crash between two delivery steps would leave (a claim with no
// parcel, a parcel with no booking, a booking with no close tail, a delivered
// settlement with an open listing), then runs the REAL sweep and asserts the
// converged end state: exactly one parcel, exactly one sale row, the listing
// closed and disposed once, every bond flipped once. Two-connection
// interleaves pin the finalize transaction's lock participation (a snapshot
// predicate alone provably cannot refuse a concurrent closer; see the guard
// suite beside this one).
//
// Gate: TEST_DATABASE_URL (an admin URL on the dev Postgres from npm run
// db:up). The suite creates and drops its own database and never touches the
// database the URL points at. Pattern: tests/woc_market_settlement_pg_integration.test.ts.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  WocCustodyGrant,
  WocMarketCustody,
  WocMarketService,
  WocSettlementRow,
} from '../server/woc_market';
import type { PgWocMarketDb } from '../server/woc_market_db';
import type { InvSlot } from '../src/sim/types';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const VERIFY_DB = 'wocc_woc_market_delivery_verify';

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

/** WocMarketCustody for the MAIL rail: an in-memory parcel book with the same
 *  custodyRef dedupe the live post office applies (the direct-grant rail has
 *  its own fake-db suite and the atomic save-and-book tests below). */
class ParcelCustody implements WocMarketCustody {
  readonly parcels: { recipientKey: string; letter: string; custodyRef: string }[] = [];
  /** Every ATTEMPT, failures and dedupes included. */
  readonly persistCalls: string[] = [];

  extractCopy(): never {
    throw new Error('escrow extraction is not exercised by this suite');
  }
  grantCopy(): WocCustodyGrant {
    // Every buyer reads as offline, so delivery always takes the mail rail.
    return { ok: false, reason: 'offline' };
  }
  snapshotCopy(): WocCustodyGrant {
    return { ok: false, reason: 'offline' };
  }
  restoreCopy(): void {}
  async persistMailParcel(
    recipient: { key: string; name: string },
    letter: 'delivery' | 'return' | 'sold_notice',
    _items: InvSlot[],
    custodyRef: string,
  ): Promise<void> {
    this.persistCalls.push(custodyRef);
    if (this.parcels.some((p) => p.custodyRef === custodyRef)) return;
    this.parcels.push({ recipientKey: recipient.key, letter, custodyRef });
  }

  hasParcel(custodyRef: string): boolean {
    return this.parcels.some((p) => p.custodyRef === custodyRef);
  }

  /** The buyer collects the attachment and deletes the emptied letter: the
   *  in-book marker is destroyed, exactly like production. */
  collect(custodyRef: string): void {
    const i = this.parcels.findIndex((p) => p.custodyRef === custodyRef);
    if (i >= 0) this.parcels.splice(i, 1);
  }
}

describeDb('woc market delivery finalization against real Postgres', () => {
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
    // production gets (the sale-dedupe index above all).
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

  async function seedAccount(): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO accounts (username, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`woc-delivery-fixture-${seq}`],
    );
    return Number(res.rows[0].id);
  }

  /** A real characters row, so deliveryTarget resolves the buyer. */
  async function seedCharacter(realm: string, accountId: number): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO characters (account_id, name, class, realm, level, state)
       VALUES ($1, $2, 'warrior', $3, 10, '{}'::jsonb) RETURNING id`,
      [accountId, `DeliveryChar${seq}`, realm],
    );
    return Number(res.rows[0].id);
  }

  async function seedListing(
    realm: string,
    sellerAccount: number,
    over: { status?: string; itemDisposed?: boolean } = {},
  ): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO woc_market_listings (
         realm, seller_account, seller_character, seller_name, seller_wallet,
         item, item_id, quality, format, start_cents, buy_now_cents,
         offer_next, status, item_disposed, ends_at, base_ends_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'epic', 'auction_buy_now', 500, 1000,
         false, $8, $9, to_timestamp($10 / 1000.0), to_timestamp($10 / 1000.0)
       ) RETURNING id`,
      [
        realm,
        sellerAccount,
        9000 + seq,
        `Seller${seq}`,
        `wallet-seller-${seq}`,
        JSON.stringify({ itemId: 'crown_of_embers', count: 1 }),
        'crown_of_embers',
        over.status ?? 'settling',
        over.itemDisposed ?? false,
        BASE_MS + 60 * MINUTE_MS,
      ],
    );
    return Number(res.rows[0].id);
  }

  async function seedBid(
    realm: string,
    listingId: number,
    account: number,
    over: { status?: string; bondState?: string } = {},
  ): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO woc_market_bids (
         listing_id, realm, account, character_id, character_name, wallet,
         amount_cents, status, bond_cents, bond_state, placed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 700, $7, 70, $8, to_timestamp($9 / 1000.0))
       RETURNING id`,
      [
        listingId,
        realm,
        account,
        8000 + seq,
        `Bidder${seq}`,
        `wallet-bidder-${seq}`,
        over.status ?? 'active',
        over.bondState ?? 'held',
        BASE_MS - 10 * MINUTE_MS,
      ],
    );
    return Number(res.rows[0].id);
  }

  async function seedSettlement(
    listingId: number,
    buyerAccount: number,
    buyerCharacter: number,
    over: { state?: string; bidId?: number | null } = {},
  ): Promise<WocSettlementRow> {
    const out = await marketDb.insertSettlement({
      listingId,
      bidId: over.bidId ?? null,
      attempt: over.bidId ? 1 : 0,
      buyerAccount,
      buyerCharacter,
      buyerName: `Buyer${seq}`,
      buyerWallet: `wallet-buyer-${seq}`,
      amountCents: 1000,
      deadlineAtMs: BASE_MS + 15 * MINUTE_MS,
      nowMs: BASE_MS,
    });
    if (typeof out === 'string') throw new Error(`fixture settlement refused: ${out}`);
    if (over.state && over.state !== 'offered') {
      await pool.query(
        `UPDATE woc_market_settlements SET state = $2, updated_at = now() WHERE id = $1`,
        [out.id, over.state],
      );
    }
    return out;
  }

  function makeService(realm: string, custody: ParcelCustody): WocMarketService {
    return new marketMod.WocMarketService({
      db: marketDb,
      economy: proxyMod.createDevWocMarketEconomy(() => BASE_MS),
      custody,
      verifiedWallet: async () => 'wallet-fixture',
      balanceTokens: async () => 1_000_000,
      config: { enabled: true, realm, policy: rulesMod.WOC_MARKET_RESTRICTED_POLICY },
      now: () => BASE_MS,
      // The matrix asserts convergence; an arm failure must fail the test
      // loudly rather than score a quiet zero.
      onSweepError: (arm, err) => {
        throw new Error(`sweep arm ${arm} failed: ${String(err)}`);
      },
    });
  }

  /** The full delivered end state, asserted after every crash point. */
  async function expectDeliveredExactlyOnce(opts: {
    realm: string;
    listingId: number;
    settlementId: number;
    custody: ParcelCustody;
    custodyRef: string;
    parcels: number;
    winnerBidId?: number;
    loserBidId?: number;
  }): Promise<void> {
    const listing = await pool.query(
      `SELECT status, resolution, item_disposed FROM woc_market_listings WHERE id = $1`,
      [opts.listingId],
    );
    expect(listing.rows[0]).toEqual({
      status: 'closed',
      resolution: 'sold',
      item_disposed: true,
    });
    const settlement = await pool.query(`SELECT state FROM woc_market_settlements WHERE id = $1`, [
      opts.settlementId,
    ]);
    expect(settlement.rows[0].state).toBe('delivered');
    const sales = await pool.query(
      `SELECT count(*)::int AS n FROM woc_market_sales WHERE listing_id = $1 AND excluded = false`,
      [opts.listingId],
    );
    expect(sales.rows[0].n, 'exactly one sale row').toBe(1);
    const claim = await pool.query(
      `SELECT booked_at FROM woc_market_custody_claims WHERE custody_ref = $1`,
      [opts.custodyRef],
    );
    expect(claim.rows[0]?.booked_at, 'the claim is booked').not.toBeNull();
    expect(
      opts.custody.parcels.filter((p) => p.custodyRef === opts.custodyRef),
      'exactly the expected parcel count',
    ).toHaveLength(opts.parcels);
    // Bond invariants that survive the SAME pass's bond arm (which resolves a
    // reference-less refund_due to 'void' right after the finalize flips it):
    // never stranded 'held', never forfeited. The precise refund_due flip is
    // pinned by the direct-finalize interleave tests, where no bond arm runs.
    if (opts.winnerBidId !== undefined) {
      const winner = await pool.query(
        `SELECT status, bond_state FROM woc_market_bids WHERE id = $1`,
        [opts.winnerBidId],
      );
      expect(winner.rows[0].status).toBe('won');
      expect(['refund_due', 'refunded', 'void']).toContain(winner.rows[0].bond_state);
    }
    if (opts.loserBidId !== undefined) {
      const loser = await pool.query(
        `SELECT status, bond_state FROM woc_market_bids WHERE id = $1`,
        [opts.loserBidId],
      );
      expect(loser.rows[0].status).toBe('cancelled');
      expect(['refund_due', 'refunded', 'void']).toContain(loser.rows[0].bond_state);
    }
  }

  /** Seed the standard delivery scene: listing + buyer character + winner and
   *  loser bids + a settlement in the given state. */
  async function seedScene(
    realm: string,
    state: string,
  ): Promise<{
    listingId: number;
    settlement: WocSettlementRow;
    buyerCharacter: number;
    winnerBidId: number;
    loserBidId: number;
    custodyRef: string;
  }> {
    const seller = await seedAccount();
    const buyer = await seedAccount();
    const buyerCharacter = await seedCharacter(realm, buyer);
    const listingId = await seedListing(realm, seller);
    const winnerBidId = await seedBid(realm, listingId, buyer, {
      status: 'won',
      bondState: 'held',
    });
    const loserBidId = await seedBid(realm, listingId, await seedAccount(), {
      status: 'active',
      bondState: 'held',
    });
    const settlement = await seedSettlement(listingId, buyer, buyerCharacter, {
      state,
      bidId: winnerBidId,
    });
    return {
      listingId,
      settlement,
      buyerCharacter,
      winnerBidId,
      loserBidId,
      custodyRef: rulesMod.settlementCustodyRef(settlement.id),
    };
  }

  // -------------------------------------------------------------------------
  // The crash-point matrix: seed each residue, run the sweep, assert the one
  // converged end state.
  // -------------------------------------------------------------------------

  describe('delivery crash-point matrix', () => {
    it('C0: a confirmed settlement delivers end to end, and a re-run changes nothing', async () => {
      const realm = 'delivery-c0';
      const scene = await seedScene(realm, 'confirmed');
      const custody = new ParcelCustody();
      const service = makeService(realm, custody);
      await service.sweepPass();
      await expectDeliveredExactlyOnce({
        realm,
        listingId: scene.listingId,
        settlementId: scene.settlement.id,
        custody,
        custodyRef: scene.custodyRef,
        parcels: 1,
        winnerBidId: scene.winnerBidId,
        loserBidId: scene.loserBidId,
      });
      // Convergence is idempotent: the whole sweep again, same end state.
      await service.sweepPass();
      await expectDeliveredExactlyOnce({
        realm,
        listingId: scene.listingId,
        settlementId: scene.settlement.id,
        custody,
        custodyRef: scene.custodyRef,
        parcels: 1,
        winnerBidId: scene.winnerBidId,
        loserBidId: scene.loserBidId,
      });
    }, 20_000);

    it('C1: killed after the delivering claim, before the custody claim', async () => {
      const realm = 'delivery-c1';
      const scene = await seedScene(realm, 'delivering');
      const custody = new ParcelCustody();
      await makeService(realm, custody).sweepPass();
      await expectDeliveredExactlyOnce({
        realm,
        listingId: scene.listingId,
        settlementId: scene.settlement.id,
        custody,
        custodyRef: scene.custodyRef,
        parcels: 1,
        winnerBidId: scene.winnerBidId,
        loserBidId: scene.loserBidId,
      });
    }, 20_000);

    it('C2a: a bare claim with no rail intent PARKS: unattributable, never mailed', async () => {
      // The claim-then-die residue, and every legacy row from before the
      // intent columns. The ORIGINAL code adopted it as booked and advanced
      // with the item destroyed; a blind mail resume risks the second copy
      // when the ref belonged to the other rail. Neither is provable: park.
      const realm = 'delivery-c2a';
      const scene = await seedScene(realm, 'delivering');
      expect(await marketDb.claimCustodyRef(realm, scene.custodyRef)).toBe(true);
      const custody = new ParcelCustody();
      await makeService(realm, custody).sweepPass();
      expect(custody.parcels, 'nothing mailed').toHaveLength(0);
      const after = await pool.query(`SELECT state FROM woc_market_settlements WHERE id = $1`, [
        scene.settlement.id,
      ]);
      expect(after.rows[0].state, 'held visibly').toBe('delivering');
      const readout = await marketDb.stuckCustodyReadout(realm, Date.now() + MINUTE_MS, 10, 1000);
      expect(readout.unbookedClaims.count).toBe(1);
      expect(readout.unbookedClaims.sample[0]?.mailIntent).toBe(false);
    }, 20_000);

    it('C2b: killed between the mail intent and the write PARKS (parcel absent)', async () => {
      // Intent stamped, parcel never became durable: absence cannot be told
      // apart from collected-and-deleted, so the resume refuses to re-mail.
      const realm = 'delivery-c2b';
      const scene = await seedScene(realm, 'delivering');
      expect(await marketDb.claimCustodyRef(realm, scene.custodyRef)).toBe(true);
      expect(await marketDb.markCustodyMailIntent(scene.custodyRef)).toBe(true);
      const custody = new ParcelCustody();
      await makeService(realm, custody).sweepPass();
      expect(custody.parcels, 'no blind re-mail').toHaveLength(0);
      const after = await pool.query(`SELECT state FROM woc_market_settlements WHERE id = $1`, [
        scene.settlement.id,
      ]);
      expect(after.rows[0].state).toBe('delivering');
    }, 20_000);

    it('C3: killed between the mail write and the booking RESUMES (parcel present)', async () => {
      // The provable resume: intent stamped AND the parcel still in the book.
      // The re-run dedupes on the ref (one parcel) and completes the booking.
      const realm = 'delivery-c3';
      const scene = await seedScene(realm, 'delivering');
      expect(await marketDb.claimCustodyRef(realm, scene.custodyRef)).toBe(true);
      expect(await marketDb.markCustodyMailIntent(scene.custodyRef)).toBe(true);
      const custody = new ParcelCustody();
      await custody.persistMailParcel(
        { key: String(scene.buyerCharacter), name: 'Buyer' },
        'delivery',
        [],
        scene.custodyRef,
      );
      await makeService(realm, custody).sweepPass();
      await expectDeliveredExactlyOnce({
        realm,
        listingId: scene.listingId,
        settlementId: scene.settlement.id,
        custody,
        custodyRef: scene.custodyRef,
        parcels: 1,
        winnerBidId: scene.winnerBidId,
        loserBidId: scene.loserBidId,
      });
    }, 20_000);

    it('C3b: the collected-and-deleted letter PARKS: never a second copy', async () => {
      // The dupe the durable mail intent exists to stop: parcel written and
      // collected, letter deleted, booking lost. The in-book marker is gone,
      // so a blind resume would mail copy two; the resume must refuse.
      const realm = 'delivery-c3b';
      const scene = await seedScene(realm, 'delivering');
      expect(await marketDb.claimCustodyRef(realm, scene.custodyRef)).toBe(true);
      expect(await marketDb.markCustodyMailIntent(scene.custodyRef)).toBe(true);
      const custody = new ParcelCustody();
      await custody.persistMailParcel(
        { key: String(scene.buyerCharacter), name: 'Buyer' },
        'delivery',
        [],
        scene.custodyRef,
      );
      custody.collect(scene.custodyRef);
      await makeService(realm, custody).sweepPass();
      expect(custody.parcels, 'no second copy, ever').toHaveLength(0);
      const after = await pool.query(`SELECT state FROM woc_market_settlements WHERE id = $1`, [
        scene.settlement.id,
      ]);
      expect(after.rows[0].state, 'parked visibly').toBe('delivering');
      const claim = await pool.query(
        `SELECT booked_at FROM woc_market_custody_claims WHERE custody_ref = $1`,
        [scene.custodyRef],
      );
      expect(claim.rows[0].booked_at).toBeNull();
    }, 20_000);

    it('C4: killed between the booking and the close tail', async () => {
      // Custody fully booked, settlement still 'delivering': the re-run must
      // not mail again and must finish the tail.
      const realm = 'delivery-c4';
      const scene = await seedScene(realm, 'delivering');
      expect(await marketDb.claimCustodyRef(realm, scene.custodyRef)).toBe(true);
      const custody = new ParcelCustody();
      await custody.persistMailParcel(
        { key: String(scene.buyerCharacter), name: 'Buyer' },
        'delivery',
        [],
        scene.custodyRef,
      );
      await marketDb.markCustodyRefBooked(scene.custodyRef);
      await makeService(realm, custody).sweepPass();
      await expectDeliveredExactlyOnce({
        realm,
        listingId: scene.listingId,
        settlementId: scene.settlement.id,
        custody,
        custodyRef: scene.custodyRef,
        parcels: 1,
        winnerBidId: scene.winnerBidId,
        loserBidId: scene.loserBidId,
      });
      // Booked already: the resume asked the mail rail for nothing new.
      expect(custody.persistCalls).toEqual([scene.custodyRef]);
    }, 20_000);

    it('C5: an older binary died after its delivered CAS, listing still open', async () => {
      // The silent-forever residue the review found: state 'delivered', no
      // sale row, listing open, bonds stranded. No arm read 'delivered' at
      // all; the re-drive arm must converge it FORWARD.
      const realm = 'delivery-c5';
      const scene = await seedScene(realm, 'delivered');
      // Custody was completed by the old binary before its CAS.
      expect(await marketDb.claimCustodyRef(realm, scene.custodyRef)).toBe(true);
      await marketDb.markCustodyRefBooked(scene.custodyRef);
      const custody = new ParcelCustody();
      const service = makeService(realm, custody);
      const stats = await service.sweepPass();
      expect(stats?.redriven).toBe(1);
      await expectDeliveredExactlyOnce({
        realm,
        listingId: scene.listingId,
        settlementId: scene.settlement.id,
        custody,
        custodyRef: scene.custodyRef,
        parcels: 0,
        winnerBidId: scene.winnerBidId,
        loserBidId: scene.loserBidId,
      });
      // A re-run converges to the same end state and re-drives nothing.
      const again = await service.sweepPass();
      expect(again?.redriven).toBe(0);
      await expectDeliveredExactlyOnce({
        realm,
        listingId: scene.listingId,
        settlementId: scene.settlement.id,
        custody,
        custodyRef: scene.custodyRef,
        parcels: 0,
        winnerBidId: scene.winnerBidId,
        loserBidId: scene.loserBidId,
      });
    }, 20_000);

    it('C5b: the same residue on an ACTIVE listing (the buy-now shape)', async () => {
      // A buy-now leaves its listing 'active' through delivery, so the
      // re-drive must find the residue by the settlement, never by a
      // stranded listing status.
      const realm = 'delivery-c5b';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const buyerCharacter = await seedCharacter(realm, buyer);
      const listingId = await seedListing(realm, seller, { status: 'active' });
      const settlement = await seedSettlement(listingId, buyer, buyerCharacter, {
        state: 'delivered',
      });
      const custodyRef = rulesMod.settlementCustodyRef(settlement.id);
      expect(await marketDb.claimCustodyRef(realm, custodyRef)).toBe(true);
      await marketDb.markCustodyRefBooked(custodyRef);
      const custody = new ParcelCustody();
      const stats = await makeService(realm, custody).sweepPass();
      expect(stats?.redriven).toBe(1);
      await expectDeliveredExactlyOnce({
        realm,
        listingId,
        settlementId: settlement.id,
        custody,
        custodyRef,
        parcels: 0,
      });
    }, 20_000);

    it('C6: the old binary also landed its sale row before dying', async () => {
      // The residue that now THROWS 23505 on a blind re-insert: the finalize
      // dedupes on the provenance index instead and still converges.
      const realm = 'delivery-c6';
      const scene = await seedScene(realm, 'delivered');
      expect(await marketDb.claimCustodyRef(realm, scene.custodyRef)).toBe(true);
      await marketDb.markCustodyRefBooked(scene.custodyRef);
      await marketDb.insertSale({
        realm,
        listingId: scene.listingId,
        itemId: 'crown_of_embers',
        item: { itemId: 'crown_of_embers', count: 1 },
        priceCents: 1000,
        amountBase: null,
        sellerAccount: 1,
        buyerAccount: 2,
        sellerName: 'S',
        buyerName: 'B',
      });
      const custody = new ParcelCustody();
      const stats = await makeService(realm, custody).sweepPass();
      expect(stats?.redriven).toBe(1);
      await expectDeliveredExactlyOnce({
        realm,
        listingId: scene.listingId,
        settlementId: scene.settlement.id,
        custody,
        custodyRef: scene.custodyRef,
        parcels: 0,
        winnerBidId: scene.winnerBidId,
        loserBidId: scene.loserBidId,
      });
    }, 20_000);

    it('C9: sold-but-undisposed residue converges when its sale row stands, parks without one', async () => {
      // The other close-tail residue of the old binary (crash between its
      // close and dispose statements). A standing sale row proves delivery
      // completed, so the flag converges; a sold row with NO sale is a
      // question only an operator can answer and stays visible.
      const realm = 'delivery-c9';
      const seller = await seedAccount();
      const withSale = await seedListing(realm, seller, { status: 'closed' });
      const withoutSale = await seedListing(realm, seller, { status: 'closed' });
      await pool.query(
        `UPDATE woc_market_listings SET resolution = 'sold' WHERE id = ANY($1::bigint[])`,
        [[withSale, withoutSale]],
      );
      await marketDb.insertSale({
        realm,
        listingId: withSale,
        itemId: 'crown_of_embers',
        item: { itemId: 'crown_of_embers', count: 1 },
        priceCents: 1000,
        amountBase: null,
        sellerAccount: 1,
        buyerAccount: 2,
        sellerName: 'S',
        buyerName: 'B',
      });
      const custody = new ParcelCustody();
      const stats = await makeService(realm, custody).sweepPass();
      expect(stats?.redriven).toBe(1);
      const rows = await pool.query(
        `SELECT id, item_disposed FROM woc_market_listings WHERE id = ANY($1::bigint[]) ORDER BY id`,
        [[withSale, withoutSale].sort((a, b) => a - b)],
      );
      const byId = new Map(rows.rows.map((r) => [Number(r.id), r.item_disposed]));
      expect(byId.get(withSale), 'the proven sale converges').toBe(true);
      expect(byId.get(withoutSale), 'the unproven one parks').toBe(false);
      // And the parked one is what the readout carries.
      await pool.query(
        `UPDATE woc_market_listings SET updated_at = now() - interval '1 hour' WHERE id = $1`,
        [withoutSale],
      );
      const readout = await marketDb.stuckCustodyReadout(realm, Date.now() - 600_000, 10, 1000);
      expect(readout.undisposedListings.count).toBe(1);
      expect(readout.undisposedListings.sample[0]?.id).toBe(withoutSale);
    }, 20_000);

    it('C7: refuses to deliver over a disposed listing and stays visible', async () => {
      const realm = 'delivery-c7';
      const seller = await seedAccount();
      const buyer = await seedAccount();
      const buyerCharacter = await seedCharacter(realm, buyer);
      const listingId = await seedListing(realm, seller, { itemDisposed: true });
      const settlement = await seedSettlement(listingId, buyer, buyerCharacter, {
        state: 'delivering',
      });
      const custody = new ParcelCustody();
      await makeService(realm, custody).sweepPass();
      const after = await pool.query(`SELECT state FROM woc_market_settlements WHERE id = $1`, [
        settlement.id,
      ]);
      expect(after.rows[0].state, 'parked in delivering').toBe('delivering');
      expect(custody.parcels).toHaveLength(0);
      const sales = await pool.query(
        `SELECT count(*)::int AS n FROM woc_market_sales WHERE listing_id = $1`,
        [listingId],
      );
      expect(sales.rows[0].n).toBe(0);
    }, 20_000);

    it('C8: parks an unbooked claim carrying a grant intent; no mail, visible', async () => {
      // A direct hand-off died ambiguously (grant maybe persisted): the mail
      // rail must NOT adopt the claim, and the readout must surface it.
      const realm = 'delivery-c8';
      const scene = await seedScene(realm, 'delivering');
      expect(await marketDb.claimCustodyRef(realm, scene.custodyRef)).toBe(true);
      expect(await marketDb.markCustodyGrantIntent(scene.custodyRef, scene.buyerCharacter)).toBe(
        true,
      );
      const custody = new ParcelCustody();
      await makeService(realm, custody).sweepPass();
      const after = await pool.query(`SELECT state FROM woc_market_settlements WHERE id = $1`, [
        scene.settlement.id,
      ]);
      expect(after.rows[0].state).toBe('delivering');
      expect(custody.parcels).toHaveLength(0);
      const readout = await marketDb.stuckCustodyReadout(realm, Date.now() + MINUTE_MS, 10, 1000);
      expect(readout.unbookedClaims.count).toBe(1);
      expect(readout.unbookedClaims.sample[0]).toMatchObject({
        custodyRef: scene.custodyRef,
        grantCharacterId: scene.buyerCharacter,
      });
      expect(readout.stuckDelivering.count).toBe(1);
    }, 20_000);
  });

  // -------------------------------------------------------------------------
  // The atomic save-and-book against the real lease fence.
  // -------------------------------------------------------------------------

  describe('saveDeliveredCharacterBooked', () => {
    it('persists the bags and the booking together (unfenced arm)', async () => {
      const realm = 'delivery-book-ok';
      const account = await seedAccount();
      const characterId = await seedCharacter(realm, account);
      const ref = `woc_delivery_book_ok_${seq}`;
      expect(await marketDb.claimCustodyRef(realm, ref)).toBe(true);
      const out = await marketDb.saveDeliveredCharacterBooked(
        {
          characterId,
          level: 11,
          state: { questLog: [], questsDone: [], inventory: [] } as never,
          leaseNonce: undefined,
        },
        ref,
      );
      expect(out).toBe('booked');
      const character = await pool.query(`SELECT level FROM characters WHERE id = $1`, [
        characterId,
      ]);
      expect(character.rows[0].level, 'the save landed').toBe(11);
      const claim = await pool.query(
        `SELECT booked_at FROM woc_market_custody_claims WHERE custody_ref = $1`,
        [ref],
      );
      expect(claim.rows[0].booked_at, 'and the booking landed with it').not.toBeNull();
    });

    it('passes the REAL lease fence when this process holds the lease', async () => {
      // The fenced statement's passing form against real Postgres: a wrong
      // holder or nonce column in the EXISTS would make every direct hand-off
      // report lease_lost forever, and only this arm would say so.
      const realm = 'delivery-book-fenced-ok';
      const account = await seedAccount();
      const characterId = await seedCharacter(realm, account);
      await pool.query(
        `INSERT INTO character_leases (character_id, realm, holder, nonce, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '90 seconds')`,
        [characterId, realm, db.PROCESS_LEASE_HOLDER, 'live-nonce-1'],
      );
      const ref = `woc_delivery_book_fenced_${seq}`;
      expect(await marketDb.claimCustodyRef(realm, ref)).toBe(true);
      const out = await marketDb.saveDeliveredCharacterBooked(
        {
          characterId,
          level: 14,
          state: { questLog: [], questsDone: [], inventory: [] } as never,
          leaseNonce: 'live-nonce-1',
        },
        ref,
      );
      expect(out).toBe('booked');
      const character = await pool.query(`SELECT level FROM characters WHERE id = $1`, [
        characterId,
      ]);
      expect(character.rows[0].level, 'the fenced save landed').toBe(14);
      const claim = await pool.query(
        `SELECT booked_at FROM woc_market_custody_claims WHERE custody_ref = $1`,
        [ref],
      );
      expect(claim.rows[0].booked_at).not.toBeNull();
    });

    it('rolls BOTH halves back when the lease fence rejects', async () => {
      // A nonce with no matching lease row: the in-statement EXISTS fence
      // matches zero rows, so neither the bags nor the booking may land.
      const realm = 'delivery-book-fence';
      const account = await seedAccount();
      const characterId = await seedCharacter(realm, account);
      const ref = `woc_delivery_book_fence_${seq}`;
      expect(await marketDb.claimCustodyRef(realm, ref)).toBe(true);
      const out = await marketDb.saveDeliveredCharacterBooked(
        {
          characterId,
          level: 12,
          state: { questLog: [], questsDone: [], inventory: [] } as never,
          leaseNonce: 'a-nonce-nobody-holds',
        },
        ref,
      );
      expect(out).toBe('lease_lost');
      const character = await pool.query(`SELECT level FROM characters WHERE id = $1`, [
        characterId,
      ]);
      expect(character.rows[0].level, 'the fenced save did not land').toBe(10);
      const claim = await pool.query(
        `SELECT booked_at FROM woc_market_custody_claims WHERE custody_ref = $1`,
        [ref],
      );
      expect(claim.rows[0].booked_at, 'and neither did the booking').toBeNull();
    });

    it('reports claim_missing (and saves nothing) over an already-booked ref', async () => {
      const realm = 'delivery-book-missing';
      const account = await seedAccount();
      const characterId = await seedCharacter(realm, account);
      const ref = `woc_delivery_book_missing_${seq}`;
      expect(await marketDb.claimCustodyRef(realm, ref)).toBe(true);
      await marketDb.markCustodyRefBooked(ref);
      const out = await marketDb.saveDeliveredCharacterBooked(
        {
          characterId,
          level: 13,
          state: { questLog: [], questsDone: [], inventory: [] } as never,
          leaseNonce: undefined,
        },
        ref,
      );
      expect(out).toBe('claim_missing');
      const character = await pool.query(`SELECT level FROM characters WHERE id = $1`, [
        characterId,
      ]);
      expect(character.rows[0].level, 'the save rolled back with the refusal').toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Two-connection interleaves: the finalize transaction's lock participation.
  // -------------------------------------------------------------------------

  describe('finalize interleaves', () => {
    function finalizeArgs(
      realm: string,
      scene: {
        listingId: number;
        settlement: WocSettlementRow;
        winnerBidId: number;
      },
    ) {
      return {
        settlementId: scene.settlement.id,
        listingId: scene.listingId,
        bidId: scene.winnerBidId,
        sale: {
          realm,
          listingId: scene.listingId,
          itemId: 'crown_of_embers',
          item: { itemId: 'crown_of_embers', count: 1 } as InvSlot,
          priceCents: 1000,
          amountBase: null,
          sellerAccount: 1,
          buyerAccount: 2,
          sellerName: 'S',
          buyerName: 'B',
        },
      };
    }

    it('waits on a held LISTING row lock, then completes', async () => {
      const realm = 'delivery-il-listing';
      const scene = await seedScene(realm, 'delivered');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT 1 FROM woc_market_listings WHERE id = $1 FOR UPDATE`, [
          scene.listingId,
        ]);
        const finalize = marketDb.finalizeDeliveredSettlement(finalizeArgs(realm, scene));
        const first = await Promise.race([
          finalize.then(() => 'resolved'),
          delay(200).then(() => 'blocked'),
        ]);
        // This is the pin: the transaction really takes the listing row lock
        // (a snapshot predicate alone would sail past the holder).
        expect(first).toBe('blocked');
        await client.query('COMMIT');
        expect(await finalize).toBe('finalized');
      } finally {
        client.release();
      }
      // The direct finalize (no bond arm ran here) leaves the winner's bond
      // exactly at refund_due: the precise flip the matrix cannot see because
      // the same pass's bond arm resolves it further.
      const winner = await pool.query(
        `SELECT status, bond_state FROM woc_market_bids WHERE id = $1`,
        [scene.winnerBidId],
      );
      expect(winner.rows[0]).toEqual({ status: 'won', bond_state: 'refund_due' });
      const loser = await pool.query(
        `SELECT status, bond_state FROM woc_market_bids WHERE id = $1`,
        [scene.loserBidId],
      );
      expect(loser.rows[0]).toEqual({ status: 'cancelled', bond_state: 'refund_due' });
    }, 20_000);

    it('finalize and the suspend guard cross without a deadlock hang', async () => {
      // The lock-cycle shape the widened suspend pre-lock closes: suspend
      // cancels a dead settlement's 'won' winner, finalize pre-locks that
      // same winner. Both sides must come back TYPED (refusal or success),
      // never hang and never 500; the delivered settlement always survives.
      const realm = 'delivery-il-suspend';
      const scene = await seedScene(realm, 'delivered');
      const [suspend, finalize] = await Promise.all([
        marketDb.suspendListingIfSafe(realm, scene.listingId, BASE_MS),
        marketDb.finalizeDeliveredSettlement(finalizeArgs(realm, scene)),
      ]);
      expect(['settlement_live', 'contended']).toContain(suspend);
      expect(['finalized', 'contended']).toContain(finalize);
      // Converge: a plain retry finishes the sale exactly once.
      if (finalize !== 'finalized') {
        expect(await marketDb.finalizeDeliveredSettlement(finalizeArgs(realm, scene))).toBe(
          'finalized',
        );
      }
      const sales = await pool.query(
        `SELECT count(*)::int AS n FROM woc_market_sales WHERE listing_id = $1 AND excluded = false`,
        [scene.listingId],
      );
      expect(sales.rows[0].n).toBe(1);
      const listing = await pool.query(
        `SELECT status, resolution FROM woc_market_listings WHERE id = $1`,
        [scene.listingId],
      );
      expect(listing.rows[0]).toEqual({ status: 'closed', resolution: 'sold' });
    }, 20_000);

    it('waits on a held WINNER BID row lock (bids join the lock set first)', async () => {
      const realm = 'delivery-il-bid';
      const scene = await seedScene(realm, 'delivered');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT 1 FROM woc_market_bids WHERE id = $1 FOR UPDATE`, [
          scene.winnerBidId,
        ]);
        const finalize = marketDb.finalizeDeliveredSettlement(finalizeArgs(realm, scene));
        const first = await Promise.race([
          finalize.then(() => 'resolved'),
          delay(200).then(() => 'blocked'),
        ]);
        expect(first).toBe('blocked');
        await client.query('COMMIT');
        expect(await finalize).toBe('finalized');
      } finally {
        client.release();
      }
    }, 20_000);

    it('reports contended past the bounded lock wait, writing nothing', async () => {
      const realm = 'delivery-il-timeout';
      const scene = await seedScene(realm, 'delivered');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT 1 FROM woc_market_listings WHERE id = $1 FOR UPDATE`, [
          scene.listingId,
        ]);
        // Held past ESCROW_LOCK_TIMEOUT_MS: the transaction must give up with
        // the typed refusal rather than wait forever inside a sweep pass.
        expect(await marketDb.finalizeDeliveredSettlement(finalizeArgs(realm, scene))).toBe(
          'contended',
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      const sales = await pool.query(
        `SELECT count(*)::int AS n FROM woc_market_sales WHERE listing_id = $1`,
        [scene.listingId],
      );
      expect(sales.rows[0].n, 'nothing was written').toBe(0);
      const listing = await pool.query(`SELECT status FROM woc_market_listings WHERE id = $1`, [
        scene.listingId,
      ]);
      expect(listing.rows[0].status).toBe('settling');
    }, 20_000);

    it('two concurrent finalizes both converge on exactly one sale row', async () => {
      const realm = 'delivery-il-double';
      const scene = await seedScene(realm, 'delivered');
      const [a, b] = await Promise.all([
        marketDb.finalizeDeliveredSettlement(finalizeArgs(realm, scene)),
        marketDb.finalizeDeliveredSettlement(finalizeArgs(realm, scene)),
      ]);
      expect([a, b].filter((r) => r === 'finalized').length).toBeGreaterThanOrEqual(1);
      expect([a, b].every((r) => r === 'finalized' || r === 'contended')).toBe(true);
      const sales = await pool.query(
        `SELECT count(*)::int AS n FROM woc_market_sales WHERE listing_id = $1 AND excluded = false`,
        [scene.listingId],
      );
      expect(sales.rows[0].n, 'one sale row, never two').toBe(1);
    }, 20_000);
  });

  // -------------------------------------------------------------------------
  // The stuck-custody readout over real rows: aged in, fresh and foreign out.
  // -------------------------------------------------------------------------

  describe('stuckCustodyReadout', () => {
    it('counts the three aged classes and excludes fresh and foreign rows', async () => {
      const realm = 'delivery-readout';
      const otherRealm = 'delivery-readout-other';
      const seller = await seedAccount();

      // Aged unbooked claim, fresh unbooked claim, aged BOOKED claim.
      await marketDb.claimCustodyRef(realm, 'readout-aged');
      await marketDb.claimCustodyRef(realm, 'readout-fresh');
      await marketDb.claimCustodyRef(realm, 'readout-booked');
      await marketDb.markCustodyRefBooked('readout-booked');
      await marketDb.claimCustodyRef(otherRealm, 'readout-foreign');
      await pool.query(
        `UPDATE woc_market_custody_claims SET claimed_at = now() - interval '1 hour'
          WHERE custody_ref IN ('readout-aged', 'readout-booked', 'readout-foreign')`,
      );

      // Aged stuck delivering settlement.
      const buyer = await seedAccount();
      const buyerCharacter = await seedCharacter(realm, buyer);
      const stuckListing = await seedListing(realm, seller);
      const stuck = await seedSettlement(stuckListing, buyer, buyerCharacter, {
        state: 'delivering',
      });
      // The class ages on CREATED_AT: rotation touches move updated_at only,
      // so an aged updated_at alone must not count (negative below).
      await pool.query(
        `UPDATE woc_market_settlements SET created_at = now() - interval '1 hour' WHERE id = $1`,
        [stuck.id],
      );
      // Per-dimension negatives, all in the SAME realm: a FRESH delivering
      // settlement (age arm), an aged CONFIRMED one (state arm), and an aged
      // ROTATED one whose updated_at moved but created_at did not exist aged.
      const freshListing = await seedListing(realm, seller);
      await seedSettlement(freshListing, buyer, buyerCharacter, { state: 'delivering' });
      const confirmedListing = await seedListing(realm, seller);
      const agedConfirmed = await seedSettlement(confirmedListing, buyer, buyerCharacter, {
        state: 'confirmed',
      });
      await pool.query(
        `UPDATE woc_market_settlements SET created_at = now() - interval '1 hour' WHERE id = $1`,
        [agedConfirmed.id],
      );
      const rotatedListing = await seedListing(realm, seller);
      const rotated = await seedSettlement(rotatedListing, buyer, buyerCharacter, {
        state: 'delivering',
      });
      await pool.query(
        `UPDATE woc_market_settlements SET updated_at = now() - interval '1 hour' WHERE id = $1`,
        [rotated.id],
      );

      // Aged closed-undisposed listing (sold residue); a disposed one and a
      // FRESH closed-undisposed one stay out (flag arm, age arm), and an aged
      // OPEN listing stays out (status arm).
      const undisposed = await seedListing(realm, seller, { status: 'closed' });
      await pool.query(
        `UPDATE woc_market_listings
            SET resolution = 'sold', updated_at = now() - interval '1 hour'
          WHERE id = $1`,
        [undisposed],
      );
      const disposed = await seedListing(realm, seller, { status: 'closed', itemDisposed: true });
      await pool.query(
        `UPDATE woc_market_listings
            SET resolution = 'cancelled', updated_at = now() - interval '1 hour'
          WHERE id = $1`,
        [disposed],
      );
      const freshClosed = await seedListing(realm, seller, { status: 'closed' });
      await pool.query(`UPDATE woc_market_listings SET resolution = 'cancelled' WHERE id = $1`, [
        freshClosed,
      ]);
      const agedOpen = await seedListing(realm, seller, { status: 'active' });
      await pool.query(
        `UPDATE woc_market_listings SET updated_at = now() - interval '1 hour' WHERE id = $1`,
        [agedOpen],
      );

      const cutoff = Date.now() - 10 * MINUTE_MS;
      const readout = await marketDb.stuckCustodyReadout(realm, cutoff, 10, 1000);
      expect(readout.unbookedClaims.count).toBe(1);
      expect(readout.unbookedClaims.sample[0]?.custodyRef).toBe('readout-aged');
      expect(readout.stuckDelivering.count, 'one per-dimension survivor').toBe(1);
      expect(readout.stuckDelivering.sample[0]?.id).toBe(stuck.id);
      expect(readout.undisposedListings.count).toBe(1);
      expect(readout.undisposedListings.sample[0]).toMatchObject({
        id: undisposed,
        resolution: 'sold',
      });
    }, 20_000);

    it('saturates the counts at the cap instead of scanning the stuck set', async () => {
      const realm = 'delivery-readout-cap';
      for (let i = 0; i < 7; i++) {
        await marketDb.claimCustodyRef(realm, `cap-claim-${i}`);
      }
      await pool.query(
        `UPDATE woc_market_custody_claims SET claimed_at = now() - interval '1 hour'
          WHERE realm = $1`,
        [realm],
      );
      const readout = await marketDb.stuckCustodyReadout(realm, Date.now() - 600_000, 3, 5);
      expect(readout.unbookedClaims.count, 'cap or more, never the true 7').toBe(5);
      expect(readout.unbookedClaims.sample, 'the sample keeps its own cap').toHaveLength(3);
    }, 20_000);
  });
});
