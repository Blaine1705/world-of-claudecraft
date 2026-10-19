// The Smith's Heart, phase 1 (docs/design/raid/smith_heart.md): the playable
// blockout's content. Mob templates with SKETCH kits (one or two readable
// mechanics each on the shared trash-kit engine, enough to walk the route and
// pull every fight), the spawn roster in route order, the gates and seals
// (instances/dungeon_gates.ts derives their states), the seal markers that
// carry the heart seal's colours (encounters/smith_heart/seal.ts), and the
// DungeonDef itself.
//
// EVERY mob here is a placeholder: its name is descriptive and provisional,
// its numbers are sketch numbers, and the body it draws is a borrowed model
// listed in render/characters/smith_heart_placeholder_looks.ts (the one list
// phase 2 replaces). Loot is deliberately not wired (design doc, "Loot hook").

import type {
  DungeonDef,
  DungeonGateDef,
  DungeonObjectSpawn,
  DungeonSpawn,
  MobTemplate,
} from '../types';
import {
  BREATH,
  GALLERY_LANDINGS,
  QUENCH,
  ringPoint,
  SLAB,
  SMITH_HEART_ANCHORS,
  SMITH_HEART_BOSS_SPOTS,
  type SmithHeartVein,
} from './smith_heart_layout';

export const SMITH_HEART_DUNGEON = 'smith_heart';

/** The four guardians and the final boss (template ids). */
export const SMITH_HEART_GUARDIANS: Readonly<Record<SmithHeartVein, string>> = {
  hammer: 'heart_hammer_guardian',
  breath: 'heart_breath_guardian',
  quench: 'heart_quench_guardian',
  heat: 'heart_heat_guardian',
};
export const SMITH_HEART_FINAL_BOSS = 'heart_masterless_strength';

/** The sketch-kit cast ids (uninterruptible: none is in a kick table). */
export const SMITH_HEART_CASTS = {
  hammerWrath: 'heart_mountains_wrath',
  breathGust: 'heart_bellows_gust',
  breathLance: 'heart_storm_lance',
  quenchBreath: 'heart_quenching_breath',
  heatPour: 'heart_molten_pour',
  heatClang: 'heart_anvil_clang',
  finalWrath: 'heart_forge_wrath',
  finalPour: 'heart_forge_pour',
  galeBolt: 'heart_gale_bolt',
  rimeBolt: 'heart_rime_bolt',
  emberBolt: 'heart_ember_bolt',
} as const;

// ---- templates ---------------------------------------------------------------------

/** A raid trash melee body: elite, level 20, one swing cleave. */
function warder(
  id: string,
  name: string,
  cleave: string,
  color: number,
  scale: number,
): MobTemplate {
  return {
    id,
    name,
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    elite: true,
    hpBase: 250,
    hpPerLevel: 50,
    dmgBase: 20,
    dmgPerLevel: 4,
    attackSpeed: 2.4,
    armorPerLevel: 30,
    moveSpeed: 7.2,
    aggroRadius: 13,
    arcCleave: { every: 3, arcDeg: 100, range: 7, mult: 0.6, name: cleave },
    loot: [],
    scale,
    color,
  };
}

/** A raid trash caster: elite, level 20, one bolt on a cast bar. */
function caster(
  id: string,
  name: string,
  castId: string,
  boltName: string,
  school: 'nature' | 'frost' | 'fire',
  color: number,
): MobTemplate {
  return {
    id,
    name,
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    elite: true,
    hpBase: 180,
    hpPerLevel: 40,
    dmgBase: 14,
    dmgPerLevel: 3,
    attackSpeed: 2.2,
    armorPerLevel: 18,
    moveSpeed: 7,
    aggroRadius: 13,
    trashKit: {
      bolt: {
        castId,
        name: boltName,
        castTime: 2,
        every: 7,
        first: 3,
        school,
        range: 30,
        min: 110,
        max: 140,
      },
    },
    loot: [],
    scale: 1.3,
    color,
  };
}

/** A guardian or the final boss: a raid boss body at sketch numbers. */
function boss(id: string, name: string, hp: number, color: number, scale: number): MobTemplate {
  return {
    id,
    name,
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    elite: true,
    boss: true,
    hpBase: hp,
    hpPerLevel: 0,
    dmgBase: 40,
    dmgPerLevel: 8,
    attackSpeed: 2.6,
    armorPerLevel: 40,
    moveSpeed: 7,
    aggroRadius: 16,
    loot: [],
    scale,
    color,
  };
}

