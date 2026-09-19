// The Emissary's Cache (src/sim/emissary_cache.ts): two catch-up shelves per
// class (Heroic dungeon pieces and the previous raid tier at Normal), never the
// current raid tier, and opening one through the ordinary item-use path.
import { describe, expect, it } from 'vitest';
import { HEROIC_MARK_ITEM_ID } from '../src/sim/content/dungeon_difficulty';
import { IGNIVAR_LOOT_ITEM_IDS } from '../src/sim/content/ignivar_loot';
import { ITEMS } from '../src/sim/data';
import {
  EMISSARY_CACHE_DUNGEON_CHANCE,
  EMISSARY_CACHE_ITEM_ID,
  EMISSARY_CACHE_MARKS,
  emissaryCacheDungeonShelf,
  emissaryCachePoolForClass,
  emissaryCacheRaidShelf,
  openEmissaryCache,
} from '../src/sim/emissary_cache';
import { canEquipItem } from '../src/sim/equipment_rules';
import { Rng } from '../src/sim/rng';
import type { PlayerMeta } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { PlayerClass } from '../src/sim/types';
import { weeklyLootPool } from '../src/sim/weekly_rewards';

const CLASSES: PlayerClass[] = [
  'warrior',
  'paladin',
  'hunter',
  'rogue',
  'priest',
  'shaman',
  'mage',
  'warlock',
  'druid',
];

/** Every item id the current raid tier can drop, Normal or Heroic copy. */
function currentTierIds(): Set<string> {
  const ids = new Set<string>(IGNIVAR_LOOT_ITEM_IDS);
  for (const id of Object.keys(ITEMS)) {
    const base = ITEMS[id]?.heroicOf;
    if (base && ids.has(base)) ids.add(id);
  }
  return ids;
}

describe('the cache shelves', () => {
  it('gives every class two non-empty shelves of pieces it can use', () => {
    for (const cls of CLASSES) {
      const dungeon = emissaryCacheDungeonShelf(cls);
      const raid = emissaryCacheRaidShelf(cls);
      expect(dungeon.length, `${cls} dungeon shelf`).toBeGreaterThan(0);
      expect(raid.length, `${cls} raid shelf`).toBeGreaterThan(0);
      for (const id of [...dungeon, ...raid]) {
        const def = ITEMS[id];
        expect(def, id).toBeDefined();
        expect(['weapon', 'armor', 'held_offhand'], id).toContain(def.kind);
        expect(['rare', 'epic'], id).toContain(def.quality);
        expect(canEquipItem(cls, def), `${cls} ${id}`).toBe(true);
        expect(!def.requiredClass || def.requiredClass.includes(cls), `${cls} ${id}`).toBe(true);
      }
    }
  });

  it('never holds the current raid tier, and the raid shelf holds no tier-set piece', () => {
    const current = currentTierIds();
    expect(current.size).toBeGreaterThan(0);
    for (const cls of CLASSES) {
      for (const id of emissaryCachePoolForClass(cls)) {
        expect(current.has(id), `${cls} ${id} is current-tier raid gear`).toBe(false);
      }
      // Raid set bonuses are earned in the raid; Heroic dungeon sets are dungeon
      // loot the vault's dungeon row offers too, so they may appear there.
      for (const id of emissaryCacheRaidShelf(cls)) {
        expect(ITEMS[id].set, `${cls} ${id} is a raid tier-set piece`).toBeUndefined();
      }
    }
  });

  it('the shelves are the Weekly Vault catalog: Heroic dungeons, and the previous raid at Normal', () => {
    for (const cls of CLASSES) {
      expect(emissaryCacheDungeonShelf(cls)).toEqual(weeklyLootPool('dungeon_heroic', cls));
      // The raid shelf is a subset of the vault's full Normal raid catalog...
      const allNormalRaid = new Set(weeklyLootPool('raid', cls));
      for (const id of emissaryCacheRaidShelf(cls)) expect(allNormalRaid.has(id), id).toBe(true);
      // ...with no Heroic copies in it.
      for (const id of emissaryCacheRaidShelf(cls)) expect(ITEMS[id].heroicOf, id).toBeUndefined();
    }
  });
});

describe('opening a cache', () => {
  it('consumes one cache and hands over one class piece plus the marks, drawing the sim rng', () => {
    const sim = new Sim({ seed: 11, playerClass: 'mage', devCommands: true });
    sim.tick();
    const meta = sim.meta(sim.playerId)!;
    sim.useItem(EMISSARY_CACHE_ITEM_ID);
    expect(sim.countItem(EMISSARY_CACHE_ITEM_ID)).toBe(0);
    sim.chat(`/dev give ${EMISSARY_CACHE_ITEM_ID} 2`);
    expect(sim.countItem(EMISSARY_CACHE_ITEM_ID)).toBe(2);
    const marks = sim.countItem(HEROIC_MARK_ITEM_ID);
    const before = new Map(
      emissaryCachePoolForClass(meta.cls).map((id) => [id, sim.countItem(id)] as const),
    );
    sim.useItem(EMISSARY_CACHE_ITEM_ID);
    expect(sim.countItem(EMISSARY_CACHE_ITEM_ID)).toBe(1);
    expect(sim.countItem(HEROIC_MARK_ITEM_ID)).toBe(marks + EMISSARY_CACHE_MARKS);
    const gained = [...before].filter(([id, count]) => sim.countItem(id) === count + 1);
    expect(gained).toHaveLength(1);
    expect(ITEMS[gained[0][0]].requiredClass ?? ['mage']).toContain('mage');
    // The same seed opens the same piece: the draws are the sim's own rng.
    const twin = new Sim({ seed: 11, playerClass: 'mage', devCommands: true });
    twin.tick();
    twin.chat(`/dev give ${EMISSARY_CACHE_ITEM_ID} 2`);
    twin.useItem(EMISSARY_CACHE_ITEM_ID);
    expect(twin.countItem(gained[0][0])).toBe(sim.countItem(gained[0][0]));
  });

  it('draws from both shelves at roughly the pinned odds across seeds', () => {
    expect(EMISSARY_CACHE_DUNGEON_CHANCE).toBe(0.5);
    const dungeonShelf = new Set(emissaryCacheDungeonShelf('warrior'));
    const raidShelf = new Set(emissaryCacheRaidShelf('warrior'));
    let fromDungeon = 0;
    let fromRaid = 0;
    const TRIALS = 2000;
    for (let seed = 1; seed <= TRIALS; seed++) {
      const grants: string[] = [];
      const ctx = {
        rng: new Rng(seed),
        countItem: () => 1,
        addItem: (itemId: string) => grants.push(itemId),
      } as unknown as SimContext;
      const meta = { entityId: 1, cls: 'warrior' } as PlayerMeta;
      expect(openEmissaryCache(ctx, meta, () => undefined)).toBe(true);
      const piece = grants[0];
      expect(grants[1]).toBe(HEROIC_MARK_ITEM_ID);
      if (dungeonShelf.has(piece)) fromDungeon++;
      else if (raidShelf.has(piece)) fromRaid++;
    }
    expect(fromDungeon + fromRaid).toBe(TRIALS);
    expect(fromDungeon / TRIALS).toBeGreaterThan(0.45);
    expect(fromDungeon / TRIALS).toBeLessThan(0.55);
  });
});
