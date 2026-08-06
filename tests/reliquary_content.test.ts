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
import {
  CRAFT_RING,
  craftById,
  GATHERING_PROFESSIONS,
  HARVEST_COMPONENT_SPECIMENS,
} from '../src/sim/content/professions';
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
  type ReliquaryRelicDef,
  type ReliquarySourceHint,
  reliquaryRelicSource,
} from '../src/sim/content/reliquary';
import { WEAPON_SKIN_LIST, WEAPON_SKINS } from '../src/sim/content/weapon_skins';
import { ALL_RECIPES, DELVES, DUNGEONS, ITEMS, MOBS, NPCS, QUESTS, ZONES } from '../src/sim/data';
import type { LootTier } from '../src/sim/lockpick';
import { gatherRareEventFlavor } from '../src/sim/professions/gather_events';
import { NODE_HARVEST_TABLE, NODE_MATERIAL_TABLE } from '../src/sim/professions/gathering';
import { MATERIAL_GRADES } from '../src/sim/professions/material_grades';
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

// The chest-function contract is TAKEN from the live signature instead of
// hand-rolled, so a parameter change on delveChestItemsForTier reaches the
// enumeration below as a tsc error rather than a silently unexercised arm.
type ChestFn = typeof delveChestItemsForTier;
// The sibling function must keep that same shape (it is enumerated through the
// same seam): a divergent signature reds tsc here, at the contract.
drownedLitanyChestItemsForTier satisfies ChestFn;

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
    // Hand copy of the module-private FINAL_BOSS_DUNGEONS list in
    // src/sim/deeds.ts (documented there as PINNED as of v1: it never grows).
    // Not derived: a new rare+ dungeon is caught by the growth sweep below,
    // not by this list.
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
    // Bidirectional first: the loop below walks live bosses, so a stale
    // RELIQUARY_HEROIC_GEAR key for a removed boss would sit unnoticed as
    // dead data without this pin.
    expect(Object.keys(RELIQUARY_HEROIC_GEAR).sort()).toEqual(Object.keys(HEROIC_BOSS_LOOT).sort());
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

  // "One" page per deed is structural, not asserted here: the lookup is
  // id-keyed through RELIQUARY_PAGES_BY_ID and global page-id uniqueness has
  // its own pin in the catalog-structure describe.
  it('every non-kit col_set_* deed maps to a set page with matching members', () => {
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
      // Existence guard: a hand-written page cannot bypass the members table.
      expect(
        RELIQUARY_SET_MEMBERS[setKey as keyof typeof RELIQUARY_SET_MEMBERS],
        setKey,
      ).toBeDefined();
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
    // Both epic roll groups are DRAWN every kill (draw-order parity), but
    // rollWorldBossLoot's per-contributor gearWon cap discards a second gear
    // win, so a kill awards AT MOST ONE Tier-2 piece per contributor
    // (src/sim/world_boss.ts); the guaranteed storm trophy is groupless
    // filler and always drops.
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
    // Bidirectional first: the loop below only walks LIVE delves, so a stale
    // row for a deleted delve would sit here unnoticed without this pin.
    expect(Object.keys(CHEST_FN_BY_DELVE).sort()).toEqual(Object.keys(DELVES).sort());
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
    // this arm proves the stock half really carries BOTH signature rares
    // today, not merely that the shop is non-empty, and that each row keeps
    // its heroic gate (the adjective the comment leans on).
    for (const itemId of ['deacon_reliquary_helm', 'varric_shadow_cowl']) {
      const row = DELVE_SHOPS.collapsed_reliquary.find((e) => e.itemId === itemId);
      expect(row, itemId).toBeDefined();
      expect(row?.gate, itemId).toBe('heroicClear');
    }
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

  it('the mob walk really reaches boss-summoned adds', () => {
    // Pins the summonAdds arm as REACHED so the walk cannot silently rot: the
    // arm yields no loot ids today (drowned_thrall has an empty loot table),
    // so the equality pins above would stay green if it stopped being walked.
    const bastionSpawns = DUNGEONS.sunken_bastion.spawns.map((s) => s.mobId);
    expect(bastionSpawns).not.toContain('drowned_thrall');
    expect(MOBS.vael_the_mistcaller.summonAdds?.mobId).toBe('drowned_thrall');
    expect(dungeonMobIds('sunken_bastion')).toContain('drowned_thrall');
  });

  it('the loot walk really reaches dungeon ground objects', () => {
    // Pins the ground-object arm as REACHED for the same reason: the wardstones
    // are quest items (never rare+), so the equality pins above cannot see this
    // arm stop contributing.
    const fromMobs = new Set(
      dungeonMobIds('nythraxis_boss_arena').flatMap((mobId) =>
        (MOBS[mobId]?.loot ?? []).map((entry) => entry.itemId),
      ),
    );
    expect(fromMobs.has('bastion_ward_stone')).toBe(false);
    expect(dungeonObjectItemIds('nythraxis_boss_arena')).toContain('bastion_ward_stone');
    // Premise guard: the derivation skips templateId rows on the stated
    // ground that portals never carry loot. Hold that premise for every live
    // dungeon object, so a future portal-with-loot reds here instead of
    // silently vanishing from the walk. Vacuity floor: at least one portal
    // row must exist for the sweep to be checking anything.
    const portalRows = Object.entries(DUNGEONS).flatMap(([dungeonId, dungeon]) =>
      (dungeon.objects ?? [])
        .filter((o) => o.templateId !== undefined)
        .map((o) => ({ dungeonId, o })),
    );
    expect(portalRows.length).toBeGreaterThanOrEqual(1);
    for (const { dungeonId, o } of portalRows) {
      expect(o.itemId, `${dungeonId} portal object carries loot the walk skips`).toBe('');
    }
  });

  it('the Drowned Temple page desc names both live loot sources', () => {
    // The page pools rare drops from BOTH temple bosses, so the blurb has to
    // name both; derived from the live MOBS names, never a copy of the string.
    const page = RELIQUARY_PAGES_BY_ID.conquerors_drowned_temple;
    expect(page.desc).toBeDefined();
    expect(page.desc).toContain(MOBS.choirmother_selthe.name);
    expect(page.desc).toContain(MOBS.ysolei.name);
  });

  it('page descs that cite a full live boss name stay pinned to it', () => {
    // Same staleness class the Drowned Temple reword fixed (a blurb crediting
    // yesterday's boss list), swept over every page whose desc carries a FULL
    // live mob name (the Drowned Temple pair has its own dedicated test
    // above). Pages using a short form (Olen, Morthen, Ysolei alone, Zulgar
    // alone, "Nythraxis" on the heroic page) are not pinnable against MOBS
    // and stay curated prose.
    const DESC_BOSSES: Record<string, string[]> = {
      conquerors_sunken_bastion: ['vael_the_mistcaller'],
      conquerors_sunken_bastion_heroic: ['vael_the_mistcaller'],
      conquerors_gravewyrm_sanctum: ['korzul_the_gravewyrm'],
      conquerors_gravewyrm_sanctum_heroic: ['korzul_the_gravewyrm'],
      conquerors_wildheart_basin_heroic: ['wildheart_high_priest'],
      conquerors_hollow_crypt_heroic: ['morthen'],
      conquerors_nythraxis: ['nythraxis_scourge_of_thornpeak'],
    };
    for (const [pageId, mobIds] of Object.entries(DESC_BOSSES)) {
      const page = RELIQUARY_PAGES_BY_ID[pageId];
      expect(page, pageId).toBeDefined();
      for (const mobId of mobIds) {
        expect(page.desc, `${pageId} desc names ${mobId}`).toContain(MOBS[mobId].name);
      }
    }
    // Completeness guard: the hand table IS the live set of (page, full-name)
    // pairs, derived here from every page desc against every live MOBS name,
    // so a future desc that starts naming a full boss must land in the table
    // (or the dedicated Drowned Temple test) instead of escaping the sweep.
    const derivedPairs: Record<string, string[]> = {};
    for (const page of RELIQUARY_PAGES) {
      if (!page.desc) continue;
      const named = Object.keys(MOBS)
        .filter((mobId) => page.desc!.includes(MOBS[mobId].name))
        .sort();
      if (named.length > 0) derivedPairs[page.id] = named;
    }
    const expected: Record<string, string[]> = {
      conquerors_drowned_temple: ['choirmother_selthe', 'ysolei'],
      ...Object.fromEntries(
        Object.entries(DESC_BOSSES).map(([pageId, mobIds]) => [pageId, [...mobIds].sort()]),
      ),
    };
    expect(derivedPairs).toEqual(expected);
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
    // Curator rank 5 stays border-only: this pins the REASON it can never
    // enter the title list above (the equality would catch the entry itself,
    // but only this reds if the deed's reward kind flips to a title).
    expect(DEEDS.col_reliquary_rank_5.reward?.kind).toBe('border');
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

// ---------------------------------------------------------------------------
// Source hints: the catalog's answer to "where do I get this?"
// ---------------------------------------------------------------------------

/** The id a relic slot carries, whatever its kind. */
function relicSlotId(relic: ReliquaryRelicDef): string {
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

const ZONE_IDS = new Set(ZONES.map((z) => z.id));
const PROFESSION_SOURCE_IDS = new Set<string>([
  ...Object.keys(GATHERING_PROFESSIONS),
  ...CRAFT_RING.map((c) => c.id),
]);

/**
 * Does an authored sourceId exist in the live table its kind names? The switch
 * is exhaustive with no default, so a new ReliquarySourceKind fails tsc here
 * until its id space is wired, rather than silently validating against nothing.
 *
 * Boss ids are checked by MOBS KEY MEMBERSHIP, never by rank flags: the catalog
 * credits mid-bosses (knight_commander_olen, choirmother_selthe,
 * korgath_the_bound, grand_necromancer_velkhar) that are elite without boss,
 * and named rares (wildheart_beastmaster, ironvein_foreman, marrowlord_varkas),
 * all of which a flag check would wrongly reject.
 */
function sourceIdResolves(hint: ReliquarySourceHint): boolean {
  // Object.hasOwn, not a bare index: production's resolver arms are ownEntry
  // guarded (reliquary_labels), so a prototype-key sourceId ('constructor')
  // must be rejected here too or this helper would validate an id the module
  // it validates refuses to render.
  switch (hint.sourceKind) {
    case 'boss':
      return Object.hasOwn(MOBS, hint.sourceId);
    case 'vendor':
      return Object.hasOwn(NPCS, hint.sourceId);
    case 'zone':
      return ZONE_IDS.has(hint.sourceId);
    case 'profession':
      return PROFESSION_SOURCE_IDS.has(hint.sourceId);
    case 'deed':
      return Object.hasOwn(DEEDS, hint.sourceId);
  }
}

/** Every (page, relic) slot in table order, the shape most checks below walk. */
const RELIC_SLOTS = RELIQUARY_PAGES.flatMap((page) =>
  page.relics.map((relic) => ({ page, relic, slotId: relicSlotId(relic) })),
);

/**
 * Relic SLOTS content does not name one source for, keyed by page so the
 * exemption is per (page, relic) rather than per id. That scoping is
 * load-bearing: several ids sit on two pages, and a bare id key would let one
 * hinted on its boss page but bare on its set page (or the reverse) escape the
 * coverage sweep on the strength of the other page's authoring.
 *
 * Every row is a deliberate, evidenced exclusion awaiting a MAINTAINER RULING,
 * never an authoring gap: authoring any of them would mean inventing an answer
 * the content does not support. The bidirectional pin below holds this table
 * exactly equal to the un-hinted set, so a ruling that lands must delete its
 * row here in the same change.
 */
const SOURCE_PENDING_RULING: Readonly<Record<string, readonly string[]>> = {
  // The first six each sit on two or more comparable live routes with no
  // primary: a trash family (sanctum_boneguard / sanctum_drakonid, 9 spawns
  // each) and a mid-boss or Korzul (1 spawn each) at chances close enough that
  // neither the per-kill rate nor the per-run expectation settles it, PLUS a
  // crafting recipe for boundstone_helm (recipe_ironbound_warplate_helm) and
  // gravewyrm_gauntlets (recipe_forgeguard_bulwark_gauntlets), and a
  // guaranteed q_velkhar class reward for staff_of_velkhar (mage) and
  // shadowmeld_tunic (rogue). wyrmcult_grand_robe is pending for a sharper
  // reason: its two live routes name two DIFFERENT mobs (the guaranteed mage
  // reward of q_gravewyrm, whose kill objective is korzul_the_gravewyrm, vs a
  // korgath_bonus loot row at 0.1), so crediting either one alone would send
  // half its finders to the wrong door.
  conquerors_gravewyrm_sanctum: [
    'boundstone_helm',
    'boundstone_girdle',
    'gravewyrm_mantle',
    'gravewyrm_gauntlets',
    'staff_of_velkhar',
    'shadowmeld_tunic',
    'wyrmcult_grand_robe',
  ],
  // Both rares reach the player from the lockpick chest AND Brother Halven's
  // heroicClear Marks stock: two live routes with no primary.
  conquerors_collapsed_reliquary: ['deacon_reliquary_helm', 'varric_shadow_cowl'],
  // Rite reliquary chest only, which this vocabulary cannot name at all (it is
  // opened by the Rite puzzle in src/sim/delves/drowned_litany_rite.ts, not a
  // boss kill, so it is neither boss, vendor, nor zone). The page's other two
  // relics are Marks-stock only and ARE hinted.
  conquerors_drowned_litany: [
    'nhalias_bell_maul',
    'widow_silk_hood',
    'nhalias_litany_rod',
    'blackwater_vanguard_chest',
    'siltstep_leggings',
    'sunken_reliquary_hood',
  ],
  // The first lifetime masterwork fires on ANY of the five gear crafts, so no
  // single profession id is its source.
  professions_masterwork: [RELIQUARY_PROFESSION_MARKS.masterworkFirst],
  // Corpse harvest belongs to no gathering profession (NODE_HARVEST_TABLE
  // covers ore, wood, and herb nodes only), so its find mark and its jackpots
  // have no profession id to name.
  professions_field_notes: ['gather_event:perfect_specimen'],
  professions_specimens: [
    'pristine_hide',
    'pristine_silk',
    'pristine_venom_gland',
    'prime_cut',
    'pristine_claw',
  ],
  // Both Horizons rulings are PAGE-WIDE rather than per-id, so these two derive
  // from the catalog lists instead of restating them: a new mount or skin joins
  // the same open ruling rather than escaping it. Mounts: every one has several
  // live routes at once (two or three HEROIC_BOSS_LOOT bosses plus Rift
  // progression; vendor plus quest for valorsteed) or none at all
  // (drakemaw_raptor has no acquisition path, terrorspark_groundshaker is
  // dev-grant only). Skins: granted only by Claudium store purchases, an
  // account storefront that is not a boss, zone, profession, deed, or NPC.
  horizons_mounts: RELIQUARY_HORIZON_MOUNTS,
  horizons_weapon_skins: RELIQUARY_HORIZON_WEAPON_SKINS,
};

/** `pageId:slotId` keys, the shape the sweeps below test membership against. */
const PENDING_KEYS = new Set<string>(
  Object.entries(SOURCE_PENDING_RULING).flatMap(([pageId, ids]) =>
    ids.map((id) => `${pageId}:${id}`),
  ),
);

function slotKey(pageId: string, slotId: string): string {
  return `${pageId}:${slotId}`;
}

/** Distinct resolved sources per page. Literal and COMPLETE (all 28 pages), so
 *  partial authoring cannot pass: a page that loses half its hints reds here
 *  even while every surviving hint still validates. Update deliberately with
 *  the authoring, the same regime as the totals pins above. */
const EXPECTED_DISTINCT_SOURCES: Record<string, number> = {
  conquerors_hollow_crypt: 1,
  conquerors_hollow_crypt_heroic: 1,
  conquerors_sunken_bastion: 2,
  conquerors_sunken_bastion_heroic: 1,
  conquerors_drowned_temple: 2,
  conquerors_drowned_temple_heroic: 1,
  conquerors_gravewyrm_sanctum: 4,
  conquerors_gravewyrm_sanctum_heroic: 1,
  conquerors_wildheart_basin: 2,
  conquerors_wildheart_basin_heroic: 1,
  conquerors_nythraxis: 1,
  conquerors_nythraxis_heroic: 1,
  conquerors_thunzharr: 1,
  conquerors_collapsed_reliquary: 0,
  conquerors_drowned_litany: 1,
  conquerors_set_deathlord: 3,
  conquerors_set_wyrmshadow: 3,
  conquerors_set_necromancers: 3,
  conquerors_set_crownforged: 2,
  conquerors_set_nighttalon: 2,
  conquerors_set_soulflame: 2,
  conquerors_set_stormcallers: 2,
  professions_masterwork: 5,
  professions_field_notes: 3,
  professions_specimens: 3,
  horizons_mounts: 0,
  horizons_weapon_skins: 0,
  horizons_titles: 33,
};

/** Pages whose relics provably come from more than one source, so a page-level
 *  default could never be right for them. Named literally (not derived from the
 *  authoring) so under-authoring one of them cannot quietly pass. */
const KNOWN_MULTI_SOURCE_PAGES = [
  // The four dungeons whose relics span two or more of their own bosses.
  'conquerors_sunken_bastion',
  'conquerors_drowned_temple',
  'conquerors_gravewyrm_sanctum',
  'conquerors_wildheart_basin',
  // All SEVEN set pages: members are gathered from across the world, which is
  // the point of a set page (raid, world boss, Sanctum mid-bosses, and for
  // deathlord / necromancers an open-world rare).
  'conquerors_set_deathlord',
  'conquerors_set_wyrmshadow',
  'conquerors_set_necromancers',
  'conquerors_set_crownforged',
  'conquerors_set_nighttalon',
  'conquerors_set_soulflame',
  'conquerors_set_stormcallers',
  // Professions pages span the professions they cover.
  'professions_masterwork',
  'professions_field_notes',
  'professions_specimens',
  // Horizons titles: one deed per title. The other two Horizons pages carry NO
  // authored source at all (both are page-wide pending rulings), which is why
  // they are absent here and pinned at 0 in EXPECTED_DISTINCT_SOURCES instead.
  'horizons_titles',
];

function resolvedSourcesFor(pageId: string): ReliquarySourceHint[] {
  const page = RELIQUARY_PAGES_BY_ID[pageId];
  const out: ReliquarySourceHint[] = [];
  for (const relic of page.relics) {
    const hint = reliquaryRelicSource(page, relic);
    if (hint) out.push(hint);
  }
  return out;
}

function distinctSourceKeys(pageId: string): Set<string> {
  return new Set(resolvedSourcesFor(pageId).map((h) => `${h.sourceKind}:${h.sourceId}`));
}

describe('Reliquary source hints resolve against live content', () => {
  it('every authored sourceId exists in the live table its kind names', () => {
    const offenders: string[] = [];
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const hint = reliquaryRelicSource(page, relic);
      if (hint && !sourceIdResolves(hint)) {
        offenders.push(`${page.id}:${slotId} -> ${hint.sourceKind}:${hint.sourceId}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sourceIdResolves accepts live ids and rejects fabricated ones, per kind', () => {
    // Every arm exercised in both directions, so none can rot into a vacuous
    // `true`. The zone arm has no authored user in the catalog today (no relic
    // is a plain world drop), and this is the only thing keeping it honest for
    // the day one lands.
    const live: ReliquarySourceHint[] = [
      { sourceKind: 'boss', sourceId: 'korzul_the_gravewyrm' },
      { sourceKind: 'vendor', sourceId: 'brother_halven_marsh' },
      { sourceKind: 'zone', sourceId: ZONES[0].id },
      { sourceKind: 'profession', sourceId: 'mining' },
      { sourceKind: 'profession', sourceId: 'weaponcrafting' },
      { sourceKind: 'deed', sourceId: 'col_seven_regalia' },
    ];
    for (const hint of live) {
      expect(sourceIdResolves(hint), `${hint.sourceKind}:${hint.sourceId}`).toBe(true);
    }
    const fabricated: ReliquarySourceHint[] = [
      { sourceKind: 'boss', sourceId: 'not_a_mob' },
      { sourceKind: 'vendor', sourceId: 'not_an_npc' },
      { sourceKind: 'zone', sourceId: 'not_a_zone' },
      { sourceKind: 'profession', sourceId: 'not_a_profession' },
      { sourceKind: 'deed', sourceId: 'not_a_deed' },
    ];
    for (const hint of fabricated) {
      expect(sourceIdResolves(hint), `${hint.sourceKind}:${hint.sourceId}`).toBe(false);
    }
    // Cross-kind guard: a real id from the WRONG table must still be rejected,
    // so the arms cannot be answering from one shared pool.
    expect(sourceIdResolves({ sourceKind: 'boss', sourceId: 'brother_halven_marsh' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'vendor', sourceId: 'korzul_the_gravewyrm' })).toBe(
      false,
    );
    expect(sourceIdResolves({ sourceKind: 'deed', sourceId: 'mining' })).toBe(false);
  });

  it('every boss hint names a mob whose live loot really carries the relic', () => {
    // Existence is not truth: MOBS[sourceId] merely proves the id is a real
    // mob, which a plausible-but-wrong boss would also satisfy. This walks the
    // RESOLVED hint (inherited page defaults included, so the sourceDefault
    // pages are covered too) back to the live loot row that has to justify it,
    // through both award paths: the normal MobTemplate.loot table and the
    // separate HEROIC_BOSS_LOOT table the heroic pages are built from.
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (relic.kind !== 'item' && relic.kind !== 'mark') continue;
      const hint = reliquaryRelicSource(page, relic);
      if (hint?.sourceKind !== 'boss') continue;
      checked += 1;
      const fromLoot = (MOBS[hint.sourceId]?.loot ?? []).some((e) => e.itemId === slotId);
      const heroic = HEROIC_BOSS_LOOT[hint.sourceId as keyof typeof HEROIC_BOSS_LOOT] ?? [];
      const fromHeroic = heroic.some((e) => e.itemId === slotId);
      // A dungeon page that names a difficulty must find the credited drop on
      // THAT difficulty's table: a normal-page relic that only drops on heroic
      // (or vice versa) is a wrong credit even though the union would pass it.
      // Non-dungeon pages (sets, professions) and difficulty-less or 'any'
      // pages span both tables by design.
      const clear = page.clearSource;
      const difficulty = clear?.kind === 'dungeon' ? clear.difficulty : undefined;
      const passes =
        difficulty === 'heroic'
          ? fromHeroic
          : difficulty === 'normal'
            ? fromLoot
            : fromLoot || fromHeroic;
      if (!passes) {
        offenders.push(`${page.id}:${slotId} credits ${hint.sourceId}, which never drops it`);
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: the sweep is worthless if it walked nothing. Literal,
    // matching the authored boss coverage; update deliberately with the
    // authoring, same regime as the totals pins above.
    expect(checked).toBeGreaterThanOrEqual(136);
  });

  it('every vendor hint names an NPC whose live stock really sells the relic', () => {
    // Same truth standard on the vendor arm. Stock is reached the way the game
    // reaches it: a delve's board NPC fronts that delve's DELVE_SHOPS counter.
    const stockByNpc = new Map<string, Set<string>>();
    for (const [delveId, delve] of Object.entries(DELVES)) {
      const stock = stockByNpc.get(delve.boardNpcId) ?? new Set<string>();
      for (const entry of DELVE_SHOPS[delveId] ?? []) stock.add(entry.itemId);
      stockByNpc.set(delve.boardNpcId, stock);
    }
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (relic.kind !== 'item' && relic.kind !== 'mark') continue;
      const hint = reliquaryRelicSource(page, relic);
      if (hint?.sourceKind !== 'vendor') continue;
      checked += 1;
      if (!stockByNpc.get(hint.sourceId)?.has(slotId)) {
        offenders.push(`${page.id}:${slotId} credits ${hint.sourceId}, whose stock lacks it`);
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: the two Drowned Litany Marks-stock rares.
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it('every gathering profession hint names the profession that really awards it', () => {
    // The third truth pin, matching the boss and vendor arms above. Membership
    // in GATHERING_PROFESSIONS only proves the id is a real profession, which a
    // SWAPPED pair (pristine_vein credited to herbalism, moonlit_bloom to
    // mining) satisfies just as well. This derives the answer instead, walking
    // each authored row back to the live tables the source comments name.
    //
    // Field notes: gatherRareEventFlavor maps the node type to the flavor, and
    // NODE_HARVEST_TABLE maps that same node type to the profession that works
    // it. Specimens: MATERIAL_GRADES maps a base material to its fine grade,
    // and NODE_MATERIAL_TABLE says which node type yields that base material.
    // Nothing below restates the authoring; both maps are built from live data.
    const nodeTypes = Object.keys(NODE_HARVEST_TABLE) as (keyof typeof NODE_HARVEST_TABLE)[];
    const expectedBySlotId = new Map<string, string>();
    const conflicts: string[] = [];
    const remember = (slotId: string, professionId: string) => {
      const prior = expectedBySlotId.get(slotId);
      if (prior !== undefined && prior !== professionId) {
        conflicts.push(`${slotId} derives both ${prior} and ${professionId}`);
      }
      expectedBySlotId.set(slotId, professionId);
    };
    for (const nodeType of nodeTypes) {
      const professionId = NODE_HARVEST_TABLE[nodeType].professionId;
      remember(`gather_event:${gatherRareEventFlavor(nodeType)}`, professionId);
      for (const zoneRow of Object.values(NODE_MATERIAL_TABLE[nodeType])) {
        const fineItemId = MATERIAL_GRADES[zoneRow.itemId]?.fineItemId;
        if (fineItemId !== undefined) remember(fineItemId, professionId);
      }
    }
    // A slot deriving two professions would make the comparison below
    // meaningless, so it fails here rather than silently picking the last one.
    expect(conflicts).toEqual([]);
    // Premise guard: the derivation really reached both families and every
    // node type, so a table that stopped contributing cannot leave this test
    // quietly comparing nothing.
    expect(nodeTypes.length).toBe(3);
    expect(expectedBySlotId.get('gather_event:pristine_vein')).toBeDefined();
    expect(expectedBySlotId.get('fine_thorium_ore')).toBeDefined();

    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const hint = reliquaryRelicSource(page, relic);
      if (hint?.sourceKind !== 'profession') continue;
      // masterwork:<craft> rows are DERIVED from the mark id itself, so they
      // cannot disagree with their own source by construction; the craftById
      // test below is their pin. Everything else must be derivable here, and an
      // unknown slot is an offender rather than a skip, so a new
      // profession-hinted relic cannot escape this sweep by being unlisted.
      if (slotId.startsWith('masterwork:')) continue;
      checked += 1;
      const expected = expectedBySlotId.get(slotId);
      if (expected === undefined) {
        offenders.push(`${page.id}:${slotId} has no live table deriving a profession`);
      } else if (expected !== hint.sourceId) {
        offenders.push(
          `${page.id}:${slotId} credits ${hint.sourceId}, live tables say ${expected}`,
        );
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: three field-note marks plus three fine-material jackpots.
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it('authored craft professions resolve through the live craftById lookup', () => {
    // The gathering ids are covered by the GATHERING_PROFESSIONS half of the
    // set above; this walks the craft half through the real accessor the call
    // sites use, which throws rather than answering undefined on a bad id.
    const crafts = new Set(
      RELIC_SLOTS.map(({ page, relic }) => reliquaryRelicSource(page, relic))
        .filter((h): h is ReliquarySourceHint => h?.sourceKind === 'profession')
        .map((h) => h.sourceId)
        .filter((id) => !(id in GATHERING_PROFESSIONS)),
    );
    // Vacuity floor: the five gear crafts on the masterwork page.
    expect(crafts.size).toBeGreaterThanOrEqual(5);
    for (const craftId of crafts) {
      expect(() => craftById(craftId), craftId).not.toThrow();
      expect(craftById(craftId).id, craftId).toBe(craftId);
    }
  });
});

describe('Reliquary source hint coverage', () => {
  it('every relic resolves to a source except the pinned pending rulings', () => {
    const unhinted: string[] = [];
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (reliquaryRelicSource(page, relic) !== null) continue;
      if (PENDING_KEYS.has(slotKey(page.id, slotId))) continue;
      unhinted.push(`${page.id}:${slotId}`);
    }
    expect(unhinted).toEqual([]);
  });

  it('SOURCE_PENDING_RULING is exactly the un-hinted set (no stale exclusions)', () => {
    // The other direction: an id that GAINS a hint must lose its pending row in
    // the same change, so the exclusion list can never quietly outlive the
    // ruling that retires it.
    const actuallyUnhinted = new Set<string>();
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (reliquaryRelicSource(page, relic) === null)
        actuallyUnhinted.add(slotKey(page.id, slotId));
    }
    expect([...actuallyUnhinted].sort()).toEqual([...PENDING_KEYS].sort());
    // Vacuity floor: this suite is worth nothing if almost everything is
    // excluded. Literal: tighten as rulings land.
    const hinted = RELIC_SLOTS.length - actuallyUnhinted.size;
    expect(hinted).toBeGreaterThanOrEqual(180);
  });

  it('the two derived pending rows carry their approved lengths', () => {
    // horizons_mounts and horizons_weapon_skins derive from the catalog lists
    // the pages are built from, so a NEW mount or skin auto-enrolls in the open
    // ruling and can never redden the coverage sweep on its own. These literal
    // lengths are the deliberate-re-approval step that derivation removed:
    // growing either list means re-affirming the page-wide ruling here.
    expect(SOURCE_PENDING_RULING.horizons_mounts).toHaveLength(9);
    expect(SOURCE_PENDING_RULING.horizons_weapon_skins).toHaveLength(29);
  });

  it('multi-source pages give every item relic its OWN hint (no inherited stragglers)', () => {
    // A page whose relics really come from two or more sources must not lean on
    // a page default for any of them: one inherited straggler would answer with
    // a confidently wrong boss. Pending-ruling ids are exempt because they carry
    // no hint at all, which is never wrong, only absent.
    const offenders: string[] = [];
    for (const page of RELIQUARY_PAGES) {
      if (distinctSourceKeys(page.id).size < 2) continue;
      for (const relic of page.relics) {
        if (relic.kind !== 'item') continue;
        const slotId = relicSlotId(relic);
        if (PENDING_KEYS.has(slotKey(page.id, slotId))) continue;
        if (relic.source === undefined) offenders.push(slotKey(page.id, slotId));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('pins the distinct source count of every page', () => {
    const derived: Record<string, number> = {};
    for (const page of RELIQUARY_PAGES) derived[page.id] = distinctSourceKeys(page.id).size;
    expect(derived).toEqual(EXPECTED_DISTINCT_SOURCES);
  });

  it('every known multi-source page really resolves to two or more sources', () => {
    const offenders: string[] = [];
    for (const pageId of KNOWN_MULTI_SOURCE_PAGES) {
      expect(RELIQUARY_PAGES_BY_ID[pageId], pageId).toBeDefined();
      const count = distinctSourceKeys(pageId).size;
      if (count < 2) offenders.push(`${pageId} resolves to ${count} source(s)`);
    }
    expect(offenders).toEqual([]);
  });

  it('a relic listed on two pages answers with the same source on both', () => {
    // Set members sit on both their boss page and their set page, authored in
    // two different places (the page table and SET_MEMBER_SOURCES). Those two
    // authorings must agree, or the same trophy would tell a player two
    // different stories depending on which page they opened.
    const byId = new Map<string, Map<string, string[]>>();
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const hint = reliquaryRelicSource(page, relic);
      if (!hint) continue;
      const key = `${hint.sourceKind}:${hint.sourceId}`;
      const seen = byId.get(slotId) ?? new Map<string, string[]>();
      seen.set(key, [...(seen.get(key) ?? []), page.id]);
      byId.set(slotId, seen);
    }
    const offenders: string[] = [];
    for (const [slotId, seen] of byId) {
      if (seen.size < 2) continue;
      const detail = [...seen]
        .map(([key, pages]) => `${key} on ${pages.sort().join('+')}`)
        .sort()
        .join(' vs ');
      offenders.push(`${slotId}: ${detail}`);
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: the cross-page arm only checks something while shared
    // relics exist. Every set member except the two open-world drops is one.
    const shared = [...byId].filter(([id]) => (RELIQUARY_ITEM_TO_PAGES.get(id) ?? []).length > 1);
    expect(shared.length).toBeGreaterThanOrEqual(26);
  });

  it('every hinted item relic acknowledges every comparable live award route', () => {
    // The wyrmcult_grand_robe class of error: a hint that names one live route
    // while another comparable route exists unacknowledged sends a player
    // confidently to the wrong door, and the per-route truth pins above cannot
    // see it (they only ask whether the CREDITED source awards the relic, never
    // whether something else also does). This walks every live award path for
    // every hinted item slot: mob loot, heroic boss loot, delve shop stock, NPC
    // vendor stock, guaranteed quest class rewards, and crafting recipes. A
    // route is acknowledged when the hint names it, when a quest's own kill
    // objective targets the credited mob (the quest is the same door), or when
    // the curated dominated-rate table below carries it. Anything else reds.
    const lootMobsByItem = new Map<string, string[]>();
    for (const [mobId, mob] of Object.entries(MOBS)) {
      for (const row of mob.loot ?? []) {
        // Money-only loot rows carry no itemId.
        if (typeof row.itemId !== 'string') continue;
        lootMobsByItem.set(row.itemId, [...(lootMobsByItem.get(row.itemId) ?? []), mobId]);
      }
    }
    const heroicMobsByItem = new Map<string, string[]>();
    for (const [mobId, rows] of Object.entries(HEROIC_BOSS_LOOT)) {
      for (const row of rows) {
        if (typeof row.itemId !== 'string') continue;
        heroicMobsByItem.set(row.itemId, [...(heroicMobsByItem.get(row.itemId) ?? []), mobId]);
      }
    }
    const vendorsByItem = new Map<string, string[]>();
    for (const [delveId, delve] of Object.entries(DELVES)) {
      for (const entry of DELVE_SHOPS[delveId] ?? []) {
        vendorsByItem.set(entry.itemId, [
          ...(vendorsByItem.get(entry.itemId) ?? []),
          delve.boardNpcId,
        ]);
      }
    }
    for (const [npcId, npc] of Object.entries(NPCS)) {
      for (const itemId of npc.vendorItems ?? []) {
        vendorsByItem.set(itemId, [...(vendorsByItem.get(itemId) ?? []), npcId]);
      }
    }
    const questsByItem = new Map<string, { questId: string; killTargets: string[] }[]>();
    for (const [questId, quest] of Object.entries(QUESTS)) {
      const rewards = Object.values(quest.itemRewards ?? {});
      const killTargets = (quest.objectives ?? [])
        .filter((o) => o.type === 'kill')
        .map((o) => o.targetMobId);
      for (const itemId of rewards) {
        if (typeof itemId !== 'string') continue;
        questsByItem.set(itemId, [...(questsByItem.get(itemId) ?? []), { questId, killTargets }]);
      }
    }
    const recipesByItem = new Map<string, string[]>();
    for (const recipe of ALL_RECIPES) {
      recipesByItem.set(recipe.resultItemId, [
        ...(recipesByItem.get(recipe.resultItemId) ?? []),
        recipe.id,
      ]);
    }

    // Curated dominated-route exceptions, keyed page:slot:route. Both are the
    // SET_MEMBER_SOURCES rate ruling (rare at 0.25 vs trash at 0.001, a 250 to
    // 1 expectation gap): the trash row exists but is not a comparable route.
    // The consumed-set guard below reds any entry the sweep stops needing.
    const ACKNOWLEDGED_SECONDARY_ROUTES = new Set<string>([
      'conquerors_set_deathlord:deathlord_sabatons:mob:deeprock_kobold',
      'conquerors_set_necromancers:necromancers_legwraps:mob:boneclad_revenant',
    ]);
    const consumed = new Set<string>();
    const offenders: string[] = [];
    let checkedRoutes = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (relic.kind !== 'item') continue;
      const hint = reliquaryRelicSource(page, relic);
      if (!hint) continue;
      const judge = (routeKey: string, acknowledged: boolean): void => {
        checkedRoutes += 1;
        if (acknowledged) return;
        const exception = `${page.id}:${slotId}:${routeKey}`;
        if (ACKNOWLEDGED_SECONDARY_ROUTES.has(exception)) {
          consumed.add(exception);
          return;
        }
        offenders.push(
          `${page.id}:${slotId} (${hint.sourceKind}:${hint.sourceId}) also: ${routeKey}`,
        );
      };
      for (const mobId of lootMobsByItem.get(slotId) ?? []) {
        judge(`mob:${mobId}`, hint.sourceKind === 'boss' && hint.sourceId === mobId);
      }
      for (const mobId of heroicMobsByItem.get(slotId) ?? []) {
        judge(`heroic:${mobId}`, hint.sourceKind === 'boss' && hint.sourceId === mobId);
      }
      for (const npcId of vendorsByItem.get(slotId) ?? []) {
        judge(`vendor:${npcId}`, hint.sourceKind === 'vendor' && hint.sourceId === npcId);
      }
      for (const q of questsByItem.get(slotId) ?? []) {
        judge(
          `quest:${q.questId}`,
          hint.sourceKind === 'boss' && q.killTargets.includes(hint.sourceId),
        );
      }
      for (const recipeId of recipesByItem.get(slotId) ?? []) {
        judge(`recipe:${recipeId}`, false);
      }
    }
    expect(offenders).toEqual([]);
    // Both directions: an exception the sweep no longer consumes is stale.
    expect([...ACKNOWLEDGED_SECONDARY_ROUTES].filter((k) => !consumed.has(k))).toEqual([]);
    // Vacuity floor: every hinted item slot has at least its credited route
    // when the credit is a loot or stock table, so the sweep must have judged
    // a large share of the catalog. Literal; update with the authoring.
    expect(checkedRoutes).toBeGreaterThanOrEqual(150);
  });

  it('boss and vendor hints live only on item and mark slots today', () => {
    // The loot and stock truth pins above early-return on every other relic
    // kind, so a boss or vendor hint on a mount, weapon skin, or title would
    // land UNPINNED. Zero such hints exist today; when Phase 13b authors mount
    // sources this pin reds and forces the truth sweeps to grow an arm first.
    const offenders: string[] = [];
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (relic.kind === 'item' || relic.kind === 'mark') continue;
      const hint = reliquaryRelicSource(page, relic);
      if (hint === null || hint.sourceKind === 'deed') continue;
      offenders.push(`${page.id}:${slotId} carries an unpinned ${hint.sourceKind} hint`);
    }
    expect(offenders).toEqual([]);
  });

  it('every authored sourceDefault is inherited by at least one relic', () => {
    // A default no relic falls through to is dead authoring: it looks like
    // coverage in the table while hinting nothing, and nothing else reds it.
    const offenders: string[] = [];
    let defaults = 0;
    for (const page of RELIQUARY_PAGES) {
      if (page.sourceDefault === undefined) continue;
      defaults += 1;
      const inherited = page.relics.filter((r) => r.source === undefined).length;
      if (inherited === 0) offenders.push(`${page.id} defaults but every relic owns a hint`);
    }
    expect(offenders).toEqual([]);
    // All nine defaults are live today; update deliberately with the authoring.
    expect(defaults).toBe(9);
  });
});

describe('reliquaryRelicSource precedence', () => {
  it('prefers the relic hint over the page default', () => {
    // Live pairing: the Sanctum page has no default and every hinted row owns
    // its source, while the heroic page defaults for all of them.
    const sanctum = RELIQUARY_PAGES_BY_ID.conquerors_gravewyrm_sanctum;
    expect(sanctum.sourceDefault).toBeUndefined();
    const korzulRelic = sanctum.relics.find(
      (r) => r.kind === 'item' && r.itemId === 'fang_of_korzul',
    );
    expect(korzulRelic, 'fang_of_korzul').toBeDefined();
    expect(reliquaryRelicSource(sanctum, korzulRelic!)).toEqual({
      sourceKind: 'boss',
      sourceId: 'korzul_the_gravewyrm',
    });
    // A relic hint WINS over a page default that disagrees.
    const defaulted = RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt;
    expect(defaulted.sourceDefault).toEqual({ sourceKind: 'boss', sourceId: 'morthen' });
    expect(
      reliquaryRelicSource(defaulted, {
        kind: 'item',
        itemId: 'cryptbone_helm',
        source: { sourceKind: 'boss', sourceId: 'ysolei' },
      }),
    ).toEqual({ sourceKind: 'boss', sourceId: 'ysolei' });
  });

  it('falls back to the page default, then to null', () => {
    const bare: ReliquaryRelicDef = { kind: 'item', itemId: 'cryptbone_helm' };
    expect(reliquaryRelicSource(RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt, bare)).toEqual({
      sourceKind: 'boss',
      sourceId: 'morthen',
    });
    // A page with no default answers null for an un-hinted relic.
    expect(RELIQUARY_PAGES_BY_ID.horizons_mounts.sourceDefault).toBeUndefined();
    expect(
      reliquaryRelicSource(RELIQUARY_PAGES_BY_ID.horizons_mounts, {
        kind: 'mount',
        mountId: 'valorsteed',
      }),
    ).toBe(null);
    // No page at all is null, never a throw: the resolver is a lookup the
    // client calls per relic, not a validator.
    expect(reliquaryRelicSource(undefined, bare)).toBe(null);
  });

  it('reads the default off the PASSED page, never a catalog lookup by id', () => {
    // The reason the resolver takes a def rather than a page id. A synthetic
    // page reusing a live catalog id must answer with its OWN default; an
    // id-keyed lookup would silently hand back the live row's boss instead.
    const shadow: ReliquaryPageDef = {
      id: 'conquerors_hollow_crypt',
      shelf: 'conquerors',
      name: 'Synthetic shadow of a live page id',
      sourceDefault: { sourceKind: 'zone', sourceId: 'synthetic_zone' },
      relics: [{ kind: 'item', itemId: 'cryptbone_helm' }],
    };
    // Premise: the live page of that id really does default to a different
    // source, so this test cannot pass by the two happening to agree.
    expect(RELIQUARY_PAGES_BY_ID[shadow.id].sourceDefault).toEqual({
      sourceKind: 'boss',
      sourceId: 'morthen',
    });
    expect(reliquaryRelicSource(shadow, shadow.relics[0])).toEqual({
      sourceKind: 'zone',
      sourceId: 'synthetic_zone',
    });
  });
});
