// The Reliquary catalog: data-as-code shelves, pages, and relic slots.
// No engine logic lives here; runtime marks and pure completion math live in
// src/sim/reliquary.ts. Player-facing names are English content re-localized
// at the client boundary (the sim never emits Reliquary English text).
//
// Page table is append-only once product pages ship: append new pages at the
// END and never reorder or remove an id (ids may be referenced by firstFind
// diagnostics and content pin tests). Phase 1 ships a minimal stub page so
// state hooks and tests exercise a real catalogued relic id; Phase 2 expands
// the Conqueror set against live loot tables.

/** Top-level shelf ids (Overview is virtual UI, not a catalog shelf row). */
export type ReliquaryShelfId = 'conquerors' | 'professions' | 'horizons';

/** How a page reads lifetime clear / kill counts from existing player state. */
export type ReliquaryClearSource =
  | { kind: 'dungeon'; dungeonId: string; difficulty?: 'normal' | 'heroic' | 'any' }
  | { kind: 'delve'; delveId: string }
  | { kind: 'none' };

/** One unique slot on a page. Item relics own via itemsDiscovered; other kinds
 *  use authored marks or existing ownership tables (mounts, skins, titles). */
export type ReliquaryRelicDef =
  | { kind: 'item'; itemId: string }
  | { kind: 'mark'; markId: string }
  | { kind: 'mount'; mountId: string }
  | { kind: 'weapon_skin'; skinId: string }
  | { kind: 'title'; deedId: string };

export interface ReliquaryPageDef {
  id: string;
  shelf: ReliquaryShelfId;
  /** English content name (client re-localizes). */
  name: string;
  /** Optional English blurb. */
  desc?: string;
  /** Clear-count source; omit or `none` when the page has no clear meter. */
  clearSource?: ReliquaryClearSource;
  /** Ordered relic slots for the page grid. */
  relics: readonly ReliquaryRelicDef[];
}

// Phase 1 stub: one Conqueror page with a single live unique so discovery
// hooks and content-shaped tests have a real catalogued id. Phase 2 replaces
// this with the full dungeon / raid / world-boss / delve authoring pass.
export const RELIQUARY_PAGES: readonly ReliquaryPageDef[] = [
  {
    id: 'conquerors_hollow_crypt',
    shelf: 'conquerors',
    name: 'The Hollow Crypt',
    desc: 'Uniques claimed from the Hollow Crypt.',
    clearSource: { kind: 'dungeon', dungeonId: 'hollow_crypt', difficulty: 'any' },
    relics: [{ kind: 'item', itemId: 'boundstone_helm' }],
  },
];

/** Append-only page order (table order). */
export const RELIQUARY_PAGE_ORDER: readonly string[] = RELIQUARY_PAGES.map((p) => p.id);

/** Stable id -> page def. */
export const RELIQUARY_PAGES_BY_ID: Readonly<Record<string, ReliquaryPageDef>> = Object.fromEntries(
  RELIQUARY_PAGES.map((p) => [p.id, p]),
);

/** Item id -> page ids that list it (multi-page fill is intentional). */
export const RELIQUARY_ITEM_TO_PAGES: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const page of RELIQUARY_PAGES) {
    for (const relic of page.relics) {
      if (relic.kind !== 'item') continue;
      const list = map.get(relic.itemId);
      if (list) list.push(page.id);
      else map.set(relic.itemId, [page.id]);
    }
  }
  return map;
})();

/** Authored mark ids that are Reliquary trophies (profession marks, etc.). */
export const RELIQUARY_MARK_IDS: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const page of RELIQUARY_PAGES) {
    for (const relic of page.relics) {
      if (relic.kind === 'mark') set.add(relic.markId);
    }
  }
  return set;
})();

export function isCataloguedRelicItem(itemId: string): boolean {
  return RELIQUARY_ITEM_TO_PAGES.has(itemId);
}
