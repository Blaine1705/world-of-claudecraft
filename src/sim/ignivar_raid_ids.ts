// Stable raid-room identifiers shared by content, simulation, and rendering.
// Keep this leaf free of SimContext so declarative content never imports a
// stateful system module.

export const IGNIVAR_RAID_ARENA_ID = 'ignivar_raid_arena';
export const IGNIVAR_SECOND_WING_ID = 'ignivar_inner_crucible';
export const IGNIVAR_GATE_LOCKED_TEMPLATE = 'ignivar_raid_gate_locked';

export function ignivarLinkedRaidRoom(dungeonId: string): string | null {
  if (dungeonId === IGNIVAR_RAID_ARENA_ID) return IGNIVAR_SECOND_WING_ID;
  if (dungeonId === IGNIVAR_SECOND_WING_ID) return IGNIVAR_RAID_ARENA_ID;
  return null;
}
