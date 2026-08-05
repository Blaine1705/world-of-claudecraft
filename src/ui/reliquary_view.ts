// Pure view-core for The Reliquary window (#reliquary-window). DOM/Three/i18n-free:
// maps IWorldReliquary reads plus the static catalog (injected so tests drive
// synthetic tables) to flat render models the cold painter draws. Registered in
// UI_PURE_CORES; unit-tested in tests/reliquary_view.test.ts.
//
// Phase 5: page grids (owned art vs silhouette), unlock/Illumination plan, and
// grid-relevant refresh signature dimensions. Phase 6: Curator rank names,
// seal chrome, and rank-up celebration plan.

import type {
  ReliquaryPageDef,
  ReliquaryRelicDef,
  ReliquaryShelfId,
} from '../sim/content/reliquary';
import {
  catalogRankOwned,
  catalogRelicCompletion,
  curatorRankFromOwned,
  curatorSealIdForRank,
  isRelicFilled,
  pageCompletion,
} from '../sim/reliquary';
import type { TranslationKey } from './i18n';

/** Top-level nav: virtual Overview plus the three catalog shelves. */
export const RELIQUARY_NAV = ['overview', 'conquerors', 'professions', 'horizons'] as const;
export type ReliquaryNavId = (typeof RELIQUARY_NAV)[number];

/** Named Curator rank chrome keys (Phase 6). Falls back to numeric rank label. */
export const CURATOR_RANK_NAME_KEYS: readonly TranslationKey[] = [
  'hudChrome.reliquary.curatorRankName1',
  'hudChrome.reliquary.curatorRankName2',
  'hudChrome.reliquary.curatorRankName3',
  'hudChrome.reliquary.curatorRankName4',
  'hudChrome.reliquary.curatorRankName5',
];

/** Shared key picker for Overview seal chrome, sheet lines, and rank-up toast. */
export function curatorRankNameKey(rank: number): TranslationKey {
  if (rank >= 1 && rank <= CURATOR_RANK_NAME_KEYS.length) {
    return CURATOR_RANK_NAME_KEYS[rank - 1]!;
  }
  return 'hudChrome.reliquary.curatorRank';
}

/**
 * i18n key for a catalogued profession mark find label.
 * Mark ids use colon namespaces (`gather_event:pristine_vein`); the leaf key
 * replaces `:` with `_` under `hudChrome.reliquary.markFind.*`.
 */
export function reliquaryMarkFindKey(markId: string): string {
  return `hudChrome.reliquary.markFind.${markId.replace(/:/g, '_')}`;
}

/** How incomplete a page must be (and how full) to appear in nearly-complete. */
export const RELIQUARY_NEARLY_MIN_OWNED = 1;
export const RELIQUARY_NEARLY_MAX = 5;

/** Sparse first-find meta (mirrors IWorld.reliquaryFirstFind). */
export type ReliquaryFirstFindLookup = Readonly<
  Record<string, { clears?: number; pageId?: string } | undefined>
>;

export interface ReliquaryViewInput {
  /** Catalog pages (live RELIQUARY_PAGES or a synthetic table in tests). */
  pages: readonly ReliquaryPageDef[];
  /** Item ownership = itemsDiscovered (or a test Set). */
  itemsDiscovered: { has(id: string): boolean };
  /** Authored non-item marks (profession trophies, etc.). */
  marks: { has(id: string): boolean };
  /** Capped recent find ids (item or mark), oldest-first from the facet. */
  recent: readonly string[];
  /** Active shelf / overview nav id. */
  nav: ReliquaryNavId;
  /** Selected page id within a shelf, or null for the shelf stub list. */
  pageId: string | null;
  /**
   * Optional clear-count lookup (IWorld.reliquaryPageClearCount). Fairness:
   * owned/missing and clear counts are never gated by graphics tier; the
   * painter always receives the real numbers when the source exists.
   */
  clearCount?: (pageId: string) => number | undefined;
  /**
   * Sparse first-find meta for catalogued item relics (live first obtain).
   * Used only for owned-cell tooltips (clear#); never invents ownership.
   */
  firstFind?: ReliquaryFirstFindLookup;
  /** Mount ownership (live ownedMounts / reins seam). */
  ownedMounts?: { has(id: string): boolean };
  /** Account weapon-skin unlocks (empty when account cosmetics absent). */
  weaponSkins?: { has(id: string): boolean };
  /** Title ownership via deeds earned (deeds with title rewards only). */
  deedsEarned?: { has(id: string): boolean };
}

