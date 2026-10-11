import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest.ts';
import { DROWNED_TEMPLE_MOBS } from '../src/sim/content/drowned_temple.ts';

const model = 'public/models/creatures/temple_tidemarked_sentinel.glb';
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('Blender Drowned Temple Warden shipping asset', () => {
  it('pins the authored source and optimized delivery', () => {
    expect(sha('scripts/assets/drowned_temple_creatures/tidemarked_sentinel.py')).toBe(
      '2d5b1af75bdb22f4476b8ff55fed83d8c2c52ef5e27a2bcfdee064f2fcf51265',
    );
    expect(sha(model)).toBe('51ed098fa1bd5eec7c4a7fd049698bd6f76bae299f04d5260e0d7b714685b3dc');
  });

  it('keeps the character skinned, compressed, textured by vertex colours and inside budget', async () => {
    const root = (await io.read(model)).getRoot();
    const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
    expect(primitives).toHaveLength(2);
    const triangles = primitives.reduce(
      (sum, primitive) => sum + primitive.getIndices().getCount() / 3,
      0,
    );
    expect(triangles).toBe(11242);
    expect(triangles).toBeLessThanOrEqual(12000);
    expect(statSync(model).size).toBeLessThan(500 * 1024);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(13);
    expect(root.listTextures()).toHaveLength(0);
    expect(root.listExtensionsRequired().map((extension) => extension.extensionName)).toContain(
      'EXT_meshopt_compression',
    );
    for (const primitive of primitives) {
      for (const semantic of ['POSITION', 'NORMAL', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0']) {
        expect(primitive.getAttribute(semantic), semantic).toBeTruthy();
      }
    }
    const glow = root.listMaterials().find((material) => material.getName() === 'KitGlow');
    const [r, g, b] = glow.getEmissiveFactor();
    expect(g).toBeGreaterThan(r * 5);
    expect(b).toBeGreaterThan(r * 5);
  });

  it('ships complete actions and clamps Death flat with arms beside the torso', async () => {
    const root = (await io.read(model)).getRoot();
    expect(
      root
        .listAnimations()
        .map((clip) => clip.getName())
        .sort(),
    ).toEqual(['Attack', 'Attack2', 'Cast', 'Death', 'Hit', 'Idle', 'Run', 'Walk']);
    const death = root.listAnimations().find((clip) => clip.getName() === 'Death');
    const coverage = new Map();
    for (const channel of death.listChannels()) {
      const node = channel.getTargetNode();
      const path = channel.getTargetPath();
      const output = channel.getSampler().getOutput();
      const value = output.getElement(output.getCount() - 1, []);
      if (path === 'rotation') node.setRotation(value);
      else if (path === 'translation') node.setTranslation(value);
      else if (path === 'scale') node.setScale(value);
      const paths = coverage.get(node) ?? new Set();
      paths.add(path);
      coverage.set(node, paths);
    }
    for (const joint of root.listSkins()[0].listJoints()) {
      expect([...coverage.get(joint)].sort(), joint.getName()).toEqual([
        'rotation',
        'scale',
        'translation',
      ]);
    }
    const nodes = new Map(root.listNodes().map((node) => [node.getName(), node]));
    const at = (name) =>
      new Vector3().setFromMatrixPosition(
        new Matrix4().fromArray(nodes.get(name).getWorldMatrix()),
      );
    const torso = at('Head').sub(at('Pelvis')).normalize();
    expect(Math.abs(torso.y)).toBeLessThan(0.1);
    expect(at('Head').y).toBeGreaterThan(0.1);
    expect(at('Head').y).toBeLessThan(0.7);
    for (const side of ['L', 'R']) {
      const arm = at(`Fore.${side}`)
        .sub(at(`Arm.${side}`))
        .normalize();
      expect(arm.dot(torso), `${side} corpse arm must not spread into a T`).toBeLessThan(-0.85);
    }
  });

  it('exports stone and bronze albedo in linear space exactly once', async () => {
    const root = (await io.read(model)).getRoot();
    const stone = root
      .listMeshes()[0]
      .listPrimitives()
      .find((primitive) => primitive.getMaterial().getName() === 'KitStone');
    const colors = stone.getAttribute('COLOR_0');
    // Authored sRGB stone (.38,.52,.52) and bronze (.62,.44,.23).
    // Double decoding crushed these to (.012,.043,.043)/(.094,.024,.004),
    // turning the guardian black in the actual temple despite correct lighting.
    for (const expected of [
      [0.119, 0.233, 0.233],
      [0.342, 0.162, 0.043],
    ]) {
      let matching = 0;
      for (let i = 0; i < colors.getCount(); i++) {
        const value = colors.getElement(i, []);
        if (expected.every((channel, k) => Math.abs(value[k] - channel) < 0.006)) matching++;
      }
      expect(matching, `linear palette ${expected}`).toBeGreaterThan(250);
    }
    expect(stone.getMaterial().getEmissiveFactor()).toEqual([0, 0, 0]);
  });

  it('makes the crown-to-sole body 1.8 to 2.2 player heights, excluding the trident', async () => {
    const root = (await io.read(model)).getRoot();
    let sole = Infinity;
    let top = -Infinity;
    let crown = -Infinity;
    let weaponVertices = 0;
    for (const node of root.listNodes()) {
      if (!node.getMesh()) continue;
      const skin = node.getSkin();
      const joints = skin.listJoints();
      const transforms = joints.map((joint, index) =>
        new Matrix4()
          .fromArray(joint.getWorldMatrix())
          .multiply(new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(index, []))),
      );
      for (const primitive of node.getMesh().listPrimitives()) {
        const positions = primitive.getAttribute('POSITION');
        const indices = primitive.getAttribute('JOINTS_0');
        const weights = primitive.getAttribute('WEIGHTS_0');
        for (let i = 0; i < positions.getCount(); i++) {
          const joint = indices.getElement(i, [])[0];
          // Rigid skin weights: the quantization transform is in inverse binds,
          // so raw POSITION extrema are not the actual rendered world bounds.
          expect(weights.getElement(i, [])[0]).toBeCloseTo(1);
          const point = new Vector3()
            .fromArray(positions.getElement(i, []))
            .applyMatrix4(transforms[joint]);
          sole = Math.min(sole, point.y);
          top = Math.max(top, point.y);
          if (joints[joint].getName() === 'Head') crown = Math.max(crown, point.y);
          if (joints[joint].getName() === 'Weapon') weaponVertices++;
        }
      }
    }
    expect(weaponVertices).toBeGreaterThan(100);
    expect(crown - sole).toBeCloseTo(3.58962, 3);
    expect(top - sole).toBeCloseTo(4.17, 3);
    for (const id of ['temple_tidemarked_trident', 'temple_tidemarked_tide']) {
      const size = VISUALS.temple_tidemarked_sentinel.height * (DROWNED_TEMPLE_MOBS[id].scale ?? 1);
      const bodyHeight = (size * (crown - sole)) / (top - sole);
      const ratio = bodyHeight / VISUALS.player_warrior.height;
      expect(ratio, `${id} actual body ratio`).toBeGreaterThanOrEqual(1.8);
      expect(ratio, `${id} actual body ratio`).toBeLessThanOrEqual(2.2);
    }
  });
});
