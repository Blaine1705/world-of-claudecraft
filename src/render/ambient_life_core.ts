// Pure planning for the ambient life layer: the deterministic bird flocks
// that drift over the fog-free vista and the smoke columns above the world's
// campfires. Everything here is host-agnostic math (no Three, no DOM),
// registered in RENDER_PURE_CORES and driven directly by
// tests/ambient_life_core.test.ts.
//
// FAIRNESS CONTRACT: this layer is cosmetic set dressing, derived only from
// static world content (campfire placements) and the seed. It never reads
// live sim state, so it can never leak an enemy position, and online clients
// (whose interest-scoped snapshots carry no distant entities at all) show
// exactly the same skies as offline ones.

import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from '../sim/data';
import { terrainHeight, WATER_LEVEL } from '../sim/world';

/** One drifting flock: a ring of birds orbiting a fixed sky anchor. */
export interface BirdFlockPlan {
  /** orbit center */
  x: number;
  y: number;
  z: number;
  /** orbit radius in world units */
  radius: number;
  /** radians per second around the anchor (sign carries direction) */
  speed: number;
  /** birds in the flock */
  count: number;
  /** per-flock phase so flocks never sync */
  phase: number;
  /** wing-flap rate, cycles per second */
  flapRate: number;
  /** bird quad size, world units */
  size: number;
}

const hash01 = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

export const BIRD_FLOCK_COUNT = 9;
export const BIRD_MIN_ALTITUDE = 26;

/**
 * Scatter flocks over the world on a deterministic seed grid: anchors avoid
 * the world rim band, sit well above the terrain under them (sampled at the
 * anchor and at the orbit's cardinal edges, so a flock never clips a ridge
 * that rises inside its circle), and prefer varied spots via the hash. The
 * result is stable per seed: every client sees the same skies.
 */
export function planBirdFlocks(seed: number): BirdFlockPlan[] {
  const flocks: BirdFlockPlan[] = [];
  const spanX = WORLD_MAX_X - WORLD_MIN_X - 240;
  const spanZ = WORLD_MAX_Z - WORLD_MIN_Z - 240;
  for (let i = 0; i < BIRD_FLOCK_COUNT; i++) {
    const x = WORLD_MIN_X + 120 + hash01(seed + i * 7.3, 1.7) * spanX;
    const z = WORLD_MIN_Z + 120 + hash01(seed + i * 7.3, 9.1) * spanZ;
    const radius = 26 + hash01(seed + i * 7.3, 3.9) * 44;
    let ground = terrainHeight(x, z, seed);
    ground = Math.max(ground, terrainHeight(x + radius, z, seed));
    ground = Math.max(ground, terrainHeight(x - radius, z, seed));
    ground = Math.max(ground, terrainHeight(x, z + radius, seed));
    ground = Math.max(ground, terrainHeight(x, z - radius, seed));
    ground = Math.max(ground, WATER_LEVEL);
    flocks.push({
      x,
      z,
      y: ground + BIRD_MIN_ALTITUDE + hash01(seed + i * 7.3, 5.3) * 26,
      radius,
      speed: (0.05 + hash01(seed + i * 7.3, 7.7) * 0.055) * (i % 2 === 0 ? 1 : -1),
      count: 5 + Math.floor(hash01(seed + i * 7.3, 11.3) * 4),
      phase: hash01(seed + i * 7.3, 13.9) * Math.PI * 2,
      flapRate: 2.2 + hash01(seed + i * 7.3, 17.1) * 1.4,
      size: 1.05 + hash01(seed + i * 7.3, 19.7) * 0.5,
    });
  }
  return flocks;
}

/** One smoke column above a campfire. */
export interface SmokeColumnPlan {
  x: number;
  y: number;
  z: number;
  /** column quad height, world units */
  height: number;
  /** column quad width, world units */
  width: number;
  /** per-column phase so scroll and sway never sync */
  phase: number;
}

/**
 * A column per campfire, seated at the fire itself. Heights and phases vary
 * by position hash so a camp cluster reads as several fires, not one copy.
 */
export function planSmokeColumns(
  campfires: readonly [number, number][],
  seed: number,
): SmokeColumnPlan[] {
  return campfires.map(([x, z]) => ({
    x,
    y: terrainHeight(x, z, seed) + 0.4,
    z,
    height: 8.5 + hash01(x, z) * 4,
    width: 2.1 + hash01(z, x) * 0.9,
    phase: hash01(x + 31.7, z - 17.3) * Math.PI * 2,
  }));
}

/**
 * Ambient life rides the fog-free vista arm only: the classic fogged tiers
 * would hide it behind their walls anyway, and the lean tier pays for
 * nothing it cannot see.
 */
export function ambientLifeEnabled(vistaEnabled: boolean): boolean {
  return vistaEnabled;
}
