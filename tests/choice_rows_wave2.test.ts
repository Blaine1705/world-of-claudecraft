import { describe, expect, it } from 'vitest';
import { onCastCompleted } from '../src/sim/combat/talent_procs';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, PlayerClass } from '../src/sim/types';

function rig(
  cls: PlayerClass,
  level: number,
  rows: Record<number, string>,
  spec: string | null = null,
  seed = 1,
) {
  const sim = new Sim({ seed, playerClass: cls, autoEquip: true });
  sim.setPlayerLevel(level);
  expect(sim.applyTalents({ spec, rows })).toBe(true);
  const p = sim.player;
  p.resource = p.maxResource;
  return { sim, p };
}

function addTargetMob(sim: Sim, hp = 100000, dist = 10): Entity {
  const p = sim.player;
  const mob = createMob(9200, MOBS.forest_wolf, 20, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + dist,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = hp;
  (sim as unknown as { addEntity(e: Entity): void }).addEntity(mob);
  sim.targetEntity(mob.id);
  p.facing = 0;
  return mob;
}

function castAndSettle(sim: Sim, ability: string, seconds = 4, refill = true): void {
  if (refill) sim.player.resource = sim.player.maxResource;
  sim.castAbility(ability);
  for (let i = 0; i < 20 * seconds; i++) sim.tick();
}

function dealDamage(sim: Sim, target: Entity, amount: number): void {
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
  ).dealDamage(null, target, amount, false, 'physical', null, 'hit');
}

function completeCast(sim: Sim, ability: string, target: Entity | null = null): void {
  onCastCompleted(
    (sim as unknown as { ctx: Parameters<typeof onCastCompleted>[0] }).ctx,
    sim.player,
    ability,
    target,
  );
}

// The mage and Hunter trees were replaced wholesale by owner-approved designs.
// Their coverage lives in tests/mage_choice_rows.test.ts and
// tests/hunter_talents.test.ts.

describe('rogue wave 2 choice rows', () => {
  it('Evasion grants a cheap builder and poison swings restore energy', () => {
    const { sim, p } = rig('rogue', 20, {
      14: 'rog_r14_venom_dividend',
      17: 'rog_r17_ghostfoot_gambit',
    });
    addTargetMob(sim, 100000, 3);
    p.resource = 40;
    castAndSettle(sim, 'evasion', 1, false);
    expect(p.auras.some((a) => a.id === 'rog_improved_evasion')).toBe(true);
    castAndSettle(sim, 'instant_poison', 2);
    p.resource = 20;
    sim.startAutoAttack();
    for (let i = 0; i < 20 * 6 && p.resource <= 20; i++) sim.tick();
    expect(p.resource).toBeGreaterThan(20);
  });

  it('Cheat Death prevents one killing blow', () => {
    const { sim, p } = rig('rogue', 20, { 8: 'rog_r8_borrowed_breath' });
    dealDamage(sim, p, p.hp + 100);
    expect(p.dead).toBe(false);
    expect(p.hp).toBe(1);
  });
});

describe('druid wave 2 choice rows', () => {
  it('Loping Stride triggers once per internal cooldown after a form change', () => {
    const { sim, p } = rig('druid', 20, { 5: 'dru_r5_ferocity' });
    castAndSettle(sim, 'cat_form', 1);
    expect(p.auras.some((a) => a.id === 'loping_stride' && a.kind === 'buff_speed')).toBe(true);
    p.auras = p.auras.filter((a) => a.id !== 'loping_stride');
    p.gcdRemaining = 0;
    sim.castAbility('bear_form');
    expect(p.auras.some((a) => a.id === 'loping_stride')).toBe(false);
  });

  it('Ironhide Reflex absorbs a large hit and respects its internal cooldown', () => {
    const { sim, p } = rig('druid', 20, { 8: 'dru_r8_improved_roots' });
    dealDamage(sim, p, Math.ceil(p.maxHp * 0.25));
    const shield = p.auras.find((a) => a.id === 'dru_ironhide_reflex');
    expect(shield?.kind).toBe('absorb');
    expect(shield?.value).toBe(Math.round(p.maxHp * 0.15));
    p.auras = p.auras.filter((a) => a.id !== 'dru_ironhide_reflex');
    dealDamage(sim, p, Math.ceil(p.maxHp * 0.25));
    expect(p.auras.some((a) => a.id === 'dru_ironhide_reflex')).toBe(false);
  });
});

