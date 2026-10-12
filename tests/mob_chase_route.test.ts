// A melee mob's way round a wall (src/sim/mob/chase_route.ts
// chaseAroundObstacles): in a real claimed HEROIC Hollow Crypt an Ossuary
// Warrior whose target stands across the Undercroft Grille's curtain wall
// walks through the gate instead of standing against the wall until the
// instance hold phases it through. With the gate shut there is no way round,
// and the stall, the hold and the phase rule exactly as before.

import { describe, expect, it, vi } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import { isPinnedInPlace, PIN_PHASE_SECONDS } from '../src/sim/instances/instance_combat_hold';
import {
  followChaseRoute,
  ROUTE_AFTER_STALL_SECONDS,
  ROUTE_MAX_TRIES,
  ROUTE_REPLAN_TICKS,
} from '../src/sim/mob/chase_route';
import { CHASE_STALL_TIMEOUT } from '../src/sim/mob/reachability';
import { addThreat } from '../src/sim/threat';
import { DT, dist2d, type Entity } from '../src/sim/types';
import { cryptFight, type Fight, put, tick } from './helpers/crypt_boss_fight';

vi.setConfig({ testTimeout: 240_000 });

const WARRIOR = 'crypt_ossuary_warrior';
/** North of the curtain wall (z 21, x 7 to 46), and south of it. */
const NORTH = { x: 18, z: 30 };
const SOUTH = { x: 18, z: 12 };
/** The wall's faces along z. */
const WALL_NORTH_FACE = 22.2;
const WALL_SOUTH_FACE = 19.8;

interface Scene {
  f: Fight;
  mob: Entity;
  keep: () => void;
}

function scene(keep: ReadonlySet<string> = new Set(), at = NORTH, tank = SOUTH): Scene {
  const f = cryptFight('heroic', 0, keep);
  put(f, f.tank, tank.x, tank.z);
  // The living packs of a shut-gate scene stay asleep.
  f.tank.devNoAggro = true;
  // One tick so the claim's gates are published to collision.
  tick(f);
  const template = MOBS[WARRIOR];
  const mob = createMob(
    f.sim.ctx.nextId++,
    mobTemplateForDungeonDifficulty(template, 'hollow_crypt', f.inst.difficulty),
    mobLevelForDungeonDifficulty('hollow_crypt', f.inst.difficulty, template.minLevel),
    f.sim.ctx.groundPos(f.ox + at.x, f.oz + at.z),
  );
  applyDungeonMobTuning(mob, 'hollow_crypt', f.inst.difficulty);
  mob.dungeonPackId = 'route';
  mob.maxHp = 1e7;
  mob.hp = 1e7;
  f.sim.ctx.addEntity(mob);
  f.inst.mobIds.push(mob.id);
  mob.aggroTargetId = f.tank.id;
  mob.inCombat = true;
  mob.aiState = 'chase';
  mob.leashAnchor = { ...mob.pos };
  addThreat(mob, f.tank.id, 100);
  return { f, mob, keep: () => put(f, f.tank, tank.x, tank.z) };
}

function local(s: Scene): { x: number; z: number } {
  return { x: s.mob.pos.x - s.f.ox, z: s.mob.pos.z - s.f.oz };
}

function inWall(s: Scene): boolean {
  return isBlocked(s.f.sim.cfg.seed, s.mob.pos.x, s.mob.pos.z, 0.35);
}

function meleeHits(s: Scene): number {
  return s.f.hits.filter((h) => h.targetId === s.f.tank.id).length;
}

