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
  riftPortalEligible: true,
  riftTierWeights: { A: 0.35, S: 0.65 },
  zMin: 700,
  zMax: 1260,
  xMin: 180,
  xMax: 540,
  levelRange: [20, 20],
  biome: 'garden',
  southPassX: 400, // the Garden Gate: where the headland road meets the lawns
  westPassZ: 800, // the Gardenwalk: down from the heights onto the lawns
  hub: { x: 320, z: 810, radius: 16, name: 'Hedgewick' },
  // inside the churchyard, east of the chapel (matched to PROPS.graveyards
  // so the Pale Keeper hovers over the headstones, clear of the chapel)
  graveyard: { x: 309, z: 793 },
  lakes: [
    { x: 440, z: 850, radius: 11 }, // the Petal Pond
    { x: 340, z: 1170, radius: 10 }, // the Lily Basin
  ],
  pois: [
    { x: 320, z: 810, label: 'Hedgewick', id: 'hedgewick' },
    { x: 410, z: 732, label: 'The Garden Gate', id: 'the_garden_gate' },
    { x: 360, z: 875, label: 'The Statuary Walk', id: 'the_statuary_walk' },
    { x: 270, z: 910, label: 'The Rose Wilds', id: 'the_rose_wilds' },
    { x: 440, z: 850, label: 'The Petal Pond', id: 'the_petal_pond' },
    { x: 360, z: 946, label: 'The Great Maze', id: 'the_great_maze' },
    { x: 360, z: 1016, label: 'The Fountain Court', id: 'the_fountain_court' },
  ],
  welcome:
    'Someone is still trimming the hedges, though no gardener has been seen for a hundred years. Mind the maze: it minds you back.',
};

