import { expect, it } from 'vitest';
import {
  HORDE_NPC_DEF,
  HORDE_NPC_ID,
  HORDE_SITE,
  HORDE_QUEST_ID as ID,
} from '../src/sim/content/world_quest_horde';
import { BUILTIN_WORLD } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { emptyMoveInput } from '../src/sim/types';
import { worldQuestProgressForWire } from '../src/sim/world_quest_trace_wire';
import { WORLD_SEED } from '../src/sim/world_seed';

function setup() {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    devCommands: true,
    world: {
      ...BUILTIN_WORLD,
      camps: [],
      npcs: { [HORDE_NPC_DEF.id]: HORDE_NPC_DEF },
      groundObjects: [],
    },
  });
  sim.resetDay = '2026-09-06';
  sim.chat('/dev horde');
  return sim;
}
function start(sim: Sim, pid = sim.playerId) {
  sim.entities.get(pid)!.pos = sim.groundPos(HORDE_NPC_DEF.pos.x, HORDE_NPC_DEF.pos.z + 4);
  sim.startWorldQuest(HORDE_NPC_ID, pid);
}
function play(sim: Sim, pid = sim.playerId) {
  const meta = sim.meta(pid)!;
  for (let i = 0; i < 1860; i++) {
    const state = meta.worldQuestLog.get(ID)!.horde!;
    const danger = state.units.filter((u) => u.kind !== 'crate').sort((a, b) => a.z - b.z)[0];
    const target =
      state.units.find(
        (u) => u.kind === 'crate' && u.reward !== 'haste' && u.reward !== 'pierce',
      ) ?? (danger?.z < 12 ? danger : (state.units.find((u) => u.kind === 'boss') ?? danger));
    const delta = target ? target.x - state.playerX : 0;
    Object.assign(meta.moveInput, emptyMoveInput(), {
      strafeLeft: delta > 0.2,
      strafeRight: delta < -0.2,
    });
    sim.tick();
  }
  Object.assign(meta.moveInput, emptyMoveInput());
}

it('starts by talking, steers with ordinary input, and cancels backing away', () => {
  const sim = setup();
  start(sim);
  expect(sim.worldQuestLog.get(ID)?.horde?.phase).toBe('countdown');
  sim.chat('/afk');
  expect(sim.player.afk).toBe(true);
  sim.moveInput.strafeRight = true;
  sim.tick();
  expect(sim.player.afk).toBe(false);
  expect(sim.meta(sim.playerId)!.lastActiveTick).toBe(sim.tickCount);
  expect(sim.player.pos.x).toBeLessThan(HORDE_SITE.x);
  expect(sim.player.pos.z).toBe(HORDE_SITE.z);
  const saved = sim.serializeCharacter(sim.playerId)!;
  expect(saved.worldQuests?.progress.find((p) => p.questId === ID)?.horde).toBeUndefined();
  sim.moveInput.back = true;
  sim.tick();
  expect(sim.worldQuestLog.get(ID)?.horde).toBeUndefined();
});

it('finishes a real sim run, snapshots it, saves the medal and never repays practice', () => {
  const sim = setup();
  start(sim);
  play(sim);
  const progress = sim.worldQuestLog.get(ID)!;
  expect(progress.horde?.phase).toBe('won');
  expect(progress.state).toBe('completed');
  expect(progress.hordeResult?.rating).toBe('gold');
  expect(worldQuestProgressForWire(progress).horde).toEqual(progress.horde);
  const meta = sim.meta(sim.playerId)!;
  const completed = meta.counters.questsCompleted;
  const xp = meta.xp;
  const saved = sim.serializeCharacter(sim.playerId)!;
  expect(saved.worldQuests?.progress.find((p) => p.questId === ID)?.hordeResult).toEqual(
    progress.hordeResult,
  );
  sim.chat('/dev horde');
  start(sim);
  play(sim);
  expect(meta.counters.questsCompleted).toBe(completed);
  expect(meta.xp).toBe(xp);
  expect(progress.horde?.phase).toBe('won');
}, 30000);

it('restores reward claims across reload and keeps practice from granting XP or completion again', () => {
  const source = setup();
  start(source);
  play(source);
  const saved = source.serializeCharacter(source.playerId)!;
  const best = { ...source.worldQuestLog.get(ID)!.hordeResult! };
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    devCommands: true,
    noPlayer: true,
    world: {
      ...BUILTIN_WORLD,
      camps: [],
      npcs: { [HORDE_NPC_DEF.id]: HORDE_NPC_DEF },
      groundObjects: [],
    },
  });
  sim.resetDay = source.resetDay;
  const pid = sim.addPlayer('warrior', 'Returning defender', { state: saved });
  sim.chat('/dev horde', pid);
  const meta = sim.meta(pid)!;
  expect(meta.worldQuestLog.get(ID)?.state).toBe('completed');
  expect(meta.worldQuestLog.get(ID)?.horde).toBeUndefined();
  expect(meta.worldQuestLog.get(ID)?.hordeResult).toEqual(best);
  const xp = meta.xp;
  const completed = meta.counters.questsCompleted;
  start(sim, pid);
  play(sim, pid);
  expect(meta.worldQuestLog.get(ID)?.horde?.phase).toBe('won');
  expect(meta.xp).toBe(xp);
  expect(meta.counters.questsCompleted).toBe(completed);
}, 30000);

it('keeps two nearby players in separate lanes and clears a run on rotation change', () => {
  const sim = setup();
  const first = sim.meta(sim.playerId)!;
  const secondPid = sim.addPlayer('warrior', 'Second defender');
  sim.chat('/dev horde', secondPid);
  const second = sim.meta(secondPid)!;
  start(sim);
  start(sim, secondPid);
  first.moveInput.strafeLeft = true;
  second.moveInput.strafeRight = true;
  for (let i = 0; i < 10; i++) sim.tick();
  const firstState = first.worldQuestLog.get(ID)!.horde!;
  const secondState = second.worldQuestLog.get(ID)!.horde!;
  expect(firstState.playerX).toBeGreaterThan(0);
  expect(secondState.playerX).toBeLessThan(0);
  expect(firstState).not.toBe(secondState);
  expect(firstState.units).not.toBe(secondState.units);
  first.devWorldQuestCycle = 'wq3_0';
  sim.tick();
  expect(first.worldQuestLog.get(ID)?.horde).toBeUndefined();
  expect(second.worldQuestLog.get(ID)?.horde).toBe(secondState);
  expect(secondState.tick).toBe(11);
});

it('idle failure gives no quest credit or best result and can be retried', () => {
  const sim = setup();
  start(sim);
  for (let i = 0; i < 1860; i++) sim.tick();
  const progress = sim.worldQuestLog.get(ID)!;
  expect(progress.horde?.phase).toBe('failed');
  expect(progress.state).toBe('active');
  expect(progress.hordeResult).toBeUndefined();
  start(sim);
  expect(progress.horde?.phase).toBe('countdown');
});

it('cancels combat and never starts from a remote instructor', () => {
  const sim = setup();
  sim.player.pos = sim.groundPos(300, 1490);
  sim.targetEntity(HORDE_NPC_ID);
  sim.interact();
  expect(sim.worldQuestLog.get(ID)?.horde).toBeUndefined();
  start(sim);
  sim.player.inCombat = true;
  sim.tick();
  expect(sim.worldQuestLog.get(ID)?.horde).toBeUndefined();
});
