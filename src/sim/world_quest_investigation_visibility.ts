// A revealed disguise disappears only for its investigator. The shared NPC
// stays intact, and returning/completing the encounter restores its view.
import {
  INVESTIGATION_NPC_IDS,
  INVESTIGATION_QUEST_ID,
  INVESTIGATION_VARIANTS,
} from './content/world_quest_investigation';
import type { Entity, WorldQuestProgress } from './types';
import { worldQuestPuzzleVariantForCycle } from './world_quest_rotation';

export interface InvestigationVisibilityReader {
  worldQuestCycle?: string;
  worldQuestLog?: ReadonlyMap<string, WorldQuestProgress>;
}

export function investigationDisguiseHidden(
  entity: Pick<Entity, 'id' | 'kind'>,
  world: InvestigationVisibilityReader,
): boolean {
  if (entity.kind !== 'npc' || !world.worldQuestCycle) return false;
  if (!INVESTIGATION_NPC_IDS.some((id, index) => index > 0 && id === entity.id)) return false;
  const progress = world.worldQuestLog?.get(INVESTIGATION_QUEST_ID);
  if (progress?.state !== 'active' || progress.investigation?.mobId === undefined) return false;
  const variant = worldQuestPuzzleVariantForCycle(
    world.worldQuestCycle,
    INVESTIGATION_VARIANTS.length,
  );
  return entity.id === INVESTIGATION_NPC_IDS[INVESTIGATION_VARIANTS[variant].culprit + 1];
}
