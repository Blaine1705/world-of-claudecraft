// The muster's weekly trophy: a slab of Balgath's hide, torn off his corpse.
//
// "A Chip Off the Foreman" (content/mirefen_muster_quests.ts) asks for proof of the kill.
// The proof is a quest item that appears in the corpse's loot for every contributor who
// carries the quest, and nobody else: a personal slot, like the rest of a world boss's
// loot, so a bag that is full at the kill can still take it any time the body lies in
// state. Deterministic and draw-free (a chance of 1 needs no roll), and appended after
// every roll, so the world-boss rng stream is untouched.

import { MUSTER_BOSS_TEMPLATE_ID } from './content/mirefen_muster';
import { BARROWHIDE_SLAB_ITEM_ID, MUSTER_TROPHY_QUEST_ID } from './content/mirefen_muster_quests';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { Entity, LootSlot } from './types';

/**
 * The trophy slot for this kill, or null: one personal slot naming every contributor with
 * the weekly active and no slab already in their bags.
 */
export function musterTrophySlot(
  ctx: SimContext,
  mob: Entity,
  contributors: readonly PlayerMeta[],
): LootSlot | null {
  if (mob.templateId !== MUSTER_BOSS_TEMPLATE_ID) return null;
  const owed: number[] = [];
  for (const meta of contributors) {
    const qp = meta.questLog.get(MUSTER_TROPHY_QUEST_ID);
    if (!qp || qp.state !== 'active') continue;
    if (ctx.countItem(BARROWHIDE_SLAB_ITEM_ID, meta.entityId) > 0) continue;
    owed.push(meta.entityId);
  }
  return owed.length > 0 ? { itemId: BARROWHIDE_SLAB_ITEM_ID, count: 1, personalFor: owed } : null;
}
