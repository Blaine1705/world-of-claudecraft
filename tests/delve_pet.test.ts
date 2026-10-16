import { describe, expect, it } from 'vitest';
import { DELVES, isDelvePos } from '../src/sim/data';
import { delveKeepsPet } from '../src/sim/delves/delve_pet';
import { Sim } from '../src/sim/sim';
import { dist2d, type Entity } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

// A hunter's beast comes along into a delve and fights beside the delve companion
// (src/sim/delves/delve_pet.ts). Every other pet class is still stowed for the run.

function makeSim(cls: 'hunter' | 'warlock' = 'hunter', seed = 42) {
  return new Sim({ seed, playerClass: cls, autoEquip: true });
}

function teleport(sim: Sim, x: number, z: number) {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

function tameBoar(sim: Sim): Entity {
  sim.setPlayerLevel(10);
  const boar = [...sim.entities.values()].find(
    (e) => e.templateId === 'wild_boar' && e.ownerId === null,
  );
  (sim as any).completeTame(sim.player, boar!);
  const pet = sim.petOf(sim.playerId);
  expect(pet?.templateId).toBe('wild_boar');
  return pet!;
}

function enterReliquary(sim: Sim) {
  const door = DELVES.collapsed_reliquary.doorPos;
  teleport(sim, door.x, door.z);
  sim.enterDelve('collapsed_reliquary', 'normal');
}

function killPlayer(sim: Sim) {
  (sim as any).dealDamage(
    null,
    sim.player,
    sim.player.maxHp + 100,
    false,
    'physical',
    null,
    'hit',
    true,
  );
}

describe('delveKeepsPet', () => {
  it('keeps the hunter pet and stows every other pet class', () => {
    expect(delveKeepsPet('hunter')).toBe(true);
    expect(delveKeepsPet('warlock')).toBe(false);
    expect(delveKeepsPet('mage')).toBe(false);
  });
});

describe('hunter pet inside a delve', () => {
  it('enters the delve beside its owner, and the companion still spawns', () => {
    const sim = makeSim();
    const pet = tameBoar(sim);
    enterReliquary(sim);
    expect(isDelvePos(sim.player.pos.x)).toBe(true);
    // Same entity, not a rebuilt copy: nothing was stowed.
    expect(sim.petOf(sim.playerId)?.id).toBe(pet.id);
    expect((sim as any).delvePetStash.has(sim.playerId)).toBe(false);
    expect(isDelvePos(pet.pos.x)).toBe(true);
    expect(dist2d(pet.pos, sim.player.pos)).toBeLessThan(3);
    const run = sim.delveRunForPlayer(sim.playerId)!;
    expect(run.companion?.companionId).toBe('companion_tessa');
    expect(sim.entities.get(run.companion!.entityId)?.dead).toBe(false);
    // Both stay with the player over a few seconds of ticking.
    for (let i = 0; i < 20 * 3; i++) sim.tick();
    expect(sim.petOf(sim.playerId)?.id).toBe(pet.id);
    expect(sim.delveRunForPlayer(sim.playerId)?.companion).toBeDefined();
  });

  it('collides with the delve rooms: the pet resolves to its owner run', () => {
    const sim = makeSim();
    const pet = tameBoar(sim);
    enterReliquary(sim);
    const run = sim.delveRunForPlayer(sim.playerId)!;
    expect((sim as any).delveRunForEntity(pet)).toBe(run);
  });

  it('follows its owner through the tombstone into the next room', () => {
    const sim = makeSim();
    const pet = tameBoar(sim);
    enterReliquary(sim);
    const run = sim.delveRunForPlayer(sim.playerId)!;
    const before = { ...pet.pos };
    run.exitPortalOpen = true;
    (sim as any).advanceDelveModule(run);
    expect(run.moduleIndex).toBe(1);
    expect(dist2d(pet.pos, before)).toBeGreaterThan(10);
    expect(dist2d(pet.pos, sim.player.pos)).toBeLessThan(3);
  });

  it('comes back out with its owner on leave', () => {
    const sim = makeSim();
    const pet = tameBoar(sim);
    enterReliquary(sim);
    sim.leaveDelve();
    expect(isDelvePos(sim.player.pos.x)).toBe(false);
    expect(sim.petOf(sim.playerId)?.id).toBe(pet.id);
    expect(isDelvePos(pet.pos.x)).toBe(false);
    expect(dist2d(pet.pos, sim.player.pos)).toBeLessThan(3);
  });

  it('returns with its owner on the in-delve respawn', () => {
    const sim = makeSim();
    const pet = tameBoar(sim);
    enterReliquary(sim);
    killPlayer(sim);
    expect(sim.player.dead).toBe(true);
    expect(pet.dead).toBe(true);
    sim.releaseSpirit();
    expect(sim.player.dead).toBe(false);
    expect(isDelvePos(sim.player.pos.x)).toBe(true);
    expect(sim.petOf(sim.playerId)?.id).toBe(pet.id);
    expect(pet.dead).toBe(false);
    expect(dist2d(pet.pos, sim.player.pos)).toBeLessThan(3);
  });

  it('is carried out to the door when a second death fails the run', () => {
    const sim = makeSim();
    const pet = tameBoar(sim);
    enterReliquary(sim);
    killPlayer(sim);
    sim.releaseSpirit();
    killPlayer(sim);
    sim.releaseSpirit();
    sim.tick();
    expect(isDelvePos(sim.player.pos.x)).toBe(false);
    expect(sim.petOf(sim.playerId)?.id).toBe(pet.id);
    expect(isDelvePos(pet.pos.x)).toBe(false);
    expect(dist2d(pet.pos, sim.player.pos)).toBeLessThan(3);
  });

  it('a mid-delve save persists the live pet', () => {
    const sim = makeSim();
    tameBoar(sim);
    enterReliquary(sim);
    expect(sim.serializeCharacter(sim.playerId)?.pet?.templateId).toBe('wild_boar');
  });

  it('a petless hunter in a delve is told "You have no pet.", not that pets are banned', () => {
    const sim = makeSim();
    sim.setPlayerLevel(10);
    expect(sim.petOf(sim.playerId)).toBeNull();
    enterReliquary(sim);
    sim.drainEvents();
    sim.setPetMode('aggressive');
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'error' && e.text === 'You have no pet.')).toBe(true);
    expect(
      events.some(
        (e) => e.type === 'error' && e.text === 'Pets are not allowed inside the delves.',
      ),
    ).toBe(false);
  });
});

describe('non-hunter pets are still stowed', () => {
  it('a warlock demon is parked on enter and serialized from the stash mid-delve', () => {
    const sim = makeSim('warlock');
    sim.setPlayerLevel(10);
    sim.castAbility('summon_imp');
    for (let i = 0; i < 20 * 12 && sim.player.castingAbility; i++) sim.tick();
    expect(sim.petOf(sim.playerId)).not.toBeNull();
    enterReliquary(sim);
    expect(sim.petOf(sim.playerId)).toBeNull();
    expect((sim as any).delvePetStash.has(sim.playerId)).toBe(true);
    expect((sim as any).serializePet(sim.playerId)?.templateId).toBe('emberkin');
  });
});
