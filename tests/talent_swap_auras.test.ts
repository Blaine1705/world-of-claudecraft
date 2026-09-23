// A talent swap takes the buffs of the talent it drops with it.
//
// Player report (v0.44): a buff cast from a talent outlived the talent. A mage
// channelled Aetherwell (level-20 capstone row), swapped that row to Rune of
// Power before the pull, and fought with both capstones at once. The same
// trick worked for every class: cast the talent's buff, swap the row, keep
// the buff. The sim now strips, at the talent recompute, every aura this
// player applied whose id only a no-longer-known ability (or a dropped talent
// rider on a still-known one) can produce, on every entity it landed on.

import { describe, expect, it } from 'vitest';
import { abilityAuraIds, orphanedAbilityAuraIds } from '../src/sim/progression/talent_swap_auras';
import { Sim } from '../src/sim/sim';
import type { AbilityDef, AbilityEffect, Entity } from '../src/sim/types';
import { EMPTY_TEST_WORLD } from './sim_shared';

type AnySim = Sim & Record<string, any>;

function tickFor(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 20); i++) sim.tick();
}

function mageAtCap(): { sim: Sim; p: Entity } {
  const sim = new Sim({ seed: 41, playerClass: 'mage', world: EMPTY_TEST_WORLD });
  sim.setPlayerLevel(20);
  const p = sim.player;
  p.resource = p.maxResource;
  return { sim, p };
}

describe('talent swap strips the dropped talent buffs (the Aetherwell into Rune of Power report)', () => {
  it('drops the Aetherwell spell power buff when the capstone row swaps to Rune of Power', () => {
    const { sim, p } = mageAtCap();
    expect(sim.selectTalentRow(20, 'mag_r20_evocation')).toBe(true);
    const baseSp = p.spellPower ?? 0;

    sim.castAbility('evocation');
    tickFor(sim, 6.5); // the whole 6 sec channel: six stacks of the buff
    const buff = p.auras.find((a) => a.id === 'evocation');
    expect(buff?.kind).toBe('buff_spellpower');
    expect(p.spellPower ?? 0).toBeGreaterThan(baseSp);
    expect(p.inCombat).toBe(false);

    expect(sim.selectTalentRow(20, 'mag_r20_rune_of_power')).toBe(true);

    expect(sim.known.some((k) => k.def.id === 'rune_of_power')).toBe(true);
    expect(p.auras.some((a) => a.id === 'evocation')).toBe(false);
    // The stat pass re-ran: the swap does not bank the old capstone's power.
    expect(p.spellPower).toBe(baseSp);
  });

  it('emits the fade for the stripped buff', () => {
    const { sim, p } = mageAtCap();
    expect(sim.selectTalentRow(20, 'mag_r20_evocation')).toBe(true);
    sim.castAbility('evocation');
    tickFor(sim, 2);
    expect(p.auras.some((a) => a.id === 'evocation')).toBe(true);
    const buffName = p.auras.find((a) => a.id === 'evocation')?.name;

    sim.drainEvents();
    expect(sim.selectTalentRow(20, 'mag_r20_overflowing_power')).toBe(true);

    expect(sim.drainEvents()).toContainEqual({
      type: 'aura',
      targetId: p.id,
      name: buffName,
      gained: false,
    });
  });

  it('keeps a buff whose ability is still known after the swap', () => {
    const { sim, p } = mageAtCap();
    expect(sim.selectTalentRow(20, 'mag_r20_evocation')).toBe(true);
    sim.castAbility('evocation');
    tickFor(sim, 2);
    expect(p.auras.some((a) => a.id === 'evocation')).toBe(true);

    // A different row changes; the capstone (and so Aetherwell) stays.
    expect(sim.selectTalentRow(17, 'mag_r17_mass_barrier')).toBe(true);

    expect(p.auras.some((a) => a.id === 'evocation')).toBe(true);
  });

  it('drops a talent rider on a baseline ability but keeps the baseline buff (Ghostfoot Ward)', () => {
    const sim = new Sim({ seed: 42, playerClass: 'rogue', world: EMPTY_TEST_WORLD });
    sim.setPlayerLevel(20);
    const p = sim.player;
    expect(sim.selectTalentRow(8, 'rog_r8_ghostfoot_ward')).toBe(true);

    sim.castAbility('evasion');
    sim.tick();
    expect(p.auras.some((a) => a.id === 'evasion' && a.kind === 'buff_dodge')).toBe(true);
    expect(p.auras.some((a) => a.id === 'evasion_shield_wall')).toBe(true);

    expect(sim.selectTalentRow(8, 'rog_r8_borrowed_breath')).toBe(true);

    // Ghostfoot itself is baseline: its dodge buff stays. The 30% damage cut
    // was the dropped talent's rider: it goes.
    expect(p.auras.some((a) => a.id === 'evasion' && a.kind === 'buff_dodge')).toBe(true);
    expect(p.auras.some((a) => a.id === 'evasion_shield_wall')).toBe(false);
  });

  it('drops the talent buff from every ally it landed on, and only the swapper own copies', () => {
    const sim = new Sim({ seed: 43, playerClass: 'mage', noPlayer: true }) as AnySim;
    const a = sim.addPlayer('mage', 'MageA');
    const b = sim.addPlayer('mage', 'MageB');
    for (const pid of [a, b]) {
      sim.setPlayerLevel(20, pid);
      expect(sim.applyTalents({ spec: 'frost', rows: { 17: 'mag_r17_mass_barrier' } }, pid)).toBe(
        true,
      );
      const ent = sim.entities.get(pid) as Entity;
      ent.resource = ent.maxResource;
    }
    const entA = sim.entities.get(a) as Entity;
    const entB = sim.entities.get(b) as Entity;
    entB.pos = { ...entA.pos };
    entB.prevPos = { ...entA.pos };
    sim.partyInvite(b, a);
    sim.partyAccept(b);

    sim.castAbility('mass_barrier', a);
    for (const ent of [entA, entB]) {
      expect(ent.auras.find((x) => x.id === 'mass_barrier')?.sourceId).toBe(a);
    }

    expect(sim.selectTalentRow(17, 'mag_r17_cold_snap', a)).toBe(true);

    for (const ent of [entA, entB]) {
      expect(ent.auras.some((x) => x.id === 'mass_barrier')).toBe(false);
    }

    // MageB still has the talent: B's shield on A is B's to keep, even when A
    // (who no longer knows Mass Barrier) swaps a row again.
    entB.gcdRemaining = 0;
    sim.castAbility('mass_barrier', b);
    expect(entA.auras.find((x) => x.id === 'mass_barrier')?.sourceId).toBe(b);
    expect(sim.selectTalentRow(17, 'mag_r17_mass_barrier', a)).toBe(true);
    expect(sim.selectTalentRow(17, 'mag_r17_cold_snap', a)).toBe(true);
    expect(entA.auras.find((x) => x.id === 'mass_barrier')?.sourceId).toBe(b);
  });

  it('is deterministic: the same seed and presses leave the same auras', () => {
    const run = () => {
      const { sim, p } = mageAtCap();
      sim.selectTalentRow(20, 'mag_r20_evocation');
      sim.castAbility('evocation');
      tickFor(sim, 3);
      sim.selectTalentRow(20, 'mag_r20_rune_of_power');
      tickFor(sim, 1);
      return p.auras.map((a) => [a.id, a.kind, a.remaining]);
    };
    expect(run()).toEqual(run());
  });
});

