// The Proving Shore (levels 1-2). A small tutorial island in the starter sea
// WEST of Eastbrook Vale (negative x; the compass renders +x as east, see
// src/ui/compass.ts: facing 0 = +Z = north, bearing 90 = east = +x), the
// free mirror of the Farshore's slot on the opposite column. New
// characters are offered passage here by Wayfarer Bryn at the Eastbrook
// spawn (the tutorial greeting dialog, src/sim/tutorial/greeting.ts); the
// island itself is a training camp: an on-rails quest chain that teaches
// fighting, looting, then the three mechanics lessons (talents and
// specialization, the professions wheel, the bank and bag slots, each
// explained in dialogue with its facts mirrored from the sim), pays enough
// copper to buy the bank lesson's Linen Pouch mid-chain AND the full tier-1
// gathering tool set at the vale's own counters after (the island vendor
// deliberately stocks NO professions tools, the R37 rule
// tests/professions_zone_rollout.test.ts enforces), and grants ZERO quest
// experience, so a graduate steps onto the vale at the same level as
// someone who skipped it. The way back is the Old Pier's clicked ferry bell
// (setting graduates down in Eastbrook town), and the vale west strand's
// twin bell rings a returning player back in for a refresher. Terrain: the
// PS_* tables in world.ts (biome 'vale': the island shares the vale's sky,
// palette, and song).

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
  welcomeQuestId: 'q_ps_strike_true',
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

// No walk-in portals: the ferry crossing is a pair of CLICKED bells
// (PROVING_SHORE_OBJECTS ps_ferry_bell, routed by
// src/sim/interactions/ferry_bell.ts), so nobody is ever teleported by
// wandering over a trigger. The island bell sets the player down in
// Eastbrook TOWN (beside the spawn square); the vale-strand bell rings a
// returning player back to the island arrival for a refresher. The tutorial
// greeting's accept path (sim/tutorial/greeting.ts) still lands at
// PROVING_SHORE_ARRIVAL.
export const PROVING_SHORE_PORTALS: PortalDef[] = [];

/** Where the tutorial greeting's accept path sets a new adventurer down:
 *  beside the Old Pier's ferry bell, facing up the camp road. */
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
      'Eastbrook takes all comers, friend. And for the unsteady, there is always the Proving Shore: this bell beside me rings you across any day of the year, and its twin on the island rings you home.',
  },
  instructor_maren: {
    id: 'instructor_maren',
    name: 'Instructor Maren',
    title: 'Proving Master',
    pos: { x: -300, z: 46 },
    facing: 0,
    color: 0x6b4a8a,
    questIds: [
      'q_ps_strike_true',
      'q_ps_the_wreck_line',
      'q_ps_a_path_of_your_own',
      'q_ps_the_wheel_of_trades',
      'q_ps_pouch_and_purse',
      'q_ps_set_sail',
    ],
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
    // Provisions and a starter bag, NEVER professions tools (the R37 vendor
    // rule): the chain's copper is sized so a graduate buys the full tier-1
    // tool kit from the vale's own counters on arrival. The Linen Pouch is
    // the bank lesson's purchase, quest-gated so an early buy cannot strand
    // the lesson's copper (types.ts vendorQuestGates).
    vendorItems: ['minor_healing_potion', 'baked_bread', 'spring_water', 'linen_pouch'],
    vendorQuestGates: { linen_pouch: 'q_ps_pouch_and_purse' },
    questIds: ['q_ps_the_wheel_of_trades'],
    greeting:
      'Bread, water, a draught for when practice gets ahead of you, and a spare pouch for what you pick up along the way. Coin buys them, and work earns the coin. That is the whole economy, $N, and it never gets more complicated. Only bigger.',
  },
  // The camp's Gilded Strongbox desk: a real banker (the same vault as every
  // town bursar), and the voice of the bank-and-bags lesson.
  bursar_wick: {
    id: 'bursar_wick',
    name: 'Bursar Wick',
    title: 'The Gilded Strongbox',
    pos: { x: -310, z: 56 },
    facing: Math.PI / 2,
    color: 0xc9a227,
    // No questIds ON PURPOSE: clicking a banker opens the bank window, not
    // the quest gossip, so no quest can give or hand in at him. His teaching
    // rides q_ps_pouch_and_purse's completion at Maren, which points here.
    questIds: [],
    banker: true,
    greeting:
      'The Gilded Strongbox keeps a desk even here, $N. Whatever you deposit with me waits in the same vault behind every bursar in every town, safe from wolves, water, and your own worse judgment.',
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
      'Fresh off the crossing, $N? Then up the shore road with you: Instructor Maren keeps the drills at Dawnrest Camp, and she will want a word before anything else. When the vale calls you back, ring the bell at the end of my pier and the crossing will set you down in Eastbrook town.',
  },
};

