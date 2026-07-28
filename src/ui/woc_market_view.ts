// $WOC Exchange window view core (docs/prd/woc/marketplace.md): maps the SDK
// payloads (status, browse page, detail, activity) plus the live inventory to
// the render model the painter draws. DOM/i18n-free and deterministic: the
// caller passes nowMs, the painter owns every t() string, formatter, and the
// clock. The client computes NO price, token, or increment values: everything
// economic in this model is a passthrough of server-provided numbers; the one
// derivation here is TIME (remaining/deadline milliseconds from server
// timestamps) and the sell-tab eligibility PRE-filter, which mirrors the
// server policy's shape (quality floor from /status; hard transfer locks from
// the item def) purely as a courtesy: the server re-validates every listing.

import { ITEMS } from '../sim/data';
import type { InvSlot, ItemInstancePayload } from '../sim/types';

// Structural twins of the src/net/woc_market_sdk.ts payload shapes. The
// pure-core sweep (tests/architecture.test.ts) forbids net imports here even
// type-only, so the core declares the shapes it reads and the SDK objects
// flow in unchanged through TypeScript's structural typing; the painter is
// the only module that names both sides.

export interface WocQuoteLegView {
  base: string;
  tokens: number;
}

export interface WocPriceView {
  available: boolean;
  healthy: boolean;
  reason: string | null;
  tokensPerUsd: number | null;
  asOfMs: number | null;
}

export interface WocMarketStatus {
  ok: boolean;
  enabled: boolean;
  price: WocPriceView;
  totpThresholdCents: number;
  maxActiveListings: number;
  durationsHours: readonly number[];
  minPriceCents: number;
  maxPriceCents: number;
  qualityFloor: string;
  settlementWindowSeconds: number;
}

export interface WocListingView {
  id: number;
  item: InvSlot;
  itemId: string;
  quality: string;
  format: 'auction' | 'buy_now' | 'auction_buy_now';
  sellerName: string;
  mine: boolean;
  startCents: number;
  hasReserve: boolean;
  reserveMet: boolean | null;
  buyNowCents: number | null;
  offerNext: boolean;
  status: string;
  resolution: string | null;
  currentBidCents: number | null;
  minNextBidCents: number;
  buyNowLocked: boolean;
  endsAtMs: number;
  createdAtMs: number;
}

export interface WocEstimateView {
  available: boolean;
  usdCents: number;
  amount: WocQuoteLegView | null;
  asOfMs: number | null;
}

export interface WocBidView {
  id: number;
  listingId: number;
  amountCents: number;
  status: string;
  bondCents: number;
  bondState: string;
  bondReference: string | null;
  bondQuoteExpiresAtMs: number | null;
  placedAtMs: number;
}

export interface WocSettlementView {
  id: number;
  listingId: number;
  attempt: number;
  amountCents: number;
  state: string;
  quoteReference: string | null;
  quoteExpiresAtMs: number | null;
  deadlineAtMs: number;
  createdAtMs: number;
}

export interface WocSaleView {
  id: number;
  itemId: string;
  item: InvSlot;
  priceCents: number;
  sellerName: string;
  buyerName: string;
  atMs: number;
}

export interface WocActivityView {
  listings: WocListingView[];
  bids: WocBidView[];
  settlements: WocSettlementView[];
  strikes: { strikes: number; suspendedUntilMs: number | null } | null;
  termsAcceptedAtMs: number | null;
  walletLinked: boolean;
}

export type WocMarketTab = 'browse' | 'sell' | 'activity';

export interface WocMarketViewInput {
  /** Feature capability on this client build (platform gate). */
  capable: boolean;
  /** Status payload, or null while it loads / when it failed. */
  status: WocMarketStatus | null;
  statusFailed: boolean;
  walletLinked: boolean;
  tab: WocMarketTab;
  nowMs: number;
  browse: {
    listings: readonly WocListingView[];
    total: number;
    page: number;
    pageSize: number;
    loading: boolean;
    failed: boolean;
    selectedId: number | null;
    detail: WocListingView | null;
    estimate: WocEstimateView | null;
    sales: readonly WocSaleView[] | null;
  };
  /** The live inventory (IWorld read) for the sell tab. */
  inventory: readonly InvSlot[];
  activity: WocActivityView | null;
}

export interface WocListingRowModel {
  id: number;
  itemId: string;
  count: number;
  instance: ItemInstancePayload | undefined;
  quality: string;
  format: WocListingView['format'];
  sellerName: string;
  mine: boolean;
  currentCents: number | null;
  startCents: number;
  minNextBidCents: number;
  buyNowCents: number | null;
  buyNowLocked: boolean;
  reserveBadge: 'met' | 'not_met' | null;
  remainingMs: number;
  endsAtMs: number;
  selected: boolean;
  status: string;
  resolution: string | null;
}

