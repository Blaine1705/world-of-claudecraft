import { SHADOW_NPC_DEF, SHADOW_QUEST_ID } from './content/world_quest_shadow';
import type { SimContext } from './sim_context';
import { worldQuestCycleOfferingQuest } from './world_quest_rotation';
import { ensureShadowPost } from './world_quest_shadow';
import { restoreWorldQuestClaims, updateWorldQuests } from './world_quests';
export function armWorldQuestShadowForDev(ctx: SimContext, pid: number): void {
  if (!ctx.devCommands) return;
  const meta = ctx.players.get(pid),
    player = ctx.entities.get(pid);
  if (!meta || !player) return;
  meta.devWorldQuestCycle = worldQuestCycleOfferingQuest(
    ctx.currentWorldQuestRotation().cycle,
    SHADOW_QUEST_ID,
  );
  ctx.setPlayerLevel(Math.max(10, player.level), pid);
  player.pos = ctx.groundPos(SHADOW_NPC_DEF.pos.x + 2, SHADOW_NPC_DEF.pos.z);
  player.prevPos = { ...player.pos };
  updateWorldQuests(ctx, meta, player);
  restoreWorldQuestClaims(meta);
  ensureShadowPost(ctx);
  meta.wireRev++;
}
