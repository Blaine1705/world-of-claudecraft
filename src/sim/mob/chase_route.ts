// A chasing mob's way round an obstacle. Mobs chase in a straight line with a
// slide fan (Sim.moveToward) and no nav mesh, which rounds a rock or a crate
// but pins on a wall: inside an instance the mob stood against it, was held
// immune, and then phased straight THROUGH the wall
// (instances/instance_combat_hold.ts). This module gives such a mob a real
// route instead: a bounded grid search over the same colliders its movement
// obeys (mob/route_search.ts), cached on the mob and walked waypoint by
// waypoint with the ordinary moveToward, so it goes round by the doorway.
//
// Consumers, both in mob/combat_profile.ts:
//   - a caster with no line of sight to its target walks its route until it
//     sees them (mob/cast_sight.ts decides when; this module is how);
//   - a melee mob whose straight chase has stopped dead on geometry takes a
//     route before the stall detector ever calls it unreachable
//     (chaseAroundObstacles).
//
// WHERE: only for a mob and a target standing in the same claimed instance
// slot (a dungeon or one raid room). That is where the hold-and-phase rule
// lives and where the walls are authored colliders on a flat floor the search
// can judge exactly as the mover does. The open world, rifts and delves keep
// the straight chase and the classic stall: out there the mover also refuses a
// step on a steep slope, which the search does not model (a route it found
// could be one the mob cannot walk), the classic leash already ends a chase a
// wall has stopped, and a delve's doors and room bounds are clamps the mover
// applies that no collider search can see. The search itself is as cheap out
// there as in a slot (scripts/mob_route_bench.ts measures both); widening the
// scope is a matter of teaching it the slope gate, not of cost.
//
// COST, bounded by construction (the server runs one 50 ms tick for a whole
// realm):
//   - a search stops at ROUTE_NODES_PER_PLAN judged cells, found or not;
//   - the whole sim spends at most ROUTE_NODES_PER_TICK judged cells a tick:
//     the tally is Sim-owned and reset by the sim at the top of every tick
//     (mobScanCounters.routeNodes), mobs are served in entity order, and one
//     over budget keeps its straight chase and asks again next tick;
//   - a mob plans on its own tick slot of the re-plan period and no sooner
//     than its throttle allows, which doubles after every search that fails;
//   - a mob spends at most ROUTE_MAX_TRIES plans, found or failed, before it
//     must wait ROUTE_TRY_FORGIVE_TICKS for each one back. Nothing the target
//     does (stepping aside, dancing a doorway, coming back into sight) hands
//     them back: the throttle and the tries outlive the path, and are dropped
//     only when the pull ends;
//   - a search that failed is remembered on the TARGET for a few seconds
//     (Entity.routeDenied), so the rest of a pack standing with the mob that
//     asked does not prove the same thing again mob by mob.
//
// THE ANTI-PERCH RULE STILL WINS. A target no route reaches (a perch, a sealed
// room) is "no route": the mob pushes straight on, commits no movement, and
// mob/reachability.ts counts it down to the evade or the hold exactly as
// before. A route that stops getting the mob nearer its next waypoint is
// dropped as a failure (the stall detector probes the step toward the TARGET,
// so without this a mob wedged on a waypoint behind a collider would stand
// there for ever, attackable and never stalling), and with its tries spent a
// mob is back on the straight chase and the stall whatever the target does.
//
// Draws no rng. Entity.chaseRoute exists only once something has been in the
// mob's way, so a fight on open ground leaves no trace of it.

import { MOBS } from '../data';
import { attackerLeftInstance, claimedSlotOf } from '../instances/instance_combat_hold';
import type { SimContext } from '../sim_context';
import { dist2d, type Entity, type MobChaseRoute, TICK_RATE, type Vec3 } from '../types';
import { type RouteSearchResult, searchRoute } from './route_search';

/** Sim ticks between two plans of one mob's route (a second), and the period
 *  of the tick slots the plans are spread over. */
export const ROUTE_REPLAN_TICKS = TICK_RATE;
/** The most cells one search may judge (route_search.ts). */
export const ROUTE_NODES_PER_PLAN = 900;
/** The most cells the whole sim may judge in one tick. */
export const ROUTE_NODES_PER_TICK = 1200;
/** Plans, found or failed, a mob may spend before it must wait for one back. */
export const ROUTE_MAX_TRIES = 4;
/** Sim ticks that hand one spent plan back (ten seconds). */
export const ROUTE_TRY_FORGIVE_TICKS = TICK_RATE * 10;
/** The longest a failed search holds the next one back (its backoff doubles
 *  from one re-plan period up to this). */
