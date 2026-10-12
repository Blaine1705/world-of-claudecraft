// The Jaguar Maw: the world entrance of the Wildheart Basin (door (-232, 1112),
// the Palmreach). The Sunken Idol opened: a round head of cyclopean limestone
// carved as a roaring jaguar, sunk where the knoll drops into the Sapphire
// Lagoon, leaning west and forward over the stair that comes down the knoll to
// it. The door is its open maw: the muzzle's two halves are the door's jambs,
// the lower teeth edge the walk-in lane and black water stands in the throat
// behind. Two troll fire bowls flank the stair, the Sunbone's two great tusks
// stand at its head, and the idol's east ear lies where it fell on the knoll.
// The models are three Blender GLBs drawn by
// src/render/wildheart_basin_entrance.ts; THIS module is the one source of
// truth for what collides, shared by the sim (dungeon_door_jambs.ts hands
// these in place of the generic jambs) and the tests.
//
// Local coordinates are door-relative: lx = x - door.x (+x is WEST), lz =
// z - door.z (+z is NORTH), and every height is above terrainHeight at the
// door, the one height the GLBs are seated at. The authoring tool, its terrain
// probe and its review renders are docs/design/dungeon-rework/entrance/.

import type { Collider } from './colliders';
import { terrainHeight } from './world';

export const WILDHEART_BASIN_ENTRANCE_DUNGEON_ID = 'wildheart_basin';

/** Half width of the open walk-in lane between the lower teeth: inside
 *  DOOR_TRIGGER_RADIUS (2), so nobody crosses the door untriggered. */
export const WILDHEART_BASIN_ENTRANCE_LANE_HALF_WIDTH = 1.35;

/** The Palmreach palms the idol stands on (decoration_exclusions.ts drops
 *  them; reachPalmSpots honours it): one that grew in the walk-in lane, under
 *  the upper fangs, and one against the east cheek whose crown stood in the
 *  stone. */
export const WILDHEART_BASIN_ENTRANCE_CLEARED_SCATTER = [
  { x: -230.27577486773953, z: 1110.0866696499288 },
  { x: -243.16279729665257, z: 1118.9681632742286 },
] as const;

export interface WildheartEntranceColliderRow {
  readonly name: string;
  readonly type: 'obb' | 'circle';
  readonly lx: number;
  readonly lz: number;
  readonly hw?: number;
  readonly hd?: number;
  readonly rot?: number;
  readonly r?: number;
  /** Visual top above the door's terrain height (camera sight checks). */
  readonly top: number;
}

/**
 * Every solid piece of the set piece, measured from the Blender build
 * (stats.json of build_wildheart_entrance.py): the idol's round head (it
 * closes the lane behind the door: the walk-in trigger takes a body first),
 * the muzzle's two halves either side of the lane (a box along each chord of
 * its curved front), the two fire bowls, the two tusks and the heap of the
 * fallen ear. The stair's blocks, the blocks in the shallows, the fig's roots
 * and all the growth are walk-over dressing.
 */
export const WILDHEART_BASIN_ENTRANCE_COLLIDERS: readonly WildheartEntranceColliderRow[] = [
  { name: 'head', type: 'circle', lx: 0.0, lz: 8.8, r: 8.05, top: 15.8 },
  {
    name: 'muzzle_w',
    type: 'obb',
    lx: 3.74,
    lz: 0.968,
    hw: 2.83,
    hd: 1.45,
    rot: -0.4455,
    top: 8.4,
  },
  {
    name: 'muzzle_e',
    type: 'obb',
    lx: -3.74,
    lz: 0.968,
    hw: 2.83,
    hd: 1.45,
    rot: -2.6961,
    top: 8.4,
  },
  { name: 'brazier_w', type: 'circle', lx: 3.6, lz: -3.6, r: 0.78, top: 2.62 },
  { name: 'brazier_e', type: 'circle', lx: -3.6, lz: -3.6, r: 0.78, top: 7.11 },
  { name: 'tusk_w', type: 'circle', lx: 5.4, lz: -6.9, r: 0.55, top: 8.33 },
  { name: 'tusk_e', type: 'circle', lx: -5.2, lz: -7.5, r: 0.55, top: 11.43 },
  { name: 'fallen_ear', type: 'circle', lx: -7.6, lz: -3.6, r: 1.7, top: 6.58 },
];

export interface WildheartEntranceFooting {
  readonly name: string;
  readonly lx: number;
  readonly lz: number;
  readonly hw: number;
  readonly hd: number;
  readonly rot: number;
  /** The footing's underside above the door's terrain height. */
  readonly bottom: number;
}

/**
 * The GLBs' terrain contract: every footing's underside, modelled against
 * the sim's own terrain sampled every half yard. The knoll is steep (the
 * ground climbs four and a half yards from the west fire bowl to the east
 * one), so each footing is cut a fixed depth under the LOWEST ground at its
 * centre and four corners: it never floats at any of them;
 * tests/wildheart_basin_entrance.test.ts pins it against groundHeight. The
 * head 0.8 under the lowest corner of the square round its drum, the muzzle
 * 0.6, the fire bowls 0.5, the tusks 1.3 under their own foot; the fallen
 * ear's stones lie sunk in the turf.
 */
export const WILDHEART_BASIN_ENTRANCE_FOOTINGS: readonly WildheartEntranceFooting[] = [
  { name: 'head', lx: 0.0, lz: 8.8, hw: 7.8, hd: 7.8, rot: 0.0, bottom: -2.572 },
  { name: 'muzzle', lx: 0.0, lz: -0.1, hw: 5.6, hd: 1.5, rot: 0.0, bottom: -1.511 },
  { name: 'brazier_w', lx: 3.6, lz: -3.6, hw: 0.6, hd: 0.6, rot: 0.0, bottom: -0.455 },
  { name: 'brazier_e', lx: -3.6, lz: -3.6, hw: 0.6, hd: 0.6, rot: 0.0, bottom: 3.957 },
  { name: 'tusk_w', lx: 5.4, lz: -6.9, hw: 0.45, hd: 0.45, rot: 0.0, bottom: 0.63 },
  { name: 'tusk_e', lx: -5.2, lz: -7.5, hw: 0.45, hd: 0.45, rot: 0.0, bottom: 4.531 },
  { name: 'fallen_ear', lx: -7.6, lz: -3.6, hw: 0.6, hd: 0.6, rot: 0.0, bottom: 5.231 },
];

/** World colliders for the set piece at a door, seated on the door's terrain height. */
export function wildheartBasinEntranceColliders(
  seed: number,
  door: { readonly x: number; readonly z: number },
): Collider[] {
  const base = terrainHeight(door.x, door.z, seed);
  const out: Collider[] = [];
  for (const row of WILDHEART_BASIN_ENTRANCE_COLLIDERS) {
    const x = door.x + row.lx;
    const z = door.z + row.lz;
    if (row.type === 'obb') {
      out.push({
        type: 'obb',
        x,
        z,
        hw: row.hw ?? 0,
        hd: row.hd ?? 0,
        rot: row.rot ?? 0,
        cameraTopY: base + row.top,
      });
    } else {
      out.push({ type: 'circle', x, z, r: row.r ?? 0, cameraTopY: base + row.top });
    }
  }
  return out;
}
