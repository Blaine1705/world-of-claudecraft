// The Mirefen tavern: the walk-in, two-storey inn on the Fenbridge road in Mirefen Marsh,
// north of the Gravecaller ground and east of the fen trolls. Data-as-code; the floor
// surface is ../mirefen_tavern_floor.ts, the colliders, rest area and keeper spawn are
// ../mirefen_tavern.ts, and the one Blender model (scripts/assets/mirefen_tavern/) reads
// THESE numbers through its layout.json, so what the player walks is what the model draws.
//
// Frame: everything below is in the tavern's LOCAL yards, origin at TAVERN_ORIGIN on the
// ground floor (TAVERN_FLOOR_Y), +z out of the front door, +x to the right of a player
// walking in, heights over the ground floor. The door faces the road (world +x), so a
// local point (lx, lz) stands at world (TAVERN_ORIGIN.x + lz, TAVERN_ORIGIN.z - lx):
// tavernToWorld below is the one conversion.
//
// The plan, an L with a round tower in its inner corner:
//  - the common room (the hall), 30.4 wide and 26.4 deep inside: the front door in the
//    middle of its gable, a round hearth one step down in the middle of the floor, table
//    nooks under low beams down both sides, the bar on a raised platform in the back
//    right corner wrapped around a stone pillar, and over the bar's barrel wall a railed
//    gallery that overlooks the fire;
//  - the round stair tower behind the hall's back wall, open to the room through a wide
//    arch: a stone spiral climbing three quarters of a turn round a central newel to a
//    landing at the upper floor;
//  - the wing behind the hall's right half: the upper floor (a landing and two guest
//    rooms), reached from the tower's landing and from the gallery. Its ground storey
//    is the cellar and kitchen, closed.
// Every upper floor stands over solid ground in the floor surface (the gallery over the
// barrel wall, the wing over its cellar, the landing over the stair's head), so the
// floor is one height per point and nothing walks under anything.
//
// Scale: the player stands 2.6 yd to the crown on a 0.5 yd body radius. The door clears
// 4.6 by 5.2, the side walls stand 10 to the eaves under a ridge at 20, the nook beams
// hang at 5.5, the stair is 4.2 wide, table tops stand at 1.45 and seats at 0.85.

import type { NpcDef } from '../types';

/** Where the tavern stands: the world point under its local origin (the hall's middle). */
export const TAVERN_ORIGIN = { x: -17, z: 408 } as const;
/** The ground floor's absolute height: 0.4 over the highest ground under the footprint. */
export const TAVERN_FLOOR_Y = 0.5;
/** The upper floor (the gallery, the tower landing and the wing), over the ground floor. */
export const TAVERN_UPPER = 6.0;

/** Local (lx, lz) to world (x, z): the door faces world +x. */
export function tavernToWorld(lx: number, lz: number): { x: number; z: number } {
  return { x: TAVERN_ORIGIN.x + lz, z: TAVERN_ORIGIN.z - lx };
}
/** The model's yaw (three.js rotation.y) that turns local +z onto world +x. */
export const TAVERN_YAW = Math.PI / 2;

/** The common room's outer wall faces, wall thickness and heights. */
export const TAVERN_HALL = {
  x0: -16,
  x1: 16,
  z0: -14,
  z1: 14,
  wall: 0.8,
  /** The wall plate along both side walls (the eaves' line). */
  eave: 10.0,
  /** The ridge over the middle, running front to back (the front is a gable). */
  ridge: 20.0,
  /** The nave's tie beams, the high centre's ceiling line. */
  tie: 11.0,
  /** The side aisles: the low beams over the table nooks, and the posts carrying them. */
  aisleBeam: 5.5,
  aisleX: 9.2,
  /** The roof overhangs the side walls at the eaves and the gables at the verges. */
  eaveOut: 1.0,
  vergeOut: 0.8,
} as const;

/** The front doorway in the middle of the front gable. */
export const TAVERN_DOOR = { x: 0, width: 4.6, height: 5.2 } as const;

