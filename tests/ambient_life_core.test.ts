import { describe, expect, it } from 'vitest';
import {
  ambientLifeEnabled,
  BIRD_FLOCK_COUNT,
  BIRD_MIN_ALTITUDE,
  planBirdFlocks,
  planSmokeColumns,
} from '../src/render/ambient_life_core';
import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from '../src/sim/data';
import { terrainHeight } from '../src/sim/world';

const SEED = 20061;

describe('ambient life: bird flocks', () => {
  it('is deterministic per seed (every client sees the same skies)', () => {
    expect(planBirdFlocks(SEED)).toEqual(planBirdFlocks(SEED));
    expect(planBirdFlocks(SEED)).not.toEqual(planBirdFlocks(SEED + 1));
  });

  it('anchors stay inside the world and clear of the rim band', () => {
    for (const f of planBirdFlocks(SEED)) {
      expect(f.x).toBeGreaterThan(WORLD_MIN_X + 100);
      expect(f.x).toBeLessThan(WORLD_MAX_X - 100);
      expect(f.z).toBeGreaterThan(WORLD_MIN_Z + 100);
      expect(f.z).toBeLessThan(WORLD_MAX_Z - 100);
    }
  });

  it('every flock orbits well above the terrain across its whole circle', () => {
    for (const f of planBirdFlocks(SEED)) {
      for (const [dx, dz] of [
        [0, 0],
        [f.radius, 0],
        [-f.radius, 0],
        [0, f.radius],
        [0, -f.radius],
      ]) {
        const ground = terrainHeight(f.x + dx, f.z + dz, SEED);
        expect(f.y - ground, `flock at ${f.x},${f.z}`).toBeGreaterThanOrEqual(
          BIRD_MIN_ALTITUDE - 1e-9,
        );
      }
    }
  });

  it('ships the planned flock count with sane params', () => {
    const flocks = planBirdFlocks(SEED);
    expect(flocks).toHaveLength(BIRD_FLOCK_COUNT);
    for (const f of flocks) {
      expect(f.count).toBeGreaterThanOrEqual(5);
      expect(f.count).toBeLessThanOrEqual(9);
      expect(Math.abs(f.speed)).toBeGreaterThan(0.03);
      expect(Math.abs(f.speed)).toBeLessThan(0.12);
      expect(f.radius).toBeGreaterThan(20);
    }
  });
});

describe('ambient life: smoke columns', () => {
  it('seats one column per campfire on the terrain there', () => {
    const fires: [number, number][] = [
      [4, 299],
      [-25, 489],
    ];
    const plans = planSmokeColumns(fires, SEED);
    expect(plans).toHaveLength(2);
    plans.forEach((p, i) => {
      expect(p.x).toBe(fires[i][0]);
      expect(p.z).toBe(fires[i][1]);
      expect(p.y).toBeCloseTo(terrainHeight(p.x, p.z, SEED) + 0.4, 6);
      expect(p.height).toBeGreaterThan(8);
      expect(p.width).toBeGreaterThan(2);
    });
  });

  it('varies columns by position so a camp cluster never reads as copies', () => {
    const [a, b] = planSmokeColumns(
      [
        [10, 10],
        [14, 12],
      ],
      SEED,
    );
    expect(a.height).not.toBe(b.height);
    expect(a.phase).not.toBe(b.phase);
  });
});

describe('ambient life: gating', () => {
  it('rides the vista arm only', () => {
    expect(ambientLifeEnabled(true)).toBe(true);
    expect(ambientLifeEnabled(false)).toBe(false);
  });
});
