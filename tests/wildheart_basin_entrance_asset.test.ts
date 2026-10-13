// The Jaguar Maw's shipping GLBs (scripts/assets/wildheart_basin_entrance/build.mjs,
// authored by docs/design/dungeon-rework/entrance/build_wildheart_entrance.py):
// exact bytes, the live authoring fingerprint, the media manifest rows, the
// Blender nodes and materials the runtime keys on, and the landmark budget
// (texture free, vertex colour only, meshopt; under 50,000 triangles and one
// megabyte across the three files, split so the growth and the court cull and
// shed apart from the idol).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  sourceFingerprint,
  WILDHEART_BASIN_ENTRANCE_ASSETS,
} from '../scripts/assets/wildheart_basin_entrance/build.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { wildheartBasinEntrancePreloadInternalsForTest } from '../src/render/wildheart_basin_entrance';

const ROOT = path.join(__dirname, '..');

const PINS: Record<string, { sha: string; bytes: number; triangles: number; maxBytes: number }> = {
  'public/models/props/wildheart_basin_entrance.glb': {
    sha: '2a0362cb790de8bd4e95e090b03fc4d15145c82132089f41900404cf12b2e91b',
    bytes: 380816,
    triangles: 22323,
    maxBytes: 420 * 1024,
  },
  'public/models/props/wildheart_basin_entrance_court.glb': {
    sha: '0fee4a25f99ab945892ee19f030fc7d4e4a8cb7877aadf0ac34c6df753e3e8b6',
    bytes: 91504,
    triangles: 4738,
    maxBytes: 120 * 1024,
  },
  'public/models/props/wildheart_basin_entrance_growth.glb': {
    sha: 'd7048a071880db3d077db957ab9bde53604214e60bb3b4cfdcc29f51d0977e8e',
    bytes: 455084,
    triangles: 22735,
    maxBytes: 480 * 1024,
  },
};

describe('the Jaguar Maw shipping assets', () => {
  it('the runtime preloads exactly the three shipped GLBs', () => {
    expect(wildheartBasinEntrancePreloadInternalsForTest.urls).toEqual(
      WILDHEART_BASIN_ENTRANCE_ASSETS.map((a) => `/${a.target.replace(/^public\//, '')}`),
    );
    expect(Object.keys(PINS).sort()).toEqual(
      WILDHEART_BASIN_ENTRANCE_ASSETS.map((a) => a.target).sort(),
    );
  });

  for (const asset of WILDHEART_BASIN_ENTRANCE_ASSETS) {
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

  it('every primitive of the three GLBs wears one attribute set, and nothing is instanced', async () => {
    // The camera ghost's depth veil (src/render/set_piece_occluders.ts) keys its
    // programs on face culling and the mesh variant the fade family reads
    // (tangent, colour, morphs, instancing), NOT on uv1 to uv3 presence, and it
    // gives an instanced mesh no veil at all. Both hold for this landmark as
    // long as its primitives all carry the same attributes and no node is
    // instanced; a rebuild that adds a second uv set or instancing must meet
    // this pin before it meets a cold link on the fade's edge frame.
    await MeshoptDecoder.ready;
    const sets = new Set<string>();
    let primitives = 0;
    for (const asset of WILDHEART_BASIN_ENTRANCE_ASSETS) {
      const doc = await new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
        .readBinary(readFileSync(path.join(ROOT, asset.target)));
      const root = doc.getRoot();
      expect(
        root.listExtensionsUsed().map((e) => e.extensionName),
        asset.target,
      ).not.toContain('EXT_mesh_gpu_instancing');
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          primitives++;
          sets.add(prim.listSemantics().slice().sort().join(','));
          expect(prim.listTargets(), `${asset.target} ${mesh.getName()}`).toHaveLength(0);
        }
      }
    }
    expect(primitives).toBeGreaterThanOrEqual(WILDHEART_BASIN_ENTRANCE_ASSETS.length);
    expect([...sets]).toEqual(['COLOR_0,NORMAL,POSITION']);
  });

  it('the whole landmark stays inside its budget', () => {
    const pins = Object.values(PINS);
    expect(pins.reduce((sum, p) => sum + p.triangles, 0)).toBeLessThanOrEqual(50_000);
    expect(pins.reduce((sum, p) => sum + p.bytes, 0)).toBeLessThanOrEqual(1024 * 1024);
  });

  it("the model reaches from under the bank to the fig's crown and no further than its footprint", async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const bounds: Record<string, { min: number[]; max: number[] }> = {};
    for (const asset of WILDHEART_BASIN_ENTRANCE_ASSETS) {
      const doc = await io.readBinary(readFileSync(path.join(ROOT, asset.target)));
      // scene bounds: the meshopt quantization scale lives on the nodes
      const b = getBounds(doc.getRoot().listScenes()[0]);
      bounds[asset.pieces[0]] = { min: [...b.min], max: [...b.max] };
    }
    // door-local: x west, y up, z north. The door stands on a rise: the
    // idol's foot is cut under the bank on its lagoon side, five yards under
    // the door, and its roots run on down into the shallows, six yards under;
    // the fig rooted in its crown carries its limbs (in the idol's file) and
    // its leaves (the growth) to fifteen character heights over the door.
    const idol = bounds.Entrance_Idol;
    expect(idol.max[1]).toBeGreaterThan(24);
    expect(idol.max[1]).toBeLessThan(30);
    expect(idol.min[1]).toBeLessThan(-5);
    expect(idol.min[1]).toBeGreaterThan(-7.5);
    const growth = bounds.Entrance_Growth;
    expect(growth.max[1]).toBeGreaterThan(27);
    expect(growth.max[1]).toBeLessThan(34);
    // the causeway's foot, fifteen yards before the door
    const court = bounds.Entrance_Court;
    expect(court.min[2]).toBeLessThan(-14);
    for (const b of Object.values(bounds)) {
      // east it stops well short of the ring of columns (its edge is eleven
      // yards east of the door); west and north it reaches the lagoon
      expect(b.min[0]).toBeGreaterThan(-13);
      expect(b.max[0]).toBeLessThan(21);
      expect(b.min[2]).toBeGreaterThan(-19);
      expect(b.max[2]).toBeLessThan(24);
    }
  });
});
