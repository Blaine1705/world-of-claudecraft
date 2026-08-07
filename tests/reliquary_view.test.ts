// Unit tests for The Reliquary pure view-core (src/ui/reliquary_view.ts):
// empty state, progress totals, curator rank (including rank name keys),
// recent newest-first, nearly-complete ranking, shelf nav counts, page grids,
// unlock/Illumination plan, and the refresh signature (ownershipDigest too).
import { describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import { MOUNTS } from '../src/sim/content/mounts';
import type { ReliquaryPageDef, ReliquaryRelicDef } from '../src/sim/content/reliquary';
import {
  RELIQUARY_ACTIVITY_SOURCE_IDS,
  RELIQUARY_HORIZON_MOUNTS,
  RELIQUARY_MARK_IDS,
  RELIQUARY_PAGES,
  RELIQUARY_STORE_SOURCE_ID,
  reliquaryRelicSource,
} from '../src/sim/content/reliquary';
import { DELVES, DUNGEONS, QUESTS, ZONES } from '../src/sim/data';
import { CURATOR_RANK_DEFS } from '../src/sim/reliquary';
import { deedName } from '../src/ui/deed_i18n';
import { dungeonDisplayName, tEntity, zoneDisplayName } from '../src/ui/entity_i18n';
import { getLanguage, languageTag } from '../src/ui/i18n';
import { MOUNT_NAME_KEYS } from '../src/ui/mount_labels';
import {
  reliquaryRelicDisplayName,
  reliquaryRelicSearchText,
  reliquarySourceAriaText,
  reliquarySourceLines,
  reliquarySourceLineText,
} from '../src/ui/reliquary_labels';
import {
  buildReliquaryPageCells,
  buildReliquaryUnlockPlan,
  buildReliquaryView,
  CURATOR_RANK_NAME_KEYS,
  curatorRankNameKey,
  isReliquaryNavId,
  RELIQUARY_NAV,
  RELIQUARY_NEARLY_MAX,
  RELIQUARY_NEARLY_MAX_REMAINING,
  RELIQUARY_NEARLY_MIN_FRACTION,
  RELIQUARY_SHELF_ORDER,
  type ReliquaryViewInput,
  reliquaryFillPct,
  reliquaryFocusFallbackKey,
  reliquaryMarkFindKey,
  reliquaryOwnershipDigest,
  reliquaryRecentSig,
  reliquaryRefreshSig,
  reliquarySourceLinePlan,
} from '../src/ui/reliquary_view';

// ---------------------------------------------------------------------------
// Synthetic catalog (small, spans shelves and clear-free set pages)
// ---------------------------------------------------------------------------

const TEST_PAGES: ReliquaryPageDef[] = [
  {
    id: 'crypt_n',
    shelf: 'conquerors',
    name: 'The Hollow Crypt',
    clearSource: { kind: 'dungeon', dungeonId: 'crypt' },
    relics: [
      { kind: 'item', itemId: 'crypt_helm' },
      { kind: 'item', itemId: 'crypt_blade' },
      { kind: 'item', itemId: 'crypt_ring' },
    ],
  },
  {
    id: 'sanctum_n',
    shelf: 'conquerors',
    name: 'Gravewyrm Sanctum',
    clearSource: { kind: 'dungeon', dungeonId: 'sanctum' },
    relics: [
      { kind: 'item', itemId: 'sanctum_helm' },
      { kind: 'item', itemId: 'sanctum_boots' },
    ],
  },
  {
    id: 'set_deathlord',
    shelf: 'conquerors',
    name: 'Deathlord Regalia',
    clearSource: { kind: 'none' },
    relics: [
      { kind: 'item', itemId: 'dl_chest' },
      { kind: 'item', itemId: 'dl_legs' },
      { kind: 'item', itemId: 'dl_boots' },
      { kind: 'item', itemId: 'dl_helm' },
    ],
  },
  {
    id: 'prof_stub',
    shelf: 'professions',
    name: 'Masterwork Gallery',
    relics: [{ kind: 'mark', markId: 'mw_a' }],
  },
  {
    id: 'horiz_stub',
    shelf: 'horizons',
    name: 'Mounts',
    relics: [{ kind: 'mount', mountId: 'steed_a' }],
  },
];

function ownedSet(...ids: string[]): Set<string> {
  return new Set(ids);
}

/** The slot id carried by any relic arm (mirrors the core's relicSlotId). */
function relicId(relic: ReliquaryRelicDef): string {
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

function input(partial: Partial<ReliquaryViewInput> = {}): ReliquaryViewInput {
  return {
    pages: TEST_PAGES,
    itemsDiscovered: ownedSet(),
    marks: ownedSet(),
    recent: [],
    nav: 'overview',
    pageId: null,
    ...partial,
  };
}

describe('reliquaryMarkFindKey', () => {
  it('maps colon namespaces to hudChrome.reliquary.markFind leaves', () => {
    expect(reliquaryMarkFindKey('gather_event:pristine_vein')).toBe(
      'hudChrome.reliquary.markFind.gather_event_pristine_vein',
    );
    expect(reliquaryMarkFindKey('masterwork:first')).toBe(
      'hudChrome.reliquary.markFind.masterwork_first',
    );
  });
});

describe('curatorRankNameKey', () => {
  it('maps ranks 1 through 5 to their exact named chrome keys', () => {
    expect(curatorRankNameKey(1)).toBe('hudChrome.reliquary.curatorRankName1');
    expect(curatorRankNameKey(2)).toBe('hudChrome.reliquary.curatorRankName2');
    expect(curatorRankNameKey(3)).toBe('hudChrome.reliquary.curatorRankName3');
    expect(curatorRankNameKey(4)).toBe('hudChrome.reliquary.curatorRankName4');
    expect(curatorRankNameKey(5)).toBe('hudChrome.reliquary.curatorRankName5');
  });

  it('falls back to the generic rank key on both out-of-range ends', () => {
    expect(curatorRankNameKey(0)).toBe('hudChrome.reliquary.curatorRank');
    expect(curatorRankNameKey(6)).toBe('hudChrome.reliquary.curatorRank');
  });

  it('authors exactly one name key per live sim Curator rank', () => {
    // Cross-source pin: a new CURATOR_RANK_DEFS entry stays red here until a
    // matching curatorRankName chrome key is authored (no silent generic fall).
    expect(CURATOR_RANK_NAME_KEYS).toHaveLength(CURATOR_RANK_DEFS.length);
  });
});

describe('RELIQUARY_NAV', () => {
  it('is overview plus the three catalog shelves in fixed order', () => {
    expect(RELIQUARY_NAV).toEqual(['overview', 'conquerors', 'professions', 'horizons']);
  });

  it('isReliquaryNavId accepts only the four ids', () => {
    expect(isReliquaryNavId('overview')).toBe(true);
    expect(isReliquaryNavId('conquerors')).toBe(true);
    expect(isReliquaryNavId('professions')).toBe(true);
    expect(isReliquaryNavId('horizons')).toBe(true);
    expect(isReliquaryNavId('not_a_shelf')).toBe(false);
    expect(isReliquaryNavId('')).toBe(false);
    expect(isReliquaryNavId('Overview')).toBe(false);
  });
});

describe('buildReliquaryView empty state', () => {
  it('reports zero progress, unranked curator, empty strips', () => {
    const model = buildReliquaryView(input());
    expect(model.progress).toEqual({
      owned: 0,
      // Unique item relics (9) + authored mark (1) + mount (1) from TEST_PAGES.
      total: 11,
      fraction: 0,
      curatorRank: 0,
      curatorSealId: null,
    });
    expect(model.recent).toEqual([]);
    expect(model.nearly).toEqual([]);
    expect(model.nav).toBe('overview');
    expect(model.shelfPages).toEqual([]);
    expect(model.activePage).toBeNull();
  });

  it('still exposes shelf totals of zero for empty shelves', () => {
    const model = buildReliquaryView(input());
    expect(model.shelves).toEqual([
      { id: 'overview', owned: 0, total: 0 },
      { id: 'conquerors', owned: 0, total: 9 },
      { id: 'professions', owned: 0, total: 1 },
      { id: 'horizons', owned: 0, total: 1 },
    ]);
  });

  it('tallies non-zero shelf owned counts from discovery', () => {
    const model = buildReliquaryView(
      input({ itemsDiscovered: ownedSet('crypt_helm', 'dl_chest') }),
    );
    expect(model.shelves).toEqual([
      { id: 'overview', owned: 0, total: 0 },
      { id: 'conquerors', owned: 2, total: 9 },
      { id: 'professions', owned: 0, total: 1 },
      { id: 'horizons', owned: 0, total: 1 },
    ]);
  });
});

describe('buildReliquaryView progress and rank', () => {
  it('counts unique item relics for catalog progress', () => {
    const model = buildReliquaryView(
      input({ itemsDiscovered: ownedSet('crypt_helm', 'crypt_blade', 'dl_chest') }),
    );
    expect(model.progress.owned).toBe(3);
    // 9 unique items + 1 mark + 1 mount (unowned Horizons) on the synthetic catalog.
    expect(model.progress.total).toBe(11);
    expect(model.progress.fraction).toBeCloseTo(3 / 11, 5);
    // Rank thresholds: 1, 10, 25, 50, 100. Owned 3 => rank 1 (apprentice seal).
    expect(model.progress.curatorRank).toBe(1);
    expect(model.progress.curatorSealId).toBe('apprentice');
  });

  it('does not invent membership from recent alone', () => {
    const model = buildReliquaryView(
      input({
        itemsDiscovered: ownedSet(),
        recent: ['crypt_helm'],
      }),
    );
    expect(model.progress.owned).toBe(0);
    // Recent still lists the id (presentation, with the page it would jump to);
    // ownership stays authoritative.
    expect(model.recent).toEqual([{ id: 'crypt_helm', kind: 'item', pageId: 'crypt_n' }]);
  });

  it('counts authored marks in catalog progress and profession shelf totals', () => {
    // Phase 7: marks are unique catalogued relics (cosmetic prestige only).
    const model = buildReliquaryView(
      input({
        itemsDiscovered: ownedSet(),
        marks: ownedSet('mw_a'),
      }),
    );
    expect(model.progress.owned).toBe(1);
    expect(model.progress.total).toBe(11);
    expect(model.progress.curatorRank).toBe(1);
    const prof = buildReliquaryView(
      input({
        nav: 'professions',
        itemsDiscovered: ownedSet(),
        marks: ownedSet('mw_a'),
      }),
    );
    expect(prof.shelfPages.find((p) => p.pageId === 'prof_stub')).toMatchObject({
      owned: 1,
      total: 1,
      complete: true,
    });
  });

  it('counts Horizons mounts in catalog and shelf totals from ownedMounts', () => {
    const model = buildReliquaryView(
      input({
        ownedMounts: ownedSet('steed_a'),
      }),
    );
    expect(model.progress.owned).toBe(1);
    expect(model.progress.total).toBe(11);
    const horiz = buildReliquaryView(
      input({
        nav: 'horizons',
        ownedMounts: ownedSet('steed_a'),
      }),
    );
    expect(horiz.shelfPages.find((p) => p.pageId === 'horiz_stub')).toMatchObject({
      owned: 1,
      total: 1,
      complete: true,
    });
  });

  it('counts Horizons skins and titles in catalog / shelf totals from live seams', () => {
    // Dropping weaponSkins / deedsEarned from ownershipOpts would leave
    // page-cell tests green while Overview/shelf totals go silent for these kinds.
    const pages: ReliquaryPageDef[] = [
      {
        id: 'h_skins',
        shelf: 'horizons',
        name: 'Skins',
        relics: [{ kind: 'weapon_skin', skinId: 'skin_a' }],
      },
      {
        id: 'h_titles',
        shelf: 'horizons',
        name: 'Titles',
        relics: [{ kind: 'title', deedId: 'title_a' }],
      },
    ];
    const empty = buildReliquaryView(input({ pages }));
    expect(empty.progress.owned).toBe(0);
    expect(empty.progress.total).toBe(2);

    const filled = buildReliquaryView(
      input({
        pages,
        weaponSkins: ownedSet('skin_a'),
        deedsEarned: ownedSet('title_a'),
      }),
    );
    expect(filled.progress.owned).toBe(2);
    const horiz = buildReliquaryView(
      input({
        pages,
        nav: 'horizons',
        weaponSkins: ownedSet('skin_a'),
        deedsEarned: ownedSet('title_a'),
      }),
    );
    expect(horiz.shelves.find((s) => s.id === 'horizons')).toMatchObject({ owned: 2, total: 2 });
    expect(horiz.shelfPages.map((p) => ({ id: p.pageId, owned: p.owned }))).toEqual([
      { id: 'h_skins', owned: 1 },
      { id: 'h_titles', owned: 1 },
    ]);
  });
});

describe('buildReliquaryView recent', () => {
  it('returns newest-first from an oldest-first ring', () => {
    const model = buildReliquaryView(
      input({
        itemsDiscovered: ownedSet('a', 'b', 'c'),
        recent: ['a', 'b', 'c'],
      }),
    );
    expect(model.recent.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('tags marks when the marks set owns the id', () => {
    const model = buildReliquaryView(
      input({
        marks: ownedSet('mw_a'),
        recent: ['mw_a'],
      }),
    );
    expect(model.recent).toEqual([{ id: 'mw_a', kind: 'mark', pageId: 'prof_stub' }]);
  });

  it('tags non-catalog non-mark ids as unknown', () => {
    const model = buildReliquaryView(input({ recent: ['garbage_id'] }));
    // Nothing places it, so the chip gets no jump target and the painter draws
    // it inert rather than as a button that would navigate nowhere.
    expect(model.recent).toEqual([{ id: 'garbage_id', kind: 'unknown', pageId: null }]);
  });
});

// ---------------------------------------------------------------------------
// Phase 14: recent-find jump targets and the Overview shelf cards
// ---------------------------------------------------------------------------

describe('recent find pageId (where a chip jumps)', () => {
  it('prefers the recorded first-find page when the catalog still holds it', () => {
    // crypt_helm sits on crypt_n in authored order, so a hint pointing at a
    // DIFFERENT live page is the only way to prove the hint wins the scan.
    const hinted: ReliquaryPageDef = {
      id: 'hint_home',
      shelf: 'conquerors',
      name: 'Hint Home',
      relics: [{ kind: 'item', itemId: 'crypt_helm' }],
    };
    const model = buildReliquaryView(
      input({
        pages: [...TEST_PAGES, hinted],
        recent: ['crypt_helm'],
        firstFind: { crypt_helm: { pageId: 'hint_home' } },
      }),
    );
    // Premise: the scan alone would answer crypt_n, so this is not self-proving.
    expect(buildReliquaryView(input({ recent: ['crypt_helm'] })).recent[0]?.pageId).toBe('crypt_n');
    expect(model.recent[0]?.pageId).toBe('hint_home');
  });

  it('falls back to the catalog scan when the hinted page is gone from the catalog', () => {
    // Content drift: a first-find row recorded against a page that no longer
    // exists must not strand the chip on a page nothing can open.
    const model = buildReliquaryView(
      input({
        recent: ['crypt_helm'],
        firstFind: { crypt_helm: { pageId: 'retired_page', clears: 4 } },
      }),
    );
    expect(TEST_PAGES.some((p) => p.id === 'retired_page')).toBe(false);
    expect(model.recent[0]?.pageId).toBe('crypt_n');
  });

  it('answers with the FIRST page in authored order for a relic on two pages', () => {
    // Same relic, two pages: the jump target has to be stable rather than
    // dependent on iteration luck, so the answer is the earlier page both ways.
    const shared: ReliquaryRelicDef = { kind: 'item', itemId: 'shared_relic' };
    const first: ReliquaryPageDef = {
      id: 'page_first',
      shelf: 'conquerors',
      name: 'First',
      relics: [shared],
    };
    const second: ReliquaryPageDef = {
      id: 'page_second',
      shelf: 'conquerors',
      name: 'Second',
      relics: [shared],
    };
    expect(
      buildReliquaryView(input({ pages: [first, second], recent: ['shared_relic'] })).recent[0]
        ?.pageId,
    ).toBe('page_first');
    // Authored order, not id order: swapping the pages swaps the answer.
    expect(
      buildReliquaryView(input({ pages: [second, first], recent: ['shared_relic'] })).recent[0]
        ?.pageId,
    ).toBe('page_second');
  });

  it('places a MARK and a MOUNT, not only item relics', () => {
    // The index covers every kind the catalog places; an items-only index would
    // leave the professions and Horizons chips inert.
    const model = buildReliquaryView(input({ recent: ['mw_a', 'steed_a'] }));
    expect(model.recent.map((r) => ({ id: r.id, pageId: r.pageId }))).toEqual([
      { id: 'steed_a', pageId: 'horiz_stub' },
      { id: 'mw_a', pageId: 'prof_stub' },
    ]);
  });

  it('leaves an uncatalogued id with no jump target at all', () => {
    const model = buildReliquaryView(
      input({ recent: ['wire_only_id'], firstFind: { wire_only_id: { clears: 1 } } }),
    );
    expect(model.recent[0]?.pageId).toBeNull();
  });
});

describe('Overview shelf cards', () => {
  it('always renders exactly three cards, in RELIQUARY_SHELF_ORDER', () => {
    const model = buildReliquaryView(input());
    // The array ORDER is a contract the painter draws against: assert the
    // literal sequence, never just membership.
    expect(model.shelfCards.map((c) => c.shelf)).toEqual(['conquerors', 'professions', 'horizons']);
    // Cross-pin the constant itself against the rail: comparing the model to
    // RELIQUARY_SHELF_ORDER alone would be a constant self-comparison (the
    // production code maps over the same array), but the rail order is an
    // independent surface.
    expect([...RELIQUARY_SHELF_ORDER]).toEqual(RELIQUARY_NAV.slice(1));
    // Never the virtual Overview nav id: a card per SHELF, and Overview is not
    // a shelf.
    expect(model.shelfCards.map((c) => c.shelf)).not.toContain('overview');
  });

  it('aggregates owned/total to the same pair the nav rail counts', () => {
    const model = buildReliquaryView(
      input({
        itemsDiscovered: ownedSet('crypt_helm', 'crypt_blade', 'dl_chest'),
        marks: ownedSet('mw_a'),
        ownedMounts: ownedSet('steed_a'),
      }),
    );
    for (const card of model.shelfCards) {
      const nav = model.shelves.find((s) => s.id === card.shelf);
      expect(nav, card.shelf).toBeDefined();
      expect({ owned: card.owned, total: card.total }, card.shelf).toEqual({
        owned: nav?.owned,
        total: nav?.total,
      });
    }
    // Pinned literals too, so a pair that drifted on BOTH surfaces at once
    // cannot satisfy the agreement check above by matching itself.
    expect(model.shelfCards).toEqual([
      { shelf: 'conquerors', owned: 3, total: 9, recentId: null, recentKind: null },
      { shelf: 'professions', owned: 1, total: 1, recentId: null, recentKind: null },
      { shelf: 'horizons', owned: 1, total: 1, recentId: null, recentKind: null },
    ]);
  });

  it('shows the NEWEST ring find on each shelf and ignores the other shelves', () => {
    // Oldest-first ring spanning all three shelves, with two conqueror finds so
    // "newest" is a real choice rather than "the only one".
    const model = buildReliquaryView(
      input({
        recent: ['crypt_helm', 'mw_a', 'steed_a', 'sanctum_helm'],
        itemsDiscovered: ownedSet('crypt_helm', 'sanctum_helm'),
        marks: ownedSet('mw_a'),
        ownedMounts: ownedSet('steed_a'),
      }),
    );
    expect(
      model.shelfCards.map((c) => ({ shelf: c.shelf, id: c.recentId, kind: c.recentKind })),
    ).toEqual([
      { shelf: 'conquerors', id: 'sanctum_helm', kind: 'item' },
      { shelf: 'professions', id: 'mw_a', kind: 'mark' },
      // The ring carries three kinds only: a mount the item catalog cannot
      // claim rides as 'unknown', which is exactly what the label ladder and
      // the ghost icon expect from a wire-shaped id.
      { shelf: 'horizons', id: 'steed_a', kind: 'unknown' },
    ]);
    // Premise: the conqueror card really chose between two candidates, so
    // "newest wins" is a decision here rather than the only available answer.
    const conquerorPages = new Set(
      TEST_PAGES.filter((p) => p.shelf === 'conquerors').map((p) => p.id),
    );
    expect(
      model.recent.filter((r) => r.pageId !== null && conquerorPages.has(r.pageId)),
    ).toHaveLength(2);
  });

  it('leaves recentId null on a shelf the ring never touched', () => {
    const model = buildReliquaryView(
      input({ recent: ['crypt_helm'], itemsDiscovered: ownedSet('crypt_helm') }),
    );
    const byShelf = new Map(model.shelfCards.map((c) => [c.shelf, c]));
    expect(byShelf.get('conquerors')?.recentId).toBe('crypt_helm');
    expect(byShelf.get('professions')?.recentId).toBeNull();
    expect(byShelf.get('professions')?.recentKind).toBeNull();
    expect(byShelf.get('horizons')?.recentId).toBeNull();
    // An unplaceable find has no shelf to summarize, so it reaches no card.
    const drift = buildReliquaryView(input({ recent: ['garbage_id'] }));
    expect(drift.recent).toHaveLength(1);
    expect(drift.shelfCards.every((c) => c.recentId === null)).toBe(true);
  });

  it('captures the latest find BEFORE the search filter (typing never blanks a card)', () => {
    // One input, both surfaces: the needle narrows the recent STRIP while every
    // card keeps its shelf's newest find. A card summarizes its shelf, not the
    // current needle.
    const NAMES: Record<string, string> = {
      crypt_helm: 'casque de crypte',
      mw_a: 'marque de maitre',
      steed_a: 'destrier',
    };
    const model = buildReliquaryView(
      input({
        recent: ['crypt_helm', 'mw_a', 'steed_a'],
        itemsDiscovered: ownedSet('crypt_helm'),
        marks: ownedSet('mw_a'),
        ownedMounts: ownedSet('steed_a'),
        relicSearchText: (_kind, id) => NAMES[id] ?? '',
        search: 'destrier',
      }),
    );
    // Premise: the needle really did narrow the strip to one chip.
    expect(model.recent.map((r) => r.id)).toEqual(['steed_a']);
    expect(model.shelfCards.map((c) => c.recentId)).toEqual(['crypt_helm', 'mw_a', 'steed_a']);
  });
});

describe('buildReliquaryView nearly-complete', () => {
  it('ranks by fewest remaining first (primary), then fraction', () => {
    // crypt: 1/3 remaining 2; sanctum: 1/2 remaining 1. Remaining primary wins
    // even though crypt's fraction (0.33) is lower than sanctum's (0.5).
    const byRemaining = buildReliquaryView(
      input({
        itemsDiscovered: ownedSet('crypt_helm', 'sanctum_helm'),
      }),
    );
    expect(byRemaining.nearly.map((n) => n.pageId)).toEqual(['sanctum_n', 'crypt_n']);
    expect(byRemaining.nearly[0].remaining).toBe(1);
    expect(byRemaining.nearly[1].remaining).toBe(2);

    // Tie on remaining=1: fraction orders set (0.75) then crypt (~0.67) then sanctum (0.5).
    const byFraction = buildReliquaryView(
      input({
        itemsDiscovered: ownedSet(
          'crypt_helm',
          'crypt_blade',
          'sanctum_helm',
          'dl_chest',
          'dl_legs',
          'dl_boots',
        ),
      }),
    );
    expect(byFraction.nearly.map((n) => n.pageId)).toEqual([
      'set_deathlord',
      'crypt_n',
      'sanctum_n',
    ]);
  });

  it('excludes complete pages and zero-owned pages', () => {
    const model = buildReliquaryView(
      input({
        itemsDiscovered: ownedSet('crypt_helm', 'crypt_blade', 'crypt_ring'),
      }),
    );
    expect(model.nearly.every((n) => n.pageId !== 'crypt_n')).toBe(true);
    // sanctum and set still zero-owned: excluded
    expect(model.nearly).toEqual([]);
  });

  it('caps the nearly list at the best five by ranking order', () => {
    expect(RELIQUARY_NEARLY_MAX).toBe(5);
    // Eight incomplete pages, equal owned fraction (1/2), distinct remaining via
    // page size so ranking is remaining-primary then pageId. Wrong-end slice
    // would keep page_3..page_7 instead of page_0..page_4.
    const many: ReliquaryPageDef[] = [];
    const owned: string[] = [];
    for (let i = 0; i < RELIQUARY_NEARLY_MAX + 3; i++) {
      const id = `page_${i}`;
      const item = `item_${i}_a`;
      owned.push(item);
      many.push({
        id,
        shelf: 'conquerors',
        name: `Page ${i}`,
        relics: [
          { kind: 'item', itemId: item },
          { kind: 'item', itemId: `item_${i}_b` },
        ],
      });
    }
    const model = buildReliquaryView(input({ pages: many, itemsDiscovered: ownedSet(...owned) }));
    expect(model.nearly).toHaveLength(5);
    expect(model.nearly.map((n) => n.pageId)).toEqual([
      'page_0',
      'page_1',
      'page_2',
      'page_3',
      'page_4',
    ]);
  });

  it('breaks nearly ties by stable pageId when remaining and fraction match', () => {
    const pages: ReliquaryPageDef[] = [
      {
        id: 'zeta_page',
        shelf: 'conquerors',
        name: 'Zeta',
        relics: [
          { kind: 'item', itemId: 'z_a' },
          { kind: 'item', itemId: 'z_b' },
        ],
      },
      {
        id: 'alpha_page',
        shelf: 'conquerors',
        name: 'Alpha',
        relics: [
          { kind: 'item', itemId: 'a_a' },
          { kind: 'item', itemId: 'a_b' },
        ],
      },
    ];
    const model = buildReliquaryView(
      input({
        pages,
        itemsDiscovered: ownedSet('z_a', 'a_a'),
      }),
    );
    expect(model.nearly.map((n) => n.pageId)).toEqual(['alpha_page', 'zeta_page']);
  });
});

describe('buildReliquaryView shelf and page', () => {
  it('lists conqueror pages with owned/total and optional clears', () => {
    const model = buildReliquaryView(
      input({
        nav: 'conquerors',
        itemsDiscovered: ownedSet('crypt_helm'),
        clearCount: (id) => (id === 'crypt_n' ? 7 : undefined),
      }),
    );
    expect(model.shelfPages).toHaveLength(3);
    const crypt = model.shelfPages.find((p) => p.pageId === 'crypt_n');
    expect(crypt).toMatchObject({
      pageId: 'crypt_n',
      name: 'The Hollow Crypt',
      shelf: 'conquerors',
      owned: 1,
      total: 3,
      complete: false,
      clears: 7,
    });
    const setPage = model.shelfPages.find((p) => p.pageId === 'set_deathlord');
    expect(setPage?.clears).toBeUndefined();
  });

  it('resolves an active page stub and pageDetail grid', () => {
    const model = buildReliquaryView(
      input({
        nav: 'conquerors',
        pageId: 'crypt_n',
        itemsDiscovered: ownedSet('crypt_helm', 'crypt_blade', 'crypt_ring'),
      }),
    );
    expect(model.pageId).toBe('crypt_n');
    expect(model.activePage).toMatchObject({
      pageId: 'crypt_n',
      owned: 3,
      total: 3,
      complete: true,
    });
    expect(model.pageDetail).toMatchObject({
      pageId: 'crypt_n',
      illuminated: true,
      owned: 3,
      total: 3,
      accountScoped: false,
    });
    expect(model.pageDetail?.cells).toHaveLength(3);
    expect(model.pageDetail?.cells.every((c) => c.owned)).toBe(true);
  });

  it('resolves activePage from full catalog when nav is overview', () => {
    const model = buildReliquaryView(
      input({
        nav: 'overview',
        pageId: 'crypt_n',
        itemsDiscovered: ownedSet('crypt_helm'),
      }),
    );
    expect(model.activePage).toMatchObject({
      pageId: 'crypt_n',
      owned: 1,
      total: 3,
      complete: false,
    });
  });

  it('returns null activePage for an unknown pageId', () => {
    const model = buildReliquaryView(input({ nav: 'conquerors', pageId: 'no_such_page' }));
    expect(model.activePage).toBeNull();
  });

  it('professions and horizons shelves list their pages from the injected catalog', () => {
    const prof = buildReliquaryView(input({ nav: 'professions' }));
    expect(prof.shelfPages.map((p) => p.pageId)).toEqual(['prof_stub']);
    const horiz = buildReliquaryView(input({ nav: 'horizons' }));
    expect(horiz.shelfPages.map((p) => p.pageId)).toEqual(['horiz_stub']);
  });

  it('matches Sim-shaped Set ownership to a ClientWorld-like rebuilt Set', () => {
    const ids = ['crypt_helm', 'dl_chest'];
    const simShape = ownedSet(...ids);
    // Online mirrors often rebuild a Set from a wire array (same membership).
    const clientShape = new Set([...ids]);
    const a = buildReliquaryView(input({ itemsDiscovered: simShape, recent: ids }));
    const b = buildReliquaryView(input({ itemsDiscovered: clientShape, recent: [...ids] }));
    expect(a.progress).toEqual(b.progress);
    expect(a.recent).toEqual(b.recent);
    expect(a.nearly).toEqual(b.nearly);
  });
});

describe('page grid cells', () => {
  it('lists mark cells owned vs missing without inventing firstFind clears', () => {
    const page = TEST_PAGES.find((p) => p.id === 'prof_stub')!;
    const cells = buildReliquaryPageCells(page, {
      itemsDiscovered: ownedSet(),
      marks: ownedSet('mw_a'),
      firstFind: { mw_a: { clears: 99 } }, // spoof: marks never take firstFind
    });
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ id: 'mw_a', kind: 'mark', owned: true });
    // Marks never surface firstFind clears (even if a spoof firstFind entry exists).
    expect(cells[0]?.firstFindClears).toBeUndefined();
    // Missing mark: no ownership invent from empty marks set.
    const missing = buildReliquaryPageCells(page, {
      itemsDiscovered: ownedSet(),
      marks: ownedSet(),
    });
    expect(missing[0]).toMatchObject({ id: 'mw_a', kind: 'mark', owned: false });
  });

  it('lists mount / skin / title cells owned vs missing (skins empty without cosmetics)', () => {
    const mountPage: ReliquaryPageDef = {
      id: 'h_m',
      shelf: 'horizons',
      name: 'Mounts',
      relics: [{ kind: 'mount', mountId: 'valorsteed' }],
    };
    const skinPage: ReliquaryPageDef = {
      id: 'h_s',
      shelf: 'horizons',
      name: 'Skins',
      relics: [{ kind: 'weapon_skin', skinId: 'guildmark_arming_sword' }],
    };
    const titlePage: ReliquaryPageDef = {
      id: 'h_t',
      shelf: 'horizons',
      name: 'Titles',
      relics: [{ kind: 'title', deedId: 'prog_veteran' }],
    };
    expect(
      buildReliquaryPageCells(mountPage, {
        itemsDiscovered: ownedSet(),
        ownedMounts: ownedSet('valorsteed'),
      })[0],
    ).toMatchObject({ id: 'valorsteed', kind: 'mount', owned: true });
    expect(buildReliquaryPageCells(mountPage, { itemsDiscovered: ownedSet() })[0]).toMatchObject({
      owned: false,
    });
    // Skins empty when account cosmetics absent.
    expect(buildReliquaryPageCells(skinPage, { itemsDiscovered: ownedSet() })[0]).toMatchObject({
      id: 'guildmark_arming_sword',
      kind: 'weapon_skin',
      owned: false,
    });
    expect(
      buildReliquaryPageCells(skinPage, {
        itemsDiscovered: ownedSet(),
        weaponSkins: ownedSet('guildmark_arming_sword'),
      })[0],
    ).toMatchObject({ owned: true });
    expect(
      buildReliquaryPageCells(titlePage, {
        itemsDiscovered: ownedSet(),
        deedsEarned: ownedSet('prog_veteran'),
      })[0],
    ).toMatchObject({ id: 'prog_veteran', kind: 'title', owned: true });
    expect(buildReliquaryPageCells(titlePage, { itemsDiscovered: ownedSet() })[0]).toMatchObject({
      id: 'prog_veteran',
      kind: 'title',
      owned: false,
    });
  });

  it('marks weapon-skin pages accountScoped in pageDetail', () => {
    const pages: ReliquaryPageDef[] = [
      {
        id: 'horiz_skins',
        shelf: 'horizons',
        name: 'Weapon Skins',
        relics: [{ kind: 'weapon_skin', skinId: 'guildmark_arming_sword' }],
      },
      {
        id: 'horiz_mounts',
        shelf: 'horizons',
        name: 'Mounts',
        relics: [{ kind: 'mount', mountId: 'valorsteed' }],
      },
    ];
    const skins = buildReliquaryView(
      input({
        pages,
        nav: 'horizons',
        pageId: 'horiz_skins',
      }),
    );
    expect(skins.pageDetail?.accountScoped).toBe(true);
    expect(skins.pageDetail?.cells[0]?.owned).toBe(false);
    // Mount/title pages must not inherit account scope from the shelf alone.
    const mounts = buildReliquaryView(
      input({
        pages,
        nav: 'horizons',
        pageId: 'horiz_mounts',
      }),
    );
    expect(mounts.pageDetail?.accountScoped).toBe(false);
  });

  it('lists owned vs missing in catalog order with firstFind clears on owned items', () => {
    const page = TEST_PAGES[0];
    const cells = buildReliquaryPageCells(page, {
      itemsDiscovered: ownedSet('crypt_helm', 'crypt_ring'),
      firstFind: { crypt_helm: { clears: 4, pageId: 'crypt_n' } },
    });
    expect(
      cells.map((c) => ({ id: c.id, owned: c.owned, firstFindClears: c.firstFindClears })),
    ).toEqual([
      { id: 'crypt_helm', owned: true, firstFindClears: 4 },
      { id: 'crypt_blade', owned: false, firstFindClears: undefined },
      { id: 'crypt_ring', owned: true, firstFindClears: undefined },
    ]);
    expect(cells.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('does not invent firstFind clears for missing or retro-owned relics', () => {
    const page = TEST_PAGES[0];
    // Retro: owned via discovery but no firstFind entry (no invented clear history).
    const cells = buildReliquaryPageCells(page, {
      itemsDiscovered: ownedSet('crypt_helm'),
      firstFind: {},
    });
    expect(cells[0].id).toBe('crypt_helm');
    expect(cells[0].owned).toBe(true);
    expect(cells[0].firstFindClears).toBeUndefined();
    // firstFind without ownership must not mark owned.
    const spoof = buildReliquaryPageCells(page, {
      itemsDiscovered: ownedSet(),
      firstFind: { crypt_blade: { clears: 99 } },
    });
    const blade = spoof.find((c) => c.id === 'crypt_blade');
    expect(blade?.owned).toBe(false);
    expect(blade?.firstFindClears).toBeUndefined();
  });

  it('pageDetail is null without a page selection and fills on selection', () => {
    expect(buildReliquaryView(input({ nav: 'conquerors' })).pageDetail).toBeNull();
    const open = buildReliquaryView(
      input({
        nav: 'conquerors',
        pageId: 'crypt_n',
        itemsDiscovered: ownedSet('crypt_helm'),
      }),
    );
    expect(open.pageDetail?.cells).toHaveLength(3);
    expect(open.pageDetail?.cells.filter((c) => c.owned)).toHaveLength(1);
    expect(open.pageDetail?.illuminated).toBe(false);
  });

  it('threads firstFind into pageDetail cells through buildReliquaryView', () => {
    // Guards the pass-through at buildReliquaryView (firstFind: input.firstFind);
    // buildReliquaryPageCells alone would stay green if that wire were dropped.
    const open = buildReliquaryView(
      input({
        nav: 'conquerors',
        pageId: 'crypt_n',
        itemsDiscovered: ownedSet('crypt_helm', 'crypt_ring'),
        firstFind: {
          crypt_helm: { clears: 4, pageId: 'crypt_n' },
          // Spoof without discovery must not invent ownership or clear meta.
          crypt_blade: { clears: 99 },
        },
      }),
    );
    expect(open.pageDetail).not.toBeNull();
    const cells = open.pageDetail?.cells ?? [];
    const byId = new Map(cells.map((c) => [c.id, c]));
    expect(byId.get('crypt_helm')?.owned).toBe(true);
    expect(byId.get('crypt_helm')?.firstFindClears).toBe(4);
    expect(byId.get('crypt_blade')?.owned).toBe(false);
    expect(byId.get('crypt_blade')?.firstFindClears).toBeUndefined();
    // Retro-owned (discovered, no firstFind entry): clear# stays undefined.
    expect(byId.get('crypt_ring')?.owned).toBe(true);
    expect(byId.get('crypt_ring')?.firstFindClears).toBeUndefined();
  });

  it('marks complete pages illuminated without inventing membership from marks alone', () => {
    const complete = buildReliquaryView(
      input({
        nav: 'conquerors',
        pageId: 'crypt_n',
        itemsDiscovered: ownedSet('crypt_helm', 'crypt_blade', 'crypt_ring'),
        marks: ownedSet('mw_a'),
      }),
    );
    expect(complete.pageDetail?.illuminated).toBe(true);
    // Catalog progress includes authored marks (3 items + 1 mark).
    expect(complete.progress.owned).toBe(4);

    // Marks on another shelf cannot force a conqueror page Illumination.
    const incomplete = buildReliquaryView(
      input({
        nav: 'conquerors',
        pageId: 'crypt_n',
        itemsDiscovered: ownedSet('crypt_helm'),
        marks: ownedSet('mw_a'),
      }),
    );
    expect(incomplete.pageDetail?.illuminated).toBe(false);
    expect(incomplete.pageDetail?.owned).toBe(1);
  });
});

describe('buildReliquaryUnlockPlan', () => {
  it('logs every unlock and coalesces the banner to the last plain unlock', () => {
    const plan = buildReliquaryUnlockPlan(
      [{ itemId: 'a' }, { itemId: 'b' }, { markId: 'mw_a' }],
      false,
    );
    expect(plan.logs).toEqual([
      { kind: 'item', id: 'a' },
      { kind: 'item', id: 'b' },
      { kind: 'mark', id: 'mw_a' },
    ]);
    expect(plan.banner).toEqual({ kind: 'unlock', relic: { kind: 'mark', id: 'mw_a' } });
    expect(plan.playSound).toBe(true);
    expect(plan.motion).toBe(true);
    expect(plan.refreshWindow).toBe(true);
    expect(plan.illuminatedPageId).toBeNull();
    expect(plan.curatorRank).toBeNull();
  });

  it('lets Illumination outrank a plain unlock for the banner slot', () => {
    const illuminateFirst = buildReliquaryUnlockPlan(
      [{ itemId: 'a', illuminatedPageId: 'crypt_n' }, { itemId: 'b' }],
      false,
    );
    // Log still carries every unlock; banner stays Illumination from the first.
    expect(illuminateFirst.logs).toHaveLength(2);
    expect(illuminateFirst.banner).toEqual({ kind: 'illuminate', pageId: 'crypt_n' });
    expect(illuminateFirst.illuminatedPageId).toBe('crypt_n');

    // Plain-then-Illumination: Illumination must replace an existing unlock banner
    // (not only keep a slot it already holds).
    const illuminateLast = buildReliquaryUnlockPlan(
      [{ itemId: 'b' }, { itemId: 'a', illuminatedPageId: 'crypt_n' }],
      false,
    );
    expect(illuminateLast.banner).toEqual({ kind: 'illuminate', pageId: 'crypt_n' });
    expect(illuminateLast.illuminatedPageId).toBe('crypt_n');
  });

  it('later Illumination replaces an earlier one; last illuminatedPageId wins', () => {
    const plan = buildReliquaryUnlockPlan(
      [
        { itemId: 'a', illuminatedPageId: 'crypt_n' },
        { itemId: 'b', illuminatedPageId: 'sanctum_n' },
      ],
      false,
    );
    expect(plan.banner).toEqual({ kind: 'illuminate', pageId: 'sanctum_n' });
    expect(plan.illuminatedPageId).toBe('sanctum_n');
  });

  it('arms the Illumination celebration once per drain and never into the next one', () => {
    // The Hud calls celebrateIllumination only when this field is non-null, so
    // "exactly once per illumination drain" is this pair: the filling drain
    // reports the page once, and the very next drain of ordinary finds reports
    // nothing, whatever those finds are.
    const filling = buildReliquaryUnlockPlan(
      [{ itemId: 'a' }, { itemId: 'b', illuminatedPageId: 'crypt_n' }],
      false,
    );
    expect(filling.illuminatedPageId).toBe('crypt_n');
    expect(filling.logs).toHaveLength(2);
    const after = buildReliquaryUnlockPlan([{ itemId: 'c' }, { markId: 'mw_a' }], false);
    expect(after.illuminatedPageId).toBeNull();
    // Two events that each illuminate the SAME page still report one page id,
    // not a list: the celebration is one moment, not one per event.
    const twice = buildReliquaryUnlockPlan(
      [
        { itemId: 'a', illuminatedPageId: 'crypt_n' },
        { itemId: 'b', illuminatedPageId: 'crypt_n' },
      ],
      false,
    );
    expect(twice.illuminatedPageId).toBe('crypt_n');
  });

  it('reducedMotion keeps the Illumination armed and trims only the flourish', () => {
    // Reduced motion is answered in CSS (a static gold frame), so the plan must
    // still hand the page to the window: dropping it here would take the news
    // away from the players who opted out of the animation, not just the
    // animation.
    const plan = buildReliquaryUnlockPlan([{ itemId: 'a', illuminatedPageId: 'crypt_n' }], true);
    expect(plan.illuminatedPageId).toBe('crypt_n');
    expect(plan.banner).toEqual({ kind: 'illuminate', pageId: 'crypt_n' });
    expect(plan.refreshWindow).toBe(true);
    expect(plan.playSound).toBe(true);
    expect(plan.motion).toBe(false);
  });

  it('skips empty payloads and never invents membership from pageIds alone', () => {
    const plan = buildReliquaryUnlockPlan(
      [{ pageIds: ['crypt_n'], illuminatedPageId: 'crypt_n' }, {}],
      false,
    );
    expect(plan.logs).toEqual([]);
    expect(plan.banner).toBeNull();
    expect(plan.playSound).toBe(false);
    expect(plan.refreshWindow).toBe(false);
    expect(plan.illuminatedPageId).toBeNull();
  });

  it('reducedMotion trims motion only (log, banner, sound survive)', () => {
    const plan = buildReliquaryUnlockPlan([{ itemId: 'crypt_helm' }], true);
    expect(plan.logs).toEqual([{ kind: 'item', id: 'crypt_helm' }]);
    expect(plan.banner).toEqual({
      kind: 'unlock',
      relic: { kind: 'item', id: 'crypt_helm' },
    });
    expect(plan.playSound).toBe(true);
    expect(plan.motion).toBe(false);
    expect(plan.refreshWindow).toBe(true);
    expect(plan.curatorRank).toBeNull();
  });

  it('lets rank-up outrank Illumination and plain unlock for the banner slot', () => {
    const plan = buildReliquaryUnlockPlan(
      [
        { itemId: 'a', illuminatedPageId: 'crypt_n' },
        { itemId: 'b', curatorRank: 2 },
        { itemId: 'c' },
      ],
      false,
    );
    expect(plan.logs).toHaveLength(3);
    expect(plan.banner).toEqual({ kind: 'rankUp', rank: 2 });
    expect(plan.curatorRank).toBe(2);
    // Illumination still recorded for any secondary chrome that wants it.
    expect(plan.illuminatedPageId).toBe('crypt_n');
    expect(plan.playSound).toBe(true);
  });

  it('same-event rank-up + Illumination keeps illuminatedPageId for secondary log', () => {
    // Production emitReliquaryUnlock ships one event with both fields when a
    // catalog fill ranks up and completes a page. Banner stays rankUp; the
    // Illumination log field must not be dropped by the rank-up branch.
    const plan = buildReliquaryUnlockPlan(
      [{ itemId: 'a', illuminatedPageId: 'crypt_n', curatorRank: 2 }],
      false,
    );
    expect(plan.banner).toEqual({ kind: 'rankUp', rank: 2 });
    expect(plan.curatorRank).toBe(2);
    expect(plan.illuminatedPageId).toBe('crypt_n');
    expect(plan.logs).toEqual([{ kind: 'item', id: 'a' }]);
    expect(plan.playSound).toBe(true);
  });

  it('Illumination does not overwrite an earlier rank-up banner', () => {
    const plan = buildReliquaryUnlockPlan(
      [
        { itemId: 'a', curatorRank: 1 },
        { itemId: 'b', illuminatedPageId: 'crypt_n' },
      ],
      false,
    );
    expect(plan.banner).toEqual({ kind: 'rankUp', rank: 1 });
    expect(plan.illuminatedPageId).toBe('crypt_n');
    expect(plan.curatorRank).toBe(1);
  });

  it('later rank-up replaces an earlier rank-up; last rank wins', () => {
    const plan = buildReliquaryUnlockPlan(
      [
        { itemId: 'a', curatorRank: 1 },
        { itemId: 'b', curatorRank: 2 },
      ],
      false,
    );
    expect(plan.banner).toEqual({ kind: 'rankUp', rank: 2 });
    expect(plan.curatorRank).toBe(2);
  });

  it('reducedMotion keeps rank-up log, banner text plan, and sound', () => {
    const plan = buildReliquaryUnlockPlan([{ itemId: 'a', curatorRank: 3 }], true);
    expect(plan.banner).toEqual({ kind: 'rankUp', rank: 3 });
    expect(plan.playSound).toBe(true);
    expect(plan.motion).toBe(false);
    expect(plan.curatorRank).toBe(3);
  });

  it('counts retro fills into the summary and gives them nothing else', () => {
    // The on-join seed: dozens of fills at once. They are counted and that is
    // all, exactly like the Book of Deeds retro pass.
    const plan = buildReliquaryUnlockPlan(
      [
        { itemId: 'a', retro: true },
        { markId: 'mw_a', retro: true },
      ],
      false,
    );
    expect(plan.retroCount).toBe(2);
    expect(plan.logs).toEqual([]);
    expect(plan.banner).toBeNull();
    expect(plan.playSound).toBe(false);
    expect(plan.motion).toBe(false);
    expect(plan.refreshWindow).toBe(false);
  });

  it('never lets a retro fill claim Illumination, rank-up, or the banner from a live find', () => {
    // A retro event carrying illuminatedPageId / curatorRank must not steal a
    // slot: only the live find in the same drain gets presentation.
    const plan = buildReliquaryUnlockPlan(
      [
        { itemId: 'seeded', illuminatedPageId: 'crypt_n', curatorRank: 4, retro: true },
        { itemId: 'live' },
      ],
      false,
    );
    expect(plan.retroCount).toBe(1);
    expect(plan.logs).toEqual([{ kind: 'item', id: 'live' }]);
    expect(plan.banner).toEqual({ kind: 'unlock', relic: { kind: 'item', id: 'live' } });
    expect(plan.illuminatedPageId).toBeNull();
    expect(plan.curatorRank).toBeNull();
    // The live find still owns sound, motion, and the window rebuild.
    expect(plan.playSound).toBe(true);
    expect(plan.motion).toBe(true);
    expect(plan.refreshWindow).toBe(true);
  });

  it('leaves retroCount at zero for a drain of live finds', () => {
    const plan = buildReliquaryUnlockPlan([{ itemId: 'a' }, { markId: 'mw_a' }], false);
    expect(plan.retroCount).toBe(0);
    expect(plan.logs).toHaveLength(2);
  });

  it('drops an empty retro payload before it can be counted', () => {
    // Intent pin: the neither-itemId-nor-markId skip (content drift, an empty
    // wire payload) happens AHEAD of the retro branch, so such an event never
    // inflates the catch-up line with a relic the client could not name.
    const plan = buildReliquaryUnlockPlan([{ retro: true }, { itemId: 'a', retro: true }], false);
    expect(plan.retroCount).toBe(1);
    expect(plan.logs).toEqual([]);
  });
});

describe('reliquaryRefreshSig', () => {
  it('elides when every dimension is equal', () => {
    const a = reliquaryRefreshSig({
      owned: 2,
      total: 9,
      curatorRank: 1,
      recentSig: 'a\u0001b',
      marksSize: 0,
      nav: 'overview',
      pageId: null,
    });
    const b = reliquaryRefreshSig({
      owned: 2,
      total: 9,
      curatorRank: 1,
      recentSig: 'a\u0001b',
      marksSize: 0,
      nav: 'overview',
      pageId: null,
    });
    expect(a).toBe(b);
  });

  it('moves when each signature dimension changes alone', () => {
    const base = {
      owned: 2,
      total: 9,
      curatorRank: 1,
      recentSig: 'a',
      marksSize: 0,
      nav: 'overview' as const,
      pageId: null as string | null,
      clearsDigest: 0,
      ownershipDigest: 0,
    };
    const baseSig = reliquaryRefreshSig(base);
    expect(reliquaryRefreshSig({ ...base, owned: 3 })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, total: 10 })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, curatorRank: 2 })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, nav: 'conquerors' })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, recentSig: 'b' })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, pageId: 'crypt_n' })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, marksSize: 1 })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, clearsDigest: 1 })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, ownershipDigest: 1 })).not.toBe(baseSig);
    // The two Phase 13 dimensions. Pinning only that the painter PASSES them
    // (the window suite does) leaves deleting `parts.search ?? ''` from the
    // join green in both suites, which silently stops a keystroke repainting.
    expect(reliquaryRefreshSig({ ...base, search: 'a' })).not.toBe(baseSig);
    expect(reliquaryRefreshSig({ ...base, ownedFilter: 'owned' })).not.toBe(baseSig);
  });

  it('reliquaryOwnershipDigest moves on discovered size, firstFind, or pageOwned', () => {
    const base = { discoveredSize: 3, marksSize: 0, firstFindCount: 1, pageOwned: 1 };
    const baseD = reliquaryOwnershipDigest(base);
    expect(reliquaryOwnershipDigest({ ...base, discoveredSize: 4 })).not.toBe(baseD);
    expect(reliquaryOwnershipDigest({ ...base, firstFindCount: 2 })).not.toBe(baseD);
    expect(reliquaryOwnershipDigest({ ...base, pageOwned: 2 })).not.toBe(baseD);
    expect(reliquaryOwnershipDigest({ ...base, marksSize: 1 })).not.toBe(baseD);
    expect(reliquaryOwnershipDigest(base)).toBe(baseD);
  });

  it('a ring change with IDENTICAL totals still repaints: recentSig carries the card line alone', () => {
    // The load-bearing arm of the card truth rule: when a relic that is
    // already counted lands in the ring, no count moves (owned/total,
    // discovered, marks, firstFind are all byte-identical), so the ring
    // digest alone must carry the repaint that updates the card's latest
    // line. Both halves are asserted against the SAME ownership premise.
    const owned = ownedSet('crypt_helm', 'crypt_blade');
    const before = buildReliquaryView(input({ recent: ['crypt_helm'], itemsDiscovered: owned }));
    const after = buildReliquaryView(
      input({ recent: ['crypt_helm', 'crypt_blade'], itemsDiscovered: owned }),
    );
    // Premise: every totals-bearing surface really is unchanged.
    expect(after.progress.owned).toBe(before.progress.owned);
    expect(after.shelfCards.map((c) => `${c.owned}/${c.total}`)).toEqual(
      before.shelfCards.map((c) => `${c.owned}/${c.total}`),
    );
    // The card line moved anyway (newest-first), and so did the ring digest.
    expect(before.shelfCards[0]?.recentId).toBe('crypt_helm');
    expect(after.shelfCards[0]?.recentId).toBe('crypt_blade');
    expect(reliquaryRecentSig(['crypt_helm', 'crypt_blade'])).not.toBe(
      reliquaryRecentSig(['crypt_helm']),
    );
  });

  it('a new find moves the ring digest, which is what repaints the shelf cards', () => {
    // The latest-find line on an Overview card is derived from the ring, and
    // in the identical-totals case above the ring digest is the dimension
    // that carries it (a NEW find also moves the ownership counts, which is
    // fine: redundancy, not a gap). Both halves are asserted: the model's
    // cards really changed, and the signature really moved, so neither could
    // hide behind the other.
    const before = buildReliquaryView(
      input({ recent: ['crypt_helm'], itemsDiscovered: ownedSet('crypt_helm') }),
    );
    const after = buildReliquaryView(
      input({
        recent: ['crypt_helm', 'mw_a'],
        itemsDiscovered: ownedSet('crypt_helm'),
        marks: ownedSet('mw_a'),
      }),
    );
    expect(before.shelfCards.map((c) => c.recentId)).not.toEqual(
      after.shelfCards.map((c) => c.recentId),
    );
    const ringBefore = reliquaryRecentSig(['crypt_helm']);
    const ringAfter = reliquaryRecentSig(['crypt_helm', 'mw_a']);
    expect(ringAfter).not.toBe(ringBefore);
    const parts = {
      owned: 2,
      total: 11,
      curatorRank: 1,
      marksSize: 1,
      nav: 'overview' as const,
      pageId: null as string | null,
    };
    expect(reliquaryRefreshSig({ ...parts, recentSig: ringAfter })).not.toBe(
      reliquaryRefreshSig({ ...parts, recentSig: ringBefore }),
    );
  });

  it('reliquaryRecentSig preserves order and joins with unit separator', () => {
    expect(reliquaryRecentSig(['a', 'b'])).toBe('a\u0001b');
    expect(reliquaryRecentSig(['a', 'b'])).not.toBe(reliquaryRecentSig(['b', 'a']));
    expect(reliquaryRecentSig([])).toBe('');
  });
});

