// Reliquary Conqueror catalog integrity: every page source, relic item id, and
// heroic / set membership pin resolves against live content tables. Catalog
// growth is curated (hand lists), never an unbounded auto-scrape of every loot
// row. Update these pins deliberately when product adds a page or unique.
import { describe, expect, it } from 'vitest';
import { DEED_ORDER, DEEDS } from '../src/sim/content/deeds';
import { HEROIC_BOSS_LOOT, NYTHRAXIS_RAID_BOSS_ID } from '../src/sim/content/heroic_loot';
import { MOUNT_KEYS, MOUNTS } from '../src/sim/content/mounts';
import { CRAFT_RING } from '../src/sim/content/professions';
import {
  isCataloguedRelicItem,
  isCataloguedRelicMark,
  RELIQUARY_HEROIC_GEAR,
  RELIQUARY_HORIZON_MOUNTS,
  RELIQUARY_HORIZON_TITLES,
  RELIQUARY_HORIZON_WEAPON_SKINS,
  RELIQUARY_ITEM_TO_PAGES,
  RELIQUARY_MARK_IDS,
  RELIQUARY_MARK_TO_PAGES,
  RELIQUARY_PAGE_ORDER,
  RELIQUARY_PAGES,
  RELIQUARY_PAGES_BY_ID,
  RELIQUARY_PROFESSION_MARKS,
  RELIQUARY_PROFESSION_SPECIMEN_ITEMS,
  RELIQUARY_SET_MEMBERS,
  type ReliquaryPageDef,
} from '../src/sim/content/reliquary';
import { WEAPON_SKIN_LIST, WEAPON_SKINS } from '../src/sim/content/weapon_skins';
import { DELVES, DUNGEONS, ITEMS } from '../src/sim/data';
import { DEED_STAT_KEYS } from '../src/sim/types';

const CONQUEROR_PAGES = RELIQUARY_PAGES.filter((p) => p.shelf === 'conquerors');
const PROFESSION_PAGES = RELIQUARY_PAGES.filter((p) => p.shelf === 'professions');
const HORIZON_PAGES = RELIQUARY_PAGES.filter((p) => p.shelf === 'horizons');

function itemRelicIds(page: ReliquaryPageDef): string[] {
  return page.relics.filter((r) => r.kind === 'item').map((r) => r.itemId);
}

function markRelicIds(page: ReliquaryPageDef): string[] {
  return page.relics.filter((r) => r.kind === 'mark').map((r) => r.markId);
}

/** Mount reins are Horizons-owned; Conqueror heroic pages must not list them. */
function isMountReinsId(itemId: string): boolean {
  return itemId.startsWith('reins_');
}

describe('Reliquary Conqueror catalog structure', () => {
  it('ships Conquerors + Professions + Horizons (full three-shelf product)', () => {
    expect(CONQUEROR_PAGES.length).toBe(22);
    expect(PROFESSION_PAGES.length).toBe(3);
    expect(HORIZON_PAGES.length).toBe(3);
    // Literal: update when product adds a page.
    expect(RELIQUARY_PAGES.length).toBe(28);
    expect(
      RELIQUARY_PAGES.every(
        (p) => p.shelf === 'conquerors' || p.shelf === 'professions' || p.shelf === 'horizons',
      ),
    ).toBe(true);
    expect(HORIZON_PAGES.map((p) => p.id)).toEqual([
      'horizons_mounts',
      'horizons_weapon_skins',
      'horizons_titles',
    ]);
  });

  it('keeps page ids unique and PAGE_ORDER identical to table order', () => {
    const ids = RELIQUARY_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RELIQUARY_PAGE_ORDER).toEqual(ids);
    for (const id of ids) {
      expect(RELIQUARY_PAGES_BY_ID[id]?.id).toBe(id);
    }
  });

  it('absorbs the Phase 1 stub page id with real Hollow Crypt uniques', () => {
    const page = RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt;
    expect(page).toBeDefined();
    expect(page.shelf).toBe('conquerors');
    expect(page.clearSource).toEqual({
      kind: 'dungeon',
      dungeonId: 'hollow_crypt',
      difficulty: 'normal',
    });
    const relics = itemRelicIds(page);
    expect(relics).toContain('cryptbone_helm');
    expect(relics).toContain('gravewoven_bag');
    // boundstone_helm is Sanctum loot; Phase 1 stub placed it on Hollow Crypt.
    expect(relics).not.toContain('boundstone_helm');
    expect(itemRelicIds(RELIQUARY_PAGES_BY_ID.conquerors_gravewyrm_sanctum)).toContain(
      'boundstone_helm',
    );
  });

  it('every page has a non-empty name and at least one relic', () => {
    for (const page of RELIQUARY_PAGES) {
      expect(page.name.length).toBeGreaterThan(0);
      expect(page.relics.length).toBeGreaterThan(0);
    }
  });
});

