// The Epic Auth Web API fetch shell (server/epic/web_api.ts), driven directly
// through its fetchImpl injection param: every fault-mapping branch (network
// error, timeout, non-2xx classification, malformed 2xx, all to the matching
// outcome), the verdict pass-throughs, and the secret-embedding request the
// shell feeds to fetch. No module mocks: the injection seam exists precisely
// so this file can run the REAL shell code.
import { describe, expect, it, vi } from 'vitest';

import {
  buildExchangeCodeTokenRequest,
  EPIC_TOKEN_URL,
  EXCHANGE_CODE_GRANT,
} from '../../server/epic/ticket';
import { verifyLinkProof } from '../../server/epic/web_api';

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
