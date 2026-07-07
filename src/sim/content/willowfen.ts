// The Willowfen (levels 19-20). North past the Amberfall's crown: a bright,
// gentle wetland under a clear morning sky. Bog pools and lake-mazes with
// little islands, weeping willows trailing into the water, flowering
// hedges, and the town of Bridgemere on its own island inside a ring moat,
// entered over the Fenway bridge causeway. Walked into over the Amberfen
// Steps (southPassX). Terrain: the FEN_* tables in world.ts; the willows,
// lilypads, and bridge dressing live in render/fen_features.ts.

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

// The moat: a ring of overlapping carves around the Bridgemere island, with
// one gap at the south where the Fenway causeway crosses (the bridge).
const MOAT: { x: number; z: number; radius: number }[] = [
  { x: 22, z: 2778, radius: 11 },
  { x: 16, z: 2800, radius: 11 },
  { x: -4, z: 2810, radius: 11 },
  { x: -22, z: 2800, radius: 11 },
  { x: -26, z: 2778, radius: 11 },
  { x: -22, z: 2756, radius: 9 }, // the ring closes SW, clear of the causeway
];

export const WILLOWFEN_ZONE: ZoneDef = {
  id: 'willowfen',
  name: 'The Willowfen',
  zMin: 2600,
  zMax: 3120,
  levelRange: [19, 20],
  biome: 'fen',
  southPassX: -20, // the Amberfen Steps: where the gold road wades into the fen
  hub: { x: 0, z: 2782, radius: 17, name: 'Bridgemere' },
  graveyard: { x: 14, z: 2758 },
  lakes: [
    ...MOAT,
    // the Lilymoors: three pools ringing a real dry islet at (-87,3247)
    { x: -76, z: 2706, radius: 13 },
    { x: -108, z: 2724, radius: 11 },
    { x: -82, z: 2750, radius: 11 },
    { x: -56, z: 2730, radius: 9 },
    // Bogshine Pools: scattered bright bog eyes
    { x: 70, z: 2700, radius: 12 },
    { x: 92, z: 2718, radius: 9 },
    { x: 58, z: 2724, radius: 8 },
    // the Drowsy Flats: three sheets ringing the Croaker's islet at (38,3436)
    { x: 24, z: 2894, radius: 13 },
    { x: 58, z: 2920, radius: 12 },
    { x: 28, z: 2936, radius: 11 },
    { x: -66, z: 2880, radius: 14 }, // Willowweep's pool
    { x: -84, z: 2898, radius: 10 },
  ],
  pois: [
    { x: 0, z: 2782, label: 'Bridgemere' },
    { x: -20, z: 2628, label: 'The Amberfen Steps' },
    { x: -84, z: 2728, label: 'The Lilymoors' },
    { x: 74, z: 2712, label: 'Bogshine Pools' },
    { x: -70, z: 2886, label: 'Willowweep' },
    { x: 40, z: 2916, label: 'The Drowsy Flats' },
  ],
  welcome:
    'The fen hums with dragonflies and bees. Cross the bridge into Bridgemere and rest your feet awhile.',
};

export const WILLOWFEN_ROADS: { x: number; z: number }[][] = [
  [
    { x: -20, z: 2602 },
    { x: -12, z: 2680 },
    { x: 0, z: 2742 },
    { x: 0, z: 2782 },
  ], // the Amberfen Steps -> the Fenway causeway -> Bridgemere
  // every spoke leaves over the causeway: the moat has ONE crossing
  [
    { x: 0, z: 2744 },
    { x: -30, z: 2720 },
    { x: -56, z: 2716 },
  ], // the causeway -> the Lilymoors' southern edge
  [
    { x: 0, z: 2744 },
    { x: 34, z: 2728 },
    { x: 48, z: 2706 },
  ], // the causeway -> Bogshine Pools' southern edge
  [
    { x: 0, z: 2744 },
    { x: -36, z: 2742 },
    { x: -46, z: 2780 },
    { x: -50, z: 2824 },
    { x: -52, z: 2862 },
  ], // the causeway -> wide around the moat's west -> Willowweep's shore
  [
    { x: 0, z: 2744 },
    { x: 38, z: 2762 },
    { x: 38, z: 2826 },
    { x: 30, z: 2876 },
  ], // the causeway -> around the moat's east -> the Drowsy Flats' shore
  [
    { x: -52, z: 2862 },
    { x: -44, z: 2940 },
    { x: -36, z: 3010 },
    { x: -30, z: 3080 },
    { x: -30, z: 3128 },
  ], // Willowweep's shore -> the north fen -> the Nightgate
  [
    { x: 30, z: 2810 },
    { x: 82, z: 2838 },
    { x: 130, z: 2854 },
    { x: 176, z: 2860 },
  ], // the Drowsy Flats track -> east over the moors -> the Windway
];

