// The Wraithwood (level 20). North past the Nightbloom's dream the road
// slips under the Crowgate and the canopy closes overhead: a drowned-grey
// haunted forest where giant overgrown trees shut out the sky, a drizzle
// that never quite stops, and things between the trunks that watch the
// road. The hamlet of Gallowmere holds the center; Widow's Thicket crawls
// in the west, the Hanging Glade swings in the east, the ruined Mournstone
// Chapel moulders by its black tarn, and the Pale Huntsman keeps his
// clearing in the far north. Terrain: the WOOD_* tables in world.ts; the
// giant canopies, ground mist, and ghost-lights live in
// render/haunt_features.ts (the greatTrees records below give the sim its
// solid trunk colliders).

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

export const WRAITHWOOD_ZONE: ZoneDef = {
  id: 'wraithwood',
  name: 'The Wraithwood',
  zMin: 4200,
  zMax: 4760,
  levelRange: [20, 20],
  biome: 'haunt',
  southPassX: 30, // the Crowgate: where the dream road ducks under the eaves
  hub: { x: 0, z: 4370, radius: 17, name: 'Gallowmere' },
  graveyard: { x: 18, z: 4352 },
  lakes: [
    { x: -70, z: 4440, radius: 10 }, // the Black Looking-Glass
    { x: -48, z: 4580, radius: 9 }, // the chapel tarn
    { x: 92, z: 4384, radius: 11 }, // the Drowned Coppice
  ],
  pois: [
    { x: 0, z: 4370, label: 'Gallowmere' },
    { x: 30, z: 4232, label: 'The Crowgate' },
    { x: -80, z: 4424, label: "Widow's Thicket" },
    { x: 80, z: 4470, label: 'The Hanging Glade' },
    { x: -60, z: 4560, label: 'The Mournstone Chapel' },
    { x: 20, z: 4620, label: "The Huntsman's Clearing" },
  ],
  welcome:
    'The canopy closes over the road like a lid. Keep to the lanterns of Gallowmere, and do not answer if the wood calls your name.',
};

export const WRAITHWOOD_ROADS: { x: number; z: number }[][] = [
  [
    { x: 30, z: 4208 },
    { x: 24, z: 4266 },
    { x: 10, z: 4322 },
    { x: 0, z: 4370 },
  ], // the Crowgate -> Gallowmere
  [
    { x: 0, z: 4370 },
    { x: -38, z: 4394 },
    { x: -64, z: 4412 },
  ], // Gallowmere -> Widow's Thicket
  [
    { x: 0, z: 4370 },
    { x: 36, z: 4408 },
    { x: 62, z: 4444 },
  ], // Gallowmere -> the Hanging Glade
  [
    { x: 0, z: 4370 },
    { x: -22, z: 4440 },
    { x: -42, z: 4510 },
    { x: -54, z: 4548 },
  ], // Gallowmere -> the Mournstone Chapel
  [
    { x: 0, z: 4370 },
    { x: 8, z: 4450 },
    { x: 14, z: 4530 },
    { x: 18, z: 4600 },
  ], // Gallowmere -> the Huntsman's Clearing
  [
    { x: 0, z: 4370 },
    { x: -28, z: 4460 },
    { x: -36, z: 4560 },
    { x: -48, z: 4660 },
    { x: -60, z: 4752 },
  ], // Gallowmere -> east of the chapel tarn -> the Tanglemouth
];

// No portals: walked into under the Crowgate.
export const WRAITHWOOD_PORTALS: PortalDef[] = [];

