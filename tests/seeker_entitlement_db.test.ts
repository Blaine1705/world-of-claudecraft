import { describe, expect, it } from 'vitest';
import {
  claimSeekerEntitlement,
  hasSeekerEntitlement,
  seekerEntitlementForAccount,
  SEEKER_ENTITLEMENT_SCHEMA,
} from '../server/seeker_entitlement_db';

function fakePool(results: Record<string, unknown>[][]) {
  const calls: { sql: string; params?: readonly unknown[] }[] = [];
  const client = {
    async query(sql: string, params?: readonly unknown[]) {
      calls.push({ sql, params });
      return { rows: results.shift() ?? [] };
    },
    release() {},
  };
  return {
    calls,
    pool: {
      async connect() {
        return client;
      },
      query: client.query,
    },
  };
}

const claim = {
  mint: 'sgt-mint',
  accountId: 42,
  claimantWallet: 'seeker-wallet',
  proofVersion: 'sgt-v1',
  verificationSlot: 123,
};

describe('Seeker entitlement persistence', () => {
  it('pins keep-forever uniqueness and preserves a tombstone on account deletion', () => {
    expect(SEEKER_ENTITLEMENT_SCHEMA).toContain('mint TEXT PRIMARY KEY');
    expect(SEEKER_ENTITLEMENT_SCHEMA).toContain('ON DELETE SET NULL');
    expect(SEEKER_ENTITLEMENT_SCHEMA).toContain('UNIQUE (account_id)');
    expect(SEEKER_ENTITLEMENT_SCHEMA).not.toContain('ON DELETE CASCADE');
  });

  it('claims with parameterized SQL and commits the unique insert', async () => {
    const db = fakePool([[], [{ mint: claim.mint }], []]);
    await expect(claimSeekerEntitlement(claim, db.pool)).resolves.toBe('claimed');
    expect(db.calls[1]?.params).toEqual([
      claim.mint,
      claim.accountId,
      claim.claimantWallet,
      claim.proofVersion,
      claim.verificationSlot,
    ]);
    expect(db.calls.map((call) => call.sql.trim())).toEqual([
      'BEGIN',
      expect.stringContaining('INSERT INTO seeker_entitlement_claims'),
      'COMMIT',
    ]);
  });

  it('classifies an idempotent replay separately from a conflicting claim', async () => {
    const same = fakePool([
      [],
      [],
      [{ mint: claim.mint, account_id: claim.accountId, claimant_wallet: claim.claimantWallet }],
      [],
    ]);
    await expect(claimSeekerEntitlement(claim, same.pool)).resolves.toBe('existing_same');

    const transferredWithinAccount = fakePool([
      [],
      [],
      [{ mint: claim.mint, account_id: claim.accountId, claimant_wallet: 'prior-wallet' }],
      [],
    ]);
    await expect(
      claimSeekerEntitlement(
        { ...claim, claimantWallet: 'new-primary-wallet' },
        transferredWithinAccount.pool,
      ),
    ).resolves.toBe('existing_same');

    const conflict = fakePool([
      [],
      [],
      [{ mint: claim.mint, account_id: 99, claimant_wallet: 'other' }],
      [],
    ]);
    await expect(claimSeekerEntitlement(claim, conflict.pool)).resolves.toBe('conflict');
  });

  it('reads account entitlement without joining mutable wallet links', async () => {
    const db = fakePool([[{ '?column?': 1 }]]);
    await expect(hasSeekerEntitlement(42, db.pool)).resolves.toBe(true);
    expect(db.calls[0]?.sql).not.toContain('wallet_links');
    expect(db.calls[0]?.params).toEqual([42]);

    const lookup = fakePool([[{ mint: 'sgt-mint', claimant_wallet: 'original-wallet' }]]);
    await expect(seekerEntitlementForAccount(42, lookup.pool)).resolves.toEqual({
      mint: 'sgt-mint',
      claimantWallet: 'original-wallet',
    });
  });
});
