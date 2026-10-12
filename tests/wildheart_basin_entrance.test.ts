// The Wildheart Basin's world entrance, the Jaguar Maw
// (src/sim/wildheart_basin_entrance.ts, drawn by
// src/render/wildheart_basin_entrance.ts): the idol's muzzle is the door's
// jambs and the lane between its lower teeth is the walk-in trigger; a player
// comes down the knoll's stair, is taken by the door under the fangs, and
// stands on open ground at the exit drop; the palms the idol stands on are
// cleared; every footing of the Blender model sits in the sim's own ground;
// and nothing around the door, mob spawns included, is walled in.
import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { DUNGEON_X_THRESHOLD, DUNGEONS, GATHER_NODES, NPCS } from '../src/sim/data';
import { isExcludedDecoration } from '../src/sim/decoration_exclusions';
import { PLAYER_BODY_RADIUS } from '../src/sim/pathfind';
import { Sim } from '../src/sim/sim';
import type { MoveInput } from '../src/sim/types';
import {
  WILDHEART_BASIN_ENTRANCE_CLEARED_SCATTER,
  WILDHEART_BASIN_ENTRANCE_COLLIDERS,
  WILDHEART_BASIN_ENTRANCE_FOOTINGS,
  WILDHEART_BASIN_ENTRANCE_LANE_HALF_WIDTH,
  wildheartBasinEntranceColliders,
} from '../src/sim/wildheart_basin_entrance';
import {
  generateDecorationsInBounds,
  groundHeight,
  reachPalmSpots,
  terrainHeight,
  WATER_LEVEL,
} from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const SEED = WORLD_SEED;
const DOOR = DUNGEONS.wildheart_basin.doorPos;
// The walk-in trigger (instances/dungeons.ts DOOR_TRIGGER_RADIUS): a shipped
// constant the module does not export, pinned here as the literal it is.
const DOOR_TRIGGER_RADIUS = 2;
const EXIT_DROP = { x: DOOR.x, z: DOOR.z - 4 };
// The approach: the head of the stair, on the knoll's crest.
const APPROACH = { x: DOOR.x - 0.5, z: DOOR.z - 10 };
const IDLE: MoveInput = {
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

function place(sim: Sim, x: number, z: number, facing: number): void {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = groundHeight(x, z, SEED);
  p.prevPos = { ...p.pos };
  p.fallStartY = p.pos.y;
  p.facing = facing;
  p.onGround = true;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  sim.rebucket(p);
}

/** Walk toward a point, re-aiming every tick (so a small prop is skirted). */
function walkTo(sim: Sim, x: number, z: number, reach: number, maxTicks: number): boolean {
  const p = sim.player;
  const meta = sim.players.get(p.id);
  if (!meta) throw new Error('no meta');
  for (let i = 0; i < maxTicks; i++) {
    if (Math.hypot(p.pos.x - x, p.pos.z - z) <= reach) return true;
    p.facing = Math.atan2(x - p.pos.x, z - p.pos.z);
    Object.assign(meta.moveInput, IDLE, { forward: true });
    sim.tick();
  }
  return Math.hypot(p.pos.x - x, p.pos.z - z) <= reach;
}

function makeSim(): Sim {
  const sim = new Sim({ seed: SEED, playerClass: 'warrior', autoEquip: true, devCommands: true });
  sim.setPlayerLevel(20);
  sim.player.devNoAggro = true;
  return sim;
}

/** Circle-vs-shape overlap against the idol's own solids only. */
function idolHits(x: number, z: number, r: number): boolean {
  return wildheartBasinEntranceColliders(SEED, DOOR).some((c) => {
    if (c.type === 'circle') return Math.hypot(x - c.x, z - c.z) < c.r + r;
    const dx = x - c.x;
    const dz = z - c.z;
    const cs = Math.cos(c.rot);
    const sn = Math.sin(c.rot);
    const u = dx * cs - dz * sn;
    const v = dx * sn + dz * cs;
    return Math.hypot(Math.max(Math.abs(u) - c.hw, 0), Math.max(Math.abs(v) - c.hd, 0)) < r;
  });
}

const row = (name: string) => {
  const found = WILDHEART_BASIN_ENTRANCE_COLLIDERS.find((r) => r.name === name);
  if (!found) throw new Error(`no collider row ${name}`);
  return found;
};

describe('the Jaguar Maw stands in for the generic door arch', () => {
  it('the door is still the Basin door at (-232, 1112), where the knoll drops into the lagoon', () => {
    expect(DOOR).toEqual({ x: -232, z: 1112 });
    const base = terrainHeight(DOOR.x, DOOR.z, SEED);
    expect(base).toBeCloseTo(-3.4748, 3);
    // the door stands a short step over the lagoon, the exit drop three yards up the knoll
    expect(base - WATER_LEVEL).toBeGreaterThan(0.5);
    expect(base - WATER_LEVEL).toBeLessThan(1.2);
    expect(terrainHeight(EXIT_DROP.x, EXIT_DROP.z, SEED) - base).toBeGreaterThan(2.5);
  });

  it('the head, the muzzle, the fire bowls, the tusks and the fallen ear block', () => {
    const head = row('head');
    expect(isBlocked(SEED, DOOR.x + head.lx, DOOR.z + head.lz, 0.4), 'head').toBe(true);
    // the round head from every side, a yard inside its face
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = (head.r ?? 0) - 1;
      expect(
        isBlocked(
          SEED,
          DOOR.x + head.lx + Math.sin(a) * r,
          DOOR.z + head.lz + Math.cos(a) * r,
          0.3,
        ),
        `head at ${k}`,
      ).toBe(true);
    }
    for (const sx of [-1, 1]) {
      expect(isBlocked(SEED, DOOR.x + sx * 3.2, DOOR.z - 0.4, 0.3), `muzzle ${sx}`).toBe(true);
      expect(isBlocked(SEED, DOOR.x + sx * 5.5, DOOR.z + 0.4, 0.3), `muzzle end ${sx}`).toBe(true);
      // the lower teeth: no slipping past the lane's edge into the stone
      expect(isBlocked(SEED, DOOR.x + sx * 1.9, DOOR.z - 0.6, PLAYER_BODY_RADIUS)).toBe(true);
    }
    for (const name of ['brazier_w', 'brazier_e', 'tusk_w', 'tusk_e', 'fallen_ear']) {
      const r = row(name);
      expect(isBlocked(SEED, DOOR.x + r.lx, DOOR.z + r.lz, 0.3), name).toBe(true);
    }
    // the black water in the throat is closed
    expect(isBlocked(SEED, DOOR.x, DOOR.z + 1.6, 0.4), 'the flooded throat').toBe(true);
    expect(isBlocked(SEED, DOOR.x, DOOR.z + 5, 0.4), 'its far end').toBe(true);
  });

  it('the lane between the lower teeth is open, and every place in it is inside the trigger', () => {
    const half = WILDHEART_BASIN_ENTRANCE_LANE_HALF_WIDTH;
    expect(half).toBeLessThan(DOOR_TRIGGER_RADIUS);
    expect(half).toBeGreaterThan(PLAYER_BODY_RADIUS * 2);
    // down the middle, from the stair to the door
    for (const lz of [-3, -2, -1, 0]) {
      expect(isBlocked(SEED, DOOR.x, DOOR.z + lz, PLAYER_BODY_RADIUS), `lane ${lz}`).toBe(false);
    }
    // between the muzzle's two halves a body can only stand inside the trigger
    let open = 0;
    for (let lx = -half; lx <= half + 1e-6; lx += 0.15) {
      for (let lz = -1.2; lz <= 3; lz += 0.15) {
        if (idolHits(DOOR.x + lx, DOOR.z + lz, PLAYER_BODY_RADIUS)) continue;
        open++;
        expect(Math.hypot(lx, lz), `${lx.toFixed(2)},${lz.toFixed(2)}`).toBeLessThan(
          DOOR_TRIGGER_RADIUS,
        );
      }
    }
    expect(open).toBeGreaterThan(20);
  });

  it('the exit drop is outside the trigger, on open ground on the stair', () => {
    expect(EXIT_DROP.z).toBeLessThan(DOOR.z - DOOR_TRIGGER_RADIUS);
    expect(isBlocked(SEED, EXIT_DROP.x, EXIT_DROP.z, 0.9)).toBe(false);
    expect(idolHits(EXIT_DROP.x, EXIT_DROP.z, 1.2)).toBe(false);
  });
});

