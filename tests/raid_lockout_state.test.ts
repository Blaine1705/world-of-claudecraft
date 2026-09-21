// src/sim/raid_lockout_state.ts: the still-locked subset of a durable save's
// raidLockouts blob, as the character list ships it. Mirrors the sim's own
// load filter (addPlayer keeps finite expiries still in the future) so the
// roster and the world agree on which lockouts a character carries.
import { describe, expect, it } from 'vitest';
import { activeRaidLockouts } from '../src/sim/raid_lockout_state';

const NOW = 1_800_000_000_000;

describe('activeRaidLockouts', () => {
  it('keeps only expiries strictly in the future', () => {
    expect(
      activeRaidLockouts(
        {
          nythraxis_boss_arena: NOW + 3_600_000,
          'nythraxis_boss_arena:heroic': NOW, // expires exactly now: unlocked
          'worldboss:thunzharr_waking_peak': NOW - 1, // lapsed
        },
        NOW,
      ),
    ).toEqual({ nythraxis_boss_arena: NOW + 3_600_000 });
  });

  it('sorts the ids so the wire shape is deterministic', () => {
    const out = activeRaidLockouts({ zzz: NOW + 2, aaa: NOW + 1, mmm: NOW + 3 }, NOW);
    expect(Object.keys(out)).toEqual(['aaa', 'mmm', 'zzz']);
  });

  it('drops non-finite and non-numeric values from an untrusted blob', () => {
    expect(
      activeRaidLockouts(
        {
          ok: NOW + 1,
          nan: Number.NaN,
          inf: Number.POSITIVE_INFINITY,
          str: String(NOW + 1),
          nul: null,
        },
        NOW,
      ),
    ).toEqual({ ok: NOW + 1 });
  });

  it('is empty for an absent, null, or non-object blob', () => {
    expect(activeRaidLockouts(undefined, NOW)).toEqual({});
    expect(activeRaidLockouts(null, NOW)).toEqual({});
    expect(activeRaidLockouts('junk' as unknown as Record<string, unknown>, NOW)).toEqual({});
    expect(activeRaidLockouts({}, NOW)).toEqual({});
  });
});