export interface ReliquaryProgressModel {
  owned: number;
  total: number;
  /** 0..1 completion over unique item relics. */
  fraction: number;
  /** Cosmetic Curator rank index (0 = none). */
  curatorRank: number;
  /**
   * Window seal chrome id for the current rank (null when unranked).
   * Derived pure; never invents power or Renown.
   */
  curatorSealId: string | null;
}

export interface ReliquaryRecentFindModel {
  /** Item or mark id from the recent ring. */
  id: string;
  kind: 'item' | 'mark' | 'unknown';
}

export interface ReliquaryNearlyPageModel {
  pageId: string;
  /** English content name from the catalog (client may re-localize later). */
  name: string;
  owned: number;
  total: number;
  remaining: number;
}

export interface ReliquaryShelfPageModel {
  pageId: string;
  name: string;
  shelf: ReliquaryShelfId;
  owned: number;
  total: number;
  complete: boolean;
  /** Lifetime clears when the page has a clear source; undefined otherwise. */
  clears: number | undefined;
}

/** One relic slot on an open page grid. */
export interface ReliquaryGridCellModel {
  /** Stable slot identity (itemId / markId / mountId / skinId / deedId). */
  id: string;
  kind: ReliquaryRelicDef['kind'];
  owned: boolean;
  /** Catalog order index (0-based) for stable paint order. */
  index: number;
  /**
   * Clear# at first obtain when this is an owned item relic with live
   * firstFind meta. Undefined for retro ownership, non-item relics, or missing.
   */
  firstFindClears?: number;
}

/** Full page view: header progress plus ordered grid cells. */
export interface ReliquaryPageDetailModel extends ReliquaryShelfPageModel {
  cells: ReliquaryGridCellModel[];
  /** Alias of complete for Illumination chrome (first-time celebration is event-driven). */
  illuminated: boolean;
  /**
   * True when the page is account-scoped (weapon skins). UI labels the scope;
   * empty when account cosmetics are absent.
   */
  accountScoped: boolean;
}

export interface ReliquaryNavModel {
  id: ReliquaryNavId;
  /** Owned/total for catalog shelves (Overview has no pair). */
  owned: number;
  total: number;
}

export interface ReliquaryViewModel {
  nav: ReliquaryNavId;
  pageId: string | null;
  progress: ReliquaryProgressModel;
  recent: ReliquaryRecentFindModel[];
  nearly: ReliquaryNearlyPageModel[];
  shelves: ReliquaryNavModel[];
  /** Pages on the active catalog shelf (empty on Overview). */
  shelfPages: ReliquaryShelfPageModel[];
  /** Active page header stub, or null when on Overview / no page selected. */
  activePage: ReliquaryShelfPageModel | null;
  /** Full page grid when a page is selected; null otherwise. */
  pageDetail: ReliquaryPageDetailModel | null;
}

function ownershipOpts(input: ReliquaryViewInput) {
  return {
    itemsDiscovered: input.itemsDiscovered,
    marks: input.marks,
    ownedMounts: input.ownedMounts,
    weaponSkins: input.weaponSkins,
    deedsEarned: input.deedsEarned,
  };
}

function pageIsShelf(page: ReliquaryPageDef, shelf: ReliquaryShelfId): boolean {
  return page.shelf === shelf;
}

function shelfPageModel(
  page: ReliquaryPageDef,
  opts: ReturnType<typeof ownershipOpts>,
  clearCount?: (pageId: string) => number | undefined,
): ReliquaryShelfPageModel {
  const c = pageCompletion(page, opts);
  return {
    pageId: page.id,
    name: page.name,
    shelf: page.shelf,
    owned: c.owned,
    total: c.total,
    complete: c.complete,
    clears: clearCount?.(page.id),
  };
}

function relicSlotId(relic: ReliquaryRelicDef): string {
  switch (relic.kind) {
    case 'item':
      return relic.itemId;
    case 'mark':
      return relic.markId;
    case 'mount':
      return relic.mountId;
    case 'weapon_skin':
      return relic.skinId;
    case 'title':
      return relic.deedId;
  }
}

