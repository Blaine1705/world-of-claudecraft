// The $WOC Exchange route layer (server/woc_market_routes.ts): the wire contract
// over WocMarketService. Two things here are load-bearing beyond "does it
// compile", and the structural http gates cover neither (they assert only that a
// code EXISTS in the catalog, never that a given refusal maps to it):
//
//  1. REFUSAL_ERRORS. Several status choices are security decisions, above all
//     not_yours -> 404 rather than 403: a 403 would confirm that someone else's
//     listing id exists, which is the enumeration the requireOwned loaders exist
//     to prevent. Two more collapse many reasons onto ONE code on purpose
//     (stale_item, not_eligible) so a prober cannot learn which rule refused.
//  2. listingView's field hiding. The PRD requires the exact reserve, both
//     wallets, and the buy-now lock holder to stay server-side. A leak here is
//     silent: the window simply would not render the extra fields, so nothing
//     fails and the data ships anyway.
//
// server/db.ts builds a pg Pool at module load and throws without a URL; the
// routes module imports it transitively. The pool never connects: the handlers
// under test reach only the injected runtime service.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_woc_market_routes';

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  WocBidRow,
  WocBrowseQuery,
  WocListingRow,
  WocMarketRefusal,
  WocMarketService,
} from '../../server/woc_market';
import {
  configureWocMarketRuntime,
  REFUSAL_ERRORS,
  resetWocMarketGuardDbForTests,
  resetWocMarketRuntimeForTests,
  routes,
  wocMarketConfig,
} from '../../server/woc_market_routes';
import { type FakeCtxOverrides, type FakeRes, fakeCtx } from './helpers';

const VIEWER = 7;
const SELLER = 99;
/** Fixed, never Date.now(): buyNowLocked compares the lock expiry to now, so a
 *  far-future constant keeps the "locked" arm deterministic. */
const FAR_FUTURE_MS = 4_000_000_000_000;

function handlerFor(method: string, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`no route registered for ${method} ${path}`);
  return route.handler;
}

/** A read ctx carrying an authenticated account (ctxAccountId reads accountId). */
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

/** Install a partial service: only the members the handler under test reaches. */
function service(overrides: Partial<WocMarketService>): void {
  configureWocMarketRuntime({ service: overrides as unknown as WocMarketService });
}

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

/** Drive the browse handler over one row and return that row's public view. */
async function viewOf(over: Partial<WocListingRow>): Promise<Record<string, unknown>> {
  service({ browse: async () => ({ rows: [listingRow(over)], hasMore: false }) });
  const ctx = readCtx();
  await handlerFor('GET', '/api/woc-market/listings')(ctx);
  const { status, body } = sent(ctx);
  expect(status).toBe(200);
  return (body.listings as Record<string, unknown>[])[0];
}

afterEach(() => {
  resetWocMarketRuntimeForTests();
  resetWocMarketGuardDbForTests();
});

