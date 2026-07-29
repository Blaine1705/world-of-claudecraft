import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import { screeSpotAt, screeSpotsInBounds, screeSurfaceHeight } from '../src/sim/scree';
import { groundHeight, roadDistance, terrainHeight, WATER_LEVEL } from '../src/sim/world';

// The scree module is the renderer's single pure placement source. The rocks
// are tier-gated visual dressing and must not alter shared simulation ground.

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

  it('keeps tier-gated visual scree out of the shared walkable heightfield', () => {
    const spots = screeSpotsInBounds(SEED, BOUNDS);
    const s = spots.find((spot) => spot.topY - terrainHeight(spot.x, spot.z, SEED) > 1);
    expect(s).toBeDefined();
    if (!s) return;
    const atCrown = screeSurfaceHeight(s.x, s.z, SEED);
    expect(atCrown).toBeCloseTo(s.topY, 5);
    // Cliff scree only renders on tiers that enable the detail layer. Folding
    // its crown into groundHeight would create invisible walls on lower tiers
    // and perturb every deterministic sim consumer of the shared heightfield.
    expect(groundHeight(s.x, s.z, SEED)).toBeCloseTo(terrainHeight(s.x, s.z, SEED), 5);
    expect(groundHeight(s.x, s.z, SEED)).toBeLessThan(s.topY);
    // just past the rim the dome contributes nothing
    const out = screeSurfaceHeight(s.x + s.footR + 0.05, s.z, SEED);
    expect(out === Number.NEGATIVE_INFINITY || out < s.topY).toBe(true);
  });

  it('keeps a varied boulder scale distribution', () => {
    const spots = screeSpotsInBounds(SEED, BOUNDS);
    expect(spots.some((s) => s.scale < 0.8)).toBe(true);
    expect(spots.some((s) => s.scale > 1.2)).toBe(true);
  });
});
