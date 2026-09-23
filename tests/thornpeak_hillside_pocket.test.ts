// The Thornpeak hillside pocket west of the Highwatch practice row (player
// report: stuck at the minimap readout "-69, 631", /unstuck the only way out).
// The natural-relief stack left a sliver ridge there: the gradient-damped hill
// fbm's top octave spikes where its running gradient crosses zero, the upland
// mask doubles the spike through the crag layer, and the result is a crest
// about 2yd tall and 1.5yd wide, narrower than the render lattice (so it reads
// as open hillside) but far past the climb gate (so it walks like a wall).
// With the steep crag face and its boulder to the west and a terrace step to
// the north, the ridge penned the downhill side shut: a pit at its foot,
// and only a narrow groove out. This suite walks a real player out of the
// reported spot and pins the graded ground.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { TERRAIN_APPLIER, TERRAIN_APPLIER_BOUNDS } from '../src/sim/terrain_region_index';
import {
  applyThornpeakPocketGrade,
  THORNPEAK_POCKET_GRADE,
  THORNPEAK_POCKET_GRADE_BOUNDS,
  thornpeakPocketSurface,
} from '../src/sim/thornpeak_walk_grades';
import { groundHeight, terrainHeight, terrainSteepness } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import { EMPTY_TEST_WORLD } from './sim_shared';

// The report is seed-pinned world geometry: the shipped seed only.
const SEED = WORLD_SEED;

// The readout floors world x/z, so "-69, 631" is the yard cell whose center
// is (-68.5, 631.5); the pit is the closed low point at the ridge's foot.
const REPORTED = { x: -68.5, z: 631.5 };
const PIT = { x: -68.4, z: 631.0 };
// The knot the ridge, the pit, and the crag face form (every exact steep
// sample in the ungraded ground sat within this disk).
const KNOT = { x: -67.5, z: 629, r: 7 };

function makeWalker(spot: { x: number; z: number }) {
  const sim = new Sim({
    seed: SEED,
    playerClass: 'warrior',
    autoEquip: true,
    world: EMPTY_TEST_WORLD,
  });
  sim.setPlayerLevel(20);
  const p = sim.player;
  const meta = (
    sim as unknown as { players: Map<number, { moveInput: { forward: boolean } }> }
  ).players.get((sim as unknown as { playerId: number }).playerId)!;
  p.pos.x = spot.x;
  p.pos.z = spot.z;
  p.pos.y = groundHeight(spot.x, spot.z, SEED) + 0.05;
  p.prevPos = { ...p.pos };
  for (let i = 0; i < 40; i++) sim.tick();
  return { sim, p, meta };
}

// Sixteen fixed headings (heading 4 is due east, straight downhill toward the
// practice row), each a six-second walk from the same settled start. Returns
// which headings carried the walker clear of the pocket.
function escapingHeadings(spot: { x: number; z: number }): number[] {
  const { sim, p, meta } = makeWalker(spot);
  const sx = p.pos.x;
  const sz = p.pos.z;
  const sy = p.pos.y;
  const out: number[] = [];
  for (let d = 0; d < 16; d++) {
    p.pos.x = sx;
    p.pos.z = sz;
    p.pos.y = sy;
    p.prevPos = { ...p.pos };
    p.vx = 0;
    p.vz = 0;
    const facing = (d * Math.PI) / 8;
    for (let i = 0; i < 20 * 6; i++) {
      meta.moveInput.forward = true;
      p.facing = facing;
      // the question is terrain, not combat: heal through any wildlife
      p.hp = p.maxHp;
      sim.tick();
    }
    meta.moveInput.forward = false;
    if (Math.hypot(p.pos.x - sx, p.pos.z - sz) > 12) out.push(d);
  }
  return out;
}

