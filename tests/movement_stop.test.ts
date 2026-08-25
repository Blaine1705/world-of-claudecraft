import { describe, expect, it } from 'vitest';
import {
  MOVEMENT_STOP_MAX_LEAD_YD,
  parseMovementStopTarget,
  resolveMovementStop,
} from '../server/movement_stop';

describe('movement stop endpoint', () => {
  it('accepts only a finite endpoint inside the bounded prediction lead', () => {
    expect(parseMovementStopTarget({ x: 3, z: 4 }, { x: 0, z: 0 })).toEqual({ x: 3, z: 4 });
    expect(
      parseMovementStopTarget({ x: MOVEMENT_STOP_MAX_LEAD_YD + 0.01, z: 0 }, { x: 0, z: 0 }),
    ).toBeNull();
    expect(parseMovementStopTarget({ x: Number.NaN, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(
      parseMovementStopTarget({ x: 0, z: Number.POSITIVE_INFINITY }, { x: 0, z: 0 }),
    ).toBeNull();
  });

  it('lands only on a point crossed by the authoritative movement segment', () => {
    expect(
      resolveMovementStop({ x: 0, z: 0.2 }, { x: 0, y: 10, z: 0 }, { x: 0, y: 10.1, z: 0.35 }),
    ).toEqual({ kind: 'reached', x: 0, y: 10 + 0.1 * (0.2 / 0.35), z: 0.2 });
    expect(
      resolveMovementStop({ x: 0, z: 0.5 }, { x: 0, y: 10, z: 0 }, { x: 0, y: 10.1, z: 0.35 }),
    ).toEqual({ kind: 'pending' });
  });

  it('does not pull the authority backward or sideways toward a client point', () => {
    expect(
      resolveMovementStop({ x: 0, z: -0.1 }, { x: 0, y: 10, z: 0 }, { x: 0, y: 10, z: 0.35 }),
    ).toEqual({ kind: 'reject' });
    expect(
      resolveMovementStop({ x: 0.1, z: 0.2 }, { x: 0, y: 10, z: 0 }, { x: 0, y: 10, z: 0.35 }),
    ).toEqual({ kind: 'reject' });
  });
});
