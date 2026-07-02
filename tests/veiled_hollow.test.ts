// The Veiled Hollow: zone registration and the sealed southern border.
// The realm is reachable only through its portal, so the border ridge at the
// Thornpeak boundary must beat the climbable slope on a straight approach
// from EVERY x, in BOTH directions, with no road pass through it.

import { describe, expect, it } from 'vitest';
import { REALM_ZONE } from '../src/sim/content/realm';
import { WORLD_MAX_Z, ZONES, zoneAt } from '../src/sim/data';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';

const SEED = 1337; // matches the fixed client seed in src/main.ts

describe('Veiled Hollow zone registration', () => {
  it('is the last zone band and extends the world', () => {
    const last = ZONES[ZONES.length - 1];
    expect(last.id).toBe('veiled_hollow');
    expect(last.zMin).toBe(900);
    expect(WORLD_MAX_Z).toBe(last.zMax);
    expect(zoneAt(1000).id).toBe('veiled_hollow');
    expect(zoneAt(899).id).toBe('thornpeak_heights');
  });

  it('declares its southern border sealed', () => {
    expect(REALM_ZONE.sealedSouthBorder).toBe(true);
  });

  it('keeps its hub and graveyard on dry, in-zone ground', () => {
    const { hub, graveyard } = REALM_ZONE;
    expect(hub.z).toBeGreaterThan(REALM_ZONE.zMin);
    expect(hub.z).toBeLessThan(REALM_ZONE.zMax);
    expect(terrainHeight(hub.x, hub.z, SEED)).toBeGreaterThan(WATER_LEVEL);
    expect(terrainHeight(graveyard.x, graveyard.z, SEED)).toBeGreaterThan(WATER_LEVEL);
  });
});

describe('the sealed border wall', () => {
  // Steepest straight-line gradient found walking north across the wall band
  // at a fixed x, sampled at the footstep scale the sim's climb check uses.
  function maxNorthGradient(x: number, seed: number): number {
    const step = 0.5;
    let steepest = 0;
    for (let z = 880; z < 955; z += step) {
      const rise = terrainHeight(x, z + step, seed) - terrainHeight(x, z, seed);
      if (rise / step > steepest) steepest = rise / step;
    }
    return steepest;
  }

  // Same, walking south (the way back out without the portal).
  function maxSouthGradient(x: number, seed: number): number {
    const step = 0.5;
    let steepest = 0;
    for (let z = 955; z > 880; z -= step) {
      const rise = terrainHeight(x, z - step, seed) - terrainHeight(x, z, seed);
      if (rise / step > steepest) steepest = rise / step;
    }
    return steepest;
  }

  it('blocks a straight walk in from Thornpeak at every x (several seeds)', () => {
    for (const seed of [SEED, 1, 42, 99999]) {
      for (let x = -170; x <= 170; x += 1) {
        expect(maxNorthGradient(x, seed), `x=${x} seed=${seed}`).toBeGreaterThan(
          PLAYER_MAX_CLIMB_SLOPE,
        );
      }
    }
  });

  it('blocks a straight walk back out at every x (several seeds)', () => {
    for (const seed of [SEED, 1, 42, 99999]) {
      for (let x = -170; x <= 170; x += 1) {
        expect(maxSouthGradient(x, seed), `x=${x} seed=${seed}`).toBeGreaterThan(
          PLAYER_MAX_CLIMB_SLOPE,
        );
      }
    }
  });

  it('leaves the Gravewyrm Sanctum approach essentially unchanged', () => {
    // The sealed crest sits 15yd inside the realm band with a narrow sigma,
    // so the raid gate at (0, 880) must not have been shoved upward.
    const atSanctum = terrainHeight(0, 880, SEED);
    const nearby = terrainHeight(0, 860, SEED);
    expect(Math.abs(atSanctum - nearby)).toBeLessThan(12);
  });
});