describe('warlock wave 2 choice rows', () => {
  it('only Hexstorm still empowers Gloom Bolt, behind its internal cooldown', () => {
    // Balance pass: Pact Deepened and Ashen Focus are flat ability talents
    // (the instant-relay soup is gone); Hexstorm survives with an icd.
    const { sim, p } = rig('warlock', 20, {
      5: 'wlk_r5_improved_immolate',
      14: 'wlk_r14_ruin',
      20: 'wlk_r20_curse_mastery',
    });
    for (let i = 0; i < 3; i++) completeCast(sim, 'immolate');
    expect(p.auras.some((a) => a.id === 'wlk_improved_immolate')).toBe(false);
    const immolate = sim.resolvedAbility('immolate');
    expect(immolate?.effects[0]).toMatchObject({ type: 'directDamage' });
    for (let i = 0; i < 3; i++) completeCast(sim, 'curse_of_agony');
    expect(p.auras.some((a) => a.id === 'wlk_curse_mastery')).toBe(true);
    // Inside the 10 sec icd three more curses do NOT re-arm it.
    p.auras.length = 0;
    for (let i = 0; i < 3; i++) completeCast(sim, 'curse_of_agony');
    expect(p.auras.some((a) => a.id === 'wlk_curse_mastery')).toBe(false);
  });

  it('Hellglass Ward shields the warlock on the 3rd damaging cast, never the mob', () => {
    const { sim, p } = rig('warlock', 20, { 20: 'wlk_r20_grimoire_of_haste' });
    const mob = addTargetMob(sim);
    // Hold the mob still so nothing consumes the ward while the casts settle.
    mob.auras.push({
      id: 'test_hold',
      name: 'Test Hold',
      kind: 'stun',
      remaining: 600,
      duration: 600,
      value: 0,
      sourceId: p.id,
      school: 'shadow',
    });
    for (let i = 0; i < 3; i++) castAndSettle(sim, 'shadow_bolt');
    expect(mob.dead).toBe(false);
    expect(p.auras.some((a) => a.id === 'wlk_grimoire_of_carnage' && a.kind === 'absorb')).toBe(
      true,
    );
    expect(mob.auras.some((a) => a.id === 'wlk_grimoire_of_carnage')).toBe(false);
  });

  it('Deepened Hex and defensive pact hooks change live combat outcomes', () => {
    const hit = (withDot: boolean) => {
      // Seed hunted (post-merge camp order) so the level-20 bolt LANDS in both
      // arms (a resist zeroes the delta and voids the ratio). Spares: 3, 4.
      const { sim } = rig('warlock', 20, { 14: 'wlk_r14_amplify_curse' }, null, 2);
      const mob = addTargetMob(sim);
      if (withDot) {
        mob.auras.push({
          id: 'corruption',
          name: 'Corruption',
          kind: 'dot',
          remaining: 10,
          duration: 10,
          value: 1,
          tickInterval: 99,
          tickTimer: 99,
          sourceId: sim.player.id,
          school: 'shadow',
        });
      }
      const before = mob.hp;
      sim.player.resource = sim.player.maxResource;
      sim.castAbility('shadow_bolt');
      for (let i = 0; i < 20 * 4; i++) sim.tick();
      expect(mob.dead).toBe(false);
      return before - mob.hp;
    };
    expect(hit(true)).toBeGreaterThan(hit(false) * 1.15);

    // Phase-2 defensive pass: Fiendward is a demonic safety net now: the big
    // hit arms a 10 sec echo that pays 15% max health only if the wearer then
    // falls below 35%.
    const guarded = rig('warlock', 20, {
      11: 'wlk_r11_demon_armor',
      17: 'wlk_r17_demonic_resilience',
    });
    guarded.p.hp = Math.round(guarded.p.maxHp * 0.8);
    dealDamage(guarded.sim, guarded.p, Math.ceil(guarded.p.maxHp * 0.2)); // arms at ~60%
    const echo = guarded.p.auras.find((a) => a.id === 'wlk_demon_armor');
    expect(echo?.kind).toBe('heal_echo');
    expect(echo?.value).toBe(Math.round(guarded.p.maxHp * 0.15));
    const beforeDrop = guarded.p.hp;
    dealDamage(guarded.sim, guarded.p, Math.ceil(guarded.p.maxHp * 0.3)); // below 35%
    expect(guarded.p.hp).toBeGreaterThan(beforeDrop - Math.ceil(guarded.p.maxHp * 0.3));
    expect(guarded.p.auras.some((a) => a.id === 'wlk_demon_armor')).toBe(false);
  });
});
