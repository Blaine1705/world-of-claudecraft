import { describe, expect, it } from 'vitest';
import { abilitiesKnownAt, type KnownAbility } from '../src/sim/content/classes';
import { computeTalentModifiers, TALENTS, type TalentAllocation } from '../src/sim/content/talents';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { AbilityEffect, Entity, PlayerClass } from '../src/sim/types';

function alloc(spec: string): TalentAllocation {
  return { spec, ranks: {}, choices: {} };
}

function mastery(cls: PlayerClass, spec: string) {
  return computeTalentModifiers(cls, alloc(spec), 20);
}

function known(cls: PlayerClass, id: string, spec?: string): KnownAbility {
  const mods = spec ? mastery(cls, spec) : undefined;
  const ability = abilitiesKnownAt(cls, 20, mods).find((a) => a.def.id === id);
  if (!ability) throw new Error(`missing ${cls} ability ${id}`);
  return ability;
}

function effect<T extends AbilityEffect['type']>(
  ability: KnownAbility,
  type: T,
): Extract<AbilityEffect, { type: T }> {
  const found = ability.effects.find((e) => e.type === type);
  if (!found) throw new Error(`missing ${type} effect on ${ability.def.id}`);
  return found as Extract<AbilityEffect, { type: T }>;
}

function metaOf(sim: Sim, entity: Entity) {
  const meta = (sim as unknown as { players: Map<number, unknown> }).players.get(entity.id);
  if (!meta) throw new Error(`missing player meta ${entity.id}`);
  return meta as { talentMods: ReturnType<typeof mastery> };
}

