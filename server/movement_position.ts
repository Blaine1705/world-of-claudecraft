import { isRooted } from '../src/sim/combat/cc';
import { hasValkyrsCallingFlightAura } from '../src/sim/combat/paladin_valkyrs_calling_state';
import { isDelvePos, isRiftPos } from '../src/sim/data';
import { PLAYER_BODY_RADIUS } from '../src/sim/pathfind';
import { BACKPEDAL_MULT, wadeSpeedMult } from '../src/sim/player_motion';
import type { Sim } from '../src/sim/sim';
import { type Entity, type MoveInput, RUN_SPEED } from '../src/sim/types';
import { waterLevelAt } from '../src/sim/world';

const MOVEMENT_POSITION_INITIAL_TOLERANCE_YD = 0.1;
const MOVEMENT_POSITION_PATH_CREDIT_YD = 0.05;
const MOVEMENT_POSITION_COLLISION_TOLERANCE_YD = 0.01;
const MOVEMENT_POSITION_AUTHORITY_WINDOW_SECONDS = 0.2;
const MOVEMENT_POSITION_MAX_SAMPLE_GAP_SECONDS = 0.5;

export interface MovementPositionSample {
  x: number;
  z: number;
}

export interface MovementPositionState extends MovementPositionSample {
  clientAtMs: number;
  pathCreditYd: number;
}

export interface MovementPositionSession {
  pid: number;
  movementPositionState?: MovementPositionState | null;
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

function canApplyMovementPosition(entity: Entity): boolean {
  return (
    entity.onGround &&
    (!entity.dead || entity.ghost) &&
    !isRooted(entity) &&
    !entity.climbing &&
    entity.chargeTargetId === null &&
    !entity.leap &&
    entity.followTargetId === null &&
    !hasValkyrsCallingFlightAura(entity) &&
    !isDelvePos(entity.pos.x) &&
    !isRiftPos(entity.pos.x)
  );
}

function pathIsClear(
  sim: Sim,
  entity: Entity,
  from: MovementPositionSample,
  to: MovementPositionSample,
): boolean {
  const resolved = sim.ctx.resolvePlayerMove(
    from.x,
    from.z,
    to.x,
    to.z,
    PLAYER_BODY_RADIUS,
    entity,
    false,
  );
  return (
    Math.hypot(resolved.x - to.x, resolved.z - to.z) <= MOVEMENT_POSITION_COLLISION_TOLERANCE_YD
  );
}

function adoptMovementPosition(sim: Sim, entity: Entity, sample: MovementPositionSample): void {
  entity.pos.x = sample.x;
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
  if (!entity || !canApplyMovementPosition(entity)) {
    session.movementPositionState = null;
    return false;
  }

  const state = session.movementPositionState;
  if (!state) {
    if (
      Math.hypot(sample.x - entity.pos.x, sample.z - entity.pos.z) >
        MOVEMENT_POSITION_INITIAL_TOLERANCE_YD ||
      !pathIsClear(sim, entity, entity.pos, sample)
    ) {
      return false;
    }
    session.movementPositionState = {
      ...sample,
      clientAtMs,
      pathCreditYd: MOVEMENT_POSITION_PATH_CREDIT_YD,
    };
    adoptMovementPosition(sim, entity, sample);
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
  if (
    sampleDistance > availableDistance + Number.EPSILON ||
    authorityDistance > maxAuthorityDistance ||
    !pathIsClear(sim, entity, state, sample)
  ) {
    return false;
  }

  session.movementPositionState = {
    ...sample,
    clientAtMs,
    pathCreditYd: Math.min(MOVEMENT_POSITION_PATH_CREDIT_YD, availableDistance - sampleDistance),
  };
  adoptMovementPosition(sim, entity, sample);
  return true;
}

export function resetMovementPosition(session: MovementPositionSession): void {
  session.movementPositionState = null;
}
