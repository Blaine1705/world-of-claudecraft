// The Mirefen tavern's interior for the indoor chase camera (interior_camera_core.ts): the
// air of every room as boxes in the tavern's local frame (content/mirefen_tavern.ts), each
// against the inner wall faces, the floors and the ceilings the model draws, joined by the
// doorways and the arch between them, and turned into the world. Three-, DOM- and i18n-free.
//
//  - the common room: its floor (a hand under it, for the hearth pit) to under the roof's
//    rafters, the nave up to its tie beams; the barrel wall under the gallery is solid, so
//    the ground floor's air steps round it and the gallery's air starts at its deck; the wall
//    fireplace's breast is solid to the eaves, so no box reaches into it;
//  - the front doorway (its outside face is the tavern's one opening onto the world: the
//    plates of the road show through it), the arch onto the stair tower (its segmental head
//    as two boxes), the gallery's door into the wing and the tower's passage onto the landing;
//  - the stair tower: its round shaft, exact (a box rounded by the ring's inner face), behind
//    the hall's back wall (the newel stands in it: the shell cuts it for the sight line);
//  - upstairs in the wing: the landing and the two guest rooms behind their partition, each
//    joined through its doorway.
//
// Every doorway box runs a yard and more into the rooms either side, so the union stays
// joined when the camera shrinks each box by its near-plane pad.

import {
  TAVERN_ARCH,
  TAVERN_DOOR,
  TAVERN_FLOOR_Y,
  TAVERN_GALLERY,
  TAVERN_GALLERY_DOOR,
  TAVERN_HALL,
  TAVERN_ORIGIN,
  TAVERN_PROPS,
  TAVERN_ROOM_DOOR_HEIGHT,
  TAVERN_ROOM_WALLS,
  TAVERN_TOWER,
  TAVERN_TOWER_DOOR,
  TAVERN_UPPER,
  TAVERN_WING,
  tavernToWorld,
} from '../sim/content/mirefen_tavern';
import {
  type CameraInterior,
  cameraInterior,
  type InteriorBox,
  type InteriorOpening,
  type InteriorRound,
} from './interior_camera_core';

const H = TAVERN_HALL;
const W = TAVERN_WING;
const T = TAVERN_TOWER;
const G = TAVERN_GALLERY;
const UP = TAVERN_UPPER;

/** Under the rafters at the side walls (the roof's underside there, less a hand). */
export const TAVERN_HALL_AIR_TOP = 9.4;
/** Under the nave's tie beams. */
export const TAVERN_NAVE_AIR_TOP = H.tie - 0.4;
/** The nave's half width (the tie beams' span over the posts). */
const NAVE_X = H.aisleX + 0.4;
/** Under the wing's tie beams at its eaves. */
export const TAVERN_WING_AIR_TOP = W.eave - 0.4;
/** Under the tower's wall plate. */
export const TAVERN_TOWER_AIR_TOP = T.wallTop - 0.2;
/** A hand under the ground floor (the hearth pit's floor is 0.45 down). */
const FLOOR_AIR = -0.6;
/** How far each doorway's air runs into the rooms either side. */
const REACH = 1.6;

const ix0 = H.x0 + H.wall;
const ix1 = H.x1 - H.wall;
const iz0 = H.z0 + H.wall;
const iz1 = H.z1 - H.wall;
const fire = TAVERN_PROPS.find((p) => p.kind === 'fireplace');
const fireX0 = (fire?.x ?? ix1) - (fire?.hw ?? 0) - 0.1;
const fireZ0 = (fire?.z ?? 0) - (fire?.hd ?? 0) - 0.1;
const fireZ1 = (fire?.z ?? 0) + (fire?.hd ?? 0) + 0.1;

// the arch's segmental head (tavern_shell.py hall_back): springing at 3.9, crowned at its
// height; the second box is the head's chord half a yard under the crown
const ARCH_SPRING = 3.9;
const archMid = (TAVERN_ARCH.x0 + TAVERN_ARCH.x1) / 2;
const archHalf = (TAVERN_ARCH.x1 - TAVERN_ARCH.x0) / 2;
const archRise = TAVERN_ARCH.height - ARCH_SPRING;
const archR = (archHalf * archHalf + archRise * archRise) / (2 * archRise);
const archCrownY = TAVERN_ARCH.height - 0.5;
const archCrownHalf = Math.sqrt(
  Math.max(0, archR * archR - (archCrownY - (TAVERN_ARCH.height - archR)) ** 2),
);

// the tower's shaft: the ring's inner face (its chords sit a hand inside the circle), cut
// off by the hall's back wall
const TOWER_AIR_R = T.rIn - 0.05;

// the wing's rooms: the landing before the long partition, the two rooms behind it
const partition = TAVERN_ROOM_WALLS[0];
const ridgeWall = TAVERN_ROOM_WALLS[3];
const wx0 = W.x0 + W.wall;
const wx1 = W.x1 - W.wall;
const wz0 = W.z0 + W.wall;