export const ROUTE_MAX_BACKOFF_TICKS = TICK_RATE * 16;
/** Yards of slack round the mob-to-target box the search may use: wide enough
 *  to find the doorway in a curtain wall. */
export const ROUTE_MARGIN = 24;
/** A waypoint this near is reached. */
export const ROUTE_WAYPOINT_REACHED = 0.75;
/** A route whose end is this far from where the target now stands is stale. */
export const ROUTE_STALE_YARDS = 3;
/** Sim ticks a mob may go without closing on its next waypoint before the
 *  route is dropped as a failure (half a second). */
export const ROUTE_STUCK_TICKS = TICK_RATE / 2;
/** How much nearer (yards) counts as closing on a waypoint. */
const ROUTE_PROGRESS_YARDS = 0.05;
/** Sim ticks a failed search is remembered on the target for the pack. */
export const ROUTE_DENIED_TICKS = TICK_RATE * 3;
/** A mob this near where the failed search began shares its answer. */
export const ROUTE_DENIED_NEAR = 8;
/** Seconds a melee chase must have stood dead on geometry before it routes:
 *  past a body block or a one-tick hiccup, far inside the stall window. */
export const ROUTE_AFTER_STALL_SECONDS = 0.3;

/** Does routing apply to this pair: both in one claimed instance slot? */
export function routesHere(ctx: SimContext, mob: Entity, target: Entity): boolean {
  const slot = claimedSlotOf(ctx, mob);
  return slot !== null && !attackerLeftInstance(slot, target);
}

/** The first tick at or after `tick` that is this mob's plan slot. */
function nextSlot(tick: number, mobId: number): number {
  const off = (((mobId - tick) % ROUTE_REPLAN_TICKS) + ROUTE_REPLAN_TICKS) % ROUTE_REPLAN_TICKS;
  return tick + off;
}

/** The mob's route record for this target, fresh when the target changed. */
export function chaseRouteFor(ctx: SimContext, mob: Entity, target: Entity): MobChaseRoute {
  let route = mob.chaseRoute;
  if (!route || route.targetId !== target.id) {
    route = {
      targetId: target.id,
      path: [],
      planAt: nextSlot(ctx.tickCount, mob.id),
      tries: 0,
      triesAt: ctx.tickCount,
      fails: 0,
      stuckDist: Infinity,
      stuckAt: ctx.tickCount,
      walkedAt: ctx.tickCount,
      sightClear: true,
    };
    mob.chaseRoute = route;
  }
  return route;
}

/** The pull ended (evade, reset, death): forget the route and its throttle. */
export function endChaseRoute(mob: Entity): void {
  // Written as undefined, never deleted (the Entity shape stays stable).
  if (mob.chaseRoute !== undefined) mob.chaseRoute = undefined;
}

/**
 * The mob stands where it fights, or is held in place: the path is done with.
 * The throttle and the spent tries STAY (a target dancing in and out of sight
 * must not buy a fresh plan each time), as does the sight answer's owner.
 */
export function restChaseRoute(mob: Entity): void {
  const route = mob.chaseRoute;
  if (route === undefined) return;
  if (route.path.length > 0) route.path = [];
  route.sightClear = true;
}

/** Is the mob walking a real route (waypoints before the last straight leg)? */
export function isRouting(mob: Entity, target: Entity): boolean {
  const route = mob.chaseRoute;
  return route !== undefined && route.targetId === target.id && route.path.length > 1;
}

/** One bounded search from the mob to its target, tallied on the sim's
 *  per-tick counters (the tally of judged cells is the tick's budget). */
function runSearch(ctx: SimContext, mob: Entity, target: Entity): RouteSearchResult {
  const result = searchRoute(mob.pos, target.pos, {
    seed: ctx.cfg.seed,
    margin: ROUTE_MARGIN,
    maxNodes: ROUTE_NODES_PER_PLAN,
    swim: ctx.mobCanSwim(MOBS[mob.templateId]),
    riftToken: ctx.riftCollisionToken,
  });
  const counters = ctx.mobScanCounters;
  counters.routePlans++;
  counters.routeNodes += result.nodes;
  if (!result.found) counters.routeFailed++;
  return result;
}

/**
 * Search for a route from the mob to its target round whatever stands between
 * them: the waypoints after the mob's own spot, ending on the target's. One
 * waypoint or none means no route to walk. For tools and tests (the benchmark
 * in scripts/mob_route_bench.ts): the mob AI plans through followChaseRoute,
 * which is where the throttle and the budget are.
 */
export function planChaseRoute(ctx: SimContext, mob: Entity, target: Entity): Vec3[] {
  return runSearch(ctx, mob, target).path.map((w) => ({ x: w.x, y: 0, z: w.z }));
}

