import { describe, expect, it } from 'vitest';
import { weeklyChoiceExhausted } from '../src/sim/weekly_reward_availability';
import {
  type WeeklyChoice,
  type WeeklyVaultBatch,
  weeklyLootPool,
} from '../src/sim/weekly_rewards';

describe('weekly reward availability', () => {
  it.each(['world', 'pvp'] as const)('recognizes a fully reserved %s pool only', (pool) => {
    const batch: WeeklyVaultBatch = {
      resetAtMs: 1000,
      choices: weeklyLootPool(pool, 'mage').map((itemId) => ({ pool, itemId })),
    };
    const choice: WeeklyChoice = { pool };
    expect(weeklyChoiceExhausted(batch, choice, 'mage')).toBe(true);
    batch.choices.pop();
    expect(weeklyChoiceExhausted(batch, choice, 'mage')).toBe(false);
  });

  it.each([
    { fixed: true as const },
    { opening: true },
    { pendingSave: true as const },
    { itemId: 'wraithfire_orb' },
  ])('never skips a fixed or unsettled reward: %j', (flags) => {
    const batch: WeeklyVaultBatch = {
      resetAtMs: 1000,
      choices: weeklyLootPool('world', 'mage').map((itemId) => ({ pool: 'world', itemId })),
    };
    expect(weeklyChoiceExhausted(batch, { pool: 'world', ...flags }, 'mage')).toBe(false);
  });
});
