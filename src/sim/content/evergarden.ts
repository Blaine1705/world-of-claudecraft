// The Evergarden (level 20). North past the Palmreach's warm sand the road
// climbs through the Garden Gate onto clipped lawn: a vast formal garden
// gone a hundred years without its gardener, yet still trimmed. Marble
// statues line the Statuary Walk, roses run wild in the west, the Petal
// Pond mirrors the east lawn, and at the realm's heart stands the Great
// Maze: a true hedge labyrinth grown from the terrain itself, with the
// Fountain Court (and something horned that guards it) at the center. The
// hamlet of Hedgewick keeps its lamps lit by the gate lawns. Terrain: the
// GARDEN_* tables and the maze grid in world.ts (the hedge walls ARE the
// heightfield, so the sim, the renderer, and the map all agree); statues,
// topiary, and the fountain live in render/garden_features.ts (the
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

export const EVERGARDEN_ZONE: ZoneDef = {
  id: 'evergarden',
  name: 'The Evergarden',
  zMin: 3680,
  zMax: 4240,
  levelRange: [20, 20],
  biome: 'garden',
  southPassX: 30, // the Garden Gate: where the dream road meets the lawns
  hub: { x: -40, z: 3790, radius: 16, name: 'Hedgewick' },
  graveyard: { x: -58, z: 3772 },
  lakes: [
    { x: 80, z: 3830, radius: 11 }, // the Petal Pond
    { x: -20, z: 4150, radius: 10 }, // the Lily Basin
  ],
  pois: [
    { x: -40, z: 3790, label: 'Hedgewick' },
    { x: 50, z: 3712, label: 'The Garden Gate' },
    { x: 0, z: 3855, label: 'The Statuary Walk' },
    { x: -90, z: 3890, label: 'The Rose Wilds' },
    { x: 80, z: 3830, label: 'The Petal Pond' },
    { x: 0, z: 3926, label: 'The Great Maze' },
    { x: 0, z: 3996, label: 'The Fountain Court' },
  ],
  welcome:
    'Someone is still trimming the hedges, though no gardener has been seen for a hundred years. Mind the maze: it minds you back.',
};

export const EVERGARDEN_ROADS: { x: number; z: number }[][] = [
  [
    { x: 30, z: 3688 },
    { x: 28, z: 3732 },
    { x: -2, z: 3764 },
    { x: -40, z: 3790 },
  ], // the Garden Gate -> Hedgewick
  [
    { x: -40, z: 3790 },
    { x: -16, z: 3824 },
    { x: 0, z: 3855 },
    { x: 0, z: 3906 },
  ], // Hedgewick -> the Statuary Walk -> the maze mouth
  [
    { x: -40, z: 3790 },
    { x: -62, z: 3832 },
    { x: -84, z: 3874 },
  ], // Hedgewick -> the Rose Wilds
  [
    { x: -40, z: 3790 },
    { x: 6, z: 3798 },
    { x: 48, z: 3812 },
    { x: 62, z: 3815 },
  ], // Hedgewick -> the Petal Pond's west shore
  [
    { x: 62, z: 3815 },
    { x: 60, z: 3858 },
    { x: 94, z: 3900 },
    { x: 98, z: 4000 },
    { x: 80, z: 4090 },
    { x: 36, z: 4142 },
    { x: -8, z: 4150 },
  ], // the pond -> the long east walk around the maze -> the Lily Basin
] as { x: number; z: number }[][];

// No portals: walked into through the Garden Gate.
export const EVERGARDEN_PORTALS: PortalDef[] = [];

