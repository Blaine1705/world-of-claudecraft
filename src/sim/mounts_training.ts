// Riding-lesson minigame ("mount training"), server-authoritative, a sibling
// system behind SimContext. The lesson is a TIMED SHOW-JUMPING course: the player
// begins at Stablemaster Marla, mounts a training Valorsteed by pressing the
// Mount/Dismount hotkey (deliberately a tutorial for the Z keybind), rides down into
// the fenced course arena, which arms a countdown, then jumps the obstacles of
// RIDING_COURSE in order before the timer expires. Clearing the last jump in time
// credits the quest objective; turning in q_riding_lessons at Marla grants
// reins_valorsteed as before.
//
// The session lives directly on PlayerMeta.mountTraining and moves through three
// phases: 'mount' (begun, not on the steed) -> 'staging' (mounted, timer not running)
// -> 'course' (timer running). The NPC (stablemaster_marla) and the quest
// (q_riding_lessons, one 'interact' objective keyed on the sentinel targetObjectItemId
// 'train_valorsteed') are content-slice data; this module resolves them by id/string.
// On success it credits that objective directly (see creditRidingLessonObjective)
// rather than reusing interactObjectForQuests, which keys off a live
// Entity.objectItemId (there is no such entity here).
//
// Determinism: the course is a STATIC shape (RIDING_COURSE, the single source of
// truth in content/mounts.ts) and the timer is driven off the deterministic sim clock
// (ctx.tickCount), so this system draws NO rng and perturbs no draw order.
// `src/sim`-pure: no DOM/Three, no Math.random/Date.now/performance.now (enforced by
// tests/architecture.test.ts).

import type { MountTrainingView } from '../world_api';
import { RIDING_COURSE, TRAINING_MOUNT_KEY } from './content/mounts';
import { QUESTS } from './data';
import { forceDismount } from './mounts';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { dist2d, type Entity, INTERACT_RANGE, type MountTrainingSession, TICK_RATE } from './types';

// --- tuning (change numbers here, not inline) -------------------------------
export const MOUNT_TRAIN_MIN_LEVEL = 20;
export const MOUNT_TRAIN_FEE_COPPER = 10000; // 100 gold, charged once, ever

// The stablemaster NPC + her quest, resolved by id (content-slice data; this
// module never imports src/sim/content/* records directly, matching the seam).
const STABLEMASTER_NPC_ID = 'stablemaster_marla';
export const RIDING_LESSONS_QUEST_ID = 'q_riding_lessons';
// Sentinel targetObjectItemId the quest's one 'interact' objective is keyed on.
// No ITEMS entry and no ground Entity ever carry this id: it exists purely so this
// module and the quest objective can agree on "the lesson was cleared" without a
// real interactable object.
export const TRAIN_SENTINEL_ITEM_ID = 'train_valorsteed';

/** The countdown budget in sim ticks (the run deadline is `tickCount + this`). */
export const MOUNT_TRAIN_TIME_LIMIT_TICKS = Math.round(RIDING_COURSE.timeLimitSeconds * TICK_RATE);

// Player notices (English at the emit site; localized client-side by sim_i18n's
// EXACT matcher, S3-guarded). Placeholder-free, so they auto-register.
const NOTICE_SUCCESS = "Marla takes the Valorsteed's reins. Well ridden.";
const NOTICE_THROWN = 'The Valorsteed throws you. Marla waves you back to try again.';
const NOTICE_LEFT_YARD =
  'You leave the paddock and the lesson ends. Come back to Marla to try again.';
const NOTICE_TOO_SLOW = 'Too slow. Ride out of the course and try again.';

function findStablemaster(ctx: SimContext): Entity | null {
  for (const e of ctx.entities.values()) {
    if (e.kind === 'npc' && e.templateId === STABLEMASTER_NPC_ID) return e;
  }
  return null;
}

/** Whether the entity is inside the south course arena (RIDING_COURSE.courseSection).
 *  A mounted player crossing from outside to inside this arms the timer. */
function insideCourseSection(e: Entity): boolean {
  const c = RIDING_COURSE.courseSection;
  return e.pos.x >= c.x1 && e.pos.x <= c.x2 && e.pos.z >= c.z1 && e.pos.z <= c.z2;
}

