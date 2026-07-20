import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

type TestSim = Sim & {
  addEntity(entity: Entity): void;
  nextId: number;
};

function hunter(spec: string, seed: number): TestSim {
  const sim = new Sim({ seed, playerClass: 'hunter', autoEquip: true }) as TestSim;
  sim.setPlayerLevel(20);
  expect(sim.setSpec(spec)).toBe(true);
  return sim;
}

function addMob(sim: TestSim, distance: number, hostile = true): Entity {
  const mob = createMob(sim.nextId++, MOBS.training_dummy, 20, {
    x: sim.player.pos.x,
    y: sim.player.pos.y,
    z: sim.player.pos.z + distance,
  });
  mob.hostile = hostile;
  mob.maxHp = 1_000_000;
  mob.hp = mob.maxHp;
  sim.addEntity(mob);
  return mob;
}

function addPet(sim: TestSim): Entity {
  const pet = createMob(sim.nextId++, MOBS.forest_wolf, 20, {
    x: sim.player.pos.x + 1,
    y: sim.player.pos.y,
    z: sim.player.pos.z + 2,
  });
  pet.hostile = false;
  pet.ownerId = sim.playerId;
  pet.maxHp = 1_000;
  pet.hp = pet.maxHp;
  sim.addEntity(pet);
  return pet;
}

function advance(sim: Sim, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let tick = 0; tick < seconds * 20; tick++) events.push(...sim.tick());
  return events;
}

function ready(sim: Sim, abilityId: string): void {
  sim.player.gcdRemaining = 0;
  sim.player.cooldowns.delete(abilityId);
}

describe('Hunter v0.29 baseline specialization loops', () => {
  it('uses a 100 Focus pool with 5 Focus per second passive regeneration', () => {
    const sim = hunter('marksmanship', 2910);
    expect(sim.player.resourceType).toBe('focus');
    expect(sim.player.maxResource).toBe(100);
    sim.player.resource = 0;
    advance(sim, 2);
    expect(sim.player.resource).toBe(10);
  });

  it('Pack Command awards state only from a living pet hit and transforms at three stages', () => {
    const sim = hunter('beast_mastery', 2911);
    const target = addMob(sim, 3);
    addPet(sim);
    sim.targetEntity(target.id);
    sim.player.resource = 0;

    for (let stage = 1; stage <= 3; stage++) {
      ready(sim, 'pack_command');
      sim.castAbility('pack_command');
      advance(sim, 0.1);
      expect(sim.player.resource).toBe(stage * 20);
      expect(sim.player.auras.find((aura) => aura.id === 'pack_ferocity')?.stacks).toBe(stage);
    }
    expect(sim.resolvedAbility('pack_command')?.def.id).toBe('unleash_beast');
  });

  it('Measured Shot grants Focus only when the shot completes, while Cold Focus accelerates it', () => {
    const sim = hunter('marksmanship', 2912);
    const target = addMob(sim, 20);
    sim.targetEntity(target.id);
    sim.player.resource = 0;

    sim.castAbility('measured_shot');
    advance(sim, 0.5);
    expect(sim.player.resource).toBe(0);
    advance(sim, 2);
    expect(sim.player.resource).toBe(20);

    ready(sim, 'cold_focus');
    sim.castAbility('cold_focus');
    advance(sim, 0.1);
    expect(sim.resolvedAbility('measured_shot')?.effects).toContainEqual({
      type: 'gainResource',
      amount: 30,
    });
    expect(sim.resolvedAbility('aimed_shot')?.castTime).toBeLessThan(2.5);
  });

  it('Fieldcraft opens a single wound, builds Momentum, and tears it with Woundrend', () => {
    const sim = hunter('survival', 2913);
    const target = addMob(sim, 12);
    sim.targetEntity(target.id);
    sim.player.resource = 0;

    sim.castAbility('bloodhook');
    advance(sim, 2);
    expect(target.auras.filter((aura) => aura.id === 'bloodhook_bleed')).toHaveLength(1);

    sim.player.pos.z = target.pos.z - 2;
    for (let stack = 1; stack <= 3; stack++) {
      ready(sim, 'raptor_strike');
      sim.castAbility('raptor_strike');
      advance(sim, 0.1);
      expect(sim.player.auras.find((aura) => aura.id === 'hunting_momentum')?.stacks).toBe(stack);
    }
    expect(sim.player.resource).toBeGreaterThanOrEqual(45);

    const wound = target.auras.find((aura) => aura.id === 'bloodhook_bleed');
    if (!wound) throw new Error('missing Fieldcraft wound');
    wound.remaining = 2;
    const before = target.hp;
    ready(sim, 'mongoose_bite');
    sim.castAbility('mongoose_bite');
    advance(sim, 0.1);
    expect(target.hp).toBeLessThan(before);
    expect(target.auras.filter((aura) => aura.id === 'bloodhook_bleed')).toHaveLength(1);
    expect(target.auras.find((aura) => aura.id === 'bloodhook_bleed')?.remaining).toBeGreaterThan(10);
    expect(sim.player.auras.some((aura) => aura.id === 'hunting_momentum')).toBe(false);
  });
});
