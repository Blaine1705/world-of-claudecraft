import { describe, expect, it } from 'vitest';
import { runWarlockBalanceProbe } from '../scripts/warlock_balance_probe';

// The sub-200 anchor gate (owner ruling, 2026-08-06): every warlock spec lands
// at or under 200 DPS at 120 seconds in full BiS (no legendary is equippable by
// a warlock), with a healthy two-minute economy: the mana cliff belongs to the
// five-minute windows below, never inside the first two minutes.
describe('warlock sub-200 BiS anchor at 120 seconds', () => {
  it.each(['affliction', 'destruction', 'demonology'] as const)(
    '%s stays at or under the 200 DPS anchor with a healthy two-minute economy',
    (spec) => {
      const result = runWarlockBalanceProbe(spec, 42, 120);

      expect(result.dps).toBeLessThanOrEqual(200);
      expect(result.dps).toBeGreaterThanOrEqual(150);
      expect(result.starvedPct).toBeLessThan(0.1);
    },
    120_000,
  );
});

describe('Affliction full-BiS five-minute inert-boss balance', () => {
  it('removes the effectively infinite mana pool and pins the release-v0.33 damage band', () => {
    const result = runWarlockBalanceProbe('affliction', 42, 300);

    expect(result.dps).toBeGreaterThanOrEqual(140);
    expect(result.dps).toBeLessThanOrEqual(155);
    expect(result.manaAveragePct).toBeLessThan(0.4);
    expect(result.manaEndPct).toBeLessThan(0.05);
    expect(result.starvedPct).toBeGreaterThan(0.2);
    expect(result.starvedPct).toBeLessThan(0.35);
  }, 120_000);
});

describe('Demonology full-BiS five-minute inert-boss balance', () => {
  it('gains a modest sustain floor without approaching Affliction', () => {
    const result = runWarlockBalanceProbe('demonology', 42, 300);

    expect(result.dps).toBeGreaterThanOrEqual(120);
    expect(result.dps).toBeLessThanOrEqual(130);
    expect(result.starvedPct).toBeGreaterThan(0.3);
    expect(result.starvedPct).toBeLessThan(0.4);
  }, 120_000);
});
