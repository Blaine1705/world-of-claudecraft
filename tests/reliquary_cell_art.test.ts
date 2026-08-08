// @vitest-environment happy-dom
//
// Per-kind owned-cell art for The Reliquary (src/ui/reliquary_cell_art.ts plus
// the thin ReliquaryWindow consumer). Before this module every non-item relic
// resolved through knownItemIconHtml with a NON-item id, so mounts, weapon
// skins, titles, and profession marks all painted the procedural UNKNOWN_RECIPE
// ghost. The acceptance pin is the catalog sweep below: no catalogued relic
// ghosts.
//
// The literal arms name the exact art each kind must reach, derived from typed
// literals rather than from a second call to the code under test, so a resolver
// that silently changed families would redden instead of agreeing with itself.
// The negative arms prove the membership guards: a junk id must return null
// (the caller's stale-client fallback) rather than mint a URL to a 404.
//
// happy-dom ships no 2D canvas, so nothing here may depend on compositing one.
// It does not need to: every art path these tests assert resolves to a static
// URL or an authored data URL, and icons.ts short-circuits both before the
// canvas. The procedural crest fall-back is asserted at the DESCRIPTOR level
// (the crest id), which is where the decision actually lives.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import { MOUNTS } from '../src/sim/content/mounts';
import {
  FIELD_NOTE_PROFESSIONS,
  RELIQUARY_HORIZON_TITLES,
  RELIQUARY_PAGES,
  type ReliquaryRelicDef,
} from '../src/sim/content/reliquary';
import { WEAPON_SKINS } from '../src/sim/content/weapon_skins';
import { ITEMS } from '../src/sim/data';
import { mountItemId } from '../src/sim/mounts';
import {
  deedImageUrl,
  iconDataUrl,
  isUnknownIconRecipe,
  itemIconRecipe,
  needsIconDataUrlWarm,
} from '../src/ui/icons';
import {
  RELIQUARY_SPECIMEN_GLYPH_ID,
  RELIQUARY_SPECIMEN_GLYPH_URL,
  type ReliquaryArtSlot,
  reliquaryCellArt,
} from '../src/ui/reliquary_cell_art';
import { ReliquaryWindow, type ReliquaryWindowDeps } from '../src/ui/reliquary_window';
import { knownItemIconHtml } from '../src/ui/unknown_item_icon';

const REPO_ROOT = join(__dirname, '..');

/** The slot id of one catalog relic, whatever its kind. */
function slotId(relic: ReliquaryRelicDef): string {
  if (relic.kind === 'item') return relic.itemId;
  if (relic.kind === 'mark') return relic.markId;
  if (relic.kind === 'mount') return relic.mountId;
  if (relic.kind === 'weapon_skin') return relic.skinId;
  return relic.deedId;
}

/** Every relic on every page, as the slot pair both art surfaces hand in. */
const CATALOG_SLOTS: ReliquaryArtSlot[] = RELIQUARY_PAGES.flatMap((page) =>
  page.relics.map((relic) => ({ kind: relic.kind, id: slotId(relic) })),
);

// ---------------------------------------------------------------------------
// 1. Catalog sweep (the acceptance pin)
// ---------------------------------------------------------------------------

