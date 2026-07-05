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
  zMin: 2040,
  zMax: 2560,
  levelRange: [17, 20],
  biome: 'frost',
  southPassX: -10, // the Snowline: where the waste road crosses into the snow
  hub: { x: -30, z: 2160, radius: 22, name: 'Icemantle' },
  graveyard: { x: -34, z: 2176 },
  lakes: [
    { x: 60, z: 2240, radius: 16 }, // Glacier Tarn
    { x: 48, z: 2252, radius: 9 }, // ...its still northern finger
    { x: -90, z: 2360, radius: 12 }, // the Shiverfen pool
  ],
  pois: [
    { x: -30, z: 2160, label: 'Icemantle' },
    { x: -10, z: 2095, label: 'The Snowline' },
    { x: 60, z: 2240, label: 'Glacier Tarn' },
    { x: 30, z: 2340, label: 'The Aurora Steps' },
    { x: -90, z: 2360, label: 'The Shiverfen' },
    { x: 100, z: 2410, label: 'The Howling Terraces' },
  ],
  welcome: 'Snow swallows every sound. Under the dancing lights, the cold itself feels awake.',
};

// Bench-to-bench mountain paths; terracing is suppressed near roads so every
// marked route stays climbable (see the frost shaping in world.ts).
export const FROSTVEIL_ROADS: { x: number; z: number }[][] = [
  [
    { x: -10, z: 2038 },
    { x: -14, z: 2095 },
    { x: -24, z: 2120 },
    { x: -30, z: 2160 },
  ], // the Snowline pass -> Icemantle
  [
    { x: -30, z: 2160 },
    { x: 10, z: 2200 },
    { x: 42, z: 2226 },
  ], // Icemantle -> the Glacier Tarn shore
  [
    { x: 42, z: 2226 },
    { x: 28, z: 2262 },
    { x: 40, z: 2300 },
    { x: 30, z: 2340 },
  ], // the tarn shore -> the Aurora Steps, skirting the tarn's finger
  [
    { x: -30, z: 2160 },
    { x: -70, z: 2260 },
    { x: -78, z: 2346 },
  ], // Icemantle -> the Shiverfen's edge
  [
    { x: 30, z: 2340 },
    { x: 70, z: 2390 },
    { x: 90, z: 2430 },
  ], // the Aurora Steps -> the Howling Terraces
  [
    { x: 30, z: 2340 },
    { x: 18, z: 2450 },
    { x: 10, z: 2558 },
  ], // the Aurora Steps -> the Goldmelt pass
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
  { mobId: 'snowdrift_wolf', center: { x: 20, z: 2210 }, radius: 10, count: 3 },
  { mobId: 'snowdrift_wolf', center: { x: -60, z: 2290 }, radius: 10, count: 3 },
  { mobId: 'ice_wisp', center: { x: 30, z: 2345 }, radius: 12, count: 4 },
  { mobId: 'rime_elemental', center: { x: 66, z: 2222 }, radius: 9, count: 2 },
  { mobId: 'rime_elemental', center: { x: 10, z: 2400 }, radius: 10, count: 2 },
  { mobId: 'fen_sprite', center: { x: -84, z: 2338 }, radius: 11, count: 3 },
  { mobId: 'frostmane_yeti', center: { x: 96, z: 2416 }, radius: 6, count: 1 },
];
export const FROSTVEIL_OBJECTS: GroundObjectDef[] = [];

export const FROSTVEIL_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Icemantle: a snug village ringing its firelit market plaza (the well
  // and the great fire at the centre, stalls and crates crowding in, homes
  // and the lodge shouldering close against the cold)
  buildings: [
    { kind: 'inn', x: -42, z: 2154, w: 6, d: 7, rot: 0.9 }, // the Hearth-Lodge
    { kind: 'house', x: -20, z: 2150, w: 6, d: 6, rot: -0.5 },
    { kind: 'house', x: -40, z: 2172, w: 6, d: 6, rot: 2.2 },
    { kind: 'chapel', x: -18, z: 2170, w: 5, d: 7, rot: -2.0 },
    { kind: 'house', x: -30, z: 2144, w: 5, d: 5, rot: 0.1 }, // the fisher's hut
    { kind: 'house', x: -44, z: 2163, w: 5, d: 5, rot: 1.4 },
    { kind: 'inn', x: -22, z: 2178, w: 5, d: 6, rot: -2.6 }, // the trade hall
  ],
  wells: [{ x: -30, z: 2162, r: 1.5 }],
  stalls: [
    { x: -24, z: 2156, rot: 0.6, r: 1.6 },
    { x: -36, z: 2166, rot: -1.2, r: 1.6 },
    { x: -34, z: 2154, rot: 2.1, r: 1.6 },
    { x: -25, z: 2168, rot: -0.4, r: 1.6 },
  ],
  crates: [
    [-27, 2158],
    [-33, 2165],
    [-23, 2162],
    [-38, 2158],
  ],
  fences: [
    { x1: -46, z1: 2146, x2: -38, z2: 2142 },
    { x1: -16, z1: 2158, x2: -14, z2: 2166 },
    { x1: -44, z1: 2178, x2: -36, z2: 2180 },
  ],
  tents: [
    { x: -12, z: 2100, rot: 0.4, scale: 1 }, // the Snowline waycamp
  ],
  campfires: [
    [-30, 2160],
    [-28, 2164], // the plaza's great fire is really two, for a wider glow
    [-11, 2098],
  ],
};
