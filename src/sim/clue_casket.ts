// The Treasure Casket (Clue Scrolls, Stage 3): what opening the casket the last
// hunt step hands pays out (docs/design/clue-scrolls.md, "The casket"). Owns
// the payout FUNCTIONS only; the lifetime count lives on
// PlayerMeta.clueCasketsOpened (world_quest_state.ts) and feeds the
// clueCasketsOpened deed meter (deeds.ts), which is why the open site marks a
// full deeds pass. Every roll draws from ctx.rng, so the three hosts agree.

import { delveChestItemsForTier } from './content/delves/lockpick_tiers';
import { HEROIC_MARK_ITEM_ID } from './content/dungeon_difficulty';
import type { LootTier } from './lockpick';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

/** Copper a casket pays: CASKET_COPPER_BASE + CASKET_COPPER_PER_LEVEL * level.
 *  A WORKING RULE, not a classic-era formula: 4g flat plus 10s per level (a
 *  level-20 casket pays 6g), sized to sit above a day's world-quest copper
 *  without rivalling a dungeon clear. Tune here, never inline. */
export const CASKET_COPPER_BASE = 40_000;
export const CASKET_COPPER_PER_LEVEL = 1_000;
/** Heroic Marks every casket carries beside the piece. */
export const CASKET_HEROIC_MARKS = 3;
/** Odds of a rare second delve piece on top of the guaranteed one. */
export const CASKET_RARE_SECOND_PIECE_CHANCE = 0.05;
/** The delve chest ladder rung the casket draws from: its top. */
export const CASKET_DELVE_TIER: LootTier = 'premium';

export function treasureCasketCopper(level: number): number {
  return CASKET_COPPER_BASE + CASKET_COPPER_PER_LEVEL * Math.max(1, Math.floor(level));
}

/** One piece from the class's top delve chest rung. The ladder answers a LIST
 *  (one entry for most archetypes, a fixed pair for the rogue/hunter one), so a
 *  multi-entry answer is narrowed to one through the same rng. */
function rollCasketPiece(ctx: SimContext, meta: PlayerMeta): { itemId: string; count: number } {
  const pieces = delveChestItemsForTier(CASKET_DELVE_TIER, meta.cls, ctx.rng);
  return pieces.length === 1 ? pieces[0] : pieces[ctx.rng.int(0, pieces.length - 1)];
}

/**
 * The `clueCasket` item-use arm (items.ts useItem, after the busy/dead gates):
 * spends the casket, then pays copper, one delve piece, the marks and the
 * rare second piece, bumps the lifetime count, requests a full deeds pass and
 * emits clueCasketOpened with the granted item ids (one entry per grant, so
 * the marks appear once) and the copper. The HUD paints the lines from the
 * ids; no loot prose is emitted here beyond addItem's own receipt.
 */
export function openTreasureCasket(
  ctx: SimContext,
  meta: PlayerMeta,
  player: Entity,
  consumeOneUnit: () => void,
): void {
  const pid = meta.entityId;
  consumeOneUnit();
  const copper = treasureCasketCopper(player.level);
  const itemIds: string[] = [];
  const piece = rollCasketPiece(ctx, meta);
  ctx.addItem(piece.itemId, piece.count, pid);
  itemIds.push(piece.itemId);
  ctx.addItem(HEROIC_MARK_ITEM_ID, CASKET_HEROIC_MARKS, pid);
  itemIds.push(HEROIC_MARK_ITEM_ID);
  if (ctx.rng.chance(CASKET_RARE_SECOND_PIECE_CHANCE)) {
    const second = rollCasketPiece(ctx, meta);
    ctx.addItem(second.itemId, second.count, pid);
    itemIds.push(second.itemId);
  }
  meta.copper += copper;
  meta.clueCasketsOpened = (meta.clueCasketsOpened ?? 0) + 1;
  // The clueCasketsOpened meter reads the top-level PlayerMeta field with no
  // narrow dirty key (deeds.ts METER_DIRTY_KEYS), so the open site itself
  // requests the full pass.
  ctx.markDeedsDirty(pid);
  ctx.emit({ type: 'clueCasketOpened', itemIds, copper, pid });
}
