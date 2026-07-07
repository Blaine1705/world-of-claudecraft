// The Palmreach (level 20). North past the Wraithwood's last black eaves
// the road spills out of the Tanglemouth onto hot white sand: a tropical
// realm of flat coral beaches ringed with palms, a jungle interior so green
// it eats the horizon, giant vine-hung banyans at the Vinefall, and the
// turquoise Sapphire Lagoon cupped in the eastern arm. The beach village of
// Drifthaven keeps its fires lit on the strand. Terrain: the REACH_* tables
// in world.ts (the coast applier flattens every shore into wide beach);
// the palms, banyans, and vines live in render/jungle_features.ts (the
// greatTrees records below give the sim its solid trunk colliders).

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

export const PALMREACH_ZONE: ZoneDef = {
  id: 'palmreach',
  name: 'The Palmreach',
  zMin: 3120,
  zMax: 3680,
  xMin: -540,
  xMax: -180,
  levelRange: [20, 20],
  biome: 'jungle',
  eastPassZ: 3410, // the Tanglemouth, turned sideways: out of the dream, into the sun
  hub: { x: -300, z: 3240, radius: 16, name: 'Drifthaven' },
  graveyard: { x: -318, z: 3222 },
  lakes: [
    { x: -270, z: 3370, radius: 15 }, // the Sapphire Lagoon
    { x: -380, z: 3420, radius: 10 }, // the jungle pool
    { x: -336, z: 3578, radius: 11 }, // the northern tarn
  ],
  pois: [
    { x: -300, z: 3240, label: 'Drifthaven' },
    { x: -420, z: 3152, label: 'The Tanglemouth' },
    { x: -460, z: 3310, label: 'The Palmstrand' },
    { x: -360, z: 3400, label: 'The Emerald Tangle' },
    { x: -400, z: 3500, label: 'The Vinefall' },
    { x: -270, z: 3370, label: 'The Sapphire Lagoon' },
    { x: -256, z: 3510, label: 'The Sunken Idol' },
  ],
  welcome:
    'Warm sand, loud birds, and a jungle that eats the horizon. Drifthaven keeps a fire lit on the beach for you.',
};

export const PALMREACH_ROADS: { x: number; z: number }[][] = [
  [
    { x: -420, z: 3128 },
    { x: -400, z: 3172 },
    { x: -356, z: 3210 },
    { x: -300, z: 3240 },
  ], // the Tanglemouth -> along the shore -> Drifthaven
  [
    { x: -300, z: 3240 },
    { x: -360, z: 3280 },
    { x: -420, z: 3300 },
    { x: -452, z: 3308 },
  ], // Drifthaven -> the Palmstrand
  [
    { x: -300, z: 3240 },
    { x: -326, z: 3320 },
    { x: -350, z: 3384 },
  ], // Drifthaven -> the Emerald Tangle
  [
    { x: -350, z: 3384 },
    { x: -378, z: 3450 },
    { x: -396, z: 3490 },
  ], // the Tangle -> the Vinefall
  [
    { x: -300, z: 3240 },
    { x: -276, z: 3310 },
    { x: -242, z: 3348 },
    { x: -238, z: 3438 },
    { x: -256, z: 3492 },
  ], // Drifthaven -> east around the Lagoon -> the Sunken Idol
  [
    { x: -256, z: 3492 },
    { x: -274, z: 3562 },
    { x: -296, z: 3616 },
    { x: -310, z: 3670 },
  ], // the Sunken Idol -> up the north cape -> the Garden Gate
  [
    { x: -256, z: 3492 },
    { x: -224, z: 3448 },
    { x: -186, z: 3412 },
  ], // the Sunken Idol road -> east to the Tanglemouth (into the dream)
] as { x: number; z: number }[][];

// No portals: walked into through the Tanglemouth.
export const PALMREACH_PORTALS: PortalDef[] = [];

