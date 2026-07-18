// The Galecrest (level 20). The world's first EAST map: a wind-scoured
// headland realm in its own grid column beside the Willowfen, entered on
// foot through the Windway, a pass in the mountain border that runs along
// the shared edge (no teleport; the border ridge is real ground, opened at
// westPassZ). Salt-silvered downs roll to grey sea cliffs; the fishing town
// of Wickharbor keeps its boats in the lee of the harbor cove; the Old
// Beacon burns on the highest head, and the Wreckfields beach their bones
// in the north. Terrain: the GALE_* tables in world.ts; the lighthouse,
// harbor decks, and wreck ribs live in render/gale_features.ts.

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

// Authored always-bloom flower circles (render/foliage.ts reads these the
// way the dusk realm reads REALM_FLOWER_MEADOWS): the little fenced gardens
// behind the beacon-road houses, and the Mirror Tarn's flowering banks.
export const GALECREST_FLOWER_MEADOWS: { x: number; z: number; r: number }[] = [
  { x: 428.5, z: 340, r: 2.2 },
  { x: 444, z: 354, r: 2.2 },
  { x: 439, z: 331, r: 2 },
  { x: 471, z: 308, r: 2.2 },
  { x: 286, z: 556, r: 7 },
  { x: 310, z: 548, r: 7 },
  { x: 306, z: 572, r: 7 },
  { x: 290, z: 572, r: 7 },
];

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
  { mobId: 'topiary_wolf', center: { x: 302, z: 522 }, radius: 11, count: 3 },
  // the pack hunts the open downs northwest of the Mirror Tarn, well clear
  // of the hamlet and the stables
  { mobId: 'topiary_wolf', center: { x: 266, z: 546 }, radius: 8, count: 3 },
  { mobId: 'hedge_gnome', center: { x: 444, z: 438 }, radius: 10, count: 3 },
  { mobId: 'hedge_gnome', center: { x: 386, z: 622 }, radius: 9, count: 2 },
  { mobId: 'the_wreck_warden', center: { x: 330, z: 638 }, radius: 5, count: 1 },
  // the outskirt raider camps (appended: camp order is world-gen rng order):
  // hedge gnomes squat in whatever the raiders left behind
  { mobId: 'hedge_gnome', center: { x: 252, z: 250 }, radius: 4, count: 2 },
  { mobId: 'hedge_gnome', center: { x: 210, z: 410 }, radius: 4, count: 2 },
  { mobId: 'hedge_gnome', center: { x: 354, z: 664 }, radius: 4, count: 2 },
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
    // the harbor market: vendors working the shore behind the boardwalk
    { x: 464, z: 345, rot: 1.2, r: 1.6 },
    { x: 462, z: 361, rot: 0.9, r: 1.6 },
    { x: 452, z: 370, rot: -0.7, r: 1.6 },
  ],
  crates: [
    [437, 365],
    [402, 366],
  ],
  campfires: [
    [432, 361], // the square's fire, in the lee of the market hall
    [196, 434], // the Windway's waycamp
    [455, 363], // the dockers' brazier behind the boardwalk
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
    // little fenced flower gardens behind the beacon-road houses (wood
    // rails; the matching bloom circles live in GALECREST_FLOWER_MEADOWS)
    { x1: 424, z1: 337, x2: 433, z2: 337 },
    { x1: 424, z1: 337, x2: 424, z2: 344 },
    { x1: 438, z1: 351, x2: 447, z2: 351 },
    { x1: 447, z1: 351, x2: 447, z2: 360 },
    { x1: 436, z1: 327, x2: 443, z2: 327 },
    { x1: 436, z1: 327, x2: 436, z2: 336 },
    { x1: 466, z1: 305, x2: 475, z2: 305 },
    { x1: 475, z1: 305, x2: 475, z2: 313 },
    // the Beacon keepers' yard wall on the headland
    { x1: 505, z1: 304, x2: 513, z2: 304, kind: 'stone' },
    // the stables' walled south yard: stone runs close the barn yard's open
    // side, leaving a gateway in line with the race-yard gate (Marla's post)
    { x1: 332, z1: 606, x2: 360, z2: 606, kind: 'stone' },
    { x1: 372, z1: 606, x2: 378, z2: 606, kind: 'stone' },
    // the grooms' hamlet garden, facing the paddock across the lane
    { x1: 322, z1: 592, x2: 322, z2: 603, kind: 'stone' },
    // the raider camps' spiked palisades (two runs guarding each camp's
    // open flank; layouts mirror the KayKit encampment reference)
    { x1: 243, z1: 238, x2: 257, z2: 236, kind: 'palisade' },
    { x1: 238, z1: 242, x2: 242, z2: 251, kind: 'palisade' },
    { x1: 198, z1: 398, x2: 212, z2: 395, kind: 'palisade' },
    { x1: 194, z1: 403, x2: 197, z2: 412, kind: 'palisade' },
    { x1: 344, z1: 650, x2: 356, z2: 648, kind: 'palisade' },
    { x1: 341, z1: 654, x2: 344, z2: 663, kind: 'palisade' },
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
    // the dock district, breathing room on both sides of the beacon road:
    // the shipwright's yard alone by the north shingle, and the ship
    // monument ACROSS the road on the inland rise, the anchor at its side
    { key: 'hexbShipyard', x: 477, z: 336, rot: 1.3, scale: 7, r: 6.5, h: 10 },
    { key: 'shipMonument', x: 447, z: 321, rot: 2.2, scale: 7, r: 3.4, h: 7 },
    { key: 'hexAnchor', x: 452, z: 326, rot: -0.6, scale: 7 },
    // the fleet, moored on the piers' open sides only (berths verified
    // against the deck rectangles in sim/gale_harbor.ts; the r4 collider
    // stays clear of every walkway so nobody wedges between hull and rail)
    { key: 'hexShipBlue', x: 492.9, z: 350.2, rot: -1.84, scale: 6, r: 4, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 475.1, z: 368.7, rot: 1.45, scale: 6, r: 4, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 487, z: 370.1, rot: -1.69, scale: 6, r: 4, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 456.6, z: 382.8, rot: 1.3, scale: 6, r: 4, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 468.1, z: 386, rot: -1.84, scale: 6, r: 4, h: 9, float: 0.55 },
    // the Beacon dock's pair, alongside the lighthouse pier
    { key: 'hexShipBlue', x: 526.4, z: 323.8, rot: 0.79, scale: 6, r: 4, h: 9, float: 0.55 },
    { key: 'hexShipBlue', x: 523.8, z: 340.4, rot: -2.36, scale: 6, r: 4, h: 9, float: 0.55 },
    // dinghies: two on the water, one hauled out by the rack on the shingle
    { key: 'hexBoat', x: 474, z: 354, rot: 0.7, scale: 6, float: 0.1 },
    { key: 'hexBoat', x: 479, z: 357.5, rot: -1.8, scale: 6, float: 0.1 },
    { key: 'hexBoat', x: 484, z: 346, rot: 2.3, scale: 6 },
    { key: 'hexBoatrack', x: 486, z: 340, rot: 0.9, scale: 6 },
    // harbor cargo around the office and the stalls
    { key: 'hexCrateBig', x: 457, z: 362, rot: 0.4, scale: 5 },
    { key: 'hexCrateOpen', x: 447, z: 362, rot: 1.7, scale: 5 },
    { key: 'hexSack', x: 462, z: 357, rot: 2.8, scale: 5 },
    { key: 'hexSack', x: 437, z: 372, rot: 0.9, scale: 5 },
    { key: 'hexCrateBig', x: 446, z: 383, rot: 2.1, scale: 5 },
    // the Beacon's keepers, spread across the head: the cottage across the
    // road on the inland side, the store and home wide on the headland
    { key: 'hexbHomeA', x: 470, z: 310, rot: 0.64, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbWorkshop', x: 515, z: 305, rot: -1.57, scale: 6.5, r: 6, h: 8 },
    { key: 'hexbHomeB', x: 498, z: 294, rot: 0.2, scale: 7, r: 5, h: 10 },
    // the harbor gun, watching the eastern water from the lighthouse lawn
    { key: 'hexCannon', x: 504, z: 315, rot: 1.2, scale: 6, r: 1.8, h: 3 },
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
    // and the road side of the stables: homes and a third barn spread
    // evenly along the Wreckfields road, east and south of the paddock
    { key: 'hexbHomeA', x: 448, z: 558, rot: -1.5, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbStables', x: 450, z: 576, rot: -1.57, scale: 7, r: 5.5, h: 9 },
    { key: 'hexbHomeB', x: 368, z: 624, rot: Math.PI, scale: 7.5, r: 5, h: 10 },
    { key: 'hexbHomeA', x: 394, z: 620, rot: 2.9, scale: 7.5, r: 4.5, h: 8 },
    { key: 'hexbStables', x: 404, z: 612, rot: 0.5, scale: 7, r: 5.5, h: 9 },
    { key: 'hexHaybale', x: 446, z: 581, rot: 1.3, scale: 5 },
    { key: 'hexHaybale', x: 409, z: 618, rot: 0.2, scale: 5 },
    { key: 'hexTrough', x: 453, z: 570, rot: 0.1, scale: 5 },
    // the raider encampments on the outer downs (KayKit hide tents, spiked
    // palisades, and watchtowers; the wind keeps what the raiders left):
    // camp A on the far north downs
    { key: 'hexrTent', x: 245, z: 245, rot: 0.9, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrTent', x: 259, z: 246, rot: -0.8, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrTent', x: 254, z: 259, rot: 2.4, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrWatchtower', x: 243, z: 256, rot: 0.7, scale: 6, r: 2.6, h: 9 },
    { key: 'hexFlagRed', x: 249, z: 252, rot: 0.3, scale: 5 },
    { key: 'hexFlagRed', x: 259, z: 253, rot: 2.1, scale: 5 },
    { key: 'hexBarrel', x: 256, z: 242, rot: 0.8, scale: 5 },
    { key: 'hexTarget', x: 263, z: 258, rot: -1.2, scale: 5 },
    // camp B on the rise above the Windway road
    { key: 'hexrTent', x: 204, z: 404, rot: 0.4, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrTent', x: 217, z: 405, rot: -1.3, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrTent', x: 212, z: 417, rot: 2.9, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrWatchtower', x: 201, z: 417, rot: 1.2, scale: 6, r: 2.6, h: 9 },
    { key: 'hexFlagRed', x: 208, z: 411, rot: 1.1, scale: 5 },
    { key: 'hexFlagRed', x: 216, z: 412, rot: -0.4, scale: 5 },
    { key: 'hexBarrel', x: 214, z: 399, rot: 2.3, scale: 5 },
    { key: 'hexTarget', x: 220, z: 416, rot: 0.6, scale: 5 },
    // camp C on the downs above the Wreckfields, watching the Garden Gate
    // road from its west shoulder
    { key: 'hexrTent', x: 347, z: 659, rot: 1.1, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrTent', x: 361, z: 660, rot: -0.9, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrTent', x: 356, z: 673, rot: 2.6, scale: 7, r: 4.5, h: 5 },
    { key: 'hexrWatchtower', x: 345, z: 670, rot: 0.9, scale: 6, r: 2.6, h: 9 },
    { key: 'hexFlagRed', x: 351, z: 666, rot: 1.9, scale: 5 },
    { key: 'hexFlagRed', x: 361, z: 667, rot: -0.7, scale: 5 },
    { key: 'hexBarrel', x: 358, z: 656, rot: 1.4, scale: 5 },
    { key: 'hexTarget', x: 365, z: 672, rot: 2.2, scale: 5 },
  ],
  // an old watch ruin out on the Howling Downs
  ruinRings: [{ x: 288, z: 328, ringR: 7, columns: 5 }],
  graveyards: [{ x: 400, z: 342 }],
};
