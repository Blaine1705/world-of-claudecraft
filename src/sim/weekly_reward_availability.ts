import type { PlayerClass } from './types';
import { weeklyItemWithinLevel, weeklyRewardTableOptions } from './weekly_reward_options';
import {
  needsWeeklyBossTable,
  weeklyAvailableBossTables,
  weeklyBossChoiceExhausted,
} from './weekly_reward_tables';
import { type WeeklyChoice, type WeeklyVaultBatch, weeklyLootPool } from './weekly_rewards';

/** Reserved or over-level equipment must not block claiming another revealed reward. */
export function weeklyChoiceExhausted(
  batch: WeeklyVaultBatch,
  choice: WeeklyChoice,
  cls: PlayerClass,
  level?: number,
): boolean {
  if (choice.itemId || choice.fixed || choice.opening || choice.pendingSave) return false;
  if (needsWeeklyBossTable(choice.pool)) {
    if (weeklyBossChoiceExhausted(batch, choice, cls)) return true;
    return (
      level !== undefined &&
      weeklyAvailableBossTables(batch, choice, cls).length > 0 &&
      weeklyRewardTableOptions(batch, choice, cls, level).length === 0
    );
  }
  const reserved = new Set(batch.choices.map((candidate) => candidate.itemId));
  const pool = weeklyLootPool(choice.pool, cls, batch.raidUnlocks);
  return (
    pool.length > 0 &&
    pool.every(
      (id) => reserved.has(id) || (level !== undefined && !weeklyItemWithinLevel(id, level)),
    )
  );
}
