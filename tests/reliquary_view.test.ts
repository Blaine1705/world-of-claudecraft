// Unit tests for The Reliquary pure view-core (src/ui/reliquary_view.ts):
// empty state, progress totals, curator rank, recent newest-first, nearly-
// complete ranking, shelf nav counts, page grids, unlock/Illumination plan,
// and the refresh signature (including ownershipDigest).
import { describe, expect, it } from 'vitest';
import type { ReliquaryPageDef } from '../src/sim/content/reliquary';
import {
  buildReliquaryPageCells,
  buildReliquaryUnlockPlan,
  buildReliquaryView,
  isReliquaryNavId,
  RELIQUARY_NAV,
  RELIQUARY_NEARLY_MAX,
  type ReliquaryViewInput,
  reliquaryMarkFindKey,
  reliquaryOwnershipDigest,
  reliquaryRecentSig,
  reliquaryRefreshSig,
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
    // Recent still lists the id (presentation); ownership stays authoritative.
    expect(model.recent).toEqual([{ id: 'crypt_helm', kind: 'item' }]);
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
    expect(model.recent).toEqual([{ id: 'mw_a', kind: 'mark' }]);
  });

  it('tags non-catalog non-mark ids as unknown', () => {
    const model = buildReliquaryView(input({ recent: ['garbage_id'] }));
    expect(model.recent).toEqual([{ id: 'garbage_id', kind: 'unknown' }]);
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
    ];
    const model = buildReliquaryView(
      input({
        pages,
        nav: 'horizons',
        pageId: 'horiz_skins',
      }),
    );
    expect(model.pageDetail?.accountScoped).toBe(true);
    expect(model.pageDetail?.cells[0]?.owned).toBe(false);
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

  it('reliquaryRecentSig preserves order and joins with unit separator', () => {
    expect(reliquaryRecentSig(['a', 'b'])).toBe('a\u0001b');
    expect(reliquaryRecentSig(['a', 'b'])).not.toBe(reliquaryRecentSig(['b', 'a']));
    expect(reliquaryRecentSig([])).toBe('');
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
