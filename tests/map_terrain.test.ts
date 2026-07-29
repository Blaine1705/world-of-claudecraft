import { describe, expect, it } from 'vitest';
import { WORLD_MAX_X, WORLD_MIN_X, ZONES } from '../src/sim/data';
import { zoneBiomeAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import { type MapRegion, mapCanvasHeight, paintTerrainRows } from '../src/ui/map_terrain';

const SEED = WORLD_SEED;

function zoneRegion(zoneId: string): MapRegion {
  const zone = ZONES.find((z) => z.id === zoneId) ?? ZONES[0];
  return { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, minZ: zone.zMin, maxZ: zone.zMax };
}

// Render the whole canvas in one pass.
function renderFull(W: number, region: MapRegion, seed: number): Uint8ClampedArray {
  const H = mapCanvasHeight(W, region);
  const data = new Uint8ClampedArray(W * H * 4);
  paintTerrainRows(data, W, H, region, seed, 0, H);
  return data;
}

// Render the same canvas in row-band slices, the way the idle prewarm does.
function renderChunked(
  W: number,
  region: MapRegion,
  seed: number,
  rowsPerSlice: number,
): Uint8ClampedArray {
  const H = mapCanvasHeight(W, region);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let row = 0; row < H; row += rowsPerSlice) {
    paintTerrainRows(data, W, H, region, seed, row, Math.min(H, row + rowsPerSlice));
  }
  return data;
}

describe('map terrain painter', () => {
  const region = zoneRegion(ZONES[1]?.id ?? ZONES[0].id);
  const W = 96; // small but representative; keeps the test fast

  it('chunked render is byte-identical to a single pass (any slice size)', () => {
    const full = renderFull(W, region, SEED);
    for (const slice of [1, 7, 16, 13]) {
      expect(renderChunked(W, region, SEED, slice)).toEqual(full);
    }
  });

  it('is deterministic for a fixed seed and region', () => {
    expect(renderFull(W, region, SEED)).toEqual(renderFull(W, region, SEED));
  });

  it('writes a fully opaque RGBA buffer', () => {
    const data = renderFull(W, region, SEED);
    for (let k = 3; k < data.length; k += 4) expect(data[k]).toBe(255);
  });

  it('produces different terrain for different zones', () => {
    const a = renderFull(W, zoneRegion(ZONES[0].id), SEED);
    const b = renderFull(W, zoneRegion(ZONES[1].id), SEED);
    expect(a).not.toEqual(b);
  });

  // zoneBiomeAt now IS `zoneAt(x, z).biome` (the merge settlement delegated
  // it), so comparing the two would be a tautology that can never fail. The
  // map-colour contract is pinned as LITERALS instead, one per ladder arm of
  // the 2D walk: a rect hit in each column at one shared z, the
  // southmost-containing-band fallback where no rect covers x, and the
  // northmost clamp past the world's end. Values re-derived from the shipped
  // ZONES table; a zone reshape that moves these is a map-colour change and
  // should be decided, not absorbed.
  it('zoneBiomeAt walks the 2D ladder (literal probes per arm)', () => {
    // One z, three columns, three different biomes: the 2D rect hit.
    expect(zoneBiomeAt(0, 400)).toBe('marsh'); // mirefen strip
    expect(zoneBiomeAt(300, 400)).toBe('gale'); // galecrest east column
    expect(zoneBiomeAt(-300, 400)).toBe('fen'); // willowfen west column
    // No rect covers x=600 anywhere: the southmost band containing z wins.
    expect(zoneBiomeAt(600, 400)).toBe('marsh');
    // Past every zone's north end: the northmost zone clamps.
    expect(zoneBiomeAt(0, 2500)).toBe('ember'); // drakelands, zMax 2420
  });
});
