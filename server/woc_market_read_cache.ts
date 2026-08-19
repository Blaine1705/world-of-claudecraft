// Shared read caches for the $WOC Exchange's hot GET surface (H11). One
// instance per realm process, injected into WocMarketService (reads consult
// it) and exposed on the routes runtime (mutations bust it). Built on the
// house cache seam (KeyedCachedRead: TTL, single-flight per key, LRU bound,
// stale-on-error), never a per-request pool.query.
//
// What is cached, and why each key is safe to share:
// - browse pages, keyed by the CANONICAL query tuple. The browse SQL is
//   viewer-identical (directed listings are excluded by the query itself;
//   the one per-viewer bit, listingView's `mine`, is computed per request
//   over the shared rows).
// - listing rows by id, for the detail read. The row is shared; the
//   directed-sale party gate stays IN THE SERVICE and runs per request over
//   the cached row, so a warm cache can never widen who sees a directed
//   listing (pinned by the two-viewer test).
// - sales history by item id (viewer-identical).
// - the activity readout by account id. Account-scoped: the ACCOUNT IS THE
//   KEY, so one account's readout can never serve another (the
//   discord_status_cache shape).
//
// Staleness model: TTLs sit at or under the cadences that already bound how
// fresh this data is (the 5s sweep beat, the window's 3s awaiting-chain
// poll), so the cache never makes a player's view meaningfully staler than
// the server's own convergence. Player-visible immediacy is preserved by
// BUSTS, not tiny TTLs: every successful market mutation on the routes layer
// busts the listings surface and the actor's activity readout, and the two
// moderation arms bust what they change (suspend -> listings; sale exclusion
// -> that item's history; strike clearing -> that account's readout). Sweep
// transitions deliberately ride the TTL.
//
// Values handed out are FROZEN one level deep (result object, its arrays,
// their rows): read() hands the SAME object to every caller inside a TTL
// window, so an in-place sort or redaction by one consumer would corrupt it
// for the rest (the monitor's freezeReadout rationale).

import type { KeyedCachedReadStats } from './cached_read';
import { KeyedCachedRead } from './cached_read';
import type { WocBrowseQuery } from './woc_market';

export const WOC_MARKET_BROWSE_CACHE_TTL_MS = 3_000;
export const WOC_MARKET_BROWSE_CACHE_MAX_ENTRIES = 128;
export const WOC_MARKET_DETAIL_CACHE_TTL_MS = 3_000;
export const WOC_MARKET_DETAIL_CACHE_MAX_ENTRIES = 256;
export const WOC_MARKET_HISTORY_CACHE_TTL_MS = 10_000;
export const WOC_MARKET_HISTORY_CACHE_MAX_ENTRIES = 256;
export const WOC_MARKET_ME_CACHE_TTL_MS = 2_000;
export const WOC_MARKET_ME_CACHE_MAX_ENTRIES = 512;

/** The canonical browse cache key. Field-by-field, never JSON.stringify of
 *  the object: key equality must not depend on property insertion order, and
 *  itemIds are joined AFTER the route's own bound (50 ids, 128 chars each)
 *  so the key length is bounded by what the route already admits. The \x1f
 *  separator cannot appear in any component (itemIds pass the route's
 *  stringField screen; the rest are enum words and integers). */
export function wocBrowseCacheKey(q: WocBrowseQuery): string {
  return [
    String(q.page),
    String(q.pageSize),
    q.sort,
    q.quality ?? '',
    q.format ?? '',
    q.itemIds === null ? '' : q.itemIds.join(','),
  ].join('\x1f');
}

/** One level of defensive freezing: the shared result, its arrays, and their
 *  rows. Deliberately not deep (row internals like the item payload are
 *  treated as read-only by every consumer; deep-freezing them would walk
 *  every cached byte per refresh). */
function freezeShared<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const inner of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(inner)) {
      for (const row of inner) {
        if (row !== null && typeof row === 'object') Object.freeze(row);
      }
      Object.freeze(inner);
    }
  }
  if (Array.isArray(value)) {
    for (const row of value as unknown[]) {
      if (row !== null && typeof row === 'object') Object.freeze(row);
    }
  }
  return Object.freeze(value);
}

/** A keyed cache whose refresh thunk arrives PER CALL (the service passes a
 *  closure over its own uncached read), kept in a registry the constructor
 *  refresh dispatches through. Every read() installs its thunk first, so a
 *  TTL-expiry refresh started inside that read always finds it; the registry
 *  is pruned against the cache's own key set so it can never outgrow the LRU
 *  bound it mirrors. */
class ThunkKeyedCache<K extends string | number> {
  private readonly cache: KeyedCachedRead<unknown, K>;
  private readonly refreshers = new Map<K, () => Promise<unknown>>();

