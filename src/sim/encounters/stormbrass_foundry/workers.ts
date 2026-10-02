// The Stormbrass Foundry's chained workers (content/stormbrass_foundry_workers.ts):
// per run, three scrap camps whose miners and haulers work in chains under a
// nearby pack. Ticked once per claim from tickFoundryEncounters (index.ts).
//
//   guarded    the camp's pack (FoundryWorkerCamp.guardPack) still stands: the
//              miners swing at the seam, the hauler walks heap to cart and
//              back; talking to one is refused ("not while the guards watch").
//   unguarded  every guard is dead: a worker calls out, and "Free them" (the
//              gossip's button: target the worker, then the interact press,
//              interaction.ts interact) strikes the chains.
//   freed      the workers become Freed Laborers: they cheer, walk off toward
//              the lift, and vanish a few seconds later. Every quest holder in
//              the run is credited; the third camp earns the run the deed.
//
// The workers are mob-kind bodies held inert by `encounterHeld` (the mob AI
// keeps them non-hostile, out of combat and off every hate table), carried on
// the claim's NON-combat roster (inst.npcIds, which the claim's free drops and
// nothing else walks), never inst.mobIds: no pack pull, gate, chain pull, clear
// or loot rule ever counts them. The camp's state object (one per camp, at its
// chain post, on inst.objectIds) holds the run state and mirrors the phase in
// its template id, so the online client reads the camp (the gossip, the
// chains) with no wire or IWorld change. Spawned the first tick a claim is
// live, so a reset (a fresh claim) restores every camp. Zero rng: every pick
// is roster ordered.

import {
  FOUNDRY_WORKER_CAMP_TEMPLATES,
  FOUNDRY_WORKER_CAMPS,
  FOUNDRY_WORKER_TEMPLATES,
  FOUNDRY_WORKERS_DEED,
  FOUNDRY_WORKERS_QUEST_ID,
  type FoundryWorkerCamp,
  foundryWorkerCampPhaseOf,
  isFoundryWorkerTemplate,
} from '../../content/stormbrass_foundry_workers';
import { MOBS, QUESTS } from '../../data';
import { createMob } from '../../entity';
import { emitMobYell } from '../../mob/yells';
import { emitQuestProgress } from '../../quests/quest_credit';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { clearThreat } from '../../threat';
import {
  angleTo,
  DT,
  type Entity,
  type FoundryWorkerCampState,
  questObjectiveRequired,
} from '../../types';
import { dropEncounterObject, grantClaimDeed, spawnFoundryObject } from './claim';
import { FOUNDRY_DUNGEON } from './ids';

/** The workers' lines (re-localized by src/ui/sim_i18n.ts). */
export const FOUNDRY_WORKER_LINES = {
  /** The interact press while the guards stand (an error toast). */
  guarded: 'The guards are still watching. Deal with them first.',
  /** A worker calls out the moment the camp's guards fall. */
  unguarded: 'The guards are down! Friend, strike these chains, please!',
  /** A worker as the chains come off. */
  freed: 'Free! We are free! To the lift, all of you!',
} as const;

/** The chains come off: seconds of cheering before the walk. */
export const FREED_CHEER_SECONDS = 3;
/** From the strike to the vanish (the cheer, then the walk toward the lift). */
export const FREED_LEAVE_SECONDS = 10;
/** A laden hauler's pace, and a freed laborer's. */
const HAUL_SPEED = 2.2;
const WALK_SPEED = 3.2;
/** Seconds a hauler stands at each end of its loop (tipping the load into
 *  the cart, then loading again at the heap). */
const REST_AT_CART = 1.4;
const REST_AT_HEAP = 1.8;
/** A worker's bark carries across its camp and the pack beside it. */
const BARK_RANGE = 45;
/** Never shown: the camp object is an empty encounter anchor (no plate, no
 *  tooltip, never interactable), so the name is a debugging label only. */
const CAMP_OBJECT_NAME = 'Worker Camp';
/** Work-worn cloth and leather: each worker takes the next tint, so a camp
 *  reads as people rather than copies (render tints the body by Entity.color). */
const WORKER_TINTS = [0xb5562e, 0x3f68a8, 0xc8a23a, 0x7a4a8a, 0x8f9499] as const;

const CAMP_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  Object.values(FOUNDRY_WORKER_CAMP_TEMPLATES),
);

