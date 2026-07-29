import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadTexture: vi.fn(),
  registerPreload: vi.fn(),
}));

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: mocks.loadTexture,
}));

vi.mock('../src/render/assets/preload', () => ({
  registerPreload: mocks.registerPreload,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('Eastbrook surface atlas preload', () => {
  it.each([
    ['Low', '?gfx=low'],
    ['Standard', '?gfx=ultra'],
  ] as const)('loads one shared linear detail texture resource on %s', async (_path, search) => {
    vi.stubGlobal('window', { location: { search } });
    vi.stubGlobal('location', { search });
    const atlas = new THREE.Texture();
    mocks.loadTexture.mockResolvedValue(atlas);

    const module = await import('../src/render/eastbrook_surface_atlas');
    const eastbrookUrls = [
      module.EASTBROOK_SURFACE_ATLAS_URL,
      module.EASTBROOK_SURFACE_NORMAL_URL,
      module.EASTBROOK_SURFACE_ROUGH_URL,
    ];
    const eastbrookLoads = mocks.loadTexture.mock.calls
      .map(([url], index) => ({
        url,
        order: mocks.loadTexture.mock.invocationCallOrder[index],
      }))
      .filter(({ url }) => eastbrookUrls.includes(url));
    expect(eastbrookLoads.map(({ url }) => url)).toEqual(eastbrookUrls);
    const registrationOrders = new Set(mocks.registerPreload.mock.invocationCallOrder);
    for (const { order } of eastbrookLoads) expect(registrationOrders).toContain(order + 1);
    const registered = mocks.registerPreload.mock.calls.map(([promise]) => promise);
    await Promise.all(registered);
    expect(module.eastbrookSurfaceAtlasTexture()).toBe(atlas);
    expect(atlas.colorSpace).toBe(THREE.NoColorSpace);
    expect(atlas.name).toBe('');
    expect(atlas.userData).toEqual({});
    expect(module.eastbrookSurfaceAtlasMetadata(new THREE.Group(), atlas)).toEqual({
      url: module.EASTBROOK_SURFACE_ATLAS_URL,
      textureUuid: atlas.uuid,
      materialBindings: 0,
    });
  });
});