describe('the refusal-to-wire mapping', () => {
  it('answers every refusal with a woc_market.* code and a 4xx/5xx, never English', () => {
    const rows = Object.entries(REFUSAL_ERRORS);
    // The EXACT count, not a floor. A floor of 35 let four union members vanish
    // silently; tsc catches a deleted Record key but not a shrunken union.
    expect(rows).toHaveLength(47);
    for (const [reason, mapped] of rows) {
      expect(mapped.code, reason).toMatch(/^woc_market\./);
      expect(mapped.status, reason).toBeGreaterThanOrEqual(400);
      expect(mapped.status, reason).toBeLessThan(600);
    }
  });

  // EVERY row, pinned to literals. A partial table left 14 of the 39 statuses
  // covered only by the generic 4xx/5xx sweep above, so a flip like
  // already_pending 409 -> 403 or insufficient_balance 400 -> 503 shipped
  // silently and changed the client's retry-vs-refuse branch with it. The
  // exhaustiveness assertion below is what keeps this table honest: a NEW
  // refusal fails until it is listed here with a deliberate status.
  const WIRE: [WocMarketRefusal, number, string][] = [
    // Feature and pricing availability. 503 says "retry", 403 says "not for you":
    // the client branches on exactly this difference.
    ['disabled', 403, 'woc_market.disabled'],
    ['market_paused', 503, 'woc_market.paused'],
    ['quote_unavailable', 503, 'woc_market.quote_unavailable'],
    // Authorization. The caller is known and the action is not theirs.
    ['wallet_required', 403, 'woc_market.wallet_required'],
    ['terms_required', 403, 'woc_market.terms_required'],
    ['account_suspended', 403, 'woc_market.suspended'],
    ['own_listing', 403, 'woc_market.own_listing'],
    // The anti-enumeration pair: a foreign id and an absent id are
    // indistinguishable, and BOTH are 404. A 403 on not_yours confirms the row.
    ['not_found', 404, 'woc_market.not_found'],
    ['not_yours', 404, 'woc_market.not_yours'],
    // Lost races: the request was well formed and the world moved.
    ['not_active', 409, 'woc_market.not_active'],
    ['has_bids', 409, 'woc_market.has_bids'],
    ['already_pending', 409, 'woc_market.already_pending'],
    ['quote_expired', 409, 'woc_market.quote_expired'],
    ['not_pending', 409, 'woc_market.not_pending'],
    ['confirm_failed', 409, 'woc_market.confirm_failed'],
    // A recorded signature is awaiting the chain: refresh/abandon wait (409
    // says retry once the verdict lands, never a terminal refusal).
    ['confirm_in_flight', 409, 'woc_market.confirm_in_flight'],
    ['buy_now_locked', 409, 'woc_market.buy_now_locked'],
    // Seller cancel-intent stands on the listing: no new claims or bids.
    ['cancel_pending', 409, 'woc_market.cancel_pending'],
    // The claimer's own abandon history refuses the claim; it ages out on its
    // own (per-listing cooldown or the hourly cap window), so 409 not 403.
    ['claim_cooldown', 409, 'woc_market.claim_cooldown'],
    // A payment is in flight (buy-now lock claimed or a settlement past
    // 'offered'): the state resolves on its own, so 409 says retry, and the
    // seller learns nothing about the buyer beyond "a payment exists".
    ['settlement_in_flight', 409, 'woc_market.settlement_in_flight'],
    // Plain row contention (bounded lock wait expired or deadlock victim):
    // retry immediately, nothing about the listing is disclosed.
    ['contended', 409, 'woc_market.contended'],
    // An admin sale correction blocked by a standing non-excluded row.
    ['sale_conflict', 409, 'woc_market.sale_conflict'],
    ['cap_reached', 409, 'woc_market.cap_reached'],
    ['signature_reused', 409, 'woc_market.signature_reused'],
    // Bad input the client should have caught.
    ['character_invalid', 400, 'woc_market.character_invalid'],
    ['bid_too_low', 400, 'woc_market.bid_too_low'],
    ['insufficient_balance', 400, 'woc_market.insufficient_balance'],
    ['no_buy_now', 400, 'woc_market.no_buy_now'],
    // Both stale-copy shapes collapse to ONE player-facing code: the remedy is
    // identical (re-select the item), and splitting them would leak which half
    // of the escrow edge refused.
    ['lease_lost', 409, 'woc_market.stale_item'],
    ['stale_copy', 409, 'woc_market.stale_item'],
    // Every eligibility shape collapses to one code too: naming which policy
    // rule refused exposes the policy to probing.
    ['soulbound', 400, 'woc_market.not_eligible'],
    ['quest_item', 400, 'woc_market.not_eligible'],
    ['no_market_list', 400, 'woc_market.not_eligible'],
    ['bound_copy', 400, 'woc_market.not_eligible'],
    ['unknown_item', 400, 'woc_market.not_eligible'],
    ['not_eligible_category', 400, 'woc_market.not_eligible'],
    ['below_quality_floor', 400, 'woc_market.not_eligible'],
    ['excluded_item', 400, 'woc_market.not_eligible'],
    // Malformed listing params share one code; the client validates the fields.
    ['bad_format', 400, 'woc_market.invalid_params'],
    ['bad_start', 400, 'woc_market.invalid_params'],
    ['bad_reserve', 400, 'woc_market.invalid_params'],
    ['bad_buy_now', 400, 'woc_market.invalid_params'],
    ['bad_duration', 400, 'woc_market.invalid_params'],
    ['bad_directed_buyer', 400, 'woc_market.invalid_params'],
    ['recipient_wallet_required', 403, 'woc_market.recipient_wallet_required'],
    ['self_offer', 400, 'woc_market.self_offer'],
    ['offer_expired', 410, 'woc_market.offer_expired'],
  ];

  it('pins EVERY refusal in the map, with no row left to the generic sweep', () => {
    // Both directions: no row in the map is missing from the table, and no row
    // in the table has gone stale. This is what makes the per-row pins below
    // exhaustive rather than a sample.
    expect(WIRE.map(([reason]) => reason).sort()).toEqual(Object.keys(REFUSAL_ERRORS).sort());
  });

  it.each(WIRE)('%s maps to %i %s', (reason, status, code) => {
    expect(REFUSAL_ERRORS[reason]).toEqual({ status, code });
  });

  it('groups reasons onto a shared code ONLY where the collapse is deliberate', () => {
    // The inverse direction of the table above: assert the two intended
    // many-to-one groups are exactly as wide as intended, so a NEW reason
    // silently joining stale_item or not_eligible fails here.
    const withCode = (code: string) =>
      Object.entries(REFUSAL_ERRORS)
        .filter(([, m]) => m.code === code)
        .map(([reason]) => reason)
        .sort();
    expect(withCode('woc_market.stale_item')).toEqual(['lease_lost', 'stale_copy']);
    // The third group. A new reason quietly mapped to invalid_params, which the
    // client renders as one generic message, passed every other test here.
    expect(withCode('woc_market.invalid_params')).toEqual([
      'bad_buy_now',
      'bad_directed_buyer',
      'bad_duration',
      'bad_format',
      'bad_reserve',
      'bad_start',
    ]);
    expect(withCode('woc_market.not_eligible')).toEqual([
      'below_quality_floor',
      'bound_copy',
      'excluded_item',
      'no_market_list',
      'not_eligible_category',
      'quest_item',
      'soulbound',
      'unknown_item',
    ]);
  });

  it('surfaces a service refusal through a real handler as that status and code', async () => {
    // Proof the table is actually WIRED, not just well shaped: the pins above
    // would all pass over a map no handler consulted.
    service({ cancelListing: async () => ({ ok: false, reason: 'has_bids' }) });
    const ctx = fakeCtx({
      method: 'POST',
      url: '/api/woc-market/listings/41/cancel',
      params: { id: '41' },
      account: { accountId: VIEWER, scope: 'full' },
    });
    await expect(
      handlerFor('POST', '/api/woc-market/listings/:id/cancel')(ctx),
    ).rejects.toMatchObject({ status: 409, code: 'woc_market.has_bids' });
  });

  it('maps a stale-copy refusal to the shared code through the same handler', async () => {
    service({ cancelListing: async () => ({ ok: false, reason: 'lease_lost' }) });
    const ctx = fakeCtx({
      method: 'POST',
      url: '/api/woc-market/listings/41/cancel',
      params: { id: '41' },
      account: { accountId: VIEWER, scope: 'full' },
    });
    await expect(
      handlerFor('POST', '/api/woc-market/listings/:id/cancel')(ctx),
    ).rejects.toMatchObject({ status: 409, code: 'woc_market.stale_item' });
  });

  it('forwards cancelPending to the wire when the cancel was accepted as intent', async () => {
    // The wire hop itself: the service arm and the SDK arm each pin their own
    // side, so only this handler decides whether the seller hears "cancelled"
    // or "cancel pending". A regression to a bare { ok: true } body stays
    // green everywhere else.
    service({ cancelListing: async () => ({ ok: true, cancelPending: true }) });
    const ctx = fakeCtx({
      method: 'POST',
      url: '/api/woc-market/listings/41/cancel',
      params: { id: '41' },
      account: { accountId: VIEWER, scope: 'full' },
    });
    await handlerFor('POST', '/api/woc-market/listings/:id/cancel')(ctx);
    expect(sent(ctx)).toEqual({ status: 200, body: { ok: true, cancelPending: true } });
  });

  it('omits cancelPending entirely on a plain completed cancel', async () => {
    service({ cancelListing: async () => ({ ok: true }) });
    const ctx = fakeCtx({
      method: 'POST',
      url: '/api/woc-market/listings/41/cancel',
      params: { id: '41' },
      account: { accountId: VIEWER, scope: 'full' },
    });
    await handlerFor('POST', '/api/woc-market/listings/:id/cancel')(ctx);
    // toEqual on the WHOLE body: the plain arm must not leak a cancelPending
    // key (false would read as intent-refused to a client checking presence).
    expect(sent(ctx)).toEqual({ status: 200, body: { ok: true } });
  });

  it('the admin suspend handler answers settlement-in-flight as 409, other misses as 404', async () => {
    // 'adminTargetId' is the require_admin middleware's private state key; the
    // literal doubles as a pin on that contract.
    service({
      adminSuspendListing: async () => ({ ok: false, reason: 'settlement_in_flight' }),
    });
    const blockedCtx = fakeCtx({
      method: 'POST',
      url: '/admin/api/woc-market/listings/41/suspend',
      params: { id: '41' },
    });
    blockedCtx.state.set('adminTargetId', 41);
    await handlerFor('POST', '/admin/api/woc-market/listings/:id/suspend')(blockedCtx);
    const blocked = sent(blockedCtx);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toEqual({
      success: false,
      data: null,
      error: 'a payment for this listing is settling; retry once it resolves',
    });
    // Plain contention is a retryable 409, never the 404 that would read as
    // "gone" and stop the operator retrying.
    service({ adminSuspendListing: async () => ({ ok: false, reason: 'contended' }) });
    const busyCtx = fakeCtx({
      method: 'POST',
      url: '/admin/api/woc-market/listings/41/suspend',
      params: { id: '41' },
    });
    busyCtx.state.set('adminTargetId', 41);
    await handlerFor('POST', '/admin/api/woc-market/listings/:id/suspend')(busyCtx);
    const busy = sent(busyCtx);
    expect(busy.status).toBe(409);
    expect(busy.body.error).toBe('the listing is busy with another operation; retry now');
    service({ adminSuspendListing: async () => ({ ok: false, reason: 'not_found' }) });
    const missCtx = fakeCtx({
      method: 'POST',
      url: '/admin/api/woc-market/listings/41/suspend',
      params: { id: '41' },
    });
    missCtx.state.set('adminTargetId', 41);
    await handlerFor('POST', '/admin/api/woc-market/listings/:id/suspend')(missCtx);
    const miss = sent(missCtx);
    expect(miss.status).toBe(404);
    expect(miss.body.error).toBe('listing not found or closed');
  });
});

