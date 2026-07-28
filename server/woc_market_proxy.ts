// Typed game-server client for the economy service's $WOC marketplace surface
// (the claudium_proxy.ts sibling; same service, same secret-gated internal
// API, same contract). ALL token math lives in the service: the USD to $WOC
// conversion, the oracle (time-weighted price, multiple liquidity sources,
// deviation and freshness limits), the 90/3/7 split, transaction building,
// finality confirmation, and bond escrow refunds/forfeits. The game passes
// USD cents in and renders what comes back, verbatim.
//
// GRACEFUL DEGRADATION IS THE CONTRACT. If WOC_ECONOMY_SERVICE_URL or
// WOC_ECONOMY_INTERNAL_SECRET is unset, OR the service is unreachable /
// errors / times out, every method returns a typed unavailable result and
// NEVER throws up into request handling. An unavailable or unhealthy price
// pauses new purchases and settlements (woc_market.ts guardEnabledHealthy)
// while auctions keep counting down, exactly the PRD's suspension behavior.
//
// A transfer the buyer signed but the game never confirmed (a crash, a
// suspended listing) reconciles inside the SERVICE's own recovery window (the
// confirmNativeSettlement precedent): memo references make every transfer
// attributable, so orphans refund service-side without game participation.
//
// The DEV arm (createDevWocMarketEconomy) is an in-memory stand-in for local
// play and tests: fixed price, instant finality, always-successful refunds.
// It is wired ONLY when ALLOW_DEV_COMMANDS=1 AND WOC_MARKET_DEV_SERVICE=1
// (main.ts), the dev-cheat gating precedent; production never sees it.

import type { WocEstimate, WocMarketEconomy, WocPriceInfo, WocQuoteIntent } from './woc_market';
import { WOC_MARKET_QUOTE_TTL_SECONDS } from './woc_market_rules';

const SERVICE_TIMEOUT_MS = 5000;
const CONFIRM_TIMEOUT_MS = 60_000;
/** Estimates and price reads are cached briefly: browse/bid-form traffic must
 *  never turn into a per-request service call storm. */
const PRICE_CACHE_TTL_MS = 15_000;
const ESTIMATE_CACHE_TTL_MS = 15_000;
const ESTIMATE_CACHE_MAX_ENTRIES = 256;

function serviceUrl(): string {
  return (process.env.WOC_ECONOMY_SERVICE_URL ?? '').trim();
}

function serviceSecret(): string {
  return process.env.WOC_ECONOMY_INTERNAL_SECRET ?? '';
}

