// Divergence-only dialect overlay for "en_CA" over base locale "en".
//
// "en_CA" inherits from "en": the build (scripts/i18n_build.mjs) resolves it as
// nested `en` -> this overlay, so any key absent here falls through to English. This file
// therefore carries ONLY the keys whose value differs from en; every other key is
// intentionally omitted. A key must NOT be re-added with a value equal to en
// (redundant duplication). Every key here must be a real `en` leaf
// path (the flat TranslationKey union type + the byte gate). Keys are in `en`'s
// leaf order.

import type { TranslationKey } from '../i18n.catalog';

export const en_CA: Partial<Record<TranslationKey, string>> = {
  'classDetails.labels.armor': 'Armour',
  'classDetails.lore.druid':
    'Druids channel nature, healing wounds, entangling foes, and shifting into animal forms for defence or damage.',
  'classDetails.lore.paladin':
    'Paladins are holy crusaders who support allies with blessings, heal wounds with Mending Light, and protect the weak in heavy armour.',
  'fiesta.category.defense': 'Defence',
  'fiesta.category.offense': 'Offence',
  'hudChrome.perf.bgColor': 'Background Colour',
  'hudChrome.perf.colorTheme': 'Colour Theme',
  'hudChrome.perf.textColor': 'Text Colour',
  'hudChrome.perf.thresholds': 'Colour-Coded Warnings',
  'hudChrome.statInfo.effects.armor': '+{value} Armour',
  'itemUi.kind.armor': 'Armour',
  'itemUi.stats.armor': 'Armour',
  'itemUi.tooltip.armorStat': '{value} Armour',
  'hudChrome.playerTooltip.guild': '<{guild}>',
  'hudChrome.playerTooltip.specRole': '{spec} ({role})',
  'hudChrome.interfaceUnlock.frameNames.unitTooltip': 'Tooltip',
  'guide.interfacePage.framesGovernedUnitTooltip': 'Edit Frames also unlocks the Tooltip frame: the position where the hover card for a creature or another player appears. Drag it where you want the card to grow from, or hide it from Frames Settings if you do not want hover cards.',
};
