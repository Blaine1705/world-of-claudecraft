// ---------------------------------------------------------------------------
// The Reliquary: sparse first-find meta, authored marks, capped recent finds,
// and pure completion reads for the SELF player. Ownership of item relics is
// NOT here: it reuses IWorldDeeds.deedStats.itemsDiscovered. This facet only
// exposes Reliquary-specific sparse state plus completion helpers that both
// hosts recompute from catalog + mirrors (no second full discovery set).
//
// Offline the Sim exposes live PlayerMeta.reliquary; online the ClientWorld
// mirrors the heavy-gated `reliq` self blob. The `reliquaryUnlock` event is
// presentation-only (toast / live UX) and must never invent membership.
// ---------------------------------------------------------------------------

/** Sparse first-obtain metadata for one catalogued relic item id. */
export interface ReliquaryFirstFindView {
  /** Clear count of the page source at first obtain (when applicable). */
  clears?: number;
  /** Page id that credited the find (diagnostic; multi-page fill stays global). */
  pageId?: string;
}

/** Page progress over relic ownership. */
export interface ReliquaryPageCompletion {
  owned: number;
  total: number;
  complete: boolean;
}

/** Catalog-wide unique item-relic progress. */
export interface ReliquaryCatalogCompletion {
  owned: number;
  total: number;
}

export interface IWorldReliquary {
  /**
   * Sparse first-find meta for catalogued relic item ids only (live first
   * obtains). Empty object when none. Readonly across the seam.
   */
  reliquaryFirstFind: Readonly<Record<string, ReliquaryFirstFindView>>;
  /**
   * Authored non-item Reliquary marks the player has earned (profession
   * trophies, etc.). Empty set when none.
   */
  reliquaryMarks: ReadonlySet<string>;
  /**
   * Capped recent find ring (item or mark ids), oldest-first. Empty array
   * when none.
   */
  reliquaryRecent: readonly string[];
  /**
   * Page progress X/Y for a catalog page id, or null when the id is not a
   * live page. Owned counts come from itemsDiscovered + marks (and later
   * mounts/skins/titles when those shelves ship).
   */
  reliquaryPageCompletion(pageId: string): ReliquaryPageCompletion | null;
  /** Catalog-wide unique item-relic progress (item ids de-duped across pages). */
  reliquaryCatalogCompletion(): ReliquaryCatalogCompletion;
  /**
   * Pure Curator rank index from unique owned catalogued item relics.
   * Cosmetic-only; rank 0 means none.
   */
  reliquaryCuratorRank(): number;
  /**
   * Lifetime clear count for a page's clear source, or undefined when the
   * page is unknown or has no clear meter.
   */
  reliquaryPageClearCount(pageId: string): number | undefined;
}
