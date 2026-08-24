import { describe, expect, it, vi } from 'vitest';
import {
  applyMovementPositionSample,
  type MovementPositionSession,
  parseMovementPositionSample,
} from '../server/movement_position';
import { Sim } from '../src/sim/sim';
import { emptyMoveInput } from '../src/sim/types';
import { EMPTY_TEST_WORLD } from './sim_shared';

function setup(): { sim: Sim; session: MovementPositionSession } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', world: EMPTY_TEST_WORLD });
  return { sim, session: { pid: sim.player.id, movementPositionState: null } };
}

describe('authoritative client movement positions', () => {
  const neutral = emptyMoveInput();
  const forward = { ...emptyMoveInput(), forward: true };

  it('accepts a grounded position stream within authoritative run speed', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };

    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.35 }, 50, forward),
    ).toBe(true);
    expect(sim.player.pos.z).toBeCloseTo(start.z + 0.35, 10);
  });

  it('rejects speed gained beyond the episode path budget', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.35 }, 50, forward),
    ).toBe(true);

    const accepted = { ...sim.player.pos };
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 1.05 }, 100, forward),
    ).toBe(false);
    expect(sim.player.pos).toEqual(accepted);
  });

  it('uses the authoritative backpedal speed limit', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    const back = { ...emptyMoveInput(), back: true };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z - 0.35 }, 50, back),
    ).toBe(false);
    expect(sim.player.pos.z).toBe(start.z);
  });

  it('does not grant fresh movement credit while idle', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.06 }, 50, neutral),
    ).toBe(false);
    expect(sim.player.pos.z).toBe(start.z);
  });

  it('rejects a sample whose swept path is blocked', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    vi.spyOn(sim.ctx, 'resolvePlayerMove').mockReturnValue(start);

    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.2 }, 50, forward),
    ).toBe(false);
    expect(sim.player.pos.z).toBe(start.z);
  });

  it('drops malformed samples', () => {
    expect(parseMovementPositionSample({ x: 1, z: Number.NaN })).toBeNull();
    expect(parseMovementPositionSample({ x: 1, z: 2 })).toEqual({ x: 1, z: 2 });
  });
});