describe('the create-listing format gate', () => {
  /** Drive the create handler and report the params the service was handed, or
   *  the HttpError the schema gate raised before the service was reached. */
  async function createWith(
    format: string,
  ): Promise<{ params: Record<string, unknown> } | { status: number; code: string }> {
    let seen: Record<string, unknown> | null = null;
    service({
      createListing: async (req: { params: Record<string, unknown> }) => {
        seen = req.params;
        return { ok: true, listing: listingRow({ format: format as WocListingRow['format'] }) };
      },
    } as unknown as Partial<WocMarketService>);
    const ctx = fakeCtx({
      method: 'POST',
      url: '/api/woc-market/listings',
      account: { accountId: VIEWER, scope: 'full' },
      body: {
        characterId: 12,
        itemIndex: 0,
        itemId: 'deathlord_warplate',
        format,
        startCents: 2500,
        reserveCents: null,
        buyNowCents: 25_000,
        durationHours: 24,
      },
    });
    try {
      await handlerFor('POST', '/api/woc-market/listings')(ctx);
    } catch (err) {
      const e = err as { status: number; code: string };
      return { status: e.status, code: e.code };
    }
    if (seen === null) throw new Error('the service was never called');
    return { params: seen };
  }

  it('lets a combined listing through to the rules, rather than refusing at the wire', async () => {
    // The route keeps its OWN format allowlist, so the rules core allowing
    // 'auction_buy_now' is not enough on its own: this gate runs first and would
    // have refused it as invalid_params before validListingParams ever saw it.
    // Pinned because the two lists are in different files and only this proves
    // they agree.
    const out = await createWith('auction_buy_now');
    expect(out).toHaveProperty('params');
    expect((out as { params: Record<string, unknown> }).params.format).toBe('auction_buy_now');
  });

  it.each(['auction', 'buy_now'])('still lets %s through', async (format) => {
    const out = await createWith(format);
    expect((out as { params: Record<string, unknown> }).params.format).toBe(format);
  });

  it.each(['dutch', 'AUCTION', '', 'buy-now'])(
    'still refuses %s at the wire, before the service',
    async (format) => {
      expect(await createWith(format)).toEqual({ status: 400, code: 'woc_market.invalid_input' });
    },
  );
});