describe('reliquaryFillPct', () => {
  it('rounds to a whole percent and pins the empty pair at zero', () => {
    expect(reliquaryFillPct(0, 0)).toBe(0);
    expect(reliquaryFillPct(0, 219)).toBe(0);
    expect(reliquaryFillPct(1, 3)).toBe(33);
    expect(reliquaryFillPct(2, 3)).toBe(67);
    expect(reliquaryFillPct(219, 219)).toBe(100);
    // Round, not floor: 0.5 percent of the way is already 1 on the meter.
    expect(reliquaryFillPct(1, 200)).toBe(1);
  });
});

describe('reliquaryFocusFallbackKey', () => {
  it('maps a jump control that its own jump destroys to the destination control', () => {
    // A card lands on its shelf, whose rail button survives; every page jump
    // lands on a page detail, whose Back button is the nearest named control.
    expect(reliquaryFocusFallbackKey('card:horizons')).toBe('nav:horizons');
    expect(reliquaryFocusFallbackKey('recent:item:crypt_helm')).toBe('back');
    expect(reliquaryFocusFallbackKey('nearly:crypt_n')).toBe('back');
    expect(reliquaryFocusFallbackKey('page:crypt_n')).toBe('back');
  });

  it('offers no fallback for controls that survive their own activation', () => {
    // Rail buttons, filter chips, the search field, grid cells, Back, and
    // Close all outlive the rebuilds they trigger (or have their own restore
    // path), so the exact-key restore owns them.
    expect(reliquaryFocusFallbackKey(null)).toBeNull();
    expect(reliquaryFocusFallbackKey('nav:conquerors')).toBeNull();
    expect(reliquaryFocusFallbackKey('filter:owned')).toBeNull();
    expect(reliquaryFocusFallbackKey('search')).toBeNull();
    expect(reliquaryFocusFallbackKey('cell:item:crypt_helm')).toBeNull();
    expect(reliquaryFocusFallbackKey('back')).toBeNull();
    expect(reliquaryFocusFallbackKey('close')).toBeNull();
    // The HUD-tracker pin toggle is deliberately in this list, not the one
    // above: pinning a page does not move it off the surface it lives on (the
    // shelf row stays, the page detail stays), so the exact-key restore finds
    // the same control and there is nothing to fall back to. A 'back' fallback
    // would also be wrong on the shelf, which has no Back button at all.
    expect(reliquaryFocusFallbackKey('pin:crypt_n')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 13: nearly-complete predicate, source-line arms, search + filter
// ---------------------------------------------------------------------------

/** N-slot conqueror page with the first `owned` relics discovered. */
function sizedPage(id: string, total: number): ReliquaryPageDef {
  return {
    id,
    shelf: 'conquerors',
    name: id,
    relics: Array.from({ length: total }, (_, i) => ({
      kind: 'item' as const,
      itemId: `${id}_${i}`,
    })),
  };
}

function ownedFirst(id: string, owned: number): string[] {
  return Array.from({ length: owned }, (_, i) => `${id}_${i}`);
}

describe('nearly-complete qualification (either arm, both inclusive)', () => {
  it('excludes a barely-started large page that the owned >= 1 floor alone let in', () => {
    // The defect: 1/30 is remaining 29 and fraction 0.03, yet it qualified and
    // could outrank a genuinely close page just by having any progress at all.
    const page = sizedPage('big', 30);
    const model = buildReliquaryView(
      input({ pages: [page], itemsDiscovered: ownedSet(...ownedFirst('big', 1)) }),
    );
    expect(model.nearly).toEqual([]);
  });

  it('qualifies at exactly RELIQUARY_NEARLY_MAX_REMAINING remaining (inclusive)', () => {
    expect(RELIQUARY_NEARLY_MAX_REMAINING).toBe(3);
    // 27/30: remaining exactly 3, and fraction 0.9 also passes, so narrow the
    // case to the remaining arm alone with a page whose fraction FAILS.
    // 3/6 is remaining 3 (passes) at fraction 0.5 (fails the 0.6 arm).
    const page = sizedPage('six', 6);
    const model = buildReliquaryView(
      input({ pages: [page], itemsDiscovered: ownedSet(...ownedFirst('six', 3)) }),
    );
    expect(model.nearly.map((n) => n.pageId)).toEqual(['six']);
    expect(model.nearly[0].remaining).toBe(3);
    // One relic further from done on the same-size page fails BOTH arms.
    const justOver = buildReliquaryView(
      input({
        pages: [sizedPage('seven', 7)],
        itemsDiscovered: ownedSet(...ownedFirst('seven', 3)),
      }),
    );
    expect(justOver.nearly).toEqual([]);
  });

  it('qualifies at exactly RELIQUARY_NEARLY_MIN_FRACTION full (inclusive)', () => {
    expect(RELIQUARY_NEARLY_MIN_FRACTION).toBe(0.6);
    // 6/10: fraction exactly 0.6 (passes) at remaining 4, which FAILS the
    // remaining arm, so only the fraction arm can be carrying this case.
    const model = buildReliquaryView(
      input({ pages: [sizedPage('ten', 10)], itemsDiscovered: ownedSet(...ownedFirst('ten', 6)) }),
    );
    expect(model.nearly.map((n) => n.pageId)).toEqual(['ten']);
    expect(model.nearly[0].remaining).toBe(4);
    // 5/9 is 0.5556 with the same remaining-arm failure: JUST under the 0.6
    // line, excluded. A wider miss (0.5) would also survive a predicate that
    // hardcoded any threshold in (0.43, 0.6]; this one only passes when the
    // real constant carries the comparison.
    const under = buildReliquaryView(
      input({ pages: [sizedPage('nine', 9)], itemsDiscovered: ownedSet(...ownedFirst('nine', 5)) }),
    );
    expect(under.nearly).toEqual([]);
  });

  it('still excludes zero-owned and complete pages regardless of either arm', () => {
    // A 0/2 page passes the remaining arm (2 <= 3) but owns nothing: the
    // MIN_OWNED floor is what keeps an untouched page off the strip.
    const zero = buildReliquaryView(
      input({ pages: [sizedPage('two', 2)], itemsDiscovered: ownedSet() }),
    );
    expect(zero.nearly).toEqual([]);
    const done = buildReliquaryView(
      input({ pages: [sizedPage('two', 2)], itemsDiscovered: ownedSet(...ownedFirst('two', 2)) }),
    );
    expect(done.nearly).toEqual([]);
  });
});

describe('nearly-complete search narrows before the ranking cap', () => {
  // Six remaining-1 pages outrank a remaining-3 page, so the seventh
  // qualifier is exactly the page the cap would hide.
  const pages = [
    ...Array.from({ length: 6 }, (_, i) => sizedPage(`close_${i}`, 2)),
    sizedPage('deep_target', 6),
  ];
  const discovered = () =>
    ownedSet(
      ...pages.slice(0, 6).flatMap((p) => ownedFirst(p.id, 1)),
      ...ownedFirst('deep_target', 3),
    );

  it('reaches a qualifying match that ranks below the top five', () => {
    // Premise: with no needle the target is NOT on the capped strip, so the
    // searched case below can only succeed by narrowing BEFORE the cap.
    const unsearched = buildReliquaryView(
      input({ pages, nav: 'overview', itemsDiscovered: discovered() }),
    );
    expect(unsearched.nearly).toHaveLength(5);
    expect(unsearched.nearly.map((n) => n.pageId)).not.toContain('deep_target');
    // The needle matches only the seventh-ranked page. Filtering the already
    // capped strip would paint "no results" for a page the shelf search
    // finds; the field's promise has to hold on Overview too.
    const model = buildReliquaryView(
      input({
        pages,
        nav: 'overview',
        itemsDiscovered: discovered(),
        search: 'deep_target',
        pageSearchText: (id) => id,
      }),
    );
    expect(model.nearly.map((n) => n.pageId)).toEqual(['deep_target']);
  });
});

describe('model.filtered reports a real narrowing, never mere needle presence', () => {
  const twoPages = [sizedPage('alpha_page', 2), sizedPage('beta_page', 2)];
  const shelfInput = (search: string) =>
    input({
      pages: twoPages,
      nav: 'conquerors',
      itemsDiscovered: ownedSet(...ownedFirst('alpha_page', 1), ...ownedFirst('beta_page', 1)),
      search,
      pageSearchText: (id) => id,
    });

  it('shelf: false with no needle, false when everything matches, true when narrowed', () => {
    expect(buildReliquaryView(shelfInput('')).filtered).toBe(false);
    // 'page' matches both rows: nothing was narrowed, so announcing "2
    // results" would be noise about a filter that did not filter.
    expect(buildReliquaryView(shelfInput('page')).filtered).toBe(false);
    expect(buildReliquaryView(shelfInput('alpha')).filtered).toBe(true);
    // A needle matching nothing is the strongest narrowing of all.
    expect(buildReliquaryView(shelfInput('zzz')).filtered).toBe(true);
  });

  it('overview: answers from the painted strips, either strip narrowing counts', () => {
    const overview = (search: string) =>
      input({
        pages: twoPages,
        nav: 'overview',
        recent: ['alpha_page_0', 'beta_page_0'],
        itemsDiscovered: ownedSet(...ownedFirst('alpha_page', 1), ...ownedFirst('beta_page', 1)),
        search,
        pageSearchText: (id) => id,
        relicSearchText: (_kind, id) => id,
      });
    expect(buildReliquaryView(overview('')).filtered).toBe(false);
    // Matches every chip and both nearly rows: nothing narrowed.
    expect(buildReliquaryView(overview('page')).filtered).toBe(false);
    // Narrows the recent strip (and the nearly strip with it).
    expect(buildReliquaryView(overview('alpha')).filtered).toBe(true);
  });

  it('overview: the recent arm alone decides when only the chips narrow', () => {
    // Ghost ids resolve kind 'unknown' (absent from ownership and catalog),
    // so their search text comes from the unknown resolver arm. The page
    // text carries the needle for EVERY page, so the nearly strip stays
    // whole and only the chip narrowing can set the flag.
    const model = buildReliquaryView(
      input({
        pages: twoPages,
        nav: 'overview',
        recent: ['ghost_a', 'ghost_b'],
        itemsDiscovered: ownedSet(...ownedFirst('alpha_page', 1), ...ownedFirst('beta_page', 1)),
        search: 'chipneedle',
        pageSearchText: (id) => `${id} chipneedle`,
        relicSearchText: (kind, id) =>
          kind === 'unknown' && id === 'ghost_a' ? 'chipneedle hit' : id,
      }),
    );
    expect(model.recent.map((r) => r.id)).toEqual(['ghost_a']);
    expect(model.nearly.map((n) => n.pageId).sort()).toEqual(['alpha_page', 'beta_page']);
    expect(model.filtered).toBe(true);
  });

  it('overview: the nearly arm alone decides when only the page rows narrow', () => {
    // Both chips match the needle; only one page does (by its own text or a
    // contained relic), so the nearly strip is the only narrowed surface.
    const model = buildReliquaryView(
      input({
        pages: twoPages,
        nav: 'overview',
        recent: ['ghost_a', 'ghost_b'],
        itemsDiscovered: ownedSet(...ownedFirst('alpha_page', 1), ...ownedFirst('beta_page', 1)),
        search: 'alpha',
        pageSearchText: (id) => id,
        relicSearchText: (kind, id) => (kind === 'unknown' ? 'alpha ghost' : id),
      }),
    );
    expect(model.recent.map((r) => r.id)).toEqual(['ghost_b', 'ghost_a']);
    expect(model.nearly.map((n) => n.pageId)).toEqual(['alpha_page']);
    expect(model.filtered).toBe(true);
  });

  it('overview: an equal-length nearly swap still reads as narrowed (identity, not count)', () => {
    // Six qualifiers: five remaining-1 pages and the remaining-3 target that
    // ranks sixth. A needle matching all but close_0 keeps the strip at five
    // rows while swapping close_0 out for the target: the flag must come
    // from row identity, not list length.
    const pages = [
      ...Array.from({ length: 5 }, (_, i) => sizedPage(`close_${i}`, 2)),
      sizedPage('deep_target', 6),
    ];
    const discovered = ownedSet(
      ...pages.slice(0, 5).flatMap((p) => ownedFirst(p.id, 1)),
      ...ownedFirst('deep_target', 3),
    );
    const unsearched = buildReliquaryView(
      input({ pages, nav: 'overview', itemsDiscovered: discovered }),
    );
    expect(unsearched.nearly.map((n) => n.pageId)).not.toContain('deep_target');
    const model = buildReliquaryView(
      input({
        pages,
        nav: 'overview',
        itemsDiscovered: discovered,
        search: 'findme',
        pageSearchText: (id) => (id === 'close_0' ? 'nomatch' : `${id} findme`),
      }),
    );
    expect(model.nearly).toHaveLength(5);
    expect(model.nearly.map((n) => n.pageId)).toContain('deep_target');
    expect(model.filtered).toBe(true);
  });

  it('stays false when no resolver is injected, whatever the needle', () => {
    const model = buildReliquaryView(
      input({ pages: twoPages, nav: 'conquerors', search: 'anything' }),
    );
    expect(model.filtered).toBe(false);
  });
});

describe('reliquarySourceLinePlan', () => {
  it('names the dungeon too when the page clear meter reads one', () => {
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'boss', sourceId: 'korzul' }], {
        kind: 'dungeon',
        dungeonId: 'crypt',
      }),
    ).toEqual([{ kind: 'bossDungeon', bossId: 'korzul', dungeonId: 'crypt' }]);
  });

  it('names the boss alone for every non-dungeon clear source', () => {
    // A raid / world boss / delve page has no dungeon to name; inventing one
    // would send a player to the wrong place.
    for (const clearSource of [
      undefined,
      { kind: 'none' } as const,
      { kind: 'delve', delveId: 'sunken' } as const,
      { kind: 'deed_stat', stat: 'thunzharrKills' } as const,
    ]) {
      expect(
        reliquarySourceLinePlan([{ sourceKind: 'boss', sourceId: 'thunzharr' }], clearSource),
      ).toEqual([{ kind: 'boss', bossId: 'thunzharr' }]);
    }
  });

  it('maps every other hint kind to its own arm', () => {
    const dungeon = { kind: 'dungeon', dungeonId: 'crypt' } as const;
    // The dungeon clear source is passed on each so the pin proves it is read
    // ONLY by the boss arm and never leaks into the others.
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'zone', sourceId: 'eastbrook' }], dungeon),
    ).toEqual([{ kind: 'zone', zoneId: 'eastbrook' }]);
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'profession', sourceId: 'mining' }], dungeon),
    ).toEqual([{ kind: 'profession', professionId: 'mining' }]);
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'deed', sourceId: 'col_set_x' }], dungeon),
    ).toEqual([{ kind: 'deed', deedId: 'col_set_x' }]);
    expect(
      reliquarySourceLinePlan(
        [{ sourceKind: 'vendor', sourceId: 'heroic_quartermaster' }],
        dungeon,
      ),
    ).toEqual([{ kind: 'vendor', npcId: 'heroic_quartermaster' }]);
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'delve', sourceId: 'drowned_litany' }], dungeon),
    ).toEqual([{ kind: 'delve', delveId: 'drowned_litany' }]);
    expect(reliquarySourceLinePlan([{ sourceKind: 'rift', sourceId: 'S' }], dungeon)).toEqual([
      { kind: 'rift', rank: 'S' },
    ]);
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'quest', sourceId: 'q_gravewyrm' }], dungeon),
    ).toEqual([{ kind: 'quest', questId: 'q_gravewyrm' }]);
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'store', sourceId: 'woc_store' }], dungeon),
    ).toEqual([{ kind: 'store', storeId: 'woc_store' }]);
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'activity', sourceId: 'corpse_harvest' }], dungeon),
    ).toEqual([{ kind: 'activity', activityId: 'corpse_harvest' }]);
  });

  it('answers the empty list with no hints (an un-authored source renders no line)', () => {
    const empty = reliquarySourceLinePlan([], { kind: 'dungeon', dungeonId: 'crypt' });
    expect(empty).toEqual([]);
    // The shared frozen constant, same contract as the content resolver's
    // NO_SOURCE_HINTS twin: the no-hints answer never allocates and a caller
    // that mistook it for its own array cannot mutate it.
    expect(Object.isFrozen(empty)).toBe(true);
    expect(reliquarySourceLinePlan([], undefined)).toBe(empty);
  });

  it('renders one line per hint, in authored order, with no cap', () => {
    // The pattern, stated as a test: a relic with four doors shows four lines,
    // in the order the catalog authored them. No merging of the two same-page
    // bosses, no cap, no arbitrary winner.
    const plans = reliquarySourceLinePlan(
      [
        { sourceKind: 'boss', sourceId: 'first_boss' },
        { sourceKind: 'boss', sourceId: 'second_boss' },
        { sourceKind: 'rift', sourceId: 'A' },
        { sourceKind: 'profession', sourceId: 'mining' },
      ],
      { kind: 'none' },
    );
    expect(plans).toEqual([
      { kind: 'boss', bossId: 'first_boss' },
      { kind: 'boss', bossId: 'second_boss' },
      { kind: 'rift', rank: 'A' },
      { kind: 'profession', professionId: 'mining' },
    ]);
  });

  it('composes ONE boss with ONE zone at the boss position, and only then', () => {
    // "Which rare" and "where it camps" are two halves of one open-world
    // answer, so exactly-one-of-each folds into a single bossZone line placed
    // where the BOSS hint was authored.
    expect(
      reliquarySourceLinePlan(
        [
          { sourceKind: 'boss', sourceId: 'ironvein_foreman' },
          { sourceKind: 'zone', sourceId: 'thornpeak_heights' },
        ],
        { kind: 'none' },
      ),
    ).toEqual([{ kind: 'bossZone', bossId: 'ironvein_foreman', zoneId: 'thornpeak_heights' }]);
    // Authored zone-first: the composed line still lands at the boss position,
    // so the order pin above is about the BOSS hint and not about index 0.
    expect(
      reliquarySourceLinePlan(
        [
          { sourceKind: 'profession', sourceId: 'mining' },
          { sourceKind: 'zone', sourceId: 'thornpeak_heights' },
          { sourceKind: 'boss', sourceId: 'ironvein_foreman' },
        ],
        { kind: 'none' },
      ),
    ).toEqual([
      { kind: 'profession', professionId: 'mining' },
      { kind: 'bossZone', bossId: 'ironvein_foreman', zoneId: 'thornpeak_heights' },
    ]);
  });

  it('does NOT compose when the shape is anything other than exactly one of each', () => {
    // Two bosses and one zone: which boss would the zone belong to? Neither
    // answer is knowable here, so all three render alone rather than guessing.
    expect(
      reliquarySourceLinePlan(
        [
          { sourceKind: 'boss', sourceId: 'first_boss' },
          { sourceKind: 'boss', sourceId: 'second_boss' },
          { sourceKind: 'zone', sourceId: 'thornpeak_heights' },
        ],
        { kind: 'none' },
      ),
    ).toEqual([
      { kind: 'boss', bossId: 'first_boss' },
      { kind: 'boss', bossId: 'second_boss' },
      { kind: 'zone', zoneId: 'thornpeak_heights' },
    ]);
    // One boss and TWO zones: same reasoning in the other direction.
    expect(
      reliquarySourceLinePlan(
        [
          { sourceKind: 'boss', sourceId: 'first_boss' },
          { sourceKind: 'zone', sourceId: 'thornpeak_heights' },
          { sourceKind: 'zone', sourceId: 'eastbrook' },
        ],
        { kind: 'none' },
      ),
    ).toEqual([
      { kind: 'boss', bossId: 'first_boss' },
      { kind: 'zone', zoneId: 'thornpeak_heights' },
      { kind: 'zone', zoneId: 'eastbrook' },
    ]);
    // A LONE zone hint (zero bosses): the bosses === 1 half of the compose
    // guard. Dropping that half would make the loop skip the sole zone with no
    // boss to fold it into, and the hint would silently render NO line at all.
    expect(
      reliquarySourceLinePlan([{ sourceKind: 'zone', sourceId: 'thornpeak_heights' }], {
        kind: 'none',
      }),
    ).toEqual([{ kind: 'zone', zoneId: 'thornpeak_heights' }]);
  });

  it('keeps the page dungeon over a zone hint when both could name the place', () => {
    // The dungeon composition wins on a dungeon page: composing bossZone
    // instead would drop the more specific place the page already knows, and
    // the zone still gets its own line, so no authored door is lost.
    expect(
      reliquarySourceLinePlan(
        [
          { sourceKind: 'boss', sourceId: 'korzul' },
          { sourceKind: 'zone', sourceId: 'thornpeak_heights' },
        ],
        { kind: 'dungeon', dungeonId: 'crypt' },
      ),
    ).toEqual([
      { kind: 'bossDungeon', bossId: 'korzul', dungeonId: 'crypt' },
      { kind: 'zone', zoneId: 'thornpeak_heights' },
    ]);
  });

  it('composes every boss hint with the page dungeon, one line per boss', () => {
    expect(
      reliquarySourceLinePlan(
        [
          { sourceKind: 'boss', sourceId: 'sanctum_boneguard' },
          { sourceKind: 'boss', sourceId: 'korgath_the_bound' },
        ],
        { kind: 'dungeon', dungeonId: 'gravewyrm_sanctum' },
      ),
    ).toEqual([
      { kind: 'bossDungeon', bossId: 'sanctum_boneguard', dungeonId: 'gravewyrm_sanctum' },
      { kind: 'bossDungeon', bossId: 'korgath_the_bound', dungeonId: 'gravewyrm_sanctum' },
    ]);
  });
});

