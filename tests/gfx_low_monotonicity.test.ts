import { describe, expect, it } from 'vitest';
import { GFX_BUCKET_BANDS, GFX_BUDGETS, gfxInternalsForTest } from '../src/render/gfx';
import { type RenderBudgetCaps, RenderBudgetGovernor } from '../src/render/render_budget';

// Low must never draw more than medium. Every pin below reads BOTH tiers' real
// exported tables (never a literal standing in for one of them), so a future edit
// that walks low back above medium on any axis reds here.

function capsFor(tier: 'low' | 'medium'): RenderBudgetCaps {
  return new RenderBudgetGovernor({
    tier,
    budget: GFX_BUDGETS[tier],
    enabled: true,
  }).state().caps;
}

// Mirrors foliage.ts activeRadius: Math.round(baseRadius * Math.max(minRadiusScale,
// quality) * 10) / 10, where minRadiusScale is lush ? 0.58 : 0.48.
const LEAN_MIN_RADIUS_SCALE = 0.48;
const LUSH_MIN_RADIUS_SCALE = 0.58;

function activeRadius(baseRadius: number, minRadiusScale: number, quality: number): number {
  return Math.round(baseRadius * Math.max(minRadiusScale, quality) * 10) / 10;
}

const GOVERNABLE_BUCKETS = ['grass', 'foliage', 'lighting', 'vfx'] as const;
const NON_GOVERNABLE_BUCKETS = [
  'props',
  'materials',
  'waterSky',
  'worldStreaming',
  'ui',
  'characters',
  'weapons',
] as const;

