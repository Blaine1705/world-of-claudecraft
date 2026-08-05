// Unit tests for The Reliquary pure view-core (src/ui/reliquary_view.ts):
// empty state, progress totals, curator rank, recent newest-first, nearly-
// complete ranking, shelf nav counts, page stubs, and the refresh signature.
import { describe, expect, it } from 'vitest';
import type { ReliquaryPageDef } from '../src/sim/content/reliquary';
import {
  buildReliquaryView,
  isReliquaryNavId,
  RELIQUARY_NAV,
  RELIQUARY_NEARLY_MAX,
  type ReliquaryViewInput,
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
      total: 9, // unique item relics across conqueror pages (marks/mounts excluded from catalog count)
      fraction: 0,
      curatorRank: 0,
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
});

describe('buildReliquaryView progress and rank', () => {
  it('counts unique item relics for catalog progress', () => {
    const model = buildReliquaryView(
      input({ itemsDiscovered: ownedSet('crypt_helm', 'crypt_blade', 'dl_chest') }),
    );
    expect(model.progress.owned).toBe(3);
    expect(model.progress.total).toBe(9);
    expect(model.progress.fraction).toBeCloseTo(3 / 9, 5);
    // Rank thresholds: 1, 10, 25, 50, 100. Owned 3 => rank 1.
    expect(model.progress.curatorRank).toBe(1);
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

  it('caps the nearly list at the literal five', () => {
    expect(RELIQUARY_NEARLY_MAX).toBe(5);
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

  it('resolves an active page stub', () => {
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

  it('professions and horizons shelves list their stub pages', () => {
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
