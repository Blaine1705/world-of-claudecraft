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
  graveyard: { x: 302, z: 792 },
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
  welcomeQuestId: 'q_eg_gate_report',
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
    { x: 360, z: 926 },
  ], // Hedgewick -> the Statuary Walk -> the maze mouth
  [
    { x: 320, z: 810 },
    { x: 298, z: 852 },
    { x: 276, z: 894 },
  ], // Hedgewick -> the Rose Wilds
  [
    { x: 320, z: 810 },
    { x: 366, z: 818 },
    { x: 408, z: 832 },
    { x: 422, z: 835 },
  ], // Hedgewick -> the Petal Pond's west shore
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
] as { x: number; z: number }[][];

// No portals: walked into through the Garden Gate.
export const EVERGARDEN_PORTALS: PortalDef[] = [];

// The garden's shapes: stags and wolves clipped from living hedge, the gnome
// groundskeepers, and the Bull that guards the Fountain Court.
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
    loot: [{ itemId: 'evergarden_bloom_clipping', chance: 0.65, questId: 'q_eg_bloom_clippings' }],
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
    loot: [{ itemId: 'hedgewick_shears', chance: 0.6, questId: 'q_eg_stolen_shears' }],
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
// The folk of the garden: a gatewarden minds the south entry, the sleepless
// Head Gardener and the Wickmother hold Hedgewick, and far south past the
// maze, by the Lily Basin, works the gardener nobody believes in. All four
// stand on open lawn or road: the hedge walls are hard collision here, so
// every placement stays clear of unmarked maze interior.
export const EVERGARDEN_NPCS: Record<string, NpcDef> = {
  gatewarden_pell: {
    id: 'gatewarden_pell',
    name: 'Gatewarden Pell',
    title: 'Keeper of the Garden Gate',
    pos: { x: 390, z: 714 },
    facing: -2.6,
    color: 0x8a9a6a,
    questIds: ['q_eg_gate_report'],
    greeting:
      'Mind how you go on the lawns. The garden keeps them trimmed, and it likes them tidy.',
  },
  head_gardener_amaranth: {
    id: 'head_gardener_amaranth',
    name: 'Head Gardener Amaranth',
    title: 'Head Gardener of the Evergarden',
    pos: { x: 323, z: 808 },
    facing: 2.8,
    color: 0xb46a7a,
    questIds: ['q_eg_gate_report', 'q_eg_hungry_shapes', 'q_eg_who_trims_the_hedges'],
    greeting:
      'Do not mind the shadows under my eyes. Someone has to stay awake while the garden dreams.',
  },
  wickmother_sorrel: {
    id: 'wickmother_sorrel',
    name: 'Wickmother Sorrel',
    title: 'Keeper of the Hedgewick Inn',
    pos: { x: 317, z: 814 },
    facing: 0.5,
    color: 0xc98a5a,
    questIds: ['q_eg_stolen_shears', 'q_eg_gnomes_in_the_green'],
    greeting:
      'Come in, sit, there is cordial on the fire. Just keep a hand on anything iron: the gnomes are light-fingered of late.',
  },
  gardener_yew: {
    id: 'gardener_yew',
    name: 'Gardener Yew',
    title: 'The Last Gardener',
    pos: { x: 348, z: 1160 },
    facing: -0.8,
    color: 0x556b45,
    questIds: [
      'q_eg_who_trims_the_hedges',
      'q_eg_bloom_clippings',
      'q_eg_four_statues',
      'q_eg_bull_of_the_court',
    ],
    greeting:
      'Hand me that barrow, would you? These lawns do not walk themselves, whatever the hamlet thinks.',
  },
};

