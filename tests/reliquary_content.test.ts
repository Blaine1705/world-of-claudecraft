// Reliquary Conqueror catalog integrity: every page source, relic item id, and
// heroic / set membership pin resolves against live content tables. The
// CATALOG stays curated (hand lists in content/reliquary.ts, never an
// unbounded auto-scrape), while this suite DERIVES its expectations from the
// live loot / deed tables so a content change reds until the curator decides.
// Update the literal floors and totals deliberately when product adds content.
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/sim/content/classes';
import { DEED_ORDER, DEEDS } from '../src/sim/content/deeds';
import { drownedLitanyChestItemsForTier } from '../src/sim/content/delves/drowned_litany_loot';
import { delveChestItemsForTier } from '../src/sim/content/delves/lockpick_tiers';
import { DELVE_SHOPS } from '../src/sim/content/delves/shop';
import { HEROIC_BOSS_LOOT, NYTHRAXIS_RAID_BOSS_ID } from '../src/sim/content/heroic_loot';
import { MOUNT_KEYS, MOUNTS } from '../src/sim/content/mounts';
import { CRAFT_RING, HARVEST_COMPONENT_SPECIMENS } from '../src/sim/content/professions';
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
import { DELVES, DUNGEONS, ITEMS, MOBS } from '../src/sim/data';
import type { LootTier } from '../src/sim/lockpick';
import { catalogCharacterCompletion, catalogRelicCompletion } from '../src/sim/reliquary';
import { Rng } from '../src/sim/rng';
import { DEED_STAT_KEYS, type ItemDef, type PlayerClass } from '../src/sim/types';

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

// Classifies EVERY live quality (`satisfies` pins the union): a new ItemDef
// quality tier fails tsc here until the curator sorts it museum-in or out.
const RARE_PLUS_BY_QUALITY = {
  poor: false,
  common: false,
  uncommon: false,
  rare: true,
  epic: true,
  legendary: true,
} satisfies Record<NonNullable<ItemDef['quality']>, boolean>;
const RARE_PLUS_QUALITIES = new Set(
  Object.entries(RARE_PLUS_BY_QUALITY)
    .filter(([, rarePlus]) => rarePlus)
    .map(([quality]) => quality),
);

/** Rare-or-better by live ITEMS quality (missing or unknown ids never are). */
function isRarePlus(itemId: string): boolean {
  const item = ITEMS[itemId];
  return item !== undefined && RARE_PLUS_QUALITIES.has(item.quality ?? 'common');
}

/**
 * Every mob a dungeon can field: DungeonDef.spawns[].mobId plus each reached
 * mob's boss-summoned adds (MobTemplate.summonAdds), followed recursively
 * with a visited set so chained summons stay bounded. Summoned adds drop
 * through the same MobTemplate.loot seam as spawned mobs, so the museum
 * derivations below must reach them too.
 */
function dungeonMobIds(dungeonId: string): string[] {
  const dungeon = DUNGEONS[dungeonId];
  expect(dungeon, dungeonId).toBeDefined();
  const visited = new Set<string>();
  const queue = dungeon.spawns.map((s) => s.mobId);
  while (queue.length > 0) {
    const mobId = queue.pop();
    if (mobId === undefined || visited.has(mobId)) continue;
    visited.add(mobId);
    const mob = MOBS[mobId];
    expect(mob, `${dungeonId} reaches unknown mob ${mobId}`).toBeDefined();
    if (mob?.summonAdds) queue.push(mob.summonAdds.mobId);
  }
  return [...visited];
}

/** Item ids a dungeon's ground objects (DungeonDef.objects) yield on
 *  interaction; templateId rows are door/exit portals, never loot. */
function dungeonObjectItemIds(dungeonId: string): string[] {
  const objects = DUNGEONS[dungeonId].objects ?? [];
  return objects.filter((o) => o.templateId === undefined && o.itemId !== '').map((o) => o.itemId);
}

