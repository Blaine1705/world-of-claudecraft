// The Hollow Crypt rework (docs/design/dungeon-rework/hollow_crypt.md): the
// new trash and boss templates, the nine packs placed on the open-air layout
// (hollow_crypt_layout.ts), the patrols, and the gates and encounter seals
// that make every pack mandatory. Merged by data.ts (mobs) and dungeons.ts
// (spawns, gates, gate objects).
//
// FIRST PLAYABLE SLICE: the bosses are functional placeholders built from the
// existing mob kit (bigCast, summonAdds, stackPoison, stomp, aoePulse); their
// full encounter modules (graves, cocoons, the LOS dirge, the three-act rite)
// land in later passes. Health is placeholder too, to be set from the meters
// harness through NormalDungeonTuning.healthMultiplierByMob.

import type { DungeonGateDef, DungeonObjectSpawn, DungeonSpawn, MobTemplate } from '../types';

// ---- Templates ------------------------------------------------------------

export const HOLLOW_CRYPT_MOBS: Record<string, MobTemplate> = {
  // P3: the large skeleton that teaches tank positioning with a slow,
  // telegraphed Bone Rattle (the first stomp lands one full interval in).
  ossuary_sentinel: {
    id: 'ossuary_sentinel',
    name: 'Ossuary Sentinel',
    minLevel: 8,
    maxLevel: 8,
    family: 'undead',
    elite: true,
    hpBase: 80,
    hpPerLevel: 24,
    dmgBase: 9,
    dmgPerLevel: 2.4,
    attackSpeed: 2.6,
    armorPerLevel: 22,
    moveSpeed: 6,
    aggroRadius: 12,
    stomp: { radius: 8, every: 12, duration: 1.5, min: 8, max: 12, name: 'Bone Rattle' },
    loot: [
      { copper: 140, chance: 1 },
      { itemId: 'bone_fragments', chance: 0.9 },
    ],
    scale: 1.55,
    color: 0xcfc6b0,
  },
  // P4 and P5: the sexton's diggers (their Open Graves come with Marrow's
  // encounter module; tonight they are plain elites).
  hollow_gravedigger: {
    id: 'hollow_gravedigger',
    name: 'Hollow Gravedigger',
    minLevel: 8,
    maxLevel: 8,
    family: 'undead',
    elite: true,
    hpBase: 50,
    hpPerLevel: 20,
    dmgBase: 8,
    dmgPerLevel: 2.3,
    attackSpeed: 2.4,
    armorPerLevel: 16,
    moveSpeed: 6.5,
    aggroRadius: 12,
    loot: [
      { copper: 110, chance: 1 },
      { itemId: 'bone_fragments', chance: 0.7 },
    ],
    scale: 1.05,
    color: 0x8a7a64,
  },
  // P6: the rime egg sacs. One hit breaks a sac; a boot beside one springs it.
  rime_egg_sac: {
    id: 'rime_egg_sac',
    name: 'Rime Egg Sac',
    minLevel: 8,
    maxLevel: 8,
    family: 'spider',
    hpBase: 8,
    hpPerLevel: 0,
    dmgBase: 0,
    dmgPerLevel: 0,
    attackSpeed: 999,
    armorPerLevel: 0,
    moveSpeed: 0,
    aggroRadius: 0,
    loot: [],
    scale: 1,
    color: 0xcfe3f0,
    xpMult: 0,
    offStreamIdle: true,
    broodEgg: {
      chainRadius: 5,
      chainDelay: 0.3,
      proximityRadius: 4,
      hatchMobId: 'rimeweb_hatchling',
    },
  },
  // The hatchlings pounce the soft targets (healer or damage dealer first).
  rimeweb_hatchling: {
    id: 'rimeweb_hatchling',
    name: 'Rimeweb Hatchling',
    minLevel: 7,
    maxLevel: 8,
    family: 'spider',
    hpBase: 20,
    hpPerLevel: 2,
    dmgBase: 6.5,
    dmgPerLevel: 2.1,
    attackSpeed: 1.6,
    armorPerLevel: 4,
    moveSpeed: 10,
    aggroRadius: 12,
    loot: [{ copper: 8, chance: 1 }],
    scale: 0.55,
    color: 0xd6eaf8,
    xpMult: 0.3,
    offStreamIdle: true,
    broodWhelp: {
      leapRange: 20,
      leapSpeedMult: 2.4,
      leapSeconds: 1.2,
      burn: { perTick: 2, interval: 1, duration: 6, name: 'Rime Bite', school: 'frost' },
    },
  },
  // P7: the caster spider on the rim walk (Silk Wrap arrives with Rimeweb's
  // module; tonight its bite carries the stacking rime venom).
  rimeweb_spinner: {
    id: 'rimeweb_spinner',
    name: 'Rimeweb Spinner',
    minLevel: 9,
    maxLevel: 9,
    family: 'spider',
    elite: true,
    hpBase: 50,
    hpPerLevel: 20,
    dmgBase: 8,
    dmgPerLevel: 2.4,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 8,
    aggroRadius: 13,
    stackPoison: {
      chance: 0.5,
      perTick: 2,
      interval: 3,
      duration: 9,
      maxStacks: 3,
      name: 'Rime Venom',
      school: 'frost',
    },
    loot: [
      { copper: 130, chance: 1 },
      { itemId: 'spider_leg', chance: 0.7 },
    ],
    scale: 1.35,
    color: 0xe4f0fa,
  },
  // P8 and P9: the tallow-sect acolytes (their interruptible casts arrive
  // with Ilvane's module).
  candlewright_acolyte: {
    id: 'candlewright_acolyte',
    name: 'Candlewright Acolyte',
    minLevel: 9,
    maxLevel: 9,
    family: 'undead',
    elite: true,
    hpBase: 46,
    hpPerLevel: 19,
    dmgBase: 8,
    dmgPerLevel: 2.4,
    attackSpeed: 2.0,
    armorPerLevel: 14,
    moveSpeed: 7,
    aggroRadius: 12,
    loot: [
      { copper: 130, chance: 1 },
      { itemId: 'linen_scrap', chance: 0.6 },
    ],
    scale: 1.0,
    color: 0xe8a64a,
  },
  // P8 and Ilvane's arena: the hooded choir (Harmony arrives with her module).
  hollow_chorister: {
    id: 'hollow_chorister',
    name: 'Hollow Chorister',
    minLevel: 8,
    maxLevel: 8,
    family: 'undead',
    elite: true,
    hpBase: 44,
    hpPerLevel: 18,
    dmgBase: 7,
    dmgPerLevel: 2.2,
    attackSpeed: 2.2,
    armorPerLevel: 12,
    moveSpeed: 7,
    aggroRadius: 12,
    loot: [
      { copper: 110, chance: 1 },
      { itemId: 'linen_scrap', chance: 0.5 },
    ],
    scale: 1.0,
    color: 0x7b4fa0,
  },
  // P9: the procession's walkers (and later Morthen's Gravecall souls).
  bound_soul: {
    id: 'bound_soul',
    name: 'Bound Soul',
    minLevel: 8,
    maxLevel: 8,
    family: 'undead',
    hpBase: 40,
    hpPerLevel: 4,
    dmgBase: 4,
    dmgPerLevel: 1.2,
    attackSpeed: 2.2,
    armorPerLevel: 6,
    moveSpeed: 5,
    aggroRadius: 10,
    loot: [{ copper: 20, chance: 1 }],
    scale: 0.95,
    color: 0x6fd6a8,
    xpMult: 0.5,
  },
  // Boss 2: Rimeweb, Mother of the Bonechill (placeholder kit: the stacking
  // venom and the Brood Call hatchling waves at 50 and 25 percent).
  rimeweb: {
    id: 'rimeweb',
    name: 'Rimeweb',
    minLevel: 9,
    maxLevel: 9,
    family: 'spider',
    elite: true,
    ccImmune: true,
    slowImmune: true,
    hpBase: 120,
    hpPerLevel: 26,
    dmgBase: 9,
    dmgPerLevel: 2.5,
    attackSpeed: 2.0,
    armorPerLevel: 20,
    moveSpeed: 8,
    aggroRadius: 14,
    stackPoison: {
      chance: 0.6,
      perTick: 3,
      interval: 3,
      duration: 9,
      maxStacks: 3,
      name: 'Bonechill Venom',
      school: 'frost',
    },
    summonAdds: { mobId: 'rimeweb_hatchling', count: 3, atHpPct: [0.5, 0.25] },
    yells: { summon: 'The brood drops from the Great Web!' },
    loot: [
      { copper: 1000, chance: 1 },
      {
        itemId: 'rimesilk_mantle',
        chance: 0.34,
        rollGroup: 'rimeweb_guaranteed',
        normalOnly: true,
      },
      {
        itemId: 'bonechill_carapace_vest',
        chance: 0.33,
        rollGroup: 'rimeweb_guaranteed',
        normalOnly: true,
      },
      {
        itemId: 'rimeweb_hunters_leggings',
        chance: 0.33,
        rollGroup: 'rimeweb_guaranteed',
        normalOnly: true,
      },
      { itemId: 'rimeweb_fang', chance: 0.1, normalOnly: true },
    ],
    scale: 2.1,
    color: 0xe8f4ff,
  },
  // Boss 3: Cantor Ilvane (placeholder kit: the Dirge as a telegraphed cast).
  cantor_ilvane: {
    id: 'cantor_ilvane',
    name: 'Cantor Ilvane',
    minLevel: 9,
    maxLevel: 9,
    family: 'undead',
    elite: true,
    ccImmune: true,
    slowImmune: true,
    hpBase: 110,
    hpPerLevel: 24,
    dmgBase: 8,
    dmgPerLevel: 2.4,
    attackSpeed: 2.2,
    armorPerLevel: 18,
    moveSpeed: 7,
    aggroRadius: 14,
    bigCast: {
      castId: 'dirge_of_the_hollow',
      name: 'Dirge of the Hollow',
      castTime: 2.5,
      every: 12,
      radius: 40,
      min: 10,
      max: 14,
      school: 'shadow',
    },
    loot: [
      { copper: 1000, chance: 1 },
      { itemId: 'cantors_cassock', chance: 0.34, rollGroup: 'ilvane_guaranteed', normalOnly: true },
      {
        itemId: 'choirward_leggings',
        chance: 0.33,
        rollGroup: 'ilvane_guaranteed',
        normalOnly: true,
      },
      {
        itemId: 'choristers_gloves',
        chance: 0.33,
        rollGroup: 'ilvane_guaranteed',
        normalOnly: true,
      },
      { itemId: 'cantors_hymnal', chance: 0.1, normalOnly: true },
    ],
    scale: 1.3,
    color: 0x9d6cd0,
  },
};

