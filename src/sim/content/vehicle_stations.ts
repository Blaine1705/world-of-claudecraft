import type { VehicleStationDef, WorldQuestDef } from '../types';

export const NORTH_WATCH_CANNON: Readonly<VehicleStationDef> = {
  id: 'north_watch_cannon',
  entityId: 9_400_010,
  questId: 'wq_evergarden_cannon',
  x: 442,
  z: 1034,
  field: { minX: 427, maxX: 457, minZ: 984, maxZ: 1024 },
};

export const WORLD_QUEST_CANNON: WorldQuestDef = {
  id: NORTH_WATCH_CANNON.questId,
  zoneId: 'evergarden',
  minLevel: 10,
  area: { x: 442, z: 1014, radius: 48 },
  objective: { type: 'vehicle', stationId: NORTH_WATCH_CANNON.id },
  count: 1,
  reward: { type: 'copper', base: 2_500, perLevel: 175 },
};