describe('the public listing view', () => {
  it('hides the exact reserve, both wallets, the seller ids and the lock holder', async () => {
    const listing = await viewOf({});
    // The PRD's hidden-reserve rule: met or not, never the number.
    expect(listing.hasReserve).toBe(true);
    expect(listing).not.toHaveProperty('reserveCents');
    // Wallets and account ids never cross the wire on a public read.
    expect(listing).not.toHaveProperty('sellerWallet');
    expect(listing).not.toHaveProperty('sellerAccount');
    expect(listing).not.toHaveProperty('sellerCharacter');
    // The lock is a boolean; the holder's account id stays server-side.
    expect(listing).not.toHaveProperty('buyNowLockAccount');
    expect(listing).not.toHaveProperty('buyNowLockExpiresMs');
    expect(listing.buyNowLocked).toBe(true);
    // Nothing named like a wallet or a reserve slipped in under another key.
    expect(Object.keys(listing).join(',')).not.toMatch(/wallet|reserveCents|lockAccount/i);
  });

  it('reports reserveMet false while the standing bid is under the reserve', async () => {
    expect((await viewOf({ currentBidCents: 9_999 })).reserveMet).toBe(false);
  });

  it('reports reserveMet true once the standing bid reaches the reserve', async () => {
    // Boundary, not a comfortable margin: the rule is >=, and a > would pass a
    // 10_001 case while failing real sellers at exactly the reserve.
    expect((await viewOf({ currentBidCents: 10_000 })).reserveMet).toBe(true);
  });

  it('reports reserveMet false when no bid stands at all', async () => {
    expect((await viewOf({ currentBidCents: null })).reserveMet).toBe(false);
  });

  it('reports no reserve at all when the seller set none', async () => {
    const listing = await viewOf({ reserveCents: null });
    expect(listing.hasReserve).toBe(false);
    // null, not false: "no reserve" and "reserve unmet" are different states
    // and the window renders different text for each.
    expect(listing.reserveMet).toBeNull();
  });

  it('reports the lock free once its expiry has passed', async () => {
    const listing = await viewOf({ buyNowLockAccount: 1234, buyNowLockExpiresMs: 1_000 });
    expect(listing.buyNowLocked).toBe(false);
  });

  it('reports the lock free when nobody holds it', async () => {
    const listing = await viewOf({ buyNowLockAccount: null, buyNowLockExpiresMs: null });
    expect(listing.buyNowLocked).toBe(false);
  });

  it('reports the lock free on a holder with no expiry (the fourth combination)', async () => {
    // The predicate ANDs two fields; without this case the expiry clause could
    // be dropped and every other arm still passed.
    const listing = await viewOf({ buyNowLockAccount: 1234, buyNowLockExpiresMs: null });
    expect(listing.buyNowLocked).toBe(false);
  });

  it("marks the viewer's own listing so the client can refuse self-bidding early", async () => {
    expect((await viewOf({ sellerAccount: VIEWER })).mine).toBe(true);
    expect((await viewOf({ sellerAccount: SELLER })).mine).toBe(false);
  });

  it('sends the bond for the next legal bid, so the client computes no money', async () => {
    // The client must never derive a token amount (the PRD rule, and src/ui may
    // not import server/): the minimum next bid AND its bond ride the view.
    const listing = await viewOf({ currentBidCents: 5000, startCents: 2500 });
    expect(typeof listing.minNextBidCents).toBe('number');
    expect(listing.minNextBidCents as number).toBeGreaterThan(5000);
    expect(typeof listing.minNextBidBondCents).toBe('number');
    expect(listing.minNextBidBondCents as number).toBeGreaterThan(0);
    // The bond is a fraction of the bid, never the whole bid.
    expect(listing.minNextBidBondCents as number).toBeLessThan(listing.minNextBidCents as number);
  });
});

