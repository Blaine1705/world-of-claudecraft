// The Nightbloom (level 20). North past the Willowfen the road climbs the
// Nightgate into a realm that is dreaming: violet downs under a luminous
// lavender sky where a sleeping world hangs among the clouds, and the
// namesake flowers glow in the dream-light. The lantern village of Moonrest,
// the round Moonwell tarn, Gloamfield's flower downs, the Standing Vigil
// stone circle where the hovering nightkin keep their watch, and the
// Sleepless Barrow in the far north. Terrain: the NIGHT_* tables in
// world.ts; the glowing flora, dreambeams, and standing stones live in
// render/night_features.ts.

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

export const NIGHTBLOOM_ZONE: ZoneDef = {
  id: 'nightbloom',
  name: 'The Nightbloom',
  zMin: 3120,
  zMax: 3680,
  levelRange: [20, 20],
  biome: 'night',
  southPassX: -30, // the Nightgate: where the fen road climbs into the dark
  hub: { x: -10, z: 3280, radius: 18, name: 'Moonrest' },
  graveyard: { x: -28, z: 3262 },
  lakes: [
    { x: 70, z: 3240, radius: 14 }, // the Moonwell: a round mirror tarn
    // the Gloamfield pools, scattered through the flower downs
    { x: -80, z: 3380, radius: 10 },
    { x: -102, z: 3352, radius: 8 },
    { x: 24, z: 3542, radius: 12 }, // the Barrowmere below the Sleepless Barrow
  ],
  pois: [
    { x: -10, z: 3280, label: 'Moonrest' },
    { x: -30, z: 3152, label: 'The Nightgate' },
    { x: 70, z: 3240, label: 'The Moonwell' },
    { x: -84, z: 3356, label: 'Gloamfield' },
    { x: 88, z: 3398, label: 'The Standing Vigil' },
    { x: 0, z: 3510, label: 'The Sleepless Barrow' },
  ],
  welcome:
    'Past the Nightgate the air itself dreams. Follow the flower-light to Moonrest, and mind the sleeping world that hangs in the sky.',
};

export const NIGHTBLOOM_ROADS: { x: number; z: number }[][] = [
  [
    { x: -30, z: 3128 },
    { x: -24, z: 3186 },
    { x: -14, z: 3242 },
    { x: -10, z: 3280 },
  ], // the Nightgate -> Moonrest
  [
    { x: -10, z: 3280 },
    { x: 26, z: 3262 },
    { x: 52, z: 3248 },
  ], // Moonrest -> the Moonwell's shore
  [
    { x: -10, z: 3280 },
    { x: -48, z: 3312 },
    { x: -72, z: 3340 },
  ], // Moonrest -> Gloamfield
  [
    { x: -10, z: 3280 },
    { x: 28, z: 3322 },
    { x: 62, z: 3368 },
    { x: 84, z: 3392 },
  ], // Moonrest -> the Standing Vigil
  [
    { x: -10, z: 3280 },
    { x: -6, z: 3360 },
    { x: -2, z: 3430 },
    { x: 0, z: 3496 },
  ], // Moonrest -> the Sleepless Barrow
  [
    { x: 0, z: 3496 },
    { x: 4, z: 3560 },
    { x: 16, z: 3610 },
    { x: 30, z: 3672 },
  ], // the Barrow -> the Crowgate, west around the Barrowmere
  [
    { x: 80, z: 3410 },
    { x: 132, z: 3404 },
    { x: 176, z: 3400 },
  ], // the Standing Vigil -> east to the Dreamsedge (into the wood)
  [
    { x: -60, z: 3340 },
    { x: -114, z: 3378 },
    { x: -176, z: 3410 },
  ], // Gloamfield -> west to the Tanglemouth (into the sun)
];

// No portals: walked into over the Nightgate.
export const NIGHTBLOOM_PORTALS: PortalDef[] = [];

