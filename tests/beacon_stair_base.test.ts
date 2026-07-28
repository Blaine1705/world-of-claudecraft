// The Old Beacon's ground ring (player report: stopped on the open lawn at
// (505, 305) with nothing on screen in the way). beaconSpiralLift is a
// single-valued heightfield, so every yard of walkable deck also walls off the
// ground beneath it. The balconies used to lift out to balconyOut 7.2 while
// the treads are only drawn to stairOut 6.5, so the outer 0.7yd was an
// unwalkable ring under open sky. The lift now stops at the drawn tread
// radius: these pin that the ring is walkable at every bearing, that the wall
// begins only at the drawn envelope, that Keeper Bram's balcony spot is still
// deck, and that no campfire sits inside the footprint.

import { describe, expect, it } from 'vitest';
import { BEACON_SPIRAL, beaconSpiralLift } from '../src/sim/beacon_spiral';
import { isBlocked } from '../src/sim/colliders';
import { GALECREST_PROPS } from '../src/sim/content/galecrest';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { rideSteepnessAt } from '../src/sim/ride_height';
import { Sim } from '../src/sim/sim';
import { groundHeight, terrainHeight } from '../src/sim/world';

const SEED = 20061;
const S = BEACON_SPIRAL;
const SPOT = { x: 505, z: 305 }; // the reported spot, open lawn beside the tower
const BRAM_DECK = { x: 503, z: 309 }; // Keeper Bram's authored post on the upper balcony
const DT = 1 / 20;
const RUN_SPEED = 7;

const at = (bearing: number, r: number): { x: number; z: number } => ({
  x: S.x + Math.sin(bearing) * r,
  z: S.z + Math.cos(bearing) * r,
});
const axisD = (x: number, z: number): number => Math.hypot(x - S.x, z - S.z);
const spotBearing = Math.atan2(SPOT.x - S.x, SPOT.z - S.z);
const spotR = axisD(SPOT.x, SPOT.z);

// The player movement gate (player_motion.ts): an uphill step is refused when
// the step itself or its destination gradient beats the climb limit. Replicated
// rather than imported so a walk can be probed without driving a whole Sim.
const climbRefused = (px: number, pz: number, nx: number, nz: number): boolean => {
  const r0 = groundHeight(px, pz, SEED);
  const r1 = groundHeight(nx, nz, SEED);
  if (r1 <= r0) return false;
  const run = Math.hypot(nx - px, nz - pz);
  return (
    (r1 - r0) / run > PLAYER_MAX_CLIMB_SLOPE ||
    rideSteepnessAt(nx, nz, SEED) > PLAYER_MAX_CLIMB_SLOPE
  );
};
const stepRefused = (px: number, pz: number, nx: number, nz: number): boolean =>
  isBlocked(SEED, nx, nz, PLAYER_BODY_RADIUS) || climbRefused(px, pz, nx, nz);

// Walk a straight line, returning where it stopped (null = never stopped).
const walk = (
  x0: number,
  z0: number,
  dirX: number,
  dirZ: number,
  ticks: number,
  refuse = stepRefused,
): { x: number; z: number; stoppedAt: number | null; closest: number } => {
  let px = x0;
  let pz = z0;
  let closest = axisD(px, pz);
  for (let t = 0; t < ticks; t++) {
    const nx = px + dirX * RUN_SPEED * DT;
    const nz = pz + dirZ * RUN_SPEED * DT;
    if (refuse(px, pz, nx, nz)) return { x: px, z: pz, stoppedAt: axisD(nx, nz), closest };
    px = nx;
    pz = nz;
    closest = Math.min(closest, axisD(px, pz));
  }
  return { x: px, z: pz, stoppedAt: null, closest };
};

