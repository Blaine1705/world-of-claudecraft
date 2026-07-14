// Direct + facade tests for the riding-lesson (mount-training) minigame
// (src/sim/mounts_training.ts): a timed show-jumping course. Drives the module
// through the Sim facade (mountTrainBegin / toggleMounted / mountTrainAbort /
// mountTrainingView), the same surface the server command dispatch and the online
// client use. q_riding_lessons (giver/turnIn stablemaster_marla, minLevel 20, one
// 'interact' objective keyed on the sentinel 'train_valorsteed') and the
// stablemaster_marla NPC are real content; this file drives them as-is.

import { describe, expect, it } from 'vitest';
import { RIDING_COURSE } from '../src/sim/content/mounts';
import { QUESTS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { terrainHeight } from '../src/sim/world';

const RIDING_LESSONS_QUEST_ID = 'q_riding_lessons';
const MOUNT_TRAIN_FEE_COPPER = 10000;
const JUMPS = RIDING_COURSE.jumps;

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

/** Begin a lesson: the session opens in phase 'mount' (a session exists, not mounted). */
function beginLesson(sim: Sim): void {
  sim.mountTrainBegin();
  sim.tick();
}

/** Summon the training Valorsteed via the Mount/Dismount toggle and run the summon
 * channel to completion, moving the session to phase 'staging'. */
function mountSteed(sim: Sim): void {
  sim.toggleMounted();
  for (let i = 0; i < 60 && sim.player.mountKey !== 'valorsteed'; i++) sim.tick();
}

/** Ride the mounted player into the course arena (an outside -> inside transition),
 * arming the timer (phase 'course'). Returns the tick's events. */
function enterCourse(sim: Sim) {
  teleport(sim, RIDING_COURSE.center.x, RIDING_COURSE.center.z);
  return sim.tick();
}

/** Land the mounted player on a point, then jump (real airborne = Entity.jumping via
 * the movement kernel) so the driver can clear a jump there. Returns the tick events. */
function jumpAt(sim: Sim, point: { x: number; z: number }) {
  const meta = sim.players.get(sim.playerId)!;
  teleport(sim, point.x, point.z);
  sim.player.onGround = true;
  sim.player.vy = 0;
  sim.player.jumping = false;
  meta.moveInput.jump = true;
  const evs = sim.tick();
  meta.moveInput.jump = false;
  return evs;
}

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
    setupAtMarla(sim);
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

  it('refuses a second session while one is already in progress', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    const firstSessionId = sim.mountTrainingView()!.sessionId;
    sim.mountTrainBegin();
    const events = sim.tick();
    expect(
      events.find(
        (e) => e.type === 'error' && (e as any).text === 'A riding lesson is already in progress.',
      ),
    ).toBeDefined();
    expect(sim.mountTrainingView()!.sessionId).toBe(firstSessionId);
  });
});

describe('mount-training minigame, phases', () => {
  it('mounting the UNOWNED Valorsteed moves the session to phase staging (timer not armed)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    meta.selectedMount = 'grag_bear'; // an unowned, non-default pick to prove it is untouched
    beginLesson(sim);
    expect(sim.mountTrainingView()!.phase).toBe('mount');

    sim.toggleMounted();
    expect(sim.player.mountCastKey).toBe('valorsteed');
    let flip: any = null;
    for (let i = 0; i < 60 && sim.player.mountKey !== 'valorsteed'; i++) {
      flip =
        sim.tick().find((e) => e.type === 'mountTrainSession' && (e as any).phase === 'staging') ??
        flip;
    }
    expect(sim.player.mountKey).toBe('valorsteed'); // riding the unowned training steed
    expect(meta.selectedMount).toBe('grag_bear'); // persisted pick untouched by the lesson
    expect(flip).toBeDefined();
    const v = sim.mountTrainingView()!;
    expect(v.phase).toBe('staging');
    expect(v.ticksLeft).toBeNull(); // timer not running yet
    expect(v.nextJump).toBeNull();
  });

  it('riding into the course arena arms the timer (staging -> course) with the full budget', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);
    const evs = enterCourse(sim);
    const start = evs.find((e) => e.type === 'mountTrainRunStart') as any;
    expect(start).toBeDefined();
    expect(start.timeLimitTicks).toBe(RIDING_COURSE.timeLimitSeconds * 20);
    const v = sim.mountTrainingView()!;
    expect(v.phase).toBe('course');
    expect(v.jump).toBe(0);
    expect(v.nextJump).toEqual({ x: JUMPS[0].x, z: JUMPS[0].z });
    expect(v.ticksLeft).toBeGreaterThan(0);
  });
});

