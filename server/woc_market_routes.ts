// $WOC Exchange route layer: the RouteDef surface over WocMarketService
// (docs/prd/woc/marketplace.md). Registry-only, no legacy twin (the deeds.ts
// precedent). The business rules stay in woc_market.ts; this module owns the
// wire: schema checks, the refusal-to-code mapping, response views that hide
// non-public fields (the exact reserve, wallets, lock holders), the per-action
// limiters, and the operator moderation arms on the /admin/api surface.
//
// Feature config follows the domain-getter pattern (server/http/config.ts
// exception 3, the STEAM_ENABLED shape): WOC_MARKET_ENABLED gates the whole
// surface fail-closed, and the dev economy additionally requires
// ALLOW_DEV_COMMANDS=1 (wired in main.ts, never here).

import type { ItemInstancePayload } from '../src/sim/types';
import { adminDb } from './admin';
import { accountAndScopeForToken, moderationStatusForAccount } from './db';
import { ctxAccountId } from './http/context';
import type { ErrorCode } from './http/error_codes';
import { HttpError } from './http/errors';
import { createActiveGuard, createReadGuard } from './http/middleware/bearer_active_guard';
import { withBody } from './http/middleware/body';
import {
  rateLimit,
  WOC_MARKET_BID_POLICY,
  WOC_MARKET_CONFIRM_POLICY,
  WOC_MARKET_LIST_POLICY,
  WOC_MARKET_QUOTE_POLICY,
  WOC_MARKET_READ_POLICY,
} from './http/middleware/rate_limit';
import type { AdminAuthDb } from './http/middleware/require_admin';
import {
  adminTargetId,
  createRequireAdmin,
  requireAdminTarget,
} from './http/middleware/require_admin';
import { requireOwned } from './http/middleware/require_owned';
import type { Ctx, RouteDef } from './http/types';
import { json } from './http_util';
import { REALM } from './realm';
import type {
  WocBidRow,
  WocBrowseQuery,
  WocEstimate,
  WocListingRow,
  WocMarketConfig,
  WocMarketRefusal,
  WocMarketService,
  WocQuoteIntent,
  WocSaleRow,
  WocSettlementRow,
  WocStrikeRow,
} from './woc_market';
import {
  bondCents,
  minNextBidCents,
  WOC_MARKET_DURATION_HOURS,
  WOC_MARKET_MAX_PRICE_CENTS,
  WOC_MARKET_MIN_PRICE_CENTS,
  WOC_MARKET_RESTRICTED_POLICY,
  WOC_MARKET_SETTLEMENT_WINDOW_SECONDS,
  type WocListingFormat,
} from './woc_market_rules';

// ---------------------------------------------------------------------------
// Feature config (the domain-getter pattern; read per call so tests can flip)
// ---------------------------------------------------------------------------

/** Deepest browse page a client may request (25 per page). */
const MAX_BROWSE_PAGE = 400;

