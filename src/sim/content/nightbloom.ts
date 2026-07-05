// The Nightbloom (level 20). North past the Willowfen's bright morning the
// road climbs the Nightgate and the sun simply does not follow: a realm of
// permanent starry midnight where the namesake flowers open only under the
// moon. Silver-blue downs, firefly meadows, the lantern village of Moonrest,
// the round Moonwell tarn, the Standing Vigil stone circle where the hovering
// nightkin keep their watch, and the Sleepless Barrow in the far north.
// Terrain: the NIGHT_* tables in world.ts; the glowing flora, moonbeams, and
// standing stones live in render/night_features.ts.

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
  zMin: 3640,
  zMax: 4200,
  levelRange: [20, 20],
  biome: 'night',
  southPassX: -30, // the Nightgate: where the fen road climbs into the dark
  hub: { x: -10, z: 3800, radius: 18, name: 'Moonrest' },
  graveyard: { x: -28, z: 3782 },
  lakes: [
    { x: 70, z: 3760, radius: 14 }, // the Moonwell: a round mirror tarn
    // the Gloamfield pools, scattered through the flower downs
    { x: -80, z: 3900, radius: 10 },
    { x: -102, z: 3872, radius: 8 },
    { x: 24, z: 4062, radius: 12 }, // the Barrowmere below the Sleepless Barrow
  ],
  pois: [
    { x: -10, z: 3800, label: 'Moonrest' },
    { x: -30, z: 3672, label: 'The Nightgate' },
    { x: 70, z: 3760, label: 'The Moonwell' },
    { x: -84, z: 3876, label: 'Gloamfield' },
    { x: 88, z: 3918, label: 'The Standing Vigil' },
    { x: 0, z: 4030, label: 'The Sleepless Barrow' },
  ],
  welcome:
    'The sun does not follow you past the Nightgate. Walk the flower-light to Moonrest and look up as you go.',
};

export const NIGHTBLOOM_ROADS: { x: number; z: number }[][] = [
  [
    { x: -30, z: 3648 },
    { x: -24, z: 3706 },
    { x: -14, z: 3762 },
    { x: -10, z: 3800 },
  ], // the Nightgate -> Moonrest
  [
    { x: -10, z: 3800 },
    { x: 26, z: 3782 },
    { x: 52, z: 3768 },
  ], // Moonrest -> the Moonwell's shore
  [
    { x: -10, z: 3800 },
    { x: -48, z: 3832 },
    { x: -72, z: 3860 },
  ], // Moonrest -> Gloamfield
  [
    { x: -10, z: 3800 },
    { x: 28, z: 3842 },
    { x: 62, z: 3888 },
    { x: 84, z: 3912 },
  ], // Moonrest -> the Standing Vigil
  [
    { x: -10, z: 3800 },
    { x: -6, z: 3880 },
    { x: -2, z: 3950 },
    { x: 0, z: 4016 },
  ], // Moonrest -> the Sleepless Barrow
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
  { mobId: 'moonfleece_grazer', center: { x: -76, z: 3846 }, radius: 12, count: 4 },
  { mobId: 'moonfleece_grazer', center: { x: 40, z: 3826 }, radius: 10, count: 3 },
  { mobId: 'gloam_strider', center: { x: -50, z: 3902 }, radius: 10, count: 3 },
  { mobId: 'gloam_strider', center: { x: 120, z: 3782 }, radius: 10, count: 3 },
  { mobId: 'nightkin_stargazer', center: { x: 88, z: 3918 }, radius: 8, count: 3 },
  { mobId: 'barrow_king', center: { x: 0, z: 4030 }, radius: 5, count: 1 },
];
export const NIGHTBLOOM_OBJECTS: GroundObjectDef[] = [];

export const NIGHTBLOOM_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Moonrest: a snug lantern village on its rise
  buildings: [
    { kind: 'inn', x: -18, z: 3804, w: 6, d: 7, rot: 0.6 },
    { kind: 'house', x: -1, z: 3796, w: 6, d: 6, rot: -1.1 },
    { kind: 'house', x: -16, z: 3790, w: 5, d: 5, rot: 2.2 },
    { kind: 'chapel', x: -4, z: 3810, w: 5, d: 7, rot: -2.4 }, // the moon shrine
  ],
  wells: [{ x: -10, z: 3802, r: 1.5 }],
  stalls: [
    { x: -13, z: 3796, rot: 0.4, r: 1.6 },
    { x: -5, z: 3804, rot: -1.5, r: 1.6 },
  ],
  crates: [
    [-15, 3800],
    [-2, 3792],
  ],
  campfires: [
    [-10, 3798],
    [-29, 3660], // the Nightgate's waycamp
  ],
  // the Standing Vigil: a ring of columns where the nightkin drift, and the
  // Sleepless Barrow: a tighter, older ring around the king's mound
  ruinRings: [
    { x: 88, z: 3918, ringR: 9, columns: 7 },
    { x: 0, z: 4030, ringR: 7, columns: 5 },
  ],
  graveyards: [{ x: 6, z: 4040 }], // barrow field at the king's feet
};
