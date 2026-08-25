// The ONE sim-side lazy accessor for the honest material id set: the memoized
// deriveMaterialItemIds call the sim consults at RUNTIME (first use), never at
// module evaluation. Extracted from materials_vault.ts when the two-pool bag
// capacity mechanic became the derivation's third consumer (the vault and the
// bag pools must agree on what counts as a material, and both must agree with
// the UI-side material_taxonomy.ts set the player already sees), so the
// table-wiring block exists exactly once on the sim side.
//
// The lazy memo freezes the content tables at FIRST USE, while
// material_taxonomy.ts's eager MATERIAL_ITEM_IDS freezes them at module
// evaluation. Today both see the same finished tables (data.ts completes its
// heroic-variant merge inside its own evaluation), and the set-equality pins in
// tests/materials_vault.test.ts and tests/material_taxonomy.test.ts hold; if a
// future tunables seam ever mutates ITEMS post-boot, the two freeze points
// diverge and those pins will not see it in-process. Keep any such seam away
// from the material tables.
//
// Deriving lazily is what keeps this module legal to import from src/sim:
// material_taxonomy.ts derives EAGERLY and is therefore banned inside src/sim
// (the module-evaluation cycle rule its header states, enforced by the scan in
// tests/material_taxonomy.test.ts). This module must never derive at module
// evaluation; the content-table imports below are safe only because nothing
// reads them until the first materialItemIds() call, long after data.ts's own
// evaluation completes.
//
// Content-derived and therefore world-independent, so caching is not sim
// state: two Sims in one process share the same answer and neither can mutate
// it. `src/sim`-pure: no DOM/Three/render-ui-game-net imports, no rng.

import { ENCHANTS } from './content/enchants';
import { HARVEST_COMPONENT_ITEMS, HARVEST_COMPONENT_SPECIMENS } from './content/professions';
import { ALL_RECIPES, ITEMS } from './data';
import { deriveMaterialItemIds } from './material_derivation';
import { NODE_MATERIAL_TABLE } from './professions/gathering';
import { MATERIAL_GRADES } from './professions/material_grades';
import { SALVAGE_MATERIAL_BY_QUALITY } from './professions/salvage';

let memo: ReadonlySet<string> | null = null;

/** Every item id the sim treats as an honest material: the SAME set the
 *  bags/bank chip and the deposit-all sweep show the player, derived from the
 *  one shared rule set (material_derivation.ts) rather than approximated by
 *  kind (kind 'junk' over-includes the vendor trash and the trophies the
 *  taxonomy settlement deliberately excluded). Built on first use. */
export function materialItemIds(): ReadonlySet<string> {
  if (!memo) {
    memo = deriveMaterialItemIds({
      nodeMaterialTable: NODE_MATERIAL_TABLE,
      materialGrades: MATERIAL_GRADES,
      harvestComponentItems: HARVEST_COMPONENT_ITEMS,
      harvestComponentSpecimens: HARVEST_COMPONENT_SPECIMENS,
      salvageMaterialByQuality: SALVAGE_MATERIAL_BY_QUALITY,
      recipes: ALL_RECIPES,
      enchants: ENCHANTS,
      items: ITEMS,
    });
  }
  return memo;
}

/** Set membership on the id, for call sites that hold an id rather than a def. */
export function isMaterialItemId(itemId: string): boolean {
  return materialItemIds().has(itemId);
}
