import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/data';
import {
  MAJOR_COOLDOWN_MIN_SEC,
  majorCooldownBaseSec,
  majorCooldownGroup,
  majorCooldownTable,
  PVP_MEDALLION_COOLDOWN_KEY,
} from '../src/sim/major_cooldowns';

// The full roster the nameplate cooldown row tracks, as agreed for the feature.
// A content change that moves an ability in or out of the row must update this
// pin on purpose.
const DEFENSIVE = [
  'aegis_first_dawn',
  'barkskin',
  'blazing_barrier',
  'bone_armor',
  'cinderhide',
  'cloak_of_shadows',
  'dark_pact',
  'deterrence',
  'die_by_sword',
  'divine_protection',
  'elemental_trance',
  'evasion',
  'faithforged_guard',
  'furious_mending',
  'guardian_covenant',
  'ice_barrier',
  'ice_block',
  'life_covenant',
  'martyrs_aegis',
  'mass_barrier',
  'primal_reflexes',
  'rallying_cry',
  'sacred_bulwark',
  'shellskin',
  'smoke_screen',
];
const OFFENSIVE = [
  'arcane_power',
  'army_of_the_dead',
  'avatar',
  'avenging_wrath',
  'berserk',
  'bestial_wrath',
  'blade_flurry',
  'bloodlust',
  'bloodtrail_assault',
  'cold_blood',
  'combustion',
  'elemental_mastery',
  'emboldening_roar',
  'evocation',
  'feral_charge',
  'icy_veins',
  'metamorphosis',
  'overload',
  'perfect_moment',
  'power_echo',
  'power_infusion',
  'primal_exaltation',
  'recklessness',
  'sanguine_aura',
  'stampede',
  'summon_infernal',
  'summon_tithefiend',
  'temporal_acceleration',
  'thieves_chorus',
  'tigers_fury',
  'unholy_command',
];

function keysIn(group: string): string[] {
  return [...majorCooldownTable()]
    .filter(([, g]) => g === group)
    .map(([k]) => k)
    .sort();
}

describe('major cooldown classifier', () => {
  it('admits exactly the agreed defensive roster', () => {
    expect(keysIn('defensive')).toEqual(DEFENSIVE);
  });

  it('admits exactly the agreed offensive roster', () => {
    expect(keysIn('offensive')).toEqual(OFFENSIVE);
  });

  it('tracks the PvP medallion as its own group, keyed by its trinket cooldown', () => {
    expect(PVP_MEDALLION_COOLDOWN_KEY).toBe('trinket:medallion_of_defiance');
    expect(keysIn('medallion')).toEqual([PVP_MEDALLION_COOLDOWN_KEY]);
    expect(majorCooldownBaseSec(PVP_MEDALLION_COOLDOWN_KEY)).toBe(120);
  });

  it('never admits a cooldown under the minimum, whatever it does', () => {
    for (const key of [...DEFENSIVE, ...OFFENSIVE]) {
      expect(ABILITIES[key].cooldown).toBeGreaterThanOrEqual(MAJOR_COOLDOWN_MIN_SEC);
    }
    // Rotation buttons with defensive or offensive riders stay out.
    expect(majorCooldownGroup('mortal_strike')).toBeNull();
  });

  it('leaves out direct damage, crowd control, heals, resource grants and mobility', () => {
    for (const key of [
      'fire_blast', // Cinderfall: deals damage, does not raise it
      'storm_bolt', // a stun
      'psychic_scream', // a fear
      'desperate_prayer', // a self-heal
      'wildheart',
      'frenzied_regeneration',
      'lay_on_hands',
      'adrenaline_rush', // instant energy
      'innervate', // Lifesap: resource over time
      'enrage',
      'berserker_rage',
      'bloodrage',
      'sprint', // mobility
      'dash',
      'intervene', // a gap closer with a small shield
      'greater_invisibility',
      'veilbound_march',
      'vicarious_suffering',
      'aura_mastery',
      'rune_of_power',
      'sweeping_strikes',
      'cold_focus',
      'presence_of_mind',
      'soulwell',
    ]) {
      expect(majorCooldownGroup(key), key).toBeNull();
    }
  });

  it('answers for the aura a tracked buff leaves, which carries the ability id', () => {
    expect(majorCooldownGroup('barkskin')).toBe('defensive');
    expect(majorCooldownGroup('martyrs_aegis')).toBe('defensive');
    expect(majorCooldownGroup('power_infusion')).toBe('offensive');
  });

  it('reads the base cooldown for the swipe', () => {
    expect(majorCooldownBaseSec('barkskin')).toBe(60);
    expect(majorCooldownBaseSec('recklessness')).toBe(180);
    expect(majorCooldownBaseSec('not_an_ability')).toBe(0);
  });
});
