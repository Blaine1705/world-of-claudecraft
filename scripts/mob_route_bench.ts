// Benchmark for mob route planning and the line-of-sight rule (src/sim/mob/
// chase_route.ts, mob/cast_sight.ts). It PRINTS numbers; it asserts nothing
// about wall time (a loaded machine would make that a coin toss). The counters
// it prints beside them (plans and search nodes per tick, Sim.mobScanCounters)
// are deterministic and are what the route budget is judged by.
//
//   npx tsx scripts/mob_route_bench.ts
//
// Two worlds: the open world (Dawnhold's east curtain wall and its one gate,
// on the shipped seed) and a claimed heroic Hollow Crypt (the Undercroft
// Grille's curtain wall and the Ossuary Monument). Per world:
//   single plans   a clear line, a wall detour that exists, a search that
//                  fails on a perched target 6 yd away, and a failed search
//                  at the widest window the planner accepts;
//   whole ticks    a pack of 20 casters whose target steps out of sight, and
//                  10 casters with their target dancing across a doorway edge,
//                  each against the same scene with the target standing still.
// The single searches call the planner directly in both worlds, to price it;
// the mob AI itself plans routes only inside a claimed instance, so the open
// world's whole-tick rows show no search at all. A delve room is timed for the
// sight query alone (no route is planned in a delve).

import { DELVES, DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { DAWNHOLD, DAWNHOLD_GATES } from '../src/sim/dawnhold_layout';
import { createMob } from '../src/sim/entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import { claimedInstanceAt } from '../src/sim/instances/dungeons';
import { planChaseRoute } from '../src/sim/mob/chase_route';
import { Sim } from '../src/sim/sim';
import { addThreat } from '../src/sim/threat';
import type { Entity } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';

interface Spot {
  x: number;
  z: number;
}

interface World {
  name: string;
  sim: Sim;
  player: Entity;
  /** World origin of the scene's local coordinates. */
  ox: number;
  oz: number;
  spawn(templateId: string, at: Spot): Entity;
  /** Single-plan cases: where the mob stands and where its target does. */
  plans: { name: string; from: Spot; to: Spot }[];
  /** The pack scene: where the casters stand, a spot in sight, a spot hidden. */
  pack: { casters: (i: number, n: number) => Spot; seen: Spot; hidden: Spot };
  /** The doorway dance: casters, and the two spots the target hops between. */
  dance: { casters: (i: number, n: number) => Spot; a: Spot; b: Spot };
  caster: string;
}

function place(w: World, e: Entity, at: Spot): void {
  e.pos = w.sim.ctx.groundPos(w.ox + at.x, w.oz + at.z);
  e.prevPos = { ...e.pos };
  w.sim.ctx.rebucket(e);
}

function engage(mob: Entity, victim: Entity): void {
  mob.aggroTargetId = victim.id;
  mob.inCombat = true;
  mob.aiState = 'chase';
  mob.leashAnchor = { ...mob.pos };
  addThreat(mob, victim.id, 100);
}

function openWorld(): World {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: false });
  const player = sim.player;
  const gate = (DAWNHOLD_GATES.main.a0 + DAWNHOLD_GATES.main.a1) / 2;
  const wall = DAWNHOLD.wx1;
  const w: World = {
    name: 'open world (Dawnhold east wall)',
    sim,
    player,
    ox: 0,
    oz: 0,
    caster: 'corrupted_priest_malric',
    spawn(templateId, at) {
      const mob = createMob(sim.ctx.nextId++, MOBS[templateId], 10, sim.ctx.groundPos(at.x, at.z));
      mob.hostile = true;
      mob.maxHp = 1e7;
      mob.hp = 1e7;
      sim.ctx.addEntity(mob);
      return mob;
    },
    plans: [
      { name: 'clear line, 28 yd', from: { x: wall + 34, z: 905 }, to: { x: wall + 6, z: 905 } },
      {
        name: 'wall detour found (gate 18 yd aside)',
        from: { x: wall + 8, z: gate + 18 },
        to: { x: wall - 8, z: gate + 18 },
      },
      {
        name: 'failed: perched target 6 yd away',
        from: { x: wall + 6, z: gate + 18 },
        to: { x: wall, z: gate + 18 },
      },
      {
        name: 'failed: widest window (perched)',
        from: { x: wall + 30, z: gate + 43 },
        to: { x: wall, z: gate + 12 },
      },
    ],
    pack: {
      casters: (i) => ({ x: wall + 10 + (i % 5) * 2.2, z: gate + 10 + Math.floor(i / 5) * 2.2 }),
      seen: { x: wall + 26, z: gate + 14 },
      hidden: { x: wall - 8, z: gate + 14 },
    },
    dance: {
      casters: (i) => ({ x: wall + 12 + (i % 5) * 2.2, z: gate + 6 + Math.floor(i / 5) * 2.2 }),
      a: { x: wall - 6, z: gate },
      b: { x: wall - 6, z: gate + 9 },
    },
  };
  player.maxHp = 1e9;
  player.hp = 1e9;
  return w;
}

