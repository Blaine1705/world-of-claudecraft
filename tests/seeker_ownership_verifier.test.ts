import { describe, expect, it, vi } from 'vitest';
import { createSeekerOwnershipVerifier } from '../server/seeker_ownership_verifier';

describe('Seeker ownership verifier', () => {
  it('coalesces concurrent verification for the same account into one RPC call', async () => {
    let release!: (value: { mint: string } | null) => void;
    const findToken = vi.fn(
      () =>
        new Promise<{ mint: string } | null>((resolve) => {
          release = resolve;
        }),
    );
    const verifier = createSeekerOwnershipVerifier({
      claimForAccount: vi.fn(async () => ({ mint: 'sgt' })),
      walletForAccount: vi.fn(async () => ({ pubkey: 'wallet' })),
      findToken,
    });

    const first = verifier.verify(42);
    const second = verifier.verify(42);
    await vi.waitFor(() => expect(findToken).toHaveBeenCalledTimes(1));
    release({ mint: 'sgt' });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(findToken).toHaveBeenCalledTimes(1);
  });

  it('aborts a stalled RPC and fails closed', async () => {
    const findToken = vi.fn(
      (_wallet: string, signal: AbortSignal) =>
        new Promise<{ mint: string } | null>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const verifier = createSeekerOwnershipVerifier(
      {
        claimForAccount: vi.fn(async () => ({ mint: 'sgt' })),
        walletForAccount: vi.fn(async () => ({ pubkey: 'wallet' })),
        findToken,
      },
      10,
    );

    await expect(verifier.verify(42)).resolves.toBe(false);
    expect(findToken).toHaveBeenCalledTimes(1);
  });
});
