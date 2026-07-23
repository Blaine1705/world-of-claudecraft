import { describe, expect, it } from 'vitest';
import { runEffects } from '../src/sim/combat/effect_dispatch';
import { onShamanCastCompleted } from '../src/sim/combat/shaman_talents';
import { thunderCharges, thundercallOnArcBoltImpact } from '../src/sim/combat/shaman_thundercall';
import { onCastCompleted } from '../src/sim/combat/talent_procs';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { type ResolvedAbility, Sim } from '../src/sim/sim';
import type { Aura, Entity, PlayerClass } from '../src/sim/types';

type TestSim = Sim & {
  nextId: number;
  addEntity(entity: Entity): void;
};

function harness(sim: Sim): TestSim {
  return sim as TestSim;
}

function simWithRows(cls: PlayerClass, rows: Record<number, string>): TestSim {
  const sim = harness(new Sim({ seed: 1756, playerClass: cls, autoEquip: false }));
  sim.setPlayerLevel(20);
  expect(sim.applyTalents({ spec: null, rows })).toBe(true);
  return sim;
}

function addTarget(sim: TestSim, distance = 3, hostile = true): Entity {
  const player = sim.player;
  const target = createMob(sim.nextId++, MOBS.forest_wolf, 20, {
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z + distance,
  });
  target.hostile = hostile;
  target.moveSpeed = 0;
  target.maxHp = 100_000;
  target.hp = target.maxHp;
  sim.addEntity(target);
  player.facing = Math.atan2(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
  sim.targetEntity(target.id);
  return target;
}

function resolved(sim: Sim, abilityId: string): ResolvedAbility {
  const ability = sim.resolvedAbility(abilityId);
  if (!ability) throw new Error(`missing resolved ability ${abilityId}`);
  return ability;
}

function runResolved(sim: Sim, target: Entity | null, ability: ResolvedAbility): void {
  const meta = sim.meta(sim.playerId);
  if (!meta) throw new Error('missing player metadata');
  runEffects(sim.ctx, sim.player, meta, target, ability);
}

function aura(
  id: string,
  kind: Aura['kind'],
  sourceId: number,
  school: Aura['school'],
  value = 1,
): Aura {
  return {
    id,
    name: id,
    kind,
    remaining: 30,
    duration: 30,
    value,
    sourceId,
    school,
  };
}

function settle(sim: Sim): void {
  for (let tick = 0; tick < 40; tick++) sim.tick();
}

describe('retained v0.26 non-Warrior row runtime contracts', () => {
  it('banks a second Sundering Gavel or roots enemies in Holy Ground', () => {
    const charges = simWithRows('paladin', { 8: 'pal_r8_fist_of_justice' });
    expect(resolved(charges, 'hammer_of_justice')).toMatchObject({
      charges: 2,
      bonusCharges: 1,
    });

    const snare = simWithRows('paladin', { 8: 'pal_r8_consecrated_ground' });
    const target = addTarget(snare);
    snare.player.resource = snare.player.maxResource;
    snare.castAbility('consecration');
    expect(target.auras).toContainEqual(
      expect.objectContaining({ kind: 'root', sourceId: snare.playerId, remaining: 2 }),
    );
  });

  it('restores energy on every third Wicked Slash with Ceaseless Cuts', () => {
    const sim = simWithRows('rogue', { 14: 'rog_r14_ceaseless_cuts' });
    const target = addTarget(sim);
    sim.player.resource = 0;

    onCastCompleted(sim.ctx, sim.player, 'sinister_strike', target);
    onCastCompleted(sim.ctx, sim.player, 'sinister_strike', target);
    expect(sim.player.resource).toBe(0);
    onCastCompleted(sim.ctx, sim.player, 'sinister_strike', target);

    expect(sim.player.resource).toBe(50);
  });

  it('adds one talent charge for Twin Icebind', () => {
    // The mage rework replaced Twin Embers (mag_r5_impulse, fire_blast) with
    // Twin Icebind (mag_r11_twin_nova, frost_nova) as the charge-model row.
    const mage = simWithRows('mage', { 11: 'mag_r11_twin_nova' });

    expect(resolved(mage, 'frost_nova')).toMatchObject({ charges: 2, bonusCharges: 1 });
  });

  it('arms Flowing Elements only after a Jolt', () => {
    const sim = simWithRows('shaman', { 5: 'sha_r5_imbue_mastery' });
    onShamanCastCompleted(sim.ctx, sim.player, 'lightning_bolt');
    expect(sim.player.auras.some((candidate) => candidate.id === 'shaman_flowing_elements')).toBe(
      false,
    );
    onShamanCastCompleted(sim.ctx, sim.player, 'earth_shock');
    expect(
      sim.player.auras.find((candidate) => candidate.id === 'shaman_flowing_elements'),
    ).toMatchObject({
      kind: 'ice_floes',
      duration: 8,
      empowerAbilities: ['lightning_bolt', 'healing_wave'],
    });
  });

  it('makes Consume mobile with Walking Hunger', () => {
    const sim = simWithRows('warlock', { 11: 'wlk_r11_fel_concentration' });
    expect(resolved(sim, 'drain_life').castWhileMoving).toBe(true);
  });

  it('Blood Credit pays 20% more mana per tap and arms nothing', () => {
    // Balance pass: the instant-bolt relay is gone; the option is the classic
    // Improved Life Tap (rank 3 at 20: 85 hp -> 102 mana).
    const sim = simWithRows('warlock', { 11: 'wlk_r11_improved_life_tap' });
    sim.player.hp = 1;
    sim.player.resource = 0;

    sim.castAbility('life_tap');

    expect(sim.player.hp).toBe(1);
    expect(sim.player.resource).toBe(0);
    expect(sim.player.gcdRemaining).toBe(0);

    sim.player.hp = 100;
    sim.castAbility('life_tap');
    expect(sim.player.hp).toBe(15);
    expect(sim.player.resource).toBe(102);
    expect(sim.player.auras.some((entry) => entry.id === 'wlk_blood_credit')).toBe(false);
  });

  it('casts Typhoon in caster form and Red Haze after shifting', () => {
    const sim = simWithRows('druid', {
      8: 'dru_r8_typhoon',
      20: 'dru_r20_berserk',
    });
    const target = addTarget(sim);
    const distanceBefore = Math.hypot(
      target.pos.x - sim.player.pos.x,
      target.pos.z - sim.player.pos.z,
    );
    sim.player.resource = sim.player.maxResource;

    sim.castAbility('typhoon');

    expect(
      Math.hypot(target.pos.x - sim.player.pos.x, target.pos.z - sim.player.pos.z),
    ).toBeGreaterThan(distanceBefore);
    expect(target.auras).toContainEqual(
      expect.objectContaining({ kind: 'slow', value: 0.5, remaining: 4 }),
    );

    settle(sim);
    sim.player.resource = sim.player.maxResource;
    sim.castAbility('cat_form');
    settle(sim);
    expect(sim.player.auras.some((entry) => entry.kind === 'form_cat')).toBe(true);
    sim.castAbility('berserk');
    expect(sim.player.auras).toContainEqual(
      expect.objectContaining({ id: 'berserk', kind: 'buff_ap', value: 70 }),
    );
  });

  it('adds an extra Pyrebrand charge every third Arc Bolt with Imbue Mastery', () => {
    const sim = simWithRows('shaman', { 14: 'sha_r14_improved_flame_shock' });
    expect(
      sim.applyTalents({ spec: 'elemental', rows: { 14: 'sha_r14_improved_flame_shock' } }),
    ).toBe(true);
    sim.player.auras.push(aura('flametongue_weapon', 'imbue', sim.playerId, 'fire'));
    thundercallOnArcBoltImpact(sim.ctx, sim.player);
    thundercallOnArcBoltImpact(sim.ctx, sim.player);
    thundercallOnArcBoltImpact(sim.ctx, sim.player);
    expect(thunderCharges(sim.player)).toBe(4);
    expect(
      resolved(sim, 'earth_shock').effects.some((effect) => effect.type === 'consumeDot'),
    ).toBe(false);
  });

  it('pins exact Cleansing Verdict and Voidfeast healing with correct dispel direction', () => {
    const paladin = simWithRows('paladin', { 8: 'pal_r8_cleansing_verdict' });
    const ally = addTarget(paladin, 2, false);
    ally.maxHp = 1_000;
    ally.hp = 500;
    ally.auras.push(aura('magic_debuff', 'slow', 999_999, 'shadow', 0.5));
    ally.auras.push(aura('magic_benefit', 'buff_ap', ally.id, 'holy', 10));
    paladin.player.spellPower = 0;
    const paladinRng = paladin.ctx.rng as typeof paladin.ctx.rng & {
      chance(probability: number): boolean;
      range(min: number, max: number): number;
    };
    paladinRng.chance = () => false;
    paladinRng.range = (min) => min;

    runResolved(paladin, ally, resolved(paladin, 'cleansing_verdict'));

    expect(ally.hp).toBe(540);
    expect(ally.auras.some((entry) => entry.id === 'magic_debuff')).toBe(false);
    expect(ally.auras.some((entry) => entry.id === 'magic_benefit')).toBe(true);

    const warlock = simWithRows('warlock', { 8: 'wlk_r8_voidfeast' });
    const enemy = addTarget(warlock);
    enemy.auras.push(aura('magic_benefit', 'buff_ap', enemy.id, 'holy', 10));
    enemy.auras.push(aura('magic_debuff', 'slow', warlock.playerId, 'shadow', 0.5));
    warlock.player.hp = 1;
    const expectedHeal = Math.round(warlock.player.maxHp * 0.06);
    const warlockRng = warlock.ctx.rng as typeof warlock.ctx.rng & {
      chance(probability: number): boolean;
    };
    warlockRng.chance = () => false;

    runResolved(warlock, enemy, resolved(warlock, 'voidfeast'));

    expect(warlock.player.hp).toBe(1 + expectedHeal);
    expect(enemy.auras.some((entry) => entry.id === 'magic_benefit')).toBe(false);
    expect(enemy.auras.some((entry) => entry.id === 'magic_debuff')).toBe(true);
  });
});
