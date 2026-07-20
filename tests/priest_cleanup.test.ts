import { describe, expect, it } from 'vitest';
import { summonGuardian } from '../src/sim/combat/guardians';
import { placeDoctrineLink } from '../src/sim/combat/priest/doctrine';
import { bindEffigy, vespersOnEntityDeath } from '../src/sim/combat/priest/vespers';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Aura, Entity } from '../src/sim/types';

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

function setup(): { sim: Sim; priest: Entity; ctx: SimContext } {
  const sim = new Sim({ seed: 2920, playerClass: 'priest', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.setSpec('discipline')).toBe(true);
  sim.tick();
  return { sim, priest: sim.player, ctx: ctxOf(sim) };
}

function addAlly(sim: Sim): Entity {
  const id = sim.addPlayer('warrior', 'Cleanup Ally');
  sim.setPlayerLevel(20, id);
  const ally = sim.entities.get(id);
  if (!ally) throw new Error('ally missing');
  return ally;
}

function addMob(sim: Sim, id: number, z: number): Entity {
  const mob = createMob(id, MOBS.training_dummy, 20, {
    x: sim.player.pos.x,
    y: sim.player.pos.y,
    z: sim.player.pos.z + z,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = 100000;
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  return mob;
}

function dirge(priestId: number): Aura {
  return {
    id: 'shadow_word_pain',
    name: 'Dirge of Decay',
    kind: 'dot',
    remaining: 18,
    duration: 18,
    value: 10,
    tickInterval: 3,
    tickTimer: 3,
    sourceId: priestId,
    school: 'shadow',
  };
}

function seedTransientState(
  sim: Sim,
  priest: Entity,
  ctx: SimContext,
): { ally: Entity; mob: Entity } {
  const ally = addAlly(sim);
  const mob = addMob(sim, 9970, 8);
  placeDoctrineLink(ctx, priest, ally);
  ally.auras.push({
    id: 'seraphic_vigil',
    name: 'Seraphic Vigil',
    kind: 'heal_echo',
    remaining: 30,
    duration: 30,
    value: 180,
    value2: 0.35,
    sourceId: priest.id,
    school: 'holy',
  });
  mob.auras.push(dirge(priest.id));
  bindEffigy(ctx, priest, mob);
  summonGuardian(ctx, priest, {
    key: 'tithefiend',
    name: 'Tithefiend',
    color: 0x6c258a,
    scale: 0.82,
    remaining: 10,
    attackInterval: 2,
    minDamage: 20,
    maxDamage: 24,
    school: 'shadow',
    abilityId: 'tithefiend_strike',
    abilityName: 'Tithefiend Strike',
    preferredTargetId: mob.id,
    maxRange: 35,
  });
  return { ally, mob };
}

function expectCleared(sim: Sim, priest: Entity, ally: Entity, mob: Entity): void {
  expect(
    ally.auras.some((aura) => aura.sourceId === priest.id && aura.id === 'priest_doctrine'),
  ).toBe(false);
  expect(
    ally.auras.some((aura) => aura.sourceId === priest.id && aura.id === 'seraphic_vigil'),
  ).toBe(false);
  expect(mob.auras.some((aura) => aura.sourceId === priest.id && aura.id === 'priest_effigy')).toBe(
    false,
  );
  expect(
    [...sim.entities.values()].some(
      (entity) => entity.ownerId === priest.id && entity.guardianState,
    ),
  ).toBe(false);
}

describe('Priest transient lifecycle', () => {
  it('clears source-owned relationships and guardians on spec change', () => {
    const { sim, priest, ctx } = setup();
    const { ally, mob } = seedTransientState(sim, priest, ctx);
    expect(sim.setSpec('holy')).toBe(true);
    expectCleared(sim, priest, ally, mob);
  });

  it('clears the same state during full disconnect preparation', () => {
    const { sim, priest, ctx } = setup();
    const { ally, mob } = seedTransientState(sim, priest, ctx);
    sim.preparePlayerLeave(priest.id);
    expectCleared(sim, priest, ally, mob);
  });

  it('transfers a dying Effigy to the nearest own-Dirge target by distance then id', () => {
    const { sim, priest, ctx } = setup();
    expect(sim.setSpec('shadow')).toBe(true);
    const dying = addMob(sim, 9980, 8);
    const lowerIdTie = addMob(sim, 9981, 10);
    const higherIdTie = addMob(sim, 9982, 10);
    for (const mob of [dying, lowerIdTie, higherIdTie]) mob.auras.push(dirge(priest.id));
    bindEffigy(ctx, priest, dying);

    vespersOnEntityDeath(ctx, dying);

    expect(lowerIdTie.auras.some((aura) => aura.id === 'priest_effigy')).toBe(true);
    expect(higherIdTie.auras.some((aura) => aura.id === 'priest_effigy')).toBe(false);
  });
});
