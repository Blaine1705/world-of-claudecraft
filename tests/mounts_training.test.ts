// Direct + facade tests for the riding lesson (src/sim/mounts_training.ts): the
// Mount/Dismount tutorial gating the first mount. Mounting the training steed no
// longer completes it; it advances the lesson to the 'ride' phase, and FINISHING
// A SHOW-JUMPING RACE while the lesson is live is what credits the quest. Drives
// the module through the Sim facade (mountTrainBegin / toggleMounted /
// mountTrainAbortFor / mountRaceStartFor), the same surface the server dispatch
// and the online client use. q_riding_lessons and stablemaster_marla are real
// content; this file drives them as-is.

import { describe, expect, it } from 'vitest';
import {
  MOUNT_RACE_COURSE,
  MOUNT_RACE_START_PLATFORM,
  STABLE_PADDOCK,
} from '../src/sim/content/mounts';
import { QUESTS } from '../src/sim/data';
import { MOUNT_RACE_COUNTDOWN_TICKS } from '../src/sim/mount_race';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const RIDING_LESSONS_QUEST_ID = 'q_riding_lessons';
const MOUNT_TRAIN_FEE_COPPER = 10000;

const makeSim = (seed = 1) => new Sim({ seed, playerClass: 'warrior', autoEquip: true });

function marlaOf(sim: Sim) {
  const marla = [...sim.entities.values()].find(
    (e) => e.kind === 'npc' && e.templateId === 'stablemaster_marla',
  );
  expect(marla, 'stablemaster_marla must be a live NPC entity').toBeDefined();
  return marla!;
}

function teleport(sim: Sim, x: number, z: number): void {
  sim.player.pos.x = x;
  sim.player.pos.z = z;
  sim.player.pos.y = terrainHeight(x, z, sim.cfg.seed);
  sim.player.prevPos = { ...sim.player.pos };
}

function standAtMarla(sim: Sim): void {
  const marla = marlaOf(sim);
  teleport(sim, marla.pos.x, marla.pos.z);
}

function metaOf(sim: Sim) {
  return sim.players.get(sim.playerId)!;
}

/** Stand the player at the stablemaster, level 20, actively on the riding-lesson
 * quest. Copper stays 0 (the "cannot afford" fixture) unless funded. */
function setupAtMarla(sim: Sim, opts: { copper?: number } = {}): void {
  sim.setPlayerLevel(20);
  standAtMarla(sim);
  const meta = sim.players.get(sim.playerId)!;
  meta.questLog.set(RIDING_LESSONS_QUEST_ID, {
    questId: RIDING_LESSONS_QUEST_ID,
    counts: [0],
    state: 'active',
  });
  if (opts.copper !== undefined) meta.copper = opts.copper;
}

/** Begin a lesson: a session opens in the 'mount' phase (not yet on the steed). */
function beginLesson(sim: Sim): void {
  sim.mountTrainBegin();
  sim.tick();
}

/** Summon the training Valorsteed and run the channel to completion; the lesson
 * advances to the 'ride' phase (it no longer completes here). */
function mountSteed(sim: Sim): void {
  sim.toggleMounted();
  const meta = metaOf(sim);
  for (let i = 0; i < 100 && meta.mountTraining?.phase !== 'ride'; i++) sim.tick();
}

// --- compact race helpers (the show-jumping course credits the lesson) ---------
function rideThrough(
  sim: Sim,
  gate: { x: number; z: number; dir: number },
  jump: boolean,
): SimEvent[] {
  const e = sim.player;
  const meta = metaOf(sim);
  meta.moveInput.forward = false;
  meta.moveInput.jump = false;
  for (let i = 0; i < 40 && !e.onGround; i++) sim.tick();
  teleport(sim, gate.x - Math.sin(gate.dir) * 4, gate.z - Math.cos(gate.dir) * 4);
  e.facing = gate.dir;
  meta.moveInput.forward = true;
  meta.moveInput.jump = jump;
  const events: SimEvent[] = [];
  for (let i = 0; i < 60; i++) {
    events.push(...sim.tick());
    const along = (e.pos.x - gate.x) * Math.sin(gate.dir) + (e.pos.z - gate.z) * Math.cos(gate.dir);
    if (along > 3) break;
  }
  meta.moveInput.forward = false;
  meta.moveInput.jump = false;
  return events;
}