describe('grid cell source plans', () => {
  const page: ReliquaryPageDef = {
    id: 'src_page',
    shelf: 'conquerors',
    name: 'Source Page',
    clearSource: { kind: 'dungeon', dungeonId: 'crypt' },
    sourceDefault: { sourceKind: 'boss', sourceId: 'page_default_boss' },
    relics: [
      { kind: 'item', itemId: 'own_hint', source: { sourceKind: 'vendor', sourceId: 'vex' } },
      { kind: 'item', itemId: 'inherits' },
      {
        kind: 'item',
        itemId: 'multi_door',
        source: [
          { sourceKind: 'boss', sourceId: 'first_boss' },
          { sourceKind: 'profession', sourceId: 'mining' },
        ],
      },
    ],
  };

  it('prefers the slot hint and falls back to the page default', () => {
    const cells = buildReliquaryPageCells(page, { itemsDiscovered: ownedSet() });
    expect(cells[0].sourcePlans).toEqual([{ kind: 'vendor', npcId: 'vex' }]);
    expect(cells[1].sourcePlans).toEqual([
      {
        kind: 'bossDungeon',
        bossId: 'page_default_boss',
        dungeonId: 'crypt',
      },
    ]);
  });

  it('carries every authored door onto the cell, in order', () => {
    const cells = buildReliquaryPageCells(page, { itemsDiscovered: ownedSet() });
    expect(cells[2].sourcePlans).toEqual([
      { kind: 'bossDungeon', bossId: 'first_boss', dungeonId: 'crypt' },
      { kind: 'profession', professionId: 'mining' },
    ]);
  });

  it('resolves the default off the INJECTED page, not a live catalog lookup', () => {
    // A synthetic page reusing a live page id must still read its own
    // sourceDefault; resolving by id would silently answer with live content.
    const shadow: ReliquaryPageDef = {
      ...page,
      id: 'dungeon_hollow_crypt',
      sourceDefault: { sourceKind: 'zone', sourceId: 'synthetic_zone' },
      clearSource: undefined,
      relics: [{ kind: 'item', itemId: 'inherits' }],
    };
    const cells = buildReliquaryPageCells(shadow, { itemsDiscovered: ownedSet() });
    expect(cells[0].sourcePlans).toEqual([{ kind: 'zone', zoneId: 'synthetic_zone' }]);
  });

  it('omits the plans entirely for an un-hinted relic on an un-hinted page', () => {
    // Undefined, never an empty array: a truthiness test and a length test on
    // the cell have to agree (the painter stamps the count off this field).
    const bare = buildReliquaryPageCells(sizedPage('bare', 1), { itemsDiscovered: ownedSet() });
    expect(bare[0].sourcePlans).toBeUndefined();
  });
});

