// The H11 hot-read guards, end to end: the service reading THROUGH the
// injected WocMarketReadCache (burst collapse, key isolation, the
// directed-listing party gate surviving a warm cache), the sequenced
// activity fan-out's one-client bound, the route-layer busts, and the read
// limiter's mounting and refusal. The cache-key probes here are the
// two-session tests the QA file demands: two viewers, one warm cache, and
// the answer may never widen.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimit, WOC_MARKET_READ_POLICY } from '../../server/http/middleware/rate_limit';
import {
  resetRateLimitClock,
  resetWocMarketMutationRateLimits,
  setRateLimitClock,
  WOC_MARKET_READ_MAX_PER_MINUTE,
} from '../../server/ratelimit';
import type { WocMarketDb, WocMarketDeps, WocMarketService } from '../../server/woc_market';
import { WocMarketService as RealWocMarketService } from '../../server/woc_market';
import { createDevWocMarketEconomy } from '../../server/woc_market_proxy';
import { WocMarketReadCache } from '../../server/woc_market_read_cache';
import {
  configureWocMarketRuntime,
  resetWocMarketRuntimeForTests,
  routes,
} from '../../server/woc_market_routes';
import { WOC_MARKET_RESTRICTED_POLICY } from '../../server/woc_market_rules';
import { fakeCtx } from './helpers';

const REALM = 'Claudemoon';
const BASE_MS = 1_820_000_000_000;

const BROWSE_Q = {
  page: 0,
  pageSize: 25,
  quality: null,
  format: null,
  itemIds: null,
  sort: 'ending',
} as const;

/** A minimal listing row: only the fields the detail path and views read. */
function listingRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 4,
    realm: REALM,
    directedBuyerAccount: null,
    sellerAccount: 3,
    sellerName: 'Selara',
    item: { itemId: 'sunblade', count: 1 },
    itemId: 'sunblade',
    quality: 'epic',
    format: 'auction',
    startCents: 5000,
    reserveCents: null,
    buyNowCents: null,
    offerNext: false,
    status: 'active',
    resolution: null,
    currentBidCents: null,
    buyNowLockAccount: null,
    buyNowLockExpiresMs: null,
    cancelRequestedAtMs: null,
    endsAtMs: BASE_MS + 3_600_000,
    createdAtMs: BASE_MS,
    ...over,
  };
}

/** A service over a PARTIAL db stub (the wire-pins partial-injection idiom):
 *  each test defines only the reads it drives, and a read the test did not
 *  expect throws loudly instead of vanishing into a default. */
function makeService(
  dbStub: Partial<Record<string, unknown>>,
  opts: {
    readCache?: WocMarketReadCache;
    verifiedWallet?: (a: number) => Promise<string | null>;
  } = {},
): WocMarketService {
  const clock = BASE_MS;
  const deps: WocMarketDeps = {
    db: dbStub as unknown as WocMarketDb,
    economy: createDevWocMarketEconomy(() => clock),
    custody: {
      // Reads never touch custody; a call here is a test bug.
      get sim() {
        throw new Error('custody not exercised by hot reads');
      },
    } as unknown as WocMarketDeps['custody'],
    verifiedWallet: opts.verifiedWallet ?? (async () => null),
    balanceTokens: async () => null,
    stepUpDevSig: true,
    config: {
      enabled: true,
      realm: REALM,
      policy: WOC_MARKET_RESTRICTED_POLICY,
      confirmingReviewMs: 6 * 3600 * 1000,
    },
    ...(opts.readCache ? { readCache: opts.readCache } : {}),
    now: () => clock,
  };
  void clock;
  return new RealWocMarketService(deps);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  resetWocMarketRuntimeForTests();
  resetWocMarketMutationRateLimits();
  resetRateLimitClock();
});

describe('service reads through the cache', () => {
  it('collapses a concurrent browse burst into ONE db read', async () => {
    const gate = deferred<{ rows: never[]; hasMore: boolean }>();
    const browseListings = vi.fn(() => gate.promise);
    const service = makeService({ browseListings }, { readCache: new WocMarketReadCache() });
    const reads = [service.browse(BROWSE_Q), service.browse(BROWSE_Q), service.browse(BROWSE_Q)];
    expect(browseListings).toHaveBeenCalledTimes(1);
    gate.resolve({ rows: [], hasMore: false });
    await Promise.all(reads);
    expect(browseListings).toHaveBeenCalledTimes(1);
    // And the query shape still reaches the db intact on the one real read.
    expect(browseListings).toHaveBeenCalledWith(REALM, BROWSE_Q);
  });

  it('without the injected cache every browse read hits the db (the optionality contract)', async () => {
    const browseListings = vi.fn(async () => ({ rows: [], hasMore: false }));
    const service = makeService({ browseListings });
    await service.browse(BROWSE_Q);
    await service.browse(BROWSE_Q);
    expect(browseListings).toHaveBeenCalledTimes(2);
  });

  it('the directed-listing party gate runs per request OVER the warm cache: a stranger still reads null', async () => {
    const directed = listingRow({ directedBuyerAccount: 8 });
    const listingById = vi.fn(async () => directed);
    const service = makeService({ listingById }, { readCache: new WocMarketReadCache() });
    // The buyer party warms the cache and sees the listing.
    const forBuyer = await service.listingDetail(4, 8);
    expect(forBuyer?.listing.id).toBe(4);
    // A stranger reads the SAME warm cache entry and must still get the
    // missing-id answer: the shared row never widens who sees a directed
    // sale (and the db was asked exactly once, proving the entry WAS shared).
    const forStranger = await service.listingDetail(4, 9);
    expect(forStranger).toBeNull();
    // The seller party still sees it warm too.
    const forSeller = await service.listingDetail(4, 3);
    expect(forSeller?.listing.id).toBe(4);
    expect(listingById).toHaveBeenCalledTimes(1);
  });

  it('sales history is keyed per item and shared across callers', async () => {
    const salesForItem = vi.fn(async (_realm: string, itemId: string) => [{ id: 1, itemId }]);
    const service = makeService({ salesForItem }, { readCache: new WocMarketReadCache() });
    await service.salesHistory('sunblade');
    await service.salesHistory('sunblade');
    await service.salesHistory('dawnaxe');
    expect(salesForItem).toHaveBeenCalledTimes(2);
  });
});

