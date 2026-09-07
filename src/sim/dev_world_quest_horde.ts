import { HORDE_NPC_DEF, HORDE_QUEST_ID, WORLD_QUEST_HORDE } from './content/world_quest_horde';
import type { SimContext } from './sim_context';
import { ensureHordeInstructor } from './world_quest_horde';
import { worldQuestCycleOfferingQuest } from './world_quest_rotation';
import { restoreWorldQuestClaims, updateWorldQuests } from './world_quests';

/** Prepare a local preview without deleting an already earned completion claim. */
export function armWorldQuestHordeForDev(ctx: SimContext, pid: number): void {
  if (!ctx.devCommands) return;
  const meta = ctx.players.get(pid);
  const player = ctx.entities.get(pid);
  if (!meta || !player) return;
  meta.devWorldQuestCycle = worldQuestCycleOfferingQuest(
    ctx.currentWorldQuestRotation().cycle,
    HORDE_QUEST_ID,
  );
  ctx.setPlayerLevel(Math.max(WORLD_QUEST_HORDE.minLevel, player.level), pid);
  player.pos = ctx.groundPos(HORDE_NPC_DEF.pos.x, HORDE_NPC_DEF.pos.z + 4);
  player.prevPos = { ...player.pos };
  updateWorldQuests(ctx, meta, player);
  restoreWorldQuestClaims(meta);
  ensureHordeInstructor(ctx);
  meta.wireRev++;
  ctx.emit({
    type: 'log',
    pid,
    text: '[dev] Barricade ready. Talk to Captain Rowan to start or retry.',
  });
}