// Quests and folk follow in a later pass.
export const EVERGARDEN_MOBS: Record<string, MobTemplate> = {
  topiary_stag: {
    id: 'topiary_stag',
    name: 'Topiary Stag',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 56,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 9,
    aggroRadius: 0, // clipped leaves grazing the lawn; it minds its own shape
    loot: [],
    scale: 1.15,
    color: 0x3f7e3c,
  },
  topiary_wolf: {
    id: 'topiary_wolf',
    name: 'Topiary Wolf',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 58,
    hpPerLevel: 19,
    dmgBase: 12,
    dmgPerLevel: 2.3,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8.5,
    aggroRadius: 11, // some of the shapes were pruned into hunger
    loot: [],
    scale: 1.15,
    color: 0x4a8a4e,
  },
  hedge_gnome: {
    id: 'hedge_gnome',
    name: 'Hedge Gnome',
    minLevel: 20,
    maxLevel: 20,
    family: 'kobold',
    hpBase: 52,
    hpPerLevel: 18,
    dmgBase: 11,
    dmgPerLevel: 2.2,
    attackSpeed: 1.8,
    armorPerLevel: 10,
    moveSpeed: 8.5,
    aggroRadius: 10, // the unseen groundskeepers, and they hate trespass
    loot: [],
    scale: 0.95,
    color: 0x5a8a46,
  },
  the_topiary_bull: {
    id: 'the_topiary_bull',
    name: 'The Topiary Bull',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 155,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.2,
    armorPerLevel: 17, // a century of hardened green wood
    moveSpeed: 8.5,
    aggroRadius: 12, // the court is his, and the maze feeds him trespassers
    elite: true,
    loot: [],
    scale: 1.45,
    color: 0x2e6a34,
  },
};
export const EVERGARDEN_NPCS: Record<string, NpcDef> = {};
export const EVERGARDEN_QUESTS: Record<string, QuestDef> = {};
export const EVERGARDEN_QUEST_ORDER: string[] = [];
export const EVERGARDEN_ITEMS: Record<string, ItemDef> = {};
export const EVERGARDEN_CAMPS: CampDef[] = [
  { mobId: 'topiary_stag', center: { x: 4, z: 3878 }, radius: 10, count: 3 },
  { mobId: 'topiary_stag', center: { x: -34, z: 4126 }, radius: 10, count: 3 },
  { mobId: 'topiary_wolf', center: { x: -88, z: 3892 }, radius: 10, count: 3 },
  { mobId: 'topiary_wolf', center: { x: 58, z: 4104 }, radius: 10, count: 3 },
  { mobId: 'hedge_gnome', center: { x: -92, z: 3982 }, radius: 10, count: 3 },
  { mobId: 'hedge_gnome', center: { x: 96, z: 3922 }, radius: 10, count: 2 },
  { mobId: 'the_topiary_bull', center: { x: 0, z: 3996 }, radius: 5, count: 1 },
];
export const EVERGARDEN_OBJECTS: GroundObjectDef[] = [];

export const EVERGARDEN_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Hedgewick: the groundskeepers' hamlet by the gate lawns
  buildings: [
    { kind: 'inn', x: -48, z: 3784, w: 6, d: 7, rot: 0.7 },
    { kind: 'house', x: -32, z: 3798, w: 5, d: 5, rot: -1.0 },
    { kind: 'house', x: -46, z: 3800, w: 5, d: 5, rot: 2.1 },
  ],
  wells: [{ x: -40, z: 3792, r: 1.5 }],
  stalls: [{ x: -36, z: 3784, rot: 0.5, r: 1.6 }],
  crates: [
    [-51, 3790],
    [-33, 3790],
  ],
  campfires: [
    [-40, 3786],
    [28, 3696], // the Garden Gate's waycamp
  ],
  fences: [
    // trimmed border hedgerows read as fence lines around the hamlet
    { x1: -54, z1: 3776, x2: -26, z2: 3776 },
    { x1: -54, z1: 3806, x2: -26, z2: 3806 },
  ],
  // the Statuary Walk's marble colonnade, and a folly on the north lawn
  ruinRings: [
    { x: 0, z: 3855, ringR: 7, columns: 6 },
    { x: 40, z: 4162, ringR: 6, columns: 5 },
  ],
  // the gardener's own plot, unweeded and unnamed
  graveyards: [{ x: -62, z: 3776 }],
  // The specimen elders on the lawns: solid trunk colliders in the sim,
  // evergreen crowns drawn by render/garden_features.ts. Kept off every
  // road and clear of the maze.
  greatTrees: [
    { x: -96, z: 3830, r: 2.8 },
    { x: 30, z: 3882, r: 2.6 },
    { x: -44, z: 4102, r: 3.0 },
    { x: 102, z: 4048, r: 2.6 },
    { x: -116, z: 4014, r: 2.6 },
  ],
};