const C = SMITH_HEART_CASTS;

export const SMITH_HEART_MOBS: Record<string, MobTemplate> = {
  // ---- trash -------------------------------------------------------------------
  heart_hammer_warder: warder(
    'heart_hammer_warder',
    'Hammer Vein Warder',
    'Stone Sweep',
    0x8a6430,
    1.7,
  ),
  heart_ring_warder: warder('heart_ring_warder', 'Ring Forge Warder', 'Forge Sweep', 0x6a6460, 1.8),
  heart_breath_warder: warder(
    'heart_breath_warder',
    'Breath Vein Warder',
    'Gale Sweep',
    0x3f7f9f,
    1.6,
  ),
  heart_breath_caller: caster(
    'heart_breath_caller',
    'Breath Vein Caller',
    C.galeBolt,
    'Gale Bolt',
    'nature',
    0x5ab8e8,
  ),
  heart_quench_warder: warder(
    'heart_quench_warder',
    'Quench Vein Warder',
    'Rime Sweep',
    0x6aa8c8,
    1.7,
  ),
  heart_quench_caller: caster(
    'heart_quench_caller',
    'Quench Vein Caller',
    C.rimeBolt,
    'Rime Bolt',
    'frost',
    0x9ad8ff,
  ),
  heart_heat_warder: warder('heart_heat_warder', 'Heat Vein Warder', 'Ember Sweep', 0xc8a050, 1.7),
  heart_heat_caller: caster(
    'heart_heat_caller',
    'Heat Vein Caller',
    C.emberBolt,
    'Ember Bolt',
    'fire',
    0xffe6a0,
  ),
  // ---- the four guardians ------------------------------------------------------------
  // The Hammer: a stone titan half-fused with the floor. Mountain's Wrath is a
  // line-of-sight blast round it: hide behind the pit's columns.
  heart_hammer_guardian: {
    ...boss('heart_hammer_guardian', 'Guardian of the Hammer', 32000, 0x8a6430, 3.2),
    arcCleave: { every: 3, arcDeg: 110, range: 9, mult: 0.7, name: 'Hammerfall' },
    trashKit: {
      nova: {
        castId: C.hammerWrath,
        name: "Mountain's Wrath",
        castTime: 3,
        every: 20,
        first: 10,
        school: 'physical',
        radius: 45,
        min: 260,
        max: 300,
      },
    },
  },
  // The Breath: a winged bellows of wind. Its gust throws the raid back (the
  // field's cliffs are walls: nobody falls), its lance paints a lane.
  heart_breath_guardian: {
    ...boss('heart_breath_guardian', 'Guardian of the Breath', 28000, 0x5ab8e8, 3),
    trashKit: {
      wingGust: {
        castId: C.breathGust,
        name: 'Bellows Gust',
        castTime: 2,
        every: 18,
        first: 8,
        school: 'nature',
        radius: 12,
        knockback: 10,
        min: 160,
        max: 200,
      },
      line: {
        castId: C.breathLance,
        name: 'Storm Lance',
        castTime: 2,
        every: 11,
        first: 5,
        school: 'nature',
        length: 34,
        halfWidth: 2.5,
        min: 240,
        max: 280,
      },
    },
  },
  // The Quench: ice and black iron, the tempering armour. A frontal breath
  // the tank turns away from the raid.
  heart_quench_guardian: {
    ...boss('heart_quench_guardian', 'Guardian of the Quench', 30000, 0x9ad8ff, 3),
    arcCleave: { every: 4, arcDeg: 100, range: 8, mult: 0.6, name: 'Tempering Strike' },
    trashKit: {
      cone: {
        castId: C.quenchBreath,
        name: 'Quenching Breath',
        castTime: 2.5,
        every: 14,
        first: 6,
        school: 'frost',
        range: 22,
        arcDeg: 70,
        min: 240,
        max: 280,
      },
    },
  },
  // The Heat: a faceless smith of embers, a red-hot anvil chained to its arm.
  // Molten Pour paints a lane; Anvil Clang stuns everyone close.
  heart_heat_guardian: {
    ...boss('heart_heat_guardian', 'Guardian of the Heat', 30000, 0xffe6a0, 3),
    trashKit: {
      line: {
        castId: C.heatPour,
        name: 'Molten Pour',
        castTime: 2,
        every: 12,
        first: 5,
        school: 'fire',
        length: 30,
        halfWidth: 3,
        min: 240,
        max: 280,
      },
      screech: {
        castId: C.heatClang,
        name: 'Anvil Clang',
        castTime: 2.5,
        every: 20,
        first: 12,
        school: 'physical',
        radius: 10,
        stun: 2,
        min: 140,
        max: 170,
      },
    },
  },
  // ---- the final boss ------------------------------------------------------------
  // The strength without its master. Phase 1 sketch: one form, a blast to hide
  // from behind the altars and a frontal pour. The altar form choice, the
  // altar drags and the adds are phase 2 (design doc, "Final boss").
  heart_masterless_strength: {
    ...boss('heart_masterless_strength', 'The Masterless Strength', 70000, 0xd8c8a0, 3.6),
    arcCleave: { every: 3, arcDeg: 110, range: 9, mult: 0.7, name: 'Forge Fist' },
    trashKit: {
      nova: {
        castId: C.finalWrath,
        name: 'Forge Wrath',
        castTime: 3,
        every: 24,
        first: 12,
        school: 'fire',
        radius: 40,
        min: 260,
        max: 300,
      },
      cone: {
        castId: C.finalPour,
        name: 'Forge Pour',
        castTime: 2.5,
        every: 13,
        first: 6,
        school: 'fire',
        range: 22,
        arcDeg: 70,
        min: 240,
        max: 280,
      },
    },
  },
};