// No portals: walked into over the Amberfen Steps.
export const WILLOWFEN_PORTALS: PortalDef[] = [];

// Quests and folk follow in a later pass.
export const WILLOWFEN_MOBS: Record<string, MobTemplate> = {
  bogtoad: {
    id: 'bogtoad',
    name: 'Bogtoad',
    minLevel: 19,
    maxLevel: 20,
    family: 'murloc',
    hpBase: 56,
    hpPerLevel: 20,
    dmgBase: 11,
    dmgPerLevel: 2.3,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 8,
    aggroRadius: 12,
    loot: [],
    scale: 1,
    color: 0x7aa848,
  },
  drowsy_croaker: {
    id: 'drowsy_croaker',
    name: 'The Drowsy Croaker',
    minLevel: 20,
    maxLevel: 20,
    family: 'murloc',
    hpBase: 140,
    hpPerLevel: 34,
    dmgBase: 16,
    dmgPerLevel: 3.0,
    attackSpeed: 2.4,
    armorPerLevel: 17,
    moveSpeed: 7.5,
    aggroRadius: 14,
    elite: true,
    loot: [],
    scale: 1.65,
    color: 0x5a9858,
  },
  lily_wisp: {
    id: 'lily_wisp',
    name: 'Lily Wisp',
    minLevel: 19,
    maxLevel: 19,
    family: 'elemental',
    hpBase: 44,
    hpPerLevel: 16,
    dmgBase: 8,
    dmgPerLevel: 2.0,
    attackSpeed: 2.0,
    armorPerLevel: 10,
    moveSpeed: 7.5,
    aggroRadius: 0, // pale lights adrift over the pools
    loot: [],
    scale: 0.7,
    color: 0xd0f2c8,
  },
  willow_sprite: {
    id: 'willow_sprite',
    name: 'Willow Sprite',
    minLevel: 19,
    maxLevel: 20,
    family: 'kobold',
    hpBase: 50,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8.5,
    aggroRadius: 10,
    loot: [],
    scale: 0.9,
    color: 0xc8e0b8,
  },
};
export const WILLOWFEN_NPCS: Record<string, NpcDef> = {};
export const WILLOWFEN_QUESTS: Record<string, QuestDef> = {};
export const WILLOWFEN_QUEST_ORDER: string[] = [];
export const WILLOWFEN_ITEMS: Record<string, ItemDef> = {};
export const WILLOWFEN_CAMPS: CampDef[] = [
  { mobId: 'bogtoad', center: { x: -70, z: 2690 }, radius: 10, count: 3 },
  { mobId: 'bogtoad', center: { x: 76, z: 2736 }, radius: 10, count: 3 },
  { mobId: 'lily_wisp', center: { x: -66, z: 2860 }, radius: 12, count: 4 },
  { mobId: 'willow_sprite', center: { x: -36, z: 2796 }, radius: 10, count: 3 },
  { mobId: 'willow_sprite', center: { x: 44, z: 2800 }, radius: 10, count: 2 },
  { mobId: 'drowsy_croaker', center: { x: 38, z: 2916 }, radius: 5, count: 1 },
];
export const WILLOWFEN_OBJECTS: GroundObjectDef[] = [];

export const WILLOWFEN_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Bridgemere: a snug island town inside its moat
  buildings: [
    { kind: 'inn', x: -8, z: 2786, w: 6, d: 7, rot: 0.7 },
    { kind: 'house', x: 9, z: 2780, w: 6, d: 6, rot: -0.9 },
    { kind: 'house', x: -6, z: 2772, w: 5, d: 5, rot: 2.4 },
    { kind: 'chapel', x: 6, z: 2792, w: 5, d: 7, rot: -2.1 },
  ],
  wells: [{ x: 0, z: 2784, r: 1.5 }],
  stalls: [
    { x: -3, z: 2778, rot: 0.5, r: 1.6 },
    { x: 4, z: 2786, rot: -1.3, r: 1.6 },
  ],
  crates: [
    [-5, 2782],
    [7, 2776],
  ],
  campfires: [
    [0, 2780],
    [-19, 2632], // the Steps' waycamp
  ],
  // the Fenway: dock planks spanning the moat neck as the town bridge
  // (hutLocal pushed far off-plank so no hut renders on the crossing)
  docks: [{ x: 0, z: 2753, rot: 0, hutLocal: { x: 40, z: 40, hw: 0.1, hd: 0.1 } }],
  fences: [
    { x1: -4, z1: 2748, x2: -4, z2: 2758 }, // bridge rails
    { x1: 4, z1: 2748, x2: 4, z2: 2758 },
  ],
};
