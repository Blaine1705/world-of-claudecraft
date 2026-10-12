// The Drowned Gate Tower's shipping GLBs (scripts/assets/sunken_bastion_entrance/build.mjs,
// authored by docs/design/dungeon-rework/entrance/build_bastion_entrance.py):
// exact bytes, the live authoring fingerprint, the media manifest rows, the
// Blender nodes and materials the runtime keys on, and the landmark budget
// (texture free, vertex colour only, meshopt; under 50,000 triangles and one
// megabyte across the three files, split so the growth and the ruins cull and
// shed apart from the gatehouse).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  SUNKEN_BASTION_ENTRANCE_ASSETS,
  sourceFingerprint,
} from '../scripts/assets/sunken_bastion_entrance/build.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { sunkenBastionEntrancePreloadInternalsForTest } from '../src/render/sunken_bastion_entrance';

const ROOT = path.join(__dirname, '..');

const PINS: Record<string, { sha: string; bytes: number; triangles: number; maxBytes: number }> = {
  'public/models/props/sunken_bastion_entrance.glb': {
    sha: '0405526f7ada5a7af2dc81c2dd30567fbbc6e8701f9c611f638b7c56c8350b7f',
    bytes: 460652,
    triangles: 27022,
    maxBytes: 560 * 1024,
  },
  'public/models/props/sunken_bastion_entrance_ruins.glb': {
    sha: 'e2c1366ca648feae4a87d17f28330bba91ea10eb3aa2b5abcb4fc86cef01f7e5',
    bytes: 139676,
    triangles: 6410,
    maxBytes: 190 * 1024,
  },
  'public/models/props/sunken_bastion_entrance_growth.glb': {
    sha: '2014006d5e9187f557f1b51f1bb7dbfb043548a02326fd72305748b911f843f2',
    bytes: 149272,
    triangles: 8882,
    maxBytes: 200 * 1024,
  },
};

describe('the Drowned Gate Tower shipping assets', () => {
  it('the runtime preloads exactly the three shipped GLBs', () => {
    expect(sunkenBastionEntrancePreloadInternalsForTest.urls).toEqual(
      SUNKEN_BASTION_ENTRANCE_ASSETS.map((a) => `/${a.target.replace(/^public\//, '')}`),
    );
    expect(Object.keys(PINS).sort()).toEqual(
      SUNKEN_BASTION_ENTRANCE_ASSETS.map((a) => a.target).sort(),
    );
  });

  for (const asset of SUNKEN_BASTION_ENTRANCE_ASSETS) {
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
      // the leaf cards and the cloth are the only double-sided surface
      for (const material of root.listMaterials()) {
        expect(material.getDoubleSided(), material.getName()).toBe(
          material.getName() === 'KitLeaf',
        );
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
    expect(pins.reduce((sum, p) => sum + p.triangles, 0)).toBeLessThanOrEqual(50_000);
    expect(pins.reduce((sum, p) => sum + p.bytes, 0)).toBeLessThanOrEqual(1024 * 1024);
  });

  it("the model reaches from the knoll's foot to the west tower's crown and no further than its footprint", async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const asset of SUNKEN_BASTION_ENTRANCE_ASSETS) {
      const doc = await io.readBinary(readFileSync(path.join(ROOT, asset.target)));
      // scene bounds: the meshopt quantization scale lives on the nodes
      const bounds = getBounds(doc.getRoot().listScenes()[0]);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], bounds.min[k]);
        max[k] = Math.max(max[k], bounds.max[k]);
      }
    }
    // door-local: x west, y up, z north. The west tower's crown stands seven
    // character heights over the door; the knoll falls away steeply, so the
    // lowest rubble on its west slope lies well under the door's own height.
    expect(max[1]).toBeGreaterThan(12.5);
    expect(max[1]).toBeLessThan(15.5);
    expect(min[1]).toBeLessThan(-6);
    expect(min[1]).toBeGreaterThan(-11);
    expect(min[0]).toBeGreaterThan(-24);
    expect(max[0]).toBeLessThan(14);
    expect(min[2]).toBeGreaterThan(-14);
    expect(max[2]).toBeLessThan(11);
  });
});