describe('mount-training minigame, jumping the course', () => {
  it('a grounded pass-through does NOT clear a jump; jumping over it does', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);
    enterCourse(sim);

    // Grounded on the first jump: no advance.
    teleport(sim, JUMPS[0].x, JUMPS[0].z);
    sim.player.onGround = true;
    sim.player.vy = 0;
    sim.player.jumping = false;
    sim.tick();
    expect(sim.mountTrainingView()!.jump).toBe(0);

    // Jump over it: advance.
    const evs = jumpAt(sim, JUMPS[0]);
    const jumpEv = evs.find((e) => e.type === 'mountTrainJump') as any;
    expect(jumpEv).toBeDefined();
    expect(jumpEv.jump).toBe(1);
    expect(jumpEv.jumpsTotal).toBe(JUMPS.length);
    expect(sim.mountTrainingView()!.jump).toBe(1);
    expect(sim.mountTrainingView()!.nextJump).toEqual({ x: JUMPS[1].x, z: JUMPS[1].z });
  });

  it('jumps must be cleared in order (jumping the third while the first is next does nothing)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);
    enterCourse(sim);

    jumpAt(sim, JUMPS[2]); // out of order
    expect(sim.mountTrainingView()!.jump).toBe(0);
    jumpAt(sim, JUMPS[0]); // the real next jump
    expect(sim.mountTrainingView()!.jump).toBe(1);
  });

  it('clearing all jumps in time credits the objective once, force-dismounts, clears the session; reins never granted directly', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    const quest = QUESTS[RIDING_LESSONS_QUEST_ID];
    const objIndex = quest.objectives.findIndex(
      (o) => o.type === 'interact' && o.targetObjectItemId === 'train_valorsteed',
    );
    beginLesson(sim);
    mountSteed(sim);
    enterCourse(sim);

    let endEv: any = null;
    for (const j of JUMPS) {
      endEv = jumpAt(sim, j).find((e) => e.type === 'mountTrainEnd') ?? endEv;
    }
    expect(endEv).not.toBeNull();
    expect(endEv.outcome).toBe('success');
    expect(sim.mountTrainingView()).toBeNull();
    expect(sim.player.mountKey).toBe(''); // the unowned steed is taken back instantly

    const qp = meta.questLog.get(RIDING_LESSONS_QUEST_ID)!;
    expect(qp.counts[objIndex]).toBe(1);
    expect(qp.state).toBe('ready');
    expect(meta.inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(false);
    expect(meta.copper).toBe(0);
  });

  it('turning the quest in at Marla grants reins_valorsteed', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    beginLesson(sim);
    mountSteed(sim);
    enterCourse(sim);
    for (const j of JUMPS) jumpAt(sim, j);
    expect(meta.questLog.get(RIDING_LESSONS_QUEST_ID)!.state).toBe('ready');

    standAtMarla(sim);
    sim.turnInQuest(RIDING_LESSONS_QUEST_ID);
    sim.tick();
    expect(meta.inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(true);
  });
});

