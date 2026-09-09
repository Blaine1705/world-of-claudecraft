import { describe, expect, it } from 'vitest';
import { applyQuestSelfWire, type QuestSelfMirrors } from '../src/net/quest_snapshot_wire';
import {
  FORGE_NPC_DEF,
  FORGE_NPC_ID,
  FORGE_STATIONS,
  FORGE_QUEST_ID as ID,
} from '../src/sim/content/world_quest_forging';
import { BUILTIN_WORLD } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { decodeForgeState } from '../src/sim/world_quest_forge_wire';
import { forgeStationForEntity } from '../src/sim/world_quest_forging';
import { worldQuestProgressForWire } from '../src/sim/world_quest_trace_wire';
import { sanitizeWorldQuestProgress } from '../src/sim/world_quests';
import { WORLD_SEED } from '../src/sim/world_seed';

const WORLD = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: { [FORGE_NPC_DEF.id]: FORGE_NPC_DEF },
  groundObjects: [],
};
function setup() {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    devCommands: true,
    world: WORLD,
  });
  sim.resetDay = '2026-09-06';
  sim.chat('/dev forge');
  return sim;
}
function start(sim: Sim) {
  sim.targetEntity(FORGE_NPC_ID);
  sim.interact();
  sim.startWorldQuest(FORGE_NPC_ID);
}
function state(sim: Sim) {
  return sim.worldQuestLog.get(ID)!.forging!;
}
function waitReady(sim: Sim) {
  const current = state(sim);
  for (let tick = 0; tick < 100 && sim.time < Math.max(current.readyAt, current.lockUntil); tick++)
    sim.tick();
}
function clickRight(sim: Sim) {
  waitReady(sim);
  const current = state(sim);
  const station = FORGE_STATIONS.find(
    (entry) => entry.id === current.requests[current.requestIndex][current.actionIndex],
  )!;
  sim.pickUpObject(station.entityId);
}
function finish(sim: Sim) {
  for (let action = 0; action < 13; action++) clickRight(sim);
}