export const EVERGARDEN_QUESTS: Record<string, QuestDef> = {
  q_eg_gate_report: {
    id: 'q_eg_gate_report',
    name: 'Word Through the Gate',
    giverNpcId: 'gatewarden_pell',
    turnInNpcId: 'head_gardener_amaranth',
    text: 'The lawns past this gate have trimmed themselves for a hundred years, $N, and lately they have started trimming visitors. Head Gardener Amaranth keeps the books in Hedgewick, up the road past the gate lawns. Tell her another traveler has come through, and tell her the hedges by the gate moved last night.',
    completionText:
      'Moved, did they. Pell reports that every week, and every week he is right. Forgive my eyes, $N, I have not slept a whole night in years: someone has to watch the garden watch us. Welcome to Hedgewick.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'head_gardener_amaranth',
        count: 1,
        label: 'Report to Head Gardener Amaranth',
      },
    ],
    xpReward: 2600,
    copperReward: 950,
    itemRewards: {},
    minLevel: 19,
  },
  q_eg_hungry_shapes: {
    id: 'q_eg_hungry_shapes',
    name: 'Pruned into Hunger',
    giverNpcId: 'head_gardener_amaranth',
    turnInNpcId: 'head_gardener_amaranth',
    text: 'Whoever shapes this garden has grown careless, or cruel. The wolf shapes out in the Rose Wilds were clipped for show, yet lately they hunt: green jaws, no bellies, and no reason ever to stop. Cut down ten topiary wolves, $N, and let the lawns be lawns again for a while.',
    completionText:
      'Ten heaps of clippings where ten wolves stood. It should feel like gardening, $N. Why does it feel like war?',
    objectives: [
      { type: 'kill', targetMobId: 'topiary_wolf', count: 10, label: 'Topiary Wolf slain' },
    ],
    xpReward: 4600,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_eg_gate_report',
  },
  q_eg_stolen_shears: {
    id: 'q_eg_stolen_shears',
    name: 'The Stolen Shears',
    giverNpcId: 'wickmother_sorrel',
    turnInNpcId: 'wickmother_sorrel',
    text: 'Every pair of shears in Hedgewick has walked off in a fortnight, $N: off the pegs, out of locked sheds, one pair out of my own apron while I dozed. It is the hedge gnomes, the little groundskeepers who hate us walking their lawns. Get six pairs back before the whole hamlet is down to kitchen knives.',
    completionText:
      'Six pairs, and my own among them, I would know the nick in the blade anywhere. Here, these gloves were knitted for pruning work. Warm hands make steady shears.',
    objectives: [
      { type: 'collect', itemId: 'hedgewick_shears', count: 6, label: 'Stolen Hedgewick Shears' },
    ],
    xpReward: 4800,
    copperReward: 2400,
    itemRewards: {
      warrior: 'shearkeeper_gloves',
      mage: 'shearkeeper_gloves',
      rogue: 'shearkeeper_gloves',
    },
    requiresQuest: 'q_eg_gate_report',
  },
  q_eg_gnomes_in_the_green: {
    id: 'q_eg_gnomes_in_the_green',
    name: 'The Groundskeepers Grudge',
    giverNpcId: 'wickmother_sorrel',
    turnInNpcId: 'wickmother_sorrel',
    text: 'The shears were only the start, $N. Last night the gnomes tipped our tool carts into the green, one out by their warren west of the maze, one clean across the garden on the pond walk, and scattered a hundred years of good iron in the grass. Drive off eight of the little devils and haul the spilled carts home.',
    completionText:
      'Three carts back and the pegs full again. Let the little devils sulk in their hedges: Hedgewick works these lawns too.',
    objectives: [
      { type: 'kill', targetMobId: 'hedge_gnome', count: 8, label: 'Hedge Gnome driven off' },
      {
        type: 'interact',
        targetObjectItemId: 'hedgewick_tool_cart',
        count: 3,
        label: 'Tool cart recovered',
      },
    ],
    xpReward: 5000,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_eg_stolen_shears',
    minLevel: 20,
  },
  q_eg_who_trims_the_hedges: {
    id: 'q_eg_who_trims_the_hedges',
    name: 'Who Trims the Hedges',
    giverNpcId: 'head_gardener_amaranth',
    turnInNpcId: 'gardener_yew',
    text: 'I have kept the ledgers thirty years, $N, and not slept properly for ten of them, because the sums will not close. Grass wants cutting and hedges want shaping, and nobody here does either, yet every dawn the garden stands trimmed. Lately the woodfolk swear they see an old man with a barrow on the far south lawns, past the maze by the Lily Basin. Find him. If he is real, I can finally sleep. If he is not, I suppose I never will.',
    completionText:
      'So the house finally sent someone. A hundred years I have walked these lawns, $N, and the garden and I have an understanding: I trim what asks to be trimmed. Sit. The hedges can spare you an hour.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'gardener_yew',
        count: 1,
        label: 'Find the gardener by the Lily Basin',
      },
    ],
    xpReward: 2800,
    copperReward: 1000,
    itemRewards: {},
    requiresQuest: 'q_eg_hungry_shapes',
    minLevel: 20,
  },
  q_eg_bloom_clippings: {
    id: 'q_eg_bloom_clippings',
    name: 'Clippings from the Living Green',
    giverNpcId: 'gardener_yew',
    turnInNpcId: 'gardener_yew',
    text: 'You want to understand this garden? Then read it the way I do. The stags that graze the lawns grow the truest green: every leaf on them is a page. Bring me six fresh clippings from the topiary stags, $N. They will not thank you for the pruning, but they will regrow. Everything here regrows.',
    completionText:
      'Look here: the leaves are curling in on themselves, every clipping the same. The garden is afraid, $N. In a hundred years I have never once known it afraid.',
    objectives: [
      {
        type: 'collect',
        itemId: 'evergarden_bloom_clipping',
        count: 6,
        label: 'Pruned Bloom Clipping',
      },
    ],
    xpReward: 4600,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_eg_who_trims_the_hedges',
  },
  q_eg_four_statues: {
    id: 'q_eg_four_statues',
    name: 'The Four Quiet Sisters',
    giverNpcId: 'gardener_yew',
    turnInNpcId: 'gardener_yew',
    text: 'When the garden was young, the first gardeners raised four marble sisters to watch its quarters: one above the Rose Wilds, one on the pond walk east of the maze, one on the west lawn where the gnomes keep their warren, and one on the south lawn past the hedges. The maze grew up between them, and most folk never see all four. Walk the quarters, $N, and press your palm to each sister. When the garden has looked you over from all four sides, it will open places it keeps from strangers.',
    completionText:
      'Four rubbings, four sisters, and not one of them wept marble. The garden has taken your measure, $N, and it did not find you wanting. Now I can send you where the trouble truly lives.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'evergarden_statue_rubbing',
        count: 4,
        label: 'Garden statue visited',
      },
    ],
    xpReward: 5200,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_eg_who_trims_the_hedges',
    minLevel: 20,
  },
  q_eg_bull_of_the_court: {
    id: 'q_eg_bull_of_the_court',
    name: 'The Bull of the Fountain Court',
    giverNpcId: 'gardener_yew',
    turnInNpcId: 'gardener_yew',
    text: 'Now the truth, $N. The bull at the heart of the maze was my masterwork: I shaped him to guard the Fountain Court, and for a hundred years he did. But the fear in the green has reached him, and he guards nothing now, he hunts. The maze feeds him whoever wanders in. I am too old to unmake him, and it must be unmaking, root and branch. Bring a friend, walk the maze to the court, and cut my bull down.',
    completionText:
      'I felt it, here, when he came apart. A hundred years of work, and you were right to end it. Take this mantle: I cut it for whoever proved stronger than my best. The court is only a fountain tonight, $N, and the garden is only a garden. Perhaps now the Head Gardener and I can both sleep.',
    objectives: [
      { type: 'kill', targetMobId: 'the_topiary_bull', count: 1, label: 'The Topiary Bull unmade' },
    ],
    xpReward: 6200,
    copperReward: 3800,
    itemRewards: {
      warrior: 'fountain_court_mantle',
      mage: 'fountain_court_mantle',
      rogue: 'fountain_court_mantle',
    },
    requiresQuest: 'q_eg_four_statues',
    minLevel: 20,
    suggestedPlayers: 2,
  },
};

