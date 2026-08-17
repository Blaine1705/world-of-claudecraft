// Shared progression identifiers and the one-way gate opened by Ignivar's death.
// The second encounter itself is deliberately unauthored: this module only owns
// movement between raid rooms, never boss mechanics.

import {
  IGNIVAR_GATE_LOCKED_TEMPLATE,
  IGNIVAR_RAID_ARENA_ID,
  IGNIVAR_SECOND_WING_ID,
} from './ignivar_raid_ids';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

export function unlockIgnivarRaidGate(ctx: SimContext, boss: Entity): void {
  const instance = ctx.instances.find((candidate) => candidate.mobIds.includes(boss.id));
  if (!instance || instance.dungeonId !== IGNIVAR_RAID_ARENA_ID) return;
  const gate = instance.objectIds
    .map((id) => ctx.entities.get(id))
    .find(
      (entity) =>
        entity?.templateId === IGNIVAR_GATE_LOCKED_TEMPLATE &&
        entity.dungeonId === IGNIVAR_SECOND_WING_ID,
    );
  if (!gate) return;
  gate.templateId = 'dungeon_door';
  gate.lootable = true;
  if (ctx.dungeonDoorIds && !ctx.dungeonDoorIds.includes(gate.id)) {
    ctx.dungeonDoorIds.push(gate.id);
  }
}
