import { describe, expect, it } from 'vitest';
import { gainRuin, spendRuin } from '../src/sim/combat/destruction';
import { consumeFreeCostFor } from '../src/sim/combat/empower_next';
import { onCastCompleted } from '../src/sim/combat/talent_procs';
import { canUseForbiddenReflection } from '../src/sim/combat/warlock_talents';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

function rig(rows: Record<number, string>, spec = 'destruction') {
  const sim = new Sim({ seed: 73, playerClass: 'warlock', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.applyTalents({ spec, rows })).toBe(true);
  sim.player.resource = sim.player.maxResource;
  return { sim, player: sim.player };
}

function addTarget(sim: Sim, z = 6, id = 9901): Entity {
  const player = sim.player;
  const mob = createMob(id, MOBS.forest_wolf, 20, {
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z + z,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = 10000;
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  sim.targetEntity(mob.id);
  player.facing = 0;
  return mob;
}

function ctxOf(sim: Sim) {
  return (sim as unknown as { ctx: Parameters<typeof onCastCompleted>[0] }).ctx;
}

function tick(sim: Sim, count: number): void {
  for (let i = 0; i < count; i++) sim.tick();
}

describe('warlock class talent tree', () => {
  it('offers sustained health-paid movement instead of another blink', () => {
    const { sim, player } = rig({ 5: 'wlk_r5_improved_immolate' });
    const hpBefore = player.hp;
    const positionBefore = { ...player.pos };

    sim.castAbility('sacrilegious_march');
    expect(player.pos).toEqual(positionBefore);
    expect(player.auras.find((aura) => aura.id === 'sacrilegious_march')).toMatchObject({
      kind: 'buff_speed',
      value: 1.35,
    });
    tick(sim, 20);
    expect(player.hp).toBe(hpBefore - Math.round(player.maxHp * 0.02));

    sim.castAbility('sacrilegious_march');
    expect(player.auras.some((aura) => aura.id === 'sacrilegious_march')).toBe(false);

    player.gcdRemaining = 0;
    player.hp = Math.ceil(player.maxHp * 0.21);
    player.inCombat = true;
    player.combatTimer = 0;
    sim.castAbility('sacrilegious_march');
    tick(sim, 20);
    expect(player.hp).toBe(Math.ceil(player.maxHp * 0.2));
    expect(player.auras.some((aura) => aura.id === 'sacrilegious_march')).toBe(false);
  });

  it('makes Leaden Hex a 15% maximum snare followed by a 1.5 sec root', () => {
    const { sim, player } = rig({ 8: 'wlk_r8_curse_of_exhaustion' });
    const target = addTarget(sim);

    for (let i = 0; i < 3; i++) onCastCompleted(ctxOf(sim), player, 'shadow_bolt', target);
    expect(target.auras.find((aura) => aura.id === 'wlk_leaden_hex_slow')).toMatchObject({
      kind: 'slow',
      value: 0.85,
      stacks: 3,
    });

    onCastCompleted(ctxOf(sim), player, 'shadow_bolt', target);
    expect(target.auras.some((aura) => aura.id === 'wlk_leaden_hex_slow')).toBe(false);
    expect(target.auras.find((aura) => aura.id === 'wlk_leaden_hex_root')).toMatchObject({
      kind: 'root',
      remaining: 1.5,
    });
    expect(target.auras.find((aura) => aura.id === 'wlk_leaden_hex_root_lock')).toMatchObject({
      kind: 'internal_cd',
      remaining: 15,
    });
    for (let i = 0; i < 4; i++) onCastCompleted(ctxOf(sim), player, 'shadow_bolt', target);
    expect(target.auras.filter((aura) => aura.id === 'wlk_leaden_hex_root')).toHaveLength(1);

    for (const [index, abilityId] of [
      'litany_of_guilt',
      'reaping_command',
      'abyssal_rift',
    ].entries()) {
      const extraTarget = addTarget(sim, 7 + index, 9910 + index);
      onCastCompleted(ctxOf(sim), player, abilityId, extraTarget);
      expect(extraTarget.auras.find((aura) => aura.id === 'wlk_leaden_hex_slow')).toMatchObject({
        stacks: 1,
      });
    }
  });

  it('keeps the class interrupt and grants its level 8 control version', () => {
    expect(rig({}).sim.resolvedAbility('spell_lock')).not.toBeNull();
    expect(rig({ 8: 'wlk_r8_voidfeast' }).sim.resolvedAbility('spell_lock')).toMatchObject({
      cooldown: 24,
      effects: [
        { type: 'interrupt', lockout: 4 },
        { type: 'silence', duration: 4 },
      ],
    });
  });

  it('implements Sanguine Covenant and protects the shared Consume channel', () => {
    const pact = rig({ 11: 'wlk_r11_fel_concentration' });
    const hpBefore = pact.player.hp;
    pact.sim.castAbility('dark_pact');
    expect(pact.player.hp).toBe(hpBefore - Math.round(hpBefore * 0.1));
    expect(pact.player.auras.find((aura) => aura.id === 'dark_pact')).toMatchObject({
      kind: 'absorb',
      value: Math.round(pact.player.maxHp * 0.3),
      remaining: 8,
    });

    const hunger = rig({ 11: 'wlk_r11_demon_armor' });
    const attacker = addTarget(hunger.sim);
    hunger.sim.castAbility('drain_life');
    const castBefore = hunger.player.castRemaining;
    const hpBeforeHit = hunger.player.hp;
    (
      hunger.sim as unknown as {
        dealDamage(
          source: Entity,
          target: Entity,
          amount: number,
          crit: boolean,
          school: string,
          ability: string,
          kind: 'hit',
        ): void;
      }
    ).dealDamage(attacker, hunger.player, 100, false, 'shadow', 'Test', 'hit');
    expect(hpBeforeHit - hunger.player.hp).toBe(85);
    expect(hunger.player.castRemaining).toBe(castBefore);
  });

  it('makes Pact Deepened increase Fiendhide armor by 50%', () => {
    const base = rig({});
    const deepened = rig({ 11: 'wlk_r11_improved_life_tap' });
    const baseArmor = base.player.stats.armor;
    const deepenedArmor = deepened.player.stats.armor;

    base.sim.castAbility('demon_skin');
    deepened.sim.castAbility('demon_skin');

    expect(base.player.stats.armor - baseArmor).toBe(80);
    expect(deepened.player.stats.armor - deepenedArmor).toBe(120);
  });

  it('awards one or two Shadow Credit charges from real specialization spending', () => {
    const { sim, player } = rig({ 14: 'wlk_r14_shadow_mastery' });
    const ctx = ctxOf(sim);
    gainRuin(ctx, player, 4);
    expect(spendRuin(ctx, player, 4)).toBe(true);
    expect(player.auras.find((aura) => aura.id === 'wlk_shadow_credit')?.charges).toBe(2);
    expect(consumeFreeCostFor(ctx, player, 'shadow_bolt')).toBe(true);
    expect(player.auras.find((aura) => aura.id === 'wlk_shadow_credit')?.charges).toBe(1);
    expect(consumeFreeCostFor(ctx, player, 'shadow_bolt')).toBe(true);
    expect(consumeFreeCostFor(ctx, player, 'shadow_bolt')).toBe(false);
  });

  it('speeds a generator only after standing still for a full second', () => {
    const { sim, player } = rig({ 17: 'wlk_r17_improved_fear' }, 'affliction');
    const target = addTarget(sim);
    tick(sim, 20);
    const base = sim.resolvedAbility('needle_of_fate')?.castTime ?? 0;
    sim.castAbility('needle_of_fate');
    expect(player.castTargetId).toBe(target.id);
    expect(player.castTotal).toBeCloseTo(base * 0.8);
  });

  it('reduces only shared class cooldowns while casting', () => {
    const { sim, player } = rig({ 20: 'wlk_r20_chaos_bolt' }, 'affliction');
    addTarget(sim);
    player.cooldowns.set('umbral_anchor', 10);
    player.cooldowns.set('hex_of_violence', 10);
    sim.castAbility('needle_of_fate');
    tick(sim, 20);
    expect(player.cooldowns.get('umbral_anchor')).toBeCloseTo(8.5);
    expect(player.cooldowns.get('hex_of_violence')).toBeCloseTo(9);
  });

  it('lets Forbidden Reflection repeat one shared cooldown without restarting it', () => {
    const { sim, player } = rig({
      11: 'wlk_r11_fel_concentration',
      20: 'wlk_r20_grimoire_of_haste',
    });
    sim.castAbility('dark_pact');
    expect(player.auras.some((aura) => aura.id === 'wlk_forbidden_reflection')).toBe(true);
    tick(sim, 30);
    const remaining = player.cooldowns.get('dark_pact') ?? 0;
    const hpBeforeCopy = player.hp;
    sim.castAbility('dark_pact');
    expect(player.hp).toBe(hpBeforeCopy - Math.round(hpBeforeCopy * 0.1));
    expect(player.cooldowns.get('dark_pact')).toBeCloseTo(remaining);
    expect(player.auras.some((aura) => aura.id === 'wlk_forbidden_reflection')).toBe(false);
  });

  it('removes transient talent state when the selected rows change', () => {
    const { sim, player } = rig({
      5: 'wlk_r5_improved_immolate',
      11: 'wlk_r11_fel_concentration',
      14: 'wlk_r14_shadow_mastery',
      20: 'wlk_r20_grimoire_of_haste',
    });
    const ctx = ctxOf(sim);
    sim.castAbility('sacrilegious_march');
    gainRuin(ctx, player, 4);
    expect(spendRuin(ctx, player, 4)).toBe(true);
    player.gcdRemaining = 0;
    sim.castAbility('dark_pact');
    expect(canUseForbiddenReflection(player, 'dark_pact')).toBe(true);

    expect(
      sim.applyTalents({
        spec: 'destruction',
        rows: {
          5: 'wlk_r5_bane',
          11: 'wlk_r11_fel_concentration',
          14: 'wlk_r14_ruin',
          20: 'wlk_r20_curse_mastery',
        },
      }),
    ).toBe(true);

    expect(player.auras.some((aura) => aura.id === 'sacrilegious_march')).toBe(false);
    expect(player.auras.some((aura) => aura.id === 'wlk_shadow_credit')).toBe(false);
    expect(canUseForbiddenReflection(player, 'dark_pact')).toBe(false);
    const hpAfterRespec = player.hp;
    tick(sim, 20);
    expect(player.hp).toBe(hpAfterRespec);
    expect(consumeFreeCostFor(ctx, player, 'shadow_bolt')).toBe(false);
  });

  it('pulls, damages, and stuns with Abyssal Rift', () => {
    const { sim, player } = rig({ 20: 'wlk_r20_curse_mastery' });
    const target = addTarget(sim, 12);
    const center = { x: player.pos.x, z: player.pos.z + 10 };
    const beforeDistance = Math.hypot(target.pos.x - center.x, target.pos.z - center.z);
    const hpBefore = target.hp;
    sim.castAbility('abyssal_rift', undefined, center);
    expect(target.hp).toBeLessThan(hpBefore);
    expect(Math.hypot(target.pos.x - center.x, target.pos.z - center.z)).toBeLessThan(
      beforeDistance,
    );
    expect(target.auras.find((aura) => aura.id === 'abyssal_rift_stun')).toMatchObject({
      kind: 'stun',
      remaining: 2,
    });
  });

  it('damages bosses with Abyssal Rift without pulling or stunning them', () => {
    const { sim, player } = rig({ 20: 'wlk_r20_curse_mastery' });
    const boss = createMob(9902, MOBS.nythraxis_scourge_of_thornpeak, 20, {
      x: player.pos.x,
      y: player.pos.y,
      z: player.pos.z + 12,
    });
    boss.hostile = true;
    boss.maxHp = boss.hp = 10000;
    (sim as unknown as { addEntity(entity: Entity): void }).addEntity(boss);
    const positionBefore = { ...boss.pos };
    const hpBefore = boss.hp;

    sim.castAbility('abyssal_rift', undefined, {
      x: player.pos.x,
      z: player.pos.z + 10,
    });

    expect(boss.hp).toBeLessThan(hpBefore);
    expect(boss.pos).toEqual(positionBefore);
    expect(boss.auras.some((aura) => aura.id === 'abyssal_rift_stun')).toBe(false);
  });
});
