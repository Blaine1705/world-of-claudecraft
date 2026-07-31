// The Epic Auth Web API fetch shell (server/epic/web_api.ts), driven directly
// through its fetchImpl injection param: every fault-mapping branch (network
// error, timeout, non-2xx classification, malformed 2xx, all to the matching
// outcome), the verdict pass-throughs, and the secret-embedding request the
// shell feeds to fetch. No module mocks: the injection seam exists precisely
// so this file can run the REAL shell code.
import { describe, expect, it, vi } from 'vitest';

import {
  buildClientCredentialsTokenRequest,
  buildExchangeCodeTokenRequest,
  buildExternalAccountMappingUrl,
  buildUnlockAchievementsRequest,
  CLIENT_CREDENTIALS_GRANT,
  EPIC_CONNECT_TOKEN_URL,
  EPIC_GS_HOST,
  EPIC_IDENTITY_PROVIDER,
  EPIC_TOKEN_URL,
  EXCHANGE_CODE_GRANT,
  parseClientCredentialsTokenResponse,
  parseExternalAccountMappingResponse,
} from '../../server/epic/ticket';
import { pushAchievementUnlocks, verifyLinkProof } from '../../server/epic/web_api';

const OPTS = {
  clientId: 'CID',
  clientSecret: 'CSEC',
  deploymentId: 'DEP',
  proof: 'EXCHANGE01',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const OK_BODY = {
  access_token: 'eg1~unused',
  token_type: 'bearer',
  expires_in: 7200,
  account_id: 'a1b2c3d4e5f60718',
  client_id: 'CID',
};

describe('verifyLinkProof fault mapping', () => {
  it('maps a network error (fetch rejects) to upstream', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'upstream',
    });
  });

  it('maps a timeout abort to upstream', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'upstream',
    });
  });

  it('maps a non-JSON 4xx body to upstream', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>not json</html>', { status: 400 }));
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'upstream',
    });
  });

  it('maps a non-JSON 2xx body to upstream', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>not json</html>', { status: 200 }));
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'upstream',
    });
  });

  it('maps a JSON 2xx body that parses to malformed to upstream, never a verdict', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: 'x' }));
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'upstream',
    });
  });

  it('maps a 5xx status to upstream', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'server_error' }, 503));
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'upstream',
    });
  });

  it('maps invalid_client on 401 to upstream (credentials fault)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'invalid_client' }, 401));
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'upstream',
    });
  });
});

describe('verifyLinkProof verdict pass-through', () => {
  it('passes through ok with the epic account id', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(OK_BODY));
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'ok',
      epicAccountId: 'a1b2c3d4e5f60718',
    });
  });

  it('passes through invalid (invalid_grant)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400));
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'invalid',
    });
  });

  it('passes through banned (access_denied)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'access_denied' }, 403));
    expect(await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'banned',
    });
  });
});

