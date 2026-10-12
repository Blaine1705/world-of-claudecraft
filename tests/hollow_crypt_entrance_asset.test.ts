// The Fallen Chapel's shipping GLBs (scripts/assets/hollow_crypt_entrance/build.mjs,
// authored by docs/design/dungeon-rework/entrance/build_crypt_entrance.py):
// exact bytes, the live authoring fingerprint, the media manifest rows, the
// Blender nodes and materials the runtime keys on, and the landmark budget
// (texture free, vertex colour only, meshopt; under 51,000 triangles and one
// megabyte across the four files, split so the growth and the churchyard cull
// and shed apart from the walls).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  HOLLOW_CRYPT_ENTRANCE_ASSETS,
  sourceFingerprint,
} from '../scripts/assets/hollow_crypt_entrance/build.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { hollowCryptEntrancePreloadInternalsForTest } from '../src/render/hollow_crypt_entrance';

const ROOT = path.join(__dirname, '..');

const PINS: Record<string, { sha: string; bytes: number; triangles: number; maxBytes: number }> = {
  'public/models/props/hollow_crypt_entrance.glb': {
    sha: 'd8e3020a7ce8b560332a6b0bbea93c7af2ec05cdec52a2080d4d0805f4f3302c',
    bytes: 454760,
    triangles: 23740,
    maxBytes: 480 * 1024,
  },
  'public/models/props/hollow_crypt_entrance_walls.glb': {
    sha: '109f796262c9e4abba8b25536487d1b7259fe2f1b7a2fd844c715e4f1eae7f41',
    bytes: 219116,
    triangles: 10065,
    maxBytes: 240 * 1024,
  },
  'public/models/props/hollow_crypt_entrance_props.glb': {
    sha: 'ba13bda6b6231e9d1d212774e6f3c6bd2f299a63c9056ea38253c046b4b43d33',
    bytes: 102172,
    triangles: 6008,
    maxBytes: 130 * 1024,
  },
  'public/models/props/hollow_crypt_entrance_growth.glb': {
    sha: '7274c776bc6b8775e6572cece89ed4e7c04fd69c6926971e462922c9fd08635d',
    bytes: 132320,
    triangles: 10197,
    maxBytes: 160 * 1024,
  },
};

describe('the Fallen Chapel shipping assets', () => {
  it('the runtime preloads exactly the four shipped GLBs', () => {
    expect(hollowCryptEntrancePreloadInternalsForTest.urls).toEqual(
      HOLLOW_CRYPT_ENTRANCE_ASSETS.map((a) => `/${a.target.replace(/^public\//, '')}`),
    );
    expect(Object.keys(PINS).sort()).toEqual(
      HOLLOW_CRYPT_ENTRANCE_ASSETS.map((a) => a.target).sort(),
    );
  });

  for (const asset of HOLLOW_CRYPT_ENTRANCE_ASSETS) {
    it(`${asset.target}: exact bytes, live fingerprint, manifest row, nodes, materials, budget`, async () => {
      const pin = PINS[asset.target];
      const bytes = readFileSync(path.join(ROOT, asset.target));
      expect(bytes.length).toBe(pin.bytes);
      expect(bytes.length).toBeLessThanOrEqual(pin.maxBytes);
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(sha).toBe(pin.sha);
      const url = asset.target.replace(/^public\//, '');
      const stem = url.replace(/\.glb$/, '');
      expect(MEDIA_ASSETS[url]).toBe(`/media/${stem}.${sha.slice(0, 12)}.glb`);
      await MeshoptDecoder.ready;
      const doc = await new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
        .readBinary(bytes);
      const root = doc.getRoot();
      expect(root.getExtras().sourceFingerprint).toBe(sourceFingerprint(ROOT));
      expect(root.listTextures()).toHaveLength(0);
      expect(root.listAnimations()).toHaveLength(0);
      expect(root.listSkins()).toHaveLength(0);
      expect(
        doc
          .getRoot()
          .listExtensionsUsed()
          .map((e) => e.extensionName),
      ).toContain('EXT_meshopt_compression');
      expect(
        root
          .listMaterials()
          .map((m) => m.getName())
          .sort(),
      ).toEqual(asset.materials);
      // the leaf cards are the only double-sided lit surface
      for (const material of root.listMaterials()) {
        if (material.getName() === 'KitStone') expect(material.getDoubleSided()).toBe(false);
        if (material.getName() === 'KitLeaf') expect(material.getDoubleSided()).toBe(true);
      }
      expect(
        root
          .listNodes()
          .map((n) => n.getName())
          .sort(),
      ).toEqual([asset.root, ...asset.pieces].sort());
      let triangles = 0;
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          expect(prim.listSemantics()).toContain('COLOR_0');
          triangles +=
            (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
        }
      }
      expect(triangles).toBe(pin.triangles);
    });
  }

  it('the whole landmark stays inside its budget', () => {
    const pins = Object.values(PINS);
    expect(pins.reduce((sum, p) => sum + p.triangles, 0)).toBeLessThanOrEqual(51_000);
    expect(pins.reduce((sum, p) => sum + p.bytes, 0)).toBeLessThanOrEqual(1024 * 1024);
  });

  it('the model reaches from the ground to the bellcote and no further than its footprint', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const asset of HOLLOW_CRYPT_ENTRANCE_ASSETS) {
      const doc = await io.readBinary(readFileSync(path.join(ROOT, asset.target)));
      // scene bounds: the meshopt quantization scale lives on the nodes
      const bounds = getBounds(doc.getRoot().listScenes()[0]);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], bounds.min[k]);
        max[k] = Math.max(max[k], bounds.max[k]);
      }
    }
    // door-local: x west, y up, z north. The gable stands 22 yd south of the
    // door and towers over a 1.8 yd character; the footings go below ground.
    expect(max[1]).toBeGreaterThan(20);
    expect(max[1]).toBeLessThan(24);
    expect(min[1]).toBeLessThan(-0.3);
    // (the fallen bell lies a third sunk on its side: its rim is the deepest point)
    expect(min[1]).toBeGreaterThan(-2.2);
    expect(Math.max(Math.abs(min[0]), Math.abs(max[0]))).toBeLessThan(20);
    expect(min[2]).toBeGreaterThan(-50);
    expect(max[2]).toBeLessThan(14);
  });
});