// Level-braided presentation order (not strictly chain order), matching the
// Veiled Hollow convention.
export const EVERGARDEN_QUEST_ORDER: string[] = [
  'q_eg_gate_report',
  'q_eg_hungry_shapes',
  'q_eg_stolen_shears',
  'q_eg_who_trims_the_hedges',
  'q_eg_gnomes_in_the_green',
  'q_eg_bloom_clippings',
  'q_eg_four_statues',
  'q_eg_bull_of_the_court',
];

export const EVERGARDEN_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  hedgewick_shears: {
    id: 'hedgewick_shears',
    name: 'Stolen Hedgewick Shears',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_eg_stolen_shears',
  },
  evergarden_bloom_clipping: {
    id: 'evergarden_bloom_clipping',
    name: 'Pruned Bloom Clipping',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_eg_bloom_clippings',
  },
  hedgewick_tool_cart: {
    id: 'hedgewick_tool_cart',
    name: 'Spilled Tool Cart',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_eg_gnomes_in_the_green',
    noVendorSell: true,
  },
  evergarden_statue_rubbing: {
    id: 'evergarden_statue_rubbing',
    name: 'Statue Rubbing',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_eg_four_statues',
    noVendorSell: true,
  },
  // --- quest rewards ---
  shearkeeper_gloves: {
    id: 'shearkeeper_gloves',
    name: 'Shearkeeper Gloves',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'gloves',
    quality: 'uncommon',
    stats: { armor: 52, sta: 3, spi: 3 },
    sellValue: 950,
  },
  fountain_court_mantle: {
    id: 'fountain_court_mantle',
    name: 'Mantle of the Fountain Court',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    stats: { armor: 74, sta: 6, str: 4 },
    sellValue: 2400,
  },
};
export const EVERGARDEN_CAMPS: CampDef[] = [
  { mobId: 'topiary_stag', center: { x: 364, z: 898 }, radius: 10, count: 3 },
  { mobId: 'topiary_stag', center: { x: 326, z: 1146 }, radius: 10, count: 3 },
  { mobId: 'topiary_wolf', center: { x: 272, z: 912 }, radius: 10, count: 3 },
  { mobId: 'topiary_wolf', center: { x: 418, z: 1124 }, radius: 10, count: 3 },
  { mobId: 'hedge_gnome', center: { x: 268, z: 1002 }, radius: 10, count: 3 },
  { mobId: 'hedge_gnome', center: { x: 456, z: 942 }, radius: 10, count: 2 },
  { mobId: 'the_topiary_bull', center: { x: 360, z: 1016 }, radius: 5, count: 1 },
];
// Every position below sits on open lawn or road verge beside an existing
// camp or POI: the hedge walls are hard collision, so nothing may land in
// unmarked maze interior.
export const EVERGARDEN_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'evergarden_statue_rubbing',
    name: 'Weathered Garden Statue',
    // The Four Quiet Sisters, one per garden quarter around the Great Maze:
    // above the Rose Wilds, on the pond-walk road east of the maze, on the
    // west lawn by the gnome warren, and on the south lawn past the hedges.
    positions: [
      { x: 280, z: 922 },
      { x: 452, z: 930 },
      { x: 274, z: 1012 },
      { x: 426, z: 1118 },
    ],
  },
  {
    itemId: 'hedgewick_tool_cart',
    name: 'Spilled Tool Cart',
    // Tipped by the gnomes at their warren on the west lawn and out along
    // the pond walk (q_eg_gnomes_in_the_green).
    positions: [
      { x: 262, z: 996 },
      { x: 276, z: 1008 },
      { x: 460, z: 948 },
    ],
  },
];

