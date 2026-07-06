// Divergence-only dialect overlay for "en_CA" over base locale "en".
//
// "en_CA" inherits from "en": the build (scripts/i18n_build.mjs) resolves it as
// nested `en` -> this overlay, so any key absent here falls through to English. This file
// therefore carries ONLY the keys whose value differs from en; every other key is
// intentionally omitted. A key must NOT be re-added with a value equal to en
// (redundant duplication). Every key here must be a real `en` leaf
// path (tests/i18n_overlay_key_membership.test.ts + the byte gate). Keys are in `en`'s
// leaf order.

import type { TranslationKey } from '../i18n.catalog';

export const en_CA: Partial<Record<TranslationKey, string>> = {
  'hudChrome.perf.textColor': 'Text Colour',
  'hudChrome.perf.bgColor': 'Background Colour',
  'hudChrome.perf.colorTheme': 'Colour Theme',
  'hudChrome.perf.thresholds': 'Colour-Coded Warnings',
  'classDetails.labels.armor': 'Armour',
  'classDetails.lore.paladin':
    'Paladins are holy crusaders who support allies with blessings, heal wounds with Mending Light, and protect the weak in heavy armour.',
  'classDetails.lore.druid':
    'Druids channel nature, healing wounds, entangling foes, and shifting into animal forms for defence or damage.',
  'fiesta.category.offense': 'Offence',
  'fiesta.category.defense': 'Defence',
  'itemUi.kind.armor': 'Armour',
  'itemUi.stats.armor': 'Armour',
  'itemUi.tooltip.armorStat': '{value} Armour',
  // Stat tooltips keep the en prose; only the Armor -> Armour spelling diverges.
  'hudChrome.statInfo.effects.armor': '+{value} Armour',
  'entities.abilities.holy_shock.name': 'Holy Shock',
  'entities.abilities.holy_shock.description':
    'Shocks a friendly target with Holy energy, healing them for {damage}. (Holy signature)',
  'entities.abilities.holy_shield.name': 'Holy Shield',
  'entities.abilities.holy_shield.description':
    'Shields you with Holy power for 10 sec, increasing armor by 90 and striking melee attackers for 12 Holy damage. (Protection signature)',
  'entities.abilities.bestial_wrath.name': 'Bestial Wrath',
  'entities.abilities.bestial_wrath.description':
    'Sends you into a bestial rage, increasing attack power by 55 for 15 sec. (Beast Mastery signature)',
  'entities.abilities.trueshot_aura.name': 'Trueshot Aura',
  'entities.abilities.trueshot_aura.description':
    'Inspires nearby allies, increasing attack power by 35 for 5 min. (Marksmanship signature)',
  'entities.abilities.wyvern_sting.name': 'Wyvern Sting',
  'entities.abilities.wyvern_sting.description':
    'Stings the enemy from range, incapacitating it for up to 4 sec. Any damage breaks the effect. (Survival signature)',
  'entities.abilities.arcane_power.name': 'Arcane Power',
  'entities.abilities.arcane_power.description':
    'Increases spell damage by 20% and spell haste by 10% for 10 sec. (Arcane signature)',
  'entities.abilities.combustion.name': 'Combustion',
  'entities.abilities.combustion.description':
    'Increases spell critical chance by 50% for 15 sec. (Fire signature)',
  'entities.abilities.icy_veins.name': 'Icy Veins',
  'entities.abilities.icy_veins.description':
    'Increases spell haste by 30% and prevents cast interruption and pushback for 10 sec. (Frost signature)',
  'entities.abilities.cold_blood.name': 'Cold Blood',
  'entities.abilities.cold_blood.description':
    'Focuses your killing intent so your next attack is a critical strike. (Assassination signature)',
  'entities.abilities.blade_flurry.name': 'Blade Flurry',
  'entities.abilities.blade_flurry.description':
    'Unleashes a flurry of blades, increasing attack speed by 20% for 12 sec. (Combat signature)',
  'entities.abilities.hemorrhage.name': 'Hemorrhage',
  'entities.abilities.hemorrhage.description':
    'Strikes the enemy for weapon damage plus {damage} and causes bleeding damage over 12 sec. Awards 1 combo point. (Subtlety signature)',
  'entities.abilities.power_infusion.name': 'Power Infusion',
  'entities.abilities.power_infusion.description':
    'Infuses a friendly target with power, increasing spell power by 28 for 15 sec. (Discipline signature)',
  'entities.abilities.holy_nova.name': 'Holy Nova',
  'entities.abilities.holy_nova.description':
    'Causes an explosion of Holy light, healing nearby allies for {damage} and damaging nearby enemies. (Holy signature)',
  'entities.abilities.shadowform.name': 'Shadowform',
  'entities.abilities.shadowform.description':
    'Assume a Shadowform, empowering shadow magic until you shift back. Cast again to return to normal form. (Shadow signature)',
  'entities.abilities.elemental_mastery.name': 'Elemental Mastery',
  'entities.abilities.elemental_mastery.description':
    'Calls on elemental mastery, making your next spell instant. (Elemental signature)',
  'entities.abilities.siphon_life.name': 'Siphon Life',
  'entities.abilities.siphon_life.description':
    'Siphons life from the enemy, causing {damage} Shadow damage over 30 sec and healing you for the damage done. (Affliction signature)',
  'entities.abilities.conflagrate.name': 'Conflagrate',
  'entities.abilities.conflagrate.description':
    'Consumes your Immolate on the enemy to ignite them for {damage} Fire damage. (Destruction signature)',
  'entities.abilities.moonkin_form.name': 'Moonkin Form',
  'entities.abilities.moonkin_form.description':
    'Assume Moonkin Form, empowering spellcasting until you shift back. Cast again to return to normal form. (Balance signature)',
  'entities.abilities.feral_charge.name': 'Feral Charge',
  'entities.abilities.feral_charge.description':
    'Charge an enemy and root it for 1 sec. 8-25 yd range. (Feral signature)',
  'entities.abilities.swiftmend.name': 'Swiftmend',
  'entities.abilities.swiftmend.description':
    'Consumes a heal-over-time effect on a friendly target to heal them for {damage}. (Restoration signature)',
  'entities.abilities.crusader_strike.name': 'Crusader Strike',
  'entities.abilities.crusader_strike.description':
    'Strikes the target for weapon damage plus {damage} Holy damage. (Paladin talent)',
  'entities.abilities.metamorphosis.name': 'Metamorphosis',
  'entities.abilities.metamorphosis.description':
    'Assume demonic power, increasing armor and attack power for 20 sec. (Warlock talent)',
};