export const PROVING_SHORE_QUESTS: Record<string, QuestDef> = {
  q_ps_strike_true: {
    id: 'q_ps_strike_true',
    name: 'Strike True',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'instructor_maren',
    text: 'Welcome to the Proving Shore, $N. Every lesson here starts the same way: feet set, blade in hand. The effigies on the practice yard southwest of camp were built to be hit. Pick one, square up, and strike until three of them give out. They do not hit back. The things beyond this shore will.',
    completionText:
      'Three down, and your grip already surer. Remember the feel of it, $N: feet set, eyes up, swing whole. The vale wolves are faster than straw, but they fall to the same arithmetic.',
    objectives: [
      { type: 'kill', targetMobId: 'training_effigy', count: 3, label: 'Training Effigy felled' },
    ],
    xpReward: 0,
    copperReward: 40,
    itemRewards: {},
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
    copperReward: 50,
    itemRewards: {},
    requiresQuest: 'q_ps_strike_true',
  },
  // The talents and specialization lesson. Facts mirrored from the sim
  // (content/talents.ts): specialization unlocks at level 5 (SPEC_UNLOCK_LEVEL,
  // one of three per class), talent rows open at levels 5, 8, 11, 14, 17, and
  // 20 with three choices each (ROW_LEVELS/OPTIONS_PER_ROW), and both the
  // rows and the specialization can be reset or changed later at no cost
  // (progression/talents.ts respecTalents/setTalentSpec).
  q_ps_a_path_of_your_own: {
    id: 'q_ps_a_path_of_your_own',
    name: 'A Path of Your Own',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'instructor_maren',
    text: 'Swinging a blade is one thing, $N. Knowing why you swing it is another. At your fifth level the world will ask you to choose a specialization: one of three paths for your calling, each with its own strengths. From then on, every few levels opens a row of talents, three choices wide, and you take one. Fell two more effigies, and while the straw flies, think on the path you mean to walk.',
    completionText:
      'Two more down, and something steadier behind the swing. Remember this above all, $N: nothing you choose is a cage. Open your talents whenever you like, and once you have chosen at five, both your talents and your specialization can be reset and rechosen any time you stand somewhere safe, at no cost. Choose boldly, and choose again whenever you learn better.',
    objectives: [
      { type: 'kill', targetMobId: 'training_effigy', count: 2, label: 'Training Effigy felled' },
    ],
    xpReward: 0,
    copperReward: 70,
    itemRewards: {},
    requiresQuest: 'q_ps_the_wreck_line',
  },
  // The professions lesson. Facts mirrored from Professions 2.0 (the craft
  // wheel and attunement: src/sim/professions/, and the tier tutorial copy in
  // i18n.catalog/hud_chrome.ts): gathering needs a bought tool, crafts sit on
  // a wheel, attuning to an adjacent pair makes two uncapped majors and one
  // rare-capped hobby while the rest lie dormant, and nothing learned is lost.
  q_ps_the_wheel_of_trades: {
    id: 'q_ps_the_wheel_of_trades',
    name: 'The Wheel of Trades',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'quartermaster_finch',
    text: 'A blade feeds you once, $N. A trade feeds you for life. Every adventurer works professions beside the sword: mining, logging, herb-picking, fishing, and the crafts that turn all of it into worth. Quartermaster Finch has kept more stalls than I have run drills. Go and ask her how a trade is built.',
    completionText:
      'So Maren finally sends me a student worth the breath. Listen once, $N: gathering starts with a tool, a pick, an axe, a sickle, a pole, all sold at the vale traders. Your crafts sit on a wheel: work the ones you love, and when you attune to a neighbouring pair, those two become your uncapped majors, one craft across the wheel stays your hobby, and the rest sleep until you take them up again. Nothing you learn is ever lost, and the craft masters in the towns offer attunement when you are ready.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'quartermaster_finch',
        count: 1,
        label: 'Ask Quartermaster Finch about the trades',
      },
    ],
    xpReward: 0,
    copperReward: 100,
    itemRewards: {},
    requiresQuest: 'q_ps_a_path_of_your_own',
  },
  // The bank and bags lesson. Facts mirrored from the sim: the implicit
  // 16-slot backpack plus four bag sockets pooling capacity (BAG_SOCKETS,
  // src/sim/bags.ts), the shared bank vault behind every bursar with
  // purchasable extra slots (src/sim/bank.ts), and the Linen Pouch as the
  // cheapest vendor bag (6 slots, content/items.ts). The chain's copper
  // through quest four is sized to afford the pouch when this unlocks.
  // Maren gives AND takes the hand-in (a banker's click opens the bank, not
  // the quest gossip, so Bursar Wick cannot hold a turn-in); her completion
  // carries the vault half of the lesson and points at his desk. The Linen
  // Pouch is quest-gated at Finch's stall (vendorQuestGates above), so it
  // cannot be bought, equipped, and stranded before this quest opens.
  q_ps_pouch_and_purse: {
    id: 'q_ps_pouch_and_purse',
    name: 'Pouch and Purse',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'instructor_maren',
    text: 'One more lesson before the vale, $N, and it is the one that keeps adventurers alive: what you carry. Your backpack holds sixteen slots, and beside it wait four empty bag loops; every bag you buckle on adds its own space to the pool. Buy a Linen Pouch from Quartermaster Finch, buckle it on, and come back to me.',
    completionText:
      'A fine pouch, and six more slots to fill with trouble. Now the half of the lesson no bag can hold, $N: what you cannot carry, the Gilded Strongbox keeps. Bursar Wick at the desk behind me opens the same vault every bursar in every town shares, and more vault space can be bought once your purse grows into it. Keep your valuables banked and your bags roomy. A full pack has ended more adventures than any wolf ever did.',
    objectives: [{ type: 'collect', itemId: 'linen_pouch', count: 1, label: 'Linen Pouch bought' }],
    xpReward: 0,
    copperReward: 120,
    itemRewards: {},
    requiresQuest: 'q_ps_the_wheel_of_trades',
  },
  q_ps_set_sail: {
    id: 'q_ps_set_sail',
    name: 'Set Sail',
    giverNpcId: 'instructor_maren',
    turnInNpcId: 'ferryman_odo',
    text: 'There is nothing left on this shore you have not already beaten, opened, or bought, $N. You are ready, and Eastbrook has real work waiting. Walk down to the Old Pier and tell Ferryman Odo I said you have earned your crossing.',
    completionText:
      'Maren said that, did she? High praise from a woman who once made me practice mooring knots for a week. Ring the bell at the end of my pier whenever you are ready, $N, and the crossing will set you down in the middle of Eastbrook town. Mind the wolves.',
    objectives: [
      { type: 'interact', targetNpcId: 'ferryman_odo', count: 1, label: 'Report to Ferryman Odo' },
    ],
    xpReward: 0,
    copperReward: 50,
    itemRewards: {},
    requiresQuest: 'q_ps_pouch_and_purse',
  },
};

