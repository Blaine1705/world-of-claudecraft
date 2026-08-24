import { describe, expect, it } from 'vitest';
import { dealDamage } from '../src/sim/combat/damage';
import { dropTargetsOnStealth } from '../src/sim/combat/stealth';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import { petCanSeeStealthedTarget } from '../src/sim/threat';
import type { Aura, Entity } from '../src/sim/types';

// Bug: pets could still see and hit stealthed rogues (proximity detection like a
// mob), and Vanish did not force enemies off the rogue. Pets now perceive stealth
// exactly like an enemy player (not at all), and entering stealth wipes every
// hostile hunter's lock. Covers Rogue Duskveil/Smokestep AND Druid Stalk.

type TestSim = Sim & { addEntity(entity: Entity): void; nextId: number };

function rogue(seed = 11): TestSim {
  const sim = new Sim({ seed, playerClass: 'rogue', autoEquip: true }) as TestSim;
  sim.setPlayerLevel(20);
  return sim;
}

function stealthAura(id = 'stealth', name = 'Duskveil'): Aura {
  return {
    id,
    name,
    kind: 'stealth',
    remaining: 3600,
    duration: 3600,
    value: 0.5,
    sourceId: 0,
    school: 'physical',
  };
}

function addMob(sim: TestSim): Entity {
  const mob = createMob(sim.nextId++, MOBS.training_dummy, 20, {
    x: sim.player.pos.x,
    y: sim.player.pos.y,
    z: sim.player.pos.z + 3,
  });
  mob.hostile = true;
  sim.addEntity(mob);
  return mob;
}

function addPet(sim: TestSim, ownerId: number): Entity {
  const pet = createMob(sim.nextId++, MOBS.forest_wolf, 20, {
    x: sim.player.pos.x + 1,
    y: sim.player.pos.y,
    z: sim.player.pos.z + 2,
  });
  pet.ownerId = ownerId; // an owned mob is a pet
  sim.addEntity(pet);
  return pet;
}

describe('pets cannot see stealthed rogues', () => {
  it('petCanSeeStealthedTarget: blind to Rogue stealth AND Druid prowl, sees otherwise', () => {
    const sim = rogue();
    const p = sim.player;
    expect(petCanSeeStealthedTarget(p)).toBe(true);
    p.auras.push(stealthAura('stealth', 'Duskveil'));
    expect(petCanSeeStealthedTarget(p)).toBe(false);
    p.auras = [stealthAura('prowl', 'Stalk')]; // druid Prowl is the same aura kind
    expect(petCanSeeStealthedTarget(p)).toBe(false);
  });

  it('a pet deals no damage to a stealthed player, but strikes a visible one', () => {
    const sim = rogue();
    const enemyPet = addPet(sim, 999_999); // an enemy pet (owned mob)
    const p = sim.player;
    p.auras.push(stealthAura());
    const blocked = dealDamage(sim.ctx, enemyPet, p, 50, false, 'physical', 'Bite', 'hit');
    expect(blocked).toBe(0);
    p.auras = [];
    const landed = dealDamage(sim.ctx, enemyPet, p, 50, false, 'physical', 'Bite', 'hit');
    expect(landed).toBeGreaterThan(0);
  });

  it('a pet drops a target that stealths (updatePet re-validates each tick)', () => {
    const sim = rogue();
    const rival = sim.addPlayer('warrior', 'Rival');
    const duel = {
      a: sim.playerId,
      b: rival,
      state: 'active' as const,
      timer: 0,
      controlled: new Map(),
    };
    sim.ctx.duels.set(sim.playerId, duel);
    sim.ctx.duels.set(rival, duel);
    const pet = addPet(sim, sim.playerId); // the rogue's own pet, hunting the rival
    const rivalEntity = sim.entities.get(rival)!;
    pet.aggroTargetId = rival; // a pet's combat target is aggroTargetId
    pet.inCombat = true;
    // Rival slips into stealth directly (no cast, so ONLY the pet-visibility rule
    // can drop the target here, not the Vanish sweep).
    rivalEntity.auras.push(stealthAura());
    rivalEntity.stealthed = true;
    sim.tick();
    expect(pet.aggroTargetId).toBe(null);
  });
});

describe('Vanish forces enemies off the rogue', () => {
  it('wipes the rogue from a mob hate table, aggro, taunt lock, and live target', () => {
    const sim = rogue();
    const mob = addMob(sim);
    mob.threat.set(sim.playerId, 500);
    mob.aggroTargetId = sim.playerId;
    mob.targetId = sim.playerId;
    mob.forcedTargetId = sim.playerId;
    mob.forcedTargetTimer = 3;
    sim.castAbility('vanish');
    sim.tick();
    expect(mob.threat.has(sim.playerId)).toBe(false);
    expect(mob.aggroTargetId).toBe(null);
    expect(mob.targetId).toBe(null);
    expect(mob.forcedTargetId).toBe(null);
  });

  it('drops an enemy pet locked onto the rogue', () => {
    const sim = rogue();
    const enemyPet = addPet(sim, 999_999);
    enemyPet.aggroTargetId = sim.playerId; // a pet's combat target
    enemyPet.targetId = sim.playerId;
    sim.castAbility('vanish');
    sim.tick();
    expect(enemyPet.aggroTargetId).toBe(null);
    expect(enemyPet.targetId).toBe(null);
  });

  it('drops a hostile (dueling) enemy player targeting the rogue', () => {
    const sim = rogue();
    const rival = sim.addPlayer('mage', 'Rival');
    const duel = {
      a: sim.playerId,
      b: rival,
      state: 'active' as const,
      timer: 0,
      controlled: new Map(),
    };
    sim.ctx.duels.set(sim.playerId, duel);
    sim.ctx.duels.set(rival, duel);
    const rivalEntity = sim.entities.get(rival)!;
    rivalEntity.targetId = sim.playerId;
    sim.castAbility('vanish');
    sim.tick();
    expect(rivalEntity.targetId).toBe(null);
  });

  it('leaves an ally who has the stealthing rogue targeted (party heal target)', () => {
    const sim = rogue();
    const ally = sim.addPlayer('priest', 'Friend'); // no duel: allies, not hostile
    const allyEntity = sim.entities.get(ally)!;
    allyEntity.targetId = sim.playerId;
    dropTargetsOnStealth(sim.ctx, sim.player);
    expect(allyEntity.targetId).toBe(sim.playerId);
  });
});
