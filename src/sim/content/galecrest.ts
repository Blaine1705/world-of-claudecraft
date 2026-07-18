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
  riftPortalEligible: true,
  riftTierWeights: { A: 0.4, S: 0.6 },
  zMin: 180,
  zMax: 700,
  xMin: 180,
  xMax: 540,
  levelRange: [20, 20],
  biome: 'gale',
  westPassZ: 440, // the Windway: where the marsh road climbs into the wind
  hub: { x: 420, z: 360, radius: 16, name: 'Wickharbor' },
  graveyard: { x: 404, z: 344 },
  lakes: [
    { x: 300, z: 560, radius: 10 }, // the Mirror Tarn, up on the downs
  ],
  pois: [
    { x: 420, z: 360, label: 'Wickharbor', id: 'wickharbor' },
    { x: 200, z: 440, label: 'The Windway', id: 'the_windway' },
    { x: 280, z: 320, label: 'The Howling Downs', id: 'the_howling_downs' },
    { x: 498, z: 308, label: 'The Old Beacon', id: 'the_old_beacon' },
    { x: 455, z: 535, label: 'The Shear', id: 'the_shear' },
    { x: 340, z: 645, label: 'The Wreckfields', id: 'the_wreckfields' },
    { x: 300, z: 560, label: 'The Mirror Tarn', id: 'the_mirror_tarn' },
    { x: 378, z: 598, label: 'The Galecrest Stables', id: 'the_galecrest_stables' },
  ],
  welcome:
    'The wind has never once stopped here, and the Old Beacon has never once gone out. Wickharbor asks only that you close the inn door behind you.',
};

export const GALECREST_ROADS: { x: number; z: number }[][] = [
  [
    { x: 186, z: 440 },
    { x: 240, z: 412 },
    { x: 300, z: 378 },
    { x: 360, z: 362 },
    { x: 420, z: 360 },
  ], // the Windway -> across the downs -> Wickharbor
  [
    { x: 420, z: 360 },
    { x: 458, z: 332 },
    { x: 492, z: 312 },
  ], // Wickharbor -> the Old Beacon
  [
    { x: 420, z: 360 },
    { x: 432, z: 440 },
    { x: 446, z: 512 },
    { x: 438, z: 552 },
    { x: 434, z: 610 },
    { x: 390, z: 634 },
    { x: 352, z: 636 },
  ], // Wickharbor -> above the Shear -> past the stables' east fence -> the Wreckfields
  [
    { x: 420, z: 360 },
    { x: 352, z: 342 },
    { x: 296, z: 324 },
  ], // Wickharbor -> the Howling Downs
  [
    { x: 432, z: 440 },
    { x: 372, z: 488 },
    { x: 316, z: 538 },
  ], // the cliff road -> up to the Mirror Tarn
  [
    { x: 352, z: 636 },
    { x: 376, z: 666 },
    { x: 396, z: 698 },
  ], // the Wreckfields -> up to the Garden Gate (onto the lawns)
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
  { mobId: 'moor_ram', center: { x: 292, z: 312 }, radius: 11, count: 3 },
  { mobId: 'moor_ram', center: { x: 262, z: 360 }, radius: 10, count: 3 },
  { mobId: 'gale_wisp', center: { x: 302, z: 522 }, radius: 11, count: 3 },
  // west of the stables hamlet, out on the open downs past the Mirror Tarn
  { mobId: 'gale_wisp', center: { x: 284, z: 578 }, radius: 10, count: 3 },
  { mobId: 'shoal_scuttler', center: { x: 444, z: 438 }, radius: 10, count: 3 },
  { mobId: 'shoal_scuttler', center: { x: 386, z: 622 }, radius: 9, count: 2 },
  { mobId: 'the_wreck_warden', center: { x: 330, z: 638 }, radius: 5, count: 1 },
];
export const GALECREST_OBJECTS: GroundObjectDef[] = [];

