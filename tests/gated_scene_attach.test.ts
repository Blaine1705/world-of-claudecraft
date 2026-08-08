import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { attachSceneGroupGated } from '../src/render/gated_scene_attach';

const fakeScene = () => {
  const added: THREE.Object3D[] = [];
  return { added, add: (o: THREE.Object3D) => added.push(o) };
};

describe('attachSceneGroupGated', () => {
  it('attaches immediately and visible when no gate is supplied', async () => {
    const scene = fakeScene();
    const group = new THREE.Group();
    await attachSceneGroupGated(scene, group);
    expect(scene.added).toEqual([group]);
    expect(group.visible).toBe(true);
  });

  it('hides the group while the gate compiles, then reveals it', async () => {
    const scene = fakeScene();
    const group = new THREE.Group();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pending = attachSceneGroupGated(scene, group, () => gate);
    expect(scene.added).toEqual([group]);
    expect(group.visible).toBe(false);
    release();
    await pending;
    expect(group.visible).toBe(true);
  });

  it('still reveals the group when the gate rejects (fail-soft first draw)', async () => {
    const scene = fakeScene();
    const group = new THREE.Group();
    await attachSceneGroupGated(scene, group, () => Promise.reject(new Error('shutdown')));
    expect(group.visible).toBe(true);
  });
});
