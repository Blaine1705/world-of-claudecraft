// A mob's way round a wall (src/sim/mob/chase_route.ts, mob/route_search.ts):
// in a real claimed HEROIC Hollow Crypt an Ossuary Warrior whose target stands
// across the Undercroft Grille's curtain wall walks through the gate instead
// of standing against the wall until the instance hold phases it through. With
// the gate shut there is no way round, and the stall, the hold and the phase
// rule exactly as before.
//
// The second half pins what keeps the search affordable on the server's tick
// and what keeps it from being farmed: the node cap, the tick budget, the
// throttle that outlives the path, the backoff on failure, the pack's shared
// "no route", and the watchdog on a route that stops making headway. Costs are
// read off the sim's own per-tick tallies (Sim.mobScanCounters), never a clock.

import { describe, expect, it, vi } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { MOBS } from '../src/sim/data';
import { DAWNHOLD, DAWNHOLD_GATES } from '../src/sim/dawnhold_layout';
import { createMob } from '../src/sim/entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import {
  isPinnedInPlace,
  PIN_PHASE_SECONDS,
  pinInPlace,
} from '../src/sim/instances/instance_combat_hold';
import {
  chaseRouteFor,
  followChaseRoute,
  ROUTE_AFTER_STALL_SECONDS,
  ROUTE_DENIED_TICKS,
  ROUTE_MAX_TRIES,
  ROUTE_NODES_PER_PLAN,
  ROUTE_NODES_PER_TICK,
  ROUTE_REPLAN_TICKS,
  ROUTE_STUCK_TICKS,
  ROUTE_TRY_FORGIVE_TICKS,
  routesHere,
} from '../src/sim/mob/chase_route';
import { CHASE_STALL_TIMEOUT } from '../src/sim/mob/reachability';
import { searchRoute } from '../src/sim/mob/route_search';
import { resetMobScanCounters } from '../src/sim/mob/scan_counters';
import { Sim } from '../src/sim/sim';
import { addThreat } from '../src/sim/threat';
import { DT, dist2d, type Entity } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';
import { cryptFight, type Fight, put, tick } from './helpers/crypt_boss_fight';

vi.setConfig({ testTimeout: 240_000 });

const WARRIOR = 'crypt_ossuary_warrior';
const ADEPT = 'crypt_gravecaller_adept';
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
  /** Tallies over every tick the scene ran (Sim.mobScanCounters). */
  plans: number;
  failed: number;
  maxNodes: number;
}

function spawn(f: Fight, templateId: string, at: { x: number; z: number }): Entity {
  const template = MOBS[templateId];
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
  return mob;
}

function scene(
  keep: ReadonlySet<string> = new Set(),
  at = NORTH,
  tank = SOUTH,
  templateId = WARRIOR,
): Scene {
  // Morthen stays entombed: dead, the fixture would raise his Knellwyrm into
  // the scene as a second engaged mob.
  const f = cryptFight('heroic', 0, new Set([...keep, 'morthen']));
  put(f, f.tank, tank.x, tank.z);
  // The living packs of a shut-gate scene stay asleep.
  f.tank.devNoAggro = true;
  // One tick so the claim's gates are published to collision.
  tick(f);
  const mob = spawn(f, templateId, at);
  return { f, mob, keep: () => put(f, f.tank, tank.x, tank.z), plans: 0, failed: 0, maxNodes: 0 };
}

function step(s: Scene): void {
  tick(s.f, s.keep);
  const c = s.f.sim.mobScanCounters;
  s.plans += c.routePlans;
  s.failed += c.routeFailed;
  s.maxNodes = Math.max(s.maxNodes, c.routeNodes);
}

function local(s: Scene, mob: Entity = s.mob): { x: number; z: number } {
  return { x: mob.pos.x - s.f.ox, z: mob.pos.z - s.f.oz };
}

function inWall(s: Scene, mob: Entity = s.mob): boolean {
  return isBlocked(s.f.sim.cfg.seed, mob.pos.x, mob.pos.z, 0.35);
}

function meleeHits(s: Scene): number {
  return s.f.hits.filter((h) => h.targetId === s.f.tank.id).length;
}