export const GALECREST_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Wickharbor: the coast's medieval harbor city, laid out along its four
  // street spokes (the roads above): every house fronts a street with open
  // ground around it, the blue-roofed KayKit quarter (decorProps below)
  // holds the square and the corners, and the walkable stilt piers of the
  // harbor (sim/gale_harbor.ts) run out over the bay from the dock district
  buildings: [
    // the inn on the south square's west side, timber houses down the roads
    { kind: 'inn', x: 405, z: 371, w: 6, d: 7, rot: Math.PI },
    { kind: 'house', x: 376, z: 371, w: 5, d: 5, rot: Math.PI },
    { kind: 'house', x: 413, z: 381, w: 5, d: 5, rot: 1.62 },
    { kind: 'house', x: 434, z: 390, w: 5, d: 5, rot: -1.48 },
    { kind: 'house', x: 417, z: 405, w: 5, d: 6, rot: 1.52 },
    { kind: 'house', x: 409, z: 394, w: 5, d: 5, rot: 1.68 },
  ],
  wells: [{ x: 427, z: 362, r: 1.5 }],
  stalls: [
    // the square market, flanking the south road out of the junction
    { x: 415, z: 373, rot: 0.7, r: 1.6 },
    { x: 419, z: 352, rot: -2.2, r: 1.6 },
    // the harbor market: vendors working the boardwalk roots and pier gates
    { x: 465, z: 349, rot: 1.2, r: 1.6 },
    { x: 461, z: 362, rot: 0.9, r: 1.6 },
    { x: 450, z: 366, rot: -0.7, r: 1.6 },
  ],
  crates: [
    [437, 365],
    [402, 366],
  ],
  campfires: [
    [432, 361], // the square's fire, in the lee of the market hall
    [196, 434], // the Windway's waycamp
    [476, 344], // the dockers' brazier above the north boardwalk
  ],
  // (no pirate-kit mini docks here: Wickharbor's piers are the walkable
  // stilt decks in sim/gale_harbor.ts, drawn by render/gale_features.ts)
  docks: [],
  fences: [
    // Wickharbor's stone garden walls (the KayKit scalloped fence): the
    // townhall's back wall, the walled churchyard, the West Street edging
    // by the inn, and the road-side house gardens down the south road
    { x1: 406, z1: 334, x2: 422, z2: 334, kind: 'stone' },
    { x1: 394, z1: 336, x2: 394, z2: 348, kind: 'stone' },
    { x1: 394, z1: 348, x2: 406, z2: 348, kind: 'stone' },
    { x1: 396, z1: 366, x2: 402, z2: 366, kind: 'stone' },
    { x1: 408, z1: 366, x2: 414, z2: 366, kind: 'stone' },
    { x1: 409, z1: 376, x2: 409, z2: 386, kind: 'stone' },
    { x1: 430, z1: 385, x2: 430, z2: 394, kind: 'stone' },
    // the Beacon keepers' yard wall on the headland
    { x1: 505, z1: 304, x2: 513, z2: 304, kind: 'stone' },
    // the stables' walled south yard: stone runs close the barn yard's open
    // side, leaving a gateway in line with the race-yard gate (Marla's post)
    { x1: 332, z1: 606, x2: 360, z2: 606, kind: 'stone' },
    { x1: 372, z1: 606, x2: 378, z2: 606, kind: 'stone' },
    // the grooms' hamlet garden, facing the paddock across the lane
    { x1: 322, z1: 592, x2: 322, z2: 603, kind: 'stone' },
  ],
  // the blue-roofed medieval quarter, the dock district, the Beacon's
  // keepers, and the stables hamlet (float: hulls ride at their draft)
  decorProps: [
    // the square: townhall north, market hall east, tavern by the shore
    { key: 'hexbTownhall', x: 414, z: 342, rot: 0.5, scale: 8, r: 6.5, h: 15 },
    { key: 'hexbMarket', x: 433, z: 369, rot: -1.9, scale: 6, r: 4.5, h: 7 },
    { key: 'hexbTavern', x: 441, z: 380, rot: -1.45, scale: 7.5, r: 5.5, h: 11 },
    { key: 'hexbWorkshop', x: 390, z: 373, rot: Math.PI, scale: 7, r: 6, h: 8 },
    // homes fronting the beacon road and the downs road
    { key: 'hexbHomeA', x: 429, z: 342, rot: 0.64, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbHomeB', x: 442, z: 356, rot: -2.5, scale: 7.5, r: 5, h: 10 },
    { key: 'hexbHomeA', x: 441, z: 332, rot: 0.64, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbHomeB', x: 386, z: 336, rot: -0.28, scale: 7.5, r: 5, h: 10 },
    // the dock district: the shipwright's yard and the harbormaster's office
    { key: 'hexbShipyard', x: 468, z: 338, rot: 1.35, scale: 7, r: 6.5, h: 10 },
    { key: 'hexbDocks', x: 455, z: 357, rot: 1.55, scale: 6, r: 4, h: 7 },
    // the fleet, moored bow-to-stern along the pier sides (berths verified
    // against the deck rectangles in sim/gale_harbor.ts)
    { key: 'hexShipBlue', x: 488.4, z: 349.9, rot: -1.64, scale: 6, r: 5, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 491.6, z: 361.4, rot: 1.5, scale: 6, r: 5, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 481.2, z: 368.5, rot: 1.62, scale: 6, r: 5, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 459.5, z: 370.5, rot: 1.18, scale: 6, r: 5, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 470.6, z: 375.1, rot: -1.96, scale: 6, r: 5, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 463.4, z: 384.9, rot: 1.18, scale: 6, r: 5, h: 9, float: 0.55 },
    // the Beacon dock's pair, alongside the lighthouse pier
    { key: 'hexShipBlue', x: 518.7, z: 318.9, rot: 1.15, scale: 6, r: 5, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 521.8, z: 334.1, rot: -1.99, scale: 6, r: 5, h: 9, float: 0.55 },
    // dinghies: two on the water, one hauled out by the rack on the shingle
    { key: 'hexBoat', x: 476, z: 351, rot: 0.7, scale: 6, float: 0.1 },
    { key: 'hexBoat', x: 482, z: 357, rot: -1.8, scale: 6, float: 0.1 },
    { key: 'hexBoat', x: 485, z: 339, rot: 2.3, scale: 6 },
    { key: 'hexBoatrack', x: 478, z: 336, rot: 0.9, scale: 6 },
    // the ship monument on the harbor plaza, the anchor at its side
    { key: 'shipMonument', x: 452, z: 346, rot: 0.9, scale: 7, r: 3.4, h: 7 },
    { key: 'hexAnchor', x: 459, z: 344, rot: -0.6, scale: 7 },
    // harbor cargo around the office and the stalls
    { key: 'hexCrateBig', x: 457, z: 362, rot: 0.4, scale: 5 },
    { key: 'hexCrateOpen', x: 447, z: 362, rot: 1.7, scale: 5 },
    { key: 'hexSack', x: 462, z: 357, rot: 2.8, scale: 5 },
    { key: 'hexSack', x: 437, z: 372, rot: 0.9, scale: 5 },
    { key: 'hexCrateBig', x: 446, z: 383, rot: 2.1, scale: 5 },
    // the Beacon's keepers: cottage on the road, store and home on the head
    { key: 'hexbHomeA', x: 483, z: 328, rot: -0.9, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbWorkshop', x: 508, z: 312, rot: -2.2, scale: 6.5, r: 6, h: 8 },
    { key: 'hexbHomeB', x: 502, z: 298, rot: 2.7, scale: 7, r: 5, h: 10 },
    // the golden horse rears beside the stables' race-yard entrance
    { key: 'goldenHorseStatue', x: 374, z: 591.5, rot: Math.PI, scale: 5.5, r: 2.4, h: 6 },
    // the grooms' hamlet on the downs west of the paddock: two long barns,
    // the grooms' cottage, and the farrier's shop off the south fence
    { key: 'hexbStables', x: 315, z: 570, rot: Math.PI / 2, scale: 7, r: 5.5, h: 9 },
    { key: 'hexbStables', x: 315, z: 584, rot: Math.PI / 2, scale: 7, r: 5.5, h: 9 },
    { key: 'hexbHomeA', x: 317, z: 598, rot: 0.6, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbWorkshop', x: 346, z: 620, rot: -0.4, scale: 6, r: 5, h: 8 },
    { key: 'hexHaybale', x: 323, z: 576, rot: 0.7, scale: 5 },
    { key: 'hexHaybale', x: 322, z: 589, rot: 2.1, scale: 5 },
    { key: 'hexTrough', x: 326, z: 571, rot: Math.PI / 2, scale: 5 },
  ],
  // an old watch ruin on the Howling Downs, and the beacon's fallen forecourt
  ruinRings: [
    { x: 288, z: 328, ringR: 7, columns: 5 },
    { x: 486, z: 300, ringR: 6, columns: 4 },
  ],
  graveyards: [{ x: 400, z: 342 }],
};
