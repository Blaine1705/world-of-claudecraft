import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MeshoptDecoder } from 'meshoptimizer';
import { AnimationMixer, Box3, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { sourceFingerprint } from '../scripts/assets/drowned_temple_creatures/seal_abyssal_lurker.mjs';

const path = 'public/models/creatures/temple_abyssal_lurker.glb';
const bytes = readFileSync(path);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const clips = ['Attack', 'Attack2', 'Cast', 'Death', 'Hit', 'Idle', 'Leap', 'Run', 'Spit', 'Walk'];

async function load() {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}

function skinnedBounds(scene) {
  scene.updateMatrixWorld(true);
  const box = new Box3();
  const point = new Vector3();
  scene.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    node.skeleton.update();
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      box.expandByPoint(point);
    }
  });
  return box;
}

describe('Blender amphibious lurker shipping contract', () => {
  it('retains bounded geometry, skinning, compression and complete clip vocabulary', () => {
    const primitives = json.meshes.flatMap((mesh) => mesh.primitives);
    expect(primitives).toHaveLength(2);
    expect(json.materials).toHaveLength(2);
    expect(primitives.reduce((sum, p) => sum + json.accessors[p.indices].count / 3, 0)).toBe(5584);
    expect(bytes.length).toBeLessThan(500 * 1024);
    expect(json.textures ?? []).toHaveLength(0);
    expect(json.skins).toHaveLength(1);
    expect(json.skins[0].joints).toHaveLength(15);
    expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
    expect(json.animations.map((clip) => clip.name).sort()).toEqual(clips);
    for (const primitive of primitives) {
      for (const attribute of ['COLOR_0', 'JOINTS_0', 'WEIGHTS_0'])
        expect(primitive.attributes[attribute]).toBeDefined();
    }
    for (const clip of json.animations) {
      for (const bone of json.skins[0].joints) {
        expect(
          clip.channels.some(
            (channel) => channel.target.node === bone && channel.target.path === 'rotation',
          ),
        ).toBe(true);
      }
    }
  });

  it('seals the live Blender source and pinned optimized bytes', () => {
    expect(json.asset.extras.sourceFingerprint).toBe(sourceFingerprint());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '533e4c6ece6f07b384396c5ee32a74750b636a951d5598a8131a2a91f6315ad9',
    );
  });

  it('exports the authored teal in linear space without a second sRGB conversion', async () => {
    const { scene } = await load();
    let teal = 0;
    scene.traverse((node) => {
      if (!node.isSkinnedMesh || node.material.name !== 'KitStone') return;
      const colors = node.geometry.attributes.color;
      for (let i = 0; i < colors.count; i++) {
        const r = colors.getX(i);
        const g = colors.getY(i);
        const b = colors.getZ(i);
        // Authored sRGB (.25,.46,.48), with restrained baked weather variation.
        // Double conversion collapses green to ~.027 and cannot satisfy this.
        if (r > 0.035 && r < 0.055 && g > 0.14 && g < 0.19 && b > 0.16 && b < 0.21) teal++;
      }
    });
    expect(teal).toBeGreaterThan(100);
  });

  it('keeps a low quadrupedal silhouette and an articulated floor-seated corpse', async () => {
    const { scene, animations } = await load();
    const idle = skinnedBounds(scene);
    expect(idle.min.y).toBeGreaterThan(-0.01);
    expect(idle.max.y).toBeLessThan(2.4);
    expect(idle.max.z - idle.min.z).toBeGreaterThan(6);
    const mixer = new AnimationMixer(scene);
    const death = animations.find((clip) => clip.name === 'Death');
    const action = mixer.clipAction(death).setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(death.duration);
    const corpse = skinnedBounds(scene);
    expect(corpse.min.y).toBeGreaterThan(-0.02);
    expect(corpse.min.y).toBeLessThan(0.08);
    const left = scene.getObjectByName('ArmL').getWorldPosition(new Vector3());
    const right = scene.getObjectByName('ArmR').getWorldPosition(new Vector3());
    // Rolled onto its side: the shoulder axis is predominantly vertical.
    expect(Math.abs(left.sub(right).normalize().y)).toBeGreaterThan(0.8);
    const first = animations.find((clip) => clip.name === 'Idle');
    for (const track of first.tracks) {
      const deathTrack = death.tracks.find((candidate) => candidate.name === track.name);
      expect(deathTrack).toBeDefined();
      for (let i = 0; i < track.getValueSize(); i++) {
        expect(deathTrack.values[i]).toBeCloseTo(track.values[i], 4);
      }
    }
  });
});