/** From the 'ride' phase, ride to the arch and complete a full race. Returns
 * every event from the finishing pass (the mountTrainEnd rides it). */
function completeRace(sim: Sim): SimEvent[] {
  teleport(sim, MOUNT_RACE_START_PLATFORM.x, MOUNT_RACE_START_PLATFORM.z);
  sim.mountRaceStartFor(sim.playerId);
  sim.tick();
  for (let i = 0; i < MOUNT_RACE_COUNTDOWN_TICKS + 2; i++) sim.tick();
  for (const jump of MOUNT_RACE_COURSE.jumps) rideThrough(sim, jump, true);
  return rideThrough(sim, MOUNT_RACE_COURSE.arch, false);
}

describe('riding lesson, begin gates', () => {
  it('refuses an underlevel player (no session started)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    sim.setPlayerLevel(19);
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
  });

  it('refuses when too far from the stablemaster', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    teleport(sim, marlaOf(sim).pos.x + 30, marlaOf(sim).pos.z);
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
  });

  it('refuses when not actively on q_riding_lessons', () => {
    const sim = makeSim();
    sim.setPlayerLevel(20);
    standAtMarla(sim);
    metaOf(sim).copper = MOUNT_TRAIN_FEE_COPPER;
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
  });

  it('refuses a too-poor player (no session started, no copper spent)', () => {
    const sim = makeSim();
    setupAtMarla(sim); // copper 0
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(metaOf(sim).copper).toBe(0);
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
    expect(metaOf(sim).mountTrainingFeePaid ?? false).toBe(false);
  });

  it('refuses to begin while already in a saddle (no self-completing lesson)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    sim.addItem('reins_valorsteed', 1, sim.playerId);
    sim.toggleMounted();
    for (let i = 0; i < 80 && sim.player.mountKey === ''; i++) sim.tick();
    expect(sim.player.mountKey).toBe('valorsteed');
    standAtMarla(sim);
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'error' && e.text === 'Dismount first.')).toBe(true);
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
    expect(metaOf(sim).copper).toBe(MOUNT_TRAIN_FEE_COPPER);
  });

  it('refuses a second session while one is already in progress', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    expect(metaOf(sim).mountTraining?.state).toBe('IN_PROGRESS');
    const copperAfterFirst = metaOf(sim).copper;
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(metaOf(sim).copper).toBe(copperAfterFirst);
  });
});

describe('riding lesson: mounting advances to ride; a finished race completes it', () => {
  it('begin charges the fee once and emits a mount-phase session event', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER + 500 });
    sim.mountTrainBegin();
    const events = sim.tick();
    const session = events.find((e) => e.type === 'mountTrainSession');
    expect(session).toBeDefined();
    expect(session && 'phase' in session && session.phase).toBe('mount');
    expect(metaOf(sim).copper).toBe(500);
    expect(metaOf(sim).mountTrainingFeePaid).toBe(true);
    expect(metaOf(sim).mountTraining?.state).toBe('IN_PROGRESS');
  });

  it('climbing onto the steed advances to the ride phase but does NOT complete the lesson', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    const before = { ...metaOf(sim) };
    mountSteed(sim);
    // Still mounted, still IN_PROGRESS, now in the ride phase; the objective is
    // NOT credited by mounting anymore.
    expect(sim.player.mountKey).toBe('valorsteed');
    expect(metaOf(sim).mountTraining?.state).toBe('IN_PROGRESS');
    expect(metaOf(sim).mountTraining?.phase).toBe('ride');
    void before;
    const qp = metaOf(sim).questLog.get(RIDING_LESSONS_QUEST_ID)!;
    expect(qp.counts[0]).toBe(0);
    expect(qp.state).toBe('active');
  });

  it('finishing a race during the lesson credits the objective once, force-dismounts, clears the session', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);
    const events = completeRace(sim);
    expect(events.some((e) => e.type === 'mountRaceEnd' && e.outcome === 'finished')).toBe(true);
    expect(events.some((e) => e.type === 'mountTrainEnd' && e.outcome === 'success')).toBe(true);
    expect(events.some((e) => e.type === 'questProgress')).toBe(true);
    // Marla takes the unowned steed back.
    expect(sim.player.mountKey).toBe('');
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
    const qp = metaOf(sim).questLog.get(RIDING_LESSONS_QUEST_ID)!;
    expect(qp.counts[0]).toBe(1);
    expect(qp.state).toBe('ready');
    // The reward is granted by the turn-in, never here.
    expect(metaOf(sim).inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(false);
  }, 20000);

  it('turning the quest in at Marla after passing grants reins_valorsteed', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);
    completeRace(sim);
    standAtMarla(sim);
    sim.turnInQuest(RIDING_LESSONS_QUEST_ID);
    sim.tick();
    expect(metaOf(sim).inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(true);
    expect(QUESTS[RIDING_LESSONS_QUEST_ID].itemRewards.warrior).toBe('reins_valorsteed');
  }, 20000);
});

