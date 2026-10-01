// The Gantry Hauler (docs/design/dungeon-rework/stormbrass_foundry.md section
// 4.3): the Rail Yard's showpiece patrol, a huge tracked steam crawler hauling
// a boiler and a load of brass plates. Its kit, on top of its melee:
//
//   Steam Blast     every 12 s a 1.5 s bar, then a 90 degree cone 12 yd deep in
//                   front of it: 180 to 220 and a 10 yd knockback. It braces its
//                   tracks for the bar and the cone stays where it was drawn.
//   Scrap Toss      every 15 s the crane arm throws a plate at the FARTHEST
//                   player within 45 yd: a 5 yd mark on the floor, 2 s later
//                   200 to 240 to everyone still in it.
//   Unload          once, at half health: three Arc Drones spill from its bed.
//   Boiler Rupture  2 s after it falls its boiler bursts, 8 yd (its
//                   trashKit.deathBurst, mob/trash_kit/foundry_kit.ts).
//
// Deterministic: the toss target is the farthest living player (ties to the
// lower entity id); the only rng draws are the damage rolls. Every visible
// state rides existing entity fields (the cast bar, facing, the toss mark's
// encounter object), so the online client mirrors it with no wire change.

import { applyKnockback } from '../../knockback';
import { spawnKitAdd } from '../../mob/trash_kit/spawn';
import { inCone } from '../../mob/trash_kit/targets';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { angleTo, DT, dist2d, type Entity, type HaulerFightState } from '../../types';
import {
  claimPlayers,
  clearCastIf,
  dropEncounterObject,
  mechanicDamage,
  spawnFoundryObject,
  startBar,
} from './claim';
import {
  ARC_DRONE_ID,
  FOUNDRY_SCRAP_MARK,
  HAULER_SCRAP_TOSS,
  HAULER_STEAM_BLAST,
  HAULER_UNLOAD,
  HAULER_TUNING as T,
} from './ids';

/** The chat line when the bed tips (re-localized by src/ui/sim_i18n.ts). */
export const HAULER_UNLOAD_LOG = 'The Gantry Hauler tips its bed: Arc Drones spill out!';

function freshState(timers = true): HaulerFightState {
  return {
    kind: 'hauler',
    blastTimer: timers ? T.blastFirst : 99,
    tossTimer: timers ? T.tossFirst : 99,
    blastYaw: null,
    tosses: [],
    unloaded: false,
    casts: 0,
    struck: false,
    plantedAt: null,
  };
}

/** The Hauler's fight state, started on its first engaged tick (a dev trigger
 *  starts it with its clocks parked, so only the triggered mechanic fires). */
export function haulerState(hauler: Entity, timers = true): HaulerFightState {
  if (hauler.foundryFight?.kind !== 'hauler') hauler.foundryFight = freshState(timers);
  return hauler.foundryFight;
}

/** The pull ended (a kill, an evade, a wipe): drop the marks and the bar. */
function endHaulerFight(ctx: SimContext, inst: InstanceSlot, hauler: Entity): void {
  const st = hauler.foundryFight;
  if (!st) return;
  for (const t of st.tosses) dropEncounterObject(ctx, inst, t.objectId);
  clearCastIf(hauler, HAULER_STEAM_BLAST);
  hauler.foundryFight = undefined;
}

