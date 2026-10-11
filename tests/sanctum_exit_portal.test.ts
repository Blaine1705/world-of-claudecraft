import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSanctumExitPortal } from '../src/render/sanctum_exit_portal';
import { isSharedGeometry, isSharedMaterial } from '../src/render/shared_resource';

function meshes(root: THREE.Group): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) result.push(node);
  });
  return result;
}

describe('Sanctum return portal', () => {
  it('routes membrane motion through the renderer reduced-motion guard', () => {
    const source = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    expect(source).toMatch(
      /if \(v\.portal && vis && !v\.portal\.userData\.staticDoor && !this\.reducedMotion\(\)\)\s*\{\s*v\.portal\.rotation\.z/,
    );
  });

  it.each([true, false])('keeps its upright opening and frost landmarks on low=%s', (low) => {
    const { body, portal } = buildSanctumExitPortal(low, null);
    const opening = body.getObjectByName('frost-opening');
    expect(opening?.scale.y).toBeGreaterThan(opening?.scale.x ?? 0);
    expect(body.getObjectsByProperty('name', 'frost-rim')).toHaveLength(2);
    expect(body.getObjectsByProperty('name', 'frost-anchor')).toHaveLength(6);
    expect(portal.parent).toBe(opening);
    // A full turn of the animated membrane never rotates the oval opening.
    const before = new THREE.Box3().setFromObject(body);
    portal.rotation.z = Math.PI / 2;
    const after = new THREE.Box3().setFromObject(body);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);
    expect(meshes(body).every((mesh) => !mesh.castShadow)).toBe(true);
  });

  it('reuses tagged resources and the door texture across repeated builds', () => {
    const texture = new THREE.Texture();
    const a = buildSanctumExitPortal(false, texture);
    const b = buildSanctumExitPortal(false, texture);
    const first = meshes(a.body);
    const second = meshes(b.body);
    for (let i = 0; i < first.length; i++) {
      expect(first[i].geometry).toBe(second[i].geometry);
      expect(first[i].material).toBe(second[i].material);
      expect(isSharedGeometry(first[i].geometry)).toBe(true);
      expect(isSharedMaterial(first[i].material as THREE.Material)).toBe(true);
    }
    const mat = a.portal.material as THREE.MeshBasicMaterial;
    expect(mat.map).toBe(texture);
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.depthWrite).toBe(false);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(b.portal).not.toBe(a.portal);
  });

  it('keeps tier colors separate so a later low-tier build does not inherit HDR boost', () => {
    const high = buildSanctumExitPortal(false, null).portal.material as THREE.MeshBasicMaterial;
    const low = buildSanctumExitPortal(true, null).portal.material as THREE.MeshBasicMaterial;
    expect(high).not.toBe(low);
    expect(high.color.g).toBeCloseTo(low.color.g * 1.5);
    expect(low.opacity).toBeGreaterThan(0);
  });
});
