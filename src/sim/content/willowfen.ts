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

// The moat: a ring of overlapping carves around the Bridgemere island (a
// wider ring than the old town's, roughly doubling the island), with one
// gap at the south where the Fenway causeway crosses (the bridge).
const MOAT: { x: number; z: number; radius: number }[] = [
  { x: -384, z: 336, radius: 11 },
  { x: -396, z: 361, radius: 11 },
  { x: -386, z: 387, radius: 11 },
  { x: -360, z: 398, radius: 11 },
  { x: -334, z: 387, radius: 11 },
  { x: -324, z: 361, radius: 11 },
  { x: -336, z: 336, radius: 11 }, // the ring closes SE, clear of the causeway
];

export const WILLOWFEN_ZONE: ZoneDef = {
  id: 'willowfen',
  name: 'The Willowfen',
  riftPortalEligible: true,
  riftTierWeights: { B: 0.1, A: 0.55, S: 0.35 },
  zMin: 180,
  zMax: 700,
  xMin: -540,
  xMax: -180,
  levelRange: [19, 20],
  biome: 'fen',
  eastPassZ: 440, // the Mirewalk: where the marsh road wades into the fen
  hub: { x: -360, z: 362, radius: 20, name: 'Bridgemere' },
  graveyard: { x: -344, z: 306 },
  lakes: [
    ...MOAT,
    // the Lilymoors: three pools ringing a real dry islet at (-87,3247)
    { x: -436, z: 286, radius: 13 },
    { x: -468, z: 304, radius: 11 },
    { x: -442, z: 330, radius: 11 },
    { x: -416, z: 310, radius: 9 },
    // Bogshine Pools: scattered bright bog eyes
    { x: -290, z: 280, radius: 12 },
    { x: -268, z: 298, radius: 9 },
    { x: -302, z: 304, radius: 8 },
    // the Drowsy Flats: three sheets ringing the Croaker's islet at (38,3436)
    { x: -336, z: 474, radius: 13 },
    { x: -302, z: 500, radius: 12 },
    { x: -332, z: 516, radius: 11 },
    { x: -426, z: 460, radius: 14 }, // Willowweep's pool
    { x: -444, z: 478, radius: 10 },
  ],
  pois: [
    { x: -360, z: 362, label: 'Bridgemere', id: 'bridgemere' },
    { x: -380, z: 208, label: 'The Amberfen Steps', id: 'the_amberfen_steps' },
    { x: -444, z: 308, label: 'The Lilymoors', id: 'the_lilymoors' },
    { x: -286, z: 292, label: 'Bogshine Pools', id: 'bogshine_pools' },
    { x: -430, z: 466, label: 'Willowweep', id: 'willowweep' },
    { x: -320, z: 496, label: 'The Drowsy Flats', id: 'the_drowsy_flats' },
  ],
  welcome:
    'The fen hums with dragonflies and bees. Cross the bridge into Bridgemere and rest your feet awhile.',
};

