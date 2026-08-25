// The ONE material-set derivation, shared by the two modules that must agree on
// what counts as a material: material_taxonomy.ts (the UI-side set, derived
// EAGERLY at module evaluation) and materials_vault.ts (the sim-side set,
// derived LAZILY on first use). The rule set itself lives here exactly once, so
// the vault can never drift from the chip and sweep the player already sees.
//
// This module is deliberately RUNTIME-IMPORT-FREE: every content table arrives
// as a parameter, and the table modules are pulled in with `import type` for
// their typeofs alone (legal on a value binding in a typeof position, and fully
// erased at build time). That is what lets the two consumers keep their own
// evaluation timing. It must never gain a runtime import and must never derive
// anything at module-evaluation time: either one puts a derive back inside
// data.ts's own evaluation cycle, where load order alone decides between a
// clean run and reading a still-undefined source table. The full statement of
// that hazard, and the static scan that guards it, live in the header of
// material_taxonomy.ts.

import type { ENCHANTS } from './content/enchants';
import type { HARVEST_COMPONENT_ITEMS, HARVEST_COMPONENT_SPECIMENS } from './content/professions';
import type { ALL_RECIPES, ITEMS } from './data';
import type { NODE_MATERIAL_TABLE } from './professions/gathering';
import type { MATERIAL_GRADES } from './professions/material_grades';
import type { SALVAGE_MATERIAL_BY_QUALITY } from './professions/salvage';

/** The content tables the material set derives from. Injectable so the
 *  per-source pins in tests/material_taxonomy.test.ts can prove each table is
 *  actually consulted (several sources fully overlap the reagent union today,
 *  so only injection can distinguish a live loop from a dead one). */
export interface MaterialSourceTables {
  nodeMaterialTable: typeof NODE_MATERIAL_TABLE;
  materialGrades: typeof MATERIAL_GRADES;
  harvestComponentItems: typeof HARVEST_COMPONENT_ITEMS;
  harvestComponentSpecimens: typeof HARVEST_COMPONENT_SPECIMENS;
  salvageMaterialByQuality: typeof SALVAGE_MATERIAL_BY_QUALITY;
  recipes: typeof ALL_RECIPES;
  enchants: typeof ENCHANTS;
  items: typeof ITEMS;
}

export function deriveMaterialItemIds(tables: MaterialSourceTables): ReadonlySet<string> {
  const sources = new Set<string>();
  // Node yields: every zone x node-type harvest grant.
  for (const byZone of Object.values(tables.nodeMaterialTable)) {
    for (const row of Object.values(byZone)) sources.add(row.itemId);
  }
  // Fine grades of the node yields (D8: the tool-outclassed harvest grant).
  for (const row of Object.values(tables.materialGrades)) sources.add(row.fineItemId);
  // Corpse-harvest components and their pristine-specimen jackpots.
  for (const id of Object.values(tables.harvestComponentItems)) sources.add(id);
  for (const id of Object.values(tables.harvestComponentSpecimens)) sources.add(id);
  // Salvage returns (the disenchant arm's outputs, arcane dusts and resonant
  // secondaries, arrive through the reagent union below: every one is consumed
  // by an enchant, the no-dead-end rule disenchant_reagents.ts records).
  for (const id of Object.values(tables.salvageMaterialByQuality)) sources.add(id);
  // Everything a crafting recipe or an enchant consumes. The kind filter below
  // drops tool/rod reagents (kind tool); raw fishing catches are kind junk and
  // stay IN as honest cooking reagents. Only junk-kind reagents are materials.
  for (const recipe of tables.recipes) {
    for (const reagent of recipe.reagents) sources.add(reagent.itemId);
  }
  for (const enchant of Object.values(tables.enchants)) {
    for (const reagent of enchant.reagents) sources.add(reagent.itemId);
  }
  return new Set([...sources].filter((id) => tables.items[id]?.kind === 'junk'));
}
