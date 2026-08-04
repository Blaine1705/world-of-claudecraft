// Profession-affinity purpose line for honest materials.
//
// Classic MMO pattern (WoW Crafting Reagent + trade-good tooltips, RuneScape
// category/examine): never call a useful reagent "Junk", and name the craft(s)
// that consume it when an item can serve more than one role. Kind stays
// 'junk' internally for Sell Junk / taxonomy; the kind line already reads
// "Material" via item_kind_label.ts. This module adds the second line:
// "Used by Leatherworking, Armorcrafting, and Weaponcrafting."
//
// Data half is content-derived (sim/material_profession_affinity.ts). Specific
// purpose hints win when they already answer "what is this for" more clearly
// than a craft list: raw cooking catches (cooking_catch_hint_view) and the
// enchanting-only materials that already say "Enchanting reagent" in
// material_hint_view. Multi-craft cooking reagents (e.g. a catch also used by
// Engineering) still get this line so secondary crafts are not hidden.
//
// DOM/Three-free (registered in tests/architecture.test.ts UI_PURE_CORES).

import { craftIdsForMaterialItem } from '../sim/material_profession_affinity';
import { MATERIAL_ITEM_IDS } from '../sim/material_taxonomy';
import { cookingCatchHintKey } from './cooking_catch_hint_view';
import { esc } from './esc';
import { getLanguage, languageTag, type TranslationKey, t } from './i18n';
import { materialHintKey } from './material_hint_view';

/** Per-craft display names (same keys as char_window CRAFT_NAME_KEYS / CRAFT_RING). */
const CRAFT_NAME_KEYS: Readonly<Record<string, TranslationKey>> = {
  armorcrafting: 'hudChrome.craftName.armorcrafting',
  weaponcrafting: 'hudChrome.craftName.weaponcrafting',
  jewelcrafting: 'hudChrome.craftName.jewelcrafting',
  alchemy: 'hudChrome.craftName.alchemy',
  engineering: 'hudChrome.craftName.engineering',
  cooking: 'hudChrome.craftName.cooking',
  inscription: 'hudChrome.craftName.inscription',
  enchanting: 'hudChrome.craftName.enchanting',
  tailoring: 'hudChrome.craftName.tailoring',
  leatherworking: 'hudChrome.craftName.leatherworking',
};

const listFormatCache = new Map<string, Intl.ListFormat>();

function listFormatFor(tag: string): Intl.ListFormat {
  let fmt = listFormatCache.get(tag);
  if (!fmt) {
    fmt = new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' });
    listFormatCache.set(tag, fmt);
  }
  return fmt;
}

function craftDisplayName(craftId: string): string {
  const key = CRAFT_NAME_KEYS[craftId];
  return key ? t(key) : craftId;
}

/**
 * Whether this material already has a more specific purpose sentence that
 * fully answers "what profession is this for", so the generic Used-by line
 * would only repeat it.
 */
function hasSupersedingPurposeHint(itemId: string, craftIds: readonly string[]): boolean {
  // Raw cooking catch: "Cooking ingredient. Must be cooked before eating."
  // covers the single-craft cooking case. Multi-craft catches still need
  // Used-by so Engineering (etc.) is not invisible beside the cooking line.
  if (cookingCatchHintKey(itemId) !== undefined) {
    return craftIds.length === 1 && craftIds[0] === 'cooking';
  }
  // Enchanting materials already open with "Enchanting reagent. ..."
  if (materialHintKey(itemId) !== undefined) {
    return craftIds.length === 1 && craftIds[0] === 'enchanting';
  }
  return false;
}

/**
 * Localized "Used by {crafts}." text for an honest material, or '' when the
 * item is not a material, has no craft consumers, or a more specific purpose
 * hint already covers it alone.
 */
export function materialProfessionHintText(itemId: string): string {
  if (!MATERIAL_ITEM_IDS.has(itemId)) return '';
  const craftIds = craftIdsForMaterialItem(itemId);
  if (craftIds.length === 0) return '';
  if (hasSupersedingPurposeHint(itemId, craftIds)) return '';
  const names = craftIds.map(craftDisplayName);
  const crafts = listFormatFor(languageTag(getLanguage())).format(names);
  return t('hudChrome.materialHint.usedBy', { crafts });
}

/**
 * The hint as a tooltip description line, or '' when none. Same muted
 * tt-desc style as material_hint_view / cooking catch purpose lines.
 */
export function materialProfessionHintLine(itemId: string): string {
  const text = materialProfessionHintText(itemId);
  return text ? `<div class="tt-desc tt-material-use">${esc(text)}</div>` : '';
}
