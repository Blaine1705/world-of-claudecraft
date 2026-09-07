import { HORDE_QUEST_ID } from './content/world_quest_horde';
import type { WorldQuestProgress } from './types';

/** Scripted horde combat replaces normal action bars until its attempt ends. */
export function hordeActionsLocked(log: ReadonlyMap<string, WorldQuestProgress>): boolean {
  const phase = log.get(HORDE_QUEST_ID)?.horde?.phase;
  return phase === 'countdown' || phase === 'active';
}
