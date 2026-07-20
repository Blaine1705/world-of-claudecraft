import { describe, expect, it } from 'vitest';
import {
  FLOW_STATE_READY_ID,
  onShamanManaSpent,
  shamanManaCost,
} from '../src/sim/combat/shaman_talents';
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
  it('Searing Light: every 3rd Smite makes the next heal free', () => {
    const { sim, p } = rig('priest', 20, { 5: 'pri_r5_searing_light' });
    addTargetMob(sim);
    for (let i = 0; i < 3; i++) castAndSettle(sim, 'smite');
    expect(p.auras.some((a) => a.kind === 'next_cast_free')).toBe(true);
    sim.targetEntity(sim.playerId);
    const before = p.resource;
    sim.castAbility('flash_heal');
    for (let i = 0; i < 20 * 2; i++) sim.tick(); // cast-time heals bill at completion
    expect(p.resource).toBeGreaterThanOrEqual(before - 1); // the heal billed nothing
    expect(p.auras.some((a) => a.kind === 'next_cast_free')).toBe(false); // consumed
  });

  it('Improved Whispered Prayer: every third cast wards its target', () => {
    // The #1756 choice pass turned this row into Warding Refrain: every 3rd
    // Whispered Prayer wards, replacing the full-duration-Renew trigger.
    const { sim, p } = rig('priest', 20, { 5: 'pri_r5_improved_renew' });
    p.hp = Math.round(p.maxHp * 0.5);
    sim.targetEntity(sim.playerId);
    for (let i = 0; i < 3; i++) castAndSettle(sim, 'lesser_heal', 3);
    expect(p.auras.some((a) => a.kind === 'absorb' && a.id === 'pri_lingering_ward')).toBe(true);
  });

  it('Twisted Faith: Mindfracture hits harder on a DoT-afflicted target', () => {
    const run = (withDot: boolean) => {
      const { sim } = rig('priest', 20, { 5: 'pri_r5_twisted_faith' });
      const mob = addTargetMob(sim);
      if (withDot) castAndSettle(sim, 'shadow_word_pain', 2);
      const before = mob.hp;
      let dmg = 0;
      sim.player.resource = sim.player.maxResource;
      sim.castAbility('mind_blast');
      for (let i = 0; i < 20 * 3; i++) {
        for (const ev of sim.tick()) {
          if (ev.type === 'damage' && ev.ability === 'Mindfracture') dmg += ev.amount;
        }
      }
      expect(mob.hp).toBeLessThan(before);
      return dmg;
    };
    // Same seed and cast pattern either way; the DoT-afflicted hit must be
    // visibly larger (25% before crit variance; the seed draws no crit here).
    expect(run(true)).toBeGreaterThan(run(false) * 1.2);
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

  it('Greater Heal echo: dropping below 35% inside the window triggers the stored heal', () => {
    const { sim, p } = rig('priest', 20, { 14: 'pri_r14_greater_heal' });
    p.hp = Math.round(p.maxHp * 0.6);
    sim.targetEntity(sim.playerId);
    castAndSettle(sim, 'heal', 4);
    expect(p.auras.some((a) => a.kind === 'heal_echo')).toBe(true);
    const crash = Math.round(p.maxHp * 0.7);
    const beforeCrash = p.hp;
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
    ).dealDamage(null, p, crash, false, 'physical', null, 'hit');
    // The echo consumed and healed 60 on top of the post-crash floor.
    expect(p.auras.some((a) => a.kind === 'heal_echo')).toBe(false);
    expect(p.hp).toBeGreaterThanOrEqual(beforeCrash - crash + 59);
  });

  it('Inner Fire: a hit above 15% max health kindles a ward, once per 20 sec', () => {
    const { sim, p } = rig('priest', 20, { 17: 'pri_r17_inner_fire' });
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
  it('Wolfstep makes Shadewolf instant and clears movement control on entry', () => {
    const { sim, p } = rig('shaman', 20, { 5: 'sha_r5_concussion' });
    expect(sim.resolvedAbility('ghost_wolf')?.castTime).toBe(0);
    p.auras.push({
      id: 'test_root',
      name: 'Test Root',
      kind: 'root',
      value: 0,
      remaining: 10,
      duration: 10,
      sourceId: 999,
      school: 'frost',
    });
    sim.castAbility('ghost_wolf');
    expect(p.auras.some((aura) => aura.id === 'ghost_wolf')).toBe(true);
    expect(p.auras.some((aura) => aura.kind === 'root')).toBe(false);
  });

  it('the control row resolves a four-second interrupt or two-second root', () => {
    const { sim } = rig('shaman', 20, {
      11: 'sha_r11_ancestral_guidance',
    });
    expect(sim.resolvedAbility('earth_shock')?.effects).toContainEqual({
      type: 'interrupt',
      lockout: 4,
    });
    expect(
      rig('shaman', 20, { 11: 'sha_r11_elemental_attunement' }).sim.resolvedAbility('frost_shock')
        ?.effects,
    ).toContainEqual({ type: 'root', duration: 2 });
  });

  it('Flow State arms after 120 Mana and discounts the next mana action by 40', () => {
    const { sim, p } = rig('shaman', 20, { 14: 'sha_r14_chain_lightning' });
    onShamanManaSpent(sim.ctx, p, 70);
    expect(p.auras.some((aura) => aura.id === FLOW_STATE_READY_ID)).toBe(false);
    onShamanManaSpent(sim.ctx, p, 50);
    expect(p.auras.some((aura) => aura.id === FLOW_STATE_READY_ID)).toBe(true);
    expect(shamanManaCost(sim.ctx, p, 65)).toBe(25);
  });

  it('the level-20 row contains no additional action grants', () => {
    for (const optionId of ['sha_r20_bloodlust', 'sha_r20_elemental_fury', 'sha_r20_tidal_waves']) {
      const { sim } = rig('shaman', 20, { 20: optionId });
      expect(sim.meta(sim.playerId)?.talentMods.grants).toEqual([]);
    }
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
      const { sim, p } = rig('priest', 20, { 5: 'pri_r5_searing_light', 17: 'pri_r17_inner_fire' });
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
