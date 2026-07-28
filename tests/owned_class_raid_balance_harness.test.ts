import { describe, expect, it } from 'vitest';
import {
  averageOwnedClassDpsProbe,
  OWNED_CLASS_RAID_SCENARIOS,
  runOwnedClassRaidMatrix,
} from '../scripts/owned_class_balance_probe';

const RAID_BALANCE_SEEDS = [29_930, 29_931, 29_932, 29_933, 29_934] as const;

describe('owned-class raid-level balance harness', () => {
  it('defines 120-second Nythraxis profiles at levels 22 through 24', () => {
    expect(OWNED_CLASS_RAID_SCENARIOS).toEqual([
      {
        targets: 1,
        seconds: 120,
        window: 'raid',
        targetLevel: 22,
        targetTemplateId: 'nythraxis_scourge_of_thornpeak',
      },
      {
        targets: 1,
        seconds: 120,
        window: 'raid',
        targetLevel: 23,
        targetTemplateId: 'nythraxis_scourge_of_thornpeak',
      },
      {
        targets: 1,
        seconds: 120,
        window: 'raid',
        targetLevel: 24,
        targetTemplateId: 'nythraxis_scourge_of_thornpeak',
      },
    ]);
  });

  it('records real boss armor and avoided attacks for every DPS spec', () => {
    const results = runOwnedClassRaidMatrix(29_930, 'raid-test-head');
    expect(results).toHaveLength(18);

    for (const result of results) {
      expect(result.scenario.seconds).toBe(120);
      const targetLevel = result.scenario.targetLevel;
      expect(targetLevel).toBeDefined();
      if (!targetLevel) continue;
      expect(result.targetArmor).toBe(42 * (targetLevel - 1));
      expect(result.dps).toBeGreaterThan(0);
      expect(result.outcomes.hit).toBeGreaterThan(0);
    }

    const warspirit = results.find(
      (result) => result.spec === 'warspirit' && result.scenario.targetLevel === 24,
    );
    expect((warspirit?.outcomes.miss ?? 0) + (warspirit?.outcomes.dodge ?? 0)).toBeGreaterThan(0);

    for (const spec of new Set(results.map((result) => result.spec))) {
      const avoided = results
        .filter((result) => result.spec === spec)
        .reduce(
          (total, result) =>
            total +
            result.outcomes.miss +
            result.outcomes.dodge +
            result.outcomes.parry +
            result.outcomes.resist,
          0,
        );
      expect(avoided, spec).toBeGreaterThan(0);
    }

    for (const targetLevel of [22, 23, 24] as const) {
      const levelResults = results.filter((result) => result.scenario.targetLevel === targetLevel);
      const orderedDps = levelResults
        .map((result) => result.dps)
        .sort((left, right) => left - right);
      const medianDps = (orderedDps[2] + orderedDps[3]) / 2;
      const topDps = orderedDps.at(-1) ?? 0;
      const vespersDps = levelResults.find((result) => result.spec === 'vespers')?.dps ?? 0;
      expect(vespersDps).toBeGreaterThanOrEqual(medianDps * 0.95);
      expect(vespersDps).toBeLessThanOrEqual(topDps * 1.05);
    }
  }, 120_000);

  it('keeps Shaman and Vespers raid sustain and cast cadence stable across five seeds', () => {
    for (const scenario of OWNED_CLASS_RAID_SCENARIOS) {
      const thundercall = averageOwnedClassDpsProbe('thundercall', scenario, RAID_BALANCE_SEEDS);
      const warspirit = averageOwnedClassDpsProbe('warspirit', scenario, RAID_BALANCE_SEEDS);
      const vespers = averageOwnedClassDpsProbe('vespers', scenario, RAID_BALANCE_SEEDS);
      expect(thundercall.dps).toBeGreaterThanOrEqual(vespers.dps * 0.74);
      expect(thundercall.readyIdleSeconds).toBeLessThanOrEqual(15);
      expect(thundercall.buttonsPressed).toBeGreaterThanOrEqual(65);
      expect(warspirit.dps).toBeGreaterThanOrEqual(vespers.dps * 0.94);
      expect(warspirit.dps).toBeLessThanOrEqual(vespers.dps * 1.08);
      expect(warspirit.readyIdleSeconds).toBeLessThanOrEqual(40);
      expect(warspirit.buttonsPressed).toBeGreaterThanOrEqual(55);
      expect(vespers.resourceEnd).toBeGreaterThanOrEqual(800);
      expect(thundercall.outcomes.resist).toBeGreaterThan(0);
      expect(warspirit.outcomes.miss + warspirit.outcomes.dodge).toBeGreaterThan(0);
      expect(vespers.outcomes.resist).toBeGreaterThan(0);
    }
  }, 180_000);
});
