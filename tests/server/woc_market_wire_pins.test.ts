// The $WOC Exchange wire-shape pins (server/woc_market_routes.ts): every market
// view serializer's EXACT key set, driven through the real route handlers.
//
// Why key-set equality and not spot checks: the serializers are hand-written
// projections, so a field the service computes can be dropped silently (H8:
// estimateView lost `split`, quoteView lost `signatureRequired`, and the only
// symptom was a blank fee line). A sorted Object.keys equality fails on a
// dropped field AND on a rename, which is the whole point; the expected lists
// are hand-written literals on purpose (a list derived from the serializer
// would pin nothing).
//
// The value tests beside the pins cover the screening rules: the fail/pending
// reason words a view may carry are an enumerable vocabulary (rules.ts), never
// arbitrary service text.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_woc_market_wire_pins';

import { afterEach, describe, expect, it } from 'vitest';
import type {
  WocBidRow,
  WocDirectedOfferRow,
  WocEstimate,
  WocListingRow,
  WocMarketService,
  WocQuoteIntent,
  WocSaleRow,
  WocSettlementRow,
  WocStrikeRow,
} from '../../server/woc_market';
import {
  configureWocMarketRuntime,
  resetWocMarketGuardDbForTests,
  resetWocMarketRuntimeForTests,
  routes,
} from '../../server/woc_market_routes';
import { type FakeCtxOverrides, type FakeRes, fakeCtx } from './helpers';

const VIEWER = 7;
const SELLER = 99;
const FAR_FUTURE_MS = 4_000_000_000_000;

function handlerFor(method: string, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`no route registered for ${method} ${path}`);
  return route.handler;
}

function readCtx(over: FakeCtxOverrides = {}) {
  return fakeCtx({
    method: 'GET',
    url: '/api/woc-market/listings',
    account: { accountId: VIEWER, scope: 'read' },
    ...over,
  });
}

function sent(ctx: { res: unknown }): { status: number; body: Record<string, unknown> } {
  const res = ctx.res as unknown as FakeRes;
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
}

function service(overrides: Partial<WocMarketService>): void {
  configureWocMarketRuntime({ service: overrides as unknown as WocMarketService });
}

afterEach(() => {
  resetWocMarketRuntimeForTests();
  resetWocMarketGuardDbForTests();
});

// ---------------------------------------------------------------------------
// Fixtures: full rows so the serializers see every source field they could
// project (a pin over a partial row could miss a projected-but-undefined key).
// ---------------------------------------------------------------------------

function listingRow(over: Partial<WocListingRow> = {}): WocListingRow {
  return {
    id: 41,
    directedBuyerAccount: null,
    realm: 'Claudemoon',
    sellerAccount: SELLER,
    sellerCharacter: 12,
    sellerName: 'Aurelia',
    sellerWallet: 'SELLERWALLETPUBKEY111111111111111111111111',
    item: { itemId: 'deathlord_warplate', count: 1 },
    itemId: 'deathlord_warplate',
    quality: 'epic',
    format: 'auction_buy_now',
    startCents: 2500,
    reserveCents: 10_000,
    buyNowCents: 25_000,
    offerNext: true,
    status: 'active',
    resolution: null,
    itemDisposed: false,
    currentBidCents: 5000,
    currentBidId: 8,
    endsAtMs: FAR_FUTURE_MS,
    baseEndsAtMs: FAR_FUTURE_MS,
    buyNowLockAccount: 1234,
    buyNowLockExpiresMs: FAR_FUTURE_MS,
    createdAtMs: 1_799_000_000_000,
    cancelRequestedAtMs: null,
    ...over,
  };
}

function bidRow(over: Partial<WocBidRow> = {}): WocBidRow {
  return {
    id: 8,
    listingId: 41,
    account: VIEWER,
    characterId: 3,
    characterName: 'Sable',
    wallet: 'BIDDERWALLETPUBKEY111111111111111111111111',
    amountCents: 5000,
    status: 'pending_bond',
    bondCents: 250,
    bondState: 'pending',
    bondReference: 'WMB_ref1',
    bondQuoteExpiresAtMs: FAR_FUTURE_MS,
    bondSignature: null,
    bondSignatureAtMs: null,
    placedAtMs: 1_799_000_100_000,
    ...over,
  };
}

