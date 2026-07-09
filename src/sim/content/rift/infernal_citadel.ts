// The Infernal Citadel: a HAND-AUTHORED set-piece rift floor.
//
// Most rifts are a single procedural room per floor (see rift/rift_gen.ts). A
// fraction of seeds instead open this: one fixed, seven-room citadel with two
// bosses, laid out from the design map (docs/design/rift-portals.md, "Set-piece
// floors"). It is a SINGLE floor (floorCount 1), so it can headline a rift of any
// rank: the rank only sets the level/marks/loot, never the content.
//
// Data-as-code: this file is a declarative table (rooms, doors, decor, spawns,
// objects) plus one pure builder that assembles them into a RiftFloorPlan. All
// randomness comes from an Rng seeded from the descriptor, never the live sim rng,
// so both hosts regenerate an identical citadel.
//
//   z increases NORTH. The player enters from the south corridor (R0) and must:
//     R1 Sacrificial Hall  -> the Blood Orb on its altar sits dormant
//     R4 Pentagram Rotunda -> kill Magus Vel'Kor; the orb wakes
//     back to the orb      -> touch it; the temple portcullis grinds open
//     R6 Great Temple      -> kill Azgorath; the way home tears open
//   R2 (relic gallery), R5 (bone chamber) and R7 (forge) are optional side rooms,
//   two of which hold a reward cache (one behind an illusion wall).

import type { AuthoredDecor, AuthoredDoor, AuthoredRoom } from '../../dungeon_layout';
import { layoutColliders } from '../../dungeon_layout';
import type { StyleSource } from '../../rift/style';
import { buildStyle, mixSeed } from '../../rift/style';
import type { RiftFloorPlan, RiftObjectPlan, RiftSpawn } from '../../rift/types';
import { Rng } from '../../rng';
import type { DelveHazardZone } from '../../types';

/** Rift proper nouns this set-piece names itself from. */
export const INFERNAL_NOUNS = ['Infernal', 'Brimstone', 'Hellfire', 'Pactbound'] as const;
export const INFERNAL_THEME_ID = 'infernal';
export const INFERNAL_THEME_NAME = 'Infernal Citadel';

/** The rift's proper name for this seed. ONE source, so the portal tooltip, the
 * rift tracker, and the "you step through" line never disagree. */
export function infernalCitadelName(seed: number): string {
  const noun = new Rng(mixSeed(seed, 0x9a3e)).pick(INFERNAL_NOUNS as unknown as string[]);
  return noun === 'Infernal' ? 'The Infernal Citadel' : `The ${noun} Citadel`;
}

/** The citadel's colour grade. Deliberately blood-red and dim, NOT the amber forge
 * glow of the procedural `ember` theme, so the two never read as the same place. */
export const INFERNAL_STYLE: StyleSource = {
  kit: 'crypt',
  torch: { flame: 0xff4a2a, emissive: 0xc41a0a, light: 0xff5a3a },
  fog: { color: 0x14040a, near: 12, far: 70 },
  wallTint: 0x9a5a4a,
  floorTint: 0x7a3a34,
  daisRaised: false,
};

// ---- The map ---------------------------------------------------------------
// Rooms are axis-aligned and never overlap. Two rooms are connected ONLY where a
// door pierces the wall line they share, so the room graph below is the real
// topology (see rift/authored.ts). Every coordinate stays inside the rift region
// bounds (|x| <= 40, |z| <= 160, data.ts RIFT_REGION_HALF_X/Z).

export const INFERNAL_ROOMS: readonly AuthoredRoom[] = [
  { id: 'entry', x0: -4, x1: 4, z0: -19, z1: 2 }, // R0: entrance corridor
  { id: 'sacrifice', x0: -18, x1: 18, z0: 2, z1: 44 }, // R1: Sacrificial Hall (altar + orb)
  { id: 'relics', x0: 18, x1: 34, z0: 6, z1: 40 }, // R2: Relic Gallery (cages, hidden cache)
  { id: 'gallery', x0: -32, x1: -18, z0: 6, z1: 76 }, // R3: West Gallery (lava band)
  { id: 'rotunda', x0: -34, x1: -18, z0: -12, z1: 6 }, // R4: Pentagram Rotunda (miniboss)
  { id: 'bonepit', x0: -34, x1: -18, z0: 76, z1: 92 }, // R5: Bone Chamber
  { id: 'temple', x0: -18, x1: 18, z0: 44, z1: 96 }, // R6: Great Temple (giga-boss)
  { id: 'forge', x0: 18, x1: 34, z0: 56, z1: 80 }, // R7: Hell Forge
];

