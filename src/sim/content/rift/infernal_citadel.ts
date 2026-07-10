// The Infernal Citadel: a HAND-AUTHORED set-piece rift floor.
//
// Most rifts are a single procedural room per floor (see rift/rift_gen.ts). A
// fraction of seeds instead open this: one fixed, eight-room citadel with two
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
  torch: { flame: 0xff5a32, emissive: 0xd52a12, light: 0xff7048 },
  fog: { color: 0x26070b, near: 20, far: 110 },
  wallTint: 0xb86b55,
  floorTint: 0x8f493e,
  daisRaised: false,
};

// ---- The map ---------------------------------------------------------------
// Rooms are axis-aligned and never overlap. Two rooms are connected ONLY where a
// door pierces the wall line they share, so the room graph below is the real
// topology (see rift/authored.ts). Every coordinate stays inside the rift region
// bounds (|x| <= 40, |z| <= 160, data.ts RIFT_REGION_HALF_X/Z).

export const INFERNAL_ROOMS: readonly AuthoredRoom[] = [
  { id: 'entry', x0: -7, x1: 7, z0: -34, z1: -14 }, // R0: Gatehouse
  { id: 'sacrifice', x0: -18, x1: 18, z0: -14, z1: 28 }, // R1: Sacrificial Hall
  { id: 'relics', x0: 18, x1: 36, z0: -8, z1: 22 }, // R2: Relic Gallery
  { id: 'gallery', x0: -36, x1: -18, z0: -8, z1: 22 }, // R3: West Processional
  { id: 'rotunda', x0: -36, x1: -18, z0: 22, z1: 48 }, // R4: Pentagram Rotunda
  { id: 'bonepit', x0: -36, x1: -18, z0: 48, z1: 74 }, // R5: Bone Chamber
  { id: 'temple', x0: -18, x1: 18, z0: 28, z1: 96 }, // R6: Great Temple
  { id: 'forge', x0: 18, x1: 36, z0: 46, z1: 78 }, // R7: Hell Forge
];

/** Doorways. The extent ACROSS the wall (`hw` on a constant-x wall, `hd` on a
 * constant-z wall) only has to reach the wall; the other extent is the opening. */
export const INFERNAL_DOORS: readonly AuthoredDoor[] = [
  { x: 0, z: -14, hw: 3.5, hd: 1 }, // entry -> sacrifice
  { x: 0, z: 28, hw: 4, hd: 1 }, // sacrifice -> temple (PORTCULLIS)
  { x: -18, z: 6, hw: 1, hd: 3 }, // sacrifice -> gallery
  { x: 18, z: 6, hw: 1, hd: 3 }, // sacrifice -> relics
  { x: -27, z: 22, hw: 3, hd: 1 }, // gallery -> rotunda
  { x: -18, z: 25, hw: 1, hd: 2 }, // rotunda -> sacrifice (short return to orb)
  { x: -27, z: 48, hw: 3, hd: 1 }, // rotunda -> bonepit
  { x: 18, z: 62, hw: 1, hd: 3 }, // temple -> forge
];