export function wocMarketConfig(): WocMarketConfig {
  const excluded = (process.env.WOC_MARKET_EXCLUDED_ITEM_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return {
    enabled: process.env.WOC_MARKET_ENABLED === '1',
    realm: REALM,
    policy:
      excluded.length === 0
        ? WOC_MARKET_RESTRICTED_POLICY
        : { ...WOC_MARKET_RESTRICTED_POLICY, excludedItemIds: new Set(excluded) },
  };
}

// ---------------------------------------------------------------------------
// Runtime injection (the deeds.ts seam: main.ts wires the service after the
// GameServer exists; unit tests install a fake).
// ---------------------------------------------------------------------------

export interface WocMarketRuntime {
  service: WocMarketService;
}

let runtime: WocMarketRuntime | null = null;

export function configureWocMarketRuntime(rt: WocMarketRuntime): void {
  runtime = rt;
}

export function resetWocMarketRuntimeForTests(): void {
  runtime = null;
}

function useService(): WocMarketService {
  if (runtime === null) {
    throw new Error('woc_market runtime is not configured; call configureWocMarketRuntime');
  }
  return runtime.service;
}

// ---------------------------------------------------------------------------
// Refusal -> stable code (the server emits the CODE, never English)
// ---------------------------------------------------------------------------

/** The refusal-to-wire mapping. EXPORTED so tests can pin it exhaustively:
 *  several of these status choices are security decisions (not_yours is a 404
 *  for anti-enumeration, never a 403), and a hand-copied table in the test
 *  would drift the moment a row changed. */
export const REFUSAL_ERRORS: Record<WocMarketRefusal, { status: number; code: ErrorCode }> = {
  disabled: { status: 403, code: 'woc_market.disabled' },
  market_paused: { status: 503, code: 'woc_market.paused' },
  wallet_required: { status: 403, code: 'woc_market.wallet_required' },
  terms_required: { status: 403, code: 'woc_market.terms_required' },
  account_suspended: { status: 403, code: 'woc_market.suspended' },
  character_invalid: { status: 400, code: 'woc_market.character_invalid' },
  not_found: { status: 404, code: 'woc_market.not_found' },
  not_yours: { status: 404, code: 'woc_market.not_yours' },
  not_active: { status: 409, code: 'woc_market.not_active' },
  own_listing: { status: 403, code: 'woc_market.own_listing' },
  has_bids: { status: 409, code: 'woc_market.has_bids' },
  bid_too_low: { status: 400, code: 'woc_market.bid_too_low' },
  already_pending: { status: 409, code: 'woc_market.already_pending' },
  insufficient_balance: { status: 400, code: 'woc_market.insufficient_balance' },
  quote_unavailable: { status: 503, code: 'woc_market.quote_unavailable' },
  quote_expired: { status: 409, code: 'woc_market.quote_expired' },
  not_pending: { status: 409, code: 'woc_market.not_pending' },
  confirm_failed: { status: 409, code: 'woc_market.confirm_failed' },
  buy_now_locked: { status: 409, code: 'woc_market.buy_now_locked' },
  no_buy_now: { status: 400, code: 'woc_market.no_buy_now' },
  cap_reached: { status: 409, code: 'woc_market.cap_reached' },
  lease_lost: { status: 409, code: 'woc_market.stale_item' },
  signature_reused: { status: 409, code: 'woc_market.signature_reused' },
  stale_copy: { status: 409, code: 'woc_market.stale_item' },
  // Custody extraction refusals: a stale reference re-selects; the rest are
  // eligibility shapes the client pre-filters but the server owns.
  soulbound: { status: 400, code: 'woc_market.not_eligible' },
  quest_item: { status: 400, code: 'woc_market.not_eligible' },
  no_market_list: { status: 400, code: 'woc_market.not_eligible' },
  bound_copy: { status: 400, code: 'woc_market.not_eligible' },
  unknown_item: { status: 400, code: 'woc_market.not_eligible' },
  not_eligible_category: { status: 400, code: 'woc_market.not_eligible' },
  below_quality_floor: { status: 400, code: 'woc_market.not_eligible' },
  excluded_item: { status: 400, code: 'woc_market.not_eligible' },
  bad_format: { status: 400, code: 'woc_market.invalid_params' },
  bad_start: { status: 400, code: 'woc_market.invalid_params' },
  bad_reserve: { status: 400, code: 'woc_market.invalid_params' },
  bad_buy_now: { status: 400, code: 'woc_market.invalid_params' },
  bad_duration: { status: 400, code: 'woc_market.invalid_params' },
};

function throwRefusal(reason: WocMarketRefusal): never {
  const mapped = REFUSAL_ERRORS[reason] ?? { status: 400, code: 'woc_market.invalid_input' };
  throw new HttpError(mapped.status, mapped.code);
}

const invalid = (): never => {
  throw new HttpError(400, 'woc_market.invalid_input');
};

// ---------------------------------------------------------------------------
// Decode helpers (strict, no coercion surprises)
// ---------------------------------------------------------------------------

function intField(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalid();
  }
  return value as number;
}

function optionalCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return intField(value, WOC_MARKET_MIN_PRICE_CENTS, WOC_MARKET_MAX_PRICE_CENTS);
}

function idParam(ctx: Ctx): number {
  const raw = ctx.params.id;
  const id = Number(raw);
  if (!/^\d+$/.test(raw ?? '') || !Number.isSafeInteger(id) || id < 1) invalid();
  return id;
}

function bodyOf(ctx: Ctx): Record<string, unknown> {
  const body = ctx.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) invalid();
  return body as Record<string, unknown>;
}

function stringField(value: unknown, maxLen: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLen) invalid();
  return value as string;
}

function optionalString(value: unknown, maxLen: number): string | null {
  if (value === null || value === undefined) return null;
  return stringField(value, maxLen);
}

/** An instance payload from the client is opaque JSON the sim compares
 *  structurally; only its container shape is checked here. */