export const EVERGARDEN_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Hedgewick: the groundskeepers' hamlet by the gate lawns
  buildings: [
    { kind: 'inn', x: 312, z: 804, w: 6, d: 7, rot: 0.7 },
    { kind: 'house', x: 328, z: 818, w: 5, d: 5, rot: -1.0 },
    { kind: 'house', x: 314, z: 820, w: 5, d: 5, rot: 2.1 },
  ],
  wells: [{ x: 320, z: 812, r: 1.5 }],
  stalls: [{ x: 324, z: 804, rot: 0.5, r: 1.6 }],
  crates: [
    [309, 810],
    [327, 810],
  ],
  campfires: [
    [320, 806],
    [388, 716], // the Garden Gate's waycamp
  ],
  fences: [
    // trimmed border hedgerows read as fence lines around the hamlet
    { x1: 306, z1: 796, x2: 334, z2: 796 },
    { x1: 306, z1: 826, x2: 334, z2: 826 },
  ],
  // the Statuary Walk's marble colonnade, and a folly on the north lawn
  ruinRings: [
    { x: 360, z: 875, ringR: 7, columns: 6 },
    { x: 400, z: 1182, ringR: 6, columns: 5 },
  ],
  // the gardener's own plot, unweeded and unnamed
  graveyards: [{ x: 298, z: 796 }],
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
};