/** Build ordered grid cells for one page (owned vs missing). */
export function buildReliquaryPageCells(
  page: ReliquaryPageDef,
  opts: {
    itemsDiscovered: { has(id: string): boolean };
    marks?: { has(id: string): boolean };
    ownedMounts?: { has(id: string): boolean };
    weaponSkins?: { has(id: string): boolean };
    deedsEarned?: { has(id: string): boolean };
    firstFind?: ReliquaryFirstFindLookup;
  },
): ReliquaryGridCellModel[] {
  const cells: ReliquaryGridCellModel[] = [];
  for (let i = 0; i < page.relics.length; i++) {
    const relic = page.relics[i];
    const owned = isRelicFilled(relic, opts);
    const id = relicSlotId(relic);
    const cell: ReliquaryGridCellModel = {
      id,
      kind: relic.kind,
      owned,
      index: i,
    };
    if (owned && relic.kind === 'item') {
      const clears = opts.firstFind?.[id]?.clears;
      if (clears !== undefined) cell.firstFindClears = clears;
    }
    cells.push(cell);
  }
  return cells;
}

/** Build the whole cold-window model. Per-call allocation is fine (event-driven). */
export function buildReliquaryView(input: ReliquaryViewInput): ReliquaryViewModel {
  const opts = ownershipOpts(input);
  // Overview totals include all shelves (including account skins). Curator rank
  // scores only character-durable fills (excludes weapon skins) so seal chrome
  // matches syncCuratorRankDeeds / grant path.
  const catalog = catalogRelicCompletion(opts, input.pages);
  const curatorRank = curatorRankFromOwned(catalogRankOwned(opts, input.pages));
  const progress: ReliquaryProgressModel = {
    owned: catalog.owned,
    total: catalog.total,
    fraction: catalog.total > 0 ? catalog.owned / catalog.total : 0,
    curatorRank,
    curatorSealId: curatorSealIdForRank(curatorRank),
  };

  const recent: ReliquaryRecentFindModel[] = [];
  // Newest-first for the strip (facet is oldest-first).
  for (let i = input.recent.length - 1; i >= 0; i--) {
    const id = input.recent[i];
    if (!id) continue;
    let kind: ReliquaryRecentFindModel['kind'] = 'unknown';
    if (input.marks.has(id)) kind = 'mark';
    else if (input.itemsDiscovered.has(id) || isCatalogItemId(input.pages, id)) kind = 'item';
    recent.push({ id, kind });
  }

  const nearly = buildNearlyComplete(input.pages, opts);

  const shelfTotals = new Map<ReliquaryShelfId, { owned: number; total: number }>();
  for (const shelf of ['conquerors', 'professions', 'horizons'] as const) {
    shelfTotals.set(shelf, { owned: 0, total: 0 });
  }
  for (const page of input.pages) {
    const c = pageCompletion(page, opts);
    const bucket = shelfTotals.get(page.shelf);
    if (!bucket) continue;
    bucket.owned += c.owned;
    bucket.total += c.total;
  }

  const shelves: ReliquaryNavModel[] = RELIQUARY_NAV.map((id) => {
    if (id === 'overview') return { id, owned: 0, total: 0 };
    const t = shelfTotals.get(id) ?? { owned: 0, total: 0 };
    return { id, owned: t.owned, total: t.total };
  });

  const shelfPages: ReliquaryShelfPageModel[] = [];
  if (input.nav !== 'overview') {
    for (const page of input.pages) {
      if (!pageIsShelf(page, input.nav)) continue;
      shelfPages.push(shelfPageModel(page, opts, input.clearCount));
    }
  }

  let activePage: ReliquaryShelfPageModel | null = null;
  let pageDetail: ReliquaryPageDetailModel | null = null;
  if (input.pageId !== null) {
    activePage = shelfPages.find((p) => p.pageId === input.pageId) ?? null;
    if (activePage === null) {
      // Page selected but not on this shelf (or unknown): resolve from full catalog.
      const page = input.pages.find((p) => p.id === input.pageId);
      if (page) activePage = shelfPageModel(page, opts, input.clearCount);
    }
    if (activePage !== null) {
      const header = activePage;
      const page = input.pages.find((p) => p.id === header.pageId);
      if (page) {
        const cells = buildReliquaryPageCells(page, {
          ...opts,
          firstFind: input.firstFind,
        });
        pageDetail = {
          ...header,
          cells,
          illuminated: header.complete,
          // Weapon skins are account cosmetics; label the scope in the cold UI.
          accountScoped: page.relics.some((r) => r.kind === 'weapon_skin'),
        };
      }
    }
  }

  return {
    nav: input.nav,
    pageId: input.pageId,
    progress,
    recent,
    nearly,
    shelves,
    shelfPages,
    activePage,
    pageDetail,
  };
}

