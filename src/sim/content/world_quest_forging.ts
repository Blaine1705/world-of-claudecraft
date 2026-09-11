import type { ForgeStationId, NpcDef, WorldQuestDef } from '../types';

// Preserve the original identity so relocation cannot repay completed quests.
export const FORGE_QUEST_ID = 'wq_evergarden_forging';
export const FORGE_NPC_ID = 2_146_800_010;
export const FORGE_INTERACT_RANGE = 22;

export const FORGE_NPC_DEF: NpcDef = {
  id: 'forge_instructor',
  name: 'Smith Mara',
  title: 'Last Keep Smith',
  pos: { x: 379, z: 2024 },
  facing: -2.3,
  color: 0xb57d46,
  questIds: [],
  dynamic: true,
  greeting:
    'Help me finish a shield! Click the supplies I call for. Quick hands earn a better medal.',
};

/** Supplies surround the existing grey smithy; tools target its built-in anvil. */
export const FORGE_STATIONS: readonly {
  id: ForgeStationId;
  entityId: number;
  objectItemId: string;
  name: string;
  x: number;
  z: number;
}[] = [
  {
    id: 'fuel',
    entityId: 2_146_800_020,
    objectItemId: 'forge_fuel',
    name: 'Firewood',
    x: 379,
    z: 2019,
  },
  {
    id: 'metal',
    entityId: 2_146_800_021,
    objectItemId: 'forge_metal',
    name: 'Ingot Crate',
    x: 376,
    z: 2014,
  },
  {
    id: 'water',
    entityId: 2_146_800_022,
    objectItemId: 'forge_water',
    name: 'Water Well',
    x: 385,
    z: 2026,
  },
  {
    id: 'tools',
    entityId: 2_146_800_023,
    objectItemId: 'forge_tools',
    name: 'Anvil',
    x: 374.14,
    z: 2020.92,
  },
];

export const WORLD_QUEST_FORGING: WorldQuestDef = {
  id: FORGE_QUEST_ID,
  zoneId: 'drakelands',
  minLevel: 16,
  area: { x: 379, z: 2023, radius: 24 },
  objective: { type: 'forging', instructorNpcId: FORGE_NPC_DEF.id },
  count: 1,
  reward: { type: 'xp', rate: 0.12 },
};
