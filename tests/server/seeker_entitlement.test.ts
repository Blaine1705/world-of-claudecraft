import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as http from 'node:http';
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
    setSeekerEntitlementRuntimeForTests({
      verifyNativeAttestationChallenge: vi.fn().mockResolvedValue({ nonce: 'nonce' }),
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

    setSeekerEntitlementRuntimeForTests({
      verifyNativeAttestationChallenge: vi.fn().mockResolvedValue(null),
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

    setSeekerEntitlementRuntimeForTests({
      verifyNativeAttestationChallenge: vi.fn().mockResolvedValue({ nonce: 'nonce' }),
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
