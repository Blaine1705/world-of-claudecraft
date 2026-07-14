// Direct + facade tests for the riding lesson (src/sim/mounts_training.ts): the
// Mount/Dismount keybind tutorial gating the first mount. Drives the module
// through the Sim facade (mountTrainBegin / toggleMounted / mountTrainAbortFor),
// the same surface the server command dispatch and the online client use.
// q_riding_lessons (giver/turnIn stablemaster_marla, minLevel 20, one 'interact'
// objective keyed on the sentinel 'train_valorsteed') and the stablemaster_marla
// NPC are real content; this file drives them as-is.

import { describe, expect, it } from 'vitest';
import { QUESTS } from '../src/sim/data';
import { MOUNT_TRAIN_LEAVE_RADIUS } from '../src/sim/mounts_training';
import { Sim } from '../src/sim/sim';
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

/** Stand the player at the stablemaster, level 20, actively on the riding-lesson
 * quest with its objective not yet complete. Copper stays at the fresh default (0),
 * the "cannot afford" fixture; pass `copper` to fund the lesson. */
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

/** Begin a lesson: a session opens (the player is not yet on the steed). */
function beginLesson(sim: Sim): void {
  sim.mountTrainBegin();
  sim.tick();
}

/** Summon the training Valorsteed via the Mount/Dismount toggle and run the summon
 * channel to completion. The driver succeeds the lesson the tick the player is in
 * the saddle, so this collects every event up to and past that point. */
function mountSteed(sim: Sim) {
  const events = [];
  sim.toggleMounted();
  for (let i = 0; i < 60; i++) {
    events.push(...sim.tick());
    if (events.some((e) => e.type === 'mountTrainEnd')) break;
  }
  return events;
}

function metaOf(sim: Sim) {
  return sim.players.get(sim.playerId)!;
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

describe('riding lesson, mounting completes it', () => {
  it('begin charges the fee once and emits a session event', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER + 500 });
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'mountTrainSession')).toBe(true);
    expect(metaOf(sim).copper).toBe(500);
    expect(metaOf(sim).mountTrainingFeePaid).toBe(true);
    expect(metaOf(sim).mountTraining?.state).toBe('IN_PROGRESS');
  });

  it('climbing onto the UNOWNED Valorsteed succeeds the lesson, credits the objective once, force-dismounts, clears the session; reins never granted directly', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    const events = mountSteed(sim);
    expect(events.some((e) => e.type === 'mountTrainEnd' && e.outcome === 'success')).toBe(true);
    expect(events.some((e) => e.type === 'questProgress')).toBe(true);
    // Marla takes the unowned steed back instantly.
    expect(sim.player.mountKey).toBe('');
    expect(metaOf(sim).mountTraining ?? null).toBeNull();
    const qp = metaOf(sim).questLog.get(RIDING_LESSONS_QUEST_ID)!;
    expect(qp.counts[0]).toBe(1);
    expect(qp.state).toBe('ready');
    // The reward is granted by the turn-in, never here.
    expect(metaOf(sim).inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(false);
  });

  it('turning the quest in at Marla grants reins_valorsteed', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);
    standAtMarla(sim);
    sim.turnInQuest(RIDING_LESSONS_QUEST_ID);
    sim.tick();
    expect(metaOf(sim).inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(true);
    const quest = QUESTS[RIDING_LESSONS_QUEST_ID];
    expect(quest.itemRewards.warrior).toBe('reins_valorsteed');
  });
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
    // Retry with zero copper still begins (the fee stays paid).
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(events.some((e) => e.type === 'mountTrainSession')).toBe(true);
    expect(metaOf(sim).mountTraining?.state).toBe('IN_PROGRESS');
  });

  it('straying from the yard (beyond the leave radius) abandons the lesson', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    const marla = marlaOf(sim);
    teleport(sim, marla.pos.x + MOUNT_TRAIN_LEAVE_RADIUS + 5, marla.pos.z);
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

  it('a mid-summon abandon clears the pending training summon (no steed applied later)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    sim.toggleMounted();
    sim.tick(); // summon channel in flight
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
