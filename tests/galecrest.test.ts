// The Galecrest: the world's first east-column realm. What these tests pin
// is the GRID promise itself: the zone is a rectangle beside the Willowfen,
// the border between them is real terrain (a strait with one isthmus, the
// Windway), the pass is walkable end to end on foot, and everything the
// realm owns stands on dry ground.

import { describe, expect, it } from 'vitest';
import { GALECREST_CAMPS, GALECREST_ROADS, GALECREST_ZONE } from '../src/sim/content/galecrest';
import { STRIP_MAX_X, ZONES, zoneAt } from '../src/sim/data';
import { galeLandness, terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../src/sim/world';

const SEED = 1337; // matches the fixed client seed in src/main.ts

describe('Galecrest zone registration', () => {
  it('is a rectangle in the east column of the fen row', () => {
    expect(GALECREST_ZONE.xMin).toBe(STRIP_MAX_X);
    expect(GALECREST_ZONE.xMax).toBe(540);
    expect(GALECREST_ZONE.zMin).toBe(3120);
    expect(GALECREST_ZONE.zMax).toBe(3640);
    // the 2D lookup resolves both columns of the shared row
    expect(zoneAt(0, 3380).id).toBe('willowfen');
    expect(zoneAt(360, 3380).id).toBe('galecrest');
    expect(zoneBiomeAt(360, 3380)).toBe('gale');
    expect(zoneBiomeAt(0, 3380)).toBe('fen');
    // appended LAST for rng-stream stability, wherever its band sits
    expect(ZONES[ZONES.length - 1].id).toBe('galecrest');
  });

  it('keeps its hub, graveyard, and camps on dry, in-zone ground', () => {
    const { hub, graveyard } = GALECREST_ZONE;
    expect(zoneAt(hub.x, hub.z).id).toBe('galecrest');
    expect(terrainHeight(hub.x, hub.z, SEED)).toBeGreaterThan(WATER_LEVEL);
    expect(terrainHeight(graveyard.x, graveyard.z, SEED)).toBeGreaterThan(WATER_LEVEL);
    for (const camp of GALECREST_CAMPS) {
      expect(zoneAt(camp.center.x, camp.center.z).id).toBe('galecrest');
      expect(
        terrainHeight(camp.center.x, camp.center.z, SEED),
        `camp ${camp.mobId}`,
      ).toBeGreaterThan(WATER_LEVEL);
    }
  });

  it('keeps every road on dry ground along its whole length', () => {
    for (const road of GALECREST_ROADS) {
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i];
        const b = road[i + 1];
        const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
        for (let k = 0; k <= steps; k++) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          expect(
            terrainHeight(x, z, SEED),
            `road ${Math.round(x)},${Math.round(z)}`,
          ).toBeGreaterThan(WATER_LEVEL);
        }
      }
    }
  });
});

describe('the Windway: a real walk-in border, no teleport', () => {
  it('is walkable on foot from the fen to the headlands', () => {
    // the whole crossing, fen side to gale side, sampled at footstep scale
    let prev = terrainHeight(140, 3380, SEED);
    let maxSlope = 0;
    for (let x = 141; x <= 250; x++) {
      const h = terrainHeight(x, 3380, SEED);
      expect(h, `crossing at x=${x}`).toBeGreaterThan(WATER_LEVEL);
      maxSlope = Math.max(maxSlope, Math.abs(h - prev));
      prev = h;
    }
    expect(maxSlope).toBeLessThan(1.5); // PLAYER_MAX_CLIMB_SLOPE
  });

  it('away from the isthmus the border is open water: a strait, not a wall', () => {
    for (const z of [3200, 3280, 3480, 3560]) {
      expect(terrainHeight(STRIP_MAX_X, z, SEED), `border at z=${z}`).toBeLessThan(WATER_LEVEL);
    }
  });

  it('the realm is one connected landmass from the pass', () => {
    // coarse flood fill over dry cells proves the Windway reaches the hub,
    // the beacon, and the wrecks without swimming
    const step = 8;
    const key = (x: number, z: number) => `${Math.round(x / step)},${Math.round(z / step)}`;
    const dry = (x: number, z: number) => terrainHeight(x, z, SEED) > WATER_LEVEL + 0.2;
    const seen = new Set<string>([key(200, 3380)]);
    const queue: [number, number][] = [[200, 3380]];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur) break;
      for (const [dx, dz] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ]) {
        const x = cur[0] + dx;
        const z = cur[1] + dz;
        if (x < 180 || x > 540 || z < 3120 || z > 3640) continue;
        const k = key(x, z);
        if (seen.has(k) || !dry(x, z)) continue;
        seen.add(k);
        queue.push([x, z]);
      }
    }
    const reached = (x: number, z: number) => seen.has(key(x, z));
    expect(reached(420, 3300), 'Wickharbor').toBe(true);
    expect(reached(496, 3248), 'the Old Beacon').toBe(true);
    expect(reached(344, 3584), 'the Wreckfields').toBe(true);
    expect(reached(300, 3462), 'the Mirror Tarn downs').toBe(true);
  });

  it('the headland landmass carries real land under every POI', () => {
    for (const poi of GALECREST_ZONE.pois) {
      const onLake = (GALECREST_ZONE.lakes ?? []).some(
        (l) => Math.hypot(poi.x - l.x, poi.z - l.z) <= l.radius + 4,
      );
      if (onLake) continue;
      expect(galeLandness(poi.x, poi.z), poi.label).toBeGreaterThan(0.1);
    }
  });
});