describe('the activity fan-out', () => {
  function countingActivityDb() {
    let inFlight = 0;
    let peak = 0;
    const gauge = async <T>(value: T): Promise<T> => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      // Two microtask hops: enough that a Promise.all fan-out would overlap
      // here, so the peak gauge is decisive against a regression to parallel.
      await Promise.resolve();
      await Promise.resolve();
      inFlight--;
      return value;
    };
    return {
      peak: () => peak,
      db: {
        listingsBySeller: vi.fn((_r: string, _a: number) => gauge([])),
        bidsByAccount: vi.fn((_r: string, _a: number, _l: number) => gauge([])),
        settlementsByAccount: vi.fn((_r: string, _a: number, _l: number) => gauge([])),
        strikeInfo: vi.fn((_a: number) => gauge(null)),
        termsAcceptedAt: vi.fn((_a: number) => gauge(null)),
      },
      gauge,
    };
  }

  it('holds at most ONE read in flight at a time (the pool-hold bound, counted)', async () => {
    const counting = countingActivityDb();
    const service = makeService(counting.db, {
      verifiedWallet: (a) => counting.gauge(a === 7 ? 'wallet-7' : null),
    });
    await service.myActivity(7);
    // All six reads ran...
    expect(counting.db.listingsBySeller).toHaveBeenCalledTimes(1);
    expect(counting.db.termsAcceptedAt).toHaveBeenCalledTimes(1);
    // ...and never two at once: the six-way Promise.all drew six of the
    // shared pool's ten clients per request, which is the H11 finding.
    expect(counting.peak()).toBe(1);
  });

  it('caches the readout per account with the account as the key', async () => {
    const counting = countingActivityDb();
    const cache = new WocMarketReadCache();
    const service = makeService(counting.db, {
      readCache: cache,
      verifiedWallet: (a) => counting.gauge(a === 7 ? 'wallet-7' : null),
    });
    const seven = await service.myActivity(7);
    const eight = await service.myActivity(8);
    expect(seven.wallet).toBe('wallet-7');
    // Account 8's readout is its own entry, never account 7's warm one.
    expect(eight.wallet).toBeNull();
    // A warm re-read serves account 7 without touching the db again.
    const calls = counting.db.strikeInfo.mock.calls.length;
    const sevenAgain = await service.myActivity(7);
    expect(sevenAgain).toBe(seven);
    expect(counting.db.strikeInfo.mock.calls.length).toBe(calls);
  });
});

