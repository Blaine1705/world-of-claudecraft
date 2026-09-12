import { HORDE_QUEST_ID } from './content/world_quest_horde';
import type { WorldQuestProgress } from './types';
import { wispMazeActionsLocked } from './wisp_maze_action_lock';

/** Compatibility entry for encounters that replace ordinary class actions. */
export function hordeActionsLocked(log: ReadonlyMap<string, WorldQuestProgress>): boolean {
  const phase = log.get(HORDE_QUEST_ID)?.horde?.phase;
  return phase === 'countdown' || phase === 'active' || wispMazeActionsLocked(log);
}
