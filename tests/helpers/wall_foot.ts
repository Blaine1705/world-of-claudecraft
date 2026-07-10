// Find a real terrain WALL FOOT in whatever world the sim currently generates: a
// cell with FLAT footing (so no downhill slide fires) that still has terrain
// steeper than the climb limit within one body radius, which is exactly the
// situation `terrainWallStandoff` exists to ease the player out of.
//
// The wall-standoff tests used to hardcode the strip world's western rim wall
// (x ~ -150, z 555..645). The 2D atlas-grid world replaced that rim with sealed
// border ridges elsewhere, so those literals now sit on open ground and the tests
// asserted a push that could never happen. Searching for the wall instead keeps
// the assertions about the FEATURE, not about one world's geography, so the next
// world change cannot silently turn these tests into no-ops.
//
// Pure + deterministic (a fixed scan order over a pure heightfield), and memoised
// per seed because the sweep costs a few thousand groundHeight samples.

import {
  groundHeight,
  terrainSteepnessAt,
  terrainWallStandoff,
  WATER_LEVEL,
} from '../../src/sim/world';

export interface WallFoot {
  /** A standable cell within a body radius of a wall. */
  x: number;
  z: number;
  /** How far the standoff eases a body out of the wall here. */
  push: number;
  /** Unit vector pointing INTO the wall (the standoff pushes the opposite way). */
  intoWallX: number;
  intoWallZ: number;
  /** Facing (sim convention: 0 = +z, dir = (sin f, cos f)) that walks into the wall. */
  facingIntoWall: number;
}

const cache = new Map<string, WallFoot | null>();

/** Scan the overworld for the strongest wall foot. `minPush` filters out cells
 * whose wall is barely in reach, so callers get an unambiguous case. */
export function findWallFoot(
  seed: number,
  bodyRadius: number,
  maxSlope: number,
  minPush = 0.2,
): WallFoot {
  const key = `${seed}:${bodyRadius}:${maxSlope}:${minPush}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    if (hit === null) throw new Error(`no wall foot found for seed ${seed}`);
    return hit;
  }
  const probe = (x: number, z: number): WallFoot | null => {
    if (groundHeight(x, z, seed) < WATER_LEVEL + 0.4) return null; // never in the drink
    if (terrainSteepnessAt(x, z, seed) >= 1.0) return null; // flat footing: no slide
    const s = terrainWallStandoff(x, z, seed, bodyRadius, maxSlope);
    const dx = s.x - x;
    const dz = s.z - z;
    const push = Math.hypot(dx, dz);
    if (push < minPush) return null;
    return {
      x,
      z,
      push,
      intoWallX: -dx / push,
      intoWallZ: -dz / push,
      facingIntoWall: Math.atan2(-dx / push, -dz / push),
    };
  };
  // Coarse sweep across the whole continent (the grid world's sealed border ridges
  // sit well past the old strip's +-400), then refine around the best hit.
  let best: WallFoot | null = null;
  for (let x = -800; x <= 800; x += 4) {
    for (let z = -800; z <= 800; z += 4) {
      const f = probe(x, z);
      if (f && (!best || f.push > best.push)) best = f;
    }
  }
  if (best) {
    const { x: cx, z: cz } = best;
    for (let x = cx - 4; x <= cx + 4; x += 0.25) {
      for (let z = cz - 4; z <= cz + 4; z += 0.25) {
        const f = probe(x, z);
        if (f && f.push > best.push) best = f;
      }
    }
  }
  cache.set(key, best);
  if (!best) throw new Error(`no wall foot found for seed ${seed}`);
  return best;
}