/** The stone porch before the door and the steps down from it to the road. */
export const TAVERN_PORCH = {
  x0: -4,
  x1: 4,
  z0: 14,
  z1: 16.4,
  /** The steps fall this much per yard toward the road until they meet the ground. */
  stepSlope: 0.5,
  stepHalfWidth: 3.6,
  /** The low parapets along the porch's two sides (their tops over the floor). */
  parapet: 1.0,
} as const;

/** How far the porch steps may run before they are certainly under the ground. */
export const TAVERN_STEPS_MAX_RUN = 8;

/** The wing behind the hall's right half: the upper floor over the cellar. */
export const TAVERN_WING = {
  x0: 4,
  x1: 16,
  z0: -28,
  z1: -14,
  wall: 0.8,
  eave: 9.4,
  /** The wing's ridge runs front to back over its middle, under the hall's back gable. */
  ridge: 13.3,
  eaveOut: 0.9,
  vergeOut: 0.6,
} as const;

/** The round stair tower in the L's inner corner. */
export const TAVERN_TOWER = {
  x: -1.5,
  z: -18,
  rIn: 6.0,
  rOut: 6.8,
  /** The central newel column the stair winds round. */
  newel: 1.8,
  wallTop: 11.2,
  /** The slate cone's point, over the hall's ridge: the tower's hat reads from the road. */
  peak: 22.0,
  eaveOut: 0.8,
} as const;

const DEG = Math.PI / 180;
/** The spiral, as angles round the tower (atan2(dx, dz): 0 toward the hall, +90 toward
 *  the wing). It leaves the ground landing at `bottom` and climbs clockwise seen from
 *  above (toward -90, then round the back) to the upper floor at `top`, then runs on
 *  level to `landingEnd`, where the landing stops at a railed drop over the ground
 *  landing. The ground landing is the rest of the circle, open to the hall. */
export const TAVERN_STAIR = {
  bottom: -48 * DEG,
  /** Unwrapped climb from the bottom to the top (the flight), and on to the landing end. */
  climb: 222 * DEG,
  landing: 262 * DEG,
} as const;

/** The arch in the hall's back wall that opens the room onto the stair tower. */
export const TAVERN_ARCH = { x0: -5.5, x1: 2.4, height: 5.4 } as const;

/** The upper-floor passage from the tower's landing through the tower and wing walls. */
export const TAVERN_TOWER_DOOR = { x0: 2.5, x1: 5.2, z0: -17.6, z1: -14.9, height: 3.6 } as const;

/** The gallery over the bar's barrel wall, its rail, and its door into the wing. */
export const TAVERN_GALLERY = {
  x0: 2.4,
  x1: 15.2,
  z0: -13.2,
  z1: -10.0,
  /** The rail's top over the gallery floor. */
  rail: 1.2,
} as const;
export const TAVERN_GALLERY_DOOR = { x0: 7.0, x1: 10.0, height: 4.2 } as const;

/** The hearth pit: one step down round the round hearth, a ramped edge to walk it. */
export const TAVERN_PIT = { x: 0, z: 2.4, r: 5.4, rim: 5.85, depth: 0.45 } as const;

/** The bar's raised platform (the barkeep's aisle and the drinkers' side), its ramped
 *  front and left edges. It runs back to the barrel wall under the gallery. */
export const TAVERN_BAR_PLATFORM = {
  x0: 2.4,
  x1: 15.2,
  z0: -10.0,
  z1: -4.2,
  lift: 0.5,
  rim: 0.5,
} as const;

/** The wing's upper-floor rooms: two guest rooms at the back behind a partition with a
 *  doorway each, the landing before them. Partition boxes as [x0, x1, z0, z1]. */
export const TAVERN_ROOM_WALLS: readonly (readonly [number, number, number, number])[] = [
  [4.8, 6.2, -20.8, -20.4],
  [8.4, 11.6, -20.8, -20.4],
  [13.8, 15.2, -20.8, -20.4],
  [9.8, 10.2, -27.2, -20.8],
];
/** The rooms' doorways' clear height over the upper floor. */
export const TAVERN_ROOM_DOOR_HEIGHT = 4.0;