/** The farthest living player within the toss reach (ties to the lower id). */
export function pickScrapTossTarget(hauler: Entity, players: readonly Entity[]): Entity | null {
  let best: Entity | null = null;
  let bestD = -1;
  for (const p of players) {
    if (p.dead) continue;
    const d = dist2d(p.pos, hauler.pos);
    if (d > T.tossReach) continue;
    if (d > bestD + 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best !== null && p.id < best.id)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Start a Steam Blast at the one it is fighting. Returns true when it started. */
export function startSteamBlast(ctx: SimContext, hauler: Entity, st: HaulerFightState): boolean {
  const target = hauler.aggroTargetId !== null ? ctx.entities.get(hauler.aggroTargetId) : undefined;
  if (!target || target.dead) return false;
  const yaw = angleTo(hauler.pos, target.pos);
  st.blastYaw = yaw;
  st.blastTimer = T.blastEvery;
  st.casts++;
  hauler.facing = yaw;
  // It braces its tracks where the bar starts: the cone lands where it was drawn.
  st.plantedAt = { ...hauler.pos };
  startBar(hauler, HAULER_STEAM_BLAST, T.blastCast, target.id);
  return true;
}

function landSteamBlast(
  ctx: SimContext,
  inst: InstanceSlot,
  hauler: Entity,
  st: HaulerFightState,
): void {
  const yaw = st.blastYaw ?? hauler.facing;
  st.blastYaw = null;
  ctx.emit({
    type: 'spellfx',
    sourceId: hauler.id,
    targetId: hauler.id,
    school: 'fire',
    fx: 'nova',
    ability: HAULER_STEAM_BLAST,
  });
  for (const p of claimPlayers(ctx, inst)) {
    if (!inCone(hauler.pos, yaw, p.pos, T.blastRange, T.blastArcDeg)) continue;
    ctx.dealDamage(
      hauler,
      p,
      mechanicDamage(ctx, hauler, T.blastMin, T.blastMax),
      false,
      'fire',
      'Steam Blast',
      'hit',
      true,
    );
    if (!p.dead) applyKnockback(ctx, hauler, p, T.blastKnockback);
  }
}

/** Throw a plate at the farthest player. Returns true when it threw. */
export function startScrapToss(
  ctx: SimContext,
  inst: InstanceSlot,
  hauler: Entity,
  st: HaulerFightState,
): boolean {
  const target = pickScrapTossTarget(hauler, claimPlayers(ctx, inst));
  if (!target) return false;
  const mark = spawnFoundryObject(
    ctx,
    inst,
    FOUNDRY_SCRAP_MARK,
    'Scrap Toss',
    target.pos.x,
    target.pos.z,
    T.tossRadius,
  );
  st.tosses.push({
    x: target.pos.x,
    z: target.pos.z,
    remaining: T.tossWarning,
    objectId: mark.id,
  });
  st.tossTimer = T.tossEvery;
  st.casts++;
  ctx.emit({
    type: 'spellfx',
    sourceId: hauler.id,
    targetId: target.id,
    school: 'physical',
    fx: 'windup',
    ability: HAULER_SCRAP_TOSS,
  });
  return true;
}

function stepTosses(
  ctx: SimContext,
  inst: InstanceSlot,
  hauler: Entity,
  st: HaulerFightState,
): void {
  if (st.tosses.length === 0) return;
  const still: HaulerFightState['tosses'] = [];
  for (const t of st.tosses) {
    t.remaining -= DT;
    if (t.remaining > 1e-9) {
      still.push(t);
      continue;
    }
    ctx.emit({
      type: 'spellfx',
      sourceId: hauler.id,
      targetId: t.objectId,
      school: 'physical',
      fx: 'nova',
      ability: HAULER_SCRAP_TOSS,
    });
    for (const p of claimPlayers(ctx, inst)) {
      if (Math.hypot(p.pos.x - t.x, p.pos.z - t.z) > T.tossRadius) continue;
      st.struck = true;
      ctx.dealDamage(
        hauler,
        p,
        mechanicDamage(ctx, hauler, T.tossMin, T.tossMax),
        false,
        'physical',
        'Scrap Toss',
        'hit',
        true,
      );
    }
    dropEncounterObject(ctx, inst, t.objectId);
  }
  st.tosses = still;
}

/** Unload: three Arc Drones spill from the bed behind it. Returns how many. */
export function unloadDrones(
  ctx: SimContext,
  inst: InstanceSlot,
  hauler: Entity,
  st: HaulerFightState,
): number {
  st.unloaded = true;
  const victim =
    hauler.aggroTargetId !== null ? (ctx.entities.get(hauler.aggroTargetId) ?? null) : null;
  const back = hauler.facing + Math.PI;
  let n = 0;
  for (let k = 0; k < T.unloadCount; k++) {
    const a = back + (k - (T.unloadCount - 1) / 2) * 0.7;
    const add = spawnKitAdd(
      ctx,
      inst,
      hauler,
      ARC_DRONE_ID,
      hauler.pos.x + Math.sin(a) * 5,
      hauler.pos.z + Math.cos(a) * 5,
      victim,
    );
    if (add) n++;
  }
  ctx.emit({
    type: 'spellfx',
    sourceId: hauler.id,
    targetId: hauler.id,
    school: 'nature',
    fx: 'nova',
    ability: HAULER_UNLOAD,
  });
  ctx.emit({ type: 'log', text: HAULER_UNLOAD_LOG, color: '#ffc870', entityId: hauler.id });
  return n;
}

/** One tick of the Gantry Hauler's kit (after the mob AI). */
export function tickHauler(
  ctx: SimContext,
  inst: InstanceSlot,
  hauler: Entity,
  engaged: boolean,
): void {
  if (hauler.dead || !engaged) {
    endHaulerFight(ctx, inst, hauler);
    return;
  }
  const st = haulerState(hauler);
  stepTosses(ctx, inst, hauler, st);
  if (!st.unloaded && hauler.maxHp > 0 && hauler.hp / hauler.maxHp <= T.unloadAtHpPct) {
    unloadDrones(ctx, inst, hauler, st);
  }
  st.tossTimer -= DT;
  if (st.tossTimer <= 0 && !startScrapToss(ctx, inst, hauler, st)) st.tossTimer = 1;
  if (hauler.castingAbility === HAULER_STEAM_BLAST) {
    // It braces its tracks for the bar: the cone lands where it was drawn.
    if (!st.plantedAt) st.plantedAt = { ...hauler.pos };
    if (hauler.pos.x !== st.plantedAt.x || hauler.pos.z !== st.plantedAt.z) {
      hauler.pos.x = st.plantedAt.x;
      hauler.pos.y = st.plantedAt.y;
      hauler.pos.z = st.plantedAt.z;
      ctx.rebucket(hauler);
    }
    if (st.blastYaw !== null) hauler.facing = st.blastYaw;
    hauler.swingTimer = Math.max(hauler.swingTimer, 0.6);
    hauler.castRemaining = Math.max(0, hauler.castRemaining - DT);
    if (hauler.castRemaining > 0) return;
    clearCastIf(hauler, HAULER_STEAM_BLAST);
    st.plantedAt = null;
    landSteamBlast(ctx, inst, hauler, st);
    return;
  }
  if (hauler.castingAbility !== null || ctx.isStunned(hauler)) return;
  st.plantedAt = null;
  st.blastTimer -= DT;
  if (st.blastTimer <= 0 && !startSteamBlast(ctx, hauler, st)) st.blastTimer = 1;
}
