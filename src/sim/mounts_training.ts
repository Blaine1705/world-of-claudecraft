// Riding-lesson minigame ("mount training"), server-authoritative, a sibling
// system behind SimContext modeled directly on the lockpick session machine
// (delves/lockpick_controller.ts): engage (mount_train_begin), answer one cue
// per round (mount_train_answer), time a round out on the sim clock, and
// succeed or throw the rider. Unlike lockpick, the session lives directly on
// PlayerMeta.mountTraining (there is no shared per-object run to hang it off),
// so the per-tick timeout driver and the leave-path abandon both take a
// PlayerMeta directly rather than a DelveRun.
//
// The NPC (stablemaster_marla) and the quest (q_riding_lessons, one 'interact'
// objective keyed on the sentinel targetObjectItemId 'train_valorsteed', no
// real item/ground object) are content-slice data landing in parallel; this
// module only resolves them by id/string. On success it credits that objective
// directly (see creditRidingLessonObjective below) rather than reusing
// interactObjectForQuests (sim.ts) / quests/quest_credit.ts's interact path,
// which key off a live Entity.objectItemId — there is no such entity here, the
// "interact" happens inside this minigame. checkQuestReady is already on the
// seam, so no new SimContext callback was needed for quest credit.
//
// Determinism: every cue is drawn from a per-session seed (derived from
// ctx.tickCount, the deterministic sim clock, at mount_train_begin) fed
// through a fresh `new Rng(...)` sub-stream local to this module — never the
// shared ctx.rng — so installing this system does not perturb the shared draw
// order. `src/sim`-pure: no DOM/Three, no Math.random/Date.now/performance.now
// (enforced by tests/architecture.test.ts).

import type { MountTrainingView } from '../world_api';
import { QUESTS } from './data';
import { Rng } from './rng';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import {
  DT,
  dist2d,
  type Entity,
  INTERACT_RANGE,
  type MountTrainingSession,
  type TrainingLean,
} from './types';

// --- tuning (change numbers here, not inline) -------------------------------
export const MOUNT_TRAIN_MIN_LEVEL = 20;
export const MOUNT_TRAIN_FEE_COPPER = 10000; // 100 gold, charged once, ever
export const MOUNT_TRAIN_ROUNDS = 6;
export const MOUNT_TRAIN_MISS_CAP = 2; // the 2nd miss throws the rider
const WINDOW_START_MS = 2500;
const WINDOW_STEP_MS = 250;
const WINDOW_FLOOR_MS = 1200;

// The stablemaster NPC + her quest, resolved by id (content-slice data; this
// module never imports src/sim/content/* directly, matching the seam).
const STABLEMASTER_NPC_ID = 'stablemaster_marla';
export const RIDING_LESSONS_QUEST_ID = 'q_riding_lessons';
// Sentinel targetObjectItemId the quest's one 'interact' objective is keyed on.
// No ITEMS entry and no ground Entity ever carry this id: it exists purely so
// this module and the quest objective can agree on "the lesson was cleared"
// without a real interactable object.
export const TRAIN_SENTINEL_ITEM_ID = 'train_valorsteed';

const LEAN_OPTIONS: TrainingLean[] = ['left', 'right', 'steady'];

/** windowMs(round): 2500ms at round 1, -250ms per COMPLETED round, floored at
 *  1200ms. A miss re-draws the SAME round (see applyOutcome), so the window
 *  only shrinks on genuine progress (a cleared round), never on a retry. */
function windowMsForRound(round: number): number {
  const completedRounds = round - 1;
  return Math.max(WINDOW_FLOOR_MS, WINDOW_START_MS - completedRounds * WINDOW_STEP_MS);
}

/** Deterministic cue for one attempt: a fresh `new Rng(...)` sub-stream seeded
 *  from (seed, attemptIndex), so the whole session's cue sequence is
 *  reproducible from `seed` alone without holding a live Rng on the
 *  (plain, never-persisted) MountTrainingSession. attemptIndex is derived by
 *  the caller as (round - 1) + misses, which increases by exactly 1 on every
 *  answered/timed-out attempt (good or miss alike), so no extra counter field
 *  is needed on the session. */
function cueForAttempt(seed: number, attemptIndex: number): TrainingLean {
  const drawSeed = (seed ^ (attemptIndex * 0x85ebca6b)) >>> 0;
  return new Rng(drawSeed).pick(LEAN_OPTIONS);
}

function attemptIndexOf(session: MountTrainingSession): number {
  return session.round - 1 + session.misses;
}

