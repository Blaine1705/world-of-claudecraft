import { describe, expect, it } from 'vitest';
import * as balanceProbe from '../scripts/owned_class_balance_probe';

interface RaidScenarioContract {
  targets: 1;
  seconds: 120;
  window: 'raid';
  targetLevel: 22 | 23 | 24;
  targetTemplateId: 'nythraxis_scourge_of_thornpeak';
}

interface RaidResultContract {
  spec: string;
  scenario: RaidScenarioContract;
  dps: number;
  targetArmor: number;
  outcomes: {
    hit: number;
    miss: number;
    dodge: number;
    parry: number;
    resist: number;
    crit: number;
  };
}

type RaidBalanceApi = typeof balanceProbe & {
  OWNED_CLASS_RAID_SCENARIOS?: readonly RaidScenarioContract[];
  runOwnedClassRaidMatrix?: (seed?: number, head?: string) => RaidResultContract[];
};

const raidBalance = balanceProbe as RaidBalanceApi;

describe('owned-class raid-level balance harness', () => {
  it('defines 120-second Nythraxis profiles at levels 22 through 24', () => {
    expect(raidBalance.OWNED_CLASS_RAID_SCENARIOS).toEqual([
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
    expect(raidBalance.runOwnedClassRaidMatrix).toBeTypeOf('function');
    if (!raidBalance.runOwnedClassRaidMatrix) return;

    const results = raidBalance.runOwnedClassRaidMatrix(29_930, 'raid-test-head');
    expect(results).toHaveLength(18);

    for (const result of results) {
      expect(result.scenario.seconds).toBe(120);
      expect(result.targetArmor).toBe(42 * (result.scenario.targetLevel - 1));
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
  }, 120_000);
});
