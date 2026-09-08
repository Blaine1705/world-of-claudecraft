import {
  GLIDER_LAUNCH_SITE,
  GLIDER_NPC_DEF,
  GLIDER_NPC_ID,
  GLIDER_QUEST_ID,
  WORLD_QUEST_GLIDER,
} from './content/world_quest_glider';
import type { SimContext } from './sim_context';
import { ensureGliderInstructor, startGliderFlight } from './world_quest_glider';
import { worldQuestCycleOfferingQuest } from './world_quest_rotation';
import { restoreWorldQuestClaims, updateWorldQuests } from './world_quests';

/** Prepare a local glider preview without deleting an already earned completion claim. */
export function armWorldQuestGliderForDev(
  ctx: SimContext,
  pid: number,
  startImmediately = false,
): void {
  if (!ctx.devCommands) return;
  const meta = ctx.players.get(pid);
  const player = ctx.entities.get(pid);
  if (!meta || !player) return;

  meta.devWorldQuestCycle = worldQuestCycleOfferingQuest(
    ctx.currentWorldQuestRotation().cycle,
    GLIDER_QUEST_ID,
  );
  ctx.setPlayerLevel(Math.max(WORLD_QUEST_GLIDER.minLevel, player.level), pid);
  ensureGliderInstructor(ctx);
  player.pos = ctx.groundPos(GLIDER_NPC_DEF.pos.x, GLIDER_NPC_DEF.pos.z + 2);
  player.prevPos = { ...player.pos };
  player.facing = GLIDER_LAUNCH_SITE.playerFacing;
  updateWorldQuests(ctx, meta, player);
  restoreWorldQuestClaims(meta);
  meta.wireRev++;

  if (startImmediately) {
    const npc = ctx.entities.get(GLIDER_NPC_ID);
    const progress = meta.worldQuestLog.get(GLIDER_QUEST_ID);
    if (npc && progress) {
      startGliderFlight(ctx, meta, player, npc, progress);
      ctx.emit({
        type: 'log',
        pid,
        text: '[dev] Windrider Slalom launched! Use A/D to steer, W to accelerate, S to brake. Height is assisted.',
      });
      return;
    }
  }

  ctx.emit({
    type: 'log',
    pid,
    text: `[dev] Windrider Slalom ready at The Shear (${GLIDER_LAUNCH_SITE.x}, ${GLIDER_LAUNCH_SITE.z}). Speak with Flightmaster Zephyr, or use /dev glider start.`,
  });
}