/** Credit the q_riding_lessons 'interact' objective (sentinel targetObjectItemId
 *  TRAIN_SENTINEL_ITEM_ID) on SUCCESS, mirroring interactObjectForQuests's own body
 *  (sim.ts) but keyed on the sentinel instead of a live Entity.objectItemId (there is
 *  no ground object here). Least-invasive: no new SimContext callback,
 *  checkQuestReady is already on the seam. Turn-in at Marla (the existing
 *  quest-commands turn-in path) grants reins_valorsteed from there; this never grants
 *  the item directly. */
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

/** Start a riding lesson. Refuses (via ctx.error) unless alive, level 20+, standing
 *  at the stablemaster, actively on q_riding_lessons with its objective not yet
 *  complete, and no session already IN_PROGRESS; charges the one-time 100g fee on the
 *  first-ever successful begin (retries after a throw are free: the fee stays paid).
 *  The lesson starts in phase 'mount': the player next climbs aboard with the
 *  Mount/Dismount hotkey. */
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
  const session: MountTrainingSession = {
    sessionId: `mt_${meta.entityId}_${ctx.tickCount}`,
    ownerId: meta.entityId,
    phase: 'mount',
    jump: 0,
    deadlineTick: 0,
    insideCourse: false,
    state: 'IN_PROGRESS',
  };
  meta.mountTraining = session;
  ctx.emit({
    type: 'mountTrainSession',
    sessionId: session.sessionId,
    phase: 'mount',
    pid: meta.entityId,
  });
}

/** Server-authoritative per-tick driver, run every tick for every player (called from
 *  the same per-player tick site as the old driver). Advances the mount -> staging ->
 *  course flow and the timed jumping, and ends the lesson on death, a lost steed, or
 *  straying out of the paddock. Draws no rng. */
export function tickMountTraining(ctx: SimContext, meta: PlayerMeta): void {
  const session = meta.mountTraining;
  if (session?.state !== 'IN_PROGRESS') return;
  const e = ctx.entities.get(meta.entityId);
  if (!e) return;

  // Death ends the lesson as a throw (handleDeath already force-dismounted the
  // steed, so throwRider's force-dismount is a no-op here).
  if (e.dead) {
    throwRider(ctx, meta, session, e);
    return;
  }
  // Straying beyond boundsRadius from the course centre (any phase) abandons. The
  // course points are {x,z} (no y), so measure the ground-plane distance directly.
  const { center, boundsRadius, jumpRadius, jumps } = RIDING_COURSE;
  if (Math.hypot(e.pos.x - center.x, e.pos.z - center.z) > boundsRadius) {
    ctx.notice(meta.entityId, NOTICE_LEFT_YARD);
    abandonMountTraining(ctx, meta);
    return;
  }

  if (session.phase === 'mount') {
    // The player climbed aboard the training steed (the Z-keybind tutorial): move to
    // staging and seed the course edge-detect (they mount up north, outside the arena).
    if (e.mountKey === TRAINING_MOUNT_KEY) {
      session.phase = 'staging';
      session.insideCourse = insideCourseSection(e);
      ctx.emit({
        type: 'mountTrainSession',
        sessionId: session.sessionId,
        phase: 'staging',
        pid: session.ownerId,
      });
    }
    return;
  }

  // staging or course: losing the steed (dismounted by Z, water, or anything) throws.
  if (e.mountKey !== TRAINING_MOUNT_KEY) {
    throwRider(ctx, meta, session, e);
    return;
  }

  const inside = insideCourseSection(e);

  if (session.phase === 'staging') {
    // Arm the timer on a fresh outside -> inside transition into the course arena.
    if (inside && !session.insideCourse) {
      session.phase = 'course';
      session.jump = 0;
      session.deadlineTick = ctx.tickCount + MOUNT_TRAIN_TIME_LIMIT_TICKS;
      ctx.emit({
        type: 'mountTrainRunStart',
        sessionId: session.sessionId,
        timeLimitTicks: MOUNT_TRAIN_TIME_LIMIT_TICKS,
        pid: session.ownerId,
      });
    }
    session.insideCourse = inside;
    return;
  }

  // phase 'course'.
  session.insideCourse = inside;
  // Timeout: soft reset to staging (jump progress cleared). The next run arms only on
  // a FRESH outside -> inside transition; insideCourse stays as-is (true, since they
  // are in the arena), so standing here does not instantly re-arm.
  if (ctx.tickCount >= session.deadlineTick) {
    session.phase = 'staging';
    session.jump = 0;
    session.deadlineTick = 0;
    ctx.notice(meta.entityId, NOTICE_TOO_SLOW);
    ctx.emit({
      type: 'mountTrainSession',
      sessionId: session.sessionId,
      phase: 'staging',
      pid: session.ownerId,
    });
    return;
  }
  // Jump advance: the rider must be AIRBORNE from a deliberate jump (Entity.jumping,
  // set by the shared player_motion kernel before this driver runs) within jumpRadius
  // of the next jump, in order (a grounded pass-through does nothing).
  const next = jumps[session.jump];
  if (next && e.jumping && Math.hypot(e.pos.x - next.x, e.pos.z - next.z) <= jumpRadius) {
    session.jump += 1;
    ctx.emit({
      type: 'mountTrainJump',
      sessionId: session.sessionId,
      jump: session.jump,
      jumpsTotal: jumps.length,
      pid: session.ownerId,
    });
    if (session.jump >= jumps.length) succeed(ctx, meta, session, e);
  }
}