describe('browse query decoding', () => {
  it.each(['1e400', '1e20', '-1', 'abc', '1.5', '401'])(
    'refuses page=%s rather than passing it to the SQL OFFSET',
    async (page) => {
      service({ browse: async () => ({ rows: [], hasMore: false }) });
      const ctx = readCtx({ url: `/api/woc-market/listings?page=${page}`, query: { page } });
      await expect(handlerFor('GET', '/api/woc-market/listings')(ctx)).rejects.toMatchObject({
        status: 400,
        code: 'woc_market.invalid_input',
      });
    },
  );

  it.each([
    ['sort', 'ends_at;DROP TABLE'],
    ['quality', 'common'],
    ['format', 'dutch'],
  ])('refuses %s outside its allowlist', async (key, value) => {
    service({ browse: async () => ({ rows: [], hasMore: false }) });
    const ctx = readCtx({ query: { [key]: value } });
    await expect(handlerFor('GET', '/api/woc-market/listings')(ctx)).rejects.toMatchObject({
      status: 400,
      code: 'woc_market.invalid_input',
    });
  });

  it('passes a valid page and sort through, and answers hasMore, never a total', async () => {
    let seen: WocBrowseQuery | null = null;
    service({
      browse: async (q) => {
        seen = q;
        return { rows: [], hasMore: true };
      },
    });
    const ctx = readCtx({ query: { page: '2', sort: 'price_desc' } });
    await handlerFor('GET', '/api/woc-market/listings')(ctx);
    expect(seen).toMatchObject({ page: 2, sort: 'price_desc', pageSize: 25 });
    const { body } = sent(ctx);
    expect(body.hasMore).toBe(true);
    expect(body.page).toBe(2);
    // A total would mean the COUNT(*) OVER() came back: the has-more probe
    // replaced it precisely because that read every live listing per page.
    expect(body).not.toHaveProperty('total');
  });

  it('passes hasMore FALSE through as false, never a truthy default', async () => {
    // The true arm alone would pass over `hasMore: x || true`.
    service({ browse: async () => ({ rows: [], hasMore: false }) });
    const ctx = readCtx();
    await handlerFor('GET', '/api/woc-market/listings')(ctx);
    expect(sent(ctx).body.hasMore).toBe(false);
  });

  it('defaults to the ending-soonest sort and page 0 with no query at all', async () => {
    let seen: WocBrowseQuery | null = null;
    service({
      browse: async (q) => {
        seen = q;
        return { rows: [], hasMore: false };
      },
    });
    await handlerFor('GET', '/api/woc-market/listings')(readCtx());
    expect(seen).toMatchObject({ page: 0, sort: 'ending', quality: null, format: null });
  });

  it('caps the itemIds filter instead of building an unbounded IN list', async () => {
    // Collected into an array rather than a nullable local: assigning inside the
    // callback leaves the narrowed type at `null` for the property read below.
    const seen: WocBrowseQuery[] = [];
    service({
      browse: async (q) => {
        seen.push(q);
        return { rows: [], hasMore: false };
      },
    });
    const many = Array.from({ length: 120 }, (_, i) => `item_${i}`).join(',');
    await handlerFor('GET', '/api/woc-market/listings')(readCtx({ query: { itemIds: many } }));
    expect(seen).toHaveLength(1);
    expect(seen[0].itemIds).toHaveLength(50);
  });
});

