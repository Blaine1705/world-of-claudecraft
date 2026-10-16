// The Highwatch guild's residents on the map (content/highwatch_guild.ts): raised at world init
// under their reserved ids, only where the active world carries their records (the built-in
// world and its Studio map), and never twice.

import { HIGHWATCH_GUILD_ENTITY_IDS } from './content/highwatch_guild';
import { createNpc } from './entity';
import type { SimContext } from './sim_context';
import type { WorldContent } from './types';

export function spawnHighwatchGuildResidents(ctx: SimContext, world: WorldContent): void {
  for (const [npcId, entityId] of Object.entries(HIGHWATCH_GUILD_ENTITY_IDS)) {
    const def = world.npcs[npcId];
    if (!def?.dynamic) continue;
    if (ctx.entities.has(entityId)) continue;
    ctx.addEntity(createNpc(entityId, def, ctx.groundPos(def.pos.x, def.pos.z)));
  }
}