/** A solid thing in the tavern: what the sim collides with and the model draws there.
 *  `level` is the floor it stands on: the ground floor, the bar platform, the hearth pit
 *  or the upper floor; heights are over that floor. */
export type TavernPropKind =
  | 'hearth'
  | 'bench'
  | 'table'
  | 'roundTable'
  | 'chair'
  | 'stool'
  | 'counter'
  | 'pillar'
  | 'post'
  | 'settle'
  | 'fireplace'
  | 'bed'
  | 'chest'
  | 'newel';
export type TavernLevel = 'ground' | 'pit' | 'platform' | 'upper';

export interface TavernProp {
  kind: TavernPropKind;
  x: number;
  z: number;
  /** Yaw in the local frame (three.js rotation.y convention). */
  rot: number;
  r?: number;
  hw?: number;
  hd?: number;
  height: number;
  level: TavernLevel;
  /** Furniture can be stood on (the harbor house idiom); the hearth, the fireplace and the
   *  structure (pillar, posts, newel) block at full height. */
  standable?: boolean;
}

function benchRing(): TavernProp[] {
  // five curved benches round the fire, the gaps facing the door and the four quarters
  const out: TavernProp[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (36 + 72 * i) * DEG;
    out.push({
      kind: 'bench',
      x: TAVERN_PIT.x + Math.sin(a) * 3.9,
      z: TAVERN_PIT.z + Math.cos(a) * 3.9,
      // the bench's long side runs across the radius
      rot: a,
      hw: 1.4,
      hd: 0.375,
      height: 0.85,
      level: 'pit',
      standable: true,
    });
  }
  return out;
}

