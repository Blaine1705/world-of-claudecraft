// Kit-fidelity pins for the classic warrior: the pre-overhaul kit resurrected
// as its own class (src/sim/content/classes_warrior_classic.ts) so PTR testers
// can compare the two warrior designs side by side. These tests pin what makes
// it CLASSIC: the old ability list under cw_ ids, the old rage coefficients,
// the defensive-stance-only stance model, and the absence of every
// overhaul-only mechanic (dual wield, shields, new passives).

import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/sim/content/classes';
import { TALENTS } from '../src/sim/content/talents';
import { ITEMS } from '../src/sim/data';
import {
  canDualWield,
  canDualWieldTwoHand,
  canEquipItem,
  maxArmorTypeForClass,
} from '../src/sim/equipment_rules';
import { Sim } from '../src/sim/sim';
import {
  PARRY_CLASSES,
  rageConversion,
  rageFromDealing,
  rageFromDealingClassic,
  rageFromTaking,
  rageFromTakingClassic,
} from '../src/sim/types';

const OLD_KIT = [
  'cw_heroic_strike',
  'cw_battle_shout',
  'cw_commanding_shout',
  'cw_charge',
  'cw_rend',
  'cw_thunder_clap',
  'cw_hamstring',
  'cw_bloodrage',
  'cw_overpower',
  'cw_execute',
  'cw_slam',
  'cw_cleave',
  'cw_defensive_stance',
  'cw_demoralizing_shout',
  'cw_sunder_armor',
  'cw_taunt',
];

describe('warrior_classic: the pre-overhaul kit as a second class', () => {
  it('ships exactly the old 16-ability base kit under cw_ ids', () => {
    expect(CLASSES.warrior_classic.abilities).toEqual(OLD_KIT);
    expect(CLASSES.warrior_classic.resourceType).toBe('rage');
    expect(CLASSES.warrior_classic.startOffhand).toBeUndefined();
  });

  it('has the three old specs with the OLD masteries (Sharpened Blades kept)', () => {
    const specs = TALENTS.warrior_classic?.specs ?? [];
    expect(specs.map((s) => s.id)).toEqual(['arms', 'fury', 'prot']);
    expect(specs[0].mastery.name).toBe('Sharpened Blades');
  });

  it('never dual-wields (even on the fury spec) and never equips shields', () => {
    expect(canDualWield('warrior_classic', 'fury')).toBe(false);
    expect(canDualWieldTwoHand('warrior_classic', 'fury')).toBe(false);
    expect(canEquipItem('warrior_classic', ITEMS.highwatch_wallshield)).toBe(false);
  });

  it('shares warrior gear proficiency (mail rank, warrior-locked epics)', () => {
    expect(maxArmorTypeForClass('warrior_classic')).toBe('mail');
    expect(canEquipItem('warrior_classic', ITEMS.crownforged_dreadhelm)).toBe(true);
    expect(canEquipItem('warrior_classic', ITEMS.kingsbane_last_oath)).toBe(true);
  });

  it('parries like every melee class in the new engine', () => {
    expect(PARRY_CLASSES.has('warrior_classic')).toBe(true);
  });

  it('keeps the old rage coefficients (dealing 7.5x, taking /(level*1.5))', () => {
    expect(rageFromDealingClassic(100, 20)).toBeLessThan(rageFromDealing(100, 20));
    expect(rageFromDealingClassic(100, 20)).toBeCloseTo((7.5 * 100) / rageConversion(20), 5);
    expect(rageFromTakingClassic(100, 20)).toBeCloseTo(100 / 30, 5);
    expect(rageFromTakingClassic(100, 20)).toBeLessThan(rageFromTaking(100, 20));
  });

  it('reconciles into the classic Defensive Stance and nothing else', () => {
    const sim = new Sim({ seed: 5, playerClass: 'warrior_classic', playerName: 'Oldschool' });
    const pid = sim.playerId;
    sim.setPlayerLevel(20, pid);
    for (let i = 0; i < 5; i++) sim.tick();
    const e = (
      sim as unknown as { entities: Map<number, { auras: { id: string }[] }> }
    ).entities.get(pid);
    const stances = e?.auras.filter((a) =>
      ['cw_defensive_stance', 'battle_stance', 'berserker_stance', 'defensive_stance'].includes(
        a.id,
      ),
    );
    expect(stances?.map((a) => a.id)).toEqual(['cw_defensive_stance']);
  });

  it('serializes and reloads like any class (the server login shape)', () => {
    const sim = new Sim({ seed: 6, playerClass: 'warrior_classic', playerName: 'Oldschool' });
    sim.setPlayerLevel(20, sim.playerId);
    const state = sim.serializeCharacter(sim.playerId);
    const sim2 = new Sim({ seed: 7, playerClass: 'warrior', playerName: 'x', noPlayer: true });
    const pid2 = sim2.addPlayer('warrior_classic', 'Oldschool', {
      state: JSON.parse(JSON.stringify(state)),
    });
    expect(sim2.serializeCharacter(pid2)?.level).toBe(20);
  });
});
