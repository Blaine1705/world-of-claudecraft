// The Emissary's Cache: the weekly quest's container item. Opening it hands
// the character one catch-up piece their class can use, plus a small stack of
// Heroic Marks. The piece comes from one of two shelves, picked with even odds:
//
//   - a Heroic dungeon piece (the Weekly Vault's `dungeon_heroic` catalog), or
//   - a Normal piece from the PREVIOUS raid tier (Nythraxis), the same shelf
//     the vault's world-quest row pays.
//
// The CURRENT raid tier (the Crucible of the Last Flame) is deliberately absent:
// its gear is earned in the raid or chosen from the vault's raid row, never
// handed out by a weekly errand. Tier-set pieces stay a raid-only earn too.
//
// Both shelves reuse the vault's catalog (src/sim/weekly_rewards.ts
// weeklyLootPool), so "a piece your class can use" means exactly what the vault
// means by it: equippable armor, weapon or off-hand of rare or epic quality that
// the class can wear, class locks respected. Server-authoritative: the shelf
// and the piece draw ctx.rng in a fixed order, and the item leaves the bag only
// when the contents have landed.
import { HEROIC_MARK_ITEM_ID } from './content/dungeon_difficulty';
import { NYTHRAXIS_RAID_BOSS_ID } from './content/heroic_loot';
import { ITEMS } from './data';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { ItemInstancePayload, PlayerClass } from './types';
import { WEEKLY_RAID_BOSSES, weeklyLootPool } from './weekly_rewards';

export const EMISSARY_CACHE_ITEM_ID = 'emissary_cache';
/** Marks tucked in beside the piece. */
export const EMISSARY_CACHE_MARKS = 3;
/** Odds the piece comes from the Heroic dungeon shelf (else the previous raid tier). */
export const EMISSARY_CACHE_DUNGEON_CHANCE = 0.5;

/** The vault's raid-unlock vector with only Nythraxis at Normal: feeding it to
 *  weeklyLootPool('raid') yields that raid's Normal catalog and nothing else. */
function previousTierUnlocks(): number[] {
  return WEEKLY_RAID_BOSSES.map((bossId) => (bossId === NYTHRAXIS_RAID_BOSS_ID ? 1 : 0));
}

/** The previous raid tier's Normal pieces the class can use, tier sets excluded. */
export function emissaryCacheRaidShelf(cls: PlayerClass): readonly string[] {
  return weeklyLootPool('raid', cls, previousTierUnlocks()).filter((id) => !ITEMS[id]?.set);
}

/** The Heroic dungeon pieces the class can use (the vault's own shelf). */
export function emissaryCacheDungeonShelf(cls: PlayerClass): readonly string[] {
  return weeklyLootPool('dungeon_heroic', cls);
}

/** Everything a cache can hand this class, both shelves, deduplicated. */
export function emissaryCachePoolForClass(cls: PlayerClass): readonly string[] {
  return [...new Set([...emissaryCacheDungeonShelf(cls), ...emissaryCacheRaidShelf(cls)])];
}

/** Open one cache: pick a shelf, then one piece from it (uniform draws), plus
 *  the marks. A class with an empty shelf falls back to the other one. Returns
 *  false when the character holds none or both shelves are empty. */
export function openEmissaryCache(
  ctx: SimContext,
  meta: PlayerMeta,
  consumeOneUnit: () => ItemInstancePayload | undefined,
): boolean {
  const dungeon = emissaryCacheDungeonShelf(meta.cls);
  const raid = emissaryCacheRaidShelf(meta.cls);
  if (dungeon.length + raid.length === 0) return false;
  if (ctx.countItem(EMISSARY_CACHE_ITEM_ID, meta.entityId) <= 0) return false;
  // The shelf draw is always made, so the sequence never depends on the class.
  const wantsDungeon = ctx.rng.chance(EMISSARY_CACHE_DUNGEON_CHANCE);
  const shelf = (wantsDungeon && dungeon.length > 0) || raid.length === 0 ? dungeon : raid;
  const piece = ctx.rng.pick([...shelf]);
  consumeOneUnit();
  ctx.addItem(piece, 1, meta.entityId);
  ctx.addItem(HEROIC_MARK_ITEM_ID, EMISSARY_CACHE_MARKS, meta.entityId);
  return true;
}
