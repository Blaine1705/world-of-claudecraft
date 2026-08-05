// The Reliquary runtime: sparse first-find meta, capped recent finds, pure
// completion helpers. System module behind the SimContext seam (functions only;
// state lives on PlayerMeta.reliquary). Ownership of item relics reuses
// deedStats.itemsDiscovered via markItemDiscovered; this module never dual-
// writes a second full discovery set.
//
// Determinism: pure state transitions over live meta references. No Rng, no
// wall clock, no Math.random / Date.now. Clear counts are READ from existing
// dungeonClears / delveClears at first obtain only (never invented on retro).
//
// Performance: firstFind and marks are allowlist-only (catalogued ids).
// recent is a fixed-cap ring. Serialize omits empty. No per-drop saveCharacter.

import {
  isCataloguedRelicItem,
  RELIQUARY_ITEM_TO_PAGES,
  RELIQUARY_MARK_IDS,
  RELIQUARY_PAGE_ORDER,
  RELIQUARY_PAGES,
  RELIQUARY_PAGES_BY_ID,
  type ReliquaryClearSource,
  type ReliquaryPageDef,
  type ReliquaryRelicDef,
} from './content/reliquary';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { DeedStatKey, DeedStats } from './types';
import { DEED_STAT_KEYS } from './types';

/** Cap for the recent-find ring buffer (plan: 12). Drop oldest on push. */
export const RELIQUARY_RECENT_CAP = 12;

/** Sparse first-obtain metadata for one catalogued relic item id. */
export interface ReliquaryFirstFind {
  /** Clear count of the page source at first obtain (when the page has clears). */
  clears?: number;
  /** Page id that credited the find (diagnostic; multi-page fill stays global). */
  pageId?: string;
}

/**
 * Sparse Reliquary state on PlayerMeta. Item ownership is NOT here: it lives
 * in deedStats.itemsDiscovered. Only catalogued first-find meta, authored
 * non-item marks, and a capped recent ring.
 */
export interface ReliquaryState {
  firstFind: Record<string, ReliquaryFirstFind>;
  marks: Set<string>;
  recent: string[];
}

/** Serialized shape (CharacterState.reliquary). Omit-empty on write. */
export interface SavedReliquaryState {
  firstFind?: Record<string, ReliquaryFirstFind>;
  marks?: string[];
  recent?: string[];
}

export function freshReliquaryState(): ReliquaryState {
  return { firstFind: {}, marks: new Set(), recent: [] };
}

/** True when the state has nothing worth persisting. */
export function isReliquaryStateEmpty(state: ReliquaryState): boolean {
  return (
    Object.keys(state.firstFind).length === 0 && state.marks.size === 0 && state.recent.length === 0
  );
}

/**
 * Serialize with zero-default omission and sorted mark lists so equal states
 * are byte-stable and untouched characters never grow a reliquary key.
 */
export function serializeReliquaryState(state: ReliquaryState): SavedReliquaryState | undefined {
  if (isReliquaryStateEmpty(state)) return undefined;
  const out: SavedReliquaryState = {};
  const firstKeys = Object.keys(state.firstFind).sort();
  if (firstKeys.length > 0) {
    const firstFind: Record<string, ReliquaryFirstFind> = {};
    for (const k of firstKeys) {
      const entry = state.firstFind[k];
      // Drop empty entry objects so saves stay sparse.
      if (entry.clears === undefined && entry.pageId === undefined) {
        firstFind[k] = {};
      } else {
        const slim: ReliquaryFirstFind = {};
        if (entry.clears !== undefined) slim.clears = entry.clears;
        if (entry.pageId !== undefined) slim.pageId = entry.pageId;
        firstFind[k] = slim;
      }
    }
    out.firstFind = firstFind;
  }
  if (state.marks.size > 0) out.marks = [...state.marks].sort();
  if (state.recent.length > 0) out.recent = [...state.recent];
  return out;
}

/**
 * Restore from a saved blob. Filters firstFind and marks to catalogued ids
 * only so a hand-edited save cannot grow unbounded membership.
 */
