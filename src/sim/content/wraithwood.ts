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
  zMin: 3120,
  zMax: 3680,
  xMin: 180,
  xMax: 540,
  levelRange: [20, 20],
  biome: 'haunt',
  southPassX: 390, // the Crowgate: now the climb from the Galecrest's wrecks
  westPassZ: 3400, // the Dreamsedge: where the nightmare leans on the dream
  hub: { x: 360, z: 3290, radius: 17, name: 'Gallowmere' },
  graveyard: { x: 378, z: 3272 },
  lakes: [
    { x: 290, z: 3360, radius: 10 }, // the Black Looking-Glass
    { x: 312, z: 3500, radius: 9 }, // the chapel tarn
    { x: 452, z: 3304, radius: 11 }, // the Drowned Coppice
  ],
  pois: [
    { x: 360, z: 3290, label: 'Gallowmere' },
    { x: 390, z: 3152, label: 'The Crowgate' },
    { x: 280, z: 3344, label: "Widow's Thicket" },
    { x: 440, z: 3390, label: 'The Hanging Glade' },
    { x: 300, z: 3480, label: 'The Mournstone Chapel' },
    { x: 380, z: 3540, label: "The Huntsman's Clearing" },
  ],
  welcome:
    'The canopy closes over the road like a lid. Keep to the lanterns of Gallowmere, and do not answer if the wood calls your name.',
};

export const WRAITHWOOD_ROADS: { x: number; z: number }[][] = [
  [
    { x: 390, z: 3128 },
    { x: 384, z: 3186 },
    { x: 370, z: 3242 },
    { x: 360, z: 3290 },
  ], // the Crowgate -> Gallowmere
  [
    { x: 360, z: 3290 },
    { x: 322, z: 3314 },
    { x: 296, z: 3332 },
  ], // Gallowmere -> Widow's Thicket
  [
    { x: 360, z: 3290 },
    { x: 396, z: 3328 },
    { x: 422, z: 3364 },
  ], // Gallowmere -> the Hanging Glade
  [
    { x: 360, z: 3290 },
    { x: 338, z: 3360 },
    { x: 318, z: 3430 },
    { x: 306, z: 3468 },
  ], // Gallowmere -> the Mournstone Chapel
  [
    { x: 360, z: 3290 },
    { x: 368, z: 3370 },
    { x: 374, z: 3450 },
    { x: 378, z: 3520 },
  ], // Gallowmere -> the Huntsman's Clearing
  [
    { x: 360, z: 3290 },
    { x: 332, z: 3380 },
    { x: 327, z: 3480 },
    { x: 326, z: 3520 },
    { x: 312, z: 3580 },
    { x: 300, z: 3672 },
  ], // Gallowmere -> east of the chapel tarn -> the Tanglemouth
  [
    { x: 296, z: 3332 },
    { x: 244, z: 3368 },
    { x: 184, z: 3400 },
  ], // Widow's Thicket -> west to the Dreamsedge (out of the wood)
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
  { mobId: 'widowsilk_spinner', center: { x: 282, z: 3338 }, radius: 10, count: 3 },
  { mobId: 'widowsilk_spinner', center: { x: 468, z: 3324 }, radius: 10, count: 3 },
  { mobId: 'wood_wraith', center: { x: 306, z: 3476 }, radius: 9, count: 3 },
  { mobId: 'wood_wraith', center: { x: 418, z: 3428 }, radius: 10, count: 3 },
  { mobId: 'gravenbark_shambler', center: { x: 444, z: 3386 }, radius: 10, count: 2 },
  { mobId: 'pale_huntsman', center: { x: 380, z: 3540 }, radius: 5, count: 1 },
];
export const WRAITHWOOD_OBJECTS: GroundObjectDef[] = [];

export const WRAITHWOOD_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Gallowmere: a shuttered hamlet under the eaves
  buildings: [
    { kind: 'inn', x: 352, z: 3294, w: 6, d: 7, rot: 0.5 },
    { kind: 'house', x: 368, z: 3286, w: 6, d: 6, rot: -1.2 },
    { kind: 'house', x: 354, z: 3280, w: 5, d: 5, rot: 2.3 },
    { kind: 'chapel', x: 365, z: 3300, w: 5, d: 7, rot: -2.2 },
  ],
  wells: [{ x: 360, z: 3292, r: 1.5 }],
  stalls: [{ x: 356, z: 3286, rot: 0.6, r: 1.6 }],
  crates: [
    [349, 3290],
    [369, 3292],
  ],
  campfires: [
    [360, 3288],
    [389, 3140], // the Crowgate's waycamp
  ],
  fences: [
    // the hamlet huddles behind its fence line
    { x1: 346, z1: 3276, x2: 374, z2: 3276 },
    { x1: 346, z1: 3306, x2: 374, z2: 3306 },
  ],
  // the Mournstone Chapel ruin and the Huntsman's ring of broken columns
  ruinRings: [
    { x: 300, z: 3480, ringR: 8, columns: 6 },
    { x: 380, z: 3540, ringR: 9, columns: 5 },
  ],
  // grave fields: the wood buries its own
  graveyards: [
    { x: 294, z: 3472 },
    { x: 386, z: 3280 },
    { x: 434, z: 3398 },
  ],
  // The giant overgrown trees the realm is named for: solid trunk colliders
  // in the sim (colliders.ts reads this record), giant canopies drawn by
  // render/haunt_features.ts from the same spots. Kept off every road.
  greatTrees: [
    { x: 326, z: 3220, r: 2.6 },
    { x: 404, z: 3250, r: 3.0 },
    { x: 308, z: 3382, r: 2.8 },
    { x: 394, z: 3390, r: 2.6 },
    { x: 344, z: 3450, r: 3.2 },
    { x: 456, z: 3440, r: 2.6 },
    { x: 264, z: 3420, r: 2.8 },
    { x: 412, z: 3496, r: 3.0 },
    { x: 330, z: 3566, r: 2.6 },
    { x: 250, z: 3300, r: 2.6 },
  ],
};
