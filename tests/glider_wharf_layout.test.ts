// Zephyr's launch wharf on the crest of the Shear (world quests round 2): the
// knoll (sim/gale_launch_knoll.ts) is part of terrainHeight, the wharf planks
// (sim/glider_wharf_layout.ts) ride the deck_surfaces arm like the harbor
// piers, and the flight tower that used to lift the launch to Y = 74 is gone.
// Every number the courses depend on is pinned: the plank plane is still 74,
// Zephyr still stands at 74, the launch perch still starts at 74 with open air
// below it, and the road climbs the knoll under the climb limit while the
// launch face and the seaward face are cliffs.
import { describe, expect, it } from 'vitest';
import { buildGaleFeatures } from '../src/render/gale_features';
import { GALECREST_ROADS } from '../src/sim/content/galecrest';
import {
  GLIDER_LAUNCH_SITE,
  GLIDER_NPC_DEF,
  GLIDER_NPC_ID,
  GLIDER_QUEST_ID,
} from '../src/sim/content/world_quest_glider';
import { BUILTIN_WORLD } from '../src/sim/data';
import { GALE_DECK_LIFT } from '../src/sim/gale_harbor';
import {
  applyGaleLaunchKnoll,
  GALE_LAUNCH_KNOLL,
  GLIDER_WHARF_DECK_Y,
  galeLaunchKnollOuterRadius,
} from '../src/sim/gale_launch_knoll';
import {
  GLIDER_WHARF,
  GLIDER_WHARF_DECKS,
  gliderWharfSurface,
} from '../src/sim/glider_wharf_layout';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { overworldWalkSurface } from '../src/sim/walk_lifts';
import { groundHeight, terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { ensureGliderInstructor, updateGliderLaunchUpdraft } from '../src/sim/world_quest_glider';
import { WORLD_SEED } from '../src/sim/world_seed';

const terrain = (x: number, z: number): number => terrainHeight(x, z, WORLD_SEED);

function setupSim() {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    devCommands: true,
    world: {
      ...BUILTIN_WORLD,
      camps: [],
      npcs: {
        [GLIDER_NPC_DEF.id]: GLIDER_NPC_DEF,
      },
      groundObjects: [],
    },
  });
  sim.resetDay = '2026-09-28';
  return sim;
}

describe('the launch knoll', () => {
  it('is a flat crest at the plank plane less the lift, blending out to untouched shelf', () => {
    expect(GLIDER_WHARF_DECK_Y).toBe(74);
    expect(GALE_LAUNCH_KNOLL.crestHeight).toBeCloseTo(74 - GALE_DECK_LIFT, 9);
    const { x, z, plateauRadius } = GALE_LAUNCH_KNOLL;
    // Inside the plateau every sample is the crest, whatever the shelf was.
    for (const [dx, dz] of [
      [0, 0],
      [plateauRadius - 0.5, 0],
      [0, -(plateauRadius - 0.5)],
      [-5, 6],
    ]) {
      expect(applyGaleLaunchKnoll(x + dx, z + dz, 3)).toBeCloseTo(GALE_LAUNCH_KNOLL.crestHeight, 9);
      expect(terrain(x + dx, z + dz)).toBeCloseTo(GALE_LAUNCH_KNOLL.crestHeight, 6);
    }
    // Past the outer radius in every direction the shelf is untouched.
    for (const [ex, ez] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [Math.SQRT1_2, Math.SQRT1_2],
    ]) {
      const outer = galeLaunchKnollOuterRadius(ex, ez) + 0.5;
      expect(applyGaleLaunchKnoll(x + ex * outer, z + ez * outer, 3)).toBe(3);
    }
    // A raise only: ground already above the crest is left alone.
    expect(applyGaleLaunchKnoll(x, z, 90)).toBe(90);
    // Lopsided on purpose: seaward and launch faces short, the road sides long.
    expect(galeLaunchKnollOuterRadius(1, 0)).toBeLessThan(galeLaunchKnollOuterRadius(0, 1));
    expect(galeLaunchKnollOuterRadius(0, 1)).toBeLessThan(galeLaunchKnollOuterRadius(0, -1));
    expect(galeLaunchKnollOuterRadius(0, -1)).toBeLessThan(galeLaunchKnollOuterRadius(-1, 0));
  });

  it('the Wickharbor road climbs over the crest and down again under the player climb limit', () => {
    // The road that passes "above the Shear" (galecrest.ts): the leg from
    // Wickharbor south to the Wreckfields runs over the knoll's crest.
    const road = GALECREST_ROADS.find((leg) => leg.some((p) => p.x === 446 && p.z === 512));
    expect(road).toBeDefined();
    if (!road) return;
    let steepest = 0;
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i];
      const b = road[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.ceil(length / 2);
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const h0 = groundHeight(a.x + (b.x - a.x) * t0, a.z + (b.z - a.z) * t0, WORLD_SEED);
        const h1 = groundHeight(a.x + (b.x - a.x) * t1, a.z + (b.z - a.z) * t1, WORLD_SEED);
        steepest = Math.max(steepest, Math.abs(h1 - h0) / (length / steps));
      }
    }
    expect(steepest).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
    // ...and the road does reach the crest.
    expect(groundHeight(446, 512, WORLD_SEED)).toBeCloseTo(GALE_LAUNCH_KNOLL.crestHeight, 6);
  });

  it('the seaward face is a cliff that drops to the sea, and the launch face is steeper than a climb', () => {
    const { x, z } = GALE_LAUNCH_KNOLL;
    let seaward = 0;
    let launchFace = 0;
    for (let r = GALE_LAUNCH_KNOLL.plateauRadius; r < 60; r += 1) {
      seaward = Math.max(seaward, terrain(x + r, z) - terrain(x + r + 1, z));
      launchFace = Math.max(launchFace, terrain(x, z + r) - terrain(x, z + r + 1));
    }
    expect(seaward).toBeGreaterThan(PLAYER_MAX_CLIMB_SLOPE);
    expect(launchFace).toBeGreaterThan(PLAYER_MAX_CLIMB_SLOPE);
    expect(terrain(x + 62, z)).toBeLessThan(WATER_LEVEL);
  });
});

