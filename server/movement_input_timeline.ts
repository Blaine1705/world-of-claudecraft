import { isStunned } from '../src/sim/combat/cc';
import { hasTranslationalMoveInput } from '../src/sim/move_input';
import { ONLINE_MOVEMENT_INPUT_BUFFER_MS } from '../src/sim/movement_timing';
import type { Sim } from '../src/sim/sim';
import type { MoveInput } from '../src/sim/types';
import {
  applyMovementPositionSample,
  disableMovementPosition,
  type MovementPositionSample,
  type MovementPositionSession,
  parseMovementPositionSample,
  resetMovementPosition,
} from './movement_position';
import {
  beginMovementStop,
  type MovementStopSession,
  type MovementStopTarget,
  parseMovementStopTarget,
} from './movement_stop';

const MAX_BUFFERED_MOVEMENT_FRAMES = 64;

export interface BufferedMovementFrame {
  input: MoveInput;
  facing: number | null;
  position: MovementPositionSample | null;
  clientAtMs: number;
  stop: MovementStopTarget | null;
  seq: number | null;
  applyAt: number;
}

export interface MovementTimelineState {
  clientOriginMs: number;
  serverOrigin: number;
  lastClientAtMs: number;
  lastApplyAt: number;
}

export interface MovementTimelineSession extends MovementStopSession, MovementPositionSession {
  lastInputSeq?: number;
  movementTimeline?: MovementTimelineState | null;
  pendingMovementFrames?: BufferedMovementFrame[];
}

export function bufferMovementFrame(
  sim: Sim,
  session: MovementTimelineSession,
  clientAtMs: unknown,
  input: MoveInput,
  facing: number | null,
  rawStop: unknown,
  rawSeq?: unknown,
  rawPosition?: unknown,
): boolean {
  if (typeof clientAtMs !== 'number' || !Number.isFinite(clientAtMs)) return false;
  const entity = sim.entities.get(session.pid);
  if (!entity) return false;
  if (!session.pendingMovementFrames) session.pendingMovementFrames = [];
  const pending = session.pendingMovementFrames;
  if (pending.length >= MAX_BUFFERED_MOVEMENT_FRAMES) {
    pending.length = 0;
    session.movementTimeline = null;
    disableMovementPosition(session);
    return false;
  }

  const bufferSeconds = ONLINE_MOVEMENT_INPUT_BUFFER_MS / 1000;
  let timeline = session.movementTimeline;
  if (!timeline) {
    timeline = {
      clientOriginMs: clientAtMs,
      serverOrigin: sim.time + bufferSeconds,
      lastClientAtMs: clientAtMs,
      lastApplyAt: sim.time + bufferSeconds,
    };
    session.movementTimeline = timeline;
  }
  const monotonicClientAtMs = Math.max(timeline.lastClientAtMs, clientAtMs);
  const clientScheduledAt =
    timeline.serverOrigin + (monotonicClientAtMs - timeline.clientOriginMs) / 1000;
  const applyAt = Math.max(timeline.lastApplyAt, clientScheduledAt);
  timeline.lastClientAtMs = monotonicClientAtMs;
  timeline.lastApplyAt = applyAt;
  pending.push({
    input: { ...input },
    facing,
    position: parseMovementPositionSample(rawPosition),
    clientAtMs: monotonicClientAtMs,
    stop: parseMovementStopTarget(rawStop, entity.pos),
    seq:
      typeof rawSeq === 'number' && Number.isFinite(rawSeq) && rawSeq > 0
        ? Math.floor(rawSeq)
        : null,
    applyAt,
  });
  return true;
}

export function applyBufferedMovementFrames(
  sim: Sim,
  sessions: Iterable<MovementTimelineSession>,
): void {
  for (const session of sessions) {
    const pending = session.pendingMovementFrames;
    if (!pending?.length) continue;
    const entity = sim.entities.get(session.pid);
    const meta = sim.meta(session.pid);
    if (!entity || !meta) {
      pending.length = 0;
      continue;
    }
    while (pending.length > 0 && sim.time + 1e-9 >= pending[0].applyAt) {
      const frame = pending.shift();
      if (!frame) continue;
      const continuesPendingStop =
        session.pendingMovementStop && !hasTranslationalMoveInput(frame.input);
      const wasTranslating = hasTranslationalMoveInput(meta.moveInput);
      applyMovementPositionSample(sim, session, frame.position, frame.clientAtMs, meta.moveInput);
      const stopTarget =
        !continuesPendingStop &&
        entity.onGround &&
        !frame.input.jump &&
        wasTranslating &&
        !hasTranslationalMoveInput(frame.input)
          ? frame.stop
          : null;
      if (stopTarget) {
        if (!beginMovementStop(sim, session, stopTarget, frame.input)) {
          session.pendingMovementStop = null;
          Object.assign(meta.moveInput, frame.input);
        }
      } else if (!continuesPendingStop) {
        session.pendingMovementStop = null;
        Object.assign(meta.moveInput, frame.input);
      }
      if (frame.facing !== null && (!entity.dead || entity.ghost) && !isStunned(entity)) {
        entity.facing = frame.facing;
      }
      if (frame.seq !== null) {
        session.lastInputSeq = Math.max(session.lastInputSeq ?? 0, frame.seq);
      }
    }
  }
}

export function resetMovementTimeline(session: MovementTimelineSession): void {
  session.pendingMovementFrames = [];
  session.movementTimeline = null;
  resetMovementPosition(session);
}