// Quests and folk follow in a later pass.
export const NIGHTBLOOM_MOBS: Record<string, MobTemplate> = {
  moonfleece_grazer: {
    id: 'moonfleece_grazer',
    name: 'Moonfleece Grazer',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 60,
    hpPerLevel: 20,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 2.1,
    armorPerLevel: 12,
    moveSpeed: 7.5,
    aggroRadius: 0, // placid silver-wooled herds drifting the downs
    loot: [],
    scale: 1.1,
    color: 0xe6e9f4,
  },
  gloam_strider: {
    id: 'gloam_strider',
    name: 'Gloam Strider',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 58,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 1.8,
    armorPerLevel: 12,
    moveSpeed: 9.5, // sleek night hunters: fast, keen-eyed
    aggroRadius: 14,
    loot: [],
    scale: 1.1,
    color: 0x4c4a72,
  },
  nightkin_stargazer: {
    id: 'nightkin_stargazer',
    name: 'Nightkin Stargazer',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    hpBase: 54,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 2.0,
    armorPerLevel: 11,
    moveSpeed: 7.5,
    aggroRadius: 0, // masked watchers adrift around their stones
    loot: [],
    scale: 1.0,
    color: 0x8fa8e0,
  },
  barrow_king: {
    id: 'barrow_king',
    name: 'The Barrow King',
    minLevel: 20,
    maxLevel: 20,
    family: 'undead',
    hpBase: 150,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.4,
    armorPerLevel: 17,
    moveSpeed: 7.5,
    aggroRadius: 14,
    elite: true,
    loot: [],
    scale: 1.5,
    color: 0xb8cce8,
  },
};
export const NIGHTBLOOM_NPCS: Record<string, NpcDef> = {};
export const NIGHTBLOOM_QUESTS: Record<string, QuestDef> = {};
export const NIGHTBLOOM_QUEST_ORDER: string[] = [];
export const NIGHTBLOOM_ITEMS: Record<string, ItemDef> = {};
export const NIGHTBLOOM_CAMPS: CampDef[] = [
  { mobId: 'moonfleece_grazer', center: { x: -76, z: 3326 }, radius: 12, count: 4 },
  { mobId: 'moonfleece_grazer', center: { x: 40, z: 3306 }, radius: 10, count: 3 },
  { mobId: 'gloam_strider', center: { x: -50, z: 3382 }, radius: 10, count: 3 },
  { mobId: 'gloam_strider', center: { x: 120, z: 3262 }, radius: 10, count: 3 },
  { mobId: 'nightkin_stargazer', center: { x: 88, z: 3398 }, radius: 8, count: 3 },
  { mobId: 'barrow_king', center: { x: 0, z: 3510 }, radius: 5, count: 1 },
];
export const NIGHTBLOOM_OBJECTS: GroundObjectDef[] = [];

export const NIGHTBLOOM_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Moonrest: a snug lantern village on its rise
  buildings: [
    { kind: 'inn', x: -18, z: 3284, w: 6, d: 7, rot: 0.6 },
    { kind: 'house', x: -1, z: 3276, w: 6, d: 6, rot: -1.1 },
    { kind: 'house', x: -16, z: 3270, w: 5, d: 5, rot: 2.2 },
    { kind: 'chapel', x: -4, z: 3290, w: 5, d: 7, rot: -2.4 }, // the moon shrine
  ],
  wells: [{ x: -10, z: 3282, r: 1.5 }],
  stalls: [
    { x: -13, z: 3276, rot: 0.4, r: 1.6 },
    { x: -5, z: 3284, rot: -1.5, r: 1.6 },
  ],
  crates: [
    [-15, 3280],
    [-2, 3272],
  ],
  campfires: [
    [-10, 3278],
    [-29, 3140], // the Nightgate's waycamp
  ],
  // the Standing Vigil: a ring of columns where the nightkin drift, and the
  // Sleepless Barrow: a tighter, older ring around the king's mound
  ruinRings: [
    { x: 88, z: 3398, ringR: 9, columns: 7 },
    { x: 0, z: 3510, ringR: 7, columns: 5 },
  ],
  graveyards: [{ x: 6, z: 3520 }], // barrow field at the king's feet
};
