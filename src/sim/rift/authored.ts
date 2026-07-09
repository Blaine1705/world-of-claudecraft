// Authored room-graph layouts: the pure geometry seam that lets a rift floor be a
// HAND-AUTHORED set of rectangular rooms joined by doorways, instead of the single
// procedural star-shaped room `rift_gen.buildLayout` produces.
//
// One source of truth: `authoredWallSegments` derives the wall run of every room
// edge (union of coincident edges, minus the door openings), and BOTH the collision
// set (`authoredColliders`, consumed by colliders.ts through layoutColliders) and
// the rendered wall modules (src/render/dungeon.ts) are built from those same
// segments. A wall you can see is a wall you bump into, by construction.
//
// Sim layer: pure functions, no DOM/Three, no rng, no sim state. The wall
// half-thickness is a PARAMETER rather than an import of dungeon_layout's
// DUNGEON_WALL_HW, so dungeon_layout can depend on this module without a cycle.

import type { Collider } from '../colliders';

/** An axis-aligned room, instance-local. Rooms never overlap; two rooms that share
 * an edge line are joined only where an `AuthoredDoor` cuts that edge. */
export interface AuthoredRoom {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A doorway: a box straddling one wall line. The extent ACROSS the wall (`hw` for
 * a wall of constant x, `hd` for a wall of constant z) only has to reach the wall;
 * the extent ALONG the wall is the width of the opening. */
export interface AuthoredDoor {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

/** A placed decoration. `r` (when set) is the collision radius measured from the
 * built model, so the collider matches what the renderer draws. Omit `r` for a
 * purely visual prop the player walks through (rugs, floor sigils). */
export interface AuthoredDecor {
  key: string;
  x: number;
  z: number;
  yaw: number;
  scale?: number;
  r?: number;
}

/** A wall run along one axis. `axis: 'x'` means the wall extends along x at a
 * constant z (= `fixed`), spanning [a, b]. */
export interface WallSeg {
  axis: 'x' | 'z';
  fixed: number;
  a: number;
  b: number;
}

const EPS = 1e-6;
/** Shorter than this and a wall run is a sliver: skip it (a door edge that lands a
 * hair inside a room corner would otherwise emit a degenerate collider). */
const MIN_SEG = 0.4;

type Interval = [number, number];

function unionIntervals(list: readonly Interval[]): Interval[] {
  if (list.length === 0) return [];
  const sorted = list.slice().sort((p, q) => p[0] - q[0]);
  const out: Interval[] = [sorted[0].slice() as Interval];
  for (let i = 1; i < sorted.length; i++) {
    const cur = out[out.length - 1];
    const nxt = sorted[i];
    if (nxt[0] <= cur[1] + EPS) cur[1] = Math.max(cur[1], nxt[1]);
    else out.push(nxt.slice() as Interval);
  }
  return out;
}

function subtractIntervals(from: readonly Interval[], cuts: readonly Interval[]): Interval[] {
  let acc: Interval[] = from.map((iv) => iv.slice() as Interval);
  for (const [c0, c1] of cuts) {
    const next: Interval[] = [];
    for (const [a, b] of acc) {
      if (c1 <= a + EPS || c0 >= b - EPS) {
        next.push([a, b]); // no overlap
        continue;
      }
      if (c0 > a + EPS) next.push([a, c0]);
      if (c1 < b - EPS) next.push([c1, b]);
    }
    acc = next;
  }
  return acc.filter(([a, b]) => b - a > MIN_SEG);
}

/** Every wall run of an authored layout: the union of all room edges that share a
 * line, minus the door openings that pierce that line. Deterministic and ordered
 * (rooms in order, then south/north/west/east edges), so both hosts build the same
 * geometry from the same data. */
export function authoredWallSegments(
  rooms: readonly AuthoredRoom[],
  doors: readonly AuthoredDoor[],
): WallSeg[] {
  // Collect coincident edges per wall line so a shared wall between two rooms is
  // one run, not two stacked ones.
  const zLines = new Map<number, Interval[]>(); // constant z, spans x
  const xLines = new Map<number, Interval[]>(); // constant x, spans z
  const push = (m: Map<number, Interval[]>, key: number, iv: Interval): void => {
    const cur = m.get(key);
    if (cur) cur.push(iv);
    else m.set(key, [iv]);
  };
  for (const r of rooms) {
    push(zLines, r.z0, [r.x0, r.x1]);
    push(zLines, r.z1, [r.x0, r.x1]);
    push(xLines, r.x0, [r.z0, r.z1]);
    push(xLines, r.x1, [r.z0, r.z1]);
  }

  const out: WallSeg[] = [];
  const emit = (axis: 'x' | 'z', lines: Map<number, Interval[]>): void => {
    for (const fixed of [...lines.keys()].sort((a, b) => a - b)) {
      const spans = unionIntervals(lines.get(fixed) as Interval[]);
      // A door pierces this line when its ACROSS-the-wall extent reaches it; what it
      // removes is its ALONG-the-wall extent.
      const cuts: Interval[] = [];
      for (const d of doors) {
        if (axis === 'x') {
          if (Math.abs(fixed - d.z) <= d.hd + EPS) cuts.push([d.x - d.hw, d.x + d.hw]);
        } else {
          if (Math.abs(fixed - d.x) <= d.hw + EPS) cuts.push([d.z - d.hd, d.z + d.hd]);
        }
      }
      for (const [a, b] of subtractIntervals(spans, unionIntervals(cuts))) {
        out.push({ axis, fixed, a, b });
      }
    }
  };
  emit('x', zLines); // walls running along x sit on constant-z lines
  emit('z', xLines);
  return out;
}

/** Collision set for an authored layout: one axis-aligned OBB per wall run, plus a
 * circle per decor piece that carries a measured radius. Walls are never rotated
 * (every room is axis-aligned), so this needs no OBB rotation handling. */
export function authoredColliders(
  rooms: readonly AuthoredRoom[],
  doors: readonly AuthoredDoor[],
  decor: readonly AuthoredDecor[] = [],
  wallHw = 1,
): Collider[] {
  const out: Collider[] = [];
  for (const s of authoredWallSegments(rooms, doors)) {
    const mid = (s.a + s.b) / 2;
    const half = (s.b - s.a) / 2;
    if (s.axis === 'x') {
      out.push({ type: 'obb', x: mid, z: s.fixed, hw: half, hd: wallHw, rot: 0 });
    } else {
      out.push({ type: 'obb', x: s.fixed, z: mid, hw: wallHw, hd: half, rot: 0 });
    }
  }
  for (const d of decor) {
    if (d.r !== undefined && d.r > 0) out.push({ type: 'circle', x: d.x, z: d.z, r: d.r });
  }
  return out;
}

/** Whether an instance-local point lies inside any authored room (its walkable
 * floor). Used by the generator's placement checks and by the tests' reachability
 * sweep; the wall runs themselves sit ON the room boundary, so a point strictly
 * inside a room is inside the shell. */
export function inAnyRoom(rooms: readonly AuthoredRoom[], x: number, z: number): boolean {
  for (const r of rooms) {
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
  }
  return false;
}

/** The room containing a point, or null. */
export function roomAt(rooms: readonly AuthoredRoom[], x: number, z: number): AuthoredRoom | null {
  for (const r of rooms) {
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r;
  }
  return null;
}