describe('Reliquary relic item ids resolve in ITEMS', () => {
  it('every item relic id exists in ITEMS', () => {
    const missing: string[] = [];
    for (const page of RELIQUARY_PAGES) {
      for (const relic of page.relics) {
        if (relic.kind !== 'item') continue;
        if (!ITEMS[relic.itemId]) missing.push(`${page.id}:${relic.itemId}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('does not catalog heroic_ variants (base ids already fill via discovery)', () => {
    for (const page of RELIQUARY_PAGES) {
      for (const id of itemRelicIds(page)) {
        expect(id.startsWith('heroic_')).toBe(false);
      }
    }
  });

  it('does not catalog mount reins on Conqueror pages (Horizons owns mounts)', () => {
    for (const page of CONQUEROR_PAGES) {
      for (const id of itemRelicIds(page)) {
        expect(isMountReinsId(id)).toBe(false);
      }
    }
  });

  it('isCataloguedRelicItem matches the item index and rejects junk', () => {
    expect(isCataloguedRelicItem('cryptbone_helm')).toBe(true);
    expect(isCataloguedRelicItem('boundstone_helm')).toBe(true);
    expect(isCataloguedRelicItem('bone_fragments')).toBe(false);
    expect(isCataloguedRelicItem('inert_storm_shard')).toBe(false);
    expect(isCataloguedRelicItem('not_an_item')).toBe(false);
  });
});

describe('Reliquary clear sources map to live content', () => {
  it('dungeon clear sources reference real DUNGEONS ids', () => {
    for (const page of RELIQUARY_PAGES) {
      const src = page.clearSource;
      if (!src || src.kind !== 'dungeon') continue;
      expect(DUNGEONS[src.dungeonId], `${page.id} dungeon ${src.dungeonId}`).toBeDefined();
    }
  });

  it('delve clear sources reference real DELVES ids', () => {
    for (const page of RELIQUARY_PAGES) {
      const src = page.clearSource;
      if (!src || src.kind !== 'delve') continue;
      expect(DELVES[src.delveId], `${page.id} delve ${src.delveId}`).toBeDefined();
    }
  });

  it('deed_stat clear sources reference real DEED_STAT_KEYS', () => {
    for (const page of RELIQUARY_PAGES) {
      const src = page.clearSource;
      if (!src || src.kind !== 'deed_stat') continue;
      expect(DEED_STAT_KEYS).toContain(src.stat);
    }
  });

  it('covers every live five-man / raid final boss dungeon with N+H pages', () => {
    // Final-boss clear keys from deeds FINAL_BOSS_DUNGEONS (public surface: DUNGEONS).
    const required = [
      'hollow_crypt',
      'sunken_bastion',
      'drowned_temple',
      'gravewyrm_sanctum',
      'wildheart_basin',
      'nythraxis_boss_arena',
    ];
    for (const dungeonId of required) {
      const normal = RELIQUARY_PAGES.filter(
        (p) =>
          p.clearSource?.kind === 'dungeon' &&
          p.clearSource.dungeonId === dungeonId &&
          p.clearSource.difficulty === 'normal',
      );
      const heroic = RELIQUARY_PAGES.filter(
        (p) =>
          p.clearSource?.kind === 'dungeon' &&
          p.clearSource.dungeonId === dungeonId &&
          p.clearSource.difficulty === 'heroic',
      );
      expect(normal.length, `normal page for ${dungeonId}`).toBe(1);
      expect(heroic.length, `heroic page for ${dungeonId}`).toBe(1);
    }
  });

  it('covers both live delves and the Thunzharr world boss', () => {
    expect(RELIQUARY_PAGES_BY_ID.conquerors_collapsed_reliquary.clearSource).toEqual({
      kind: 'delve',
      delveId: 'collapsed_reliquary',
    });
    expect(RELIQUARY_PAGES_BY_ID.conquerors_drowned_litany.clearSource).toEqual({
      kind: 'delve',
      delveId: 'drowned_litany',
    });
    expect(RELIQUARY_PAGES_BY_ID.conquerors_thunzharr.clearSource).toEqual({
      kind: 'deed_stat',
      stat: 'thunzharrKills',
    });
  });
});

describe('Reliquary heroic gear pins against HEROIC_BOSS_LOOT', () => {
  const HEROIC_PAGE_BY_BOSS: Record<string, string> = {
    morthen: 'conquerors_hollow_crypt_heroic',
    vael_the_mistcaller: 'conquerors_sunken_bastion_heroic',
    ysolei: 'conquerors_drowned_temple_heroic',
    korzul_the_gravewyrm: 'conquerors_gravewyrm_sanctum_heroic',
    wildheart_high_priest: 'conquerors_wildheart_basin_heroic',
    [NYTHRAXIS_RAID_BOSS_ID]: 'conquerors_nythraxis_heroic',
  };

  it('RELIQUARY_HEROIC_GEAR lists every non-mount HEROIC_BOSS_LOOT id', () => {
    for (const [bossId, entries] of Object.entries(HEROIC_BOSS_LOOT)) {
      const liveIds: string[] = [];
      for (const e of entries) {
        if (typeof e.itemId === 'string' && !isMountReinsId(e.itemId)) liveIds.push(e.itemId);
      }
      const liveGear = [...new Set(liveIds)].sort();
      const authored = [
        ...(RELIQUARY_HEROIC_GEAR[bossId as keyof typeof RELIQUARY_HEROIC_GEAR] ?? []),
      ]
        .slice()
        .sort();
      expect(authored, `heroic gear for ${bossId}`).toEqual(liveGear);
    }
  });

  it('each heroic page relics exactly match RELIQUARY_HEROIC_GEAR for its boss', () => {
    for (const [bossId, pageId] of Object.entries(HEROIC_PAGE_BY_BOSS)) {
      const page = RELIQUARY_PAGES_BY_ID[pageId];
      expect(page, pageId).toBeDefined();
      const gear = RELIQUARY_HEROIC_GEAR[bossId as keyof typeof RELIQUARY_HEROIC_GEAR];
      expect(gear, bossId).toBeDefined();
      if (!page || !gear) continue;
      expect(itemRelicIds(page).sort()).toEqual([...gear].slice().sort());
    }
  });

  it('every HEROIC_BOSS_LOOT boss has a mapped Reliquary heroic page', () => {
    for (const bossId of Object.keys(HEROIC_BOSS_LOOT)) {
      expect(HEROIC_PAGE_BY_BOSS[bossId], `page map for ${bossId}`).toBeDefined();
    }
  });
});

describe('Reliquary set pages pin against col_set_* deeds', () => {
  const SET_PAGE_TO_DEED: Record<keyof typeof RELIQUARY_SET_MEMBERS, string> = {
    deathlord: 'col_set_deathlord',
    wyrmshadow: 'col_set_wyrmshadow',
    necromancers: 'col_set_necromancers',
    crownforged: 'col_set_crownforged',
    nighttalon: 'col_set_nighttalon',
    soulflame: 'col_set_soulflame',
    stormcallers: 'col_set_stormcallers',
  };

  it('set member lists match the collectItems deed triggers exactly', () => {
    for (const [setKey, deedId] of Object.entries(SET_PAGE_TO_DEED)) {
      const deed = DEEDS[deedId];
      expect(deed, deedId).toBeDefined();
      expect(deed.trigger.kind).toBe('collectItems');
      if (deed.trigger.kind !== 'collectItems') continue;
      const deedItems = [...deed.trigger.itemIds].sort();
      const catalogItems = [
        ...RELIQUARY_SET_MEMBERS[setKey as keyof typeof RELIQUARY_SET_MEMBERS],
      ].sort();
      expect(catalogItems, setKey).toEqual(deedItems);
    }
  });

  it('set pages list exactly RELIQUARY_SET_MEMBERS and use clearSource none', () => {
    for (const setKey of Object.keys(
      RELIQUARY_SET_MEMBERS,
    ) as (keyof typeof RELIQUARY_SET_MEMBERS)[]) {
      const pageId = `conquerors_set_${setKey}`;
      const page = RELIQUARY_PAGES_BY_ID[pageId];
      expect(page, pageId).toBeDefined();
      expect(page.clearSource).toEqual({ kind: 'none' });
      expect(itemRelicIds(page).sort()).toEqual([...RELIQUARY_SET_MEMBERS[setKey]].sort());
    }
  });
});

describe('Reliquary curation bounds (no full-table scrape)', () => {
  it('refuses known trash / material ids that appear on boss tables', () => {
    const trash = [
      'bone_fragments',
      'linen_scrap',
      'spider_leg',
      'chipped_tusk',
      'inert_storm_shard',
      'deepfen_pearl',
      'copper',
    ];
    for (const id of trash) {
      expect(isCataloguedRelicItem(id), id).toBe(false);
    }
  });

  it('does not auto-include every uncommon filler from early bosses', () => {
    // Guaranteed green fillers that are not Hollow Crypt brand pieces.
    expect(isCataloguedRelicItem('quilted_trousers')).toBe(false);
    expect(isCataloguedRelicItem('oiled_boots')).toBe(false);
    expect(isCataloguedRelicItem('trollhide_leggings')).toBe(false);
    expect(isCataloguedRelicItem('bloodmane_warleggings')).toBe(false);
  });

  it('item-to-pages index only contains catalogued ids and multi-page fills are intentional', () => {
    // Shared epic set pieces appear on both the source page and the set page.
    const pages = RELIQUARY_ITEM_TO_PAGES.get('deathlord_warplate');
    expect(pages).toBeDefined();
    expect(pages!.length).toBeGreaterThanOrEqual(2);
    expect(pages).toContain('conquerors_gravewyrm_sanctum');
    expect(pages).toContain('conquerors_set_deathlord');
  });
});

describe('Reliquary Thunzharr and delve unique coverage', () => {
  it('Thunzharr page lists every personal epic from the world-boss table', () => {
    const thunzharr = ITEMS; // presence already pinned; table is zone3 content
    void thunzharr;
    const page = RELIQUARY_PAGES_BY_ID.conquerors_thunzharr;
    const relics = itemRelicIds(page).sort();
    expect(relics).toEqual(
      [
        'crownforged_gauntlets',
        'nighttalon_grips',
        'soulflame_gloves',
        'stormcallers_handguards',
        'crownforged_girdle',
        'nighttalon_waistband',
        'soulflame_cord',
        'stormcallers_waistguard',
        'vestments_of_the_waking_grove',
      ].sort(),
    );
    // Poor trophy material stays off the museum.
    expect(relics).not.toContain('inert_storm_shard');
  });

  it('delve pages list signature rare+ uniques only', () => {
    expect(itemRelicIds(RELIQUARY_PAGES_BY_ID.conquerors_collapsed_reliquary).sort()).toEqual(
      ['deacon_reliquary_helm', 'varric_shadow_cowl'].sort(),
    );
    const litany = itemRelicIds(RELIQUARY_PAGES_BY_ID.conquerors_drowned_litany);
    expect(litany).toContain('nhalias_bell_maul');
    expect(litany).toContain('blackwater_vanguard_chest');
    expect(litany).toContain('sister_nhalia_choir_plate');
    // Common delve greens stay off the unique grid.
    expect(litany).not.toContain('reliquary_plate_chest');
    expect(litany).not.toContain('siltguard_helm');
  });
});

describe('Reliquary Professions shelf (Phase 7)', () => {
  it('authors masterwork, field notes, and specimen pages (not empty stubs)', () => {
    expect(PROFESSION_PAGES.map((p) => p.id).sort()).toEqual(
      ['professions_field_notes', 'professions_masterwork', 'professions_specimens'].sort(),
    );
    for (const page of PROFESSION_PAGES) {
      expect(page.relics.length).toBeGreaterThan(0);
      expect(page.clearSource).toEqual({ kind: 'none' });
    }
  });

  it('masterwork page lists first + gear-craft lifetime marks only', () => {
    const page = RELIQUARY_PAGES_BY_ID.professions_masterwork;
    // Literal pin (not self-comparison of the content export).
    expect(markRelicIds(page)).toEqual([
      'masterwork:first',
      'masterwork:weaponcrafting',
      'masterwork:armorcrafting',
      'masterwork:tailoring',
      'masterwork:leatherworking',
      'masterwork:engineering',
    ]);
    expect(RELIQUARY_PROFESSION_MARKS.masterworkFirst).toBe('masterwork:first');
    // Craft suffixes must match live CRAFT_RING ids (call site uses professionId).
    const craftIds = new Set(CRAFT_RING.map((c) => c.id));
    for (const markId of RELIQUARY_PROFESSION_MARKS.masterworkByCraft) {
      const craftId = markId.slice('masterwork:'.length);
      expect(craftIds.has(craftId), markId).toBe(true);
    }
  });

  it('field notes reuse visited gather_event:* namespaces', () => {
    const page = RELIQUARY_PAGES_BY_ID.professions_field_notes;
    // Literal pin matches deed visit marks (col_pristine_vein etc.).
    expect(markRelicIds(page)).toEqual([
      'gather_event:pristine_vein',
      'gather_event:ancient_heartwood',
      'gather_event:moonlit_bloom',
      'gather_event:perfect_specimen',
    ]);
    expect([...RELIQUARY_PROFESSION_MARKS.fieldNotes]).toEqual(markRelicIds(page));
  });

  it('specimen page item ids all exist in ITEMS and match the curated export', () => {
    const page = RELIQUARY_PAGES_BY_ID.professions_specimens;
    // Literal pin (not only self-comparison of the content export).
    expect(itemRelicIds(page)).toEqual([
      'pristine_hide',
      'pristine_silk',
      'pristine_venom_gland',
      'prime_cut',
      'fine_thorium_ore',
      'fine_elderwood_log',
      'fine_sunpetal_herb',
    ]);
    expect([...RELIQUARY_PROFESSION_SPECIMEN_ITEMS]).toEqual(itemRelicIds(page));
    for (const id of itemRelicIds(page)) {
      expect(ITEMS[id], id).toBeDefined();
      expect(isCataloguedRelicItem(id)).toBe(true);
    }
  });

  it('RELIQUARY_MARK_IDS is derived from pages and indexes mark pages', () => {
    expect(RELIQUARY_MARK_IDS.size).toBeGreaterThan(0);
    for (const markId of RELIQUARY_MARK_IDS) {
      expect(isCataloguedRelicMark(markId)).toBe(true);
      expect(RELIQUARY_MARK_TO_PAGES.get(markId)?.length).toBeGreaterThan(0);
    }
    // Unknown ids never land in the allowlist.
    expect(isCataloguedRelicMark('not_a_mark')).toBe(false);
    expect(isCataloguedRelicMark('masterwork:cooking')).toBe(false);
    expect(RELIQUARY_MARK_IDS.has('gather_event:pristine_vein')).toBe(true);
    expect(RELIQUARY_MARK_IDS.has('masterwork:first')).toBe(true);
  });
});

describe('Reliquary Horizons shelf (Phase 8)', () => {
  it('authors non-empty Horizons pages with only mount / skin / title relics', () => {
    for (const page of HORIZON_PAGES) {
      expect(page.relics.length).toBeGreaterThan(0);
      expect(page.clearSource).toEqual({ kind: 'none' });
      for (const relic of page.relics) {
        expect(['mount', 'weapon_skin', 'title']).toContain(relic.kind);
      }
    }
  });

  it('mount page lists every live mount key exactly once (hand list = MOUNT_KEYS)', () => {
    const page = RELIQUARY_PAGES_BY_ID.horizons_mounts;
    const ids = page.relics.filter((r) => r.kind === 'mount').map((r) => r.mountId);
    expect(ids).toEqual([...RELIQUARY_HORIZON_MOUNTS]);
    expect([...ids].sort()).toEqual([...MOUNT_KEYS].sort());
    for (const id of ids) {
      expect(MOUNTS[id as keyof typeof MOUNTS], id).toBeDefined();
    }
    // No duplicate slots.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('weapon skin page lists every live Armory skin exactly once', () => {
    const page = RELIQUARY_PAGES_BY_ID.horizons_weapon_skins;
    const ids = page.relics.filter((r) => r.kind === 'weapon_skin').map((r) => r.skinId);
    expect(ids).toEqual([...RELIQUARY_HORIZON_WEAPON_SKINS]);
    const live = WEAPON_SKIN_LIST.map((s) => s.id).sort();
    expect([...ids].sort()).toEqual(live);
    for (const id of ids) {
      expect(WEAPON_SKINS[id], id).toBeDefined();
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('title page lists every deed with a title reward and only those', () => {
    const page = RELIQUARY_PAGES_BY_ID.horizons_titles;
    const ids = page.relics.filter((r) => r.kind === 'title').map((r) => r.deedId);
    expect(ids).toEqual([...RELIQUARY_HORIZON_TITLES]);
    const liveTitles = DEED_ORDER.filter((id) => DEEDS[id].reward?.kind === 'title');
    expect([...ids].sort()).toEqual([...liveTitles].sort());
    for (const id of ids) {
      expect(DEEDS[id], id).toBeDefined();
      expect(DEEDS[id].reward?.kind).toBe('title');
    }
    // Border-only curator rank 5 is not a title relic.
    expect(ids).not.toContain('col_reliquary_rank_5');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not place mount reins as item relics on any page', () => {
    for (const page of RELIQUARY_PAGES) {
      for (const id of itemRelicIds(page)) {
        expect(isMountReinsId(id), `${page.id}:${id}`).toBe(false);
      }
    }
  });
});