/** (Re)arm the deadline for the session's CURRENT round, in sim ticks (so the
 *  timeout is reproducible from the input timing alone, identical offline, on
 *  the server, and headless — the lockpick armLockpickStep precedent). */
function armRound(ctx: SimContext, session: MountTrainingSession): void {
  const ms = windowMsForRound(session.round);
  session.deadlineTick = ctx.tickCount + Math.ceil(ms / (DT * 1000));
}

function findStablemaster(ctx: SimContext): Entity | null {
  for (const e of ctx.entities.values()) {
    if (e.kind === 'npc' && e.templateId === STABLEMASTER_NPC_ID) return e;
  }
  return null;
}

/** Credit the q_riding_lessons 'interact' objective (sentinel targetObjectItemId
 *  TRAIN_SENTINEL_ITEM_ID) on SUCCESS, mirroring interactObjectForQuests's own
 *  body (sim.ts) but keyed on the sentinel instead of a live Entity.objectItemId
 *  (there is no ground object here). Least-invasive: no new SimContext callback,
 *  checkQuestReady is already on the seam. Turn-in at Marla (the existing
 *  quest-commands turn-in path) grants reins_valorsteed from there; this never
 *  grants the item directly. */
function creditRidingLessonObjective(ctx: SimContext, meta: PlayerMeta): void {
  for (const qp of meta.questLog.values()) {
    if (qp.state !== 'active') continue;
    const quest = QUESTS[qp.questId];
    quest.objectives.forEach((objective, i) => {
      if (objective.type !== 'interact' || objective.targetObjectItemId !== TRAIN_SENTINEL_ITEM_ID)
        return;
      if (qp.counts[i] >= objective.count) return;
      qp.counts[i]++;
      meta.counters.questProgress++;
      ctx.emit({
        type: 'questProgress',
        questId: qp.questId,
        text: `${objective.label}: ${qp.counts[i]}/${objective.count}`,
        pid: meta.entityId,
      });
      ctx.checkQuestReady(qp, meta);
    });
  }
}

/** Start a riding lesson. Refuses (via ctx.error) unless alive, level 20+,
 *  standing at the stablemaster, actively on q_riding_lessons with its
 *  objective not yet complete, and no session already IN_PROGRESS; charges the
 *  one-time 100g fee on the first-ever successful begin (retries after a
 *  throw are free: the fee stays paid). */
export function mountTrainBegin(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const { meta, e } = r;
  if (e.dead) {
    ctx.error(meta.entityId, "You can't do that while dead.");
    return;
  }
  if (e.level < MOUNT_TRAIN_MIN_LEVEL) {
    ctx.error(meta.entityId, 'You must be level 20 to take riding lessons.');
    return;
  }
  const marla = findStablemaster(ctx);
  if (!marla || dist2d(e.pos, marla.pos) > INTERACT_RANGE + 2) {
    ctx.error(meta.entityId, 'Too far away.');
    return;
  }
  const qp = meta.questLog.get(RIDING_LESSONS_QUEST_ID);
  if (!qp || qp.state !== 'active') {
    ctx.error(meta.entityId, 'You need to accept the riding lesson quest first.');
    return;
  }
  if (meta.mountTraining?.state === 'IN_PROGRESS') {
    ctx.error(meta.entityId, 'A riding lesson is already in progress.');
    return;
  }
  if (!meta.mountTrainingFeePaid) {
    if (meta.copper < MOUNT_TRAIN_FEE_COPPER) {
      ctx.error(meta.entityId, 'Not enough money.');
      return;
    }
    meta.copper -= MOUNT_TRAIN_FEE_COPPER;
    meta.mountTrainingFeePaid = true;
  }
  // Seed derived from the deterministic sim clock (ctx.tickCount) plus the
  // acting player's entity id as per-session salt (the lockpick baseSeed =
  // run.seed ^ objectId*0x9e3779b1 precedent), drawn through the sub-stream
  // above (cueForAttempt), never the shared ctx.rng.
  const seed = (ctx.tickCount ^ (meta.entityId * 0x9e3779b1)) >>> 0;
  const session: MountTrainingSession = {
    sessionId: `mt_${meta.entityId}_${ctx.tickCount}`,
    ownerId: meta.entityId,
    round: 1,
    roundsTotal: MOUNT_TRAIN_ROUNDS,
    misses: 0,
    missCap: MOUNT_TRAIN_MISS_CAP,
    cue: cueForAttempt(seed, 0),
    seed,
    deadlineTick: 0, // set by armRound below
    state: 'IN_PROGRESS',
  };
  meta.mountTraining = session;
  armRound(ctx, session);
  ctx.emit({
    type: 'mountTrainSession',
    sessionId: session.sessionId,
    round: session.round,
    roundsTotal: session.roundsTotal,
    misses: session.misses,
    missCap: session.missCap,
    cue: session.cue,
    windowMs: windowMsForRound(session.round),
    pid: meta.entityId,
  });
}

