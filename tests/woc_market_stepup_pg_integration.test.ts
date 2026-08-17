// Real-Postgres coverage for the $WOC Exchange step-up challenge store: the
// single-use consume (atomic DELETE ... RETURNING under the nonce key), the
// cross-account and cross-realm isolation of the consume predicate, the
// deliberate absence of an expiry clause in the consume WHERE (the verifier
// answers expired honestly from the returned row), the issue-time prune, and
// the accounts FK cascade. The verification ladder itself is unit-tested with
// real ed25519 signatures in tests/server/woc_market_stepup.test.ts; THIS
// suite proves the SQL predicates those tests assume.
//
// Gate: TEST_DATABASE_URL (an admin URL on the dev Postgres from npm run
// db:up). The suite creates and drops its own database and never touches the
// database the URL points at. Pattern: tests/woc_market_directed_pg_integration.test.ts.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PgWocMarketDb } from '../server/woc_market_db';
import {
  buildStepUpMessage,
  type NewWocStepUpChallenge,
  newStepUpNonce,
  stepUpBindingDigest,
  type WocStepUpBinding,
} from '../server/woc_market_stepup';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const VERIFY_DB = 'wocc_woc_market_stepup_verify';

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
const REALM = 'stepup-realm';
const TTL_MS = 5 * 60_000;

const BINDING: WocStepUpBinding = {
  operation: 'create_listing',
  itemId: 'valorplate_chest',
  format: 'auction',
  startCents: 5000,
  reserveCents: null,
  buyNowCents: null,
  durationHours: 12,
};

