import { describe, expect, it } from 'vitest';
import {
  OWNED_CLASS_RAID_SCENARIOS,
  runOwnedClassRaidMatrix,
} from '../scripts/owned_class_balance_probe';

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
      expect(
        result.outcomes.miss +
          result.outcomes.dodge +
          result.outcomes.parry +
          result.outcomes.resist,
      ).toBeGreaterThan(0);
      expect(result.outcomes.hit).toBeGreaterThan(0);
    }

    const warspirit = results.find(
      (result) => result.spec === 'warspirit' && result.scenario.targetLevel === 24,
    );
    const vespers = results.find(
      (result) => result.spec === 'vespers' && result.scenario.targetLevel === 24,
    );
    expect((warspirit?.outcomes.miss ?? 0) + (warspirit?.outcomes.dodge ?? 0)).toBeGreaterThan(0);
    expect(vespers?.outcomes.resist).toBeGreaterThan(0);

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
});
