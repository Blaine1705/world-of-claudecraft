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
import {
  bustWocMarketActivity,
  registerWocMarketReadCacheForBusts,
  WocMarketReadCache,
} from '../../server/woc_market_read_cache';
import {
  configureWocMarketRuntime,
  resetWocMarketRuntimeForTests,
  routes,
} from '../../server/woc_market_routes';
import { WOC_MARKET_RESTRICTED_POLICY } from '../../server/woc_market_rules';
import { ITEMS } from '../../src/sim/data';
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

  it('sales history is keyed per item and shared across callers (known items only)', async () => {
    const [itemA, itemB] = Object.keys(ITEMS);
    const salesForItem = vi.fn(async (_realm: string, itemId: string) => [{ id: 1, itemId }]);
    const service = makeService({ salesForItem }, { readCache: new WocMarketReadCache() });
    await service.salesHistory(itemA);
    await service.salesHistory(itemA);
    await service.salesHistory(itemB);
    expect(salesForItem).toHaveBeenCalledTimes(2);
  });

  it('sales history bypasses the cache for a non-default limit WITHOUT poisoning the shared key', async () => {
    const [itemA] = Object.keys(ITEMS);
    const salesForItem = vi.fn(async (_realm: string, _itemId: string, limit: number) =>
      Array.from({ length: Math.min(limit, 3) }, (_, i) => ({ id: i })),
    );
    const service = makeService({ salesForItem }, { readCache: new WocMarketReadCache() });
    const first = await service.salesHistory(itemA);
    // The odd limit pays its own read...
    await service.salesHistory(itemA, 2);
    expect(salesForItem).toHaveBeenCalledTimes(2);
    // ...and the shared default-limit entry is untouched by it.
    const again = await service.salesHistory(itemA);
    expect(again).toBe(first);
    expect(salesForItem).toHaveBeenCalledTimes(2);
  });

  it('sales history for an UNKNOWN item id never occupies a cache slot', async () => {
    const salesForItem = vi.fn(async () => []);
    const service = makeService({ salesForItem }, { readCache: new WocMarketReadCache() });
    await service.salesHistory('zz_not_a_real_item_zz');
    await service.salesHistory('zz_not_a_real_item_zz');
    // Uncached both times: free-text ids must not evict real items' entries.
    expect(salesForItem).toHaveBeenCalledTimes(2);
  });

  it('an item-filtered browse bypasses the cache (filter lists are caller-minted key entropy)', async () => {
    const browseListings = vi.fn(async () => ({ rows: [], hasMore: false }));
    const service = makeService({ browseListings }, { readCache: new WocMarketReadCache() });
    const filtered = { ...BROWSE_Q, itemIds: ['sunblade_of_dawn'] };
    await service.browse(filtered);
    await service.browse(filtered);
    expect(browseListings).toHaveBeenCalledTimes(2);
    // The unfiltered page still caches beside it.
    await service.browse(BROWSE_Q);
    await service.browse(BROWSE_Q);
    expect(browseListings).toHaveBeenCalledTimes(3);
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

describe('route-layer busts (the full handler-to-surface table)', () => {
  function handlerFor(method: string, routePath: string) {
    const route = routes.find((r) => r.method === method && r.path === routePath);
    if (!route) throw new Error(`no route ${method} ${routePath}`);
    return route.handler;
  }

  /** Fixtures rich enough for the wire views the handlers build. */
  function fullListing(over: Record<string, unknown> = {}): Record<string, unknown> {
    return listingRow({ cancelRequestedAtMs: null, ...over });
  }
  const bidRow = {
    id: 9,
    listingId: 4,
    amountCents: 5000,
    status: 'pending_bond',
    bondCents: 250,
    bondState: 'pending',
    bondReference: null,
    bondQuoteExpiresAtMs: null,
    bondSignature: null,
    placedAtMs: BASE_MS,
  };
  const settlementRow = {
    id: 21,
    listingId: 4,
    attempt: 1,
    amountCents: 5000,
    state: 'offered',
    quoteReference: null,
    quoteExpiresAtMs: null,
    failReason: null,
    deadlineAtMs: BASE_MS + 600_000,
    createdAtMs: BASE_MS,
  };
  const quoteIntent = {
    ok: true,
    reference: 'ref-1',
    transactionBase64: 'dHg=',
    signatureRequired: true,
    amount: { base: '1', tokens: 1 },
    seller: null,
    burn: null,
    treasury: null,
    bondCents: 250,
    expiresAtMs: BASE_MS + 90_000,
  };
  const offerRow = {
    id: 5,
    sellerName: 'Selara',
    buyerName: 'Aldan',
    itemId: 'sunblade',
    usdCents: 5000,
    status: 'pending',
    listingId: null,
    expiresAtMs: BASE_MS + 600_000,
    listingStatus: null,
    listingResolution: null,
    settlementState: null,
    buyerAccepted: true,
    sellerAccepted: false,
    buyerAccount: 7,
    sellerAccount: 8,
  };

  interface BustCase {
    name: string;
    method: string;
    path: string;
    ctx: () => ReturnType<typeof fakeCtx>;
    service: Record<string, unknown>;
    /** Which warmed surfaces the handler must drop; everything else must
     *  STAY WARM (a wrong-kind bust swap is the regression this catches). */
    cold: ReadonlyArray<'listings' | 'me7' | 'me8' | 'history'>;
  }

  const post = (url: string, over: Record<string, unknown> = {}) =>
    fakeCtx({ method: 'POST', url, account: { accountId: 7, scope: 'full' }, ...over });

  const CASES: BustCase[] = [
    {
      name: 'createListing busts the listings surface and the seller readout',
      method: 'POST',
      path: '/api/woc-market/listings',
      ctx: () =>
        post('/api/woc-market/listings', {
          body: {
            characterId: 1,
            itemIndex: 0,
            itemId: 'sunblade',
            format: 'auction',
            startCents: 5000,
            durationHours: 24,
          },
        }),
      service: { createListing: async () => ({ ok: true, listing: fullListing() }) },
      cold: ['listings', 'me7'],
    },
    {
      name: 'cancelListing busts the listings surface and the seller readout',
      method: 'POST',
      path: '/api/woc-market/listings/:id/cancel',
      ctx: () => post('/api/woc-market/listings/4/cancel', { params: { id: '4' } }),
      service: { cancelListing: async () => ({ ok: true }) },
      cold: ['listings', 'me7'],
    },
    {
      name: 'placeBid busts the listings surface and the bidder readout',
      method: 'POST',
      path: '/api/woc-market/listings/:id/bids',
      ctx: () =>
        post('/api/woc-market/listings/4/bids', {
          params: { id: '4' },
          body: { characterId: 1, amountCents: 5000, acceptTerms: true },
        }),
      service: { placeBid: async () => ({ ok: true, bid: bidRow, bond: quoteIntent }) },
      cold: ['listings', 'me7'],
    },
    {
      name: 'bondQuote busts ONLY the bidder readout (no listings churn)',
      method: 'POST',
      path: '/api/woc-market/bids/:id/bond-quote',
      ctx: () => post('/api/woc-market/bids/9/bond-quote', { params: { id: '9' } }),
      service: { refreshBondQuote: async () => ({ ok: true, bond: quoteIntent }) },
      cold: ['me7'],
    },
    {
      name: 'confirmBond busts the listings surface and the bidder readout',
      method: 'POST',
      path: '/api/woc-market/bids/:id/bond',
      ctx: () =>
        post('/api/woc-market/bids/9/bond', {
          params: { id: '9' },
          body: { signature: 'devsig:abc' },
        }),
      service: { confirmBond: async () => ({ ok: true, standing: true }) },
      cold: ['listings', 'me7'],
    },
    {
      name: 'abandonBid busts the listings surface and the bidder readout',
      method: 'POST',
      path: '/api/woc-market/bids/:id/abandon',
      ctx: () => post('/api/woc-market/bids/9/abandon', { params: { id: '9' } }),
      service: { abandonBid: async () => ({ ok: true }) },
      cold: ['listings', 'me7'],
    },
    {
      name: 'buyNow busts the listings surface and the buyer readout',
      method: 'POST',
      path: '/api/woc-market/listings/:id/buy-now',
      ctx: () =>
        post('/api/woc-market/listings/4/buy-now', {
          params: { id: '4' },
          body: { characterId: 1, acceptTerms: true },
        }),
      service: {
        buyNow: async () => ({ ok: true, settlement: settlementRow, quote: quoteIntent }),
      },
      cold: ['listings', 'me7'],
    },
    {
      name: 'settlementQuote busts ONLY the buyer readout',
      method: 'POST',
      path: '/api/woc-market/settlements/:id/quote',
      ctx: () => post('/api/woc-market/settlements/21/quote', { params: { id: '21' } }),
      service: { settlementQuote: async () => ({ ok: true, quote: quoteIntent }) },
      cold: ['me7'],
    },
    {
      name: 'confirmSettlement busts the listings surface and the buyer readout',
      method: 'POST',
      path: '/api/woc-market/settlements/:id/confirm',
      ctx: () =>
        post('/api/woc-market/settlements/21/confirm', {
          params: { id: '21' },
          body: { signature: 'sig123' },
        }),
      service: { confirmSettlement: async () => ({ ok: true, state: 'confirmed', reason: null }) },
      cold: ['listings', 'me7'],
    },
    {
      name: 'acceptOffer with an escrowed listing busts BOTH parties',
      method: 'POST',
      path: '/api/woc-market/offers/:id/accept',
      ctx: () =>
        post('/api/woc-market/offers/5/accept', {
          params: { id: '5' },
          body: { characterId: 1 },
        }),
      service: {
        acceptDirectedOffer: async () => ({
          ok: true,
          listing: fullListing({ sellerAccount: 8, directedBuyerAccount: 7 }),
        }),
      },
      cold: ['listings', 'me7', 'me8'],
    },
    {
      name: 'createOffer busts nothing (offers are not cached)',
      method: 'POST',
      path: '/api/woc-market/offers',
      ctx: () =>
        post('/api/woc-market/offers', {
          body: {
            characterId: 1,
            sellerCharacterName: 'Selara',
            usdCents: 5000,
            itemId: 'sunblade',
            acceptTerms: true,
          },
        }),
      service: { createDirectedOffer: async () => ({ ok: true, offer: offerRow }) },
      cold: [],
    },
    {
      name: 'declineOffer busts nothing',
      method: 'POST',
      path: '/api/woc-market/offers/:id/decline',
      ctx: () => post('/api/woc-market/offers/5/decline', { params: { id: '5' } }),
      service: { resolveDirectedOffer: async () => ({ ok: true }) },
      cold: [],
    },
    {
      name: 'withdrawOffer busts nothing',
      method: 'POST',
      path: '/api/woc-market/offers/:id/withdraw',
      ctx: () => post('/api/woc-market/offers/5/withdraw', { params: { id: '5' } }),
      service: { resolveDirectedOffer: async () => ({ ok: true }) },
      cold: [],
    },
    {
      name: 'adminSuspendListing busts the listings surface and nothing player-scoped',
      method: 'POST',
      path: '/admin/api/woc-market/listings/:id/suspend',
      ctx: () => {
        const ctx = fakeCtx({ method: 'POST', url: '/admin/api/woc-market/listings/4/suspend' });
        ctx.state.set('adminTargetId', 4);
        return ctx;
      },
      service: { adminSuspendListing: async () => ({ ok: true }) },
      cold: ['listings'],
    },
    {
      name: 'adminSaleExcluded busts HISTORY, never the listings surface',
      method: 'POST',
      path: '/admin/api/woc-market/sales/:id/excluded',
      ctx: () => {
        const ctx = fakeCtx({
          method: 'POST',
          url: '/admin/api/woc-market/sales/6/excluded',
          body: { excluded: true },
        });
        ctx.state.set('adminTargetId', 6);
        return ctx;
      },
      service: { adminSetSaleExcluded: async () => ({ ok: true }) },
      cold: ['history'],
    },
    {
      name: 'adminClearStrikes busts the target readout only',
      method: 'POST',
      path: '/admin/api/woc-market/accounts/:id/clear-strikes',
      ctx: () => {
        const ctx = fakeCtx({
          method: 'POST',
          url: '/admin/api/woc-market/accounts/7/clear-strikes',
        });
        ctx.state.set('adminTargetId', 7);
        return ctx;
      },
      service: { adminClearStrikes: async () => ({ ok: true }) },
      cold: ['me7'],
    },
  ];

  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const cache = new WocMarketReadCache();
      let generation = 1;
      // Warm every surface at generation 1, then bump: a surface that still
      // answers 1 stayed warm, one that answers 2 was busted. No TTL is in
      // play, so the bust alone decides.
      const probes = {
        browse: () => cache.browse(BROWSE_Q, async () => ({ generation })),
        row: () => cache.listingRow(4, async () => ({ generation })),
        me7: () => cache.myActivity(7, async () => ({ generation })),
        me8: () => cache.myActivity(8, async () => ({ generation })),
        history: () => cache.sales('sunblade', async () => ({ generation })),
      } as const;
      for (const warm of Object.values(probes)) await warm();
      configureWocMarketRuntime({
        service: testCase.service as unknown as WocMarketService,
        readCache: cache,
      });
      await handlerFor(testCase.method, testCase.path)(testCase.ctx());
      generation = 2;
      const expectGen = async (
        probe: () => Promise<unknown>,
        surface: 'listings' | 'me7' | 'me8' | 'history',
      ) => {
        const value = (await probe()) as { generation?: number } & {
          rows?: { generation: number }[];
        };
        const got = value.rows ? value.rows[0]?.generation : value.generation;
        expect(got, `${surface} for ${testCase.name}`).toBe(
          testCase.cold.includes(surface) ? 2 : 1,
        );
      };
      await expectGen(probes.browse, 'listings');
      await expectGen(probes.row, 'listings');
      await expectGen(probes.me7, 'me7');
      await expectGen(probes.me8, 'me8');
      await expectGen(probes.history, 'history');
    });
  }

  it('every bust call in the routes source is accounted for (count tripwire)', () => {
    const src = readFileSync(
      path.join(__dirname, '..', '..', 'server', 'woc_market_routes.ts'),
      'utf8',
    );
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // 23 = eight mutations at two busts each, the two quote refreshes at one,
    // the three moderation arms at one each, and acceptOffer's two extra
    // party busts. The TABLE above is the behavioral authority (it catches a
    // wrong-kind swap); this count only catches a call deleted wholesale.
    expect(code.match(/readCache\(\)\?\.bust/g)).toHaveLength(23);
  });

  it('handlers render cleanly over FROZEN cached values, twice in a row', async () => {
    // The freeze turns an in-place mutation by a handler into a thrown
    // TypeError on the SECOND request of a TTL window; this drives the two
    // read handlers through a REAL service and REAL cache to prove none
    // mutates today.
    const cache = new WocMarketReadCache();
    const service = makeService(
      {
        browseListings: async () => ({ rows: [fullListing()], hasMore: false }),
        listingsBySeller: async () => [fullListing()],
        bidsByAccount: async () => [{ ...bidRow, itemId: 'sunblade' }],
        settlementsByAccount: async () => [{ ...settlementRow, itemId: 'sunblade' }],
        strikeInfo: async () => ({ strikes: 1, suspendedUntilMs: null }),
        termsAcceptedAt: async () => BASE_MS,
      },
      { readCache: cache },
    );
    configureWocMarketRuntime({ service, readCache: cache });
    for (const [method, routePath, url] of [
      ['GET', '/api/woc-market/listings', '/api/woc-market/listings'],
      ['GET', '/api/woc-market/me', '/api/woc-market/me'],
    ] as const) {
      for (let round = 0; round < 2; round++) {
        const ctx = fakeCtx({ url, account: { accountId: 7, scope: 'read' } });
        await handlerFor(method, routePath)(ctx);
        const res = ctx.res as unknown as { statusCode: number };
        expect(res.statusCode, `${routePath} round ${round + 1}`).toBe(200);
      }
    }
  });
});