function optionalInstance(value: unknown): ItemInstancePayload | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as ItemInstancePayload;
}

// ---------------------------------------------------------------------------
// Wire views. Public listing views HIDE the exact reserve (only met/not met,
// per the PRD), the wallets, and the lock holder.
// ---------------------------------------------------------------------------

function listingView(row: WocListingRow, viewerAccount: number | null): Record<string, unknown> {
  const reserveMet =
    row.reserveCents === null
      ? null
      : row.currentBidCents !== null && row.currentBidCents >= row.reserveCents;
  return {
    id: row.id,
    item: row.item,
    itemId: row.itemId,
    quality: row.quality,
    format: row.format,
    sellerName: row.sellerName,
    mine: viewerAccount !== null && row.sellerAccount === viewerAccount,
    startCents: row.startCents,
    hasReserve: row.reserveCents !== null,
    reserveMet,
    buyNowCents: row.buyNowCents,
    offerNext: row.offerNext,
    status: row.status,
    resolution: row.resolution,
    currentBidCents: row.currentBidCents,
    minNextBidCents: minNextBidCents(row.currentBidCents, row.startCents),
    minNextBidBondCents: bondCents(minNextBidCents(row.currentBidCents, row.startCents)),
    buyNowLocked:
      row.buyNowLockAccount !== null &&
      row.buyNowLockExpiresMs !== null &&
      row.buyNowLockExpiresMs > Date.now(),
    endsAtMs: row.endsAtMs,
    createdAtMs: row.createdAtMs,
  };
}

function bidView(row: WocBidRow): Record<string, unknown> {
  return {
    id: row.id,
    listingId: row.listingId,
    amountCents: row.amountCents,
    status: row.status,
    bondCents: row.bondCents,
    bondState: row.bondState,
    bondReference: row.bondReference,
    bondQuoteExpiresAtMs: row.bondQuoteExpiresAtMs,
    placedAtMs: row.placedAtMs,
  };
}

function settlementView(row: WocSettlementRow): Record<string, unknown> {
  return {
    id: row.id,
    listingId: row.listingId,
    attempt: row.attempt,
    amountCents: row.amountCents,
    state: row.state,
    quoteReference: row.quoteReference,
    quoteExpiresAtMs: row.quoteExpiresAtMs,
    deadlineAtMs: row.deadlineAtMs,
    createdAtMs: row.createdAtMs,
  };
}

function saleView(row: WocSaleRow): Record<string, unknown> {
  return {
    id: row.id,
    itemId: row.itemId,
    item: row.item,
    priceCents: row.priceCents,
    sellerName: row.sellerName,
    buyerName: row.buyerName,
    atMs: row.atMs,
  };
}

function strikeView(row: WocStrikeRow | null): Record<string, unknown> | null {
  if (!row) return null;
  return { strikes: row.strikes, suspendedUntilMs: row.suspendedUntilMs };
}

function quoteView(intent: WocQuoteIntent): Record<string, unknown> {
  return {
    reference: intent.reference,
    transactionBase64: intent.transactionBase64,
    amount: intent.amount,
    seller: intent.seller,
    burn: intent.burn,
    treasury: intent.treasury,
    expiresAtMs: intent.expiresAtMs,
  };
}

function estimateView(estimate: WocEstimate): Record<string, unknown> {
  return {
    available: estimate.available,
    usdCents: estimate.usdCents,
    amount: estimate.amount,
    asOfMs: estimate.asOfMs,
  };
}

// ---------------------------------------------------------------------------
// Player handlers
// ---------------------------------------------------------------------------

async function statusHandler(ctx: Ctx): Promise<void> {
  const status = await useService().status();
  const policy = wocMarketConfig().policy;
  json(ctx.res, 200, {
    enabled: status.enabled,
    price: status.price,
    maxActiveListings: status.maxActiveListings,
    durationsHours: WOC_MARKET_DURATION_HOURS,
    minPriceCents: WOC_MARKET_MIN_PRICE_CENTS,
    maxPriceCents: WOC_MARKET_MAX_PRICE_CENTS,
    // The eligibility floor, so the client's sell-tab pre-filter follows this
    // server's policy instead of hardcoding one (the server re-validates).
    qualityFloor: policy.equipmentQualityFloor,
    // The two collectible category switches, so the client's Sell picker offers
    // exactly what this realm's policy will accept.
    allowMounts: policy.allowMounts,
    allowMechChromas: policy.allowMechChromas,
    settlementWindowSeconds: WOC_MARKET_SETTLEMENT_WINDOW_SECONDS,
  });
}

