import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WOC_MARKET_UNAVAILABLE,
  type WocBidView,
  WocMarketClient,
  type WocQuoteView,
} from '../src/net/woc_market_sdk';

// Typed client SDK tests: fetch is stubbed per test (vi.stubGlobal saves the
// original, vi.unstubAllGlobals restores it in afterEach), so nothing here
// touches the network. URLs go through apiUrl(); with no VITE origins set the
// URL equals the path, but every expectation is derived from the RECORDED stub
// argument via endsWith, never a hardcoded origin assumption.

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

let calls: RecordedCall[] = [];

type StubResult = { status: number; body: unknown } | 'throw';

const stubFetch = (respond: (url: string) => StubResult): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const out = respond(url);
      if (out === 'throw') throw new TypeError('network down');
      return new Response(out.body === null ? null : JSON.stringify(out.body), {
        status: out.status,
      });
    }),
  );
};

const headersOf = (call: RecordedCall | undefined): Record<string, string> =>
  (call?.init?.headers ?? {}) as Record<string, string>;

const client = (token: string | null = 'tok-1'): WocMarketClient =>
  new WocMarketClient({ token: () => token });

const statusBody = {
  enabled: true,
  price: { available: true, healthy: true, reason: null, tokensPerUsd: 100, asOfMs: 900_000 },
  totpThresholdCents: 2500,
  maxActiveListings: 12,
  durationsHours: [12, 24, 48, 72, 168],
  minPriceCents: 25,
  maxPriceCents: 5_000_000,
  qualityFloor: 'epic',
  settlementWindowSeconds: 600,
};

const bidView: WocBidView = {
  id: 31,
  listingId: 9,
  amountCents: 12_345,
  status: 'pending_bond',
  bondCents: 617,
  bondState: 'pending',
  bondReference: 'WOCB_31',
  bondQuoteExpiresAtMs: 1_000_000,
  placedAtMs: 900_000,
};

const quoteView: WocQuoteView = {
  reference: 'WOCB_31',
  transactionBase64: 'AQID',
  amount: { base: '61700', tokens: 617 },
  seller: null,
  burn: null,
  treasury: null,
  expiresAtMs: 1_000_000,
};

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request plumbing: bearer + content type', () => {
  it('attaches the bearer header when a token is present, no Content-Type on a GET', async () => {
    stubFetch(() => ({ status: 200, body: statusBody }));
    await client('tok-1').status();
    const call = calls[0];
    expect(call?.url.endsWith('/api/woc-market/status')).toBe(true);
    expect(call?.init?.method).toBe('GET');
    const headers = headersOf(call);
    expect(headers.Authorization).toBe('Bearer tok-1');
    // Content-Type rides only on bodied requests; a GET carries none.
    expect('Content-Type' in headers).toBe(false);
    expect('body' in (call?.init ?? {})).toBe(false);
  });

  it('sends no Authorization header when the token is null', async () => {
    stubFetch(() => ({ status: 200, body: statusBody }));
    await client(null).status();
    expect('Authorization' in headersOf(calls[0])).toBe(false);
  });

  it('sets Content-Type application/json only on a bodied POST', async () => {
    stubFetch(() => ({ status: 200, body: { standing: true } }));
    await client().confirmBond(31, 'sig-1');
    const headers = headersOf(calls[0]);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBe('Bearer tok-1');
  });
});

describe('status()', () => {
  it('passes a 200 payload through with ok true', async () => {
    stubFetch(() => ({ status: 200, body: statusBody }));
    await expect(client().status()).resolves.toEqual({ ok: true, ...statusBody });
  });

  it('resolves the typed disabled fallback on a network throw', async () => {
    stubFetch(() => 'throw');
    await expect(client().status()).resolves.toEqual({
      ok: false,
      enabled: false,
      price: { available: false, healthy: false, reason: null, tokensPerUsd: null, asOfMs: null },
      totpThresholdCents: 0,
      maxActiveListings: 0,
      durationsHours: [],
      minPriceCents: 0,
      maxPriceCents: 0,
      qualityFloor: 'epic',
      settlementWindowSeconds: 0,
    });
  });
});