const GATE_Z = 28; // the portcullis line (the sacrifice -> temple door)
const ALTAR = { x: 0, z: 24 }; // the Blood Orb's altar, just south of the gate
const ROTUNDA = { x: -27, z: 35 }; // pentagram centre (miniboss arena)
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
  // R0 Gatehouse: a broad, readable arrival lane with a lit threshold.
  brazier(-5, -30),
  brazier(5, -30),
  brazier(-5, -17),
  brazier(5, -17),
  // R1 Sacrificial Hall: braziers down both flanks, the altar at the north end.
  brazier(-14, -8),
  brazier(14, -8),
  brazier(-14, 7),
  brazier(14, 7),
  brazier(-14, 21),
  brazier(14, 21),
  { key: 'infernal_altar', x: ALTAR.x, z: ALTAR.z, yaw: 0, scale: 1.5, r: R_ALTAR },
  { key: 'rug', x: 0, z: 5, yaw: 0, scale: 1 },
  { key: 'bone_pile', x: -15.5, z: 13, yaw: 0.6, r: R_BONES },
  { key: 'bone_pile', x: 15.5, z: 18, yaw: 2.1, r: R_BONES },
  // R2 Relic Gallery: gibbets over the aisle, braziers, an alcove behind a fake wall.
  brazier(22, -4),
  brazier(32, -4),
  brazier(22, 18),
  brazier(32, 18),
  { key: 'hanging_cage', x: 22.5, z: 1, yaw: 0, r: R_CAGE },
  { key: 'hanging_cage', x: 31.5, z: 7, yaw: 0.4, r: R_CAGE },
  { key: 'hanging_cage', x: 23, z: 13, yaw: 2.6, r: R_CAGE },
  // R3 West Gallery: a long processional lit by braziers, obsidian breaking the floor.
  brazier(-32, -4),
  brazier(-22, -4),
  brazier(-32, 18),
  brazier(-22, 18),
  { key: 'obsidian_fang', x: -33, z: 8, yaw: 0.8, r: R_FANG },
  { key: 'obsidian_fang', x: -21, z: 13, yaw: 2.2, r: R_FANG },
  // R4 Pentagram Rotunda: the sigil, ringed by five flames.
  { key: 'pentagram', x: ROTUNDA.x, z: ROTUNDA.z, yaw: 0, scale: 6.5 },
  { key: 'obsidian_fang', x: -33, z: 25, yaw: 1.1, r: R_FANG },
  { key: 'obsidian_fang', x: -21, z: 45, yaw: 2.7, r: R_FANG },
  // R5 Bone Chamber
  brazier(-32, 52),
  brazier(-22, 52),
  brazier(-32, 70),
  brazier(-22, 70),
  { key: 'bone_pile', x: -32, z: 60, yaw: 0.3, r: R_BONES },
  { key: 'bone_pile', x: -22, z: 64, yaw: 1.9, r: R_BONES },
  { key: 'bone_pile', x: -27, z: 68, yaw: 3.0, r: R_BONES },
  // R6 Great Temple: the long nave, the idol looming over the dais.
  brazier(-14, 34),
  brazier(14, 34),
  brazier(-14, 50),
  brazier(14, 50),
  brazier(-14, 68),
  brazier(14, 68),
  brazier(-14, 82),
  brazier(14, 82),
  { key: 'rug', x: 0, z: 48, yaw: 0, scale: 1 },
  { key: 'rug', x: 0, z: 73, yaw: 0, scale: 1 },
  // The idol looks SOUTH down the nave (yaw PI): a party climbing to the dais walks
  // into its gaze, not its back.
  { key: 'demon_idol', x: 0, z: 93.5, yaw: Math.PI, r: R_IDOL },
  { key: 'obsidian_fang', x: -13, z: 58, yaw: 0.5, r: R_FANG },
  { key: 'obsidian_fang', x: 13, z: 74, yaw: 2.4, r: R_FANG },
  // R7 Hell Forge
  brazier(22, 50),
  brazier(32, 50),
  brazier(22, 74),
  brazier(32, 74),
  { key: 'hell_forge', x: 30, z: 67, yaw: Math.PI, r: R_FORGE },
  { key: 'bone_pile', x: 22, z: 66, yaw: 1.2, r: R_BONES },
];

/** Trash placements: (templateId, x, z). Kept inside their rooms and off every
 * decor collider (pinned by tests/rift_infernal.test.ts). */
const TRASH_PLAN: ReadonlyArray<readonly [string, number, number]> = [
  // R1 Sacrificial Hall
  ['rift_hellguard', -10, -5],
  ['rift_hellguard', 8, -4],
  ['rift_pact_acolyte', -7, 8],
  ['rift_hellguard', 9, 9],
  ['rift_pact_acolyte', -10, 18],
  ['rift_hellguard', 10, 18],
  // R2 Relic Gallery
  ['rift_hellguard', 27, -2],
  ['rift_pact_acolyte', 27, 7],
  ['rift_hellguard', 28, 15],
  // R3 West Gallery
  ['rift_hellguard', -27, 0],
  ['rift_pact_acolyte', -29, 7],
  ['rift_hellguard', -25, 16],
  // R4 Pentagram Rotunda: the ritualist's two attendants
  ['rift_pact_acolyte', -32, 35],
  ['rift_pact_acolyte', -22, 35],
  // R5 Bone Chamber
  ['rift_pact_acolyte', -30, 57],
  ['rift_pact_acolyte', -24, 64],
  // R6 Great Temple
  ['rift_pact_acolyte', -10, 36],
  ['rift_pact_acolyte', 10, 36],
  ['rift_hellguard', 0, 47],
  ['rift_hellguard', -7, 65],
  ['rift_hellguard', 7, 65],
  // R7 Hell Forge
  ['rift_hellguard', 24, 55],
  ['rift_hellguard', 31, 58],
];

/** The lava band flooding the middle of the west gallery: jump it, skirt it, or
 * take the burn. Same damage model as the procedural floors' molten bands. */
const INFERNAL_HAZARDS: readonly DelveHazardZone[] = [
  { x: -27, z: 11, r: 6.2, rx: 6.2, rz: 3.5, tier: 'shallow' },
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
    zMin: -34,
    zMax: 96,
    sideWallZ: 31,
    sideWallHd: 65,
    pillars: [],
    tombs: [],
    stubs: [],
    dais: { ...DAIS },
    wallX: 36,
    endWallHw: 37,
    floorHalfX: 36,
    doorZ: -32,
    rooms: INFERNAL_ROOMS.map((r) => ({ ...r })),
    doors: INFERNAL_DOORS.map((d) => ({ ...d })),
    decor: INFERNAL_DECOR.map((d) => ({ ...d })),
    // The relic gallery's alcove hides behind a wall panel that renders solid but
    // carries no collider (layoutColliders never emits illusion walls), so pushing
    // into the "dead end" reveals the cache behind it.
    illusionWalls: [{ x: 31, z: 16, hw: 0.6, hd: 3.2 }],
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
    { kind: 'treasure', x: 34, z: 16, name: 'Hidden Cache' },
    { kind: 'treasure', x: 23, z: 71, name: 'Forge Cache' },
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
    entry: { x: 0, z: -24 },
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