describeDb('woc market step-up challenges against real Postgres', () => {
  let admin: Pool;
  let pool: Pool;
  let db: typeof import('../server/db');
  let marketDb: PgWocMarketDb;
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

    // The REAL boot path, so the table, check constraint, and index under
    // test are the ones production gets.
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

  async function seedAccount(): Promise<number> {
    seq++;
    const res = await pool.query(
      `INSERT INTO accounts (username, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`woc-stepup-fixture-${seq}`],
    );
    return Number(res.rows[0].id);
  }

  function challenge(
    accountId: number,
    over: Partial<NewWocStepUpChallenge> = {},
  ): NewWocStepUpChallenge {
    const nonce = over.nonce ?? newStepUpNonce();
    const expiresAtMs = over.expiresAtMs ?? BASE_MS + TTL_MS;
    return {
      nonce,
      realm: REALM,
      accountId,
      wallet: 'wallet-stepup',
      operation: 'create_listing',
      bindingDigest: stepUpBindingDigest(BINDING),
      message: buildStepUpMessage({
        binding: BINDING,
        accountId,
        wallet: 'wallet-stepup',
        nonce,
        expiresAtIso: new Date(expiresAtMs).toISOString(),
      }),
      expiresAtMs,
      ...over,
    };
  }

  it('round-trips a challenge: consume returns every stored field exactly once', async () => {
    const account = await seedAccount();
    const row = challenge(account);
    await marketDb.createStepUpChallenge(row);
    const consumed = await marketDb.consumeStepUpChallenge(REALM, row.nonce, account);
    expect(consumed).toEqual({
      nonce: row.nonce,
      accountId: account,
      wallet: row.wallet,
      operation: row.operation,
      bindingDigest: row.bindingDigest,
      message: row.message,
      expiresAtMs: row.expiresAtMs,
    });
    // Single-use: the row is gone, a replay reads as unknown.
    expect(await marketDb.consumeStepUpChallenge(REALM, row.nonce, account)).toBeNull();
  });

  it('resolves a RACE of two consumes on one nonce to exactly one winner', async () => {
    // The QA probe: two operations racing one challenge. The DELETE under the
    // primary key is the atomicity authority; whichever statement loses the
    // row lock re-evaluates against the deleted version and returns nothing.
    const account = await seedAccount();
    const row = challenge(account);
    await marketDb.createStepUpChallenge(row);
    const [a, b] = await Promise.all([
      marketDb.consumeStepUpChallenge(REALM, row.nonce, account),
      marketDb.consumeStepUpChallenge(REALM, row.nonce, account),
    ]);
    const winners = [a, b].filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.nonce).toBe(row.nonce);
  });

  it('a cross-account consume returns null AND leaves the owner able to consume', async () => {
    // Scoping the DELETE to the account is what keeps a nonce guess from
    // burning the owner's challenge (denial): the attacker learns nothing and
    // destroys nothing.
    const owner = await seedAccount();
    const attacker = await seedAccount();
    const row = challenge(owner);
    await marketDb.createStepUpChallenge(row);
    expect(await marketDb.consumeStepUpChallenge(REALM, row.nonce, attacker)).toBeNull();
    expect((await marketDb.consumeStepUpChallenge(REALM, row.nonce, owner))?.nonce).toBe(row.nonce);
  });

  it('a cross-realm consume returns null and leaves the row intact', async () => {
    const account = await seedAccount();
    const row = challenge(account);
    await marketDb.createStepUpChallenge(row);
    expect(await marketDb.consumeStepUpChallenge('other-realm', row.nonce, account)).toBeNull();
    expect((await marketDb.consumeStepUpChallenge(REALM, row.nonce, account))?.nonce).toBe(
      row.nonce,
    );
  });

  it('consume deliberately returns an EXPIRED row rather than filtering it in SQL', async () => {
    // The wallet-link consume hides expired rows in its WHERE; this store
    // hands them up so the verifier can answer stepup_challenge_expired
    // instead of the unknown-challenge refusal. The pin is the deviation.
    const account = await seedAccount();
    const row = challenge(account, { expiresAtMs: BASE_MS - 1 });
    await marketDb.createStepUpChallenge(row);
    const consumed = await marketDb.consumeStepUpChallenge(REALM, row.nonce, account);
    expect(consumed?.expiresAtMs).toBe(BASE_MS - 1);
  });

  it('prune deletes exactly the expired rows of the named realm', async () => {
    const account = await seedAccount();
    const expired = challenge(account, { expiresAtMs: BASE_MS - 1 });
    const live = challenge(account, { expiresAtMs: BASE_MS + TTL_MS });
    const otherRealmExpired = challenge(account, { expiresAtMs: BASE_MS - 1, realm: 'elsewhere' });
    await marketDb.createStepUpChallenge(expired);
    await marketDb.createStepUpChallenge(live);
    await marketDb.createStepUpChallenge(otherRealmExpired);
    expect(await marketDb.pruneStepUpChallenges(REALM, BASE_MS)).toBe(1);
    // The live row survived the prune and still consumes.
    expect((await marketDb.consumeStepUpChallenge(REALM, live.nonce, account))?.nonce).toBe(
      live.nonce,
    );
    // The expired row is gone; the other realm's row is untouched.
    expect(await marketDb.consumeStepUpChallenge(REALM, expired.nonce, account)).toBeNull();
    expect(
      (await marketDb.consumeStepUpChallenge('elsewhere', otherRealmExpired.nonce, account))?.nonce,
    ).toBe(otherRealmExpired.nonce);
  });

  it('prunes at the boundary instant: expires_at equal to now is expired', async () => {
    const account = await seedAccount();
    const row = challenge(account, { expiresAtMs: BASE_MS });
    await marketDb.createStepUpChallenge(row);
    expect(await marketDb.pruneStepUpChallenges(REALM, BASE_MS)).toBe(1);
    expect(await marketDb.consumeStepUpChallenge(REALM, row.nonce, account)).toBeNull();
  });

  it('deleting the account cascades its challenges away', async () => {
    const account = await seedAccount();
    const row = challenge(account);
    await marketDb.createStepUpChallenge(row);
    await pool.query('DELETE FROM accounts WHERE id = $1', [account]);
    const left = await pool.query('SELECT 1 FROM woc_market_stepup_challenges WHERE nonce = $1', [
      row.nonce,
    ]);
    expect(left.rowCount).toBe(0);
  });

  it('refuses a duplicate nonce at the primary key', async () => {
    const account = await seedAccount();
    const row = challenge(account);
    await marketDb.createStepUpChallenge(row);
    await expect(
      marketDb.createStepUpChallenge(challenge(account, { nonce: row.nonce })),
    ).rejects.toThrow();
  });

  it('refuses an operation word outside the two custody movers at the CHECK', async () => {
    const account = await seedAccount();
    const bogus = challenge(account);
    await expect(
      marketDb.createStepUpChallenge({
        ...bogus,
        operation: 'refund_everything' as NewWocStepUpChallenge['operation'],
      }),
    ).rejects.toThrow();
  });
});
