import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WaterView } from '../src/render/water';

// The horizon apron and the per-zone surface planes OVERLAP (the apron runs
// under every zone rect) and share one transparent material with depthWrite
// off, so the depth buffer cannot arbitrate between them: whichever paints
// LAST wins the blend outright.
//
// Left to three.js's transparent sort that order is chosen from the view-space
// depth of each object's bounding-sphere centre, and the apron's centre is a
// world-scale sheet near the origin. Measured on the Galecrest cliff with the
// player stationary, orbiting the camera alone flipped the sequence between
// `APRON > zone` (yaw 0.0-1.8) and `zone > APRON` (yaw 4.5), which swaps the
// sea between the apron's constant deep colour and the zone plane's shallow
// tint plus foam band. The paint order must be pinned, not camera-derived.

function mockWaterShaderAssets(): void {
  vi.doMock('../src/render/assets/loader', () => ({
    loadTexture: vi.fn(async () => new THREE.Texture()),
  }));
  vi.doMock('../src/render/assets/preload', () => ({
    registerPreload: vi.fn(),
    registerDeferredPreload: vi.fn((start: () => unknown) => start()),
  }));
  vi.doMock('../src/render/gfx', () => ({
    GFX: { standardMaterials: true },
    SUN_DIR: new THREE.Vector3(1, 1, 1).normalize(),
    sharedUniforms: { uTime: { value: 0 } },
  }));
  vi.doMock('../src/render/textures', () => ({
    waterNormalish: vi.fn(() => new THREE.Texture()),
    waterNormalMaps: vi.fn(() => [new THREE.Texture(), new THREE.Texture()]),
  }));
}

const SEED = 20061;

describe('water paint order is pinned, not camera-derived', () => {
  let water: WaterView;
  let apron: THREE.Mesh;
  let zonePlaneA: THREE.Mesh;
  let zoneAtFn: (x: number, z: number) => import('../src/sim/types').ZoneDef;

  beforeAll(async () => {
    vi.resetModules();
    mockWaterShaderAssets();
    const { buildWater } = await import('../src/render/water');
    const { zoneAt } = await import('../src/sim/data');
    zoneAtFn = zoneAt;
    await Promise.resolve();

    water = buildWater(SEED);
    [apron] = water.meshes;
    const built = water.ensureZone(zoneAtFn(0, 0));
    [zonePlaneA] = await built;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('draws the zone sheets before the horizon apron, which then fails depth under them', () => {
    // One transparent material that writes depth: the sheet paints first and
    // the apron (0.02 lower) is rejected wherever a sheet already covers it,
    // so the sea is shaded once per pixel and the real shoreline always wins.
    const material = zonePlaneA.material as THREE.Material;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(apron.material).toBe(material); // one shared material, one program
    expect(zonePlaneA.renderOrder).toBeLessThan(apron.renderOrder);
    expect(apron.position.y).toBeLessThan(zonePlaneA.position.y);
  });

  it('gives every zone surface plane the same order, so zones cannot reorder', async () => {
    const second = water.ensureZone(zoneAtFn(0, 600));
    const [planeB] = await second;

    expect(planeB).toBeInstanceOf(THREE.Mesh);
    expect(planeB.renderOrder).toBe(zonePlaneA.renderOrder);
  });
});