describe('route-layer busts', () => {
  function handlerFor(method: string, routePath: string) {
    const route = routes.find((r) => r.method === method && r.path === routePath);
    if (!route) throw new Error(`no route ${method} ${routePath}`);
    return route.handler;
  }

  it('adminClearStrikes busts the target account activity readout', async () => {
    const cache = new WocMarketReadCache();
    let generation = 1;
    await cache.myActivity(7, async () => ({ generation }));
    configureWocMarketRuntime({
      service: { adminClearStrikes: async () => ({ ok: true }) } as unknown as WocMarketService,
      readCache: cache,
    });
    const ctx = fakeCtx({
      method: 'POST',
      url: '/admin/api/woc-market/accounts/7/clear-strikes',
    });
    // The require_admin middleware's private state key, set the way the
    // routes suite does (the handler is invoked directly past the onion).
    ctx.state.set('adminTargetId', 7);
    await handlerFor('POST', '/admin/api/woc-market/accounts/:id/clear-strikes')(ctx);
    generation = 2;
    // The bust is what exposes the mutation: no TTL ran out here.
    const readout = await cache.myActivity(7, async () => ({ generation }));
    expect(readout.generation).toBe(2);
  });

  it('adminSuspendListing busts the listings surface', async () => {
    const cache = new WocMarketReadCache();
    let generation = 1;
    await cache.browse(BROWSE_Q, async () => ({ rows: [{ generation }], hasMore: false }));
    await cache.listingRow(4, async () => ({ generation }));
    configureWocMarketRuntime({
      service: { adminSuspendListing: async () => ({ ok: true }) } as unknown as WocMarketService,
      readCache: cache,
    });
    const ctx = fakeCtx({
      method: 'POST',
      url: '/admin/api/woc-market/listings/4/suspend',
    });
    ctx.state.set('adminTargetId', 4);
    await handlerFor('POST', '/admin/api/woc-market/listings/:id/suspend')(ctx);
    generation = 2;
    const page = await cache.browse(BROWSE_Q, async () => ({
      rows: [{ generation }],
      hasMore: false,
    }));
    const row = await cache.listingRow(4, async () => ({ generation }));
    expect((page.rows[0] as { generation: number }).generation).toBe(2);
    expect((row as { generation: number }).generation).toBe(2);
  });

  it('a player mutation (abandon bid) busts the listings surface and the actor readout', async () => {
    const cache = new WocMarketReadCache();
    let generation = 1;
    await cache.browse(BROWSE_Q, async () => ({ rows: [{ generation }], hasMore: false }));
    await cache.myActivity(7, async () => ({ generation }));
    configureWocMarketRuntime({
      service: { abandonBid: async () => ({ ok: true }) } as unknown as WocMarketService,
      readCache: cache,
    });
    const ctx = fakeCtx({
      method: 'POST',
      url: '/api/woc-market/bids/9/abandon',
      params: { id: '9' },
      account: { accountId: 7, scope: 'full' },
    });
    await handlerFor('POST', '/api/woc-market/bids/:id/abandon')(ctx);
    generation = 2;
    const page = await cache.browse(BROWSE_Q, async () => ({
      rows: [{ generation }],
      hasMore: false,
    }));
    const me = await cache.myActivity(7, async () => ({ generation }));
    expect((page.rows[0] as { generation: number }).generation).toBe(2);
    expect(me.generation).toBe(2);
  });

  it('a runtime installed WITHOUT a cache runs every handler bust-free (the rig contract)', async () => {
    configureWocMarketRuntime({
      service: { adminClearStrikes: async () => ({ ok: true }) } as unknown as WocMarketService,
    });
    const ctx = fakeCtx({
      method: 'POST',
      url: '/admin/api/woc-market/accounts/7/clear-strikes',
      params: { id: '7' },
    });
    await expect(
      handlerFor('POST', '/admin/api/woc-market/accounts/:id/clear-strikes')(ctx),
    ).resolves.toBeUndefined();
  });
});

describe('the read limiter', () => {
  const src = readFileSync(
    path.join(__dirname, '..', '..', 'server', 'woc_market_routes.ts'),
    'utf8',
  );
  // Comment-stripped: a pin a comment can satisfy is gameable.
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('every one of the five hot GETs mounts the read policy', () => {
    for (const routePath of [
      '/api/woc-market/status',
      '/api/woc-market/listings',
      '/api/woc-market/listings/:id',
      '/api/woc-market/me',
      '/api/woc-market/history/:itemId',
    ]) {
      const at = code.indexOf(`path: '${routePath}',`);
      expect(at, routePath).toBeGreaterThan(-1);
      const entry = code.slice(at, code.indexOf('handler:', at));
      expect(entry, routePath).toContain('rateLimit(WOC_MARKET_READ_POLICY)');
    }
  });

  it('every successful-mutation bust call survives in the routes source (count-pinned)', () => {
    // 21 = the full bust map: eight mutations at two busts each (listings +
    // the actor readout: create/cancel/placeBid/confirmBond/abandon/buyNow/
    // confirmSettlement/acceptOffer), the two quote refreshes at one (the
    // actor readout), and the three moderation arms at one each. A dropped
    // bust is a stale-forever cache on a money surface, so the count may
    // only be retuned consciously.
    expect(code.match(/readCache\(\)\?\.bust/g)).toHaveLength(21);
  });

  it('answers 429 with retryAfterSeconds past the read budget, and admits under it', async () => {
    setRateLimitClock(() => BASE_MS);
    const middleware = rateLimit(WOC_MARKET_READ_POLICY);
    const ctx = () => fakeCtx({ account: { accountId: 7, scope: 'read' } });
    for (let i = 0; i < WOC_MARKET_READ_MAX_PER_MINUTE; i++) {
      await middleware(ctx(), async () => {});
    }
    await expect(middleware(ctx(), async () => {})).rejects.toMatchObject({
      status: 429,
      code: 'rate_limit.exceeded',
      params: { retryAfterSeconds: 60 },
    });
  });

  it('the retuned budget is 240 (sized in server/ratelimit.ts against the poll cadences)', () => {
    expect(WOC_MARKET_READ_MAX_PER_MINUTE).toBe(240);
    expect(WOC_MARKET_READ_POLICY.limit).toBe(WOC_MARKET_READ_MAX_PER_MINUTE);
    expect(WOC_MARKET_READ_POLICY.keyClass).toBe('ip+account');
  });
});
