// Phase 3 of the choice-row warrior talents: every newly-lit option end to end
// in a real Sim. One describe per talent; helpers follow the sim-test idiom.

import { describe, expect, it } from 'vitest';
import { updateRegen } from '../src/sim/combat/auras';
import { Sim } from '../src/sim/sim';
import {
  dist2d,
  MAX_LEVEL,
  MELEE_CLASSES,
  RECKLESSNESS_RAGE_GEN,
  SECOND_WIND_THRESHOLD,
} from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

function warriorAtCap(seed = 7): Sim {
  const sim = new Sim({ seed, playerClass: 'warrior' });
  sim.setPlayerLevel(MAX_LEVEL);
  return sim;
}

function mobsNear(sim: Sim, n: number) {
  const out: any[] = [];
  const sorted = [...sim.entities.values()]
    .filter((e) => e.kind === 'mob' && !e.dead)
    .sort((a, b) => dist2d(a.pos, sim.player.pos) - dist2d(b.pos, sim.player.pos));
  for (let i = 0; i < n; i++) out.push(sorted[i]);
  return out;
}

function standOff(sim: Sim, mob: any, dist: number) {
  const p = sim.player;
  p.pos.x = mob.pos.x - dist;
  p.pos.z = mob.pos.z;
  p.pos.y = terrainHeight(p.pos.x, p.pos.z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  p.facing = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
}

function metaOf(sim: Sim) {
  return (sim as any).players.get(sim.player.id);
}

function killMob(sim: Sim, mob: any) {
  mob.hp = 1;
  (sim as any).dealDamage(sim.player, mob, 5, false, 'physical', null, 'hit', true);
  expect(mob.dead).toBe(true);
}

describe('Storm Bolt', () => {
  it('is granted by the pick and lands damage plus a stun', () => {
    const sim = warriorAtCap(41);
    expect(sim.pickRowTalent(2, 'war_row_storm_bolt')).toBe(true);
    expect(metaOf(sim).known.some((k: any) => k.def.id === 'storm_bolt')).toBe(true);
    const mob = mobsNear(sim, 1)[0];
    standOff(sim, mob, 15);
    sim.targetEntity(mob.id);
    sim.player.resource = 50;
    const hp0 = mob.hp;
    sim.castAbility('storm_bolt');
    for (let i = 0; i < 40 && !mob.auras.some((a: any) => a.kind === 'stun'); i++) sim.tick();
    expect(mob.auras.some((a: any) => a.kind === 'stun')).toBe(true);
    expect(mob.hp).toBeLessThan(hp0);
  });
});

describe('Blood Offering', () => {
  it('trades 5% max health for 30 rage', () => {
    const sim = warriorAtCap(42);
    sim.pickRowTalent(3, 'war_row_blood_offering');
    const p = sim.player;
    p.hp = p.maxHp;
    p.resource = 0;
    sim.castAbility('blood_offering');
    expect(p.hp).toBe(p.maxHp - Math.round(p.maxHp * 0.05));
    expect(p.resource).toBeCloseTo(30);
  });
});

describe('Recklessness', () => {
  it('grants +20% crit and +50% rage generation for its duration', () => {
    const sim = warriorAtCap(43);
    sim.pickRowTalent(4, 'war_row_recklessness');
    const p = sim.player;
    const crit0 = p.critChance;
    sim.castAbility('recklessness');
    expect(p.auras.some((a: any) => a.kind === 'buff_reckless')).toBe(true);
    expect(p.critChance).toBeCloseTo(crit0 + 0.2);
    const mob = mobsNear(sim, 1)[0];
    standOff(sim, mob, 12);
    sim.targetEntity(mob.id);
    p.resource = 0;
    sim.castAbility('charge');
    expect(p.resource).toBeCloseTo(9 * (1 + RECKLESSNESS_RAGE_GEN));
  });
});

describe('Bloodbath', () => {
  it('stacks +5% crit and damage per kill up to five stacks', () => {
    const sim = warriorAtCap(44);
    sim.pickRowTalent(4, 'war_row_bloodbath');
    const p = sim.player;
    const crit0 = p.critChance;
    const victims = mobsNear(sim, 3);
    killMob(sim, victims[0]);
    let aura = p.auras.find((a: any) => a.kind === 'bloodbath');
    expect(aura?.stacks).toBe(1);
    expect(aura?.value).toBeCloseTo(0.05);
    killMob(sim, victims[1]);
    killMob(sim, victims[2]);
    aura = p.auras.find((a: any) => a.kind === 'bloodbath');
    expect(aura?.stacks).toBe(3);
    expect(aura?.value).toBeCloseTo(0.15);
    expect(p.critChance).toBeCloseTo(crit0 + 0.15);
    // Damage-dealt amp: a 20 hit lands as 23 at three stacks.
    const dummy = mobsNear(sim, 1)[0];
    const hp0 = dummy.hp;
    (sim as any).dealDamage(p, dummy, 20, false, 'physical', null, 'hit', true);
    expect(hp0 - dummy.hp).toBe(Math.round(20 * 1.15));
  });
});

describe('Pursuit', () => {
  it('grants a +30% speed burst on a kill', () => {
    const sim = warriorAtCap(45);
    sim.pickRowTalent(0, 'war_row_pursuit');
    killMob(sim, mobsNear(sim, 1)[0]);
    const aura = sim.player.auras.find((a: any) => a.kind === 'buff_speed');
    expect(aura?.value).toBeCloseTo(1.3);
    expect((sim as any).moveSpeedMult(sim.player)).toBeCloseTo(1.3);
  });
});

describe('Second Wind', () => {
  it('regenerates 3%/sec below the threshold and nothing above it', () => {
    const sim = warriorAtCap(46);
    sim.pickRowTalent(1, 'war_row_second_wind');
    while ((sim as any).tickCount % 40 !== 0) sim.tick();
    const p = sim.player;
    const meta = metaOf(sim);
    p.inCombat = true;
    p.hp = Math.floor(p.maxHp * 0.3);
    const low = p.hp;
    updateRegen((sim as any).ctx, p, meta);
    expect(p.hp).toBe(low + Math.round(p.maxHp * 0.06));
    p.hp = Math.floor(p.maxHp * (SECOND_WIND_THRESHOLD + 0.1));
    const high = p.hp;
    updateRegen((sim as any).ctx, p, meta);
    expect(p.hp).toBe(high);
  });
});

describe('Die by the Sword', () => {
  it('cuts damage taken 10%, doubled below 30% health', () => {
    const sim = warriorAtCap(47);
    sim.pickRowTalent(1, 'war_row_die_by_the_sword');
    const p = sim.player;
    const mob = mobsNear(sim, 1)[0];
    sim.castAbility('die_by_sword');
    expect(p.auras.some((a: any) => a.kind === 'die_by_sword')).toBe(true);
    p.hp = p.maxHp;
    const hp0 = p.hp;
    (sim as any).dealDamage(mob, p, 100, false, 'physical', null, 'hit', true);
    expect(hp0 - p.hp).toBe(90);
    p.hp = Math.floor(p.maxHp * 0.2);
    const hp1 = p.hp;
    (sim as any).dealDamage(mob, p, 100, false, 'physical', null, 'hit', true);
    expect(hp1 - p.hp).toBe(80);
  });
});

describe('Piercing Howl', () => {
  it('slows every hostile within 15 yards by 50% for 15s', () => {
    const sim = warriorAtCap(48);
    sim.pickRowTalent(2, 'war_row_piercing_howl');
    const mob = mobsNear(sim, 1)[0];
    standOff(sim, mob, 10);
    sim.player.resource = 50;
    sim.castAbility('piercing_howl');
    const slow = mob.auras.find((a: any) => a.kind === 'slow');
    expect(slow?.value).toBe(0.5);
    expect(slow?.remaining).toBeCloseTo(15, 0);
  });
});

describe('Battle Rhythm', () => {
  it('empowers every third cast: +20% rage generation on it', () => {
    const sim = warriorAtCap(49);
    sim.pickRowTalent(3, 'war_row_battle_rhythm');
    const p = sim.player;
    const mob = mobsNear(sim, 1)[0];
    standOff(sim, mob, 12);
    sim.targetEntity(mob.id);
    p.resource = 60;
    sim.castAbility('battle_shout'); // cast 1
    for (let i = 0; i < 32; i++) sim.tick(); // clear the GCD
    sim.castAbility('demoralizing_shout'); // cast 2
    const before = p.resource;
    sim.castAbility('charge'); // cast 3: empowered (+20% on its 9 rage)
    expect(p.resource).toBeCloseTo(Math.min(100, before + 9 * 1.2));
  });
});

describe('Colossal Might', () => {
  it('shaves offensive cooldowns as rage is spent', () => {
    const sim = warriorAtCap(50);
    sim.pickRowTalent(5, 'war_row_colossal_might');
    sim.pickRowTalent(4, 'war_row_recklessness');
    const p = sim.player;
    p.resource = 60;
    sim.castAbility('recklessness');
    expect(p.cooldowns.get('recklessness')).toBe(180);
    sim.castAbility('battle_shout'); // 10 rage -> 1s shaved
    expect(p.cooldowns.get('recklessness')).toBeCloseTo(179);
  });
});

describe('Avatar', () => {
  it('breaks control on the caster and amps damage while transformed', () => {
    const sim = warriorAtCap(51);
    sim.pickRowTalent(4, 'war_row_avatar');
    const p = sim.player;
    p.auras.push({
      id: 'test_root',
      name: 'Test Root',
      kind: 'root',
      value: 0,
      remaining: 6,
      duration: 6,
      sourceId: p.id,
      school: 'physical',
    });
    sim.castAbility('avatar');
    expect(p.auras.some((a: any) => a.kind === 'root')).toBe(false);
    expect(p.auras.some((a: any) => a.kind === 'buff_avatar')).toBe(true);
    expect(p.scale).toBeCloseTo(1.15);
    const mob = mobsNear(sim, 1)[0];
    const hp0 = mob.hp;
    (sim as any).dealDamage(p, mob, 20, false, 'physical', null, 'hit', true);
    expect(hp0 - mob.hp).toBe(Math.round(20 * 1.2));
  });
});

describe('Sanguine Aura', () => {
  it('buffs the caster (a melee class) with attack speed and damage', () => {
    const sim = warriorAtCap(52);
    sim.pickRowTalent(5, 'war_row_sanguine_aura');
    const p = sim.player;
    sim.castAbility('sanguine_aura');
    const haste = p.auras.find((a: any) => a.kind === 'attackspeed');
    const amp = p.auras.find((a: any) => a.kind === 'buff_dmg_done');
    expect(haste?.value).toBeCloseTo(1 / 1.1);
    expect(amp?.value).toBeCloseTo(0.1);
    expect(haste?.remaining).toBeCloseTo(20, 0);
    // The melee filter: warriors in, pure casters out (class-level v1).
    expect(MELEE_CLASSES.has('warrior')).toBe(true);
    expect(MELEE_CLASSES.has('mage')).toBe(false);
    expect(MELEE_CLASSES.has('priest')).toBe(false);
    expect(MELEE_CLASSES.has('warlock')).toBe(false);
  });
});

describe('determinism with phase 3 talents', () => {
  it('same seed + same picks + same actions give an identical world', () => {
    const run = () => {
      const sim = warriorAtCap(53);
      sim.pickRowTalent(4, 'war_row_bloodbath');
      sim.pickRowTalent(0, 'war_row_pursuit');
      killMob(sim, mobsNear(sim, 1)[0]);
      for (let i = 0; i < 60; i++) sim.tick();
      const p = sim.player;
      return { hp: p.hp, resource: p.resource, crit: p.critChance, auras: p.auras.length };
    };
    expect(run()).toEqual(run());
  });
});
