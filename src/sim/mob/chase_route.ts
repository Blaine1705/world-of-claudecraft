// A chasing mob's way round an obstacle. Mobs chase in a straight line with a
// slide fan (Sim.moveToward) and no nav mesh, which rounds a rock or a crate
// but pins on a wall: the mob stood against it until the unreachable stall
// sent it home (the open world) or, inside an instance, held it immune and
// then phased it straight THROUGH the wall (instances/instance_combat_hold.ts).
// This module gives an engaged mob a real route instead: a local A* over the
// same colliders its movement obeys (pathfind.ts), cached on the mob and
// followed waypoint by waypoint with the ordinary moveToward, so it walks
// round the wall and never through it.
//
// Consumers, both in mob/combat_profile.ts:
//   - a caster with no line of sight to its target walks its route until it
//     sees them (mob/cast_sight.ts decides when; this module is how);
//   - a melee mob whose straight chase has stopped dead on geometry takes a
//     route before the stall detector ever calls it unreachable
//     (chaseAroundObstacles).
// The stall, the pin and the phase stay exactly as they were for a target no
// route reaches (a perch): with no route the mob pushes straight on, commits
// no movement, and mob/reachability.ts counts it down as before. Two guards
// keep a route from becoming a way to dance a mob round a perch for ever: a
// search that finds nothing is asked again only every ROUTE_RETRY_TICKS (the
// world may have changed: a gate opened, a combat wall fell), and no more
// than ROUTE_MAX_TRIES routes are walked toward a target that has not moved.
//
// Cost, bounded: one plan per mob per ROUTE_REPLAN_TICKS at most, only while
// its path is missing or its end has gone stale, over a search window of at
// most ROUTE_SPAN cells a side, and a pack never plans on one tick: each mob
// plans only on its own slot of every ROUTE_PLAN_SLOTS ticks (by entity id).
// A mob with open ground ahead never plans. A plan is the expensive thing
// here (a few milliseconds round a wall in the Hollow Crypt, a sight query a
// few hundredths of one), which is why it is the thing that is rationed.
//
// The route draws no rng. Entity.chaseRoute exists only while something is in
// the mob's way (a caster's lost line, a melee chase stopped on a wall), so a
// fight on open ground leaves no trace of it and the parity goldens of every
// such fight are untouched; where it does exist the trace samples it like any
// other mob state.

import { isDelvePos, MOBS } from '../data';
import {
  findPath,
  PLAYER_BODY_RADIUS,
  PLAYER_MAX_CLIMB_SLOPE,
  PLAYER_SWIM_DEPTH,
} from '../pathfind';
import type { SimContext } from '../sim_context';
import { dist2d, type Entity, type MobChaseRoute, TICK_RATE, type Vec3 } from '../types';
import { waterLevelAt } from '../world';

/** Sim ticks between two plans of one mob's route (a second). */
export const ROUTE_REPLAN_TICKS = TICK_RATE;
/** Sim ticks before a search that found no route is made again (two seconds). */
export const ROUTE_RETRY_TICKS = TICK_RATE * 2;
/** A mob plans only on the tick whose number shares its id's remainder by
 *  this, so a pack that loses sight together spreads its plans over as many
 *  ticks instead of paying for them all on one. */
export const ROUTE_PLAN_SLOTS = 4;
/** Routes a mob walks toward a target that stays put before it stops looking
 *  and the stall detector takes over. A target that moves starts the count again. */
export const ROUTE_MAX_TRIES = 3;
/** Yards of slack round the mob-to-target box the search may use: wide enough
 *  to find the doorway in a curtain wall, small enough to stay cheap. */
export const ROUTE_MARGIN = 24;
/** Cells a side past which no search is made (the straight chase stands). */
export const ROUTE_SPAN = 96;
/** A waypoint this near is reached. */
export const ROUTE_WAYPOINT_REACHED = 0.75;
/** A route whose end is this far from where the target now stands is stale. */
export const ROUTE_STALE_YARDS = 3;
/** Seconds a melee chase must have stood dead on geometry before it routes:
 *  past a body block or a one-tick hiccup, far inside the stall window. */
export const ROUTE_AFTER_STALL_SECONDS = 0.3;

/** The mob's route record for this target, fresh when the target changed. */
export function chaseRouteFor(mob: Entity, target: Entity): MobChaseRoute {
  let route = mob.chaseRoute;
  if (!route || route.targetId !== target.id) {
    route = {
      targetId: target.id,
      path: [],
      planAt: 0,
      tries: 0,
      anchorX: target.pos.x,
      anchorZ: target.pos.z,
      sightClear: true,
      sightAt: 0,
    };
    mob.chaseRoute = route;
  }
  return route;
}

