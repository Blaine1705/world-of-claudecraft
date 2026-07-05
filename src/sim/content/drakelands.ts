// The Drakelands (levels 16-20). North across the Pale Causeway: a green
// gatewood at the entrance that dries northward into cinder desert, dune
// seas, and the volcanic Drakemaw belt of lava pools and bloodglass crystal,
// where dragons roost and the troll clans raid. The only zone entered on
// foot from a hidden realm: the causeway road climbs through the Wyrmgate
// pass (southPassX). Terrain shape: the EMBER_* tables in world.ts (coast
// lobes, the desert gradient, volcano cones).

import type {
  CampDef,
  GroundObjectDef,
  ItemDef,
  MobTemplate,
  NpcDef,
  QuestDef,
  ZoneDef,
  ZonePropsDef,
} from '../types';
import { emptyZoneProps } from '../types';

export const DRAKELANDS_ZONE: ZoneDef = {
  id: 'drakelands',
  name: 'The Drakelands',
  zMin: 1440,
  zMax: 2040,
  levelRange: [16, 20],
  biome: 'ember',
  southPassX: 44, // the Wyrmgate: where the causeway road crosses the border ridge
  hub: { x: 44, z: 1520, radius: 24, name: 'Wyrmwatch' },
  graveyard: { x: 62, z: 1505 },
  lakes: [
    { x: -20, z: 1545, radius: 14 }, // Greenshade Pool, under the gatewood
    { x: -34, z: 1556, radius: 8 }, // ...its shaded western finger
    { x: 96, z: 1608, radius: 11 }, // the Last Spring, at the forest's edge
    { x: -60, z: 1730, radius: 10 }, // Mirage Hollow, a dune oasis
  ],
  pois: [
    { x: 44, z: 1520, label: 'Wyrmwatch' },
    { x: 0, z: 1560, label: 'The Gatewood' },
    { x: -30, z: 1720, label: 'Cinder Dunes' },
    { x: 100, z: 1760, label: 'Trollmoot' },
    { x: -90, z: 1890, label: 'Bloodglass Fields' },
    { x: 30, z: 1940, label: 'Drakemaw Caldera' },
  ],
  welcome:
    'Hot wind rolls off the wastes ahead. Dragons wheel over the Drakemaw, and troll fires burn in the dunes.',
};

// The causeway road runs on through the Wyrmgate, then forks into the wastes.
export const DRAKELANDS_ROADS: { x: number; z: number }[][] = [
  [
    { x: 44, z: 1424 },
    { x: 44, z: 1470 },
    { x: 44, z: 1520 },
  ], // the Pale Causeway -> the Wyrmgate pass -> Wyrmwatch
  [
    { x: 44, z: 1520 },
    { x: 10, z: 1590 },
    { x: -10, z: 1660 },
    { x: -30, z: 1720 },
  ], // Wyrmwatch -> Cinder Dunes
  [
    { x: -30, z: 1720 },
    { x: 20, z: 1800 },
    { x: 30, z: 1900 },
    { x: 30, z: 1918 },
  ], // Cinder Dunes -> the Drakemaw crater rim
  [
    { x: 20, z: 1800 },
    { x: 100, z: 1760 },
  ], // dune fork -> Trollmoot
  [
    { x: -30, z: 1720 },
    { x: -90, z: 1830 },
    { x: -90, z: 1890 },
  ], // Cinder Dunes -> Bloodglass Fields
];

// Content fill (creatures, folk, quests) lands in a follow-up pass; the
// skeleton ships the zone, its shape, and the walk-in entrance first.
export const DRAKELANDS_MOBS: Record<string, MobTemplate> = {};
export const DRAKELANDS_NPCS: Record<string, NpcDef> = {};
export const DRAKELANDS_QUESTS: Record<string, QuestDef> = {};
export const DRAKELANDS_QUEST_ORDER: string[] = [];
export const DRAKELANDS_ITEMS: Record<string, ItemDef> = {};
export const DRAKELANDS_CAMPS: CampDef[] = [];
export const DRAKELANDS_OBJECTS: GroundObjectDef[] = [];

export const DRAKELANDS_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // a first waypost so Wyrmwatch reads as a camp, not bare ground
  tents: [
    { x: 36, z: 1514, rot: 0.8, scale: 1 },
    { x: 52, z: 1526, rot: -1.9, scale: 1 },
  ],
  campfires: [[44, 1520]],
};
