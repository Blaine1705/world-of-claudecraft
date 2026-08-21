import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { manifestUrls } from '../src/render/characters/manifest';

const REPO_ROOT = path.join(__dirname, '..');

const MODELS = [
  {
    name: 'Crucible Warden',
    file: 'crucible_warden.glb',
    maxBytes: 400_000,
    sha256: '3654b6db685a0db79d956378126b37643f2f36b61397251f3aa0a8e1bf33a7aa',
    productionUrl: '/media/models/creatures/crucible_warden.3654b6db685a.glb',
    clips: ['Attack', 'Death', 'Hit', 'Idle', 'Run', 'Walk'],
  },
  {
    name: 'Ember Sentinel',
    file: 'ember_sentinel.glb',
    maxBytes: 400_000,
    sha256: '7667f2f6965f1abb7efe729b3e96c11ad4a38f38ea7d905e6f5761d17a2ed471',
    productionUrl: '/media/models/creatures/ember_sentinel.7667f2f6965f.glb',
    clips: ['Death', 'Hit', 'Idle', 'Run', 'Walk'],
  },
] as const;

describe('Varkhul add models', () => {
  it.each(MODELS)('ships $name as a bounded, animated automa rig', async (model) => {
    await MeshoptDecoder.ready;
    const relativePath = `models/creatures/${model.file}`;
    const bytes = readFileSync(path.join(REPO_ROOT, 'public', relativePath));
    expect(bytes.byteLength).toBeLessThan(model.maxBytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);
    expect(MEDIA_ASSETS[relativePath]).toBe(model.productionUrl);
    expect(manifestUrls()).toContain(relativePath);

    const root = (
      await new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
        .readBinary(bytes)
    ).getRoot();
    expect(
      root
        .listExtensionsRequired()
        .map((extension) => extension.extensionName)
        .sort(),
    ).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu']);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(22);
    expect(root.listNodes().filter((node) => node.getMesh() && node.getSkin())).toHaveLength(1);
    expect(root.listTextures()).toHaveLength(1);
    expect(root.listTextures()[0].getMimeType()).toBe('image/ktx2');
    expect(root.listTextures()[0].getSize()).toEqual([512, 512]);
    expect(
      root
        .listAnimations()
        .map((animation) => animation.getName())
        .sort(),
    ).toEqual([...model.clips].sort());
    for (const animation of root.listAnimations()) {
      if (animation.getName() === 'Idle') continue;
      let maxPoseDelta = 0;
      for (const sampler of animation.listSamplers()) {
        const times = sampler.getInput()?.getArray() ?? [];
        const values = sampler.getOutput()?.getArray() ?? [];
        if (times.length < 2 || values.length === 0) continue;
        const stride = values.length / times.length;
        for (let offset = stride; offset < values.length; offset += stride) {
          for (let component = 0; component < stride; component++) {
            maxPoseDelta = Math.max(
              maxPoseDelta,
              Math.abs(Number(values[offset + component]) - Number(values[component])),
            );
          }
        }
      }
      expect(maxPoseDelta, `${animation.getName()} must contain pose motion`).toBeGreaterThan(0.01);
    }

    const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
    expect(primitives).toHaveLength(1);
    expect(primitives[0].getMode()).toBe(Primitive.Mode.TRIANGLES);
    expect(primitives[0].listSemantics().sort()).toEqual([
      'JOINTS_0',
      'NORMAL',
      'POSITION',
      'TEXCOORD_0',
      'WEIGHTS_0',
    ]);
    const vertexCount = primitives[0].getAttribute('POSITION')?.getCount() ?? 0;
    expect((primitives[0].getIndices()?.getCount() ?? vertexCount) / 3).toBeLessThanOrEqual(5_500);
  });
});