export const TAVERN_PROPS: readonly TavernProp[] = [
  // the round hearth in the pit: a knee-high stone ring a spell sees over
  { kind: 'hearth', x: TAVERN_PIT.x, z: TAVERN_PIT.z, rot: 0, r: 1.7, height: 1.0, level: 'pit' },
  ...benchRing(),
  // the aisle posts carrying the nook beams (the right side's rearmost is the bar pillar)
  { kind: 'post', x: -9.2, z: -8, rot: 0, r: 0.4, height: TAVERN_HALL.tie, level: 'ground' },
  { kind: 'post', x: -9.2, z: 0, rot: 0, r: 0.4, height: TAVERN_HALL.tie, level: 'ground' },
  { kind: 'post', x: -9.2, z: 8, rot: 0, r: 0.4, height: TAVERN_HALL.tie, level: 'ground' },
  { kind: 'post', x: 9.2, z: 0, rot: 0, r: 0.4, height: TAVERN_HALL.tie, level: 'ground' },
  { kind: 'post', x: 9.2, z: 8, rot: 0, r: 0.4, height: TAVERN_HALL.tie, level: 'ground' },
  // the left nooks: the dice table by the door, the long table, the bard's stool
  {
    kind: 'roundTable',
    x: -12.2,
    z: 9.0,
    rot: 0,
    r: 1.2,
    height: 1.45,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'stool',
    x: -12.2,
    z: 11.1,
    rot: 0,
    r: 0.42,
    height: 0.9,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'stool',
    x: -10.3,
    z: 8.0,
    rot: 0,
    r: 0.42,
    height: 0.9,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'stool',
    x: -14.1,
    z: 8.0,
    rot: 0,
    r: 0.42,
    height: 0.9,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'table',
    x: -12.4,
    z: 1.0,
    rot: 0,
    hw: 0.75,
    hd: 2.2,
    height: 1.45,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'bench',
    x: -14.2,
    z: 1.0,
    rot: 0,
    hw: 0.35,
    hd: 2.0,
    height: 0.85,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'bench',
    x: -10.6,
    z: 1.0,
    rot: 0,
    hw: 0.35,
    hd: 2.0,
    height: 0.85,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'stool',
    x: -12.6,
    z: -9.6,
    rot: 0,
    r: 0.42,
    height: 0.9,
    level: 'ground',
    standable: true,
  },
  // the right nooks: the square table by the door, the wall fireplace and its settle
  {
    kind: 'table',
    x: 12.2,
    z: 9.0,
    rot: 0,
    hw: 1.1,
    hd: 1.1,
    height: 1.45,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'chair',
    x: 12.2,
    z: 11.2,
    rot: Math.PI,
    r: 0.45,
    height: 0.9,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'chair',
    x: 12.2,
    z: 6.8,
    rot: 0,
    r: 0.45,
    height: 0.9,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'chair',
    x: 10.0,
    z: 9.0,
    rot: Math.PI / 2,
    r: 0.45,
    height: 0.9,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'chair',
    x: 14.4,
    z: 9.0,
    rot: -Math.PI / 2,
    r: 0.45,
    height: 0.9,
    level: 'ground',
    standable: true,
  },
  {
    kind: 'fireplace',
    x: 14.6,
    z: 2.5,
    rot: 0,
    hw: 0.6,
    hd: 1.9,
    height: TAVERN_HALL.eave,
    level: 'ground',
  },
  {
    kind: 'settle',
    x: 11.4,
    z: 2.5,
    rot: Math.PI / 2,
    hw: 1.6,
    hd: 0.45,
    height: 0.85,
    level: 'ground',
    standable: true,
  },
  // the post on the gallery's edge carrying the right arcade plate over the bar
  {
    kind: 'post',
    x: 9.2,
    z: -10.35,
    rot: 0,
    r: 0.3,
    height: TAVERN_HALL.tie - TAVERN_UPPER,
    level: 'upper',
  },
  // the bar: the stone pillar at the elbow, the long counter and the short one behind the
  // pillar, and the stools before it
  { kind: 'pillar', x: 4.3, z: -7.6, rot: 0, r: 1.1, height: TAVERN_HALL.tie, level: 'platform' },
  {
    kind: 'counter',
    x: 9.1,
    z: -6.9,
    rot: 0,
    hw: 3.7,
    hd: 0.5,
    height: 1.65,
    level: 'platform',
    standable: true,
  },
  {
    kind: 'counter',
    x: 4.3,
    z: -9.35,
    rot: 0,
    hw: 0.5,
    hd: 0.65,
    height: 1.65,
    level: 'platform',
    standable: true,
  },
  {
    kind: 'stool',
    x: 6.4,
    z: -5.5,
    rot: 0,
    r: 0.4,
    height: 1.0,
    level: 'platform',
    standable: true,
  },
  {
    kind: 'stool',
    x: 8.3,
    z: -5.5,
    rot: 0,
    r: 0.4,
    height: 1.0,
    level: 'platform',
    standable: true,
  },
  {
    kind: 'stool',
    x: 10.2,
    z: -5.5,
    rot: 0,
    r: 0.4,
    height: 1.0,
    level: 'platform',
    standable: true,
  },
  {
    kind: 'stool',
    x: 12.1,
    z: -5.5,
    rot: 0,
    r: 0.4,
    height: 1.0,
    level: 'platform',
    standable: true,
  },
  // the tower's newel column
  {
    kind: 'newel',
    x: TAVERN_TOWER.x,
    z: TAVERN_TOWER.z,
    rot: 0,
    r: TAVERN_TOWER.newel,
    height: TAVERN_TOWER.wallTop,
    level: 'ground',
  },
  // upstairs: a bench on the gallery, a chest on the landing, a bed and a chest a room
  {
    kind: 'bench',
    x: 12.8,
    z: -12.75,
    rot: 0,
    hw: 1.4,
    hd: 0.35,
    height: 0.85,
    level: 'upper',
    standable: true,
  },
  {
    kind: 'chest',
    x: 14.3,
    z: -15.0,
    rot: 0,
    hw: 0.7,
    hd: 0.4,
    height: 0.9,
    level: 'upper',
    standable: true,
  },
  {
    kind: 'bed',
    x: 7.3,
    z: -25.3,
    rot: 0,
    hw: 1.2,
    hd: 1.75,
    height: 1.05,
    level: 'upper',
    standable: true,
  },
  {
    kind: 'chest',
    x: 5.7,
    z: -21.7,
    rot: 0,
    hw: 0.7,
    hd: 0.4,
    height: 0.9,
    level: 'upper',
    standable: true,
  },
  {
    kind: 'bed',
    x: 12.7,
    z: -25.3,
    rot: 0,
    hw: 1.2,
    hd: 1.75,
    height: 1.05,
    level: 'upper',
    standable: true,
  },
  {
    kind: 'chest',
    x: 14.3,
    z: -21.7,
    rot: 0,
    hw: 0.7,
    hd: 0.4,
    height: 0.9,
    level: 'upper',
    standable: true,
  },
];