describe('spec masteries', () => {
  it('authors the ten PR B mastery effects exactly', () => {
    expect(TALENTS.paladin?.specs.find((s) => s.id === 'holy')?.mastery.effect).toEqual({
      global: { critDmgPct: 0.5 },
    });
    expect(TALENTS.priest?.specs.find((s) => s.id === 'discipline')?.mastery.effect).toEqual({
      global: { absorbPct: 0.3 },
      stats: { maxHpPct: 0.08 },
    });
    expect(TALENTS.druid?.specs.find((s) => s.id === 'restoration')?.mastery.effect).toEqual({
      global: { hotHealPct: 0.25 },
    });
    expect(TALENTS.shaman?.specs.find((s) => s.id === 'restoration')?.mastery.effect).toEqual({
      ability: [
        { ability: 'chain_heal', costPct: -0.2 },
        { ability: 'healing_wave', costPct: -0.2 },
      ],
    });
    expect(TALENTS.warlock?.specs.find((s) => s.id === 'affliction')?.mastery.effect).toEqual({
      global: { dotDmgPct: 0.2 },
    });
    expect(TALENTS.mage?.specs.find((s) => s.id === 'fire')?.mastery.effect).toEqual({
      global: { critDmgPct: 0.5 },
      stats: { crit: 0.02 },
    });
    expect(TALENTS.mage?.specs.find((s) => s.id === 'frost')?.mastery.effect).toEqual({
      global: { critVsRooted: 0.1 },
      stats: { armorPct: 0.1 },
    });
    expect(TALENTS.hunter?.specs.find((s) => s.id === 'beast_mastery')?.mastery.effect).toEqual({
      global: { petDmgPct: 0.35 },
      stats: { maxHpPct: 0.08 },
    });
    expect(TALENTS.rogue?.specs.find((s) => s.id === 'combat')?.mastery.effect).toEqual({
      global: { meleeHastePct: 0.1, meleeDmgPct: -0.1 },
    });
    expect(TALENTS.warlock?.specs.find((s) => s.id === 'demonology')?.mastery.effect).toEqual({
      global: { petDmgSharePct: 0.2 },
      stats: { staPct: 0.1 },
    });
  });

  it('bakes DoT, HoT, absorb, cost, and melee damage mastery fields into abilities', () => {
    expect(effect(known('warlock', 'corruption'), 'dot').total).toBe(85);
    expect(effect(known('warlock', 'corruption', 'affliction'), 'dot').total).toBe(102);

    expect(effect(known('druid', 'rejuvenation'), 'hot').total).toBe(116);
    expect(effect(known('druid', 'rejuvenation', 'restoration'), 'hot').total).toBe(145);

    expect(effect(known('priest', 'power_word_shield'), 'absorb').amount).toBe(145);
    expect(effect(known('priest', 'power_word_shield', 'discipline'), 'absorb').amount).toBe(189);

    expect(known('shaman', 'healing_wave').cost).toBe(90);
    expect(known('shaman', 'healing_wave', 'restoration').cost).toBe(72);

    expect(effect(known('rogue', 'sinister_strike'), 'weaponStrike').bonus).toBe(18);
    expect(effect(known('rogue', 'sinister_strike', 'combat'), 'weaponStrike').bonus).toBe(16);
  });

  it('applies passive stat, pet damage, damage-share, and heal-crit masteries at runtime', () => {
    const rogue = new Sim({ seed: 4, playerClass: 'rogue', autoEquip: true });
    rogue.setPlayerLevel(20);
    rogue.setSpec('combat');
    expect(rogue.player.meleeHaste).toBeCloseTo(0.1);

    const hunter = new Sim({ seed: 5, playerClass: 'hunter', autoEquip: true });
    hunter.setPlayerLevel(20);
    hunter.setSpec('beast_mastery');
    const hunterPet = createMob(9001, MOBS.forest_wolf, 20, hunter.player.pos);
    hunterPet.ownerId = hunter.player.id;
    expect(
      (hunter as unknown as { petDamageMult(e: Entity): number }).petDamageMult(hunterPet),
    ).toBeCloseTo(1.35);

    const paladin = new Sim({ seed: 6, playerClass: 'paladin', autoEquip: true });
    paladin.setPlayerLevel(20);
    paladin.setSpec('holy');
    paladin.player.stats.int = 2000;
    paladin.player.critDmgBonus = 0;
    paladin.player.hp = 0;
    (
      paladin as unknown as { applyHeal(s: Entity, t: Entity, a: number, n: string): void }
    ).applyHeal(paladin.player, paladin.player, 100, 'test');
    expect(paladin.player.hp).toBe(150);
    paladin.player.hp = 0;
    paladin.player.critDmgBonus = metaOf(paladin, paladin.player).talentMods.global.critDmgPct;
    (
      paladin as unknown as { applyHeal(s: Entity, t: Entity, a: number, n: string): void }
    ).applyHeal(paladin.player, paladin.player, 100, 'test');
    expect(paladin.player.hp).toBe(200);

    const warlock = new Sim({ seed: 7, playerClass: 'warlock', autoEquip: true });
    warlock.setPlayerLevel(20);
    warlock.setSpec('demonology');
    const demon = createMob(9002, MOBS.forest_wolf, 20, warlock.player.pos);
    demon.ownerId = warlock.player.id;
    demon.maxHp = demon.hp = 1000;
    (warlock as unknown as { addEntity(e: Entity): void }).addEntity(demon);
    warlock.player.hp = warlock.player.maxHp = 1000;
    (
      warlock as unknown as {
        dealDamage(
          s: Entity | null,
          t: Entity,
          a: number,
          c: boolean,
          sc: string,
          ab: string | null,
          k: 'hit',
        ): void;
      }
    ).dealDamage(null, warlock.player, 100, false, 'physical', null, 'hit');
    expect(warlock.player.hp).toBe(920);
    expect(demon.hp).toBe(980);
  });

  it('mastery strength ramps on the live level-up path (min(1, level/20) re-bake)', () => {
    const sim = new Sim({ seed: 11, playerClass: 'druid', autoEquip: true });
    sim.setPlayerLevel(10);
    sim.setSpec('restoration');
    const at10 = metaOf(sim, sim.player).talentMods.global.hotHealPct;
    expect(at10).toBeCloseTo(0.25 * (10 / 20), 10);

    // Ding through grantXp (the live level-up path), NOT setPlayerLevel/setSpec:
    // the ding itself must re-bake talentMods at the new level.
    const grant = (sim as unknown as { grantXp(amount: number): void }).grantXp.bind(sim);
    for (let i = 0; i < 200 && sim.player.level < 20; i++) grant(5000);
    expect(sim.player.level).toBe(20);
    const at20 = metaOf(sim, sim.player).talentMods.global.hotHealPct;
    expect(at20).toBeCloseTo(0.25, 10);
    expect(at20).toBeGreaterThan(at10);
  });
});