describe('verifyLinkProof request shape', () => {
  it('POSTs the built exchange_code token request with a timeout signal', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(OK_BODY));
    await verifyLinkProof(OPTS, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(EPIC_TOKEN_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe(EXCHANGE_CODE_GRANT);
    expect(body.get('exchange_code')).toBe('EXCHANGE01');
    expect(body.get('deployment_id')).toBe('DEP');
    expect(body.get('client_id')).toBe('CID');
    expect(body.get('client_secret')).toBe('CSEC');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('request builders (client-secret embedding)', () => {
  it('buildExchangeCodeTokenRequest embeds every param on the official host', () => {
    const { url, body } = buildExchangeCodeTokenRequest({
      clientId: 'K',
      clientSecret: 'S',
      deploymentId: 'D',
      exchangeCode: 'E',
    });
    expect(url).toBe('https://api.epicgames.dev/epic/oauth/v2/token');
    expect(body.get('grant_type')).toBe('exchange_code');
    expect(body.get('exchange_code')).toBe('E');
    expect(body.get('deployment_id')).toBe('D');
    expect(body.get('client_id')).toBe('K');
    expect(body.get('client_secret')).toBe('S');
  });
});

// ---------------------------------------------------------------------------
// Achievement unlock push (O2 server-trusted path). No live Epic calls.
// ---------------------------------------------------------------------------

const UNLOCK_OPTS = {
  clientId: 'CID',
  clientSecret: 'CSEC',
  deploymentId: 'DEP',
  epicAccountId: 'a1b2c3d4e5f60718',
  achNames: ['ACH_FIRST_STEPS', 'ACH_LEVEL_CAP'] as const,
};

const CLIENT_TOKEN_BODY = {
  access_token: 'eg1~client-token',
  token_type: 'bearer',
  expires_in: 3600,
};

const PUID = '0002a1b2c3d4e5f60718192021222324';
const MAPPING_BODY = {
  ids: { [UNLOCK_OPTS.epicAccountId]: PUID },
};

describe('O2 unlock request builders (host/path/field pins)', () => {
  it('buildClientCredentialsTokenRequest uses Connect token host and Basic auth', () => {
    const { url, body, headers } = buildClientCredentialsTokenRequest({
      clientId: 'K',
      clientSecret: 'S',
    });
    expect(url).toBe(EPIC_CONNECT_TOKEN_URL);
    expect(url).toBe('https://api.epicgames.dev/auth/v1/oauth/token');
    expect(body.get('grant_type')).toBe(CLIENT_CREDENTIALS_GRANT);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('K:S', 'utf8').toString('base64')}`);
  });

  it('buildExternalAccountMappingUrl pins user accounts path and epicgames provider', () => {
    const url = buildExternalAccountMappingUrl({ epicAccountId: 'acct1' });
    expect(url).toBe(
      `${EPIC_GS_HOST}/user/v1/accounts?accountId=acct1&identityProviderId=${EPIC_IDENTITY_PROVIDER}`,
    );
  });

  it('buildUnlockAchievementsRequest pins Stats Achievements unlock path and body field', () => {
    const { url, body, headers } = buildUnlockAchievementsRequest({
      deploymentId: 'DEP',
      productUserId: PUID,
      accessToken: 'tok',
      achievementIds: ['ACH_A', 'ACH_B'],
    });
    expect(url).toBe(`https://api.epicgames.dev/stats/v1/DEP/players/${PUID}/achievements/unlock`);
    expect(JSON.parse(body)).toEqual({ achievementIds: ['ACH_A', 'ACH_B'] });
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('parseClientCredentialsTokenResponse and mapping parse are defensive', () => {
    expect(parseClientCredentialsTokenResponse({ access_token: 't' })).toBe('t');
    expect(parseClientCredentialsTokenResponse({})).toBeNull();
    expect(parseExternalAccountMappingResponse(MAPPING_BODY, UNLOCK_OPTS.epicAccountId)).toBe(PUID);
    expect(parseExternalAccountMappingResponse({ ids: {} }, UNLOCK_OPTS.epicAccountId)).toBeNull();
  });
});

describe('pushAchievementUnlocks (mocked fetchImpl)', () => {
  it('walks token -> map -> unlock and returns true on 2xx unlock', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/v1/oauth/token')) return jsonResponse(CLIENT_TOKEN_BODY);
      if (String(url).includes('/user/v1/accounts')) return jsonResponse(MAPPING_BODY);
      // Undici rejects Response bodies on 204; a bare 200 stands in for success.
      if (String(url).includes('/achievements/unlock')) return new Response(null, { status: 200 });
      throw new Error(`unexpected url ${url}`);
    });
    expect(
      await pushAchievementUnlocks(
        { ...UNLOCK_OPTS, achNames: [...UNLOCK_OPTS.achNames] },
        fetchImpl as never,
      ),
    ).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const unlockCall = fetchImpl.mock.calls[2] as unknown as [string, RequestInit];
    expect(unlockCall[0]).toContain('/stats/v1/DEP/players/');
    expect(unlockCall[0]).toContain('/achievements/unlock');
    expect(unlockCall[1].method).toBe('POST');
    expect(JSON.parse(String(unlockCall[1].body))).toEqual({
      achievementIds: ['ACH_FIRST_STEPS', 'ACH_LEVEL_CAP'],
    });
  });

  it('returns false when client token fetch fails (network)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(
      await pushAchievementUnlocks({ ...UNLOCK_OPTS, achNames: ['ACH_X'] }, fetchImpl as never),
    ).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns false when product user mapping is empty', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/v1/oauth/token')) return jsonResponse(CLIENT_TOKEN_BODY);
      if (String(url).includes('/user/v1/accounts')) return jsonResponse({ ids: {} });
      throw new Error(`unexpected url ${url}`);
    });
    expect(
      await pushAchievementUnlocks({ ...UNLOCK_OPTS, achNames: ['ACH_X'] }, fetchImpl as never),
    ).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns false when unlock POST is non-2xx', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/v1/oauth/token')) return jsonResponse(CLIENT_TOKEN_BODY);
      if (String(url).includes('/user/v1/accounts')) return jsonResponse(MAPPING_BODY);
      return jsonResponse({ error: 'server_error' }, 503);
    });
    expect(
      await pushAchievementUnlocks({ ...UNLOCK_OPTS, achNames: ['ACH_X'] }, fetchImpl as never),
    ).toBe(false);
  });

  it('empty achNames is a no-op success without fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    expect(await pushAchievementUnlocks({ ...UNLOCK_OPTS, achNames: [] }, fetchImpl as never)).toBe(
      true,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
