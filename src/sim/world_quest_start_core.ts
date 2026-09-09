import { WORLD_QUEST_CALLIGRAPHY_NPC_IDS } from './content/world_quest_calligraphy';
import { COMBAT_QUEST_SITES } from './content/world_quest_combat';
import { FORGE_NPC_ID } from './content/world_quest_forging';
import { GLIDER_NPC_ID } from './content/world_quest_glider';
import { HORDE_NPC_ID } from './content/world_quest_horde';
import { SHADOW_NPC_ID } from './content/world_quest_shadow';
import { WORLD_QUESTS, WORLD_QUESTS_BY_ID } from './content/world_quests';
import { ESCORTS } from './data';
import {
  dist2d,
  type Entity,
  INTERACT_RANGE,
  type WorldQuestDef,
  type WorldQuestProgress,
} from './types';

const INSTRUCTOR_IDS = new Set([
  WORLD_QUEST_CALLIGRAPHY_NPC_IDS.calligraphy_instructor,
  FORGE_NPC_ID,
  GLIDER_NPC_ID,
  HORDE_NPC_ID,
  SHADOW_NPC_ID,
]);

/** A shared identity readout for the authoritative command and NPC briefing. */
export function worldQuestStarterFor(npc: Entity): WorldQuestDef | undefined {
  if (npc.dead) return undefined;
  if (npc.kind === 'mob') {
    const escort = Object.values(ESCORTS).find(
      (def) => def.worldQuestId && def.npcMobId === npc.templateId,
    );
    return escort?.worldQuestId ? WORLD_QUESTS_BY_ID[escort.worldQuestId] : undefined;
  }
  if (npc.kind !== 'npc') return undefined;
  const combat = COMBAT_QUEST_SITES.find(
    (site) => site.npcEntityId === npc.id && site.npcId === npc.templateId,
  );
  if (combat) return WORLD_QUESTS_BY_ID[combat.questId];
  if (!INSTRUCTOR_IDS.has(npc.id)) return undefined;
  return WORLD_QUESTS.find(
    (quest) =>
      'instructorNpcId' in quest.objective && quest.objective.instructorNpcId === npc.templateId,
  );
}

export function worldQuestStarterInReach(player: Entity, npc: Entity): boolean {
  return (
    !player.dead &&
    !npc.dead &&
    dist2d(player.pos, npc.pos) <= INTERACT_RANGE + 2 &&
    Math.abs(player.pos.y - npc.pos.y) <= INTERACT_RANGE
  );
}

/** Workshops and flight practice remain replayable after their daily reward. */
export function worldQuestStartAvailable(
  quest: WorldQuestDef,
  progress?: WorldQuestProgress,
): boolean {
  return (
    progress?.state === 'active' ||
    (progress?.state === 'completed' &&
      ['forging', 'horde', 'glider'].includes(quest.objective.type))
  );
}