export function restoreReliquaryState(saved: SavedReliquaryState | undefined): ReliquaryState {
  const state = freshReliquaryState();
  if (!saved) return state;
  if (saved.firstFind) {
    for (const [itemId, entry] of Object.entries(saved.firstFind)) {
      if (!isCataloguedRelicItem(itemId)) continue;
      if (!entry || typeof entry !== 'object') continue;
      const slim: ReliquaryFirstFind = {};
      if (typeof entry.clears === 'number' && Number.isFinite(entry.clears) && entry.clears >= 0) {
        slim.clears = Math.floor(entry.clears);
      }
      if (typeof entry.pageId === 'string' && RELIQUARY_PAGES_BY_ID[entry.pageId]) {
        slim.pageId = entry.pageId;
      }
      state.firstFind[itemId] = slim;
    }
  }
  for (const mark of saved.marks ?? []) {
    if (typeof mark === 'string' && RELIQUARY_MARK_IDS.has(mark)) state.marks.add(mark);
  }
  if (Array.isArray(saved.recent)) {
    for (const id of saved.recent) {
      if (typeof id !== 'string') continue;
      // Recent may hold item or mark ids that are still catalogued.
      if (!isCataloguedRelicItem(id) && !RELIQUARY_MARK_IDS.has(id)) continue;
      state.recent.push(id);
      if (state.recent.length >= RELIQUARY_RECENT_CAP) break;
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Clear-count reads (existing state only; never invent a parallel map)
// ---------------------------------------------------------------------------

/** Lifetime clears for a catalog clear source from live meta fields. */
export function clearCountForSource(
  meta: Pick<PlayerMeta, 'deedStats' | 'delveClears'>,
  source: ReliquaryClearSource | undefined,
): number | undefined {
  if (!source || source.kind === 'none') return undefined;
  if (source.kind === 'delve') {
    const n = meta.delveClears[source.delveId];
    return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
  }
  if (source.kind === 'deed_stat') {
    // Only authored DEED_STAT_KEYS are readable; unknown strings yield 0 so a
    // hand-edited catalog cannot invent a parallel counter channel.
    if (!(DEED_STAT_KEYS as readonly string[]).includes(source.stat)) return 0;
    const n = meta.deedStats.counters[source.stat as DeedStatKey];
    return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
  }
  // dungeon
  return dungeonClearCount(meta.deedStats, source.dungeonId, source.difficulty);
}

function dungeonClearCount(
  stats: DeedStats,
  dungeonId: string,
  difficulty: 'normal' | 'heroic' | 'any' | undefined,
): number {
  if (difficulty === 'heroic') return stats.dungeonClears[`${dungeonId}:heroic`] ?? 0;
  if (difficulty === 'normal') return stats.dungeonClears[dungeonId] ?? 0;
  return (stats.dungeonClears[dungeonId] ?? 0) + (stats.dungeonClears[`${dungeonId}:heroic`] ?? 0);
}

// ---------------------------------------------------------------------------
// Mark path (called only from markItemDiscovered on first discover)
// ---------------------------------------------------------------------------

/**
 * Hook from markItemDiscovered after a NEW item id enters itemsDiscovered.
 * Writes sparse firstFind + capped recent only for catalogued relic item ids,
 * then emits id-only reliquaryUnlock for presentation (including curatorRank
 * when this fill crossed a cosmetic rank threshold). Syncs zero-Renown rank
 * deed bridges via grantDeed (durability path for titles only). Idempotent:
 * a second call for the same id is a no-op. Does not call saveCharacter on
 * pure silhouette fill and does not dual-write discovery.
 */
export function onItemDiscovered(ctx: SimContext, meta: PlayerMeta, itemId: string): void {
  if (!isCataloguedRelicItem(itemId)) return;
  // Rank is derived from itemsDiscovered (already includes this id). The prior
  // unique catalog fill count is owned - 1 because this discover is the first
  // time the id entered the set (markItemDiscovered only calls on first add).
  const owned = catalogItemCompletion(meta.deedStats.itemsDiscovered).owned;
  const previousRank = curatorRankFromOwned(Math.max(0, owned - 1));
  const newRank = curatorRankFromOwned(owned);
  if (!noteRelicItemFind(meta, itemId)) return;
  const rankedUp = newRank > previousRank ? newRank : undefined;
  emitReliquaryUnlock(ctx, meta, { itemId, curatorRank: rankedUp });
  if (rankedUp !== undefined) syncCuratorRankDeeds(ctx, meta);
}

/**
 * Record first-find meta and push the recent ring for a catalogued item relic.
 * Safe to call only when the item is already in itemsDiscovered (the deeds hub
 * owns that set). Retro ownership without this call leaves firstFind absent.
 * @returns true when a new firstFind entry was written.
 */
export function noteRelicItemFind(meta: PlayerMeta, itemId: string): boolean {
  const pageIds = RELIQUARY_ITEM_TO_PAGES.get(itemId);
  if (!pageIds || pageIds.length === 0) return false;

  const state = meta.reliquary;
  if (state.firstFind[itemId] !== undefined) {
    // Already noted: do not re-stamp clears or re-push recent.
    return false;
  }

  const pageId = pageIds[0];
  const page = RELIQUARY_PAGES_BY_ID[pageId];
  const clears = clearCountForSource(meta, page?.clearSource);
  const entry: ReliquaryFirstFind = {};
  if (clears !== undefined) entry.clears = clears;
  if (pageId) entry.pageId = pageId;
  state.firstFind[itemId] = entry;
  pushRecent(state, itemId);
  return true;
}

/** Grant an authored non-item Reliquary mark (profession trophy, etc.). */
export function noteReliquaryMark(ctx: SimContext, meta: PlayerMeta, markId: string): boolean {
  if (!RELIQUARY_MARK_IDS.has(markId)) return false;
  if (meta.reliquary.marks.has(markId)) return false;
  meta.reliquary.marks.add(markId);
  pushRecent(meta.reliquary, markId);
  emitReliquaryUnlock(ctx, meta, { markId });
  return true;
}

/**
 * Id-only presentation event for a new catalogued relic or mark. Never
 * English. Membership authority stays on itemsDiscovered + sparse blob.
 * Optional curatorRank is the new cosmetic rank index when this fill ranked up.
 */
function emitReliquaryUnlock(
  ctx: SimContext,
  meta: PlayerMeta,
  ids: { itemId?: string; markId?: string; curatorRank?: number },
): void {
  const pageIds = ids.itemId !== undefined ? RELIQUARY_ITEM_TO_PAGES.get(ids.itemId) : undefined;
  let illuminatedPageId: string | undefined;
  if (pageIds && pageIds.length > 0) {
    const opts = {
      itemsDiscovered: meta.deedStats.itemsDiscovered,
      marks: meta.reliquary.marks,
    };
    for (const pageId of pageIds) {
      const page = RELIQUARY_PAGES_BY_ID[pageId];
      if (!page) continue;
      if (pageCompletion(page, opts).complete) {
        illuminatedPageId = pageId;
        break;
      }
    }
  }
  ctx.emit({
    type: 'reliquaryUnlock',
    pid: meta.entityId,
    ...(ids.itemId !== undefined ? { itemId: ids.itemId } : {}),
    ...(ids.markId !== undefined ? { markId: ids.markId } : {}),
    ...(pageIds && pageIds.length > 0 ? { pageIds: [...pageIds] } : {}),
    ...(illuminatedPageId !== undefined ? { illuminatedPageId } : {}),
    ...(ids.curatorRank !== undefined && ids.curatorRank > 0
      ? { curatorRank: ids.curatorRank }
      : {}),
  });
}

/**
 * Sparse wire blob for the heavy self snapshot. Reuses the omit-empty
 * serialize shape; never a second full itemsDiscovered array.
 */
export function reliquaryWireBlob(state: ReliquaryState): SavedReliquaryState {
  return serializeReliquaryState(state) ?? {};
}

function pushRecent(state: ReliquaryState, id: string): void {
  // De-dupe: if already newest, leave alone; otherwise move to front of "new".
  const existing = state.recent.indexOf(id);
  if (existing === 0) return;
  if (existing > 0) state.recent.splice(existing, 1);
  state.recent.push(id);
  while (state.recent.length > RELIQUARY_RECENT_CAP) state.recent.shift();
}

// ---------------------------------------------------------------------------
// Pure ownership + completion (no mutation)
// ---------------------------------------------------------------------------

/** Any set-like container of owned item ids (itemsDiscovered or a test Set). */
export interface OwnedIdLookup {
  has(id: string): boolean;
}

/** True when an item relic is owned via the discovery ledger. */
export function ownsItemRelic(ownedItems: OwnedIdLookup, itemId: string): boolean {
  return ownedItems.has(itemId);
}

/** True when a relic slot is filled for the given ownership surfaces. */
export function isRelicFilled(
  relic: ReliquaryRelicDef,
  opts: {
    itemsDiscovered: OwnedIdLookup;
    marks?: OwnedIdLookup;
    ownedMounts?: OwnedIdLookup;
    weaponSkins?: OwnedIdLookup;
    deedsEarned?: OwnedIdLookup;
  },
): boolean {
  switch (relic.kind) {
    case 'item':
      return opts.itemsDiscovered.has(relic.itemId);
    case 'mark':
      return opts.marks?.has(relic.markId) === true;
    case 'mount':
      return opts.ownedMounts?.has(relic.mountId) === true;
    case 'weapon_skin':
      return opts.weaponSkins?.has(relic.skinId) === true;
    case 'title':
      return opts.deedsEarned?.has(relic.deedId) === true;
  }
}

/** Page progress X/Y over item (+ optional other) ownership. */
export function pageCompletion(
  page: ReliquaryPageDef,
  opts: {
    itemsDiscovered: OwnedIdLookup;
    marks?: OwnedIdLookup;
    ownedMounts?: OwnedIdLookup;
    weaponSkins?: OwnedIdLookup;
    deedsEarned?: OwnedIdLookup;
  },
): { owned: number; total: number; complete: boolean } {
  let owned = 0;
  const total = page.relics.length;
  for (const relic of page.relics) {
    if (isRelicFilled(relic, opts)) owned++;
  }
  return { owned, total, complete: total > 0 && owned === total };
}

/** Catalog-wide unique item-relic progress (item ids de-duped across pages). */
export function catalogItemCompletion(
  itemsDiscovered: OwnedIdLookup,
  pages: readonly ReliquaryPageDef[] = RELIQUARY_PAGES,
): { owned: number; total: number } {
  const all = new Set<string>();
  let owned = 0;
  for (const page of pages) {
    for (const relic of page.relics) {
      if (relic.kind !== 'item') continue;
      if (all.has(relic.itemId)) continue;
      all.add(relic.itemId);
      if (itemsDiscovered.has(relic.itemId)) owned++;
    }
  }
  return { owned, total: all.size };
}

/**
 * Pure Curator rank tiers: cosmetic-only. Rank from unique catalogued relic
 * fills (never kill count alone). Rewards are titles / borders / window seal
 * chrome; never combat stats, drop rate, pity, or actionable combat info.
 * Thresholds are inclusive minimums for rank 1..N. Rank 0 = none.
 */
export interface CuratorRankDef {
  /** Rank index 1..N (matches curatorRankFromOwned). */
  rank: number;
  /** Inclusive unique-owned minimum for this rank. */
  threshold: number;
  /** Window seal chrome id (CSS data-seal); derived, never stored. */
  sealId: string;
  /**
   * Optional zero-Renown deed bridge granted when this rank is first reached.
   * Titles/borders only; renown must stay 0 (luck/catalog prestige never
   * scores Renown). grantDeed is the sticky set; no rankRewardsGranted blob.
   */
  deedId?: string;
}

export const CURATOR_RANK_DEFS: readonly CuratorRankDef[] = [
  { rank: 1, threshold: 1, sealId: 'apprentice' },
  { rank: 2, threshold: 10, sealId: 'keeper', deedId: 'col_reliquary_rank_2' },
  { rank: 3, threshold: 25, sealId: 'master', deedId: 'col_reliquary_rank_3' },
  { rank: 4, threshold: 50, sealId: 'grand', deedId: 'col_reliquary_rank_4' },
  { rank: 5, threshold: 100, sealId: 'eternal', deedId: 'col_reliquary_rank_5' },
];

/** Inclusive unique-owned thresholds for rank 1..N (derived from CURATOR_RANK_DEFS). */
export const CURATOR_RANK_THRESHOLDS: readonly number[] = CURATOR_RANK_DEFS.map((d) => d.threshold);

export function curatorRankFromOwned(
  ownedUnique: number,
  thresholds: readonly number[] = CURATOR_RANK_THRESHOLDS,
): number {
  if (!(ownedUnique > 0)) return 0;
  let rank = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (ownedUnique >= thresholds[i]) rank = i + 1;
    else break;
  }
  return rank;
}

/** Seal chrome id for a rank, or null when unranked. Pure; never invents power. */
export function curatorSealIdForRank(rank: number): string | null {
  if (!(rank > 0)) return null;
  const def = CURATOR_RANK_DEFS[rank - 1];
  return def?.sealId ?? null;
}

/**
 * Grant zero-Renown Curator rank deed bridges for every rank the player has
 * already earned by unique catalogued fill count. Idempotent via grantDeed.
 * Does not force saveCharacter itself: grantDeed (title/border durability)
 * is the existing durability-critical path when a new deed lands.
 */
export function syncCuratorRankDeeds(
  ctx: SimContext,
  meta: PlayerMeta,
  opts?: { retro?: boolean },
): void {
  const owned = catalogItemCompletion(meta.deedStats.itemsDiscovered).owned;
  const rank = curatorRankFromOwned(owned);
  if (rank <= 0) return;
  for (let i = 0; i < rank; i++) {
    const deedId = CURATOR_RANK_DEFS[i]?.deedId;
    if (!deedId) continue;
    ctx.grantDeed(meta, deedId, opts?.retro ? { retro: true } : undefined);
  }
}

/** Convenience: live pages in append order (skip missing defs). */
export function orderedReliquaryPages(
  order: readonly string[] = RELIQUARY_PAGE_ORDER,
  byId: Readonly<Record<string, ReliquaryPageDef>> = RELIQUARY_PAGES_BY_ID,
): ReliquaryPageDef[] {
  const out: ReliquaryPageDef[] = [];
  for (const id of order) {
    const page = byId[id];
    if (page) out.push(page);
  }
  return out;
}

// Re-export catalog lookup helpers so callers can import from one runtime module.
export {
  isCataloguedRelicItem,
  RELIQUARY_ITEM_TO_PAGES,
  RELIQUARY_MARK_IDS,
  RELIQUARY_PAGE_ORDER,
  RELIQUARY_PAGES,
  RELIQUARY_PAGES_BY_ID,
};