describe('the sweep segment plan', () => {
  it('pins which segments run locked: the money arm is locked, the confirm polls are not', () => {
    const service = makeService({});
    const plan = service.sweepSegments();
    expect(plan).not.toBeNull();
    // The exact plan shape. chain-polls UNLOCKED is the H11 fix (read-only
    // confirm round trips must not camp the lock client); bond-payouts
    // LOCKED is the money-safety call (bondsDue is an unclaimed read, and a
    // refund RPC must have game-side exclusion, not just the service's
    // reference idempotence). Flipping either direction is a conscious
    // retune of that reasoning, never a drive-by.
    expect(plan?.segments.map((s) => [s.name, s.locked])).toEqual([
      ['expiry', true],
      ['chain-polls', false],
      ['delivery', true],
      ['bond-payouts', true],
    ]);
  });

  it('answers null when the market is disabled', () => {
    const service = makeService({});
    // makeService enables the market; build a disabled twin inline.
    const disabled = new RealWocMarketService({
      ...(service as unknown as { deps: WocMarketDeps }).deps,
      config: {
        enabled: false,
        realm: REALM,
        policy: WOC_MARKET_RESTRICTED_POLICY,
        confirmingReviewMs: 6 * 3600 * 1000,
      },
    });
    expect(disabled.sweepSegments()).toBeNull();
  });

  it('an aborted pass still reports once, with zero-scored arms that can never read as saturated', () => {
    const passes: { stats: Record<string, number>; saturated: readonly string[] }[] = [];
    const clock = BASE_MS;
    const service = new RealWocMarketService({
      db: {} as unknown as WocMarketDb,
      economy: createDevWocMarketEconomy(() => clock),
      custody: {} as unknown as WocMarketDeps['custody'],
      verifiedWallet: async () => null,
      balanceTokens: async () => null,
      stepUpDevSig: true,
      config: {
        enabled: true,
        realm: REALM,
        policy: WOC_MARKET_RESTRICTED_POLICY,
        confirmingReviewMs: 6 * 3600 * 1000,
      },
      onSweepPass: (stats, saturated) => {
        passes.push({ stats: stats as unknown as Record<string, number>, saturated });
      },
      now: () => clock,
    });
    void clock;
    const plan = service.sweepSegments();
    // A lost-lock abort runs NO segment; finish still reports exactly once.
    plan?.finish();
    expect(passes).toHaveLength(1);
    expect(Object.values(passes[0].stats).every((n) => n === 0)).toBe(true);
    expect(passes[0].saturated).toEqual([]);
  });
});

