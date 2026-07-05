// The Amberfall (levels 18-20). An eternal-autumn weald behind the Veiled
// Hollow's western cliffs: fire-colored forests under a honey-gold sky,
// harvest meadows, and the Great Mere at its heart, ringed by the lantern
// town of Lanternmere. Walked into through the Rootway, a tunnel behind the
// Frostveil's north benches over the Goldmelt pass, snow melting into
// gold underfoot (southPassX). Terrain shape: AMBER_* tables in world.ts.

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

export const AMBERFALL_ZONE: ZoneDef = {
  id: 'amberfall',
  name: 'The Amberfall',
  zMin: 2560,
  zMax: 3120,
  levelRange: [18, 20],
  biome: 'amber',
  southPassX: 10, // the Goldmelt: where the snow road melts into autumn
  hub: { x: 0, z: 2812, radius: 24, name: 'Lanternmere' },
  graveyard: { x: 24, z: 2790 },
  lakes: [
    { x: 0, z: 2872, radius: 26 }, // the Great Mere
    { x: 28, z: 2886, radius: 14 }, // ...its reeded eastern reach
    { x: -30, z: 2884, radius: 13 }, // ...and the willow-shaded west
    { x: -84, z: 2742, radius: 10 }, // the Orchard Pool
    { x: 96, z: 2986, radius: 9 }, // the Monolith tarn
  ],
  pois: [
    { x: 0, z: 2812, label: 'Lanternmere' },
    { x: 10, z: 2588, label: 'The Goldmelt' },
    { x: -72, z: 2732, label: 'The Gilded Orchard' },
    { x: 70, z: 2700, label: 'Harvest Hollow' },
    { x: 0, z: 2872, label: 'The Great Mere' },
    { x: -70, z: 2950, label: 'Cindermaple Rise' },
    { x: 84, z: 2970, label: 'The Leaning Monolith' },
  ],
  welcome:
    'Every leaf here burns gold and red, yet none ever fall. The lanterns of Lanternmere are lit for you.',
};

export const AMBERFALL_ROADS: { x: number; z: number }[][] = [
  [
    { x: 10, z: 2558 },
    { x: 0, z: 2620 },
    { x: -14, z: 2770 },
    { x: 0, z: 2812 },
  ], // the Goldmelt pass -> Lanternmere
  [
    { x: -12, z: 2790 },
    { x: -50, z: 2760 },
    { x: -72, z: 2734 },
  ], // Lanternmere -> the Gilded Orchard's edge
  [
    { x: 12, z: 2790 },
    { x: 45, z: 2740 },
    { x: 70, z: 2700 },
  ], // Lanternmere -> Harvest Hollow
  [
    { x: -14, z: 2830 },
    { x: -58, z: 2886 },
    { x: -70, z: 2950 },
  ], // Lanternmere -> Cindermaple Rise, west of the Mere
  [
    { x: 16, z: 2832 },
    { x: 58, z: 2910 },
    { x: 88, z: 2966 },
  ], // Lanternmere -> the Leaning Monolith, east of the Mere
  [
    { x: -14, z: 2830 },
    { x: -44, z: 2848 },
    { x: -52, z: 2920 },
    { x: -24, z: 2990 },
    { x: -20, z: 3040 },
    { x: -20, z: 3122 },
  ], // Lanternmere -> west around the Mere -> the Amberfen Steps
];

// The Westway: an open meadow crossing at the world's western edge; walking
// west past the Mirrorshallow carries you straight into the Amberfall (a
// wide unmarked trigger, no cave and no wall, like walking into a new land).
// No portals: the Amberfall is walked into over the Goldmelt pass, where
// the Frostveil's snow road melts mile by mile into autumn gold.
export const AMBERFALL_PORTALS: PortalDef[] = [];

