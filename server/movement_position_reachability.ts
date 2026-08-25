import { isInstancedRegion } from '../src/sim/colliders';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import {
  type CharacterMoveParams,
  type CharacterMoveResult,
  floorHeightAt,
  MAX_STEP_HEIGHT,
  moveCharacter,
} from '../src/sim/physics';
import { applyGroundedStandoff, groundedSurfaceY, isSwimmingAt } from '../src/sim/player_motion';
import type { Sim } from '../src/sim/sim';
import { DT, type Entity, type MoveInput, TURN_SPEED } from '../src/sim/types';

const MOVEMENT_POSITION_COLLISION_TOLERANCE_YD = 0.01;

const moveParams: CharacterMoveParams = {
  seed: 0,
  radius: PLAYER_BODY_RADIUS,
  stepHeight: MAX_STEP_HEIGHT,
  maxSlope: PLAYER_MAX_CLIMB_SLOPE,
  grounded: true,
  swimming: false,
  ignoreFences: false,
};
const moveOut: CharacterMoveResult = { x: 0, y: 0, z: 0, blocked: false, stepped: 0 };
const standoffOut = { x: 0, y: 0, z: 0 };

export interface GroundedMovementPoint {
  x: number;
  y: number;
  z: number;
}

export function movementInputDirection(
  entity: Entity,
  input: MoveInput,
): { x: number; z: number } | null {
  let localX = Number(input.strafeRight) - Number(input.strafeLeft);
  let localZ = Number(input.forward) - Number(input.back);
  const length = Math.hypot(localX, localZ);
  if (length === 0) return null;
  localX /= length;
  localZ /= length;
  const facing =
    entity.facing + (Number(input.turnLeft) - Number(input.turnRight)) * TURN_SPEED * DT;
  const sin = Math.sin(facing);
  const cos = Math.cos(facing);
  return {
    x: localZ * sin - localX * cos,
    z: localZ * cos + localX * sin,
  };
}

export function movementSampleFollowsDirection(
  from: { x: number; z: number },
  to: { x: number; z: number },
  direction: { x: number; z: number } | null,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= Number.EPSILON) return true;
  if (!direction) return false;
  const forward = dx * direction.x + dz * direction.z;
  const sideways = Math.abs(dx * direction.z - dz * direction.x);
  return forward >= -Number.EPSILON && sideways <= distance * 1e-6;
}

function inputPathMatchTolerance(
  from: { x: number; z: number },
  to: { x: number; z: number },
): number {
  return Math.min(
    MOVEMENT_POSITION_COLLISION_TOLERANCE_YD,
    Math.max(Number.EPSILON, Math.hypot(to.x - from.x, to.z - from.z) * 1e-4),
  );
}

function endpointMatchesInputCollisionPath(
  sim: Sim,
  entity: Entity,
  from: GroundedMovementPoint,
  to: { x: number; z: number },
  direction: { x: number; z: number },
  nominalDistance: number,
  distanceSlack: number,
): boolean {
  const candidates = [
    nominalDistance,
    Math.max(0, nominalDistance - distanceSlack),
    nominalDistance + distanceSlack,
  ];
  for (const distance of candidates) {
    if (isInstancedRegion(from.x)) {
      const resolved = sim.ctx.resolvePlayerMove(
        from.x,
        from.z,
        from.x + direction.x * distance,
        from.z + direction.z * distance,
        PLAYER_BODY_RADIUS,
        entity,
        false,
      );
      if (Math.hypot(resolved.x - to.x, resolved.z - to.z) <= inputPathMatchTolerance(from, to)) {
        return true;
      }
      continue;
    }
    moveParams.seed = sim.cfg.seed;
    moveCharacter(
      moveParams,
      from.x,
      from.y,
      from.z,
      direction.x * distance,
      direction.z * distance,
      moveOut,
    );
    const feetY = moveOut.stepped > 0 ? moveOut.y : from.y;
    const supportY = floorHeightAt(sim.cfg.seed, moveOut.x, moveOut.z, PLAYER_BODY_RADIUS, feetY);
    const surfaceY = groundedSurfaceY(
      sim.cfg.seed,
      from.x,
      from.z,
      moveOut.x,
      moveOut.z,
      feetY,
      supportY,
    );
    standoffOut.x = moveOut.x;
    standoffOut.y = surfaceY ?? feetY;
    standoffOut.z = moveOut.z;
    applyGroundedStandoff(
      {
        seed: sim.cfg.seed,
        resolveMove: (fromX, fromZ, nextX, nextZ, radius, movingEntity, ignoreFences) =>
          sim.ctx.resolvePlayerMove(fromX, fromZ, nextX, nextZ, radius, movingEntity, ignoreFences),
      },
      entity,
      from.x,
      from.z,
      standoffOut,
      surfaceY !== null,
      direction.x,
      direction.z,
      distance,
      surfaceY !== null,
    );
    if (
      Math.hypot(standoffOut.x - to.x, standoffOut.z - to.z) <= inputPathMatchTolerance(from, to)
    ) {
      return true;
    }
  }
  return false;
}