describe('the Old Beacon ground ring', () => {
  it('the reported spot is open lawn, blocked by nothing', () => {
    expect(spotR).toBeCloseTo(7.616, 3);
    expect(beaconSpiralLift(SPOT.x, SPOT.z)).toBe(0);
    expect(groundHeight(SPOT.x, SPOT.z, SEED)).toBeCloseTo(terrainHeight(SPOT.x, SPOT.z, SEED), 5);
    expect(isBlocked(SEED, SPOT.x, SPOT.z, PLAYER_BODY_RADIUS)).toBe(false);
    expect(rideSteepnessAt(SPOT.x, SPOT.z, SEED)).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
  });

  it('walks the reported path past the tower without stopping', () => {
    // due north and due south along x=505, grazing the tower at d 7.0: both
    // used to stop dead at d 7.17 against the upper balcony's rim
    const north = walk(SPOT.x, 298, 0, 1, 80);
    expect(north.stoppedAt, 'northbound stop').toBeNull();
    expect(north.z).toBeGreaterThan(312);
    expect(north.closest).toBeLessThan(S.balconyOut);

    const south = walk(SPOT.x, 312, 0, -1, 80);
    expect(south.stoppedAt, 'southbound stop').toBeNull();
    expect(south.z).toBeLessThan(298);
    expect(south.closest).toBeLessThan(S.balconyOut);
  });

  it('a real player (the live kernel through Sim.tick) walks the ring past the tower', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior', autoEquip: true });
    const p = sim.player;
    p.pos.x = SPOT.x;
    p.pos.z = 298;
    p.pos.y = groundHeight(p.pos.x, p.pos.z, SEED);
    p.prevPos = { ...p.pos };
    const goal = { x: SPOT.x, z: 314 };
    let closest = axisD(p.pos.x, p.pos.z);
    for (let i = 0; i < 20 * 12; i++) {
      p.facing = Math.atan2(goal.x - p.pos.x, goal.z - p.pos.z);
      sim.moveInput.forward = true;
      sim.tick();
      closest = Math.min(closest, axisD(p.pos.x, p.pos.z));
      if (Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 0.7) break;
    }
    sim.moveInput.forward = false;
    expect(p.pos.z, 'walked past the tower').toBeGreaterThan(312);
    expect(closest, 'grazed inside the old balcony rim').toBeLessThan(S.balconyOut);
  });

  it('the whole ground ring outside the drawn treads is open at every bearing', () => {
    for (let i = 0; i < 360; i++) {
      const bearing = (i / 360) * Math.PI * 2;
      for (let r = S.stairOut + 0.05; r <= 7.6001; r += 0.05) {
        const p = at(bearing, r);
        expect(beaconSpiralLift(p.x, p.z), `lift at bearing ${i}, r ${r.toFixed(2)}`).toBe(0);
      }
      // and a tangential lawn walk at the old rim radius meets no terrain wall
      // (props like the brazier are real visible obstacles, so the climb gate
      // alone is what this sweep is about)
      const graze = at(bearing, S.balconyOut);
      const pass = walk(graze.x, graze.z, Math.cos(bearing), -Math.sin(bearing), 24, climbRefused);
      expect(pass.stoppedAt, `tangential walk at bearing ${i}`).toBeNull();
    }
  });

  it('the wall begins only at the drawn tread envelope', () => {
    let widest = 0;
    for (let i = 0; i < 720; i++) {
      const bearing = (i / 720) * Math.PI * 2;
      for (let r = S.coreR + 0.05; r <= S.balconyOut + 1.2; r += 0.02) {
        const p = at(bearing, r);
        if (beaconSpiralLift(p.x, p.z) > 0) widest = Math.max(widest, r);
      }
    }
    // the renderer builds the treads to exactly stairOut, so collision and the
    // drawn stair share one edge; balconyOut is a cosmetic overhang only
    expect(widest).toBeGreaterThan(S.stairOut - 0.05);
    expect(widest).toBeLessThanOrEqual(S.stairOut);
    expect(S.balconyOut).toBeGreaterThan(S.stairOut);

    // and the refusal there is the lift alone: no collider, no terrain steepness
    const inside = at(spotBearing, S.stairOut - 0.05);
    const outside = at(spotBearing, S.stairOut + 0.05);
    expect(beaconSpiralLift(inside.x, inside.z)).toBeCloseTo(S.deck2, 5);
    expect(beaconSpiralLift(outside.x, outside.z)).toBe(0);
    for (const p of [inside, outside]) {
      expect(isBlocked(SEED, p.x, p.z, PLAYER_BODY_RADIUS)).toBe(false);
      expect(rideSteepnessAt(p.x, p.z, SEED)).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
    }
    expect(
      Math.abs(terrainHeight(inside.x, inside.z, SEED) - terrainHeight(outside.x, outside.z, SEED)),
    ).toBeLessThan(0.05);
  });

  it("keeps Keeper Bram's post on the upper balcony deck", () => {
    expect(axisD(BRAM_DECK.x, BRAM_DECK.z)).toBeCloseTo(5.099, 3);
    expect(beaconSpiralLift(BRAM_DECK.x, BRAM_DECK.z)).toBe(S.deck2);
    // with real clearance inboard of the walkable edge, not riding it
    expect(S.stairOut - axisD(BRAM_DECK.x, BRAM_DECK.z)).toBeGreaterThan(1);
  });

  it('keeps every nearby campfire out of the stair footprint', () => {
    const near = GALECREST_PROPS.campfires.filter(([x, z]) => axisD(x, z) < 12);
    expect(near.length).toBeGreaterThan(0);
    for (const [x, z] of near) {
      // props seat on terrainHeight while the stair rides groundHeight, so a
      // campfire inside the lift footprint is buried under the deck AND its
      // height-less collider pinches the flight overhead
      expect(beaconSpiralLift(x, z), `campfire (${x}, ${z}) under the stair`).toBe(0);
      expect(groundHeight(x, z, SEED)).toBeCloseTo(terrainHeight(x, z, SEED), 5);
      expect(axisD(x, z), `campfire (${x}, ${z}) inside the lift gate`).toBeGreaterThan(
        S.stairOut + 0.6,
      );
      // and off the stair-foot approach, which the mouth leaves open
      const bearing = ((Math.atan2(x - S.x, z - S.z) * 180) / Math.PI + 360) % 360;
      expect(bearing < 116 || bearing > 138, `campfire (${x}, ${z}) in the mouth`).toBe(true);
    }
  });
});
