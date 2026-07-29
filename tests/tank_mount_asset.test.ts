import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  TANK_SOURCE_FILES,
  tankSourceFingerprint,
} from '../scripts/assets/tank_mount/source_fingerprint.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';

const REPO_ROOT = path.join(__dirname, '..');
const ASSET_PATH = path.join(REPO_ROOT, 'public/models/mounts/tank.glb');
const SHIPPING_BUDGET = 320 * 1024;
const EXPECTED_SOURCE_FINGERPRINT =
  '28b0fdf7bc2e6a2723474e6d06e92ee134abad79a226f8697a5057fc7c218248';
const EXPECTED_ASSET_SHA256 = '0c4633fd9484f4791a016add19b5ef9bc58ebf63c5d04c8531d35fbc1cbcdb79';

describe('tank mount asset pipeline', () => {
  it('pins the deterministic source inventory and optimizer specification', () => {
    expect(TANK_SOURCE_FILES).toEqual([
      'docs/design/tank-mount/reference-metadata.json',
      'docs/design/tank-mount/object-sculpt-spec.json',
      'scripts/assets/tank_mount/model.js',
      'scripts/assets/tank_mount/export_entry.js',
      'scripts/assets/tank_mount/export_tank_mount.mjs',
      'scripts/assets/tank_mount/source_fingerprint.mjs',
      'scripts/assets/specs/tank_mount.json',
      'scripts/assets/build_assets.mjs',
      'package-lock.json',
    ]);
    expect(tankSourceFingerprint(REPO_ROOT)).toBe(EXPECTED_SOURCE_FINGERPRINT);
    expect(
      JSON.parse(
        readFileSync(path.join(REPO_ROOT, 'scripts/assets/specs/tank_mount.json'), 'utf8'),
      ),
    ).toEqual({
      items: [
        {
          src: 'tmp/asset_src/tank_mount/tank-final.glb',
          out: 'models/mounts/tank.glb',
          type: 'character',
          keepExtras: true,
          keepClips: ['Idle', 'Walk', 'Run', 'Death'],
        },
      ],
    });
  });

  it('ships an optimized animated tank within the mount budget', async () => {
    await MeshoptDecoder.ready;
    const bytes = readFileSync(ASSET_PATH);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(sha256).toBe(EXPECTED_ASSET_SHA256);
    const mutated = Buffer.from(bytes);
    mutated[Math.floor(mutated.length / 2)] ^= 1;
    expect(createHash('sha256').update(mutated).digest('hex')).not.toBe(EXPECTED_ASSET_SHA256);
    expect(bytes.length).toBeGreaterThan(250 * 1024);
    expect(bytes.length).toBeLessThanOrEqual(SHIPPING_BUDGET);
    expect(MEDIA_ASSETS['models/mounts/tank.glb']).toBe(
      `/media/models/mounts/tank.${sha256.slice(0, 12)}.glb`,
    );

    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.readBinary(bytes);
    const root = document.getRoot();
    const sourceFingerprint = tankSourceFingerprint(REPO_ROOT);

    expect(
      root
        .listExtensionsRequired()
        .map((extension) => extension.extensionName)
        .sort(),
    ).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization']);
    expect(root.getExtras()).toEqual({ sourceFingerprint });
    expect(root.getAsset().extras).toEqual({ sourceFingerprint });
    expect(root.listTextures()).toHaveLength(0);
    expect(root.listSkins()).toHaveLength(0);
    expect(root.listCameras()).toHaveLength(0);
    expect(root.listScenes()).toHaveLength(1);
    expect(
      root
        .listScenes()[0]
        .listChildren()
        .map((node) => node.getName()),
    ).toEqual(['Tank']);

    const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
    expect(primitives).toHaveLength(19);
    let triangles = 0;
    for (const primitive of primitives) {
      expect(primitive.getMode()).toBe(Primitive.Mode.TRIANGLES);
      expect(primitive.listSemantics().sort()).toEqual(['COLOR_0', 'NORMAL', 'POSITION']);
      const positions = primitive.getAttribute('POSITION');
      expect(positions).not.toBeNull();
      triangles += (primitive.getIndices()?.getCount() ?? positions?.getCount() ?? 0) / 3;
    }
    expect(triangles).toBe(12_448);

    const materials = new Map(
      root.listMaterials().map((material) => [material.getName(), material] as const),
    );
    expect([...materials.keys()].sort()).toEqual([
      'TankBronze',
      'TankCreamPaint',
      'TankDarkIron',
      'TankLeather',
      'TankTextile',
      'TankVioletPaint',
    ]);
    expect(materials.get('TankCreamPaint')?.getRoughnessFactor()).toBeCloseTo(0.62);
    expect(materials.get('TankVioletPaint')?.getMetallicFactor()).toBeCloseTo(0.38);
    expect(materials.get('TankDarkIron')?.getMetallicFactor()).toBeCloseTo(0.68);
    expect(materials.get('TankBronze')?.getMetallicFactor()).toBeCloseTo(0.72);
    expect(materials.get('TankLeather')?.getMetallicFactor()).toBe(0);
    expect(materials.get('TankTextile')?.getRoughnessFactor()).toBeCloseTo(0.86);
    const expectedPalette = {
      TankVioletPaint: [0.254152, 0.111932, 0.386429],
      TankCreamPaint: [0.871367, 0.730461, 0.445201],
      TankDarkIron: [0.059511, 0.043735, 0.07036],
      TankBronze: [0.637597, 0.323143, 0.076185],
      TankLeather: [0.254152, 0.093059, 0.039546],
      TankTextile: [0.090842, 0.181164, 0.102242],
    };
    for (const [name, expected] of Object.entries(expectedPalette)) {
      const actual = materials.get(name)?.getBaseColorFactor().slice(0, 3);
      expect(actual, `${name} base color`).toBeDefined();
      expected.forEach((component, index) => {
        expect(actual?.[index], `${name} channel ${index}`).toBeCloseTo(component, 5);
      });
    }

    const bounds = getBounds(root.listScenes()[0]);
    expect(bounds.min[0]).toBeCloseTo(-1.445, 3);
    expect(bounds.min[1]).toBeCloseTo(0, 3);
    expect(bounds.min[2]).toBeCloseTo(-1.355, 3);
    expect(bounds.max[0]).toBeCloseTo(1.445, 3);
    expect(bounds.max[1]).toBeCloseTo(2.446, 3);
    expect(bounds.max[2]).toBeCloseTo(2.223, 3);
  });

  it('retains the rider, exhaust, wheel, and animation contracts', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.readBinary(readFileSync(ASSET_PATH));
    const root = document.getRoot();
    const nodes = new Map(root.listNodes().map((node) => [node.getName(), node] as const));

    expect(nodes.get('Socket_Rider')?.getTranslation()).toEqual([0, 2.08, -0.26]);
    expect(nodes.get('Socket_Rider')?.getExtras()).toEqual({
      socketType: 'rider-seat',
      purpose: 'mounted player seat',
    });
    expect(nodes.get('Socket_Exhaust')?.getTranslation()).toEqual([0.82, 1.55, -1.18]);
    expect(nodes.get('Socket_Exhaust')?.getExtras()).toEqual({
      socketType: 'vfx-emitter',
      purpose: 'future exhaust effect anchor',
    });
    expect(nodes.has('HullPivot')).toBe(true);
    for (const side of ['L', 'R']) {
      for (let index = 0; index < 5; index++) {
        expect(nodes.has(`Wheel_${side}_${index}`)).toBe(true);
      }
    }

    const animationContracts = root.listAnimations().map((animation) => {
      const channels = animation.listChannels();
      const duration = Math.max(
        ...animation.listSamplers().flatMap((sampler) => {
          const input = sampler.getInput()?.getArray();
          return input ? Array.from(input) : [0];
        }),
      );
      return {
        name: animation.getName(),
        channels: channels.length,
        duration,
        targets: new Set(
          channels
            .map((channel) => channel.getTargetNode()?.getName())
            .filter((name): name is string => Boolean(name)),
        ),
        channelContracts: channels.map((channel) => {
          const output = channel.getSampler()?.getOutput()?.getArray();
          return {
            target: channel.getTargetNode()?.getName() ?? '',
            path: channel.getTargetPath(),
            values: output ? Array.from(output) : [],
          };
        }),
      };
    });

    expect(animationContracts.map(({ name, channels }) => ({ name, channels }))).toEqual([
      { name: 'Idle', channels: 1 },
      { name: 'Walk', channels: 11 },
      { name: 'Run', channels: 11 },
      { name: 'Death', channels: 12 },
    ]);
    expect(animationContracts.map(({ duration }) => duration)).toEqual([
      expect.closeTo(2.4, 4),
      expect.closeTo(0.8, 4),
      expect.closeTo(0.55, 4),
      expect.closeTo(1.2, 4),
    ]);
    expect(animationContracts[1].targets).toEqual(
      new Set(['HullPivot', ...Array.from({ length: 10 }, (_, index) => nodesForWheel(index))]),
    );
    expect(animationContracts[2].targets).toEqual(animationContracts[1].targets);
    for (const animation of animationContracts) {
      expect([...animation.targets].some((target) => target.startsWith('Socket_'))).toBe(false);
      for (const channel of animation.channelContracts) {
        expect(
          new Set(channel.values).size,
          `${animation.name}:${channel.target} moves`,
        ).toBeGreaterThan(1);
        if (channel.target.startsWith('Wheel_')) {
          expect(channel.path).toBe('rotation');
          for (let index = 0; index < channel.values.length; index += 4) {
            expect(channel.values[index + 1], `${channel.target} quaternion Y`).toBe(0);
            expect(channel.values[index + 2], `${channel.target} quaternion Z`).toBe(0);
          }
        } else {
          expect(channel.target).toBe('HullPivot');
          expect(['rotation', 'translation']).toContain(channel.path);
        }
      }
    }
  });
});

function nodesForWheel(index: number): string {
  const side = index < 5 ? 'L' : 'R';
  return `Wheel_${side}_${index % 5}`;
}
