import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import { screeSpotAt, screeSpotsInBounds, screeSurfaceHeight } from '../src/sim/scree';
import { groundHeight, roadDistance, terrainHeight, WATER_LEVEL } from '../src/sim/world';

// The scree module is the single placement source for both the renderer's
// boulder meshes and groundHeight's walkable domes — these tests pin the
// contract that makes "the rock you see is the rock that blocks you" true.

const SEED = 1337;
// a broad sample rectangle over the original vale/marsh/peaks strip
const BOUNDS = { minX: -360, maxX: 360, minZ: -120, maxZ: 760 };

describe('cliff scree placement', () => {
  beforeEach(() => {
    setActiveWorldContent(BUILTIN_WORLD);
  });

  it('is deterministic per (seed, cell)', () => {
    const spots = screeSpotsInBounds(SEED, BOUNDS);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots.slice(0, 25)) {
      const again = screeSpotAt(SEED, Math.round(s.x / 6.5), Math.round(s.z / 6.5));
      expect(again).not.toBeNull();
      expect(again?.x).toBe(s.x);
      expect(again?.topY).toBe(s.topY);
    }
  });

  it('never places on roads, underwater, or at hub centres', () => {
    const spots = screeSpotsInBounds(SEED, BOUNDS);
    for (const s of spots) {
      expect(roadDistance(s.x, s.z)).toBeGreaterThanOrEqual(3);
      expect(s.baseY).toBeGreaterThanOrEqual(WATER_LEVEL + 0.5);
      for (const zone of BUILTIN_WORLD.zones) {
        const d = Math.hypot(s.x - zone.hub.x, s.z - zone.hub.z);
        expect(d).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('raises groundHeight to the crown at the spot centre and not outside the footprint', () => {
    const spots = screeSpotsInBounds(SEED, BOUNDS);
    const s = spots[0];
    const atCrown = screeSurfaceHeight(s.x, s.z, SEED);
    expect(atCrown).toBeCloseTo(s.topY, 5);
    expect(groundHeight(s.x, s.z, SEED)).toBeGreaterThanOrEqual(s.topY);
    // just past the rim the dome contributes nothing
    const out = screeSurfaceHeight(s.x + s.footR + 0.05, s.z, SEED);
    expect(out === Number.NEGATIVE_INFINITY || out < s.topY).toBe(true);
  });

  it('has walk-refusing downhill flanks and some jump-height crowns', () => {
    const spots = screeSpotsInBounds(SEED, BOUNDS);
    let jumpable = 0;
    for (const s of spots) {
      // rim steepness on the DOWNHILL side: the uphill flank of a
      // slope-embedded rock may sit nearly flush (steppable, like real
      // rubble), but the downhill flank must always exceed the climb
      // gate's 1.5 slope so walkers cannot mount it from below
      const glen = Math.hypot(s.gx, s.gz);
      const dx = glen > 1e-4 ? -s.gx / glen : 1;
      const dz = glen > 1e-4 ? -s.gz / glen : 0;
      const rIn = s.footR * 0.9;
      const yIn = screeSurfaceHeight(s.x + dx * rIn, s.z + dz * rIn, SEED);
      if (yIn !== Number.NEGATIVE_INFINITY) {
        const drop = yIn - terrainHeight(s.x + dx * s.footR, s.z + dz * s.footR, SEED);
        const run = s.footR * 0.1;
        if (drop > 0.2) expect(drop / run).toBeGreaterThan(1.5);
      }
      if (s.topY - s.baseY <= 1.1) jumpable++;
    }
    // A real share of the rubble is hoppable from FLAT ground unmounted
    // (jump apex ~1.125); mounted (~1.76) covers far more, and slope-embedded
    // rocks are additionally steppable from their flush uphill side, so the
    // in-play mountable share is well above this floor.
    expect(jumpable).toBeGreaterThan(spots.length * 0.07);
    const mountedJumpable = spots.filter((s) => s.topY - s.baseY <= 1.7).length;
    expect(mountedJumpable).toBeGreaterThan(spots.length * 0.3);
  });

  it('keeps the crown standable: dome height varies gently inboard', () => {
    const spots = screeSpotsInBounds(SEED, BOUNDS);
    const s = spots.find((p) => !p.apron) ?? spots[0];
    const centre = screeSurfaceHeight(s.x, s.z, SEED);
    const half = screeSurfaceHeight(s.x + s.footR * 0.4, s.z, SEED);
    // inboard of ~half radius the surface stays within walkable slope of the
    // crown (0.4 * footR run, max climb 1.5)
    expect(centre - half).toBeLessThan(s.footR * 0.4 * 1.5);
  });
});