/** Doorways. The extent ACROSS the wall (`hw` on a constant-x wall, `hd` on a
 * constant-z wall) only has to reach the wall; the other extent is the opening. */
export const INFERNAL_DOORS: readonly AuthoredDoor[] = [
  { x: 0, z: 2, hw: 2.5, hd: 1 }, // entry -> sacrifice
  { x: 0, z: 44, hw: 2.5, hd: 1 }, // sacrifice -> temple (PORTCULLIS)
  { x: -18, z: 20, hw: 1, hd: 2.5 }, // sacrifice -> gallery
  { x: 18, z: 20, hw: 1, hd: 2.5 }, // sacrifice -> relics
  { x: -26, z: 6, hw: 2.5, hd: 1 }, // gallery -> rotunda
  { x: -26, z: 76, hw: 2.5, hd: 1 }, // gallery -> bonepit
  { x: 18, z: 68, hw: 1, hd: 2.5 }, // temple -> forge
];

const GATE_Z = 44; // the portcullis line (the sacrifice -> temple door)
const ALTAR = { x: 0, z: 40 }; // the Blood Orb's altar, just south of the gate
const ROTUNDA = { x: -26, z: -3 }; // pentagram centre (miniboss arena)
const DAIS = { x: 0, z: 84, r: 11 }; // temple dais (giga-boss)

// Collision radii below are the footprints MEASURED from the built GLBs by the
// asset pipeline (`prop` lane report), so what you bump into is what you see.
const R_BRAZIER = 0.85;
const R_ALTAR = 1.2; // the altar is placed at scale 1.5 (0.8 x 1.5)
const R_IDOL = 1.5;
const R_FORGE = 1.3;
const R_CAGE = 1.0;
const R_BONES = 0.5;
const R_FANG = 0.85;

/** A standing brazier: the map's ring of firelights. */
const brazier = (x: number, z: number): AuthoredDecor => ({
  key: 'infernal_brazier',
  x,
  z,
  yaw: 0,
  r: R_BRAZIER,
});

