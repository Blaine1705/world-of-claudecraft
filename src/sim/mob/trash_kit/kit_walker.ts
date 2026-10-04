// G5, the trash engine's walker (TrashKitDef.walker): an orb that leaves a mob
// (at its death, or when a bar lands) and drifts at `speed` toward the
// nearest living ally of the claim in the fight, re-aiming every tick, and
// EMPOWERS that ally when it comes within `reachRadius` (a damage-done aura).
// A player who stands in its way intercepts it: the first living player
// within `interceptRadius` of the orb takes it instead (a roll of damage,
// and the empower turned on them when `grantsEmpower`), the body-block answer
// that turns the enemy's buff into the group's. An orb with no ally left, or
// out of time, fades. The orb is an encounter object the client mirrors
// (Entity.kitObject kind 'walker'), so it is drawn where the sim has it.
//
// The orb flies over the floor (a spirit, a pearl, a mote): it follows the
// ground height but no collider stops it, so only a body can. Zero rng in
// every pick (allies nearest-first with ties to the lower id, players in
// entity-id order); the only draw is the interception's damage roll.

import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { DT, dist2d, type Entity, type KitWalkerDef } from '../../types';
import { dropKitObject, spawnKitObject } from './kit_objects';

/** The spellfx ability ids of a walker's beats (the renderer's keys; the
 *  def's castId names the launch). */
export const WALKER_EMPOWER = 'trash_walker_empower';
export const WALKER_INTERCEPT = 'trash_walker_intercept';
export const WALKER_FADE = 'trash_walker_fade';
/** Seconds an orb flies before a body can take it. */
export const WALKER_ARM_SECONDS = 0.5;

/** The nearest living mob of the claim in the fight to (x, z), never `skip`
 *  (the mob that sent it). Ties go to the lower id. */
export function pickWalkerAlly(
  ctx: SimContext,
  inst: InstanceSlot,
  at: { x: number; z: number },
  skip: number,
): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  const p = { x: at.x, y: 0, z: at.z };
  for (const id of inst.mobIds) {
    if (id === skip) continue;
    const e = ctx.entities.get(id);
    if (!e || e.dead || e.hp <= 0 || e.kind !== 'mob' || !e.inCombat) continue;
    const d = dist2d(e.pos, p);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best !== null && e.id < best.id)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Launch an orb from `mob` toward its nearest fighting ally. Returns the orb,
 *  or null when no ally is left to empower. */
export function launchWalker(
  ctx: SimContext,
  inst: InstanceSlot,
  mob: Entity,
  def: KitWalkerDef,
): Entity | null {
  const ally = pickWalkerAlly(ctx, inst, mob.pos, mob.id);
  if (!ally) return null;
  const orb = spawnKitObject(ctx, inst, def.objectTemplate, def.name, mob.pos.x, mob.pos.z, 1, 0, {
    kind: 'walker',
    def,
    sourceId: mob.id,
    allyId: ally.id,
    remaining: def.maxSeconds,
    mechanicDamageMult: mob.mechanicDamageMult ?? 1,
  });
  ctx.emit({
    type: 'spellfx',
    sourceId: mob.id,
    targetId: orb.id,
    school: def.school,
    fx: 'nova',
    ability: def.castId,
  });
  return orb;
}

function empower(ctx: SimContext, def: KitWalkerDef, sourceId: number, onto: Entity): void {
  ctx.applyAura(onto, {
    id: def.empower.auraId,
    name: def.empower.name,
    kind: 'buff_dmg_done',
    remaining: def.empower.seconds,
    duration: def.empower.seconds,
    value: def.empower.damagePct,
    sourceId,
    school: def.school,
  });
}

/**
 * One tick of an orb: intercepted by a player in its way, else drift toward
 * its ally and empower it on arrival, else fade. Returns what happened.
 */
export function stepWalker(
  ctx: SimContext,
  inst: InstanceSlot,
  orb: Entity,
  players: readonly Entity[],
): 'drift' | 'intercepted' | 'empowered' | 'faded' {
  const st = orb.kitObject;
  if (st?.kind !== 'walker') return 'faded';
  const def = st.def;
  // A body in its way takes it first (players in entity-id order), once the
  // orb has cleared the body it left (the melee round a corpse never eats it
  // on its first tick by standing there).
  let blocker: Entity | null = null;
  const armed = def.maxSeconds - st.remaining >= WALKER_ARM_SECONDS;
  for (const p of armed ? players : []) {
    if (p.dead || dist2d(p.pos, orb.pos) > def.interceptRadius) continue;
    if (!blocker || p.id < blocker.id) blocker = p;
  }
  if (blocker) {
    ctx.emit({
      type: 'spellfx',
      sourceId: orb.id,
      targetId: blocker.id,
      school: def.school,
      fx: 'nova',
      ability: WALKER_INTERCEPT,
    });
    if (def.intercept.max > 0) {
      const amount = Math.max(
        1,
        Math.round(ctx.rng.range(def.intercept.min, def.intercept.max) * st.mechanicDamageMult),
      );
      const source = ctx.entities.get(st.sourceId) ?? orb;
      ctx.dealDamage(source, blocker, amount, false, def.school, def.name, 'hit', true);
    }
    if (def.intercept.grantsEmpower && !blocker.dead) empower(ctx, def, orb.id, blocker);
    dropKitObject(ctx, inst, orb.id);
    return 'intercepted';
  }
  st.remaining -= DT;
  let ally = st.allyId !== null ? ctx.entities.get(st.allyId) : undefined;
  if (!ally || ally.dead || ally.hp <= 0) {
    ally = pickWalkerAlly(ctx, inst, orb.pos, st.sourceId) ?? undefined;
    st.allyId = ally?.id ?? null;
  }
  if (!ally || st.remaining <= 1e-9) {
    ctx.emit({
      type: 'spellfx',
      sourceId: orb.id,
      targetId: orb.id,
      school: def.school,
      fx: 'nova',
      ability: WALKER_FADE,
    });
    dropKitObject(ctx, inst, orb.id);
    return 'faded';
  }
  const d = dist2d(orb.pos, ally.pos);
  if (d <= def.reachRadius) {
    ctx.emit({
      type: 'spellfx',
      sourceId: orb.id,
      targetId: ally.id,
      school: def.school,
      fx: 'nova',
      ability: WALKER_EMPOWER,
    });
    empower(ctx, def, orb.id, ally);
    dropKitObject(ctx, inst, orb.id);
    return 'empowered';
  }
  const step = Math.min(d, def.speed * DT);
  orb.prevPos = { ...orb.pos };
  const nx = orb.pos.x + ((ally.pos.x - orb.pos.x) / d) * step;
  const nz = orb.pos.z + ((ally.pos.z - orb.pos.z) / d) * step;
  orb.pos = ctx.groundPos(nx, nz);
  orb.facing = Math.atan2(ally.pos.x - orb.pos.x, ally.pos.z - orb.pos.z);
  ctx.rebucket(orb);
  return 'drift';
}
