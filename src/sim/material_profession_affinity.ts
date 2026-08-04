// Profession affinity for honest materials: which craft(s) on the ring
// consume an item as a reagent. Derived from the live recipe and enchant
// tables the same way material_taxonomy.ts derives material membership, so
// authoring a new recipe self-registers its reagents here with no hand list.
//
// Fine grades also inherit the base grade's consumers: a fine ore stands in
// for its ordinary version wherever a recipe requires the base
// (material_grades.ts materialGradeIds, downward substitution). Direct fine-
// only consumers (tool recipes) stay on the fine id alone.
//
// Presentation order follows CRAFT_RING so multi-craft lines read in a stable,
// intentional order rather than first-seen recipe order.
//
// HARD RULE: no file under src/sim may import this module (same cycle hazard
// as material_taxonomy.ts). UI and tests are the only consumers.

import { ENCHANTS } from './content/enchants';
import { CRAFT_RING } from './content/professions';
import { ALL_RECIPES } from './data';
import { baseMaterialFor } from './professions/material_grades';

/** Direct item id -> craft ids that list it as a reagent (recipes + enchants). */
function deriveDirectCraftConsumers(
  recipes: typeof ALL_RECIPES,
  enchants: typeof ENCHANTS,
): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  const add = (itemId: string, craftId: string): void => {
    let set = map.get(itemId);
    if (!set) {
      set = new Set();
      map.set(itemId, set);
    }
    set.add(craftId);
  };
  for (const recipe of recipes) {
    for (const reagent of recipe.reagents) {
      add(reagent.itemId, recipe.professionId);
    }
  }
  for (const enchant of Object.values(enchants)) {
    for (const reagent of enchant.reagents) {
      add(reagent.itemId, 'enchanting');
    }
  }
  return map;
}

const DIRECT_CONSUMERS: ReadonlyMap<string, ReadonlySet<string>> = deriveDirectCraftConsumers(
  ALL_RECIPES,
  ENCHANTS,
);

const CRAFT_RING_ORDER: readonly string[] = CRAFT_RING.map((craft) => craft.id);

/**
 * Craft ids that consume `itemId` as a reagent, in CRAFT_RING order.
 * Fine grades include the base grade's consumers (downward substitution).
 * Empty when nothing on the craft ring or enchant table consumes the id.
 */
export function craftIdsForMaterialItem(itemId: string): readonly string[] {
  const crafts = new Set<string>();
  const direct = DIRECT_CONSUMERS.get(itemId);
  if (direct) {
    for (const craftId of direct) crafts.add(craftId);
  }
  // Fine grade stands in for its base wherever a recipe lists the base.
  const baseItemId = baseMaterialFor(itemId);
  if (baseItemId !== undefined) {
    const baseCrafts = DIRECT_CONSUMERS.get(baseItemId);
    if (baseCrafts) {
      for (const craftId of baseCrafts) crafts.add(craftId);
    }
  }
  if (crafts.size === 0) return [];
  return CRAFT_RING_ORDER.filter((craftId) => crafts.has(craftId));
}
