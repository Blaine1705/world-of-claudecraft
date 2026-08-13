// The Cheater mark's SQL boundary (server/moderation_db.ts): the two audited
// operator writes, setAccountCheaterMark and liftAccountCheaterMark.
//
// Driven against a pinned pool-client stub (the tests/moderation_db.test.ts
// idiom) rather than a live Postgres, because what is being pinned is
// TRANSACTIONAL SHAPE, not query results: that the applied budget is read back
// from the SAME statement that wrote it, that a write matching no row aborts
// before the audit INSERT, and that the two arms agree on refusing a no-op.
//
// The mark is POWER-NEUTRAL by construction (src/sim/moderation/CLAUDE.md);
// nothing here may grow a gameplay effect.

import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestQuery = (
  text: string,
  values?: readonly unknown[],
) => Promise<QueryResult<Record<string, unknown>>>;

const db = vi.hoisted(() => ({
  query: vi.fn<TestQuery>(),
  connect: vi.fn<() => Promise<PoolClient>>(),
}));

vi.mock('../../server/db', () => ({ pool: db }));

import { CheaterMarkRefused } from '../../server/cheater_mark_api';
import { liftAccountCheaterMark, setAccountCheaterMark } from '../../server/moderation_db';
import { CHEATER_MARK_MAX_SECONDS } from '../../src/sim/moderation';

const TARGET_ACCOUNT_ID = 41858;
const ADMIN_ACCOUNT_ID = 7;
const REASON = 'confirmed speed hacking in Thornhollow Fields';

function queryResult<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { command: '', rowCount, oid: 0, fields: [], rows };
}

/** A pinned pooled client, so BEGIN / write / audit / COMMIT are one transaction. */
function clientStub() {
  const query = vi.fn<TestQuery>().mockResolvedValue(queryResult([]));
  const release = vi.fn();
  return { query, release };
}

/** Every statement text the pinned client saw, in order. */
function statements(client: ReturnType<typeof clientStub>): string[] {
  return client.query.mock.calls.map(([text]) => text);
}

/** Did the transaction write an audit row? */
function wroteAuditRow(client: ReturnType<typeof clientStub>): boolean {
  return statements(client).some((sql) => sql.includes('account_moderation_actions'));
}

beforeEach(() => {
  db.query.mockReset();
  db.connect.mockReset();
});

