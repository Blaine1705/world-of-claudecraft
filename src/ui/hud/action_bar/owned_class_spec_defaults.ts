import type { HotbarAction } from './hotbar';
import { hotbarActionsEqual } from './hotbar';

type OwnedClass = 'hunter' | 'shaman' | 'priest';

const OWNED_CLASS_SPEC_DEFAULTS: Readonly<
  Record<OwnedClass, Readonly<Record<string, readonly string[]>>>
> = {
  hunter: {
    beast_mastery: [
      'pack_command',
      'arcane_shot',
      'serpent_sting',
      'volley',
      'bestial_wrath',
      'stampede',
      'counter_shot',
      'trailbreak',
      'wildheart',
      'shellskin',
      'frostjaw_trap',
      'concussive_shot',
      'wing_clip',
      'aspect_of_the_hawk',
      'aspect_of_the_monkey',
      'aspect_of_the_cheetah',
      'revive_pet',
    ],
    marksmanship: [
      'measured_shot',
      'aimed_shot',
      'rapid_fire',
      'arcane_shot',
      'cold_focus',
      'counter_shot',
      'trailbreak',
      'wildheart',
      'shellskin',
      'serpent_sting',
      'volley',
      'frostjaw_trap',
      'concussive_shot',
      'wing_clip',
      'aspect_of_the_hawk',
      'aspect_of_the_monkey',
      'aspect_of_the_cheetah',
      'revive_pet',
    ],
    survival: [
      'bloodhook',
      'raptor_strike',
      'mongoose_bite',
      'shrapnel_charge',
      'bloodtrail_assault',
      'counter_shot',
      'trailbreak',
      'wildheart',
      'shellskin',
      'frostjaw_trap',
      'wing_clip',
      'concussive_shot',
      'serpent_sting',
      'volley',
      'aspect_of_the_hawk',
      'aspect_of_the_monkey',
      'aspect_of_the_cheetah',
      'revive_pet',
    ],
  },
  shaman: {
    elemental: [
      'lightning_bolt',
      'chain_lightning',
      'earth_shock',
      'flame_shock',
      'earthquake',
      'frost_shock',
      'elemental_mastery',
      'unleash_weapon',
      'lightning_shield',
      'healing_wave',
      'ghost_wolf',
      'bloodlust',
      'flametongue_weapon',
    ],
    enhancement: [
      'stormstrike',
      'unleash_weapon',
      'earth_shock',
      'galeheart_weapon',
      'rockbiter_weapon',
      'flame_shock',
      'lightning_bolt',
      'frost_shock',
      'healing_wave',
      'lightning_shield',
      'ghost_wolf',
      'bloodlust',
    ],
    restoration: [
      'healing_wave',
      'tidecall',
      'unleash_weapon',
      'chain_heal',
      'ancestor_return',
      'lightning_shield',
      'ghost_wolf',
      'earth_shock',
      'frost_shock',
      'flame_shock',
      'lightning_bolt',
      'lifespring_weapon',
      'bloodlust',
    ],
  },
  priest: {
    discipline: [
      'scouring_mercy',
      'smite',
      'power_word_shield',
      'flash_heal',
      'mind_blast',
      'heal',
      'renew',
      'shadow_word_pain',
      'veilstep',
      'psychic_scream',
      'lesser_heal',
      'mind_flay',
      'power_word_fortitude',
    ],
    holy: [
      'seraphic_vigil',
      'flash_heal',
      'heal',
      'prayer_of_healing',
      'holy_nova',
      'power_word_shield',
      'renew',
      'lesser_heal',
      'smite',
      'mind_blast',
      'veilstep',
      'psychic_scream',
      'shadow_word_pain',
      'mind_flay',
      'power_word_fortitude',
    ],
    shadow: [
      'shadow_word_pain',
      'mind_blast',
      'mind_flay',
      'summon_tithefiend',
      'shadowform',
      'flash_heal',
      'power_word_shield',
      'veilstep',
      'psychic_scream',
      'heal',
      'renew',
      'smite',
      'lesser_heal',
      'power_word_fortitude',
    ],
  },
};

function isOwnedClass(playerClass: string): playerClass is OwnedClass {
  return playerClass === 'hunter' || playerClass === 'shaman' || playerClass === 'priest';
}

export function ownedClassSpecDefaultAbilityIds(
  playerClass: string,
  spec: string | null,
  level: number,
  knownAbilityIds: ReadonlySet<string>,
): string[] | null {
  if (level < 20 || !spec || !isOwnedClass(playerClass)) return null;
  const template = OWNED_CLASS_SPEC_DEFAULTS[playerClass][spec];
  if (!template) return null;
  return template.filter((abilityId) => knownAbilityIds.has(abilityId));
}

export function shouldSeedOwnedSpecDefault(
  current: readonly HotbarAction[],
  previousGenerated: readonly HotbarAction[] | null,
  hadStoredBar: boolean,
): boolean {
  if (previousGenerated) return hotbarActionsEqual(current, previousGenerated);
  return !hadStoredBar;
}