function crypt(shutGate: boolean): World {
  const sim = new Sim({ seed: 23, playerClass: 'warrior', autoEquip: false, devCommands: true });
  const player = sim.player;
  sim.chat('/dev level 20', player.id);
  sim.chat('/dev crypt enter heroic', player.id);
  const inst = claimedInstanceAt(sim.ctx, player.pos);
  if (!inst) throw new Error('no crypt claim');
  for (const id of inst.mobIds) {
    const e = sim.ctx.entities.get(id);
    if (!e || e.dead) continue;
    if (shutGate && e.templateId === 'crypt_gravecaller_necromancer') continue;
    sim.ctx.handleDeath(e, player);
  }
  player.devNoAggro = true;
  player.maxHp = 1e9;
  player.hp = 1e9;
  const o = instanceOrigin(DUNGEONS.hollow_crypt.index, inst.slot);
  sim.tick();
  sim.drainEvents();
  return {
    name: shutGate ? 'Hollow Crypt (grille shut)' : 'Hollow Crypt (grille open)',
    sim,
    player,
    ox: o.x,
    oz: o.z,
    caster: 'crypt_gravecaller_adept',
    spawn(templateId, at) {
      const template = MOBS[templateId];
      const mob = createMob(
        sim.ctx.nextId++,
        mobTemplateForDungeonDifficulty(template, 'hollow_crypt', inst.difficulty),
        mobLevelForDungeonDifficulty('hollow_crypt', inst.difficulty, template.minLevel),
        sim.ctx.groundPos(o.x + at.x, o.z + at.z),
      );
      applyDungeonMobTuning(mob, 'hollow_crypt', inst.difficulty);
      mob.dungeonPackId = 'bench';
      mob.maxHp = 1e7;
      mob.hp = 1e7;
      sim.ctx.addEntity(mob);
      inst.mobIds.push(mob.id);
      return mob;
    },
    plans: [
      { name: 'clear line, 26 yd', from: { x: 13, z: -44 }, to: { x: 13, z: -18 } },
      { name: 'monument detour found', from: { x: 0, z: -44 }, to: { x: 0, z: -18 } },
      {
        name: shutGate ? 'failed: wall with its gate shut' : 'wall detour found (gate 18 yd aside)',
        from: { x: 18, z: 30 },
        to: { x: 18, z: 12 },
      },
      { name: 'failed: perched target 6 yd away', from: { x: 0, z: -38.5 }, to: { x: 0, z: -32 } },
      { name: 'failed: widest window (perched)', from: { x: 30, z: -61 }, to: { x: 0, z: -30 } },
    ],
    pack: {
      casters: (i) => ({ x: 10 + (i % 5) * 2.2, z: 28 + Math.floor(i / 5) * 2.2 }),
      seen: { x: 16, z: 44 },
      hidden: { x: 18, z: 12 },
    },
    dance: {
      casters: (i) => ({ x: 9 + (i % 5) * 2.2, z: 27 + Math.floor(i / 5) * 2.2 }),
      a: { x: 3, z: 14 },
      b: { x: 14, z: 14 },
    },
  };
}

const ms = (n: number): string => n.toFixed(3).padStart(8);

function benchPlans(w: World): void {
  const mob = w.spawn(w.caster, w.plans[0].from);
  console.log(
    `\n== ${w.name}: single searches, called directly (ms: min / median / max over 15) ==`,
  );
  // Where the search keeps a tally (since the route budget landed) the cells
  // it judged are printed too: that number is the same on every machine.
  const tally = w.sim.mobScanCounters as unknown as Record<string, number | undefined>;
  for (const c of w.plans) {
    place(w, mob, c.from);
    place(w, w.player, c.to);
    const times: number[] = [];
    let len = 0;
    let nodes = 0;
    for (let i = 0; i < 18; i++) {
      const before = tally.routeNodes ?? 0;
      const t0 = performance.now();
      len = planChaseRoute(w.sim.ctx, mob, w.player).length;
      if (i >= 3) times.push(performance.now() - t0);
      nodes = (tally.routeNodes ?? 0) - before;
    }
    times.sort((a, b) => a - b);
    console.log(
      `  ${c.name.padEnd(40)} ${ms(times[0])} ${ms(times[times.length >> 1])} ${ms(times[times.length - 1])}   waypoints ${len}  cells judged ${tally.routeNodes === undefined ? 'n/a' : nodes}`,
    );
  }
  w.sim.ctx.dropEntity(mob.id);
}

interface TickStats {
  worst: number;
  mean: number;
  plans: number;
  maxPlans: number;
  maxNodes: number;
  sight: number;
}

/** Run a scene for `seconds`, moving the target with `move(tick)`. Best of
 *  three on the wall-time numbers (the counters are the same every run). */
