import { isStunned } from '../src/sim/combat/cc';
import { type MoveInputFrame, parseMoveInputFrame } from '../src/sim/move_input';
import type { PlayerMeta, Sim } from '../src/sim/sim';
import type { Entity, MoveInput } from '../src/sim/types';

export const MOVEMENT_INPUT_TIMELINE_DEPTH = 6;
export const STARVE_RESYNC_TICKS = 3;

export interface MovementInputFrameV2 {
  ct: number;
  mi: MoveInput;
  facing: number | null;
}

export interface MovementInputSessionState {
  pid: number;
  lastInputAt: number;
  movementWireVersion: 1 | 2;
  movementTimeline: MovementInputTimeline | null;
  lastConsumedCt: number;
}

export function createMovementInputSessionState(
  movementWireVersion: unknown,
): Pick<MovementInputSessionState, 'movementWireVersion' | 'movementTimeline' | 'lastConsumedCt'> {
  const version = movementWireVersion === 2 ? 2 : 1;
  return {
    movementWireVersion: version,
    movementTimeline: version === 2 ? new MovementInputTimeline() : null,
    lastConsumedCt: -1,
  };
}

export function resetMovementInputSessionState(
  session: MovementInputSessionState,
  movementWireVersion: unknown,
): void {
  Object.assign(session, createMovementInputSessionState(movementWireVersion));
}

export function applyMovementInputFrame(
  session: MovementInputSessionState,
  meta: PlayerMeta,
  entity: Entity,
  raw: unknown,
  simTime: number,
): MoveInputFrame {
  const frame = parseMoveInputFrame(raw);
  if (session.movementWireVersion === 2) {
    if (frame.ct !== null) {
      session.movementTimeline?.enqueue({
        ct: frame.ct,
        mi: frame.moveInput,
        facing: frame.facing,
      });
    }
    return frame;
  }
  Object.assign(meta.moveInput, frame.moveInput);
  session.lastInputAt = simTime;
  if (frame.facing !== null && (!entity.dead || entity.ghost) && !isStunned(entity)) {
    entity.facing = frame.facing;
  }
  return frame;
}

export function consumeMovementFramesV2(
  sim: Pick<Sim, 'time' | 'meta' | 'entities'>,
  sessions: Iterable<MovementInputSessionState>,
): void {
  for (const session of sessions) {
    if (session.movementWireVersion !== 2 || !session.movementTimeline) continue;
    const meta = sim.meta(session.pid);
    const entity = sim.entities.get(session.pid);
    if (!meta || !entity) continue;
    const frame = session.movementTimeline.consumeNext();
    if (!frame) continue;
    Object.assign(meta.moveInput, frame.mi);
    if (frame.facing !== null && (!entity.dead || entity.ghost) && !isStunned(entity)) {
      entity.facing = frame.facing;
    }
    session.lastConsumedCt = frame.ct;
    session.lastInputAt = sim.time;
  }
}

export class MovementInputTimeline {
  consumed = 0;
  starved = 0;
  dropped = 0;
  resyncs = 0;

  private readonly frames = new Map<number, MovementInputFrameV2>();
  private expectedClientTick = 0;
  private starvedWithNewerFrames = 0;

  enqueue(frame: MovementInputFrameV2): boolean {
    if (
      !Number.isSafeInteger(frame.ct) ||
      frame.ct < 0 ||
      frame.ct < this.expectedClientTick ||
      this.frames.has(frame.ct)
    ) {
      return false;
    }
    this.frames.set(frame.ct, frame);
    while (this.frames.size > MOVEMENT_INPUT_TIMELINE_DEPTH) {
      const oldest = this.oldestBufferedClientTick();
      if (oldest === null) break;
      this.frames.delete(oldest);
      this.expectedClientTick = Math.max(this.expectedClientTick, oldest + 1);
      this.dropped++;
    }
    return true;
  }

  consumeNext(): MovementInputFrameV2 | null {
    const frame = this.frames.get(this.expectedClientTick);
    if (frame) {
      this.frames.delete(this.expectedClientTick);
      this.expectedClientTick++;
      this.starvedWithNewerFrames = 0;
      this.consumed++;
      return frame;
    }

    this.starved++;
    const oldest = this.oldestBufferedClientTick();
    if (oldest === null) {
      this.starvedWithNewerFrames = 0;
      return null;
    }
    this.starvedWithNewerFrames++;
    if (this.starvedWithNewerFrames >= STARVE_RESYNC_TICKS) {
      this.expectedClientTick = oldest;
      this.starvedWithNewerFrames = 0;
      this.resyncs++;
    }
    return null;
  }

  private oldestBufferedClientTick(): number | null {
    let oldest: number | null = null;
    for (const ct of this.frames.keys()) {
      if (oldest === null || ct < oldest) oldest = ct;
    }
    return oldest;
  }
}