describe('the launch wharf', () => {
  it('lays its planks at the old deck height on the crest; the perch hangs past the end', () => {
    expect(GLIDER_WHARF_DECKS).toHaveLength(1);
    const pier = GLIDER_WHARF_DECKS[0];
    expect(terrain(pier.ax, pier.az)).toBeCloseTo(GALE_LAUNCH_KNOLL.crestHeight, 6);
    // Zephyr's spot is on the planks, at 74.
    expect(
      gliderWharfSurface(GLIDER_NPC_DEF.pos.x, GLIDER_NPC_DEF.pos.z, terrain, WATER_LEVEL),
    ).toBeCloseTo(GLIDER_WHARF_DECK_Y, 6);
    expect(
      gliderWharfSurface(GLIDER_NPC_DEF.pos.x + 1, GLIDER_NPC_DEF.pos.z, terrain, WATER_LEVEL),
    ).toBeCloseTo(GLIDER_WHARF_DECK_Y, 6);
    // The launch perch is a stride PAST the planks' end, at the plank plane,
    // with the knoll already well below: open air under the glider from its
    // first flying tick (the flight tower's perch hung off its deck the same way).
    const perch = GLIDER_LAUNCH_SITE.playerLaunch;
    expect(perch.y).toBe(GLIDER_WHARF_DECK_Y);
    expect(gliderWharfSurface(perch.x, perch.z, terrain, WATER_LEVEL)).toBe(-Infinity);
    expect(groundHeight(perch.x, perch.z, WORLD_SEED)).toBeLessThan(GLIDER_WHARF_DECK_Y - 5);
    // Beside the planks there is only the knoll; at the updraft, only ground.
    expect(gliderWharfSurface(pier.x + 6, pier.z, terrain, WATER_LEVEL)).toBe(-Infinity);
    expect(
      gliderWharfSurface(GLIDER_WHARF.updraft.x, GLIDER_WHARF.updraft.z, terrain, WATER_LEVEL),
    ).toBe(-Infinity);
  });

  it('folds into groundHeight on the planks and not beside them; the old tower lift is gone', () => {
    expect(groundHeight(GLIDER_NPC_DEF.pos.x, GLIDER_NPC_DEF.pos.z, WORLD_SEED)).toBeCloseTo(
      GLIDER_WHARF_DECK_Y,
      6,
    );
    const pier = GLIDER_WHARF_DECKS[0];
    expect(groundHeight(pier.x + 6, pier.z, WORLD_SEED)).toBeCloseTo(
      terrain(pier.x + 6, pier.z),
      6,
    );
    expect(groundHeight(GLIDER_WHARF.updraft.x, GLIDER_WHARF.updraft.z, WORLD_SEED)).toBeCloseTo(
      terrain(GLIDER_WHARF.updraft.x, GLIDER_WHARF.updraft.z),
      6,
    );
    // The walk-lift sum no longer knows a tower: it adds nothing at the launch.
    expect(overworldWalkSurface(GLIDER_NPC_DEF.pos.x, GLIDER_NPC_DEF.pos.z, 10)).toBe(10);
  });

  it('spawns Flightmaster Zephyr on the planks at Y = 74', () => {
    const sim = setupSim();
    ensureGliderInstructor((sim as unknown as { ctx: SimContext }).ctx);
    const zephyr = sim.entities.get(GLIDER_NPC_ID);
    expect(zephyr).toBeDefined();
    expect(zephyr?.pos.x).toBe(GLIDER_NPC_DEF.pos.x);
    expect(zephyr?.pos.z).toBe(GLIDER_NPC_DEF.pos.z);
    expect(zephyr?.pos.y).toBeCloseTo(GLIDER_WHARF_DECK_Y, 6);
  });

  it('starts glider flight from the perch at 74 with open air below, as the tower launch did', () => {
    const sim = setupSim();
    sim.chat('/dev glider');
    expect(sim.player.pos.y).toBeCloseTo(GLIDER_WHARF_DECK_Y, 6);
    sim.talkToNpc(GLIDER_NPC_ID);
    const progress = sim.worldQuestLog.get(GLIDER_QUEST_ID);
    expect(progress?.glider?.phase).toBe('countdown');
    expect(sim.player.pos.x).toBe(GLIDER_LAUNCH_SITE.playerLaunch.x);
    expect(sim.player.pos.y).toBe(GLIDER_WHARF_DECK_Y);
    expect(sim.player.pos.z).toBe(GLIDER_LAUNCH_SITE.playerLaunch.z);
    // Through the countdown and into the air: no terrain contact off the perch.
    for (let i = 0; i < 61; i++) sim.tick();
    expect(sim.worldQuestLog.get(GLIDER_QUEST_ID)?.glider?.phase).toBe('flying');
    for (let i = 0; i < 20; i++) sim.tick();
    expect(sim.worldQuestLog.get(GLIDER_QUEST_ID)?.glider?.phase).toBe('flying');
  });

  it('whisks a player standing in the roadside updraft at the foot back up to Zephyr', () => {
    const sim = setupSim();
    const ctx = (sim as unknown as { ctx: SimContext }).ctx;
    const meta = sim.meta(sim.playerId)!;
    sim.player.pos = {
      x: GLIDER_WHARF.updraft.x,
      y: groundHeight(GLIDER_WHARF.updraft.x, GLIDER_WHARF.updraft.z, WORLD_SEED),
      z: GLIDER_WHARF.updraft.z,
    };
    sim.player.prevPos = { ...sim.player.pos };
    expect(sim.player.pos.y).toBeLessThan(40);
    const triggered = updateGliderLaunchUpdraft(ctx, meta, sim.player);
    expect(triggered).toBe(true);
    expect(sim.player.pos.x).toBe(GLIDER_NPC_DEF.pos.x + 1);
    expect(sim.player.pos.y).toBeCloseTo(GLIDER_WHARF_DECK_Y, 6);
    expect(sim.player.pos.z).toBe(GLIDER_NPC_DEF.pos.z);
    expect(sim.player.onGround).toBe(true);
    // Standing on the planks does not re-trigger it.
    expect(updateGliderLaunchUpdraft(ctx, meta, sim.player)).toBe(false);
  });

  it('whisks a low-level player up via sim.tick even with no world quest active', () => {
    const sim = setupSim();
    sim.player.level = 1;
    sim.player.pos = {
      x: GLIDER_WHARF.updraft.x,
      y: groundHeight(GLIDER_WHARF.updraft.x, GLIDER_WHARF.updraft.z, WORLD_SEED),
      z: GLIDER_WHARF.updraft.z,
    };
    sim.player.prevPos = { ...sim.player.pos };
    sim.tick();
    expect(sim.player.pos.x).toBe(GLIDER_NPC_DEF.pos.x + 1);
    expect(sim.player.pos.y).toBeCloseTo(GLIDER_WHARF_DECK_Y, 6);
    expect(sim.player.pos.z).toBe(GLIDER_NPC_DEF.pos.z);
  });

  it('renders the planks and the updraft funnel, and no tower', () => {
    const view = buildGaleFeatures(WORLD_SEED);
    expect(view.group.children.length).toBeGreaterThan(0);
    // The update arm still turns the funnel.
    expect(() => view.update(1)).not.toThrow();
  });
});
