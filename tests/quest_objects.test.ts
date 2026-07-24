// Pure geometry/material assertions for the procedural quest ground objects
// (src/render/quest_objects.ts), covering the royal_seal ("Ancient Diary")
// book that has no GLB and previously fell through to the generic
// supply_crate fallback. No renderer/WebGL context is needed: THREE.Group/
// Mesh/Geometry/Material construction runs fine under plain Node.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGroundQuestObject } from '../src/render/quest_objects';

describe('buildGroundQuestObject royal_seal', () => {
  it('returns a populated group, not the generic supply_crate fallback', () => {
    const { group, height } = buildGroundQuestObject('royal_seal', 1);
    let meshCount = 0;
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshCount++;
    });
    expect(meshCount).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('is deterministic: two builds produce identical mesh counts and bounds', () => {
    const a = buildGroundQuestObject('royal_seal', 2);
    const b = buildGroundQuestObject('royal_seal', 2);
    let countA = 0;
    let countB = 0;
    a.group.traverse((o) => {
      if (o instanceof THREE.Mesh) countA++;
    });
    b.group.traverse((o) => {
      if (o instanceof THREE.Mesh) countB++;
    });
    expect(countA).toBe(countB);
    expect(countA).toBeGreaterThan(0);

    a.group.updateMatrixWorld(true);
    b.group.updateMatrixWorld(true);
    const boxA = new THREE.Box3().setFromObject(a.group);
    const boxB = new THREE.Box3().setFromObject(b.group);
    expect(boxA.min.toArray()).toEqual(boxB.min.toArray());
    expect(boxA.max.toArray()).toEqual(boxB.max.toArray());
  });

  it('rotates each instance deterministically by entity id like other ground objects', () => {
    const a = buildGroundQuestObject('royal_seal', 3);
    const b = buildGroundQuestObject('royal_seal', 3);
    expect(a.group.rotation.y).toBeCloseTo(b.group.rotation.y);
    expect(a.group.rotation.y).toBeCloseTo((3 % 7) * 0.45);
  });

  it('sizes the book shorter than the tall wardstone pillar props', () => {
    const { height } = buildGroundQuestObject('royal_seal', 4);
    expect(height).toBeLessThan(2);
    expect(height).toBeGreaterThan(0.5);
  });

  it('the cover palette reads gold/orange-dominant, matching the icon', () => {
    const { group } = buildGroundQuestObject('royal_seal', 5);
    let coverMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | null = null;
    let widestX = 0;
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const geo = obj.geometry as THREE.BoxGeometry;
      if (!(geo instanceof THREE.BoxGeometry)) return;
      const params = geo.parameters as { width: number; height: number; depth: number };
      // The front/back covers are the two widest, shallow-depth boxes.
      if (params.width > widestX && params.depth < params.width * 0.2) {
        widestX = params.width;
        coverMat = obj.material as THREE.MeshStandardMaterial;
      }
    });
    expect(coverMat).not.toBeNull();
    const color = (coverMat as unknown as THREE.MeshStandardMaterial).color;
    expect(color.r).toBeGreaterThan(color.b);
    expect(color.r).toBeGreaterThan(0.5);
    expect(color.g).toBeGreaterThan(color.b);
  });
});
