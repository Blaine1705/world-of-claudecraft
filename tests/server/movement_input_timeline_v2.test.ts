import { describe, expect, it } from 'vitest';
import {
  consumeMovementFramesV2,
  createMovementInputSessionState,
  MOVEMENT_INPUT_TIMELINE_DEPTH,
  MovementInputTimeline,
  resetMovementInputSessionState,
  STARVE_RESYNC_TICKS,
} from '../../server/movement_input_timeline_v2';
import { emptyMoveInput, type MoveInput } from '../../src/sim/types';

function frame(ct: number, forward = false): { ct: number; mi: MoveInput; facing: number } {
  return { ct, mi: { ...emptyMoveInput(), forward }, facing: ct / 10 };
}

describe('MovementInputTimeline', () => {
  it('pins the timeline depth and starvation resync threshold', () => {
    expect(MOVEMENT_INPUT_TIMELINE_DEPTH).toBe(6);
    expect(STARVE_RESYNC_TICKS).toBe(3);
  });

  it('consumes exactly one frame in client tick order', () => {
    const timeline = new MovementInputTimeline();
    timeline.enqueue(frame(0, true));
    timeline.enqueue(frame(1));

    expect(timeline.consumeNext()).toEqual(frame(0, true));
    expect(timeline.consumeNext()).toEqual(frame(1));
    expect(timeline.consumed).toBe(2);
  });

  it('drops the oldest frame when the depth cap overflows', () => {
    const timeline = new MovementInputTimeline();
    for (let ct = 0; ct <= MOVEMENT_INPUT_TIMELINE_DEPTH; ct++) timeline.enqueue(frame(ct));

    expect(timeline.dropped).toBe(1);
    expect(Array.from({ length: 6 }, () => timeline.consumeNext()?.ct)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('holds through starvation and resyncs to the oldest buffered frame', () => {
    const timeline = new MovementInputTimeline();
    timeline.enqueue(frame(2, true));

    for (let tick = 0; tick < STARVE_RESYNC_TICKS; tick++) {
      expect(timeline.consumeNext()).toBeNull();
    }
    expect(timeline.starved).toBe(STARVE_RESYNC_TICKS);
    expect(timeline.resyncs).toBe(1);
    expect(timeline.consumeNext()).toEqual(frame(2, true));
  });

  it('accepts out-of-order frames and consumes them by client tick', () => {
    const timeline = new MovementInputTimeline();
    timeline.enqueue(frame(2));
    timeline.enqueue(frame(0));
    timeline.enqueue(frame(1));

    expect([
      timeline.consumeNext()?.ct,
      timeline.consumeNext()?.ct,
      timeline.consumeNext()?.ct,
    ]).toEqual([0, 1, 2]);
  });

  it('rejects invalid and replayed client ticks', () => {
    const timeline = new MovementInputTimeline();

    expect(timeline.enqueue(frame(-1))).toBe(false);
    expect(timeline.enqueue(frame(0.5))).toBe(false);
    expect(timeline.enqueue(frame(Number.MAX_SAFE_INTEGER + 1))).toBe(false);
    expect(timeline.enqueue(frame(0))).toBe(true);
    expect(timeline.enqueue(frame(0))).toBe(false);
    expect(timeline.consumeNext()?.ct).toBe(0);
    expect(timeline.enqueue(frame(0))).toBe(false);
    expect(timeline.discardedLate).toBe(1);
  });

  it('rejects a far-future client tick without wedging the buffer', () => {
    const timeline = new MovementInputTimeline();

    expect(timeline.enqueue(frame(1e12))).toBe(false);
    expect(timeline.dropped).toBe(1);
    expect(timeline.enqueue(frame(0, true))).toBe(true);
    expect(timeline.consumeNext()).toEqual(frame(0, true));
  });

  it('advances the ack with one held-input frame on a starved tick', () => {
    const timeline = new MovementInputTimeline();
    const session = {
      pid: 1,
      lastInputAt: 0,
      ...createMovementInputSessionState(2),
      movementTimeline: timeline,
    };
    const meta = { moveInput: emptyMoveInput() };
    const entity = { auras: [], dead: false, facing: 0, ghost: false };
    const sim = {
      time: 1,
      meta: () => meta,
      entities: new Map([[1, entity]]),
    };
    timeline.enqueue(frame(0, true));

    consumeMovementFramesV2(sim as never, [session]);
    consumeMovementFramesV2(sim as never, [session]);

    expect(meta.moveInput.forward).toBe(true);
    expect(session.lastConsumedCt).toBe(1);
    expect(timeline.consumed).toBe(2);
    expect(timeline.extrapolated).toBe(1);
    expect(timeline.starved).toBe(1);
  });

  it('discards and counts a real frame whose client tick was extrapolated', () => {
    const timeline = new MovementInputTimeline();
    timeline.enqueue(frame(0, true));
    expect(timeline.consumeNext()).toEqual(frame(0, true));
    expect(timeline.consumeNext()).toEqual({ ...frame(0, true), ct: 1 });

    expect(timeline.enqueue(frame(1, false))).toBe(false);
    expect(timeline.discardedLate).toBe(1);
  });

  it('extrapolates only until the genuine-gap resync threshold', () => {
    const timeline = new MovementInputTimeline();
    timeline.enqueue(frame(0, true));
    timeline.enqueue(frame(4, false));

    expect(timeline.consumeNext()).toEqual(frame(0, true));
    expect(timeline.consumeNext()).toEqual({ ...frame(0, true), ct: 1 });
    expect(timeline.consumeNext()).toEqual({ ...frame(0, true), ct: 2 });
    expect(timeline.consumeNext()).toBeNull();
    expect(timeline.resyncs).toBe(1);
    expect(timeline.consumeNext()).toEqual(frame(4, false));
    expect(timeline.extrapolated).toBe(STARVE_RESYNC_TICKS - 1);
  });

  it('recreates linkdead resume state so client tick zero consumes without starvation', () => {
    const session = {
      pid: 1,
      lastInputAt: 10,
      ...createMovementInputSessionState(2),
    };
    session.movementTimeline?.enqueue(frame(5));
    expect(session.movementTimeline?.consumeNext()).toBeNull();

    resetMovementInputSessionState(session, 2);
    expect(session.lastConsumedCt).toBe(-1);
    expect(session.movementTimeline?.enqueue(frame(0, true))).toBe(true);
    expect(session.movementTimeline?.consumeNext()).toEqual(frame(0, true));
    expect(session.movementTimeline?.starved).toBe(0);
  });
});