/** Put the sim's clock on this mob's next allowed plan tick, with a fresh
 *  per-tick tally (the sim resets it at the top of a tick; a direct call here
 *  stands in for that). */
function toPlanTick(s: Scene, mob: Entity = s.mob): void {
  const clock = s.f.sim as unknown as { tickCount: number };
  const at = chaseRouteFor(s.f.sim.ctx, mob, s.f.tank).planAt;
  clock.tickCount = Math.max(clock.tickCount + 1, at);
  resetMobScanCounters(s.f.sim.mobScanCounters as never);
}

describe('a melee mob whose target stands across a wall with a doorway', () => {
  it('walks through the doorway and fights, never held and never through the wall', () => {
    const s = scene();
    expect(routesHere(s.f.sim.ctx, s.mob, s.f.tank)).toBe(true);
    let crossedAtX: number | null = null;
    let prevZ = local(s).z;
    let worstStall = 0;
    let reached = -1;
    for (let i = 0; i < 20 / DT && reached < 0; i++) {
      step(s);
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
    // It turned for the gate well inside the stall window: the short pause at
    // the wall and at most one re-plan period for its slot, never the five
    // seconds that end in the hold.
    expect(worstStall).toBeGreaterThanOrEqual(ROUTE_AFTER_STALL_SECONDS - DT);
    expect(worstStall).toBeLessThan(ROUTE_AFTER_STALL_SECONDS + ROUTE_REPLAN_TICKS * DT + 0.2);
    // The whole detour (about 35 yd) took walking time, not the 15 s of the
    // old stall, hold and phase.
    expect(reached * DT).toBeLessThan(11);
    expect(dist2d(s.mob.pos, s.f.tank.pos)).toBeLessThan(6);
    // One search, inside its cap and the tick's budget.
    expect(s.plans).toBe(1);
    expect(s.failed).toBe(0);
    expect(s.maxNodes).toBeGreaterThan(0);
    expect(s.maxNodes).toBeLessThanOrEqual(ROUTE_NODES_PER_PLAN);
  });

  it('is deterministic from the seed', () => {
    const walk = (): string => {
      const s = scene();
      const trail: string[] = [];
      for (let i = 0; i < 8 / DT; i++) {
        step(s);
        if (i % 10 === 0) trail.push(`${s.mob.pos.x.toFixed(4)},${s.mob.pos.z.toFixed(4)}`);
      }
      return `${trail.join('|')} plans ${s.plans} nodes ${s.maxNodes}`;
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
      step(s);
      offLine = Math.max(offLine, Math.abs(local(s).x - start.x));
      expect(s.mob.chaseRoute).toBeUndefined();
      expect(s.mob.chaseStall).toBe(0);
    }
    expect(meleeHits(s)).toBeGreaterThan(0);
    expect(offLine).toBeLessThan(0.5);
    expect(s.plans).toBe(0);
  });
});

describe('a melee mob with no way round', () => {
  it('stalls, holds immune and phases exactly as before, on a few bounded searches', () => {
    // A cloister Necromancer left alive keeps the Undercroft Grille shut.
    const s = scene(new Set(['crypt_gravecaller_necromancer']));
    let pinnedAt = -1;
    let through = -1;
    let pathWhenPinned: number | null = null;
    for (let i = 0; i < (CHASE_STALL_TIMEOUT + PIN_PHASE_SECONDS + 6) / DT && through < 0; i++) {
      step(s);
      if (pinnedAt < 0 && isPinnedInPlace(s.mob)) {
        pinnedAt = i * DT;
        pathWhenPinned = s.mob.chaseRoute?.path.length ?? 0;
      }
      if (meleeHits(s) > 0) through = i * DT;
      expect(s.mob.aiState).not.toBe('evade');
    }
    // The stall window, measured from when it reached the wall.
    expect(pinnedAt).toBeGreaterThan(CHASE_STALL_TIMEOUT);
    expect(pinnedAt).toBeLessThan(CHASE_STALL_TIMEOUT + 2.5);
    // Held, it carries no path to walk back to.
    expect(pathWhenPinned).toBe(0);
    // Then the hold's grace, then it comes through and fights.
    expect(through).toBeGreaterThan(pinnedAt + PIN_PHASE_SECONDS - 0.5);
    expect(local(s).z).toBeLessThan(WALL_SOUTH_FACE);
    // Every search failed, each inside the cap, and they backed off: one at
    // the wall, one two seconds later, never one a second.
    expect(s.plans).toBeGreaterThanOrEqual(1);
    expect(s.plans).toBeLessThanOrEqual(3);
    expect(s.failed).toBe(s.plans);
    expect(s.maxNodes).toBeLessThanOrEqual(ROUTE_NODES_PER_PLAN);
  });
});

describe('where routes are planned', () => {
  it('only for a mob and a target in one claimed instance slot', () => {
    const s = scene();
    expect(routesHere(s.f.sim.ctx, s.mob, s.f.tank)).toBe(true);
    // The same mob out in the open world, or its target there: no route.
    const there = { ...s.mob, pos: { x: 100, y: 0, z: 100 } } as Entity;
    expect(routesHere(s.f.sim.ctx, there, s.f.tank)).toBe(false);
    const away = { ...s.f.tank, pos: { x: 100, y: 0, z: 100 } } as Entity;
    expect(routesHere(s.f.sim.ctx, s.mob, away)).toBe(false);
  });

  it('an open-world melee mob walled off from its target plans nothing and still evades', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: false });
    const player = sim.player;
    const gate = (DAWNHOLD_GATES.main.a0 + DAWNHOLD_GATES.main.a1) / 2;
    // Inside Dawnhold's east curtain wall, 18 yd from its one gate.
    player.pos = sim.ctx.groundPos(DAWNHOLD.wx1 - 6, gate + 18);
    player.prevPos = { ...player.pos };
    player.maxHp = 1e9;
    player.hp = 1e9;
    sim.ctx.rebucket(player);
    const wolf = createMob(
      sim.ctx.nextId++,
      MOBS.forest_wolf,
      5,
      sim.ctx.groundPos(DAWNHOLD.wx1 + 8, gate + 18),
    );
    wolf.hostile = true;
    wolf.maxHp = 1e7;
    wolf.hp = 1e7;
    sim.ctx.addEntity(wolf);
    wolf.aggroTargetId = player.id;
    wolf.inCombat = true;
    wolf.aiState = 'chase';
    wolf.leashAnchor = { ...wolf.pos };
    addThreat(wolf, player.id, 100);
    let plans = 0;
    let evaded = false;
    for (let i = 0; i < (CHASE_STALL_TIMEOUT + 6) / DT && !evaded; i++) {
      player.hp = player.maxHp;
      sim.tick();
      plans += sim.mobScanCounters.routePlans;
      if ((wolf.aiState as string) === 'evade') evaded = true;
      // The wall holds it: it never gets inside.
      expect(wolf.pos.x).toBeGreaterThan(DAWNHOLD.wx1);
    }
    expect(evaded).toBe(true);
    expect(plans).toBe(0);
    expect(wolf.chaseRoute).toBeUndefined();
  });
});