export const WILLOWFEN_ROADS: { x: number; z: number }[][] = [
  [
    { x: -372, z: 260 },
    { x: -360, z: 322 },
    { x: -360, z: 362 },
  ], // the Amberfen Steps -> the Fenway causeway -> Bridgemere
  // every spoke leaves over the causeway: the moat has ONE crossing
  [
    { x: -360, z: 324 },
    { x: -390, z: 300 },
    { x: -416, z: 296 },
  ], // the causeway -> the Lilymoors' southern edge
  [
    { x: -360, z: 324 },
    { x: -326, z: 308 },
    { x: -312, z: 286 },
  ], // the causeway -> Bogshine Pools' southern edge
  [
    { x: -360, z: 322 },
    { x: -404, z: 314 },
    { x: -418, z: 362 },
    { x: -416, z: 406 },
    { x: -412, z: 442 },
  ], // the causeway -> wide around the moat's west -> Willowweep's shore
  [
    { x: -360, z: 322 },
    { x: -332, z: 312 },
    { x: -306, z: 336 },
    { x: -308, z: 404 },
    { x: -330, z: 456 },
  ], // the causeway -> around the moat's east -> the Drowsy Flats' shore
  [
    { x: -412, z: 442 },
    { x: -404, z: 520 },
    { x: -396, z: 590 },
    { x: -394, z: 660 },
    { x: -398, z: 706 },
  ], // Willowweep's shore -> the north fen -> the Tanglemouth
  [
    { x: -310, z: 396 },
    { x: -278, z: 418 },
    { x: -230, z: 434 },
    { x: -184, z: 440 },
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
  { mobId: 'bogtoad', center: { x: -430, z: 270 }, radius: 10, count: 3 },
  { mobId: 'bogtoad', center: { x: -284, z: 316 }, radius: 10, count: 3 },
  { mobId: 'lily_wisp', center: { x: -426, z: 440 }, radius: 12, count: 4 },
  { mobId: 'willow_sprite', center: { x: -396, z: 376 }, radius: 10, count: 3 },
  { mobId: 'willow_sprite', center: { x: -316, z: 380 }, radius: 10, count: 2 },
  { mobId: 'drowsy_croaker', center: { x: -322, z: 496 }, radius: 5, count: 1 },
];
export const WILLOWFEN_OBJECTS: GroundObjectDef[] = [];

export const WILLOWFEN_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Bridgemere: the island town, its buildings spread wide across the
  // doubled moat island so every lane between them stays open
  buildings: [
    { kind: 'inn', x: -370, z: 369, w: 6, d: 7, rot: 0.7 },
    { kind: 'house', x: -350, z: 354, w: 6, d: 6, rot: -0.9 },
    { kind: 'house', x: -371, z: 349, w: 5, d: 5, rot: 2.4 },
    { kind: 'chapel', x: -351, z: 370, w: 5, d: 7, rot: -2.1 },
    { kind: 'house', x: -360, z: 375, w: 5, d: 5, rot: 0.1 },
  ],
  wells: [{ x: -356, z: 361, r: 1.5 }],
  stalls: [
    { x: -365, z: 359, rot: 0.5, r: 1.6 },
    // the gate market: one stall trading at the causeway's south approach
    { x: -352, z: 314, rot: -1.3, r: 1.6 },
  ],
  crates: [
    [-368, 365],
    [-352, 358],
  ],
  campfires: [
    [-358, 366],
    [-379, 212], // the Steps' waycamp
  ],
  // homesteads and watchtowers spread across the fen's dry rises, each on
  // probed level ground (KayKit blue set, matching Bridgemere's roofs)
  decorProps: [
    { key: 'hexbHomeA', x: -448, z: 452, rot: 0.6, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbHomeB', x: -392, z: 232, rot: 2.4, scale: 7.5, r: 5, h: 10 },
    { key: 'hexbHomeA', x: -268, z: 434, rot: -1.2, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbHomeB', x: -390, z: 560, rot: 0.3, scale: 7.5, r: 5, h: 10 },
    { key: 'hexbTowerBase', x: -382, z: 296, rot: 0.4, scale: 5, r: 2.8, h: 8 },
    { key: 'hexbTowerBase', x: -388, z: 608, rot: 1.2, scale: 5, r: 2.8, h: 8 },
    // the second wave: one more neighbour spaced out from each homestead,
    // every site probed level (spread under 1.2) and well above the water
    { key: 'hexbHomeB', x: -428, z: 417, rot: -0.5, scale: 7.5, r: 5, h: 10 },
    { key: 'hexbHomeA', x: -392, z: 266, rot: 1.7, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbHomeA', x: -258, z: 473, rot: 0.9, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbHomeB', x: -383, z: 587, rot: -2.0, scale: 7.5, r: 5, h: 10 },
  ],
  // the Fenway: rail fences flanking the causeway's south approach (the
  // crossing itself is dry ground between the moat pools, kept clear of
  // props so nothing stands on the path)
  fences: [
    { x1: -364, z1: 325, x2: -364, z2: 336 },
    { x1: -356, z1: 325, x2: -356, z2: 336 },
  ],
};
