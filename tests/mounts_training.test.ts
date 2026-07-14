// Direct + facade tests for the riding-lesson (mount-training) minigame
// (src/sim/mounts_training.ts), modeled on tests/lockpick_session.test.ts and
// tests/lockpick_timeout.test.ts: drives the module through the Sim facade
// (mountTrainBegin/mountTrainAnswer/mountTrainAbort/mountTrainingView), the
// same surface the server command dispatch and the online client use.
//
// q_riding_lessons (giver/turnIn stablemaster_marla, minLevel 20, one
// 'interact' objective keyed on the sentinel targetObjectItemId
// 'train_valorsteed') and the stablemaster_marla NPC are real content (landed
// by the parallel content slice); this file drives them as-is rather than
// faking a quest, so it stays correct regardless of exactly where Marla's
// stable sits.

import { describe, expect, it } from 'vitest';
import { QUESTS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { TrainingLean } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const RIDING_LESSONS_QUEST_ID = 'q_riding_lessons';
const MOUNT_TRAIN_FEE_COPPER = 10000;

const makeSim = (seed = 1) => new Sim({ seed, playerClass: 'warrior', autoEquip: true });

/** Stand the player at the stablemaster, level 20, actively on the riding-lesson
 * quest with its objective not yet complete. Leaves copper untouched (a fresh
 * character starts at 0, which is exactly the "cannot afford" fixture); pass
 * `copper` to fund the lesson. */
function setupAtMarla(sim: Sim, opts: { copper?: number } = {}): void {
  sim.setPlayerLevel(20);
  const marla = [...sim.entities.values()].find(
    (e) => e.kind === 'npc' && e.templateId === 'stablemaster_marla',
  )!;
  expect(marla, 'stablemaster_marla must be a live NPC entity').toBeDefined();
  sim.player.pos.x = marla.pos.x;
  sim.player.pos.z = marla.pos.z;
  sim.player.pos.y = terrainHeight(marla.pos.x, marla.pos.z, sim.cfg.seed);
  sim.player.prevPos = { ...sim.player.pos };
  const meta = sim.players.get(sim.playerId)!;
  meta.questLog.set(RIDING_LESSONS_QUEST_ID, {
    questId: RIDING_LESSONS_QUEST_ID,
    counts: [0],
    state: 'active',
  });
  if (opts.copper !== undefined) meta.copper = opts.copper;
}

/** The current live view's cue, or throws if there is none. */
function currentCue(sim: Sim): TrainingLean {
  const view = sim.mountTrainingView();
  expect(view, 'expected an active riding-lesson session').not.toBeNull();
  return view!.cue;
}

const WRONG: Record<TrainingLean, TrainingLean> = {
  left: 'right',
  right: 'left',
  steady: 'left',
};

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
    sim.player.pos.x = -9999;
    sim.player.pos.z = -9999;
    sim.player.prevPos = { ...sim.player.pos };
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
    const marla = [...sim.entities.values()].find(
      (e) => e.kind === 'npc' && e.templateId === 'stablemaster_marla',
    )!;
    sim.player.pos.x = marla.pos.x;
    sim.player.pos.z = marla.pos.z;
    sim.player.pos.y = terrainHeight(marla.pos.x, marla.pos.z, sim.cfg.seed);
    sim.player.prevPos = { ...sim.player.pos };
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
    sim.mountTrainBegin();
    sim.tick();
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

describe('mount-training minigame, fee (100g, charged once)', () => {
  it('charges the fee exactly once on the first successful begin; a retry after a throw is free', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER + 500 });
    const meta = sim.players.get(sim.playerId)!;

    sim.mountTrainBegin();
    const opened = sim.tick();
    expect(opened.find((e) => e.type === 'mountTrainSession')).toBeDefined();
    expect(meta.copper).toBe(500);
    expect(meta.mountTrainingFeePaid).toBe(true);
    const firstSessionId = sim.mountTrainingView()!.sessionId;

    // Two wrong answers in a row (missCap = 2) throws the rider.
    sim.mountTrainAnswer(WRONG[currentCue(sim)]);
    sim.tick();
    sim.mountTrainAnswer(WRONG[currentCue(sim)]);
    const thrownEvents = sim.tick();
    expect(
      thrownEvents.find((e) => e.type === 'mountTrainEnd' && (e as any).outcome === 'thrown'),
    ).toBeDefined();
    expect(sim.mountTrainingView()).toBeNull();
    expect(meta.copper).toBe(500); // no second charge, no refund

    // Retry: no copper left to pay a second fee, yet it starts (the fee stayed paid).
    sim.mountTrainBegin();
    const retryEvents = sim.tick();
    expect(retryEvents.find((e) => e.type === 'error')).toBeUndefined();
    const retrySession = retryEvents.find((e) => e.type === 'mountTrainSession') as any;
    expect(retrySession).toBeDefined();
    expect(retrySession.sessionId).not.toBe(firstSessionId);
    expect(meta.copper).toBe(500); // still unchanged: the retry was free
  });
});

