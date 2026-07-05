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
  { x: 22, z: 3298, radius: 11 },
  { x: 16, z: 3320, radius: 11 },
  { x: -4, z: 3330, radius: 11 },
  { x: -22, z: 3320, radius: 11 },
  { x: -26, z: 3298, radius: 11 },
  { x: -22, z: 3276, radius: 9 }, // the ring closes SW, clear of the causeway
];

export const WILLOWFEN_ZONE: ZoneDef = {
  id: 'willowfen',
  name: 'The Willowfen',
  zMin: 3120,
  zMax: 3640,
  levelRange: [19, 20],
  biome: 'fen',
  southPassX: -20, // the Amberfen Steps: where the gold road wades into the fen
  hub: { x: 0, z: 3302, radius: 17, name: 'Bridgemere' },
  graveyard: { x: 14, z: 3278 },
  lakes: [
    ...MOAT,
    // the Lilymoors: a lake-maze whose overlapping carves leave islets
    { x: -80, z: 3230, radius: 15 },
    { x: -102, z: 3248, radius: 13 },
    { x: -84, z: 3268, radius: 12 }, // ...the three ring an islet
    { x: -60, z: 3252, radius: 10 },
    // Bogshine Pools: scattered bright bog eyes
    { x: 70, z: 3220, radius: 12 },
    { x: 92, z: 3238, radius: 9 },
    { x: 58, z: 3244, radius: 8 },
    // the Drowsy Flats: broad shallow sheets with an islet ring
    { x: 30, z: 3420, radius: 16 },
    { x: 54, z: 3436, radius: 13 },
    { x: 34, z: 3452, radius: 12 },
    { x: -66, z: 3400, radius: 14 }, // Willowweep's pool
    { x: -84, z: 3418, radius: 10 },
  ],
  pois: [
    { x: 0, z: 3302, label: 'Bridgemere' },
    { x: -20, z: 3148, label: 'The Amberfen Steps' },
    { x: -84, z: 3248, label: 'The Lilymoors' },
    { x: 74, z: 3232, label: 'Bogshine Pools' },
    { x: -70, z: 3406, label: 'Willowweep' },
    { x: 40, z: 3436, label: 'The Drowsy Flats' },
  ],
  welcome:
    'The fen hums with dragonflies and bees. Cross the bridge into Bridgemere and rest your feet awhile.',
};

export const WILLOWFEN_ROADS: { x: number; z: number }[][] = [
  [
    { x: -20, z: 3122 },
    { x: -12, z: 3200 },
    { x: 0, z: 3262 },
    { x: 0, z: 3302 },
  ], // the Amberfen Steps -> the Fenway causeway -> Bridgemere
  // every spoke leaves over the causeway: the moat has ONE crossing
  [
    { x: 0, z: 3264 },
    { x: -30, z: 3240 },
    { x: -56, z: 3236 },
  ], // the causeway -> the Lilymoors' southern edge
  [
    { x: 0, z: 3264 },
    { x: 34, z: 3248 },
    { x: 48, z: 3226 },
  ], // the causeway -> Bogshine Pools' southern edge
  [
    { x: 0, z: 3264 },
    { x: -36, z: 3262 },
    { x: -46, z: 3300 },
    { x: -50, z: 3344 },
    { x: -52, z: 3382 },
  ], // the causeway -> wide around the moat's west -> Willowweep's shore
  [
    { x: 0, z: 3264 },
    { x: 38, z: 3282 },
    { x: 38, z: 3346 },
    { x: 30, z: 3396 },
  ], // the causeway -> around the moat's east -> the Drowsy Flats' shore
];

// No portals: walked into over the Amberfen Steps.
export const WILLOWFEN_PORTALS: PortalDef[] = [];

// Creatures and quests follow in the content pass.
export const WILLOWFEN_MOBS: Record<string, MobTemplate> = {};
export const WILLOWFEN_NPCS: Record<string, NpcDef> = {};
export const WILLOWFEN_QUESTS: Record<string, QuestDef> = {};
export const WILLOWFEN_QUEST_ORDER: string[] = [];
export const WILLOWFEN_ITEMS: Record<string, ItemDef> = {};
export const WILLOWFEN_CAMPS: CampDef[] = [];
export const WILLOWFEN_OBJECTS: GroundObjectDef[] = [];

export const WILLOWFEN_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Bridgemere: a snug island town inside its moat
  buildings: [
    { kind: 'inn', x: -8, z: 3306, w: 6, d: 7, rot: 0.7 },
    { kind: 'house', x: 9, z: 3300, w: 6, d: 6, rot: -0.9 },
    { kind: 'house', x: -6, z: 3292, w: 5, d: 5, rot: 2.4 },
    { kind: 'chapel', x: 6, z: 3312, w: 5, d: 7, rot: -2.1 },
  ],
  wells: [{ x: 0, z: 3304, r: 1.5 }],
  stalls: [
    { x: -3, z: 3298, rot: 0.5, r: 1.6 },
    { x: 4, z: 3306, rot: -1.3, r: 1.6 },
  ],
  crates: [
    [-5, 3302],
    [7, 3296],
  ],
  campfires: [
    [0, 3300],
    [-19, 3152], // the Steps' waycamp
  ],
  // the Fenway: dock planks spanning the moat neck as the town bridge
  // (hutLocal pushed far off-plank so no hut renders on the crossing)
  docks: [{ x: 0, z: 3273, rot: 0, hutLocal: { x: 40, z: 40, hw: 0.1, hd: 0.1 } }],
  fences: [
    { x1: -4, z1: 3268, x2: -4, z2: 3278 }, // bridge rails
    { x1: 4, z1: 3268, x2: 4, z2: 3278 },
  ],
};