describe('low tier stays monotonically lighter than medium', () => {
  const low = gfxInternalsForTest.settingsFor('low');
  const medium = gfxInternalsForTest.settingsFor('medium');
  const lowCaps = capsFor('low');
  const mediumCaps = capsFor('medium');

  it('draws grass over a smaller radius', () => {
    expect(low.grassRadius).toBeLessThan(medium.grassRadius);
  });

  it('keeps a smaller baseline grass ring than medium', () => {
    const lowRing = low.grassRadius * GFX_BUCKET_BANDS.low.grass.baseline;
    const mediumRing = medium.grassRadius * GFX_BUCKET_BANDS.medium.grass.baseline;
    expect(lowRing).toBeLessThan(mediumRing);
  });

  it('keeps a smaller fully degraded grass ring than medium', () => {
    // Low is leanFoliage, medium (unhinted) is lush, so the two tiers floor their
    // radius against different scales; the low floor must still be the smaller ring.
    expect(low.leanFoliage).toBe(true);
    expect(medium.leanFoliage).toBe(false);
    const lowFloor = activeRadius(low.grassRadius, LEAN_MIN_RADIUS_SCALE, lowCaps.minGrassLevel);
    const mediumFloor = activeRadius(
      medium.grassRadius,
      LUSH_MIN_RADIUS_SCALE,
      mediumCaps.minGrassLevel,
    );
    expect(lowFloor).toBeLessThan(mediumFloor);
  });

  it.each(GOVERNABLE_BUCKETS)(
    'starts bucket %s below medium and cannot enrich past it',
    (bucket) => {
      expect(GFX_BUCKET_BANDS.low[bucket].baseline).toBeLessThan(
        GFX_BUCKET_BANDS.medium[bucket].baseline,
      );
      expect(GFX_BUCKET_BANDS.low[bucket].max).toBeLessThan(GFX_BUCKET_BANDS.medium[bucket].max);
    },
  );

  it.each(NON_GOVERNABLE_BUCKETS)(
    'keeps the non-governable bucket %s at or under medium on min, baseline and max',
    (bucket) => {
      // Several of these rows are deliberately equal (weapons, the ui max), so
      // this sweep bounds rather than demands strictness; the point is that NO
      // row, dormant or not, sits above medium.
      expect(GFX_BUCKET_BANDS.low[bucket].min).toBeLessThanOrEqual(
        GFX_BUCKET_BANDS.medium[bucket].min,
      );
      expect(GFX_BUCKET_BANDS.low[bucket].baseline).toBeLessThanOrEqual(
        GFX_BUCKET_BANDS.medium[bucket].baseline,
      );
      expect(GFX_BUCKET_BANDS.low[bucket].max).toBeLessThanOrEqual(
        GFX_BUCKET_BANDS.medium[bucket].max,
      );
    },
  );

  it('keeps every render budget cap at or under medium', () => {
    expect(lowCaps.targetCalls).toBeLessThan(mediumCaps.targetCalls);
    expect(lowCaps.urgentCalls).toBeLessThan(mediumCaps.urgentCalls);
    expect(lowCaps.targetTriangles).toBeLessThan(mediumCaps.targetTriangles);
    expect(lowCaps.urgentTriangles).toBeLessThan(mediumCaps.urgentTriangles);
    expect(lowCaps.targetGrassTufts).toBeLessThan(mediumCaps.targetGrassTufts);
    expect(lowCaps.urgentGrassTufts).toBeLessThan(mediumCaps.urgentGrassTufts);
  });

  it('lets low shed at least as far as medium on every quality floor', () => {
    // Equality is the derivation rule (low inherits medium's minima), so these are
    // pinned to medium's live values rather than only bounded by them.
    expect(lowCaps.minGrassLevel).toBe(mediumCaps.minGrassLevel);
    expect(lowCaps.minFoliageLevel).toBe(mediumCaps.minFoliageLevel);
    expect(lowCaps.minVfxLevel).toBe(mediumCaps.minVfxLevel);
    expect(lowCaps.minLightingLevel).toBe(mediumCaps.minLightingLevel);
  });

  it('draws no more point lights at baseline than medium', () => {
    const lowLights = Math.round(low.maxPointLights * GFX_BUCKET_BANDS.low.lighting.baseline);
    const mediumLights = Math.round(
      medium.maxPointLights * GFX_BUCKET_BANDS.medium.lighting.baseline,
    );
    expect(lowLights).toBeLessThanOrEqual(mediumLights);
  });

  it('mirrors each caps floor onto the matching band minimum in both tiers', () => {
    expect(lowCaps.minGrassLevel).toBe(GFX_BUCKET_BANDS.low.grass.min);
    expect(lowCaps.minFoliageLevel).toBe(GFX_BUCKET_BANDS.low.foliage.min);
    expect(lowCaps.minVfxLevel).toBe(GFX_BUCKET_BANDS.low.vfx.min);
    expect(lowCaps.minLightingLevel).toBe(GFX_BUCKET_BANDS.low.lighting.min);
    expect(mediumCaps.minGrassLevel).toBe(GFX_BUCKET_BANDS.medium.grass.min);
    expect(mediumCaps.minFoliageLevel).toBe(GFX_BUCKET_BANDS.medium.foliage.min);
    expect(mediumCaps.minVfxLevel).toBe(GFX_BUCKET_BANDS.medium.vfx.min);
    expect(mediumCaps.minLightingLevel).toBe(GFX_BUCKET_BANDS.medium.lighting.min);
  });

  it('keeps every low band ordered min <= baseline <= max within the unit range', () => {
    for (const bucket of GOVERNABLE_BUCKETS) {
      const band = GFX_BUCKET_BANDS.low[bucket];
      expect(band.min).toBeGreaterThanOrEqual(0);
      expect(band.min).toBeLessThanOrEqual(band.baseline);
      expect(band.baseline).toBeLessThanOrEqual(band.max);
      expect(band.max).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the already lighter low knobs lighter', () => {
    // grassStep is spacing (bigger is fewer tufts) and the far density floor is a
    // fraction of full density; both were already on the light side of medium.
    expect(low.grassStep).toBeGreaterThan(medium.grassStep);
    expect(low.farGrassDensityFloor).toBeLessThan(medium.farGrassDensityFloor);
  });
});
