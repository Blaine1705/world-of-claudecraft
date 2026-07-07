// The Frostveil Reach (levels 17-20). A snowbound mountain realm of terraced
// benches, frozen tarns, and auroras, north of the Drakemaw belt. Walked
// into like the Drakelands: the Snowline pass climbs out of the volcanic
// rim on a flat valley floor whose green fades under the snow mile by mile
// (southPassX). Terrain shape: the FROST_* tables in world.ts (coast lobes,
// the bench terracing).

import type {
  CampDef,
  GroundObjectDef,
  ItemDef,
  MobTemplate,
  NpcDef,
  PortalDef,
  QuestDef,
  ZoneDef,
  ZonePropsDef,
} from '../types';
import { emptyZoneProps } from '../types';

export const FROSTVEIL_ZONE: ZoneDef = {
  id: 'frostveil',
  name: 'The Frostveil Reach',
  zMin: 1440,
  zMax: 1960,
  xMin: -540,
  xMax: -180,
  levelRange: [17, 20],
  biome: 'frost',
  hub: { x: -390, z: 1560, radius: 22, name: 'Icemantle' },
  graveyard: { x: -394, z: 1576 },
  lakes: [
    { x: -300, z: 1640, radius: 16 }, // Glacier Tarn
    { x: -312, z: 1652, radius: 9 }, // ...its still northern finger
    { x: -450, z: 1760, radius: 12 }, // the Shiverfen pool
  ],
  pois: [
    { x: -390, z: 1560, label: 'Icemantle' },
    { x: -370, z: 1495, label: 'The Snowline' },
    { x: -300, z: 1640, label: 'Glacier Tarn' },
    { x: -330, z: 1740, label: 'The Aurora Steps' },
    { x: -450, z: 1760, label: 'The Shiverfen' },
    { x: -260, z: 1810, label: 'The Howling Terraces' },
  ],
  welcome: 'Snow swallows every sound. Under the dancing lights, the cold itself feels awake.',
};

// Bench-to-bench mountain paths; terracing is suppressed near roads so every
// marked route stays climbable (see the frost shaping in world.ts).
export const FROSTVEIL_ROADS: { x: number; z: number }[][] = [
  [
    { x: -390, z: 1560 },
    { x: -350, z: 1600 },
    { x: -318, z: 1626 },
  ], // Icemantle -> the Glacier Tarn shore
  [
    { x: -318, z: 1626 },
    { x: -332, z: 1662 },
    { x: -320, z: 1700 },
    { x: -330, z: 1740 },
  ], // the tarn shore -> the Aurora Steps, skirting the tarn's finger
  [
    { x: -390, z: 1560 },
    { x: -430, z: 1660 },
    { x: -438, z: 1746 },
  ], // Icemantle -> the Shiverfen's edge
  [
    { x: -330, z: 1740 },
    { x: -290, z: 1790 },
    { x: -270, z: 1830 },
  ], // the Aurora Steps -> the Howling Terraces
  [
    { x: -330, z: 1740 },
    { x: -342, z: 1850 },
    { x: -350, z: 1958 },
  ], // the Aurora Steps -> the Goldmelt pass
  [
    { x: -390, z: 1560 },
    { x: -340, z: 1612 },
    { x: -330, z: 1666 },
    { x: -280, z: 1694 },
    { x: -214, z: 1698 },
    { x: -184, z: 1700 },
  ], // Icemantle -> around the tarn -> the Snowline crossing
];

// No portals: the Reach is walked into over the Snowline pass.
export const FROSTVEIL_PORTALS: PortalDef[] = [];

