// The Stormbrass Foundry (docs/design/dungeon-rework/stormbrass_foundry.md): a
// NEW level 19 to 20 five-player dungeon on the storm line of Stormcrag in
// Thornpeak Heights, Varkhul's FIRST foundry and proving ground, and the
// prelude to the Crucible raid. This module holds its mob templates, the packs
// placed on the open-air shelf (stormbrass_foundry_layout.ts), the patrols, the
// gates and encounter seals that make every pack mandatory, and the dungeon
// record itself (merged by data.ts).
//
// PHASE 1 of 3 (see E:/woc/entregas/fundicion/NOTAS_FASE1.md and
// src/sim/encounters/stormbrass_foundry/CLAUDE.md): the map, every trash pack
// and patrol with its kit, the Gantry Hauler's full kit, and the four bosses as
// placeholders that only melee. Phase 2 adds the bosses' cores (G19 conveyors,
// G20 trail salvo, G21 conduction plating, G12 storm cells), their loot, the
// deeds, the Reliquary pages and the quest chain; phase 3 the Blender kit,
// the creature models, their animations and the VFX.
//
// Trash is simple and readable (README section 5): one job per type, never a
// boss lesson.
//
//   Brass Sentry          Piston Slam: a telegraphed punch across its front. Step out.
//   Steam Bruiser         Overpressure under 30 percent (hits 40 percent harder);
//                         its boiler bursts where it fell 1.5 s later. Step away.
//   Arc Drone             Comes in fours; pops in a small arc as it dies. Kill fast.
//   Foundry Engineer      Field Repair: an interruptible repair on an automaton.
//   Gearwright Apprentice Deploy Turret every 15 s. Kill the turrets fast.
//   Coilspring Hound      Spring Leap onto the farthest caster.
//   Shieldbearer Frame    Steam Screen: an interruptible shield over its pack.
//   Tripod Turret         Summoned; shoots bolts. Kill it.
//   The Gantry Hauler     The showpiece patrol (encounters/stormbrass_foundry/
//                         gantry_hauler.ts): Steam Blast, Scrap Toss, Unload,
//                         Boiler Rupture.
//
// Numbers basis (README section 7): classic-era level 19 to 20 templates in
// the Sanctum's family (elite x2.3 health, x1.5 damage), priced by the
// dungeon's normal tuning row (dungeon_difficulty.ts: trash swing floor 100 and
// boss floor 200 on the reference warrior). Mechanic damage is stated LANDED on
// a level-20 cloth wearer of about 950 health: a fumbled trash dodge costs
// about 15 to 20 percent, the Hauler's avoidables about 20 to 25 percent.
// Heroic scales them through the dungeon's difficulty transform.

import {
  FOUNDRY_DUNGEON,
  GANTRY_HAULER_ID,
  HAULER_BOILER_RUPTURE,
  PRIME_DRAFT_ID,
  RANGEWARDEN_ID,
  TOCK_ID,
  VOLTAIC_WARDEN_ID,
} from '../encounters/stormbrass_foundry/ids';
import {
  FOUNDRY_ARC_POP,
  FOUNDRY_BOILER_BURST,
  FOUNDRY_DEPLOY_TURRET,
  FOUNDRY_FIELD_REPAIR,
  FOUNDRY_PISTON_SLAM,
  FOUNDRY_STEAM_SCREEN,
} from '../mob/trash_kit/foundry_cast_ids';
import type {
  DungeonDef,
  DungeonGateDef,
  DungeonObjectSpawn,
  DungeonSpawn,
  MobTemplate,
} from '../types';
import { HEROIC_FINALE_COPPER } from './dungeon_difficulty';
import {
  COIL_CROWN,
  GANTRY,
  PRIME_DRAFT_SPOT,
  PROVING_RANGE,
  STORMBRASS_FOUNDRY_ANCHORS,
} from './stormbrass_foundry_layout';

// ---- Mob templates --------------------------------------------------------------