function settlementRow(over: Partial<WocSettlementRow> = {}): WocSettlementRow {
  return {
    id: 5,
    listingId: 41,
    bidId: null,
    attempt: 0,
    buyerAccount: VIEWER,
    buyerCharacter: 3,
    buyerName: 'Sable',
    buyerWallet: 'BIDDERWALLETPUBKEY111111111111111111111111',
    amountCents: 25_000,
    state: 'offered',
    quoteReference: 'WMS_ref1',
    quoteExpiresAtMs: FAR_FUTURE_MS,
    txSignature: null,
    failReason: null,
    settledAmountBase: null,
    deadlineAtMs: FAR_FUTURE_MS,
    createdAtMs: 1_799_000_200_000,
    ...over,
  };
}

function saleRow(): WocSaleRow {
  return {
    id: 11,
    realm: 'Claudemoon',
    listingId: 41,
    itemId: 'deathlord_warplate',
    item: { itemId: 'deathlord_warplate', count: 1 },
    priceCents: 25_000,
    amountBase: '25000000000',
    sellerAccount: SELLER,
    buyerAccount: VIEWER,
    sellerName: 'Aurelia',
    buyerName: 'Sable',
    excluded: false,
    atMs: 1_799_000_300_000,
  };
}

function strikeRow(): WocStrikeRow {
  return { accountId: VIEWER, strikes: 1, suspendedUntilMs: null };
}

function offerRow(over: Partial<WocDirectedOfferRow> = {}): WocDirectedOfferRow {
  return {
    id: 21,
    realm: 'Claudemoon',
    sellerAccount: SELLER,
    sellerCharacter: 12,
    sellerName: 'Aurelia',
    buyerAccount: VIEWER,
    buyerName: 'Sable',
    itemRef: null,
    itemId: 'deathlord_warplate',
    itemPin: 'pin1',
    usdCents: 25_000,
    status: 'pending',
    listingId: null,
    createdAtMs: 1_799_000_000_000,
    expiresAtMs: FAR_FUTURE_MS,
    buyerAccepted: true,
    sellerAccepted: false,
    listingStatus: null,
    listingResolution: null,
    settlementState: null,
    ...over,
  };
}

function quoteIntent(over: Partial<WocQuoteIntent> = {}): WocQuoteIntent {
  return {
    ok: true,
    reference: 'WMS_ref1',
    transactionBase64: 'dHg=',
    signatureRequired: true,
    amount: { base: '25000000000', tokens: 25 },
    seller: { base: '22500000000', tokens: 22.5 },
    burn: { base: '750000000', tokens: 0.75 },
    treasury: { base: '1750000000', tokens: 1.75 },
    expiresAtMs: FAR_FUTURE_MS,
    reason: null,
    ...over,
  };
}

