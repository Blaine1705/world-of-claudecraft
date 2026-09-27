import { beforeAll, describe, expect, it } from 'vitest';
import { type Collider, lineOfSightClear, queryOpenWorldColliders } from '../src/sim/colliders';
import {
  MIREFEN_TAVERN_NPCS,
  TAVERN_ARCH,
  TAVERN_BAR_PLATFORM,
  TAVERN_DOOR,
  TAVERN_FLOOR_Y,
  TAVERN_GALLERY,
  TAVERN_GALLERY_DOOR,
  TAVERN_HALL,
  TAVERN_KEEPER_ENTITY_ID,
  TAVERN_KEEPER_LOCAL,
  TAVERN_ORIGIN,
  TAVERN_PIT,
  TAVERN_PORCH,
  TAVERN_PROPS,
  TAVERN_STAIR,
  TAVERN_TOWER,
  TAVERN_TOWER_DOOR,
  TAVERN_UPPER,
  TAVERN_WING,
  TAVERN_YAW,
  tavernToWorld,
} from '../src/sim/content/mirefen_tavern';
import { BUILTIN_WORLD, GATHER_NODES, NPCS } from '../src/sim/data';
import { isExcludedDecoration } from '../src/sim/decoration_exclusions';
import {
  mirefenTavernColliders,
  tavernHallWalls,
  tavernInsideLocal,
  tavernRestsAt,
} from '../src/sim/mirefen_tavern';
import {
  mirefenTavernCovers,
  mirefenTavernSurface,
  tavernLocalHeight,
} from '../src/sim/mirefen_tavern_floor';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { isResting } from '../src/sim/progression/xp';
import { Sim } from '../src/sim/sim';
import { type Entity, INTERACT_RANGE, STATIC_WORLD_SERVICE_ENTITY_ID_MIN } from '../src/sim/types';
import { groundHeight, roadDistance, terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import { worldEntityText } from '../src/ui/world_entity_i18n';

// The Mirefen tavern (src/sim/content/mirefen_tavern.ts, src/sim/mirefen_tavern_floor.ts,
// src/sim/mirefen_tavern.ts): the walk-in, two-storey inn on the Fenbridge road. Pins its
// site (clear of the road, the camps, the nodes and the scatter; the floor over the ground
// everywhere, no terrain edit), its generous scale against the 2.6 yd player, its floor
// (the hearth step, the bar platform, the stair, one height per point), its walls minus the
// openings, the rest area, the innkeeper, and walks the whole building with the real
// movement kernel: road, door, hearth ring, bar, stair, landing, rooms, gallery, and out.

const S = WORLD_SEED;
const PLAYER_H = 2.6;
const w = (lx: number, lz: number) => tavernToWorld(lx, lz);
const floorAt = (lx: number, lz: number): number => {
  const p = w(lx, lz);
  return groundHeight(p.x, p.z, S) - TAVERN_FLOOR_Y;
};

describe('Mirefen tavern: the site', () => {
  it('stands beside the Fenbridge road, its door toward it, its steps ending short of it', () => {
    const door = w(0, TAVERN_PORCH.z1);
    // the door faces world +x, the road's side
    expect(TAVERN_YAW).toBeCloseTo(Math.PI / 2, 12);
    expect(w(0, 1).x - w(0, 0).x).toBeCloseTo(1, 12);
    // the road passes a few yards beyond the steps' foot, and never under the building
    expect(roadDistance(door.x + 7, door.z)).toBeLessThan(3);
    for (let x = TAVERN_ORIGIN.x - 30; x <= TAVERN_ORIGIN.x + 16.4; x += 1) {
      for (let z = TAVERN_ORIGIN.z - 17; z <= TAVERN_ORIGIN.z + 17; z += 1) {
        if (!mirefenTavernCovers(x, z)) continue;
        expect(roadDistance(x, z), `(${x}, ${z})`).toBeGreaterThan(3.5);
      }
    }
  });

  it('keeps clear of every camp, node, quest object and NPC', () => {
    const c = BUILTIN_WORLD;
    for (const camp of c.camps) {
      // a camp's spread plus its mobs' reach never touches the walls
      const d = Math.hypot(camp.center.x - TAVERN_ORIGIN.x, camp.center.z - TAVERN_ORIGIN.z);
      expect(d - camp.radius, camp.mobId).toBeGreaterThan(40);
    }
    for (const n of GATHER_NODES) {
      expect(mirefenTavernCovers(n.pos.x, n.pos.z, 4), n.id).toBe(false);
    }
    for (const o of c.groundObjects) {
      for (const at of o.positions) {
        expect(mirefenTavernCovers(at.x, at.z, 4), o.itemId).toBe(false);
      }
    }
    for (const npc of Object.values(NPCS)) {
      if (npc.id === 'innkeeper_maudie') continue;
      expect(mirefenTavernCovers(npc.pos.x, npc.pos.z, 4), npc.id).toBe(false);
    }
  });

  it('floats its floor over the ground everywhere under it: no terrain edit', () => {
    // the terrain the renderer draws is untouched; the floor stands clear of it, so no
    // ground shows through a floorboard (the steps alone run down to meet it)
    for (let lx = -16; lx <= 16; lx += 0.5) {
      for (let lz = -28; lz <= TAVERN_PORCH.z1; lz += 0.5) {
        const p = w(lx, lz);
        const s = mirefenTavernSurface(p.x, p.z);
        if (s === -Infinity) continue;
        expect(s - terrainHeight(p.x, p.z, S), `(${lx}, ${lz})`).toBeGreaterThan(0.3);
      }
    }
    // and the surface is nothing off the footprint
    const off = w(0, 30);
    expect(mirefenTavernSurface(off.x, off.z)).toBe(-Infinity);
    expect(mirefenTavernSurface(TAVERN_ORIGIN.x + 60, TAVERN_ORIGIN.z)).toBe(-Infinity);
  });

  it('clears the scatter off its footprint, and nothing but its own colliders stands in it', () => {
    const mine = new Set(mirefenTavernColliders(S));
    const near: Collider[] = [];
    queryOpenWorldColliders(
      S,
      TAVERN_ORIGIN.x - 30,
      TAVERN_ORIGIN.z - 18,
      TAVERN_ORIGIN.x + 25,
      TAVERN_ORIGIN.z + 18,
      near,
    );
    const ours = near.filter((c) => [...mine].some((m) => m.x === c.x && m.z === c.z));
    expect(ours.length).toBe(mine.size);
    for (const c of near) {
      if (ours.includes(c)) continue;
      expect(mirefenTavernCovers(c.x, c.z, 2), `${c.type} at (${c.x}, ${c.z})`).toBe(false);
    }
    expect(isExcludedDecoration(TAVERN_ORIGIN.x, TAVERN_ORIGIN.z)).toBe(true);
    expect(isExcludedDecoration(TAVERN_ORIGIN.x + 60, TAVERN_ORIGIN.z)).toBe(false);
  });
});

describe('Mirefen tavern: scaled for the player', () => {
  it('is a big room, a big door and big stairs next to a 2.6 yd player', () => {
    const inside = TAVERN_HALL.x1 - TAVERN_HALL.x0 - 2 * TAVERN_HALL.wall;
    expect(inside).toBeGreaterThanOrEqual(28);
    expect(inside).toBeLessThanOrEqual(34);
    expect(TAVERN_DOOR.height).toBeGreaterThanOrEqual(4.5);
    expect(TAVERN_DOOR.height).toBeLessThanOrEqual(5.5);
    expect(TAVERN_DOOR.width).toBeGreaterThan(PLAYER_H + 1.5);
    // the high centre and the low nook beams
    expect(TAVERN_HALL.tie).toBeGreaterThanOrEqual(9);
    expect(TAVERN_HALL.tie).toBeLessThanOrEqual(11.5);
    expect(TAVERN_HALL.aisleBeam).toBeGreaterThanOrEqual(5);
    // the stair is wide, the arch and every upper doorway taller than a body with room over
    expect(TAVERN_TOWER.rIn - TAVERN_TOWER.newel).toBeGreaterThanOrEqual(3.5);
    expect(TAVERN_ARCH.height).toBeGreaterThan(2 * PLAYER_H);
    expect(TAVERN_TOWER_DOOR.height).toBeGreaterThan(PLAYER_H + 0.9);
    expect(TAVERN_GALLERY_DOOR.height).toBeGreaterThan(PLAYER_H + 1.2);
    // the upper floor under the roof keeps head room: the wing's wall plate, and the hall's
    // roof over the gallery's back edge
    expect(TAVERN_WING.eave - TAVERN_UPPER).toBeGreaterThan(PLAYER_H + 0.6);
    const run = (TAVERN_HALL.ridge - TAVERN_HALL.eave) / TAVERN_HALL.x1;
    const overGallery = TAVERN_HALL.eave + (TAVERN_HALL.x1 - TAVERN_GALLERY.x1) * run - 0.5;
    expect(overGallery - TAVERN_UPPER).toBeGreaterThan(PLAYER_H + 0.3);
  });

  it('sizes the furniture to the player: tables at the waist, seats a body sits in', () => {
    for (const p of TAVERN_PROPS) {
      if (p.kind === 'table' || p.kind === 'roundTable') {
        expect(p.height, p.kind).toBeGreaterThanOrEqual(0.5 * PLAYER_H);
        expect(p.height, p.kind).toBeLessThanOrEqual(0.7 * PLAYER_H);
      }
      if (p.kind === 'chair' || p.kind === 'stool' || p.kind === 'bench' || p.kind === 'settle') {
        expect(p.height, p.kind).toBeGreaterThanOrEqual(0.3 * PLAYER_H);
        expect(p.height, p.kind).toBeLessThanOrEqual(0.45 * PLAYER_H);
      }
      if (p.kind === 'counter') expect(p.height).toBeGreaterThan(0.55 * PLAYER_H);
    }
  });
});

describe('Mirefen tavern: the floor', () => {
  it('steps down one step into the hearth ring and up one onto the bar, both walkable', () => {
    expect(floorAt(TAVERN_PIT.x, TAVERN_PIT.z + 3)).toBeCloseTo(-TAVERN_PIT.depth, 9);
    expect(floorAt(TAVERN_PIT.x, TAVERN_PIT.z + TAVERN_PIT.rim + 0.1)).toBeCloseTo(0, 9);
    expect(floorAt(8, -5)).toBeCloseTo(TAVERN_BAR_PLATFORM.lift, 9);
    // the edges are ramps a stride walks, never walls: the steepest is under the climb gate
    for (let d = 0; d < 1; d += 0.05) {
      const a = floorAt(0, TAVERN_PIT.z + TAVERN_PIT.r + d);
      const b = floorAt(0, TAVERN_PIT.z + TAVERN_PIT.r + d + 0.05);
      expect(Math.abs(b - a) / 0.05).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
      const c = floorAt(8, TAVERN_BAR_PLATFORM.z1 + d);
      const e = floorAt(8, TAVERN_BAR_PLATFORM.z1 + d + 0.05);
      expect(Math.abs(e - c) / 0.05).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
    }
  });

  it('climbs the spiral evenly from the ground landing to the upper floor, never dropping', () => {
    const t = TAVERN_TOWER;
    let prev = -1;
    for (let u = 0; u <= TAVERN_STAIR.climb + 1e-9; u += Math.PI / 90) {
      const a = TAVERN_STAIR.bottom - u;
      for (const r of [t.newel + 0.5, (t.newel + t.rIn) / 2, t.rIn - 0.5]) {
        const h = tavernLocalHeight(t.x + Math.sin(a) * r, t.z + Math.cos(a) * r);
        expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
        // even at the newel, the climb stays well under the climb gate
        expect(TAVERN_UPPER / (r * TAVERN_STAIR.climb)).toBeLessThan(0.75);
      }
      prev = tavernLocalHeight(t.x + Math.sin(a) * 3.9, t.z + Math.cos(a) * 3.9);
    }
    expect(prev).toBeCloseTo(TAVERN_UPPER, 6);
  });

  it('puts every upper floor over solid ground: the gallery, the landing and the wing', () => {
    expect(floorAt(9, -12)).toBe(TAVERN_UPPER);
    expect(floorAt(10, -20)).toBe(TAVERN_UPPER);
    expect(floorAt((TAVERN_TOWER_DOOR.x0 + TAVERN_TOWER_DOOR.x1) / 2, -16.2)).toBe(TAVERN_UPPER);
    // the ground landing inside the arch stays at the ground floor
    expect(floorAt(-1.5, -13.5)).toBe(0);
  });
});

describe('Mirefen tavern: walls, openings and rails', () => {
  const colliders = mirefenTavernColliders(S);
  it('leaves the front doorway and the stair arch open and closes the rest of the front and back', () => {
    const walls = tavernHallWalls();
    const inWall = (x: number, z: number) =>
      walls.some(
        (b) => x >= b[0] - 1e-9 && x <= b[1] + 1e-9 && z >= b[2] - 1e-9 && z <= b[3] + 1e-9,
      );
    for (let x = TAVERN_HALL.x0; x <= TAVERN_HALL.x1; x += 0.1) {
      const door = Math.abs(x - TAVERN_DOOR.x) < TAVERN_DOOR.width / 2 - 1e-6;
      expect(inWall(x, TAVERN_HALL.z1 - 0.4), `front ${x}`).toBe(!door);
      const arch = x > TAVERN_ARCH.x0 + 1e-6 && x < TAVERN_ARCH.x1 - 1e-6;
      const up = x > TAVERN_GALLERY_DOOR.x0 + 1e-6 && x < TAVERN_GALLERY_DOOR.x1 - 1e-6;
      expect(inWall(x, TAVERN_HALL.z0 + 0.4), `back ${x}`).toBe(!arch && !up);
    }
    // walls block at any height; rails block a body under their top and are never stood on
    for (const c of colliders) {
      if (c.moveTopY === undefined) expect(c.standable).toBeUndefined();
    }
  });

  it('joins the live static grid', () => {
    for (const c of colliders) {
      const near: Collider[] = [];
      queryOpenWorldColliders(S, c.x - 0.1, c.z - 0.1, c.x + 0.1, c.z + 0.1, near);
      expect(near.some((n) => n.x === c.x && n.z === c.z)).toBe(true);
    }
  });

  it('stops a spell at the walls but lets it cross the room and reach the gallery', () => {
    const a = w(-10, 5);
    const outside = w(-22, 5);
    expect(lineOfSightClear(S, a, outside)).toBe(false);
    const b = w(10, 5);
    expect(lineOfSightClear(S, a, b)).toBe(true);
  });
});

describe('Mirefen tavern: the rest area (the inn rule)', () => {
  const at = (lx: number, lz: number, dy = 0, inCombat = false): Entity => {
    const p = w(lx, lz);
    return {
      pos: { x: p.x, y: groundHeight(p.x, p.z, S) + dy, z: p.z },
      inCombat,
    } as unknown as Entity;
  };

  it('covers both floors inside the walls and nothing outside', () => {
    for (let lx = -15; lx <= 15; lx += 1) {
      for (let lz = -27; lz <= 13; lz += 1) {
        if (!tavernInsideLocal(lx, lz)) continue;
        expect(isResting(at(lx, lz)), `(${lx}, ${lz})`).toBe(true);
      }
    }
    expect(isResting(at(0, 15))).toBe(false); // the porch
    expect(isResting(at(0, 20))).toBe(false); // the steps
    expect(isResting(at(-20, 0))).toBe(false); // outside the left wall
    expect(isResting(at(0, 5, 0, true))).toBe(false); // a fighter
    const p = w(0, 5);
    expect(tavernRestsAt(p.x, TAVERN_FLOOR_Y + TAVERN_HALL.ridge + 1, p.z)).toBe(false);
  });
});

describe('Mirefen tavern: the innkeeper', () => {
  const npc = MIREFEN_TAVERN_NPCS.innkeeper_maudie;
  it('is a gossip NPC with localized name, title and greeting keys', () => {
    expect(NPCS.innkeeper_maudie).toBe(npc);
    expect(npc.dynamic).toBe(true);
    expect(TAVERN_KEEPER_ENTITY_ID).toBeGreaterThanOrEqual(1_000_000_000);
    expect(TAVERN_KEEPER_ENTITY_ID).toBeLessThan(STATIC_WORLD_SERVICE_ENTITY_ID_MIN);
    expect(npc.questIds).toEqual([]);
    expect(npc.vendorItems).toBeUndefined();
    expect(npc.title).toBe('Innkeeper');
    const npcs = worldEntityText.en.entities.npcs as Record<string, Record<string, string>>;
    expect(npcs.innkeeper_maudie).toEqual({
      name: npc.name,
      title: npc.title,
      greeting: npc.greeting,
    });
    expect(npc.greeting).toMatch(/Fenbridge/);
  });

  it('stands behind the bar, clear of every solid, in reach across the counter', () => {
    const p = w(TAVERN_KEEPER_LOCAL.x, TAVERN_KEEPER_LOCAL.z);
    expect(npc.pos).toEqual(p);
    for (const c of mirefenTavernColliders(S)) {
      if (c.type === 'circle') {
        expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r - 0.5).toBeGreaterThan(0);
      }
    }
    const talk = w(TAVERN_KEEPER_LOCAL.x - 1.6, -5.9);
    expect(Math.hypot(talk.x - p.x, talk.z - p.z)).toBeLessThan(INTERACT_RANGE);
  });
});