/** Submit one lean for the active round. Good (lean matches the cue) advances
 *  the round; roundsTotal cleared rounds means success. A wrong answer counts a
 *  miss (like a timeout); missCap misses throws the rider. Either way, a
 *  non-terminal outcome redraws the next cue and re-arms the deadline. */
export function mountTrainAnswer(ctx: SimContext, lean: TrainingLean, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const { meta } = r;
  const session = meta.mountTraining;
  if (!session || session.state !== 'IN_PROGRESS') {
    ctx.error(meta.entityId, 'No riding lesson in progress.');
    return;
  }
  applyOutcome(ctx, meta, session, lean === session.cue ? 'good' : 'miss');
}

/** Server-authoritative per-round clock, run every tick for every live player
 *  (mirrors tickLockpickTimeout's shape). When the active round's deadline
 *  passes it counts as a miss; the client never reports a timeout. */
export function tickMountTrainingTimeout(ctx: SimContext, meta: PlayerMeta): void {
  const session = meta.mountTraining;
  if (session?.state !== 'IN_PROGRESS') return;
  if (ctx.tickCount >= session.deadlineTick) applyOutcome(ctx, meta, session, 'miss');
}

function applyOutcome(
  ctx: SimContext,
  meta: PlayerMeta,
  session: MountTrainingSession,
  result: 'good' | 'miss',
): void {
  if (result === 'good') {
    session.round += 1;
    if (session.round > session.roundsTotal) {
      succeed(ctx, meta, session);
      return;
    }
  } else {
    session.misses += 1;
    if (session.misses >= session.missCap) {
      throwRider(ctx, meta, session);
      return;
    }
  }
  session.cue = cueForAttempt(session.seed, attemptIndexOf(session));
  armRound(ctx, session);
  ctx.emit({
    type: 'mountTrainRound',
    sessionId: session.sessionId,
    round: session.round,
    roundsTotal: session.roundsTotal,
    misses: session.misses,
    missCap: session.missCap,
    result,
    cue: session.cue,
    windowMs: windowMsForRound(session.round),
    pid: session.ownerId,
  });
}

function succeed(ctx: SimContext, meta: PlayerMeta, session: MountTrainingSession): void {
  session.state = 'SUCCESS';
  creditRidingLessonObjective(ctx, meta);
  ctx.emit({
    type: 'mountTrainEnd',
    sessionId: session.sessionId,
    outcome: 'success',
    pid: session.ownerId,
  });
  meta.mountTraining = null;
}

function throwRider(ctx: SimContext, meta: PlayerMeta, session: MountTrainingSession): void {
  session.state = 'THROWN';
  ctx.emit({
    type: 'mountTrainEnd',
    sessionId: session.sessionId,
    outcome: 'thrown',
    pid: session.ownerId,
  });
  meta.mountTraining = null;
}

/** Tear down an active riding-lesson session, preserving the fee (paid stays
 *  paid). Shared by the player-initiated abort and the leave/disconnect path. */
export function abandonMountTraining(ctx: SimContext, meta: PlayerMeta): void {
  const session = meta.mountTraining;
  if (session?.state !== 'IN_PROGRESS') return;
  session.state = 'ABANDONED';
  meta.mountTraining = null;
  ctx.emit({
    type: 'mountTrainEnd',
    sessionId: session.sessionId,
    outcome: 'abandoned',
    pid: session.ownerId,
  });
}

/** Player-initiated abort (mount_train_abort): resolves the acting pid, then
 *  shares abandonMountTraining's body with the leave-path caller. */
export function mountTrainAbort(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  abandonMountTraining(ctx, r.meta);
}

/** Read-only projection of the active riding lesson for IWorld (offline). */
export function mountTrainingViewFor(ctx: SimContext, pid?: number): MountTrainingView | null {
  const r = ctx.resolve(pid);
  if (!r) return null;
  const s = r.meta.mountTraining;
  if (s?.state !== 'IN_PROGRESS') return null;
  return {
    sessionId: s.sessionId,
    round: s.round,
    roundsTotal: s.roundsTotal,
    misses: s.misses,
    missCap: s.missCap,
    cue: s.cue,
    windowMs: windowMsForRound(s.round),
  };
}