/** A placeholder boss (phase 1): a CC- and snare-immune elite that only melees.
 *  Phase 2 replaces its body with its core (docs section 5). */
function placeholderBoss(
  id: string,
  name: string,
  level: number,
  family: MobTemplate['family'],
  scale: number,
  color: number,
  extra: Partial<MobTemplate> = {},
): MobTemplate {
  return {
    id,
    name,
    minLevel: level,
    maxLevel: level,
    family,
    elite: true,
    ccImmune: true,
    slowImmune: true,
    untameable: true,
    // Pools are set per boss by the tuning rows (dungeon_difficulty.ts
    // healthMultiplierByMob) from target fight length x planning party DPS.
    hpBase: 200,
    hpPerLevel: 30,
    dmgBase: 14,
    dmgPerLevel: 2.9,
    attackSpeed: 2.6,
    armorPerLevel: 30,
    moveSpeed: 7,
    aggroRadius: 14,
    // Money only in phase 1; the boss tables (docs section 8) land in phase 2.
    loot: [{ copper: 5000, chance: 1 }],
    scale,
    color,
    ...extra,
  };
}

export const STORMBRASS_FOUNDRY_MOBS: Record<string, MobTemplate> = {
  brass_sentry: {
    id: 'brass_sentry',
    name: 'Brass Sentry',
    minLevel: 19,
    maxLevel: 19,
    family: 'elemental',
    elite: true,
    untameable: true,
    hpBase: 64,
    hpPerLevel: 23,
    dmgBase: 12,
    dmgPerLevel: 2.7,
    attackSpeed: 2.3,
    armorPerLevel: 26,
    moveSpeed: 6.5,
    aggroRadius: 12,
    // Piston Slam: a slow, telegraphed punch across its front. Only the tank
    // belongs in it.
    breathCone: {
      castId: FOUNDRY_PISTON_SLAM,
      name: 'Piston Slam',
      castTime: 1.5,
      every: 11,
      range: 8,
      arcDeg: 90,
      min: 150,
      max: 180,
      school: 'physical',
    },
    loot: [{ copper: 320, chance: 1 }],
    scale: 1.45,
    color: 0xc9a14a,
  },
  steam_bruiser: {
    id: 'steam_bruiser',
    name: 'Steam Bruiser',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    elite: true,
    untameable: true,
    hpBase: 70,
    hpPerLevel: 25,
    dmgBase: 13,
    dmgPerLevel: 2.8,
    attackSpeed: 2.6,
    armorPerLevel: 28,
    moveSpeed: 6,
    aggroRadius: 12,
    // Overpressure: below 30 percent its gauges redline and it hits 40 percent
    // harder. Burn it or step the tank's cooldowns.
    enrage: { belowHpPct: 0.3, dmgMult: 1.4 },
    trashKit: {
      // Boiler Burst: 1.5 s after it falls its boiler bursts where it lies.
      deathBurst: {
        castId: FOUNDRY_BOILER_BURST,
        name: 'Boiler Burst',
        delay: 1.5,
        radius: 6,
        min: 150,
        max: 180,
        school: 'fire',
      },
    },
    loot: [{ copper: 360, chance: 1 }],
    scale: 1.6,
    color: 0xb08a3e,
  },
  arc_drone: {
    id: 'arc_drone',
    name: 'Arc Drone',
    minLevel: 18,
    maxLevel: 18,
    family: 'elemental',
    untameable: true,
    hpBase: 40,
    hpPerLevel: 13,
    dmgBase: 8,
    dmgPerLevel: 2.1,
    attackSpeed: 1.8,
    armorPerLevel: 8,
    moveSpeed: 8,
    aggroRadius: 12,
    xpMult: 0.5,
    trashKit: {
      // Arc Pop: the coil pops as it dies, a small crackle round it.
      deathBurst: {
        castId: FOUNDRY_ARC_POP,
        name: 'Arc Pop',
        delay: 0,
        radius: 3,
        min: 60,
        max: 75,
        school: 'nature',
      },
    },
    loot: [{ copper: 60, chance: 1 }],
    scale: 1.1,
    color: 0x7fc4ff,
  },
  foundry_engineer: {
    id: 'foundry_engineer',
    name: 'Foundry Engineer',
    minLevel: 20,
    maxLevel: 20,
    family: 'humanoid',
    elite: true,
    hpBase: 58,
    hpPerLevel: 21,
    dmgBase: 11,
    dmgPerLevel: 2.5,
    attackSpeed: 2.2,
    armorPerLevel: 16,
    moveSpeed: 7,
    aggroRadius: 12,
    trashKit: {
      // Field Repair: a long, interruptible repair on a hurt automaton for 30
      // percent of its health. Kick it.
      mend: {
        castId: FOUNDRY_FIELD_REPAIR,
        name: 'Field Repair',
        castTime: 2.5,
        every: 12,
        first: 4,
        school: 'nature',
        range: 30,
        healPct: 0.3,
        below: 0.7,
        family: 'elemental',
        // Trash automata only: never the Hauler it patrols beside, never a boss.
        exclude: [GANTRY_HAULER_ID, TOCK_ID, RANGEWARDEN_ID, VOLTAIC_WARDEN_ID, PRIME_DRAFT_ID],
      },
    },
    loot: [
      { copper: 340, chance: 1 },
      { itemId: 'linen_scrap', chance: 0.35 },
    ],
    scale: 1.3,
    color: 0x6b5a44,
  },
  gearwright_apprentice: {
    id: 'gearwright_apprentice',
    name: 'Gearwright Apprentice',
    minLevel: 19,
    maxLevel: 19,
    family: 'humanoid',
    elite: true,
    hpBase: 54,
    hpPerLevel: 20,
    dmgBase: 11,
    dmgPerLevel: 2.5,
    attackSpeed: 2.2,
    armorPerLevel: 14,
    moveSpeed: 7,
    aggroRadius: 12,
    trashKit: {
      // Deploy Turret: she plants a Tripod Turret beside her every 15 s. Kill
      // the turrets fast (or her).
      call: {
        castId: FOUNDRY_DEPLOY_TURRET,
        name: 'Deploy Turret',
        castTime: 1.5,
        every: 15,
        first: 3,
        school: 'physical',
        summon: 'tripod_turret',
        count: 1,
        maxAlive: 2,
      },
    },
    loot: [
      { copper: 320, chance: 1 },
      { itemId: 'linen_scrap', chance: 0.35 },
    ],
    scale: 1.25,
    color: 0x4e9c8a,
  },
  clockwork_hound: {
    id: 'clockwork_hound',
    name: 'Coilspring Hound',
    minLevel: 19,
    maxLevel: 19,
    family: 'elemental',
    elite: true,
    untameable: true,
    hpBase: 60,
    hpPerLevel: 22,
    dmgBase: 11,
    dmgPerLevel: 2.6,
    attackSpeed: 2.0,
    armorPerLevel: 20,
    moveSpeed: 8,
    aggroRadius: 13,
    trashKit: {
      // Spring Leap: onto the farthest caster within 25 yd, and it holds on.
      leap: {
        name: 'Spring Leap',
        every: 12,
        first: 3,
        minRange: 8,
        maxRange: 25,
        seconds: 0.7,
        fixate: 4,
      },
    },
    loot: [{ copper: 300, chance: 1 }],
    scale: 1.35,
    color: 0xc79a3c,
  },
  shieldbearer_frame: {
    id: 'shieldbearer_frame',
    name: 'Shieldbearer Frame',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    elite: true,
    untameable: true,
    hpBase: 76,
    hpPerLevel: 27,
    dmgBase: 12,
    dmgPerLevel: 2.7,
    attackSpeed: 2.6,
    armorPerLevel: 34,
    moveSpeed: 6,
    aggroRadius: 12,
    trashKit: {
      // Steam Screen: an interruptible screen over every ally within 8 yd, each
      // shielded for 20 percent of its health. Kick it.
      screen: {
        castId: FOUNDRY_STEAM_SCREEN,
        name: 'Steam Screen',
        castTime: 2,
        every: 16,
        first: 5,
        school: 'fire',
        radius: 8,
        shieldPct: 0.2,
        duration: 10,
      },
    },
    loot: [{ copper: 380, chance: 1 }],
    scale: 1.75,
    color: 0x3b3f46,
  },
  tripod_turret: {
    id: 'tripod_turret',
    name: 'Tripod Turret',
    minLevel: 18,
    maxLevel: 18,
    family: 'elemental',
    untameable: true,
    hpBase: 30,
    hpPerLevel: 10,
    dmgBase: 6,
    dmgPerLevel: 1.6,
    attackSpeed: 2.5,
    armorPerLevel: 20,
    moveSpeed: 0,
    aggroRadius: 30,
    idleStationary: true,
    xpMult: 0.2,
    // It never walks: it shoots bolts at whoever it is fighting.
    petSpell: {
      name: 'Brass Bolt',
      school: 'physical',
      min: 40,
      max: 52,
      range: 30,
      every: 2.5,
      windup: 0.4,
    },
    loot: [],
    scale: 1.1,
    color: 0xc9a14a,
  },
  // The showpiece patrol (encounters/stormbrass_foundry/gantry_hauler.ts): a
  // huge tracked steam crawler hauling a boiler and a load of brass plates
  // round the Rail Yard. About 9,000 health on normal through the tuning row.
  gantry_hauler: {
    id: 'gantry_hauler',
    name: 'Gantry Hauler',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    elite: true,
    ccImmune: true,
    slowImmune: true,
    untameable: true,
    hpBase: 150,
    hpPerLevel: 30,
    dmgBase: 14,
    dmgPerLevel: 2.9,
    attackSpeed: 2.8,
    armorPerLevel: 30,
    moveSpeed: 6,
    aggroRadius: 14,
    trashKit: {
      // Boiler Rupture: 2 s after it falls its boiler bursts, 8 yd.
      deathBurst: {
        castId: HAULER_BOILER_RUPTURE,
        name: 'Boiler Rupture',
        delay: 2,
        radius: 8,
        min: 140,
        max: 160,
        school: 'fire',
      },
    },
    loot: [{ copper: 1500, chance: 1 }],
    scale: 2.6,
    color: 0xb58b3c,
  },
  // ---- The four bosses (phase 1 placeholders: melee only) ------------------------
  // Line-Master Ambrel Tock on the Main Line (phase 2: G19 moving belts, the
  // Stamping Press, Parts Drop, Rivet Gun). About 15,000 health (100 s).
  line_master_tock: placeholderBoss(
    'line_master_tock',
    'Line-Master Ambrel Tock',
    19,
    'humanoid',
    1.9,
    0x8a6d3b,
  ),
  // The Rangewarden on the Proving Range (phase 2: G20 Target Lock trail salvo,
  // Proof Shot, Drill Drones). About 15,000 health (100 s).
  rangewarden: placeholderBoss('rangewarden', 'The Rangewarden', 20, 'elemental', 2.2, 0xa88940),
  // The Voltaic Warden on the Coil Crown (phase 2: G21 Conduction Plating,
  // Stored Charge, Discharge, Arc Drones, Static Lash). About 15,000 health.
  voltaic_warden: placeholderBoss(
    'voltaic_warden',
    'The Voltaic Warden',
    20,
    'elemental',
    2.4,
    0x4e9c8a,
  ),
  // The Prime Draft in its gantry (phase 2: G12 storm cells, the Core Hatch,
  // three phases, the enrage). About 26,000 health (170 s). The final boss:
  // pulling it early wakes the whole foundry (bossChainPull).
  prime_draft: placeholderBoss('prime_draft', 'The Prime Draft', 20, 'elemental', 2.6, 0xc9a14a, {
    boss: true,
    hpBase: 260,
    hpPerLevel: 36,
    moveSpeed: 4.5,
    aggroRadius: 16,
    attackSpeed: 3,
    // The finale's money on the level 19 to 20 ladder (docs/design/dungeon-gold.md),
    // the shared five-man heroic finale base on heroic.
    loot: [{ copper: 15000, heroicCopper: HEROIC_FINALE_COPPER, chance: 1 }],
  }),
};