export interface WocDetailModel {
  row: WocListingRowModel;
  estimateAmount: WocQuoteLegView | null;
  estimateAsOfMs: number | null;
  offerNext: boolean;
  sales: readonly WocSaleView[];
}

export interface WocSellRowModel {
  index: number;
  itemId: string;
  quality: string;
  instance: ItemInstancePayload | undefined;
}

export interface WocActivityModel {
  listings: WocListingRowModel[];
  bids: (WocBidView & { bondQuoteRemainingMs: number | null })[];
  settlements: (WocSettlementView & {
    deadlineRemainingMs: number;
    quoteRemainingMs: number | null;
  })[];
  strikes: number;
  suspendedRemainingMs: number | null;
  termsAccepted: boolean;
}

export type WocMarketViewModel =
  | { kind: 'unavailable' } // platform-incapable build: the window never shows
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'disabled' }
  | {
      kind: 'ready';
      tab: WocMarketTab;
      paused: boolean;
      walletLinked: boolean;
      tokensPerUsd: number | null;
      priceAsOfMs: number | null;
      totpThresholdCents: number;
      settlementWindowSeconds: number;
      durationsHours: readonly number[];
      minPriceCents: number;
      maxPriceCents: number;
      browse: {
        rows: WocListingRowModel[];
        total: number;
        page: number;
        pageCount: number;
        loading: boolean;
        failed: boolean;
        detail: WocDetailModel | null;
      };
      sell: { rows: WocSellRowModel[]; maxActiveListings: number };
      activity: WocActivityModel | null;
    };