export const INFERNAL_DECOR: readonly AuthoredDecor[] = [
  // R0 entrance
  brazier(-2.5, -16),
  brazier(2.5, -16),
  // R1 Sacrificial Hall: braziers down both flanks, the altar at the north end.
  brazier(-14, 8),
  brazier(14, 8),
  brazier(-14, 23),
  brazier(14, 23),
  brazier(-14, 38),
  brazier(14, 38),
  { key: 'infernal_altar', x: ALTAR.x, z: ALTAR.z, yaw: 0, scale: 1.5, r: R_ALTAR },
  { key: 'rug', x: 0, z: 22, yaw: 0, scale: 1 },
  { key: 'bone_pile', x: -15.5, z: 14, yaw: 0.6, r: R_BONES },
  { key: 'bone_pile', x: 15.5, z: 31, yaw: 2.1, r: R_BONES },
  // R2 Relic Gallery: gibbets over the aisle, braziers, an alcove behind a fake wall.
  brazier(21, 10),
  brazier(31, 10),
  brazier(21, 36),
  brazier(31, 36),
  { key: 'hanging_cage', x: 21.5, z: 14, yaw: 0, r: R_CAGE },
  { key: 'hanging_cage', x: 30.5, z: 20, yaw: 0.4, r: R_CAGE },
  { key: 'hanging_cage', x: 22, z: 27, yaw: 2.6, r: R_CAGE },
  // R3 West Gallery: a long processional lit by braziers, obsidian breaking the floor.
  brazier(-28, 14),
  brazier(-22, 32),
  brazier(-28, 52),
  brazier(-22, 68),
  { key: 'obsidian_fang', x: -25.5, z: 24, yaw: 0.8, r: R_FANG },
  { key: 'obsidian_fang', x: -29, z: 60, yaw: 2.2, r: R_FANG },
  // R4 Pentagram Rotunda: the sigil, ringed by five flames.
  { key: 'pentagram', x: ROTUNDA.x, z: ROTUNDA.z, yaw: 0, scale: 6.5 },
  { key: 'obsidian_fang', x: -31.5, z: -9.5, yaw: 1.1, r: R_FANG },
  { key: 'obsidian_fang', x: -20.5, z: -9.5, yaw: 2.7, r: R_FANG },
  // R5 Bone Chamber
  brazier(-31, 80),
  brazier(-21, 80),
  { key: 'bone_pile', x: -29.5, z: 85, yaw: 0.3, r: R_BONES },
  { key: 'bone_pile', x: -22.5, z: 87, yaw: 1.9, r: R_BONES },
  { key: 'bone_pile', x: -26, z: 89.5, yaw: 3.0, r: R_BONES },
  // R6 Great Temple: the long nave, the idol looming over the dais.
  brazier(-14, 50),
  brazier(14, 50),
  brazier(-14, 66),
  brazier(14, 66),
  brazier(-14, 82),
  brazier(14, 82),
  { key: 'rug', x: 0, z: 62, yaw: 0, scale: 1 },
  // The idol looks SOUTH down the nave (yaw PI): a party climbing to the dais walks
  // into its gaze, not its back.
  { key: 'demon_idol', x: 0, z: 93.5, yaw: Math.PI, r: R_IDOL },
  { key: 'obsidian_fang', x: -13, z: 57, yaw: 0.5, r: R_FANG },
  { key: 'obsidian_fang', x: 13, z: 74, yaw: 2.4, r: R_FANG },
  // R7 Hell Forge
  brazier(21, 60),
  brazier(31, 76),
  { key: 'hell_forge', x: 28.5, z: 71, yaw: Math.PI, r: R_FORGE },
  { key: 'bone_pile', x: 21, z: 66, yaw: 1.2, r: R_BONES },
];

/** Trash placements: (templateId, x, z). Kept inside their rooms and off every
 * decor collider (pinned by tests/rift_infernal.test.ts). */
const TRASH_PLAN: ReadonlyArray<readonly [string, number, number]> = [
  // R1 Sacrificial Hall
  ['rift_hellguard', -10, 12],
  ['rift_hellguard', 8, 13],
  ['rift_pact_acolyte', -7, 26],
  ['rift_hellguard', 9, 27],
  ['rift_pact_acolyte', -11, 35],
  ['rift_hellguard', 11, 35],
  // R2 Relic Gallery
  ['rift_hellguard', 24, 16],
  ['rift_pact_acolyte', 30, 23],
  ['rift_hellguard', 24, 31],
  // R3 West Gallery
  ['rift_hellguard', -25, 16],
  ['rift_pact_acolyte', -27, 34],
  ['rift_hellguard', -24, 56],
  ['rift_hellguard', -28, 67],
  // R4 Pentagram Rotunda: the ritualist's two attendants
  ['rift_pact_acolyte', -30.5, -3],
  ['rift_pact_acolyte', -21.5, -3],
  // R5 Bone Chamber
  ['rift_pact_acolyte', -29.5, 82.5],
  ['rift_pact_acolyte', -23, 83.5],
  // R6 Great Temple
  ['rift_pact_acolyte', -12, 52],
  ['rift_pact_acolyte', 12, 52],
  ['rift_hellguard', 0, 60],
  ['rift_hellguard', -7, 76],
  ['rift_hellguard', 7, 76],
  // R7 Hell Forge
  ['rift_hellguard', 23, 60],
  ['rift_hellguard', 30, 62],
];

/** The lava band flooding the middle of the west gallery: jump it, skirt it, or
 * take the burn. Same damage model as the procedural floors' molten bands. */
const INFERNAL_HAZARDS: readonly DelveHazardZone[] = [
  { x: -25, z: 44, r: 6, rx: 6, rz: 3.5, tier: 'shallow' },
];