describe('mount-training minigame, rounds', () => {
  it('a wrong answer counts a miss without advancing the round', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    sim.mountTrainBegin();
    sim.tick();
    const before = sim.mountTrainingView()!;
    expect(before.round).toBe(1);
    expect(before.misses).toBe(0);

    sim.mountTrainAnswer(WRONG[before.cue]);
    const events = sim.tick();
    const roundEv = events.find((e) => e.type === 'mountTrainRound') as any;
    expect(roundEv).toBeDefined();
    expect(roundEv.result).toBe('miss');
    expect(roundEv.round).toBe(1); // a miss retries the SAME round with a fresh cue
    expect(roundEv.misses).toBe(1);
    expect(sim.mountTrainingView()!.round).toBe(1);
    expect(sim.mountTrainingView()!.misses).toBe(1);
  });

  it('a timeout counts a miss exactly like a wrong answer', () => {
    const sim = makeSim(7);
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    sim.mountTrainBegin();
    sim.tick();
    expect(sim.mountTrainingView()!.misses).toBe(0);

    // Idle past the round's deadline: the sim, not the client, times it out.
    let sawMiss = false;
    for (let i = 0; i < 400 && sim.mountTrainingView() && !sawMiss; i++) {
      const events = sim.tick();
      const roundEv = events.find((e) => e.type === 'mountTrainRound') as any;
      if (roundEv?.result === 'miss') sawMiss = true;
    }
    expect(sawMiss).toBe(true);
    expect(sim.mountTrainingView()!.misses).toBe(1);
  });

  it('two misses (wrong answer or timeout) throws the rider; the session clears', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    sim.mountTrainBegin();
    sim.tick();

    sim.mountTrainAnswer(WRONG[currentCue(sim)]);
    sim.tick();
    expect(sim.mountTrainingView()!.misses).toBe(1);

    sim.mountTrainAnswer(WRONG[currentCue(sim)]);
    const events = sim.tick();
    const end = events.find((e) => e.type === 'mountTrainEnd') as any;
    expect(end).toBeDefined();
    expect(end.outcome).toBe('thrown');
    expect(sim.mountTrainingView()).toBeNull();
  });

  it('six correct answers succeed: quest credit is granted exactly once, reins are never granted directly', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    const quest = QUESTS[RIDING_LESSONS_QUEST_ID];
    const objIndex = quest.objectives.findIndex(
      (o) => o.type === 'interact' && o.targetObjectItemId === 'train_valorsteed',
    );
    expect(objIndex).toBeGreaterThanOrEqual(0);

    sim.mountTrainBegin();
    sim.tick();

    let successEvent: any = null;
    for (let round = 1; round <= 6 && !successEvent; round++) {
      const cue = currentCue(sim);
      sim.mountTrainAnswer(cue);
      const events = sim.tick();
      successEvent = events.find((e) => e.type === 'mountTrainEnd') ?? null;
    }
    expect(successEvent).not.toBeNull();
    expect(successEvent.outcome).toBe('success');
    expect(sim.mountTrainingView()).toBeNull();

    const qp = meta.questLog.get(RIDING_LESSONS_QUEST_ID)!;
    expect(qp.counts[objIndex]).toBe(1); // credited exactly once
    expect(qp.state).toBe('ready'); // ready to turn in at Marla for reins_valorsteed
    expect(meta.inventory.some((s) => s.itemId === 'reins_valorsteed')).toBe(false); // never granted directly
    expect(meta.copper).toBe(0); // the fee was charged once, nothing more
  });
});

describe('mount-training minigame, abort / abandon', () => {
  it('mountTrainAbort ends the session as abandoned (fee stays paid)', () => {
    const sim = makeSim();
    setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
    const meta = sim.players.get(sim.playerId)!;
    sim.mountTrainBegin();
    sim.tick();
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
    sim.mountTrainBegin();
    sim.tick();
    const meta = sim.players.get(sim.playerId)!;
    expect(meta.mountTraining?.state).toBe('IN_PROGRESS');
    sim.removePlayer(sim.playerId);
    expect(meta.mountTraining).toBeNull();
  });
});

describe('mount-training minigame, determinism', () => {
  it('the cue sequence is reproducible from the seed (same seed + same setup => identical cues)', () => {
    function driveAndCaptureCues(): string[] {
      const sim = makeSim(42);
      setupAtMarla(sim, { copper: MOUNT_TRAIN_FEE_COPPER });
      sim.mountTrainBegin();
      const cues: string[] = [sim.mountTrainingView()!.cue];
      for (let round = 1; round <= 6; round++) {
        const view = sim.mountTrainingView();
        if (!view) break;
        sim.mountTrainAnswer(view.cue); // always correct: walks every round exactly once
        sim.tick();
        const next = sim.mountTrainingView();
        if (next) cues.push(next.cue);
      }
      return cues;
    }
    const runA = driveAndCaptureCues();
    const runB = driveAndCaptureCues();
    expect(runA.length).toBeGreaterThan(1);
    expect(runA).toEqual(runB);
  });
});