function isCatalogItemId(pages: readonly ReliquaryPageDef[], id: string): boolean {
  for (const page of pages) {
    for (const relic of page.relics) {
      if (relic.kind === 'item' && relic.itemId === id) return true;
    }
  }
  return false;
}

function buildNearlyComplete(
  pages: readonly ReliquaryPageDef[],
  opts: {
    itemsDiscovered: { has(id: string): boolean };
    marks: { has(id: string): boolean };
    ownedMounts?: { has(id: string): boolean };
    weaponSkins?: { has(id: string): boolean };
    deedsEarned?: { has(id: string): boolean };
  },
): ReliquaryNearlyPageModel[] {
  const candidates: ReliquaryNearlyPageModel[] = [];
  for (const page of pages) {
    const c = pageCompletion(page, opts);
    if (c.total <= 0 || c.complete) continue;
    if (c.owned < RELIQUARY_NEARLY_MIN_OWNED) continue;
    candidates.push({
      pageId: page.id,
      name: page.name,
      owned: c.owned,
      total: c.total,
      remaining: c.total - c.owned,
    });
  }
  // Fewest remaining first, then highest owned fraction, then stable page id.
  candidates.sort((a, b) => {
    if (a.remaining !== b.remaining) return a.remaining - b.remaining;
    const fa = a.total > 0 ? a.owned / a.total : 0;
    const fb = b.total > 0 ? b.owned / b.total : 0;
    if (fa !== fb) return fb - fa;
    return a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0;
  });
  return candidates.slice(0, RELIQUARY_NEARLY_MAX);
}

// ---------------------------------------------------------------------------
// Unlock / Illumination plan: pure HUD reaction to a drain of reliquaryUnlock.
// Presentation only; never invents membership (mirrors stay authoritative).
// ---------------------------------------------------------------------------

/** One presentation-only reliquaryUnlock event (id-only; no English). */
export interface ReliquaryUnlockEventModel {
  itemId?: string;
  markId?: string;
  pageIds?: readonly string[];
  illuminatedPageId?: string;
  /** New Curator rank when this fill crossed a threshold (cosmetic only). */
  curatorRank?: number;
}

export type ReliquaryUnlockLog = { kind: 'item'; id: string } | { kind: 'mark'; id: string };

export type ReliquaryUnlockBanner =
  | { kind: 'unlock'; relic: ReliquaryUnlockLog }
  | { kind: 'illuminate'; pageId: string }
  | { kind: 'rankUp'; rank: number };

export interface ReliquaryUnlockPlan {
  /** One durable log line per catalogued unlock in drain order. */
  logs: ReliquaryUnlockLog[];
  /**
   * Single banner slot priority (highest wins; last of same tier wins):
   * rankUp > Illumination > plain unlock. The log still carries every line.
   */
  banner: ReliquaryUnlockBanner | null;
  /** One celebration sound per drain with at least one unlock. */
  playSound: boolean;
  /**
   * Motion-only flourishes (fill flash, banner fade). False under reduced
   * motion. Never gates log lines, banner text, or sound (information survives).
   */
  motion: boolean;
  /** True when the open Reliquary window should force a rebuild this drain. */
  refreshWindow: boolean;
  /** Last illuminated page id in the drain, if any. */
  illuminatedPageId: string | null;
  /** Highest Curator rank-up in the drain, if any (cosmetic only). */
  curatorRank: number | null;
}

/**
 * Plan the HUD reaction to a drain of reliquaryUnlock events.
 * Skips events with neither itemId nor markId (content drift / empty payload).
 * Does not consult discovery mirrors: membership is never invented here.
 */
