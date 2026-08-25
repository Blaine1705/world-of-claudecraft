// The honest material taxonomy: which items count as "materials" for the bank
// "Deposit materials" sweep and the shared bags/bank Materials chip. Before
// this module the material predicate was `kind junk || kind tool`, which swept
// in every gathering implement, both charms, the cosmetic tokens, grey vendor
// trash, and the rare-mob trophies; the 2026-08-01 settlement
// (docs/design/professions-tuning-packet-review.md, phase 19) narrowed it to
// the honest material set.
//
// A pure `src/sim` leaf on the market_query.ts content-derived-classifier
// precedent: the set is DERIVED from the content tables that make an item a
// material (a node yields it, it is a fine grade, a corpse harvest grants it
// plain or as a pristine specimen, a salvage returns it, or a crafting recipe
// or enchant consumes it), never a hand-authored id list, so authoring new
// content in any of those tables self-registers its material here with no
// code change. The union is then filtered to kind 'junk' against the live
// catalog, which makes every settlement exclusion structural rather than a
// special case: kind-tool implements and charms fall out on kind, raw fishing
// catches that recipes consume land IN once they are kind junk (honest cooking
// reagents), quality-poor trash is in no source table (guarded by
// tests/crafting_materials_quality.test.ts for the reagent slice, and by the
// member plus per-source arms of tests/material_taxonomy.test.ts for the
// rest), and the unclassified non-poor trophies/keepsakes are in no source
// table either (the completeness tripwire in tests/material_taxonomy.test.ts
// enumerates them, so a future junk item must be classified explicitly).
//
// Deliberately NOT consulted by the sim's own deposit path: bankDeposit
// self-stores ANY non-quest item one stack at a time by design (src/sim/bank.ts
// via items.ts), and only the client-side sweep/chips narrow to this set.
//
// HARD RULE: no file under src/sim may import this module (enforced by a scan
// arm in tests/material_taxonomy.test.ts). MATERIAL_ITEM_IDS derives at module
// evaluation by reading the merged ITEMS table, which is safe precisely
// because nothing here sits inside data.ts's evaluation cycle. The live
// hazard is the importers inside data.ts's own runtime closure (the content
// and layout tables): one of those importing this module closes a cycle
// importer -> material_taxonomy -> data.ts -> importer, and whether the
// derive then reads a still-undefined source table depends on which module
// the host entry reaches first, so the defect is invisible under one entry
// point and fatal under another. The ban covers ALL of src/sim as deliberate
// over-guarding (content modules are the plausible future importers, and a
// static scan cannot track the closure), and that order-dependence is exactly
// what a static import scan catches and no runtime test reliably can.
//
// The derivation itself now lives in material_derivation.ts, a runtime-import-free
// leaf this module and the sim-side Materials Vault share so the two sets cannot
// drift; the eager derive below, and this module's public surface, are unchanged.

import { ENCHANTS } from './content/enchants';
import { HARVEST_COMPONENT_ITEMS, HARVEST_COMPONENT_SPECIMENS } from './content/professions';
import { ALL_RECIPES, ITEMS } from './data';
import { deriveMaterialItemIds } from './material_derivation';
import { NODE_MATERIAL_TABLE } from './professions/gathering';
import { MATERIAL_GRADES } from './professions/material_grades';
import { SALVAGE_MATERIAL_BY_QUALITY } from './professions/salvage';
import type { ItemDef } from './types';

export type { MaterialSourceTables } from './material_derivation';
export { deriveMaterialItemIds } from './material_derivation';

/** Every item id that counts as a depositable/browsable material: the
 *  junk-kind members of the source-or-reagent union above. Pinned by exact-set
 *  equality in tests/material_taxonomy.test.ts. */
export const MATERIAL_ITEM_IDS: ReadonlySet<string> = deriveMaterialItemIds({
  nodeMaterialTable: NODE_MATERIAL_TABLE,
  materialGrades: MATERIAL_GRADES,
  harvestComponentItems: HARVEST_COMPONENT_ITEMS,
  harvestComponentSpecimens: HARVEST_COMPONENT_SPECIMENS,
  salvageMaterialByQuality: SALVAGE_MATERIAL_BY_QUALITY,
  recipes: ALL_RECIPES,
  enchants: ENCHANTS,
  items: ITEMS,
});

/** True when `item` is an honest material (set membership on the id; the set
 *  is junk-kind-filtered against the live catalog at derivation time). The
 *  shared predicate behind the bags/bank Materials chip (ui/bag_filter.ts) and
 *  the bank deposit-all sweep (ui/bank_view.ts). */
export function isMaterialItem(item: ItemDef): boolean {
  return MATERIAL_ITEM_IDS.has(item.id);
}
