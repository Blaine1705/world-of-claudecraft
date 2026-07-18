// The Old Beacon's walkable stair (src/sim/beacon_spiral.ts): the stone
// treads hug the tower column with no gap, climb from the lawn to the C
// balcony at a slope the player climb gate accepts, the balcony holds flat
// at deck height while its mouth stays open, the tower column refuses
// footing, and a real player must be able to WALK the whole way up through
// the live movement kernel.

import { describe, expect, it } from 'vitest';
import { BEACON_SPIRAL, beaconSpiralLift, beaconStairHeight } from '../src/sim/beacon_spiral';
import { resolveMovement } from '../src/sim/colliders';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { groundHeight } from '../src/sim/world';

const SEED = 20061;
const S = BEACON_SPIRAL;
const rMid = (S.coreR + S.stairOut) / 2;
const stairPoint = (t: number): { x: number; z: number } => {
  const a = S.a0 + t * S.sweep;
  return { x: S.x + Math.sin(a) * rMid, z: S.z + Math.cos(a) * rMid };
};
const balconyPoint = (t: number, r: number): { x: number; z: number } => {
  const a = S.a0 + S.sweep + t * S.balconyArc;
  return { x: S.x + Math.sin(a) * r, z: S.z + Math.cos(a) * r };
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

  it('hugs the column: the tread band starts at the plug face with no gap', () => {
    // just outside the plug, mid-sweep, footing is the stair tread
    const a = S.a0 + S.sweep * 0.5;
    const inner = beaconSpiralLift(
      S.x + Math.sin(a) * (S.coreR + 0.05),
      S.z + Math.cos(a) * (S.coreR + 0.05),
    );
    expect(inner).toBeCloseTo(beaconStairHeight(0.5), 5);
  });

  it('keeps the C balcony flat at deck height with an open mouth', () => {
    const rBalc = (S.coreR + S.balconyOut) / 2;
    for (let i = 0; i <= 10; i++) {
      const p = balconyPoint(0.02 + (i / 10) * 0.94, rBalc);
      expect(beaconSpiralLift(p.x, p.z)).toBeCloseTo(S.deck, 5);
    }
    // past the balcony's end the C opens: nothing overhead of the lawn
    const mouthA = S.a0 + S.sweep + S.balconyArc + 0.25;
    expect(beaconSpiralLift(S.x + Math.sin(mouthA) * rBalc, S.z + Math.cos(mouthA) * rBalc)).toBe(
      0,
    );
    // the balcony reaches wider than the stair band
    expect(S.balconyOut).toBeGreaterThan(S.stairOut);
  });

  it('keeps the column unwalkable', () => {
    expect(beaconSpiralLift(S.x, S.z)).toBe(S.coreH);
    // approaching the column from the balcony is a sheer riser the gate refuses
    const rim = S.coreR + 0.2;
    const inside = S.coreR - 0.2;
    const a = S.a0 + S.sweep + S.balconyArc * 0.5;
    const rise =
      beaconSpiralLift(S.x + Math.sin(a) * inside, S.z + Math.cos(a) * inside) -
      beaconSpiralLift(S.x + Math.sin(a) * rim, S.z + Math.cos(a) * rim);
    expect(rise / 0.4).toBeGreaterThan(PLAYER_MAX_CLIMB_SLOPE);
  });

  it('is zero away from the Beacon', () => {
    expect(beaconSpiralLift(S.x + 20, S.z)).toBe(0);
    expect(beaconSpiralLift(420, 360)).toBe(0);
    expect(beaconSpiralLift(S.x, S.z + S.balconyOut + 1)).toBe(0);
  });

  it('a player can walk the stair from the lawn onto the balcony', () => {
    // drive the real movement resolver up the winding treads in short pushes
    const foot = stairPoint(0.02);
    let x = foot.x;
    let z = foot.z;
    for (let i = 1; i <= 110; i++) {
      const target = stairPoint(Math.min(1, i / 105));
      const step = resolveMovement(SEED, x, z, target.x, target.z, 0.5);
      x = step.x;
      z = step.z;
    }
    // then walk on around the C balcony to its middle
    const rBalc = (S.coreR + S.balconyOut) / 2;
    for (let i = 1; i <= 40; i++) {
      const goal = balconyPoint(Math.min(0.5, i / 60), rBalc);
      const step = resolveMovement(SEED, x, z, goal.x, goal.z, 0.5);
      x = step.x;
      z = step.z;
    }
    const finalH = groundHeight(x, z, SEED);
    const lawnH = groundHeight(S.x + 12, S.z, SEED);
    expect(finalH - lawnH, 'stood on the balcony deck').toBeGreaterThan(S.deck - 2.5);
    expect(Math.hypot(x - S.x, z - S.z), 'hugging the tower').toBeLessThan(S.balconyOut + 0.6);
  });
});
