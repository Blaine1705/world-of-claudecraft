// @vitest-environment jsdom
//
// Unit tests for the Reliquary page name/desc resolver (src/ui/reliquary_i18n.ts):
// English resolution from the live catalog, the unknown-id fallbacks, the
// shipped non-Latin fill tables, and the load-bearing claim that the window
// paints the RESOLVED name rather than the view model's raw catalog English.
// jsdom so the last suite can drive the real ReliquaryWindow over a DOM.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  RELIQUARY_PAGES,
  RELIQUARY_PAGES_BY_ID,
  type ReliquaryPageDef,
} from '../src/sim/content/reliquary';
import { setLanguage } from '../src/ui/i18n';
import {
  ensureReliquaryLocalesLoaded,
  RELIQUARY_LOCALE_LOADERS,
  type ReliquaryLocaleTable,
  reliquaryPageDesc,
  reliquaryPageName,
  reliquaryTranslationManifest,
} from '../src/ui/reliquary_i18n';
import type { ReliquaryViewInput } from '../src/ui/reliquary_view';
import { ReliquaryWindow, type ReliquaryWindowDeps } from '../src/ui/reliquary_window';

describe('reliquary_i18n English resolution', () => {
  it('resolves name and desc from the catalog page def', () => {
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('The Hollow Crypt');
    expect(reliquaryPageDesc('conquerors_hollow_crypt')).toBe(
      'Signature spoils claimed from Morthen and the Hollow Crypt.',
    );
    expect(reliquaryPageName('horizons_titles')).toBe('Titles');
  });

  it('falls back for catalog-unknown ids (content drift)', () => {
    expect(reliquaryPageName('removed_page')).toBe('removed_page');
    expect(reliquaryPageDesc('removed_page')).toBe('');
  });

  it('manifests one row per page name and one per authored desc', () => {
    const manifest = reliquaryTranslationManifest();
    const pageCount = RELIQUARY_PAGES.length;
    const descCount = RELIQUARY_PAGES.filter((p) => p.desc !== undefined).length;
    // Every shipped page authors a desc today, so the two counts match; the
    // manifest still emits the desc row conditionally so a desc-less page added
    // later contributes only its name row instead of an empty-string row.
    // This count is the FILL TRIPWIRE: adding a catalog page must be accompanied
    // by a name row in every shipped locale chunk (the per-locale row count is
    // pinned to the same 28 below), so a new page cannot quietly render English
    // to a CJK or Cyrillic reader.
    expect(pageCount).toBe(28);
    expect(descCount).toBe(28);
    expect(manifest.length).toBe(pageCount + descCount);
    expect(manifest.filter((row) => row.field === 'name').length).toBe(28);
    expect(manifest.filter((row) => row.field === 'desc').length).toBe(28);
    expect(manifest).toContainEqual({
      id: 'conquerors_thunzharr',
      field: 'name',
      source: 'Thunzharr, the Waking Peak',
    });
    for (const row of manifest) expect(row.source.length).toBeGreaterThan(0);
  });
});

