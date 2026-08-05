// Pure view-core for The Reliquary window (#reliquary-window). DOM/Three/i18n-free:
// maps IWorldReliquary reads plus the static catalog (injected so tests drive
// synthetic tables) to flat render models the cold painter draws. Registered in
// UI_PURE_CORES; unit-tested in tests/reliquary_view.test.ts.
//
// Phase 4 ships the Overview shell and shelf chrome. Page grids and Illumination
// celebration land in Phase 5; full Curator cosmetics in Phase 6.

import type { ReliquaryPageDef, ReliquaryShelfId } from '../sim/content/reliquary';
import { catalogItemCompletion, curatorRankFromOwned, pageCompletion } from '../sim/reliquary';

/** Top-level nav: virtual Overview plus the three catalog shelves. */
export const RELIQUARY_NAV = ['overview', 'conquerors', 'professions', 'horizons'] as const;
export type ReliquaryNavId = (typeof RELIQUARY_NAV)[number];

/** How incomplete a page must be (and how full) to appear in nearly-complete. */
export const RELIQUARY_NEARLY_MIN_OWNED = 1;
export const RELIQUARY_NEARLY_MAX = 5;

export interface ReliquaryViewInput {
  /** Catalog pages (live RELIQUARY_PAGES or a synthetic table in tests). */
  pages: readonly ReliquaryPageDef[];
  /** Item ownership = itemsDiscovered (or a test Set). */
  itemsDiscovered: { has(id: string): boolean };
  /** Authored non-item marks (empty until professions shelf marks land). */
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
}

export interface ReliquaryProgressModel {
  owned: number;
  total: number;
  /** 0..1 completion over unique item relics. */
  fraction: number;
  /** Cosmetic Curator rank index (0 = none). */
  curatorRank: number;
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
  /** Active page stub, or null when on Overview / no page selected. */
  activePage: ReliquaryShelfPageModel | null;
}

function ownershipOpts(input: ReliquaryViewInput) {
  return {
    itemsDiscovered: input.itemsDiscovered,
    marks: input.marks,
  };
}

function pageIsShelf(page: ReliquaryPageDef, shelf: ReliquaryShelfId): boolean {
  return page.shelf === shelf;
}

/** Build the whole cold-window model. Per-call allocation is fine (event-driven). */
export function buildReliquaryView(input: ReliquaryViewInput): ReliquaryViewModel {
  const opts = ownershipOpts(input);
  const catalog = catalogItemCompletion(input.itemsDiscovered, input.pages);
  const progress: ReliquaryProgressModel = {
    owned: catalog.owned,
    total: catalog.total,
    fraction: catalog.total > 0 ? catalog.owned / catalog.total : 0,
    curatorRank: curatorRankFromOwned(catalog.owned),
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
      const c = pageCompletion(page, opts);
      shelfPages.push({
        pageId: page.id,
        name: page.name,
        shelf: page.shelf,
        owned: c.owned,
        total: c.total,
        complete: c.complete,
        clears: input.clearCount?.(page.id),
      });
    }
  }

  let activePage: ReliquaryShelfPageModel | null = null;
  if (input.pageId !== null) {
    activePage = shelfPages.find((p) => p.pageId === input.pageId) ?? null;
    if (activePage === null) {
      // Page selected but not on this shelf (or unknown): resolve from full catalog.
      const page = input.pages.find((p) => p.id === input.pageId);
      if (page) {
        const c = pageCompletion(page, opts);
        activePage = {
          pageId: page.id,
          name: page.name,
          shelf: page.shelf,
          owned: c.owned,
          total: c.total,
          complete: c.complete,
          clears: input.clearCount?.(page.id),
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
  /** Optional clear digest so open-window clear meters stay live (Phase 5+). */
  clearsDigest?: number;
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
  ]);
}

/** Stable digest of the recent ring (order matters; newest-first join). */
export function reliquaryRecentSig(recent: readonly string[]): string {
  return recent.join('\u0001');
}

/** True when a string is a known Reliquary nav id. */
export function isReliquaryNavId(value: string): value is ReliquaryNavId {
  return (RELIQUARY_NAV as readonly string[]).includes(value);
}