const BROWSE_SORTS = new Set(['ending', 'newest', 'price_asc', 'price_desc']);
// Two sets, deliberately different. Browsing must still find the combined
// listings that already exist; creating one is no longer allowed. Narrowing the
// browse filter as well would hide live listings from search.
const BROWSE_FORMATS = new Set(['auction', 'buy_now', 'auction_buy_now']);
const CREATABLE_FORMATS = new Set(['auction', 'buy_now']);
const QUALITIES = new Set(['epic', 'legendary']);

async function browseHandler(ctx: Ctx): Promise<void> {
  const one = (v: string | string[] | undefined): string | null =>
    typeof v === 'string' && v !== '' ? v : null;
  const sortRaw = one(ctx.query.sort) ?? 'ending';
  const qualityRaw = one(ctx.query.quality);
  const formatRaw = one(ctx.query.format);
  if (!BROWSE_SORTS.has(sortRaw)) invalid();
  if (qualityRaw !== null && !QUALITIES.has(qualityRaw)) invalid();
  if (formatRaw !== null && !BROWSE_FORMATS.has(formatRaw)) invalid();
  const itemIdsRaw = one(ctx.query.itemIds);
  const itemIds =
    itemIdsRaw === null
      ? null
      : itemIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '')
          .slice(0, 50)
          .map((id) => stringField(id, 128));
  // Validated like every other numeric on this surface: an unclamped page
  // became the SQL OFFSET, so 1e400 reached Postgres as Infinity (a 500 on
  // client input) and huge finite values forced a full index walk.
  const pageRaw = one(ctx.query.page);
  const page = pageRaw === null ? 0 : intField(Number(pageRaw), 0, MAX_BROWSE_PAGE);
  const q: WocBrowseQuery = {
    page,
    pageSize: 25,
    quality: qualityRaw,
    format: formatRaw as WocListingFormat | null,
    itemIds,
    sort: sortRaw as WocBrowseQuery['sort'],
  };
  const viewer = ctxAccountId(ctx);
  // hasMore, not a total: the count query forced a full read of every live
  // listing per page, and the pager only needs to know if a next page exists.
  const { rows, hasMore } = await useService().browse(q);
  json(ctx.res, 200, {
    hasMore,
    page,
    pageSize: q.pageSize,
    listings: rows.map((row) => listingView(row, viewer)),
  });
}

async function listingDetailHandler(ctx: Ctx): Promise<void> {
  const id = idParam(ctx);
  const detail = await useService().listingDetail(id);
  if (!detail) throw new HttpError(404, 'woc_market.not_found');
  json(ctx.res, 200, {
    listing: listingView(detail.listing, ctxAccountId(ctx)),
    estimate: detail.estimate ? estimateView(detail.estimate) : null,
  });
}

async function estimateHandler(ctx: Ctx): Promise<void> {
  const raw = ctx.query.cents;
  const cents = Number(typeof raw === 'string' ? raw : '');
  if (!Number.isInteger(cents) || cents < 1 || cents > WOC_MARKET_MAX_PRICE_CENTS) invalid();
  json(ctx.res, 200, estimateView(await useService().estimate(cents)));
}

async function createListingHandler(ctx: Ctx): Promise<void> {
  const body = bodyOf(ctx);
  const expectInstance = optionalInstance(body.expectInstance);
  const out = await useService().createListing({
    account: ctxAccountId(ctx),
    characterId: intField(body.characterId, 1, Number.MAX_SAFE_INTEGER),
    itemRef: {
      index: intField(body.itemIndex, 0, 10_000),
      itemId: stringField(body.itemId, 128),
      ...(expectInstance === undefined ? {} : { expectInstance }),
    },
    params: {
      format: CREATABLE_FORMATS.has(String(body.format))
        ? (body.format as WocListingFormat)
        : (invalid() as never),
      startCents: intField(body.startCents, WOC_MARKET_MIN_PRICE_CENTS, WOC_MARKET_MAX_PRICE_CENTS),
      reserveCents: optionalCents(body.reserveCents),
      buyNowCents: optionalCents(body.buyNowCents),
      durationHours: intField(body.durationHours, 1, 1_000),
      offerNext: body.offerNext === true,
    },
  });
  if (!out.ok) throwRefusal(out.reason);
  json(ctx.res, 200, { listing: listingView(out.listing, ctxAccountId(ctx)) });
}