// ---- spawns --------------------------------------------------------------------------

/** A pack of `ids` round (cx, cz), held in formation until pulled, facing
 *  `facing` (sim convention: 0 = +z). */
function pack(
  packId: string,
  cx: number,
  cz: number,
  ids: readonly string[],
  facing: number,
): DungeonSpawn[] {
  return ids.map((mobId, i) => {
    const a = (i / ids.length) * Math.PI * 2;
    return {
      mobId,
      x: cx + Math.sin(a) * 3,
      z: cz + Math.cos(a) * 3,
      facing,
      packId,
      idleStationary: true,
    };
  });
}

/** Facing from (x, z) toward (tx, tz) (sim convention: 0 = +z). */
function toward(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

/** The Ring's eight pack angles: two between each pair of vein mouths. */
export const RING_PACK_DEGREES = [30, 60, 105, 125, 235, 255, 300, 330] as const;

const RING_PACK_IDS = RING_PACK_DEGREES.map((_, i) => `r${i + 1}`);

const HAMMER_TRIO = ['heart_hammer_warder', 'heart_hammer_warder', 'heart_hammer_warder'];
const RING_TRIO = ['heart_ring_warder', 'heart_ring_warder', 'heart_ring_warder'];
const BREATH_TRIO = ['heart_breath_warder', 'heart_breath_caller', 'heart_breath_warder'];
const QUENCH_TRIO = ['heart_quench_warder', 'heart_quench_caller', 'heart_quench_warder'];
const HEAT_TRIO = ['heart_heat_warder', 'heart_heat_caller', 'heart_heat_warder'];

function guardian(mobId: string, at: { x: number; z: number }, facing: number): DungeonSpawn {
  return { mobId, x: at.x, z: at.z, facing, idleStationary: true };
}

const G = GALLERY_LANDINGS;
const S = SMITH_HEART_BOSS_SPOTS;

export const SMITH_HEART_SPAWNS: DungeonSpawn[] = [
  // ---- The Hammer Gallery and Pit (always first) ------------------------------------
  ...pack('h1', G.h1.x, G.h1.z, HAMMER_TRIO, toward(G.h1.x, G.h1.z, -100, -226)),
  ...pack('h2', G.h2.x, G.h2.z, HAMMER_TRIO, toward(G.h2.x, G.h2.z, -50, -232)),
  ...pack('h3', G.h3.x, G.h3.z, HAMMER_TRIO, toward(G.h3.x, G.h3.z, 10, -234)),
  guardian(SMITH_HEART_GUARDIANS.hammer, S.hammer, toward(0, -150, 30, -175)),
  // ---- The Ring: two packs between each pair of vein mouths -------------------------
  ...RING_PACK_DEGREES.flatMap((deg, i) => {
    const p = ringPoint(deg);
    return pack(RING_PACK_IDS[i], p.x, p.z, RING_TRIO, toward(p.x, p.z, 0, 0));
  }),
  // ---- The Breath (north) ------------------------------------------------------------
  ...pack('b1', BREATH.b1.x, BREATH.b1.z, BREATH_TRIO, Math.PI),
  ...pack('b2', BREATH.b2.x, BREATH.b2.z, BREATH_TRIO, toward(44, 134, 0, 104)),
  ...pack('b3', BREATH.b3.x, BREATH.b3.z, BREATH_TRIO, toward(-44, 160, 0, 154)),
  guardian(SMITH_HEART_GUARDIANS.breath, S.breath, toward(S.breath.x, S.breath.z, -22, 196)),
  // ---- The Quench (east) -------------------------------------------------------------
  ...pack('q1', QUENCH.q1.x, QUENCH.q1.z, QUENCH_TRIO, -Math.PI / 2),
  ...pack('q2', QUENCH.q2.x, QUENCH.q2.z, QUENCH_TRIO, toward(130, -40, 110, 0)),
  ...pack('q3', 172, -49, QUENCH_TRIO, -Math.PI / 2),
  guardian(SMITH_HEART_GUARDIANS.quench, S.quench, toward(S.quench.x, S.quench.z, 183, -26)),
  // ---- The Heat (west) ---------------------------------------------------------------
  ...pack('f1', -110, 0, HEAT_TRIO, Math.PI / 2),
  ...pack('f2', -142, 20, HEAT_TRIO, Math.PI / 2),
  ...pack('f3', -142, -20, HEAT_TRIO, Math.PI / 2),
  guardian(SMITH_HEART_GUARDIANS.heat, S.heat, Math.PI / 2),
  // ---- The Heart -----------------------------------------------------------------------
  guardian(SMITH_HEART_FINAL_BOSS, S.final, Math.PI),
];

/** Every pack, in route order (the Ring's eight after the Hammer). */
export const SMITH_HEART_PACKS = {
  hammer: ['h1', 'h2', 'h3'],
  ring: RING_PACK_IDS,
  breath: ['b1', 'b2', 'b3'],
  quench: ['q1', 'q2', 'q3'],
  heat: ['f1', 'f2', 'f3'],
} as const;

// ---- gates and seals ----------------------------------------------------------------

/** Yaw of a gate box spanning a passage that runs along (dx, dz). */
function across(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

const ALL_GUARDIANS = Object.values(SMITH_HEART_GUARDIANS);

/** One of the three causeways into the Heart: shut until all four colours
 *  burn on the seal and the Ring is clear; it seals behind the raid while the
 *  final boss fights. */
function causewayGate(id: string, name: string, x: number, z: number, dx: number, dz: number) {
  return {
    id,
    name,
    kind: 'forge_seal' as const,
    x,
    z,
    hw: 7.6,
    rot: across(dx, dz),
    packs: [...RING_PACK_IDS],
    bosses: [...ALL_GUARDIANS],
    sealWhileEngaged: SMITH_HEART_FINAL_BOSS,
  };
}

export const SMITH_HEART_GATES: DungeonGateDef[] = [
  {
    id: 'hammer_pit_mouth',
    name: 'Pit Mouth',
    kind: 'stone_slab',
    x: 30.5,
    z: -175.25,
    hw: 7.6,
    rot: across(-26, 21),
    packs: [...SMITH_HEART_PACKS.hammer],
    sealWhileEngaged: SMITH_HEART_GUARDIANS.hammer,
  },
  {
    id: 'the_slab',
    name: 'The Slab',
    kind: 'stone_slab',
    x: SLAB.x,
    z: SLAB.z,
    hw: 7.6,
    rot: across(0, 1),
    bosses: [SMITH_HEART_GUARDIANS.hammer],
    openText:
      'The living stone splits from end to end. Beyond the Slab, the heart of the mountain lies open.',
  },
  {
    id: 'cornice_mouth',
    name: 'Cornice Mouth',
    kind: 'forge_seal',
    x: -32,
    z: 184,
    hw: 7.6,
    rot: across(20, 24),
    packs: [...SMITH_HEART_PACKS.breath],
    sealWhileEngaged: SMITH_HEART_GUARDIANS.breath,
  },
  {
    id: 'lake_mouth',
    name: 'Lake Mouth',
    kind: 'forge_seal',
    x: 179.2,
    z: -33.6,
    hw: 7.6,
    rot: across(5, 10),
    packs: [...SMITH_HEART_PACKS.quench],
    sealWhileEngaged: SMITH_HEART_GUARDIANS.quench,
  },
  {
    id: 'anvil_mouth',
    name: 'Anvil Mouth',
    kind: 'forge_seal',
    x: -165,
    z: 0,
    hw: 7.6,
    rot: across(-1, 0),
    packs: [...SMITH_HEART_PACKS.heat],
    sealWhileEngaged: SMITH_HEART_GUARDIANS.heat,
  },
  {
    ...causewayGate('causeway_north', 'North Causeway', 0, 60, 0, -1),
    openText: 'Four colours burn on the heart seal. It opens, and the causeways fall still.',
  },
  causewayGate('causeway_east', 'East Causeway', 60, 0, -1, 0),
  causewayGate('causeway_west', 'West Causeway', -60, 0, 1, 0),
];

/** One inert ground object per gate: its template id carries the state. */
export const SMITH_HEART_GATE_OBJECTS: DungeonObjectSpawn[] = SMITH_HEART_GATES.map((g) => ({
  itemId: '',
  name: g.name,
  x: g.x,
  z: g.z,
  templateId: 'dungeon_gate_closed',
  dungeonId: SMITH_HEART_DUNGEON,
  lootable: false,
}));

/** The heart seal's markers (encounters/smith_heart/seal.ts): inert anchors
 *  spread so every walkable point stands within the client's interest radius
 *  of at least one, carrying the seal's lit veins in their template id. */
export const SMITH_HEART_SEAL_MARKERS: readonly { x: number; z: number }[] = [
  { x: -70, z: -236 },
  { x: 40, z: -200 },
  { x: 0, z: -100 },
  { x: 0, z: 0 },
  { x: 0, z: 150 },
  { x: -10, z: 210 },
  { x: 120, z: -20 },
  { x: 186, z: 10 },
  { x: -130, z: 0 },
  { x: -196, z: 0 },
];

export const SMITH_HEART_SEAL_PREFIX = 'smith_heart_seal_';

export const SMITH_HEART_SEAL_OBJECTS: DungeonObjectSpawn[] = SMITH_HEART_SEAL_MARKERS.map((m) => ({
  itemId: '',
  name: 'The Heart Seal',
  x: m.x,
  z: m.z,
  templateId: `${SMITH_HEART_SEAL_PREFIX}0` as 'smith_heart_seal_0',
  dungeonId: SMITH_HEART_DUNGEON,
  lootable: false,
}));

// ---- the dungeon -------------------------------------------------------------------

/** The world entrance: a cleft in the Stormcrag cliffs, east of Highwatch. */
export const SMITH_HEART_DOOR_POS = { x: 132, z: 772 } as const;

export const SMITH_HEART_DUNGEON_DEFS: Record<string, DungeonDef> = {
  [SMITH_HEART_DUNGEON]: {
    id: SMITH_HEART_DUNGEON,
    name: "The Smith's Heart",
    // Overflow band, the first free index after the Last Keep's family.
    index: 15,
    doorPos: SMITH_HEART_DOOR_POS,
    // Phase 1 blockout: dev builds only (encounters/smith_heart/entry.ts) and
    // out of the public Guide until the raid ships.
    guideVisible: false,
    entry: { x: SMITH_HEART_ANCHORS.entry.x, z: SMITH_HEART_ANCHORS.entry.z },
    exitOffset: { x: SMITH_HEART_ANCHORS.exit.x, z: SMITH_HEART_ANCHORS.exit.z },
    // The Heart is 300 yd of route from the Cleft: a second exit opens on the
    // caldera's rim once the final boss falls.
    bossExitPortal: { x: -20, z: -24 },
    spawns: SMITH_HEART_SPAWNS,
    objects: [...SMITH_HEART_GATE_OBJECTS, ...SMITH_HEART_SEAL_OBJECTS],
    gates: SMITH_HEART_GATES,
    bossChainPull: true,
    areaCastsPlant: true,
    interior: 'smith_heart',
    suggestedPlayers: 10,
    enterText: 'The mountain hums around you, like a forge banked for the night...',
    leaveText: 'You climb back out into the Stormcrag wind.',
  },
};
