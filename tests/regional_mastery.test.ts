// Regional Mastery end to end through a real Sim: the world-quest credit site
// climbs the permanent per-zone tally, the save carries it (and only when it
// holds something), the deed ladder on the regionalMasteryBest meter grants
// at each REGIONAL_MASTERY_MILESTONES rung, and the IWorld getter reads the
// live map. The pure helpers are pinned in regional_mastery_core.test.ts.
import { describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import { WORLD_QUESTS_BY_ID } from '../src/sim/content/world_quests';
import { REGIONAL_MASTERY_MILESTONES } from '../src/sim/regional_mastery';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent, WorldQuestDef } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { worldQuestCycleForResetDay } from '../src/sim/world_quest_rotation';
import { onMobKilledForWorldQuests } from '../src/sim/world_quests';
import { EMPTY_TEST_WORLD } from './sim_shared';

// A single-quest zone: its one authored quest is on the board every cycle, so
// the same character can turn it in day after day through the real path.
const QUEST_ID = 'wq_thornpeak_stormcrag';
const ZONE_ID = 'thornpeak_heights';
const LADDER = [
  'exp_regional_mastery_10',
  'exp_regional_mastery_25',
  'exp_regional_mastery_50',
  'exp_regional_mastery_100',
  'exp_regional_mastery_250',
] as const;

function worldSim(seed = 4711): Sim {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: true });
  const quest = WORLD_QUESTS_BY_ID[QUEST_ID];
  sim.setPlayerLevel(quest.minLevel);
  sim.utcDay = '2026-08-31';
  sim.resetDay = '2026-08-31';
  const player = sim.player;
  player.pos.x = quest.area.x;
  player.pos.z = quest.area.z;
  player.pos.y = terrainHeight(player.pos.x, player.pos.z, sim.cfg.seed);
  player.prevPos = { ...player.pos };
  sim.tick();
  return sim;
}

function devSim(seed = 42): Sim {
  return new Sim({ seed, playerClass: 'warrior', devCommands: true, world: EMPTY_TEST_WORLD });
}

function targetFor(sim: Sim, quest: WorldQuestDef): Entity {
  if (quest.objective.type !== 'kill') throw new Error(`Expected kill objective ${quest.id}`);
  const targetMobId = quest.objective.targetMobId;
  const target = [...sim.entities.values()].find(
    (entity) => entity.kind === 'mob' && entity.templateId === targetMobId,
  );
  if (!target) throw new Error(`Missing target ${targetMobId}`);
  target.pos.x = quest.area.x;
  target.pos.z = quest.area.z;
  return target;
}

/** Turn the zone's quest in through the real kill-credit path on the current cycle. */
function completeThornpeak(sim: Sim): void {
  const quest = WORLD_QUESTS_BY_ID[QUEST_ID];
  const meta = sim.meta(sim.playerId);
  if (!meta) throw new Error('Missing player meta');
  expect(meta.worldQuestLog.get(quest.id)?.state).toBe('active');
  const target = targetFor(sim, quest);
  for (let i = 0; i < quest.count; i++) onMobKilledForWorldQuests(sim.ctx, target, meta);
  expect(meta.worldQuestLog.get(quest.id)?.state).toBe('completed');
}

/** Advance the realm reset day; the standing player re-enters the fresh board. */
function rollover(sim: Sim, resetDay: string): void {
  sim.resetDay = resetDay;
  sim.tick();
  sim.tick();
  const meta = sim.meta(sim.playerId);
  expect(meta?.worldQuestCycle).toBe(worldQuestCycleForResetDay(resetDay));
  expect(meta?.worldQuestLog.get(QUEST_ID)?.state).toBe('active');
}

