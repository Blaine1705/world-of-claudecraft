import { COMBAT_QUEST_SITES } from './content/world_quest_combat';
import type { WorldQuestCombatState } from './types';

export function decodeCombatQuestState(
  value: unknown,
  questId: string,
): WorldQuestCombatState | undefined {
  if (
    !COMBAT_QUEST_SITES.some((site) => site.questId === questId) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    return undefined;
  const row = value as WorldQuestCombatState;
  if (!['ready', 'leaders', 'waves', 'boss', 'failed'].includes(row.phase))
    return undefined;
  const bounds = {
    stage: 3,
    kills: 128,
    required: 128,
    trail: 100,
    integrity: 100,
    secondsRemaining: 600,
  };
  for (const [key, max] of Object.entries(bounds)) {
    const n = row[key as keyof typeof bounds];
    if (!Number.isSafeInteger(n) || n < 0 || n > max) return undefined;
  }
  return {
    phase: row.phase,
    stage: row.stage,
    kills: row.kills,
    required: row.required,
    trail: row.trail,
    integrity: row.integrity,
    secondsRemaining: row.secondsRemaining,
  };
}