// ---- The builder -----------------------------------------------------------

/** Build the citadel floor. Pure: identical output for identical arguments, and the
 * only randomness is the colour jitter drawn from a descriptor-seeded local Rng. */
export function buildInfernalCitadelFloor(
  seed: number,
  baseLevel: number,
  floorLevel: number,
): RiftFloorPlan {
  const rng = new Rng(mixSeed(seed, 0xc17a));

  const layout = {
    zMin: -19,
    zMax: 96,
    sideWallZ: 38.5,
    sideWallHd: 57.5,
    pillars: [],
    tombs: [],
    stubs: [],
    dais: { ...DAIS },
    wallX: 34,
    endWallHw: 35,
    floorHalfX: 34,
    doorZ: -17,
    rooms: INFERNAL_ROOMS.map((r) => ({ ...r })),
    doors: INFERNAL_DOORS.map((d) => ({ ...d })),
    decor: INFERNAL_DECOR.map((d) => ({ ...d })),
    // The relic gallery's alcove hides behind a wall panel that renders solid but
    // carries no collider (layoutColliders never emits illusion walls), so pushing
    // into the "dead end" reveals the cache behind it.
    illusionWalls: [{ x: 28.5, z: 33, hw: 0.6, hd: 3.2 }],
  };

  const spawns: RiftSpawn[] = TRASH_PLAN.map(([templateId, x, z]) => ({
    templateId,
    x,
    z,
    level: floorLevel,
  }));
  // Miniboss on the pentagram: his death arms the Blood Orb.
  spawns.push({
    templateId: 'rift_boss_ritualist',
    x: ROTUNDA.x,
    z: ROTUNDA.z,
    level: floorLevel,
    miniboss: true,
  });
  // The giga-boss on the temple dais: his death opens the way home.
  spawns.push({
    templateId: 'rift_boss_pitlord',
    x: DAIS.x,
    z: DAIS.z,
    level: floorLevel,
    boss: true,
  });

  const objects: RiftObjectPlan[] = [
    { kind: 'infernal_orb', x: ALTAR.x, z: ALTAR.z, name: 'Blood Orb' },
    { kind: 'gate', x: 0, z: GATE_Z, name: 'Temple Gate' },
    // The `chest` marker is where runs.ts tears the exit + sealed cache open once the
    // giga-boss falls (it is never spawned as an object itself).
    { kind: 'chest', x: 0, z: 89, name: 'Rift Cache' },
    // Two off-path reward caches: one behind the relic gallery's illusion wall, one
    // beside the forge for anyone who explores past the temple door.
    { kind: 'treasure', x: 31.5, z: 33, name: 'Hidden Cache' },
    { kind: 'treasure', x: 23, z: 74, name: 'Forge Cache' },
  ];

  return {
    seed: seed >>> 0,
    baseLevel: Math.round(baseLevel),
    floorIndex: 0,
    floorCount: 1,
    isBoss: true,
    authored: true,
    name: infernalCitadelName(seed),
    themeName: INFERNAL_THEME_NAME,
    layout,
    style: buildStyle(rng, INFERNAL_STYLE),
    entry: { x: 0, z: -11 },
    spawns,
    objects,
    puzzle: { kind: 'none', pylonCount: 0 },
    hazards: INFERNAL_HAZARDS.map((h) => ({ ...h })),
    iceZone: null,
    rollers: [],
    platform: null,
    // The portcullis barring the temple. It has no pressure plate: the Blood Orb
    // opens it, and only after the ritualist falls. `hw` spans the shared wall.
    gate: { x: 0, z: GATE_Z, hw: 18, hd: 1.6, switchX: 0, switchZ: 0, openOnOrb: true },
  };
}

/** Instance-local colliders for the citadel (walls minus doorways, plus the decor
 * footprints). Exposed for tests; the runtime goes through layoutColliders. */
export function infernalCitadelColliders(): ReturnType<typeof layoutColliders> {
  return layoutColliders(buildInfernalCitadelFloor(1, 20, 20).layout);
}
