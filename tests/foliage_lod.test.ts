import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type BucketWindowInput,
  bucketVisible,
  fogBlendAt,
  foliageDistanceScale,
  foliageFogLimit,
  IMPOSTOR_MIN_FOG_BLEND,
  LOD_HIGH,
  LOD_LOW,
  lodDistsFor,
  treeDetailDistance,
} from '../src/render/foliage_lod';

// The adaptive budget's foliage lever spans [0, 1]; the distance scale and the
// fog cull both derive from it, so tests must move them as the one dial they
// are. 0 is the starved floor (high-tier scale 0.72), 1 the rested ceiling.
const QUALITY_LEVELS = [0, 0.35, 0.5, 0.72, 1];
const WORST_SCALE = foliageDistanceScale(0, false);
const BEST_SCALE = foliageDistanceScale(1, false);

/** The live update() pairing of (distanceScale, fogLimit, detailFar) at one governor level. */
function detailAt(
  fog: { near: number; far: number },
  modelQuality: number,
  leanFoliage = false,
): { detailFar: number; fogLimit: number } {
  const fogLimit = foliageFogLimit(fog.far, modelQuality);
  const base = lodDistsFor(leanFoliage).treeDetailFar;
  const scale = foliageDistanceScale(modelQuality, leanFoliage);
  return { detailFar: treeDetailDistance(base, fog.near, fog.far, scale, fogLimit), fogLimit };
}