// ---- Spawns ---------------------------------------------------------------------

const FACE_SOUTH = Math.PI; // toward the lift
const FACE_EAST = Math.PI / 2;
const FACE_WEST = -Math.PI / 2;
const FACE_NORTH = 0;

/** A pack member holding formation until pulled. */
function held(
  mobId: string,
  x: number,
  z: number,
  packId: string,
  facing = FACE_SOUTH,
): DungeonSpawn {
  return { mobId, x, z, facing, packId, idleStationary: true };
}

function patrolling(
  mobId: string,
  points: readonly { x: number; z: number }[],
  packId: string,
  offset: number,
  pace?: number,
): DungeonSpawn {
  return {
    mobId,
    x: points[0].x,
    z: points[0].z,
    packId,
    patrol: { points, offset, ...(pace !== undefined ? { pace } : {}) },
  };
}

// Pack ids read as g<n> for the thirteen groups (route order) and pa pb pc pd
// for the four patrols (pa is the Gantry Hauler).

/** Patrol A: the Gantry Hauler's loop round the middle of the Rail Yard. */
export const HAULER_LOOP = [
  { x: -18, z: -178 },
  { x: 18, z: -178 },
  { x: 18, z: -142 },
  { x: -18, z: -142 },
] as const;
/** Patrol B: back and forth along the Range Lanes' north side, past both packs. */
const RANGE_WALK = [
  { x: -98, z: -37 },
  { x: -72, z: -37 },
];
/** Patrol C: up and down the lower Coil Stair between its landings. */
const COIL_WALK = [
  { x: 72, z: -55.2 },
  { x: 88, z: -62.2 },
];
/** Patrol D: a loop round the middle of the Gantry Approach. */
const APPROACH_LOOP = [
  { x: -12, z: 126 },
  { x: 12, z: 126 },
  { x: 12, z: 158 },
  { x: -12, z: 158 },
];