export function groundedMovementEndpointY(
  sim: Sim,
  entity: Entity,
  from: GroundedMovementPoint,
  to: { x: number; z: number },
): number | null {
  if (isInstancedRegion(from.x)) {
    const resolved = sim.ctx.resolvePlayerMove(
      from.x,
      from.z,
      to.x,
      to.z,
      PLAYER_BODY_RADIUS,
      entity,
      false,
    );
    return Math.hypot(resolved.x - to.x, resolved.z - to.z) <=
      MOVEMENT_POSITION_COLLISION_TOLERANCE_YD
      ? from.y
      : null;
  }

  moveParams.seed = sim.cfg.seed;
  moveCharacter(moveParams, from.x, from.y, from.z, to.x - from.x, to.z - from.z, moveOut);
  const feetY = moveOut.stepped > 0 ? moveOut.y : from.y;
  const supportY = floorHeightAt(sim.cfg.seed, moveOut.x, moveOut.z, PLAYER_BODY_RADIUS, feetY);
  const endpointY = groundedSurfaceY(
    sim.cfg.seed,
    from.x,
    from.z,
    moveOut.x,
    moveOut.z,
    feetY,
    supportY,
  );
  if (
    Math.hypot(moveOut.x - to.x, moveOut.z - to.z) > MOVEMENT_POSITION_COLLISION_TOLERANCE_YD ||
    endpointY === null ||
    isSwimmingAt(moveOut.x, endpointY, moveOut.z, sim.cfg.seed)
  ) {
    return null;
  }
  return endpointY;
}

export function groundedMovementEndpointWithinBudgetY(
  sim: Sim,
  entity: Entity,
  from: GroundedMovementPoint,
  to: { x: number; z: number },
  availableDistance: number,
): number | null {
  const endpointY = groundedMovementEndpointY(sim, entity, from, to);
  if (endpointY === null) return null;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= availableDistance + Number.EPSILON) return endpointY;
  if (distance === 0 || isInstancedRegion(from.x)) return null;

  moveParams.seed = sim.cfg.seed;
  moveCharacter(
    moveParams,
    from.x,
    from.y,
    from.z,
    (dx / distance) * availableDistance,
    (dz / distance) * availableDistance,
    moveOut,
  );
  return Math.hypot(moveOut.x - to.x, moveOut.z - to.z) <= MOVEMENT_POSITION_COLLISION_TOLERANCE_YD
    ? endpointY
    : null;
}

export function groundedMovementEndpointWithinInputBudgetY(
  sim: Sim,
  entity: Entity,
  from: GroundedMovementPoint,
  to: { x: number; z: number },
  availableDistance: number,
  nominalDistance: number,
  distanceSlack: number,
  input: MoveInput,
  directionOverride?: { x: number; z: number },
): number | null {
  const endpointY = groundedMovementEndpointY(sim, entity, from, to);
  if (endpointY === null) return null;
  const direction = directionOverride ?? movementInputDirection(entity, input);
  if (!direction) return movementSampleFollowsDirection(from, to, null) ? endpointY : null;

  if (isInstancedRegion(from.x)) {
    if (
      movementSampleFollowsDirection(from, to, direction) &&
      Math.hypot(to.x - from.x, to.z - from.z) <= availableDistance + Number.EPSILON
    ) {
      return endpointY;
    }
    return endpointMatchesInputCollisionPath(
      sim,
      entity,
      from,
      to,
      direction,
      nominalDistance,
      distanceSlack,
    )
      ? endpointY
      : null;
  }

  moveParams.seed = sim.cfg.seed;
  moveCharacter(moveParams, from.x, from.y, from.z, to.x - from.x, to.z - from.z, moveOut);
  const directDistance = Math.hypot(to.x - from.x, to.z - from.z);
  if (
    !moveOut.blocked &&
    moveOut.stepped <= 0 &&
    directDistance <= availableDistance + Number.EPSILON &&
    movementSampleFollowsDirection(from, to, direction)
  ) {
    return endpointY;
  }
  return endpointMatchesInputCollisionPath(
    sim,
    entity,
    from,
    to,
    direction,
    nominalDistance,
    distanceSlack,
  )
    ? endpointY
    : null;
}
