// The Mirefen tavern (content/mirefen_tavern.ts): its colliders, its rest area and its
// innkeeper. The floor is mirefen_tavern_floor.ts (folded into groundHeight), so this
// module only adds what stands on it:
//  - the walls, minus the front doorway, the stair arch and the upper-floor doorways: full
//    height to movement (a jump never clears one), topped at the eaves for sight. The round
//    tower's wall is a ring of short boxes;
//  - the rails: along the gallery's edge and at the stair landing's drop, and the porch
//    parapets. A rail blocks a body whose feet are under its top and is never stood on;
//  - the barrel wall under the gallery as one standable box topped at the upper floor, so a
//    spell cast from the ground stops at it as at any wall while the gallery walks clear;
//  - the furniture (standable, the harbor house idiom) and the structure that stands in the
//    room (the hearth, the wall fireplace, the pillar, the posts and the newel: full height).
// Every sheer face in the floor surface also stops a body through the climb gate; the
// colliders make those faces hold for sight and put the body's edge, not its centre, at
// the drawn face.
//
// The rest area reuses the inn rule (progression/xp.ts isResting): standing anywhere inside,
// out of combat, accrues rested experience like any inn.
//
// Deterministic and rng-free. The colliders join the static grid with the other built
// structures (built_structure_colliders.ts, built-in world only); the innkeeper is spawned
// at world init under her reserved id (spawnTavernKeeper, through built_world_keepers.ts),
// so the sequential id stream every other entity takes is untouched.

import type { Collider } from './colliders';
import {
  TAVERN_ARCH,
  TAVERN_DOOR,
  TAVERN_FLOOR_Y,
  TAVERN_GALLERY,
  TAVERN_GALLERY_DOOR,
  TAVERN_HALL,
  TAVERN_KEEPER_ENTITY_ID,
  TAVERN_KEEPER_NPC_ID,
  TAVERN_ORIGIN,
  TAVERN_PIT,
  TAVERN_PORCH,
  TAVERN_PROPS,
  TAVERN_REST_SINK,
  TAVERN_ROOM_WALLS,
  TAVERN_STAIR,
  TAVERN_TOWER,
  TAVERN_TOWER_DOOR,
  TAVERN_UPPER,
  TAVERN_WING,
  TAVERN_YAW,
  type TavernLevel,
  type TavernProp,
  tavernToWorld,
} from './content/mirefen_tavern';
import { createNpc } from './entity';
import type { SimContext } from './sim_context';
import type { WorldContent } from './types';

const DEG = Math.PI / 180;

/** A wall or rail box in the local frame: [x0, x1, z0, z1]. */
export type TavernBox = readonly [number, number, number, number];

/** The floor a level stands on, over the ground floor. */
export function tavernLevelY(level: TavernLevel): number {
  if (level === 'pit') return -TAVERN_PIT.depth;
  if (level === 'upper') return TAVERN_UPPER;
  return level === 'platform' ? 0.5 : 0;
}

/** The hall's wall boxes, minus the front doorway, the stair arch and the gallery door. */
export function tavernHallWalls(): TavernBox[] {
  const h = TAVERN_HALL;
  const t = h.wall;
  const d0 = TAVERN_DOOR.x - TAVERN_DOOR.width / 2;
  const d1 = TAVERN_DOOR.x + TAVERN_DOOR.width / 2;
  return [
    [h.x0, d0, h.z1 - t, h.z1],
    [d1, h.x1, h.z1 - t, h.z1],
    [h.x0, TAVERN_ARCH.x0, h.z0, h.z0 + t],
    [TAVERN_ARCH.x1, TAVERN_GALLERY_DOOR.x0, h.z0, h.z0 + t],
    [TAVERN_GALLERY_DOOR.x1, h.x1, h.z0, h.z0 + t],
    [h.x0, h.x0 + t, h.z0, h.z1],
    [h.x1 - t, h.x1, h.z0, h.z1],
  ];
}

/** The wing's wall boxes (its west wall broken by the passage from the tower's landing;
 *  its north side is the hall's back wall). The west wall's back run stops at the tower's
 *  outside face, where the model's wall stops: past it the tower's ring is the wall, and the
 *  run must not stand inside the tower on the stair's outer edge. */
