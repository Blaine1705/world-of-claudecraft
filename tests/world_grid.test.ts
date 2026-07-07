// The world grid: zones are rectangles, borders are shared edges. Stage 3
// generalized the border ridges from "walls between stacked bands" to "walls
// along any shared zone edge" and the world rims from constants to per-row
// bounds. These tests pin (a) that the CURRENT one-column world derives the
// exact classic border set, and (b) the new geometry (vertical edges,
// partial spans, pass resolution) against synthetic multi-column worlds.

import { describe, expect, it } from 'vitest';
import { STRIP_MAX_X, STRIP_MIN_X, worldXBoundsAt, ZONES } from '../src/sim/data';
import type { ZoneDef } from '../src/sim/types';
import { computeBorderEdges } from '../src/sim/world';

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

describe('the current world derives the classic border set', () => {
  const edges = computeBorderEdges(ZONES);

  it('has one full-row horizontal edge per band boundary, nothing else', () => {
    expect(edges.length).toBe(ZONES.length - 1);
    expect(edges.every((e) => e.kind === 'h')).toBe(true);
    expect(edges.every((e) => e.fullRow)).toBe(true);
  });

  it('keeps every crest, pass, and seal where the strip era put them', () => {
    for (let i = 0; i + 1 < ZONES.length; i++) {
      const sealed = ZONES[i + 1].sealedSouthBorder === true;
      const edge = edges[i];
      expect(edge.at).toBe(ZONES[i].zMax + (sealed ? 15 : 0));
      expect(edge.passAt).toBe(ZONES[i + 1].southPassX ?? 0);
      expect(edge.sealed).toBe(sealed);
    }
  });

  it('world x bounds are the strip everywhere, including beyond the ends', () => {
    for (const z of [-500, -100, 0, 700, 1500, 3000, 5500, 9000]) {
      expect(worldXBoundsAt(z)).toEqual({ min: STRIP_MIN_X, max: STRIP_MAX_X });
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
