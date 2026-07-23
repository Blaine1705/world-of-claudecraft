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
  ],
  welcome:
    'The wind has never once stopped here, and the Old Beacon has never once gone out. Wickharbor asks only that you close the inn door behind you.',
  welcomeQuestId: 'q_gc_down_the_windway',
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
    { x: 410, z: 588 },
    { x: 352, z: 636 },
  ], // Wickharbor -> above the Shear -> the Wreckfields
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
    loot: [{ itemId: 'galecrest_ram_wool', chance: 0.65, questId: 'q_gc_wool_off_the_downs' }],
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
  // The Warden's crews (q_gc_dead_mens_cargo): the drowned sailors of the
  // Wreckfields, risen to drag the flotsam back below the tideline. Spawned
  // by the quest camps appended at the END of the merged CAMPS array
  // (draw-order rule).
  drowned_deckhand: {
    id: 'drowned_deckhand',
    name: 'Drowned Deckhand',
    minLevel: 20,
    maxLevel: 20,
    family: 'undead',
    hpBase: 58,
    hpPerLevel: 19,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 2.0,
    armorPerLevel: 13,
    moveSpeed: 7.5,
    aggroRadius: 12,
    loot: [],
    scale: 1.05,
    color: 0x86988e,
  },
};
// The folk of the Galecrest: a watcher holds the Windway waycamp, the
// harbormaster runs Wickharbor from the quay, the keeper tends the Old
// Beacon on its head, and a salvager works the Wreckfields alone on the far
// shore. The keeper and the salvager stand far from the hub on purpose: the
// chains send players out to find them.
export const GALECREST_NPCS: Record<string, NpcDef> = {
  watcher_maren: {
    id: 'watcher_maren',
    name: 'Watcher Maren',
    title: 'The Windway Watch',
    pos: { x: 194, z: 436 },
    facing: -0.6,
    color: 0x9aa8b4,
    questIds: ['q_gc_down_the_windway'],
    greeting:
      'Mind your footing past the gate. The wind up here takes hats first and questions never.',
  },
  harbormaster_odile: {
    id: 'harbormaster_odile',
    name: 'Harbormaster Odile',
    title: 'Harbormaster of Wickharbor',
    pos: { x: 424, z: 364 },
    facing: -2.2,
    color: 0x4a6a8a,
    questIds: [
      'q_gc_down_the_windway',
      'q_gc_wool_off_the_downs',
      'q_gc_scuttlers_in_the_pots',
      'q_gc_keeper_of_the_flame',
    ],
    greeting:
      'Every boat in this cove owes the Old Beacon its keel. Speak quick, the tide will not wait.',
  },
  keeper_bram: {
    id: 'keeper_bram',
    name: 'Keeper Bram',
    title: 'Keeper of the Old Beacon',
    pos: { x: 496, z: 310 },
    facing: 2.6,
    color: 0xc8b06a,
    questIds: [
      'q_gc_keeper_of_the_flame',
      'q_gc_lanterns_on_the_shear',
      'q_gc_wind_against_the_wick',
      'q_gc_the_far_shore',
    ],
    greeting:
      'Nine and thirty years this lamp has burned on my watch. It will not go dark on yours.',
  },
  salvager_edda: {
    id: 'salvager_edda',
    name: 'Salvager Edda',
    title: 'Wreckfield Salvager',
    pos: { x: 360, z: 630 },
    facing: -1.8,
    color: 0x7d8a6a,
    questIds: ['q_gc_the_far_shore', 'q_gc_dead_mens_cargo', 'q_gc_the_wreck_warden'],
    greeting:
      "Wreckwood, rope, and dead men's cargo. The sea pays my wage, when the Warden lets it.",
  },
};
export const GALECREST_QUESTS: Record<string, QuestDef> = {
  q_gc_down_the_windway: {
    id: 'q_gc_down_the_windway',
    name: 'Down the Windway',
    giverNpcId: 'watcher_maren',
    turnInNpcId: 'harbormaster_odile',
    text: 'You made the climb, $N, so the wind has decided to keep you. Wickharbor sits east along the downs road, tucked in the lee of its cove. Harbormaster Odile counts every soul who comes over the pass, and she will want to count you. Tell her the Windway is still open.',
    completionText:
      'Over the pass on foot, in this weather? Maren sends me few enough names, and fewer still walk in to answer for themselves. Welcome to Wickharbor, $N. Close the inn door behind you.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'harbormaster_odile',
        count: 1,
        label: 'Report to Harbormaster Odile',
      },
    ],
    xpReward: 2600,
    copperReward: 1000,
    itemRewards: {},
    minLevel: 19,
  },
  q_gc_wool_off_the_downs: {
    id: 'q_gc_wool_off_the_downs',
    name: 'Wool off the Downs',
    giverNpcId: 'harbormaster_odile',
    turnInNpcId: 'harbormaster_odile',
    text: 'My boat crews row into a gale that cuts through oilskin like paper, $N. Only one thing turns this wind: the greasy wool off the moor rams, spun thick the Wickharbor way. The herds graze the Howling Downs west of town. Six good fleeces and every crew rows warm this season.',
    completionText:
      'Fleece like this is why the rams stand out there fat and smug in weather that kills men. The spinners will be at it by lamplight. Take these treads, $N, they are lined from the last shearing.',
    objectives: [
      { type: 'collect', itemId: 'galecrest_ram_wool', count: 6, label: 'Greasy Ram Wool' },
    ],
    xpReward: 4600,
    copperReward: 2200,
    itemRewards: {
      warrior: 'wickspun_treads',
      mage: 'wickspun_treads',
      rogue: 'wickspun_treads',
    },
    requiresQuest: 'q_gc_down_the_windway',
  },
  q_gc_scuttlers_in_the_pots: {
    id: 'q_gc_scuttlers_in_the_pots',
    name: 'Scuttlers in the Pots',
    giverNpcId: 'harbormaster_odile',
    turnInNpcId: 'harbormaster_odile',
    text: 'The shoal scuttlers have learned to climb the cliff road and crack our crab pots open on the stones, $N. Half the catch gone this week, and one potman with a hand he will not be using for a month. Break ten of them and the rest will remember why they kept to the shoals.',
    completionText:
      'Ten fewer shells on my road, and the pots came up full this morning. The potmen are calling you a good omen, $N. In Wickharbor that is as warm as praise gets.',
    objectives: [
      { type: 'kill', targetMobId: 'shoal_scuttler', count: 10, label: 'Shoal Scuttler slain' },
    ],
    xpReward: 4600,
    copperReward: 2400,
    itemRewards: {},
    requiresQuest: 'q_gc_down_the_windway',
  },
  q_gc_keeper_of_the_flame: {
    id: 'q_gc_keeper_of_the_flame',
    name: 'The Keeper of the Flame',
    giverNpcId: 'harbormaster_odile',
    turnInNpcId: 'keeper_bram',
    text: 'Old Bram keeps the Beacon on the high head northeast of town, and he has not come down for his stores in two weeks. The lamp still burns, so he lives, but a man his age alone on that head in this wind, $N. Climb the beacon road and see him standing.',
    completionText:
      'Odile sent you all this way to see if the wind had taken me? Ha. Tell her the lamp burns and so do I. But since you have made the climb, $N, stay a moment. The Beacon has work only a stranger seems fit to do.',
    objectives: [
      { type: 'interact', targetNpcId: 'keeper_bram', count: 1, label: 'Find Keeper Bram' },
    ],
    xpReward: 2600,
    copperReward: 1000,
    itemRewards: {},
    requiresQuest: 'q_gc_scuttlers_in_the_pots',
    minLevel: 20,
  },
  q_gc_lanterns_on_the_shear: {
    id: 'q_gc_lanterns_on_the_shear',
    name: 'Lanterns on the Shear',
    giverNpcId: 'keeper_bram',
    turnInNpcId: 'keeper_bram',
    text: 'The Beacon is the great light, $N, but it is the storm-lanterns that walk a night traveler down the cliff road above the Shear. Last night the gale doused every one of them, and that road in the dark is a long fall with a short ending. Take my striker and relight the four along the cliff.',
    completionText:
      'Four points of light on the cliff road, right where they belong. From up here it looks like the coast has opened its eyes again. You have the makings of a keeper, $N.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'shear_storm_lantern',
        count: 4,
        label: 'Storm-lantern relit',
      },
    ],
    xpReward: 4800,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_gc_keeper_of_the_flame',
  },
  q_gc_wind_against_the_wick: {
    id: 'q_gc_wind_against_the_wick',
    name: 'Wind Against the Wick',
    giverNpcId: 'keeper_bram',
    turnInNpcId: 'keeper_bram',
    text: 'The gale wisps are the wind gone spiteful, $N. They gather on the high downs by the Mirror Tarn, and every flame they find, they snuff, a lantern, a hearth, one day this lamp. Thirty-nine years I have kept the Beacon lit, and I will not lose it to weather with a grudge. Scatter eight of them.',
    completionText:
      'The lamp did not so much as gutter last night, first time in a month. The wind still hates us, $N, but it has gone back to hating us fairly.',
    objectives: [
      { type: 'kill', targetMobId: 'gale_wisp', count: 8, label: 'Gale Wisp scattered' },
    ],
    xpReward: 5000,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_gc_keeper_of_the_flame',
  },
  q_gc_the_far_shore: {
    id: 'q_gc_the_far_shore',
    name: 'The Far Shore',
    giverNpcId: 'keeper_bram',
    turnInNpcId: 'salvager_edda',
    text: 'From this lamp room I can see the whole coast, $N, and what I see in the north I do not like. Green lights walking the Wreckfields at low tide, hull by hull. One woman works that shore alone: Edda, the salvager. Follow the cliff road north past the Shear until the wrecks begin, and see that she still draws breath.',
    completionText:
      'Bram watches my shore from his tower now, does he? The old man is right to worry, $N. The dead have been walking their own wrecks at night, and lately they have stopped caring whether the sun is up.',
    objectives: [
      { type: 'interact', targetNpcId: 'salvager_edda', count: 1, label: 'Find Salvager Edda' },
    ],
    xpReward: 2800,
    copperReward: 1100,
    itemRewards: {},
    requiresQuest: 'q_gc_lanterns_on_the_shear',
    minLevel: 20,
  },
  q_gc_dead_mens_cargo: {
    id: 'q_gc_dead_mens_cargo',
    name: "Dead Men's Cargo",
    giverNpcId: 'salvager_edda',
    turnInNpcId: 'salvager_edda',
    text: 'Salvage law is simple, $N: what the sea gives the beach is mine. The drowned deckhands disagree. They rise from their hulls and drag every crate I stack back below the tideline. Put six of them down for good, and while the beach is quiet, haul in three flotsam crates before the tide files its counterclaim.',
    completionText:
      'Six crews quieter and three crates high and dry. You salvage with a heavier hand than I do, $N, but the ledger does not care. Half of this is yours by law, and by law I mean I say so.',
    objectives: [
      {
        type: 'kill',
        targetMobId: 'drowned_deckhand',
        count: 6,
        label: 'Drowned Deckhand laid to rest',
      },
      {
        type: 'interact',
        targetObjectItemId: 'wreckfield_flotsam_crate',
        count: 3,
        label: 'Flotsam Crate salvaged',
      },
    ],
    xpReward: 5400,
    copperReward: 2800,
    itemRewards: {},
    requiresQuest: 'q_gc_the_far_shore',
  },
  q_gc_the_wreck_warden: {
    id: 'q_gc_the_wreck_warden',
    name: 'The Wreck Warden',
    giverNpcId: 'salvager_edda',
    turnInNpcId: 'salvager_edda',
    text: 'Now you know why the deckhands rise, $N. Something wears the barnacled plate of the first wreck ever to break on this shore, and it wardens every hull on the beach like a graveyard it was hired to keep. It holds a hoard I have coveted for ten years and a crew I would rather see resting. End the Wreck Warden. Bring a friend, the dead keep good watch.',
    completionText:
      'The beach went silent the moment it fell, $N. First silence I have heard on this shore in ten years of working it. The crews are just bones now, resting bones. Take the mantle off the top of the hoard, it was always going to fit a living back better.',
    objectives: [
      { type: 'kill', targetMobId: 'the_wreck_warden', count: 1, label: 'The Wreck Warden felled' },
    ],
    xpReward: 6200,
    copperReward: 3800,
    itemRewards: {
      warrior: 'wreck_wardens_mantle',
      mage: 'wreck_wardens_mantle',
      rogue: 'wreck_wardens_mantle',
    },
    requiresQuest: 'q_gc_dead_mens_cargo',
    minLevel: 20,
    suggestedPlayers: 2,
  },
};