export const STORMBRASS_FOUNDRY_SPAWNS: DungeonSpawn[] = [
  // ---- The Rail Yard ------------------------------------------------------------
  // g1: the cart line. Two sentries and an engineer at the carts.
  held('brass_sentry', -34, -150, 'g1', FACE_EAST),
  held('brass_sentry', -34, -156, 'g1', FACE_EAST),
  held('foundry_engineer', -39, -153, 'g1', FACE_EAST),
  // g2: the plate stacks. A bruiser and four drones.
  held('steam_bruiser', 36, -153, 'g2', FACE_WEST),
  held('arc_drone', 32, -148, 'g2', FACE_WEST),
  held('arc_drone', 32, -158, 'g2', FACE_WEST),
  held('arc_drone', 40, -148, 'g2', FACE_WEST),
  held('arc_drone', 40, -158, 'g2', FACE_WEST),
  // Patrol A: the Gantry Hauler (the showpiece).
  patrolling('gantry_hauler', HAULER_LOOP, 'pa', 0, 0.45),
  // ---- The Assembly Terraces ----------------------------------------------------
  // g3: the parts line. An apprentice, two hounds and a sentry.
  held('gearwright_apprentice', -20, -98, 'g3'),
  held('clockwork_hound', -25, -103, 'g3'),
  held('clockwork_hound', -15, -103, 'g3'),
  held('brass_sentry', -20, -106, 'g3'),
  // g4: the crane pad. A shieldbearer, a bruiser and an engineer.
  held('shieldbearer_frame', 20, -72, 'g4'),
  held('steam_bruiser', 25, -66, 'g4'),
  held('foundry_engineer', 15, -66, 'g4'),
  // Boss 1: Line-Master Ambrel Tock on the Main Line's middle walkway.
  { mobId: 'line_master_tock', x: 0, z: -22, facing: FACE_SOUTH, idleStationary: true },
  // ---- West: the Range Lanes ----------------------------------------------------
  // g5: the first lane. Three sentries and an apprentice.
  held('brass_sentry', -58, -44, 'g5', FACE_EAST),
  held('brass_sentry', -58, -50, 'g5', FACE_EAST),
  held('brass_sentry', -63, -41, 'g5', FACE_EAST),
  held('gearwright_apprentice', -64, -48, 'g5', FACE_EAST),
  // g6: the bunker. A bruiser, two hounds and an engineer.
  held('steam_bruiser', -90, -62, 'g6', FACE_EAST),
  held('clockwork_hound', -86, -67, 'g6', FACE_EAST),
  held('clockwork_hound', -86, -57, 'g6', FACE_EAST),
  held('foundry_engineer', -95, -64, 'g6', FACE_EAST),
  // Patrol B: four drones and a hound crossing the lanes.
  patrolling('arc_drone', RANGE_WALK, 'pb', 0),
  patrolling('arc_drone', RANGE_WALK, 'pb', 2.5),
  patrolling('arc_drone', RANGE_WALK, 'pb', 5),
  patrolling('arc_drone', RANGE_WALK, 'pb', 7.5),
  patrolling('clockwork_hound', RANGE_WALK, 'pb', 10.5),
  // Boss 2: the Rangewarden in the middle of the Proving Range.
  {
    mobId: 'rangewarden',
    x: (PROVING_RANGE.x0 + PROVING_RANGE.x1) / 2,
    z: 0,
    facing: FACE_SOUTH,
    idleStationary: true,
  },
  // ---- East: the Coil Stair -----------------------------------------------------
  // g7: the first switchback. A shieldbearer and two sentries.
  held('shieldbearer_frame', 61, -41, 'g7', FACE_WEST),
  held('brass_sentry', 57, -47, 'g7', FACE_WEST),
  held('brass_sentry', 63, -48, 'g7', FACE_WEST),
  // g8: the upper landing. Four drones and an engineer.
  held('foundry_engineer', 105, -60, 'g8', FACE_WEST),
  held('arc_drone', 100, -56, 'g8', FACE_WEST),
  held('arc_drone', 100, -64, 'g8', FACE_WEST),
  held('arc_drone', 106, -55, 'g8', FACE_WEST),
  held('arc_drone', 106, -65, 'g8', FACE_WEST),
  // Patrol C: two hounds up and down the stair.
  patrolling('clockwork_hound', COIL_WALK, 'pc', 0),
  patrolling('clockwork_hound', COIL_WALK, 'pc', 3),
  // Boss 3: the Voltaic Warden on the far side of the great coil, guarding it.
  {
    mobId: 'voltaic_warden',
    x: COIL_CROWN.x,
    z: COIL_CROWN.z + 10,
    facing: FACE_SOUTH,
    idleStationary: true,
  },
  // ---- The Drafting Yard --------------------------------------------------------
  // g9: the blueprint tables. Two apprentices and a bruiser.
  held('gearwright_apprentice', -30, 66, 'g9'),
  held('gearwright_apprentice', -24, 60, 'g9'),
  held('steam_bruiser', -32, 58, 'g9'),
  // g10: the model frames. A shieldbearer, two sentries and an engineer.
  held('shieldbearer_frame', 30, 62, 'g10'),
  held('brass_sentry', 25, 58, 'g10'),
  held('brass_sentry', 35, 58, 'g10'),
  held('foundry_engineer', 30, 68, 'g10'),
  // g11: the test pit. Four drones and a hound.
  held('clockwork_hound', 0, 84, 'g11'),
  held('arc_drone', -4, 88, 'g11'),
  held('arc_drone', 4, 88, 'g11'),
  held('arc_drone', -4, 80, 'g11'),
  held('arc_drone', 4, 80, 'g11'),
  // ---- The Gantry Approach ------------------------------------------------------
  // g12: the crane yard. Two bruisers and an engineer.
  held('steam_bruiser', -30, 136, 'g12', FACE_EAST),
  held('steam_bruiser', -30, 144, 'g12', FACE_EAST),
  held('foundry_engineer', -35, 140, 'g12', FACE_EAST),
  // g13: the cell racks. A shieldbearer, an apprentice, two sentries, a hound.
  held('shieldbearer_frame', 30, 150, 'g13', FACE_WEST),
  held('gearwright_apprentice', 35, 154, 'g13', FACE_WEST),
  held('brass_sentry', 27, 145, 'g13', FACE_WEST),
  held('brass_sentry', 27, 155, 'g13', FACE_WEST),
  held('clockwork_hound', 34, 146, 'g13', FACE_WEST),
  // Patrol D: two sentries and a hound round the approach.
  patrolling('brass_sentry', APPROACH_LOOP, 'pd', 0),
  patrolling('brass_sentry', APPROACH_LOOP, 'pd', 3),
  patrolling('clockwork_hound', APPROACH_LOOP, 'pd', 6),
  // Boss 4: the Prime Draft in its scaffold at the Gantry's north edge.
  {
    mobId: 'prime_draft',
    x: PRIME_DRAFT_SPOT.x,
    z: PRIME_DRAFT_SPOT.z,
    facing: FACE_SOUTH,
    idleStationary: true,
  },
];

