import { describe, expect, it } from 'vitest';
import {
  combatElapsed,
  expandPairedPlans,
  resolveMatrixAction,
  sampleStats,
  selectPairedBaselines,
} from '../scripts/nythraxis_matrix_core';

describe('Nythraxis matrix core', () => {
  it('measures only elapsed combat time', () => {
    expect(combatElapsed(18.75, 7.5)).toBe(11.25);
    expect(() => combatElapsed(7, 8)).toThrow(/before combat start/i);
  });

  it('resolves friendly and ground-targeted actions explicitly', () => {
    const context = {
      selfId: 10,
      enemyId: 20,
      bossId: 30,
      activeTankId: 40,
      accompliceId: 50,
      positions: new Map([
        [20, { x: 2, z: 3 }],
        [30, { x: 12, z: 14 }],
      ]),
    };

    expect(
      resolveMatrixAction({ ability: 'vicarious_suffering', target: 'activeTank' }, context),
    ).toEqual({ ability: 'vicarious_suffering', targetId: 40 });
    expect(
      resolveMatrixAction({ ability: 'cursed_accomplice', target: 'accomplice' }, context),
    ).toEqual({ ability: 'cursed_accomplice', targetId: 50 });
    expect(
      resolveMatrixAction({ ability: 'summon_infernal', target: 'boss', aim: 'target' }, context),
    ).toEqual({ ability: 'summon_infernal', targetId: 30, aim: { x: 12, z: 14 } });
  });

  it('selects deterministic baselines and expands every one across equal paired variants', () => {
    const baselines = selectPairedBaselines(
      [{ key: 'c' }, { key: 'a' }, { key: 'b' }, { key: 'd' }],
      3,
      (entry) => entry.key,
    );
    const plans = expandPairedPlans(baselines, ['affliction', 'destruction', 'necromancy']);

    expect(baselines).toHaveLength(3);
    expect(plans).toHaveLength(9);
    for (const baseline of baselines) {
      expect(
        plans
          .filter((plan) => plan.baseline === baseline)
          .map((plan) => plan.variant)
          .sort(),
      ).toEqual(['affliction', 'destruction', 'necromancy']);
    }
  });

  it('reports sample spread and a 95 percent confidence interval', () => {
    const stats = sampleStats([10, 20, 30, 40]);
    expect(stats.n).toBe(4);
    expect(stats.mean).toBe(25);
    expect(stats.standardDeviation).toBeCloseTo(12.9099, 4);
    expect(stats.confidence95).toBeCloseTo(12.6517, 4);
  });
});
