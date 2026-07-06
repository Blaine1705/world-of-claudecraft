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
  zMin: 4760,
  zMax: 5320,
  levelRange: [20, 20],
  biome: 'jungle',
  southPassX: -60, // the Tanglemouth: where the haunted road breaks into sun
  hub: { x: 60, z: 4880, radius: 16, name: 'Drifthaven' },
  graveyard: { x: 42, z: 4862 },
  lakes: [
    { x: 90, z: 5010, radius: 15 }, // the Sapphire Lagoon
    { x: -20, z: 5060, radius: 10 }, // the jungle pool
    { x: 24, z: 5218, radius: 11 }, // the northern tarn
  ],
  pois: [
    { x: 60, z: 4880, label: 'Drifthaven' },
    { x: -60, z: 4792, label: 'The Tanglemouth' },
    { x: -100, z: 4950, label: 'The Palmstrand' },
    { x: 0, z: 5040, label: 'The Emerald Tangle' },
    { x: -40, z: 5140, label: 'The Vinefall' },
    { x: 90, z: 5010, label: 'The Sapphire Lagoon' },
    { x: 104, z: 5150, label: 'The Sunken Idol' },
  ],
  welcome:
    'Warm sand, loud birds, and a jungle that eats the horizon. Drifthaven keeps a fire lit on the beach for you.',
};

export const PALMREACH_ROADS: { x: number; z: number }[][] = [
  [
    { x: -60, z: 4768 },
    { x: -40, z: 4812 },
    { x: 4, z: 4850 },
    { x: 60, z: 4880 },
  ], // the Tanglemouth -> along the shore -> Drifthaven
  [
    { x: 60, z: 4880 },
    { x: 0, z: 4920 },
    { x: -60, z: 4940 },
    { x: -92, z: 4948 },
  ], // Drifthaven -> the Palmstrand
  [
    { x: 60, z: 4880 },
    { x: 34, z: 4960 },
    { x: 10, z: 5024 },
  ], // Drifthaven -> the Emerald Tangle
  [
    { x: 10, z: 5024 },
    { x: -18, z: 5090 },
    { x: -36, z: 5130 },
  ], // the Tangle -> the Vinefall
  [
    { x: 60, z: 4880 },
    { x: 84, z: 4950 },
    { x: 118, z: 4988 },
    { x: 122, z: 5078 },
    { x: 104, z: 5132 },
  ], // Drifthaven -> east around the Lagoon -> the Sunken Idol
  [
    { x: 104, z: 5132 },
    { x: 86, z: 5202 },
    { x: 64, z: 5256 },
    { x: 50, z: 5310 },
  ], // the Sunken Idol -> up the north cape -> the Garden Gate
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
  { mobId: 'tide_scuttler', center: { x: -96, z: 4938 }, radius: 10, count: 3 },
  { mobId: 'tide_scuttler', center: { x: 108, z: 4900 }, radius: 10, count: 3 },
  { mobId: 'thicket_boar', center: { x: -8, z: 5000 }, radius: 10, count: 3 },
  { mobId: 'thicket_boar', center: { x: -56, z: 5064 }, radius: 10, count: 3 },
  { mobId: 'canopy_weaver', center: { x: 34, z: 5120 }, radius: 10, count: 3 },
  { mobId: 'canopy_weaver', center: { x: -66, z: 5180 }, radius: 10, count: 2 },
  { mobId: 'idol_guardian', center: { x: 104, z: 5150 }, radius: 5, count: 1 },
];
export const PALMREACH_OBJECTS: GroundObjectDef[] = [];

export const PALMREACH_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Drifthaven: a driftwood village on the strand
  buildings: [
    { kind: 'inn', x: 52, z: 4884, w: 6, d: 7, rot: 0.9 },
    { kind: 'house', x: 68, z: 4874, w: 5, d: 5, rot: -0.7 },
  ],
  wells: [{ x: 60, z: 4882, r: 1.5 }],
  stalls: [
    { x: 64, z: 4888, rot: 0.4, r: 1.6 },
    { x: 55, z: 4872, rot: -1.6, r: 1.6 },
  ],
  tents: [
    { x: 72, z: 4886, rot: 1.1, scale: 1 },
    { x: 48, z: 4894, rot: -2.0, scale: 1.1 },
  ],
  crates: [
    [58, 4876],
    [66, 4880],
  ],
  campfires: [
    [60, 4878],
    [-58, 4780], // the Tanglemouth's waycamp
  ],
  // a fishing dock running off the village beach into the shallows
  docks: [{ x: 74, z: 4898, rot: 0.6, hutLocal: { x: 40, z: 40, hw: 0.1, hd: 0.1 } }],
  mudHuts: [
    [44, 4886],
    [70, 4868],
  ],
  // the Sunken Idol: a mossy ring of drowned-temple columns
  ruinRings: [{ x: 104, z: 5150, ringR: 8, columns: 6 }],
  // The giant banyans of the Vinefall and the deep Tangle: solid trunk
  // colliders in the sim, vine-hung crowns drawn by jungle_features.ts.
  greatTrees: [
    { x: -40, z: 5140, r: 3.2 },
    { x: -62, z: 5118, r: 2.8 },
    { x: -18, z: 5160, r: 3.0 },
    { x: 6, z: 5064, r: 2.8 },
    { x: -30, z: 4990, r: 2.6 },
    { x: 40, z: 5040, r: 2.6 },
    { x: -86, z: 5090, r: 2.6 },
    { x: 22, z: 5180, r: 2.8 },
  ],
};
