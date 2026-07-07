// The world grid: zones are rectangles, borders are shared edges. Stage 3
// generalized the border ridges from "walls between stacked bands" to "walls
// along any shared zone edge" and the world rims from constants to per-row
// bounds. These tests pin (a) that the CURRENT one-column world derives the
// exact classic border set, and (b) the new geometry (vertical edges,
// partial spans, pass resolution) against synthetic multi-column worlds.

import { describe, expect, it } from 'vitest';
import { STRIP_MAX_X, STRIP_MIN_X, worldXBoundsAt, ZONES } from '../src/sim/data';
import type { ZoneDef } from '../src/sim/types';
import {
  computeBorderEdges,
  inBorderLake,
  inHollowOpenSea,
  terrainHeight,
  WATER_LEVEL,
} from '../src/sim/world';

function zone(partial: Partial<ZoneDef> & { id: string; zMin: number; zMax: number }): ZoneDef {
  return {
    name: partial.id,
    levelRange: [1, 10],
    biome: 'vale',
    hub: { x: 0, z: (partial.zMin + partial.zMax) / 2, radius: 10, name: partial.id },
    graveyard: { x: 0, z: (partial.zMin + partial.zMax) / 2 },
    lakes: [],
    pois: [],
    welcome: '',
    ...partial,
  } as ZoneDef;
}

describe('the continent derives the right border set', () => {
  const edges = computeBorderEdges(ZONES);

  it('has nine horizontal borders and four column crossings', () => {
    expect(edges.filter((e) => e.kind === 'h').length).toBe(9);
    expect(edges.filter((e) => e.kind === 'v').length).toBe(4);
  });

  it('every crossing sits where the atlas says', () => {
    const v = edges.filter((e) => e.kind === 'v');
    const find = (at: number, passAt: number) => v.find((e) => e.at === at && e.passAt === passAt);
    expect(find(-180, 1700), 'the Snowline (fire and ice)').toBeTruthy();
    expect(find(180, 2860), 'the Windway').toBeTruthy();
    expect(find(180, 3400), 'the Dreamsedge').toBeTruthy();
    expect(find(-180, 3410), 'the Tanglemouth').toBeTruthy();
    const woodClimb = edges.find((e) => e.kind === 'h' && e.at === 3120 && e.lo === 180);
    expect(woodClimb?.passAt, 'the Crowgate climb').toBe(390);
    const gardenGate = edges.find((e) => e.kind === 'h' && e.at === 3680);
    expect(gardenGate?.passAt, 'the Garden Gate').toBe(30);
  });

  it('the sealed Hollow wall survives untouched', () => {
    const sealed = edges.filter((e) => e.sealed);
    expect(sealed.length).toBe(1);
    expect(sealed[0].at).toBe(915);
  });

  it('row bounds widen exactly where columns live', () => {
    for (const z of [-100, 700, 1200, 2300, 3900, 9000]) {
      expect(worldXBoundsAt(z)).toEqual({ min: STRIP_MIN_X, max: STRIP_MAX_X });
    }
    for (const z of [1500, 1900]) {
      expect(worldXBoundsAt(z)).toEqual({ min: -540, max: STRIP_MAX_X });
    }
    for (const z of [2700, 3000]) {
      expect(worldXBoundsAt(z)).toEqual({ min: STRIP_MIN_X, max: 540 });
    }
    for (const z of [3200, 3600]) {
      expect(worldXBoundsAt(z)).toEqual({ min: -540, max: 540 });
    }
  });
});