describe('the :id parameter', () => {
  it.each(['0', '-1', 'abc', '1.5', '1e3', '', '01x'])(
    'refuses id=%s before any service call',
    async (id) => {
      let called = false;
      service({
        listingDetail: async () => {
          called = true;
          return null;
        },
      });
      const ctx = readCtx({ url: `/api/woc-market/listings/${id}`, params: { id } });
      await expect(handlerFor('GET', '/api/woc-market/listings/:id')(ctx)).rejects.toMatchObject({
        status: 400,
      });
      expect(called).toBe(false);
    },
  );

  it('answers 404 for a listing that does not exist', async () => {
    service({ listingDetail: async () => null });
    const ctx = readCtx({ url: '/api/woc-market/listings/41', params: { id: '41' } });
    await expect(handlerFor('GET', '/api/woc-market/listings/:id')(ctx)).rejects.toMatchObject({
      status: 404,
      code: 'woc_market.not_found',
    });
  });

  it('hides the same fields on the single-listing read as on browse', async () => {
    // The detail view is a second call site of listingView; a hand-rolled object
    // here instead would leak exactly the fields browse hides.
    service({ listingDetail: async () => ({ listing: listingRow(), estimate: null }) });
    const ctx = readCtx({ url: '/api/woc-market/listings/41', params: { id: '41' } });
    await handlerFor('GET', '/api/woc-market/listings/:id')(ctx);
    const listing = sent(ctx).body.listing as Record<string, unknown>;
    expect(listing).not.toHaveProperty('sellerWallet');
    expect(listing).not.toHaveProperty('reserveCents');
    expect(listing).not.toHaveProperty('buyNowLockAccount');
    expect(listing.hasReserve).toBe(true);
  });
});

