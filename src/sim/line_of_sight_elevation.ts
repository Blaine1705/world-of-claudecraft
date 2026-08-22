import { lineOfSightClear, supportHeightAt } from './colliders';
import { DUNGEON_X_THRESHOLD } from './data';
import { PLAYER_BODY_RADIUS } from './pathfind';
import type { Entity, Vec3 } from './types';

// Matches the movement support tolerance: a larger gap is airborne, not footing.
export const SIGHT_SUPPORT_EPSILON = 1e-3;

function trustedSupportedSightFeet(seed: number, pos: Vec3): number | undefined {
  if (pos.x > DUNGEON_X_THRESHOLD) return undefined;
  const support = supportHeightAt(
    seed,
    pos.x,
    pos.z,
    PLAYER_BODY_RADIUS,
    pos.y + SIGHT_SUPPORT_EPSILON,
  );
  return Math.abs(support - pos.y) <= SIGHT_SUPPORT_EPSILON ? pos.y : undefined;
}

export function trustedGroundedSightFeet(seed: number, entity: Entity): number | undefined {
  if (
    entity.kind !== 'player' ||
    !entity.onGround ||
    entity.jumping ||
    entity.pos.x > DUNGEON_X_THRESHOLD
  ) {
    return undefined;
  }
  return trustedSupportedSightFeet(seed, entity.pos);
}

export function entityLineOfSightClear(
  seed: number,
  source: Entity,
  target: Entity,
  r = 0.05,
  delveModules?: readonly string[],
  riftToken = 0,
): boolean {
  const trustedFeet = {
    from: trustedGroundedSightFeet(seed, source),
    to: trustedGroundedSightFeet(seed, target),
  };
  return lineOfSightClear(seed, source.pos, target.pos, r, delveModules, riftToken, trustedFeet);
}

export function entityToBodyLineOfSightClear(
  seed: number,
  source: Entity,
  body: Vec3,
  r = 0.05,
  delveModules?: readonly string[],
  riftToken = 0,
): boolean {
  const trustedFeet = {
    from: trustedGroundedSightFeet(seed, source),
    to: trustedSupportedSightFeet(seed, body),
  };
  return lineOfSightClear(seed, source.pos, body, r, delveModules, riftToken, trustedFeet);
}