describe('browse()', () => {
  it('builds the full query string: page, sort, quality, format, comma-joined itemIds', async () => {
    stubFetch(() => ({ status: 200, body: { total: 0, page: 2, listings: [] } }));
    await client().browse({
      page: 2,
      sort: 'ending',
      quality: 'epic',
      format: 'auction',
      itemIds: ['iron_sword', 'oak_staff'],
    });
    // URLSearchParams percent-encodes the join comma; the ORDER is pinned too
    // (page, sort, then the optional filters).
    expect(
      calls[0]?.url.endsWith(
        '/api/woc-market/listings?page=2&sort=ending&quality=epic&format=auction&itemIds=iron_sword%2Coak_staff',
      ),
    ).toBe(true);
  });

  it('omits null filters from the query string', async () => {
    stubFetch(() => ({ status: 200, body: { total: 0, page: 0, listings: [] } }));
    await client().browse({ page: 0, sort: 'newest', quality: null, format: null, itemIds: null });
    expect(calls[0]?.url.endsWith('/api/woc-market/listings?page=0&sort=newest')).toBe(true);
  });

  it('returns the rows on 200', async () => {
    const listings = [{ id: 1, itemId: 'iron_sword' }];
    stubFetch(() => ({ status: 200, body: { total: 40, page: 1, listings } }));
    await expect(
      client().browse({ page: 1, sort: 'ending', quality: null, format: null, itemIds: null }),
    ).resolves.toEqual({ ok: true, total: 40, page: 1, listings });
  });

  it('surfaces the stable server code from a non-2xx body', async () => {
    stubFetch(() => ({ status: 409, body: { code: 'woc_market.paused' } }));
    await expect(
      client().browse({ page: 0, sort: 'ending', quality: null, format: null, itemIds: null }),
    ).resolves.toEqual({ ok: false, code: 'woc_market.paused' });
  });

  it('falls back to WOC_MARKET_UNAVAILABLE on a non-2xx with no code', async () => {
    stubFetch(() => ({ status: 503, body: null }));
    await expect(
      client().browse({ page: 0, sort: 'ending', quality: null, format: null, itemIds: null }),
    ).resolves.toEqual({ ok: false, code: WOC_MARKET_UNAVAILABLE });
  });
});

describe('placeBid()', () => {
  it('posts the body fields verbatim and returns bid + bond on 200', async () => {
    stubFetch(() => ({ status: 200, body: { bid: bidView, bond: quoteView } }));
    const out = await client().placeBid({
      listingId: 9,
      characterId: 4,
      amountCents: 12_345,
      totpCode: '123456',
      acceptTerms: true,
    });
    expect(calls[0]?.url.endsWith('/api/woc-market/listings/9/bids')).toBe(true);
    expect(calls[0]?.init?.method).toBe('POST');
    // listingId rides in the path; the body carries exactly the other four.
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      characterId: 4,
      amountCents: 12_345,
      totpCode: '123456',
      acceptTerms: true,
    });
    expect(out).toEqual({ ok: true, bid: bidView, bond: quoteView });
  });
});

describe('confirmSettlement()', () => {
  it('posts the signature and returns the settlement state on 200', async () => {
    stubFetch(() => ({ status: 200, body: { state: 'confirming' } }));
    const out = await client().confirmSettlement(4, 'sig-1');
    expect(calls[0]?.url.endsWith('/api/woc-market/settlements/4/confirm')).toBe(true);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ signature: 'sig-1' });
    expect(out).toEqual({ ok: true, state: 'confirming' });
  });

  it('returns the server code on failure', async () => {
    stubFetch(() => ({ status: 410, body: { code: 'woc_market.quote_expired' } }));
    await expect(client().confirmSettlement(4, 'sig-1')).resolves.toEqual({
      ok: false,
      code: 'woc_market.quote_expired',
    });
  });
});

describe('estimate()', () => {
  it('resolves the estimate on success, flooring the cents into the query', async () => {
    const estimate = {
      available: true,
      usdCents: 1234,
      amount: { base: '123400', tokens: 1234 },
      asOfMs: 900_000,
    };
    stubFetch(() => ({ status: 200, body: estimate }));
    await expect(client().estimate(1234.9)).resolves.toEqual(estimate);
    expect(calls[0]?.url.endsWith('/api/woc-market/estimate?cents=1234')).toBe(true);
  });

  it('resolves null on failure', async () => {
    stubFetch(() => ({ status: 500, body: null }));
    await expect(client().estimate(1000)).resolves.toBeNull();
  });
});