function dayAfter(resetDay: string, days: number): string {
  const date = new Date(`${resetDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function unlocked(evs: SimEvent[], deedId: string): number {
  return evs.filter((ev) => ev.type === 'deedUnlocked' && ev.deedId === deedId).length;
}

describe('Regional Mastery: the world-quest credit site', () => {
  it('counts one per turn-in for the quest zone, again on the next cycle, and nothing else', () => {
    const sim = worldSim();
    const meta = sim.meta(sim.playerId);
    if (!meta) throw new Error('Missing player meta');
    expect(meta.worldQuestZoneCounts).toEqual({});

    completeThornpeak(sim);
    expect(meta.worldQuestZoneCounts).toEqual({ [ZONE_ID]: 1 });
    // Mid-quest progress never counts: the tally moved exactly once for
    // quest.count kills (the credit arm, not the progress arm).
    expect(meta.counters.questsCompleted).toBe(1);

    rollover(sim, '2026-09-01');
    // A rollover clears the board but never the tally.
    expect(meta.worldQuestZoneCounts).toEqual({ [ZONE_ID]: 1 });
    completeThornpeak(sim);
    expect(meta.worldQuestZoneCounts).toEqual({ [ZONE_ID]: 2 });
    expect(Object.keys(meta.worldQuestZoneCounts)).toEqual([ZONE_ID]);
  });

  it('the Sim IWorld getter reads the live per-zone map', () => {
    const sim = worldSim();
    const meta = sim.meta(sim.playerId);
    if (!meta) throw new Error('Missing player meta');
    expect(sim.worldQuestZoneCounts).toBe(meta.worldQuestZoneCounts);
    expect(sim.worldQuestZoneCounts).toEqual({});
    completeThornpeak(sim);
    expect(sim.worldQuestZoneCounts).toEqual({ [ZONE_ID]: 1 });
    expect(sim.worldQuestZoneCounts[ZONE_ID]).toBe(1);
  });
});

describe('Regional Mastery: the character save', () => {
  it('round-trips the counts and re-sanitizes them on restore', () => {
    const sim = worldSim();
    completeThornpeak(sim);
    const state = sim.serializeCharacter(sim.playerId);
    if (!state) throw new Error('Missing serialized character');
    expect(state.worldQuests?.zoneCounts).toEqual({ [ZONE_ID]: 1 });
    // A copy, never the live map.
    expect(state.worldQuests?.zoneCounts).not.toBe(sim.worldQuestZoneCounts);

    const restored = new Sim({ seed: 4711, playerClass: 'warrior', noPlayer: true });
    const pid = restored.addPlayer('warrior', 'Stormcrag Regular', { state });
    const restoredMeta = restored.meta(pid);
    if (!restoredMeta) throw new Error('Missing restored player');
    expect(restoredMeta.worldQuestZoneCounts).toEqual({ [ZONE_ID]: 1 });
    expect(restored.serializeCharacter(pid)?.worldQuests?.zoneCounts).toEqual({ [ZONE_ID]: 1 });
  });

  it('carries the counts even when the character has no active board', () => {
    const sim = devSim();
    const meta = sim.players.get(sim.playerId);
    if (!meta) throw new Error('Missing player meta');
    // No cycle, no log, no standing, no reroll: only the tally holds something.
    expect(sim.serializeCharacter(sim.playerId)?.worldQuests).toBeUndefined();
    meta.worldQuestZoneCounts[ZONE_ID] = 3;
    const state = sim.serializeCharacter(sim.playerId);
    expect(state?.worldQuests?.zoneCounts).toEqual({ [ZONE_ID]: 3 });
    expect(state?.worldQuests?.cycle).toBe('');
    expect(state?.worldQuests?.progress).toEqual([]);
  });

  it('drops the key when empty, and a legacy or hostile blob restores to a clean map', () => {
    const sim = devSim();
    const fresh = sim.serializeCharacter(sim.playerId);
    if (!fresh) throw new Error('Missing serialized character');
    expect(fresh.worldQuests).toBeUndefined();
    expect(JSON.stringify(fresh)).not.toContain('zoneCounts');

    // A pre-feature save: the world-quest block without the field.
    const legacy = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, devCommands: true });
    const legacyPid = legacy.addPlayer('warrior', 'Legacy', {
      state: { ...fresh, worldQuests: { cycle: '', progress: [] } },
    });
    expect(legacy.meta(legacyPid)?.worldQuestZoneCounts).toEqual({});

    // A hostile save: unknown zones, junk and negatives vanish, floats floor.
    const hostile = new Sim({
      seed: 42,
      playerClass: 'warrior',
      noPlayer: true,
      devCommands: true,
    });
    const hostilePid = hostile.addPlayer('warrior', 'Hostile', {
      state: {
        ...fresh,
        worldQuests: {
          cycle: '',
          progress: [],
          zoneCounts: {
            [ZONE_ID]: 7.8,
            not_a_zone: 500,
            frostveil: -2,
            amberfall: 'x',
          } as unknown as Record<string, number>,
        },
      },
    });
    expect(hostile.meta(hostilePid)?.worldQuestZoneCounts).toEqual({ [ZONE_ID]: 7 });
  });
});

describe('Regional Mastery: the deed ladder', () => {
  it('pins the five rungs to REGIONAL_MASTERY_MILESTONES on the regionalMasteryBest meter', () => {
    LADDER.forEach((id, i) => {
      expect(DEEDS[id].trigger).toEqual({
        kind: 'meter',
        meter: 'regionalMasteryBest',
        amount: REGIONAL_MASTERY_MILESTONES[i],
      });
      expect(DEEDS[id].category).toBe('exploration');
      expect(DEEDS[id].reward).toBeUndefined();
      expect(DEEDS[id].hidden).toBeFalsy();
    });
    expect(LADDER.map((id) => DEEDS[id].renown)).toEqual([5, 10, 10, 25, 50]);
  });

  it('the tenth turn-in in one zone grants Regional Regular once, through the real path', () => {
    const sim = worldSim();
    const meta = sim.meta(sim.playerId);
    if (!meta) throw new Error('Missing player meta');
    let resetDay = '2026-08-31';
    for (let turnIn = 1; turnIn < REGIONAL_MASTERY_MILESTONES[0]; turnIn++) {
      if (turnIn > 1) {
        resetDay = dayAfter(resetDay, 1);
        rollover(sim, resetDay);
      }
      completeThornpeak(sim);
      sim.tick();
      sim.drainEvents();
    }
    expect(meta.worldQuestZoneCounts[ZONE_ID]).toBe(REGIONAL_MASTERY_MILESTONES[0] - 1);
    expect(meta.deedsEarned.has(LADDER[0])).toBe(false);

    rollover(sim, dayAfter(resetDay, 1));
    sim.drainEvents();
    completeThornpeak(sim);
    expect(meta.worldQuestZoneCounts[ZONE_ID]).toBe(REGIONAL_MASTERY_MILESTONES[0]);
    // Granted at the tick tail, exactly once, and only the first rung.
    expect(meta.deedsEarned.has(LADDER[0])).toBe(false);
    let evs = sim.tick();
    expect(meta.deedsEarned.has(LADDER[0])).toBe(true);
    expect(unlocked(evs, LADDER[0])).toBe(1);
    for (const id of LADDER.slice(1)) expect(meta.deedsEarned.has(id), id).toBe(false);
    evs = sim.tick();
    expect(unlocked(evs, LADDER[0])).toBe(0);
  });

  it('reads the best single zone: spread across zones never climbs, 250 in one grants all five', () => {
    const sim = devSim();
    const meta = sim.players.get(sim.playerId);
    if (!meta) throw new Error('Missing player meta');
    // Nine in each of two zones: 18 turn-ins, no rung (the meter is per zone).
    meta.worldQuestZoneCounts.eastbrook_vale = 9;
    meta.worldQuestZoneCounts.frostveil = 9;
    sim.ctx.markDeedsDirty(sim.playerId);
    sim.tick();
    for (const id of LADDER) expect(meta.deedsEarned.has(id), id).toBe(false);

    meta.worldQuestZoneCounts.frostveil = REGIONAL_MASTERY_MILESTONES[4];
    sim.ctx.markDeedsDirty(sim.playerId);
    const evs = sim.tick();
    for (const id of LADDER) {
      expect(meta.deedsEarned.has(id), id).toBe(true);
      expect(unlocked(evs, id), id).toBe(1);
    }
    expect(meta.renown).toBeGreaterThanOrEqual(100);
  });
});
