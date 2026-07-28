import type { AdminGuildSort, AdminGuildSortDirection } from './admin_guilds_sort';

// This is deliberately a third cache shape beside cached_read.ts and deeds_board_warm.ts.
// Search, sort, and page create bounded key cardinality, while member-count sorting can
// aggregate every matched guild. Admit only two distinct cold reads from this endpoint so
// one operator cannot fan out several expensive aggregations; identical requests share a flight.
export const ADMIN_GUILD_LIST_MAX_CONCURRENT_READS = 2;
export const ADMIN_GUILD_LIST_CACHE_MAX_ENTRIES = 64;
export const ADMIN_GUILD_LIST_CACHE_TTL_MS = 2_000;

export interface AdminGuildListRequest {
  search: string;
  page: number;
  limit: number;
  sort: AdminGuildSort;
  dir: AdminGuildSortDirection;
}

export class AdminGuildListBusyError extends Error {
  constructor() {
    super('admin guild list is busy');
    this.name = 'AdminGuildListBusyError';
  }
}

const inFlight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { value: unknown; expiresAt: number }>();
let cacheEpoch = 0;

export function normalizeAdminGuildSearch(search: string): string {
  return search.trim().slice(0, 64);
}

function requestKey(request: AdminGuildListRequest): string {
  return JSON.stringify([
    normalizeAdminGuildSearch(request.search).toLocaleLowerCase('en-US'),
    request.page,
    request.limit,
    request.sort,
    request.dir,
  ]);
}

export async function readAdminGuildList<T>(
  request: AdminGuildListRequest,
  load: () => Promise<T>,
): Promise<T> {
  const key = requestKey(request);
  const cached = cache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      cache.delete(key);
      cache.set(key, cached);
      return cached.value as T;
    }
    cache.delete(key);
  }

  const epoch = cacheEpoch;
  const flightKey = `${epoch}:${key}`;
  const existing = inFlight.get(flightKey);
  if (existing) return existing as Promise<T>;
  if (inFlight.size >= ADMIN_GUILD_LIST_MAX_CONCURRENT_READS) {
    throw new AdminGuildListBusyError();
  }

  const pending = Promise.resolve()
    .then(load)
    .then((value) => {
      if (cacheEpoch === epoch) {
        cache.delete(key);
        cache.set(key, { value, expiresAt: Date.now() + ADMIN_GUILD_LIST_CACHE_TTL_MS });
        while (cache.size > ADMIN_GUILD_LIST_CACHE_MAX_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cache.delete(oldest);
        }
      }
      return value;
    });
  inFlight.set(flightKey, pending);
  try {
    return await pending;
  } finally {
    if (inFlight.get(flightKey) === pending) inFlight.delete(flightKey);
  }
}

export function bustAdminGuildListReads(): void {
  cacheEpoch += 1;
  cache.clear();
}

export function adminGuildListCacheSizeForTests(): number {
  return cache.size;
}

export function resetAdminGuildListReadsForTests(): void {
  cacheEpoch += 1;
  inFlight.clear();
  cache.clear();
}
