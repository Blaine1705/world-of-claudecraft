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
  [
    { x: 20, z: 1800 },
    { x: -8, z: 1900 },
    { x: -10, z: 1975 },
    { x: -10, z: 2042 },
  ], // the dune fork -> the Snowline pass, west of the Drakemaw
];

// Content fill (creatures, folk, quests) lands in a follow-up pass; the
// skeleton ships the zone, its shape, and the walk-in entrance first.
export const DRAKELANDS_MOBS: Record<string, MobTemplate> = {
  emberwing_drake: {
    id: 'emberwing_drake',
    name: 'Emberwing Drake',
    minLevel: 19,
    maxLevel: 20,
    family: 'dragonkin',
    hpBase: 130,
    hpPerLevel: 32,
    dmgBase: 16,
    dmgPerLevel: 3.0,
    attackSpeed: 2.2,
    armorPerLevel: 16,
    moveSpeed: 9,
    aggroRadius: 18,
    elite: true,
    loot: [],
    scale: 1.4,
    color: 0xd84028,
  },
  ashbone_raider: {
    id: 'ashbone_raider',
    name: 'Ashbone Raider',
    minLevel: 17,
    maxLevel: 18,
    family: 'undead',
    hpBase: 50,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 1.9,
    armorPerLevel: 12,
    moveSpeed: 8,
    aggroRadius: 13,
    loot: [],
    scale: 1,
    color: 0xe8dcc8,
  },
  ashbone_warcaller: {
    id: 'ashbone_warcaller',
    name: 'Ashbone Warcaller',
    minLevel: 18,
    maxLevel: 19,
    family: 'undead',
    hpBase: 62,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 2.1,
    armorPerLevel: 13,
    moveSpeed: 8,
    aggroRadius: 13,
    loot: [],
    scale: 1.1,
    color: 0xd8c8a8,
  },
  dune_troll: {
    id: 'dune_troll',
    name: 'Dune Troll',
    minLevel: 17,
    maxLevel: 19,
    family: 'troll',
    hpBase: 66,
    hpPerLevel: 22,
    dmgBase: 12,
    dmgPerLevel: 2.5,
    attackSpeed: 2.3,
    armorPerLevel: 14,
    moveSpeed: 8.5,
    aggroRadius: 14,
    loot: [],
    scale: 1.15,
    color: 0xb07040,
  },
};
export const DRAKELANDS_NPCS: Record<string, NpcDef> = {};
export const DRAKELANDS_QUESTS: Record<string, QuestDef> = {};
export const DRAKELANDS_QUEST_ORDER: string[] = [];
export const DRAKELANDS_ITEMS: Record<string, ItemDef> = {};
export const DRAKELANDS_CAMPS: CampDef[] = [
  { mobId: 'dune_troll', center: { x: 100, z: 1760 }, radius: 10, count: 3 },
  { mobId: 'dune_troll', center: { x: 116, z: 1744 }, radius: 8, count: 2 },
  { mobId: 'ashbone_raider', center: { x: -4, z: 1706 }, radius: 10, count: 3 },
  { mobId: 'ashbone_raider', center: { x: -64, z: 1804 }, radius: 10, count: 3 },
  { mobId: 'ashbone_warcaller', center: { x: 88, z: 1726 }, radius: 8, count: 2 },
  { mobId: 'emberwing_drake', center: { x: 48, z: 1912 }, radius: 8, count: 1 },
  { mobId: 'emberwing_drake', center: { x: -76, z: 1888 }, radius: 8, count: 1 },
];
export const DRAKELANDS_OBJECTS: GroundObjectDef[] = [];

export const DRAKELANDS_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // fallen keeps of the old drake-cult: castle ruins across the wastes
  ruinRings: [
    { x: -30, z: 1734, ringR: 10, columns: 8 }, // the Cinder Bastion
    { x: -22, z: 1744, ringR: 6, columns: 5 },
    { x: 62, z: 1652, ringR: 8, columns: 6 }, // the Last Keep, forest's edge
    { x: 108, z: 1778, ringR: 7, columns: 6 }, // the Trollmoot henge
    { x: -92, z: 1876, ringR: 6, columns: 5 }, // Bloodglass watch
  ],
  graveyards: [
    { x: -6, z: 1712 },
    { x: -60, z: 1796 },
    { x: 92, z: 1732 },
  ],
  // Wyrmwatch: the dragon-watch garrison town on the Wyrmgate road. The
  // north palisade parts at x 44 for the causeway gate; the southwest road
  // to the dunes leaves between the inn and the well.
  buildings: [
    { kind: 'inn', x: 30, z: 1524, w: 6, d: 7, rot: 0.6 },
    { kind: 'house', x: 54, z: 1512, w: 5, d: 5, rot: -1.1 },
    { kind: 'house', x: 33, z: 1508, w: 5, d: 5, rot: 2.0 },
    { kind: 'house', x: 56, z: 1532, w: 5, d: 6, rot: 2.6 },
  ],
  wells: [{ x: 50, z: 1522, r: 1.5 }],
  stalls: [
    { x: 38, z: 1516, rot: 0.5, r: 1.6 },
    { x: 50, z: 1530, rot: -1.2, r: 1.6 },
  ],
  crates: [
    [46, 1512],
    [36, 1532],
  ],
  fences: [
    // the north palisade, parted at the causeway gate
    { x1: 30, z1: 1502, x2: 40, z2: 1502 },
    { x1: 48, z1: 1502, x2: 56, z2: 1502 },
  ],
  // the old waypost stays: a garrison keeps its road camp
  tents: [
    { x: 36, z: 1514, rot: 0.8, scale: 1 },
    { x: 52, z: 1526, rot: -1.9, scale: 1 },
  ],
  campfires: [[44, 1520]],
};