describe('the bond-payout budget', () => {
  it('a degraded service stops the walk at the wall-clock budget; the rest stays due', async () => {
    let clock = BASE_MS;
    const bondsDue = vi.fn(async () => [
      { id: 1, bondReference: 'woc_bond:1', bondState: 'refund_due' },
      { id: 2, bondReference: 'woc_bond:2', bondState: 'refund_due' },
      { id: 3, bondReference: 'woc_bond:3', bondState: 'refund_due' },
    ]);
    const setBondState = vi.fn(async () => true);
    const refundBond = vi.fn(async () => {
      // Each RPC rides its full timeout under the brownout this models.
      clock += 31_000;
      return { done: true, reason: null };
    });
    const passes: Record<string, number>[] = [];
    const service = new RealWocMarketService({
      db: { bondsDue, setBondState } as unknown as WocMarketDb,
      economy: {
        refundBond,
        forfeitBond: refundBond,
      } as unknown as WocMarketDeps['economy'],
      custody: {} as unknown as WocMarketDeps['custody'],
      verifiedWallet: async () => null,
      balanceTokens: async () => null,
      stepUpDevSig: true,
      config: {
        enabled: true,
        realm: REALM,
        policy: WOC_MARKET_RESTRICTED_POLICY,
        confirmingReviewMs: 6 * 3600 * 1000,
      },
      onSweepPass: (stats) => {
        passes.push(stats as unknown as Record<string, number>);
      },
      onSweepError: () => {},
      now: () => clock,
    });
    const plan = service.sweepSegments();
    const payouts = plan?.segments.find((seg) => seg.name === 'bond-payouts');
    expect(payouts?.locked).toBe(true);
    await payouts?.run();
    plan?.finish();
    // One RPC consumed the whole budget, so the walk stopped: the LOCKED
    // segment's hold is bounded near the budget plus one timeout, never the
    // whole batch, and rows 2 and 3 stay durably due for the next pass.
    expect(refundBond).toHaveBeenCalledTimes(1);
    expect(setBondState).toHaveBeenCalledTimes(1);
    // Rows WALKED, not fetched: a budget break must not read as a drained
    // batch (3 fetched would satisfy nothing here; the stat says 1).
    expect(passes[0]?.bonds).toBe(1);
  });
});