describe('search and ownership filter', () => {
  const page: ReliquaryPageDef = {
    id: 'filter_page',
    shelf: 'conquerors',
    name: 'Filter Page',
    relics: [
      { kind: 'item', itemId: 'gilded_crown' },
      { kind: 'item', itemId: 'rusty_spoon' },
      { kind: 'item', itemId: 'gilded_ring' },
    ],
  };
  // Localized display text, deliberately UNLIKE the raw ids: a filter matching
  // the ids would pass every id-based assertion and still fail a real player.
  const NAMES: Record<string, string> = {
    gilded_crown: 'couronne doree',
    rusty_spoon: 'cuillere rouillee',
    gilded_ring: 'anneau dore',
  };
  const filterInput = (partial: Partial<ReliquaryViewInput> = {}) =>
    input({
      pages: [page],
      nav: 'conquerors',
      pageId: 'filter_page',
      itemsDiscovered: ownedSet('gilded_crown'),
      relicSearchText: (_kind, id) => (NAMES[id] ?? '').toLowerCase(),
      pageSearchText: () => 'page filtree',
      ...partial,
    });

  it('matches the LOCALIZED display name, not the raw catalog id', () => {
    const localized = buildReliquaryView(filterInput({ search: 'dore' }));
    expect(localized.pageDetail?.cells.map((c) => c.id)).toEqual(['gilded_crown', 'gilded_ring']);
    // The English id substring must NOT match: the filter never sees ids.
    const byId = buildReliquaryView(filterInput({ search: 'gilded' }));
    expect(byId.pageDetail?.cells).toEqual([]);
    expect(byId.pageDetail?.filtered).toBe(true);
  });

  it('filters grid cells by ownership on each chip', () => {
    const owned = buildReliquaryView(filterInput({ ownedFilter: 'owned' }));
    expect(owned.pageDetail?.cells.map((c) => c.id)).toEqual(['gilded_crown']);
    const missing = buildReliquaryView(filterInput({ ownedFilter: 'missing' }));
    expect(missing.pageDetail?.cells.map((c) => c.id)).toEqual(['rusty_spoon', 'gilded_ring']);
    const all = buildReliquaryView(filterInput({ ownedFilter: 'all' }));
    expect(all.pageDetail?.cells).toHaveLength(3);
    expect(all.pageDetail?.filtered).toBe(false);
  });

  it('intersects search with the ownership chip', () => {
    const both = buildReliquaryView(filterInput({ search: 'dore', ownedFilter: 'missing' }));
    expect(both.pageDetail?.cells.map((c) => c.id)).toEqual(['gilded_ring']);
  });

  it('never lets a filter move the header completion meter', () => {
    // owned/total describe the PAGE, not the visible subset: a "missing" chip
    // that reported 0/3 filled would read as lost progress.
    const filtered = buildReliquaryView(filterInput({ ownedFilter: 'missing' }));
    expect(filtered.pageDetail?.owned).toBe(1);
    expect(filtered.pageDetail?.total).toBe(3);
  });

  it('narrows the shelf list by localized page name but still opens the active page', () => {
    const hit = buildReliquaryView(filterInput({ pageId: null, search: 'filtree' }));
    expect(hit.shelfPages.map((p) => p.pageId)).toEqual(['filter_page']);
    const miss = buildReliquaryView(filterInput({ pageId: null, search: 'zzz' }));
    expect(miss.shelfPages).toEqual([]);
    // A search that excludes the open page's NAME must not blank its grid: the
    // player is reading that page, and the shelf list is behind it.
    const openAnyway = buildReliquaryView(filterInput({ search: 'zzz' }));
    expect(openAnyway.shelfPages).toEqual([]);
    expect(openAnyway.pageDetail?.pageId).toBe('filter_page');
  });

  it('narrows the Overview strips too, so the field is never an inert control', () => {
    const overview = (partial: Partial<ReliquaryViewInput> = {}) =>
      input({
        pages: [page],
        nav: 'overview',
        recent: ['gilded_crown', 'rusty_spoon'],
        itemsDiscovered: ownedSet('gilded_crown', 'rusty_spoon'),
        relicSearchText: (_kind, id) => (NAMES[id] ?? '').toLowerCase(),
        pageSearchText: () => 'page filtree',
        ...partial,
      });
    // Recent finds: matched by localized name, newest-first order preserved.
    expect(buildReliquaryView(overview()).recent.map((r) => r.id)).toEqual([
      'rusty_spoon',
      'gilded_crown',
    ]);
    expect(buildReliquaryView(overview({ search: 'couronne' })).recent.map((r) => r.id)).toEqual([
      'gilded_crown',
    ]);
    // Nearly-complete rows: matched by localized PAGE name, and by a contained
    // relic's name too, the same deep match the shelf list gets. Without it a
    // relic-name needle on Overview showed the recent chip for a relic while
    // hiding the page that holds it, an asymmetry a player reads as "not in
    // the catalog".
    const nearlyHit = buildReliquaryView(overview({ search: 'filtree' }));
    expect(nearlyHit.nearly.map((n) => n.pageId)).toEqual(['filter_page']);
    const nearlyDeep = buildReliquaryView(overview({ search: 'couronne' }));
    expect(nearlyDeep.nearly.map((n) => n.pageId)).toEqual(['filter_page']);
    // And a search matching nothing empties both, which is what lets the
    // painter swap the overview blurb for the no-results line.
    const none = buildReliquaryView(overview({ search: 'zzz' }));
    expect(none.recent).toEqual([]);
    expect(none.nearly).toEqual([]);
  });

  it('keeps a shelf row whose RELIC matches, even when the page text does not', () => {
    // "Search relics" has to be true from the shelf too, or typing a relic name
    // there returns nothing and the player concludes the relic is not in the
    // catalog. Premise first: the needle must NOT match the page's own text,
    // so the row can only survive via its relics.
    const pageText = 'page filtree';
    const needle = 'couronne';
    expect(pageText).not.toContain(needle);
    const deep = buildReliquaryView(filterInput({ pageId: null, search: needle }));
    expect(deep.shelfPages.map((p) => p.pageId)).toEqual(['filter_page']);
    // And a needle matching neither the page text nor any relic still drops it.
    const miss = buildReliquaryView(filterInput({ pageId: null, search: 'zzz' }));
    expect(miss.shelfPages).toEqual([]);
  });

  it('leaves everything unfiltered when no search text resolver is injected', () => {
    const model = buildReliquaryView(
      input({ pages: [page], nav: 'conquerors', pageId: 'filter_page', search: 'anything' }),
    );
    expect(model.shelfPages.map((p) => p.pageId)).toEqual(['filter_page']);
    expect(model.pageDetail?.cells).toHaveLength(3);
  });
});