describe('the route table shape', () => {
  it('gates every route behind a guard, and every mutation behind a limiter too', () => {
    const api = routes.filter((r) => r.surface === 'api');
    expect(api).toHaveLength(21);
    for (const route of api) {
      expect(route.middleware?.length ?? 0, `${route.method} ${route.path}`).toBeGreaterThan(0);
    }
    // A mutating route carries the auth guard PLUS a rate limiter: these spend
    // real money and mint quotes, so an unmetered one is a defect.
    const posts = api.filter((r) => r.method === 'POST');
    expect(posts.length).toBeGreaterThanOrEqual(8);
    for (const route of posts) {
      expect(route.middleware?.length ?? 0, route.path).toBeGreaterThanOrEqual(2);
    }
  });

  it('marks the four operator routes admin-surfaced with the admin envelope', () => {
    const admin = routes.filter((r) => r.path.startsWith('/admin/'));
    expect(admin).toHaveLength(4);
    for (const route of admin) {
      expect(route.surface, route.path).toBe('admin');
      expect((route.meta as { envelope?: string } | undefined)?.envelope, route.path).toBe('admin');
    }
  });

  it('gives every player :id route either an owner loader or an explicit public marker', () => {
    // The BOLA rule: an owner-scoped :id route needs the requireOwned loader, and
    // a deliberately public one (anyone may bid on anyone's listing) needs the
    // publicRead marker. Neither means the route is silently unguarded.
    const idRoutes = routes.filter((r) => r.surface === 'api' && r.path.includes('/:'));
    expect(idRoutes).toHaveLength(13);
    for (const route of idRoutes) {
      const meta = route.meta as { requireOwned?: unknown; publicRead?: boolean } | undefined;
      expect(
        meta?.requireOwned !== undefined || meta?.publicRead === true,
        `${route.method} ${route.path} has neither a requireOwned loader nor publicRead`,
      ).toBe(true);
    }
  });

  it('spells the read guard on reads and the active-account guard on mutations', () => {
    // Middleware are opaque closures once built, so the guard TIER is pinned on
    // the source text: a mutation silently downgraded to the read guard would
    // let a read-scope companion token spend money.
    const src = readFileSync(new URL('../../server/woc_market_routes.ts', import.meta.url), 'utf8');
    expect(src).toContain('const readAccount = createReadGuard(');
    expect(src).toContain('const activeAccount = createActiveGuard(');
    // Every player POST route in the table names activeAccount, never readAccount.
    const blocks = src.split(/\n {2}\{\n/).filter((b) => b.includes("method: 'POST'"));
    const playerBlocks = blocks.filter((b) => !b.includes("path: '/admin/"));
    // Derived from the live table, not a floor: an >= 8 floor was satisfiable by
    // the 3 admin blocks plus 5 player ones, so three player POST routes could
    // leave the table and the guard below would silently cover fewer routes.
    const posts = routes.filter((r) => r.surface === 'api' && r.method === 'POST');
    expect(playerBlocks).toHaveLength(posts.length);
    for (const block of blocks) {
      const path = /path: '([^']+)'/.exec(block)?.[1] ?? '?';
      if (path.startsWith('/admin/')) continue;
      expect(block, path).toContain('activeAccount');
      expect(block, path).not.toMatch(/middleware: \[readAccount/);
    }
  });
});

