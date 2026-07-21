import { describe, expect, it } from 'vitest';
import {
  OWNED_CLASS_BALANCE_SCENARIOS,
  OWNED_CLASS_PBE_LOADOUTS,
  OWNED_DPS_SPECS,
  runOwnedClassDpsMatrix,
  runOwnedClassDpsProbe,
} from '../scripts/owned_class_balance_probe';

describe('owned-class level 20 balance harness', () => {
  it('defines the required one-target and three-target burst and sustained scenarios', () => {
    expect(OWNED_CLASS_BALANCE_SCENARIOS).toEqual([
      { targets: 1, seconds: 15, window: 'burst' },
      { targets: 1, seconds: 60, window: 'sustained' },
      { targets: 3, seconds: 15, window: 'burst' },
      { targets: 3, seconds: 60, window: 'sustained' },
    ]);
  });

  it('records every requested damage metric for all six owned DPS specs', () => {
    const results = runOwnedClassDpsMatrix(29_900, 'test-head');
    expect(results).toHaveLength(OWNED_DPS_SPECS.length * OWNED_CLASS_BALANCE_SCENARIOS.length);
    expect(new Set(results.map((result) => result.spec))).toEqual(new Set(OWNED_DPS_SPECS));
    for (const result of results) {
      expect(result.head).toBe('test-head');
      expect(result.totalDamage).toBeGreaterThan(0);
      expect(result.dps).toBe(result.totalDamage / result.scenario.seconds);
      expect(Object.values(result.damageByTarget)).toHaveLength(result.scenario.targets);
      expect(Object.values(result.damageByTarget).reduce((sum, value) => sum + value, 0)).toBe(
        result.totalDamage,
      );
      expect(Object.keys(result.damageBySource).length).toBeGreaterThan(0);
      expect(Object.keys(result.castsByAbility).length).toBeGreaterThan(0);
      expect(result.buttonsPressed).toBeGreaterThan(0);
      expect(result.resource.end).toBeGreaterThanOrEqual(0);
      expect(result.resource.end).toBeLessThanOrEqual(result.resource.max);
      expect(Object.keys(result.equipment).length).toBeGreaterThan(0);
      expect(result.equipment).toEqual(OWNED_CLASS_PBE_LOADOUTS[result.spec]);
    }
    const vespersArea = results.find(
      (result) =>
        result.spec === 'vespers' &&
        result.scenario.targets === 3 &&
        result.scenario.seconds === 60,
    );
    expect(vespersArea?.damageByTarget.target_2).toBeGreaterThan(0);
    expect(vespersArea?.damageByTarget.target_3).toBeGreaterThan(0);
  }, 30_000);

  it('is deterministic at the same fixed seed and fixture', () => {
    const scenario = OWNED_CLASS_BALANCE_SCENARIOS[3];
    expect(runOwnedClassDpsProbe('fieldcraft', scenario, 29_901)).toEqual(
      runOwnedClassDpsProbe('fieldcraft', scenario, 29_901),
    );
  });

  it('keeps Fieldcraft sustained damage near the ranged Hunter specs and pays Bloodhook', () => {
    const scenario = OWNED_CLASS_BALANCE_SCENARIOS[1];
    const coldsight = runOwnedClassDpsProbe('coldsight', scenario, 29_902);
    const fieldcraft = runOwnedClassDpsProbe('fieldcraft', scenario, 29_902);
    const woundDamage = fieldcraft.damageBySource['Bloodhook Wound'] ?? 0;

    expect(fieldcraft.dps).toBeLessThanOrEqual(coldsight.dps * 1.2);
    expect(woundDamage / fieldcraft.totalDamage).toBeGreaterThanOrEqual(0.05);
  });

  it('keeps Vespers sustained damage in the DPS caster band', () => {
    const scenario = OWNED_CLASS_BALANCE_SCENARIOS[1];
    const thundercall = runOwnedClassDpsProbe('thundercall', scenario, 29_903);
    const vespers = runOwnedClassDpsProbe('vespers', scenario, 29_903);

    expect(vespers.dps).toBeGreaterThanOrEqual(thundercall.dps * 0.9);
  });
});