async function cancelListingHandler(ctx: Ctx): Promise<void> {
  const out = await useService().cancelListing(ctxAccountId(ctx), idParam(ctx));
  if (!out.ok) throwRefusal(out.reason);
  json(ctx.res, 200, { ok: true });
}

async function placeBidHandler(ctx: Ctx): Promise<void> {
  const body = bodyOf(ctx);
  const out = await useService().placeBid({
    account: ctxAccountId(ctx),
    characterId: intField(body.characterId, 1, Number.MAX_SAFE_INTEGER),
    listingId: idParam(ctx),
    amountCents: intField(body.amountCents, 1, WOC_MARKET_MAX_PRICE_CENTS),
    acceptTerms: body.acceptTerms === true,
  });
  if (!out.ok) throwRefusal(out.reason);
  json(ctx.res, 200, { bid: bidView(out.bid), bond: quoteView(out.bond) });
}

async function bondQuoteHandler(ctx: Ctx): Promise<void> {
  const out = await useService().refreshBondQuote(ctxAccountId(ctx), idParam(ctx));
  if (!out.ok) throwRefusal(out.reason);
  json(ctx.res, 200, { bond: quoteView(out.bond) });
}

async function confirmBondHandler(ctx: Ctx): Promise<void> {
  const body = bodyOf(ctx);
  const out = await useService().confirmBond(
    ctxAccountId(ctx),
    idParam(ctx),
    stringField(body.signature, 256),
  );
  if (!out.ok) throwRefusal(out.reason);
  json(ctx.res, 200, { standing: out.standing });
}

async function buyNowHandler(ctx: Ctx): Promise<void> {
  const body = bodyOf(ctx);
  const out = await useService().buyNow({
    account: ctxAccountId(ctx),
    characterId: intField(body.characterId, 1, Number.MAX_SAFE_INTEGER),
    listingId: idParam(ctx),
    acceptTerms: body.acceptTerms === true,
  });
  if (!out.ok) throwRefusal(out.reason);
  json(ctx.res, 200, {
    settlement: settlementView(out.settlement),
    quote: quoteView(out.quote),
  });
}

async function settlementQuoteHandler(ctx: Ctx): Promise<void> {
  const out = await useService().settlementQuote(ctxAccountId(ctx), idParam(ctx));
  if (!out.ok) throwRefusal(out.reason);
  json(ctx.res, 200, { quote: quoteView(out.quote) });
}

async function confirmSettlementHandler(ctx: Ctx): Promise<void> {
  const body = bodyOf(ctx);
  const out = await useService().confirmSettlement(
    ctxAccountId(ctx),
    idParam(ctx),
    stringField(body.signature, 256),
  );
  if (!out.ok) throwRefusal(out.reason);
  json(ctx.res, 200, { state: out.state });
}

async function myActivityHandler(ctx: Ctx): Promise<void> {
  const account = ctxAccountId(ctx);
  const activity = await useService().myActivity(account);
  json(ctx.res, 200, {
    listings: activity.listings.map((row) => listingView(row, account)),
    bids: activity.bids.map(bidView),
    settlements: activity.settlements.map(settlementView),
    strikes: strikeView(activity.strikes),
    termsAcceptedAtMs: activity.termsAcceptedAtMs,
    walletLinked: activity.wallet !== null,
  });
}

async function historyHandler(ctx: Ctx): Promise<void> {
  const itemId = ctx.params.itemId ?? '';
  if (itemId === '' || itemId.length > 128) invalid();
  const sales = await useService().salesHistory(itemId);
  json(ctx.res, 200, { sales: sales.map(saleView) });
}

// ---------------------------------------------------------------------------
// Operator handlers (/admin/api surface; legacy admin envelope)
// ---------------------------------------------------------------------------

async function adminListingsHandler(ctx: Ctx): Promise<void> {
  const raw = ctx.query.account;
  const account = Number(typeof raw === 'string' ? raw : '');
  if (!Number.isInteger(account) || account < 1) {
    json(ctx.res, 400, { success: false, data: null, error: 'invalid account' });
    return;
  }
  const listings = await useService().adminListingsBySeller(account);
  json(ctx.res, 200, {
    success: true,
    data: {
      listings: listings.map((row) => ({
        ...listingView(row, null),
        sellerAccount: row.sellerAccount,
        itemDisposed: row.itemDisposed,
      })),
    },
  });
}