describe('the search itself', () => {
  it('stops at its node cap, found or not, and a perch is no route', () => {
    const s = scene(new Set(['crypt_gravecaller_necromancer']));
    const opts = {
      seed: s.f.sim.cfg.seed,
      margin: 24,
      maxNodes: ROUTE_NODES_PER_PLAN,
      swim: false,
      riftToken: 0,
    };
    const at = (p: { x: number; z: number }) => ({ x: s.f.ox + p.x, z: s.f.oz + p.z });
    // The wall with its gate shut: nothing, and no more than the cap judged.
    const shut = searchRoute(at(NORTH), at(SOUTH), opts);
    expect(shut.found).toBe(false);
    expect(shut.path).toEqual([]);
    expect(shut.nodes).toBeGreaterThan(100);
    expect(shut.nodes).toBeLessThanOrEqual(ROUTE_NODES_PER_PLAN);
    // A tighter cap is obeyed to the cell.
    const tight = searchRoute(at(NORTH), at(SOUTH), { ...opts, maxNodes: 120 });
    expect(tight.found).toBe(false);
    expect(tight.nodes).toBe(120);
    // A target standing in the middle of the Ossuary Monument (a 5 yd pillar):
    // no cell a body can stand on is within reach of it, so there is no route
    // to the foot of the perch.
    const perch = searchRoute(at({ x: 0, z: -38.5 }), at({ x: 0, z: -30 }), opts);
    expect(perch.found).toBe(false);
    // A window wider than the search accepts is refused before a cell is judged.
    const wide = searchRoute(at({ x: 0, z: -100 }), at({ x: 0, z: 0 }), opts);
    expect(wide).toEqual({ found: false, nodes: 0, path: [] });
    // And a clear straight line is one waypoint: nothing to walk round.
    const clear = searchRoute(at({ x: 13, z: -44 }), at({ x: 13, z: -20 }), opts);
    expect(clear.found).toBe(true);
    expect(clear.path).toHaveLength(1);
  });

  it('finds the doorway, and the same route every time', () => {
    const s = scene();
    const opts = {
      seed: s.f.sim.cfg.seed,
      margin: 24,
      maxNodes: ROUTE_NODES_PER_PLAN,
      swim: false,
      riftToken: 0,
    };
    const from = { x: s.f.ox + NORTH.x, z: s.f.oz + NORTH.z };
    const to = { x: s.f.ox + SOUTH.x, z: s.f.oz + SOUTH.z };
    const a = searchRoute(from, to, opts);
    expect(a.found).toBe(true);
    expect(a.path.length).toBeGreaterThan(1);
    expect(a.path[a.path.length - 1]).toEqual(to);
    // Every waypoint stands clear of the wall, and one of them is in the gateway.
    for (const w of a.path.slice(0, -1)) expect(isBlocked(opts.seed, w.x, w.z, 0.5)).toBe(false);
    expect(a.path.some((w) => Math.abs(w.x - s.f.ox) < 7 && Math.abs(w.z - s.f.oz - 21) < 4)).toBe(
      true,
    );
    // Scratch buffers carry nothing over: a different search in between, then
    // the same one again, gives the same answer.
    searchRoute(to, { x: s.f.ox, z: s.f.oz - 30 }, opts);
    expect(searchRoute(from, to, opts)).toEqual(a);
  });
});

