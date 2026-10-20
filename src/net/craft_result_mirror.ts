// The online client's CraftResultView mirror of the authoritative craftResult
// event (#1127): the same projection the offline Sim keeps as lastCraftResult,
// so the crafting window reads one shape in both worlds.

import { cloneLootQuality } from '../sim/loot_quality';
import type { MaterialRarity } from '../sim/professions/gathering';
import type { SimEvent } from '../sim/types';
import type { CraftResultView } from '../world_api';

export function craftResultViewFromEvent(
  ev: Extract<SimEvent, { type: 'craftResult' }>,
): CraftResultView {
  const lootQuality = cloneLootQuality(ev.lootQuality);
  return {
    ok: ev.ok,
    recipeId: ev.recipeId,
    itemId: ev.itemId,
    count: ev.count,
    quality: ev.quality as MaterialRarity | undefined,
    masterwork: ev.masterwork,
    ...(lootQuality ? { lootQuality } : {}),
    reason: ev.reason,
  };
}
