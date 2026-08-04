// Pure, host-agnostic core for the bag grid's fine-grade material mark.
// Fine materials are a GRADE class (material_grades.ts), not a quality tier and
// not a purpose class like quest. Their item defs stay kind 'junk' / quality
// 'common' so sell-all-junk leaves them alone (junkSellableSlot keys off poor),
// but at a glance they still read like plain white reagents and players sell
// them one-click by accident. The bag painter needs a single on/off decision
// so every fine stack can wear a refined rim, soft wash, and corner seal
// without the painter re-deriving grade logic.
//
// Grade class, not rarity: thin rim + soft wash + small seal from a cool
// refined lineage distinct from quest gold and from green/blue/purple quality
// borders. Always-on, no --fx gate (fairness).
//
// Glyph priority (composed by the painter with bag_instance_glyph_view and
// bag_quest_mark_view):
//   masterwork > quest seal > fine seal > enchanted / signed / bound > generic.
// Rim and wash always apply for any fine id even when a higher-priority seal
// wins the corner.
//
// DOM/Three-free (registered in tests/architecture.test.ts UI_PURE_CORES).

import { baseMaterialFor } from '../sim/professions/material_grades';

/** True when this item id is a fine grade of a gathered material (the nine
 *  fine_* ids from MATERIAL_GRADES). Base materials and every other id stay
 *  false. Uses the reverse index so the grade table stays the single source. */
export function bagFineMark(itemId: string): boolean {
  return baseMaterialFor(itemId) !== undefined;
}
