// Reliquary Conqueror catalog integrity: every page source, relic item id, and
// heroic / set membership pin resolves against live content tables. The
// CATALOG stays curated (hand lists in content/reliquary.ts, never an
// unbounded auto-scrape), while this suite DERIVES its expectations from the
// live loot / deed tables so a content change reds until the curator decides.
// Update the literal floors and totals deliberately when product adds content.
import { describe, expect, it } from 'vitest';
import { stackSizeOf } from '../src/sim/bags';
import { CLASSES } from '../src/sim/content/classes';
import { DEED_ORDER, DEEDS } from '../src/sim/content/deeds';
import { drownedLitanyChestItemsForTier } from '../src/sim/content/delves/drowned_litany_loot';
import { delveChestItemsForTier } from '../src/sim/content/delves/lockpick_tiers';
import { DELVE_SHOPS } from '../src/sim/content/delves/shop';
import { HEROIC_BOSS_LOOT, NYTHRAXIS_RAID_BOSS_ID } from '../src/sim/content/heroic_loot';
import { HEROIC_VENDOR_STOCK } from '../src/sim/content/heroic_vendor';
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
  RELIQUARY_ACTIVITY_SOURCE_IDS,
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
  RELIQUARY_RIFT_RANK_SOURCE_IDS,
  RELIQUARY_SET_MEMBERS,
  RELIQUARY_STORE_SOURCE_ID,
  type ReliquaryPageDef,
  type ReliquaryRelicDef,
  type ReliquarySourceHint,
  reliquaryRelicSource,
} from '../src/sim/content/reliquary';
import { RIFT_ITEMS } from '../src/sim/content/rift/items';
import { WEAPON_SKIN_LIST, WEAPON_SKINS } from '../src/sim/content/weapon_skins';
import {
  ALL_RECIPES,
  CAMPS,
  DELVES,
  DUNGEONS,
  ITEMS,
  MOBS,
  NPCS,
  QUESTS,
  ZONES,
  zoneContaining,
} from '../src/sim/data';
import type { LootTier } from '../src/sim/lockpick';
import {
  ARMOR_SECONDARY_BY_TYPE,
  DISENCHANT_MATERIAL_BY_QUALITY,
} from '../src/sim/professions/disenchant_reagents';
import { gatherRareEventFlavor } from '../src/sim/professions/gather_events';
import { NODE_HARVEST_TABLE, NODE_MATERIAL_TABLE } from '../src/sim/professions/gathering';
import { masterworkBonusStats } from '../src/sim/professions/masterwork';
import { MATERIAL_GRADES } from '../src/sim/professions/material_grades';
import { catalogCharacterCompletion, catalogRelicCompletion } from '../src/sim/reliquary';
import { riftHeroicClearPool, riftNormalClearPool } from '../src/sim/rift/loot_pools';
import {
  RIFT_BLUE_MOUNT_REINS,
  RIFT_EPIC_MOUNT_REINS,
  RIFT_GREEN_MOUNT_REINS,
} from '../src/sim/rift/progression';
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
    // Literal: update when catalog content lands. Phase 18 adds four title
    // relics to horizons_titles (the completion-ladder titles minus the
    // excluded col_reliquary_complete).
    expect(full).toEqual({ owned: 223, total: 223 });
    const character = catalogCharacterCompletion({
      itemsDiscovered: allOwned,
      marks: allOwned,
      ownedMounts: allOwned,
      deedsEarned: allOwned,
    });
    // Literal: update when catalog content lands.
    expect(character).toEqual({ owned: 194, total: 194 });
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

  it('the Conquerors shelf shape the capstone gate depends on: non-empty item pages only', () => {
    // syncReliquaryCompletionDeeds gates the whole-catalog walk behind the
    // shelf deed on a necessity argument: owned === total implies the shelf
    // is complete. That implication holds only while every conquerors page
    // is non-empty and carries NO weapon_skin relic (skin ownership is
    // account-scoped, invisible to characterReliquaryOwnership, and
    // subtracted from the character total, so a conquerors skin page would
    // keep the shelf deed permanently ungrantable while owned === total
    // stays reachable: the capstone would dead-end silently). An empty page
    // can never read complete at all (total > 0 is part of complete). This
    // arm reds the catalog edit before the gate can strand anyone; a
    // conquerors-shelf pending slot would be the same hazard one step
    // removed, so the pending table must never name a conquerors page.
    expect(CONQUEROR_PAGES.length).toBeGreaterThan(0);
    for (const page of CONQUEROR_PAGES) {
      expect(page.relics.length, `${page.id} is empty`).toBeGreaterThan(0);
      for (const relic of page.relics) {
        expect(relic.kind, `${page.id} carries a ${relic.kind} relic`).not.toBe('weapon_skin');
      }
    }
    for (const pageId of Object.keys(SOURCE_PENDING_RULING)) {
      expect(
        RELIQUARY_PAGES_BY_ID[pageId]?.shelf,
        `${pageId} is a conquerors page with a pending (unearnable) slot`,
      ).not.toBe('conquerors');
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

  it('no copper vendor and no disenchant yield stocks a catalogued relic', () => {
    // Two unflagged world-source grant paths whose SAFETY is a content fact,
    // not a code property. buyItem (src/sim/items.ts) counts every purchase,
    // sanctioned for CURRENCY vendors (delve Marks, heroic marks) where the
    // coin is earned in the world; a catalogued relic on a plain copper
    // vendorItems list would open a gold-repeatable tally climb. Disenchant
    // yields (materials plus typed secondaries) also count, a self-loop only
    // if a yield id were ever catalogued. Both sets are empty of relics today;
    // this reds the day a content edit changes either, forcing the
    // classification decision instead of silently inheriting "counts".
    const vendorOffenders: string[] = [];
    for (const [npcId, npc] of Object.entries(NPCS)) {
      for (const itemId of npc.vendorItems ?? []) {
        if (isCataloguedRelicItem(itemId)) vendorOffenders.push(`${npcId}:${itemId}`);
      }
    }
    expect(vendorOffenders).toEqual([]);
    const yieldOffenders = [
      ...Object.values(DISENCHANT_MATERIAL_BY_QUALITY),
      ...Object.values(ARMOR_SECONDARY_BY_TYPE),
      // typedSecondaryFor's two weapon fallbacks, the only yields not in a table.
      'resonant_timber',
      'resonant_steel',
    ].filter((id) => isCataloguedRelicItem(id));
    expect(yieldOffenders).toEqual([]);
    // Vacuity floors: both swept sets are populated, and every swept yield
    // value is a REAL item id (a table reshape to objects would otherwise
    // make isCataloguedRelicItem silently false for every entry).
    expect(Object.values(NPCS).some((n) => (n.vendorItems?.length ?? 0) > 0)).toBe(true);
    const sweptYields = [
      ...Object.values(DISENCHANT_MATERIAL_BY_QUALITY),
      ...Object.values(ARMOR_SECONDARY_BY_TYPE),
      'resonant_timber',
      'resonant_steel',
    ];
    expect(sweptYields.length).toBeGreaterThan(2);
    expect(sweptYields.every((v) => typeof v === 'string' && ITEMS[v] !== undefined)).toBe(true);
  });

  it('does not catalog heroic_ variants (base ids already fill via discovery)', () => {
    for (const page of RELIQUARY_PAGES) {
      for (const id of itemRelicIds(page)) {
        expect(id.startsWith('heroic_')).toBe(false);
      }
    }
  });

  it('maps every catalogued item id to a NON-EMPTY page list', () => {
    // The premise behind Phase 17's predicate unification: noteRelicItemFind
    // swapped its "pages array non-empty" gate for isCataloguedRelicItem
    // (which is membership in this index), a behavior-preserving swap ONLY
    // while no key maps to an empty list. The index builder creates a key
    // together with its first page, so this can red only if the builder is
    // rewritten; if it ever does, a catalogued relic on no page would mint a
    // first find whose chat line renders inert. (A direct
    // isCataloguedRelicItem-vs-index agreement pin would be vacuous: the
    // predicate IS the index membership test.)
    expect(RELIQUARY_ITEM_TO_PAGES.size).toBeGreaterThan(100);
    for (const [id, pages] of RELIQUARY_ITEM_TO_PAGES) {
      expect(pages.length, `catalogued id ${id} maps to an empty page list`).toBeGreaterThan(0);
    }
  });

  it('does not catalog mount reins on Conqueror pages (Horizons owns mounts)', () => {
    for (const page of CONQUEROR_PAGES) {
      for (const id of itemRelicIds(page)) {
        expect(isMountReinsId(id)).toBe(false);
      }
    }
  });

  it('splits into non-stackable gear plus exactly the stackable specimen relics', () => {
    // The obtain tally (Phase 17) increments per COPY, so which relics can
    // arrive as a stack of more than one is load-bearing rather than trivia:
    // for everything in the gear bucket a grant is always one copy and the
    // per-copy and per-call readings coincide, while the specimen bucket is
    // the reason src/sim/sim.ts addItem passes its `count` through instead of
    // a literal 1. stackSizeOf is the one authority both sides read.
    const stackable: string[] = [];
    const gear: string[] = [];
    for (const page of RELIQUARY_PAGES) {
      for (const id of itemRelicIds(page)) {
        (stackSizeOf(ITEMS[id]) > 1 ? stackable : gear).push(id);
      }
    }
    // Exact list, not a count: a new stackable relic has to be looked at
    // (per-copy counting is right for it, but so is the window's phrasing).
    expect([...new Set(stackable)].sort()).toEqual([
      'fine_elderwood_log',
      'fine_sunpetal_herb',
      'fine_thorium_ore',
      'prime_cut',
      'pristine_claw',
      'pristine_hide',
      'pristine_silk',
      'pristine_venom_gland',
    ]);
    // Every stackable one is a Professions-shelf specimen, never Conqueror
    // gear: that is what makes the bucket a knowable list rather than a drift.
    for (const id of stackable) {
      expect(
        (RELIQUARY_PROFESSION_SPECIMEN_ITEMS as readonly string[]).includes(id),
        `${id} is not a specimen`,
      ).toBe(true);
    }
    // Vacuity floor: the gear bucket is the overwhelming majority.
    expect(gear.length).toBeGreaterThan(100);
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

  it('a masterwork craft is hinted iff it is gear-capable (derived, not ring membership)', () => {
    // Ring membership alone let masterwork:engineering ship an unearnable
    // hint: every engineering recipe produces a slotless, statless tool, so
    // masterworkBonusStats (the SAME gate the proc path consults in
    // crafting.ts) returns null for all of them and the mark can never be
    // written. Deriving gear-capability through that gate reds both drifts: a
    // tool-only craft gaining a hint, and a craft becoming gear-capable while
    // its slot still sits pended (QA ruling 2026-08-07).
    const page = RELIQUARY_PAGES_BY_ID.professions_masterwork;
    const pendedMarks = new Set(SOURCE_PENDING_RULING.professions_masterwork);
    let gearCapableCount = 0;
    for (const markId of RELIQUARY_PROFESSION_MARKS.masterworkByCraft) {
      const craftId = markId.slice('masterwork:'.length);
      const gearCapable = ALL_RECIPES.some((recipe) => {
        if (recipe.professionId !== craftId) return false;
        const def = ITEMS[recipe.resultItemId];
        if (!def) return false;
        return (
          masterworkBonusStats({
            level: recipe.level,
            quality: def.quality,
            slot: def.slot,
            stats: def.stats,
          }) !== null
        );
      });
      if (gearCapable) gearCapableCount += 1;
      const relic = page.relics.find((r) => r.kind === 'mark' && r.markId === markId);
      expect(relic, markId).toBeDefined();
      const hinted = relic !== undefined && reliquaryRelicSource(page, relic).length > 0;
      expect(hinted, `${markId} hinted iff gear-capable`).toBe(gearCapable);
      expect(pendedMarks.has(markId), `${markId} pended iff NOT gear-capable`).toBe(!gearCapable);
    }
    // Liveness: the derivation is worthless if it calls everything ineligible.
    expect(gearCapableCount).toBe(4);
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
    // ONE exclusion: col_reliquary_complete rewards a title but must stay OFF
    // the page, because its trigger is owned === total over the character
    // catalog; listing its own title would grow total by one the player
    // cannot own before the grant, deadlocking completion (the
    // non-terminating self-reference). The explicit arm below pins the
    // exclusion so a future hand-add reds a test, not just review.
    const liveTitles = DEED_ORDER.filter(
      (id) =>
        DEEDS[id].reward?.kind === 'title' && !DEEDS[id].hidden && id !== 'col_reliquary_complete',
    );
    expect([...ids].sort()).toEqual([...liveTitles].sort());
    // The exclusion arm, both premise halves: the deed really rewards a title
    // (so the filter above really is excluding a would-be member, not a
    // border or rewardless deed) AND the hand list does not carry it.
    expect(DEEDS.col_reliquary_complete.reward?.kind).toBe('title');
    expect(DEEDS.col_reliquary_complete.hidden).toBeFalsy();
    expect(RELIQUARY_HORIZON_TITLES).not.toContain('col_reliquary_complete');
    expect(ids).not.toContain('col_reliquary_complete');
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
const ACTIVITY_SOURCE_IDS = new Set<string>(RELIQUARY_ACTIVITY_SOURCE_IDS);
const RIFT_RANK_SOURCE_IDS = new Set<string>(RELIQUARY_RIFT_RANK_SOURCE_IDS);

/**
 * Does an authored sourceId exist in the live table its kind names? The switch
 * is exhaustive with no default, so a new ReliquarySourceKind fails tsc here
 * until its id space is wired, rather than silently validating against nothing.
 *
 * Boss ids are checked by MOBS KEY MEMBERSHIP, never by rank flags: the catalog
 * credits mid-bosses (knight_commander_olen, choirmother_selthe,
 * korgath_the_bound, grand_necromancer_velkhar) that are elite without boss,
 * elite TRASH families (sanctum_boneguard, sanctum_drakonid), and named rares
 * (wildheart_beastmaster, ironvein_foreman, marrowlord_varkas), all of which a
 * flag check would wrongly reject. 'boss' is the mob-loot arm, not a rank claim.
 *
 * The three kinds with no engine table of their own answer against the pinned
 * id spaces the catalog exports (store, activity, rift rank), so a fabricated
 * id in those spaces is rejected the same way a fabricated mob id is.
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
    case 'delve':
      return Object.hasOwn(DELVES, hint.sourceId);
    case 'quest':
      return Object.hasOwn(QUESTS, hint.sourceId);
    case 'rift':
      return RIFT_RANK_SOURCE_IDS.has(hint.sourceId);
    case 'store':
      return hint.sourceId === RELIQUARY_STORE_SOURCE_ID;
    case 'activity':
      return ACTIVITY_SOURCE_IDS.has(hint.sourceId);
  }
}

/**
 * Mount key -> the ItemDef ids that OWN it (kind 'mount' with `mount` === the
 * key). A mount is never awarded directly: its reins item is, so every truth
 * pin on a mount slot has to translate the slot id before it can walk a live
 * award table. Built once from live ITEMS.
 */
const REINS_ITEMS_BY_MOUNT = (() => {
  const map = new Map<string, string[]>();
  for (const item of Object.values(ITEMS)) {
    if (item.kind !== 'mount' || item.mount === undefined) continue;
    map.set(item.mount, [...(map.get(item.mount) ?? []), item.id]);
  }
  return map;
})();

/** The one reins item id for a mount. Asserts uniqueness rather than picking
 *  the first: two ownership items for one mount would make every mount pin
 *  below silently answer about whichever happened to be defined first. */
function reinsItemIdForMount(mountId: string): string {
  const ids = REINS_ITEMS_BY_MOUNT.get(mountId) ?? [];
  expect(ids, `ownership reins item for mount ${mountId}`).toHaveLength(1);
  return ids[0];
}

/** The live award id behind a relic slot: a mount answers through its reins
 *  item, every other kind is its own id. */
function awardIdForSlot(relic: ReliquaryRelicDef, slotId: string): string {
  return relic.kind === 'mount' ? reinsItemIdForMount(slotId) : slotId;
}

/** Rift rank -> the reins table that rank's clear rolls
 *  (src/sim/rift/progression.ts). Keys typed against the live rank id space, so
 *  a new awarding rank fails tsc here until its table is wired. The mapping
 *  hand-mirrors an inline ternary in addRiftClearGearLoot; the behavioral pin
 *  that drives that production path per rank lives in
 *  tests/rift_rank_tuning.test.ts, which is what keeps this mirror honest. */
const RIFT_REINS_BY_RANK: Record<
  (typeof RELIQUARY_RIFT_RANK_SOURCE_IDS)[number],
  readonly string[]
> = {
  B: RIFT_GREEN_MOUNT_REINS,
  A: RIFT_BLUE_MOUNT_REINS,
  S: RIFT_EPIC_MOUNT_REINS,
};

/** NPC -> everything its counter really sells, reached the way the game reaches
 *  it: a delve's board NPC fronts that delve's DELVE_SHOPS counter, and a plain
 *  world NPC sells its own vendorItems. */
const STOCK_BY_NPC = (() => {
  const map = new Map<string, Set<string>>();
  const add = (npcId: string, itemId: string) => {
    const stock = map.get(npcId) ?? new Set<string>();
    stock.add(itemId);
    map.set(npcId, stock);
  };
  for (const [delveId, delve] of Object.entries(DELVES)) {
    for (const entry of DELVE_SHOPS[delveId] ?? []) add(delve.boardNpcId, entry.itemId);
  }
  for (const [npcId, npc] of Object.entries(NPCS)) {
    for (const itemId of npc.vendorItems ?? []) add(npcId, itemId);
  }
  return map;
})();

/** Delve id -> every item id that delve can award: its chest function over
 *  every tier / class / bountiful arm / chance script, plus its Marks counter.
 *  This is the whole meaning of a 'delve' hint, so the truth pin and the
 *  competing-route sweep both read it. */
const DELVE_AWARDABLE_IDS = new Map<string, Set<string>>(
  Object.entries(CHEST_FN_BY_DELVE).map(([delveId, { chest }]) => {
    const ids = reachableChestItemIds(chest);
    for (const entry of DELVE_SHOPS[delveId] ?? []) ids.add(entry.itemId);
    return [delveId, ids];
  }),
);

/**
 * Activity id -> the exact trophies its write site awards. Literal on the two
 * mark ids because they ARE literals at the write sites (src/sim/interaction.ts
 * writes gather_event:perfect_specimen; src/sim/professions/crafting.ts writes
 * masterwork:first), and derived from live HARVEST_COMPONENT_SPECIMENS for the
 * item half, so a new harvest family joins the corpse-harvest answer on its own.
 */
const ACTIVITY_AWARDS: Readonly<Record<string, readonly string[]>> = {
  corpse_harvest: ['gather_event:perfect_specimen', ...Object.values(HARVEST_COMPONENT_SPECIMENS)],
  masterwork_craft: ['masterwork:first'],
};

/**
 * Every live award-route table the acknowledgment sweep walks, inverted to
 * item/slot -> routes. Module scope on purpose: the sweep, its per-family
 * negative proofs, and the pending-mounts inverse sweep all read the SAME
 * maps, so none of the three can drift onto a private notion of "route".
 */
const ROUTE_MAPS = (() => {
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
  const recipesByItem = new Map<string, { id: string; professionId: string }[]>();
  for (const recipe of ALL_RECIPES) {
    recipesByItem.set(recipe.resultItemId, [
      ...(recipesByItem.get(recipe.resultItemId) ?? []),
      { id: recipe.id, professionId: recipe.professionId },
    ]);
  }
  // Delve CHESTS, separate from the shop counters already in vendorsByItem:
  // the chest is the route the 'delve' kind was added to be able to name.
  const chestDelvesByItem = new Map<string, string[]>();
  for (const [delveId, { chest }] of Object.entries(CHEST_FN_BY_DELVE)) {
    for (const itemId of reachableChestItemIds(chest)) {
      chestDelvesByItem.set(itemId, [...(chestDelvesByItem.get(itemId) ?? []), delveId]);
    }
  }
  // A delve's board NPC fronts that delve, so naming the delve names its
  // counter too. Unexercised today (both Collapsed Reliquary rows carry their
  // vendor hint explicitly as well); it is here so a delve-only authoring
  // stays honest instead of reddening on its own shop.
  const delvesByBoardNpc = new Map<string, string[]>();
  for (const [delveId, delve] of Object.entries(DELVES)) {
    delvesByBoardNpc.set(delve.boardNpcId, [
      ...(delvesByBoardNpc.get(delve.boardNpcId) ?? []),
      delveId,
    ]);
  }
  // The Rift MOUNT ladder, by rank: the one rift route that is a route.
  const riftRanksByItem = new Map<string, string[]>();
  for (const [rank, reins] of Object.entries(RIFT_REINS_BY_RANK)) {
    for (const itemId of reins) {
      riftRanksByItem.set(itemId, [...(riftRanksByItem.get(itemId) ?? []), rank]);
    }
  }
  // The account storefront: one route, every live Armory skin.
  const storeSkinIds = new Set<string>(Object.keys(WEAPON_SKINS));
  // The activity write sites, inverted to slot -> activities.
  const activitiesBySlot = new Map<string, string[]>();
  for (const [activityId, slotIds] of Object.entries(ACTIVITY_AWARDS)) {
    for (const slotId of slotIds) {
      activitiesBySlot.set(slotId, [...(activitiesBySlot.get(slotId) ?? []), activityId]);
    }
  }
  return {
    lootMobsByItem,
    heroicMobsByItem,
    vendorsByItem,
    questsByItem,
    recipesByItem,
    chestDelvesByItem,
    delvesByBoardNpc,
    riftRanksByItem,
    storeSkinIds,
    activitiesBySlot,
  };
})();

type RouteFamily =
  | 'mob'
  | 'heroic'
  | 'vendor'
  | 'quest'
  | 'recipe'
  | 'delveChest'
  | 'riftReins'
  | 'store'
  | 'activity';

/**
 * Walk every comparable live route for ONE slot against a hint list. Pure over
 * ROUTE_MAPS, which is what lets the negative proofs hand it a doctored hint
 * list and watch each family actually fail: the main sweep alone could have a
 * family whose acknowledgment check rotted to always-true and never know.
 */
function judgeSlotRoutes(
  relicKind: ReliquaryRelicDef['kind'],
  slotId: string,
  awardId: string,
  hints: readonly ReliquarySourceHint[],
): { counts: Record<RouteFamily, number>; unacknowledged: string[] } {
  const counts: Record<RouteFamily, number> = {
    mob: 0,
    heroic: 0,
    vendor: 0,
    quest: 0,
    recipe: 0,
    delveChest: 0,
    riftReins: 0,
    store: 0,
    activity: 0,
  };
  const unacknowledged: string[] = [];
  const names = (kind: ReliquarySourceHint['sourceKind'], id: string): boolean =>
    hints.some((h) => h.sourceKind === kind && h.sourceId === id);
  const judge = (family: RouteFamily, routeKey: string, acknowledged: boolean): void => {
    counts[family] += 1;
    if (!acknowledged) unacknowledged.push(routeKey);
  };
  for (const mobId of ROUTE_MAPS.lootMobsByItem.get(awardId) ?? []) {
    judge('mob', `mob:${mobId}`, names('boss', mobId));
  }
  for (const mobId of ROUTE_MAPS.heroicMobsByItem.get(awardId) ?? []) {
    judge('heroic', `heroic:${mobId}`, names('boss', mobId));
  }
  for (const npcId of ROUTE_MAPS.vendorsByItem.get(awardId) ?? []) {
    judge(
      'vendor',
      `vendor:${npcId}`,
      names('vendor', npcId) ||
        (ROUTE_MAPS.delvesByBoardNpc.get(npcId) ?? []).some((delveId) => names('delve', delveId)),
    );
  }
  for (const q of ROUTE_MAPS.questsByItem.get(awardId) ?? []) {
    // Two acknowledged shapes: naming the quest outright, or naming a mob the
    // quest's own kill objective targets (same door, said the other way).
    judge(
      'quest',
      `quest:${q.questId}`,
      names('quest', q.questId) || q.killTargets.some((mobId) => names('boss', mobId)),
    );
  }
  for (const r of ROUTE_MAPS.recipesByItem.get(awardId) ?? []) {
    // A crafted relic credited to its own crafting profession is the one
    // acknowledged recipe shape. Any other hint kind leaves the recipe a
    // competing door.
    judge('recipe', `recipe:${r.id}`, names('profession', r.professionId));
  }
  for (const delveId of ROUTE_MAPS.chestDelvesByItem.get(awardId) ?? []) {
    judge('delveChest', `delveChest:${delveId}`, names('delve', delveId));
  }
  for (const rank of ROUTE_MAPS.riftRanksByItem.get(awardId) ?? []) {
    judge('riftReins', `riftReins:${rank}`, names('rift', rank));
  }
  if (relicKind === 'weapon_skin' && ROUTE_MAPS.storeSkinIds.has(slotId)) {
    judge('store', `store:${RELIQUARY_STORE_SOURCE_ID}`, names('store', RELIQUARY_STORE_SOURCE_ID));
  }
  for (const activityId of ROUTE_MAPS.activitiesBySlot.get(slotId) ?? []) {
    judge('activity', `activity:${activityId}`, names('activity', activityId));
  }
  return { counts, unacknowledged };
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
  // The three gaps are CONTENT gaps, not vocabulary gaps: no live table awards
  // any of them, so there is no door to name. Every other slot the catalog
  // used to leave pending turned out to be a several-doors slot rather than a
  // no-answer slot, and Phase 13b authored all of them (a relic lists every
  // comparable route it really has).
  //
  // drakemaw_raptor: NO acquisition path exists anywhere in content, see the
  // def comment in content/drakelands.ts. Owner call recorded 2026-08-04: the
  // slot stays listed and sourceless until the mount gets a route.
  // terrorspark_groundshaker: dev-grant only, deliberately absent from vendors,
  // quests, mob loot, heroic loot, and the rift reins pools.
  horizons_mounts: ['drakemaw_raptor', 'terrorspark_groundshaker'],
  // masterwork:engineering: unearnable, QA ruling 2026-08-07. Every live
  // engineering recipe produces a slotless, statless tool, masterworkBonusStats
  // returns null for all of them, so the masterwork proc can never fire and
  // the mark can never be written (write site crafting.ts, gate masterwork.ts).
  // The slot stays catalogued and un-hinted until the owner either ships a
  // stats-bearing engineering craftable or retires the slot. The
  // gear-capability pin below derives the eligible set from the live recipes
  // and reds if either side moves.
  professions_masterwork: ['masterwork:engineering'],
};

/**
 * The difficulty-aware boss-route standard: a dungeon page that names a
 * difficulty must find the credited drop on THAT difficulty's table (a
 * normal-page relic that only drops on heroic, or vice versa, is a wrong
 * credit even though the union would pass it); non-dungeon pages and
 * difficulty-less or 'any' pages span both tables by design.
 */
function bossRouteSatisfies(
  difficulty: 'normal' | 'heroic' | 'any' | undefined,
  fromLoot: boolean,
  fromHeroic: boolean,
): boolean {
  if (difficulty === 'heroic') return fromHeroic;
  if (difficulty === 'normal') return fromLoot;
  return fromLoot || fromHeroic;
}

/** The zone sweep's shape gate, named so its trip-wire is provable: a zone
 *  hint is checkable only beside EXACTLY one boss hint, mirroring both halves
 *  of the view's compose guard (bosses === 1 && zones === 1). Live data never
 *  trips it, so the synthetic cases below are what keep it honest. */
function zoneHintShapeOk(bossCount: number, zoneCount: number): boolean {
  return bossCount === 1 && zoneCount === 1;
}

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
  conquerors_gravewyrm_sanctum: 8,
  conquerors_gravewyrm_sanctum_heroic: 1,
  conquerors_wildheart_basin: 2,
  conquerors_wildheart_basin_heroic: 1,
  conquerors_nythraxis: 1,
  conquerors_nythraxis_heroic: 1,
  conquerors_thunzharr: 1,
  conquerors_collapsed_reliquary: 2,
  conquerors_drowned_litany: 2,
  conquerors_set_deathlord: 4,
  conquerors_set_wyrmshadow: 3,
  conquerors_set_necromancers: 4,
  conquerors_set_crownforged: 2,
  conquerors_set_nighttalon: 2,
  conquerors_set_soulflame: 2,
  conquerors_set_stormcallers: 2,
  // 5 = activity (masterworkFirst) + the four gear-capable craft professions;
  // masterwork:engineering is pended un-hinted (QA ruling 2026-08-07).
  professions_masterwork: 5,
  professions_field_notes: 4,
  professions_specimens: 4,
  horizons_mounts: 10,
  horizons_weapon_skins: 1,
  // Every title relic's source is its own deed, so the count tracks the page
  // rows: 36 + the four Phase 18 completion-ladder titles.
  horizons_titles: 40,
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
  // Both delve pages: every relic sits on the delve's own chest, the board
  // NPC's Marks counter, or (for the Collapsed Reliquary pair) both at once.
  'conquerors_collapsed_reliquary',
  'conquerors_drowned_litany',
  // Professions pages span the professions they cover, plus the corpse-harvest
  // and masterwork activities for the slots no profession owns.
  'professions_masterwork',
  'professions_field_notes',
  'professions_specimens',
  // Horizons titles: one deed per title. Mounts: several heroic bosses and
  // three rift ranks plus Marla. Weapon skins are the one Horizons page with a
  // single source (the account storefront), which is why they are absent here
  // and pinned at 1 in EXPECTED_DISTINCT_SOURCES instead.
  'horizons_titles',
  'horizons_mounts',
];

/** `sourceKind:sourceId`, the stable comparison key for one hint. */
function hintKey(hint: ReliquarySourceHint): string {
  return `${hint.sourceKind}:${hint.sourceId}`;
}

/** One relic's whole answer as a stable, order-independent key, so two
 *  authorings of the same relic can be compared as SETS of doors rather than
 *  as arrays whose order is presentation. */
function hintListKey(hints: readonly ReliquarySourceHint[]): string {
  return [...hints.map(hintKey)].sort().join(' + ');
}

function resolvedSourcesFor(pageId: string): ReliquarySourceHint[] {
  const page = RELIQUARY_PAGES_BY_ID[pageId];
  // Every hint of every relic: a relic that names three doors contributes all
  // three, so a page's distinct-source count reflects the doors it really
  // shows, not the number of relics that carry any hint at all.
  return page.relics.flatMap((relic) => [...reliquaryRelicSource(page, relic)]);
}

function distinctSourceKeys(pageId: string): Set<string> {
  return new Set(resolvedSourcesFor(pageId).map(hintKey));
}

describe('Reliquary source hints resolve against live content', () => {
  it('every authored sourceId exists in the live table its kind names', () => {
    const offenders: string[] = [];
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (!sourceIdResolves(hint)) offenders.push(`${page.id}:${slotId} -> ${hintKey(hint)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sourceIdResolves accepts live ids and rejects fabricated ones, per kind', () => {
    // Every arm exercised in both directions, so none can rot into a vacuous
    // `true`.
    const live: ReliquarySourceHint[] = [
      { sourceKind: 'boss', sourceId: 'korzul_the_gravewyrm' },
      { sourceKind: 'vendor', sourceId: 'brother_halven_marsh' },
      { sourceKind: 'zone', sourceId: ZONES[0].id },
      { sourceKind: 'profession', sourceId: 'mining' },
      { sourceKind: 'profession', sourceId: 'weaponcrafting' },
      { sourceKind: 'deed', sourceId: 'col_seven_regalia' },
      { sourceKind: 'delve', sourceId: 'drowned_litany' },
      { sourceKind: 'quest', sourceId: 'q_gravewyrm' },
      { sourceKind: 'rift', sourceId: 'S' },
      { sourceKind: 'store', sourceId: RELIQUARY_STORE_SOURCE_ID },
      { sourceKind: 'activity', sourceId: 'corpse_harvest' },
    ];
    for (const hint of live) {
      expect(sourceIdResolves(hint), hintKey(hint)).toBe(true);
    }
    const fabricated: ReliquarySourceHint[] = [
      { sourceKind: 'boss', sourceId: 'not_a_mob' },
      { sourceKind: 'vendor', sourceId: 'not_an_npc' },
      { sourceKind: 'zone', sourceId: 'not_a_zone' },
      { sourceKind: 'profession', sourceId: 'not_a_profession' },
      { sourceKind: 'deed', sourceId: 'not_a_deed' },
      { sourceKind: 'delve', sourceId: 'not_a_delve' },
      { sourceKind: 'quest', sourceId: 'not_a_quest' },
      { sourceKind: 'rift', sourceId: 'not_a_rank' },
      { sourceKind: 'store', sourceId: 'not_a_storefront' },
      { sourceKind: 'activity', sourceId: 'not_an_activity' },
    ];
    for (const hint of fabricated) {
      expect(sourceIdResolves(hint), hintKey(hint)).toBe(false);
    }
    // C is a REAL rift rank whose clear rolls no mount at all, so it is
    // fabricated for this vocabulary even though the ladder knows the letter.
    expect(sourceIdResolves({ sourceKind: 'rift', sourceId: 'C' })).toBe(false);
    // Cross-kind guard: a real id from the WRONG table must still be rejected,
    // so the arms cannot be answering from one shared pool.
    expect(sourceIdResolves({ sourceKind: 'boss', sourceId: 'brother_halven_marsh' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'vendor', sourceId: 'korzul_the_gravewyrm' })).toBe(
      false,
    );
    expect(sourceIdResolves({ sourceKind: 'deed', sourceId: 'mining' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'delve', sourceId: 'gravewyrm_sanctum' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'quest', sourceId: 'drowned_litany' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'rift', sourceId: 'q_gravewyrm' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'store', sourceId: 'stablemaster_marla' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'activity', sourceId: 'mining' })).toBe(false);
    // Prototype-key guard: the hasOwn arms exist for exactly this. A bare
    // index would find Object.prototype.constructor on every Record table
    // and validate an id production's ownEntry ladder refuses to render.
    expect(sourceIdResolves({ sourceKind: 'boss', sourceId: 'constructor' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'vendor', sourceId: 'constructor' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'deed', sourceId: 'constructor' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'delve', sourceId: 'constructor' })).toBe(false);
    expect(sourceIdResolves({ sourceKind: 'quest', sourceId: 'constructor' })).toBe(false);
  });

  it('every boss hint names a mob whose live loot really carries the relic', () => {
    // Existence is not truth: MOBS[sourceId] merely proves the id is a real
    // mob, which a plausible-but-wrong boss would also satisfy. This walks the
    // RESOLVED hints (inherited page defaults included, so the sourceDefault
    // pages are covered too) back to the live loot row that has to justify
    // them, through both award paths: the normal MobTemplate.loot table and the
    // separate HEROIC_BOSS_LOOT table the heroic pages are built from.
    //
    // EVERY hint on a multi-door relic is walked independently: naming three
    // bosses is three claims, and one wrong boss among three is exactly as
    // wrong as one wrong boss alone. Mount slots walk their REINS item instead
    // of the mount key, because reins are what a boss table can drop.
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (relic.kind !== 'item' && relic.kind !== 'mark' && relic.kind !== 'mount') continue;
      const awardId = awardIdForSlot(relic, slotId);
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (hint.sourceKind !== 'boss') continue;
        checked += 1;
        const fromLoot = (MOBS[hint.sourceId]?.loot ?? []).some((e) => e.itemId === awardId);
        const heroic = HEROIC_BOSS_LOOT[hint.sourceId as keyof typeof HEROIC_BOSS_LOOT] ?? [];
        const fromHeroic = heroic.some((e) => e.itemId === awardId);
        const clear = page.clearSource;
        const difficulty = clear?.kind === 'dungeon' ? clear.difficulty : undefined;
        if (!bossRouteSatisfies(difficulty, fromLoot, fromHeroic)) {
          offenders.push(`${page.id}:${slotId} credits ${hint.sourceId}, which never drops it`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: the sweep is worthless if it walked nothing. Literal,
    // matching the authored boss coverage; update deliberately with the
    // authoring, same regime as the totals pins above.
    expect(checked).toBeGreaterThanOrEqual(159);
    // The mount arm specifically, so the reins translation cannot rot into a
    // no-op that leaves every mount boss hint unpinned while the total above
    // still clears on the item slots alone.
    const mountBossHints = RELIC_SLOTS.filter(({ relic }) => relic.kind === 'mount').flatMap(
      ({ page, relic }) => reliquaryRelicSource(page, relic).filter((h) => h.sourceKind === 'boss'),
    );
    expect(mountBossHints.length).toBeGreaterThanOrEqual(10);
  });

  it('bossRouteSatisfies rejects a wrong-difficulty credit per arm', () => {
    // No live slot currently fails strict-while-passing-union (zero items sit
    // on both tables), so the data-driven walk above cannot prove the
    // tightening. These synthetic cases pin the predicate itself: one
    // negative per typed difficulty, the positives, and the union arms.
    expect(bossRouteSatisfies('normal', false, true)).toBe(false);
    expect(bossRouteSatisfies('heroic', true, false)).toBe(false);
    expect(bossRouteSatisfies('normal', true, false)).toBe(true);
    expect(bossRouteSatisfies('heroic', false, true)).toBe(true);
    expect(bossRouteSatisfies('any', true, false)).toBe(true);
    expect(bossRouteSatisfies(undefined, false, true)).toBe(true);
    expect(bossRouteSatisfies(undefined, false, false)).toBe(false);
  });

  it('every vendor hint names an NPC whose live stock really sells the relic', () => {
    // Same truth standard on the vendor arm, over STOCK_BY_NPC: a delve's board
    // NPC fronts that delve's DELVE_SHOPS counter, and a plain world NPC sells
    // its own vendorItems (which is how Marla's reins_valorsteed is reached).
    // Mount slots resolve through their reins item for the same reason as the
    // boss arm: a counter stocks reins, never a mount key.
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (relic.kind !== 'item' && relic.kind !== 'mark' && relic.kind !== 'mount') continue;
      const awardId = awardIdForSlot(relic, slotId);
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (hint.sourceKind !== 'vendor') continue;
        checked += 1;
        if (!STOCK_BY_NPC.get(hint.sourceId)?.has(awardId)) {
          offenders.push(`${page.id}:${slotId} credits ${hint.sourceId}, whose stock lacks it`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: two Drowned Litany Marks-stock rares, two Collapsed
    // Reliquary rares off Brother Halven's counter, and the Valorsteed reins
    // off Marla's. Update deliberately with the authoring.
    expect(checked).toBeGreaterThanOrEqual(5);
    // Premise guard for the NPCS half specifically: without it every vendor
    // hint could still pass on delve stock alone while Marla's arm sat dead.
    expect(STOCK_BY_NPC.get('stablemaster_marla')?.has('reins_valorsteed')).toBe(true);
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
    // CRAFTED relics (the two Sanctum combo pieces) derive from ALL_RECIPES
    // instead: the profession that can make an item is the one its recipe
    // names. Nothing below restates the authoring; every map is built from live
    // data.
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

    // The crafted half, from the live recipe table. A slot can have several
    // recipes, so this is a SET: any profession that really makes the item is
    // an honest answer for it.
    const craftableBySlotId = new Map<string, Set<string>>();
    for (const recipe of ALL_RECIPES) {
      const professions = craftableBySlotId.get(recipe.resultItemId) ?? new Set<string>();
      professions.add(recipe.professionId);
      craftableBySlotId.set(recipe.resultItemId, professions);
    }
    // Premise guard: the crafted arm really reaches the two catalogued combo
    // pieces, so a renamed resultItemId reds here rather than turning the arm
    // into a silent "no live table derives a profession" for both.
    expect(craftableBySlotId.get('boundstone_helm')).toBeDefined();
    expect(craftableBySlotId.get('gravewyrm_gauntlets')).toBeDefined();

    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (hint.sourceKind !== 'profession') continue;
        // masterwork:<craft> rows are DERIVED from the mark id itself, so they
        // cannot disagree with their own source by construction; the craftById
        // test below is their pin. Everything else must be derivable here, and
        // an unknown slot is an offender rather than a skip, so a new
        // profession-hinted relic cannot escape this sweep by being unlisted.
        if (slotId.startsWith('masterwork:')) continue;
        checked += 1;
        const gathered = expectedBySlotId.get(slotId);
        const crafted = craftableBySlotId.get(slotId);
        if (gathered === undefined && crafted === undefined) {
          offenders.push(`${page.id}:${slotId} has no live table deriving a profession`);
        } else if (gathered !== hint.sourceId && !crafted?.has(hint.sourceId)) {
          const live = [gathered, ...(crafted ?? [])].filter((id) => id !== undefined).join('/');
          offenders.push(`${page.id}:${slotId} credits ${hint.sourceId}, live tables say ${live}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: three field-note marks, three fine-material jackpots, and
    // the two crafted Sanctum combo pieces.
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it('authored craft professions resolve through the live craftById lookup', () => {
    // The gathering ids are covered by the GATHERING_PROFESSIONS half of the
    // set above; this walks the craft half through the real accessor the call
    // sites use, which throws rather than answering undefined on a bad id.
    const crafts = new Set(
      RELIC_SLOTS.flatMap(({ page, relic }) => [...reliquaryRelicSource(page, relic)])
        .filter((h) => h.sourceKind === 'profession')
        .map((h) => h.sourceId)
        .filter((id) => !(id in GATHERING_PROFESSIONS)),
    );
    // Vacuity floor: the four gear-capable crafts on the masterwork page (the
    // two crafted Sanctum relics name two of those same four; engineering is
    // pended, see the gear-capability pin).
    expect(crafts.size).toBeGreaterThanOrEqual(4);
    for (const craftId of crafts) {
      expect(() => craftById(craftId), craftId).not.toThrow();
      expect(craftById(craftId).id, craftId).toBe(craftId);
    }
  });

  it('every delve hint names a delve that can really award the relic', () => {
    // Same truth standard as boss and vendor, on the arm that made the chests
    // sayable. "Awardable from that delve" is enumerated BEHAVIORALLY, not
    // read off a table: the chest function is driven over every loot tier,
    // every class, both bountiful arms and both rng branches (the same
    // enumeration the page-equality tests use), plus the delve's Marks counter.
    // A delve hint on an item no chest or counter of that delve can produce is
    // exactly the wrong-door error the pin exists to catch.
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const awardId = awardIdForSlot(relic, slotId);
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (hint.sourceKind !== 'delve') continue;
        checked += 1;
        if (!DELVE_AWARDABLE_IDS.get(hint.sourceId)?.has(awardId)) {
          offenders.push(
            `${page.id}:${slotId} credits delve ${hint.sourceId}, which never gives it`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: two Collapsed Reliquary rares plus the six Drowned Litany
    // Rite-chest slots.
    expect(checked).toBeGreaterThanOrEqual(8);
    // Premise guard: both delves really enumerate a non-trivial award set, so a
    // chest function that started returning nothing would red here rather than
    // leaving the sweep above comparing against an empty set it can never fail.
    // Literal per-delve floors, measured (the CHEST_FN_BY_DELVE floors are for
    // the RARE+ page derivation and are far looser than these full sets).
    const AWARDABLE_FLOORS: Record<string, number> = {
      collapsed_reliquary: 9,
      drowned_litany: 29,
    };
    expect(Object.keys(AWARDABLE_FLOORS).sort()).toEqual(Object.keys(DELVES).sort());
    for (const [delveId, floor] of Object.entries(AWARDABLE_FLOORS)) {
      expect(DELVE_AWARDABLE_IDS.get(delveId)?.size ?? 0, delveId).toBeGreaterThanOrEqual(floor);
    }
  });

  it('every rift hint names the rank whose reins table really carries the mount', () => {
    // Rank is the claim, so rank is what gets checked: a B hint on a blue-tier
    // mount is a real rank and a real mount and still the wrong door, because
    // ranks do not inherit each other's tiers (one mount roll per clear, for
    // that rank's table only). Resolved through the mount's ownership reins,
    // which is the id the ladder actually pushes onto the corpse.
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (hint.sourceKind !== 'rift') continue;
        checked += 1;
        if (relic.kind !== 'mount') {
          offenders.push(`${page.id}:${slotId} is a ${relic.kind} slot with a rift hint`);
          continue;
        }
        const rank = hint.sourceId as keyof typeof RIFT_REINS_BY_RANK;
        const table = RIFT_REINS_BY_RANK[rank];
        expect(table, `rift rank ${hint.sourceId}`).toBeDefined();
        if (!table?.includes(reinsItemIdForMount(slotId))) {
          offenders.push(`${page.id}:${slotId} credits rift rank ${rank}, whose reins lack it`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: two green reins, two blue, two epic.
    expect(checked).toBeGreaterThanOrEqual(6);
    // Premise guard: the three tables are distinct and non-empty, so a
    // collapsed ladder cannot make every rank answer true for every mount.
    const tables = Object.values(RIFT_REINS_BY_RANK);
    expect(tables.every((t) => t.length > 0)).toBe(true);
    expect(new Set(tables.flatMap((t) => [...t])).size).toBe(
      tables.reduce((sum, t) => sum + t.length, 0),
    );
    // Literal, for the same reason as the storefront id: the rank letters are
    // both the authored sourceIds and the keys this pin indexes by, so only a
    // literal catches a wholesale rename of the rank space.
    expect([...RELIQUARY_RIFT_RANK_SOURCE_IDS]).toEqual(['B', 'A', 'S']);
    expect([...RELIQUARY_ACTIVITY_SOURCE_IDS]).toEqual(['corpse_harvest', 'masterwork_craft']);
  });

  it('every quest hint names a quest whose live itemRewards include the relic', () => {
    // The quest arm's truth standard. A quest is only a door if it HANDS OVER
    // the relic: q_riding_lessons is the cautionary case (it gates Riding and
    // awards no item at all), which is why the Valorsteed names Marla instead.
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const awardId = awardIdForSlot(relic, slotId);
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (hint.sourceKind !== 'quest') continue;
        checked += 1;
        const rewards = Object.values(QUESTS[hint.sourceId]?.itemRewards ?? {});
        if (!rewards.includes(awardId)) {
          offenders.push(`${page.id}:${slotId} credits ${hint.sourceId}, which never awards it`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: wyrmcult_grand_robe's q_gravewyrm mage reward.
    expect(checked).toBeGreaterThanOrEqual(1);
    // The negative premise this arm is calibrated against: q_riding_lessons is
    // a live quest that awards NO item, so a quest hint there would fail above.
    expect(QUESTS.q_riding_lessons).toBeDefined();
    expect(Object.values(QUESTS.q_riding_lessons.itemRewards ?? {})).toEqual([]);
  });

  it('every store hint sits on a live Armory skin and names the one storefront', () => {
    // The storefront is an id space of exactly one, so the truth standard is
    // the SLOT: only an account weapon skin is granted this way
    // (grantWeaponSkinsToAccount), and it must be a live WEAPON_SKINS id.
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (hint.sourceKind !== 'store') continue;
        checked += 1;
        if (relic.kind !== 'weapon_skin') {
          offenders.push(`${page.id}:${slotId} is a ${relic.kind} slot with a store hint`);
        } else if (!Object.hasOwn(WEAPON_SKINS, slotId)) {
          offenders.push(`${page.id}:${slotId} is not a live Armory skin`);
        }
        if (hint.sourceId !== RELIQUARY_STORE_SOURCE_ID) {
          offenders.push(`${page.id}:${slotId} names storefront ${hint.sourceId}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: all 29 skins inherit the page default.
    expect(checked).toBeGreaterThanOrEqual(29);
    // Literal, not a self-comparison: every check above compares the authored
    // id against the same exported constant, so renaming the constant would
    // move both sides and pass. The id is the label key stem the client
    // re-localizes from, so a rename is a deliberate act with i18n work behind
    // it, and it reds here first.
    expect(RELIQUARY_STORE_SOURCE_ID).toBe('woc_store');
  });

  it('every activity hint names the write site that really awards the relic', () => {
    // Activities have no engine table to index, so the pin is the write site
    // itself: src/sim/interaction.ts awards gather_event:perfect_specimen plus
    // the HARVEST_COMPONENT_SPECIMENS jackpots on a corpse harvest, and
    // src/sim/professions/crafting.ts writes masterwork:first on the first
    // lifetime masterwork proc. Both directions are pinned, so an activity that
    // stopped awarding a slot (or a slot that quietly joined one) reds.
    const bySlotKind = new Map<string, string[]>();
    let checked = 0;
    const offenders: string[] = [];
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      for (const hint of reliquaryRelicSource(page, relic)) {
        if (hint.sourceKind !== 'activity') continue;
        checked += 1;
        if (!ACTIVITY_SOURCE_IDS.has(hint.sourceId)) {
          offenders.push(`${page.id}:${slotId} names unknown activity ${hint.sourceId}`);
          continue;
        }
        const key = `${hint.sourceId}:${relic.kind}`;
        bySlotKind.set(key, [...(bySlotKind.get(key) ?? []), slotId]);
      }
    }
    expect(offenders).toEqual([]);
    // The corpse-harvest ITEM slots are EXACTLY the live harvest specimens: a
    // new harvest family joins here on its own, and a specimen that left the
    // table drops out, so neither can drift away from interaction.ts.
    expect([...(bySlotKind.get('corpse_harvest:item') ?? [])].sort()).toEqual(
      [...Object.values(HARVEST_COMPONENT_SPECIMENS)].sort(),
    );
    // The two mark slots are literal, because the write sites spell them
    // literally (interaction.ts and professions/crafting.ts respectively).
    expect(bySlotKind.get('corpse_harvest:mark')).toEqual(['gather_event:perfect_specimen']);
    expect(bySlotKind.get('masterwork_craft:mark')).toEqual(['masterwork:first']);
    // Vacuity floor: five specimens plus the two marks.
    expect(checked).toBeGreaterThanOrEqual(7);
  });

  it('every zone hint names the zone where its credited rare really camps', () => {
    // The zone arm's truth standard, and the reason it is only authored
    // alongside a boss hint: a zone alone says nothing checkable, but "this
    // rare, in this zone" is derivable end to end. The rare's camp center comes
    // from the live merged CAMPS table and is resolved through the production
    // zoneContaining, so moving a camp across a zone border reds here.
    const offenders: string[] = [];
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const hints = reliquaryRelicSource(page, relic);
      const zoneHints = hints.filter((h) => h.sourceKind === 'zone');
      if (zoneHints.length === 0) continue;
      const bossHints = hints.filter((h) => h.sourceKind === 'boss');
      // EXACTLY one boss AND exactly one zone, matching BOTH halves of the
      // view's compose guard (bosses === 1 && zones === 1): any other shape
      // leaves a zone rendering as a lonely "Found in {zone}" line the
      // composition never intended, and zero bosses says nothing checkable.
      if (!zoneHintShapeOk(bossHints.length, zoneHints.length)) {
        offenders.push(
          `${page.id}:${slotId} pairs ${zoneHints.length} zone hints with ${bossHints.length} boss hints (need exactly 1 of each)`,
        );
        continue;
      }
      for (const zoneHint of zoneHints) {
        checked += 1;
        for (const bossHint of bossHints) {
          const camps = CAMPS.filter((c) => c.mobId === bossHint.sourceId);
          if (camps.length === 0) {
            offenders.push(
              `${page.id}:${slotId} credits ${bossHint.sourceId}, which camps nowhere`,
            );
            continue;
          }
          for (const camp of camps) {
            const zone = zoneContaining(camp.center.x, camp.center.z);
            if (zone?.id !== zoneHint.sourceId) {
              offenders.push(
                `${page.id}:${slotId} places ${bossHint.sourceId} in ${zoneHint.sourceId}, live zone is ${zone?.id ?? 'none'}`,
              );
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // Vacuity floor: the two open-world set drops.
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it('the zone sweep shape gate can actually trip (synthetic shapes)', () => {
    // Live data is always exactly 1+1, so without these the gate could rot
    // (invert, or widen to >= 1) with the sweep still green, which is the one
    // predicate in the truth-pin set that would fail silently.
    expect(zoneHintShapeOk(1, 1)).toBe(true);
    expect(zoneHintShapeOk(2, 1)).toBe(false);
    expect(zoneHintShapeOk(1, 2)).toBe(false);
    expect(zoneHintShapeOk(0, 1)).toBe(false);
  });

  it('every title relic hints its OWN deed (the derived hint cannot shift)', () => {
    // titles() derives the hint from the slot id, which makes drift
    // structurally impossible today; this pin is what makes a future
    // hand-authored title row that names a NEIGHBOURING deed red instead of
    // shipping a systematically shifted mapping the distinct-count and
    // resolvability sweeps cannot see.
    let checked = 0;
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (relic.kind !== 'title') continue;
      const hints = reliquaryRelicSource(page, relic);
      expect(hints, slotId).toHaveLength(1);
      expect(hints[0], slotId).toEqual({ sourceKind: 'deed', sourceId: relic.deedId });
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(33);
  });

  it('every dungeon-page clearSource names a live dungeon (the composed place half)', () => {
    // The bossDungeon line's place half comes from the page clear meter, not
    // from any relic hint, so the per-hint resolvability sweeps never see it;
    // a renamed dungeon id would silently degrade every boss line on the page
    // to the plain boss sentence. Pin it at authoring.
    let checked = 0;
    for (const page of RELIQUARY_PAGES) {
      if (page.clearSource?.kind !== 'dungeon') continue;
      checked += 1;
      expect(page.clearSource.dungeonId in DUNGEONS, `${page.id} names a live dungeon`).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });
});

describe('Reliquary source hint coverage', () => {
  it('every relic resolves to a source except the pinned pending rulings', () => {
    const unhinted: string[] = [];
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (reliquaryRelicSource(page, relic).length > 0) continue;
      if (PENDING_KEYS.has(slotKey(page.id, slotId))) continue;
      unhinted.push(`${page.id}:${slotId}`);
    }
    expect(unhinted).toEqual([]);
  });

  it('SOURCE_PENDING_RULING is exactly the un-hinted set (no stale exclusions)', () => {
    // The other direction: an id that GAINS a hint must lose its pending row in
    // the same change, so the exclusion list can never quietly outlive the
    // ruling that retires it. "Un-hinted" is now the resolver's EMPTY LIST,
    // which is the same claim it used to make with null.
    const actuallyUnhinted = new Set<string>();
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (reliquaryRelicSource(page, relic).length === 0)
        actuallyUnhinted.add(slotKey(page.id, slotId));
    }
    expect([...actuallyUnhinted].sort()).toEqual([...PENDING_KEYS].sort());
    // Vacuity floor: this suite is worth nothing if almost everything is
    // excluded. Literal: tighten as rulings land. 239 = 242 slots minus the
    // two gap mounts minus the pended masterwork:engineering.
    const hinted = RELIC_SLOTS.length - actuallyUnhinted.size;
    expect(hinted).toBeGreaterThanOrEqual(239);
  });

  it('no relic authors an EMPTY hint list (a sourceless slot stays keyless)', () => {
    // An empty array would resolve to the same empty answer a bare slot gives,
    // but through a different door: it carries a `source` key, so the
    // own-hint-wins precedence fires and a page default is suppressed by an
    // authoring that says nothing. Never author one; sourcelessness is the
    // absence of the key. (The ReliquarySourceHints tuple type now makes this
    // a tsc error too; this runtime arm stays as the belt for a cast.)
    const offenders: string[] = [];
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const own = relic.source;
      if (own !== undefined && !('sourceKind' in own) && own.length === 0) {
        offenders.push(slotKey(page.id, slotId));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no relic repeats a (kind, id) door inside one hint list', () => {
    // One line per hint with no dedup is the rendering contract, so a
    // duplicated door would paint two byte-identical tooltip lines and repeat
    // itself inside the aria fold. Nothing else guards it; authoring is where
    // it must stay impossible.
    const offenders: string[] = [];
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const hints = reliquaryRelicSource(page, relic);
      const seen = new Set<string>();
      for (const hint of hints) {
        const key = hintKey(hint);
        if (seen.has(key)) offenders.push(`${slotKey(page.id, slotId)} repeats ${key}`);
        seen.add(key);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reliquaryRelicSource answers FROZEN lists on all three arms', () => {
    // The list arm returns the catalog's OWN array by reference, so an
    // unfrozen answer would let one caller's in-place sort or push rewrite the
    // module-level catalog for the whole process, server included. The two
    // wrapper arms freeze their fresh copies too, so a caller cannot learn to
    // mutate on the cheap arms and then corrupt the shared one.
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      expect(Object.isFrozen(reliquaryRelicSource(page, relic)), slotKey(page.id, slotId)).toBe(
        true,
      );
    }
    // The empty arm as well (shared constant).
    expect(
      Object.isFrozen(
        reliquaryRelicSource(undefined, { kind: 'item', itemId: 'not_authored_anywhere' }),
      ),
    ).toBe(true);
  });

  it('the surviving pending rows are the three slots content awards no route at all', () => {
    // The page-wide Horizons rulings are EXECUTED: mounts and skins are no
    // longer derived from the catalog lists (the derivation era ended when the
    // rulings landed), so the identity pins to RELIQUARY_HORIZON_MOUNTS and
    // RELIQUARY_HORIZON_WEAPON_SKINS are gone with them. What is left is a
    // hand-listed set of CONTENT gaps, and hand-listing is the point: a new
    // mount must now be authored or deliberately added here, never auto-enrol.
    expect(Object.keys(SOURCE_PENDING_RULING)).toEqual([
      'horizons_mounts',
      'professions_masterwork',
    ]);
    expect(SOURCE_PENDING_RULING.horizons_mounts).toEqual([
      'drakemaw_raptor',
      'terrorspark_groundshaker',
    ]);
    // masterwork:engineering pended by the QA ruling 2026-08-07: no
    // engineering recipe can proc a masterwork (see the gear-capability pin),
    // so its former profession hint named a door that awards nothing.
    expect(SOURCE_PENDING_RULING.professions_masterwork).toEqual(['masterwork:engineering']);
    // All are still live catalog slots, so the exclusion cannot outlive them.
    for (const mountId of SOURCE_PENDING_RULING.horizons_mounts) {
      expect(RELIQUARY_HORIZON_MOUNTS, mountId).toContain(mountId);
    }
    expect(RELIQUARY_PROFESSION_MARKS.masterworkByCraft).toContain('masterwork:engineering');
    // And the skins page really is fully answered now, which is the half of the
    // executed ruling this row can no longer show.
    expect(RELIQUARY_HORIZON_WEAPON_SKINS.length).toBe(29);
    expect(RELIQUARY_PAGES_BY_ID.horizons_weapon_skins.sourceDefault).toEqual({
      sourceKind: 'store',
      sourceId: RELIQUARY_STORE_SOURCE_ID,
    });
  });

  it('multi-source pages give every relic its OWN hint (no inherited stragglers)', () => {
    // A page whose relics really come from two or more sources must not lean on
    // a page default for any of them: one inherited straggler would answer with
    // a confidently wrong boss. Pending-ruling ids are exempt because they carry
    // no hint at all, which is never wrong, only absent. EVERY relic kind now
    // carries hints, so the rule covers every kind (the old item-only filter
    // quietly skipped the mounts page, the widest multi-source page there is).
    const offenders: string[] = [];
    for (const page of RELIQUARY_PAGES) {
      if (distinctSourceKeys(page.id).size < 2) continue;
      for (const relic of page.relics) {
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
    // different stories depending on which page they opened. The comparison is
    // over the WHOLE door list, so a page that names two of a relic's three
    // doors disagrees with the page that names all three.
    const byId = new Map<string, Map<string, string[]>>();
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const hints = reliquaryRelicSource(page, relic);
      if (hints.length === 0) continue;
      const key = hintListKey(hints);
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

  it('every hinted relic acknowledges every comparable live award route', () => {
    // The wyrmcult_grand_robe class of error: a hint that names one live route
    // while another comparable route exists unacknowledged sends a player
    // confidently to the wrong door, and the per-route truth pins above cannot
    // see it (they only ask whether the CREDITED source awards the relic, never
    // whether something else also does). This walks NINE award-path families
    // for every hinted slot of every kind: mob loot, heroic boss loot, delve
    // shop stock, NPC vendor stock, guaranteed quest class rewards, crafting
    // recipes, delve chests, the Rift reins ladder, and the account storefront,
    // plus the activity write sites. A route is acknowledged when ANY hint on
    // the relic names it, when a quest's own kill objective targets a credited
    // mob (the quest is the same door), or when the curated dominated-rate
    // table below carries it. Anything else reds.
    //
    // Mounts, skins, marks and titles are walked too, not only items: a mount
    // resolves its routes through its ownership REINS item, a skin through the
    // storefront family, and a mark through the activity write sites. Leaving
    // them out was what let the Horizons pages carry unpinned answers.
    //
    // KNOWN EXCLUSIONS, named so the omissions are decisions, not oversights:
    // - The Rift clear GEAR payout (addRiftClearGearLoot pulls one guaranteed
    //   item from riftNormalClearPool / riftHeroicClearPool). PERMANENTLY
    //   EXCLUDED, and this is the Phase 13b ruling, not a deferral: those two
    //   pools are DERIVED mirrors of the whole five-man tier ("whatever a
    //   normal or heroic dungeon could drop"), paid as ONE uniform rng.int pick
    //   across the entire pool per clear. A pool that hands over one random
    //   item from a 35-plus-id tier is the tier's background luck, not a route
    //   a player can aim at a specific relic, and the Reliquary's source line
    //   answers "where do I go to hunt THIS". The rift MOUNT ladder is
    //   different in kind and IS listed: RIFT_GREEN / BLUE / EPIC_MOUNT_REINS
    //   name those exact reins as the ladder's own two-per-tier award, and for
    //   the epic pair the rift is the sole source. The liveness pin below keeps
    //   the excluded subject from silently vanishing.
    // - HEROIC_VENDOR_STOCK: zero hinted relics appear in it today (verified).
    //   A hint on one would need this sweep to grow that arm first.
    // - The heroic variant swap (loot_roll.ts turns a base drop into its
    //   heroic_<base> variant): heroic variants are deliberately not
    //   catalogued (see the header of this catalog), so no hinted slot can be
    //   one.
    // Premise guards: the shared maps really carry live data, so an emptied
    // family cannot leave the sweep comparing against nothing.
    expect(ROUTE_MAPS.recipesByItem.size).toBeGreaterThan(0);
    expect(ROUTE_MAPS.storeSkinIds.size).toBeGreaterThan(0);

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
    const routesByFamily: Record<RouteFamily, number> = {
      mob: 0,
      heroic: 0,
      vendor: 0,
      quest: 0,
      recipe: 0,
      delveChest: 0,
      riftReins: 0,
      store: 0,
      activity: 0,
    };
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      const hints = reliquaryRelicSource(page, relic);
      if (hints.length === 0) continue;
      const awardId = awardIdForSlot(relic, slotId);
      const { counts, unacknowledged } = judgeSlotRoutes(relic.kind, slotId, awardId, hints);
      for (const family of Object.keys(counts) as RouteFamily[]) {
        routesByFamily[family] += counts[family];
      }
      for (const routeKey of unacknowledged) {
        const exception = `${page.id}:${slotId}:${routeKey}`;
        if (ACKNOWLEDGED_SECONDARY_ROUTES.has(exception)) {
          consumed.add(exception);
          continue;
        }
        offenders.push(`${page.id}:${slotId} (${hintListKey(hints)}) also: ${routeKey}`);
      }
    }
    expect(offenders).toEqual([]);
    // Both directions: an exception the sweep no longer consumes is stale.
    expect([...ACKNOWLEDGED_SECONDARY_ROUTES].filter((k) => !consumed.has(k))).toEqual([]);
    // Vacuity floors PER FAMILY, exact to today's catalog (the file's usual
    // regime; update deliberately with the authoring). One total would let
    // the small families vanish inside the mob count's margin: the quest arm
    // is the arm that caught wyrmcult_grand_robe.
    expect(routesByFamily.mob).toBeGreaterThanOrEqual(146);
    expect(routesByFamily.heroic).toBeGreaterThanOrEqual(47);
    expect(routesByFamily.vendor).toBeGreaterThanOrEqual(5);
    expect(routesByFamily.quest).toBeGreaterThanOrEqual(7);
    expect(routesByFamily.recipe).toBeGreaterThanOrEqual(2);
    expect(routesByFamily.delveChest).toBeGreaterThanOrEqual(8);
    expect(routesByFamily.riftReins).toBeGreaterThanOrEqual(6);
    expect(routesByFamily.store).toBeGreaterThanOrEqual(29);
    expect(routesByFamily.activity).toBeGreaterThanOrEqual(7);
    const checkedRoutes = Object.values(routesByFamily).reduce((a, b) => a + b, 0);
    expect(checkedRoutes).toBeGreaterThanOrEqual(257);
  });

  it('every acknowledgment family can actually fail (one doctored miss per family)', () => {
    // The sweep above proves no offender EXISTS; it cannot prove each family
    // still knows how to produce one. Only the mob family had an implicit
    // negative arm (the curated exceptions are consumed mob routes), so any of
    // the other eight acknowledgment checks could rot to always-true and the
    // suite would stay green. Each case below hands the shared judge a REAL
    // slot with a doctored hint list that omits exactly that family's live
    // route, and requires exactly that route back.
    const expectMiss = (
      relicKind: ReliquaryRelicDef['kind'],
      slotId: string,
      awardId: string,
      hints: readonly ReliquarySourceHint[],
      family: RouteFamily,
      routeKey: string,
    ): void => {
      const { unacknowledged } = judgeSlotRoutes(relicKind, slotId, awardId, hints);
      expect(unacknowledged, `${family} misses ${routeKey}`).toContain(routeKey);
    };
    const boss = (id: string): ReliquarySourceHint => ({ sourceKind: 'boss', sourceId: id });
    // mob: boundstone_helm minus its boneguard trash route.
    expectMiss(
      'item',
      'boundstone_helm',
      'boundstone_helm',
      [boss('korgath_the_bound'), { sourceKind: 'profession', sourceId: 'armorcrafting' }],
      'mob',
      'mob:sanctum_boneguard',
    );
    // heroic: grag_bear minus its Nythraxis heroic table.
    expectMiss(
      'mount',
      'grag_bear',
      reinsItemIdForMount('grag_bear'),
      [boss('ysolei'), boss('wildheart_high_priest'), { sourceKind: 'rift', sourceId: 'A' }],
      'heroic',
      'heroic:nythraxis_scourge_of_thornpeak',
    );
    // vendor: deacon_reliquary_helm with neither the vendor nor the fronting
    // delve named (a boss hint acknowledges nothing here).
    expectMiss(
      'item',
      'deacon_reliquary_helm',
      'deacon_reliquary_helm',
      [boss('morthen')],
      'vendor',
      'vendor:brother_halven',
    );
    // quest: the robe minus its quest hint; korgath is NOT q_gravewyrm's kill
    // objective (korzul is), so the same-door arm cannot save it.
    expectMiss(
      'item',
      'wyrmcult_grand_robe',
      'wyrmcult_grand_robe',
      [boss('korgath_the_bound')],
      'quest',
      'quest:q_gravewyrm',
    );
    // recipe: boundstone_helm minus its profession hint.
    expectMiss(
      'item',
      'boundstone_helm',
      'boundstone_helm',
      [boss('sanctum_boneguard'), boss('korgath_the_bound')],
      'recipe',
      'recipe:recipe_ironbound_warplate_helm',
    );
    // delveChest: deacon_reliquary_helm with only the vendor named.
    expectMiss(
      'item',
      'deacon_reliquary_helm',
      'deacon_reliquary_helm',
      [{ sourceKind: 'vendor', sourceId: 'brother_halven' }],
      'delveChest',
      'delveChest:collapsed_reliquary',
    );
    // riftReins: an epic-reins mount that forgets its rank.
    expectMiss(
      'mount',
      'aether_hover_cycle',
      reinsItemIdForMount('aether_hover_cycle'),
      [{ sourceKind: 'vendor', sourceId: 'stablemaster_marla' }],
      'riftReins',
      'riftReins:S',
    );
    // store: a live skin whose hint list forgot the storefront.
    expectMiss(
      'weapon_skin',
      'guildmark_arming_sword',
      'guildmark_arming_sword',
      [boss('morthen')],
      'store',
      `store:${RELIQUARY_STORE_SOURCE_ID}`,
    );
    // activity: a pristine specimen credited to a profession instead.
    expectMiss(
      'item',
      'pristine_hide',
      'pristine_hide',
      [{ sourceKind: 'profession', sourceId: 'mining' }],
      'activity',
      'activity:corpse_harvest',
    );
    // The vendor family's SECOND acknowledgment shape, positively: naming the
    // delve names its board NPC's counter too. Every live vendor route today
    // is also acknowledged by a direct vendor hint, so without this case the
    // delve-fronting disjunct could be deleted with the whole battery green.
    const delveOnly = judgeSlotRoutes('item', 'deacon_reliquary_helm', 'deacon_reliquary_helm', [
      { sourceKind: 'delve', sourceId: 'collapsed_reliquary' },
    ]);
    expect(delveOnly.unacknowledged).not.toContain('vendor:brother_halven');
    // Premise: the route was really judged, not skipped (the counter counted).
    expect(delveOnly.counts.vendor).toBeGreaterThanOrEqual(1);
  });

  it('the two pending mounts really have ZERO live award routes (the row is justified)', () => {
    // The surviving SOURCE_PENDING_RULING row's whole claim is "no live table
    // awards either mount", and the acknowledgment sweep can never check it
    // (it short-circuits on un-hinted relics). This is the inverse sweep: the
    // day content gives either mount ANY route, this reds and forces the hint
    // plus the pending-row deletion in the same change, so the window can
    // never keep painting a blank silhouette content has learned to answer.
    for (const mountId of SOURCE_PENDING_RULING.horizons_mounts) {
      const reinsId = reinsItemIdForMount(mountId);
      const { counts } = judgeSlotRoutes('mount', mountId, reinsId, []);
      expect(counts, `${mountId} (${reinsId}) has no live award route`).toEqual({
        mob: 0,
        heroic: 0,
        vendor: 0,
        quest: 0,
        recipe: 0,
        delveChest: 0,
        riftReins: 0,
        store: 0,
        activity: 0,
      });
    }
    // The pended masterwork:engineering mark makes the same claim through a
    // different door: no family may count a live route for it (the activity
    // family maps masterwork_craft to masterwork:first only, and the
    // gear-capability pin above owns the "could the write site ever fire"
    // half, which these nine families cannot see).
    for (const markId of SOURCE_PENDING_RULING.professions_masterwork) {
      const { counts } = judgeSlotRoutes('mark', markId, markId, []);
      expect(counts, `${markId} has no live award route`).toEqual({
        mob: 0,
        heroic: 0,
        vendor: 0,
        quest: 0,
        recipe: 0,
        delveChest: 0,
        riftReins: 0,
        store: 0,
        activity: 0,
      });
    }
  });

  it('the named non-route exclusions still hold (self-checking, not comment-only)', () => {
    // The sweep's KNOWN EXCLUSIONS narrate three award surfaces it does not
    // walk because zero hinted relics appear in them. Each was "(verified)" by
    // hand; these assertions make the verification permanent, so the day a
    // hinted relic enters one, this reds and the sweep must grow the arm
    // rather than silently missing a door.
    const watchedAwardIds = new Set<string>();
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (reliquaryRelicSource(page, relic).length === 0) continue;
      watchedAwardIds.add(awardIdForSlot(relic, slotId));
    }
    // The two PENDING mounts' reins ride along: their whole pending claim is
    // "no route anywhere", and the nine-family inverse sweep above cannot see
    // these three excluded surfaces, so a pending reins entering one must red
    // HERE rather than leave the silhouette blank while content can answer.
    for (const mountId of SOURCE_PENDING_RULING.horizons_mounts) {
      watchedAwardIds.add(reinsItemIdForMount(mountId));
    }
    // Heroic quartermaster stock. Liveness premise first, on each set: an
    // emptied or renamed table would otherwise make its filter silently
    // vacuous, the exact failure mode the rift-pool pin below guards with its
    // own size floor. Floors are today's measured sizes.
    const heroicVendorIds = HEROIC_VENDOR_STOCK.map((o) => o.itemId);
    expect(heroicVendorIds.length).toBeGreaterThanOrEqual(10);
    expect(heroicVendorIds.filter((id) => watchedAwardIds.has(id))).toEqual([]);
    // Dungeon ground objects (chests and lootable props on dungeon floors).
    const groundObjectIds = Object.keys(DUNGEONS).flatMap((dungeonId) =>
      dungeonObjectItemIds(dungeonId),
    );
    expect(groundObjectIds.length).toBeGreaterThanOrEqual(7);
    expect(groundObjectIds.filter((id) => watchedAwardIds.has(id))).toEqual([]);
    // The Rift's own item family (progression gear, essence, gems, rare and
    // epic rift items, the two legendaries). Phase 21 owns any inclusion
    // decision; until then no hinted relic may sit in it.
    const riftItemIds = Object.keys(RIFT_ITEMS);
    expect(riftItemIds.length).toBeGreaterThanOrEqual(23);
    expect(riftItemIds.filter((id) => watchedAwardIds.has(id))).toEqual([]);
  });

  it('the excluded Rift GEAR pools still overlap the catalog they are excluded from', () => {
    // Liveness pin for the permanent exclusion above. The exclusion's whole
    // premise is that these pools DO cover much of the catalog and are still
    // not a route (one uniform pick across a whole tier). If the pools shrank
    // to nothing, the exclusion would be silently vacuous and nobody would
    // notice, so the subject is measured here: the union is 73 ids today and
    // 69 hinted item slots sit inside it.
    const pooled = new Set<string>([...riftNormalClearPool(), ...riftHeroicClearPool()]);
    // Backs the exclusion comment's own "35-plus-id tier" arithmetic.
    expect(pooled.size).toBeGreaterThanOrEqual(35);
    const hintedItemIds = new Set<string>();
    for (const { page, relic, slotId } of RELIC_SLOTS) {
      if (relic.kind !== 'item') continue;
      if (reliquaryRelicSource(page, relic).length === 0) continue;
      hintedItemIds.add(slotId);
    }
    const overlap = [...hintedItemIds].filter((id) => pooled.has(id));
    // Exact regime like every other floor in this file: 69 measured today.
    expect(overlap.length).toBeGreaterThanOrEqual(69);
  });

  it('every (relic kind, source kind) pairing in the catalog is one this file sweeps', () => {
    // Replaces the old "only deed hints leave the item and mark slots" pin,
    // whose premise expired by design when mounts and skins gained sources.
    // The standing danger is unchanged though: a hint kind landing on a relic
    // kind no truth pin above walks would ship UNPINNED. So the live pairings
    // are derived and compared against the literal set every pin in this file
    // covers, and a NEW pairing reds here until a sweep grows an arm for it.
    const derived = new Set<string>();
    for (const { page, relic } of RELIC_SLOTS) {
      for (const hint of reliquaryRelicSource(page, relic)) {
        derived.add(`${relic.kind} x ${hint.sourceKind}`);
      }
    }
    expect([...derived].sort()).toEqual(
      [
        // item: the dungeon / world tables, the two delve routes, the quest
        // hand-over, the crafted recipes, and the corpse-harvest jackpots.
        'item x boss',
        'item x vendor',
        'item x profession',
        'item x delve',
        'item x quest',
        'item x zone',
        'item x activity',
        // mark: the gathering professions and the two write sites.
        'mark x profession',
        'mark x activity',
        // mount: heroic tables, Marla's counter, the rift reins ladder.
        'mount x boss',
        'mount x vendor',
        'mount x rift',
        // weapon_skin: the account storefront, page-wide.
        'weapon_skin x store',
        // title: the deed that grants it, always.
        'title x deed',
      ].sort(),
    );
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
    // All ten defaults are live today (nine boss pages plus the storefront on
    // the skins page); update deliberately with the authoring.
    expect(defaults).toBe(10);
  });
});

describe('reliquaryRelicSource precedence', () => {
  it('prefers the relic hint over the page default', () => {
    // Live pairing: the Sanctum page has no default and every row owns its
    // sources, while the heroic page defaults for all of them.
    const sanctum = RELIQUARY_PAGES_BY_ID.conquerors_gravewyrm_sanctum;
    expect(sanctum.sourceDefault).toBeUndefined();
    const korzulRelic = sanctum.relics.find(
      (r) => r.kind === 'item' && r.itemId === 'fang_of_korzul',
    );
    expect(korzulRelic, 'fang_of_korzul').toBeDefined();
    expect(reliquaryRelicSource(sanctum, korzulRelic!)).toEqual([
      { sourceKind: 'boss', sourceId: 'korzul_the_gravewyrm' },
    ]);
    // A relic hint WINS over a page default that disagrees.
    const defaulted = RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt;
    expect(defaulted.sourceDefault).toEqual({ sourceKind: 'boss', sourceId: 'morthen' });
    expect(
      reliquaryRelicSource(defaulted, {
        kind: 'item',
        itemId: 'cryptbone_helm',
        source: { sourceKind: 'boss', sourceId: 'ysolei' },
      }),
    ).toEqual([{ sourceKind: 'boss', sourceId: 'ysolei' }]);
  });

  it('answers a multi-door relic with ALL its hints, in authored order', () => {
    // Order is presentation, so it is a contract: the client renders the list
    // as it comes, and a resolver that re-sorted or de-duplicated would change
    // what the player reads.
    const sanctum = RELIQUARY_PAGES_BY_ID.conquerors_gravewyrm_sanctum;
    const helm = sanctum.relics.find((r) => r.kind === 'item' && r.itemId === 'boundstone_helm');
    expect(helm, 'boundstone_helm').toBeDefined();
    expect(reliquaryRelicSource(sanctum, helm!)).toEqual([
      { sourceKind: 'boss', sourceId: 'sanctum_boneguard' },
      { sourceKind: 'boss', sourceId: 'korgath_the_bound' },
      { sourceKind: 'profession', sourceId: 'armorcrafting' },
    ]);
  });

  it('a relic list wins WHOLESALE over a page default (never merged)', () => {
    // The precedence rule multi-hint made possible to get wrong: a resolver
    // that concatenated instead of replacing would quietly append a door the
    // authoring left out, and every count pin in this file would still pass.
    const defaulted = RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt;
    expect(defaulted.sourceDefault).toEqual({ sourceKind: 'boss', sourceId: 'morthen' });
    const answered = reliquaryRelicSource(defaulted, {
      kind: 'item',
      itemId: 'cryptbone_helm',
      source: [
        { sourceKind: 'boss', sourceId: 'ysolei' },
        { sourceKind: 'vendor', sourceId: 'brother_halven' },
      ],
    });
    expect(answered).toEqual([
      { sourceKind: 'boss', sourceId: 'ysolei' },
      { sourceKind: 'vendor', sourceId: 'brother_halven' },
    ]);
    expect(answered.some((h) => h.sourceId === 'morthen')).toBe(false);
  });

  it('falls back to the page default as a one-element list, then to the empty list', () => {
    const bare: ReliquaryRelicDef = { kind: 'item', itemId: 'cryptbone_helm' };
    expect(reliquaryRelicSource(RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt, bare)).toEqual([
      { sourceKind: 'boss', sourceId: 'morthen' },
    ]);
    // A page with no default answers the empty list for an un-hinted relic.
    // That IS the answer ("content names no source"), not a missing value.
    expect(RELIQUARY_PAGES_BY_ID.horizons_mounts.sourceDefault).toBeUndefined();
    expect(
      reliquaryRelicSource(RELIQUARY_PAGES_BY_ID.horizons_mounts, {
        kind: 'mount',
        mountId: 'drakemaw_raptor',
      }),
    ).toEqual([]);
    // No page at all is the empty list, never a throw: the resolver is a lookup
    // the client calls per relic, not a validator.
    expect(reliquaryRelicSource(undefined, bare)).toEqual([]);
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
    expect(reliquaryRelicSource(shadow, shadow.relics[0])).toEqual([
      { sourceKind: 'zone', sourceId: 'synthetic_zone' },
    ]);
  });
});