describe('reliquaryRelicDisplayName (the one shared ladder)', () => {
  it('names a real relic of every catalog kind through its own channel', () => {
    // Ids come off the LIVE catalog, so a content rename cannot rot this pin
    // into asserting nothing. Each name must be real text, never the id back.
    const kinds: ReliquaryRelicDef['kind'][] = ['item', 'mark', 'mount', 'weapon_skin', 'title'];
    for (const kind of kinds) {
      const relic = RELIQUARY_PAGES.flatMap((p) => p.relics).find((r) => r.kind === kind);
      expect(relic, `a live ${kind} relic`).toBeTruthy();
      if (!relic) continue;
      const id = relicId(relic);
      const name = reliquaryRelicDisplayName(kind, id);
      expect(name, `${kind} ${id}`).not.toBe('');
      expect(name, `${kind} ${id}`).not.toBe(id);
      // The humanized fallback is what an id-shaped name would look like.
      expect(name, `${kind} ${id}`).not.toBe(id.replace(/_/g, ' '));
      expect(name, `${kind} ${id}`).not.toBe('Unrecorded relic');
    }
  });

  it("resolves the recent ring's wire-shaped 'unknown' kind as an item", () => {
    const itemRelic = RELIQUARY_PAGES.flatMap((p) => p.relics).find((r) => r.kind === 'item');
    expect(itemRelic).toBeTruthy();
    if (!itemRelic) return;
    const id = relicId(itemRelic);
    expect(reliquaryRelicDisplayName('unknown', id)).toBe(reliquaryRelicDisplayName('item', id));
  });

  it('renders authored copy for a namespaced id no table can place (the drift case)', () => {
    // THE bug this ladder replaced: hud.ts's chat site stripped the colon
    // namespace and spaced the underscores ("swift gryphon"), while its banner
    // site skipped the strip and only spaced ("mount:swift gryphon"), so ONE
    // unlock printed two different names. Both now land here, and neither can
    // produce an id-derived string at all.
    const drifted = reliquaryRelicDisplayName('item', 'mount:swift_gryphon');
    expect(drifted).toBe('Unrecorded relic');
    expect(drifted).not.toContain('swift');
    expect(drifted).not.toContain(':');
    expect(drifted).not.toContain('_');
    // Same for a bare-underscore id and for a prototype key off the wire (a
    // raw ITEMS['constructor'] would resolve a Function, not undefined).
    expect(reliquaryRelicDisplayName('item', 'not_a_real_relic_id')).toBe('Unrecorded relic');
    expect(reliquaryRelicDisplayName('item', 'constructor')).toBe('Unrecorded relic');
    expect(reliquaryRelicDisplayName('unknown', '__proto__')).toBe('Unrecorded relic');
  });

  it('falls to the authored copy for an unmapped MOUNT rather than raw English', () => {
    // mountDisplayName, the shared helper, answers MOUNTS[id].name (raw catalog
    // ENGLISH) and then the raw id. Both would sail past a not.toBe(id) pin
    // while shipping untranslated text, so this asserts the authored copy
    // exactly. Membership is MOUNT_NAME_KEYS, not MOUNTS.
    expect(reliquaryRelicDisplayName('mount', 'not_a_mount_id')).toBe('Unrecorded relic');
    // A real MOUNTS row with no name key must ALSO fall through: this is the
    // case that separates "guarded on MOUNT_NAME_KEYS" from "guarded on MOUNTS".
    const unkeyed = Object.keys(MOUNTS).find((id) => !Object.hasOwn(MOUNT_NAME_KEYS, id));
    if (unkeyed !== undefined) {
      expect(reliquaryRelicDisplayName('mount', unkeyed), unkeyed).toBe('Unrecorded relic');
    }
    // Every catalogued Horizons mount still resolves to real text.
    for (const id of RELIQUARY_HORIZON_MOUNTS) {
      const name = reliquaryRelicDisplayName('mount', id);
      expect(name, id).not.toBe('Unrecorded relic');
      expect(name, id).not.toBe(id);
    }
  });

  it('falls to the authored copy for an unresolvable WEAPON SKIN or TITLE', () => {
    // The two remaining guarded arms. localizeWeaponSkin THROWS on an id
    // outside the armory key table, so the WEAPON_SKINS membership check is
    // what keeps an unknown skin from taking down the render; deedTitleText
    // answers '' for a deed with no title reward, which would otherwise paint
    // an empty cell label.
    expect(reliquaryRelicDisplayName('weapon_skin', 'not_a_skin_id')).toBe('Unrecorded relic');
    expect(() => reliquaryRelicDisplayName('weapon_skin', 'constructor')).not.toThrow();
    expect(reliquaryRelicDisplayName('title', 'not_a_deed_id')).toBe('Unrecorded relic');
    // A REAL deed that grants no title still has no name to show here.
    const titleless = Object.values(DEEDS).find((d) => d.reward?.kind !== 'title');
    if (titleless) {
      expect(reliquaryRelicDisplayName('title', titleless.id), titleless.id).toBe(
        'Unrecorded relic',
      );
    }
  });

  it('falls to the authored copy for a wire-sourced MARK the catalog cannot name', () => {
    // reliquaryMarks is a server-mirrored set, so a client older than the
    // server sees marks with no markFind leaf. t() on an untracked key throws
    // off a release build, and the search filter resolves every relic per
    // keystroke, so this would take down the whole render, not one chip.
    expect(reliquaryRelicDisplayName('mark', 'gather_event:not_yet_shipped')).toBe(
      'Unrecorded relic',
    );
    expect(reliquaryRelicDisplayName('mark', 'masterwork:from_a_newer_server')).toBe(
      'Unrecorded relic',
    );
    // Resolving it must not throw either (the release-build arm renders the raw
    // key string instead, which is the same defect wearing a different coat).
    expect(() => reliquaryRelicDisplayName('mark', 'totally:unknown')).not.toThrow();
    expect(reliquaryRelicDisplayName('mark', 'totally:unknown')).not.toContain('hudChrome');
    // Every catalogued mark still resolves to real text.
    for (const markId of RELIQUARY_MARK_IDS) {
      expect(reliquaryRelicDisplayName('mark', markId), markId).not.toBe('Unrecorded relic');
    }
  });

  it('casefolds for search without changing which name is matched', () => {
    const itemRelic = RELIQUARY_PAGES.flatMap((p) => p.relics).find((r) => r.kind === 'item');
    if (!itemRelic) return;
    const id = relicId(itemRelic);
    expect(reliquaryRelicSearchText('item', id, 'en-US')).toBe(
      reliquaryRelicDisplayName('item', id).toLocaleLowerCase('en-US'),
    );
  });

  it('platform contract: locale-aware folding differs on Turkish I, and languageTag maps tr_TR', () => {
    // tr_TR ships. Invariant toLowerCase folds 'İ' (U+0130) to 'i̇' (i + combining
    // dot), which does NOT equal the 'i' a Turkish player types, so their own
    // keystrokes miss their own relic names. toLocaleLowerCase('tr') folds it to
    // plain 'i'. This asserts the PLATFORM difference plus the languageTag
    // mapping; it cannot prove the module uses the locale fold, because no
    // shipped English relic name contains a capital I, so a behavioral case
    // could not tell the two folds apart. The guard on the module itself is
    // the source pin in tests/reliquary_window.test.ts ("folds the HAYSTACK
    // with the locale too"), which bans toLowerCase on the live path.
    const TURKISH_DOTTED = 'İZ';
    expect(TURKISH_DOTTED.toLocaleLowerCase('tr')).toBe('iz');
    expect(TURKISH_DOTTED.toLowerCase()).not.toBe('iz');
    // The helper must follow the tag it is handed, both directions.
    const folded = (tag: string) => TURKISH_DOTTED.toLocaleLowerCase(tag);
    expect(folded('tr')).not.toBe(folded('en-US'));
    // And the painter must hand a real tag down: languageTag maps the shipped
    // locale id to the BCP 47 tag Intl consumes.
    expect(languageTag('tr_TR')).toBe('tr-TR');
    expect(TURKISH_DOTTED.toLocaleLowerCase(languageTag('tr_TR'))).toBe('iz');
  });
});

