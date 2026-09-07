import type { VehicleStationDef, WorldQuestDef } from '../types';

// Wyrmwatch placement preview. Preserve the original IDs and completion claims.
export const NORTH_WATCH_CANNON: Readonly<VehicleStationDef> = {
  id: 'north_watch_cannon',
  entityId: 9_400_010,
  questId: 'wq_evergarden_cannon',
  x: 390,
  z: 1870,
  field: { minX: 375, maxX: 405, minZ: 1820, maxZ: 1860 },
};

export const WORLD_QUEST_CANNON: WorldQuestDef = {
  id: NORTH_WATCH_CANNON.questId,
  zoneId: 'drakelands',
  minLevel: 10,
  area: { x: 390, z: 1850, radius: 48 },
  objective: { type: 'vehicle', stationId: NORTH_WATCH_CANNON.id },
  count: 1,
  reward: { type: 'copper', base: 2_500, perLevel: 175 },
};

export const LAST_KEEP_CANNON: Readonly<VehicleStationDef> = {
  id: 'last_keep_cannon',
  entityId: 9_400_011,
  questId: 'wq_last_keep_cannon',
  x: 375,
  z: 1964,
  field: { minX: 364, maxX: 386, minZ: 1912, maxZ: 1952 },
};

export const WORLD_QUEST_LAST_KEEP_CANNON: WorldQuestDef = {
  ...WORLD_QUEST_CANNON,
  id: LAST_KEEP_CANNON.questId,
  area: { x: 375, z: 1944, radius: 48 },
  objective: { type: 'vehicle', stationId: LAST_KEEP_CANNON.id },
};

export const VEHICLE_STATIONS: readonly Readonly<VehicleStationDef>[] = [
  NORTH_WATCH_CANNON,
  LAST_KEEP_CANNON,
];