// Quests and folk follow in a later pass.
export const AMBERFALL_MOBS: Record<string, MobTemplate> = {
  gilded_stag: {
    id: 'gilded_stag',
    name: 'Gilded Stag',
    minLevel: 18,
    maxLevel: 19,
    family: 'beast',
    hpBase: 54,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 9,
    aggroRadius: 0, // grazes the gold meadows, fights only if pressed
    loot: [],
    scale: 1.15,
    color: 0xd8a848,
  },
  gloam_fox: {
    id: 'gloam_fox',
    name: 'Gloam Fox',
    minLevel: 18,
    maxLevel: 18,
    family: 'beast',
    hpBase: 44,
    hpPerLevel: 16,
    dmgBase: 9,
    dmgPerLevel: 2.0,
    attackSpeed: 1.8,
    armorPerLevel: 10,
    moveSpeed: 9.5,
    aggroRadius: 0,
    loot: [],
    scale: 1,
    color: 0xd87838,
  },
  orchard_treant: {
    id: 'orchard_treant',
    name: 'Orchard Treant',
    minLevel: 19,
    maxLevel: 20,
    family: 'ogre',
    hpBase: 110,
    hpPerLevel: 28,
    dmgBase: 14,
    dmgPerLevel: 2.6,
    attackSpeed: 2.6,
    armorPerLevel: 16,
    moveSpeed: 6.5,
    aggroRadius: 0, // ancient and calm, until an axe is raised
    elite: true,
    loot: [],
    scale: 1.4,
    color: 0xc89838,
  },
  harvest_sprite: {
    id: 'harvest_sprite',
    name: 'Harvest Sprite',
    minLevel: 18,
    maxLevel: 19,
    family: 'kobold',
    hpBase: 48,
    hpPerLevel: 17,
    dmgBase: 10,
    dmgPerLevel: 2.1,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8.5,
    aggroRadius: 11, // orchard thieves, and territorial about it
    loot: [],
    scale: 0.85,
    color: 0xe8c878,
  },
  mere_lurker: {
    id: 'mere_lurker',
    name: 'Mere Lurker',
    minLevel: 19,
    maxLevel: 20,
    family: 'murloc',
    hpBase: 58,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 2.0,
    armorPerLevel: 13,
    moveSpeed: 8,
    aggroRadius: 13,
    loot: [],
    scale: 1.1,
    color: 0xa8b048,
  },
};
export const AMBERFALL_NPCS: Record<string, NpcDef> = {};
export const AMBERFALL_QUESTS: Record<string, QuestDef> = {};
export const AMBERFALL_QUEST_ORDER: string[] = [];
export const AMBERFALL_ITEMS: Record<string, ItemDef> = {};
export const AMBERFALL_CAMPS: CampDef[] = [
  { mobId: 'gilded_stag', center: { x: 60, z: 2716 }, radius: 12, count: 3 },
  { mobId: 'gilded_stag', center: { x: -60, z: 2760 }, radius: 11, count: 2 },
  { mobId: 'gloam_fox', center: { x: 30, z: 2770 }, radius: 10, count: 2 },
  { mobId: 'harvest_sprite', center: { x: -76, z: 2724 }, radius: 10, count: 3 },
  { mobId: 'orchard_treant', center: { x: -66, z: 2942 }, radius: 9, count: 2 },
  { mobId: 'mere_lurker', center: { x: 48, z: 2898 }, radius: 8, count: 2 },
  { mobId: 'mere_lurker', center: { x: 90, z: 2976 }, radius: 8, count: 2 },
];
export const AMBERFALL_OBJECTS: GroundObjectDef[] = [];

export const AMBERFALL_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Lanternmere: an autumn market town on the Mere's north shore
  buildings: [
    { kind: 'inn', x: -12, z: 2806, w: 6, d: 7, rot: 0.6 },
    { kind: 'house', x: 12, z: 2802, w: 6, d: 6, rot: -0.8 },
    { kind: 'house', x: -14, z: 2824, w: 6, d: 6, rot: 2.0 },
    { kind: 'chapel', x: 14, z: 2822, w: 5, d: 7, rot: -2.2 },
  ],
  wells: [{ x: 0, z: 2814, r: 1.5 }],
  stalls: [
    { x: 6, z: 2808, rot: 0.4, r: 1.6 },
    { x: -6, z: 2820, rot: -1.4, r: 1.6 },
  ],
  fences: [
    { x1: -18, z1: 2798, x2: -8, z2: 2794 },
    { x1: 8, z1: 2828, x2: 18, z2: 2830 },
  ],
  // the Goldmelt shrine: column rings flanking the pass, statue-lined, so
  // the crossing reads as a gilded threshold between snow and autumn
  ruinRings: [
    { x: 22, z: 2592, ringR: 7, columns: 6 },
    { x: -4, z: 2578, ringR: 5, columns: 5 },
    { x: 10, z: 2612, ringR: 4, columns: 4 },
  ],
  campfires: [
    [0, 2808],
    [8, 2585],
    [22, 2592],
    [-4, 2578],
  ],
};
