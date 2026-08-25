import { describe, expect, it } from 'vitest';
import {
  applyBufferedMovementFrames,
  bufferMovementFrame,
  type MovementTimelineSession,
} from '../server/movement_input_timeline';
import { applyMovementPositionSample } from '../server/movement_position';
import { ONLINE_MOVEMENT_INPUT_BUFFER_MS } from '../src/sim/movement_timing';
import { Sim } from '../src/sim/sim';
import { emptyMoveInput } from '../src/sim/types';
import { EMPTY_TEST_WORLD } from './sim_shared';

describe('online movement input timeline', () => {
  it('invalidates position authority when the buffered timeline overflows', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', world: EMPTY_TEST_WORLD });
    const session: MovementTimelineSession = { pid: sim.player.id };
    const input = { ...emptyMoveInput(), forward: true };
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, emptyMoveInput())).toBe(true);

    for (let index = 0; index < 64; index++) {
      expect(
        bufferMovementFrame(sim, session, 1_000 + index * 50, input, 0, null, index + 1, start),
      ).toBe(true);
    }
    expect(session.movementPositionState).not.toBeNull();

    expect(bufferMovementFrame(sim, session, 100_000, input, 0, null, 65, start)).toBe(false);
    expect(session.pendingMovementFrames).toEqual([]);
    expect(session.movementTimeline).toBeNull();
    expect(session.movementPositionDisabled).toBe(true);
    expect(session.movementPositionState).toBeNull();
    expect(applyMovementPositionSample(sim, session, start, 100_000, input)).toBe(false);
    expect(session.movementPositionState).toBeNull();
  });

  it('preserves client transition spacing when packet delivery jitters', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', world: EMPTY_TEST_WORLD });
    const session: MovementTimelineSession = { pid: sim.player.id, lastInputSeq: 0 };
    const forward = { ...emptyMoveInput(), forward: true };
    expect(bufferMovementFrame(sim, session, 1_000, forward, 0, null, 1)).toBe(true);
    expect(session.lastInputSeq).toBe(0);

    for (let elapsed = 0; elapsed < 100; elapsed += 50) sim.tick();
    expect(bufferMovementFrame(sim, session, 1_050, forward, 0.5, null, 2)).toBe(true);

    while (sim.time < ONLINE_MOVEMENT_INPUT_BUFFER_MS / 1000) {
      applyBufferedMovementFrames(sim, [session]);
      sim.tick();
    }
    applyBufferedMovementFrames(sim, [session]);
    expect(sim.meta(sim.player.id)?.moveInput.forward).toBe(true);
    expect(sim.player.facing).toBe(0);
    expect(session.lastInputSeq).toBe(1);

    sim.tick();
    applyBufferedMovementFrames(sim, [session]);
    expect(sim.player.facing).toBe(0.5);
    expect(session.lastInputSeq).toBe(2);
  });

  it('buffers every directional transition including release', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', world: EMPTY_TEST_WORLD });
    const session: MovementTimelineSession = { pid: sim.player.id };
    expect(
      bufferMovementFrame(sim, session, 2_000, { ...emptyMoveInput(), forward: true }, 0, null),
    ).toBe(true);
    expect(
      bufferMovementFrame(
        sim,
        session,
        2_050,
        { ...emptyMoveInput(), forward: true, strafeLeft: true },
        0,
        null,
      ),
    ).toBe(true);
    expect(bufferMovementFrame(sim, session, 2_100, emptyMoveInput(), 0, null)).toBe(true);

    for (let elapsed = 0; elapsed < ONLINE_MOVEMENT_INPUT_BUFFER_MS; elapsed += 50) {
      applyBufferedMovementFrames(sim, [session]);
      sim.tick();
    }
    applyBufferedMovementFrames(sim, [session]);
    expect(sim.meta(sim.player.id)?.moveInput).toMatchObject({
      forward: true,
      strafeLeft: false,
    });
    sim.tick();
    applyBufferedMovementFrames(sim, [session]);
    expect(sim.meta(sim.player.id)?.moveInput).toMatchObject({
      forward: true,
      strafeLeft: true,
    });
    sim.tick();
    applyBufferedMovementFrames(sim, [session]);
    expect(sim.meta(sim.player.id)?.moveInput).toMatchObject({
      forward: false,
      strafeLeft: false,
    });
  });

  it('replays a walking turn on the same path instead of correcting during it', () => {
    const client = new Sim({ seed: 42, playerClass: 'warrior', world: EMPTY_TEST_WORLD });
    const server = new Sim({ seed: 42, playerClass: 'warrior', world: EMPTY_TEST_WORLD });
    const session: MovementTimelineSession = { pid: server.player.id };
    const clientOrigin = { x: client.player.pos.x, z: client.player.pos.z };
    const frames = [
      { at: 3_000, facing: 0, input: { ...emptyMoveInput(), forward: true } },
      { at: 3_050, facing: 0.15, input: { ...emptyMoveInput(), forward: true } },
      { at: 3_100, facing: 0.3, input: { ...emptyMoveInput(), forward: true } },
      { at: 3_150, facing: 0.45, input: { ...emptyMoveInput(), forward: true } },
      { at: 3_200, facing: 0.6, input: { ...emptyMoveInput(), forward: true } },
      { at: 3_250, facing: 0.6, input: emptyMoveInput() },
    ];
    const expected: Array<{ x: number; z: number }> = [];
    const clientMeta = client.meta(client.player.id);
    if (!clientMeta) throw new Error('client player missing');
    for (const frame of frames) {
      Object.assign(clientMeta.moveInput, frame.input);
      client.player.facing = frame.facing;
      client.tick();
      expected.push({
        x: client.player.pos.x - clientOrigin.x,
        z: client.player.pos.z - clientOrigin.z,
      });
      expect(bufferMovementFrame(server, session, frame.at, frame.input, frame.facing, null)).toBe(
        true,
      );
    }

    for (let elapsed = 0; elapsed < ONLINE_MOVEMENT_INPUT_BUFFER_MS; elapsed += 50) {
      applyBufferedMovementFrames(server, [session]);
      server.tick();
    }
    const serverOrigin = { x: server.player.pos.x, z: server.player.pos.z };
    for (const position of expected) {
      applyBufferedMovementFrames(server, [session]);
      server.tick();
      expect(server.player.pos.x - serverOrigin.x).toBeCloseTo(position.x, 10);
      expect(server.player.pos.z - serverOrigin.z).toBeCloseTo(position.z, 10);
    }
  });
});