function succeed(
  ctx: SimContext,
  meta: PlayerMeta,
  session: MountTrainingSession,
  e: Entity,
): void {
  session.state = 'SUCCESS';
  creditRidingLessonObjective(ctx, meta);
  // The player does not own the training steed, so take it back instantly (no
  // put-away channel) rather than leaving them riding an unowned mount.
  forceDismount(ctx, e);
  ctx.notice(meta.entityId, NOTICE_SUCCESS);
  ctx.emit({
    type: 'mountTrainEnd',
    sessionId: session.sessionId,
    outcome: 'success',
    pid: session.ownerId,
  });
  meta.mountTraining = null;
}

function throwRider(
  ctx: SimContext,
  meta: PlayerMeta,
  session: MountTrainingSession,
  e: Entity,
): void {
  session.state = 'THROWN';
  forceDismount(ctx, e); // a no-op when the throw was itself a dismount/death
  ctx.notice(meta.entityId, NOTICE_THROWN);
  ctx.emit({
    type: 'mountTrainEnd',
    sessionId: session.sessionId,
    outcome: 'thrown',
    pid: session.ownerId,
  });
  meta.mountTraining = null;
}

/** Tear down an active riding-lesson session, preserving the fee (paid stays paid)
 *  and force-dismounting the unowned training steed if the player is still riding it.
 *  Shared by the player-initiated abort, the leave/disconnect path, and the
 *  strayed-out-of-the-paddock driver branch. */
export function abandonMountTraining(ctx: SimContext, meta: PlayerMeta): void {
  const session = meta.mountTraining;
  if (session?.state !== 'IN_PROGRESS') return;
  session.state = 'ABANDONED';
  const e = ctx.entities.get(meta.entityId);
  if (e) forceDismount(ctx, e);
  ctx.emit({
    type: 'mountTrainEnd',
    sessionId: session.sessionId,
    outcome: 'abandoned',
    pid: session.ownerId,
  });
  meta.mountTraining = null;
}

/** Player-initiated abort (mount_train_abort): resolves the acting pid, then shares
 *  abandonMountTraining's body with the leave-path caller. */
export function mountTrainAbort(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  abandonMountTraining(ctx, r.meta);
}

/** Read-only projection of the active riding lesson for IWorld (offline). nextJump is
 *  the world position of the jump to clear (null outside phase 'course' and after the
 *  last jump); ticksLeft is the authoritative remaining countdown. The client derives
 *  the same nextJump from RIDING_COURSE by index and mirrors ticksLeft from the
 *  run-start event. */
export function mountTrainingViewFor(ctx: SimContext, pid?: number): MountTrainingView | null {
  const r = ctx.resolve(pid);
  if (!r) return null;
  const s = r.meta.mountTraining;
  if (s?.state !== 'IN_PROGRESS') return null;
  const jumps = RIDING_COURSE.jumps;
  const onCourse = s.phase === 'course';
  const next = onCourse && s.jump < jumps.length ? jumps[s.jump] : null;
  return {
    sessionId: s.sessionId,
    phase: s.phase,
    jump: s.jump,
    jumpsTotal: jumps.length,
    nextJump: next ? { x: next.x, z: next.z } : null,
    ticksLeft: onCourse ? Math.max(0, s.deadlineTick - ctx.tickCount) : null,
    timeLimitTicks: MOUNT_TRAIN_TIME_LIMIT_TICKS,
  };
}