describe('the route guards', () => {
  it('spends at most its tries, and nothing the target does hands them back: only time does', () => {
    const s = scene();
    const ctx = s.f.sim.ctx;
    let walked = 0;
    for (let round = 0; round < ROUTE_MAX_TRIES + 3; round++) {
      // Back on the far side with its path thrown away; the target shuffles
      // 4 yd each round (a doorway dance), which buys nothing.
      put(s.f, s.mob, NORTH.x, NORTH.z);
      put(s.f, s.f.tank, SOUTH.x + (round % 2) * 4, SOUTH.z);
      if (s.mob.chaseRoute) s.mob.chaseRoute.path = [];
      toPlanTick(s);
      if (followChaseRoute(ctx, s.mob, s.f.tank, 7)) walked++;
    }
    expect(walked).toBe(ROUTE_MAX_TRIES);
    expect(s.mob.chaseRoute?.tries).toBe(ROUTE_MAX_TRIES);
    // One forgiveness period later exactly one plan is back.
    const clock = s.f.sim as unknown as { tickCount: number };
    clock.tickCount = (s.mob.chaseRoute?.triesAt ?? 0) + ROUTE_TRY_FORGIVE_TICKS;
    put(s.f, s.mob, NORTH.x, NORTH.z);
    if (s.mob.chaseRoute) s.mob.chaseRoute.path = [];
    toPlanTick(s);
    expect(followChaseRoute(ctx, s.mob, s.f.tank, 7)).toBe(true);
    put(s.f, s.mob, NORTH.x, NORTH.z);
    if (s.mob.chaseRoute) s.mob.chaseRoute.path = [];
    toPlanTick(s);
    expect(followChaseRoute(ctx, s.mob, s.f.tank, 7)).toBe(false);
  });

  it('a failed search counts against the tries and doubles the wait each time', () => {
    const s = scene(new Set(['crypt_gravecaller_necromancer']));
    const ctx = s.f.sim.ctx;
    const clock = s.f.sim as unknown as { tickCount: number };
    const waits: number[] = [];
    for (let k = 0; k < 3; k++) {
      toPlanTick(s);
      // No packmate's word to take: each of these is its own search.
      s.f.tank.routeDenied = undefined;
      const before = s.mob.chaseRoute?.tries ?? 0;
      expect(followChaseRoute(ctx, s.mob, s.f.tank, 7)).toBe(false);
      expect(s.f.sim.mobScanCounters.routePlans).toBe(1);
      expect(s.f.sim.mobScanCounters.routeFailed).toBe(1);
      // Charged like a found route (a try the wait may since have handed back).
      expect(s.mob.chaseRoute?.tries).toBeGreaterThanOrEqual(1);
      expect(s.mob.chaseRoute?.tries).toBeLessThanOrEqual(before + 1);
      expect(s.mob.chaseRoute?.fails).toBe(k + 1);
      waits.push((s.mob.chaseRoute?.planAt ?? 0) - clock.tickCount);
      // Asked again before its wait is out, it searches nothing.
      resetMobScanCounters(s.f.sim.mobScanCounters as never);
      clock.tickCount += 1;
      expect(followChaseRoute(ctx, s.mob, s.f.tank, 7)).toBe(false);
      expect(s.f.sim.mobScanCounters.routePlans).toBe(0);
    }
    // Two seconds, four, eight (each rounded up to the mob's own slot).
    for (let k = 0; k < waits.length; k++) {
      const base = ROUTE_REPLAN_TICKS * 2 ** (k + 1);
      expect(waits[k]).toBeGreaterThanOrEqual(base);
      expect(waits[k]).toBeLessThan(base + ROUTE_REPLAN_TICKS);
    }
  });

  it('a pack takes the word of the mob that asked: one failed search, not one a mob', () => {
    const s = scene(new Set(['crypt_gravecaller_necromancer']));
    const ctx = s.f.sim.ctx;
    const pack = [s.mob];
    for (let i = 1; i < 6; i++)
      pack.push(spawn(s.f, WARRIOR, { x: NORTH.x + i * 1.2, z: NORTH.z }));
    const clock = s.f.sim as unknown as { tickCount: number };
    // All of them due on this tick.
    clock.tickCount += ROUTE_REPLAN_TICKS * 2;
    for (const mob of pack) chaseRouteFor(ctx, mob, s.f.tank).planAt = clock.tickCount;
    resetMobScanCounters(s.f.sim.mobScanCounters as never);
    for (const mob of pack) expect(followChaseRoute(ctx, mob, s.f.tank, 7)).toBe(false);
    const tally = s.f.sim.mobScanCounters;
    expect(tally.routePlans).toBe(1);
    expect(tally.routeFailed).toBe(1);
    expect(s.f.tank.routeDenied?.tick).toBe(clock.tickCount);
    // Every one of them is charged a try and backs off, searched or not.
    for (const mob of pack) {
      expect(mob.chaseRoute?.tries).toBeGreaterThanOrEqual(1);
      expect(mob.chaseRoute?.fails).toBeGreaterThanOrEqual(1);
      expect(mob.chaseRoute?.planAt ?? 0).toBeGreaterThan(clock.tickCount + ROUTE_REPLAN_TICKS);
    }
    // The word goes stale: a few seconds on, a mob searches for itself again.
    clock.tickCount += ROUTE_DENIED_TICKS + 1;
    const late = spawn(s.f, WARRIOR, { x: NORTH.x - 1.5, z: NORTH.z });
    chaseRouteFor(ctx, late, s.f.tank).planAt = clock.tickCount;
    resetMobScanCounters(s.f.sim.mobScanCounters as never);
    followChaseRoute(ctx, late, s.f.tank, 7);
    expect(s.f.sim.mobScanCounters.routePlans).toBe(1);
  });

  it('the whole sim judges no more than its budget of cells in one tick, and nobody is starved', () => {
    // Twelve casters north of the wall, their target south of it: every one of
    // them needs the route through the gate.
    const s = scene(new Set(), { x: 9, z: 27 }, SOUTH, ADEPT);
    const pack = [s.mob];
    for (let i = 1; i < 12; i++)
      pack.push(spawn(s.f, ADEPT, { x: 9 + (i % 4) * 2.4, z: 27 + Math.floor(i / 4) * 2.4 }));
    const seeing = (): number =>
      pack.filter((m) => m.aiState === 'attack' && s.f.sim.ctx.hasLineOfSight(m, s.f.tank)).length;
    let maxPlansInTick = 0;
    for (let i = 0; i < 30 / DT && seeing() < pack.length; i++) {
      step(s);
      maxPlansInTick = Math.max(maxPlansInTick, s.f.sim.mobScanCounters.routePlans);
      // The budget, every tick.
      expect(s.f.sim.mobScanCounters.routeNodes).toBeLessThanOrEqual(ROUTE_NODES_PER_TICK);
      for (const m of pack) {
        expect(inWall(s, m)).toBe(false);
        expect(isPinnedInPlace(m)).toBe(false);
      }
    }
    // All twelve found their sight line.
    expect(seeing()).toBe(pack.length);
    expect(s.maxNodes).toBeGreaterThan(0);
    expect(s.maxNodes).toBeLessThanOrEqual(ROUTE_NODES_PER_TICK);
    // Spread over their slots: never the whole pack on one tick.
    expect(maxPlansInTick).toBeLessThanOrEqual(3);
    expect(s.plans).toBeGreaterThanOrEqual(pack.length);
  });

  it('drops a route that stops bringing it nearer its waypoint, and then chases straight', () => {
    // Open ground between the warrior and its target, and a route whose next
    // waypoint lies in the heart of the Ossuary Monument, where no body goes.
    const s = scene(new Set(), { x: 13, z: -44 }, { x: 13, z: -20 });
    const ctx = s.f.sim.ctx;
    const o = { x: s.f.ox, z: s.f.oz };
    followChaseRoute(ctx, s.mob, s.f.tank, 7);
    const route = s.mob.chaseRoute;
    if (!route) throw new Error('no route record');
    route.path = [
      { x: o.x + 0, y: 0, z: o.z - 30 },
      { x: s.f.tank.pos.x, y: 0, z: s.f.tank.pos.z },
    ];
    route.planAt = s.f.sim.tickCount + 100000;
    route.stuckDist = Infinity;
    route.stuckAt = s.f.sim.tickCount;
    let droppedAt = -1;
    let stillSince = -1;
    let longestStill = 0;
    let prev = local(s);
    for (let i = 0; i < 20 / DT && meleeHits(s) === 0; i++) {
      step(s);
      const at = local(s);
      const moved = Math.hypot(at.x - prev.x, at.z - prev.z) > 1e-3;
      prev = at;
      if (!moved) {
        if (stillSince < 0) stillSince = i;
        longestStill = Math.max(longestStill, i - stillSince + 1);
      } else stillSince = -1;
      if (droppedAt < 0 && (s.mob.chaseRoute?.path.length ?? 0) === 0) droppedAt = i;
      expect(s.mob.aiState).not.toBe('evade');
      expect(isPinnedInPlace(s.mob)).toBe(false);
    }
    // The watchdog let go of it, counted it as a failure, and it went straight.
    expect(droppedAt).toBeGreaterThan(0);
    expect(s.mob.chaseRoute?.fails).toBeGreaterThanOrEqual(1);
    expect(longestStill).toBeLessThanOrEqual(ROUTE_STUCK_TICKS + 2);
    expect(meleeHits(s)).toBeGreaterThan(0);
  });

  it('a mob the instance hold pins carries no path', () => {
    const s = scene();
    followChaseRoute(s.f.sim.ctx, s.mob, s.f.tank, 7);
    const route = s.mob.chaseRoute;
    if (!route) throw new Error('no route record');
    route.path = [
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 2 },
    ];
    const tries = route.tries;
    pinInPlace(s.mob);
    expect(s.mob.chaseRoute?.path).toEqual([]);
    // The throttle is not forgiven by the hold.
    expect(s.mob.chaseRoute?.tries).toBe(tries);
  });
});