describe('reliquarySourceLineText', () => {
  it('names boss and dungeon on the dungeon arm, boss alone otherwise', () => {
    const boss = tEntity({ kind: 'mob', id: 'korzul_the_gravewyrm', field: 'name' });
    const dungeonId = Object.keys(DUNGEONS)[0];
    const dungeon = dungeonDisplayName(dungeonId);
    const both = reliquarySourceLineText({
      kind: 'bossDungeon',
      bossId: 'korzul_the_gravewyrm',
      dungeonId,
    });
    expect(both).toBe(`Drops from ${boss} in ${dungeon}`);
    const alone = reliquarySourceLineText({ kind: 'boss', bossId: 'korzul_the_gravewyrm' });
    expect(alone).toBe(`Drops from ${boss}`);
    // The boss-only arm must not smuggle a place in.
    expect(alone).not.toContain(dungeon);
  });

  it('composes the zone, deed, and vendor arms from their own channels', () => {
    expect(reliquarySourceLineText({ kind: 'zone', zoneId: ZONES[0].id })).toBe(
      `Found in ${zoneDisplayName(ZONES[0].id)}`,
    );
    expect(reliquarySourceLineText({ kind: 'vendor', npcId: 'heroic_quartermaster' })).toBe(
      `Sold by ${tEntity({ kind: 'npc', id: 'heroic_quartermaster', field: 'name' })}`,
    );
    const deedId = 'col_set_deathlord';
    expect(reliquarySourceLineText({ kind: 'deed', deedId })).toBe(
      `Awarded by the deed ${deedName(deedId)}`,
    );
  });

  it('names a craft and a gathering profession, and stays silent off both tables', () => {
    expect(reliquarySourceLineText({ kind: 'profession', professionId: 'weaponcrafting' })).toBe(
      'Earned through Weaponcrafting',
    );
    expect(reliquarySourceLineText({ kind: 'profession', professionId: 'mining' })).toBe(
      'Earned through Mining',
    );
    // An id on neither table has no honest name, so there is no line at all
    // rather than "Earned through " with a hole in it.
    expect(reliquarySourceLineText({ kind: 'profession', professionId: 'basketweaving' })).toBe('');
    // A prototype key is the case a plain "undefined?" check misses: the craft
    // table is indexed bare, so 'constructor' resolves a truthy Function that
    // would otherwise be handed to t() as if it were a key.
    for (const proto of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(reliquarySourceLineText({ kind: 'profession', professionId: proto }), proto).toBe('');
    }
  });

  it('renders nothing when the catalog authors no hint', () => {
    expect(reliquarySourceLineText(undefined)).toBe('');
  });

  it('composes the delve and quest arms through their own entity channels', () => {
    // The delve board and the quest log already own these names; the source
    // line reuses those channels rather than minting a third naming ladder.
    const delveId = Object.keys(DELVES)[0];
    const delveName = tEntity({ kind: 'delve', id: delveId, field: 'name' });
    // Premise per half: the channel resolved a REAL name (non-empty and not a
    // raw-id echo), so the sentence pins below cannot vacuously agree with a
    // production arm that degraded to echoing ids.
    expect(delveName).not.toBe('');
    expect(delveName).not.toBe(delveId);
    expect(reliquarySourceLineText({ kind: 'delve', delveId })).toBe(
      `Found in the delve ${delveName}`,
    );
    const questId = 'q_gravewyrm';
    expect(QUESTS[questId], 'content premise: the quest is live').toBeDefined();
    const questTitle = tEntity({ kind: 'quest', id: questId, field: 'title' });
    expect(questTitle).not.toBe('');
    expect(questTitle).not.toBe(questId);
    expect(reliquarySourceLineText({ kind: 'quest', questId })).toBe(
      `Reward from the quest ${questTitle}`,
    );
  });

  it('names the Rift rank, the storefront, and each award activity', () => {
    expect(reliquarySourceLineText({ kind: 'rift', rank: 'S' })).toBe(
      'Drops from S-rank Rift clears',
    );
    expect(reliquarySourceLineText({ kind: 'store', storeId: RELIQUARY_STORE_SOURCE_ID })).toBe(
      'Purchased from the WOC Store',
    );
    expect(reliquarySourceLineText({ kind: 'activity', activityId: 'corpse_harvest' })).toBe(
      'Recovered while harvesting creature corpses',
    );
    expect(reliquarySourceLineText({ kind: 'activity', activityId: 'masterwork_craft' })).toBe(
      'Earned by crafting a masterwork',
    );
  });

  it('renders a line for EVERY pinned activity id (the key table cannot drift)', () => {
    // ACTIVITY_SOURCE_KEYS in reliquary_labels.ts hand-maps each pinned
    // activity id to its sentence key. A third id added to
    // RELIQUARY_ACTIVITY_SOURCE_IDS without a key row would pass the
    // membership guard and then render a silent no-line; this loop makes that
    // drift loud at the moment the id list grows.
    for (const activityId of RELIQUARY_ACTIVITY_SOURCE_IDS) {
      expect(reliquarySourceLineText({ kind: 'activity', activityId }), activityId).not.toBe('');
    }
  });

  it('pairs the rare with the zone it camps in, degrading to the surviving half', () => {
    const boss = tEntity({ kind: 'mob', id: 'korzul_the_gravewyrm', field: 'name' });
    const zoneId = ZONES[0].id;
    expect(
      reliquarySourceLineText({ kind: 'bossZone', bossId: 'korzul_the_gravewyrm', zoneId }),
    ).toBe(`Drops from ${boss} in ${zoneDisplayName(zoneId)}`);
    // The composition consumed TWO authored hints, so ONE stale half degrades
    // to the other half's own sentence (never a spliced raw id) rather than
    // deleting a live, renderable door along with the dead one.
    expect(
      reliquarySourceLineText({
        kind: 'bossZone',
        bossId: 'korzul_the_gravewyrm',
        zoneId: 'no_such_zone',
      }),
    ).toBe(`Drops from ${boss}`);
    expect(reliquarySourceLineText({ kind: 'bossZone', bossId: 'gorne_the_dread', zoneId })).toBe(
      `Found in ${zoneDisplayName(zoneId)}`,
    );
    // Only both-stale drops the line entirely.
    expect(
      reliquarySourceLineText({
        kind: 'bossZone',
        bossId: 'gorne_the_dread',
        zoneId: 'no_such_zone',
      }),
    ).toBe('');
  });

  it('drops the line for a fabricated id on every NEW arm too', () => {
    // Same contract as the original five: a stale or invented id renders no
    // line rather than splicing itself into prose.
    expect(reliquarySourceLineText({ kind: 'delve', delveId: 'sunken_nowhere' })).toBe('');
    expect(reliquarySourceLineText({ kind: 'quest', questId: 'q_no_such_quest' })).toBe('');
    // 'C' is a REAL Rift rank that awards no reins, so it is off the source
    // ladder on purpose: ranks never inherit each other's tiers.
    expect(reliquarySourceLineText({ kind: 'rift', rank: 'C' })).toBe('');
    expect(reliquarySourceLineText({ kind: 'rift', rank: 'Z' })).toBe('');
    expect(reliquarySourceLineText({ kind: 'store', storeId: 'some_other_store' })).toBe('');
    expect(reliquarySourceLineText({ kind: 'activity', activityId: 'fishing_derby' })).toBe('');
  });

  it('guards the prototype key on the new Record-backed arms', () => {
    // DELVES and QUESTS are plain Records, so a bare index of a prototype key
    // resolves a truthy Function whose missing fields render as "Object". The
    // activity arm indexes its own key table too, so it takes the same sweep:
    // its membership check runs first, and this is what pins that ordering.
    for (const proto of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(reliquarySourceLineText({ kind: 'delve', delveId: proto }), proto).toBe('');
      expect(reliquarySourceLineText({ kind: 'quest', questId: proto }), proto).toBe('');
      expect(reliquarySourceLineText({ kind: 'activity', activityId: proto }), proto).toBe('');
    }
  });

  it('drops the whole line rather than splice a raw id into prose (every arm)', () => {
    // The entity channels answer the RAW ID for an id they cannot place (the
    // R34 wire contract), so an un-guarded arm would render
    // "Drops from gorne_the_dread in blackrock_hollow" as if it were content.
    // One fabricated id per arm, each asserting the line vanishes entirely.
    expect(reliquarySourceLineText({ kind: 'boss', bossId: 'gorne_the_dread' })).toBe('');
    expect(reliquarySourceLineText({ kind: 'zone', zoneId: 'blackrock_hollow' })).toBe('');
    expect(reliquarySourceLineText({ kind: 'deed', deedId: 'col_no_such_deed' })).toBe('');
    expect(reliquarySourceLineText({ kind: 'vendor', npcId: 'merchant_nobody' })).toBe('');
    // The two-name arm never splices a raw id, and it degrades asymmetrically
    // on purpose: the boss is the relic's AUTHORED door, so a stale page
    // dungeon falls back to the plain boss sentence; a stale boss drops the
    // line outright rather than inventing a dungeon-only door the relic never
    // authored.
    const realBoss = 'korzul_the_gravewyrm';
    const realBossName = tEntity({ kind: 'mob', id: realBoss, field: 'name' });
    const realDungeon = Object.keys(DUNGEONS)[0];
    expect(
      reliquarySourceLineText({
        kind: 'bossDungeon',
        bossId: realBoss,
        dungeonId: 'blackrock_hollow',
      }),
    ).toBe(`Drops from ${realBossName}`);
    expect(
      reliquarySourceLineText({
        kind: 'bossDungeon',
        bossId: 'gorne_the_dread',
        dungeonId: realDungeon,
      }),
    ).toBe('');
    // Premise check: with BOTH real, the same call does produce a line, so the
    // assertions above are testing the guard and not a broken composer.
    expect(
      reliquarySourceLineText({ kind: 'bossDungeon', bossId: realBoss, dungeonId: realDungeon }),
    ).not.toBe('');
  });

  it('resolves every source hint the live catalog actually authors', () => {
    // The other direction: the guards must not be so tight that real authored
    // content goes silent. EVERY line of every hint list in RELIQUARY_PAGES has
    // to produce text, so a multi-door relic cannot hide one dead id behind two
    // live ones.
    let checked = 0;
    for (const page of RELIQUARY_PAGES) {
      for (const relic of page.relics) {
        // Through the ONE resolver implementation, not a re-spelled precedence:
        // the precedence itself has dedicated pins in reliquary_content.test.ts,
        // and a re-spelling here would silently keep testing the old rule if it
        // ever changed.
        for (const plan of reliquarySourceLinePlan(
          reliquaryRelicSource(page, relic),
          page.clearSource,
        )) {
          expect(reliquarySourceLineText(plan), `${page.id} ${JSON.stringify(plan)}`).not.toBe('');
          checked += 1;
        }
      }
    }
    // Premise: the sweep really visited authored content, so a catalog that
    // stopped hinting anything could not pass this vacuously. Exact regime:
    // 260 resolved lines measured today (down one when masterwork:engineering
    // was pended, QA ruling 2026-08-07); update deliberately with authoring.
    expect(checked).toBeGreaterThanOrEqual(260);
  });

  it('reliquarySourceLines drops the stale plan and keeps the live ones around it', () => {
    // The documented partial-stale contract, pinned directly: a plan whose id
    // went stale renders nothing, and the LIVE plans on either side survive.
    // Without this, deleting the empty-line filter would leave every other
    // test green while a stale id painted an empty tt-line and a dangling
    // separator inside the aria fold.
    const liveDelve = Object.keys(DELVES)[0];
    const liveQuest = Object.keys(QUESTS)[0];
    const lines = reliquarySourceLines([
      { kind: 'delve', delveId: liveDelve },
      { kind: 'delve', delveId: 'no_such_delve' },
      { kind: 'quest', questId: liveQuest },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(reliquarySourceLineText({ kind: 'delve', delveId: liveDelve }));
    expect(lines[1]).toBe(reliquarySourceLineText({ kind: 'quest', questId: liveQuest }));
    expect(lines.every((line) => line !== '')).toBe(true);
    // The degenerate arms: no plans and all-stale plans are both the empty
    // answer, which is what lets the painter fall back to cellMissingAria.
    expect(reliquarySourceLines(undefined)).toEqual([]);
    expect(reliquarySourceLines([{ kind: 'delve', delveId: 'no_such_delve' }])).toEqual([]);
  });

  it('reliquarySourceAriaText folds through the locale list formatter', () => {
    // Zero and one line are the identity arms; two-plus go through
    // Intl.ListFormat. The oracle here is an INDEPENDENT ListFormat instance,
    // not the production helper, so the punctuation itself stays under test
    // (an en conjunction list reads "a, b, and c", which no hand-rolled join
    // would produce by accident).
    expect(reliquarySourceAriaText([])).toBe('');
    expect(reliquarySourceAriaText(['only line'])).toBe('only line');
    const oracle = new Intl.ListFormat(languageTag(getLanguage()), {
      style: 'long',
      type: 'conjunction',
    });
    expect(reliquarySourceAriaText(['a', 'b', 'c'])).toBe(oracle.format(['a', 'b', 'c']));
  });
});

describe('fairness: completion never depends on graphics tier', () => {
  it('owned and totals come only from catalog + discovery (no tier param)', () => {
    // The pure core has no graphics-tier input. Pin that the function arity and
    // output stay driven by ownership alone so a future tier gate would fail here.
    expect(buildReliquaryView.length).toBe(1);
    const withItems = buildReliquaryView(
      input({ itemsDiscovered: ownedSet('crypt_helm', 'dl_chest') }),
    );
    const again = buildReliquaryView(
      input({ itemsDiscovered: ownedSet('crypt_helm', 'dl_chest') }),
    );
    expect(withItems.progress).toEqual(again.progress);
    expect(withItems.progress.owned).toBe(2);
    expect(Object.keys(input())).not.toContain('graphicsTier');
  });
});
