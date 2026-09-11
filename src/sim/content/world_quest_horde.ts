import type { NpcDef, WorldQuestDef } from '../types';

export const HORDE_QUEST_ID = 'wq_wraithwood_barricade';
export const HORDE_NPC_ID = 2_146_900_010;
/** Wyrmroad forest edge: open sky keeps the entire personal lane visible. */
export const HORDE_SITE = { x: 402, z: 1778, direction: 1 as const };
export const HORDE_NPC_DEF: NpcDef = {
  id: 'barricade_captain',
  name: 'Captain Rowan',
  title: 'Wyrmroad Rearguard',
  pos: { x: 402, z: 1773 },
  facing: 0,
  color: 0x687d85,
  questIds: [],
  dynamic: true,
  greeting:
    'Hold the forest pass! The repeater fires itself. Move sideways, break supply crates, and stop the dead before they reach our barricade.',
};
export const WORLD_QUEST_HORDE: WorldQuestDef = {
  id: HORDE_QUEST_ID,
  zoneId: 'wraithwood',
  minLevel: 20,
  area: { x: 402, z: 1796, radius: 38 },
  objective: { type: 'horde', instructorNpcId: HORDE_NPC_DEF.id },
  count: 1,
  reward: { type: 'xp', rate: 0.12 },
};