// Quests and folk follow in a later pass.
export const WRAITHWOOD_MOBS: Record<string, MobTemplate> = {
  widowsilk_spinner: {
    id: 'widowsilk_spinner',
    name: 'Widowsilk Spinner',
    minLevel: 20,
    maxLevel: 20,
    family: 'spider',
    hpBase: 56,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 1.9,
    armorPerLevel: 12,
    moveSpeed: 8.5,
    aggroRadius: 12,
    loot: [],
    scale: 1.3,
    color: 0x3a3440,
  },
  wood_wraith: {
    id: 'wood_wraith',
    name: 'Wood Wraith',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    hpBase: 52,
    hpPerLevel: 18,
    dmgBase: 11,
    dmgPerLevel: 2.3,
    attackSpeed: 2.0,
    armorPerLevel: 10,
    moveSpeed: 8,
    aggroRadius: 12, // it drifts between the trunks, and it minds trespass
    loot: [],
    scale: 1.3,
    color: 0x9ab4a0,
  },
  gravenbark_shambler: {
    id: 'gravenbark_shambler',
    name: 'Gravenbark Shambler',
    minLevel: 20,
    maxLevel: 20,
    family: 'ogre',
    hpBase: 90,
    hpPerLevel: 26,
    dmgBase: 14,
    dmgPerLevel: 2.6,
    attackSpeed: 2.6,
    armorPerLevel: 15,
    moveSpeed: 6.5, // a tree that decided to walk does not hurry
    aggroRadius: 8,
    loot: [],
    scale: 1.35,
    color: 0x4e4a3a,
  },
  pale_huntsman: {
    id: 'pale_huntsman',
    name: 'The Pale Huntsman',
    minLevel: 20,
    maxLevel: 20,
    family: 'undead',
    hpBase: 155,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.2,
    armorPerLevel: 17,
    moveSpeed: 8.5,
    aggroRadius: 16, // the clearing is his, and he knows when you enter it
    elite: true,
    loot: [],
    scale: 1.4,
    color: 0xc8d8c0,
  },
};
export const WRAITHWOOD_NPCS: Record<string, NpcDef> = {};
export const WRAITHWOOD_QUESTS: Record<string, QuestDef> = {};
export const WRAITHWOOD_QUEST_ORDER: string[] = [];
export const WRAITHWOOD_ITEMS: Record<string, ItemDef> = {};
export const WRAITHWOOD_CAMPS: CampDef[] = [
  { mobId: 'widowsilk_spinner', center: { x: -78, z: 4418 }, radius: 10, count: 3 },
  { mobId: 'widowsilk_spinner', center: { x: 108, z: 4404 }, radius: 10, count: 3 },
  { mobId: 'wood_wraith', center: { x: -54, z: 4556 }, radius: 9, count: 3 },
  { mobId: 'wood_wraith', center: { x: 58, z: 4508 }, radius: 10, count: 3 },
  { mobId: 'gravenbark_shambler', center: { x: 84, z: 4466 }, radius: 10, count: 2 },
  { mobId: 'pale_huntsman', center: { x: 20, z: 4620 }, radius: 5, count: 1 },
];
export const WRAITHWOOD_OBJECTS: GroundObjectDef[] = [];

export const WRAITHWOOD_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Gallowmere: a shuttered hamlet under the eaves
  buildings: [
    { kind: 'inn', x: -8, z: 4374, w: 6, d: 7, rot: 0.5 },
    { kind: 'house', x: 8, z: 4366, w: 6, d: 6, rot: -1.2 },
    { kind: 'house', x: -6, z: 4360, w: 5, d: 5, rot: 2.3 },
    { kind: 'chapel', x: 5, z: 4380, w: 5, d: 7, rot: -2.2 },
  ],
  wells: [{ x: 0, z: 4372, r: 1.5 }],
  stalls: [{ x: -4, z: 4366, rot: 0.6, r: 1.6 }],
  crates: [
    [-11, 4370],
    [9, 4372],
  ],
  campfires: [
    [0, 4368],
    [29, 4220], // the Crowgate's waycamp
  ],
  fences: [
    // the hamlet huddles behind its fence line
    { x1: -14, z1: 4356, x2: 14, z2: 4356 },
    { x1: -14, z1: 4386, x2: 14, z2: 4386 },
  ],
  // the Mournstone Chapel ruin and the Huntsman's ring of broken columns
  ruinRings: [
    { x: -60, z: 4560, ringR: 8, columns: 6 },
    { x: 20, z: 4620, ringR: 9, columns: 5 },
  ],
  // grave fields: the wood buries its own
  graveyards: [
    { x: -66, z: 4552 },
    { x: 26, z: 4360 },
    { x: 74, z: 4478 },
  ],
  // The giant overgrown trees the realm is named for: solid trunk colliders
  // in the sim (colliders.ts reads this record), giant canopies drawn by
  // render/haunt_features.ts from the same spots. Kept off every road.
  greatTrees: [
    { x: -34, z: 4300, r: 2.6 },
    { x: 44, z: 4330, r: 3.0 },
    { x: -52, z: 4462, r: 2.8 },
    { x: 34, z: 4470, r: 2.6 },
    { x: -16, z: 4530, r: 3.2 },
    { x: 96, z: 4520, r: 2.6 },
    { x: -96, z: 4500, r: 2.8 },
    { x: 52, z: 4576, r: 3.0 },
    { x: -30, z: 4646, r: 2.6 },
    { x: -110, z: 4380, r: 2.6 },
  ],
};