// Strict chain order: the shore is on rails by design. Combat, then looting,
// then the three mechanics lessons (talents, professions, bank and bags),
// then the crossing home.
export const PROVING_SHORE_QUEST_ORDER: string[] = [
  'q_ps_strike_true',
  'q_ps_the_wreck_line',
  'q_ps_a_path_of_your_own',
  'q_ps_the_wheel_of_trades',
  'q_ps_pouch_and_purse',
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
  // The ferry bells are rung, never looted (interactions/ferry_bell.ts routes
  // the click before the pickup path); the item record exists so the world
  // object has a name and the pickup-lines rule stays satisfied defensively,
  // the gullhaven_watchbell + murloc_hut precedent.
  ps_ferry_bell: {
    id: 'ps_ferry_bell',
    name: 'Ferry Bell',
    kind: 'quest',
    sellValue: 0,
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
  {
    itemId: 'ps_ferry_bell',
    name: 'Ferry Bell',
    // The clicked crossing (interactions/ferry_bell.ts): the Old Pier's bell
    // rings a player to Eastbrook town, and its twin INSIDE town (beside
    // Wayfarer Bryn and the town landing) rings a returning player back to
    // the island arrival.
    positions: [
      { x: -274, z: 0 },
      { x: 11, z: -7 },
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
