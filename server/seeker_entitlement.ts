import type * as http from 'node:http';
import { accountAndScopeForToken, moderationStatusForAccount, walletForAccount } from './db';
import { ctxAccountId } from './http/context';
import { type BearerActiveGuardDb, createActiveGuard } from './http/middleware/bearer_active_guard';
import { rateLimit, WALLET_LINK_POLICY } from './http/middleware/rate_limit';
import type { Ctx, Middleware, RouteDef } from './http/types';
import { json, readBody } from './http_util';
import { verifySeekerSolanaArtifactAttestation } from './native_attestation';
import {
  claimSeekerEntitlement,
  hasSeekerEntitlement,
  seekerEntitlementForAccount,
} from './seeker_entitlement_db';
import { findSeekerGenesisToken } from './seeker_genesis_token_rpc';
import {
  createSeekerOwnershipVerifier,
  type SeekerOwnershipVerifier,
} from './seeker_ownership_verifier';
import { isNativeAppRequest } from './web_login_guard';

interface SeekerEntitlementRuntime {
  walletForAccount: typeof walletForAccount;
  findSeekerGenesisToken: typeof findSeekerGenesisToken;
  claimSeekerEntitlement: typeof claimSeekerEntitlement;
  hasSeekerEntitlement: typeof hasSeekerEntitlement;
  seekerEntitlementForAccount: typeof seekerEntitlementForAccount;
  verifySeekerSolanaArtifactAttestation: typeof verifySeekerSolanaArtifactAttestation;
}

const REAL_RUNTIME: SeekerEntitlementRuntime = {
  walletForAccount,
  findSeekerGenesisToken,
  claimSeekerEntitlement,
  hasSeekerEntitlement,
  seekerEntitlementForAccount,
  verifySeekerSolanaArtifactAttestation,
};

let runtime = REAL_RUNTIME;
let currentOwnershipVerifier: SeekerOwnershipVerifier = makeCurrentOwnershipVerifier();

function makeCurrentOwnershipVerifier(): SeekerOwnershipVerifier {
  return createSeekerOwnershipVerifier({
    claimForAccount: (accountId) => runtime.seekerEntitlementForAccount(accountId),
    walletForAccount: (accountId) => runtime.walletForAccount(accountId),
    findToken: (walletAddress, signal) =>
      runtime.findSeekerGenesisToken(walletAddress, undefined, signal),
  });
}

export function setSeekerEntitlementRuntimeForTests(
  overrides: Partial<SeekerEntitlementRuntime>,
): void {
  runtime = { ...REAL_RUNTIME, ...overrides };
  currentOwnershipVerifier = makeCurrentOwnershipVerifier();
}

export function resetSeekerEntitlementRuntimeForTests(): void {
  runtime = REAL_RUNTIME;
  currentOwnershipVerifier = makeCurrentOwnershipVerifier();
}

function makeGuardDb() {
  return { accountAndScopeForToken, moderationStatusForAccount };
}

let guardDbOverride: BearerActiveGuardDb | null = null;

export function setSeekerEntitlementGuardDbForTests(db: BearerActiveGuardDb | null): void {
  guardDbOverride = db;
}

const activeGuard = createActiveGuard(() => guardDbOverride ?? makeGuardDb());

const nativeOnly: Middleware = async (ctx, next) => {
  if (!isNativeAppRequest(ctx.req)) {
    json(ctx.res, 403, {
      error: 'Seeker entitlement is available only in the native app',
      code: 'seeker.native_only',
    });
    return;
  }
  await next();
};

async function entitlementStatusHandler(ctx: Ctx): Promise<void> {
  return handleSeekerEntitlementStatus(ctx.res, ctxAccountId(ctx));
}

async function entitlementClaimHandler(ctx: Ctx): Promise<void> {
  return handleSeekerEntitlementClaim(ctx.req, ctx.res, ctxAccountId(ctx));
}

export async function handleSeekerEntitlementStatus(
  res: http.ServerResponse,
  accountId: number,
): Promise<void> {
  const entitled = await runtime.hasSeekerEntitlement(accountId);
  json(res, 200, { entitled });
}

export async function verifyCurrentSeekerEntitlement(accountId: number): Promise<boolean> {
  return currentOwnershipVerifier.verify(accountId);
}

export async function handleSeekerEntitlementClaim(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  accountId: number,
): Promise<void> {
  if (!isNativeAppRequest(req)) {
    json(res, 403, {
      error: 'Seeker entitlement is available only in the native app',
      code: 'seeker.native_only',
    });
    return;
  }
  const body = await readBody(req);
  const attestation = await runtime.verifySeekerSolanaArtifactAttestation(
    req,
    body.nativeAttestation,
    'seeker-claim',
  );
  if (!attestation) {
    json(res, 403, {
      error: 'Solana Store app verification required',
      code: 'seeker.solana_artifact_required',
    });
    return;
  }
  const wallet = await runtime.walletForAccount(accountId);
  if (!wallet) {
    json(res, 409, {
      error: 'link and verify a wallet first',
      code: 'seeker.wallet_required',
    });
    return;
  }
  const token = await runtime.findSeekerGenesisToken(wallet.pubkey);
  if (!token) {
    json(res, 403, {
      error: 'verified Seeker Genesis Token required',
      code: 'seeker.genesis_token_required',
    });
    return;
  }
  const result = await runtime.claimSeekerEntitlement({
    mint: token.mint,
    accountId,
    claimantWallet: wallet.pubkey,
    proofVersion: 'sgt-v1',
    verificationSlot: token.slot,
  });
  if (result === 'conflict') {
    json(res, 409, {
      error: 'Seeker Genesis Token was already claimed',
      code: 'seeker.genesis_token_claimed',
    });
    return;
  }
  json(res, 200, { entitled: true });
}

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/seeker/entitlement',
    surface: 'api',
    middleware: [activeGuard, nativeOnly],
    handler: entitlementStatusHandler,
  },
  {
    method: 'POST',
    path: '/api/seeker/entitlement',
    surface: 'api',
    middleware: [activeGuard, nativeOnly, rateLimit(WALLET_LINK_POLICY)],
    handler: entitlementClaimHandler,
  },
];