// Level-braided presentation order (the zone sits at a single level, so this
// follows the chain flow), matching the Veiled Hollow convention.
export const GALECREST_QUEST_ORDER: string[] = [
  'q_gc_down_the_windway',
  'q_gc_wool_off_the_downs',
  'q_gc_scuttlers_in_the_pots',
  'q_gc_keeper_of_the_flame',
  'q_gc_lanterns_on_the_shear',
  'q_gc_wind_against_the_wick',
  'q_gc_the_far_shore',
  'q_gc_dead_mens_cargo',
  'q_gc_the_wreck_warden',
];

export const GALECREST_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  galecrest_ram_wool: {
    id: 'galecrest_ram_wool',
    name: 'Greasy Ram Wool',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_gc_wool_off_the_downs',
  },
  shear_storm_lantern: {
    id: 'shear_storm_lantern',
    name: 'Doused Storm-Lantern',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_gc_lanterns_on_the_shear',
    noVendorSell: true,
  },
  wreckfield_flotsam_crate: {
    id: 'wreckfield_flotsam_crate',
    name: 'Flotsam Crate',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_gc_dead_mens_cargo',
    noVendorSell: true,
  },
  // --- quest rewards ---
  wickspun_treads: {
    id: 'wickspun_treads',
    name: 'Wickspun Treads',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'feet',
    quality: 'uncommon',
    stats: { armor: 62, sta: 3, spi: 2 },
    sellValue: 1000,
  },
  wreck_wardens_mantle: {
    id: 'wreck_wardens_mantle',
    name: 'Mantle of the Wreck Warden',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    stats: { armor: 76, sta: 6, str: 4 },
    sellValue: 2400,
  },
};
export const GALECREST_CAMPS: CampDef[] = [
  { mobId: 'moor_ram', center: { x: 292, z: 312 }, radius: 11, count: 3 },
  { mobId: 'moor_ram', center: { x: 262, z: 360 }, radius: 10, count: 3 },
  { mobId: 'gale_wisp', center: { x: 302, z: 522 }, radius: 11, count: 3 },
  { mobId: 'gale_wisp', center: { x: 366, z: 570 }, radius: 10, count: 3 },
  { mobId: 'shoal_scuttler', center: { x: 444, z: 438 }, radius: 10, count: 3 },
  { mobId: 'shoal_scuttler', center: { x: 386, z: 622 }, radius: 9, count: 2 },
  { mobId: 'the_wreck_warden', center: { x: 330, z: 638 }, radius: 5, count: 1 },
];
export const GALECREST_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'shear_storm_lantern',
    name: 'Doused Storm-Lantern',
    // The wayside lantern posts along the cliff road above the Shear
    // (q_gc_lanterns_on_the_shear), doused by the gale.
    // Kept west of x=440 on the middle stretch: the mob-scan determinism suites
    // pin (500,500) as a spawn-free probe spot with a 60 yd clearance.
    positions: [
      { x: 434, z: 452 },
      { x: 430, z: 488 },
      { x: 432, z: 532 },
      { x: 428, z: 566 },
    ],
  },
  {
    itemId: 'wreckfield_flotsam_crate',
    name: 'Flotsam Crate',
    // Edda's contested salvage, beached along the Wreckfields road
    // (q_gc_dead_mens_cargo).
    positions: [
      { x: 358, z: 650 },
      { x: 370, z: 664 },
      { x: 388, z: 684 },
    ],
  },
];

