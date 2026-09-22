// Pins for the King of the Hill pure rules (src/sim/pvp/hill_rules.ts): the
// group key, the strict-maximum leader, the majority verdict, the contest
// clock, the payee cap, the spot probe, the hourly schedule and the circle test.
import { describe, expect, it } from 'vitest';
import {
  HILL_ACCRUAL_SECONDS,
  HILL_CAPTURE_SECONDS,
  HILL_CYCLE_SECONDS,
  HILL_FIRST_AT_SECONDS,
  HILL_HONOR_PER_PAYOUT,
  HILL_MAX_PAYEES,
  HILL_RADIUS,
  type HillSpotProbe,
  hillChallengeStands,
  hillContains,
  hillContestStep,
  hillGroupKey,
  hillLeader,
  hillOrdinalAt,
  hillPayees,
  hillRiseTime,
  hillSpotIsOpen,
} from '../src/sim/pvp/hill_rules';

describe('the tuning literals the copy and the docs quote', () => {
  it('pins the radius, the cycle, the capture length, the trickle and the payee cap', () => {
    expect(HILL_RADIUS).toBe(50);
    expect(HILL_CYCLE_SECONDS).toBe(3_600);
    expect(HILL_FIRST_AT_SECONDS).toBe(120);
    expect(HILL_CAPTURE_SECONDS).toBe(60);
    expect(HILL_ACCRUAL_SECONDS).toBe(60);
    expect(HILL_HONOR_PER_PAYOUT).toBe(1);
    expect(HILL_MAX_PAYEES).toBe(5);
  });
});

describe('hillGroupKey', () => {
  it('keys a grouped player by the party and a lone player by themselves', () => {
    expect(hillGroupKey(7, { id: 3 })).toBe('party:3');
    expect(hillGroupKey(8, { id: 3 })).toBe('party:3');
    expect(hillGroupKey(7, null)).toBe('solo:7');
    expect(hillGroupKey(8, null)).not.toBe(hillGroupKey(7, null));
  });
});

describe('hillLeader', () => {
  it('is the strict maximum, null on a tie or an empty hill, ignoring zero rows', () => {
    expect(hillLeader(new Map())).toBeNull();
    expect(hillLeader(new Map([['a', 0]]))).toBeNull();
    expect(hillLeader(new Map([['a', 2]]))).toEqual({ key: 'a', count: 2 });
    expect(
      hillLeader(
        new Map([
          ['a', 2],
          ['b', 3],
        ]),
      ),
    ).toEqual({ key: 'b', count: 3 });
    expect(
      hillLeader(
        new Map([
          ['a', 3],
          ['b', 3],
        ]),
      ),
    ).toBeNull();
    // A tie that is later beaten resolves; order of insertion never matters.
    expect(
      hillLeader(
        new Map([
          ['a', 3],
          ['b', 3],
          ['c', 4],
        ]),
      ),
    ).toEqual({ key: 'c', count: 4 });
    expect(
      hillLeader(
        new Map([
          ['c', 4],
          ['a', 3],
          ['b', 3],
        ]),
      ),
    ).toEqual({ key: 'c', count: 4 });
  });
});

describe('hillChallengeStands', () => {
  it('needs a strict majority over the holder present, and beats an absent holder', () => {
    expect(hillChallengeStands(1, 0)).toBe(true);
    expect(hillChallengeStands(2, 1)).toBe(true);
    expect(hillChallengeStands(1, 1)).toBe(false);
    expect(hillChallengeStands(1, 2)).toBe(false);
    expect(hillChallengeStands(0, 0)).toBe(false);
  });
});

describe('hillContestStep', () => {
  it('counts on for the same challenger, restarts for a new one, resets when the challenge lapses', () => {
    expect(hillContestStep(10, true, true, 1)).toBe(11);
    expect(hillContestStep(10, true, false, 1)).toBe(1);
    expect(hillContestStep(10, false, true, 1)).toBe(0);
    expect(hillContestStep(0, true, false, 1)).toBe(1);
  });
});

