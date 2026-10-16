// The seasonal city dressing's resolver (src/sim/seasonal_decor_layout.ts) run
// against the LIVE shipped world: every piece anchored, nothing inside a
// collider, on a road, on an NPC's spot or in another piece, every garland clear
// along its whole run, and each city actually dressed. This is the pin that turns
// red when a city rework drops a building onto the dressing: re-running the gate
// after other PRs merge catches it.
import { describe, expect, it } from 'vitest';
import { isBlocked, streetlampPlacements } from '../src/sim/colliders';
import { GOURDLIGHT_DECOR_CITIES } from '../src/sim/content/gourdlight_eve_decor';
import { getActiveWorldContent, NPCS } from '../src/sim/data';
import {
  DECOR_GROUND_RADIUS,
  DECOR_MIN_SPACING,
  DECOR_NPC_CLEARANCE,
  DECOR_ROAD_CLEARANCE,
  groundSpotProblem,
  resolveSeasonalDecor,
  seasonalDecorLayout,
} from '../src/sim/seasonal_decor_layout';
import { groundHeight, roadDistance } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const layout = resolveSeasonalDecor(WORLD_SEED);

describe('seasonal decor placement against the live world', () => {
  it('seats no ground piece inside a collider, on a road, on an NPC or on another piece', () => {
    const problems: string[] = [];
    for (const [i, p] of layout.ground.entries()) {
      if (isBlocked(WORLD_SEED, p.x, p.z, DECOR_GROUND_RADIUS))
        problems.push(`${p.anchor} collider`);
      if (roadDistance(p.x, p.z) < DECOR_ROAD_CLEARANCE) problems.push(`${p.anchor} road`);
      for (const n of Object.values(NPCS)) {
        if (Math.hypot(n.pos.x - p.x, n.pos.z - p.z) < DECOR_NPC_CLEARANCE)
          problems.push(`${p.anchor} on NPC ${n.id}`);
      }
      for (const q of layout.ground.slice(i + 1)) {
        if (Math.hypot(q.x - p.x, q.z - p.z) < DECOR_MIN_SPACING)
          problems.push(`${p.anchor} overlaps ${q.anchor}`);
      }
      expect(p.y).toBeCloseTo(groundHeight(p.x, p.z, WORLD_SEED), 5);
    }
    expect(problems).toEqual([]);
  });

  it('strings no garland through a building', () => {
    for (const g of layout.garlands) {
      const span = Math.hypot(g.bx - g.ax, g.bz - g.az);
      // Past each end's own post (the widest lamp base plus its margin).
      for (let d = 1.6; d <= span - 1.6; d += 0.5) {
        const t = d / span;
        const x = g.ax + (g.bx - g.ax) * t;
        const z = g.az + (g.bz - g.az) * t;
        expect(isBlocked(WORLD_SEED, x, z, 0.15), `${g.anchor} at ${d.toFixed(1)}`).toBe(false);
      }
    }
  });

  it('dresses every configured city, hung off its own lamps and townsfolk', () => {
    const zones = getActiveWorldContent().zones;
    const lamps = streetlampPlacements(WORLD_SEED);
    for (const rule of GOURDLIGHT_DECOR_CITIES) {
      const hub = zones.find((z) => z.id === rule.zoneId)?.hub;
      expect(hub, rule.zoneId).toBeDefined();
      if (!hub) continue;
      const near = (x: number, z: number) => Math.hypot(x - hub.x, z - hub.z) <= rule.radius + 3;
      const ground = layout.ground.filter((p) => near(p.x, p.z));
      const lanterns = layout.lanterns.filter((p) => near(p.x, p.z));
      expect(ground.length, `${rule.zoneId} ground pieces`).toBeGreaterThanOrEqual(8);
      const garlands = layout.garlands.filter((g) => near(g.ax, g.az));
      expect(garlands.length, `${rule.zoneId} garlands`).toBeGreaterThanOrEqual(2);
      expect(lanterns.length, `${rule.zoneId} lanterns`).toBeGreaterThanOrEqual(3);
      expect(ground.filter((p) => p.anchor.startsWith('npc:')).length).toBeGreaterThanOrEqual(3);
      // Every lantern hangs on a real post of the lamp plan.
      for (const l of lanterns) {
        const index = Number(l.anchor.split(':')[1]);
        const post = lamps[index];
        expect(post, l.anchor).toBeDefined();
        expect(Math.hypot(post.x - l.x, post.z - l.z)).toBeLessThan(0.6);
      }
    }
    expect(layout.garlands.length).toBeGreaterThan(0);
    // Every garland ends on a real post: a lamp of the plan or a seated festival pole.
    const poles = layout.ground.filter((p) => p.kind === 'garland_pole');
    for (const g of layout.garlands) {
      const onLamp = (x: number, z: number) =>
        lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 0.01);
      const onPole = (x: number, z: number) =>
        poles.some((p) => Math.hypot(p.x - x, p.z - z) < 0.01);
      expect(onLamp(g.ax, g.az), g.anchor).toBe(true);
      expect(onLamp(g.bx, g.bz) || onPole(g.bx, g.bz), g.anchor).toBe(true);
    }
  });

  it('refuses a spot inside a collider, on the road and on an NPC (the resolver rule itself)', () => {
    const lamp = streetlampPlacements(WORLD_SEED)[0];
    expect(groundSpotProblem(WORLD_SEED, lamp.x, lamp.z, [], [])).toBe('collider');
    const wilkes = NPCS.trader_wilkes.pos;
    expect(groundSpotProblem(WORLD_SEED, wilkes.x, wilkes.z, [wilkes], [])).toBe('npc');
    // The keeper's own stand is never under a piece.
    const keeper = NPCS.gourdlight_keeper.pos;
    for (const p of layout.ground) {
      expect(Math.hypot(p.x - keeper.x, p.z - keeper.z)).toBeGreaterThanOrEqual(
        DECOR_NPC_CLEARANCE,
      );
    }
  });

  it('is deterministic and memoized per seed', () => {
    expect(resolveSeasonalDecor(WORLD_SEED)).toEqual(layout);
    expect(seasonalDecorLayout(WORLD_SEED)).toBe(seasonalDecorLayout(WORLD_SEED));
  });
});