/** The claim's camp state objects, in camp order (A, B, C). */
export function foundryWorkerCampObjects(ctx: SimContext, inst: InstanceSlot): Entity[] {
  const out: Entity[] = [];
  for (const id of inst.objectIds) {
    const e = ctx.entities.get(id);
    if (e?.foundryWorkerCamp && CAMP_TEMPLATE_IDS.has(e.templateId)) out.push(e);
  }
  return out;
}

function campDef(state: FoundryWorkerCampState): FoundryWorkerCamp {
  const def = FOUNDRY_WORKER_CAMPS.find((c) => c.id === state.camp);
  if (!def) throw new Error(`unknown foundry worker camp ${state.camp}`);
  return def;
}

/** Hold a worker inert: never hostile, never in combat, on no hate table. */
function holdInert(w: Entity): void {
  w.hostile = false;
  w.inCombat = false;
  w.aiState = 'idle';
  w.aggroTargetId = null;
  clearThreat(w);
}

function spawnCamp(ctx: SimContext, inst: InstanceSlot, camp: FoundryWorkerCamp): Entity {
  const o = ctx.instanceOriginOf(inst);
  const obj = spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_WORKER_CAMP_TEMPLATES.guarded,
    CAMP_OBJECT_NAME,
    o.x + camp.post.x,
    o.z + camp.post.z,
    1,
  );
  // Never interactable (the per-entity tick would flip a spent object back to
  // lootable): the workers are what a player talks to, not the post.
  obj.respawnTimer = Number.POSITIVE_INFINITY;
  const state: FoundryWorkerCampState = {
    camp: camp.id,
    phase: 'guarded',
    workerIds: [],
    freedAt: 0,
    haul: {},
  };
  obj.foundryWorkerCamp = state;
  const campIndex = FOUNDRY_WORKER_CAMPS.indexOf(camp);
  camp.workers.forEach((spot, i) => {
    const template = MOBS[FOUNDRY_WORKER_TEMPLATES[spot.role]];
    const w = createMob(
      ctx.nextId++,
      template,
      template.minLevel,
      ctx.groundPos(o.x + spot.x, o.z + spot.z),
    );
    w.dungeonId = FOUNDRY_DUNGEON;
    w.color = WORKER_TINTS[(campIndex * 2 + i) % WORKER_TINTS.length];
    w.facing = spot.facing;
    w.prevFacing = spot.facing;
    w.spawnPos = { ...w.pos };
    w.idleStationary = true;
    w.encounterHeld = true;
    holdInert(w);
    ctx.addEntity(w);
    inst.npcIds.push(w.id);
    state.workerIds.push(w.id);
    if (spot.role === 'hauler') state.haul[w.id] = { leg: 0, rest: REST_AT_HEAP };
  });
  return obj;
}

/** The claim's camps, spawned the first time the claim is seen. */
function ensureCamps(ctx: SimContext, inst: InstanceSlot): Entity[] {
  const camps = foundryWorkerCampObjects(ctx, inst);
  if (camps.length > 0) return camps;
  return FOUNDRY_WORKER_CAMPS.map((camp) => spawnCamp(ctx, inst, camp));
}

/** Does any of the camp's guard pack still stand in this claim? */
function guardsStand(ctx: SimContext, inst: InstanceSlot, camp: FoundryWorkerCamp): boolean {
  const key = `${inst.dungeonId}:${inst.slot}:${camp.guardPack}`;
  for (const id of inst.mobIds) {
    const e = ctx.entities.get(id);
    if (e && !e.dead && e.dungeonPackId === key) return true;
  }
  return false;
}

function setPhase(obj: Entity, phase: FoundryWorkerCampState['phase']): void {
  const state = obj.foundryWorkerCamp;
  if (!state) return;
  state.phase = phase;
  obj.templateId = FOUNDRY_WORKER_CAMP_TEMPLATES[phase];
}

function liveWorkers(ctx: SimContext, state: FoundryWorkerCampState): Entity[] {
  const out: Entity[] = [];
  for (const id of state.workerIds) {
    const w = ctx.entities.get(id);
    // Nothing a player does can hurt one; a body killed some other way (a dev
    // command, a scripted sweep) is left where it fell.
    if (w && !w.dead) out.push(w);
  }
  return out;
}