// Quests and folk follow in a later pass.
export const PALMREACH_MOBS: Record<string, MobTemplate> = {
  tide_scuttler: {
    id: 'tide_scuttler',
    name: 'Tide Scuttler',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 54,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 2.0,
    armorPerLevel: 14, // shell
    moveSpeed: 7,
    aggroRadius: 8, // beach crabs mind their tidepools
    loot: [],
    scale: 1.15,
    color: 0xe86848,
  },
  thicket_boar: {
    id: 'thicket_boar',
    name: 'Thicket Boar',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 62,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 1.9,
    armorPerLevel: 12,
    moveSpeed: 8.5,
    aggroRadius: 11,
    loot: [],
    scale: 1.2,
    color: 0x6a4e38,
  },
  canopy_weaver: {
    id: 'canopy_weaver',
    name: 'Canopy Weaver',
    minLevel: 20,
    maxLevel: 20,
    family: 'spider',
    hpBase: 56,
    hpPerLevel: 19,
    dmgBase: 12,
    dmgPerLevel: 2.3,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8.5,
    aggroRadius: 12,
    loot: [],
    scale: 1.25,
    color: 0x4e8a3c,
  },
  idol_guardian: {
    id: 'idol_guardian',
    name: 'The Idol Guardian',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    hpBase: 150,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.4,
    armorPerLevel: 18, // carved stone
    moveSpeed: 7,
    aggroRadius: 14,
    elite: true,
    loot: [],
    scale: 1.5,
    color: 0x9aa87e,
  },
};
export const PALMREACH_NPCS: Record<string, NpcDef> = {};
export const PALMREACH_QUESTS: Record<string, QuestDef> = {};
export const PALMREACH_QUEST_ORDER: string[] = [];
export const PALMREACH_ITEMS: Record<string, ItemDef> = {};
export const PALMREACH_CAMPS: CampDef[] = [
  { mobId: 'tide_scuttler', center: { x: -456, z: 3298 }, radius: 10, count: 3 },
  { mobId: 'tide_scuttler', center: { x: -252, z: 3260 }, radius: 10, count: 3 },
  { mobId: 'thicket_boar', center: { x: -368, z: 3360 }, radius: 10, count: 3 },
  { mobId: 'thicket_boar', center: { x: -416, z: 3424 }, radius: 10, count: 3 },
  { mobId: 'canopy_weaver', center: { x: -326, z: 3480 }, radius: 10, count: 3 },
  { mobId: 'canopy_weaver', center: { x: -426, z: 3540 }, radius: 10, count: 2 },
  { mobId: 'idol_guardian', center: { x: -256, z: 3510 }, radius: 5, count: 1 },
];
export const PALMREACH_OBJECTS: GroundObjectDef[] = [];

export const PALMREACH_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Drifthaven: a driftwood village on the strand
  buildings: [
    { kind: 'inn', x: -308, z: 3244, w: 6, d: 7, rot: 0.9 },
    { kind: 'house', x: -292, z: 3234, w: 5, d: 5, rot: -0.7 },
  ],
  wells: [{ x: -300, z: 3242, r: 1.5 }],
  stalls: [
    { x: -296, z: 3248, rot: 0.4, r: 1.6 },
    { x: -305, z: 3232, rot: -1.6, r: 1.6 },
  ],
  tents: [
    { x: -288, z: 3246, rot: 1.1, scale: 1 },
    { x: -312, z: 3254, rot: -2.0, scale: 1.1 },
  ],
  crates: [
    [-302, 3236],
    [-294, 3240],
  ],
  campfires: [
    [-300, 3238],
    [-418, 3140], // the Tanglemouth's waycamp
  ],
  // a fishing dock running off the village beach into the shallows
  docks: [{ x: -286, z: 3258, rot: 0.6, hutLocal: { x: 40, z: 40, hw: 0.1, hd: 0.1 } }],
  mudHuts: [
    [-316, 3246],
    [-290, 3228],
  ],
  // the Sunken Idol: a mossy ring of drowned-temple columns
  ruinRings: [{ x: -256, z: 3510, ringR: 8, columns: 6 }],
  // The giant banyans of the Vinefall and the deep Tangle: solid trunk
  // colliders in the sim, vine-hung crowns drawn by jungle_features.ts.
  greatTrees: [
    { x: -400, z: 3500, r: 3.2 },
    { x: -422, z: 3478, r: 2.8 },
    { x: -378, z: 3520, r: 3.0 },
    { x: -354, z: 3424, r: 2.8 },
    { x: -390, z: 3350, r: 2.6 },
    { x: -320, z: 3400, r: 2.6 },
    { x: -446, z: 3450, r: 2.6 },
    { x: -338, z: 3540, r: 2.8 },
  ],
};