  constructor(private readonly opts: { ttlMs: number; maxEntries: number; now?: () => number }) {
    this.cache = new KeyedCachedRead<unknown, K>((key) => {
      const refresh = this.refreshers.get(key);
      if (!refresh) throw new Error(`woc market read cache has no refresh for key ${String(key)}`);
      return refresh().then(freezeShared);
    }, opts);
  }

  read<T>(key: K, refresh: () => Promise<T>): Promise<T> {
    this.refreshers.set(key, refresh);
    if (this.refreshers.size > this.opts.maxEntries * 2) {
      for (const k of this.refreshers.keys()) {
        if (!this.cache.has(k)) this.refreshers.delete(k);
      }
    }
    return this.cache.read(key) as Promise<T>;
  }

  bust(key: K): void {
    this.cache.bust(key);
  }

  bustAll(): void {
    this.cache.bustAll();
  }

  stats(): KeyedCachedReadStats {
    return this.cache.stats();
  }
}

export interface WocMarketReadCacheOptions {
  /** Injected clock for tests; production callers omit it (Date.now). */
  now?: () => number;
  /** Test-only TTL overrides; production callers omit them. */
  browseTtlMs?: number;
  detailTtlMs?: number;
  historyTtlMs?: number;
  meTtlMs?: number;
}

export class WocMarketReadCache {
  private readonly browsePages: ThunkKeyedCache<string>;
  private readonly listingRows: ThunkKeyedCache<number>;
  private readonly salesByItem: ThunkKeyedCache<string>;
  private readonly meByAccount: ThunkKeyedCache<number>;

  constructor(opts: WocMarketReadCacheOptions = {}) {
    this.browsePages = new ThunkKeyedCache({
      ttlMs: opts.browseTtlMs ?? WOC_MARKET_BROWSE_CACHE_TTL_MS,
      maxEntries: WOC_MARKET_BROWSE_CACHE_MAX_ENTRIES,
      now: opts.now,
    });
    this.listingRows = new ThunkKeyedCache({
      ttlMs: opts.detailTtlMs ?? WOC_MARKET_DETAIL_CACHE_TTL_MS,
      maxEntries: WOC_MARKET_DETAIL_CACHE_MAX_ENTRIES,
      now: opts.now,
    });
    this.salesByItem = new ThunkKeyedCache({
      ttlMs: opts.historyTtlMs ?? WOC_MARKET_HISTORY_CACHE_TTL_MS,
      maxEntries: WOC_MARKET_HISTORY_CACHE_MAX_ENTRIES,
      now: opts.now,
    });
    this.meByAccount = new ThunkKeyedCache({
      ttlMs: opts.meTtlMs ?? WOC_MARKET_ME_CACHE_TTL_MS,
      maxEntries: WOC_MARKET_ME_CACHE_MAX_ENTRIES,
      now: opts.now,
    });
  }

  browse<T>(q: WocBrowseQuery, refresh: () => Promise<T>): Promise<T> {
    return this.browsePages.read(wocBrowseCacheKey(q), refresh);
  }

  listingRow<T>(id: number, refresh: () => Promise<T>): Promise<T> {
    return this.listingRows.read(id, refresh);
  }

  sales<T>(itemId: string, refresh: () => Promise<T>): Promise<T> {
    return this.salesByItem.read(itemId, refresh);
  }

  myActivity<T>(account: number, refresh: () => Promise<T>): Promise<T> {
    return this.meByAccount.read(account, refresh);
  }

  /** The listings surface changed (a listing created, cancelled, bid on,
   *  bought, suspended, or a directed deal escrowed one): browse pages and
   *  listing rows both restate it, so both drop. Coarse ON PURPOSE: at the
   *  mutation limiter's ceiling this is a handful of re-reads per minute,
   *  and a finer map would be a second copy of which mutation touches which
   *  page. */
  bustListings(): void {
    this.browsePages.bustAll();
    this.listingRows.bustAll();
  }

  bustMe(account: number): void {
    this.meByAccount.bust(account);
  }

  bustHistory(itemId: string): void {
    this.salesByItem.bust(itemId);
  }

  /** The sale-exclusion moderation arm knows only the sale id, not the item,
   *  so it drops the whole history map (rare, and enforcement must not wait
   *  out a TTL: the cached-read moderation-bust rule). */
  bustHistoryAll(): void {
    this.salesByItem.bustAll();
  }

  /** Everything at once (tests; also the honest lever if an operator action
   *  ever needs a full drop). */
  bustAll(): void {
    this.browsePages.bustAll();
    this.listingRows.bustAll();
    this.salesByItem.bustAll();
    this.meByAccount.bustAll();
  }

  stats(): {
    browse: KeyedCachedReadStats;
    detail: KeyedCachedReadStats;
    history: KeyedCachedReadStats;
    me: KeyedCachedReadStats;
  } {
    return {
      browse: this.browsePages.stats(),
      detail: this.listingRows.stats(),
      history: this.salesByItem.stats(),
      me: this.meByAccount.stats(),
    };
  }
}