describe('mount-training minigame, timeout soft reset', () => {
  it('running out of time soft-resets to staging; re-arming needs an exit and re-entry', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    beginLesson(sim);
    mountSteed(sim);
    enterCourse(sim);
    jumpAt(sim, JUMPS[0]); // some progress, to prove it clears on reset
    expect(sim.mountTrainingView()!.jump).toBe(1);

    // Force the deadline to have passed; the next tick times out.
    meta.mountTraining!.deadlineTick = sim.tickCount;
    teleport(sim, RIDING_COURSE.center.x, RIDING_COURSE.center.z); // stay inside the arena
    const evs = sim.tick();
    expect(
      evs.find((e) => e.type === 'mountTrainSession' && (e as any).phase === 'staging'),
    ).toBeDefined();
    expect(
      evs.find(
        (e) =>
          e.type === 'log' && (e as any).text === 'Too slow. Ride out of the course and try again.',
      ),
    ).toBeDefined();
    const soft = sim.mountTrainingView()!;
    expect(soft.phase).toBe('staging');
    expect(soft.jump).toBe(0); // progress cleared
    expect(soft.ticksLeft).toBeNull();

    // Standing inside the arena does NOT re-arm.
    sim.tick();
    expect(sim.mountTrainingView()!.phase).toBe('staging');

    // Ride out (north pasture) then back in re-arms.
    teleport(sim, RIDING_COURSE.center.x, RIDING_COURSE.divider.z + 12); // north of the divider
    sim.tick();
    expect(sim.mountTrainingView()!.phase).toBe('staging');
    const rearm = enterCourse(sim);
    expect(rearm.find((e) => e.type === 'mountTrainRunStart')).toBeDefined();
    expect(sim.mountTrainingView()!.phase).toBe('course');
  });
});

describe('mount-training minigame, failure and retry', () => {
  it('dismounting mid-lesson throws the rider and clears the session; an immediate free retry works', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    beginLesson(sim);
    mountSteed(sim); // mounted at Marla, never rode away

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

    sim.mountTrainBegin(); // still at Marla, fee already paid
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

    mountSteed(sim);
    sim.toggleMounted();
    for (let i = 0; i < 40 && sim.mountTrainingView(); i++) sim.tick();
    expect(sim.mountTrainingView()).toBeNull();
    expect(meta.copper).toBe(500);

    sim.mountTrainBegin();
    const retryEvents = sim.tick();
    expect(retryEvents.find((e) => e.type === 'error')).toBeUndefined();
    const retrySession = retryEvents.find((e) => e.type === 'mountTrainSession') as any;
    expect(retrySession).toBeDefined();
    expect(retrySession.sessionId).not.toBe(firstSessionId);
    expect(meta.copper).toBe(500);
  });

  it('leaving the paddock (beyond boundsRadius) abandons the lesson and force-dismounts', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);

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
    mountSteed(sim);

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
  it('mountTrainAbort while riding force-dismounts the unowned steed', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    mountSteed(sim);
    expect(sim.player.mountKey).toBe('valorsteed');

    sim.mountTrainAbort();
    const events = sim.tick();
    expect(
      events.find((e) => e.type === 'mountTrainEnd' && (e as any).outcome === 'abandoned'),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
    expect(sim.player.mountKey).toBe('');
  });

  it('mountTrainAbort in phase mount ends the session (fee stays paid)', () => {
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
  it('projects mount (no nextJump/timer) -> staging -> course (nextJump + countdown)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    beginLesson(sim);
    expect(sim.mountTrainingView()).toMatchObject({
      phase: 'mount',
      jump: 0,
      jumpsTotal: JUMPS.length,
      nextJump: null,
      ticksLeft: null,
    });

    mountSteed(sim);
    expect(sim.mountTrainingView()).toMatchObject({
      phase: 'staging',
      nextJump: null,
      ticksLeft: null,
    });

    enterCourse(sim);
    const v = sim.mountTrainingView()!;
    expect(v.phase).toBe('course');
    expect(v.nextJump).toEqual({ x: JUMPS[0].x, z: JUMPS[0].z });
    expect(v.ticksLeft).toBeGreaterThan(0);

    jumpAt(sim, JUMPS[0]);
    const v2 = sim.mountTrainingView()!;
    expect(v2.jump).toBe(1);
    expect(v2.nextJump).toEqual({ x: JUMPS[1].x, z: JUMPS[1].z });
  });
});
