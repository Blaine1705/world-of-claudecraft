import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/sim/entity';
import {
  ASCENSION_CHARGES,
  ASCENSION_DEVOTION_BANK_CAP,
  ASCENSION_DURATION,
  activateDivineAscension,
  canActivateDivineAscension,
  consumeAscensionCharge,
  DEVOTION_DECAY_DELAY,
  DEVOTION_DECAY_INTERVAL,
  devotionGainForAbility,
  grantDevotion,
  grantDevotionFromBlock,
  isAscensionEmpoweredAbility,
  isDivineAscensionActive,
  MAX_DEVOTION,
  updatePaladinDevotion,
} from '../src/sim/paladin_devotion';

function paladin() {
  return createPlayer(1, 'paladin', { x: 0, y: 0, z: 0 }, 'Aurelia');
}

describe('paladin Devotion core', () => {
  it('caps Devotion at 20 and activates a five-charge, 25-second Ascension', () => {
    const player = paladin();
    expect(grantDevotion(player, 99)).toBe(MAX_DEVOTION);
    expect(canActivateDivineAscension(player)).toBe(true);

    expect(activateDivineAscension(player)).toBe(true);
    expect(player.paladinDevotion).toMatchObject({
      value: 0,
      ascensionCharges: ASCENSION_CHARGES,
      ascensionRemaining: ASCENSION_DURATION,
    });
    expect(isDivineAscensionActive(player)).toBe(true);
  });

  it('banks at most ten Devotion while Ascension is active', () => {
    const player = paladin();
    grantDevotion(player, MAX_DEVOTION);
    activateDivineAscension(player);

    grantDevotion(player, MAX_DEVOTION);
    expect(player.paladinDevotion?.value).toBe(ASCENSION_DEVOTION_BANK_CAP);
  });

  it('only consumes charges for explicitly empowered abilities of the chosen spec', () => {
    const player = paladin();
    grantDevotion(player, MAX_DEVOTION);
    activateDivineAscension(player);

    expect(consumeAscensionCharge(player, 'holy', 'mending_light')).toBe(false);
    expect(consumeAscensionCharge(player, 'retribution', 'oathstrike')).toBe(true);
    expect(player.paladinDevotion?.ascensionCharges).toBe(ASCENSION_CHARGES - 1);
    expect(consumeAscensionCharge(player, 'holy', 'oathstrike')).toBe(false);
  });

  it('defines generation and charge spenders explicitly for every specialization', () => {
    expect([
      devotionGainForAbility('holy', 'holy_light'),
      devotionGainForAbility('holy', 'mercy_lance'),
      devotionGainForAbility('holy', 'dawns_embrace'),
      devotionGainForAbility('holy', 'radiant_chorus'),
    ]).toEqual([1, 1, 2, 2]);
    expect([
      devotionGainForAbility('protection', 'vowkeeper_strike'),
      devotionGainForAbility('protection', 'bastion_rite'),
      devotionGainForAbility('protection', 'sunward_disc'),
    ]).toEqual([1, 1, 2]);
    expect([
      devotionGainForAbility('retribution', 'oathstrike'),
      devotionGainForAbility('retribution', 'final_edict'),
      devotionGainForAbility('retribution', 'dawnfall'),
    ]).toEqual([1, 2, 2]);

    expect(
      ['mercy_lance', 'dawns_embrace', 'radiant_chorus'].every((id) =>
        isAscensionEmpoweredAbility('holy', id),
      ),
    ).toBe(true);
    expect(
      ['vowkeeper_strike', 'bastion_rite', 'sunward_disc', 'guardian_covenant'].every((id) =>
        isAscensionEmpoweredAbility('protection', id),
      ),
    ).toBe(true);
    expect(
      ['oathstrike', 'final_edict', 'dawnfall', 'faithforged_guard'].every((id) =>
        isAscensionEmpoweredAbility('retribution', id),
      ),
    ).toBe(true);
    expect(devotionGainForAbility('retribution', 'faithforged_guard')).toBe(0);
    expect(isAscensionEmpoweredAbility('holy', 'holy_light')).toBe(false);
  });

  it('ends Ascension on the last charge or at 25 seconds', () => {
    const spent = paladin();
    grantDevotion(spent, MAX_DEVOTION);
    activateDivineAscension(spent);
    for (let i = 0; i < ASCENSION_CHARGES; i++) {
      expect(consumeAscensionCharge(spent, 'retribution', 'final_edict')).toBe(true);
    }
    expect(isDivineAscensionActive(spent)).toBe(false);

    const expired = paladin();
    grantDevotion(expired, MAX_DEVOTION);
    activateDivineAscension(expired);
    updatePaladinDevotion(expired, ASCENSION_DURATION);
    expect(expired.paladinDevotion?.ascensionCharges).toBe(0);
    expect(isDivineAscensionActive(expired)).toBe(false);
  });

  it('rate-limits block generation and decays after leaving combat', () => {
    const player = paladin();
    expect(grantDevotionFromBlock(player)).toBe(true);
    expect(grantDevotionFromBlock(player)).toBe(false);

    updatePaladinDevotion(player, 6);
    expect(grantDevotionFromBlock(player)).toBe(true);
    expect(player.paladinDevotion?.value).toBe(2);

    updatePaladinDevotion(player, DEVOTION_DECAY_DELAY + DEVOTION_DECAY_INTERVAL);
    expect(player.paladinDevotion?.value).toBe(1);
  });

  it('resets the whole cycle on death and ignores non-paladins', () => {
    const player = paladin();
    grantDevotion(player, MAX_DEVOTION);
    activateDivineAscension(player);
    player.dead = true;
    updatePaladinDevotion(player, 0.05);
    expect(player.paladinDevotion).toMatchObject({
      value: 0,
      ascensionCharges: 0,
      ascensionRemaining: 0,
    });

    const warrior = createPlayer(2, 'warrior', { x: 0, y: 0, z: 0 }, 'Bjorn');
    expect(grantDevotion(warrior, 3)).toBe(0);
    expect(activateDivineAscension(warrior)).toBe(false);
  });
});
