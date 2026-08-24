import { isRooted } from '../src/sim/combat/cc';
import { hasValkyrsCallingFlightAura } from '../src/sim/combat/paladin_valkyrs_calling_state';
import { isDelvePos, isRiftPos } from '../src/sim/data';
import {
  applyAirSteering,
  BACKPEDAL_MULT,
  isSwimming,
  wadeSpeedMult,
} from '../src/sim/player_motion';
import type { Sim } from '../src/sim/sim';
import { DT, type Entity, type MoveInput, RUN_SPEED } from '../src/sim/types';
import { waterLevelAt } from '../src/sim/world';
import {
  groundedMovementEndpointWithinInputBudgetY,
  groundedMovementEndpointWithinBudgetY,
  groundedMovementEndpointY,
  movementInputDirection,
} from './movement_position_reachability';

const MOVEMENT_POSITION_INITIAL_TOLERANCE_YD = 0.1;
const MOVEMENT_POSITION_COMPLETED_ENDPOINT_TOLERANCE_YD = 1e-6;
const MOVEMENT_POSITION_PATH_CREDIT_YD = 0.05;
const MOVEMENT_POSITION_AUTHORITY_WINDOW_SECONDS = 0.2;
const MOVEMENT_POSITION_MAX_SAMPLE_GAP_SECONDS = 0.5;
const airVelocity = { vx: 0, vz: 0 };

export interface MovementPositionSample {
  x: number;
  z: number;
}

export interface MovementPositionState extends MovementPositionSample {
  airVelocityTracked: boolean;
  airVx: number;
  airVz: number;
  clientAtMs: number;
  directionResidualX: number;
  directionResidualZ: number;
  lastDirectionX: number;
  lastDirectionZ: number;
  lastCompletedSegmentTick: number;
  pathCreditYd: number;
  serverY: number;
  suspendedAirborne: boolean;
}

export interface MovementPositionSession {
  pid: number;
  movementPositionState?: MovementPositionState | null;
}

function nextDirectionResidual(
  state: MovementPositionState,
  sample: MovementPositionSample,
  direction: { x: number; z: number } | null,
): { x: number; z: number } | null {
  const dx = sample.x - state.x;
  const dz = sample.z - state.z;
  if (Math.hypot(dx, dz) <= Number.EPSILON) {
    return { x: state.directionResidualX, z: state.directionResidualZ };
  }
  if (!direction) return null;
  const forward = dx * direction.x + dz * direction.z;
  if (forward < -Number.EPSILON) return null;
  const residual = {
    x: state.directionResidualX + dx - direction.x * forward,
    z: state.directionResidualZ + dz - direction.z * forward,
  };
  return Math.hypot(residual.x, residual.z) <= 0.01 ? residual : null;
}

function completedSegmentDirection(
  entity: Entity,
  sample: MovementPositionSample,
): { x: number; z: number } | null {
  if (
    Math.hypot(sample.x - entity.pos.x, sample.z - entity.pos.z) >
    MOVEMENT_POSITION_COMPLETED_ENDPOINT_TOLERANCE_YD
  ) {
    return null;
  }
  const dx = entity.pos.x - entity.prevPos.x;
  const dz = entity.pos.z - entity.prevPos.z;
  const distance = Math.hypot(dx, dz);
  return distance > Number.EPSILON ? { x: dx / distance, z: dz / distance } : null;
}

function expectedAirMovement(
  entity: Entity,
  input: MoveInput,
  wishSpeed: number,
  seconds: number,
  vx: number,
  vz: number,
): {
  direction: { x: number; z: number } | null;
  distance: number;
  vx: number;
  vz: number;
} {
  airVelocity.vx = vx;
  airVelocity.vz = vz;
  const wishDirection = movementInputDirection(entity, input);
  let dx = 0;
  let dz = 0;
  let remaining = seconds;
  while (remaining > Number.EPSILON) {
    const step = Math.min(DT, remaining);
    if (wishDirection && wishSpeed > 0) {
      applyAirSteering(airVelocity, wishDirection.x, wishDirection.z, wishSpeed, step);
    }
    dx += airVelocity.vx * step;
    dz += airVelocity.vz * step;
    remaining -= step;
  }
  const distance = Math.hypot(dx, dz);
  return {
    direction: distance > Number.EPSILON ? { x: dx / distance, z: dz / distance } : null,
    distance,
    vx: airVelocity.vx,
    vz: airVelocity.vz,
  };
}

export function parseMovementPositionSample(raw: unknown): MovementPositionSample | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    typeof value.z !== 'number' ||
    !Number.isFinite(value.z)
  ) {
    return null;
  }
  return { x: value.x, z: value.z };
}

