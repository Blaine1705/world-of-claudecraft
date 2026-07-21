import { describe, expect, it } from 'vitest';
import {
  OWNED_CLASS_BALANCE_SCENARIOS,
  OWNED_CLASS_PBE_LOADOUTS,
  OWNED_DPS_SPECS,
  runOwnedClassDpsMatrix,
  runOwnedClassDpsProbe,
  runOwnedHealerProbe,
  runWarspiritOfftankProbe,
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
    const thundercallArea = results.find(
      (result) =>
        result.spec === 'thundercall' &&
        result.scenario.targets === 3 &&
        result.scenario.seconds === 60,
    );
    expect(thundercallArea?.damageByTarget.target_2).toBeGreaterThan(0);
    expect(thundercallArea?.damageByTarget.target_3).toBeGreaterThan(0);
  }, 60_000);

  it('is deterministic at the same fixed seed and fixture', () => {
    const scenario = OWNED_CLASS_BALANCE_SCENARIOS[3];
    expect(runOwnedClassDpsProbe('fieldcraft', scenario, 29_901)).toEqual(
      runOwnedClassDpsProbe('fieldcraft', scenario, 29_901),
    );
  }, 30_000);

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
    expect(vespers.dps).toBeLessThanOrEqual(thundercall.dps * 1.15);
  }, 30_000);

  it.each(['spiritmend', 'doctrine', 'benison'] as const)(
    'records the fixed one-ally and three-ally %s healing profiles',
    (spec) => {
      for (const allies of [1, 3] as const) {
        const result = runOwnedHealerProbe(spec, allies, 29_910, 'test-head');
        expect(result.head).toBe('test-head');
        expect(result.effectiveHealing).toBeGreaterThan(0);
        expect(result.hps).toBe(result.effectiveHealing / result.seconds);
        expect(result.overhealing).toBeGreaterThanOrEqual(0);
        expect(result.overhealPct).toBeGreaterThanOrEqual(0);
        expect(result.overhealPct).toBeLessThanOrEqual(1);
        expect(result.emergencyRecoverySeconds).not.toBeNull();
        expect(result.resource.end).toBeGreaterThanOrEqual(0);
        expect(Object.keys(result.castsByAbility).length).toBeGreaterThan(0);
        expect(Object.keys(result.equipment).length).toBeGreaterThan(0);
      }
    },
    30_000,
  );

  it('runs Priest healer pressure through shields and Seraphic Vigil', () => {
    const doctrine = runOwnedHealerProbe('doctrine', 3, 29_912);
    const benison = runOwnedHealerProbe('benison', 3, 29_912);

    expect(doctrine.absorbedDamage).toBeGreaterThan(0);
    expect(benison.healingBySource['Seraphic Vigil']).toBeGreaterThan(0);
  }, 30_000);

  it('records Warspirit mitigation, threat, forced-target uptime, and exit behavior', () => {
    const result = runWarspiritOfftankProbe(29_920, 'test-head');
    expect(result.head).toBe('test-head');
    expect(result.stoneboundIncomingDamage).toBeLessThan(result.galeheartIncomingDamage);
    expect(result.stoneboundMitigationPct).toBeGreaterThan(0);
    expect(result.stoneboundThreatFrom100Damage).toBeGreaterThanOrEqual(200);
    expect(result.forcedTargetUptimeSeconds).toBeGreaterThanOrEqual(3);
    expect(result.forcedTargetUptimeSeconds).toBeLessThanOrEqual(3.1);
    expect(result.secondsToLoseThreatAfterLeaving).toBeGreaterThan(0);
    expect(result.secondsToLoseThreatAfterLeaving).toBeLessThanOrEqual(60);
  });

  it('keeps role probes deterministic at the same fixed seed', () => {
    expect(runOwnedHealerProbe('spiritmend', 3, 29_911)).toEqual(
      runOwnedHealerProbe('spiritmend', 3, 29_911),
    );
    expect(runWarspiritOfftankProbe(29_921)).toEqual(runWarspiritOfftankProbe(29_921));
  }, 30_000);
});
