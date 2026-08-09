import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type Accessor,
  type AnimationChannel,
  getBounds,
  NodeIO,
  Primitive,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  IGNIVAR_SOURCE_FILES,
  ignivarSourceFingerprint,
} from '../scripts/assets/ignivar_herald/source_fingerprint.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { tintedMaterial } from '../src/render/characters/assets';
import { manifestUrls, VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  attachIgnivarModelVfx,
  ensureIgnivarModelVfxSockets,
  IGNIVAR_CHEST_FIRE_NAME,
  IGNIVAR_SHOULDER_FIRE_LEFT_NAME,
  IGNIVAR_SHOULDER_FIRE_RIGHT_NAME,
} from '../src/render/ignivar_model_vfx';
import { IGNIVAR_BOSS_ID } from '../src/sim/types';

const REPO_ROOT = path.join(__dirname, '..');
const ASSET_PATH = path.join(REPO_ROOT, 'public/models/creatures/ignivar_herald.glb');
const EXPECTED_SOURCE_FINGERPRINT =
  '29405f7d7153d1013749a948159471b40453fbfb7f3c588421cce176dea38555';
const EXPECTED_ASSET_SHA256 = 'c449599855e79cbfd7de52b262200d48c6f69f315f2745793af7c755e07928b4';
const SHIPPED_CLIPS = [
  'Death_A',
  'Hit_A',
  'Running_A',
  'Walking_A',
  'Cheer',
  'ForgeIdle',
  'ForgeCast',
  'ForgeSlam',
];

function accessorChanges(accessor: Accessor | null): boolean {
  if (!accessor) throw new Error('animation channel has no output accessor');
  const size = accessor.getElementSize();
  const first = new Array<number>(size);
  accessor.getElement(0, first);
  for (let index = 1; index < accessor.getCount(); index++) {
    const value = new Array<number>(size);
    accessor.getElement(index, value);
    if (value.some((component, i) => Math.abs(component - first[i]) > 1e-5)) return true;
  }
  return false;
}

function channelChanges(channel: AnimationChannel): boolean {
  const sampler = channel.getSampler();
  if (!sampler) throw new Error('animation channel has no sampler');
  return accessorChanges(sampler.getOutput());
}