function canTrackMovementPosition(sim: Sim, entity: Entity): boolean {
  const meta = sim.meta(entity.id);
  return (
    (!entity.dead || entity.ghost) &&
    !isRooted(entity) &&
    !isSwimming(entity, sim.cfg.seed) &&
    !entity.climbing &&
    entity.chargeTargetId === null &&
    !entity.leap &&
    entity.followTargetId === null &&
    !(entity.mountCastRemaining > 0 && entity.mountCastKey === '') &&
    meta?.mountRace?.phase !== 'countdown' &&
    !entity.auras.some((aura) => aura.kind === 'forced_move') &&
    !hasValkyrsCallingFlightAura(entity) &&
    !isDelvePos(entity.pos.x) &&
    !isRiftPos(entity.pos.x)
  );
}

function groundedPathEndpointY(
  sim: Sim,
  entity: Entity,
  from: MovementPositionSample & { y: number },
  to: MovementPositionSample,
): number | null {
  return groundedMovementEndpointY(sim, entity, from, to);
}

function adoptMovementPosition(
  sim: Sim,
  entity: Entity,
  sample: MovementPositionSample,
  serverY: number,
): void {
  entity.pos.x = sample.x;
  entity.pos.y = serverY;
  entity.pos.z = sample.z;
  sim.grid.update(entity);
  sim.playerGrid.update(entity);
}

function authorizedMovementSpeed(sim: Sim, entity: Entity, input: MoveInput): number {
  const forwardAxis = Number(input.forward) - Number(input.back);
  const strafeAxis = Number(input.strafeRight) - Number(input.strafeLeft);
  if (forwardAxis === 0 && strafeAxis === 0) return 0;
  const backpedalMultiplier = forwardAxis < 0 ? BACKPEDAL_MULT : 1;
  const feetDepth = waterLevelAt(entity.pos.x, entity.pos.z, sim.cfg.seed) - entity.pos.y;
  return RUN_SPEED * sim.moveSpeedMult(entity) * backpedalMultiplier * wadeSpeedMult(feetDepth);
}

