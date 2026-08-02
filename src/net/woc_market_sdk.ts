// Typed client SDK for the game server's /api/woc-market/* routes (the
// economy_sdk.ts sibling; docs/prd/woc/marketplace.md). Same-origin by
// default via apiUrl(); every call carries the bearer token. It NEVER throws
// into render: every failure resolves to a typed { ok: false } carrying the
// server's stable woc_market.* code (or 'unavailable' when the network or a
// non-JSON body ate the response), which the window maps to player text via
// the apiError.* catalog. The client computes NO price, token, split, or
// increment values: it renders exactly what the server hands it.

import { apiUrl } from '../client_origin';
import type { InvSlot, ItemInstancePayload } from '../sim/types';

export interface WocMarketClientConfig {
  token(): string | null;
  base?: string;
}

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
  minNextBidBondCents: number;
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

export interface WocQuoteView {
  reference: string | null;
  transactionBase64: string | null;
  amount: WocQuoteLegView | null;
  seller: WocQuoteLegView | null;
  burn: WocQuoteLegView | null;
  treasury: WocQuoteLegView | null;
  expiresAtMs: number | null;
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

/** Every mutating call resolves to this: ok, or the server's stable code. */
export type WocMarketFail = { ok: false; code: string };
export const WOC_MARKET_UNAVAILABLE = 'woc_market.quote_unavailable';

export interface CreateListingRequest {
  characterId: number;
  itemIndex: number;
  itemId: string;
  expectInstance: ItemInstancePayload | null;
  /** No 'auction_buy_now': the combined format is no longer creatable. The READ
   *  type (WocListingView.format) still carries it, because listings created
   *  before the change keep rendering, taking bids, and settling. */
  format: 'auction' | 'buy_now';
  startCents: number;
  reserveCents: number | null;
  buyNowCents: number | null;
  durationHours: number;
  offerNext: boolean;
}

export interface PlaceBidRequest {
  listingId: number;
  characterId: number;
  amountCents: number;
  totpCode: string | null;
  acceptTerms: boolean;
}

export interface BuyNowRequest {
  listingId: number;
  characterId: number;
  totpCode: string | null;
  acceptTerms: boolean;
}

export interface WocBrowseRequest {
  page: number;
  quality: string | null;
  format: string | null;
  itemIds: readonly string[] | null;
  sort: 'ending' | 'newest' | 'price_asc' | 'price_desc';
}

export class WocMarketClient {
  constructor(private readonly cfg: WocMarketClientConfig) {}

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ ok: true; data: T } | WocMarketFail> {
    try {
      const token = this.cfg.token();
      const res = await fetch(apiUrl(path, this.cfg.base ?? ''), {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code =
          data && typeof data === 'object' && typeof (data as { code?: unknown }).code === 'string'
            ? (data as { code: string }).code
            : WOC_MARKET_UNAVAILABLE;
        return { ok: false, code };
      }
      if (data === null) return { ok: false, code: WOC_MARKET_UNAVAILABLE };
      return { ok: true, data: data as T };
    } catch {
      return { ok: false, code: WOC_MARKET_UNAVAILABLE };
    }
  }

  async status(): Promise<WocMarketStatus> {
    const out = await this.request<Omit<WocMarketStatus, 'ok'>>('GET', '/api/woc-market/status');
    if (!out.ok) {
      return {
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
      };
    }
    return { ok: true, ...out.data };
  }

  async browse(
    req: WocBrowseRequest,
  ): Promise<
    { ok: true; hasMore: boolean; page: number; listings: WocListingView[] } | WocMarketFail
  > {
    const params = new URLSearchParams();
    params.set('page', String(req.page));
    params.set('sort', req.sort);
    if (req.quality) params.set('quality', req.quality);
    if (req.format) params.set('format', req.format);
    if (req.itemIds && req.itemIds.length > 0) params.set('itemIds', req.itemIds.join(','));
    const out = await this.request<{ hasMore: boolean; page: number; listings: WocListingView[] }>(
      'GET',
      `/api/woc-market/listings?${params.toString()}`,
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async detail(
    id: number,
  ): Promise<
    { ok: true; listing: WocListingView; estimate: WocEstimateView | null } | WocMarketFail
  > {
    const out = await this.request<{ listing: WocListingView; estimate: WocEstimateView | null }>(
      'GET',
      `/api/woc-market/listings/${id}`,
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async estimate(cents: number): Promise<WocEstimateView | null> {
    const out = await this.request<WocEstimateView>(
      'GET',
      `/api/woc-market/estimate?cents=${Math.floor(cents)}`,
    );
    return out.ok ? out.data : null;
  }

  async me(): Promise<{ ok: true; activity: WocActivityView } | WocMarketFail> {
    const out = await this.request<WocActivityView>('GET', '/api/woc-market/me');
    return out.ok ? { ok: true, activity: out.data } : out;
  }

  async history(itemId: string): Promise<{ ok: true; sales: WocSaleView[] } | WocMarketFail> {
    const out = await this.request<{ sales: WocSaleView[] }>(
      'GET',
      `/api/woc-market/history/${encodeURIComponent(itemId)}`,
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async createListing(
    req: CreateListingRequest,
  ): Promise<{ ok: true; listing: WocListingView } | WocMarketFail> {
    const out = await this.request<{ listing: WocListingView }>(
      'POST',
      '/api/woc-market/listings',
      req,
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async cancelListing(id: number): Promise<{ ok: true } | WocMarketFail> {
    const out = await this.request<{ ok: boolean }>(
      'POST',
      `/api/woc-market/listings/${id}/cancel`,
    );
    return out.ok ? { ok: true } : out;
  }

  async placeBid(
    req: PlaceBidRequest,
  ): Promise<{ ok: true; bid: WocBidView; bond: WocQuoteView } | WocMarketFail> {
    const out = await this.request<{ bid: WocBidView; bond: WocQuoteView }>(
      'POST',
      `/api/woc-market/listings/${req.listingId}/bids`,
      {
        characterId: req.characterId,
        amountCents: req.amountCents,
        totpCode: req.totpCode,
        acceptTerms: req.acceptTerms,
      },
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async bondQuote(bidId: number): Promise<{ ok: true; bond: WocQuoteView } | WocMarketFail> {
    const out = await this.request<{ bond: WocQuoteView }>(
      'POST',
      `/api/woc-market/bids/${bidId}/bond-quote`,
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async confirmBond(
    bidId: number,
    signature: string,
  ): Promise<{ ok: true; standing: boolean } | WocMarketFail> {
    const out = await this.request<{ standing: boolean }>(
      'POST',
      `/api/woc-market/bids/${bidId}/bond`,
      { signature },
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async buyNow(
    req: BuyNowRequest,
  ): Promise<{ ok: true; settlement: WocSettlementView; quote: WocQuoteView } | WocMarketFail> {
    const out = await this.request<{ settlement: WocSettlementView; quote: WocQuoteView }>(
      'POST',
      `/api/woc-market/listings/${req.listingId}/buy-now`,
      { characterId: req.characterId, totpCode: req.totpCode, acceptTerms: req.acceptTerms },
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async settlementQuote(id: number): Promise<{ ok: true; quote: WocQuoteView } | WocMarketFail> {
    const out = await this.request<{ quote: WocQuoteView }>(
      'POST',
      `/api/woc-market/settlements/${id}/quote`,
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }

  async confirmSettlement(
    id: number,
    signature: string,
  ): Promise<{ ok: true; state: string } | WocMarketFail> {
    const out = await this.request<{ state: string }>(
      'POST',
      `/api/woc-market/settlements/${id}/confirm`,
      { signature },
    );
    return out.ok ? { ok: true, ...out.data } : out;
  }
}