export function tavernWingWalls(): TavernBox[] {
  const w = TAVERN_WING;
  const t = w.wall;
  const door = TAVERN_TOWER_DOOR;
  const tw = TAVERN_TOWER;
  // (measured on the wall's inner face, so no slit opens between the run and the ring)
  const towerFace = tw.z - Math.sqrt(tw.rOut * tw.rOut - (w.x0 + t - tw.x) ** 2);
  return [
    [w.x1 - t, w.x1, w.z0, w.z1],
    [w.x0, w.x1, w.z0, w.z0 + t],
    [w.x0, w.x0 + t, w.z0, towerFace],
    [w.x0, w.x0 + t, door.z1, w.z1],
  ];
}

/** The tower wall's angular runs (radians, atan2(dx, dz)): everything but the arch onto the
 *  hall (the ground landing's side) and the upper passage into the wing. */
export const TAVERN_TOWER_WALL_RUNS: readonly (readonly [number, number])[] = [
  [48 * DEG, 58 * DEG],
  [88 * DEG, 312 * DEG],
];

/** One segment of the tower's wall ring: a box across the wall's thickness. */
export interface TavernRingSegment {
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** Local yaw: the box's local z runs out along the radius. */
  rot: number;
}

export function tavernTowerWallSegments(): TavernRingSegment[] {
  const t = TAVERN_TOWER;
  const mid = (t.rIn + t.rOut) / 2;
  const out: TavernRingSegment[] = [];
  for (const [a0, a1] of TAVERN_TOWER_WALL_RUNS) {
    const n = Math.max(1, Math.ceil((a1 - a0) / (10 * DEG)));
    const step = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const a = a0 + step * (i + 0.5);
      out.push({
        x: t.x + Math.sin(a) * mid,
        z: t.z + Math.cos(a) * mid,
        // the outer face's half chord, and a hand's overlap so no slit opens between boxes
        hw: t.rOut * Math.sin(step / 2) + 0.05,
        hd: (t.rOut - t.rIn) / 2,
        rot: a,
      });
    }
  }
  return out;
}

/** The rails: the gallery's front and end, and the drop at the stair landing's end. */
export function tavernRails(): { box: TavernRingSegment; top: number }[] {
  const g = TAVERN_GALLERY;
  const top = TAVERN_UPPER + g.rail;
  const t = TAVERN_TOWER;
  const drop = TAVERN_STAIR.bottom - TAVERN_STAIR.landing;
  const mid = (t.newel + t.rIn) / 2;
  return [
    { box: { x: (g.x0 + g.x1) / 2, z: g.z1, hw: (g.x1 - g.x0) / 2, hd: 0.1, rot: 0 }, top },
    { box: { x: g.x0, z: (g.z0 + g.z1) / 2, hw: 0.1, hd: (g.z1 - g.z0) / 2, rot: 0 }, top },
    {
      box: {
        x: t.x + Math.sin(drop) * mid,
        z: t.z + Math.cos(drop) * mid,
        hw: 0.12,
        hd: (t.rIn - t.newel) / 2 + 0.1,
        rot: drop,
      },
      top,
    },
  ];
}

/** A local box, turned into the world. */
function worldObb(
  x: number,
  z: number,
  hw: number,
  hd: number,
  rot: number,
  extra: Partial<Collider>,
): Collider {
  const w = tavernToWorld(x, z);
  return { type: 'obb', x: w.x, z: w.z, hw, hd, rot: rot + TAVERN_YAW, ...extra } as Collider;
}

function boxCollider(b: TavernBox, extra: Partial<Collider>): Collider {
  return worldObb(
    (b[0] + b[1]) / 2,
    (b[2] + b[3]) / 2,
    (b[1] - b[0]) / 2,
    (b[3] - b[2]) / 2,
    0,
    extra,
  );
}