// ---- Spawns ---------------------------------------------------------------

const FACE_SOUTH = Math.PI; // toward the entrance
const FACE_NORTH = 0;

// P2 walks a loop around the ossuary monument; P9's acolyte leads three bound
// souls around the stair landing. Offsets space the walkers in file.
const P2_LOOP = [
  { x: -16, z: -46 },
  { x: 16, z: -46 },
  { x: 16, z: -14 },
  { x: -16, z: -14 },
];
const P9_LOOP = [
  { x: 35, z: 157 },
  { x: 51, z: 157 },
  { x: 51, z: 165 },
  { x: 35, z: 165 },
];

export const HOLLOW_CRYPT_SPAWNS: DungeonSpawn[] = [
  // P1: Undercroft vestibule, two shamblers at the foot of the Chapel Stair.
  { mobId: 'crypt_shambler', x: -4, z: -60, facing: FACE_SOUTH, packId: 'p1' },
  { mobId: 'crypt_shambler', x: 4, z: -60, facing: FACE_SOUTH, packId: 'p1' },
  // P2: two acolytes patrolling the monument loop.
  { mobId: 'hollow_acolyte', x: -16, z: -46, packId: 'p2', patrol: { points: P2_LOOP, offset: 4 } },
  { mobId: 'hollow_acolyte', x: -13, z: -46, packId: 'p2', patrol: { points: P2_LOOP, offset: 0 } },
  // P3: the Grille's guard, a sentinel flanked by two shamblers.
  { mobId: 'ossuary_sentinel', x: 0, z: 8, facing: FACE_SOUTH, packId: 'p3', idleStationary: true },
  { mobId: 'crypt_shambler', x: -5, z: 4, facing: FACE_SOUTH, packId: 'p3', idleStationary: true },
  { mobId: 'crypt_shambler', x: 5, z: 4, facing: FACE_SOUTH, packId: 'p3', idleStationary: true },
  // P4: the yard trench, two gravediggers.
  { mobId: 'hollow_gravedigger', x: -84, z: 30, packId: 'p4' },
  { mobId: 'hollow_gravedigger', x: -78, z: 34, packId: 'p4' },
  // P5: the bell pit below the Bell Yard ramp.
  { mobId: 'hollow_gravedigger', x: -86, z: 66, packId: 'p5', idleStationary: true },
  { mobId: 'crypt_shambler', x: -80, z: 62, packId: 'p5', idleStationary: true },
  { mobId: 'crypt_shambler', x: -92, z: 62, packId: 'p5', idleStationary: true },
  // Boss 1: Sexton Marrow in the Bell Yard.
  { mobId: 'sexton_marrow', x: -82, z: 122, facing: FACE_SOUTH, idleStationary: true },
  // P6: the gallery nest, two widows and four rime egg sacs along the walls.
  { mobId: 'bonechill_widow', x: 70, z: 44, packId: 'p6' },
  { mobId: 'bonechill_widow', x: 78, z: 48, packId: 'p6' },
  { mobId: 'rime_egg_sac', x: 58, z: 32 },
  { mobId: 'rime_egg_sac', x: 58, z: 50 },
  { mobId: 'rime_egg_sac', x: 93, z: 48 },
  { mobId: 'rime_egg_sac', x: 92, z: 62 },
  // P7: the rim walk, a spinner and a widow above the Great Web.
  { mobId: 'rimeweb_spinner', x: 105, z: 70, packId: 'p7', idleStationary: true },
  { mobId: 'bonechill_widow', x: 104, z: 78, packId: 'p7', idleStationary: true },
  // Boss 2: Rimeweb before her web.
  { mobId: 'rimeweb', x: 80, z: 116, facing: FACE_SOUTH, idleStationary: true },
  // P8: the choir approach, two candlewrights and a chorister.
  { mobId: 'candlewright_acolyte', x: -4, z: 94, facing: FACE_SOUTH, packId: 'p8' },
  { mobId: 'candlewright_acolyte', x: 4, z: 94, facing: FACE_SOUTH, packId: 'p8' },
  { mobId: 'hollow_chorister', x: 0, z: 98, facing: FACE_SOUTH, packId: 'p8' },
  // Boss 3: Cantor Ilvane on the loft with her two choristers at the rail.
  {
    mobId: 'cantor_ilvane',
    x: 0,
    z: 163,
    facing: FACE_SOUTH,
    packId: 'ilvane',
    idleStationary: true,
  },
  {
    mobId: 'hollow_chorister',
    x: -7,
    z: 154,
    facing: FACE_SOUTH,
    packId: 'ilvane',
    idleStationary: true,
  },
  {
    mobId: 'hollow_chorister',
    x: 7,
    z: 154,
    facing: FACE_SOUTH,
    packId: 'ilvane',
    idleStationary: true,
  },
  // P9: the procession on the stair landing.
  {
    mobId: 'candlewright_acolyte',
    x: 44,
    z: 157,
    packId: 'p9',
    patrol: { points: P9_LOOP, offset: 9 },
  },
  { mobId: 'bound_soul', x: 41, z: 157, packId: 'p9', patrol: { points: P9_LOOP, offset: 6 } },
  { mobId: 'bound_soul', x: 38, z: 157, packId: 'p9', patrol: { points: P9_LOOP, offset: 3 } },
  { mobId: 'bound_soul', x: 35, z: 157, packId: 'p9', patrol: { points: P9_LOOP, offset: 0 } },
  // Boss 4: Morthen at the altar of the Rite Ring, facing the stair.
  { mobId: 'morthen', x: 0, z: 212, facing: FACE_NORTH, idleStationary: true },
];

