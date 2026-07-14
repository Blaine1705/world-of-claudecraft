// Direct + facade tests for the riding-lesson (mount-training) minigame
// (src/sim/mounts_training.ts): a ridden equestrian course. Drives the module
// through the Sim facade (mountTrainBegin / toggleMounted / mountTrainAbort /
// mountTrainingView), the same surface the server command dispatch and the online
// client use. q_riding_lessons (giver/turnIn stablemaster_marla, minLevel 20, one
// 'interact' objective keyed on the sentinel targetObjectItemId 'train_valorsteed')
// and the stablemaster_marla NPC are real content; this file drives them as-is.

import { describe, expect, it } from 'vitest';
import { RIDING_COURSE } from '../src/sim/content/mounts';
import { QUESTS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';

const RIDING_LESSONS_QUEST_ID = 'q_riding_lessons';
const MOUNT_TRAIN_FEE_COPPER = 10000;
const GATES = RIDING_COURSE.gates;

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
 * quest with its objective not yet complete. Leaves copper at the fresh default (0),
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

/** Begin a lesson: the session opens in phase 'mount' (a session exists but the
 * player has not summoned the training steed yet). */
function beginLesson(sim: Sim): void {
  sim.mountTrainBegin();
  sim.tick();
}

/** Summon the training Valorsteed via the Mount/Dismount toggle and run the summon
 * channel to completion, flipping the session to phase 'ride'. Returns the phase-flip
 * mountTrainSession event, if any. */
function mountTrainingSteed(sim: Sim) {
  sim.toggleMounted();
  let flip: unknown = null;
  for (let i = 0; i < 60 && sim.player.mountKey !== 'valorsteed'; i++) {
    const evs = sim.tick();
    const f = evs.find((e) => e.type === 'mountTrainSession' && (e as any).phase === 'ride');
    if (f) flip = f;
  }
  return flip;
}

/** Teleport onto a gate and tick, so the driver registers the pass. */
function rideThroughGate(sim: Sim, g: { x: number; z: number }) {
  teleport(sim, g.x, g.z);
  return sim.tick();
}

// The whole course must sit on dry mountain ground, or a teleported mounted rider
// would swim and be dismounted before the gate check ever runs. Assert it once.
describe('mount-training course geometry is rideable', () => {
  it('the paddock centre and every gate are above water', () => {
    const seed = makeSim().cfg.seed;
    expect(terrainHeight(RIDING_COURSE.center.x, RIDING_COURSE.center.z, seed)).toBeGreaterThan(
      WATER_LEVEL,
    );
    for (const g of GATES) {
      expect(terrainHeight(g.x, g.z, seed), `gate ${g.x},${g.z} above water`).toBeGreaterThan(
        WATER_LEVEL,
      );
    }
  });
});

describe('mount-training minigame, begin gates', () => {
  it('refuses an underlevel player (no session started)', () => {
    const sim = makeSim();
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(
      events.find(
        (e) =>
          e.type === 'error' && (e as any).text === 'You must be level 20 to take riding lessons.',
      ),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
  });

  it('refuses when too far from the stablemaster', () => {
    const sim = makeSim();
    sim.setPlayerLevel(20);
    teleport(sim, -9999, -9999);
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(
      events.find((e) => e.type === 'error' && (e as any).text === 'Too far away.'),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
  });

  it('refuses when not actively on q_riding_lessons', () => {
    const sim = makeSim();
    sim.setPlayerLevel(20);
    standAtMarla(sim);
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(
      events.find(
        (e) =>
          e.type === 'error' &&
          (e as any).text === 'You need to accept the riding lesson quest first.',
      ),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
  });

  it('refuses a too-poor player (no session started, no copper spent)', () => {
    const sim = makeSim();
    setupAtMarla(sim); // copper stays at the fresh-character default (0)
    const meta = sim.players.get(sim.playerId)!;
    expect(meta.copper).toBe(0);
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(
      events.find((e) => e.type === 'error' && (e as any).text === 'Not enough money.'),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
    expect(meta.mountTrainingFeePaid).not.toBe(true);
  });

  it('refuses starting a second session while one is already in progress', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    const firstSessionId = sim.mountTrainingView()!.sessionId;
    sim.mountTrainBegin(); // ignored: a session is already IN_PROGRESS
    const events = sim.tick();
    expect(
      events.find(
        (e) => e.type === 'error' && (e as any).text === 'A riding lesson is already in progress.',
      ),
    ).toBeDefined();
    expect(sim.mountTrainingView()!.sessionId).toBe(firstSessionId);
  });
});

describe('mount-training minigame, mounting the training steed', () => {
  it('Z in phase mount summons the UNOWNED Valorsteed via the channel, leaving the persisted pick alone', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    meta.selectedMount = 'grag_bear'; // an unowned, non-default pick to prove it is untouched
    beginLesson(sim);
    expect(sim.mountTrainingView()!.phase).toBe('mount');
    expect(meta.inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(false);

    sim.toggleMounted(); // starts the training summon channel
    expect(sim.player.mountCastKey).toBe('valorsteed');
    for (let i = 0; i < 60 && sim.player.mountKey !== 'valorsteed'; i++) sim.tick();

    expect(sim.player.mountKey).toBe('valorsteed'); // riding the unowned training steed
    expect(meta.selectedMount).toBe('grag_bear'); // persisted pick untouched by the lesson
  });

  it('flips to phase ride when the summon completes, re-emitting the session', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    const flip = mountTrainingSteed(sim);
    expect(flip).toBeDefined();
    const view = sim.mountTrainingView()!;
    expect(view.phase).toBe('ride');
    expect(view.gate).toBe(0);
    expect(view.nextGate).toEqual({ x: GATES[0].x, z: GATES[0].z });
  });
});

describe('mount-training minigame, riding the course', () => {
  it('gates must be passed in order (standing at a later gate while an earlier one is next does nothing)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountTrainingSteed(sim);

    // Stand on the third gate while gate 1 is still the next required gate.
    teleport(sim, GATES[2].x, GATES[2].z);
    sim.tick();
    expect(sim.mountTrainingView()!.gate).toBe(0);

    // Now pass the actual next gate (gate 0).
    const evs = rideThroughGate(sim, GATES[0]);
    const gateEv = evs.find((e) => e.type === 'mountTrainGate') as any;
    expect(gateEv).toBeDefined();
    expect(gateEv.gate).toBe(1);
    expect(gateEv.gatesTotal).toBe(GATES.length);
    expect(sim.mountTrainingView()!.gate).toBe(1);
    expect(sim.mountTrainingView()!.nextGate).toEqual({ x: GATES[1].x, z: GATES[1].z });
  });

  it('a full lap credits the objective once, force-dismounts, and clears the session; reins are never granted directly', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    const quest = QUESTS[RIDING_LESSONS_QUEST_ID];
    const objIndex = quest.objectives.findIndex(
      (o) => o.type === 'interact' && o.targetObjectItemId === 'train_valorsteed',
    );
    expect(objIndex).toBeGreaterThanOrEqual(0);

    beginLesson(sim);
    mountTrainingSteed(sim);

    let endEv: any = null;
    for (const g of GATES) {
      const evs = rideThroughGate(sim, g);
      endEv = evs.find((e) => e.type === 'mountTrainEnd') ?? endEv;
    }
    expect(endEv).not.toBeNull();
    expect(endEv.outcome).toBe('success');
    expect(sim.mountTrainingView()).toBeNull();
    expect(sim.player.mountKey).toBe(''); // the unowned steed is taken back instantly

    const qp = meta.questLog.get(RIDING_LESSONS_QUEST_ID)!;
    expect(qp.counts[objIndex]).toBe(1); // credited exactly once
    expect(qp.state).toBe('ready'); // ready to turn in at Marla for reins_valorsteed
    expect(meta.inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(false);
    expect(meta.copper).toBe(0); // the fee was charged once, nothing more
  });

  it('turning the quest in at Marla grants reins_valorsteed', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    beginLesson(sim);
    mountTrainingSteed(sim);
    for (const g of GATES) rideThroughGate(sim, g);
    expect(meta.questLog.get(RIDING_LESSONS_QUEST_ID)!.state).toBe('ready');

    standAtMarla(sim); // walk back to the stablemaster to hand in
    sim.turnInQuest(RIDING_LESSONS_QUEST_ID);
    sim.tick();
    expect(meta.inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(true);
  });
});

describe('mount-training minigame, failure and retry', () => {
  it('dismounting mid-ride throws the rider and clears the session; an immediate free retry works', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    beginLesson(sim);
    mountTrainingSteed(sim); // mounted at Marla, never rode away

    sim.toggleMounted(); // start the dismount channel
    let thrown: any = null;
    for (let i = 0; i < 40 && !thrown; i++) {
      thrown = sim
        .tick()
        .find((e) => e.type === 'mountTrainEnd' && (e as any).outcome === 'thrown');
    }
    expect(thrown).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
    expect(sim.player.mountKey).toBe('');

    // Retry: still at Marla, no copper needed (the fee stayed paid).
    sim.mountTrainBegin();
    const retry = sim.tick();
    expect(retry.find((e) => e.type === 'error')).toBeUndefined();
    expect(retry.find((e) => e.type === 'mountTrainSession')).toBeDefined();
    expect(meta.copper).toBe(0);
  });

  it('charges the fee exactly once; a retry after a throw is free', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER + 500 });
    const meta = sim.players.get(sim.playerId)!;

    beginLesson(sim);
    expect(meta.copper).toBe(500);
    expect(meta.mountTrainingFeePaid).toBe(true);
    const firstSessionId = sim.mountTrainingView()!.sessionId;

    mountTrainingSteed(sim);
    sim.toggleMounted(); // dismount to throw
    for (let i = 0; i < 40 && sim.mountTrainingView(); i++) sim.tick();
    expect(sim.mountTrainingView()).toBeNull();
    expect(meta.copper).toBe(500); // no second charge, no refund

    sim.mountTrainBegin();
    const retryEvents = sim.tick();
    expect(retryEvents.find((e) => e.type === 'error')).toBeUndefined();
    const retrySession = retryEvents.find((e) => e.type === 'mountTrainSession') as any;
    expect(retrySession).toBeDefined();
    expect(retrySession.sessionId).not.toBe(firstSessionId);
    expect(meta.copper).toBe(500); // still unchanged: the retry was free
  });

  it('leaving the paddock (beyond boundsRadius) abandons the lesson and force-dismounts', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountTrainingSteed(sim);

    teleport(sim, RIDING_COURSE.center.x + RIDING_COURSE.boundsRadius + 15, RIDING_COURSE.center.z);
    const evs = sim.tick();
    expect(
      evs.find((e) => e.type === 'mountTrainEnd' && (e as any).outcome === 'abandoned'),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
    expect(sim.player.mountKey).toBe('');
  });

  it('death ends the session as a throw and clears it', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountTrainingSteed(sim);

    sim.player.dead = true;
    sim.player.hp = 0;
    const evs = sim.tick();
    expect(
      evs.find((e) => e.type === 'mountTrainEnd' && (e as any).outcome === 'thrown'),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
  });
});