/** One furnishing's collider, seated on its level's floor. */
export function tavernPropCollider(prop: TavernProp): Collider {
  const top = TAVERN_FLOOR_Y + tavernLevelY(prop.level) + prop.height;
  const move = prop.standable ? { moveTopY: top, standable: true as const } : {};
  if (prop.r !== undefined) {
    const w = tavernToWorld(prop.x, prop.z);
    return { type: 'circle', x: w.x, z: w.z, r: prop.r, cameraTopY: top, ...move };
  }
  return worldObb(prop.x, prop.z, prop.hw ?? 0.5, prop.hd ?? 0.5, prop.rot, {
    cameraTopY: top,
    ...move,
  });
}

/** Every collider of the tavern: the walls, the tower ring, the partitions, the rails and
 *  parapets, the barrel wall, then the furnishings. (seed kept for the collider-set
 *  signature: the floor is absolute, so nothing here reads the ground.) */
export function mirefenTavernColliders(_seed: number): Collider[] {
  const f = TAVERN_FLOOR_Y;
  const out: Collider[] = [];
  for (const b of tavernHallWalls()) out.push(boxCollider(b, { cameraTopY: f + TAVERN_HALL.eave }));
  for (const b of tavernWingWalls()) out.push(boxCollider(b, { cameraTopY: f + TAVERN_WING.eave }));
  for (const s of tavernTowerWallSegments()) {
    out.push(worldObb(s.x, s.z, s.hw, s.hd, s.rot, { cameraTopY: f + TAVERN_TOWER.wallTop }));
  }
  for (const b of TAVERN_ROOM_WALLS) out.push(boxCollider(b, { cameraTopY: f + TAVERN_WING.eave }));
  for (const { box, top } of tavernRails()) {
    out.push(
      worldObb(box.x, box.z, box.hw, box.hd, box.rot, { moveTopY: f + top, cameraTopY: f + top }),
    );
  }
  const p = TAVERN_PORCH;
  for (const x of [p.x0, p.x1]) {
    out.push(
      boxCollider([x - 0.2, x + 0.2, p.z0, p.z1], {
        moveTopY: f + p.parapet,
        cameraTopY: f + p.parapet,
      }),
    );
  }
  const g = TAVERN_GALLERY;
  out.push(
    boxCollider([g.x0, g.x1, g.z0, g.z1], {
      moveTopY: f + TAVERN_UPPER,
      cameraTopY: f + TAVERN_UPPER,
      standable: true,
    }),
  );
  for (const prop of TAVERN_PROPS) out.push(tavernPropCollider(prop));
  return out;
}

/** Whether a local point stands inside the tavern (inside its walls, or in the tower
 *  passage): the rest area's plan. */
export function tavernInsideLocal(lx: number, lz: number): boolean {
  const h = TAVERN_HALL;
  if (lx > h.x0 + h.wall && lx < h.x1 - h.wall && lz > h.z0 && lz < h.z1 - h.wall) return true;
  const w = TAVERN_WING;
  if (lx > w.x0 && lx < w.x1 - w.wall && lz > w.z0 + w.wall && lz < w.z1) return true;
  const t = TAVERN_TOWER;
  return Math.hypot(lx - t.x, lz - t.z) < t.rIn;
}

/** Whether a body at world (x, y, z) stands in the tavern's rest area: inside it, its feet
 *  between the ground floor (a hand under the hearth pit) and the roof. */
export function tavernRestsAt(x: number, y: number, z: number): boolean {
  if (!tavernInsideLocal(TAVERN_ORIGIN.z - z, x - TAVERN_ORIGIN.x)) return false;
  return y >= TAVERN_FLOOR_Y - TAVERN_REST_SINK && y <= TAVERN_FLOOR_Y + TAVERN_HALL.ridge;
}

/** Spawn the innkeeper behind the bar, under her reserved id, when the world carries her
 *  (the built-in world). Idempotent; draws no rng. */
export function spawnTavernKeeper(ctx: SimContext, world: WorldContent): void {
  const def = world.npcs[TAVERN_KEEPER_NPC_ID];
  if (!def?.dynamic) return;
  if (ctx.entities.has(TAVERN_KEEPER_ENTITY_ID)) return;
  ctx.addEntity(createNpc(TAVERN_KEEPER_ENTITY_ID, def, ctx.groundPos(def.pos.x, def.pos.z)));
}
