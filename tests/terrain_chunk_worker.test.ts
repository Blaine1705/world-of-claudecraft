import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  beginChunkGeometry,
  fillChunkIndexRow,
  fillChunkVertexRow,
} from '../src/render/terrain_chunk_build';
import { shoreDepthAt, shoreSlopeAt } from '../src/render/water_core';
import { zoneBuildPool } from '../src/render/zone_build_pool';
import {
  buildChunkArrays,
  buildWaterFillArrays,
  type TerrainChunkRequest,
  type WaterFillRequest,
} from '../src/render/zone_build_worker';
import { isBuiltinWorldActive, setActiveWorldContent } from '../src/sim/data';

// The worker's entry point is a SECOND route to the same geometry, so it can
// drift from the main-thread one: drop an index row, mis-order the fills, miss
// a field off the response. Then chunks would render differently depending on
// which thread happened to build them, which no screenshot would reliably
// catch. These compare the two routes directly.

const JOB: TerrainChunkRequest = {
  kind: 'chunk',
  id: 1,
  x0: -60,
  z0: 240,
  size: 60,
  spacing: 2,
  seed: 20061,
  withSplat: true,
  skirtSpan: 8,
  lowShade: false,
};

/** The main-thread route, spelled out, so this is not a self-comparison. */
function buildOnThisThread(job: TerrainChunkRequest) {
  const state = beginChunkGeometry(
    job.x0,
    job.z0,
    job.size,
    job.spacing,
    job.seed,
    job.withSplat,
    job.skirtSpan,
    job.lowShade,
  );
  for (let row = 0; row < state.gh; row++) fillChunkVertexRow(state, row);
  for (let row = 0; row < state.gh - 1; row++) fillChunkIndexRow(state, row);
  return state;
}

describe('off-thread chunk generation matches the main thread', () => {
  it('produces identical arrays for the same job', () => {
    const viaWorker = buildChunkArrays(JOB);
    const viaMain = buildOnThisThread(JOB);

    expect(viaWorker.positions.length).toBeGreaterThan(0);
    expect(viaWorker.indices.length).toBeGreaterThan(0);
    expect(Array.from(viaWorker.positions)).toEqual(Array.from(viaMain.positions));
    expect(Array.from(viaWorker.normals)).toEqual(Array.from(viaMain.normals));
    expect(Array.from(viaWorker.colors)).toEqual(Array.from(viaMain.colors));
    expect(Array.from(viaWorker.uvs)).toEqual(Array.from(viaMain.uvs));
    expect(Array.from(viaWorker.indices)).toEqual(Array.from(viaMain.indices));
    expect(viaWorker.splats).not.toBeNull();
    expect(Array.from(viaWorker.splats ?? [])).toEqual(Array.from(viaMain.splats ?? []));
    expect(Array.from(viaWorker.extras ?? [])).toEqual(Array.from(viaMain.extras ?? []));
  });

  it('honours the caller-resolved tier flag instead of reading gfx.ts', () => {
    // gfx.ts reads document/navigator, so a worker would resolve a DIFFERENT
    // tier and shade chunks two ways depending on the thread. The flag has to
    // travel on the request, and it has to actually do something.
    const lit = buildChunkArrays({ ...JOB, lowShade: false });
    const shaded = buildChunkArrays({ ...JOB, lowShade: true, withSplat: false });
    expect(Array.from(shaded.colors)).not.toEqual(Array.from(lit.colors));
    // ...and only the colours: the surface itself is the same shape either way.
    expect(Array.from(shaded.positions)).toEqual(Array.from(lit.positions));
  });

  it('omits the splat attributes on the low tier', () => {
    const low = buildChunkArrays({ ...JOB, withSplat: false });
    expect(low.splats).toBeNull();
    expect(low.extras).toBeNull();
  });

  it('degrades to null where module workers are unavailable', () => {
    // Node has no Worker, which is exactly the contract: off-thread generation
    // is a latency optimisation and every caller keeps a main-thread path, so
    // an environment without workers must get null rather than a throw.
    expect(typeof Worker).toBe('undefined');
    expect(zoneBuildPool()).toBeNull();
  });
});

