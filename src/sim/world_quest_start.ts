import { tryStartEscort } from './escort';
import type { SimContext } from './sim_context';
import { activeWorldQuestsForCycle } from './world_quest_rotation';
import { worldQuestStarterFor, worldQuestStarterInReach } from './world_quest_start_core';
import { talkToWorldQuestInstructor } from './world_quests';

/** Confirmation revalidates against the live world, never a client-supplied quest. */
export function startWorldQuest(ctx: SimContext, npcId: number, pid?: number): void {
  if (!Number.isSafeInteger(npcId) || npcId <= 0) return;
  const resolved = ctx.resolve(pid);
  const npc = ctx.entities.get(npcId);
  if (!resolved || !npc || !worldQuestStarterInReach(resolved.e, npc)) return;
  const quest = worldQuestStarterFor(npc);
  if (!quest) return;
  const { meta, e: player } = resolved;
  const cycle = meta.devWorldQuestCycle ?? ctx.currentWorldQuestRotation().cycle;
  if (
    meta.worldQuestCycle !== cycle ||
    !activeWorldQuestsForCycle(cycle).some((active) => active.id === quest.id) ||
    player.level < quest.minLevel ||
    Math.hypot(player.pos.x - quest.area.x, player.pos.z - quest.area.z) > quest.area.radius
  )
    return;
  if (npc.kind === 'mob') tryStartEscort(ctx, resolved.e, resolved.meta, npc.id);
  else talkToWorldQuestInstructor(ctx, npc, resolved.meta, resolved.e, true);
}