export function applyMovementPositionSample(
  sim: Sim,
  session: MovementPositionSession,
  sample: MovementPositionSample | null,
  clientAtMs: number,
  input: MoveInput,
): boolean {
  if (!sample || !Number.isFinite(clientAtMs)) return false;
  const entity = sim.entities.get(session.pid);
  if (!entity || !canTrackMovementPosition(sim, entity)) {
    session.movementPositionState = null;
    return false;
  }

  const state = session.movementPositionState;
  if (!entity.onGround) {
    if (!state) {
      session.movementPositionState = null;
      return false;
    }
    const elapsedSeconds = Math.max(0, (clientAtMs - state.clientAtMs) / 1000);
    const creditedSeconds = Math.min(elapsedSeconds, MOVEMENT_POSITION_MAX_SAMPLE_GAP_SECONDS);
    const airMovement = expectedAirMovement(
      entity,
      input,
      authorizedMovementSpeed(sim, entity, input),
      creditedSeconds,
      state.airVelocityTracked ? state.airVx : entity.vx,
      state.airVelocityTracked ? state.airVz : entity.vz,
    );
    const availableDistance = state.pathCreditYd + airMovement.distance;
    const sampleDistance = Math.hypot(sample.x - state.x, sample.z - state.z);
    const completedDirection =
      state.lastCompletedSegmentTick === sim.tickCount
        ? null
        : completedSegmentDirection(entity, sample);
    const completedDirectionResidual = completedDirection
      ? nextDirectionResidual(state, sample, completedDirection)
      : null;
    const directionResidual =
      completedDirectionResidual ?? nextDirectionResidual(state, sample, airMovement.direction);
    const acceptedDirection = completedDirectionResidual
      ? completedDirection
      : airMovement.direction;
    if (sampleDistance > availableDistance || !directionResidual) {
      session.movementPositionState = null;
      return false;
    }
    state.x = sample.x;
    state.z = sample.z;
    state.clientAtMs = clientAtMs;
    state.directionResidualX = directionResidual.x;
    state.directionResidualZ = directionResidual.z;
    state.lastDirectionX = acceptedDirection?.x ?? 0;
    state.lastDirectionZ = acceptedDirection?.z ?? 0;
    state.airVelocityTracked = true;
    if (completedDirectionResidual) {
      state.airVx = entity.vx;
      state.airVz = entity.vz;
      state.lastCompletedSegmentTick = sim.tickCount;
    } else {
      state.airVx = airMovement.vx;
      state.airVz = airMovement.vz;
    }
    state.pathCreditYd = Math.max(
      0,
      Math.min(MOVEMENT_POSITION_PATH_CREDIT_YD, availableDistance - sampleDistance),
    );
    state.suspendedAirborne = true;
    return false;
  }

  if (!state) {
    const endpointY = groundedPathEndpointY(sim, entity, { ...entity.pos }, sample);
    if (
      Math.hypot(sample.x - entity.pos.x, sample.z - entity.pos.z) >
        MOVEMENT_POSITION_INITIAL_TOLERANCE_YD ||
      endpointY === null
    ) {
      return false;
    }
    session.movementPositionState = {
      ...sample,
      airVelocityTracked: false,
      airVx: entity.vx,
      airVz: entity.vz,
      clientAtMs,
      directionResidualX: 0,
      directionResidualZ: 0,
      lastDirectionX: 0,
      lastDirectionZ: 0,
      lastCompletedSegmentTick: -1,
      pathCreditYd: MOVEMENT_POSITION_PATH_CREDIT_YD,
      serverY: endpointY,
      suspendedAirborne: false,
    };
    adoptMovementPosition(sim, entity, sample, endpointY);
    return true;
  }

  const elapsedSeconds = Math.max(0, (clientAtMs - state.clientAtMs) / 1000);
  const creditedSeconds = Math.min(elapsedSeconds, MOVEMENT_POSITION_MAX_SAMPLE_GAP_SECONDS);
  const maxSpeed = authorizedMovementSpeed(sim, entity, input);
  const availableDistance = state.pathCreditYd + maxSpeed * creditedSeconds;
  const sampleDistance = Math.hypot(sample.x - state.x, sample.z - state.z);
  const authorityDistance = Math.hypot(sample.x - entity.pos.x, sample.z - entity.pos.z);
  const maxAuthorityDistance =
    MOVEMENT_POSITION_INITIAL_TOLERANCE_YD +
    RUN_SPEED * sim.moveSpeedMult(entity) * MOVEMENT_POSITION_AUTHORITY_WINDOW_SECONDS;
  const pathStart = state.suspendedAirborne
    ? { ...entity.pos }
    : { x: state.x, y: state.serverY, z: state.z };
  const inputDirection = movementInputDirection(entity, input);
  const completedDirection =
    inputDirection && state.lastCompletedSegmentTick !== sim.tickCount
      ? completedSegmentDirection(entity, sample)
      : null;
  const landingDirection =
    state.lastDirectionX !== 0 || state.lastDirectionZ !== 0
      ? { x: state.lastDirectionX, z: state.lastDirectionZ }
      : inputDirection;
  const landingResidual = state.suspendedAirborne
    ? (nextDirectionResidual(state, sample, completedDirection) ??
      nextDirectionResidual(state, sample, landingDirection))
    : null;
  let endpointY = state.suspendedAirborne
    ? groundedMovementEndpointWithinBudgetY(
        sim,
        entity,
        pathStart,
        sample,
        Math.max(availableDistance, authorityDistance),
      )
    : groundedMovementEndpointWithinInputBudgetY(
        sim,
        entity,
        pathStart,
        sample,
        availableDistance,
        maxSpeed * creditedSeconds,
        state.pathCreditYd,
        input,
      );
  let usedCompletedSegment = false;
  if (endpointY === null && !state.suspendedAirborne && completedDirection) {
    endpointY = groundedMovementEndpointWithinInputBudgetY(
      sim,
      entity,
      pathStart,
      sample,
      availableDistance,
      maxSpeed * creditedSeconds,
      state.pathCreditYd,
      input,
      completedDirection,
    );
    usedCompletedSegment = endpointY !== null;
  }
  if (
    (state.suspendedAirborne &&
      (sampleDistance > availableDistance + Number.EPSILON || !landingResidual)) ||
    authorityDistance > maxAuthorityDistance ||
    endpointY === null
  ) {
    return false;
  }

  session.movementPositionState = {
    ...sample,
    airVelocityTracked: false,
    airVx: entity.vx,
    airVz: entity.vz,
    clientAtMs,
    directionResidualX: 0,
    directionResidualZ: 0,
    lastDirectionX: 0,
    lastDirectionZ: 0,
    lastCompletedSegmentTick:
      usedCompletedSegment || (state.suspendedAirborne && landingResidual && completedDirection)
        ? sim.tickCount
        : state.lastCompletedSegmentTick,
    pathCreditYd: Math.max(
      0,
      Math.min(MOVEMENT_POSITION_PATH_CREDIT_YD, availableDistance - sampleDistance),
    ),
    serverY: endpointY,
    suspendedAirborne: false,
  };
  adoptMovementPosition(sim, entity, sample, endpointY);
  return true;
}

export function resetMovementPosition(session: MovementPositionSession): void {
  session.movementPositionState = null;
}