/** Every mandatory trash pull, the patrols included, in route order. */
export const STORMBRASS_FOUNDRY_PACKS = [
  'g1',
  'g2',
  'pa',
  'g3',
  'g4',
  'g5',
  'g6',
  'pb',
  'g7',
  'g8',
  'pc',
  'g9',
  'g10',
  'g11',
  'g12',
  'g13',
  'pd',
] as const;

/** The four patrols (dev helpers, tests); pa is the Gantry Hauler. */
export const STORMBRASS_FOUNDRY_PATROLS = ['pa', 'pb', 'pc', 'pd'] as const;

/** The four bosses, in route order. */
export const STORMBRASS_FOUNDRY_BOSSES = [
  'line_master_tock',
  'rangewarden',
  'voltaic_warden',
  'prime_draft',
] as const;

// ---- Gates and seals ------------------------------------------------------------

/** Yaw of a gate box spanning a passage that runs along (dx, dz). */
function across(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export const STORMBRASS_FOUNDRY_GATES: DungeonGateDef[] = [
  {
    id: 'yard_shutter',
    name: 'Yard Shutter',
    kind: 'steam_shutter',
    x: 0,
    z: -126,
    hw: 6.6,
    rot: across(0, 1),
    packs: ['g1', 'g2', 'pa'],
    openText: 'Steam bursts from the Yard Shutter as it grinds up into its housing.',
  },
  {
    id: 'line_shutter',
    name: 'Line Shutter',
    kind: 'steam_shutter',
    x: 0,
    z: -51,
    hw: 5.6,
    rot: across(0, 1),
    packs: ['g3', 'g4'],
    sealWhileEngaged: 'line_master_tock',
    openText: 'The Line Shutter hisses open onto the Main Line.',
  },
  {
    id: 'range_shutter',
    name: 'Range Shutter',
    kind: 'steam_shutter',
    x: -28,
    z: -36.4,
    hw: 5.6,
    rot: across(-1, 0),
    bosses: ['line_master_tock'],
    openText: 'The line falls still. The Range and Coil Shutters lift in a cloud of steam.',
  },
  {
    id: 'coil_shutter',
    name: 'Coil Shutter',
    kind: 'steam_shutter',
    x: 28,
    z: -36.4,
    hw: 5.6,
    rot: across(1, 0),
    bosses: ['line_master_tock'],
  },
  {
    id: 'range_arc_fence',
    name: 'Range Arc Fence',
    kind: 'arc_fence',
    x: -78,
    z: -25,
    hw: 5.6,
    rot: across(0, 1),
    packs: ['g5', 'g6', 'pb'],
    sealWhileEngaged: 'rangewarden',
    openText: 'The Range Arc Fence crackles and powers down.',
  },
  {
    id: 'coil_arc_fence',
    name: 'Coil Arc Fence',
    kind: 'arc_fence',
    x: 89,
    z: -11.5,
    hw: 5.6,
    rot: across(-3, 11),
    packs: ['g7', 'g8', 'pc'],
    sealWhileEngaged: 'voltaic_warden',
    openText: 'The Coil Arc Fence crackles and powers down.',
  },
  {
    id: 'crane_bridge',
    name: 'Crane Bridge',
    kind: 'crane_bridge',
    x: 0,
    z: 11,
    hw: 5.4,
    rot: across(0, 1),
    bosses: ['rangewarden', 'voltaic_warden'],
    openText: 'With both wings silent, the Crane Bridge swings out over the gulf.',
  },
  {
    id: 'gantry_arc_fence',
    name: 'Gantry Arc Fence',
    kind: 'arc_fence',
    x: 0,
    z: 174,
    hw: 6.6,
    rot: across(0, 1),
    packs: ['g9', 'g10', 'g11', 'g12', 'g13', 'pd'],
    sealWhileEngaged: 'prime_draft',
    openText: 'The Gantry Arc Fence gutters out. The Prime Draft stirs in its scaffold.',
  },
];

/** One inert ground object per gate: its template id carries the state. */
export const STORMBRASS_FOUNDRY_GATE_OBJECTS: DungeonObjectSpawn[] = STORMBRASS_FOUNDRY_GATES.map(
  (g) => ({
    itemId: '',
    name: g.name,
    x: g.x,
    z: g.z,
    templateId: 'dungeon_gate_closed',
    dungeonId: FOUNDRY_DUNGEON,
    lootable: false,
  }),
);

// ---- The dungeon ----------------------------------------------------------------

/** The overworld door: the brass cable-lift station at the foot of the storm
 *  line, south-east of the Stormcrag elementals and clear of the Thunzharr
 *  fight (43 yd from the Stormcrag POI and its camp's centre). */
export const STORMBRASS_FOUNDRY_DOOR = { x: 122, z: 719 } as const;

export const STORMBRASS_FOUNDRY_DUNGEON_DEFS: Record<string, DungeonDef> = {
  stormbrass_foundry: {
    id: FOUNDRY_DUNGEON,
    name: 'The Stormbrass Foundry',
    // The next free overflow index: instanceOrigin x = DUNGEON_OVERFLOW_X_BASE
    // + (15 - 7) * 600.
    index: 15,
    doorPos: { ...STORMBRASS_FOUNDRY_DOOR },
    // The arrival on the Lift Landing, 12 yd above and 70 yd from the first
    // pack, so no mob can pull the moment you step off the lift.
    entry: { x: STORMBRASS_FOUNDRY_ANCHORS.entry.x, z: STORMBRASS_FOUNDRY_ANCHORS.entry.z },
    exitOffset: { x: STORMBRASS_FOUNDRY_ANCHORS.exit.x, z: STORMBRASS_FOUNDRY_ANCHORS.exit.z },
    // The Gantry stands 430 yd up the shelf from the lift: a second exit opens
    // beside the Prime Draft on its death.
    bossExitPortal: { x: -14, z: GANTRY.z - 14 },
    spawns: STORMBRASS_FOUNDRY_SPAWNS,
    objects: [...STORMBRASS_FOUNDRY_GATE_OBJECTS],
    gates: STORMBRASS_FOUNDRY_GATES,
    // No skipping: every pack is gated, and pulling the Prime Draft early still
    // wakes anything left alive (instances/boss_chain_pull.ts).
    bossChainPull: true,
    interior: 'stormbrass_foundry',
    suggestedPlayers: 5,
    enterText:
      'The cable lift jolts to a stop on the foundry shelf. Brass roofs hiss with steam, and lightning cracks against the storm coil above.',
    leaveText: 'The cable lift carries you back down the storm line to Stormcrag.',
  },
};
