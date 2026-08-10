// The Proving Shore (levels 1-2). A small tutorial island in the starter sea
// WEST of Eastbrook Vale (negative x; the compass renders +x as east, see
// src/ui/compass.ts: facing 0 = +Z = north, bearing 90 = east = +x), the
// free mirror of the Farshore's slot on the opposite column. New
// characters are offered passage here by Wayfarer Bryn at the Eastbrook
// spawn (the tutorial greeting dialog, src/sim/tutorial/greeting.ts); the
// island itself is a training camp: an on-rails quest chain that teaches
// talking, fighting, looting, and buying, pays a pouch of copper (enough to
// buy the full tier-1 gathering tool set at the vale's own counters with
// change; the island vendor deliberately stocks NO professions tools, the
// R37 rule tests/professions_zone_rollout.test.ts enforces) and ZERO quest
// experience, so a graduate steps onto the vale at the same level as
// someone who skipped it. The way back (and back in, for a refresher) is the
// ferry crossing circle: a portal pair between the Old Pier and the vale's
// west strand. Terrain: the PS_* tables in world.ts (biome 'vale': the
// island shares the vale's sky, palette, and song).

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

export const PROVING_SHORE_ZONE: ZoneDef = {
  id: 'proving_shore',
  name: 'The Proving Shore',
  zMin: -180,
  zMax: 180,
  xMin: -540,
  xMax: -180,
  levelRange: [1, 2],
  biome: 'vale',
  hub: { x: -300, z: 50, radius: 14, name: 'Dawnrest Camp' },
  graveyard: { x: -324, z: 58 },
  lakes: [],
  pois: [
    { x: -300, z: 50, label: 'Dawnrest Camp', id: 'dawnrest_camp' },
    { x: -280, z: 0, label: 'The Old Pier', id: 'the_old_pier' },
    { x: -336, z: -14, label: 'The Practice Yard', id: 'the_practice_yard' },
    { x: -286, z: -18, label: 'The Wreck Line', id: 'the_wreck_line' },
  ],
  welcome:
    'The Proving Shore asks nothing of you but time. Learn the camp, strike the effigies, walk the wreck line, and when you are ready, Ferryman Odo will see you across to the vale.',
  welcomeQuestId: 'q_ps_find_your_feet',
};

export const PROVING_SHORE_ROADS: { x: number; z: number }[][] = [
  [
    { x: -280, z: 2 },
    { x: -290, z: 26 },
    { x: -300, z: 48 },
  ], // the Old Pier -> Dawnrest Camp
  [
    { x: -300, z: 48 },
    { x: -318, z: 18 },
    { x: -334, z: -10 },
  ], // Dawnrest Camp -> the Practice Yard
  [
    { x: -298, z: 46 },
    { x: -290, z: 14 },
    { x: -286, z: -14 },
  ], // Dawnrest Camp -> the Wreck Line
] as { x: number; z: number }[][];

// The ferry crossing: a portal pair between the Old Pier's crossing circle
// and the vale's west strand, so a graduate walks out (and a returning
// player walks back in for a refresher) with no one-way teleport. The
// tutorial greeting's accept path (sim/tutorial/greeting.ts) lands at
// PROVING_SHORE_ARRIVAL beside the a-side landing.
export const PROVING_SHORE_PORTALS: PortalDef[] = [
  {
    id: 'portal_proving_shore_ferry',
    a: { x: -274, z: 0, landing: { x: -282, z: 6, facing: 2.4 } },
    b: { x: -140, z: -32, landing: { x: -134, z: -28, facing: -0.8 } },
    radius: 2.5,
    enterText: 'The crossing takes hold, and Eastbrook Vale spreads out before you.',
    leaveText: 'The ferry circle flares, and the Proving Shore rises to meet you.',
  },
];

/** Where the tutorial greeting's accept path sets a new adventurer down:
 *  beside the Old Pier's crossing circle, facing up the camp road. */