/** The tavern's air in its local frame: [x0, x1, y0, y1, z0, z1]. */
export const TAVERN_INTERIOR_LOCAL: readonly InteriorBox[] = [
  // 0: the common room west of the gallery's barrel wall, floor to rafters
  [ix0, G.x0, FLOOR_AIR, TAVERN_HALL_AIR_TOP, iz0, iz1],
  // 1: the whole width in front of the barrel wall, clear of the wall fireplace's breast
  [ix0, fireX0, FLOOR_AIR, TAVERN_HALL_AIR_TOP, G.z1, iz1],
  // 2, 3: the whole width again, back and front of the breast
  [ix0, ix1, FLOOR_AIR, TAVERN_HALL_AIR_TOP, G.z1, fireZ0],
  [ix0, ix1, FLOOR_AIR, TAVERN_HALL_AIR_TOP, fireZ1, iz1],
  // 4: over the gallery's deck to the rafters, reaching out over the room before it
  [ix0, ix1, UP, TAVERN_HALL_AIR_TOP, iz0, G.z1 + REACH],
  // 5: the nave's height between its posts, from the gallery's deck up to its tie beams
  [-NAVE_X, NAVE_X, UP, TAVERN_NAVE_AIR_TOP, iz0, iz1],
  // 6: the front doorway, out to the wall's outside face (the opening onto the road)
  [
    TAVERN_DOOR.x - TAVERN_DOOR.width / 2,
    TAVERN_DOOR.x + TAVERN_DOOR.width / 2,
    FLOOR_AIR,
    TAVERN_DOOR.height,
    iz1 - REACH,
    H.z1,
  ],
  // 7, 8: the arch onto the tower, under its springing and under its head
  [TAVERN_ARCH.x0, TAVERN_ARCH.x1, FLOOR_AIR, ARCH_SPRING, H.z0 - REACH, iz0 + REACH],
  [
    archMid - archCrownHalf,
    archMid + archCrownHalf,
    FLOOR_AIR,
    archCrownY,
    H.z0 - REACH,
    iz0 + REACH,
  ],
  // 9: the stair tower's shaft (rounded: TAVERN_TOWER_SHAFT)
  [
    T.x - T.rIn,
    T.x + T.rIn,
    FLOOR_AIR,
    TAVERN_TOWER_AIR_TOP,
    T.z - T.rIn,
    Math.min(T.z + T.rIn, H.z0),
  ],
  // 10: the tower's passage onto the wing's landing
  [
    TAVERN_TOWER_DOOR.x0 - REACH,
    TAVERN_TOWER_DOOR.x1 + REACH,
    UP,
    TAVERN_WING_AIR_TOP,
    TAVERN_TOWER_DOOR.z0,
    TAVERN_TOWER_DOOR.z1,
  ],
  // 11: the gallery's door through the back wall onto the landing
  [
    TAVERN_GALLERY_DOOR.x0,
    TAVERN_GALLERY_DOOR.x1,
    UP,
    Math.min(UP + TAVERN_GALLERY_DOOR.height, TAVERN_WING_AIR_TOP),
    H.z0 - REACH,
    iz0 + REACH,
  ],
  // 12: the wing's landing, before the long partition, clear of the tower's bulge into it
  [T.x + T.rOut + 0.1, wx1, UP, TAVERN_WING_AIR_TOP, partition[3], H.z0],
  // 13, 14: the guest rooms either side of the ridge partition
  [wx0, ridgeWall[0], UP, TAVERN_WING_AIR_TOP, wz0, partition[2]],
  [ridgeWall[1], wx1, UP, TAVERN_WING_AIR_TOP, wz0, partition[2]],
  // 15, 16: their doorways through the long partition
  [
    TAVERN_ROOM_WALLS[0][1],
    TAVERN_ROOM_WALLS[1][0],
    UP,
    UP + TAVERN_ROOM_DOOR_HEIGHT,
    partition[2] - REACH,
    partition[3] + REACH,
  ],
  [
    TAVERN_ROOM_WALLS[1][1],
    TAVERN_ROOM_WALLS[2][0],
    UP,
    UP + TAVERN_ROOM_DOOR_HEIGHT,
    partition[2] - REACH,
    partition[3] + REACH,
  ],
];

/** The front doorway's box and its outside face (local +z, out of the door). */
export const TAVERN_FRONT_DOOR_BOX = 6;
/** The tower shaft's box, rounded by the ring's inner face (local x, z, r). */
export const TAVERN_TOWER_SHAFT = { box: 9, x: T.x, z: T.z, r: TOWER_AIR_R } as const;

/** Local box to world: local z runs along world +x, local x along world -z. */
export function tavernBoxToWorld(b: InteriorBox): InteriorBox {
  const ox = TAVERN_ORIGIN.x;
  const oz = TAVERN_ORIGIN.z;
  const fy = TAVERN_FLOOR_Y;
  return [ox + b[4], ox + b[5], fy + b[2], fy + b[3], oz - b[1], oz - b[0]];
}

/** The tavern's interior, in the world, for the camera registry. */
export function mirefenTavernCameraInterior(): CameraInterior {
  // the door's outside face is local +z: world +x
  const openings: InteriorOpening[] = [{ box: TAVERN_FRONT_DOOR_BOX, axis: 0, side: 1 }];
  const shaft = TAVERN_TOWER_SHAFT;
  const centre = tavernToWorld(shaft.x, shaft.z);
  const rounds = new Map<number, InteriorRound>([[shaft.box, [centre.x, centre.z, shaft.r]]]);
  return cameraInterior(
    'mirefen_tavern',
    TAVERN_INTERIOR_LOCAL.map(tavernBoxToWorld),
    openings,
    rounds,
  );
}

/** Whether a player's eye at a local point is indoors (the shell's indoor test, the same
 *  rule the camera clamp holds the eye by: in the air, and not only in the front doorway). */
export function eyeInTavernAir(x: number, y: number, z: number): boolean {
  const shaft = TAVERN_TOWER_SHAFT;
  for (let i = 0; i < TAVERN_INTERIOR_LOCAL.length; i++) {
    if (i === TAVERN_FRONT_DOOR_BOX) continue;
    const b = TAVERN_INTERIOR_LOCAL[i];
    if (x < b[0] || x > b[1] || y < b[2] || y > b[3] || z < b[4] || z > b[5]) continue;
    if (i === shaft.box && Math.hypot(x - shaft.x, z - shaft.z) > shaft.r) continue;
    return true;
  }
  return false;
}