describe('personal forging world quest', () => {
  it('marks owner snapshots dirty when a clock sample advances and omits the sample from saves', () => {
    const sim = setup();
    start(sim);
    const meta = sim.meta(sim.playerId)!;
    const revision = meta.wireRev;
    const observed = state(sim).observedAt;
    for (let tick = 0; tick < 4; tick++) sim.tick();
    expect(state(sim).observedAt).toBeGreaterThan(observed);
    expect(meta.wireRev).toBeGreaterThan(revision);
    expect(worldQuestProgressForWire(sim.worldQuestLog.get(ID)!).forging?.observedAt).toBe(
      state(sim).observedAt,
    );
    const save = sim.serializeCharacter(sim.playerId);
    if (!save) throw new Error('Expected workshop save');
    expect(save.worldQuests?.progress[0].forging).toBeUndefined();
  });
  it('starts from natural area arrival on its offering date without developer commands', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', world: WORLD });
    sim.resetDay = '2026-09-18';
    sim.setPlayerLevel(10);
    sim.player.pos = sim.groundPos(FORGE_NPC_DEF.pos.x, FORGE_NPC_DEF.pos.z + 4);
    sim.player.prevPos = { ...sim.player.pos };
    sim.tick();
    expect(sim.worldQuestLog.get(ID)?.state).toBe('active');
    expect(sim.worldQuestLog.get(ID)?.forging).toBeUndefined();
    start(sim);
    expect(state(sim).phase).toBe('countdown');
  });

  it('recognizes only canonical fixture identities and positions', () => {
    const sim = setup();
    const fixture = sim.entities.get(FORGE_STATIONS[0].entityId)!;
    expect(forgeStationForEntity(fixture)?.id).toBe('fuel');
    for (const invalid of [
      { id: fixture.id + 100 },
      { kind: 'npc' as const },
      { objectItemId: 'forge_tools' },
      { templateId: 'ground_forge_tools' },
      { pos: { ...fixture.pos, x: fixture.pos.x + 1 } },
    ]) {
      expect(forgeStationForEntity({ ...fixture, ...invalid })).toBeUndefined();
    }
  });
  it('requires NPC start, completes all ten requests once, and allows practice without replaying reward', () => {
    const sim = setup();
    sim.pickUpObject(FORGE_STATIONS[0].entityId);
    expect(sim.worldQuestLog.get(ID)?.count).toBe(0);
    start(sim);
    expect(state(sim).phase).toBe('countdown');
    const original = state(sim);
    start(sim);
    expect(state(sim)).toBe(original);
    const position = { ...sim.player.pos };
    const initialXp = sim.xp;
    finish(sim);
    expect(sim.xp).toBeGreaterThan(initialXp);
    expect(state(sim).phase).toBe('success');
    expect(sim.worldQuestLog.get(ID)?.state).toBe('completed');
    expect(sim.meta(sim.playerId)!.deedsEarned.has('exp_forge_helper')).toBe(true);
    expect(sim.player.pos.x).toBeCloseTo(position.x);
    expect(sim.player.pos.z).toBeCloseTo(position.z);
    const earned = sim.meta(sim.playerId)!.counters.questsCompleted;
    const xp = sim.xp;
    sim.chat('/dev forge');
    start(sim);
    finish(sim);
    expect(sim.xp).toBe(xp);
    expect(sim.meta(sim.playerId)!.counters.questsCompleted).toBe(earned);
    expect(FORGE_STATIONS.every((station) => sim.entities.get(station.entityId)?.lootable)).toBe(
      true,
    );
  });

  it('cancels on combat, death and leaving the workshop, with no credit', () => {
    const sim = setup();
    start(sim);
    sim.player.inCombat = true;
    sim.tick();
    expect(sim.worldQuestLog.get(ID)?.forging).toBeUndefined();
    sim.player.inCombat = false;
    start(sim);
    sim.player.dead = true;
    sim.tick();
    expect(sim.worldQuestLog.get(ID)?.forging).toBeUndefined();
    sim.player.dead = false;
    start(sim);
    sim.player.pos = sim.groundPos(500, 1034);
    sim.tick();
    expect(sim.worldQuestLog.get(ID)?.forging).toBeUndefined();
    expect(sim.worldQuestLog.get(ID)?.state).toBe('active');
  });

  it('restores completion claims after save/load and refuses reward replay in practice', () => {
    const source = setup();
    start(source);
    finish(source);
    const saved = source.serializeCharacter(source.playerId);
    if (!saved) throw new Error('Expected a saved workshop character');
    // Mixed-release writers can drop the WQ blob but retain milestone claims.
    delete saved.worldQuests;
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', world: WORLD, noPlayer: true });
    sim.resetDay = '2026-09-18';
    const pid = sim.addPlayer('warrior', 'Restored', { state: saved });
    const player = sim.entities.get(pid)!;
    player.pos = sim.groundPos(FORGE_NPC_DEF.pos.x, FORGE_NPC_DEF.pos.z + 4);
    player.prevPos = { ...player.pos };
    sim.tick();
    const meta = sim.meta(pid)!;
    expect(meta.worldQuestLog.get(ID)?.state).toBe('completed');
    const xp = meta.xp;
    sim.startWorldQuest(FORGE_NPC_ID, pid);
    for (let action = 0; action < 13; action++) {
      const current = meta.worldQuestLog.get(ID)!.forging!;
      for (
        let tick = 0;
        tick < 100 && sim.time < Math.max(current.readyAt, current.lockUntil);
        tick++
      )
        sim.tick();
      const station = FORGE_STATIONS.find(
        (entry) => entry.id === current.requests[current.requestIndex][current.actionIndex],
      )!;
      sim.pickUpObject(station.entityId, pid);
    }
    expect(meta.worldQuestLog.get(ID)?.forging?.phase).toBe('success');
    expect(meta.xp).toBe(xp);
  });

  it('keeps runtime private, omits it from saves and validates/isolates the owner wire', () => {
    const sim = setup();
    start(sim);
    const progress = sim.worldQuestLog.get(ID)!;
    const save = sim.serializeCharacter(sim.playerId);
    if (!save) throw new Error('Expected a saved workshop character');
    expect(save.worldQuests?.progress.find((row) => row.questId === ID)?.forging).toBeUndefined();
    expect(sanitizeWorldQuestProgress([progress], sim.worldQuestCycle)[0].forging).toBeUndefined();
    const encoded = worldQuestProgressForWire(progress);
    const mirror: QuestSelfMirrors = {
      questLog: new Map(),
      questsDone: new Set(),
      worldQuestCycle: '',
      worldQuestExpiresAtMs: 0,
      worldQuestLog: new Map(),
    };
    applyQuestSelfWire(mirror, { wqday: sim.worldQuestCycle, wqlog: [encoded] });
    expect(mirror.worldQuestLog.get(ID)?.forging).toEqual(progress.forging);
    encoded.forging!.requests[0][0] = 'tools';
    expect(encoded.forging!.requests).not.toBe(progress.forging!.requests);
    expect(decodeForgeState({ ...state(sim), requestIndex: 10 }, ID)).toBeUndefined();
    const invalidRequests = state(sim).requests.map((request) => [...request]);
    (invalidRequests[0] as string[])[0] = 'invented';
    expect(decodeForgeState({ ...state(sim), requests: invalidRequests }, ID)).toBeUndefined();
    for (const invalid of [
      { readyAt: NaN },
      { observedAt: NaN },
      { observedAt: -1 },
      { startedAt: -1 },
      { lockUntil: Infinity },
      { actionIndex: 1 },
      { mistakes: 0.5 },
      { phase: 'success' },
    ]) {
      expect(decodeForgeState({ ...state(sim), ...invalid }, ID)).toBeUndefined();
    }
    expect(decodeForgeState(state(sim), 'wq_eastbrook_calligraphy')).toBeUndefined();
    finish(sim);
    const finishedSave = sim.serializeCharacter(sim.playerId);
    if (!finishedSave?.worldQuests) throw new Error('Expected saved world quest progress');
    const restored = sanitizeWorldQuestProgress(
      finishedSave.worldQuests.progress,
      sim.worldQuestCycle,
    );
    expect(restored[0].forgeResult).toEqual(progress.forgeResult);
  });

  it('rejects remote clicks and isolates two players without drawing shared world randomness', () => {
    const sim = setup();
    let draws = 0;
    sim.rng.setObserver(() => draws++);
    start(sim);
    expect(draws).toBe(0);
    const second = sim.addPlayer('warrior', 'Other');
    expect(sim.meta(second)!.worldQuestLog.get(ID)?.forging).toBeUndefined();
    sim.chat('/dev forge', second);
    sim.startWorldQuest(FORGE_NPC_ID, second);
    const other = sim.meta(second)!.worldQuestLog.get(ID)!.forging!;
    expect(other.phase).toBe('countdown');
    expect(other).not.toBe(state(sim));
    waitReady(sim);
    clickRight(sim);
    expect(state(sim).requestIndex).toBe(1);
    expect(other.requestIndex).toBe(0);
    sim.player.pos = sim.groundPos(500, 1034);
    sim.pickUpObject(FORGE_STATIONS[0].entityId);
    expect(state(sim).requestIndex).toBe(1);
  });

  it.each([
    [45, 'silver'],
    [65, 'bronze'],
  ] as const)('completes a slower %s second run with %s and pays normally', (delay, rating) => {
    const sim = setup();
    start(sim);
    waitReady(sim);
    for (let tick = 0; tick < delay * 20; tick++) sim.tick();
    const xp = sim.xp;
    finish(sim);
    expect(state(sim).result?.rating).toBe(rating);
    expect(sim.worldQuestLog.get(ID)?.state).toBe('completed');
    expect(sim.xp).toBeGreaterThan(xp);
  });
});