describe('Ignivar boss model', () => {
  it('routes the raid boss to its KayKit-native forge rig and restrained boss clips', () => {
    const key = visualKeyFor({
      kind: 'mob',
      templateId: IGNIVAR_BOSS_ID,
    } as never);

    expect(key).toBe('mob_ignivar');
    expect(VISUALS.mob_ignivar).toMatchObject({
      url: 'models/creatures/ignivar_herald.glb',
      height: 2.65,
      yaw: 0,
      selfIllumination: 0.2,
      envMapIntensity: 1.6,
      clips: {
        idle: 'ForgeIdle',
        walk: 'Walking_A',
        run: 'Running_A',
        attack: ['ForgeSlam'],
        cast: 'ForgeCast',
        hit: ['Hit_A'],
        death: 'Death_A',
        flourish: 'Cheer',
      },
    });
    expect(manifestUrls()).toContain('models/creatures/ignivar_herald.glb');
  });

  it('applies its readability controls to the runtime PBR material without mutating source', () => {
    const map = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0.8 });
    const material = tintedMaterial(source, null, 0, null, null, 'body', 0.32, 2.4);

    expect(material).not.toBe(source);
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((material as THREE.MeshStandardMaterial).emissiveMap).toBe(map);
    expect((material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0xffffff);
    expect((material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0.32);
    expect((material as THREE.MeshStandardMaterial).envMapIntensity).toBe(2.4);
    expect(source.emissiveMap).toBeNull();
    expect(source.emissiveIntensity).toBe(1);
    expect(source.envMapIntensity).toBe(1);
  });

  it('pins the owner-approved KayKit reconstruction and deterministic finalizer inputs', () => {
    expect(IGNIVAR_SOURCE_FILES).toEqual([
      'docs/design/ignivar-boss-model/reference-turnaround.png',
      'docs/design/ignivar-boss-model/ignivar-kaykit-input-v2.png',
      'docs/design/ignivar-boss-model/provenance.md',
      'docs/design/ignivar-boss-model/kaykit-model-spec.md',
      'scripts/assets/ignivar_herald/author_kaykit_boss_clips.mjs',
      'scripts/assets/ignivar_herald/finalize_kaykit.mjs',
      'scripts/assets/ignivar_herald/source_fingerprint.mjs',
      'scripts/asset_pipeline/lib/manual_rig.mjs',
      'pnpm-lock.yaml',
    ]);
    expect(ignivarSourceFingerprint(REPO_ROOT)).toBe(EXPECTED_SOURCE_FINGERPRINT);
  });

  it('ships the optimized KayKit-skinned boss with PBR textures and provenance intact', async () => {
    await MeshoptDecoder.ready;
    const bytes = readFileSync(ASSET_PATH);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(sha256).toBe(EXPECTED_ASSET_SHA256);
    expect(bytes).toHaveLength(850_420);
    expect(MEDIA_ASSETS['models/creatures/ignivar_herald.glb']).toBe(
      `/media/models/creatures/ignivar_herald.${sha256.slice(0, 12)}.glb`,
    );

    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.readBinary(bytes);
    const root = document.getRoot();
    expect(
      root
        .listExtensionsUsed()
        .map((extension) => extension.extensionName)
        .sort(),
    ).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu']);
    expect(root.getExtras()).toEqual({ sourceFingerprint: EXPECTED_SOURCE_FINGERPRINT });
    expect(root.getAsset().extras).toEqual({ sourceFingerprint: EXPECTED_SOURCE_FINGERPRINT });
    expect(root.listTextures()).toHaveLength(3);
    for (const texture of root.listTextures()) {
      expect(texture.getMimeType()).toBe('image/ktx2');
      expect(texture.getSize()).toEqual([1024, 1024]);
    }
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].getName()).toBe('Rig_Medium');
    expect(root.listSkins()[0].listJoints()).toHaveLength(23);
    expect(root.listCameras()).toHaveLength(0);
    expect(root.listScenes()).toHaveLength(1);

    const scene = root.listScenes()[0];
    const sceneRoot = scene.listChildren()[0];
    expect(sceneRoot.getName()).toBe('IgnivarHerald');
    expect(sceneRoot.listChildren().map((node) => node.getName())).toEqual(['Rig_Medium', 'body']);
    expect(sceneRoot.getExtras()).toMatchObject({
      assetId: 'ignivar_herald',
      assetType: 'kaykit-native-skinned-raid-boss',
      designRevision: 'approved-kaykit-v2',
      frontAxis: [0, 0, 1],
      rig: 'KayKit Rig_Medium',
      rigMethod: 'local distance-to-bone bind with rigid helmet',
      rigidHeadVertices: 1_747,
      clips: SHIPPED_CLIPS,
      sourceTask: 'faec579d-0f72-4dbb-a11a-8c7578bb1699',
    });

    const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
    expect(primitives).toHaveLength(1);
    const primitive = primitives[0];
    expect(primitive.getMode()).toBe(Primitive.Mode.TRIANGLES);
    expect(primitive.listSemantics().sort()).toEqual([
      'JOINTS_0',
      'NORMAL',
      'POSITION',
      'TEXCOORD_0',
      'WEIGHTS_0',
    ]);
    expect((primitive.getIndices()?.getCount() ?? 0) / 3).toBe(7_879);
    expect(root.listMaterials().map((material) => material.getName())).toEqual([
      'tripo_material_faec579d-0f72-4dbb-a11a-8c7578bb1699',
    ]);

    const bounds = getBounds(scene);
    expect(bounds.min[0]).toBeCloseTo(-0.94128, 4);
    expect(bounds.min[1]).toBeCloseTo(-1, 4);
    expect(bounds.min[2]).toBeCloseTo(-0.43645, 4);
    expect(bounds.max[0]).toBeCloseTo(0.94128, 4);
    expect(bounds.max[1]).toBeCloseTo(1, 4);
    expect(bounds.max[2]).toBeCloseTo(0.43645, 4);

    const nodes = new Map(root.listNodes().map((node) => [node.getName(), node] as const));
    for (const [socketName, translation] of [
      ['Socket_ChestCore', [0, 0.02, 0.18]],
      ['Socket_ShoulderLeft', [-0.3, 0.13, 0.02]],
      ['Socket_ShoulderRight', [0.3, 0.13, 0.02]],
    ] as const) {
      const socket = nodes.get(socketName);
      expect(socket?.getTranslation()).toEqual(translation);
      expect(socket?.getExtras()).toEqual({
        socketType: 'vfx-emitter',
        animatedParent: 'chest',
      });
      expect(socket?.getParentNode()?.getName()).toBe('chest');
    }
    expect([...nodes.keys()]).toEqual(
      expect.arrayContaining(['Rig_Medium', 'root', 'hips', 'chest', 'head', 'hand.l', 'hand.r']),
    );
    expect([...nodes.keys()].some((name) => name.startsWith('Knight_'))).toBe(false);
  });

  it('binds the rigid helmet and crown entirely to the head bone', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const root = (await io.readBinary(readFileSync(ASSET_PATH))).getRoot();
    const skin = root.listSkins()[0];
    const joints = skin.listJoints();
    const headJoint = joints.findIndex((joint) => joint.getName() === 'head');
    const primitive = root.listMeshes()[0].listPrimitives()[0];
    const positions = primitive.getAttribute('POSITION');
    const jointIndices = primitive.getAttribute('JOINTS_0');
    const weights = primitive.getAttribute('WEIGHTS_0');
    if (!positions || !jointIndices || !weights || headJoint < 0) {
      throw new Error('Ignivar rigid-head skin contract is incomplete');
    }

    const position = new Array<number>(3);
    const vertexJoints = new Array<number>(4);
    const vertexWeights = new Array<number>(4);
    let rigidHeadVertices = 0;
    let articulatedShoulderVertices = 0;
    let shoulderVerticesBoundToHead = 0;
    for (let vertex = 0; vertex < positions.getCount(); vertex++) {
      positions.getElement(vertex, position);
      jointIndices.getElement(vertex, vertexJoints);
      weights.getElement(vertex, vertexWeights);
      const inUpperOuterShell = position[1] >= 0.2 && Math.abs(position[0]) > 0.375;
      if (inUpperOuterShell) {
        articulatedShoulderVertices++;
        if (vertexJoints[0] === headJoint && vertexWeights[0] === 1) {
          shoulderVerticesBoundToHead++;
        }
      }
      const belongsToRigidHead = position[1] >= 0.2 && Math.abs(position[0]) <= 0.375;
      if (!belongsToRigidHead) continue;

      rigidHeadVertices++;
      expect(vertexJoints[0]).toBe(headJoint);
      expect(vertexWeights).toEqual([1, 0, 0, 0]);
    }
    expect(rigidHeadVertices).toBe(1_747);
    expect(articulatedShoulderVertices).toBe(687);
    expect(shoulderVerticesBoundToHead).toBe(0);
  });

  it('keeps hands and arms fixed throughout cast while the chest supplies a restrained pulse', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const root = (await io.readBinary(readFileSync(ASSET_PATH))).getRoot();
    expect(root.listAnimations().map((animation) => animation.getName())).toEqual(SHIPPED_CLIPS);

    const idle = root.listAnimations().find((animation) => animation.getName() === 'ForgeIdle');
    const cast = root.listAnimations().find((animation) => animation.getName() === 'ForgeCast');
    const slam = root.listAnimations().find((animation) => animation.getName() === 'ForgeSlam');
    expect(idle).toBeDefined();
    expect(cast).toBeDefined();
    expect(slam).toBeDefined();
    expect(idle?.listChannels().some(channelChanges)).toBe(false);

    const castChanges = cast?.listChannels().filter(channelChanges);
    expect(
      castChanges?.map((channel) => [channel.getTargetNode()?.getName(), channel.getTargetPath()]),
    ).toEqual([['chest', 'rotation']]);
    const fixedArms = new Set([
      'upperarm.l',
      'lowerarm.l',
      'wrist.l',
      'hand.l',
      'handslot.l',
      'upperarm.r',
      'lowerarm.r',
      'wrist.r',
      'hand.r',
      'handslot.r',
    ]);
    for (const channel of cast?.listChannels() ?? []) {
      if (fixedArms.has(channel.getTargetNode()?.getName() ?? '')) {
        expect(channelChanges(channel)).toBe(false);
      }
    }

    const slamChanges = slam?.listChannels().filter(channelChanges);
    expect(slamChanges?.map((channel) => channel.getTargetNode()?.getName())).toEqual(
      expect.arrayContaining(['upperarm.r', 'lowerarm.r']),
    );
    expect(
      slamChanges?.some((channel) =>
        ['upperarm.l', 'lowerarm.l'].includes(channel.getTargetNode()?.getName() ?? ''),
      ),
    ).toBe(false);
  });

  it('authors idempotent runtime VFX sockets and attaches forge fire to all three emitters', () => {
    const model = new THREE.Group();
    const chest = new THREE.Bone();
    chest.name = 'chest';
    model.add(chest);

    expect(ensureIgnivarModelVfxSockets(model)).toBe(true);
    expect(ensureIgnivarModelVfxSockets(model)).toBe(false);
    expect(model.getObjectByName('Socket_ChestCore')?.position.toArray()).toEqual([0, 0.02, 0.18]);
    expect(model.getObjectByName('Socket_ShoulderLeft')?.position.toArray()).toEqual([
      -0.3, 0.13, 0.02,
    ]);
    expect(model.getObjectByName('Socket_ShoulderRight')?.position.toArray()).toEqual([
      0.3, 0.13, 0.02,
    ]);

    expect(attachIgnivarModelVfx(model)).toBe(true);
    expect(attachIgnivarModelVfx(model)).toBe(false);
    expect(model.getObjectByName(IGNIVAR_CHEST_FIRE_NAME)).toBeDefined();
    expect(model.getObjectByName(IGNIVAR_SHOULDER_FIRE_LEFT_NAME)).toBeDefined();
    expect(model.getObjectByName(IGNIVAR_SHOULDER_FIRE_RIGHT_NAME)).toBeDefined();
  });
});