export const PROVING_SHORE_ARRIVAL = { x: -282, z: 6, facing: 2.4 } as const;

export const PROVING_SHORE_MOBS: Record<string, MobTemplate> = {
  // Built to be hit: the practice yard's straw-and-timber targets. They
  // neither move nor aggro (moveSpeed 0, aggroRadius 0), fight back for
  // nothing, and stand back up fast so a class never queues for a target.
  training_effigy: {
    id: 'training_effigy',
    name: 'Training Effigy',
    minLevel: 1,
    maxLevel: 1,
    family: 'humanoid',
    hpBase: 26,
    hpPerLevel: 0,
    dmgBase: 1,
    dmgPerLevel: 0,
    attackSpeed: 2.5,
    armorPerLevel: 0,
    moveSpeed: 0,
    aggroRadius: 0,
    // A splinter of copper in the stuffing: every camp-spawned mob carries an
    // unconditional copper entry (the progression-test floor), and a first
    // kill that pays SOMETHING teaches looting better than an empty corpse.
    loot: [{ copper: 1, chance: 1 }],
    scale: 1.0,
    color: 0x9a7b4f,
    respawnSeconds: 20,
  },
  // The wreck line's salvage-pickers: the island's one honest hazard, and a
  // gentle one. Short aggro, light pinch, a few coppers in the shell.
  shore_scuttler: {
    id: 'shore_scuttler',
    name: 'Shore Scuttler',
    minLevel: 1,
    maxLevel: 2,
    family: 'beast',
    hpBase: 18,
    hpPerLevel: 6,
    dmgBase: 3,
    dmgPerLevel: 1,
    attackSpeed: 2.0,
    armorPerLevel: 4,
    moveSpeed: 7,
    aggroRadius: 6,
    loot: [{ copper: 4, chance: 1 }],
    scale: 0.8,
    color: 0x7a5a3a,
    // Every beast carries a harvestable component (the economy_yield rule);
    // crab meat, the tide_scuttler precedent.
    componentTags: ['meat'],
  },
};

export const PROVING_SHORE_NPCS: Record<string, NpcDef> = {
  // The greeter stands at the EASTBROOK spawn, not on the island: she is the
  // face of the tutorial greeting dialog (sim/tutorial/greeting.ts) and the
  // signpost back to the ferry for anyone who skipped it.
  wayfarer_bryn: {
    id: 'wayfarer_bryn',
    name: 'Wayfarer Bryn',
    title: 'Harbor Guide',
    pos: { x: 6, z: -7 },
    facing: Math.PI,
    color: 0x8a6a9a,
    questIds: [],
    greeting:
      'Eastbrook takes all comers, friend. And for the unsteady, there is always the Proving Shore: the ferry circle on the west strand runs both ways, every day of the year.',
  },
  instructor_maren: {
    id: 'instructor_maren',
    name: 'Instructor Maren',
    title: 'Proving Master',
    pos: { x: -300, z: 46 },
    facing: 0,
    color: 0x6b4a8a,
    questIds: ['q_ps_find_your_feet', 'q_ps_strike_true', 'q_ps_the_wreck_line', 'q_ps_set_sail'],
    greeting:
      'Every hero the vale has ever thanked stood where you stand now, $C, and not one of them knew which end of a blade to hold. That is what this shore is for. Ask, practice, and fail where failing is free.',
  },
  quartermaster_finch: {
    id: 'quartermaster_finch',
    name: 'Quartermaster Finch',
    title: 'Camp Outfitter',
    pos: { x: -304, z: 54 },
    facing: -Math.PI / 2,
    color: 0x6b6b3a,
    // Provisions only, NEVER professions tools (the R37 vendor rule): the
    // chain's copper is sized so a graduate buys the full tier-1 tool kit
    // from the vale's own counters on arrival.
    vendorItems: ['minor_healing_potion', 'baked_bread', 'spring_water'],
    questIds: ['q_ps_tools_of_the_trade'],
    greeting:
      'Bread, water, and a draught for when practice gets ahead of you. Coin buys them, and work earns the coin. That is the whole economy, $N, and it never gets more complicated. Only bigger.',
  },
  ferryman_odo: {
    id: 'ferryman_odo',
    name: 'Ferryman Odo',
    title: 'Keeper of the Crossing',
    pos: { x: -282, z: 2 },
    facing: Math.PI / 2,
    color: 0x4a6a8a,
    questIds: ['q_ps_set_sail'],
    greeting:
      'The strait is calm and the boat is sound, $N. Whenever you are ready for the vale, the crossing circle at the end of my pier will carry you over.',
  },
};