async function adminSuspendListingHandler(ctx: Ctx): Promise<void> {
  const out = await useService().adminSuspendListing(adminTargetId(ctx));
  if (!out.ok) {
    json(ctx.res, 404, { success: false, data: null, error: 'listing not found or closed' });
    return;
  }
  json(ctx.res, 200, { success: true, data: { suspended: true } });
}

async function adminSaleExcludedHandler(ctx: Ctx): Promise<void> {
  const body = bodyOf(ctx);
  if (typeof body.excluded !== 'boolean') {
    json(ctx.res, 400, { success: false, data: null, error: 'invalid input' });
    return;
  }
  const out = await useService().adminSetSaleExcluded(adminTargetId(ctx), body.excluded);
  if (!out.ok) {
    json(ctx.res, 404, { success: false, data: null, error: 'sale not found' });
    return;
  }
  json(ctx.res, 200, { success: true, data: { excluded: body.excluded } });
}

async function adminClearStrikesHandler(ctx: Ctx): Promise<void> {
  await useService().adminClearStrikes(adminTargetId(ctx));
  json(ctx.res, 200, { success: true, data: { cleared: true } });
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

// Bearer guards from the shared factories (LAZY db reads via the bundle, the
// maps_routes pattern), so endpoint tests can install fakes without a pg pool.
const REAL_GUARD_DB = { accountAndScopeForToken, moderationStatusForAccount };
let guardDbBundle = REAL_GUARD_DB;

/** Override the bearer-guard db reads with fakes (test-only). */
export function setWocMarketGuardDbForTests(overrides: Partial<typeof REAL_GUARD_DB>): void {
  guardDbBundle = { ...REAL_GUARD_DB, ...overrides };
}

/** Restore the real bearer-guard db reads (test-only). */
export function resetWocMarketGuardDbForTests(): void {
  guardDbBundle = REAL_GUARD_DB;
}

const readAccount = createReadGuard(() => guardDbBundle);
const activeAccount = createActiveGuard(() => guardDbBundle);

// BOLA loaders for the owner-scoped :id mutations (the require_owned seam):
// absent and non-owned both answer the same 404 body, existence never leaks.
// The service methods re-check ownership transactionally; these gate early and
// feed the coverage clause (checkRequireOwnedCoverage).
const OWNED_404 = { error: 'not found', code: 'woc_market.not_yours' } as const;
const ownedListing = requireOwned<WocListingRow>({
  resource: 'woc-market-listing',
  param: 'id',
  load: (account, id) => useService().ownedListing(account, id),
  notFoundBody: OWNED_404,
});
const ownedBid = requireOwned<WocBidRow>({
  resource: 'woc-market-bid',
  param: 'id',
  load: (account, id) => useService().ownedBid(account, id),
  notFoundBody: OWNED_404,
});
const ownedSettlement = requireOwned<WocSettlementRow>({
  resource: 'woc-market-settlement',
  param: 'id',
  load: (account, id) => useService().ownedSettlement(account, id),
  notFoundBody: OWNED_404,
});
const OWNED_ACCOUNT = { requireOwned: { kind: 'woc-market', ownerScope: 'account' } } as const;
// Any authenticated player may read a listing or its sales history, and may
// bid on / buy ANY listing: there is no per-object ownership by design, so
// these carry the intentional publicRead marker instead of a loader (the
// service owns every other guard: seller/wallet exclusion, terms).
const NO_OWNER = { publicRead: true } as const;
const ADMIN_META = { envelope: 'admin' } as const;
const ADMIN_TARGET_META = {
  envelope: 'admin',
  requireOwned: { kind: 'woc-market', ownerScope: 'operator' },
} as const;
// The one live admin-db bundle (admin.ts), read per request so the standard
// setAdminDbForTests seam reaches these routes too.
const requireAdmin = createRequireAdmin((): AdminAuthDb => adminDb());

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/woc-market/status',
    surface: 'api',
    middleware: [readAccount],
    handler: statusHandler,
  },
  {
    method: 'GET',
    path: '/api/woc-market/listings',
    surface: 'api',
    middleware: [readAccount],
    handler: browseHandler,
  },
  {
    method: 'GET',
    path: '/api/woc-market/listings/:id',
    surface: 'api',
    middleware: [readAccount],
    meta: NO_OWNER,
    handler: listingDetailHandler,
  },
  {
    method: 'GET',
    path: '/api/woc-market/estimate',
    surface: 'api',
    middleware: [readAccount, rateLimit(WOC_MARKET_QUOTE_POLICY)],
    handler: estimateHandler,
  },
  {
    method: 'GET',
    path: '/api/woc-market/me',
    surface: 'api',
    middleware: [readAccount],
    handler: myActivityHandler,
  },
  {
    method: 'GET',
    path: '/api/woc-market/history/:itemId',
    surface: 'api',
    middleware: [readAccount],
    meta: NO_OWNER,
    handler: historyHandler,
  },
  {
    method: 'POST',
    path: '/api/woc-market/listings',
    surface: 'api',
    middleware: [activeAccount, rateLimit(WOC_MARKET_LIST_POLICY), withBody()],
    handler: createListingHandler,
  },
  {
    method: 'POST',
    path: '/api/woc-market/listings/:id/cancel',
    surface: 'api',
    middleware: [activeAccount, rateLimit(WOC_MARKET_LIST_POLICY), ownedListing],
    meta: OWNED_ACCOUNT,
    handler: cancelListingHandler,
  },
  {
    method: 'POST',
    path: '/api/woc-market/listings/:id/bids',
    surface: 'api',
    middleware: [activeAccount, rateLimit(WOC_MARKET_BID_POLICY), withBody()],
    meta: NO_OWNER,
    handler: placeBidHandler,
  },
  {
    method: 'POST',
    path: '/api/woc-market/bids/:id/bond-quote',
    surface: 'api',
    middleware: [activeAccount, rateLimit(WOC_MARKET_QUOTE_POLICY), ownedBid],
    meta: OWNED_ACCOUNT,
    handler: bondQuoteHandler,
  },
  {
    method: 'POST',
    path: '/api/woc-market/bids/:id/bond',
    surface: 'api',
    middleware: [activeAccount, rateLimit(WOC_MARKET_CONFIRM_POLICY), withBody(), ownedBid],
    meta: OWNED_ACCOUNT,
    handler: confirmBondHandler,
  },
  {
    method: 'POST',
    path: '/api/woc-market/listings/:id/buy-now',
    surface: 'api',
    middleware: [activeAccount, rateLimit(WOC_MARKET_BID_POLICY), withBody()],
    meta: NO_OWNER,
    handler: buyNowHandler,
  },
  {
    method: 'POST',
    path: '/api/woc-market/settlements/:id/quote',
    surface: 'api',
    middleware: [activeAccount, rateLimit(WOC_MARKET_QUOTE_POLICY), ownedSettlement],
    meta: OWNED_ACCOUNT,
    handler: settlementQuoteHandler,
  },
  {
    method: 'POST',
    path: '/api/woc-market/settlements/:id/confirm',
    surface: 'api',
    middleware: [activeAccount, rateLimit(WOC_MARKET_CONFIRM_POLICY), withBody(), ownedSettlement],
    meta: OWNED_ACCOUNT,
    handler: confirmSettlementHandler,
  },
  // Operator arms: the central ADMIN_ROUTE_PERMISSIONS gate authorizes each
  // concrete path (moderation.read / moderation.act rows in admin_routes.ts).
  {
    method: 'GET',
    path: '/admin/api/woc-market/listings',
    surface: 'admin',
    middleware: [requireAdmin],
    meta: ADMIN_META,
    handler: adminListingsHandler,
  },
  {
    method: 'POST',
    path: '/admin/api/woc-market/listings/:id/suspend',
    surface: 'admin',
    middleware: [requireAdmin, requireAdminTarget('woc-market-listing')],
    meta: ADMIN_TARGET_META,
    handler: adminSuspendListingHandler,
  },
  {
    method: 'POST',
    path: '/admin/api/woc-market/sales/:id/excluded',
    surface: 'admin',
    middleware: [requireAdmin, requireAdminTarget('woc-market-sale'), withBody()],
    meta: ADMIN_TARGET_META,
    handler: adminSaleExcludedHandler,
  },
  {
    method: 'POST',
    path: '/admin/api/woc-market/accounts/:id/clear-strikes',
    surface: 'admin',
    middleware: [requireAdmin, requireAdminTarget('woc-market-account')],
    meta: ADMIN_TARGET_META,
    handler: adminClearStrikesHandler,
  },
];
