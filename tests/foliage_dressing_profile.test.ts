import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/assets/loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/render/assets/loader')>();
  return {
    ...actual,
    loadGltf: () => new Promise(() => {}),
    loadTexture: () => new Promise(() => {}),
    releaseGltf: () => {},
  };
});
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: () => {},
  registerDeferredPreload: () => {},
}));
vi.mock('../src/render/textures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/render/textures')>();
  return {
    ...actual,
    grassTuftTexture: () => new THREE.Texture(),
    flowerTuftTexture: () => new THREE.Texture(),
  };
});
vi.mock('../src/render/gfx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/render/gfx')>();
  return {
    ...actual,
    // A LIVE object: the tests below mutate it between generateDressing calls,
    // which is safe because the dressing profile is read at call time.
    GFX: actual.gfxInternalsForTest.settingsFor('low'),
  };
});

// The ground-dressing richness trio (step 10 vs 12, the 1.24 density scale, the
// 1.08 spot boost) is compensation art for the weak-GPU cohort, the same family
// as the fatter lowPlus grass cards. It must ride GFX.lowPlus, never the tier
// or leanFoliage: a plain low session takes medium-parity dressing so low stays
// monotonically lighter (the July investigation measured the old lean-keyed
// boost at about 1.79x medium's dressing density on every low session).
describe('ground dressing richness profile', () => {
  it('gives a plain low session medium-parity dressing and reserves the boost for lowPlus', async () => {
    const { GFX } = await import('../src/render/gfx');
    const { foliageDressingInternalsForTest } = await import('../src/render/foliage');
    const { generateDressing, dressStep } = foliageDressingInternalsForTest;
    const live = GFX as { lowPlus: boolean } & typeof GFX;

    expect(live.lowPlus).toBe(false);
    expect(dressStep()).toBe(12);
    const plainLow = generateDressing(20_061);
    expect(plainLow.length).toBeGreaterThan(0);

    live.lowPlus = true;
    expect(dressStep()).toBe(10);
    const weakLow = generateDressing(20_061);
    // Tighter grid AND the 1.24 density scale: strictly more spots.
    expect(weakLow.length).toBeGreaterThan(plainLow.length);
    // The 1.08 spot boost: the two grids sample different hash positions, so
    // compare the scale distribution maxima as a RATIO band around 1.08 (dense
    // sampling puts both maxima near the distribution ceiling). A dropped boost
    // lands the ratio near 1.0; a boost leaking into the plain profile too.
    const maxScale = (spots: { scale: number }[]) =>
      spots.reduce((max, spot) => Math.max(max, spot.scale), 0);
    const boostRatio = maxScale(weakLow) / maxScale(plainLow);
    expect(boostRatio).toBeGreaterThan(1.07);
    expect(boostRatio).toBeLessThan(1.09);

    // Medium parity for the plain profile: with every medium field applied the
    // dressing output is IDENTICAL, so any future field the generator starts
    // reading beyond lowPlus reds this equality.
    live.lowPlus = false;
    const gfxModule = await import('../src/render/gfx');
    const medium = (
      gfxModule as unknown as {
        gfxInternalsForTest: { settingsFor: (tier: string) => object };
      }
    ).gfxInternalsForTest.settingsFor('medium');
    const lowSnapshot = { ...live };
    Object.assign(live, medium);
    expect((GFX as { lowPlus: boolean }).lowPlus).toBe(false);
    const mediumSpots = generateDressing(20_061);
    Object.assign(live, lowSnapshot);
    expect(mediumSpots).toEqual(plainLow);
  });
});
