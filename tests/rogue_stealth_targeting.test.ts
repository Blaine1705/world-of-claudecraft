import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { summonPet } from '../src/sim/pet/pet_commands';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { addThreat } from '../src/sim/threat';
import type { Entity } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

// Entering Duskveil must drop the rogue out of every hostile's targeting.
//
// The reported PvP defect: a hunter or warlock pet that already had the rogue
// as its aggro target kept it through the stealth cast, because updatePet only
// releases a HELD target when petCanSeeTarget fails, and a stealthed player
// inside the pet's detection radius still passes that. So the pet went on
// hitting someone the owner could no longer see. The mob and hostile-player
// arms of the same rule are covered here too.

const DEMON_TEMPLATE = 'emberkin';

type SimInternals = { rebucket(e: Entity): void; addEntity(e: Entity): void; ctx: SimContext };

function internals(sim: Sim): SimInternals {
  return sim as unknown as SimInternals;
}

function teleport(sim: Sim, e: Entity, x: number, z: number): void {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  internals(sim).rebucket(e);
}

/** Duelling rogue and warlock: the duel is what makes the two sides hostile,
 *  and a pet resolves its hostility through its owner. */
function duelRig(foeClass: 'warlock' | 'hunter' = 'warlock'): {
  sim: Sim;
  rogue: Entity;
  foe: Entity;
  rogueId: number;
} {
  const sim = new Sim({ seed: 17, playerClass: 'rogue', noPlayer: true });
  const rogueId = sim.addPlayer('rogue', 'Slip');
  const foeId = sim.addPlayer(foeClass, 'Foe');
  sim.duels.set(rogueId, { a: rogueId, b: foeId, state: 'active', timer: 0 });
  sim.duels.set(foeId, sim.duels.get(rogueId)!);
  const rogue = sim.entities.get(rogueId)!;
  const foe = sim.entities.get(foeId)!;
  sim.setPlayerLevel(20, rogueId);
  teleport(sim, rogue, 0, 0);
  teleport(sim, foe, 6, 0);
  rogue.resource = rogue.maxResource;
  return { sim, rogue, foe, rogueId };
}

/** Stealth is gated on being out of combat, which is not what these cases are
 *  about: clear the flags the setup incidentally set so the cast goes through. */
function slipIntoDuskveil(sim: Sim, rogue: Entity, rogueId: number): void {
  rogue.inCombat = false;
  rogue.combatTimer = 99;
  rogue.gcdRemaining = 0;
  rogue.resource = rogue.maxResource;
  sim.castAbility('stealth', rogueId);
  sim.tick();
  expect(rogue.stealthed).toBe(true);
}

describe('entering Duskveil clears every hostile lock on the rogue', () => {
  it('a warlock pet holding the rogue as its target lets go', () => {
    const { sim, rogue, foe, rogueId } = duelRig('warlock');
    summonPet(internals(sim).ctx, foe, DEMON_TEMPLATE);
    const pet = sim.petOf(foe.id)!;
    teleport(sim, pet, 4, 0);

    // The pet is locked on, well inside its own detection radius (4 yd against
    // the 18 yd base), which is exactly the case that used to survive stealth.
    pet.aggroTargetId = rogue.id;
    pet.inCombat = true;
    addThreat(pet, rogue.id, 50);
    sim.tick();
    expect(pet.aggroTargetId).toBe(rogue.id);

    slipIntoDuskveil(sim, rogue, rogueId);

    expect(pet.aggroTargetId).toBeNull();
    expect(pet.threat.has(rogue.id)).toBe(false);
    // ...and it does not simply re-acquire on the following ticks.
    for (let i = 0; i < 20; i++) sim.tick();
    expect(pet.aggroTargetId).toBeNull();
  });

  it('a hostile player loses the selection and the auto-attack feeding it', () => {
    const { sim, rogue, foe, rogueId } = duelRig();
    foe.targetId = rogue.id;
    foe.autoAttack = true;

    slipIntoDuskveil(sim, rogue, rogueId);

    expect(foe.targetId).toBeNull();
    expect(foe.autoAttack).toBe(false);
  });

  it('a hostile mob drops its hate-table entry and taunt lock', () => {
    const sim = new Sim({ seed: 17, playerClass: 'rogue', autoEquip: true });
    sim.setPlayerLevel(20);
    const rogue = sim.player;
    teleport(sim, rogue, 0, 0);
    const mob = createMob(33_000, MOBS.forest_wolf, 10, { x: 0, y: 0, z: 0 });
    mob.hostile = true;
    internals(sim).addEntity(mob);
    teleport(sim, mob, 5, 0);
    mob.aiState = 'chase';
    mob.aggroTargetId = rogue.id;
    mob.forcedTargetId = rogue.id;
    mob.forcedTargetTimer = 3;
    addThreat(mob, rogue.id, 40);

    slipIntoDuskveil(sim, rogue, sim.player.id);

    expect(mob.aggroTargetId).toBeNull();
    expect(mob.forcedTargetId).toBeNull();
    expect(mob.threat.size).toBe(0);
  });

  it("leaves the rogue's own target alone: Duskveil is an opener, not an escape", () => {
    const { sim, rogue, foe, rogueId } = duelRig();
    sim.targetEntity(foe.id, rogueId);
    expect(rogue.targetId).toBe(foe.id);

    slipIntoDuskveil(sim, rogue, rogueId);

    expect(rogue.targetId).toBe(foe.id);
  });

  it('leaves a hostile who is targeting somebody else untouched', () => {
    const { sim, rogue, foe, rogueId } = duelRig();
    const bystanderId = sim.addPlayer('mage', 'Bystander');
    foe.targetId = bystanderId;
    foe.inCombat = true;
    // Freshly in combat, so the tick's own out-of-combat decay is not what
    // decides the inCombat assertion below.
    foe.combatTimer = 0;

    slipIntoDuskveil(sim, rogue, rogueId);

    // Only a hostile pointed AT the rogue is cleared, and combat state is never
    // touched (losing sight of one opponent is not leaving the fight).
    // The foe's own autoAttack is deliberately not asserted here: the ordinary
    // auto-attack maintenance owns it and drops it for its own reasons against
    // a non-hostile selection, which has nothing to do with this rule.
    expect(foe.targetId).toBe(bystanderId);
    expect(foe.inCombat).toBe(true);
  });
});
