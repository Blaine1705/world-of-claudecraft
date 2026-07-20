import { describe, expect, it } from 'vitest';
import { warriorMeleeDefense } from '../src/sim/combat/warrior_hit_table';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { activateDivineAscension, grantDevotion } from '../src/sim/paladin_devotion';
import { type ResolvedAbility, Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

function hostileNear(sim: Sim): Entity {
  const player = sim.player;
  const mob = createMob(9001, MOBS.ridge_stalker, 20, {
    x: player.pos.x + 2,
    y: player.pos.y,
    z: player.pos.z,
  });
  mob.maxHp = mob.hp = 1_000_000;
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  return mob;
}

function resolve(sim: Sim, id: string): ResolvedAbility {
  const ability = sim.resolvedAbility(id);
  if (!ability) throw new Error(`missing ability ${id}`);
  return ability;
}

function run(sim: Sim, target: Entity | null, resolved: ResolvedAbility): void {
  const meta = (sim as unknown as { players: Map<number, unknown> }).players.get(sim.playerId);
  (
    sim as unknown as {
      ctx: {
        runEffects(
          player: Entity,
          meta: unknown,
          target: Entity | null,
          ability: ResolvedAbility,
        ): void;
      };
    }
  ).ctx.runEffects(sim.player, meta, target, resolved);
}

describe('Paladin core abilities', () => {
  it('exposes the compact replacement kit while retaining old actions only as hidden data', () => {
    const sim = new Sim({ seed: 7, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    expect(sim.setSpec('retribution')).toBe(true);

    expect(resolve(sim, 'divine_ascension').def.hiddenFromPlayer).not.toBe(true);
    expect(resolve(sim, 'oathstrike').def.specs).toEqual(['retribution']);
    expect(resolve(sim, 'judgement').def.hiddenFromPlayer).toBe(true);
    expect(sim.resolvedAbility('mercy_lance')).toBeNull();
    expect(sim.resolvedAbility('sunward_disc')).toBeNull();
  });

  it('generates Devotion, empowers Dawnfall, banks generation, and spends one charge', () => {
    const sim = new Sim({ seed: 11, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('retribution');
    hostileNear(sim);

    const normal = resolve(sim, 'dawnfall');
    const normalAoe = normal.effects.find((effect) => effect.type === 'aoeDamage');
    expect(normalAoe).toMatchObject({ min: 66, max: 84, radius: 6 });
    run(sim, null, normal);
    expect(sim.player.paladinDevotion?.value).toBe(2);
    expect(sim.drainEvents()).not.toContainEqual(
      expect.objectContaining({ type: 'spellfx', fx: 'paladinAscensionImpact' }),
    );

    grantDevotion(sim.player, 18);
    expect(activateDivineAscension(sim.player)).toBe(true);
    const empowered = resolve(sim, 'dawnfall');
    const empoweredAoe = empowered.effects.find((effect) => effect.type === 'aoeDamage');
    expect(empoweredAoe).toMatchObject({ min: 99, max: 126, radius: 10 });

    run(sim, null, empowered);
    expect(sim.player.paladinDevotion).toMatchObject({
      value: 2,
      ascensionCharges: 4,
    });
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'spellfx',
        fx: 'paladinAscensionImpact',
        sourceId: sim.player.id,
        targetId: sim.player.id,
        ability: 'dawnfall',
        impact: 'area',
      }),
    );
  });

  it('keeps empowered Mercy Lance offensive against enemies and healing for allies', () => {
    const sim = new Sim({ seed: 37, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('holy');
    const enemy = hostileNear(sim);
    grantDevotion(sim.player, 20);
    activateDivineAscension(sim.player);

    run(sim, enemy, resolve(sim, 'mercy_lance'));
    const enemyEvents = sim.drainEvents();
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(enemyEvents).toContainEqual(
      expect.objectContaining({ type: 'damage', targetId: enemy.id }),
    );
    expect(enemyEvents).not.toContainEqual(
      expect.objectContaining({ type: 'heal2', targetId: enemy.id }),
    );
    expect(enemyEvents).toContainEqual(
      expect.objectContaining({
        type: 'spellfx',
        fx: 'paladinAscensionImpact',
        targetId: enemy.id,
        impact: 'offensive',
      }),
    );

    sim.player.hp = Math.round(sim.player.maxHp * 0.5);
    run(sim, sim.player, resolve(sim, 'mercy_lance'));
    const friendlyEvents = sim.drainEvents();
    expect(friendlyEvents).toContainEqual(
      expect.objectContaining({ type: 'heal2', targetId: sim.player.id }),
    );
    expect(friendlyEvents).toContainEqual(
      expect.objectContaining({
        type: 'spellfx',
        fx: 'paladinAscensionImpact',
        impact: 'healing',
      }),
    );
  });

  it('refuses Divine Ascension before 20 Devotion and activates it when ready', () => {
    const sim = new Sim({ seed: 13, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('holy');

    sim.castAbility('divine_ascension');
    expect(sim.player.paladinDevotion?.ascensionCharges).toBe(0);
    expect(sim.drainEvents()).not.toContainEqual(
      expect.objectContaining({ type: 'spellfx', fx: 'paladinAscensionStart' }),
    );

    grantDevotion(sim.player, 20);
    sim.castAbility('divine_ascension');
    expect(sim.player.paladinDevotion).toMatchObject({
      value: 0,
      ascensionCharges: 5,
      ascensionRemaining: 25,
    });
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'spellfx',
        fx: 'paladinAscensionStart',
        sourceId: sim.player.id,
      }),
    );
  });

  it('lets Bastion Rite add block without giving Paladins warrior parry', () => {
    const sim = new Sim({ seed: 17, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('protection');
    const mob = hostileNear(sim);
    mob.pos = { x: sim.player.pos.x, y: sim.player.pos.y, z: sim.player.pos.z + 2 };
    sim.addItem('eastbrook_buckler', 1);
    sim.equipItem('eastbrook_buckler');
    sim.player.facing = 0;

    const before = warriorMeleeDefense(sim.player, mob);
    expect(before).toEqual({ parryChance: 0, blockChance: 0.05 });

    run(sim, null, resolve(sim, 'bastion_rite'));
    const during = warriorMeleeDefense(sim.player, mob);
    expect(during).toEqual({ parryChance: 0, blockChance: 0.25 });
    expect(sim.player.paladinDevotion?.value).toBe(1);
  });

  it('generates Protection Devotion from actual blocks with an internal cooldown', () => {
    const sim = new Sim({ seed: 29, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('protection');
    sim.addItem('eastbrook_buckler', 1);
    sim.equipItem('eastbrook_buckler');
    const mob = hostileNear(sim);
    mob.pos = { x: sim.player.pos.x, y: sim.player.pos.y, z: sim.player.pos.z + 2 };
    mob.weapon = { min: 20, max: 20, speed: 2 };
    mob.attackPower = 0;
    sim.player.facing = 0;
    sim.player.dodgeChance = 0;
    sim.player.blockChance = 1;
    sim.player.stats.armor = 0;
    sim.rng.next = () => 0.9;

    const mobSwing = (sim as unknown as { mobSwing(attacker: Entity, target: Entity): void })
      .mobSwing;
    mobSwing.call(sim, mob, sim.player);
    expect(sim.player.paladinDevotion).toMatchObject({ value: 1, blockIcdRemaining: 6 });

    sim.player.hp = sim.player.maxHp;
    mobSwing.call(sim, mob, sim.player);
    expect(sim.player.paladinDevotion?.value).toBe(1);
  });

  it('generates Holy Devotion through effective healing without requiring damage', () => {
    const sim = new Sim({ seed: 31, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('holy');
    sim.player.hp = Math.round(sim.player.maxHp * 0.5);

    run(sim, sim.player, resolve(sim, 'holy_light'));
    expect(sim.player.paladinDevotion?.value).toBe(1);
  });

  it('improves rescue tools during Ascension without marking them as charge spenders', () => {
    const holy = new Sim({ seed: 19, playerClass: 'paladin', autoEquip: true });
    holy.setPlayerLevel(20);
    holy.setSpec('holy');
    grantDevotion(holy.player, 20);
    activateDivineAscension(holy.player);
    const lifeCovenant = resolve(holy, 'life_covenant');
    expect(lifeCovenant.effects).toContainEqual({ type: 'absorb', amount: 120, duration: 6 });

    const protection = new Sim({ seed: 23, playerClass: 'paladin', autoEquip: true });
    protection.setPlayerLevel(20);
    protection.setSpec('protection');
    grantDevotion(protection.player, 20);
    activateDivineAscension(protection.player);
    const sacredChallenge = resolve(protection, 'sacred_challenge');
    expect(sacredChallenge.effects).toContainEqual({
      type: 'selfBuff',
      kind: 'buff_dr',
      value: 0.15,
      duration: 4,
    });

    run(protection, hostileNear(protection), sacredChallenge);
    expect(protection.player.paladinDevotion?.ascensionCharges).toBe(5);
  });

  it('transforms every marked core ability during Ascension', () => {
    const holy = new Sim({ seed: 41, playerClass: 'paladin', autoEquip: true });
    holy.setPlayerLevel(20);
    holy.setSpec('holy');
    grantDevotion(holy.player, 20);
    activateDivineAscension(holy.player);
    expect(resolve(holy, 'mercy_lance').effects).toEqual([
      { type: 'chainHeal', min: 80, max: 100, jumps: 1, falloff: 0.7, radius: 30 },
      { type: 'directDamage', min: 80, max: 100 },
    ]);
    expect(resolve(holy, 'dawns_embrace')).toMatchObject({
      castTime: 0,
      effects: [{ type: 'heal', min: 351, max: 419 }],
    });
    expect(resolve(holy, 'radiant_chorus').effects).toEqual([
      { type: 'aoeHeal', min: 108, max: 132, radius: 40 },
    ]);

    const protection = new Sim({ seed: 43, playerClass: 'paladin', autoEquip: true });
    protection.setPlayerLevel(20);
    protection.setSpec('protection');
    grantDevotion(protection.player, 20);
    activateDivineAscension(protection.player);
    expect(resolve(protection, 'vowkeeper_strike').effects).toEqual([
      { type: 'weaponStrike', bonus: 21, weaponMult: 1 },
      {
        type: 'selfBuff',
        kind: 'absorb',
        value: Math.round(protection.player.maxHp * 0.06),
        duration: 6,
        auraId: 'vowkeeper_strike_absorb',
      },
    ]);
    expect(resolve(protection, 'bastion_rite').effects).toEqual([
      { type: 'selfBuff', kind: 'buff_dr_phys', value: 0.2, duration: 10 },
      { type: 'selfBuff', kind: 'buff_block', value: 0.2, duration: 10 },
    ]);
    expect(resolve(protection, 'sunward_disc').effects).toEqual([
      { type: 'directDamage', min: 117, max: 143 },
      { type: 'chainDamage', min: 78, max: 98, jumps: 5, falloff: 1, radius: 10 },
    ]);
    expect(resolve(protection, 'guardian_covenant').effects).toEqual([
      { type: 'buffTarget', kind: 'buff_dr', value: 0.3, duration: 8 },
    ]);

    const retribution = new Sim({ seed: 47, playerClass: 'paladin', autoEquip: true });
    retribution.setPlayerLevel(20);
    retribution.setSpec('retribution');
    grantDevotion(retribution.player, 20);
    activateDivineAscension(retribution.player);
    expect(resolve(retribution, 'oathstrike').effects).toEqual([
      { type: 'weaponStrike', bonus: 25, weaponMult: 1.2 },
      { type: 'weaponStrike', bonus: 15, weaponMult: 0.72 },
    ]);
    expect(resolve(retribution, 'final_edict').effects).toEqual([
      { type: 'weaponStrike', bonus: 62, weaponMult: 1.68 },
      { type: 'aoeDamage', min: 55, max: 70, radius: 6, softCap: 5 },
    ]);
    expect(resolve(retribution, 'dawnfall').effects).toEqual([
      { type: 'aoeDamage', min: 99, max: 126, radius: 10, softCap: 5 },
    ]);
    expect(resolve(retribution, 'faithforged_guard').effects).toEqual([
      { type: 'absorb', amount: 210, duration: 8 },
    ]);
  });

  it('labels defensive Ascension impacts independently from damage and healing', () => {
    const sim = new Sim({ seed: 43, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('retribution');
    grantDevotion(sim.player, 20);
    activateDivineAscension(sim.player);

    run(sim, null, resolve(sim, 'faithforged_guard'));
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'spellfx',
        fx: 'paladinAscensionImpact',
        ability: 'faithforged_guard',
        impact: 'defensive',
      }),
    );
  });

  it('anchors Final Edict empowered nova on the Paladin', () => {
    const sim = new Sim({ seed: 59, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(20);
    sim.setSpec('retribution');
    const enemy = hostileNear(sim);
    grantDevotion(sim.player, 20);
    activateDivineAscension(sim.player);

    run(sim, enemy, resolve(sim, 'final_edict'));
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'spellfx',
        fx: 'paladinAscensionImpact',
        sourceId: sim.player.id,
        targetId: sim.player.id,
        ability: 'final_edict',
        impact: 'area',
      }),
    );
  });
});