describe('Mirefen tavern: walking it (the real movement kernel)', () => {
  let sim: Sim;
  const idle = {
    forward: false,
    back: false,
    turnLeft: false,
    turnRight: false,
    strafeLeft: false,
    strafeRight: false,
    jump: false,
    dive: false,
    surface: false,
  };

  function place(lx: number, lz: number): void {
    const p = sim.player;
    const q = w(lx, lz);
    p.pos = { x: q.x, y: groundHeight(q.x, q.z, S), z: q.z };
    p.prevPos = { ...p.pos };
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.onGround = true;
  }

  /** Walk toward local (lx, lz); where it ended (local) and the lowest the feet went. */
  function walk(lx: number, lz: number, jump = false, maxTicks = 300) {
    const p = sim.player;
    const meta = sim.players.get(p.id);
    if (!meta) throw new Error('meta');
    const t = w(lx, lz);
    let sink = 0;
    for (let i = 0; i < maxTicks; i++) {
      const dx = t.x - p.pos.x;
      const dz = t.z - p.pos.z;
      if (Math.hypot(dx, dz) < 0.25) break;
      p.facing = Math.atan2(dx, dz);
      Object.assign(meta.moveInput, { ...idle, forward: true, jump: jump && p.onGround });
      sim.tick();
      sink = Math.min(sink, p.pos.y - groundHeight(p.pos.x, p.pos.z, S));
    }
    Object.assign(meta.moveInput, idle);
    for (let i = 0; i < 10; i++) sim.tick();
    return {
      lx: TAVERN_ORIGIN.z - p.pos.z,
      lz: p.pos.x - TAVERN_ORIGIN.x,
      y: p.pos.y - TAVERN_FLOOR_Y,
      sink,
    };
  }

  beforeAll(() => {
    sim = new Sim({ seed: S, playerClass: 'warrior' });
    sim.setPlayerLevel(10);
  });

  const T = TAVERN_TOWER;
  const spiral = (deg: number, r = 3.9): [number, number] => [
    T.x + Math.sin((deg * Math.PI) / 180) * r,
    T.z + Math.cos((deg * Math.PI) / 180) * r,
  ];
  // road, steps, porch, door, entry, into the hearth ring through the door-side gap, out
  // by the next gap, up onto the bar platform between the stools, across to the arch, the
  // ground landing, the whole spiral, the landing, the passage, the wing's landing, both
  // rooms, the gallery door and the gallery's far end
  const ROUTE: readonly (readonly [number, number, number])[] = [
    [0, 22, Number.NaN],
    [0, 18.5, Number.NaN],
    [0, 15.2, 0],
    [0, 12, 0],
    [0, 8.8, 0],
    [0, 5.0, -TAVERN_PIT.depth],
    [4.2, 4.0, -TAVERN_PIT.depth],
    [6.4, 4.8, 0],
    [7.35, -2.5, 0],
    [7.35, -5.9, TAVERN_BAR_PLATFORM.lift],
    [7.35, -3.2, 0],
    [1.0, -4.4, 0],
    [-1.5, -10.5, 0],
    [-1.5, -13.5, 0],
    [...spiral(-30), 0],
    [...spiral(-60), Number.NaN],
    [...spiral(-100), Number.NaN],
    [...spiral(-140), Number.NaN],
    [...spiral(-180), Number.NaN],
    [...spiral(-220), Number.NaN],
    [...spiral(-260), Number.NaN],
    [...spiral(75, 4.4), TAVERN_UPPER],
    [4.0, -16.2, TAVERN_UPPER],
    [7.3, -17.0, TAVERN_UPPER],
    [7.3, -22.4, TAVERN_UPPER],
    [7.3, -18.5, TAVERN_UPPER],
    [12.7, -18.5, TAVERN_UPPER],
    [12.7, -22.4, TAVERN_UPPER],
    [12.7, -18.5, TAVERN_UPPER],
    [8.5, -16.0, TAVERN_UPPER],
    [8.5, -11.8, TAVERN_UPPER],
    [4.0, -11.6, TAVERN_UPPER],
  ];

  it('walks from the road to the fire, the bar, up the stair to the rooms and the gallery, and back out', () => {
    place(ROUTE[0][0], ROUTE[0][1]);
    const legs = [...ROUTE.slice(1), ...[...ROUTE].reverse().slice(1)];
    for (const [lx, lz, y] of legs) {
      const end = walk(lx, lz);
      expect(
        Math.hypot(end.lx - lx, end.lz - lz),
        `to (${lx.toFixed(2)}, ${lz.toFixed(2)})`,
      ).toBeLessThan(0.45);
      if (!Number.isNaN(y))
        expect(end.y, `at (${lx.toFixed(2)}, ${lz.toFixed(2)})`).toBeCloseTo(y, 2);
      // on the floor the whole way, never through it
      expect(end.sink, `to (${lx.toFixed(2)}, ${lz.toFixed(2)})`).toBeGreaterThan(-0.05);
    }
  }, 180_000);

  it('never gets stuck in the doorway or on the stair: straight through, both ways', () => {
    for (const dx of [-1.4, 0, 1.4]) {
      place(dx, 16);
      let end = walk(dx, 10);
      expect(Math.hypot(end.lx - dx, end.lz - 10), `in at ${dx}`).toBeLessThan(0.45);
      end = walk(dx, 16);
      expect(Math.hypot(end.lx - dx, end.lz - 16), `out at ${dx}`).toBeLessThan(0.45);
    }
    // down the spiral from the landing in one go along its outer and inner lines
    for (const r of [T.newel + 0.8, T.rIn - 0.8]) {
      const [sx, sz] = spiral(75, 4.4);
      place(sx, sz);
      // down the flight: the climb angle falls from the top (222 degrees) to the foot
      for (let u = 210; u >= 15; u -= 15) {
        const [x, z] = spiral(-48 - u, r);
        walk(x, z, false, 120);
      }
      const [ex, ez] = spiral(-20, r);
      const end = walk(ex, ez);
      expect(Math.hypot(end.lx - ex, end.lz - ez), `down at r ${r}`).toBeLessThan(0.45);
      expect(end.y).toBeCloseTo(0, 2);
    }
  }, 120_000);

  it('the walls, rails and drops hold: walking or jumping at them keeps the player in', () => {
    // [start, push toward, the floor the player must stay on]
    const [lx0, lz0] = spiral(70, 4.2);
    const [lx1, lz1] = spiral(20, 4.2);
    const pushes: [number, number, number, number, number][] = [
      [-12, 5, -25, 5, 0], // the left wall
      [12, 12, 12, 25, 0], // the front wall beside the door
      [-10, -11, -10, -25, 0], // the back wall beside the arch
      [13.5, 5.5, 25, 5.5, 0], // the right wall
      [10, -12, 10, -2, TAVERN_UPPER], // off the gallery's edge
      [3.5, -11.6, -3, -11.6, TAVERN_UPPER], // off the gallery's end
      [lx0, lz0, lx1, lz1, TAVERN_UPPER], // off the landing's drop
      [14.6, -24, 14.6, -35, TAVERN_UPPER], // the wing's back wall, past the bed
      [14, -17, 25, -17, TAVERN_UPPER], // the wing's side wall
    ];
    for (const jump of [false, true]) {
      for (const [x, z, tx, tz, y] of pushes) {
        place(x, z);
        const end = walk(tx, tz, jump, 80);
        expect(
          tavernInsideLocal(end.lx, end.lz),
          `${jump ? 'jump' : 'walk'} from (${x}, ${z})`,
        ).toBe(true);
        expect(end.y, `${jump ? 'jump' : 'walk'} from (${x}, ${z})`).toBeCloseTo(y, 1);
      }
    }
  }, 120_000);

  it('rests the player by the fire and stops at the door', () => {
    place(0, 8.5);
    const meta = sim.players.get(sim.player.id);
    if (!meta) throw new Error('meta');
    meta.restedXp = 0;
    for (let i = 0; i < 40; i++) sim.tick();
    expect(meta.restedXp).toBeGreaterThan(0);
    place(0, 15.5);
    const before = meta.restedXp;
    for (let i = 0; i < 40; i++) sim.tick();
    expect(meta.restedXp).toBe(before);
  }, 60_000);

  it('spawns the innkeeper once, under her reserved id, on the bar platform, facing the room', () => {
    const all = [...sim.entities.values()].filter(
      (x) => x.kind === 'npc' && x.templateId === 'innkeeper_maudie',
    );
    expect(all).toHaveLength(1);
    const e = sim.entities.get(TAVERN_KEEPER_ENTITY_ID);
    expect(e).toBe(all[0]);
    if (!e) return;
    expect(e.facing).toBeCloseTo(TAVERN_YAW, 9);
    expect(e.pos.y - TAVERN_FLOOR_Y).toBeCloseTo(TAVERN_BAR_PLATFORM.lift, 3);
    expect(sim.player.id).toBeLessThan(1_000_000_000);
  });
});