/** A hauler's loop: walk the load to the cart, tip it, walk back, load again. */
function haul(
  ctx: SimContext,
  inst: InstanceSlot,
  camp: FoundryWorkerCamp,
  state: FoundryWorkerCampState,
  w: Entity,
): void {
  const leg = state.haul[w.id];
  if (!leg) return;
  if (leg.rest > 0) {
    leg.rest = Math.max(0, leg.rest - DT);
    return;
  }
  const o = ctx.instanceOriginOf(inst);
  const stand = leg.leg === 0 ? camp.cart.stand : camp.heap.stand;
  const arrived = ctx.moveToward(w, ctx.groundPos(o.x + stand.x, o.z + stand.z), HAUL_SPEED);
  if (!arrived) return;
  // At the end of the leg: face what it works at, and rest there a moment.
  const at = leg.leg === 0 ? camp.cart : camp.heap;
  w.facing = angleTo(w.pos, ctx.groundPos(o.x + at.x, o.z + at.z));
  leg.rest = leg.leg === 0 ? REST_AT_CART : REST_AT_HEAP;
  leg.leg = leg.leg === 0 ? 1 : 0;
}

/** Remove a freed laborer from the world and its camp (it has gone home). */
function despawnWorker(
  ctx: SimContext,
  inst: InstanceSlot,
  state: FoundryWorkerCampState,
  w: Entity,
): void {
  for (const meta of ctx.players.values()) {
    const p = ctx.entities.get(meta.entityId);
    if (p?.targetId === w.id) p.targetId = null;
  }
  const at = inst.npcIds.indexOf(w.id);
  if (at >= 0) inst.npcIds.splice(at, 1);
  state.workerIds = state.workerIds.filter((id) => id !== w.id);
  delete state.haul[w.id];
  if (ctx.entities.has(w.id)) ctx.dropEntity(w.id);
}

function tickFreed(
  ctx: SimContext,
  inst: InstanceSlot,
  camp: FoundryWorkerCamp,
  state: FoundryWorkerCampState,
): void {
  const since = ctx.time - state.freedAt;
  const o = ctx.instanceOriginOf(inst);
  const leave = ctx.groundPos(o.x + camp.leave.x, o.z + camp.leave.z);
  for (const w of liveWorkers(ctx, state)) {
    if (since >= FREED_LEAVE_SECONDS) {
      despawnWorker(ctx, inst, state, w);
      continue;
    }
    if (since >= FREED_CHEER_SECONDS) ctx.moveToward(w, leave, WALK_SPEED);
  }
}

/** Credit "Free the Workers" to every holder in the run, wherever they stand
 *  in it (a group objective, like a boss kill's). */
function creditCamp(ctx: SimContext, inst: InstanceSlot): void {
  const quest = QUESTS[FOUNDRY_WORKERS_QUEST_ID];
  if (!quest) return;
  const o = ctx.instanceOriginOf(inst);
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (!e || Math.abs(e.pos.x - o.x) >= 120 || Math.abs(e.pos.z - o.z) >= 250) continue;
    const qp = meta.questLog.get(FOUNDRY_WORKERS_QUEST_ID);
    if (qp?.state !== 'active') continue;
    if (qp.counts[0] >= questObjectiveRequired(quest, qp, 0)) continue;
    qp.counts[0]++;
    meta.counters.questProgress++;
    emitQuestProgress(ctx, meta, qp, quest.objectives[0], 0);
    ctx.checkQuestReady(qp, meta);
  }
}

/** Strike a camp's chains: the workers become Freed Laborers (they cheer and
 *  turn toward whoever freed them), the run's quest holders are credited, and
 *  the last camp earns the run the deed. */
export function freeFoundryWorkerCamp(
  ctx: SimContext,
  inst: InstanceSlot,
  obj: Entity,
  by: Entity | null,
): void {
  const state = obj.foundryWorkerCamp;
  if (!state || state.phase === 'freed') return;
  setPhase(obj, 'freed');
  state.freedAt = ctx.time;
  state.haul = {};
  const freed = MOBS[FOUNDRY_WORKER_TEMPLATES.freed];
  const workers = liveWorkers(ctx, state);
  for (const w of workers) {
    w.templateId = freed.id;
    w.name = freed.name;
    if (by) w.facing = angleTo(w.pos, by.pos);
  }
  if (workers[0]) emitMobYell(ctx, workers[0], FOUNDRY_WORKER_LINES.freed, BARK_RANGE);
  creditCamp(ctx, inst);
  if (foundryWorkerCampObjects(ctx, inst).every((c) => c.foundryWorkerCamp?.phase === 'freed')) {
    grantClaimDeed(ctx, inst, FOUNDRY_WORKERS_DEED);
  }
}