// The shipped per-biome fog, parsed from the renderer rather than restated here,
// so a new zone (or a widened view distance) is covered by these tests the day it
// lands instead of the day someone remembers to update a fixture.
function shippedBiomeFog(): { biome: string; near: number; far: number }[] {
  const src = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
  const block = /BIOME_FOG[^{]*\{([\s\S]*?)\n {2}\};/.exec(src);
  expect(block, 'BIOME_FOG table not found in renderer.ts').not.toBe(null);
  const rows = [
    ...(block as RegExpExecArray)[1].matchAll(
      /(\w+):\s*\{[^}]*near:\s*([\d.]+),\s*far:\s*([\d.]+)/g,
    ),
  ].map((m) => ({ biome: m[1], near: Number(m[2]), far: Number(m[3]) }));
  expect(rows.length, 'parsed no fog rows out of BIOME_FOG').toBeGreaterThan(3);
  return rows;
}

function windowFor(over: Partial<BucketWindowInput> & { centerDist: number }): BucketWindowInput {
  return {
    radius: 0,
    distanceScale: BEST_SCALE,
    detailFar: 300,
    revealScale: 1,
    fogLimit: Number.POSITIVE_INFINITY,
    ...over,
  };
}
// The two buckets a species places over the SAME trees: the real GLB model
// inside the detail radius, the cone/blob impostor outside it.
const realTrees = (centerDist: number, over: Partial<BucketWindowInput> = {}) =>
  windowFor({ centerDist, maxAtDetail: true, ...over });
const impostors = (centerDist: number, over: Partial<BucketWindowInput> = {}) =>
  windowFor({ centerDist, minAtDetail: true, ...over });

describe('foliage LOD: the far-tree impostor never stands in clear air', () => {
  const qualityCases = shippedBiomeFog().flatMap((fog) =>
    QUALITY_LEVELS.flatMap((q) => [
      { ...fog, q, lean: false },
      { ...fog, q, lean: true },
    ]),
  );

  it.each(qualityCases)(
    'biome $biome at quality $q (lean $lean): swap under heavy fog, never past the cull',
    ({ near, far, q, lean }) => {
      const { detailFar, fogLimit } = detailAt({ near, far }, q, lean);
      // Real trees must never be drawn past the line the fog cull drops them at.
      expect(detailFar).toBeLessThanOrEqual(fogLimit);
      // A starved budget can never drag the swap into clear air: the floor (or,
      // when even the floor is culled, the cull line itself) always holds.
      const fogFloor = near + IMPOSTOR_MIN_FOG_BLEND * (far - near);
      expect(detailFar).toBeGreaterThanOrEqual(Math.min(fogFloor, fogLimit));
      // Where an impostor band exists at all, it starts inside the murk.
      if (detailFar < fogLimit) {
        expect(fogBlendAt(detailFar, near, far)).toBeGreaterThanOrEqual(
          IMPOSTOR_MIN_FOG_BLEND - 1e-9,
        );
      }
    },
  );

  it('regression: a build-time 300u swap left cones half-clear in the long-fog zones', () => {
    // This is the reported bug, not the fix's own arithmetic. The Vale opens to
    // 470u; a flat 300u swap sits at 50% fog, i.e. plainly visible as a cone.
    // Revert treeDetailDistance to a constant and this fails.
    const vale = { near: 130, far: 470 };
    expect(fogBlendAt(300, vale.near, vale.far)).toBeLessThan(IMPOSTOR_MIN_FOG_BLEND);

    const { detailFar: fixed } = detailAt(vale, 1);
    expect(fixed).toBeGreaterThan(LOD_HIGH.treeDetailFar);
    expect(fogBlendAt(fixed, vale.near, vale.far)).toBeGreaterThanOrEqual(IMPOSTOR_MIN_FOG_BLEND);
  });

  it('a starved frame budget cannot drag cones toward the camera', () => {
    // The "cones until they load" half of the report: nothing is loading. The
    // budget dips while assets decode and shaders compile, the detail radius
    // shrank with it (300 * 0.72 = 216u), and the cones marched in until it
    // recovered. Starved, the swap may only move OUT (to the mq-0 fog cull,
    // where no impostor band exists at all), never in toward clear air.
    const vale = { near: 130, far: 470 };
    const starved = detailAt(vale, 0);
    const rested = detailAt(vale, 1);

    expect(starved.detailFar).toBeGreaterThan(LOD_HIGH.treeDetailFar * WORST_SCALE);
    // rested: the fog floor (368u); starved: capped by the mq-0 cull just below
    expect(rested.detailFar).toBe(130 + IMPOSTOR_MIN_FOG_BLEND * (470 - 130));
    // the Vale's mq-0 cull (366.6u) sits just under its fog floor (368u): the
    // starved swap parks ON the cull line, so no impostor band and no cones
    expect(starved.detailFar).toBe(starved.fogLimit);
    expect(starved.detailFar).toBe(Math.min(rested.detailFar, starved.fogLimit));
  });

  it('short-fog realms finally hand their far band to impostors', () => {
    // The marsh closes at 165u while the budgeted radius is 216-300u, so the
    // swap used to land past the fog cull at EVERY governor level: the impostor
    // window was empty and real trees were drawn right up to the line that
    // culled them (measured live: core 1.36M triangles, impostors 0 buckets).
    const marsh = { near: 75, far: 165 };
    const floor = marsh.near + IMPOSTOR_MIN_FOG_BLEND * (marsh.far - marsh.near); // 138

    for (const q of [0.5, 0.72, 1]) {
      const { detailFar, fogLimit } = detailAt(marsh, q);
      expect(detailFar, `quality ${q} must leave an impostor band`).toBeLessThan(fogLimit);
      expect(detailFar).toBe(floor);
    }
    // At the starved floor the cull line sits under the fog floor: no band, and
    // real trees run to the cull rather than past it.
    const starved = detailAt(marsh, 0);
    expect(starved.detailFar).toBe(starved.fogLimit);
  });

  it('the cave keeps its swap cheap AND gains a band', () => {
    // Pre-fix pin: best-scale cave detail was the flat 300u constant, 110u past
    // its own 190u fog wall. The retreat rule pulls it to the fog floor, which
    // is BOTH cheaper than the old constant and inside the cull for the first
    // time, so the cave's far band goes to cones like everywhere else.
    const cave = { near: 45, far: 190 };
    const floor = cave.near + IMPOSTOR_MIN_FOG_BLEND * (cave.far - cave.near); // 146.5
    for (const q of QUALITY_LEVELS) {
      const { detailFar, fogLimit } = detailAt(cave, q);
      expect(detailFar).toBe(Math.min(floor, fogLimit));
      expect(detailFar).toBeLessThanOrEqual(300);
    }
  });
});

describe('foliage LOD: the real-model and impostor windows partition the world', () => {
  const detailFar = 368; // the Vale's fog-derived swap

  it('exactly one of the two draws at every distance, for every bucket depth', () => {
    for (const radius of [0, 60, 120]) {
      for (let d = radius; d <= 900; d += 7) {
        const drawn = [
          realTrees(d, { detailFar, radius }),
          impostors(d, { detailFar, radius }),
        ].filter(bucketVisible).length;
        // 2 = the same tree drawn twice (z-fighting); 0 = a hole in the forest.
        expect(drawn, `radius ${radius}, distance ${d}`).toBe(1);
      }
    }
  });

  it('a bucket you are standing at the edge of still draws real trees', () => {
    // Buckets are 240u deep. Keyed on the bucket CENTER, a bucket whose near edge
    // is right under the player could already have flipped to cones. Keyed on the
    // near edge, it cannot.
    const radius = 120;
    const straddling = detailFar + 60; // center past the swap, near edge well inside
    expect(bucketVisible(realTrees(straddling, { detailFar, radius }))).toBe(true);
    expect(bucketVisible(impostors(straddling, { detailFar, radius }))).toBe(false);

    const wellPast = detailFar + radius + 1; // the whole bucket is past the swap
    expect(bucketVisible(realTrees(wellPast, { detailFar, radius }))).toBe(false);
    expect(bucketVisible(impostors(wellPast, { detailFar, radius }))).toBe(true);
  });

  it('the near-fill half still culls at its own cap, and grows no impostor there', () => {
    // Half of each species drops out at treeFillFar to keep the far field cheap.
    // That cap is TIGHTER than the fog-derived swap, so those trees must simply
    // vanish: they must not reappear as cones just because the swap moved out.
    const fill = LOD_HIGH.treeFillFar; // 310, inside detailFar 368
    const nearFillTrees = (d: number) => realTrees(d, { detailFar, maxDist: fill });
    const nearFillImpostors = (d: number) => impostors(d, { detailFar, maxDist: fill });

    expect(bucketVisible(nearFillTrees(fill - 1))).toBe(true);
    expect(bucketVisible(nearFillTrees(fill + 1))).toBe(false);
    for (const d of [fill + 1, detailFar - 1, detailFar + 1, 500]) {
      expect(bucketVisible(nearFillImpostors(d)), `no near-fill cone at ${d}`).toBe(false);
    }
  });

  it('buckets behind the fog wall are dropped whichever LOD they are', () => {
    const fogLimit = 400;
    expect(bucketVisible(impostors(500, { detailFar, fogLimit }))).toBe(false);
    expect(bucketVisible(realTrees(500, { detailFar, fogLimit }))).toBe(false);
    expect(bucketVisible(impostors(380, { detailFar, fogLimit }))).toBe(true);
  });

  it('a cost cap cuts on the bucket CENTER, not its near edge', () => {
    // Buckets are ~240u deep. The density/rock/dressing caps exist to cut
    // triangles, so measuring them from the near edge would keep every bucket
    // alive for another half-bucket past its cap: measured live in the Vale, that
    // one slip took foliage from ~1.0M to ~4.6M triangles a frame. Only the
    // detail swap gets the near-edge treatment.
    const radius = 120;
    const cap = LOD_HIGH.treeFillFar; // 310
    const pastCap = windowFor({
      centerDist: cap + 20, // center is past the cap...
      radius, // ...but the near edge (410 - 120 = 190) is well inside it
      maxDist: cap,
      detailFar: 368,
    });
    expect(bucketVisible(pastCap)).toBe(false);
    expect(bucketVisible({ ...pastCap, centerDist: cap - 20 })).toBe(true);
  });

  it('the budget still scales build-time bounds, just not the fog-derived one', () => {
    // A plain numeric bound (rocks, dressing, the near-fill cull) keeps shrinking
    // under load, which is the budget's whole point. rockFar 360 at half budget
    // is 180, so a rock bucket at 200u is culled.
    const rock = windowFor({ centerDist: 200, maxDist: LOD_HIGH.rockFar, distanceScale: 0.5 });
    expect(bucketVisible(rock)).toBe(false);
    expect(bucketVisible({ ...rock, distanceScale: 1 })).toBe(true);
  });
});

describe('foliage LOD: tiers and purity', () => {
  it('hands the low tier its own, tighter table', () => {
    expect(lodDistsFor(true)).toBe(LOD_LOW);
    expect(lodDistsFor(false)).toBe(LOD_HIGH);
    expect(LOD_LOW.treeDetailFar).toBeLessThan(LOD_HIGH.treeDetailFar);
  });

  it('stays a pure decision module: no Three, no sim', () => {
    const src = readFileSync(new URL('../src/render/foliage_lod.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^import/m);
  });
});