describe('the Thornpeak hillside pocket west of the Highwatch practice row', () => {
  it('grades the knot under the climb gate everywhere', () => {
    // exact central-difference steepness (no 1yd cell memo) on a half-yard
    // lattice over the whole knot: the sliver ridge, the pit, and the crag
    // face beside the boulder all read past 1.5 on the ungraded ground
    const steep: string[] = [];
    for (let x = KNOT.x - KNOT.r; x <= KNOT.x + KNOT.r; x += 0.5) {
      for (let z = KNOT.z - KNOT.r; z <= KNOT.z + KNOT.r; z += 0.5) {
        if (Math.hypot(x - KNOT.x, z - KNOT.z) > KNOT.r) continue;
        const s = terrainSteepness(x, z, SEED);
        if (s > 1.3) steep.push(`(${x}, ${z}) ${s.toFixed(2)}`);
      }
    }
    expect(steep, 'every sample in the knot must be comfortably walkable').toEqual([]);
  });

  it('leaves no sliver crest across the downhill line out of the pit', () => {
    // due east from the pit down toward the practice row: every half-yard
    // step falls or rises gently, never the 1.5+ rise/run the crest carried
    let prev = groundHeight(PIT.x, PIT.z, SEED);
    for (let x = PIT.x + 0.5; x <= PIT.x + 10; x += 0.5) {
      const h = groundHeight(x, PIT.z, SEED);
      expect((h - prev) / 0.5, `rise at x ${x.toFixed(1)}`).toBeLessThan(0.5);
      prev = h;
    }
  });

  // long-run walker suites need headroom under full-suite core contention
  // (the same class of timeout the caldera walk-out carries)
  it('walks out of the reported spot and the pit in every direction', {
    timeout: 90_000,
  }, () => {
    // ungraded, the reported spot let out 7 of 16 headings and the pit 3,
    // due east (straight downhill) blocked from both
    const all = Array.from({ length: 16 }, (_, d) => d);
    for (const spot of [REPORTED, PIT]) {
      expect(escapingHeadings(spot), `escaping headings from (${spot.x}, ${spot.z})`).toEqual(all);
    }
  });
});

describe('the pocket grade (thornpeak_walk_grades.ts)', () => {
  const g = THORNPEAK_POCKET_GRADE;

  it('registers exactly its own window in the terrain region index', () => {
    expect(TERRAIN_APPLIER_BOUNDS[TERRAIN_APPLIER.thornpeakPocketGrade]).toEqual([
      THORNPEAK_POCKET_GRADE_BOUNDS,
    ]);
  });

  it('is the identity on every other seed and outside its window', () => {
    for (const seed of [1_337, 42, 2_147_483_647, WORLD_SEED + 1]) {
      expect(applyThornpeakPocketGrade(g.x, g.z, 7.25, seed)).toBe(7.25);
    }
    expect(applyThornpeakPocketGrade(g.x + g.rOut, g.z, 7.25, WORLD_SEED)).toBe(7.25);
    expect(applyThornpeakPocketGrade(g.x, g.z - g.rOut - 0.01, 7.25, WORLD_SEED)).toBe(7.25);
    // inside rIn the ground is the fitted surface outright, whatever came in
    for (const h of [-5, 24, 60]) {
      expect(applyThornpeakPocketGrade(g.x + 3, g.z - 2, h, WORLD_SEED)).toBeCloseTo(
        thornpeakPocketSurface(g.x + 3, g.z - 2),
        9,
      );
    }
  });

  it('still fits the natural hillside around its window (re-fit if this drifts)', () => {
    // just past rOut the grade weighs nothing, so terrainHeight there is the
    // natural ground the surface was fitted to: a terrain change that moves
    // it off the surface would turn the fade into a lip or a trench
    let worst = 0;
    let sum = 0;
    let n = 0;
    for (let a = 0; a < 360; a += 10) {
      for (const r of [g.rOut + 0.25, g.rOut + 1]) {
        const x = g.x + Math.sin((a * Math.PI) / 180) * r;
        const z = g.z + Math.cos((a * Math.PI) / 180) * r;
        const d = terrainHeight(x, z, WORLD_SEED) - thornpeakPocketSurface(x, z);
        worst = Math.max(worst, Math.abs(d));
        sum += d;
        n++;
      }
    }
    expect(worst, 'worst ring residual (yd)').toBeLessThan(1.5);
    expect(Math.abs(sum / n), 'mean ring residual (yd)').toBeLessThan(0.35);
  });
});