describe('the interior waters are landlocked', () => {
  // The continent's border waters are meres ringed by land, not sea
  // straits: land caps hold every border's ends and corners, the basin
  // between them stays honest water, and the open-sea rules (swim fatigue,
  // rim suppression) never treat a mere as ocean. Enclosure itself (no
  // water path from any mere to the outer ocean) is proven exhaustively by
  // the flood-fill probe (tmp/border_lakes_probe.mts); these pins keep the
  // caps and basins from silently regressing.
  const SEEDS = [1337, 20061];

  it('every corner cap and seal is dry land', () => {
    const caps: [string, number, number][] = [
      ['the Snowline south cap', -180, 1468],
      ['the Snowline north cap', -180, 1931],
      ['the Goldmelt west seal', -130, 2040],
      ['the Goldmelt east seal', 131, 2040],
      ['the Amberfen west seal', -132, 2600],
      ['the southeast corner knot', 162, 2600],
      ['the Windmere south seal', 180, 2631],
      ['the Four Corners, fen and night faces', 162, 3120],
      ['the Four Corners, gale and wood faces', 199, 3120],
      ['the Nightgate west seal', -162, 3120],
      ['the Dreamsedge north seal', 180, 3641],
      ['the Tanglemouth north seal', -180, 3641],
      ['the Garden Gate west seal', -162, 3680],
      ['the Garden Gate east seal', 162, 3680],
      ['the Crowmere east seal', 502, 3120],
    ];
    for (const seed of SEEDS) {
      for (const [name, x, z] of caps) {
        expect(terrainHeight(x, z, seed), `${name} (seed ${seed})`).toBeGreaterThan(
          WATER_LEVEL + 0.4,
        );
      }
    }
  });

  it('every mere still holds water, classified as lake, never open sea', () => {
    const hearts: [string, number, number][] = [
      ['the Meltwater', -180, 1590],
      ['the Windmere', 180, 2760],
      ['the Dreammere', 180, 3280],
      ['the Tanglewater', -180, 3520],
      ['the Goldmelt Water', -80, 2045],
      ['the Amber Broads', 70, 2600],
      ['the Nightwater', 60, 3122],
      ['the Moonmere', -60, 3680],
      ['the Crowmere', 300, 3120],
    ];
    for (const seed of SEEDS) {
      for (const [name, x, z] of hearts) {
        expect(terrainHeight(x, z, seed), `${name} (seed ${seed})`).toBeLessThan(WATER_LEVEL);
        expect(inBorderLake(x, z), `${name} rect`).toBe(true);
        expect(inHollowOpenSea(x, z), `${name} must not be open sea`).toBe(false);
      }
    }
  });

  it('the outer ocean is still the outer ocean', () => {
    // the flanks beyond the columns and the Hollow sound stay open sea
    for (const [x, z] of [
      [-560, 2300],
      [560, 2000],
      [-300, 3900],
      [160, 1380],
    ]) {
      expect(terrainHeight(x, z, 20061), `ocean at ${x},${z}`).toBeLessThan(WATER_LEVEL);
      expect(inBorderLake(x, z), `not a mere at ${x},${z}`).toBe(false);
    }
  });
});

describe('vertical edges between columns', () => {
  // a strip zone with an east column beside its band
  const A = zone({ id: 'a', zMin: 0, zMax: 360 });
  const EAST = zone({ id: 'east', zMin: 0, zMax: 360, xMin: STRIP_MAX_X, xMax: 540 });

  it('derives a vertical edge along the shared column border', () => {
    const edges = computeBorderEdges([A, EAST]);
    const v = edges.filter((e) => e.kind === 'v');
    expect(v.length).toBe(1);
    expect(v[0].at).toBe(STRIP_MAX_X);
    expect(v[0].lo).toBe(0);
    expect(v[0].hi).toBe(360);
    expect(v[0].fullRow).toBe(false); // column borders always feather at ends
  });

  it('resolves the pass from the east zone west pass, then the west zone east pass', () => {
    const eastWithPass = { ...EAST, westPassZ: 120 };
    expect(computeBorderEdges([A, eastWithPass]).find((e) => e.kind === 'v')?.passAt).toBe(120);
    const aWithPass = { ...A, eastPassZ: 250 };
    expect(computeBorderEdges([aWithPass, EAST]).find((e) => e.kind === 'v')?.passAt).toBe(250);
    // neither declared: the span midpoint
    expect(computeBorderEdges([A, EAST]).find((e) => e.kind === 'v')?.passAt).toBe(180);
  });

  it('a column beside only part of a tall neighbor spans just the overlap', () => {
    const tall = zone({ id: 'tall', zMin: 0, zMax: 1000 });
    const sideCol = zone({ id: 'side', zMin: 200, zMax: 700, xMin: STRIP_MAX_X, xMax: 500 });
    const v = computeBorderEdges([tall, sideCol]).find((e) => e.kind === 'v');
    expect(v).toBeTruthy();
    expect(v?.lo).toBe(200);
    expect(v?.hi).toBe(700);
  });
});

describe('horizontal edges in a multi-column world', () => {
  it('a band boundary shared by offset columns produces the overlap edge, not full row', () => {
    const south = zone({ id: 's', zMin: 0, zMax: 360 });
    const north = zone({ id: 'n', zMin: 360, zMax: 720 });
    // an east column in the NORTH row only: the classic boundary is no
    // longer the whole row, so its ridge must feather at the column seam
    const northEast = zone({ id: 'ne', zMin: 360, zMax: 720, xMin: STRIP_MAX_X, xMax: 540 });
    const edges = computeBorderEdges([south, north, northEast]);
    const h = edges.filter((e) => e.kind === 'h');
    expect(h.length).toBe(1); // south-north only; south and northEast do not overlap in x
    expect(h[0].lo).toBe(STRIP_MIN_X);
    expect(h[0].hi).toBe(STRIP_MAX_X);
    expect(h[0].fullRow).toBe(false); // the north row extends past the span
  });

  it('zones that do not touch produce no edge', () => {
    const a = zone({ id: 'a', zMin: 0, zMax: 360 });
    const island = zone({ id: 'b', zMin: 500, zMax: 800, xMin: 700, xMax: 1000 });
    expect(computeBorderEdges([a, island]).length).toBe(0);
  });
});