/** One tick of a claim's worker camps (spawned on its first tick). */
export function tickFoundryWorkers(ctx: SimContext, inst: InstanceSlot): void {
  for (const obj of ensureCamps(ctx, inst)) {
    const state = obj.foundryWorkerCamp;
    if (!state) continue;
    const camp = campDef(state);
    if (state.phase === 'freed') {
      tickFreed(ctx, inst, camp, state);
      continue;
    }
    if (state.phase === 'guarded' && !guardsStand(ctx, inst, camp)) {
      setPhase(obj, 'unguarded');
      const [first] = liveWorkers(ctx, state);
      if (first) emitMobYell(ctx, first, FOUNDRY_WORKER_LINES.unguarded, BARK_RANGE);
    }
    for (const w of liveWorkers(ctx, state)) {
      holdInert(w);
      if (state.haul[w.id]) haul(ctx, inst, camp, state, w);
    }
  }
}

/** The claim and camp a worker belongs to, or null. */
function campOfWorker(ctx: SimContext, worker: Entity): { inst: InstanceSlot; obj: Entity } | null {
  for (const inst of ctx.instances) {
    if (inst.partyKey === null || inst.dungeonId !== FOUNDRY_DUNGEON) continue;
    if (!inst.npcIds.includes(worker.id)) continue;
    for (const obj of foundryWorkerCampObjects(ctx, inst)) {
      if (obj.foundryWorkerCamp?.workerIds.includes(worker.id)) return { inst, obj };
    }
  }
  return null;
}

/**
 * The interact press on a targeted worker (interaction.ts interact; the
 * gossip's "Free them" sends exactly that, on every host). True when the
 * press was a worker's: refused while the guards stand, the chains struck
 * once they are down, nothing more once the camp is free.
 */
export function tryFreeFoundryWorkers(ctx: SimContext, target: Entity, p: Entity): boolean {
  if (target.kind !== 'mob' || !isFoundryWorkerTemplate(target.templateId)) return false;
  const found = campOfWorker(ctx, target);
  if (!found) return true;
  const state = found.obj.foundryWorkerCamp;
  if (state?.phase === 'guarded') {
    ctx.error(p.id, FOUNDRY_WORKER_LINES.guarded);
    return true;
  }
  if (state?.phase === 'unguarded') freeFoundryWorkerCamp(ctx, found.inst, found.obj, p);
  return true;
}

/** Drop every camp of a claim (its workers and state objects): the next tick
 *  spawns them fresh, chained and guarded (`/dev foundry workers reset`). */
export function resetFoundryWorkerCamps(ctx: SimContext, inst: InstanceSlot): void {
  for (const obj of foundryWorkerCampObjects(ctx, inst)) {
    const state = obj.foundryWorkerCamp;
    if (state) for (const w of liveWorkers(ctx, state)) despawnWorker(ctx, inst, state, w);
    dropEncounterObject(ctx, inst, obj.id);
  }
}

/** A dev line describing each camp (`/dev foundry workers`). */
export function foundryWorkersStatus(ctx: SimContext, inst: InstanceSlot): string {
  return ensureCamps(ctx, inst)
    .map((obj) => {
      const state = obj.foundryWorkerCamp;
      const phase = foundryWorkerCampPhaseOf(obj.templateId) ?? 'unknown';
      return `${state?.camp ?? '?'} ${phase} (${state?.workerIds.length ?? 0})`;
    })
    .join(', ');
}

/** `/dev foundry workers free <a|b|c|all>`: strike a camp's chains now, guards
 *  or no guards. Returns how many camps it freed. */
export function devFreeFoundryWorkers(ctx: SimContext, inst: InstanceSlot, which: string): number {
  let n = 0;
  for (const obj of ensureCamps(ctx, inst)) {
    const state = obj.foundryWorkerCamp;
    if (!state || state.phase === 'freed') continue;
    if (which !== 'all' && state.camp.toLowerCase() !== which) continue;
    freeFoundryWorkerCamp(ctx, inst, obj, null);
    n++;
  }
  return n;
}