/** The warm lights: the lanterns hung on chains over the tables and the bar, and the wheel
 *  chandelier over the entry. (x, z, and the lantern's height over the floor under it.)
 *  The lit ones also light the room (render/mirefen_tavern.ts); the hearth, the wall
 *  fireplace and the bar candles light it too. */
export const TAVERN_LANTERNS: readonly { x: number; z: number; y: number; lit: boolean }[] = [
  { x: -12.3, z: 1.0, y: 4.3, lit: true },
  { x: -12.2, z: 9.0, y: 4.3, lit: false },
  { x: 12.2, z: 9.0, y: 4.3, lit: true },
  { x: 7.0, z: -6.9, y: 4.6, lit: true },
  { x: 11.2, z: -6.9, y: 4.6, lit: false },
];
export const TAVERN_CHANDELIER = { x: 0, z: 9.6, y: 7.6, r: 2.1 } as const;
/** The copper hood over the round hearth: its rim's height and radius, its flue's top. */
export const TAVERN_HOOD = { rimY: 5.0, rimR: 2.6, topY: 7.2, topR: 0.7, flueTop: 21.8 } as const;

/** The rest area: the whole inside, ground floor and upper floor alike. A body counts as
 *  resting when its feet stand no further under the ground floor than this. */
export const TAVERN_REST_SINK = 0.6;

/** The innkeeper's reserved entity id (the singleton NPCs' 1_000_000_x namespace, types.ts
 *  STATIC_WORLD_SERVICE_ENTITY_ID_MIN's note; 000 to 006 and 010 to 014 are taken): she is
 *  spawned under it, outside the sequential allocator, so no other entity's id moves. */
export const TAVERN_KEEPER_ENTITY_ID = 1_000_000_020;
/** Where the innkeeper stands (local): behind the long counter, turned to the room. */
export const TAVERN_KEEPER_LOCAL = { x: 9.0, z: -8.8 } as const;
const KEEPER_WORLD = tavernToWorld(TAVERN_KEEPER_LOCAL.x, TAVERN_KEEPER_LOCAL.z);

/** The innkeeper: gossip only (no quests, no stock). `dynamic`, so the world-init NPC loop
 *  skips her; ../mirefen_tavern.ts spawns her under her reserved id. She faces local +z
 *  (the room and the door), which is world +x. */
export const MIREFEN_TAVERN_NPCS: Record<string, NpcDef> = {
  innkeeper_maudie: {
    id: 'innkeeper_maudie',
    name: 'Maudie Tapwright',
    title: 'Innkeeper',
    pos: { x: KEEPER_WORLD.x, z: KEEPER_WORLD.z },
    facing: TAVERN_YAW,
    color: 0x8a2a2a,
    questIds: [],
    dynamic: true,
    greeting:
      'Come in out of the damp, friend, and mind the step down to the fire. The kettle is on, the benches are warm, and the rooms upstairs are dry. Travelers from Fenbridge swear the marsh road is quiet by day, but nobody walks it after dark. Sit a while and rest your feet.',
  },
};
export const TAVERN_KEEPER_NPC_ID = 'innkeeper_maudie';
