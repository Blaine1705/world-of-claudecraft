import { COMBAT_QUEST_SITES } from './content/world_quest_combat';
import type { SimContext } from './sim_context';
import { ensureCombatQuestPost } from './world_quest_combat';
import { worldQuestCycleOfferingQuest } from './world_quest_rotation';
import { updateWorldQuests } from './world_quests';

export function armCombatWorldQuestForDev(ctx: SimContext, pid: number, id: string): void {
  if (!ctx.devCommands) return;
  const site = COMBAT_QUEST_SITES.find((s) => s.encounterId === id);
  const meta = ctx.players.get(pid);
  const player = ctx.entities.get(pid);
  if (!site || !meta || !player) return;
  meta.devWorldQuestCycle = worldQuestCycleOfferingQuest(
    ctx.currentWorldQuestRotation().cycle,
    site.questId,
  );
  ctx.setPlayerLevel(Math.max(player.level, site.minLevel), pid);
  player.pos = ctx.groundPos(site.start.x + 2, site.start.z);
  player.prevPos = { ...player.pos };
  updateWorldQuests(ctx, meta, player);
  ensureCombatQuestPost(ctx, site);
  meta.wireRev++;
  ctx.emit({
    type: 'log',
    pid,
    text: '[dev] Combat world quest ready. Talk to the expedition NPC to begin.',
  });
}