/**
 * Rare+ drop ids a dungeon can actually yield. The seam: DUNGEONS (data.ts
 * merge of DUNGEON_DEFS + TEMPLE_DUNGEON_DEFS + WILDHEART_DUNGEON_DEFS)
 * reaches its mobs through dungeonMobIds (spawns plus summoned adds), loot
 * hangs off MobTemplate.loot (src/sim/types.ts), never the DungeonDef itself,
 * and ground objects contribute their interaction yield. Filler falls out by
 * live ITEMS quality, not hand-listing.
 */
function dungeonRarePlusLootIds(dungeonId: string): string[] {
  const ids = new Set<string>();
  for (const mobId of dungeonMobIds(dungeonId)) {
    for (const entry of MOBS[mobId]?.loot ?? []) {
      if (entry.itemId !== undefined && isRarePlus(entry.itemId)) ids.add(entry.itemId);
    }
  }
  for (const itemId of dungeonObjectItemIds(dungeonId)) {
    if (isRarePlus(itemId)) ids.add(itemId);
  }
  return [...ids].sort();
}

/** Every item id a dungeon's mobs (summoned adds included) or ground objects
 *  can yield, any quality. */
function dungeonLootIdsAnyQuality(dungeonId: string): Set<string> {
  const ids = new Set<string>();
  for (const mobId of dungeonMobIds(dungeonId)) {
    for (const entry of MOBS[mobId]?.loot ?? []) {
      if (entry.itemId !== undefined) ids.add(entry.itemId);
    }
  }
  for (const itemId of dungeonObjectItemIds(dungeonId)) ids.add(itemId);
  return ids;
}

/**
 * Rng whose chance() answers follow a fixed script and whose every OTHER draw
 * fails loudly. Both delve chest functions draw at most two chance() rolls
 * per call and nothing else; this class ENFORCES that premise instead of
 * assuming it: a chance() past the script end throws (a third draw can never
 * silently read as false), and any non-chance draw (range/int/pick) funnels
 * through next(), where the observer seam (src/sim/rng.ts setObserver) throws
 * before the call could fall through to the real seeded stream and let the
 * enumeration silently under-derive a page.
 */
class ScriptedRng extends Rng {
  private readonly script: readonly boolean[];
  private cursor = 0;
  constructor(script: readonly boolean[]) {
    super(1);
    this.script = script;
    this.setObserver(() => {
      throw new Error('ScriptedRng: non-chance rng draw (range/int/pick) in a chest function');
    });
  }
  override chance(_p: number): boolean {
    const answer = this.script[this.cursor];
    if (answer === undefined) {
      throw new Error(
        `ScriptedRng: chance() draw ${this.cursor + 1} runs past the ${this.script.length}-draw script`,
      );
    }
    this.cursor += 1;
    return answer;
  }
}

const CHANCE_SCRIPTS: readonly (readonly boolean[])[] = [
  [false, false],
  [false, true],
  [true, false],
  [true, true],
];

type ChestFn = (
  tier: LootTier,
  cls: PlayerClass,
  rng: Rng,
  bountiful?: boolean,
) => { itemId: string; count: number }[];

// Keys typed against the live union: a new LootTier fails tsc here until the
// enumeration below covers it.
const LOOT_TIERS = Object.keys({
  premium: true,
  medium: true,
  low: true,
} satisfies Record<LootTier, true>) as LootTier[];

/** All item ids a delve chest function can emit, enumerated behaviorally over
 *  every tier, class, bountiful arm, and chance-draw script. */
function reachableChestItemIds(chest: ChestFn): Set<string> {
  const ids = new Set<string>();
  const classes = Object.keys(CLASSES) as PlayerClass[];
  for (const tier of LOOT_TIERS) {
    for (const cls of classes) {
      for (const bountiful of [false, true]) {
        for (const script of CHANCE_SCRIPTS) {
          for (const drop of chest(tier, cls, new ScriptedRng(script), bountiful)) {
            ids.add(drop.itemId);
          }
        }
      }
    }
  }
  return ids;
}

/**
 * Rare+ museum candidates for a delve: chest-reachable ids plus the delve's
 * Marks stock, minus crafted gathering tools (ItemDef.kind 'tool'): tool rows
 * are profession-ladder equipment sold for Marks, not delve spoils.
 */
