// The Stormbrass Foundry's Lift Warden (content/stormbrass_foundry_quests.ts):
// the quest giver at the cable-lift station at the foot of Stormcrag's storm
// line. A singleton under a reserved entity id, spawned once at world init
// (sim.ts), so placing him moves no other entity id and no parity golden (the
// Wyrmwatch harbormaster idiom). Draws no rng; idempotent.

import { LIFT_WARDEN_ENTITY_ID, LIFT_WARDEN_NPC_ID } from './content/stormbrass_foundry_quests';
import { createNpc } from './entity';
import type { SimContext } from './sim_context';
import type { WorldContent } from './types';

/** Spawn the Lift Warden when the world carries him (the built-in world). */
export function spawnLiftWarden(ctx: SimContext, world: WorldContent): void {
  const def = world.npcs[LIFT_WARDEN_NPC_ID];
  if (!def?.dynamic) return;
  if (ctx.entities.has(LIFT_WARDEN_ENTITY_ID)) return;
  ctx.addEntity(createNpc(LIFT_WARDEN_ENTITY_ID, def, ctx.groundPos(def.pos.x, def.pos.z)));
}
