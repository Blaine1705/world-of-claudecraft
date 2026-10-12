// Line of sight for an ordinary mob cast at a target (the owner's playtest of
// 2026-10-12: "we line-of-sighted casters and they never stopped casting").
// Before this module a petSpell caster in spell range stood still and landed
// every bolt through whatever stood between it and its target: no mob cast
// asked for a line of sight at its start, during its windup, or at its end.
//
// The rule, the one a player's own cast follows (combat/casting_lifecycle.ts
// refuses a cast with "Line of sight." at its start and again at its finish,
// and a refused finish costs the cast's time and nothing else):
//   - a mob needs a line of sight to its target to BEGIN a cast at it;
//   - a cast already begun runs out its windup whatever the target does; if
//     the target is out of sight when it ends, the cast FAILS: no projectile,
//     no damage, no resist roll, nothing drawn from the rng;
//   - a failed cast is not paid for: the caster may try again as soon as it
//     sees its target (after CAST_SIGHT_RETRY_SECONDS, never on the same tick);
//   - a caster that cannot see its target does not stand there: it walks to
//     where it can (mob/chase_route.ts), round the wall, and casts again from
//     the first spot in range that has a line of sight.
//
// Cost on the server's tick, bounded by design: a standing caster asks for a
// line of sight twice a cast (its start and its end); a mob on the move asks
// once every SIGHT_RECHECK_TICKS; nothing asks every tick. The query itself
// (Sim.hasLineOfSight) samples the sight line every half yard against the
// slot's collider cells.
//
// Scope: the hostile petSpell casters of the mob AI (mob/combat_profile.ts
// updateCasterCombat). A player's pet never comes through here (pet/pet_ai.ts
// drives its own ranged attack), nor does any boss or encounter mechanic.
// Draws no rng.

import type { SimContext } from '../sim_context';
import { DT, dist2d, type Entity } from '../types';
import { chaseRouteFor } from './chase_route';

/** Sim ticks between two sight checks of a caster on the move (a quarter second). */
export const SIGHT_RECHECK_TICKS = 5;
/** Yards past its spell range inside which a closing caster starts asking. */
export const SIGHT_SEEK_MARGIN = 8;
/** Seconds before a caster whose cast failed on sight may begin another: the
 *  caster loop's own fast-cast clamp on reaching range (combat_profile.ts). */
export const CAST_SIGHT_RETRY_SECONDS = 0.4;

/** What the sight rule says about this tick of a standing caster. */
export type CastSightVerdict =
  /** Nothing to judge, or the line is clear: cast on. */
  | 'cast'
  /** About to begin a cast with no line of sight: go and find one. */
  | 'seek'
  /** A windup ran out with the target out of sight: the cast failed. */
  | 'failed';

/** Remember that the caster cannot see its target (the route record carries
 *  the answer for the chase arm and the stall detector's reach). */
function noteBlocked(ctx: SimContext, mob: Entity, target: Entity): void {
  const route = chaseRouteFor(mob, target);
  route.sightClear = false;
  route.sightAt = ctx.tickCount + SIGHT_RECHECK_TICKS;
}

/**
 * Is the caster's line of sight to its target blocked? For a mob on the move.
 * Asked only within `reach` (its spell range) plus SIGHT_SEEK_MARGIN: farther
 * out the caster is only closing the distance, sight decides nothing yet, and
 * the query's cost grows with its length, so a caster crossing a whole
 * dungeon asks nothing. A blocked answer is held for SIGHT_RECHECK_TICKS (the
 * long case: a caster walking round a wall); a clear one is not held at all,
 * because a caster with a clear line takes its stance within a few ticks and
 * a mob that never lost sight then carries no record (Entity.chaseRoute stays
 * undefined, so the parity trace of every open-ground fight is unchanged).
 */
export function casterSightBlocked(
  ctx: SimContext,
  mob: Entity,
  target: Entity,
  reach: number,
): boolean {
  const held = mob.chaseRoute?.targetId === target.id ? mob.chaseRoute : undefined;
  if (dist2d(mob.pos, target.pos) > reach + SIGHT_SEEK_MARGIN) {
    if (held) held.sightClear = true;
    return false;
  }
  if (held && !held.sightClear && ctx.tickCount < held.sightAt) return true;
  if (ctx.hasLineOfSight(mob, target)) {
    if (held) held.sightClear = true;
    return false;
  }
  noteBlocked(ctx, mob, target);
  return true;
}

/** The last answer the mob holds about this target, without asking again
 *  (false for a mob that holds none: a standing caster with a clear line). */
export function lastSightBlocked(mob: Entity, target: Entity): boolean {
  const route = mob.chaseRoute;
  return route !== undefined && route.targetId === target.id && !route.sightClear;
}

/**
 * Judge a standing petSpell caster's tick BEFORE its ranged attack runs
 * (Sim.updateRangedPetAttack, whose timing this mirrors: a committed windup
 * releases on its tick, and a new cast begins on the tick the swing timer
 * runs out). Asks for a line of sight on those two ticks only.
 */
export function petSpellSightVerdict(
  ctx: SimContext,
  mob: Entity,
  target: Entity,
): CastSightVerdict {
  if (mob.rangedWindupReleaseTick != null) {
    if (ctx.tickCount < mob.rangedWindupReleaseTick) return 'cast';
    if (ctx.hasLineOfSight(mob, target)) return 'cast';
    // The windup ran out on a target it cannot see: nothing leaves its hand,
    // and the cast it did not get is not charged to its cadence.
    mob.rangedWindupReleaseTick = null;
    mob.swingTimer = Math.min(mob.swingTimer, CAST_SIGHT_RETRY_SECONDS);
    noteBlocked(ctx, mob, target);
    return 'failed';
  }
  if (mob.swingTimer - DT > 0) return 'cast';
  if (ctx.hasLineOfSight(mob, target)) return 'cast';
  noteBlocked(ctx, mob, target);
  return 'seek';
}
