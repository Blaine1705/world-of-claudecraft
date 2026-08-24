import type { Sim } from '../src/sim/sim';
import { emptyMoveInput, type MoveInput, RUN_SPEED } from '../src/sim/types';

export const MOVEMENT_STOP_MAX_SECONDS = 1.5;
export const MOVEMENT_STOP_MAX_LEAD_YD = RUN_SPEED * MOVEMENT_STOP_MAX_SECONDS + 0.05;
const MOVEMENT_STOP_PATH_TOLERANCE_YD = 0.03;
const MOVEMENT_STOP_REACHED_TOLERANCE_YD = 0.01;

export interface MovementStopTarget {
  x: number;
  z: number;
}

export interface MovementStopSegment {
  x: number;
  y: number;
  z: number;
}

export interface PendingMovementStop {
  target: MovementStopTarget;
  expiresAt: number;
  before: MovementStopSegment;
}

export interface MovementStopSession {
  pid: number;
  pendingMovementStop?: PendingMovementStop | null;
}

export type MovementStopResolution =
  | { kind: 'pending' }
  | { kind: 'reject' }
  | { kind: 'reached'; x: number; y: number; z: number };

export function parseMovementStopTarget(
  raw: unknown,
  origin: Pick<MovementStopSegment, 'x' | 'z'>,
): MovementStopTarget | null {
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
  if (Math.hypot(value.x - origin.x, value.z - origin.z) > MOVEMENT_STOP_MAX_LEAD_YD) return null;
  return { x: value.x, z: value.z };
}

export function resolveMovementStop(
  target: MovementStopTarget,
  before: MovementStopSegment,
  after: MovementStopSegment,
): MovementStopResolution {
  const toTargetX = target.x - before.x;
  const toTargetZ = target.z - before.z;
  const targetDistance = Math.hypot(toTargetX, toTargetZ);
  if (targetDistance <= MOVEMENT_STOP_REACHED_TOLERANCE_YD) {
    return { kind: 'reached', x: target.x, y: before.y, z: target.z };
  }

  const segmentX = after.x - before.x;
  const segmentZ = after.z - before.z;
  const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
  if (segmentLengthSq <= 1e-10) return { kind: 'pending' };

  const projection = (toTargetX * segmentX + toTargetZ * segmentZ) / segmentLengthSq;
  if (projection < 0) return { kind: 'reject' };
  const closestX = before.x + segmentX * projection;
  const closestZ = before.z + segmentZ * projection;
  if (Math.hypot(target.x - closestX, target.z - closestZ) > MOVEMENT_STOP_PATH_TOLERANCE_YD) {
    return { kind: 'reject' };
  }
  if (projection > 1) return { kind: 'pending' };

  return {
    kind: 'reached',
    x: target.x,
    y: before.y + (after.y - before.y) * projection,
    z: target.z,
  };
}

export function beginMovementStop(
  sim: Sim,
  session: MovementStopSession,
  target: MovementStopTarget,
  neutralInput: MoveInput,
): boolean {
  const entity = sim.entities.get(session.pid);
  const meta = sim.meta(session.pid);
  if (!entity || !meta) return false;
  const recentResolution = resolveMovementStop(target, entity.prevPos, entity.pos);
  if (recentResolution.kind === 'reject') return false;
  if (recentResolution.kind === 'reached') {
    entity.pos.x = recentResolution.x;
    entity.pos.y = recentResolution.y;
    entity.pos.z = recentResolution.z;
    sim.grid.update(entity);
    sim.playerGrid.update(entity);
    session.pendingMovementStop = null;
    Object.assign(meta.moveInput, neutralInput);
    return true;
  }
  session.pendingMovementStop = {
    target,
    expiresAt: sim.time + MOVEMENT_STOP_MAX_SECONDS,
    before: { ...entity.pos },
  };
  return true;
}

export function prepareMovementStops(sim: Sim, sessions: Iterable<MovementStopSession>): void {
  for (const session of sessions) {
    const pending = session.pendingMovementStop;
    if (!pending) continue;
    const entity = sim.entities.get(session.pid);
    const meta = sim.meta(session.pid);
    if (!entity || !meta || sim.time >= pending.expiresAt) {
      if (meta) Object.assign(meta.moveInput, emptyMoveInput());
      session.pendingMovementStop = null;
      continue;
    }
    pending.before.x = entity.pos.x;
    pending.before.y = entity.pos.y;
    pending.before.z = entity.pos.z;
  }
}

export function finishMovementStops(sim: Sim, sessions: Iterable<MovementStopSession>): void {
  for (const session of sessions) {
    const pending = session.pendingMovementStop;
    if (!pending) continue;
    const entity = sim.entities.get(session.pid);
    const meta = sim.meta(session.pid);
    if (!entity || !meta) {
      session.pendingMovementStop = null;
      continue;
    }
    const resolution = resolveMovementStop(pending.target, pending.before, entity.pos);
    if (resolution.kind === 'pending') continue;
    if (resolution.kind === 'reached') {
      entity.pos.x = resolution.x;
      entity.pos.y = resolution.y;
      entity.pos.z = resolution.z;
      sim.grid.update(entity);
      sim.playerGrid.update(entity);
    }
    Object.assign(meta.moveInput, emptyMoveInput());
    session.pendingMovementStop = null;
  }
}
