import { NORTH_WATCH_CANNON, WORLD_QUEST_CANNON } from './content/vehicle_stations';
import type { SimContext } from './sim_context';
import { ensureVehicleStation } from './vehicles';
import { worldQuestCycleOfferingQuest } from './world_quest_rotation';

/** Exposes the encounter in developer worlds without bypassing completion or claims. */
export function armWorldQuestCannonForDev(ctx: SimContext, pid: number): void {
  if (!ctx.devCommands) return;
  const meta = ctx.players.get(pid);
  const player = ctx.entities.get(pid);
  if (!meta || !player) return;
  meta.devWorldQuestCycle = worldQuestCycleOfferingQuest(
    ctx.currentWorldQuestRotation().cycle || 'wq3_0',
    WORLD_QUEST_CANNON.id,
  );
  ctx.setPlayerLevel(Math.max(WORLD_QUEST_CANNON.minLevel, player.level), pid);
  ensureVehicleStation(ctx);
  ctx.emit({
    type: 'log',
    pid,
    text: `[dev] Cannon rotation selected. Use /dev tp ${NORTH_WATCH_CANNON.x} ${NORTH_WATCH_CANNON.z + 2}, then interact with the cannon. No completion or reward is granted by this command.`,
  });
}
