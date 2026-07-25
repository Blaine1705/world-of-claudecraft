export interface SeekerOwnershipVerifierDeps {
  claimForAccount(accountId: number): Promise<{ mint: string } | null>;
  walletForAccount(accountId: number): Promise<{ pubkey: string } | null>;
  findToken(walletAddress: string, signal: AbortSignal): Promise<{ mint: string } | null>;
}

export interface SeekerOwnershipVerifier {
  verify(accountId: number): Promise<boolean>;
}

/**
 * Verify current SGT ownership before a spin. Concurrent requests for one account
 * share one RPC flight, and the abort signal bounds the underlying HTTP work.
 */
export function createSeekerOwnershipVerifier(
  deps: SeekerOwnershipVerifierDeps,
  timeoutMs = 5_000,
): SeekerOwnershipVerifier {
  const flights = new Map<number, Promise<boolean>>();

  return {
    verify(accountId) {
      const existing = flights.get(accountId);
      if (existing) return existing;

      const signal = AbortSignal.timeout(timeoutMs);
      const flight = Promise.all([
        deps.claimForAccount(accountId),
        deps.walletForAccount(accountId),
      ])
        .then(async ([claim, wallet]) => {
          if (!claim || !wallet) return false;
          const token = await deps.findToken(wallet.pubkey, signal);
          return token?.mint === claim.mint;
        })
        .catch(() => false)
        .finally(() => {
          if (flights.get(accountId) === flight) flights.delete(accountId);
        });
      flights.set(accountId, flight);
      return flight;
    },
  };
}
