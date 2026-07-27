import type * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRes, makeReq } from './helpers';

vi.mock('../../server/db', () => ({
  accountAndScopeForToken: vi.fn(),
  moderationStatusForAccount: vi.fn(),
  walletForAccount: vi.fn(),
  pool: {},
}));

import {
  handleSeekerEntitlementClaim,
  resetSeekerEntitlementRuntimeForTests,
  setSeekerEntitlementRuntimeForTests,
  verifyCurrentSeekerEntitlement,
} from '../../server/seeker_entitlement';

const nativeHeaders = {
  origin: 'http://localhost',
  'content-type': 'application/json',
};

afterEach(() => resetSeekerEntitlementRuntimeForTests());

describe('Seeker entitlement claim', () => {
  it('verifies native attestation, linked wallet, SGT ownership, and permanent claim', async () => {
    const claim = vi.fn().mockResolvedValue('claimed');
    const verifyArtifact = vi.fn().mockResolvedValue({ nonce: 'nonce' });
    setSeekerEntitlementRuntimeForTests({
      verifySeekerSolanaArtifactAttestation: verifyArtifact,
      walletForAccount: vi.fn().mockResolvedValue({
        pubkey: 'wallet',
        linked_at: '2026-01-01T00:00:00Z',
      }),
      findSeekerGenesisToken: vi.fn().mockResolvedValue({ mint: 'unique-mint', slot: 123 }),
      claimSeekerEntitlement: claim,
    });
    const req = makeReq({
      method: 'POST',
      url: '/api/seeker/entitlement',
      headers: nativeHeaders,
      body: { nativeAttestation: { challengeId: 'id', token: 'token' } },
    });
    const res = new FakeRes();

    await handleSeekerEntitlementClaim(req, res as unknown as http.ServerResponse, 42);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ entitled: true });
    expect(verifyArtifact).toHaveBeenCalledWith(
      req,
      { challengeId: 'id', token: 'token' },
      'seeker-claim',
    );
    expect(claim).toHaveBeenCalledWith({
      mint: 'unique-mint',
      accountId: 42,
      claimantWallet: 'wallet',
      proofVersion: 'sgt-v1',
      verificationSlot: 123,
    });
  });

  it('fails closed for web calls, invalid attestation, missing SGT, and consumed mint', async () => {
    const webRes = new FakeRes();
    await handleSeekerEntitlementClaim(
      makeReq({
        method: 'POST',
        url: '/api/seeker/entitlement',
        headers: { 'content-type': 'application/json' },
        body: {},
      }),
      webRes as unknown as http.ServerResponse,
      42,
    );
    expect(webRes.statusCode).toBe(403);
    expect(JSON.parse(webRes.body)).toEqual({
      error: 'Seeker entitlement is available only in the native app',
      code: 'seeker.native_only',
    });

    setSeekerEntitlementRuntimeForTests({
      verifySeekerSolanaArtifactAttestation: vi.fn().mockResolvedValue(null),
    });
    const invalidRes = new FakeRes();
    await handleSeekerEntitlementClaim(
      makeReq({
        method: 'POST',
        url: '/api/seeker/entitlement',
        headers: nativeHeaders,
        body: { nativeAttestation: {} },
      }),
      invalidRes as unknown as http.ServerResponse,
      42,
    );
    expect(invalidRes.statusCode).toBe(403);
    expect(JSON.parse(invalidRes.body)).toEqual({
      error: 'Solana Store app verification required',
      code: 'seeker.solana_artifact_required',
    });

    setSeekerEntitlementRuntimeForTests({
      verifySeekerSolanaArtifactAttestation: vi.fn().mockResolvedValue({ nonce: 'nonce' }),
      walletForAccount: vi.fn().mockResolvedValue(null),
    });
    const walletRes = new FakeRes();
    await handleSeekerEntitlementClaim(
      makeReq({
        method: 'POST',
        url: '/api/seeker/entitlement',
        headers: nativeHeaders,
        body: { nativeAttestation: {} },
      }),
      walletRes as unknown as http.ServerResponse,
      42,
    );
    expect(walletRes.statusCode).toBe(409);
    expect(JSON.parse(walletRes.body)).toEqual({
      error: 'link and verify a wallet first',
      code: 'seeker.wallet_required',
    });

    setSeekerEntitlementRuntimeForTests({
      verifySeekerSolanaArtifactAttestation: vi.fn().mockResolvedValue({ nonce: 'nonce' }),
      walletForAccount: vi.fn().mockResolvedValue({
        pubkey: 'wallet',
        linked_at: '2026-01-01T00:00:00Z',
      }),
      findSeekerGenesisToken: vi.fn().mockResolvedValue(null),
    });
    const tokenRes = new FakeRes();
    await handleSeekerEntitlementClaim(
      makeReq({
        method: 'POST',
        url: '/api/seeker/entitlement',
        headers: nativeHeaders,
        body: { nativeAttestation: {} },
      }),
      tokenRes as unknown as http.ServerResponse,
      42,
    );
    expect(tokenRes.statusCode).toBe(403);
    expect(JSON.parse(tokenRes.body)).toEqual({
      error: 'verified Seeker Genesis Token required',
      code: 'seeker.genesis_token_required',
    });

    setSeekerEntitlementRuntimeForTests({
      verifySeekerSolanaArtifactAttestation: vi.fn().mockResolvedValue({ nonce: 'nonce' }),
      walletForAccount: vi.fn().mockResolvedValue({
        pubkey: 'wallet',
        linked_at: '2026-01-01T00:00:00Z',
      }),
      findSeekerGenesisToken: vi.fn().mockResolvedValue({ mint: 'mint', slot: 123 }),
      claimSeekerEntitlement: vi.fn().mockResolvedValue('conflict'),
    });
    const conflictRes = new FakeRes();
    await handleSeekerEntitlementClaim(
      makeReq({
        method: 'POST',
        url: '/api/seeker/entitlement',
        headers: nativeHeaders,
        body: { nativeAttestation: {} },
      }),
      conflictRes as unknown as http.ServerResponse,
      42,
    );
    expect(conflictRes.statusCode).toBe(409);
    expect(JSON.parse(conflictRes.body)).toEqual({
      error: 'Seeker Genesis Token was already claimed',
      code: 'seeker.genesis_token_claimed',
    });
  });

  it('rechecks current SGT ownership before a native daily spin', async () => {
    setSeekerEntitlementRuntimeForTests({
      seekerEntitlementForAccount: vi
        .fn()
        .mockResolvedValue({ mint: 'claimed-mint', claimantWallet: 'original-wallet' }),
      walletForAccount: vi.fn().mockResolvedValue({
        pubkey: 'current-primary-wallet',
        linked_at: '2026-01-01T00:00:00Z',
      }),
      findSeekerGenesisToken: vi.fn().mockResolvedValue({ mint: 'claimed-mint', slot: 456 }),
    });
    await expect(verifyCurrentSeekerEntitlement(42)).resolves.toBe(true);

    setSeekerEntitlementRuntimeForTests({
      seekerEntitlementForAccount: vi
        .fn()
        .mockResolvedValue({ mint: 'claimed-mint', claimantWallet: 'original-wallet' }),
      walletForAccount: vi.fn().mockResolvedValue({
        pubkey: 'current-primary-wallet',
        linked_at: '2026-01-01T00:00:00Z',
      }),
      findSeekerGenesisToken: vi.fn().mockResolvedValue({ mint: 'different-mint', slot: 456 }),
    });
    await expect(verifyCurrentSeekerEntitlement(42)).resolves.toBe(false);
  });
});