function delveRarePlusIds(chest: ChestFn, delveId: string): string[] {
  const ids = reachableChestItemIds(chest);
  for (const entry of DELVE_SHOPS[delveId] ?? []) ids.add(entry.itemId);
  return [...ids].filter((id) => isRarePlus(id) && ITEMS[id]?.kind !== 'tool').sort();
}

/**
 * Delve to chest-function pairing plus each delve's snug vacuity floor
 * (literal floors: update when catalog content lands). The delve equality
 * test iterates ALL of Object.keys(DELVES) through this map, so a new delve
 * reds there until it is wired here.
 */
const CHEST_FN_BY_DELVE: Record<string, { chest: ChestFn; floor: number }> = {
  collapsed_reliquary: { chest: delveChestItemsForTier, floor: 2 },
  drowned_litany: { chest: drownedLitanyChestItemsForTier, floor: 8 },
};

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

  it('pins the catalog totals through the production completion math', () => {
    // Full-ownership fixture through the real completion functions. Scope:
    // this pin covers catalog CONTENT drift (the de-duped relic totals) and
    // the total math, including the character-side skin subtraction. It does
    // NOT see per-surface wiring: one shared allOwned lookup answers all five
    // surfaces, so a crossed surface lookup would count identically here. The
    // per-surface arms are pinned in tests/reliquary_state.test.ts
    // ('pageCompletion owns mounts / skins / titles from live seams only' and
    // 'catalogRelicCompletion counts Horizons fills for Overview totals').
    const allOwned = { has: () => true };
    const full = catalogRelicCompletion({
      itemsDiscovered: allOwned,
      marks: allOwned,
      ownedMounts: allOwned,
      weaponSkins: allOwned,
      deedsEarned: allOwned,
    });
    // Literal: update when catalog content lands.
    expect(full).toEqual({ owned: 216, total: 216 });
    const character = catalogCharacterCompletion({
      itemsDiscovered: allOwned,
      marks: allOwned,
      ownedMounts: allOwned,
      deedsEarned: allOwned,
    });
    // Literal: update when catalog content lands.
    expect(character).toEqual({ owned: 187, total: 187 });
  });

  it('keeps every page single-kind (the emit path depends on it)', () => {
    // Structural, not cosmetic. emitReliquaryUnlock (src/sim/reliquary.ts)
    // decides Illumination from characterReliquaryOwnership, which deliberately
    // omits account weapon skins: the server cannot answer account cosmetics
    // from inside the sim. That is only safe while a page holds ONE relic kind,
    // because an item or mark fill can then only ever reach item or mark pages,
    // never a skin page whose ownership the emit path cannot see. A mixed page
    // would illuminate inconsistently online (window says complete, emit does
    // not, or the reverse), so it must not ship silently: land the account
    // cosmetic surface on the emit path first, then relax this.
    for (const page of RELIQUARY_PAGES) {
      const kinds = new Set(page.relics.map((r) => r.kind));
      expect(kinds.size, `${page.id} mixes relic kinds: ${[...kinds].sort().join(', ')}`).toBe(1);
    }
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
  // World-drop leveling kits stay out of Conquerors (rationale next to
  // RELIQUARY_SET_MEMBERS in content/reliquary.ts): they are world-drop haste
  // kits, not instance spoils, so they get no set page.
  const LEVELING_KIT_DEEDS = [
    'col_set_vale_arcanist',
    'col_set_boundstone_vanguard',
    'col_set_greyjaw_stalker',
  ];

  it('every non-kit col_set_* deed maps to exactly one set page with matching members', () => {
    const setDeedIds = Object.keys(DEEDS).filter((id) => id.startsWith('col_set_'));
    // Literal: update when catalog content lands (snug floor: 3 kits + 7 sets).
    expect(setDeedIds.length).toBeGreaterThanOrEqual(10);
    for (const kitId of LEVELING_KIT_DEEDS) {
      // The exclusion list must stay real deed ids, and excluded kits page-less.
      expect(setDeedIds, kitId).toContain(kitId);
      const kitKey = kitId.slice('col_set_'.length);
      expect(RELIQUARY_PAGES_BY_ID[`conquerors_set_${kitKey}`], kitId).toBeUndefined();
    }
    const pagedDeedIds = setDeedIds.filter((id) => !LEVELING_KIT_DEEDS.includes(id));
    for (const deedId of pagedDeedIds) {
      const setKey = deedId.slice('col_set_'.length);
      const page = RELIQUARY_PAGES_BY_ID[`conquerors_set_${setKey}`];
      expect(page, `col_set deed ${deedId} needs a conquerors_set_${setKey} page`).toBeDefined();
      const deed = DEEDS[deedId];
      expect(deed.trigger.kind, deedId).toBe('collectItems');
      if (!page || deed.trigger.kind !== 'collectItems') continue;
      const deedItems = [...deed.trigger.itemIds].sort();
      // Load-bearing pin: page == deed. A members == deed restatement adds
      // nothing: the page is BUILT from RELIQUARY_SET_MEMBERS
      // (content/reliquary.ts) and the next test pins page == members.
      expect(itemRelicIds(page).sort(), deedId).toEqual(deedItems);
    }
    // Bidirectional: every authored set key has its live col_set_* deed.
    for (const setKey of Object.keys(RELIQUARY_SET_MEMBERS)) {
      expect(pagedDeedIds, setKey).toContain(`col_set_${setKey}`);
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
  it('Thunzharr page equals the world-boss rare+ personal loot (live zone3 table)', () => {
    const boss = MOBS.thunzharr_waking_peak;
    expect(boss).toBeDefined();
    expect(boss.worldBoss).toBe(true);
    // The personal epics live in two exclusive roll groups (at most one gear
    // drop per kill); the guaranteed storm trophy is groupless filler.
    const groups = [
      ...new Set(boss.loot.map((e) => e.rollGroup).filter((g): g is string => g !== undefined)),
    ].sort();
    expect(groups).toEqual(['thunzharr_t2', 'thunzharr_t2_belt']);
    const derived = [
      ...new Set(
        boss.loot
          .map((e) => e.itemId)
          .filter((id): id is string => id !== undefined && isRarePlus(id)),
      ),
    ].sort();
    // Literal: update when catalog content lands (snug vacuity floor).
    expect(derived.length).toBeGreaterThanOrEqual(9);
    const page = RELIQUARY_PAGES_BY_ID.conquerors_thunzharr;
    expect(itemRelicIds(page).sort()).toEqual(derived);
    // Every rare+ entry sits in a roll group; the poor trophy does not, and it
    // stays off the museum by item quality, not hand-listing.
    for (const entry of boss.loot) {
      if (entry.itemId !== undefined && isRarePlus(entry.itemId)) {
        expect(entry.rollGroup, entry.itemId).toBeDefined();
      }
    }
    expect(ITEMS.inert_storm_shard?.quality).toBe('poor');
    expect(boss.loot.some((e) => e.itemId === 'inert_storm_shard')).toBe(true);
    expect(itemRelicIds(page)).not.toContain('inert_storm_shard');
  });

  it('every delve page equals its live rare+ chest and Marks-stock ids', () => {
    // EQUALITY regime, table-driven: the loop walks ALL live DELVES through
    // CHEST_FN_BY_DELVE, so a new delve reds here until it is wired to its
    // chest function and its page lists exactly the derived rare+ set.
    for (const delveId of Object.keys(DELVES)) {
      const wired = CHEST_FN_BY_DELVE[delveId];
      expect(wired, `CHEST_FN_BY_DELVE has no entry for delve ${delveId}`).toBeDefined();
      if (!wired) continue;
      const page = RELIQUARY_PAGES.find(
        (p) => p.clearSource?.kind === 'delve' && p.clearSource.delveId === delveId,
      );
      expect(page, `no Reliquary page clears delve ${delveId}`).toBeDefined();
      if (!page) continue;
      const derived = delveRarePlusIds(wired.chest, delveId);
      expect(derived.length, `${delveId} vacuity floor`).toBeGreaterThanOrEqual(wired.floor);
      expect(itemRelicIds(page).sort(), page.id).toEqual(derived);
    }
  });

  it('Collapsed Reliquary: Marks stock is live and chest staples stay off', () => {
    // The two heroic-gated signature rares reach the page from both the
    // lockpick chest function and the Marks vendor stock (equality above);
    // this arm proves the stock half is really populated today.
    expect(DELVE_SHOPS.collapsed_reliquary.length).toBeGreaterThan(0);
    // Uncommon chest staples stay off the unique grid (quality filter).
    expect(isCataloguedRelicItem('reliquary_plate_chest')).toBe(false);
  });

  it('Drowned Litany: tool exclusion stays live and near-misses stay off', () => {
    // The equality above holds after one data-driven exclusion: crafted
    // gathering tools (ItemDef.kind 'tool') on the Marks counter are
    // profession-ladder rows, not Litany spoils, so delveRarePlusIds filters
    // them by kind. This arm proves the shop really stocks rare+ tools today.
    expect(
      DELVE_SHOPS.drowned_litany.some(
        (e) => ITEMS[e.itemId]?.kind === 'tool' && isRarePlus(e.itemId),
      ),
    ).toBe(true);
    const litany = itemRelicIds(RELIQUARY_PAGES_BY_ID.conquerors_drowned_litany);
    // Common delve greens stay off the unique grid.
    expect(litany).not.toContain('siltguard_helm');
    // Known near-miss: nhalias_dirgeblade drops from the OPEN-WORLD zone2
    // rare sister_nhalia, not the Drowned Litany finale; it stays off.
    expect(litany).not.toContain('nhalias_dirgeblade');
  });
});

// EQUALITY regime for all five: each page lists exactly the union of its
// dungeon's reachable rare+ drops (spawned mobs, their summoned adds, and
// ground-object yields; see dungeonRarePlusLootIds for the seam). Heroic-only
// epics live on the heroic pages via HEROIC_BOSS_LOOT, pinned in their own
// describe. Floors are snug vacuity guards. Literal: update when catalog
// content lands. Module scope so the growth sweep can assert this map plus
// hollow_crypt covers every dungeon that has rare+ loot.
const EQUALITY_PAGES: Record<string, { pageId: string; floor: number }> = {
  sunken_bastion: { pageId: 'conquerors_sunken_bastion', floor: 8 },
  drowned_temple: { pageId: 'conquerors_drowned_temple', floor: 5 },
  gravewyrm_sanctum: { pageId: 'conquerors_gravewyrm_sanctum', floor: 31 },
  wildheart_basin: { pageId: 'conquerors_wildheart_basin', floor: 4 },
  nythraxis_boss_arena: { pageId: 'conquerors_nythraxis', floor: 16 },
};

describe('Reliquary dungeon and raid pages derive from live mob loot', () => {
  it('normal dungeon and raid pages equal their live rare+ mob drops', () => {
    for (const [dungeonId, { pageId, floor }] of Object.entries(EQUALITY_PAGES)) {
      const derived = dungeonRarePlusLootIds(dungeonId);
      expect(derived.length, `${dungeonId} vacuity floor`).toBeGreaterThanOrEqual(floor);
      expect(itemRelicIds(RELIQUARY_PAGES_BY_ID[pageId]).sort(), pageId).toEqual(derived);
    }
  });

  it('Hollow Crypt: rare+ equality plus four curated uncommon brand pieces', () => {
    // SUBSET regime with explicit inclusions: the entry dungeon's only rare+
    // drop is the gravewoven_bag, so the page adds the four uncommon Crypt
    // brand pieces as deliberate curation. Both halves pin against live loot.
    const page = RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt;
    const pageIds = itemRelicIds(page);
    const derived = dungeonRarePlusLootIds('hollow_crypt');
    // Literal: update when catalog content lands (snug vacuity floor).
    expect(derived.length).toBeGreaterThanOrEqual(1);
    expect(pageIds.filter((id) => isRarePlus(id)).sort()).toEqual(derived);
    const CURATED_UNCOMMON = [
      'cryptbone_greaves',
      'cryptbone_helm',
      'cryptbone_pauldrons',
      'greyjaw_hide_boots',
    ];
    expect(pageIds.filter((id) => !isRarePlus(id)).sort()).toEqual([...CURATED_UNCOMMON].sort());
    // Every page id, curated uncommons included, is a real Crypt drop.
    const live = dungeonLootIdsAnyQuality('hollow_crypt');
    for (const id of pageIds) {
      expect(live.has(id), `${id} is not dropped in hollow_crypt`).toBe(true);
    }
  });
});

describe('Reliquary growth sweeps (new content must page or opt out)', () => {
  it('every dungeon whose mobs carry rare+ loot maps to a normal-difficulty page', () => {
    // No exclusions today: add a `dungeonId: 'rationale'` row here only when a
    // dungeon's rare+ drops deliberately stay out of the museum.
    const EXCLUDED_DUNGEONS: Record<string, string> = {};
    const pageByDungeon = new Map<string, string>();
    for (const page of RELIQUARY_PAGES) {
      const src = page.clearSource;
      if (src?.kind === 'dungeon' && src.difficulty === 'normal') {
        pageByDungeon.set(src.dungeonId, page.id);
      }
    }
    const withRarePlus = Object.keys(DUNGEONS).filter(
      (id) => dungeonRarePlusLootIds(id).length > 0,
    );
    // Literal: update when catalog content lands (snug vacuity floor).
    expect(withRarePlus.length).toBeGreaterThanOrEqual(6);
    // Contents-pin completeness: a dungeon with rare+ loot must sit under an
    // equality regime, EQUALITY_PAGES (exact pin), hollow_crypt's curated
    // subset test, or an explicit EXCLUDED_DUNGEONS opt-out; a NEW rare+
    // dungeon reds here until the curator picks one, so its page can never
    // pass on mere existence without a contents pin.
    expect([...withRarePlus].sort()).toEqual(
      [...Object.keys(EQUALITY_PAGES), 'hollow_crypt', ...Object.keys(EXCLUDED_DUNGEONS)].sort(),
    );
    for (const dungeonId of withRarePlus) {
      if (EXCLUDED_DUNGEONS[dungeonId] !== undefined) continue;
      expect(
        pageByDungeon.get(dungeonId),
        `dungeon ${dungeonId} has rare+ loot but no Reliquary page`,
      ).toBeDefined();
    }
  });

  it('every live delve has a page (clearSource delve linkage)', () => {
    const pageByDelve = new Map<string, string>();
    for (const page of RELIQUARY_PAGES) {
      const src = page.clearSource;
      if (src?.kind === 'delve') pageByDelve.set(src.delveId, page.id);
    }
    const delveIds = Object.keys(DELVES);
    // Literal: update when catalog content lands (snug vacuity floor).
    expect(delveIds.length).toBeGreaterThanOrEqual(2);
    for (const delveId of delveIds) {
      expect(pageByDelve.get(delveId), `delve ${delveId} has no Reliquary page`).toBeDefined();
    }
  });

  it('every worldBoss mob maps to a page (a new world boss must be paged)', () => {
    // Hand map on purpose: a world-boss page reads a deed_stat counter, not a
    // dungeon or delve clearSource, so the linkage cannot be derived from the
    // pages; a NEW worldBoss: true mob reds here until it is paged and mapped.
    const WORLD_BOSS_PAGES: Record<string, string> = {
      thunzharr_waking_peak: 'conquerors_thunzharr',
    };
    const bossIds = Object.values(MOBS)
      .filter((m) => m.worldBoss === true)
      .map((m) => m.id);
    // Keeps the worldBoss filter arm live (the repo's only world boss today).
    expect(bossIds).toContain('thunzharr_waking_peak');
    for (const bossId of bossIds) {
      const pageId = WORLD_BOSS_PAGES[bossId];
      expect(pageId, `world boss ${bossId} has no Reliquary page`).toBeDefined();
      expect(RELIQUARY_PAGES_BY_ID[pageId], pageId).toBeDefined();
    }
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
      'pristine_claw',
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

  it('every corpse-harvest specimen family has its slot on the specimen page', () => {
    // Bidirectional guard against concurrent-content drift: PR 2905 added the
    // claw family on the release side while this branch curated the page, and
    // the literal pin above alone could not red on the union. A new
    // HARVEST_COMPONENT_SPECIMENS family now fails here until its jackpot item
    // is added to RELIQUARY_PROFESSION_SPECIMEN_ITEMS.
    const specimenIds = new Set<string>(RELIQUARY_PROFESSION_SPECIMEN_ITEMS);
    for (const [family, itemId] of Object.entries(HARVEST_COMPONENT_SPECIMENS)) {
      expect(specimenIds.has(itemId), `harvest family '${family}' (${itemId})`).toBe(true);
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

  it('title page lists every non-hidden deed with a title reward and only those', () => {
    const page = RELIQUARY_PAGES_BY_ID.horizons_titles;
    const ids = page.relics.filter((r) => r.kind === 'title').map((r) => r.deedId);
    expect(ids).toEqual([...RELIQUARY_HORIZON_TITLES]);
    // Bidirectional: the hand list is exactly the live non-hidden title rewards, so a new
    // title deed must be added here and a hidden one can never silently re-enter.
    const liveTitles = DEED_ORDER.filter(
      (id) => DEEDS[id].reward?.kind === 'title' && !DEEDS[id].hidden,
    );
    expect([...ids].sort()).toEqual([...liveTitles].sort());
    for (const id of ids) {
      expect(DEEDS[id], id).toBeDefined();
      expect(DEEDS[id].reward?.kind).toBe('title');
      expect(DEEDS[id].hidden, id).toBeFalsy();
    }
    // Hidden deeds stay out of the Reliquary entirely (no masked slots); the Book of Deeds
    // is their home. Anchored on a real hidden title deed so the filter arm above is proven
    // live: this reds if hid_saul_footnote is re-listed OR loses its `hidden` flag.
    const hiddenTitles = DEED_ORDER.filter(
      (id) => DEEDS[id].reward?.kind === 'title' && DEEDS[id].hidden,
    );
    expect(hiddenTitles).toContain('hid_saul_footnote');
    for (const id of hiddenTitles) {
      expect(ids, id).not.toContain(id);
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

describe('Reliquary vs character creation', () => {
  it('no class starter kit item is a catalogued relic', () => {
    // sim.addPlayer runs seedItemDiscovery for EVERY join, creation included,
    // and the seed walks all held items with {retro: true}: a catalogued
    // starter item would enter every brand-new character's Reliquary silently
    // (no toast, no clears, retro provenance) on day one. Starter kits and
    // the catalog must stay disjoint; a page that wants a starter id must
    // instead decide what creation-time credit should look like.
    const classIds = Object.keys(CLASSES);
    expect(classIds.length).toBeGreaterThan(0);
    // startOffhand is optional per class, so it has no per-class truthy guard;
    // this keeps the field name itself live (a rename would skip that arm).
    expect(Object.values(CLASSES).some((def) => def.startOffhand)).toBe(true);
    for (const classId of classIds) {
      const def = CLASSES[classId as keyof typeof CLASSES];
      // Field liveness: a ClassDef rename would otherwise turn this loop
      // vacuous (undefined ids skip the assertion).
      expect(def.startWeapon, `${classId} startWeapon`).toBeTruthy();
      expect(def.startChest, `${classId} startChest`).toBeTruthy();
      const kit = [
        def.startWeapon,
        def.startChest,
        ...(def.startOffhand ? [def.startOffhand] : []),
        ...def.startItems.map((s) => s.itemId),
      ];
      for (const itemId of kit) {
        expect(isCataloguedRelicItem(itemId), `${classId} starter ${itemId}`).toBe(false);
      }
    }
  });
});
