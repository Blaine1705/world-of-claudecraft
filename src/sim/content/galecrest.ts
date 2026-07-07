// The Galecrest (level 20). The world's first EAST map: a wind-scoured
// headland realm in its own grid column beside the Willowfen, entered on
// foot through the Windway, a pass in the mountain border that runs along
// the shared edge (no teleport; the border ridge is real ground, opened at
// westPassZ). Salt-silvered downs roll to grey sea cliffs; the fishing town
// of Wickharbor keeps its boats in the lee of the harbor cove; the Old
// Beacon burns on the highest head, sea stacks stand off the Shear, and the
// Wreckfields beach its bones in the north. Terrain: the GALE_* tables in
// world.ts; the lighthouse, sea stacks, and wreck ribs live in
// render/gale_features.ts.

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

export const GALECREST_ZONE: ZoneDef = {
  id: 'galecrest',
  name: 'The Galecrest',
  zMin: 2600,
  zMax: 3120,
  xMin: 180,
  xMax: 540,
  levelRange: [20, 20],
  biome: 'gale',
  westPassZ: 2860, // the Windway: where the fen road climbs into the wind
  hub: { x: 420, z: 2780, radius: 16, name: 'Wickharbor' },
  graveyard: { x: 404, z: 2764 },
  lakes: [
    { x: 300, z: 2980, radius: 10 }, // the Mirror Tarn, up on the downs
  ],
  pois: [
    { x: 420, z: 2780, label: 'Wickharbor' },
    { x: 200, z: 2860, label: 'The Windway' },
    { x: 280, z: 2740, label: 'The Howling Downs' },
    { x: 498, z: 2728, label: 'The Old Beacon' },
    { x: 455, z: 2955, label: 'The Shear' },
    { x: 340, z: 3065, label: 'The Wreckfields' },
    { x: 300, z: 2980, label: 'The Mirror Tarn' },
  ],
  welcome:
    'The wind has never once stopped here, and the Old Beacon has never once gone out. Wickharbor asks only that you close the inn door behind you.',
};

export const GALECREST_ROADS: { x: number; z: number }[][] = [
  [
    { x: 186, z: 2860 },
    { x: 240, z: 2832 },
    { x: 300, z: 2798 },
    { x: 360, z: 2782 },
    { x: 420, z: 2780 },
  ], // the Windway -> across the downs -> Wickharbor
  [
    { x: 420, z: 2780 },
    { x: 458, z: 2752 },
    { x: 492, z: 2732 },
  ], // Wickharbor -> the Old Beacon
  [
    { x: 420, z: 2780 },
    { x: 432, z: 2860 },
    { x: 446, z: 2932 },
    { x: 410, z: 3008 },
    { x: 352, z: 3056 },
  ], // Wickharbor -> above the Shear -> the Wreckfields
  [
    { x: 420, z: 2780 },
    { x: 352, z: 2762 },
    { x: 296, z: 2744 },
  ], // Wickharbor -> the Howling Downs
  [
    { x: 432, z: 2860 },
    { x: 372, z: 2908 },
    { x: 316, z: 2958 },
  ], // the cliff road -> up to the Mirror Tarn
  [
    { x: 352, z: 3056 },
    { x: 374, z: 3086 },
    { x: 390, z: 3116 },
  ], // the Wreckfields -> up the Crowgate climb (into the wood)
] as { x: number; z: number }[][];

// No portals: walked into through the Windway.
export const GALECREST_PORTALS: PortalDef[] = [];

