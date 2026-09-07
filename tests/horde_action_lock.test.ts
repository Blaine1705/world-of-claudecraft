import { describe, expect, it } from 'vitest';
import { HORDE_NPC_DEF, HORDE_NPC_ID, HORDE_QUEST_ID } from '../src/sim/content/world_quest_horde';
import { BUILTIN_WORLD, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { hordeActionsLocked } from '../src/sim/horde_action_lock';
import { mountItemId, summonMountItem } from '../src/sim/mounts';
import { petOf, summonPet } from '../src/sim/pet/pet_commands';
import { Sim } from '../src/sim/sim';
import { WORLD_SEED } from '../src/sim/world_seed';

function setup(playerClass: 'mage' | 'warlock' = 'mage') {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass,
    devCommands: true,
    world: {
      ...BUILTIN_WORLD,
      camps: [],
      npcs: { [HORDE_NPC_DEF.id]: HORDE_NPC_DEF },
      groundObjects: [],
    },
  });
  sim.setPlayerLevel(22);
  sim.resetDay = '2026-09-06';
  sim.chat('/dev horde');
  sim.player.pos = sim.groundPos(HORDE_NPC_DEF.pos.x, HORDE_NPC_DEF.pos.z + 4);
  sim.talkToNpc(HORDE_NPC_ID);
  return sim;
}

describe('horde action lock', () => {
  it.each(['countdown', 'active'] as const)(
    'refuses Blink without spending resources or canceling the %s lane',
    (phase) => {
      const sim = setup();
      if (phase === 'active') for (let i = 0; i < 61; i++) sim.tick();
      const session = sim.worldQuestLog.get(HORDE_QUEST_ID)?.horde;
      expect(session?.phase).toBe(phase);
      const pos = { ...sim.player.pos };
      const resource = sim.player.resource;
      sim.castAbility('blink');
      expect(sim.player.pos).toEqual(pos);
      expect(sim.player.resource).toBe(resource);
      sim.tick();
      expect(sim.worldQuestLog.get(HORDE_QUEST_ID)?.horde).toBe(session);
      sim.moveInput.back = true;
      sim.tick();
      sim.moveInput.back = false;
      sim.player.gcdRemaining = 0;
      const afterExit = { ...sim.player.pos };
      sim.castAbility('blink');
      expect(sim.player.pos).not.toEqual(afterExit);
    },
  );

  it('guards slot, explicit target and ground-aim spell routes at the shared cast admission', () => {
    const sim = setup();
    const slot = sim.meta(sim.playerId)!.known.findIndex((known) => known.def.id === 'blink');
    expect(slot).toBeGreaterThanOrEqual(0);
    const pos = { ...sim.player.pos };
    sim.castAbilityBySlot(slot);
    sim.castAbilityOn('blink', sim.playerId);
    sim.castAbilityAt('blink', { x: pos.x, z: pos.z + 15 });
    expect(sim.player.pos).toEqual(pos);
    expect(sim.player.gcdRemaining).toBe(0);
  });

  it('does not consume potions or start a mount summon, and restores item use after leaving', () => {
    const sim = setup();
    const meta = sim.meta(sim.playerId)!;
    sim.addItem('minor_healing_potion', 1);
    sim.player.hp = sim.player.maxHp - 100;
    const hp = sim.player.hp;
    sim.useItem('minor_healing_potion');
    expect(sim.player.hp).toBe(hp);
    expect(sim.countItem('minor_healing_potion')).toBe(1);
    const reins = mountItemId('valorsteed')!;
    sim.addItem(reins, 1);
    meta.ridingTrained = true;
    sim.useItem(reins);
    expect(summonMountItem(sim.ctx, sim.playerId, 'valorsteed')).toBe(false);
    expect(sim.toggleMountFor(sim.playerId)).toBe(false);
    expect(sim.player.mountCastRemaining ?? 0).toBe(0);
    expect(sim.player.mountKey).toBe('');
    sim.moveInput.back = true;
    sim.tick();
    sim.moveInput.back = false;
    sim.useItem('minor_healing_potion');
    expect(sim.countItem('minor_healing_potion')).toBe(0);
    expect(sim.player.hp).toBeGreaterThan(hp);
    expect(summonMountItem(sim.ctx, sim.playerId, 'valorsteed')).toBe(true);
  });

  it('cannot engage a real hostile with auto-attack while the lane owns combat', () => {
    const sim = setup();
    const def = Object.values(MOBS)[0];
    const mob = createMob(998877, def, 1, { ...sim.player.pos, z: sim.player.pos.z + 2 });
    mob.hostile = true;
    sim.addEntity(mob);
    sim.targetEntity(mob.id);
    sim.startAutoAttack();
    expect(sim.player.autoAttack).toBe(false);
    expect(sim.player.inCombat).toBe(false);
    expect(mob.threat.size).toBe(0);
    sim.moveInput.back = true;
    sim.tick();
    sim.moveInput.back = false;
    sim.startAutoAttack();
    expect(sim.player.autoAttack).toBe(true);
  });

  it('refuses pet attack and special commands until the owner leaves the lane', () => {
    const sim = setup('warlock');
    summonPet(sim.ctx, sim.player, 'gloomshade');
    const pet = petOf(sim.ctx, sim.playerId)!;
    const target = createMob(998877, MOBS.wild_boar, 1, { ...pet.pos, z: pet.pos.z + 12 });
    sim.addEntity(target);
    sim.targetEntity(target.id);
    sim.petAttack();
    sim.petSpecial();
    expect(pet.aggroTargetId).toBeNull();
    expect(pet.inCombat).toBe(false);
    expect(target.threat.size).toBe(0);
    sim.moveInput.back = true;
    sim.tick();
    sim.moveInput.back = false;
    sim.petAttack();
    expect(pet.aggroTargetId).toBe(target.id);
  });

  it('unlocks failed, won and absent sessions including a completed practice attempt', () => {
    const sim = setup();
    const p = sim.worldQuestLog.get(HORDE_QUEST_ID)!;
    p.state = 'completed';
    expect(hordeActionsLocked(sim.worldQuestLog)).toBe(true);
    p.horde!.phase = 'failed';
    expect(hordeActionsLocked(sim.worldQuestLog)).toBe(false);
    p.horde!.phase = 'won';
    expect(hordeActionsLocked(sim.worldQuestLog)).toBe(false);
    delete p.horde;
    expect(hordeActionsLocked(sim.worldQuestLog)).toBe(false);
  });

  it('refuses entry while a mount summon is already channeling', () => {
    const sim = setup();
    sim.moveInput.back = true;
    sim.tick();
    sim.moveInput.back = false;
    sim.player.pos = sim.groundPos(HORDE_NPC_DEF.pos.x, HORDE_NPC_DEF.pos.z + 4);
    sim.addItem(mountItemId('valorsteed')!, 1);
    sim.meta(sim.playerId)!.ridingTrained = true;
    expect(summonMountItem(sim.ctx, sim.playerId, 'valorsteed')).toBe(true);
    expect(sim.player.mountCastRemaining).toBeGreaterThan(0);
    const remaining = sim.player.mountCastRemaining;
    sim.talkToNpc(HORDE_NPC_ID);
    expect(sim.worldQuestLog.get(HORDE_QUEST_ID)?.horde).toBeUndefined();
    expect(sim.player.mountCastRemaining).toBe(remaining);
  });
});
