// The riding lesson ("mount training"), server-authoritative, a sibling system
// behind SimContext. The lesson is the Mount/Dismount keybind tutorial gating the
// first mount: the player begins at Stablemaster Marla (paying the one-time 100g
// fee), then climbs onto a training Valorsteed by pressing the Mount/Dismount
// hotkey. Being in the saddle IS the lesson: it credits the quest objective at
// once, Marla takes the steed back (an instant force-dismount; the player never
// keeps the unowned mount), and turning in q_riding_lessons at her grants
// reins_valorsteed.
//
// The session lives directly on PlayerMeta.mountTraining. The NPC
// (stablemaster_marla) and the quest (q_riding_lessons, one 'interact' objective
// keyed on the sentinel targetObjectItemId 'train_valorsteed') are content-slice
// data; this module resolves them by id/string. On success it credits that
// objective directly (see creditRidingLessonObjective) rather than reusing
// interactObjectForQuests, which keys off a live Entity.objectItemId (there is no
// such entity here).
//
// Determinism: the lesson is driven off live player state only, so this system
// draws NO rng and perturbs no draw order. `src/sim`-pure: no DOM/Three, no
// Math.random/Date.now/performance.now (enforced by tests/architecture.test.ts).

import { TRAINING_MOUNT_KEY } from './content/mounts';
import { QUESTS } from './data';
import { forceDismount } from './mounts';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { dist2d, type Entity, INTERACT_RANGE, type MountTrainingSession } from './types';

// --- tuning (change numbers here, not inline) -------------------------------
export const MOUNT_TRAIN_MIN_LEVEL = 20;
export const MOUNT_TRAIN_FEE_COPPER = 10000; // 100 gold, charged once, ever
/** Distance from Marla beyond which an in-progress lesson counts as abandoned. */
export const MOUNT_TRAIN_LEAVE_RADIUS = 50;

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
 *  first-ever successful begin (later attempts are free: the fee stays paid). The
 *  player then climbs aboard with the Mount/Dismount hotkey. */
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
    anchor: { x: marla.pos.x, z: marla.pos.z },
    state: 'IN_PROGRESS',
  };
  meta.mountTraining = session;
  ctx.emit({
    type: 'mountTrainSession',
    sessionId: session.sessionId,
    pid: meta.entityId,
  });
}

/** Server-authoritative per-tick driver, run every tick for every player. Succeeds
 *  the lesson the moment the player is in the training steed's saddle, and ends it
 *  on death or on straying from Marla's yard. Draws no rng. */
export function tickMountTraining(ctx: SimContext, meta: PlayerMeta): void {
  const session = meta.mountTraining;
  if (session?.state !== 'IN_PROGRESS') return;
  const e = ctx.entities.get(meta.entityId);
  if (!e) return;

  // Death ends the lesson (handleDeath already force-dismounted any steed). The
  // quest stays active, so the player just begins again at Marla, fee still paid.
  if (e.dead) {
    abandonMountTraining(ctx, meta);
    return;
  }
  // Straying from the stablemaster's yard abandons. The anchor is Marla's
  // position captured at begin (she never moves), so this draws no entity scan.
  if (
    Math.hypot(e.pos.x - session.anchor.x, e.pos.z - session.anchor.z) > MOUNT_TRAIN_LEAVE_RADIUS
  ) {
    ctx.notice(meta.entityId, NOTICE_LEFT_YARD);
    abandonMountTraining(ctx, meta);
    return;
  }

  // In the saddle: the lesson is passed (the whole point was pressing the
  // Mount/Dismount key). Credit the quest objective and hand the steed back.
  if (e.mountKey === TRAINING_MOUNT_KEY) succeed(ctx, meta, session, e);
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

/** Tear down an active riding-lesson session, preserving the fee (paid stays paid)
 *  and force-dismounting the unowned training steed if the player is riding it (or
 *  mid-summon). Shared by the wire abort, the leave/disconnect path, and the
 *  death/strayed driver branches. */
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

/** Wire-initiated abort (the append-only mount_train_abort command): resolves the
 *  acting pid, then shares abandonMountTraining's body with the leave-path caller. */
export function mountTrainAbort(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  abandonMountTraining(ctx, r.meta);
}