export const PROVING_SHORE_QUESTS: Record<string, QuestDef> = {
  q_ps_find_your_feet: {
    id: 'q_ps_find_your_feet',
    name: 'Find Your Feet',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'instructor_maren',
    text: 'Welcome to the Proving Shore, $N. Nothing on this island bites unless you ask it to, so use the quiet: walk the camp and learn its faces. Quartermaster Finch keeps the stores, and Ferryman Odo keeps the way home. Pay each of them a visit, then come back to me.',
    completionText:
      'Fast on your feet and back before the kettle boiled. You know the camp now, $N, which means you know where to run when something does bite.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'quartermaster_finch',
        count: 1,
        label: 'Visit Quartermaster Finch',
      },
      { type: 'interact', targetNpcId: 'ferryman_odo', count: 1, label: 'Visit Ferryman Odo' },
    ],
    xpReward: 0,
    copperReward: 20,
    itemRewards: {},
  },
  q_ps_strike_true: {
    id: 'q_ps_strike_true',
    name: 'Strike True',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'instructor_maren',
    text: 'A blade you have never swung is just a heavy stick, $N. The effigies on the practice yard southwest of camp were built to be hit: pick one, square up, and strike until three of them give out. They do not hit back. The things beyond this shore will.',
    completionText:
      'Three down, and your grip already surer. Remember the feel of it, $N: feet set, eyes up, swing whole. The vale wolves are faster than straw, but they fall to the same arithmetic.',
    objectives: [
      { type: 'kill', targetMobId: 'training_effigy', count: 3, label: 'Training Effigy felled' },
    ],
    xpReward: 0,
    copperReward: 25,
    itemRewards: {},
    requiresQuest: 'q_ps_find_your_feet',
  },
  q_ps_the_wreck_line: {
    id: 'q_ps_the_wreck_line',
    name: 'The Wreck Line',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'instructor_maren',
    text: 'The tide pays this island in salvage: castaway crates off old wrecks, washed up along the strand that faces the vale. The scuttlers that pick over them pinch harder than they look, so mind your step. Crack open three crates and bring me whatever the sea left us.',
    completionText:
      'Rope, tar, and half a wheel of cheese the sea somehow spared. The world is full of things worth stooping for, $N. Keep the habit: look, open, take.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'ps_castaway_crate',
        count: 3,
        label: 'Castaway Crate opened',
      },
    ],
    xpReward: 0,
    copperReward: 30,
    itemRewards: {},
    requiresQuest: 'q_ps_strike_true',
  },
  q_ps_tools_of_the_trade: {
    id: 'q_ps_tools_of_the_trade',
    name: 'Tools of the Trade',
    giverNpcId: 'quartermaster_finch',
    turnInNpcId: 'quartermaster_finch',
    text: 'Coin is for spending, $N, and mine is an honest stall. Buy a healing draught off me, and I will refund you more than the price for the lesson: find a vendor, weigh a cost, count your change. When you reach the vale, spend what is left on gathering tools at the traders there. Every fortune ever minted started exactly this small.',
    completionText:
      'One draught, bought and paid for, and your refund as promised: a bargain you will not often see repeated. Keep it corked for a bad day, $N, and remember that the vale traders sell picks, axes, and sickles to anyone carrying honest coin.',
    objectives: [
      {
        type: 'collect',
        itemId: 'minor_healing_potion',
        count: 1,
        label: 'Minor Healing Potion bought',
      },
    ],
    xpReward: 0,
    copperReward: 50,
    itemRewards: {},
    requiresQuest: 'q_ps_the_wreck_line',
  },
  q_ps_set_sail: {
    id: 'q_ps_set_sail',
    name: 'Set Sail',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'ferryman_odo',
    text: 'There is nothing left on this shore you have not already beaten, opened, or bought, $N. You are ready, and Eastbrook has real work waiting. Walk down to the Old Pier and tell Ferryman Odo I said you have earned your crossing.',
    completionText:
      'Maren said that, did she? High praise from a woman who once made me practice mooring knots for a week. The circle at the end of my pier will carry you to the vale whenever you walk into it, $N. Mind the wolves.',
    objectives: [
      { type: 'interact', targetNpcId: 'ferryman_odo', count: 1, label: 'Report to Ferryman Odo' },
    ],
    xpReward: 0,
    copperReward: 30,
    itemRewards: {},
    requiresQuest: 'q_ps_tools_of_the_trade',
  },
};

