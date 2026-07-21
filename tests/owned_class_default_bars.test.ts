import { describe, expect, it } from 'vitest';
import {
  ownedClassSpecDefaultAbilityIds,
  shouldSeedOwnedSpecDefault,
} from '../src/ui/hud/action_bar/owned_class_spec_defaults';
import { buildDefaultFormBar, type HotbarAction } from '../src/ui/hud/action_bar/hotbar';

const EXPECTED = {
  'hunter/beast_mastery': [
    'pack_command',
    'arcane_shot',
    'serpent_sting',
    'volley',
    'bestial_wrath',
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
  'hunter/marksmanship': [
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
  'hunter/survival': [
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
  'shaman/elemental': [
    'lightning_bolt',
    'earth_shock',
    'flame_shock',
    'earthquake',
    'frost_shock',
    'elemental_mastery',
    'lightning_shield',
    'healing_wave',
    'ghost_wolf',
    'bloodlust',
    'flametongue_weapon',
  ],
  'shaman/enhancement': [
    'stormstrike',
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
  'shaman/restoration': [
    'healing_wave',
    'tidecall',
    'chain_heal',
    'lightning_shield',
    'ghost_wolf',
    'earth_shock',
    'frost_shock',
    'flame_shock',
    'lightning_bolt',
    'lifespring_weapon',
    'bloodlust',
  ],
  'priest/discipline': [
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
  'priest/holy': [
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
  'priest/shadow': [
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
} as const;

describe('owned class level 20 default action bars', () => {
  it('pins the manual-first templates for all nine specs', () => {
    for (const [key, expected] of Object.entries(EXPECTED)) {
      const [playerClass, spec] = key.split('/');
      expect(
        ownedClassSpecDefaultAbilityIds(playerClass, spec, 20, new Set(expected)),
        key,
      ).toEqual(expected);
      expect(expected.some((id) => id.includes('one_button')), key).toBe(false);
    }
  });

  it('waits until level 20 and removes abilities the player does not know', () => {
    expect(
      ownedClassSpecDefaultAbilityIds('hunter', 'survival', 19, new Set(['bloodhook'])),
    ).toBeNull();
    expect(
      ownedClassSpecDefaultAbilityIds(
        'hunter',
        'survival',
        20,
        new Set(['bloodhook', 'raptor_strike']),
      ),
    ).toEqual(['bloodhook', 'raptor_strike']);
  });

  it('replaces only a missing bar or the exact previously generated layout', () => {
    const previous = buildDefaultFormBar(['pack_command', 'arcane_shot'], 5);
    const customized: HotbarAction[] = [previous[1], previous[0], ...previous.slice(2)];

    expect(shouldSeedOwnedSpecDefault(previous, previous, true)).toBe(true);
    expect(shouldSeedOwnedSpecDefault(customized, previous, true)).toBe(false);
    expect(shouldSeedOwnedSpecDefault(previous, null, false)).toBe(true);
    expect(shouldSeedOwnedSpecDefault(previous, null, true)).toBe(false);
  });
});