describe('the bid view: bond confirmation is visible to the bidder', () => {
  function bidRow(over: Partial<WocBidRow> = {}): WocBidRow {
    return {
      id: 31,
      listingId: 41,
      account: VIEWER,
      characterId: 12,
      characterName: 'Aurelia',
      wallet: 'BIDDERWALLETPUBKEY1111111111111111111111111',
      amountCents: 5000,
      status: 'pending_bond',
      bondCents: 500,
      bondState: 'pending',
      bondReference: 'bond-ref-1',
      bondQuoteExpiresAtMs: FAR_FUTURE_MS,
      bondSignature: null,
      bondSignatureAtMs: null,
      placedAtMs: 1_799_000_000_000,
      ...over,
    };
  }

  /** Drive the activity handler over one bid and return that bid's public view. */
  async function bidViewOf(over: Partial<WocBidRow>): Promise<Record<string, unknown>> {
    service({
      myActivity: async () => ({
        listings: [],
        bids: [bidRow(over)],
        settlements: [],
        strikes: null,
        termsAcceptedAtMs: null,
        wallet: null,
      }),
    } as unknown as Partial<WocMarketService>);
    const ctx = readCtx({ url: '/api/woc-market/me' });
    await handlerFor('GET', '/api/woc-market/me')(ctx);
    const { status, body } = sent(ctx);
    expect(status).toBe(200);
    return (body.bids as Record<string, unknown>[])[0];
  }

  it('reports a submitted-but-unconfirmed bond as confirming', async () => {
    // The window withholds its Pay Bond control on exactly this. Without the
    // field the client cannot tell "not paid" from "paid, verifying": neither
    // status nor bondState moves when the signature is recorded, and that gap is
    // when a second press would pay the same bond twice.
    expect(await bidViewOf({ bondSignature: 'sig-1' })).toMatchObject({
      status: 'pending_bond',
      bondState: 'pending',
      bondConfirming: true,
    });
  });

  it('reports an unpaid bond as NOT confirming, so the control is offered', async () => {
    expect(await bidViewOf({ bondSignature: null })).toMatchObject({ bondConfirming: false });
  });

  it('stops reporting confirming once the bid leaves pending_bond', async () => {
    // The signature STAYS on the row after the bond is held, so an unscoped
    // `bondSignature !== null` would report a long-settled bond as forever
    // confirming, which on the client means a permanent spinner and a fast poll
    // that never stands down.
    for (const status of ['active', 'won', 'lapsed', 'cancelled', 'defaulted'] as const) {
      const view = await bidViewOf({ status, bondSignature: 'sig-1', bondState: 'held' });
      expect(view.bondConfirming, status).toBe(false);
    }
  });

  it('never puts the signature itself on the wire', async () => {
    // A boolean is all the window needs; the signature is the bidder's on-chain
    // reference and no part of this view's job.
    const view = await bidViewOf({ bondSignature: 'sig-1' });
    expect(Object.keys(view)).not.toContain('bondSignature');
    expect(JSON.stringify(view)).not.toContain('sig-1');
  });
});

describe('the confirming-review bound env knob', () => {
  const KEY = 'WOC_MARKET_CONFIRMING_REVIEW_HOURS';
  const HOUR_MS = 3_600_000;
  afterEach(() => {
    delete process.env[KEY];
  });

  it('defaults to six hours when unset', () => {
    delete process.env[KEY];
    expect(wocMarketConfig().confirmingReviewMs).toBe(6 * HOUR_MS);
  });

  it.each([
    // The empty string is the FAIL-DANGEROUS arm: Number('') is 0, and a
    // zero bound makes every confirming row instantly overdue, parking every
    // in-flight payment in the operator review state.
    [''],
    ['   '],
    ['0'],
    ['-1'],
    ['abc'],
    ['Infinity'],
  ])('falls back to the default on %j', (raw) => {
    process.env[KEY] = raw;
    expect(wocMarketConfig().confirmingReviewMs).toBe(6 * HOUR_MS);
  });

  it('honors a real positive hour value', () => {
    process.env[KEY] = '2';
    expect(wocMarketConfig().confirmingReviewMs).toBe(2 * HOUR_MS);
    process.env[KEY] = '0.5';
    expect(wocMarketConfig().confirmingReviewMs).toBe(30 * 60_000);
  });
});
