import { describe, expect, it } from 'vitest';
import { runWarlockBalanceProbe } from '../scripts/warlock_balance_probe';

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