// Quest-camp additions (the drowned deckhands of the Wreckfields). Kept
// separate from GALECREST_CAMPS and appended at the very END of the merged
// CAMPS array in data.ts: camps draw world-gen rng in array order, so only a
// tail append leaves every existing spawn untouched. Both camps sit clear of
// the Wreck Warden's aggro ring at (330, 638).
export const GALECREST_QUEST_CAMPS: CampDef[] = [
  { mobId: 'drowned_deckhand', center: { x: 352, z: 662 }, radius: 10, count: 3 },
  { mobId: 'drowned_deckhand', center: { x: 306, z: 618 }, radius: 9, count: 3 },
];

export const GALECREST_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Wickharbor: a fishing town in the lee of the harbor cove
  buildings: [
    { kind: 'inn', x: 412, z: 352, w: 6, d: 7, rot: 0.4 },
    { kind: 'house', x: 428, z: 368, w: 5, d: 5, rot: -1.2 },
    { kind: 'house', x: 410, z: 370, w: 5, d: 5, rot: 2.2 },
  ],
  wells: [{ x: 420, z: 362, r: 1.5 }],
  stalls: [
    { x: 426, z: 354, rot: 0.6, r: 1.6 },
    { x: 414, z: 360, rot: -1.4, r: 1.6 },
  ],
  crates: [
    [432, 356],
    [408, 358],
    [364, 633], // Edda's stacked salvage on the Wreckfields shore
    [357, 627],
  ],
  campfires: [
    [420, 356],
    [196, 434], // the Windway's waycamp
    [498, 313], // Keeper Bram's brazier at the Beacon's foot
    [362, 633], // Salvager Edda's camp above the Wreckfields
  ],
  tents: [
    { x: 365, z: 627, rot: 1.9, scale: 1 }, // Edda's storm-lashed tent
  ],
  // the harbor: a working dock running into the cove east of town (hw/hd 0: no hut)
  docks: [{ x: 436, z: 372, rot: 2.2, hutLocal: { x: 40, z: 40, hw: 0, hd: 0 } }],
  fences: [
    // windbreak lines, the only fences that matter here
    { x1: 406, z1: 346, x2: 434, z2: 346 },
    { x1: 406, z1: 376, x2: 434, z2: 376 },
  ],
  // an old watch ruin on the Howling Downs, and the beacon's fallen forecourt
  ruinRings: [
    { x: 288, z: 328, ringR: 7, columns: 5 },
    { x: 492, z: 316, ringR: 6, columns: 4 },
  ],
  graveyards: [{ x: 400, z: 342 }],
};
