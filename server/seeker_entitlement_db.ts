import { pool } from './db';

export const SEEKER_ENTITLEMENT_SCHEMA = `
-- Keep forever. A claimed SGT mint must never become reusable after a wallet
-- unlink, token transfer, account deactivation, hard delete, or binary rollback.
CREATE TABLE IF NOT EXISTS seeker_entitlement_claims (
  mint TEXT PRIMARY KEY,
  account_id INT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  claimant_wallet TEXT NOT NULL,
  proof_version TEXT NOT NULL,
  verification_slot BIGINT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);
`;

export interface SeekerEntitlementClaim {
  mint: string;
  accountId: number;
  claimantWallet: string;
  proofVersion: string;
  verificationSlot: number | null;
}

export type SeekerEntitlementClaimResult = 'claimed' | 'existing_same' | 'conflict';

interface QueryResultLike {
  rows: Record<string, unknown>[];
}

interface QueryClient {
  query(sql: string, params?: readonly unknown[]): Promise<QueryResultLike>;
  release(): void;
}

interface QueryPool {
  connect(): Promise<QueryClient>;
  query(sql: string, params?: readonly unknown[]): Promise<QueryResultLike>;
}

function sameClaim(row: Record<string, unknown>, claim: SeekerEntitlementClaim): boolean {
  return Number(row.account_id) === claim.accountId && row.mint === claim.mint;
}

/**
 * Claim one SGT mint and one account atomically across every realm process.
 * Chain verification must finish before this function starts its short DB transaction.
 */
export async function claimSeekerEntitlement(
  claim: SeekerEntitlementClaim,
  db: QueryPool = pool,
): Promise<SeekerEntitlementClaimResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO seeker_entitlement_claims
         (mint, account_id, claimant_wallet, proof_version, verification_slot)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING mint`,
      [
        claim.mint,
        claim.accountId,
        claim.claimantWallet,
        claim.proofVersion,
        claim.verificationSlot,
      ],
    );
    if (inserted.rows.length > 0) {
      await client.query('COMMIT');
      return 'claimed';
    }
    const existing = await client.query(
      `SELECT mint, account_id, claimant_wallet
         FROM seeker_entitlement_claims
        WHERE mint = $1 OR account_id = $2
        FOR UPDATE`,
      [claim.mint, claim.accountId],
    );
    await client.query('COMMIT');
    return existing.rows.some((row) => sameClaim(row, claim)) ? 'existing_same' : 'conflict';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function hasSeekerEntitlement(
  accountId: number,
  db: Pick<QueryPool, 'query'> = pool,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1
       FROM seeker_entitlement_claims
      WHERE account_id = $1
      LIMIT 1`,
    [accountId],
  );
  return result.rows.length > 0;
}

export async function seekerEntitlementForAccount(
  accountId: number,
  db: Pick<QueryPool, 'query'> = pool,
): Promise<{ mint: string; claimantWallet: string } | null> {
  const result = await db.query(
    `SELECT mint, claimant_wallet
       FROM seeker_entitlement_claims
      WHERE account_id = $1
      LIMIT 1`,
    [accountId],
  );
  const row = result.rows[0];
  return row && typeof row.mint === 'string' && typeof row.claimant_wallet === 'string'
    ? { mint: row.mint, claimantWallet: row.claimant_wallet }
    : null;
}