describe('a player comes down the stair and enters the Basin', () => {
  it('crest to trigger, then the exit drop and back up the knoll', () => {
    const sim = makeSim();
    const p = sim.player;
    place(sim, APPROACH.x, APPROACH.z, 0);
    // down the stair to the fire bowls
    expect(walkTo(sim, DOOR.x, DOOR.z - 4.5, 0.8, 400), 'reached the stair foot').toBe(true);
    // aim past the door: the walk ends the moment the trigger takes it
    walkTo(sim, DOOR.x, DOOR.z + 6, 0.5, 400);
    expect(p.pos.x, 'walked into the instance').toBeGreaterThan(DUNGEON_X_THRESHOLD);
    const exit = [...sim.entities.values()].find((e) => e.templateId === 'dungeon_exit');
    expect(exit).toBeDefined();
    if (!exit) return;
    place(sim, exit.pos.x, exit.pos.z + 1.2, Math.PI);
    sim.tick();
    expect(p.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    expect(Math.hypot(p.pos.x - EXIT_DROP.x, p.pos.z - EXIT_DROP.z)).toBeLessThan(1.5);
    expect(isBlocked(SEED, p.pos.x, p.pos.z, PLAYER_BODY_RADIUS)).toBe(false);
    expect(walkTo(sim, APPROACH.x, APPROACH.z, 0.8, 800), 'back up to the crest').toBe(true);
  });
});

describe('the Blender model sits in the ground the sim walks on', () => {
  it('no footing floats over the ground under it', () => {
    const base = terrainHeight(DOOR.x, DOOR.z, SEED);
    expect(WILDHEART_BASIN_ENTRANCE_FOOTINGS.map((f) => f.name)).toEqual([
      'head',
      'muzzle',
      'brazier_w',
      'brazier_e',
      'tusk_w',
      'tusk_e',
      'fallen_ear',
    ]);
    for (const f of WILDHEART_BASIN_ENTRANCE_FOOTINGS) {
      const c = Math.cos(f.rot);
      const s = Math.sin(f.rot);
      let lowest = Infinity;
      for (const [u, v] of [
        [0, 0],
        [-f.hw, -f.hd],
        [f.hw, -f.hd],
        [f.hw, f.hd],
        [-f.hw, f.hd],
      ]) {
        const x = DOOR.x + f.lx + u * c + v * s;
        const z = DOOR.z + f.lz - u * s + v * c;
        lowest = Math.min(lowest, groundHeight(x, z, SEED) - base);
      }
      // cut under the lowest of its centre and four corners, and never absurdly deep
      expect(lowest - f.bottom, f.name).toBeGreaterThan(0.15);
      expect(lowest - f.bottom, f.name).toBeLessThan(1.5);
    }
  });

  it('every collider row is well formed and stays inside the set piece', () => {
    expect(WILDHEART_BASIN_ENTRANCE_COLLIDERS.map((r) => r.name)).toEqual([
      'head',
      'muzzle_w',
      'muzzle_e',
      'brazier_w',
      'brazier_e',
      'tusk_w',
      'tusk_e',
      'fallen_ear',
    ]);
    for (const r of WILDHEART_BASIN_ENTRANCE_COLLIDERS) {
      expect(Math.hypot(r.lx, r.lz), r.name).toBeLessThan(12);
      if (r.type === 'obb') {
        expect(r.hw, r.name).toBeGreaterThan(0.1);
        expect(r.hd, r.name).toBeGreaterThan(0.1);
      } else {
        expect(r.r, r.name).toBeGreaterThan(0.3);
      }
    }
    // the head stands eight character heights over the door, the muzzle four
    expect(row('head').top).toBeGreaterThan(14);
    expect(row('muzzle_w').top).toBeGreaterThan(7);
    expect(row('muzzle_w').lx).toBeCloseTo(-row('muzzle_e').lx, 6);
  });

  it('the camera tops are seated on the door height', () => {
    const base = terrainHeight(DOOR.x, DOOR.z, SEED);
    const built = wildheartBasinEntranceColliders(SEED, DOOR);
    expect(built).toHaveLength(WILDHEART_BASIN_ENTRANCE_COLLIDERS.length);
    built.forEach((c, i) => {
      const r = WILDHEART_BASIN_ENTRANCE_COLLIDERS[i];
      expect(c.x).toBeCloseTo(DOOR.x + r.lx, 9);
      expect(c.z).toBeCloseTo(DOOR.z + r.lz, 9);
      expect(c.cameraTopY).toBeCloseTo(base + r.top, 9);
      expect(c.type).toBe(r.type);
    });
  });
});

const near80 = (x: number, z: number) => Math.hypot(x - DOOR.x, z - DOOR.z) < 80;

describe('the Jaguar Maw walls nothing in', () => {
  it('the palms it stands on are cleared, and no other palm, tree or rock is inside a collider', () => {
    expect(WILDHEART_BASIN_ENTRANCE_CLEARED_SCATTER).toHaveLength(2);
    for (const spot of WILDHEART_BASIN_ENTRANCE_CLEARED_SCATTER) {
      expect(isExcludedDecoration(spot.x, spot.z)).toBe(true);
      expect(Math.hypot(spot.x - DOOR.x, spot.z - DOOR.z)).toBeLessThan(14);
    }
    const palms = reachPalmSpots(SEED);
    // the guard is not vacuous: the strand still has its palms, two of them near the stair
    expect(palms.length).toBeGreaterThan(250);
    expect(palms.filter((p) => Math.hypot(p.x - DOOR.x, p.z - DOOR.z) < 26)).toHaveLength(2);
    for (const p of palms) {
      expect(idolHits(p.x, p.z, p.r + 0.4), `palm at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(
        false,
      );
      for (const spot of WILDHEART_BASIN_ENTRANCE_CLEARED_SCATTER) {
        expect(Math.hypot(p.x - spot.x, p.z - spot.z)).toBeGreaterThan(1.2);
      }
    }
    const scatter = generateDecorationsInBounds(SEED, {
      minX: DOOR.x - 30,
      maxX: DOOR.x + 30,
      minZ: DOOR.z - 30,
      maxZ: DOOR.z + 30,
    });
    for (const d of scatter) {
      expect(idolHits(d.x, d.z, 0.6), `${d.kind} at ${d.x.toFixed(1)},${d.z.toFixed(1)}`).toBe(
        false,
      );
    }
  });

  it('no NPC or gather node stands inside a collider of the idol', () => {
    for (const npc of Object.values(NPCS)) {
      if (!near80(npc.pos.x, npc.pos.z)) continue;
      expect(idolHits(npc.pos.x, npc.pos.z, 0.6), npc.id).toBe(false);
    }
    for (const node of GATHER_NODES) {
      if (!near80(node.pos.x, node.pos.z)) continue;
      expect(idolHits(node.pos.x, node.pos.z, 1.5), node.id).toBe(false);
    }
  });

  it('no mob of a fresh world spawns inside a collider of the idol', () => {
    const sim = makeSim();
    let mobs = 0;
    for (const e of sim.entities.values()) {
      if (e.kind !== 'mob' || !near80(e.pos.x, e.pos.z)) continue;
      mobs++;
      expect(
        idolHits(e.pos.x, e.pos.z, 0.3),
        `${e.templateId} at ${e.pos.x.toFixed(1)},${e.pos.z.toFixed(1)}`,
      ).toBe(false);
    }
    // the Idol Guardian in its ring of columns is a neighbour
    expect(mobs).toBeGreaterThanOrEqual(1);
  });
});