describe('the read limiter', () => {
  it('mounts the read policy on the five hot GETs and the offers poll, BY IDENTITY', () => {
    // The rateLimit factory tags its middleware with the policy name, so
    // this pin survives route-table reordering (the source-scan shape did
    // not) and proves the mounted object, not a string in a comment.
    const policyOf = (method: string, routePath: string): string | undefined => {
      const route = routes.find((r) => r.method === method && r.path === routePath);
      if (!route) throw new Error(`no route ${method} ${routePath}`);
      for (const mw of route.middleware ?? []) {
        const name = (mw as { rateLimitPolicyName?: string }).rateLimitPolicyName;
        if (name !== undefined) return name;
      }
      return undefined;
    };
    for (const routePath of [
      '/api/woc-market/status',
      '/api/woc-market/listings',
      '/api/woc-market/listings/:id',
      '/api/woc-market/me',
      '/api/woc-market/history/:itemId',
      '/api/woc-market/offers',
    ]) {
      expect(policyOf('GET', routePath), routePath).toBe('woc_market_read');
    }
    // The enumeration-shaped read stays on the SMALLER bucket on purpose:
    // trade-partner answers "does this character exist and can it be paid",
    // and the widened polling budget must not widen harvesting.
    expect(policyOf('GET', '/api/woc-market/trade-partner')).toBe('woc_market_quote');
    expect(policyOf('GET', '/api/woc-market/estimate')).toBe('woc_market_quote');
  });

  it('all read-bucket GETs share ONE budget (exhausting via one route refuses the next)', async () => {
    setRateLimitClock(() => BASE_MS);
    const viaListings = rateLimit(WOC_MARKET_READ_POLICY);
    const viaMe = rateLimit(WOC_MARKET_READ_POLICY);
    const ctx = () => fakeCtx({ account: { accountId: 7, scope: 'read' } });
    for (let i = 0; i < WOC_MARKET_READ_MAX_PER_MINUTE; i++) {
      await viaListings(ctx(), async () => {});
    }
    // A SEPARATE middleware instance over the same policy: the sliding
    // window is the shared 'read' action bucket, so the refusal crosses
    // routes (a per-route policy object would double the effective budget).
    await expect(viaMe(ctx(), async () => {})).rejects.toMatchObject({
      status: 429,
      code: 'rate_limit.exceeded',
    });
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

  it('the retuned budget is 240 and the policy is TIER-1 ONLY (no pg write per allowed poll)', () => {
    expect(WOC_MARKET_READ_MAX_PER_MINUTE).toBe(240);
    expect(WOC_MARKET_READ_POLICY.limit).toBe(WOC_MARKET_READ_MAX_PER_MINUTE);
    expect(WOC_MARKET_READ_POLICY.keyClass).toBe('ip+account');
    // tier2 'none' is the load-bearing half of the retune: 'global' spends
    // two rate_limits UPSERTs per ALLOWED request, which on the polled
    // surface would out-cost the reads the caches remove. Flipping this
    // back is a measured decision, not a tidy-up.
    expect(WOC_MARKET_READ_POLICY.tier2).toBe('none');
  });
});

describe('production wiring (server/main.ts, source-pinned)', () => {
  const src = readFileSync(path.join(__dirname, '..', '..', 'server', 'main.ts'), 'utf8');
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('one read-cache instance reaches the service, the runtime, and the wallet-bust registration', () => {
    // The failure this pins: two instances (or a dropped wiring) mean busts
    // silently miss on a money surface while every unit test stays green.
    expect(code.match(/new WocMarketReadCache\(\)/g)).toHaveLength(1);
    expect(code).toContain('readCache: wocMarketReadCache,');
    expect(code).toContain(
      'configureWocMarketRuntime({ service: wocMarketService, readCache: wocMarketReadCache })',
    );
    expect(code).toContain('registerWocMarketReadCacheForBusts(wocMarketReadCache)');
    expect(code).toContain('readCaches: wocMarketReadCache.stats()');
  });

  it('the sweep shell gets the segment plan and the watchdog, and shutdown stops the watchdog', () => {
    expect(code).toContain('plan: () => wocMarketService.sweepSegments()');
    expect(code).toContain('watchdog: wocMarketSweepWatchdog,');
    expect(code).toContain('wocMarketSweepWatchdog.stop()');
  });

  it('the wallet-link writes bust the activity readout (server/db.ts, source-pinned)', () => {
    const dbSrc = readFileSync(path.join(__dirname, '..', '..', 'server', 'db.ts'), 'utf8')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const link = dbSrc.slice(
      dbSrc.indexOf('export async function linkWalletToAccount'),
      dbSrc.indexOf('export async function unlinkWallet'),
    );
    const unlink = dbSrc.slice(
      dbSrc.indexOf('export async function unlinkWallet'),
      dbSrc.indexOf('export async function unlinkWallet') + 400,
    );
    expect(link).toContain('bustWocMarketActivity(accountId)');
    expect(unlink).toContain('bustWocMarketActivity(accountId)');
  });

  it('the drift-warn channel judges through the SAME exported sets the wire screens use', () => {
    const warnSrc = readFileSync(
      path.join(__dirname, '..', '..', 'server', 'woc_market_drift_warn.ts'),
      'utf8',
    );
    expect(warnSrc).toContain('WOC_MARKET_WIRE_PENDING_SET');
    expect(warnSrc).toContain('WOC_MARKET_WIRE_FAIL_SET');
    expect(warnSrc).toContain("from './woc_market_rules'");
  });
});

describe('cross-domain wallet busts', () => {
  it('bustWocMarketActivity reaches the registered instance and only the named account', async () => {
    const cache = new WocMarketReadCache();
    registerWocMarketReadCacheForBusts(cache);
    try {
      let generation = 1;
      await cache.myActivity(7, async () => ({ generation }));
      await cache.myActivity(8, async () => ({ generation }));
      generation = 2;
      bustWocMarketActivity(7);
      expect((await cache.myActivity(7, async () => ({ generation }))).generation).toBe(2);
      expect((await cache.myActivity(8, async () => ({ generation }))).generation).toBe(1);
    } finally {
      registerWocMarketReadCacheForBusts(null);
    }
    // Unregistered: a bust is a safe no-op (boot ordering, tests).
    expect(() => bustWocMarketActivity(7)).not.toThrow();
  });
});

describe('cache bounds under key churn', () => {
  it('the browse refresh registry stays bounded under hundreds of distinct keys', async () => {
    const cache = new WocMarketReadCache();
    for (let page = 0; page < 300; page++) {
      await cache.browse({ ...BROWSE_Q, page }, async () => ({ rows: [], hasMore: false }));
    }
    const stats = cache.stats().browse;
    // The LRU holds its cap; the thunk registry is pruned against it at the
    // documented 2x bound, so per-request closures can never accumulate.
    expect(stats.entries).toBe(128);
    expect(stats.refreshRegistry).toBeLessThanOrEqual(257);
    expect(stats.evictions).toBeGreaterThan(0);
  });
});
