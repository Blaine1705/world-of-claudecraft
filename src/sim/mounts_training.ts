// Riding-lesson minigame ("mount training"), server-authoritative, a sibling
// system behind SimContext. The lesson is a ridden equestrian course: the player
// begins at Stablemaster Marla, mounts a training Valorsteed by pressing the
// Mount/Dismount hotkey (deliberately a tutorial for the Z keybind), then rides one
// lap through the flagged gates of RIDING_COURSE in order inside the fenced paddock.
// Clearing the last gate credits the quest objective; turning in q_riding_lessons at
// Marla grants reins_valorsteed as before.
//
// The session lives directly on PlayerMeta.mountTraining (there is no shared
// per-object run to hang it off), so the per-tick driver and the leave-path abandon
// both take a PlayerMeta directly. The NPC (stablemaster_marla) and the quest
// (q_riding_lessons, one 'interact' objective keyed on the sentinel
// targetObjectItemId 'train_valorsteed') are content-slice data; this module only
// resolves them by id/string. On success it credits that objective directly (see
// creditRidingLessonObjective) rather than reusing interactObjectForQuests, which
// keys off a live Entity.objectItemId (there is no such entity here).
//
// Determinism: the course is a STATIC shape (RIDING_COURSE, the single source of
// truth in content/mounts.ts), so this system draws NO rng at all and perturbs no
// draw order. `src/sim`-pure: no DOM/Three, no Math.random/Date.now/performance.now
// (enforced by tests/architecture.test.ts).

import type { MountTrainingView } from '../world_api';
import { RIDING_COURSE, TRAINING_MOUNT_KEY } from './content/mounts';
import { QUESTS } from './data';
import { forceDismount } from './mounts';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { dist2d, type Entity, INTERACT_RANGE, type MountTrainingSession } from './types';

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

// Player notices (English at the emit site; localized client-side by sim_i18n's
// EXACT matcher, S3-guarded). Placeholder-free, so they auto-register.
const NOTICE_SUCCESS = "Marla takes the Valorsteed's reins. Well ridden.";
const NOTICE_THROWN = 'The Valorsteed throws you. Marla waves you back to try again.';
const NOTICE_LEFT_YARD =
  'You leave the paddock and the lesson ends. Come back to Marla to try again.';

function findStablemaster(ctx: SimContext): Entity | null {
  for (const e of ctx.entities.values()) {
    if (e.kind === 'npc' && e.templateId === STABLEMASTER_NPC_ID) return e;
  }
  return null;
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
    gate: 0,
    state: 'IN_PROGRESS',
  };
  meta.mountTraining = session;
  ctx.emit({
    type: 'mountTrainSession',
    sessionId: session.sessionId,
    phase: session.phase,
    pid: meta.entityId,
  });
}

/** Server-authoritative per-tick driver, run every tick for every live player
 *  (called from the same per-player tick site as the old timeout driver). Advances
 *  the mount -> ride phase flip and the gated ride, and ends the lesson on death,
 *  a lost steed, or straying out of the paddock. Draws no rng. */
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
  // Straying out of the paddock (either phase) abandons the lesson. The course
  // points are {x,z} (no y), so measure the ground-plane distance directly.
  const { center, gateRadius, boundsRadius, gates } = RIDING_COURSE;
  if (Math.hypot(e.pos.x - center.x, e.pos.z - center.z) > boundsRadius) {
    ctx.notice(meta.entityId, NOTICE_LEFT_YARD);
    abandonMountTraining(ctx, meta);
    return;
  }

  if (session.phase === 'mount') {
    // The player climbed aboard the training steed (the Z-keybind tutorial): begin
    // the ride and re-emit the session so the client rebuilds the view for phase 2.
    if (e.mountKey === TRAINING_MOUNT_KEY) {
      session.phase = 'ride';
      session.gate = 0;
      ctx.emit({
        type: 'mountTrainSession',
        sessionId: session.sessionId,
        phase: 'ride',
        pid: session.ownerId,
      });
    }
    return;
  }

  // phase 'ride': losing the steed (dismounted by Z, water, or anything) throws.
  if (e.mountKey !== TRAINING_MOUNT_KEY) {
    throwRider(ctx, meta, session, e);
    return;
  }
  // Clear the next gate when the rider passes near it, strictly in order (standing
  // at a later gate while an earlier one is still next does nothing).
  const next = gates[session.gate];
  if (next && Math.hypot(e.pos.x - next.x, e.pos.z - next.z) <= gateRadius) {
    session.gate += 1;
    ctx.emit({
      type: 'mountTrainGate',
      sessionId: session.sessionId,
      gate: session.gate,
      gatesTotal: gates.length,
      pid: session.ownerId,
    });
    if (session.gate >= gates.length) succeed(ctx, meta, session, e);
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

/** Read-only projection of the active riding lesson for IWorld (offline). nextGate
 *  is the world position of the gate to ride to (null in phase 'mount' and after the
 *  last gate); the client derives the same from RIDING_COURSE + gate index. */
export function mountTrainingViewFor(ctx: SimContext, pid?: number): MountTrainingView | null {
  const r = ctx.resolve(pid);
  if (!r) return null;
  const s = r.meta.mountTraining;
  if (s?.state !== 'IN_PROGRESS') return null;
  const gates = RIDING_COURSE.gates;
  const next = s.phase === 'ride' && s.gate < gates.length ? gates[s.gate] : null;
  return {
    sessionId: s.sessionId,
    phase: s.phase,
    gate: s.gate,
    gatesTotal: gates.length,
    nextGate: next ? { x: next.x, z: next.z } : null,
  };
}
