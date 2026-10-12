// Line of sight for the trash kit's casts AT ONE PLAYER (the generic half of
// mob/cast_sight.ts, for real cast bars): a bolt, a mark, a sleep, a drowning
// column. Before this module only the brand asked for a line of sight; a Grave
// Bolt picked its victim through a wall and landed through it.
//
// The rule, applied by the driver (driver.ts) to every key listed here and to
// the keys a dungeon's extension lists (TrashKitExtension.sightKeys):
//   - the bar begins only at a player the caster can SEE: a hidden pick is
//     re-drawn among the players in sight, and when nobody in reach is in
//     sight the cast waits KIT_SIGHT_RETRY and looks again;
//   - a bar already running runs out whatever its victim does; if they are
//     out of sight when it ends the cast FAILS like a broken one (nothing
//     lands, the same cleanup an interrupt gets) and is handed back: it may
//     begin again KIT_SIGHT_RETRY later, once the caster sees someone.
// A player's own cast fails the same way (combat/casting_lifecycle.ts: refused
// at the start and at the finish, and a refused finish spends nothing).
//
// Not here, on purpose: area casts (a nova, a cone, a ring, a lane: the area
// is the telegraph), casts at an ally or a corpse, and the casts that carry
// their own authored sight rule (the brand, which keeps its cooldown when it
// fizzles; the Siren's lure, broken the moment she loses sight; the
// Sergeant's order, judged bolt by bolt).
//
// Cost: no query while a cast waits on its cooldown or on its own readiness;
// one when a bar would begin, one when it ends, and one a player in reach
// only when the first pick was hidden. Draws no rng; the hashed picks are
// unchanged whenever everyone is in sight.

import type { SimContext } from '../../sim_context';
import { dist2d, type Entity } from '../../types';

/** The driver's own keys that are a cast at one player. */
export const KIT_SIGHT_KEYS: ReadonlySet<string> = new Set(['bolt', 'eye', 'column', 'lullaby']);

/** Seconds a sight-bound cast waits before it looks for a victim again. */
export const KIT_SIGHT_RETRY = 0.5;
/** Players farther than this are never asked about (no kit cast reaches them). */
const KIT_SIGHT_REACH = 60;

/** Is `target` a living player the caster cannot see? (An ally, a corpse or
 *  no target at all is never hidden: those casts are not sight-bound.) */
export function kitVictimHidden(
  ctx: SimContext,
  mob: Entity,
  target: Entity | null | undefined,
): boolean {
  return !!target && target.kind === 'player' && !target.dead && !ctx.hasLineOfSight(mob, target);
}

/** The living players near the caster that it can see, in the order given. */
export function playersInSight(ctx: SimContext, mob: Entity, players: readonly Entity[]): Entity[] {
  return players.filter(
    (p) => !p.dead && dist2d(p.pos, mob.pos) <= KIT_SIGHT_REACH && ctx.hasLineOfSight(mob, p),
  );
}