/** The pull ended, or the mob stands where it fights: forget the route. */
export function clearChaseRoute(mob: Entity): void {
  // Written as undefined, never deleted (the Entity shape stays stable).
  if (mob.chaseRoute !== undefined) mob.chaseRoute = undefined;
}

/** Is the mob walking a real route (waypoints before the last straight leg)? */
export function isRouting(mob: Entity, target: Entity): boolean {
  const route = mob.chaseRoute;
  return route !== undefined && route.targetId === target.id && route.path.length > 1;
}

/**
 * Plan a route from the mob to its target round whatever stands between them:
 * the waypoints after the mob's own spot, ending on the target's. A single
 * waypoint means no route (the search window was too wide, or no way exists
 * inside it), which callers treat as the straight chase.
 */
export function planChaseRoute(ctx: SimContext, mob: Entity, target: Entity): Vec3[] {
  const seed = ctx.cfg.seed;
  const swim = ctx.mobCanSwim(MOBS[mob.templateId]);
  // A delve's rooms are its run's modules: without them the search would read
  // the delve's default layout instead of the one this run rolled.
  const delveModules = isDelvePos(mob.pos.x) ? ctx.delveRunForMob(mob.id)?.modules : undefined;
  return findPath(mob.pos, target.pos, {
    seed,
    bodyRadius: PLAYER_BODY_RADIUS,
    maxClimbSlope: PLAYER_MAX_CLIMB_SLOPE,
    // The same deep-water rule moveToward applies to a landlocked mob.
    minGround: swim
      ? -Infinity
      : (x: number, z: number) => waterLevelAt(x, z, seed) - PLAYER_SWIM_DEPTH,
    maxSpan: ROUTE_SPAN,
    margin: ROUTE_MARGIN,
    swim,
    riftToken: ctx.riftCollisionToken,
    delveModules,
  }).map((w) => ({ x: w.x, y: 0, z: w.z }));
}

/**
 * One chase step along the mob's route, planning it first when it has none or
 * its end has gone stale. Returns true when the step was taken along a route;
 * false when no route stands (none exists, the mob is on its last straight
 * leg, or the plan is throttled), in which case the caller takes its ordinary
 * straight step.
 */
export function followChaseRoute(
  ctx: SimContext,
  mob: Entity,
  target: Entity,
  speed: number,
): boolean {
  const route = chaseRouteFor(mob, target);
  // A target that moved off the spot the tries were counted on starts afresh.
  if (Math.hypot(target.pos.x - route.anchorX, target.pos.z - route.anchorZ) > ROUTE_STALE_YARDS) {
    route.anchorX = target.pos.x;
    route.anchorZ = target.pos.z;
    route.tries = 0;
  }
  const end = route.path[route.path.length - 1];
  const stale = end === undefined || dist2d(end, target.pos) > ROUTE_STALE_YARDS;
  // With no route in hand (none was found, or its last waypoint is behind the
  // mob and it is still being asked) the search is made again, on its cadence.
  const none = route.path.length <= 1;
  if (
    (stale || none) &&
    ctx.tickCount >= route.planAt &&
    route.tries < ROUTE_MAX_TRIES &&
    ctx.tickCount % ROUTE_PLAN_SLOTS === mob.id % ROUTE_PLAN_SLOTS
  ) {
    route.path = planChaseRoute(ctx, mob, target);
    const found = route.path.length > 1;
    if (found) route.tries++;
    route.planAt = ctx.tickCount + (found ? ROUTE_REPLAN_TICKS : ROUTE_RETRY_TICKS);
  }
  while (route.path.length > 1 && dist2d(mob.pos, route.path[0]) < ROUTE_WAYPOINT_REACHED)
    route.path.shift();
  if (route.path.length <= 1) return false;
  ctx.moveToward(mob, route.path[0], speed);
  return true;
}

/**
 * A melee chase step: straight at the target as always, and round the
 * obstacle once the straight chase has stood dead on geometry for
 * ROUTE_AFTER_STALL_SECONDS (Entity.chaseStall, mob/reachability.ts). A mob
 * with open ground ahead pays one comparison.
 */
export function chaseAroundObstacles(
  ctx: SimContext,
  mob: Entity,
  target: Entity,
  speed: number,
): void {
  if (
    (isRouting(mob, target) || mob.chaseStall >= ROUTE_AFTER_STALL_SECONDS) &&
    followChaseRoute(ctx, mob, target, speed)
  ) {
    return;
  }
  ctx.moveToward(mob, target.pos, speed);
}