describe('mount-training minigame, abort / abandon', () => {
  it('mountTrainAbort in phase mount ends the session as abandoned (fee stays paid)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    beginLesson(sim);
    sim.mountTrainAbort();
    const events = sim.tick();
    expect(
      events.find((e) => e.type === 'mountTrainEnd' && (e as any).outcome === 'abandoned'),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
    expect(meta.mountTrainingFeePaid).toBe(true);
  });

  it('mountTrainAbort while riding force-dismounts the unowned steed', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountTrainingSteed(sim);
    expect(sim.player.mountKey).toBe('valorsteed');

    sim.mountTrainAbort();
    const events = sim.tick();
    expect(
      events.find((e) => e.type === 'mountTrainEnd' && (e as any).outcome === 'abandoned'),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
    expect(sim.player.mountKey).toBe('');
  });

  it('leaving mid-session abandons it (removePlayer teardown)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    const meta = sim.players.get(sim.playerId)!;
    expect(meta.mountTraining?.state).toBe('IN_PROGRESS');
    sim.removePlayer(sim.playerId);
    expect(meta.mountTraining).toBeNull();
  });
});

describe('mount-training minigame, deprecated answer command', () => {
  it('mountTrainAnswer is a no-op that neither errors nor mutates the session', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    const before = sim.mountTrainingView();
    sim.mountTrainAnswer('left');
    const evs = sim.tick();
    expect(evs.find((e) => e.type === 'error')).toBeUndefined();
    expect(sim.mountTrainingView()).toEqual(before);
  });
});

describe('mount-training minigame, view projection', () => {
  it('projects phase mount (null nextGate) then ride (nextGate advancing with the gate)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    expect(sim.mountTrainingView()).toMatchObject({
      phase: 'mount',
      gate: 0,
      gatesTotal: GATES.length,
      nextGate: null,
    });

    mountTrainingSteed(sim);
    expect(sim.mountTrainingView()).toMatchObject({
      phase: 'ride',
      gate: 0,
      nextGate: { x: GATES[0].x, z: GATES[0].z },
    });

    rideThroughGate(sim, GATES[0]);
    const v = sim.mountTrainingView()!;
    expect(v.gate).toBe(1);
    expect(v.nextGate).toEqual({ x: GATES[1].x, z: GATES[1].z });
  });
});