function runScene(
  build: () => World,
  n: number,
  spots: (w: World) => (i: number, n: number) => Spot,
  move: (w: World, tick: number) => Spot,
  seconds: number,
): TickStats {
  let best: TickStats | null = null;
  for (let rep = 0; rep < 3; rep++) {
    const w = build();
    const at = spots(w);
    place(w, w.player, move(w, 0));
    for (let i = 0; i < n; i++) engage(w.spawn(w.caster, at(i, n)), w.player);
    let worst = 0;
    let total = 0;
    let plans = 0;
    let maxPlans = 0;
    let maxNodes = 0;
    let sight = 0;
    const ticks = seconds * 20;
    for (let t = 0; t < ticks; t++) {
      place(w, w.player, move(w, t));
      w.player.hp = w.player.maxHp;
      const t0 = performance.now();
      w.sim.tick();
      const dt = performance.now() - t0;
      // The first second pays for module and collider warm-up.
      if (t >= 20) {
        worst = Math.max(worst, dt);
        total += dt;
      }
      const c = w.sim.mobScanCounters as unknown as Record<string, number | undefined>;
      plans += c.routePlans ?? 0;
      maxPlans = Math.max(maxPlans, c.routePlans ?? 0);
      maxNodes = Math.max(maxNodes, c.routeNodes ?? 0);
      sight += c.sightQueries ?? 0;
    }
    const stats = { worst, mean: total / (ticks - 20), plans, maxPlans, maxNodes, sight };
    if (!best || stats.worst < best.worst) best = stats;
  }
  return best as TickStats;
}

function benchScenes(build: () => World): void {
  const name = build().name;
  console.log(`\n== ${name}: whole ticks (ms worst tick / mean tick; counters per tick) ==`);
  const row = (label: string, s: TickStats): void =>
    console.log(
      `  ${label.padEnd(44)} ${ms(s.worst)} ${ms(s.mean)}   plans ${String(s.plans).padStart(4)}  max plans/tick ${s.maxPlans}  max nodes/tick ${s.maxNodes}  sight queries ${s.sight}`,
    );
  row(
    '20 casters, target in sight (reference)',
    runScene(
      build,
      20,
      (w) => w.pack.casters,
      (w) => w.pack.seen,
      15,
    ),
  );
  row(
    '20 casters, target steps out of sight',
    runScene(
      build,
      20,
      (w) => w.pack.casters,
      (w, t) => (t < 60 ? w.pack.seen : w.pack.hidden),
      15,
    ),
  );
  row(
    '10 casters, target still by the doorway',
    runScene(
      build,
      10,
      (w) => w.dance.casters,
      (w) => w.dance.a,
      20,
    ),
  );
  row(
    '10 casters, doorway dance (hop every 1.5 s)',
    runScene(
      build,
      10,
      (w) => w.dance.casters,
      (w, t) => (Math.floor(t / 30) % 2 === 0 ? w.dance.a : w.dance.b),
      20,
    ),
  );
}

/** A delve room: no route is planned there, so only the sight query is timed
 *  (it scans the run's module colliders with no broad phase, and looks the run
 *  up for every query). */
function benchDelveSight(): void {
  const sim = new Sim({ seed: 31, playerClass: 'warrior', autoEquip: true });
  const def = DELVES.collapsed_reliquary;
  sim.setPlayerLevel(def.minLevel);
  const player = sim.player;
  player.pos = sim.ctx.groundPos(def.doorPos.x, def.doorPos.z);
  player.prevPos = { ...player.pos };
  sim.ctx.rebucket(player);
  sim.enterDelve('collapsed_reliquary', 'normal');
  const run = sim.delveRunForPlayer(player.id);
  if (!run) throw new Error('no delve run');
  const template = MOBS.reedbound_acolyte;
  console.log(
    '\n== delve room (Collapsed Reliquary): a sight query (ms: min / median / max over 200) ==',
  );
  for (const dist of [6, 16, 26]) {
    const mob = createMob(sim.ctx.nextId++, template, template.minLevel, {
      x: player.pos.x + dist,
      y: player.pos.y,
      z: player.pos.z,
    });
    sim.ctx.addEntity(mob);
    run.mobIds.push(mob.id);
    const times: number[] = [];
    let clear = false;
    for (let i = 0; i < 220; i++) {
      const t0 = performance.now();
      clear = sim.ctx.hasLineOfSight(mob, player);
      if (i >= 20) times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    console.log(
      `  ${`${dist} yd`.padEnd(40)} ${ms(times[0])} ${ms(times[times.length >> 1])} ${ms(times[times.length - 1])}   clear ${clear}`,
    );
  }
}

benchPlans(openWorld());
benchPlans(crypt(false));
benchPlans(crypt(true));
benchScenes(openWorld);
benchScenes(() => crypt(false));
benchDelveSight();