describe('riding lesson, abandon paths', () => {
  it('charges the fee exactly once; a later attempt after an abandon is free', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    expect(metaOf(sim).copper).toBe(0);
    sim.mountTrainAbortFor(sim.playerId);
    sim.tick();
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
    expect(metaOf(sim).mountTrainingFeePaid).toBe(true);
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'mountTrainSession')).toBe(true);
    expect(metaOf(sim).mountTraining?.state).toBe('IN_PROGRESS');
  });

  it('straying beyond the paddock abandons the lesson', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    // Well outside the (enlarged) paddock rectangle.
    teleport(sim, STABLE_PADDOCK.x2 + 30, STABLE_PADDOCK.z1 - 30);
    const events = sim.tick();
    expect(events.some((e) => e.type === 'mountTrainEnd' && e.outcome === 'abandoned')).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === 'log' &&
          e.text === 'You leave the paddock and the lesson ends. Come back to Marla to try again.',
      ),
    ).toBe(true);
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
  });

  it('dismounting during the ride phase abandons the lesson', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);
    expect(metaOf(sim).mountTraining?.phase).toBe('ride');
    sim.toggleMounted(); // step off the steed
    const events: SimEvent[] = [];
    for (let i = 0; i < 40 && !events.some((e) => e.type === 'mountTrainEnd'); i++)
      events.push(...sim.tick());
    expect(events.some((e) => e.type === 'mountTrainEnd' && e.outcome === 'abandoned')).toBe(true);
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
  });

  it('a mid-summon abandon clears the pending training summon (no steed applied later)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    sim.toggleMounted();
    sim.tick();
    expect(sim.player.mountCastKey).toBe('valorsteed');
    sim.mountTrainAbortFor(sim.playerId);
    sim.tick();
    for (let i = 0; i < 60; i++) sim.tick();
    expect(sim.player.mountKey).toBe('');
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
  });

  it('death ends the session', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    sim.player.hp = 0;
    sim.player.dead = true;
    const events = sim.tick();
    expect(events.some((e) => e.type === 'mountTrainEnd' && e.outcome === 'abandoned')).toBe(true);
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
  });

  it('leaving mid-session abandons it (removePlayer teardown)', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true, noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Rider');
    const meta = sim.players.get(pid)!;
    const e = sim.entities.get(pid)!;
    const marla = marlaOf(sim);
    e.level = 20;
    e.pos.x = marla.pos.x;
    e.pos.z = marla.pos.z;
    e.prevPos = { ...e.pos };
    meta.questLog.set(RIDING_LESSONS_QUEST_ID, {
      questId: RIDING_LESSONS_QUEST_ID,
      counts: [0],
      state: 'active',
    });
    meta.copper = MOUNT_TRAIN_FEE_COPPER;
    sim.mountTrainBeginFor(pid);
    sim.tick();
    expect(meta.mountTraining?.state).toBe('IN_PROGRESS');
    sim.removePlayer(pid);
    expect(meta.mountTraining ?? null).toBeNull();
  });
});

describe('riding lesson, the training summon gate', () => {
  it('the Mount/Dismount toggle refuses to summon anything without a lesson (nothing owned)', () => {
    const sim = makeSim();
    sim.setPlayerLevel(20);
    sim.toggleMounted();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    for (let i = 0; i < 60; i++) sim.tick();
    expect(sim.player.mountKey).toBe('');
  });
});
