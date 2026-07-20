import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// The priest/shaman/paladin row redesign (docs/design/choice-row-quality-pass.md):
// each proc-engine primitive proven end to end through the live content that
// uses it, on a real Sim. Deterministic setups; every assertion is a behavior a
// player would see.

function rig(cls: 'priest' | 'shaman' | 'paladin', level: number, rows: Record<number, string>) {
  const sim = new Sim({ seed: 11, playerClass: cls, autoEquip: true });
  sim.setPlayerLevel(level);
  expect(sim.applyTalents({ spec: null, rows })).toBe(true);
  const p = sim.player;
  p.resource = p.maxResource;
  return { sim, p };
}

function addTargetMob(sim: Sim, hp = 100000, dist = 3): Entity {
  const p = sim.player;
  const mob = createMob(9100, MOBS.forest_wolf, 20, {
    x: p.pos.x + dist,
    y: p.pos.y,
    z: p.pos.z,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = hp;
  (sim as unknown as { addEntity(e: Entity): void }).addEntity(mob);
  sim.targetEntity(mob.id);
  sim.player.facing = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
  return mob;
}

function castAndSettle(sim: Sim, ability: string, seconds = 4): void {
  sim.player.resource = sim.player.maxResource;
  sim.castAbility(ability);
  for (let i = 0; i < 20 * seconds; i++) sim.tick();
}

describe('priest redesign', () => {
  it('Veil Unbound makes Veilstep a control break and speed burst', () => {
    const { sim, p } = rig('priest', 20, { 5: 'pri_r5_searing_light' });
    p.auras.push({
      id: 'test_slow',
      name: 'Test Slow',
      kind: 'slow',
      value: 0.5,
      remaining: 10,
      duration: 10,
      sourceId: 999,
      school: 'shadow',
    });
    castAndSettle(sim, 'veilstep', 0);
    expect(p.auras.some((a) => a.kind === 'slow')).toBe(false);
    expect(p.auras).toContainEqual(
      expect.objectContaining({ id: 'priest_veil_unbound', kind: 'buff_speed', value: 1.5 }),
    );
  });

  it('Sheltering Step gives Psalm of Warding a target speed burst', () => {
    const { sim, p } = rig('priest', 20, { 5: 'pri_r5_improved_renew' });
    sim.targetEntity(sim.playerId);
    castAndSettle(sim, 'power_word_shield', 0);
    expect(p.auras).toContainEqual(
      expect.objectContaining({ id: 'priest_sheltering_step', kind: 'buff_speed', value: 1.4 }),
    );
  });

  it('Processional Grace enables casting while moving after Veilstep', () => {
    const { sim, p } = rig('priest', 20, { 5: 'pri_r5_twisted_faith' });
    castAndSettle(sim, 'veilstep', 0);
    expect(p.auras).toContainEqual(
      expect.objectContaining({ kind: 'processional_grace', remaining: 4 }),
    );
  });

  it('Improved Shield: a fully consumed Psalm of Warding heals its owner', () => {
    const { sim, p } = rig('priest', 20, { 8: 'pri_r8_improved_shield' });
    sim.targetEntity(sim.playerId);
    castAndSettle(sim, 'power_word_shield', 2);
    const shield = p.auras.find((a) => a.kind === 'absorb');
    expect(shield).toBeTruthy();
    p.hp = Math.round(p.maxHp * 0.5);
    const before = p.hp;
    // A hit big enough to eat the whole shield.
    (
      sim as unknown as {
        dealDamage(
          s: Entity | null,
          t: Entity,
          n: number,
          c: boolean,
          sc: string,
          a: string | null,
          k: string,
        ): void;
      }
    ).dealDamage(null, p, (shield as { value: number }).value + 1, false, 'physical', null, 'hit');
    expect(p.hp).toBeGreaterThanOrEqual(before + 45 - 1); // burst heal landed
  });

  it('Last Prayer restores 30% maximum health', () => {
    const { sim, p } = rig('priest', 20, { 8: 'pri_r17_desperate_prayer' });
    p.hp = Math.round(p.maxHp * 0.4);
    const before = p.hp;
    castAndSettle(sim, 'desperate_prayer', 0);
    expect(p.hp).toBe(before + Math.round(p.maxHp * 0.3));
  });

  it('Wounded Halo: a hit above 15% max health kindles a ward, once per 20 sec', () => {
    const { sim, p } = rig('priest', 20, { 8: 'pri_r17_inner_fire' });
    const hit = Math.round(p.maxHp * 0.2);
    const deal = (
      sim as unknown as {
        dealDamage(
          s: Entity | null,
          t: Entity,
          n: number,
          c: boolean,
          sc: string,
          a: string | null,
          k: string,
        ): void;
      }
    ).dealDamage.bind(sim);
    deal(null, p, hit, false, 'physical', null, 'hit');
    expect(p.auras.filter((a) => a.id === 'pri_inner_fire')).toHaveLength(1);
    p.auras.splice(
      p.auras.findIndex((a) => a.id === 'pri_inner_fire'),
      1,
    );
    deal(null, p, hit, false, 'physical', null, 'hit'); // inside the ICD: nothing
    expect(p.auras.filter((a) => a.id === 'pri_inner_fire')).toHaveLength(0);
  });
});

describe('shaman redesign', () => {
  it('Fault Line: every 3rd Arc Bolt makes the next shock free', () => {
    const { sim, p } = rig('shaman', 20, { 5: 'sha_r5_concussion' });
    addTargetMob(sim, 100000, 8);
    for (let i = 0; i < 3; i++) castAndSettle(sim, 'lightning_bolt');
    expect(p.auras.some((a) => a.kind === 'next_cast_free')).toBe(true);
    const before = p.maxResource;
    p.resource = before;
    sim.castAbility('earth_shock');
    for (let i = 0; i < 20; i++) sim.tick();
    expect(p.resource).toBe(before);
  });

  it('Improved Cinder Jolt: Earthen Jolt detonates the Cinder Jolt DoT', () => {
    const { sim } = rig('shaman', 20, {
      8: 'sha_r8_shock_efficiency',
      14: 'sha_r14_improved_flame_shock',
    });
    const mob = addTargetMob(sim, 100000, 8);
    castAndSettle(sim, 'flame_shock', 7); // the shocks share a cooldown; wait it out
    expect(mob.auras.some((a) => a.kind === 'dot' && a.id === 'flame_shock')).toBe(true);
    castAndSettle(sim, 'earth_shock', 1);
    expect(mob.auras.some((a) => a.kind === 'dot' && a.id === 'flame_shock')).toBe(false);
  });

  it('Weapon Fury: imbued swings shave the shock cooldowns', () => {
    const { sim, p } = rig('shaman', 20, { 14: 'sha_r14_weapon_fury' });
    const mob = addTargetMob(sim);
    castAndSettle(sim, 'rockbiter_weapon', 2);
    castAndSettle(sim, 'earth_shock', 1);
    const cds = p.cooldowns;
    const before = cds.get('earth_shock');
    expect(before).toBeGreaterThan(0);
    sim.startAutoAttack();
    let swings = 0;
    for (let i = 0; i < 20 * 10 && swings === 0; i++) {
      for (const ev of sim.tick()) {
        if (ev.type === 'damage' && ev.sourceId === p.id && ev.school === 'physical') swings++;
      }
    }
    expect(swings).toBeGreaterThan(0);
    const after = cds.get('earth_shock') ?? 0;
    // Natural decay over N ticks plus the 0.5 sec shave per landed swing.
    expect(mob.dead).toBe(false);
    expect(before! - after).toBeGreaterThan(0.5);
  });

  it('Undertow Promise: every 3rd Mending Waters leaves an emergency heal echo', () => {
    // The #1756 choice pass rebuilt this row off chain_heal (never obtainable)
    // onto baseline Mending Waters: every 3rd cast stores an 80-heal echo that
    // fires when the target drops below 35% inside its 10 sec window.
    const { sim, p } = rig('shaman', 20, { 20: 'sha_r20_tidal_waves' });
    p.hp = 1;
    sim.targetEntity(sim.playerId);
    for (let i = 0; i < 3; i++) castAndSettle(sim, 'healing_wave', 5);
    expect(p.auras.some((a) => a.id === 'sha_undertow_promise' && a.kind === 'heal_echo')).toBe(
      true,
    );
    p.hp = Math.ceil(p.maxHp * 0.4);
    const before = p.hp;
    sim.ctx.dealDamage(null, p, Math.ceil(p.maxHp * 0.1), false, 'physical', null, 'hit');
    expect(p.hp).toBeGreaterThan(before - Math.ceil(p.maxHp * 0.1));
    expect(p.auras.some((a) => a.id === 'sha_undertow_promise')).toBe(false);
  });
});

describe('paladin redesign', () => {
  it('Vengeful Exorcism: Verdict resets the Rite of Expulsion cooldown', () => {
    const { sim, p } = rig('paladin', 20, { 5: 'pal_r5_vengeful_exorcism' });
    addTargetMob(sim, 100000, 8);
    castAndSettle(sim, 'exorcism', 2);
    expect(p.cooldowns.get('exorcism')).toBeGreaterThan(0);
    castAndSettle(sim, 'seal_of_righteousness', 2);
    castAndSettle(sim, 'judgement', 2);
    expect(p.cooldowns.has('exorcism')).toBe(false);
  });

  it('Righteous Cause: swings under an active Oathbrand shave the Verdict cooldown', () => {
    const { sim, p } = rig('paladin', 20, { 14: 'pal_r14_righteous_cause' });
    addTargetMob(sim);
    castAndSettle(sim, 'seal_of_righteousness', 2);
    castAndSettle(sim, 'judgement', 2);
    castAndSettle(sim, 'seal_of_righteousness', 2); // judgement consumed the seal; re-brand
    const before = p.cooldowns.get('judgement');
    expect(before).toBeGreaterThan(0);
    sim.startAutoAttack();
    let swings = 0;
    for (let i = 0; i < 20 * 10 && swings === 0; i++) {
      for (const ev of sim.tick()) {
        if (ev.type === 'damage' && ev.sourceId === p.id && ev.school === 'physical') swings++;
      }
    }
    expect(swings).toBeGreaterThan(0);
    expect(p.cooldowns.get('judgement') ?? 0).toBeLessThan(before! - 0.5);
  });

  it('Deathless Ardor: a killing blow leaves 1 health, once per 180 sec', () => {
    const { sim, p } = rig('paladin', 20, { 17: 'pal_r17_ardent_defender' });
    const deal = (
      sim as unknown as {
        dealDamage(
          s: Entity | null,
          t: Entity,
          n: number,
          c: boolean,
          sc: string,
          a: string | null,
          k: string,
        ): void;
      }
    ).dealDamage.bind(sim);
    deal(null, p, p.hp + 500, false, 'physical', null, 'hit');
    expect(p.dead).toBe(false);
    expect(p.hp).toBe(1);
    deal(null, p, 50, false, 'physical', null, 'hit'); // inside the ICD: dies
    expect(p.dead).toBe(true);
  });

  // The #1756 choice pass redesigned aura_surge from the Radiant Swell armor
  // buff into Dawnward Ricochet (chain damage + silence); the new behavior is
  // pinned end to end in talent_retained_semantics_v026.test.ts.

  it('replay determinism: the proc-heavy priest run is bit-identical', () => {
    const run = () => {
      const { sim, p } = rig('priest', 20, { 5: 'pri_r5_searing_light', 8: 'pri_r17_inner_fire' });
      addTargetMob(sim);
      for (let i = 0; i < 3; i++) castAndSettle(sim, 'smite');
      return { hp: p.hp, mana: p.resource, auras: p.auras.map((a) => [a.id, a.kind]) };
    };
    expect(run()).toEqual(run());
  });
});

describe('druid Lifesap redesign', () => {
  it('restores 30 resource per classic tick for 10 sec, in combat', () => {
    const sim = new Sim({ seed: 11, playerClass: 'druid', autoEquip: true });
    sim.setPlayerLevel(20);
    expect(sim.applyTalents({ spec: null, rows: { 11: 'dru_r11_innervate' } })).toBe(true);
    const p = sim.player;
    p.resource = 0;
    p.inCombat = true;
    p.fiveSecondRule = 0; // no baseline mana regen mixes into the assertion
    sim.castAbility('innervate');
    sim.tick();
    expect(p.auras.some((a) => a.kind === 'resource_sap')).toBe(true);
    for (let i = 0; i < 20 * 11; i++) {
      p.fiveSecondRule = 0;
      sim.tick();
    }
    // five classic 2-sec ticks inside the 10 sec window
    expect(p.resource).toBe(100);
    expect(p.auras.some((a) => a.kind === 'resource_sap')).toBe(false); // expired
    expect(p.cooldowns.get('innervate')).toBeGreaterThan(60);
  });

  it('carries across a form shift and fills Rage in Bruin Form', () => {
    const sim = new Sim({ seed: 11, playerClass: 'druid', autoEquip: true });
    sim.setPlayerLevel(20);
    expect(sim.applyTalents({ spec: null, rows: { 11: 'dru_r11_innervate' } })).toBe(true);
    const p = sim.player;
    sim.castAbility('innervate');
    sim.tick();
    expect(p.auras.some((a) => a.kind === 'resource_sap')).toBe(true);
    p.gcdRemaining = 0;
    sim.castAbility('bear_form');
    for (let i = 0; i < 10; i++) sim.tick();
    expect(p.resourceType).toBe('rage');
    expect(p.auras.some((a) => a.kind === 'resource_sap')).toBe(true); // survived the shift
    p.resource = 0;
    for (let i = 0; i < 20 * 6; i++) sim.tick();
    expect(p.resource).toBeGreaterThanOrEqual(40); // sap ticks fed Rage in form
  });
});
