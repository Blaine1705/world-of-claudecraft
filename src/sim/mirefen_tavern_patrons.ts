// The Mirefen tavern's patrons (content/mirefen_tavern_patrons.ts), spawned at world init
// in their seats under their reserved ids (outside the sequential allocator, so no other
// entity's id moves): each is set down on its seat like a player who sat there
// (seating.ts placeOnSeat), so it holds that seat. Idempotent; draws no rng.

import { TAVERN_PATRONS } from './content/mirefen_tavern_patrons';
import { createNpc } from './entity';
import { seatById } from './seat_registry';
import { placeOnSeat } from './seating';
import type { SimContext } from './sim_context';
import type { WorldContent } from './types';

export function spawnTavernPatrons(ctx: SimContext, world: WorldContent): void {
  for (const patron of TAVERN_PATRONS) {
    const def = world.npcs[patron.npcId];
    const seat = seatById(patron.seatId);
    if (!def?.dynamic || !seat) continue;
    if (ctx.entities.has(patron.entityId)) continue;
    const npc = createNpc(patron.entityId, def, ctx.groundPos(seat.standX, seat.standZ));
    placeOnSeat(npc, seat);
    ctx.addEntity(npc);
  }
}