describe('hillPayees', () => {
  it('pays at most the cap, by ascending pid, whatever the order given', () => {
    expect(hillPayees([9, 3, 7])).toEqual([3, 7, 9]);
    expect(hillPayees([9, 3, 7, 1, 8, 2, 5])).toEqual([1, 2, 3, 5, 7]);
    expect(hillPayees([])).toEqual([]);
    expect(hillPayees([4, 2], 1)).toEqual([2]);
  });
});

describe('hillSpotIsOpen', () => {
  const open = (over: Partial<HillSpotProbe> = {}): HillSpotProbe => ({
    wet: () => false,
    steep: () => false,
    blocked: () => false,
    zoneIdAt: () => 'zone',
    ...over,
  });

  it('accepts dry, flat, clear ground wholly inside the zone', () => {
    expect(hillSpotIsOpen(open(), 'zone', 0, 0, HILL_RADIUS)).toBe(true);
  });

  it('refuses the wrong zone at the centre or on the rim', () => {
    expect(hillSpotIsOpen(open({ zoneIdAt: () => 'other' }), 'zone', 0, 0, 50)).toBe(false);
    const rimOut: HillSpotProbe['zoneIdAt'] = (x) => (x > 40 ? 'other' : 'zone');
    expect(hillSpotIsOpen(open({ zoneIdAt: rimOut }), 'zone', 0, 0, 50)).toBe(false);
    expect(hillSpotIsOpen(open({ zoneIdAt: () => null }), 'zone', 0, 0, 50)).toBe(false);
  });

  it('refuses water at the centre or on the rim, and steepness at the centre', () => {
    expect(hillSpotIsOpen(open({ wet: (x, z) => x === 0 && z === 0 }), 'zone', 0, 0, 50)).toBe(
      false,
    );
    expect(hillSpotIsOpen(open({ wet: (_x, z) => z < -40 }), 'zone', 0, 0, 50)).toBe(false);
    // A pond wholly inside the circle, away from the rim: the inner ring sees it.
    expect(
      hillSpotIsOpen(open({ wet: (x, z) => Math.hypot(x - 25, z) < 8 }), 'zone', 0, 0, 50),
    ).toBe(false);
    expect(hillSpotIsOpen(open({ steep: () => true }), 'zone', 0, 0, 50)).toBe(false);
  });

  it('refuses a collider at the centre only, with the wide clearance', () => {
    const seen: number[] = [];
    const probe = open({
      blocked: (_x, _z, r) => {
        seen.push(r);
        return false;
      },
    });
    expect(hillSpotIsOpen(probe, 'zone', 0, 0, 50)).toBe(true);
    expect(seen).toEqual([6]); // the rings are never collider-checked (forests)
    expect(hillSpotIsOpen(open({ blocked: (_x, _z, r) => r === 6 }), 'zone', 0, 0, 50)).toBe(false);
    expect(hillSpotIsOpen(open({ blocked: (x) => x > 45 }), 'zone', 0, 0, 50)).toBe(true);
  });
});
describe('the hourly schedule', () => {
  it('rises the first hill two minutes in and one every hour after', () => {
    expect(hillOrdinalAt(0)).toBe(-1);
    expect(hillOrdinalAt(119)).toBe(-1);
    expect(hillOrdinalAt(120)).toBe(0);
    expect(hillOrdinalAt(120 + 3_599)).toBe(0);
    expect(hillOrdinalAt(120 + 3_600)).toBe(1);
    expect(hillRiseTime(0)).toBe(120);
    expect(hillRiseTime(2)).toBe(120 + 7_200);
    expect(hillOrdinalAt(hillRiseTime(5))).toBe(5);
  });
});

describe('hillContains', () => {
  it('is the closed disc', () => {
    const hill = { x: 100, z: -50, radius: 50 };
    expect(hillContains(hill, 100, -50)).toBe(true);
    expect(hillContains(hill, 150, -50)).toBe(true);
    expect(hillContains(hill, 150.1, -50)).toBe(false);
    expect(hillContains(hill, 100 + 35, -50 + 35)).toBe(true);
    expect(hillContains(hill, 100 + 36, -50 + 36)).toBe(false);
  });
});
