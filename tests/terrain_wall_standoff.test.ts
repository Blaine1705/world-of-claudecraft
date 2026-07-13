import { describe, expect, it } from 'vitest';
import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z } from '../src/sim/data';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { groundHeight, terrainSteepnessAt, terrainWallStandoff } from '../src/sim/world';

// terrainWallStandoff pushes a player's body off nearby steep terrain in a
// single ring-sample-and-nudge pass, capped at one body radius. In a CONCAVE
// pocket (two walls meeting, most reliably reproduced at this world's rim
// corners, where the x-rim and z-rim walls press in from two directions at
// once) a single pass is not always enough to clear the wall, and the caller
// (stepPlayerMotion) only ever committed the pushed position once it read as
// fully walkable, so an unconverged single pass silently discarded every
// partial improvement. This is defensive hardening: on THIS world's simpler
// terrain the downhill-slide fallback (terrainDownhill in stepPlayerMotion)
// happens to always have a valid escape gradient wherever standoff alone
// would fall short, so the practical "permanently wedged" symptom isn't
// reproducible here today (see tests/veiled_hollow.test.ts on a branch with
// the newer organic coastline terrain for a case where it IS). This file
// pins the property that actually matters everywhere: iterating the
// standoff push converges strictly further than a single pass in a genuine
// concave pocket, and never regresses an already-fine position.
const SEED = 20061; // the fixed production seed (src/main.ts, server/game.ts)
const R = PLAYER_BODY_RADIUS;
const SLOPE = PLAYER_MAX_CLIMB_SLOPE;

// A standalone re-implementation of one ring-sample-and-nudge pass (the
// pre-fix behavior), kept independent of world.ts so this test still catches
// a regression if the internal helper is ever renamed or inlined away.
function singlePass(x: number, z: number): { x: number; z: number } {
  const h0 = groundHeight(x, z, SEED);
  const wallRise = R * SLOPE;
  let pushX = 0;
  let pushZ = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    const rise = groundHeight(x + sx * R, z + sz * R, SEED) - h0;
    if (rise > wallRise) {
      const setback = Math.min((rise - wallRise) / SLOPE, R);
      pushX -= sx * setback;
      pushZ -= sz * setback;
    }
  }
  if (pushX === 0 && pushZ === 0) return { x, z };
  const mag = Math.hypot(pushX, pushZ);
  const scale = Math.min(mag, R) / mag;
  return { x: x + pushX * scale, z: z + pushZ * scale };
}

// A band of probe points near each of the playable rectangle's four
// corners, where the x-rim and z-rim walls press in from two directions at
// once: the most reliable genuinely concave pocket on this world. One exact
// pin (found by sweeping this band) reproduces a large single-pass shortfall
// that iteration closes; the rest of the band is swept generically as a
// no-regression net.
const PIN = { x: -176.5, z: 894 }; // steepOnce ~3.66, steepIterated ~0.37 at SEED 20061
const CORNER_ORIGINS = [
  { x: WORLD_MAX_X, z: WORLD_MIN_Z, sx: -1, sz: 1 },
  { x: WORLD_MAX_X, z: WORLD_MAX_Z, sx: -1, sz: -1 },
  { x: -WORLD_MAX_X, z: WORLD_MIN_Z, sx: 1, sz: 1 },
  { x: -WORLD_MAX_X, z: WORLD_MAX_Z, sx: 1, sz: -1 },
] as const;

describe('terrainWallStandoff converges further than a single pass in concave corners', () => {
  it('closes a large single-pass shortfall at a known concave pocket', () => {
    const once = singlePass(PIN.x, PIN.z);
    const steepOnce = terrainSteepnessAt(once.x, once.z, SEED);
    const iterated = terrainWallStandoff(PIN.x, PIN.z, SEED, R, SLOPE);
    const steepIterated = terrainSteepnessAt(iterated.x, iterated.z, SEED);
    // Independent pins on both readings (not a self-comparison): a single
    // pass leaves this pocket well over 3x the climb limit, iteration brings
    // it under it.
    expect(steepOnce).toBeGreaterThan(3.5);
    expect(steepIterated).toBeLessThan(SLOPE);
  });

  it('never leaves the player steeper than a single pass alone, anywhere near the four corners', () => {
    for (const c of CORNER_ORIGINS) {
      for (let dx = 0; dx <= 6; dx += 1) {
        for (let dz = 0; dz <= 6; dz += 1) {
          const x = c.x + c.sx * dx;
          const z = c.z + c.sz * dz;
          const once = singlePass(x, z);
          const steepOnce = terrainSteepnessAt(once.x, once.z, SEED);
          const iterated = terrainWallStandoff(x, z, SEED, R, SLOPE);
          const steepIterated = terrainSteepnessAt(iterated.x, iterated.z, SEED);
          expect(steepIterated, `(${x},${z})`).toBeLessThanOrEqual(steepOnce + 1e-9);
        }
      }
    }
  });

  it('is idempotent once converged (re-running standoff on the resolved point is a no-op)', () => {
    const once = terrainWallStandoff(PIN.x, PIN.z, SEED, R, SLOPE);
    const twice = terrainWallStandoff(once.x, once.z, SEED, R, SLOPE);
    expect(twice.x).toBeCloseTo(once.x, 6);
    expect(twice.z).toBeCloseTo(once.z, 6);
  });

  it('is a no-op on open, walkable ground', () => {
    const open = terrainWallStandoff(0, 0, SEED, R, SLOPE);
    expect(open.x).toBe(0);
    expect(open.z).toBe(0);
  });
});
