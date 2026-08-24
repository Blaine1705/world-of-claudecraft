import { describe, expect, it } from 'vitest';

import {
  VARKHUL_SHARED_PYRE_AURA_ID,
  VARKHUL_SHARED_PYRE_CAST_SECONDS,
  VARKHUL_SHARED_PYRE_EVERY_SECONDS,
  VARKHUL_SHARED_PYRE_FIRST_SECONDS,
  VARKHUL_SHARED_PYRE_RADIUS,
  varkhulSharedPyreDamageFraction,
  varkhulSharedPyreEligibleTargets,
  varkhulSharedPyreRequiredPlayers,
} from '../src/sim/varkhul_shared_pyre';

describe('Varkhul Shared Pyre', () => {
  it('prices the intended raid split separately for Normal and Heroic', () => {
    expect(VARKHUL_SHARED_PYRE_AURA_ID).toBe('varkhul_shared_pyre');
    expect(VARKHUL_SHARED_PYRE_CAST_SECONDS).toBe(6);
    expect(VARKHUL_SHARED_PYRE_FIRST_SECONDS).toBe(20);
    expect(VARKHUL_SHARED_PYRE_EVERY_SECONDS).toBe(38);
    expect(VARKHUL_SHARED_PYRE_RADIUS).toBe(5.5);
    expect(varkhulSharedPyreRequiredPlayers('normal')).toBe(4);
    expect(varkhulSharedPyreRequiredPlayers('heroic')).toBe(5);
    expect(varkhulSharedPyreDamageFraction('normal', 4)).toBeCloseTo(0.35, 10);
    expect(varkhulSharedPyreDamageFraction('heroic', 5)).toBeCloseTo(0.4, 10);
    expect(varkhulSharedPyreDamageFraction('heroic', 1)).toBe(2);
  });

  it('waits rather than selecting a non-tank with an uncleared fire mark', () => {
    const marked = [
      { id: 1, dead: false, auras: [{ id: 'varkhul_red_hot_metal' }] },
      { id: 2, dead: false, auras: [{ id: 'varkhul_red_hot_metal_absorb' }] },
    ];
    expect(varkhulSharedPyreEligibleTargets(marked, new Set())).toEqual([]);
  });

  it('excludes tanks and players still carrying either Red-hot Metal effect', () => {
    const players = [
      { id: 1, dead: false, auras: [] },
      { id: 2, dead: false, auras: [] },
      { id: 3, dead: false, auras: [{ id: 'varkhul_red_hot_metal' }] },
      { id: 4, dead: false, auras: [{ id: 'varkhul_red_hot_metal_absorb' }] },
      { id: 5, dead: true, auras: [] },
    ];
    expect(
      varkhulSharedPyreEligibleTargets(players, new Set([1])).map((player) => player.id),
    ).toEqual([2]);
  });
});