describe('catalog coverage', () => {
  it('sweeps a real, non-empty slice of the catalog (anti-vacuity)', () => {
    // A page table that stopped loading, or a slotId() that returned '' for
    // every row, would make the coverage pin below assert over nothing.
    expect(CATALOG_SLOTS.length).toBeGreaterThan(200);
    expect(CATALOG_SLOTS.every((slot) => slot.id !== '')).toBe(true);
    // All five authored kinds are really in the sweep, so the coverage pin is
    // not carried by the item shelves alone.
    expect([...new Set(CATALOG_SLOTS.map((slot) => slot.kind))].sort()).toEqual([
      'item',
      'mark',
      'mount',
      'title',
      'weapon_skin',
    ]);
  });

  it('resolves art for EVERY relic on EVERY page (no ghost for a catalogued relic)', () => {
    const ghosted = CATALOG_SLOTS.filter((slot) => reliquaryCellArt(slot) === null).map(
      (slot) => `${slot.kind}:${slot.id}`,
    );
    expect(ghosted, `catalogued relics with no art:\n${ghosted.join('\n')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Literal per-kind pins
// ---------------------------------------------------------------------------

describe('mount relics resolve their reins item', () => {
  it('routes a named mount to its reins ItemDef, not the mount key', () => {
    // The premise, so a renamed reins item fails loudly here rather than
    // quietly making the expectation trivially true.
    const reins = ITEMS.reins_terrorspark_groundshaker;
    expect(reins?.kind, 'content premise: the reins are a mount item').toBe('mount');
    expect(reins?.kind === 'mount' ? reins.mount : null).toBe('terrorspark_groundshaker');
    expect(reliquaryCellArt({ kind: 'mount', id: 'terrorspark_groundshaker' })).toEqual({
      kind: 'item',
      itemId: 'reins_terrorspark_groundshaker',
    });
    expect(reliquaryCellArt({ kind: 'mount', id: 'valorsteed' })).toEqual({
      kind: 'item',
      itemId: 'reins_valorsteed',
    });
  });

  it('lands every catalog mount on committed reins art', () => {
    for (const key of Object.keys(MOUNTS)) {
      const art = reliquaryCellArt({ kind: 'mount', id: key });
      expect(art, key).toEqual({ kind: 'item', itemId: `reins_${key}` });
    }
  });

  it('keeps every mount rarity in agreement with its reins item quality', () => {
    // The cell frame and tooltip take their rung from MOUNTS[key].rarity while
    // the icon img (via deps.itemIcon) takes its rung from the reins
    // ItemDef.quality. Nothing structural forces the two content tables to
    // agree, so a content edit to one side would paint an icon rung that
    // disagrees with its own cell frame; this pin makes that a red instead.
    for (const [key, def] of Object.entries(MOUNTS)) {
      const reinsId = mountItemId(key);
      expect(reinsId, key).not.toBeNull();
      const reins = ITEMS[reinsId as string];
      // Assert the def exists before comparing: the `?? 'common'` fallback
      // below matches common defs that omit quality, and must never stand in
      // for a deleted reins item on the one common-rarity mount.
      expect(reins, key).toBeDefined();
      expect(reins?.quality ?? 'common', key).toBe(def.rarity);
    }
  });
});

describe('weapon skin relics resolve the Armory thumbnail', () => {
  it('routes a named skin to its store thumbnail URL', () => {
    expect(WEAPON_SKINS.brasscap_axe, 'content premise: brasscap_axe is a live skin').toBeDefined();
    expect(reliquaryCellArt({ kind: 'weapon_skin', id: 'brasscap_axe' })).toEqual({
      kind: 'url',
      url: '/ui/store/armory/brasscap_axe.webp',
    });
    expect(reliquaryCellArt({ kind: 'weapon_skin', id: 'ashspark_dagger' })).toEqual({
      kind: 'url',
      url: '/ui/store/armory/ashspark_dagger.webp',
    });
  });
});

describe('title relics resolve the deed crest', () => {
  it('routes a PAINTED title deed to its own crest', () => {
    expect(deedImageUrl('deed_prog_veteran'), 'content premise: prog_veteran ships crest art').toBe(
      '/ui/deeds/prog_veteran.webp',
    );
    expect(reliquaryCellArt({ kind: 'title', id: 'prog_veteran' })).toEqual({
      kind: 'crest',
      crestId: 'deed_prog_veteran',
    });
  });

  it('routes a crest-PENDING title deed to its display-category crest, never the ghost', () => {
    // The premise both halves rest on: the deed is catalogued on the titles
    // page, sits in the collection category, and has no committed crest art.
    expect(RELIQUARY_HORIZON_TITLES).toContain('col_reliquary_rank_2');
    expect(DEEDS.col_reliquary_rank_2?.category).toBe('collection');
    expect(deedImageUrl('deed_col_reliquary_rank_2')).toBeNull();
    const art = reliquaryCellArt({ kind: 'title', id: 'col_reliquary_rank_2' });
    expect(art).toEqual({ kind: 'crest', crestId: 'deed_cat_collection' });
    // Explicitly NOT the per-deed crest id, which would resolve to nothing.
    expect(art).not.toEqual({ kind: 'crest', crestId: 'deed_col_reliquary_rank_2' });
  });

  it('answers for every crest-pending title on the shelf', () => {
    // DERIVED, not hardcoded: whichever titles have no committed crest art
    // today must still paint their category crest (a null here is a ghosted
    // title shelf). Deriving keeps the arm self-maintaining when the
    // commissioned art lands; if EVERY title crest ever ships, the arm
    // legitimately retires and the floor below should move to the painted arm.
    const pending = RELIQUARY_HORIZON_TITLES.filter((id) => deedImageUrl(`deed_${id}`) === null);
    expect(pending.length, 'floor: the category-crest tier still has producers').toBeGreaterThan(0);
    // Today's premise (2026-08-08): the three curator-rank bridges plus four
    // pvp titles, 7 rows. Count-pinned loosely so ONE painted crest landing
    // does not red this file, while a mass change still asks for a look.
    expect(pending.length).toBeLessThanOrEqual(7);
    for (const id of pending) {
      const category = DEEDS[id]?.category;
      expect(category, `${id} premise: a catalogued title deed`).toBeDefined();
      expect(reliquaryCellArt({ kind: 'title', id }), id).toEqual({
        kind: 'crest',
        crestId: `deed_cat_${category}`,
      });
    }
  });
});

describe('profession mark relics resolve the profession sheet', () => {
  it('routes the lifetime first-masterwork mark to the seal', () => {
    expect(reliquaryCellArt({ kind: 'mark', id: 'masterwork:first' })).toEqual({
      kind: 'url',
      url: '/ui/professions/masterwork_seal.webp',
    });
  });

  it('routes a per-craft masterwork mark to that craft art', () => {
    expect(reliquaryCellArt({ kind: 'mark', id: 'masterwork:weaponcrafting' })).toEqual({
      kind: 'url',
      url: '/ui/professions/prof_weaponcrafting.webp',
    });
    expect(reliquaryCellArt({ kind: 'mark', id: 'masterwork:leatherworking' })).toEqual({
      kind: 'url',
      url: '/ui/professions/prof_leatherworking.webp',
    });
  });

  it('routes each rare field note to the gathering profession that works its node', () => {
    // The pairing is the catalog's (FIELD_NOTE_PROFESSIONS); asserted here as a
    // premise so a content change to the map cannot silently redirect the art.
    // The map is frozen at the source (it now escapes its module and rides the
    // client bundle); pin the freeze so a refactor cannot quietly drop it.
    expect(Object.isFrozen(FIELD_NOTE_PROFESSIONS)).toBe(true);
    expect(FIELD_NOTE_PROFESSIONS['gather_event:pristine_vein']).toBe('mining');
    expect(reliquaryCellArt({ kind: 'mark', id: 'gather_event:pristine_vein' })).toEqual({
      kind: 'url',
      url: '/ui/professions/gather_mining.webp',
    });
    expect(reliquaryCellArt({ kind: 'mark', id: 'gather_event:ancient_heartwood' })).toEqual({
      kind: 'url',
      url: '/ui/professions/gather_logging.webp',
    });
    expect(reliquaryCellArt({ kind: 'mark', id: 'gather_event:moonlit_bloom' })).toEqual({
      kind: 'url',
      url: '/ui/professions/gather_herbalism.webp',
    });
  });
});

describe('the corpse-harvest specimen glyph', () => {
  const SPECIMEN_ID = 'gather_event:perfect_specimen';
  // sha256 of the full data URL; re-pin here on a deliberate art edit.
  const SPECIMEN_GLYPH_SHA256 = 'd8f1dd69de9efa193f5bf1131184abd7b8c09d873c5447df8de682f399e02091';

  it('is the authored SVG, not a borrowed profession image', () => {
    // The premise the whole glyph exists for: this mark belongs to no gathering
    // profession, so the catalog map has no entry to borrow art from.
    expect(FIELD_NOTE_PROFESSIONS[SPECIMEN_ID]).toBeUndefined();
    const art = reliquaryCellArt({ kind: 'mark', id: SPECIMEN_ID });
    expect(art).toEqual({ kind: 'url', url: RELIQUARY_SPECIMEN_GLYPH_URL });
    // Literal shape pins, so a re-encoding or a swapped glyph reddens.
    expect(RELIQUARY_SPECIMEN_GLYPH_URL.startsWith('data:image/svg+xml,')).toBe(true);
    expect(RELIQUARY_SPECIMEN_GLYPH_URL).toContain('woc-specimen-glyph');
    expect(RELIQUARY_SPECIMEN_GLYPH_ID).toBe('woc-specimen-glyph');
    // Byte pin on the authored art itself (the equality above compares the
    // constant to its own import, which cannot see a redraw). To update after
    // a deliberate art edit, re-pin this digest in the same commit.
    expect(createHash('sha256').update(RELIQUARY_SPECIMEN_GLYPH_URL).digest('hex')).toBe(
      SPECIMEN_GLYPH_SHA256,
    );
  });

  it('is NOT the procedural unknown-icon ghost the slot used to get', () => {
    // Both halves of the old behavior, pinned canvas-free: this id ships no
    // static art (so the ghost path had to composite) and the recipe it would
    // have composited IS the shared UNKNOWN_RECIPE fallback.
    expect(needsIconDataUrlWarm('item', SPECIMEN_ID)).toBe(true);
    expect(isUnknownIconRecipe(itemIconRecipe(SPECIMEN_ID))).toBe(true);
    expect(RELIQUARY_SPECIMEN_GLYPH_URL).not.toContain('base64');
  });

  it('percent-encodes to a src the window escaper cannot alter', () => {
    // esc() rewrites & < > " and ', so any of them surviving the encoding would
    // corrupt the src on the way into the attribute.
    expect(RELIQUARY_SPECIMEN_GLYPH_URL).not.toMatch(/[&<>"']/);
    const svg = decodeURIComponent(
      RELIQUARY_SPECIMEN_GLYPH_URL.slice('data:image/svg+xml,'.length),
    );
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // Multi-color painted style, not a flat monochrome vector.
    expect([...svg.matchAll(/#[0-9a-f]{6}/g)].length).toBeGreaterThan(4);
  });
});

// ---------------------------------------------------------------------------
// 3. Negative arms (the membership guards)
// ---------------------------------------------------------------------------

describe('unknown ids fall through to the caller fallback', () => {
  it('returns null for a junk id of every kind', () => {
    const junk: ReliquaryArtSlot[] = [
      { kind: 'item', id: 'not_a_real_item' },
      { kind: 'unknown', id: 'not_a_real_item' },
      { kind: 'mount', id: 'not_a_real_mount' },
      { kind: 'weapon_skin', id: 'not_a_real_skin' },
      { kind: 'title', id: 'not_a_real_deed' },
      { kind: 'mark', id: 'not_a_real_mark' },
      { kind: 'mark', id: 'masterwork:notacraft' },
      { kind: 'mark', id: 'gather_event:nosuchflavor' },
    ];
    for (const slot of junk) {
      expect(reliquaryCellArt(slot), `${slot.kind}:${slot.id}`).toBeNull();
    }
  });

  it('returns null for a prototype key on every table-backed kind (R34)', () => {
    // A bare Record index resolves 'constructor' to a truthy Function, which
    // would send a junk id down the known arm and mint art for nothing.
    for (const id of ['constructor', '__proto__', 'toString']) {
      expect(reliquaryCellArt({ kind: 'item', id }), id).toBeNull();
      expect(reliquaryCellArt({ kind: 'unknown', id }), id).toBeNull();
      expect(reliquaryCellArt({ kind: 'weapon_skin', id }), id).toBeNull();
      expect(reliquaryCellArt({ kind: 'title', id }), id).toBeNull();
      expect(reliquaryCellArt({ kind: 'mark', id }), id).toBeNull();
      expect(reliquaryCellArt({ kind: 'mount', id }), id).toBeNull();
    }
  });

  it('preserves the item passthrough for a real item id (behavior unchanged)', () => {
    expect(reliquaryCellArt({ kind: 'item', id: 'cryptbone_helm' })).toEqual({
      kind: 'item',
      itemId: 'cryptbone_helm',
    });
    // The recent ring's wire-shaped kind resolves the same way.
    expect(reliquaryCellArt({ kind: 'unknown', id: 'cryptbone_helm' })).toEqual({
      kind: 'item',
      itemId: 'cryptbone_helm',
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Every URL the resolver can emit names a file that ships
// ---------------------------------------------------------------------------

describe('shipped art files', () => {
  it('backs every catalog-reachable public URL with a committed file', () => {
    const missing: string[] = [];
    const families = new Set<string>();
    for (const slot of CATALOG_SLOTS) {
      const art = reliquaryCellArt(slot);
      if (art === null || art.kind !== 'url' || !art.url.startsWith('/')) continue;
      families.add(art.url.slice(0, art.url.lastIndexOf('/')));
      if (!existsSync(join(REPO_ROOT, 'public', art.url.slice(1)))) missing.push(art.url);
    }
    // Anti-vacuity: both URL families the catalog reaches are really swept, so
    // a resolver that stopped emitting URLs could not pass by emitting none.
    expect([...families].sort()).toEqual(['/ui/professions', '/ui/store/armory']);
    expect(missing, `art URLs with no committed file:\n${missing.join('\n')}`).toEqual([]);
  });

  it('backs the item and crest families with committed files too', () => {
    // Those two do not carry a URL in the descriptor: the item arm goes through
    // the shared itemIcon painter and the crest arm through iconDataUrl, so the
    // file check follows the same resolvers the window uses.
    const reins = reliquaryCellArt({ kind: 'mount', id: 'terrorspark_groundshaker' });
    expect(reins?.kind).toBe('item');
    const reinsUrl = iconDataUrl('item', 'reins_terrorspark_groundshaker');
    expect(reinsUrl).toBe('/ui/items/reins_terrorspark_groundshaker.webp');
    expect(existsSync(join(REPO_ROOT, 'public', reinsUrl.slice(1)))).toBe(true);

    const crest = reliquaryCellArt({ kind: 'title', id: 'prog_veteran' });
    expect(crest).toEqual({ kind: 'crest', crestId: 'deed_prog_veteran' });
    const crestUrl = iconDataUrl('crest', 'deed_prog_veteran');
    expect(crestUrl).toBe('/ui/deeds/prog_veteran.webp');
    expect(existsSync(join(REPO_ROOT, 'public', crestUrl.slice(1)))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. The window paints the descriptor into the class the grid CSS needs
// ---------------------------------------------------------------------------

interface ArtRig {
  el: HTMLElement;
  window: ReliquaryWindow;
}

function makeRig(seed: { recent?: string[]; marks?: string[] } = {}): ArtRig {
  const recent = seed.recent ?? [];
  const marks = new Set(seed.marks ?? []);
  const el = document.createElement('div');
  el.id = 'reliquary-window';
  document.body.appendChild(el);
  const opener = document.createElement('button');
  document.body.appendChild(opener);

  const deps: ReliquaryWindowDeps = {
    root: () => el,
    world: () =>
      ({
        cfg: { playerClass: 'warrior' },
        player: { name: 'Artwright' },
        deedStats: { itemsDiscovered: new Set<string>() },
        reliquaryMarks: marks,
        reliquaryRecent: recent,
        reliquaryFirstFind: {},
        ownedMounts: () => [],
        accountCosmetics: { weaponSkinIds: [] as string[] },
        deedsEarned: new Map<string, string>(),
        reliquaryPageClearCount: () => undefined,
        reliquaryCatalogCompletion: () => ({ owned: 0, total: CATALOG_SLOTS.length }),
        reliquaryCuratorRank: () => 0,
        reliquaryPageCompletion: (pageId: string) => {
          const page = RELIQUARY_PAGES.find((p) => p.id === pageId);
          if (!page) return null;
          return { owned: 0, total: page.relics.length, complete: false };
        },
      }) as never,
    closeOthers: () => {},
    hideTooltip: () => {},
    consumePeek: () => false,
    captureFocus: () => opener,
    restoreFocus: () => {},
    onPinChanged: () => {},
    // The production body verbatim (Hud.itemIcon is `knownItemIconHtml(item)`,
    // pinned below), so the markup these tests read is the markup a player gets.
    itemIcon: (item) => knownItemIconHtml(item),
    moneyHtml: () => '',
    itemTooltip: (item) => `<div data-item-tooltip="${item.id}"></div>`,
    attachTooltip: () => {},
  };
  return { el, window: new ReliquaryWindow(deps) };
}

/** Open the window and navigate to one page, the way a player clicks in. */
function openPage(rig: ArtRig, nav: 'horizons' | 'professions', pageId: string): void {
  rig.window.open(nav);
  const row = rig.el.querySelector<HTMLElement>(`[data-page="${pageId}"]`);
  if (!row) throw new Error(`contract: the ${nav} shelf lists ${pageId}`);
  row.click();
}

/** The one grid cell for a relic id, and the img inside it. */
function cellArt(rig: ArtRig, relicId: string): HTMLImageElement {
  const cell = rig.el.querySelector<HTMLElement>(`.reliquary-cell[data-cell-id="${relicId}"]`);
  if (!cell) throw new Error(`contract: the open page paints a cell for ${relicId}`);
  const img = cell.querySelector<HTMLImageElement>('.reliquary-cell-art img');
  if (!img) throw new Error(`contract: the ${relicId} cell paints art`);
  return img;
}

describe('ReliquaryWindow cell markup', () => {
  it('keeps the deps.itemIcon stub honest against the real Hud body', () => {
    // Anti-drift for the rig above: if Hud stops delegating to
    // knownItemIconHtml, the mount assertions below stop describing production.
    // Comment-stripped, so prose quoting the body cannot satisfy the pin.
    const hud = readFileSync(join(REPO_ROOT, 'src/ui/hud.ts'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .map((line) => line.replace(/\s\/\/.*$/, ''))
      .join('\n');
    expect(hud).toMatch(
      /private itemIcon\(item: ItemDef\): string \{\s*return knownItemIconHtml\(item\);/,
    );
  });

  it('paints a mount cell as the reins art in the item-icon shape', () => {
    const rig = makeRig();
    openPage(rig, 'horizons', 'horizons_mounts');
    const img = cellArt(rig, 'terrorspark_groundshaker');
    // The class is load-bearing: .reliquary-cell-art .item-icon is what sizes
    // the art to 70% and what the missing state silhouettes.
    expect(img.getAttribute('class')).toBe('item-icon q-epic');
    expect(img.getAttribute('src')).toBe('/ui/items/reins_terrorspark_groundshaker.webp');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('draggable')).toBe('false');
    // The CELL frame's rung comes from cellQuality's mountDef arm (the img's
    // comes from the reins ItemDef); deleting that arm frames q-common.
    const cell = rig.el.querySelector<HTMLElement>(
      '.reliquary-cell[data-cell-id="terrorspark_groundshaker"]',
    );
    expect(cell?.className, 'cell frame rung').toContain('q-epic');
  });

  it('paints a profession mark cell as the profession art', () => {
    const rig = makeRig();
    openPage(rig, 'professions', 'professions_masterwork');
    const seal = cellArt(rig, 'masterwork:first');
    expect(seal.getAttribute('class')).toBe('item-icon q-epic');
    expect(seal.getAttribute('src')).toBe('/ui/professions/masterwork_seal.webp');
    const craft = cellArt(rig, 'masterwork:weaponcrafting');
    expect(craft.getAttribute('src')).toBe('/ui/professions/prof_weaponcrafting.webp');
  });

  it('paints the corpse-harvest specimen cell as the authored glyph', () => {
    const rig = makeRig();
    openPage(rig, 'professions', 'professions_field_notes');
    const img = cellArt(rig, 'gather_event:perfect_specimen');
    expect(img.getAttribute('class')).toBe('item-icon q-rare');
    expect(img.getAttribute('src')).toBe(RELIQUARY_SPECIMEN_GLYPH_URL);
    // Its neighbour on the same page takes the borrowed profession art, so the
    // glyph is demonstrably specific to this slot and not a page-wide default.
    expect(cellArt(rig, 'gather_event:pristine_vein').getAttribute('src')).toBe(
      '/ui/professions/gather_mining.webp',
    );
  });

  it('paints a painted-crest title cell through the crest branch, no canvas', () => {
    // The one window branch no other arm executes (QA gate should-fix): a
    // mutant reverting the crest arm to the ghost across the 36-cell titles
    // shelf must red here. prog_veteran ships painted crest art, so
    // iconDataUrl short-circuits to the static URL and happy-dom needs no
    // canvas; the category-crest tier composites and stays covered at the
    // descriptor level.
    const rig = makeRig();
    openPage(rig, 'horizons', 'horizons_titles');
    const img = cellArt(rig, 'prog_veteran');
    expect(img.getAttribute('class')).toBe('item-icon q-epic');
    expect(img.getAttribute('src')).toBe('/ui/deeds/prog_veteran.webp');
    // Shelf totality: EVERY title cell paints an art img (which also pins the
    // crestIconSrc never-a-throw swallow explicitly: the 35 category-crest
    // cells composite, happy-dom has no 2D context, and the swallow is what
    // keeps each of them a painted-or-blank img rather than a render throw).
    const cells = rig.el.querySelectorAll('.reliquary-cell').length;
    expect(cells).toBeGreaterThan(30);
    expect(rig.el.querySelectorAll('.reliquary-cell .reliquary-cell-art img').length).toBe(cells);
  });

  it('paints a weapon-skin cell in the exact shape the missing-state carve-out targets', () => {
    // Joins the CSS declaration pin (reliquary_window.test.ts) to real cell
    // output BY CONSTRUCTION: the selector is read out of the live stylesheet,
    // so renaming it in CSS while updating only the declaration pin cannot
    // leave this arm green against a stale literal. The opaque Armory card
    // renders as a black tile whenever this match breaks.
    const componentsCss = readFileSync(join(REPO_ROOT, 'src/styles/components.css'), 'utf8');
    const selectorMatch = componentsCss.match(
      /^\s*(\.[^{}]*data-cell-kind[^{}]*weapon_skin[^{}]*)\{/m,
    );
    if (!selectorMatch) throw new Error('contract: the skin missing-state carve-out rule exists');
    const liveSelector = selectorMatch[1].trim();
    expect(liveSelector).toContain('.reliquary-cell--missing');
    const rig = makeRig();
    openPage(rig, 'horizons', 'horizons_weapon_skins');
    const img = cellArt(rig, 'brasscap_axe');
    expect(img.getAttribute('src')).toBe('/ui/store/armory/brasscap_axe.webp');
    // The rung comes from cellQuality's WEAPON_SKINS arm (brasscap_axe is a
    // guildmark uncommon); deleting that arm paints q-common and reds here.
    expect(img.getAttribute('class')).toBe('item-icon q-uncommon');
    expect(img.matches(liveSelector)).toBe(true);
  });

  it('shares the resolver with the Overview recent strip', () => {
    // The chip and the cell are one implementation (cellIconHtml), so a mark
    // that just landed shows the same profession art in the strip as on its
    // shelf. A mark is the right probe here rather than a mount: the recent
    // ring classifies only item / mark / unknown (reliquary_view buildRecent),
    // so 'mark' is the one non-item kind a chip can actually carry.
    const rig = makeRig({ recent: ['masterwork:first'], marks: ['masterwork:first'] });
    rig.window.open('overview');
    const chip = rig.el.querySelector<HTMLImageElement>('.reliquary-recent-icon img');
    if (!chip) throw new Error('contract: a recent find paints its art in the chip');
    expect(chip.getAttribute('src')).toBe('/ui/professions/masterwork_seal.webp');
    expect(chip.getAttribute('class')).toBe('item-icon q-epic');
    // The same slot on its shelf paints byte-identical art (one resolver).
    openPage(rig, 'professions', 'professions_masterwork');
    expect(cellArt(rig, 'masterwork:first').outerHTML).toBe(chip.outerHTML);
  });
});
