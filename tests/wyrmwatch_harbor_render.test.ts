import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder } from 'meshoptimizer';
import type * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { activateGfxProfile, GFX, type GfxTier, getActiveGfxProfile } from '../src/render/gfx';
import {
  buildWyrmwatchHarbor,
  wyrmwatchHarborInternalsForTest,
  wyrmwatchHarborPrewarmParts,
} from '../src/render/wyrmwatch_harbor';
import { wyrmwatchPathStones } from '../src/render/wyrmwatch_harbor_core';
import {
  WYRMWATCH_HARBOR_ORIGIN,
  WYRMWATCH_HARBOR_PATH,
  WYRMWATCH_HARBOR_PATH_HALF_WIDTH,
} from '../src/sim/content/wyrmwatch_harbor';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The Wyrmwatch cliff harbor painter (src/render/wyrmwatch_harbor.ts) over the shipped GLB:
// the model placed on the waterline at the harbor origin, what each graphics tier really
// draws (the walkable structure, solids and every lantern on all of them), the path laid
// from the three flagstones on every tier, and the prewarm parts the props warm-up links.

const internals = wyrmwatchHarborInternalsForTest;
const GLB = path.join(__dirname, '..', 'public', internals.assetUrl.replace(/^\//, ''));
/** Triangles per part (tests/wyrmwatch_harbor_asset.test.ts pins the same). */
const LOW = 2688 + 1272 + 804 + 1844 + 968 + 1832 + 1172 + 900;
const MEDIUM = LOW + 2724;
const HIGH = MEDIUM + 1740;
const STONE_TRIS = [44, 38, 50];

let gltf: GLTF;
const originalProfile = getActiveGfxProfile();

function withTier(tier: GfxTier): void {
  activateGfxProfile({ ...originalProfile, settings: { ...GFX, effectsTier: tier } });
  internals.setLoadedGltfForTest(gltf);
}

function triangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return n;
}

function glowing(root: THREE.Object3D): number {
  const glows = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && (m.emissive?.getHex() ?? 0) !== 0) glows.add(m);
  });
  return glows.size;
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const bytes = readFileSync(GLB);
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  gltf = await new Promise<GLTF>((resolve, reject) => loader.parse(ab, '', resolve, reject));
});

afterEach(() => {
  activateGfxProfile(originalProfile);
});

afterAll(() => {
  internals.setLoadedGltfForTest(null);
});

describe('wyrmwatch harbor painter', () => {
  it('places the model on the waterline at the harbor origin', () => {
    withTier('high');
    const harbor = buildWyrmwatchHarbor(WORLD_SEED);
    const model = harbor.getObjectByName('wyrmwatchHarborModel');
    if (!model) throw new Error('no model');
    expect(model.position.x).toBe(WYRMWATCH_HARBOR_ORIGIN.x);
    expect(model.position.y).toBe(WATER_LEVEL);
    expect(model.position.z).toBe(WYRMWATCH_HARBOR_ORIGIN.z);
    expect(model.userData.assetUrl).toBe(internals.assetUrl);
  });

  it('draws the structure, solids and lanterns on low, adds the trim on medium, the dressing from high', () => {
    for (const [tier, want] of [
      ['low', LOW],
      ['medium', MEDIUM],
      ['high', HIGH],
      ['ultra', HIGH],
      ['insane', HIGH],
    ] as const) {
      withTier(tier);
      const harbor = buildWyrmwatchHarbor(WORLD_SEED);
      const model = harbor.getObjectByName('wyrmwatchHarborModel');
      if (!model) throw new Error('no model');
      expect(triangles(model), tier).toBe(want);
      // the lanterns are landmarks: they glow on every tier
      expect(glowing(model), tier).toBe(1);
    }
  });

  it('lays the same path of flagstones on every tier', () => {
    const stones = wyrmwatchPathStones(
      WYRMWATCH_HARBOR_PATH,
      WYRMWATCH_HARBOR_PATH_HALF_WIDTH,
      (x, z) => terrainHeight(x, z, WORLD_SEED),
    );
    const want = stones.reduce((n, s) => n + STONE_TRIS[s.variant], 0);
    for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
      withTier(tier);
      const path = buildWyrmwatchHarbor(WORLD_SEED).getObjectByName('wyrmwatchHarborPath');
      if (!path) throw new Error('no path');
      expect(triangles(path), tier).toBe(want);
      // one merged mesh, its bounds hugging the path (a world-band static batch)
      expect(path.children).toHaveLength(1);
      const mesh = path.children[0] as THREE.Mesh;
      expect(mesh.geometry.boundingSphere?.radius ?? Infinity).toBeLessThan(32);
    }
  });

  it('hands the props prewarm every program it draws', () => {
    withTier('high');
    const harbor = buildWyrmwatchHarbor(WORLD_SEED);
    const drawn = new Set<THREE.Material>();
    harbor.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) drawn.add(mesh.material as THREE.Material);
    });
    const warmed = new Set(wyrmwatchHarborPrewarmParts().map((p) => p.material));
    for (const m of drawn) expect(warmed.has(m)).toBe(true);
  });
});