// The Reach's first inhabitants (quests and folk follow in the next pass):
// wolves and rime elementals hunt the benches, wisps drift the aurora
// country, sprites keep to the fen, and a yeti stalks the far terraces.
export const FROSTVEIL_MOBS: Record<string, MobTemplate> = {
  snowdrift_wolf: {
    id: 'snowdrift_wolf',
    name: 'Snowdrift Wolf',
    minLevel: 17,
    maxLevel: 18,
    family: 'beast',
    hpBase: 52,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 1.8,
    armorPerLevel: 12,
    moveSpeed: 8.5,
    aggroRadius: 14,
    loot: [],
    scale: 1.1,
    color: 0xeef4f8,
  },
  ice_wisp: {
    id: 'ice_wisp',
    name: 'Ice Wisp',
    minLevel: 17,
    maxLevel: 18,
    family: 'elemental',
    hpBase: 44,
    hpPerLevel: 16,
    dmgBase: 8,
    dmgPerLevel: 2.0,
    attackSpeed: 2.0,
    armorPerLevel: 10,
    moveSpeed: 7.5,
    aggroRadius: 0, // drifting cold light, harmless unless harmed
    loot: [],
    scale: 0.7,
    color: 0xbfe4ff,
  },
  rime_elemental: {
    id: 'rime_elemental',
    name: 'Rime Elemental',
    minLevel: 18,
    maxLevel: 19,
    family: 'elemental',
    hpBase: 62,
    hpPerLevel: 20,
    dmgBase: 11,
    dmgPerLevel: 2.4,
    attackSpeed: 2.2,
    armorPerLevel: 14,
    moveSpeed: 7,
    aggroRadius: 12,
    loot: [],
    scale: 1.15,
    color: 0x9fd0f0,
  },
  fen_sprite: {
    id: 'fen_sprite',
    name: 'Fen Sprite',
    minLevel: 17,
    maxLevel: 18,
    family: 'kobold',
    hpBase: 48,
    hpPerLevel: 17,
    dmgBase: 9,
    dmgPerLevel: 2.1,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8,
    aggroRadius: 10,
    loot: [],
    scale: 0.9,
    color: 0xcfe0ea,
  },
  frostmane_yeti: {
    id: 'frostmane_yeti',
    name: 'Frostmane Yeti',
    minLevel: 19,
    maxLevel: 20,
    family: 'ogre',
    hpBase: 120,
    hpPerLevel: 30,
    dmgBase: 15,
    dmgPerLevel: 2.8,
    attackSpeed: 2.4,
    armorPerLevel: 16,
    moveSpeed: 8,
    aggroRadius: 16,
    elite: true,
    loot: [],
    scale: 1.5,
    color: 0xf2f6fa,
  },
};
export const FROSTVEIL_NPCS: Record<string, NpcDef> = {};
export const FROSTVEIL_QUESTS: Record<string, QuestDef> = {};
export const FROSTVEIL_QUEST_ORDER: string[] = [];
export const FROSTVEIL_ITEMS: Record<string, ItemDef> = {};
export const FROSTVEIL_CAMPS: CampDef[] = [
  { mobId: 'snowdrift_wolf', center: { x: -340, z: 1610 }, radius: 10, count: 3 },
  { mobId: 'snowdrift_wolf', center: { x: -420, z: 1690 }, radius: 10, count: 3 },
  { mobId: 'ice_wisp', center: { x: -330, z: 1745 }, radius: 12, count: 4 },
  { mobId: 'rime_elemental', center: { x: -294, z: 1622 }, radius: 9, count: 2 },
  { mobId: 'rime_elemental', center: { x: -350, z: 1800 }, radius: 10, count: 2 },
  { mobId: 'fen_sprite', center: { x: -444, z: 1738 }, radius: 11, count: 3 },
  { mobId: 'frostmane_yeti', center: { x: -264, z: 1816 }, radius: 6, count: 1 },
];
export const FROSTVEIL_OBJECTS: GroundObjectDef[] = [];

export const FROSTVEIL_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Icemantle: a snug village ringing its firelit market plaza (the well
  // and the great fire at the centre, stalls and crates crowding in, homes
  // and the lodge shouldering close against the cold)
  buildings: [
    { kind: 'inn', x: -402, z: 1554, w: 6, d: 7, rot: 0.9 }, // the Hearth-Lodge
    { kind: 'house', x: -380, z: 1550, w: 6, d: 6, rot: -0.5 },
    { kind: 'house', x: -400, z: 1572, w: 6, d: 6, rot: 2.2 },
    { kind: 'chapel', x: -378, z: 1570, w: 5, d: 7, rot: -2.0 },
    { kind: 'house', x: -390, z: 1544, w: 5, d: 5, rot: 0.1 }, // the fisher's hut
    { kind: 'house', x: -404, z: 1563, w: 5, d: 5, rot: 1.4 },
    { kind: 'inn', x: -382, z: 1578, w: 5, d: 6, rot: -2.6 }, // the trade hall
  ],
  wells: [{ x: -390, z: 1562, r: 1.5 }],
  stalls: [
    { x: -384, z: 1556, rot: 0.6, r: 1.6 },
    { x: -396, z: 1566, rot: -1.2, r: 1.6 },
    { x: -394, z: 1554, rot: 2.1, r: 1.6 },
    { x: -385, z: 1568, rot: -0.4, r: 1.6 },
  ],
  crates: [
    [-387, 1558],
    [-393, 1565],
    [-383, 1562],
    [-398, 1558],
  ],
  fences: [
    { x1: -406, z1: 1546, x2: -398, z2: 1542 },
    { x1: -376, z1: 1558, x2: -374, z2: 1566 },
    { x1: -404, z1: 1578, x2: -396, z2: 1580 },
  ],
  tents: [
    { x: -372, z: 1500, rot: 0.4, scale: 1 }, // the Snowline waycamp
  ],
  campfires: [
    [-390, 1560],
    [-388, 1564], // the plaza's great fire is really two, for a wider glow
    [-371, 1498],
  ],
};