export const EVERGARDEN_ROADS: { x: number; z: number }[][] = [
  [
    { x: 398, z: 706 },
    { x: 390, z: 752 },
    { x: 358, z: 784 },
    { x: 320, z: 810 },
  ], // the Garden Gate -> Hedgewick
  [
    { x: 320, z: 810 },
    { x: 344, z: 844 },
    { x: 360, z: 875 },
    { x: 360, z: 936 },
  ], // Hedgewick -> the Statuary Walk -> dead-aligned with the entrance arch
  [
    { x: 320, z: 810 },
    { x: 298, z: 852 },
    { x: 290, z: 872 },
    { x: 288, z: 887 },
  ], // Hedgewick -> the Rose Wilds -> Dawnhold's gate
  [
    // skirts SOUTH around the bluff dip by the pond inlet: the old straight
    // line ran down a steep bank; these waypoints hold the flat shelf
    { x: 320, z: 810 },
    { x: 366, z: 818 },
    { x: 376, z: 826 },
    { x: 388, z: 832 },
    { x: 398, z: 839 },
    { x: 410, z: 836 },
    { x: 422, z: 835 },
  ], // Hedgewick -> around the inlet -> the Petal Pond's west shore
  [
    { x: 410, z: 836 },
    { x: 438, z: 833 },
    { x: 466, z: 827 },
    { x: 480, z: 812 },
    { x: 488, z: 794 },
    { x: 497, z: 772 },
  ], // the pond -> the lakeshore walk south to the Old Mill lawn
  [
    { x: 422, z: 835 },
    { x: 420, z: 878 },
    { x: 454, z: 920 },
    { x: 458, z: 1020 },
    { x: 440, z: 1110 },
    { x: 396, z: 1162 },
    { x: 352, z: 1170 },
  ], // the pond -> the long east walk around the maze -> the Lily Basin
  [
    { x: 352, z: 1170 },
    { x: 376, z: 1208 },
    { x: 390, z: 1256 },
  ], // the Lily Basin -> up to the Crowgate (into the wood)
  [
    { x: 320, z: 810 },
    { x: 268, z: 806 },
    { x: 224, z: 802 },
    { x: 186, z: 800 },
  ], // Hedgewick -> west down the Gardenwalk (onto the heights)
  [
    { x: 387, z: 1098 },
    { x: 400, z: 1102 },
    { x: 420, z: 1104 },
    { x: 440, z: 1110 },
  ], // the maze exit (dead-aligned with the exit arch) -> east to the long walk
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
  hedge_knight: {
    id: 'hedge_knight',
    name: 'Dawnhold Knight',
    minLevel: 20,
    maxLevel: 20,
    family: 'humanoid',
    hpBase: 62,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 1.9,
    armorPerLevel: 13,
    moveSpeed: 8.5,
    aggroRadius: 11, // the castle's old garrison still walks its rounds
    loot: [],
    scale: 1.0,
    color: 0xb8c4d0, // burnished plate
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
  { mobId: 'topiary_stag', center: { x: 364, z: 898 }, radius: 10, count: 3 },
  { mobId: 'topiary_stag', center: { x: 326, z: 1146 }, radius: 10, count: 3 },
  // the castle pack prowls the gate lawn outside Dawnhold's east wall
  { mobId: 'topiary_wolf', center: { x: 294, z: 906 }, radius: 10, count: 3 },
  { mobId: 'topiary_wolf', center: { x: 418, z: 1124 }, radius: 10, count: 3 },
  { mobId: 'hedge_gnome', center: { x: 268, z: 1002 }, radius: 10, count: 3 },
  { mobId: 'hedge_gnome', center: { x: 456, z: 942 }, radius: 10, count: 2 },
  { mobId: 'the_topiary_bull', center: { x: 360, z: 1016 }, radius: 5, count: 1 },
];

// Dawnhold's garrison, registered SEPARATELY: these camps spread at the very
// END of the merged CAMPS array in data.ts (world-gen rng draws in camp
// order, so a mid-array insert would move every later camp's spawn). The
// knights patrol beside the existing topiary wolf camps: the wolves are
// their hounds.
export const EVERGARDEN_KNIGHT_CAMPS: CampDef[] = [
  { mobId: 'hedge_knight', center: { x: 276, z: 886 }, radius: 8, count: 3 }, // Dawnhold gate
  { mobId: 'hedge_knight', center: { x: 410, z: 1118 }, radius: 8, count: 2 }, // the north watch
];
export const EVERGARDEN_OBJECTS: GroundObjectDef[] = [];

export const EVERGARDEN_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Hedgewick: the groundskeepers' hamlet by the gate lawns
  // mid-size buildings (bigger than the old doll scale, smaller than the
  // full-scale pass), spread so every road corridor out of the square walks
  buildings: [
    // the inn stands clear northeast of the churchyard rails
    { kind: 'inn', x: 318, z: 808, w: 9, d: 10, rot: 0.7 },
    { kind: 'house', x: 344, z: 826, w: 8, d: 8, rot: -1.0 },
    { kind: 'house', x: 318, z: 828, w: 8, d: 8, rot: 2.1 },
  ],
  wells: [{ x: 324, z: 814, r: 1.5 }],
  stalls: [{ x: 326, z: 802, rot: 0.5, r: 1.6 }],
  crates: [
    [300, 808],
    [330, 806],
  ],
  campfires: [
    [324, 798],
    [388, 716], // the Garden Gate's waycamp
  ],
  // no wooden hedgerow fences: the hamlet opens onto the lawns, and the
  // churchyard's wrought-iron enclosure (decorProps below) is the one border
  fences: [],
  // a marble folly on the north lawn (the old Statuary Walk colonnade ring
  // came down: it read as rubble among the flower borders)
  ruinRings: [{ x: 400, z: 1182, ringR: 6, columns: 5 }],
  // the gardener's own plot, unweeded and unnamed, inside the churchyard
  // (east of the chapel so the Pale Keeper hovers clear of its collider)
  graveyards: [{ x: 309, z: 793 }],
  // The specimen elders on the lawns: solid trunk colliders in the sim,
  // evergreen crowns drawn by render/garden_features.ts. Kept off every
  // road and clear of the maze.
  greatTrees: [
    { x: 264, z: 850, r: 2.8 },
    { x: 390, z: 902, r: 2.6 },
    { x: 316, z: 1122, r: 3.0 },
    { x: 462, z: 1068, r: 2.6 },
    { x: 244, z: 1034, r: 2.6 },
  ],
  // The built garden (KayKit Medieval Hexagon buildings + the wrought-iron
  // garden set; PROP_ASSET_DEFS keys in render/props.ts). Sites validated
  // against terrain, roads, camps, and the parterre plan by
  // tests/garden_parterre.test.ts.
  decorProps: [
    // the mill lawn: three windmills turning over their own ring beds at the
    // end of the lakeshore walk (garden_parterre_core skips their center
    // bushes; the Old Mill at 504,760 stands tallest)
    { key: 'hexWindmill', x: 504, z: 760, rot: -0.3, scale: 9, r: 5, h: 13 },
    { key: 'hexWindmill', x: 492, z: 744, rot: 0.4, scale: 8, r: 4.5, h: 12 },
    { key: 'hexWindmill', x: 516, z: 750, rot: -1.1, scale: 8, r: 4.5, h: 12 },
    // Dawnhold: the walled garden castle on the Rose Wilds lawn. The keep
    // holds the west side with a WIDE courtyard before the east gate wall
    // (cannon towers flanking the stone arch, plain towers at the rear),
    // and the Rose Wilds road runs right to the gate. The knights garrison
    // the courtyard; their wolves prowl the gate lawn outside.
    { key: 'hexCastle', x: 252, z: 889, rot: Math.PI / 2, scale: 11, r: 12.5, h: 42 },
    { key: 'hexCannonTower', x: 286, z: 866, rot: Math.PI / 2, scale: 9.5, r: 4.8, h: 22 },
    { key: 'hexCannonTower', x: 286, z: 912, rot: Math.PI / 2, scale: 9.5, r: 4.8, h: 22 },
    { key: 'hexTower', x: 240, z: 866, rot: Math.PI / 2, scale: 9.5, r: 4.8, h: 20 },
    { key: 'hexTower', x: 240, z: 912, rot: Math.PI / 2, scale: 9.5, r: 4.8, h: 20 },
    // curtain walls in short overlapping runs so their circle colliders
    // leave no walk-through seams anywhere along a wall line
    { key: 'hexWall', x: 286, z: 872, rot: Math.PI / 2, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 286, z: 880, rot: Math.PI / 2, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 286, z: 898, rot: Math.PI / 2, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 286, z: 906, rot: Math.PI / 2, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 250, z: 912, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 258, z: 912, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 266, z: 912, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 274, z: 912, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 281, z: 912, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 250, z: 866, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 258, z: 866, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 266, z: 866, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 274, z: 866, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'hexWall', x: 281, z: 866, rot: 0, scale: 5, r: 4.5, h: 9 },
    { key: 'gardenArch', x: 286, z: 889, rot: Math.PI / 2, scale: 2.2 },
    { key: 'hexFlag', x: 286, z: 884.5, scale: 4 },
    { key: 'hexFlag', x: 286, z: 893.5, scale: 4 },
    { key: 'hexCannonballs', x: 272, z: 905, scale: 7 },
    { key: 'hexWeaponRack', x: 272, z: 873, rot: 1.2, scale: 9 },
    { key: 'hexBarracks', x: 306, z: 860, rot: -0.9, scale: 8, r: 6, h: 13 },
    // Hedgewick's medieval quarter, spread for easy walking: chapel by the
    // churchyard, tavern on the pond road, smithy west, homes and the
    // market ringing the square with every road corridor kept clear
    { key: 'hexChurch', x: 302, z: 788, rot: Math.PI / 2, scale: 8, r: 5.6, h: 15 },
    { key: 'hexTavern', x: 352, z: 806, rot: -1.45, scale: 8, r: 6, h: 13 },
    { key: 'hexBlacksmith', x: 290, z: 824, rot: 2.03, scale: 7.5, r: 5.6, h: 10 },
    { key: 'hexHomeA', x: 328, z: 838, rot: Math.PI, scale: 7.5, r: 5.2, h: 11 },
    { key: 'hexHomeB', x: 334, z: 790, rot: 0.6, scale: 7.5, r: 5.2, h: 11 },
    { key: 'hexMarket', x: 310, z: 844, rot: Math.PI, scale: 6, r: 4.5, h: 7 },
    // the Garden Gate: a grand doubled arch over the entry road, flanked by
    // flush stone walls (colliders on), with the parterre core's hedge line
    // and flower border along their garden face (the arch stays walk-through:
    // it spans the walk; the maze's own entry/exit arches are the modeled
    // hedge arches garden_features.ts raises over the grid openings)
    { key: 'gardenArch', x: 391, z: 747, rot: 2.97, scale: 2.8 },
    { key: 'hexWall', x: 378.7, z: 744.9, rot: 2.97, scale: 7, r: 6, h: 8 },
    { key: 'hexWall', x: 370, z: 743.5, rot: 2.97, scale: 7, r: 6, h: 8 },
    { key: 'hexWall', x: 403.3, z: 749.1, rot: 2.97, scale: 7, r: 6, h: 8 },
    { key: 'hexWall', x: 415.5, z: 751.2, rot: 2.97, scale: 7, r: 6, h: 8 },
    // towers anchoring the outer ends of the gate walls
    { key: 'hexTower', x: 365.4, z: 742.6, rot: 2.97, scale: 8, r: 4, h: 17 },
    { key: 'hexTower', x: 416.6, z: 751.4, rot: 2.97, scale: 8, r: 4, h: 17 },
    // oaks shading the gate lawns
    { key: 'oakTree', x: 372, z: 760, rot: 0.8, scale: 1.3, r: 0.8, h: 9 },
    { key: 'oakTree', x: 412, z: 738, rot: 2.1, scale: 1.4, r: 0.8, h: 9 },
    { key: 'oakTree', x: 408, z: 760, rot: -1.3, scale: 1.2, r: 0.8, h: 9 },
    { key: 'oakTree', x: 376, z: 732, rot: 0.2, scale: 1.35, r: 0.8, h: 9 },
    // the leafy fox statues: the maintainer's topiary fox as gatekeepers,
    // one pair flanking the maze entrance arch and one pair flanking the
    // exit arch, each turned a little toward the walk between them
    { key: 'leafyFoxStatue', x: 352.5, z: 938, rot: Math.PI - 0.35, scale: 4.5, r: 1.6, h: 4.5 },
    { key: 'leafyFoxStatue', x: 367.5, z: 938, rot: Math.PI + 0.35, scale: 4.5, r: 1.6, h: 4.5 },
    // (the exit pair hugs the mouth corners: the lawn northwest of the exit
    // drops to the pond bank, so wider flanks would stand on the slope)
    { key: 'leafyFoxStatue', x: 381, z: 1095.5, rot: 0.35, scale: 4.5, r: 1.6, h: 4.5 },
    { key: 'leafyFoxStatue', x: 393, z: 1095.5, rot: -0.35, scale: 4.5, r: 1.6, h: 4.5 },
    // watchtowers on the walks: one over the Garden Gate, one at the north
    // knights' post
    { key: 'hexWatchtower', x: 402, z: 720, rot: -2.2, scale: 6.5, r: 3, h: 8 },
    { key: 'hexWatchtower', x: 412, z: 1110, rot: 2.6, scale: 6.5, r: 3, h: 8 },
    // the north watch camp: the knights' kit beside their wolf hounds
    { key: 'hexCannonballs', x: 406, z: 1114, scale: 5 },
    { key: 'hexWeaponRack', x: 415, z: 1113, rot: -0.8, scale: 8 },
    { key: 'hexFlag', x: 410, z: 1107, scale: 3 },
    // the gnome camps read as the groundskeepers' work yards
    { key: 'hexLumber', x: 264, z: 1006, rot: 0.7, scale: 5 },
    { key: 'hexWheelbarrow', x: 272, z: 1005, rot: -1.1, scale: 4 },
    { key: 'hexLumber', x: 452, z: 938, rot: 2.1, scale: 5 },
    { key: 'hexWheelbarrow', x: 460, z: 940, rot: 0.9, scale: 4 },
    // the churchyard's wrought-iron enclosure (walk-through dressing) pulled
    // in close around the chapel and the gardener's plot. Rails run at a
    // 3.5yd pitch (each piece is 4 long) so every run butts INTO its corner
    // pillars with no gaps; the east side leaves an open, gateless entrance
    // facing the town square.
    { key: 'gardenIronPillar', x: 296, z: 782 },
    { key: 'gardenIronPillar', x: 314, z: 782 },
    { key: 'gardenIronPillar', x: 296, z: 800 },
    { key: 'gardenIronPillar', x: 314, z: 800 },
    { key: 'gardenIronFence', x: 298, z: 782 },
    { key: 'gardenIronFence', x: 301.5, z: 782 },
    { key: 'gardenIronFence', x: 305, z: 782 },
    { key: 'gardenIronFence', x: 308.5, z: 782 },
    { key: 'gardenIronFence', x: 312, z: 782 },
    { key: 'gardenIronFence', x: 298, z: 800 },
    { key: 'gardenIronFence', x: 301.5, z: 800 },
    { key: 'gardenIronFence', x: 305, z: 800 },
    { key: 'gardenIronFence', x: 308.5, z: 800 },
    { key: 'gardenIronFence', x: 312, z: 800 },
    { key: 'gardenIronFence', x: 296, z: 784, rot: Math.PI / 2 },
    { key: 'gardenIronFence', x: 296, z: 787.5, rot: Math.PI / 2 },
    { key: 'gardenIronFence', x: 296, z: 791, rot: Math.PI / 2 },
    { key: 'gardenIronFence', x: 296, z: 794.5, rot: Math.PI / 2 },
    { key: 'gardenIronFence', x: 296, z: 798, rot: Math.PI / 2 },
    { key: 'gardenIronFence', x: 314, z: 784, rot: Math.PI / 2 },
    { key: 'gardenIronFence', x: 314, z: 786.25, rot: Math.PI / 2 },
    { key: 'gardenIronFence', x: 314, z: 795.75, rot: Math.PI / 2 },
    { key: 'gardenIronFence', x: 314, z: 798, rot: Math.PI / 2 },
  ],
};
