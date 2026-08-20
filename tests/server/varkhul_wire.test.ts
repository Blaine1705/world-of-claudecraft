import { describe, expect, it } from 'vitest';
import { varkhulEncounterWireJson } from '../../server/varkhul_wire';

describe('Varkhul snapshot wire fragment', () => {
  it('interest-scopes both mechanic families and preserves stable compact fields', () => {
    const json = varkhulEncounterWireJson(
      [
        { id: 101, sourceId: 1, x: 3.126, z: 4.234, radius: 4, duration: 2.5, remaining: 1.4 },
        { id: 102, sourceId: 1, x: 200, z: 4, radius: 4, duration: 2.5, remaining: 1 },
      ],
      [
        {
          id: '1:hammer:2:0:0',
          sourceId: 1,
          phase: 'warning',
          x: 5.126,
          z: 6.234,
          radius: 3,
          duration: 1.25,
          remaining: 0.9,
        },
      ],
      { x: 0, z: 0 },
      50,
    );

    expect(JSON.parse(`{${json.slice(1)}}`)).toEqual({
      varkhulForgestorm: [{ id: 101, sourceId: 1, x: 3.13, z: 4.23, r: 4, dur: 2.5, rem: 1.4 }],
      varkhulHammers: [
        {
          id: '1:hammer:2:0:0',
          sourceId: 1,
          phase: 'warning',
          x: 5.13,
          z: 6.23,
          r: 3,
          dur: 1.25,
          rem: 0.9,
        },
      ],
    });
  });
});