const QUALITY_RANK: Record<string, number> = {
  poor: 0,
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

/**
 * The sell-tab pre-filter: equipment (a def with an equip slot) at or above
 * the server's floor, free of every hard transfer lock. Mirrors, never
 * replaces, the server-side listingEligibility + extraction checks.
 */
export function sellableRows(
  inventory: readonly InvSlot[],
  qualityFloor: string,
): WocSellRowModel[] {
  const floor = QUALITY_RANK[qualityFloor] ?? QUALITY_RANK.epic;
  const rows: WocSellRowModel[] = [];
  inventory.forEach((slot, index) => {
    const def = ITEMS[slot.itemId];
    if (!def || def.slot === undefined) return;
    if (def.soulbound || def.noMarketList || def.kind === 'quest') return;
    if (slot.instance?.boundTo !== undefined) return;
    const quality = slot.instance?.rolled?.quality ?? def.quality ?? 'common';
    if ((QUALITY_RANK[quality] ?? 0) < floor) return;
    rows.push({ index, itemId: slot.itemId, quality, instance: slot.instance });
  });
  return rows;
}

function listingRow(
  listing: WocListingView,
  nowMs: number,
  selectedId: number | null,
): WocListingRowModel {
  return {
    id: listing.id,
    itemId: listing.itemId,
    count: listing.item?.count ?? 1,
    instance: listing.item?.instance,
    quality: listing.quality,
    format: listing.format,
    sellerName: listing.sellerName,
    mine: listing.mine,
    currentCents: listing.currentBidCents,
    startCents: listing.startCents,
    minNextBidCents: listing.minNextBidCents,
    buyNowCents: listing.buyNowCents,
    buyNowLocked: listing.buyNowLocked,
    reserveBadge: listing.hasReserve ? (listing.reserveMet ? 'met' : 'not_met') : null,
    remainingMs: Math.max(0, listing.endsAtMs - nowMs),
    endsAtMs: listing.endsAtMs,
    selected: listing.id === selectedId,
    status: listing.status,
    resolution: listing.resolution,
  };
}

export function buildWocMarketView(input: WocMarketViewInput): WocMarketViewModel {
  if (!input.capable) return { kind: 'unavailable' };
  if (input.statusFailed) return { kind: 'error' };
  if (input.status === null) return { kind: 'loading' };
  if (!input.status.ok) return { kind: 'error' };
  if (!input.status.enabled) return { kind: 'disabled' };

  const nowMs = input.nowMs;
  const status = input.status;
  const paused = !status.price.available || !status.price.healthy;

  const rows = input.browse.listings.map((l) => listingRow(l, nowMs, input.browse.selectedId));
  const detailSource =
    input.browse.detail ??
    input.browse.listings.find((l) => l.id === input.browse.selectedId) ??
    null;
  const detail: WocDetailModel | null = detailSource
    ? {
        row: listingRow(detailSource, nowMs, input.browse.selectedId),
        estimateAmount: input.browse.estimate?.amount ?? null,
        estimateAsOfMs: input.browse.estimate?.asOfMs ?? null,
        offerNext: detailSource.offerNext,
        sales: input.browse.sales ?? [],
      }
    : null;

  const activity: WocActivityModel | null = input.activity
    ? {
        listings: input.activity.listings.map((l) => listingRow(l, nowMs, null)),
        bids: input.activity.bids.map((b) => ({
          ...b,
          bondQuoteRemainingMs:
            b.bondQuoteExpiresAtMs === null ? null : Math.max(0, b.bondQuoteExpiresAtMs - nowMs),
        })),
        settlements: input.activity.settlements.map((s) => ({
          ...s,
          deadlineRemainingMs: Math.max(0, s.deadlineAtMs - nowMs),
          quoteRemainingMs:
            s.quoteExpiresAtMs === null ? null : Math.max(0, s.quoteExpiresAtMs - nowMs),
        })),
        strikes: input.activity.strikes?.strikes ?? 0,
        suspendedRemainingMs:
          input.activity.strikes?.suspendedUntilMs != null &&
          input.activity.strikes.suspendedUntilMs > nowMs
            ? input.activity.strikes.suspendedUntilMs - nowMs
            : null,
        termsAccepted: input.activity.termsAcceptedAtMs !== null,
      }
    : null;

  return {
    kind: 'ready',
    tab: input.tab,
    paused,
    walletLinked: input.walletLinked,
    tokensPerUsd: status.price.tokensPerUsd,
    priceAsOfMs: status.price.asOfMs,
    totpThresholdCents: status.totpThresholdCents,
    settlementWindowSeconds: status.settlementWindowSeconds,
    durationsHours: status.durationsHours,
    minPriceCents: status.minPriceCents,
    maxPriceCents: status.maxPriceCents,
    browse: {
      rows,
      total: input.browse.total,
      page: input.browse.page,
      pageCount: Math.max(1, Math.ceil(input.browse.total / Math.max(1, input.browse.pageSize))),
      loading: input.browse.loading,
      failed: input.browse.failed,
      detail,
    },
    sell: {
      rows: sellableRows(input.inventory, status.qualityFloor),
      maxActiveListings: status.maxActiveListings,
    },
    activity,
  };
}

/**
 * The repaint signature: a digest of the DATA the painter renders, so the
 * poll rebuilds only on change (the lastSig family). Text-independent by
 * design; the language fan-out calls relocalize() instead. Second-resolution
 * countdowns are folded in so open auctions tick without a self-armed driver.
 */
export function wocMarketViewSig(model: WocMarketViewModel): string {
  if (model.kind !== 'ready') return model.kind;
  const rows = model.browse.rows
    .map(
      (r) =>
        `${r.id}:${r.currentCents}:${r.buyNowLocked ? 1 : 0}:${r.reserveBadge}:${Math.floor(r.remainingMs / 1000)}:${r.selected ? 1 : 0}`,
    )
    .join(',');
  const detail = model.browse.detail
    ? `${model.browse.detail.row.id}:${model.browse.detail.estimateAmount?.base ?? ''}:${model.browse.detail.sales.length}`
    : '';
  const sell = model.sell.rows.map((r) => `${r.index}:${r.itemId}`).join(',');
  const activity = model.activity
    ? [
        model.activity.listings.map((l) => `${l.id}:${l.status}:${l.resolution ?? ''}`).join(','),
        model.activity.bids
          .map(
            (b) =>
              `${b.id}:${b.status}:${b.bondState}:${Math.floor((b.bondQuoteRemainingMs ?? -1000) / 1000)}`,
          )
          .join(','),
        model.activity.settlements
          .map(
            (s) =>
              `${s.id}:${s.state}:${Math.floor(s.deadlineRemainingMs / 1000)}:${Math.floor((s.quoteRemainingMs ?? -1000) / 1000)}`,
          )
          .join(','),
        `${model.activity.strikes}:${model.activity.suspendedRemainingMs === null ? '' : Math.floor(model.activity.suspendedRemainingMs / 60_000)}:${model.activity.termsAccepted ? 1 : 0}`,
      ].join('|')
    : '';
  return [
    model.tab,
    model.paused ? 1 : 0,
    model.walletLinked ? 1 : 0,
    model.tokensPerUsd ?? '',
    model.browse.page,
    model.browse.total,
    model.browse.loading ? 1 : 0,
    model.browse.failed ? 1 : 0,
    rows,
    detail,
    sell,
    activity,
  ].join('#');
}
