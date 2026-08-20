import { describe, expect, it } from 'vitest';
import { decodeVarkhulHammerZones } from '../src/net/varkhul_hammer_wire';

describe('Varkhul hammer snapshot decoder', () => {
  it('clamps valid zones and drops malformed or unknown rows', () => {
    expect(
      decodeVarkhulHammerZones([
        {
          id: '5:hammer:2:0:0',
          sourceId: 5,
          phase: 'warning',
          x: 3,
          z: 4,
          r: 3,
          dur: 1.25,
          rem: 8,
        },
        { id: 'bad', sourceId: 5, phase: 'future', x: 0, z: 0, r: 3, dur: 1, rem: 1 },
        { id: 'bad', sourceId: 5, phase: 'fire', x: 0, z: 0, r: 0, dur: 1, rem: 1 },
        { id: 7, sourceId: 5, phase: 'fire', x: 0, z: 0, r: 2, dur: 1, rem: 1 },
      ]),
    ).toEqual([
      {
        id: '5:hammer:2:0:0',
        sourceId: 5,
        phase: 'warning',
        x: 3,
        z: 4,
        radius: 3,
        duration: 1.25,
        remaining: 1.25,
      },
    ]);
  });
});
