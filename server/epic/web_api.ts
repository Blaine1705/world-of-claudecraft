// The fetch shell over the pure ticket helpers: the one place server code
// talks to the Epic Auth / Connect / Stats Web APIs for link verification and
// achievement unlock push. Secrets discipline: the client secret rides only
// inside request builders (form body or Basic Authorization); NOTHING here
// logs a URL, a request body, an Authorization header, or an upstream response
// body (an upstream error body can echo the request back). Log lines, if any,
// are fixed strings plus a bare HTTP status at most.

import {
  buildClientCredentialsTokenRequest,
  buildExchangeCodeTokenRequest,
  buildExternalAccountMappingUrl,
  buildUnlockAchievementsRequest,
  classifyTokenErrorStatus,
  type ProofVerdict,
  parseClientCredentialsTokenResponse,
  parseExchangeCodeTokenResponse,
  parseExternalAccountMappingResponse,
} from './ticket';

const UPSTREAM_TIMEOUT_MS = 5000;

/** A verification outcome: the parsed verdict, or 'upstream' when Epic could
 *  not be asked (network error, timeout, unparseable body, server fault). An
 *  'upstream' outcome is NEVER treated as proof in either direction. */
export type VerifyOutcome = ProofVerdict | { kind: 'upstream' };

/** Ask Epic whether the proof (launcher exchange code) proves an Epic account
 *  id for our confidential client + deployment. */
export async function verifyLinkProof(
  opts: {
    clientId: string;
    clientSecret: string;
    deploymentId: string;
    proof: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyOutcome> {
  const { url, body, headers } = buildExchangeCodeTokenRequest({
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    deploymentId: opts.deploymentId,
    exchangeCode: opts.proof,
  });

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'upstream' };
  }

  const parsed = await res.json().catch(() => null);

  if (!res.ok) {
    // Non-2xx: OAuth error envelope on 4xx, or server fault. Never treat a
    // network-adjacent or unparseable failure as proof.
    if (parsed === null) return { kind: 'upstream' };
    const classified = classifyTokenErrorStatus(res.status, parsed);
    if (classified === 'upstream') return { kind: 'upstream' };
    return { kind: classified };
  }

  if (parsed === null) return { kind: 'upstream' };
  const verdict = parseExchangeCodeTokenResponse(parsed);
  // A malformed 2xx body is an upstream fault (Epic answered garbage), not a
  // proof verdict; the route serves 503 and the player retries.
  if (verdict.kind === 'malformed') return { kind: 'upstream' };
  return verdict;
}

// ---------------------------------------------------------------------------
// Achievement unlock push (O2 server-trusted path).
//
// Steps, all fire-and-forget from the caller's perspective (the mirror worker
// owns retries): client_credentials token -> epic account to product user id
// mapping -> batch unlock. True only when the unlock POST returns 2xx; false
// on any fault (network, non-2xx, unmapped product user, missing token).
// ---------------------------------------------------------------------------

/** Obtain a short-lived client access token for Game Services Web APIs. */
async function fetchClientAccessToken(
  opts: { clientId: string; clientSecret: string },
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const { url, body, headers } = buildClientCredentialsTokenRequest(opts);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const parsed = await res.json().catch(() => null);
  return parseClientCredentialsTokenResponse(parsed);
}

/** Resolve an Epic account id to a product user id for this product. Null when
 *  Epic has no mapping (player has never connected to the product) or on any
 *  upstream fault. */
async function resolveProductUserId(
  opts: { accessToken: string; epicAccountId: string },
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const url = buildExternalAccountMappingUrl({ epicAccountId: opts.epicAccountId });
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const parsed = await res.json().catch(() => null);
  return parseExternalAccountMappingResponse(parsed, opts.epicAccountId);
}

/**
 * POST a batch of achievement unlocks for one linked Epic account in ONE
 * unlock call (achievementIds array). True on a 2xx unlock response, false
 * otherwise; the mirror worker owns retries and gives up quietly (reconcile
 * heals later). Batching lets the mirror flush a whole account's reconcile set
 * in a single request instead of one per unlock.
 *
 * Server-trusted only: never accepts client-reported unlocks. The path is
 * client_credentials + external-account mapping + Stats Achievements unlock
 * (see ticket.ts O2 builders). Secrets never log.
 */
export async function pushAchievementUnlocks(
  opts: {
    clientId: string;
    clientSecret: string;
    deploymentId: string;
    epicAccountId: string;
    achNames: readonly string[];
  },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (opts.achNames.length === 0) return true;

  const accessToken = await fetchClientAccessToken(
    { clientId: opts.clientId, clientSecret: opts.clientSecret },
    fetchImpl,
  );
  if (accessToken === null) return false;

  const productUserId = await resolveProductUserId(
    { accessToken, epicAccountId: opts.epicAccountId },
    fetchImpl,
  );
  if (productUserId === null) return false;

  const { url, body, headers } = buildUnlockAchievementsRequest({
    deploymentId: opts.deploymentId,
    productUserId,
    accessToken,
    achievementIds: opts.achNames,
  });
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** POST one achievement unlock. Thin single-name wrapper over
 *  pushAchievementUnlocks; kept for callers that unlock exactly one deed. */
export async function pushAchievementUnlock(
  opts: {
    clientId: string;
    clientSecret: string;
    deploymentId: string;
    epicAccountId: string;
    achName: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return pushAchievementUnlocks(
    {
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      deploymentId: opts.deploymentId,
      epicAccountId: opts.epicAccountId,
      achNames: [opts.achName],
    },
    fetchImpl,
  );
}