export function buildReliquaryUnlockPlan(
  events: readonly ReliquaryUnlockEventModel[],
  reducedMotion: boolean,
): ReliquaryUnlockPlan {
  const logs: ReliquaryUnlockLog[] = [];
  let banner: ReliquaryUnlockBanner | null = null;
  let illuminatedPageId: string | null = null;
  let curatorRank: number | null = null;

  for (const event of events) {
    let log: ReliquaryUnlockLog | null = null;
    if (event.itemId) log = { kind: 'item', id: event.itemId };
    else if (event.markId) log = { kind: 'mark', id: event.markId };
    if (!log) continue;
    logs.push(log);

    const rankUp =
      typeof event.curatorRank === 'number' &&
      Number.isFinite(event.curatorRank) &&
      event.curatorRank > 0
        ? Math.floor(event.curatorRank)
        : null;
    // Always capture Illumination for the secondary log, even when the same
    // production event also carries curatorRank (emitReliquaryUnlock ships both).
    // Banner priority is gated separately; do not drop the log field on rank-up.
    if (event.illuminatedPageId) {
      illuminatedPageId = event.illuminatedPageId;
    }
    if (rankUp !== null) {
      curatorRank = rankUp;
      // Rank-up outranks Illumination and plain unlock (rarer prestige moment).
      banner = { kind: 'rankUp', rank: rankUp };
    } else if (event.illuminatedPageId) {
      // Illumination outranks plain unlock; never overwrites a rank-up banner.
      if (banner === null || banner.kind === 'unlock' || banner.kind === 'illuminate') {
        banner = { kind: 'illuminate', pageId: event.illuminatedPageId };
      }
    } else if (banner === null || banner.kind === 'unlock') {
      // Plain unlock only fills the slot when no higher tier has claimed it yet
      // in this drain; a later plain unlock still updates the unlock banner.
      banner = { kind: 'unlock', relic: log };
    }
  }

  return {
    logs,
    banner,
    playSound: logs.length > 0,
    motion: logs.length > 0 && !reducedMotion,
    refreshWindow: logs.length > 0,
    illuminatedPageId,
    curatorRank,
  };
}

// ---------------------------------------------------------------------------
// Window refresh signature: compact key the cold painter's slow-band diffs.
// ---------------------------------------------------------------------------

export interface ReliquaryRefreshSigParts {
  owned: number;
  total: number;
  curatorRank: number;
  recentSig: string;
  marksSize: number;
  nav: ReliquaryNavId;
  pageId: string | null;
  /** Optional clear digest so open-window clear meters stay live. */
  clearsDigest?: number;
  /**
   * Grid / ownership digest so an open page grid stays live on silhouette
   * fill (discovered size + firstFind key count + active page owned).
   */
  ownershipDigest?: number;
}

/** Compact repaint signature. Equal parts elide the rebuild. */
export function reliquaryRefreshSig(parts: ReliquaryRefreshSigParts): string {
  return JSON.stringify([
    parts.owned,
    parts.total,
    parts.curatorRank,
    parts.recentSig,
    parts.marksSize,
    parts.nav,
    parts.pageId,
    parts.clearsDigest ?? 0,
    parts.ownershipDigest ?? 0,
  ]);
}

/**
 * Compact digest of grid-relevant ownership so a pure silhouette fill (or a
 * firstFind stamp) moves the open-window signature even when catalog totals
 * already matched by coincidence.
 */
export function reliquaryOwnershipDigest(parts: {
  discoveredSize: number;
  marksSize: number;
  firstFindCount: number;
  /** Owned count on the active page, or 0 when no page is open. */
  pageOwned: number;
}): number {
  // Small primes keep collisions rare for realistic sizes without allocation.
  return (
    (((parts.discoveredSize * 1009 + parts.marksSize) * 1009 + parts.firstFindCount) * 1009 +
      parts.pageOwned) |
    0
  );
}

/** Stable digest of the recent ring (order matters; newest-first join). */
export function reliquaryRecentSig(recent: readonly string[]): string {
  return recent.join('\u0001');
}

/** True when a string is a known Reliquary nav id. */
export function isReliquaryNavId(value: string): value is ReliquaryNavId {
  return (RELIQUARY_NAV as readonly string[]).includes(value);
}
