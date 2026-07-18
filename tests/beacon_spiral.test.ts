// The Old Beacon's walkable stair (src/sim/beacon_spiral.ts): the plank
// helix must climb from the lawn to the gallery ring at a slope the player
// climb gate accepts, the ring must be reachable across the bridge, the
// tower column must refuse footing, and a real player must be able to WALK
// the whole way up through the live movement kernel.

import { describe, expect, it } from 'vitest';
import { BEACON_SPIRAL, beaconSpiralLift, beaconStairHeight } from '../src/sim/beacon_spiral';
import { resolveMovement } from '../src/sim/colliders';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { groundHeight } from '../src/sim/world';

const SEED = 20061;
const S = BEACON_SPIRAL;
const rMid = (S.stairIn + S.stairOut) / 2;
const stairPoint = (t: number): { x: number; z: number } => {
  const a = S.a0 + t * S.sweep;
  return { x: S.x + Math.sin(a) * rMid, z: S.z + Math.cos(a) * rMid };
};

describe('the Beacon stair surface', () => {
  it('rises monotonically to the deck with every step under the climb gate', () => {
    const steps = 220;
    let prev = groundHeight(stairPoint(0).x, stairPoint(0).z, SEED);
    for (let i = 1; i <= steps; i++) {
      const p = stairPoint(i / steps);
      const h = groundHeight(p.x, p.z, SEED);
      const stepLen = (S.sweep * rMid) / steps;
      const slope = (h - prev) / stepLen;
      expect(slope, `slope at t=${(i / steps).toFixed(2)}`).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
      expect(h - prev, `no drop at t=${(i / steps).toFixed(2)}`).toBeGreaterThan(-0.6);
      prev = h;
    }
    expect(beaconStairHeight(1)).toBeCloseTo(S.deck, 5);
  });

  it('keeps the ring flat at deck height and the column unwalkable', () => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = (S.coreR + S.ringR) / 2;
      expect(beaconSpiralLift(S.x + Math.sin(a) * r, S.z + Math.cos(a) * r)).toBeCloseTo(S.deck, 5);
    }
    expect(beaconSpiralLift(S.x, S.z)).toBe(S.coreH);
    // approaching the column from the ring is a sheer riser the gate refuses
    const rim = S.coreR + 0.2;
    const inside = S.coreR - 0.2;
    const rise = beaconSpiralLift(S.x + inside, S.z) - beaconSpiralLift(S.x + rim, S.z);
    expect(rise / 0.4).toBeGreaterThan(PLAYER_MAX_CLIMB_SLOPE);
  });

  it('is zero away from the Beacon', () => {
    expect(beaconSpiralLift(S.x + 20, S.z)).toBe(0);
    expect(beaconSpiralLift(420, 360)).toBe(0);
    expect(beaconSpiralLift(S.x, S.z + S.stairOut + 1)).toBe(0);
  });

  it('a player can walk the stair from the lawn to the gallery ring', () => {
    // drive the real movement resolver up the winding deck in short pushes
    let { x, z } = stairPoint(0);
    // start just off the stair foot on the lawn
    const foot = stairPoint(0.02);
    x = foot.x;
    z = foot.z;
    for (let i = 1; i <= 90; i++) {
      const target = stairPoint(Math.min(1, i / 88));
      const step = resolveMovement(SEED, x, z, target.x, target.z, 0.5);
      x = step.x;
      z = step.z;
    }
    // then cross the bridge onto the ring
    const bridgeA = S.a0 + S.sweep;
    const ringGoal = {
      x: S.x + Math.sin(bridgeA) * ((S.coreR + S.ringR) / 2),
      z: S.z + Math.cos(bridgeA) * ((S.coreR + S.ringR) / 2),
    };
    for (let i = 0; i < 24; i++) {
      const step = resolveMovement(SEED, x, z, ringGoal.x, ringGoal.z, 0.5);
      x = step.x;
      z = step.z;
    }
    const finalH = groundHeight(x, z, SEED);
    const lawnH = groundHeight(S.x + 12, S.z, SEED);
    expect(finalH - lawnH, 'stood on the gallery deck').toBeGreaterThan(S.deck - 2.5);
    expect(Math.hypot(x - S.x, z - S.z), 'on the ring').toBeLessThan(S.ringR + 0.6);
  });
});