// Quests and folk follow in a later pass.
export const GALECREST_MOBS: Record<string, MobTemplate> = {
  moor_ram: {
    id: 'moor_ram',
    name: 'Moor Ram',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 58,
    hpPerLevel: 19,
    dmgBase: 11,
    dmgPerLevel: 2.2,
    attackSpeed: 2.0,
    armorPerLevel: 13, // a fleece the wind gave up on
    moveSpeed: 8.5,
    aggroRadius: 0, // grazing the downs, braced side-on to the gale
    loot: [],
    scale: 1.1,
    color: 0xd8d0c0,
  },
  gale_wisp: {
    id: 'gale_wisp',
    name: 'Gale Wisp',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    hpBase: 52,
    hpPerLevel: 18,
    dmgBase: 12,
    dmgPerLevel: 2.3,
    attackSpeed: 1.9,
    armorPerLevel: 9,
    moveSpeed: 9,
    aggroRadius: 11, // a knot of living wind, and it resents shelter
    loot: [],
    scale: 1.25,
    color: 0xbfe0e8,
  },
  shoal_scuttler: {
    id: 'shoal_scuttler',
    name: 'Shoal Scuttler',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 56,
    hpPerLevel: 19,
    dmgBase: 11,
    dmgPerLevel: 2.3,
    attackSpeed: 2.0,
    armorPerLevel: 14, // storm-shell
    moveSpeed: 7,
    aggroRadius: 8,
    loot: [],
    scale: 1.2,
    color: 0x8898a8,
  },
  the_wreck_warden: {
    id: 'the_wreck_warden',
    name: 'The Wreck Warden',
    minLevel: 20,
    maxLevel: 20,
    family: 'undead',
    hpBase: 155,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.3,
    armorPerLevel: 17, // barnacled plate
    moveSpeed: 8,
    aggroRadius: 14, // every hull on that beach is a grave he keeps
    elite: true,
    loot: [],
    scale: 1.45,
    color: 0x7a8a86,
  },
};
export const GALECREST_NPCS: Record<string, NpcDef> = {};
export const GALECREST_QUESTS: Record<string, QuestDef> = {};
export const GALECREST_QUEST_ORDER: string[] = [];
export const GALECREST_ITEMS: Record<string, ItemDef> = {};
export const GALECREST_CAMPS: CampDef[] = [
  { mobId: 'moor_ram', center: { x: 292, z: 2732 }, radius: 11, count: 3 },
  { mobId: 'moor_ram', center: { x: 262, z: 2780 }, radius: 10, count: 3 },
  { mobId: 'gale_wisp', center: { x: 302, z: 2942 }, radius: 11, count: 3 },
  { mobId: 'gale_wisp', center: { x: 366, z: 2990 }, radius: 10, count: 3 },
  { mobId: 'shoal_scuttler', center: { x: 444, z: 2858 }, radius: 10, count: 3 },
  { mobId: 'shoal_scuttler', center: { x: 386, z: 3042 }, radius: 9, count: 2 },
  { mobId: 'the_wreck_warden', center: { x: 330, z: 3058 }, radius: 5, count: 1 },
];
export const GALECREST_OBJECTS: GroundObjectDef[] = [];

export const GALECREST_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Wickharbor: a fishing town in the lee of the harbor cove
  buildings: [
    { kind: 'inn', x: 412, z: 2772, w: 6, d: 7, rot: 0.4 },
    { kind: 'house', x: 428, z: 2788, w: 5, d: 5, rot: -1.2 },
    { kind: 'house', x: 410, z: 2790, w: 5, d: 5, rot: 2.2 },
  ],
  wells: [{ x: 420, z: 2782, r: 1.5 }],
  stalls: [
    { x: 426, z: 2774, rot: 0.6, r: 1.6 },
    { x: 414, z: 2780, rot: -1.4, r: 1.6 },
  ],
  crates: [
    [432, 2776],
    [408, 2778],
  ],
  campfires: [
    [420, 2776],
    [196, 2854], // the Windway's waycamp
  ],
  // the harbor: a working dock running into the cove east of town
  docks: [{ x: 436, z: 2792, rot: 2.2, hutLocal: { x: 40, z: 40, hw: 0.1, hd: 0.1 } }],
  fences: [
    // windbreak lines, the only fences that matter here
    { x1: 406, z1: 2766, x2: 434, z2: 2766 },
    { x1: 406, z1: 2796, x2: 434, z2: 2796 },
  ],
  // an old watch ruin on the Howling Downs, and the beacon's fallen forecourt
  ruinRings: [
    { x: 288, z: 2748, ringR: 7, columns: 5 },
    { x: 492, z: 2736, ringR: 6, columns: 4 },
  ],
  graveyards: [{ x: 400, z: 2762 }],
};