/** The nine mandatory trash pulls, in route order (dev helpers, tests). */
export const HOLLOW_CRYPT_PACKS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] as const;

// ---- Gates and seals --------------------------------------------------------

/** Yaw of a gate box spanning a passage that runs along (dx, dz). */
function across(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export const HOLLOW_CRYPT_GATES: DungeonGateDef[] = [
  {
    id: 'grille',
    name: 'Undercroft Grille',
    kind: 'portcullis',
    x: 0,
    z: 21,
    hw: 7,
    rot: 0,
    packs: ['p1', 'p2', 'p3'],
    openText: 'The Undercroft Grille grinds open.',
  },
  {
    id: 'yard_barrier',
    name: 'Bone Barrier',
    kind: 'bone_barrier',
    x: -82,
    z: 93,
    hw: 7,
    rot: 0,
    packs: ['p4', 'p5'],
    sealWhileEngaged: 'sexton_marrow',
    openText: 'The bone barrier before the Bell Yard crumbles.',
  },
  {
    id: 'yard_bridge',
    name: 'Bridge of Bone',
    kind: 'bone_bridge',
    x: -60,
    z: 102,
    hw: 6,
    rot: across(24, -2),
    bosses: ['sexton_marrow'],
    openText: 'A bridge of bone knits itself across the mist.',
  },
  {
    id: 'web_curtain',
    name: 'Frost-Web Curtain',
    kind: 'web_curtain',
    x: 80,
    z: 88,
    hw: 7,
    rot: 0,
    packs: ['p6', 'p7'],
    sealWhileEngaged: 'rimeweb',
    openText: 'The frost-web curtain tears apart.',
  },
  {
    id: 'web_bridge',
    name: 'Webbed Causeway',
    kind: 'web_curtain',
    x: 60,
    z: 102,
    hw: 6,
    rot: across(-24, -2),
    bosses: ['rimeweb'],
    openText: 'The webs over the eastern causeway fall away.',
  },
  {
    id: 'twin_seals',
    name: 'Twin Seals',
    kind: 'warded_arch',
    x: 0,
    z: 113,
    hw: 7,
    rot: 0,
    packs: ['p8'],
    bosses: ['sexton_marrow', 'rimeweb'],
    sealWhileEngaged: 'cantor_ilvane',
    openText: 'Both sigils gutter out. The Twin Seals open.',
  },
  {
    id: 'choir_door',
    name: 'Choir Door',
    kind: 'warded_arch',
    x: 31,
    z: 161,
    hw: 7,
    rot: across(1, 0),
    bosses: ['cantor_ilvane'],
    openText: 'The choir door opens onto the Bone Stair.',
  },
  {
    id: 'stair_gate',
    name: 'Bone Stair Gate',
    kind: 'bone_barrier',
    x: 56,
    z: 161,
    hw: 6,
    rot: across(1, 0),
    packs: ['p9'],
    openText: 'The gate at the foot of the Bone Stair collapses.',
  },
  {
    id: 'rite_ward',
    name: 'Unquiet Ward',
    kind: 'rite_ward',
    x: 5.8,
    z: 233.6,
    hw: 6,
    rot: across(-4, -8),
    sealWhileEngaged: 'morthen',
  },
];

/** One inert ground object per gate: its template id carries the state. */
export const HOLLOW_CRYPT_GATE_OBJECTS: DungeonObjectSpawn[] = HOLLOW_CRYPT_GATES.map((g) => ({
  itemId: '',
  name: g.name,
  x: g.x,
  z: g.z,
  templateId: 'dungeon_gate_closed',
  dungeonId: 'hollow_crypt',
  lootable: false,
}));
