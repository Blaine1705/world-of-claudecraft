// The hideable-wall accumulator for dungeon shells. Every standard-layout
// interior routes its outer walls through the (formerly arena-only) hideable
// path, so each wall face collects its module placements separately and
// carries the plan footprint the per-frame sightline fade tests against
// (arena_wall_occlusion_core.ts). Moved verbatim out of dungeon.ts; the emit
// side (InstancedMesh construction + material policy) stays with
// DungeonInteriors.
import * as THREE from 'three';
import { polygonWallSegments } from '../sim/delve_litany_layout';
import {
  DUNGEON_END_WALL_HW,
  DUNGEON_WALL_HEIGHT,
  DUNGEON_WALL_HW,
  DUNGEON_WALL_X,
  type DungeonLayout,
} from '../sim/dungeon_layout';
import type { ArenaWallFootprint } from './arena_wall_occlusion_core';
import type { DungeonInteriorVariant } from './dungeon';

/** Accumulates instance transforms per module kind, then emits InstancedMeshes. */
export class Placements {
  readonly byKind = new Map<string, THREE.Matrix4[]>();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  add(
    kind: string,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    scale: number | [number, number, number] = 1,
  ): void {
    const m = new THREE.Matrix4();
    this.pos.set(x, y, z);
    this.quat.setFromEuler(this.euler.set(0, rotY, 0));
    if (typeof scale === 'number') this.scl.set(scale, scale, scale);
    else this.scl.set(scale[0], scale[1], scale[2]);
    m.compose(this.pos, this.quat, this.scl);
    const list = this.byKind.get(kind);
    if (list) list.push(m);
    else this.byKind.set(kind, [m]);
  }
}

export interface PendingArenaWall {
  placements: Placements;
  footprint: ArenaWallFootprint;
}

export interface PendingArenaWalls {
  left: PendingArenaWall;
  right: PendingArenaWall;
  front: PendingArenaWall;
  back: PendingArenaWall;
  all: PendingArenaWall[];
}

export function pendingArenaWallsFor(
  layout: DungeonLayout,
  ox: number,
  oz: number,
  variant?: DungeonInteriorVariant,
): PendingArenaWalls {
  // the Ignivar rooms stack a second wall course, so the hide/fade footprint
  // reaches the true top
  const topY = variant === 'ignivar' ? DUNGEON_WALL_HEIGHT * 2 : DUNGEON_WALL_HEIGHT;
  const wallX = layout.wallX ?? DUNGEON_WALL_X;
  const endWallHw = layout.endWallHw ?? DUNGEON_END_WALL_HW;
  const wall = (footprint: ArenaWallFootprint): PendingArenaWall => ({
    placements: new Placements(),
    footprint,
  });
  const left = wall({
    x: ox - wallX,
    z: oz + layout.sideWallZ,
    hw: DUNGEON_WALL_HW,
    hd: layout.sideWallHd,
    topY,
  });
  const right = wall({
    x: ox + wallX,
    z: oz + layout.sideWallZ,
    hw: DUNGEON_WALL_HW,
    hd: layout.sideWallHd,
    topY,
  });
  const front = wall({ x: ox, z: oz + layout.zMin, hw: endWallHw, hd: DUNGEON_WALL_HW, topY });
  const back = wall({ x: ox, z: oz + layout.zMax, hw: endWallHw, hd: DUNGEON_WALL_HW, topY });
  if (layout.shellPolygon) {
    const polygon = polygonWallSegments(layout.shellPolygon).map((segment) =>
      wall({
        x: ox + segment.x,
        z: oz + segment.z,
        hw: segment.halfLength,
        hd: DUNGEON_WALL_HW,
        topY,
        ry: segment.rot,
      }),
    );
    return { left, right, front, back, all: polygon };
  }
  return {
    left,
    right,
    front,
    back,
    all: [left, right, front, back],
  };
}
