// The fetch shell over the pure ticket helpers: the one place server code
// talks to the Epic Auth Web API for link verification. Secrets discipline:
// the client secret rides only inside the request body built by ticket.ts;
// NOTHING here logs a URL, a request body, or an upstream response body (an
// upstream error body can echo the request back). Log lines, if any, are fixed
// strings plus a bare HTTP status at most.

import {
  buildExchangeCodeTokenRequest,
  classifyTokenErrorStatus,
  type ProofVerdict,
  parseExchangeCodeTokenResponse,
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