/** A plan failed (nothing found, or its route stopped making headway): the
 *  path goes and the next search waits twice as long as the last one did. */
function failRoute(ctx: SimContext, mob: Entity, route: MobChaseRoute): void {
  route.path = [];
  route.fails++;
  const wait = Math.min(ROUTE_MAX_BACKOFF_TICKS, ROUTE_REPLAN_TICKS * 2 ** route.fails);
  route.planAt = nextSlot(ctx.tickCount + wait, mob.id);
}

/** Spend one plan; the first one spent starts the clock that hands them back. */
function spendTry(ctx: SimContext, route: MobChaseRoute): void {
  if (route.tries === 0) route.triesAt = ctx.tickCount;
  route.tries++;
}

/**
 * One chase step along the mob's route, planning it first when it has none or
 * its end has gone stale. Returns true when the step was taken along a route;
 * false when no route stands (routing does not apply here, none exists, the
 * mob is on its last straight leg, or the plan must wait), in which case the
 * caller takes its ordinary straight step.
 */
export function followChaseRoute(
  ctx: SimContext,
  mob: Entity,
  target: Entity,
  speed: number,
): boolean {
  if (!routesHere(ctx, mob, target)) return false;
  const route = chaseRouteFor(ctx, mob, target);
  const now = ctx.tickCount;
  // One spent plan comes back every ROUTE_TRY_FORGIVE_TICKS, whatever happens.
  if (route.tries > 0 && now - route.triesAt >= ROUTE_TRY_FORGIVE_TICKS) {
    const back = Math.floor((now - route.triesAt) / ROUTE_TRY_FORGIVE_TICKS);
    route.tries = Math.max(0, route.tries - back);
    route.triesAt += back * ROUTE_TRY_FORGIVE_TICKS;
  }
  // The watchdog: a route is only a route while it brings the mob nearer its
  // next waypoint. A mob that was not walking it last tick (stunned, rooted,
  // planted by a bar, in sight for a while) starts the watch afresh.
  if (now - route.walkedAt > 1) {
    route.stuckDist = Infinity;
    route.stuckAt = now;
  }
  route.walkedAt = now;
  if (route.path.length > 1) {
    const d = dist2d(mob.pos, route.path[0]);
    if (d < route.stuckDist - ROUTE_PROGRESS_YARDS) {
      route.stuckDist = d;
      route.stuckAt = now;
    } else if (now - route.stuckAt >= ROUTE_STUCK_TICKS) {
      failRoute(ctx, mob, route);
    }
  }
  const end = route.path[route.path.length - 1];
  const stale = end === undefined || dist2d(end, target.pos) > ROUTE_STALE_YARDS;
  // With no route in hand (none was found, or its last waypoint is behind the
  // mob and it is still being asked) the search is made again, on its throttle.
  const none = route.path.length <= 1;
  if ((stale || none) && now >= route.planAt && route.tries < ROUTE_MAX_TRIES) {
    const denied = target.routeDenied;
    const counters = ctx.mobScanCounters;
    if (
      denied !== undefined &&
      now - denied.tick < ROUTE_DENIED_TICKS &&
      Math.hypot(target.pos.x - denied.x, target.pos.z - denied.z) <= ROUTE_STALE_YARDS &&
      Math.hypot(mob.pos.x - denied.fromX, mob.pos.z - denied.fromZ) <= ROUTE_DENIED_NEAR
    ) {
      // A packmate beside it just proved there is no way: take its word.
      spendTry(ctx, route);
      failRoute(ctx, mob, route);
    } else if (counters.routeNodes + ROUTE_NODES_PER_PLAN <= ROUTE_NODES_PER_TICK) {
      spendTry(ctx, route);
      const result = runSearch(ctx, mob, target);
      route.path = result.path.map((w) => ({ x: w.x, y: 0, z: w.z }));
      if (!result.found) {
        failRoute(ctx, mob, route);
        target.routeDenied = {
          tick: now,
          x: target.pos.x,
          z: target.pos.z,
          fromX: mob.pos.x,
          fromZ: mob.pos.z,
        };
      } else {
        route.fails = 0;
        route.planAt = nextSlot(now + ROUTE_REPLAN_TICKS, mob.id);
        route.stuckDist = Infinity;
        route.stuckAt = now;
      }
    }
    // Over the tick's budget: nothing is spent, and it asks again next tick.
  }
  while (route.path.length > 1 && dist2d(mob.pos, route.path[0]) < ROUTE_WAYPOINT_REACHED) {
    route.path.shift();
    route.stuckDist = Infinity;
    route.stuckAt = now;
  }
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