describe('reliquary locale chunks (the shipped non-Latin fill)', () => {
  type BaseLocale = keyof typeof RELIQUARY_LOCALE_LOADERS;
  const tables = {} as Record<BaseLocale, ReliquaryLocaleTable>;

  beforeAll(async () => {
    const keys = Object.keys(RELIQUARY_LOCALE_LOADERS) as BaseLocale[];
    await Promise.all(
      keys.map(async (loc) => {
        const loader = RELIQUARY_LOCALE_LOADERS[loc];
        if (loader) tables[loc] = (await loader()).table;
      }),
    );
    // The test-harness mirror of the bootstrap's await-before-paint: every
    // locale the resolver tests switch to must be resident first.
    await Promise.all(keys.map((loc) => ensureReliquaryLocalesLoaded(loc)));
  });

  const tableLocales = (): BaseLocale[] => Object.keys(tables) as BaseLocale[];

  it('carries one chunk per shipped base locale (the five non-Latin scripts)', () => {
    expect(tableLocales().length).toBe(5);
    expect(tableLocales().sort()).toEqual(['ja_JP', 'ko_KR', 'ru_RU', 'zh_CN', 'zh_TW']);
  });

  it('carries only real catalog page ids, and no empty values', () => {
    for (const lang of tableLocales()) {
      // Vacuity floor: an emptied chunk would satisfy every for-loop in this
      // suite silently. One row per catalog page, in every shipped locale.
      expect(Object.keys(tables[lang]).length, `${lang} row count`).toBe(28);
      for (const [id, entry] of Object.entries(tables[lang])) {
        expect(RELIQUARY_PAGES_BY_ID[id], `${lang}.${id} is not a catalog page`).toBeDefined();
        for (const field of ['name', 'desc'] as const) {
          const value = entry[field];
          if (value !== undefined) {
            expect(value.trim().length, `${lang}.${id}.${field} empty`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('keeps every value free of em/en dashes and emoji (these files sit outside the overlay copy-scan exemption)', () => {
    const forbidden =
      /[\u{2013}\u{2014}\u{2015}]|[\u{1F000}-\u{1FAFF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{2600}-\u{27BF}]|\u{FE0F}/u;
    // Prove the guard trips: a regex typo would otherwise make every assertion
    // below pass vacuously. Escape form on purpose, so this file stays clean
    // under the repo copy scan that the regex itself enforces.
    expect(forbidden.test('a\u2014b')).toBe(true);
    expect(forbidden.test('a-b')).toBe(false);
    for (const lang of tableLocales()) {
      for (const [id, entry] of Object.entries(tables[lang])) {
        for (const field of ['name', 'desc'] as const) {
          const value = entry[field];
          if (value !== undefined) {
            expect(forbidden.test(value), `${lang}.${id}.${field}: "${value}"`).toBe(false);
          }
        }
      }
    }
  });

  it('routes resolution through the resident table for every shipped entry', () => {
    // A ROUTING pin, not a value pin: both sides read the same chunk, so this
    // proves reliquaryPageName/Desc consult the resident table for its own
    // language (and never the English fallback) for every shipped row. The
    // values themselves are pinned as literals in the spot checks below.
    try {
      for (const lang of tableLocales()) {
        setLanguage(lang);
        for (const [id, entry] of Object.entries(tables[lang])) {
          if (entry.name !== undefined) {
            expect(reliquaryPageName(id), `${lang}.${id}.name`).toBe(entry.name);
          }
          if (entry.desc !== undefined) {
            expect(reliquaryPageDesc(id), `${lang}.${id}.desc`).toBe(entry.desc);
          }
        }
      }
      // en_CA resolves to the authored English before any table is consulted.
      setLanguage('en_CA');
      expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('The Hollow Crypt');
    } finally {
      setLanguage('en');
    }
  });

  it('reuses the shipped entity and deed strings for the pages that mirror them', () => {
    // Spot checks against the exact strings these pages must not diverge from:
    // the dungeon entity name, the heroic deed's prefix form, and an item-set
    // entity name. A drift here means the museum page and the content it
    // collects disagree in the same client.
    try {
      setLanguage('ja_JP');
      expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('虚ろの墓所');
      expect(reliquaryPageName('professions_masterwork')).toBe('名作ギャラリー');
      setLanguage('ru_RU');
      expect(reliquaryPageName('conquerors_set_deathlord')).toBe('Боевой доспех Владыки Кургана');
      expect(reliquaryPageName('conquerors_nythraxis')).toBe('Рейд Нитраксиса');
      setLanguage('zh_TW');
      expect(reliquaryPageName('conquerors_hollow_crypt_heroic')).toBe('英雄：空洞墓穴');
      setLanguage('ko_KR');
      expect(reliquaryPageName('horizons_titles')).toBe('칭호');
      setLanguage('zh_CN');
      expect(reliquaryPageName('conquerors_thunzharr')).toBe('桑扎尔，觉醒之峰');
    } finally {
      setLanguage('en');
    }
  });

  // Page NAMES ship for the five non-Latin locales now, because a Latin-script
  // reader can still parse an English proper noun while a CJK or Cyrillic reader
  // cannot. That makes NAME coverage a PR-tier contract, not a release-tier one:
  // this arm runs at both tiers so a page added without its five fills reds
  // immediately. Page DESCS (and the Latin locale tables) are release fill, so
  // desc rows are deliberately excluded here; the release fill widens this to the
  // full manifest. Nothing in this file reads I18N_RELEASE_TIER any more, so it is
  // off the release-tier suite list; a release-tier desc arm landing here has to be
  // re-added to all three places that list holds (scripts/lib/gate_steps.mjs, the
  // release-i18n job in ci.yml, and the literal pin in
  // tests/release_i18n_tier_coverage.test.ts).
  it('covers every manifest NAME row in all five shipped locale tables', () => {
    const nameRows = reliquaryTranslationManifest().filter((row) => row.field === 'name');
    for (const lang of tableLocales()) {
      const table = tables[lang];
      for (const row of nameRows) {
        const value = table[row.id]?.name;
        expect(value !== undefined && value.trim().length > 0, `${lang}.${row.id}.name`).toBe(true);
      }
    }
  });
});

describe('the window paints the RESOLVED page name, never the model English', () => {
  // The pure view model keeps `name` as raw catalog English on purpose (it is
  // the id-stable sort/debug field). These are the assertions that the painter
  // resolves from the id instead: a synthetic page whose model name is a
  // sentinel must still render its Japanese fill at EVERY site that shows a page
  // name (shelf row, nearly-complete row on Overview, and the page detail header
  // plus its grid aria label). One render per site, because a single call
  // reaches only one of them.
  const SENTINEL = 'ZZ SENTINEL PAGE NAME ZZ';
  const JA_FILL = '虚ろの墓所'; // the ja_JP fill for conquerors_hollow_crypt

  function fakeWorld(): unknown {
    const empty = new Set<string>();
    return {
      deedStats: { itemsDiscovered: empty },
      reliquaryMarks: empty,
      reliquaryRecent: [],
      reliquaryFirstFind: {},
      ownedMounts: () => [],
      accountCosmetics: { weaponSkinIds: [] },
      deedsEarned: empty,
      reliquaryPageClearCount: () => undefined,
      reliquaryCatalogCompletion: () => ({ owned: 0, total: 1 }),
      reliquaryCuratorRank: () => 0,
      reliquaryPageCompletion: () => undefined,
    };
  }

  // Render the ONE synthetic page (real def, sentinel name) into a real window
  // under ja_JP, with the nav/ownership the caller needs to reach its site.
  async function renderSentinel(overrides: Partial<ReliquaryViewInput>): Promise<string> {
    await ensureReliquaryLocalesLoaded('ja_JP');
    const el = document.createElement('div');
    el.id = 'reliquary-window';
    document.body.appendChild(el);
    const deps: ReliquaryWindowDeps = {
      root: () => el,
      world: () => fakeWorld() as never,
      closeOthers: () => {},
      hideTooltip: () => {},
      consumePeek: () => false,
      captureFocus: () => null,
      restoreFocus: () => {},
      itemIcon: () => '',
      moneyHtml: () => '',
      itemTooltip: () => '',
      attachTooltip: () => {},
    };
    const real = RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt;
    const synthetic: ReliquaryPageDef = { ...real, name: SENTINEL };
    const input: ReliquaryViewInput = {
      pages: [synthetic],
      itemsDiscovered: new Set<string>(),
      marks: new Set<string>(),
      recent: [],
      nav: 'conquerors',
      pageId: null,
      clearCount: () => undefined,
      firstFind: {},
      ownedMounts: new Set<string>(),
      weaponSkins: new Set<string>(),
      deedsEarned: new Set<string>(),
      ...overrides,
    };
    try {
      setLanguage('ja_JP');
      const w = new ReliquaryWindow(deps);
      w.open(input.nav);
      w.render(input, 'pinned-sig');
      return el.innerHTML;
    } finally {
      setLanguage('en');
      el.remove();
    }
  }

  it('renders the ja_JP fill for a shelf row whose model name is an English sentinel', async () => {
    const html = await renderSentinel({});
    expect(html).toContain('reliquary-page-row');
    expect(html).toContain(JA_FILL);
    expect(html).not.toContain(SENTINEL);
  });

  it('renders the ja_JP fill for the Overview nearly-complete row', async () => {
    // Nearly-complete needs at least one owned relic and an incomplete page: own
    // four of the five Hollow Crypt items.
    const html = await renderSentinel({
      nav: 'overview',
      itemsDiscovered: new Set([
        'cryptbone_greaves',
        'cryptbone_helm',
        'cryptbone_pauldrons',
        'greyjaw_hide_boots',
      ]),
    });
    expect(html).toContain('reliquary-nearly-row');
    expect(html).toContain(JA_FILL);
    // Covers the visible row label AND the nearlyJumpAria label in one pass.
    expect(html).not.toContain(SENTINEL);
  });

  it('renders the ja_JP fill in the page-detail title and grid aria label', async () => {
    const html = await renderSentinel({ pageId: 'conquerors_hollow_crypt' });
    expect(html).toContain('reliquary-page-title');
    expect(html).toContain('reliquary-grid');
    expect(html).toContain(JA_FILL);
    // Covers the h3 title AND the gridAria label in one pass.
    expect(html).not.toContain(SENTINEL);
  });
});
