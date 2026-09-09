import { describe, expect, it } from 'vitest';
import { WORLD_QUEST_CALLIGRAPHY_NPC_IDS } from '../src/sim/content/world_quest_calligraphy';
import { COMBAT_QUEST_SITES } from '../src/sim/content/world_quest_combat';
import { FORGE_NPC_ID } from '../src/sim/content/world_quest_forging';
import { GLIDER_NPC_ID } from '../src/sim/content/world_quest_glider';
import { HORDE_NPC_ID } from '../src/sim/content/world_quest_horde';
import { SHADOW_NPC_ID } from '../src/sim/content/world_quest_shadow';
import { BUILTIN_WORLD, NPCS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { worldQuestStarterFor } from '../src/sim/world_quest_start_core';
import { WORLD_SEED } from '../src/sim/world_seed';

function setup(command = '/dev wqcombat warband') {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    devCommands: true,
    world: { ...BUILTIN_WORLD, camps: [], groundObjects: [], npcs: NPCS },
  });
  sim.resetDay = '2026-09-08';
  sim.chat(command);
  return sim;
}

const STARTERS = [
  ...COMBAT_QUEST_SITES.map(
    (site) => [`/dev wqcombat ${site.encounterId}`, site.npcEntityId, 'combat'] as const,
  ),
  ['/dev calligraphy', WORLD_QUEST_CALLIGRAPHY_NPC_IDS.calligraphy_instructor, 'tracing'],
  ['/dev forge', FORGE_NPC_ID, 'forging'],
  ['/dev horde', HORDE_NPC_ID, 'horde'],
  ['/dev glider', GLIDER_NPC_ID, 'glider'],
  ['/dev shadow', SHADOW_NPC_ID, 'shadow'],
] as const;

describe('explicit world quest start', () => {
  it.each(STARTERS)('requires confirmation for %s', (command, npcId, field) => {
    const sim = setup(command);
    const npc = sim.entities.get(npcId)!;
    expect(npc).toBeDefined();
    sim.player.pos = { ...npc.pos };
    sim.player.prevPos = { ...npc.pos };
    const quest = worldQuestStarterFor(npc)!;
    const before = sim.worldQuestLog.get(quest.id)?.[field];
    sim.drainEvents();
    sim.targetEntity(npcId);
    sim.interact();
    expect(sim.worldQuestLog.get(quest.id)?.[field]).toEqual(before);
    expect(sim.meta(sim.playerId)!.combatWorldQuestRuns.size).toBe(0);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'worldQuestStartDialogue', targetId: npcId }),
    );
    sim.startWorldQuest(npcId);
    expect(sim.worldQuestLog.get(quest.id)?.[field]).toBeDefined();
    if (field === 'combat') expect(sim.meta(sim.playerId)!.combatWorldQuestRuns.size).toBe(1);
  });

  it.each(['dead', 'far', 'vertical', 'wrongNpc', 'expired', 'lowLevel', 'completed'] as const)(
    'rejects confirmation when %s',
    (reason) => {
      const sim = setup();
      const site = COMBAT_QUEST_SITES[0];
      const meta = sim.meta(sim.playerId)!;
      let npcId = site.npcEntityId;
      if (reason === 'dead') sim.player.dead = true;
      if (reason === 'far') sim.player.pos.x += 100;
      if (reason === 'vertical') sim.player.pos.y += 100;
      if (reason === 'wrongNpc') npcId = COMBAT_QUEST_SITES[1].npcEntityId;
      if (reason === 'expired') meta.devWorldQuestCycle = 'wq3_0';
      if (reason === 'lowLevel') sim.player.level = 1;
      if (reason === 'completed') meta.worldQuestLog.get(site.questId)!.state = 'completed';
      sim.startWorldQuest(npcId);
      expect(meta.combatWorldQuestRuns.size).toBe(0);
    },
  );

  it('starts only once and permits an explicit retry after failure', () => {
    const sim = setup();
    const site = COMBAT_QUEST_SITES[0];
    const meta = sim.meta(sim.playerId)!;
    sim.startWorldQuest(site.npcEntityId);
    const run = meta.combatWorldQuestRuns.get(site.questId);
    sim.startWorldQuest(site.npcEntityId);
    expect(meta.combatWorldQuestRuns.get(site.questId)).toBe(run);
    sim.player.pos.x += 200;
    sim.tick();
    expect(meta.combatWorldQuestRuns.size).toBe(0);
    sim.player.pos = { ...sim.entities.get(site.npcEntityId)!.pos };
    sim.startWorldQuest(site.npcEntityId);
    expect(meta.combatWorldQuestRuns.get(site.questId)).toBeDefined();
    expect(meta.combatWorldQuestRuns.get(site.questId)).not.toBe(run);
  });
});