describe('talent_swap_auras pure core', () => {
  const def = (id: string, effects: AbilityEffect[]): AbilityDef =>
    ({ id, effects }) as unknown as AbilityDef;

  it('names the bare id, companion self-buffs, explicit ids, and indexed buffTargets', () => {
    const d = def('arcane_power', [
      { type: 'selfBuff', kind: 'buff_spellpower', value: 1, duration: 10 },
      { type: 'selfBuff', kind: 'buff_spellhaste', value: 1, duration: 10 },
    ] as AbilityEffect[]);
    const ids = abilityAuraIds({
      def: d,
      effects: [
        ...d.effects,
        { type: 'selfBuff', kind: 'shield_wall', value: 0.3, duration: 5, auraId: 'custom_id' },
        { type: 'buffTarget', kind: 'buff_armor', value: 1, duration: 5 },
        { type: 'buffTarget', kind: 'buff_stamina', value: 1, duration: 5 },
      ] as AbilityEffect[],
    });
    expect([...ids].sort()).toEqual(
      [
        'arcane_power',
        'arcane_power_buff_spellhaste',
        'custom_id',
        'arcane_power_buff_stamina_1',
      ].sort(),
    );
  });

  it('orphans only ids the next known set can no longer produce', () => {
    const evocation = def('evocation', [
      { type: 'selfBuff', kind: 'buff_spellpower', value: 8, duration: 15 },
    ] as AbilityEffect[]);
    const evasion = def('evasion', [
      { type: 'selfBuff', kind: 'buff_dodge', value: 0.5, duration: 15 },
    ] as AbilityEffect[]);
    const rider = { type: 'selfBuff', kind: 'shield_wall', value: 0.3, duration: 15 };
    const previous = [
      { def: evocation, effects: evocation.effects },
      { def: evasion, effects: [...evasion.effects, rider] as AbilityEffect[] },
    ];
    const next = [{ def: evasion, effects: evasion.effects }];
    expect([...orphanedAbilityAuraIds(previous, next)].sort()).toEqual(
      ['evasion_shield_wall', 'evocation'].sort(),
    );
    expect(orphanedAbilityAuraIds(next, next).size).toBe(0);
  });
});