describe('setAccountCheaterMark', () => {
  it('returns the budget the UPDATE stored, read back in the same statement', async () => {
    // Load-bearing for the admin route: a second SELECT after the COMMIT can be
    // overtaken by a save-path burn, which would hand the live push the OLD
    // remaining while the API answered ok. RETURNING inside the transaction
    // cannot be raced that way.
    const client = clientStub();
    client.query.mockImplementation(async (text: string) =>
      text.includes('RETURNING')
        ? queryResult([{ cheater_mark_seconds: 10_800 }])
        : queryResult([]),
    );
    db.connect.mockResolvedValue(client as unknown as PoolClient);

    const stored = await setAccountCheaterMark({
      accountId: TARGET_ACCOUNT_ID,
      adminAccountId: ADMIN_ACCOUNT_ID,
      reason: REASON,
      seconds: 10_800,
    });

    expect(stored).toBe(10_800);
    const sql = statements(client);
    expect(sql[0]).toBe('BEGIN');
    expect(sql.at(-1)).toBe('COMMIT');
    const update = sql.find((s) => s.includes('UPDATE accounts')) ?? '';
    expect(update).toContain('RETURNING cheater_mark_seconds');
    // No standalone read alongside the transaction: the whole point is that the
    // pushed value comes from the write.
    expect(db.query).not.toHaveBeenCalled();
    expect(wroteAuditRow(client)).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('returns the CLAMPED budget, not the number the operator typed', async () => {
    // The clamp lives here so it holds for every caller; the returned value is
    // what the row actually holds, so a live session counts down the real budget.
    const client = clientStub();
    client.query.mockImplementation(async (text: string) =>
      text.includes('RETURNING')
        ? queryResult([{ cheater_mark_seconds: CHEATER_MARK_MAX_SECONDS }])
        : queryResult([]),
    );
    db.connect.mockResolvedValue(client as unknown as PoolClient);

    const stored = await setAccountCheaterMark({
      accountId: TARGET_ACCOUNT_ID,
      adminAccountId: ADMIN_ACCOUNT_ID,
      reason: REASON,
      seconds: CHEATER_MARK_MAX_SECONDS + 10_000,
    });

    expect(stored).toBe(CHEATER_MARK_MAX_SECONDS);
    const update = statements(client).find((s) => s.includes('UPDATE accounts')) ?? '';
    const params = client.query.mock.calls.find(([text]) => text.includes('UPDATE accounts'))?.[1];
    expect(update).toContain('UPDATE accounts');
    expect(params).toEqual([TARGET_ACCOUNT_ID, CHEATER_MARK_MAX_SECONDS, REASON]);
  });

  it('aborts without an audit row when the UPDATE matched no account', async () => {
    // Mirrors the lift arm: an audit row claiming an account was branded, when
    // the write touched nothing, is a false entry in the permanent record. The
    // admin route cannot reach this (requireAdminTarget resolves the account
    // first), so it is an internal caller error and falls to the pipeline's 500
    // rather than being dressed up as an operator mistake.
    const client = clientStub();
    client.query.mockResolvedValue(queryResult([], 0));
    db.connect.mockResolvedValue(client as unknown as PoolClient);

    await expect(
      setAccountCheaterMark({
        accountId: 999_999,
        adminAccountId: ADMIN_ACCOUNT_ID,
        reason: REASON,
        seconds: 600,
      }),
    ).rejects.toThrow(/account/i);

    expect(wroteAuditRow(client)).toBe(false);
    expect(statements(client)).toContain('ROLLBACK');
    expect(statements(client)).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('is not a coded refusal: a missing account must not read as an operator mistake', async () => {
    const client = clientStub();
    client.query.mockResolvedValue(queryResult([], 0));
    db.connect.mockResolvedValue(client as unknown as PoolClient);

    await expect(
      setAccountCheaterMark({
        accountId: 999_999,
        adminAccountId: ADMIN_ACCOUNT_ID,
        reason: REASON,
        seconds: 600,
      }),
    ).rejects.not.toBeInstanceOf(CheaterMarkRefused);
  });

  it('refuses a blank reason and a non-positive budget before touching the pool', async () => {
    await expect(
      setAccountCheaterMark({
        accountId: TARGET_ACCOUNT_ID,
        adminAccountId: ADMIN_ACCOUNT_ID,
        reason: '   ',
        seconds: 600,
      }),
    ).rejects.toThrow(CheaterMarkRefused);
    await expect(
      setAccountCheaterMark({
        accountId: TARGET_ACCOUNT_ID,
        adminAccountId: ADMIN_ACCOUNT_ID,
        reason: REASON,
        seconds: 0,
      }),
    ).rejects.toThrow(CheaterMarkRefused);
    expect(db.connect).not.toHaveBeenCalled();
  });
});

describe('liftAccountCheaterMark', () => {
  it('refuses an unmarked account with not_marked and writes no audit row', async () => {
    // The sibling shape the set arm above now mirrors.
    const client = clientStub();
    client.query.mockResolvedValue(queryResult([], 0));
    db.connect.mockResolvedValue(client as unknown as PoolClient);

    await expect(
      liftAccountCheaterMark({
        accountId: TARGET_ACCOUNT_ID,
        adminAccountId: ADMIN_ACCOUNT_ID,
        reason: 'appeal upheld',
      }),
    ).rejects.toThrow(new CheaterMarkRefused('not_marked'));

    expect(wroteAuditRow(client)).toBe(false);
    expect(statements(client)).toContain('ROLLBACK');
  });
});