// Strict chain order: the shore is on rails by design.
export const PROVING_SHORE_QUEST_ORDER: string[] = [
  'q_ps_find_your_feet',
  'q_ps_strike_true',
  'q_ps_the_wreck_line',
  'q_ps_tools_of_the_trade',
  'q_ps_set_sail',
];

export const PROVING_SHORE_ITEMS: Record<string, ItemDef> = {
  ps_castaway_crate: {
    id: 'ps_castaway_crate',
    name: 'Castaway Crate',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_ps_the_wreck_line',
    noVendorSell: true,
  },
};

// Every camp draws from its own private rng sub-stream (offStream), so
// adding the tutorial island leaves the rest of the world's generation
// bit-identical.
export const PROVING_SHORE_CAMPS: CampDef[] = [
  { mobId: 'training_effigy', center: { x: -336, z: -14 }, radius: 6, count: 3, offStream: true },
  { mobId: 'shore_scuttler', center: { x: -286, z: -20 }, radius: 10, count: 4, offStream: true },
  { mobId: 'shore_scuttler', center: { x: -308, z: -36 }, radius: 8, count: 3, offStream: true },
];

export const PROVING_SHORE_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'ps_castaway_crate',
    name: 'Castaway Crate',
    // The Wreck Line (q_ps_the_wreck_line): salvage along the vale-facing strand.
    positions: [
      { x: -282, z: -12 },
      { x: -292, z: -26 },
      { x: -280, z: -4 },
    ],
  },
];

export const PROVING_SHORE_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Dawnrest Camp: a training camp, not a town. Tents around a muster fire,
  // the outfitter's stall, and a rail fence penning the practice yard.
  stalls: [{ x: -305, z: 55, rot: 0.8, r: 1.6 }],
  crates: [
    [-302, 56],
    [-298, 50],
  ],
  campfires: [
    [-300, 52], // the muster fire
    [-334, -10], // the practice yard's brazier
  ],
  tents: [
    { x: -296, z: 44, rot: 0.4, scale: 1 },
    { x: -306, z: 48, rot: -1.6, scale: 1 },
  ],
  fences: [
    { x1: -342, z1: -8, x2: -330, z2: -6 },
    { x1: -342, z1: -22, x2: -330, z2: -20 },
  ],
  // The Old Pier, where the crossing circle waits at the plank's end.
  docks: [{ x: -271, z: 0, rot: 1.4, hutLocal: { x: 40, z: 40, hw: 0, hd: 0 } }],
  graveyards: [{ x: -324, z: 58 }],
};
