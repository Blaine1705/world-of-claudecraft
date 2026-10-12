// Airborne knockback (Typhoon): instead of the instantaneous grounded shove in
// knockback.ts, an enemy PLAYER is thrown along a low ballistic arc through
// the shared movement kernel (player_motion.ts), the same way Trailbreak
// launches the hunter, straight away from the source. On level or falling
// ground it is the flat hop (crests about a yard, covers the full distance on
// level ground); Trailbreak's planner (hunter_trailbreak_arc.ts) lifts it over
// rising ground and cuts it short at a wall. Because the body is really
// airborne, a throw that crosses a ledge keeps flying in its straight line
// past the edge and falls, and the kernel's ordinary fall damage applies on
// landing.
//
// While the throw is in flight the body carries `launchedBy`:
//   - the kernel turns air steering off, so the victim cannot curl the throw
//     back onto the ledge (the line stays straight), and clears the field on
//     the first landing on walkable ground (a landing on an unwalkable slope
//     keeps it: the steep slide off the lip that follows is still the throw);
//   - a fall that lands inside the credit window is dealt BY the source
//     (`launchFallCredit`, read by the Sim's fall-damage binding), so a fatal
//     fall is the druid's kill: kill credit, the death recap, honor and the
//     world-PvP gold stake all follow the ordinary killer path in
//     combat/damage.ts handleDeath.
//
// Mobs, pets, swimmers, ferry passengers and bodies already in a scripted
// movement mode keep the grounded shove: none of them run the player kernel's
// free-flight arm. Draws no rng.

import { knockbackDistanceAfterGuards } from '../knockback';
import { PLAYER_BODY_RADIUS } from '../pathfind';
import { floorHeightAt } from '../physics';
import { GRAVITY, isSwimming, JUMP_VELOCITY } from '../player_motion';
import type { SimContext } from '../sim_context';
import { type DamageEventKind, DT, type Entity } from '../types';
import { trailbreakArcFor, trailbreakFlatTicks } from './hunter_trailbreak_arc';

/** Seconds after a launch during which a fall still credits the launcher. A
 *  long drop off a cliff is airborne for a few seconds; past this the body has
 *  long since landed somewhere and any later fall is its own. */
export const LAUNCH_FALL_CREDIT_SECONDS = 10;
/** Sample spacing and floor margin for the flat-hop clearance check. */
const LAUNCH_SWEEP_STEP = 0.5;
const LAUNCH_CLEARANCE = 0.05;

/** Can this body take the airborne arc, or must it take the grounded shove? */
function launchable(ctx: SimContext, target: Entity): boolean {
  if (target.kind !== 'player' || target.dead) return false;
  const meta = ctx.players.get(target.id);
  if (!meta || meta.vehicle) return false;
  if (target.ferryRide || target.leap || target.climb || target.valkyrsCalling) return false;
  if (target.chargeTargetId !== null) return false;
  return !isSwimming(target, ctx.cfg.seed);
}

/**
 * Knock `target` up to `distance` yards straight away from `source`. Players
 * are launched into the air (see the header); everything else takes the
 * grounded shove. Returns the yards the throw is planned to cover (0 when an
 * immunity or resistance held the target in place).
 */
