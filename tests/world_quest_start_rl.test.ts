import { describe, expect, it } from 'vitest';
import { COMBAT_QUEST_SITES } from '../src/sim/content/world_quest_combat';
import { BUILTIN_WORLD, NPCS } from '../src/sim/data';
import { ACTIONS, applyAction } from '../src/sim/obs';
import { Sim } from '../src/sim/sim';
import { WORLD_SEED } from '../src/sim/world_seed';

describe('headless world quest confirmation', () => {
  it('appends confirmation without shifting old actions and starts the nearby briefing quest', () => {
    const index = ACTIONS.indexOf('start_world_quest');
    expect(index).toBeGreaterThan(0);
    expect(ACTIONS.slice(index - 3, index)).toEqual(['interact', 'stop', 'eat_drink']);
    const site = COMBAT_QUEST_SITES[0];
    const sim = new Sim({
      seed: WORLD_SEED,
      playerClass: 'warrior',
      devCommands: true,
      world: {
        ...BUILTIN_WORLD,
        camps: [],
        groundObjects: [],
        npcs: { [site.npcId]: NPCS[site.npcId] },
      },
    });
    sim.resetDay = '2026-09-08';
    sim.chat('/dev wqcombat warband');
    sim.targetEntity(site.npcEntityId);
    applyAction(sim, ACTIONS.indexOf('interact'));
    expect(sim.meta(sim.playerId)!.combatWorldQuestRuns.size).toBe(0);
    sim.player.targetId = null;
    applyAction(sim, index);
    expect(sim.meta(sim.playerId)!.combatWorldQuestRuns.has(site.questId)).toBe(true);
  });
});
