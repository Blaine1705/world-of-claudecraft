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

  it('resolves every shipped table entry byte-identically under its own language', () => {
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

  // RELEASE-TIER ONLY. Page NAMES ship for the five non-Latin locales now,
  // because a Latin-script reader can still parse an English proper noun while
  // a CJK or Cyrillic reader cannot. Page DESCS (and the Latin locale tables)
  // are release fill, so desc rows are deliberately excluded here; the release
  // fill widens this to the full manifest.
  it.runIf(process.env.I18N_RELEASE_TIER === '1')(
    'covers every manifest NAME row in all five shipped locale tables',
    () => {
      const nameRows = reliquaryTranslationManifest().filter((row) => row.field === 'name');
      for (const lang of tableLocales()) {
        const table = tables[lang];
        for (const row of nameRows) {
          const value = table[row.id]?.name;
          expect(value !== undefined && value.trim().length > 0, `${lang}.${row.id}.name`).toBe(
            true,
          );
        }
      }
    },
  );
});

describe('the window paints the RESOLVED page name, never the model English', () => {
  // The pure view model keeps `name` as raw catalog English on purpose (it is
  // the id-stable sort/debug field). This is the assertion that the painter
  // resolves from the id instead: a synthetic page whose model name is a
  // sentinel must still render its Japanese fill.
  const SENTINEL = 'ZZ SENTINEL PAGE NAME ZZ';

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

  it('renders the ja_JP fill for a shelf row whose model name is an English sentinel', async () => {
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
    };
    try {
      setLanguage('ja_JP');
      const w = new ReliquaryWindow(deps);
      w.open('conquerors');
      w.render(input, 'pinned-sig');
      const html = el.innerHTML;
      expect(html).toContain('reliquary-page-row');
      expect(html).toContain('虚ろの墓所');
      expect(html).not.toContain(SENTINEL);
    } finally {
      setLanguage('en');
      el.remove();
    }
  });
});