export function applyLaunchKnockback(
  ctx: SimContext,
  source: Entity,
  target: Entity,
  distance: number,
): number {
  if (!launchable(ctx, target)) return ctx.applyKnockback(source, target, distance);
  const yards = knockbackDistanceAfterGuards(ctx, source, target, distance);
  if (yards <= 0) return 0;
  let dx = target.pos.x - source.pos.x;
  let dz = target.pos.z - source.pos.z;
  if (Math.hypot(dx, dz) < 1e-4) {
    // Exactly overlapping: throw along the source's facing, as the grounded
    // shove does, so the direction is stable.
    dx = Math.sin(source.facing);
    dz = Math.cos(source.facing);
  }
  // The planner leaps along the BACK of a facing f, (-sin f, -cos f), so the
  // facing whose back points away from the source is the reverse heading.
  const facing = Math.atan2(-dx, -dz);
  // Airborne BEFORE the plan, as Trailbreak does: the sweep resolves the body
  // with the mantle lift the kernel grants a flying body.
  target.onGround = false;
  const arc = trailbreakArcFor(ctx, target, yards, facing);
  const dirX = -Math.sin(facing);
  const dirZ = -Math.cos(facing);
  const speed = yards / (trailbreakFlatTicks() * DT);
  if (
    arc.distance >= yards - 1e-6 &&
    arc.landing.y <= target.pos.y &&
    flatHopClears(ctx.cfg.seed, target, dirX, dirZ, speed, yards)
  ) {
    // Clear line over level or falling ground: the fixed flat-hop launch, not
    // the planner's aimed arc. The planner would slow the throw to land it
    // exactly `yards` out on the low ground; a real shove keeps its speed, so
    // a victim thrown off a ledge sails on past it in the same straight line
    // and drops the full height.
    target.vx = dirX * speed;
    target.vz = dirZ * speed;
    target.vy = JUMP_VELOCITY;
  } else {
    // Rising ground or a wall in the way: the planner's lifted or shortened
    // arc, so the throw carries up the slope or stops at the face.
    target.vx = arc.vx;
    target.vz = arc.vz;
    target.vy = arc.vy;
  }
  target.jumping = true;
  target.fallStartY = target.pos.y;
  target.launchedBy = { sourceId: source.id, until: ctx.time + LAUNCH_FALL_CREDIT_SECONDS };
  return arc.distance;
}

/** Does the fixed flat hop (JUMP_VELOCITY up, `speed` along the line) pass
 *  over every floor between the feet and `yards` out? A bump or a prop top
 *  above that path means the planner's lifted arc is needed instead. */
function flatHopClears(
  seed: number,
  target: Entity,
  dirX: number,
  dirZ: number,
  speed: number,
  yards: number,
): boolean {
  for (let d = LAUNCH_SWEEP_STEP; d < yards; d += LAUNCH_SWEEP_STEP) {
    const t = d / speed;
    const hopY = target.pos.y + JUMP_VELOCITY * t - (GRAVITY * t * t) / 2;
    const x = target.pos.x + dirX * d;
    const z = target.pos.z + dirZ * d;
    if (floorHeightAt(seed, x, z, PLAYER_BODY_RADIUS, hopY) > hopY - LAUNCH_CLEARANCE) {
      return false;
    }
  }
  return true;
}

/**
 * Who a fall that is landing right now should be credited to: the source of
 * the launch the body is still riding, while that launch is inside its credit
 * window, the source is still in the world and alive, and the two are still
 * hostile (a duel that ended mid-air credits nobody). Null for every ordinary
 * fall, which stays sourceless environmental damage.
 */
export function launchFallCredit(ctx: SimContext, target: Entity): Entity | null {
  const launch = target.launchedBy;
  if (!launch || ctx.time > launch.until) return null;
  const source = ctx.entities.get(launch.sourceId);
  if (!source || source.dead || source.id === target.id) return null;
  return ctx.isHostileTo(source, target) ? source : null;
}

/**
 * The Sim's binding for the movement kernel's one damage call (fall damage,
 * player_motion.ts). An ordinary fall stays exactly what it always was: a
 * sourceless direct hit. A fall the target is still riding a hostile launch
 * into is dealt BY the launcher (`launchFallCredit`), so kill credit, honor
 * and the gold stake follow the normal killer path; it is passed as incidental
 * (not direct) damage whose amount is already final, so the launcher's own
 * damage modifiers never scale a fall.
 */
export function dealKernelDamage(
  ctx: SimContext,
  target: Entity,
  amount: number,
  crit: boolean,
  school: string,
  ability: string | null,
  kind: DamageEventKind,
  noRage: boolean,
): void {
  const by = ability === 'Falling' ? launchFallCredit(ctx, target) : null;
  if (by === null) {
    ctx.dealDamage(null, target, amount, crit, school, ability, kind, noRage);
    return;
  }
  ctx.dealDamage(
    by,
    target,
    amount,
    crit,
    school,
    ability,
    kind,
    noRage,
    undefined,
    false,
    false,
    true,
  );
}