// The water sheets' shore attributes ride the same worker. Same hazard as the
// geometry above: a second route to the same numbers can drift (a swapped
// depth/slope pair, a seed dropped off the request, the grid walked in the
// wrong axis order), and the result would be foam and shallow tint landing in
// different places depending on which thread baked the sheet.
describe('off-thread water fill matches the main thread', () => {
  const SEED = 20061;

  /** A small synthetic grid straddling a coastline, walked exactly the way
   *  water.ts walks a sheet's position attribute (row major). */
  function coordinateGrid(): { x: Float32Array; z: Float32Array } {
    const columns = 7;
    const rows = 5;
    const x = new Float32Array(columns * rows);
    const z = new Float32Array(columns * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const i = r * columns + c;
        x[i] = -84 + c * 13.5;
        z[i] = 306 + r * 11.25;
      }
    }
    return { x, z };
  }

  it('produces identical shore depth and slope for the same coordinates', () => {
    const grid = coordinateGrid();
    const job: WaterFillRequest = { kind: 'water-fill', id: 1, ...grid, seed: SEED };
    const viaWorker = buildWaterFillArrays(job);

    // The main-thread route, spelled out, so this is not a self-comparison.
    const shoreDepth = new Float32Array(grid.x.length);
    const shoreSlope = new Float32Array(grid.x.length);
    for (let i = 0; i < grid.x.length; i++) {
      shoreDepth[i] = shoreDepthAt(grid.x[i], grid.z[i], SEED);
      shoreSlope[i] = shoreSlopeAt(grid.x[i], grid.z[i], SEED);
    }

    expect(viaWorker.shoreDepth).toEqual(shoreDepth);
    expect(viaWorker.shoreSlope).toEqual(shoreSlope);
    // ...and the sample is actually doing something: a flat constant would
    // satisfy the comparison above.
    expect(new Set(Array.from(viaWorker.shoreDepth)).size).toBeGreaterThan(1);
    expect(new Set(Array.from(viaWorker.shoreSlope)).size).toBeGreaterThan(1);
  });

  it('samples the coordinates it is given, not a grid it re-derives', () => {
    const grid = coordinateGrid();
    const shifted = Float32Array.from(grid.x, (v) => v + 40);
    const here = buildWaterFillArrays({ kind: 'water-fill', id: 1, ...grid, seed: SEED });
    const there = buildWaterFillArrays({
      kind: 'water-fill',
      id: 2,
      x: shifted,
      z: grid.z,
      seed: SEED,
    });
    expect(Array.from(there.shoreDepth)).not.toEqual(Array.from(here.shoreDepth));
    for (let i = 0; i < shifted.length; i++) {
      // fround: the arrays are Float32, the reference sample is a double.
      expect(there.shoreDepth[i]).toBe(Math.fround(shoreDepthAt(shifted[i], grid.z[i], SEED)));
    }
  });

  it('carries the seed on the request rather than assuming one', () => {
    const grid = coordinateGrid();
    const a = buildWaterFillArrays({ kind: 'water-fill', id: 1, ...grid, seed: SEED });
    const b = buildWaterFillArrays({ kind: 'water-fill', id: 2, ...grid, seed: SEED + 7 });
    expect(Array.from(b.shoreDepth)).not.toEqual(Array.from(a.shoreDepth));
  });
});

describe('zoneBuildPool custom-world guard', () => {
  it('refuses to hand out the pool while a custom world is active, and recovers after', () => {
    expect(isBuiltinWorldActive()).toBe(true);
    setActiveWorldContent({ zones: [], spawns: [] } as never);
    try {
      expect(isBuiltinWorldActive()).toBe(false);
      // A worker samples its own module copy of the content (the built-in
      // world), so the accessor must force the main-thread fallback here.
      expect(zoneBuildPool()).toBeNull();
    } finally {
      setActiveWorldContent(null);
    }
    expect(isBuiltinWorldActive()).toBe(true);
  });

  it('guards the accessor itself, not a call site (source pin)', () => {
    // Node has no module workers, so the runtime arm above cannot separate
    // "custom world refused" from "no Worker": pin the guard's placement.
    const source = readFileSync(
      path.resolve(__dirname, '../src/render/zone_build_pool.ts'),
      'utf8',
    );
    const accessor = source.slice(source.indexOf('export function zoneBuildPool'));
    expect(accessor).toContain('if (!isBuiltinWorldActive()) return null;');
    expect(accessor.indexOf('isBuiltinWorldActive')).toBeLessThan(
      accessor.indexOf('createZoneBuildPool'),
    );
  });
});