describe('a melee mob whose target stands across a wall with a doorway', () => {
  it('walks through the doorway and fights, never held and never through the wall', () => {
    const s = scene();
    let crossedAtX: number | null = null;
    let prevZ = local(s).z;
    let worstStall = 0;
    let reached = -1;
    for (let i = 0; i < 20 / DT && reached < 0; i++) {
      tick(s.f, s.keep);
      const at = local(s);
      if (crossedAtX === null && prevZ > 21 && at.z <= 21) crossedAtX = at.x;
      prevZ = at.z;
      worstStall = Math.max(worstStall, s.mob.chaseStall);
      expect(inWall(s)).toBe(false);
      // Inside the wall's thickness it is only ever in the gateway.
      if (at.z < WALL_NORTH_FACE && at.z > WALL_SOUTH_FACE) expect(Math.abs(at.x)).toBeLessThan(7);
      expect(isPinnedInPlace(s.mob)).toBe(false);
      expect(s.mob.aiState).not.toBe('evade');
      if (meleeHits(s) > 0) reached = i;
    }
    expect(reached).toBeGreaterThan(0);
    expect(crossedAtX).not.toBeNull();
    expect(Math.abs(crossedAtX as unknown as number)).toBeLessThan(7);
    // It turned for the gate well inside the stall window: a short pause at
    // the wall, never the five seconds that end in the hold.
    expect(worstStall).toBeGreaterThanOrEqual(ROUTE_AFTER_STALL_SECONDS - DT);
    expect(worstStall).toBeLessThan(1);
    // The whole detour (about 35 yd) took walking time, not the 15 s of the
    // old stall, hold and phase.
    expect(reached * DT).toBeLessThan(10);
    expect(dist2d(s.mob.pos, s.f.tank.pos)).toBeLessThan(6);
  });

  it('is deterministic from the seed', () => {
    const walk = (): string => {
      const s = scene();
      const trail: string[] = [];
      for (let i = 0; i < 8 / DT; i++) {
        tick(s.f, s.keep);
        if (i % 10 === 0) trail.push(`${s.mob.pos.x.toFixed(4)},${s.mob.pos.z.toFixed(4)}`);
      }
      return trail.join('|');
    };
    expect(walk()).toBe(walk());
  });
});

describe('a melee mob with open ground ahead', () => {
  it('chases straight and never plans a route', () => {
    const s = scene(new Set(), { x: 13, z: -44 }, { x: 13, z: -20 });
    const start = local(s);
    let offLine = 0;
    for (let i = 0; i < 6 / DT && meleeHits(s) === 0; i++) {
      tick(s.f, s.keep);
      offLine = Math.max(offLine, Math.abs(local(s).x - start.x));
      expect(s.mob.chaseRoute).toBeUndefined();
      expect(s.mob.chaseStall).toBe(0);
    }
    expect(meleeHits(s)).toBeGreaterThan(0);
    expect(offLine).toBeLessThan(0.5);
  });
});

describe('a melee mob with no way round', () => {
  it('stalls, holds immune and phases exactly as before', () => {
    // A cloister Necromancer left alive keeps the Undercroft Grille shut.
    const s = scene(new Set(['crypt_gravecaller_necromancer']));
    let pinnedAt = -1;
    let through = -1;
    for (let i = 0; i < (CHASE_STALL_TIMEOUT + PIN_PHASE_SECONDS + 6) / DT && through < 0; i++) {
      tick(s.f, s.keep);
      if (pinnedAt < 0 && isPinnedInPlace(s.mob)) pinnedAt = i * DT;
      if (meleeHits(s) > 0) through = i * DT;
      expect(s.mob.aiState).not.toBe('evade');
    }
    // The stall window, measured from when it reached the wall.
    expect(pinnedAt).toBeGreaterThan(CHASE_STALL_TIMEOUT);
    expect(pinnedAt).toBeLessThan(CHASE_STALL_TIMEOUT + 2.5);
    // Then the hold's grace, then it comes through and fights.
    expect(through).toBeGreaterThan(pinnedAt + PIN_PHASE_SECONDS - 0.5);
    expect(local(s).z).toBeLessThan(WALL_SOUTH_FACE);
  });
});

describe('the route guards', () => {
  it('walks no more than the capped number of routes toward a target that has not moved', () => {
    const s = scene();
    const ctx = s.f.sim.ctx;
    const clock = s.f.sim as unknown as { tickCount: number };
    let planned = 0;
    for (let round = 0; round < ROUTE_MAX_TRIES + 2; round++) {
      // Back on the far side with its route thrown away, on its own plan slot
      // and past the throttle.
      put(s.f, s.mob, NORTH.x, NORTH.z);
      if (s.mob.chaseRoute) s.mob.chaseRoute.path = [];
      clock.tickCount += ROUTE_REPLAN_TICKS * 3;
      while (clock.tickCount % 4 !== s.mob.id % 4) clock.tickCount++;
      if (followChaseRoute(ctx, s.mob, s.f.tank, 7)) planned++;
    }
    expect(planned).toBe(ROUTE_MAX_TRIES);
    // The target steps away: the count starts again.
    put(s.f, s.f.tank, SOUTH.x + 6, SOUTH.z);
    put(s.f, s.mob, NORTH.x, NORTH.z);
    clock.tickCount += ROUTE_REPLAN_TICKS * 3;
    while (clock.tickCount % 4 !== s.mob.id % 4) clock.tickCount++;
    expect(followChaseRoute(ctx, s.mob, s.f.tank, 7)).toBe(true);
  });
});
