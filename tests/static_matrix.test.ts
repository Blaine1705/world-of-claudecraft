import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  freezeStaticMatrices,
  freezeStaticSubtreeMatrices,
  refreshFrozenWorldMatrix,
} from '../src/render/static_matrix';

describe('static matrix traversal', () => {
  it('keeps transform-animated descendants live under a locally frozen root', () => {
    const scene = new THREE.Scene();
    scene.updateMatrix();
    scene.matrixAutoUpdate = false;
    const root = new THREE.Group();
    const moving = new THREE.Object3D();
    moving.position.x = 2;
    root.add(moving);
    scene.add(root);

    freezeStaticMatrices(root);
    moving.matrixAutoUpdate = true;
    moving.position.x = 7;
    scene.updateMatrixWorld();

    expect(moving.matrixWorld.elements[12]).toBe(7);
  });

  it('preserves final world matrices while skipping a fully static subtree', () => {
    const scene = new THREE.Scene();
    scene.updateMatrix();
    scene.matrixAutoUpdate = false;
    const root = new THREE.Group();
    root.position.x = 3;
    const child = new THREE.Object3D();
    child.position.x = 4;
    root.add(child);
    scene.add(root);

    freezeStaticSubtreeMatrices(root);
    expect(root.matrixWorldAutoUpdate).toBe(false);
    expect(child.matrixWorld.elements[12]).toBe(7);

    root.position.x = 30;
    child.position.x = 40;
    scene.updateMatrixWorld();
    expect(child.matrixWorld.elements[12]).toBe(7);
  });

  it('the plain scene walk composes a live child streamed under a SUBTREE-frozen root', () => {
    // Load-bearing r185 premise, pinned so a future three change reds here
    // instead of silently breaking the world: updateMatrixWorld recurses
    // children UNCONDITIONALLY (r165 pruned the walk at a
    // matrixWorldAutoUpdate=false node), and that unconditional descent is
    // the only thing placing content streamed under an already-frozen root.
    // The live case today is water gap sheets: water.ts buildSheet adds a
    // default-flag mesh at y = waterLevel() under a group frozen by the zone
    // load's freeze pass, and nothing ever refreshes it explicitly. If this
    // arm reds on a three bump, streamed-under-frozen content (gap-sheet
    // water first) is rendering at identity transforms.
    const scene = new THREE.Scene();
    scene.updateMatrix();
    scene.matrixAutoUpdate = false;
    const root = new THREE.Group();
    scene.add(root);
    freezeStaticSubtreeMatrices(root);

    const streamed = new THREE.Object3D();
    streamed.position.y = 6.4;
    root.add(streamed);
    scene.updateMatrixWorld();

    // Assert the composed ELEMENTS directly: getWorldPosition self-heals via
    // its own updateWorldMatrix call and would mask a pruned walk.
    expect(streamed.matrixWorld.elements[13]).toBe(6.4);
  });

  it('re-freezing a subtree-frozen root rebakes the root compose (r185 gate)', () => {
    // r185's force flag does not bypass the matrixWorldAutoUpdate gate, so a
    // plain updateMatrixWorld(true) bake skips the root's own compose on a
    // re-freeze; with an ancestor that moved since the first bake, the root
    // (and everything under it) would stay composed against the stale parent
    // world. The flag-preserving bake must heal the whole chain.
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    const root = new THREE.Group();
    root.position.x = 3;
    const child = new THREE.Object3D();
    child.position.x = 4;
    root.add(child);
    parent.add(root);
    scene.add(parent);

    freezeStaticSubtreeMatrices(root);
    expect(child.matrixWorld.elements[12]).toBe(7);

    parent.position.x = 10;
    scene.updateMatrixWorld();
    // The gated root did not follow its parent (the production freeze shape).
    expect(root.matrixWorld.elements[12]).toBe(3);

    freezeStaticMatrices(root);
    expect(root.matrixWorld.elements[12]).toBe(13);
    expect(child.matrixWorld.elements[12]).toBe(17);
    // The stronger subtree freeze survives the rebake.
    expect(root.matrixWorldAutoUpdate).toBe(false);
  });
});

describe('refreshFrozenWorldMatrix', () => {
  // The r185 premise the helper exists for: a plain updateMatrixWorld() on a
  // matrixWorldAutoUpdate=false node clears the dirty bit WITHOUT composing
  // (r165 composed here). If a future three restores the old semantics, this
  // arm flags the helper for re-evaluation instead of letting it rot.
  it('pins the r185 gate: a plain explicit call leaves a frozen node stale', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.matrixWorldAutoUpdate = false;
    camera.position.x = 5;
    camera.updateMatrixWorld();
    expect(camera.matrixWorld.elements[12]).toBe(0);
    expect(camera.matrixWorldNeedsUpdate).toBe(false);
  });

  it('composes a frozen parentless camera and leaves the freeze in place', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.matrixWorldAutoUpdate = false;
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    refreshFrozenWorldMatrix(camera);
    expect(camera.matrixWorld.elements[12]).toBe(3);
    expect(camera.matrixWorldAutoUpdate).toBe(false);
  });

  it('composes a frozen node against its live parent chain', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.position.x = 10;
    const frozen = new THREE.Object3D();
    frozen.position.x = 2;
    parent.add(frozen);
    scene.add(parent);
    scene.updateMatrixWorld(true);
    frozen.matrixWorldAutoUpdate = false;

    frozen.position.x = 4;
    refreshFrozenWorldMatrix(frozen);
    expect(frozen.matrixWorld.elements[12]).toBe(14);
    expect(frozen.matrixWorldAutoUpdate).toBe(false);
  });
});