let loggedOnce = false;
function logFailure(err: unknown): void {
  if (loggedOnce) return;
  loggedOnce = true;
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[woc_market] economy service unavailable: ${message}`);
}

interface ServiceRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  timeoutMs?: number;
}

/** The one fetch wrapper (the claudium_proxy shape): parsed JSON on 2xx, null
 *  on any failure. It NEVER throws; every caller maps null to unavailable. */
async function callService<T>(req: ServiceRequest): Promise<T | null> {
  const base = serviceUrl();
  const secret = serviceSecret();
  if (base === '' || secret === '') return null;
  try {
    const url = new URL(req.path.replace(/^\//, ''), base.endsWith('/') ? base : `${base}/`);
    const headers: Record<string, string> = { 'x-woc-economy-secret': secret };
    let body: string | undefined;
    if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body);
    }
    const res = await fetch(url, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(req.timeoutMs ?? SERVICE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${req.method} ${req.path} -> ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    logFailure(err);
    return null;
  }
}

const PRICE_UNAVAILABLE: WocPriceInfo = {
  available: false,
  healthy: false,
  reason: 'service_unavailable',
  tokensPerUsd: null,
  asOfMs: null,
};

const QUOTE_UNAVAILABLE: WocQuoteIntent = {
  ok: false,
  reference: null,
  transactionBase64: null,
  amount: null,
  seller: null,
  burn: null,
  treasury: null,
  expiresAtMs: null,
  reason: 'service_unavailable',
};

// Wire shapes of the service's marketplace surface (SDK v1 mirror; the
// service repo owns these).
interface WirePrice {
  healthy?: boolean;
  reason?: string | null;
  tokensPerUsd?: number | null;
  asOfMs?: number | null;
}
interface WireLeg {
  base?: string;
  tokens?: number;
}
interface WireEstimate {
  ok?: boolean;
  amount?: WireLeg | null;
  asOfMs?: number | null;
}
interface WireQuote {
  ok?: boolean;
  reference?: string | null;
  transactionBase64?: string | null;
  amount?: WireLeg | null;
  seller?: WireLeg | null;
  burn?: WireLeg | null;
  treasury?: WireLeg | null;
  expiresAtMs?: number | null;
  reason?: string | null;
}
interface WireConfirm {
  settled?: boolean;
  pending?: boolean;
  reason?: string | null;
}
interface WireBondAction {
  done?: boolean;
  reason?: string | null;
}

function leg(value: WireLeg | null | undefined): { base: string; tokens: number } | null {
  if (!value || typeof value.base !== 'string' || typeof value.tokens !== 'number') return null;
  return { base: value.base, tokens: value.tokens };
}

function toQuote(wire: WireQuote | null): WocQuoteIntent {
  if (!wire) return QUOTE_UNAVAILABLE;
  if (wire.ok !== true) {
    return { ...QUOTE_UNAVAILABLE, reason: wire.reason ?? 'refused' };
  }
  return {
    ok: true,
    reference: wire.reference ?? null,
    transactionBase64: wire.transactionBase64 ?? null,
    amount: leg(wire.amount),
    seller: leg(wire.seller),
    burn: leg(wire.burn),
    treasury: leg(wire.treasury),
    expiresAtMs: wire.expiresAtMs ?? null,
    reason: null,
  };
}

export function createWocMarketEconomyProxy(): WocMarketEconomy {
  let priceCache: { at: number; value: WocPriceInfo } | null = null;
  const estimateCache = new Map<number, { at: number; value: WocEstimate }>();

  return {
    async price(): Promise<WocPriceInfo> {
      const now = Date.now();
      if (priceCache && now - priceCache.at < PRICE_CACHE_TTL_MS) return priceCache.value;
      const wire = await callService<WirePrice>({ method: 'GET', path: '/internal/market/price' });
      const value: WocPriceInfo = wire
        ? {
            available: true,
            healthy: wire.healthy === true,
            reason: wire.reason ?? null,
            tokensPerUsd: wire.tokensPerUsd ?? null,
            asOfMs: wire.asOfMs ?? null,
          }
        : PRICE_UNAVAILABLE;
      priceCache = { at: now, value };
      return value;
    },

    async estimate(usdCents: number): Promise<WocEstimate> {
      const now = Date.now();
      const hit = estimateCache.get(usdCents);
      if (hit && now - hit.at < ESTIMATE_CACHE_TTL_MS) return hit.value;
      const wire = await callService<WireEstimate>({
        method: 'POST',
        path: '/internal/market/estimate',
        body: { usdCents },
      });
      const value: WocEstimate =
        wire && wire.ok === true
          ? { available: true, usdCents, amount: leg(wire.amount), asOfMs: wire.asOfMs ?? null }
          : { available: false, usdCents, amount: null, asOfMs: null };
      if (estimateCache.size >= ESTIMATE_CACHE_MAX_ENTRIES) {
        const oldest = estimateCache.keys().next().value;
        if (oldest !== undefined) estimateCache.delete(oldest);
      }
      estimateCache.set(usdCents, { at: now, value });
      return value;
    },

    async bondQuote(args): Promise<WocQuoteIntent> {
      const wire = await callService<WireQuote>({
        method: 'POST',
        path: '/internal/market/bond-quote',
        body: args,
      });
      return toQuote(wire);
    },

    async settlementQuote(args): Promise<WocQuoteIntent> {
      const wire = await callService<WireQuote>({
        method: 'POST',
        path: '/internal/market/settlement-quote',
        body: args,
      });
      return toQuote(wire);
    },

    async confirm(reference, signature) {
      const wire = await callService<WireConfirm>({
        method: 'POST',
        path: '/internal/market/confirm',
        body: { reference, signature },
        timeoutMs: CONFIRM_TIMEOUT_MS,
      });
      if (!wire) return { settled: false, pending: true, reason: 'service_unavailable' };
      return {
        settled: wire.settled === true,
        pending: wire.pending === true,
        reason: wire.reason ?? null,
      };
    },

    async refundBond(reference) {
      const wire = await callService<WireBondAction>({
        method: 'POST',
        path: '/internal/market/bond-refund',
        body: { reference },
      });
      return { done: wire?.done === true, reason: wire?.reason ?? null };
    },

    async forfeitBond(reference) {
      const wire = await callService<WireBondAction>({
        method: 'POST',
        path: '/internal/market/bond-forfeit',
        body: { reference },
      });
      return { done: wire?.done === true, reason: wire?.reason ?? null };
    },
  };
}

// ---------------------------------------------------------------------------
// Dev arm: deterministic in-memory economy for local play and tests
// ---------------------------------------------------------------------------

const DEV_TOKEN_DECIMALS = 9;

function devPriceMicroUsd(): number {
  const raw = Number(process.env.WOC_MARKET_DEV_PRICE_MICRO_USD ?? '1000');
  return Number.isFinite(raw) && raw > 0 ? raw : 1000;
}

function devLeg(usdCents: number, priceMicroUsd: number): { base: string; tokens: number } {
  // tokens = usd / price; cents * 10_000 micro-USD per cent.
  const tokens = (usdCents * 10_000) / priceMicroUsd;
  const base = BigInt(Math.round(tokens * 10 ** 6)) * BigInt(10 ** (DEV_TOKEN_DECIMALS - 6));
  return { base: base.toString(), tokens };
}

/** The in-memory dev economy: the same interface, a fixed price, references
 *  minted locally, instant finality for any non-empty signature, refunds that
 *  always succeed. The 90/3/7 split matches the PRD's fee table so the dev UI
 *  renders realistic breakdowns. Never wired in production (main.ts gates it
 *  behind ALLOW_DEV_COMMANDS + WOC_MARKET_DEV_SERVICE). */
export function createDevWocMarketEconomy(now: () => number = Date.now): WocMarketEconomy {
  let nextRef = 1;
  const openQuotes = new Map<string, { expiresAtMs: number }>();
  const settledRefs = new Set<string>();

  const quote = (usdCents: number, split: boolean): WocQuoteIntent => {
    const price = devPriceMicroUsd();
    const reference = `dev_woc_${nextRef++}`;
    const expiresAtMs = now() + WOC_MARKET_QUOTE_TTL_SECONDS * 1000;
    openQuotes.set(reference, { expiresAtMs });
    const amount = devLeg(usdCents, price);
    return {
      ok: true,
      reference,
      transactionBase64: Buffer.from(`dev-tx:${reference}:${usdCents}`).toString('base64'),
      amount,
      seller: split ? devLeg(Math.floor((usdCents * 90) / 100), price) : null,
      burn: split ? devLeg(Math.floor((usdCents * 3) / 100), price) : null,
      treasury: split
        ? devLeg(
            usdCents - Math.floor((usdCents * 90) / 100) - Math.floor((usdCents * 3) / 100),
            price,
          )
        : null,
      expiresAtMs,
      reason: null,
    };
  };

  return {
    async price(): Promise<WocPriceInfo> {
      return {
        available: true,
        healthy: true,
        reason: null,
        tokensPerUsd: 1_000_000 / devPriceMicroUsd(),
        asOfMs: now(),
      };
    },
    async estimate(usdCents: number): Promise<WocEstimate> {
      return {
        available: true,
        usdCents,
        amount: devLeg(usdCents, devPriceMicroUsd()),
        asOfMs: now(),
      };
    },
    async bondQuote(args): Promise<WocQuoteIntent> {
      return quote(args.usdCents, false);
    },
    async settlementQuote(args): Promise<WocQuoteIntent> {
      return quote(args.usdCents, true);
    },
    async confirm(reference, signature) {
      const open = openQuotes.get(reference);
      if (!open && !settledRefs.has(reference)) {
        return { settled: false, pending: false, reason: 'unknown_reference' };
      }
      if (signature.trim() === '') {
        return { settled: false, pending: false, reason: 'bad_signature' };
      }
      if (open && open.expiresAtMs <= now() && !settledRefs.has(reference)) {
        return { settled: false, pending: false, reason: 'quote_expired' };
      }
      settledRefs.add(reference);
      return { settled: true, pending: false, reason: null };
    },
    async refundBond() {
      return { done: true, reason: null };
    },
    async forfeitBond() {
      return { done: true, reason: null };
    },
  };
}