function estimate(over: Partial<WocEstimate> = {}): WocEstimate {
  return {
    available: true,
    usdCents: 25_000,
    amount: { base: '25000000000', tokens: 25 },
    asOfMs: 1_799_000_400_000,
    split: { sellerCents: 22_500, burnCents: 750, treasuryCents: 1750 },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Drivers: each returns the serialized view straight off the wire body.
// ---------------------------------------------------------------------------

async function browseListingView(): Promise<Record<string, unknown>> {
  service({ browse: async () => ({ rows: [listingRow()], hasMore: false }) });
  const ctx = readCtx();
  await handlerFor('GET', '/api/woc-market/listings')(ctx);
  const { status, body } = sent(ctx);
  expect(status).toBe(200);
  return (body.listings as Record<string, unknown>[])[0];
}

async function meBody(over: {
  bids?: WocBidRow[];
  settlements?: WocSettlementRow[];
}): Promise<Record<string, unknown>> {
  service({
    myActivity: async () => ({
      listings: [listingRow()],
      bids: over.bids ?? [bidRow()],
      settlements: over.settlements ?? [settlementRow()],
      strikes: strikeRow(),
      termsAcceptedAtMs: 1_799_000_000_000,
      wallet: 'BIDDERWALLETPUBKEY111111111111111111111111',
    }),
  });
  const ctx = readCtx({ url: '/api/woc-market/me' });
  await handlerFor('GET', '/api/woc-market/me')(ctx);
  const { status, body } = sent(ctx);
  expect(status).toBe(200);
  return body;
}

async function estimateBody(est: WocEstimate): Promise<Record<string, unknown>> {
  service({ estimate: async () => est });
  const ctx = readCtx({ url: '/api/woc-market/estimate?cents=25000', query: { cents: '25000' } });
  await handlerFor('GET', '/api/woc-market/estimate')(ctx);
  const { status, body } = sent(ctx);
  expect(status).toBe(200);
  return body;
}

async function settlementQuoteBody(intent: WocQuoteIntent): Promise<Record<string, unknown>> {
  service({ settlementQuote: async () => ({ ok: true as const, quote: intent }) });
  const ctx = readCtx({
    method: 'POST',
    url: '/api/woc-market/settlements/5/quote',
    params: { id: '5' },
    body: {},
  });
  await handlerFor('POST', '/api/woc-market/settlements/:id/quote')(ctx);
  const { status, body } = sent(ctx);
  expect(status).toBe(200);
  return body;
}

async function historySaleView(): Promise<Record<string, unknown>> {
  service({ salesHistory: async () => [saleRow()] });
  const ctx = readCtx({
    url: '/api/woc-market/history/deathlord_warplate',
    params: { itemId: 'deathlord_warplate' },
  });
  await handlerFor('GET', '/api/woc-market/history/:itemId')(ctx);
  const { status, body } = sent(ctx);
  expect(status).toBe(200);
  return (body.sales as Record<string, unknown>[])[0];
}

async function offersOfferView(): Promise<Record<string, unknown>> {
  service({ directedOffers: async () => [offerRow()] });
  const ctx = readCtx({ url: '/api/woc-market/offers' });
  await handlerFor('GET', '/api/woc-market/offers')(ctx);
  const { status, body } = sent(ctx);
  expect(status).toBe(200);
  return (body.offers as Record<string, unknown>[])[0];
}

// ---------------------------------------------------------------------------
// The key-set pins
// ---------------------------------------------------------------------------

describe('market wire views expose exactly their pinned key sets', () => {
  it('listingView', async () => {
    expect(Object.keys(await browseListingView()).sort()).toEqual(
      [
        'buyNowCents',
        'buyNowLocked',
        'createdAtMs',
        'currentBidCents',
        'endsAtMs',
        'format',
        'hasReserve',
        'id',
        'item',
        'itemId',
        'mine',
        'minNextBidBondCents',
        'minNextBidCents',
        'offerNext',
        'quality',
        'reserveMet',
        'sellerName',
        'startCents',
        'status',
        'resolution',
      ].sort(),
    );
  });

  it('bidView', async () => {
    const body = await meBody({});
    const view = (body.bids as Record<string, unknown>[])[0];
    expect(Object.keys(view).sort()).toEqual(
      [
        'amountCents',
        'bondCents',
        'bondConfirming',
        'bondQuoteExpiresAtMs',
        'bondReference',
        'bondState',
        'id',
        'listingId',
        'placedAtMs',
        'status',
      ].sort(),
    );
  });

  it('settlementView', async () => {
    const body = await meBody({});
    const view = (body.settlements as Record<string, unknown>[])[0];
    expect(Object.keys(view).sort()).toEqual(
      [
        'amountCents',
        'attempt',
        'createdAtMs',
        'deadlineAtMs',
        'failReason',
        'id',
        'listingId',
        'quoteExpiresAtMs',
        'quoteReference',
        'state',
      ].sort(),
    );
  });

  it('strikeView', async () => {
    const body = await meBody({});
    expect(Object.keys(body.strikes as Record<string, unknown>).sort()).toEqual([
      'strikes',
      'suspendedUntilMs',
    ]);
  });

  it('saleView', async () => {
    expect(Object.keys(await historySaleView()).sort()).toEqual(
      ['atMs', 'buyerName', 'id', 'item', 'itemId', 'priceCents', 'sellerName'].sort(),
    );
  });

  it('quoteView', async () => {
    const body = await settlementQuoteBody(quoteIntent());
    expect(Object.keys(body.quote as Record<string, unknown>).sort()).toEqual(
      [
        'amount',
        'burn',
        'expiresAtMs',
        'reference',
        'seller',
        'signatureRequired',
        'transactionBase64',
        'treasury',
      ].sort(),
    );
  });

  it('estimateView', async () => {
    const body = await estimateBody(estimate());
    expect(Object.keys(body).sort()).toEqual(
      ['amount', 'asOfMs', 'available', 'split', 'usdCents'].sort(),
    );
  });

  it('offerView', async () => {
    expect(Object.keys(await offersOfferView()).sort()).toEqual(
      [
        'buyerAccepted',
        'buyerName',
        'expiresAtMs',
        'id',
        'itemId',
        'listingId',
        'listingResolution',
        'listingStatus',
        'role',
        'sellerAccepted',
        'sellerName',
        'settlementState',
        'status',
        'usdCents',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// The carried values (H8): the service computed them, the player receives them.
// ---------------------------------------------------------------------------

describe('estimateView carries the service fee split and print time', () => {
  it('passes the split legs through byte-for-byte', async () => {
    const body = await estimateBody(estimate());
    expect(body.split).toEqual({ sellerCents: 22_500, burnCents: 750, treasuryCents: 1750 });
    expect(body.asOfMs).toBe(1_799_000_400_000);
  });

  it('sends an explicit null split when the service offered none', async () => {
    const body = await estimateBody(estimate({ split: null, asOfMs: null }));
    expect(body.split).toBeNull();
    expect(body.asOfMs).toBeNull();
  });
});

describe('quoteView carries signatureRequired', () => {
  it('true for a wallet-signed quote', async () => {
    const body = await settlementQuoteBody(quoteIntent({ signatureRequired: true }));
    expect((body.quote as Record<string, unknown>).signatureRequired).toBe(true);
  });

  it('false for the dev economy quote, which no wallet can sign', async () => {
    const body = await settlementQuoteBody(quoteIntent({ signatureRequired: false }));
    expect((body.quote as Record<string, unknown>).signatureRequired).toBe(false);
  });
});

describe('settlementView.failReason is the screened verdict vocabulary', () => {
  it('passes a known verifier verdict through verbatim', async () => {
    const body = await meBody({
      settlements: [settlementRow({ state: 'failed', failReason: 'burn_missing' })],
    });
    expect((body.settlements as Record<string, unknown>[])[0].failReason).toBe('burn_missing');
  });

  it('collapses an unknown reason to the stable other token, never raw text', async () => {
    const body = await meBody({
      settlements: [settlementRow({ state: 'failed', failReason: 'some_new_service_word_v9' })],
    });
    expect((body.settlements as Record<string, unknown>[])[0].failReason).toBe('other');
  });

  it('null stays null', async () => {
    const body = await meBody({ settlements: [settlementRow()] });
    expect((body.settlements as Record<string, unknown>[])[0].failReason).toBeNull();
  });
});

describe('the confirm handlers answer the screened pending verdict', () => {
  async function confirmBondBody(out: {
    ok: true;
    standing: boolean;
    pending?: boolean;
    reason?: string | null;
  }): Promise<Record<string, unknown>> {
    service({ confirmBond: async () => out });
    const ctx = readCtx({
      method: 'POST',
      url: '/api/woc-market/bids/8/bond',
      params: { id: '8' },
      body: { signature: 'a'.repeat(64) },
    });
    await handlerFor('POST', '/api/woc-market/bids/:id/bond')(ctx);
    const { status, body } = sent(ctx);
    expect(status).toBe(200);
    return body;
  }

  async function confirmSettlementBody(out: {
    ok: true;
    state: WocSettlementRow['state'];
    reason?: string | null;
  }): Promise<Record<string, unknown>> {
    service({ confirmSettlement: async () => out });
    const ctx = readCtx({
      method: 'POST',
      url: '/api/woc-market/settlements/5/confirm',
      params: { id: '5' },
      body: { signature: 'a'.repeat(64) },
    });
    await handlerFor('POST', '/api/woc-market/settlements/:id/confirm')(ctx);
    const { status, body } = sent(ctx);
    expect(status).toBe(200);
    return body;
  }

  it('bond: a pending verdict names its reason on the wire', async () => {
    const body = await confirmBondBody({
      ok: true,
      standing: false,
      pending: true,
      reason: 'awaiting_finality',
    });
    expect(body).toEqual({ standing: false, pending: true, reason: 'awaiting_finality' });
  });

  it('bond: a settled verdict answers a null reason', async () => {
    const body = await confirmBondBody({ ok: true, standing: true });
    expect(body).toEqual({ standing: true, pending: false, reason: null });
  });

  it('settlement: a pending verdict names its reason on the wire', async () => {
    const body = await confirmSettlementBody({
      ok: true,
      state: 'confirming',
      reason: 'not_yet_visible',
    });
    expect(body).toEqual({ state: 'confirming', reason: 'not_yet_visible' });
  });

  it('settlement: a decided state answers a null reason', async () => {
    const body = await confirmSettlementBody({ ok: true, state: 'confirmed' });
    expect(body).toEqual({ state: 'confirmed', reason: null });
  });
});
