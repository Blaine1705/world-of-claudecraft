import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  type InteriorRetirementHost,
  retireInteriorGroup,
} from '../src/render/interior_retirement';
import { markSharedGeometry, markSharedMaterial } from '../src/render/shared_resource';

// The interior retire path is the highest-blast-radius teardown in the
// renderer: it disposes everything under a retired floor that is not tagged
// shared, so a missed tag on a kit cache would brick every other interior for
// the session, and a skipped dispose re-creates the long-session floor leak.
// These suites build a synthetic floor with both resource classes plus the
// light/flame registries and pin every retire obligation.

function fakeHost() {
  const scene = new THREE.Scene();
  const fireLights: THREE.PointLight[] = [];
  const flames: THREE.Object3D[] = [];
  let rankDirty = 0;
  const retired: Array<ReadonlySet<THREE.Object3D>> = [];
  const host: InteriorRetirementHost = {
    scene,
    fireLights,
    flames,
    onLightRankDirty: () => {
      rankDirty++;
    },
    retireHideables: (doomed) => {
      retired.push(doomed);
    },
  };
  return { host, scene, fireLights, flames, rankDirty: () => rankDirty, retired };
}

function buildFloor(scene: THREE.Scene) {
  const group = new THREE.Group();
  // Kit-style instanced mesh: shared geometry + material (survive), per-build
  // instance buffers (released via the InstancedMesh dispose event).
  const kitGeo = markSharedGeometry(new THREE.BoxGeometry(1, 1, 1));
  const kitMat = markSharedMaterial(new THREE.MeshBasicMaterial());
  const kit = new THREE.InstancedMesh(kitGeo, kitMat, 8);
  group.add(kit);
  // Per-build procedural mesh (the rift platform/pool class): owned, freed.
  const ownedGeo = new THREE.BoxGeometry(2, 1, 2);
  const ownedMat = new THREE.MeshBasicMaterial();
  group.add(new THREE.Mesh(ownedGeo, ownedMat));
  const light = new THREE.PointLight(0xff8844, 1, 10);
  group.add(light);
  const flame = new THREE.Mesh(markSharedGeometry(new THREE.ConeGeometry(0.2, 0.6, 6)), kitMat);
  group.add(flame);
  scene.add(group);
  return { group, kit, kitGeo, kitMat, ownedGeo, ownedMat, light, flame };
}

describe('retireInteriorGroup', () => {
  it('removes the group, prunes registries, frees owned resources, keeps shared', () => {
    const { host, scene, fireLights, flames, rankDirty, retired } = fakeHost();
    const floor = buildFloor(scene);
    fireLights.push(floor.light);
    flames.push(floor.flame);
    // A second floor's registrations must survive the first floor's retire.
    const other = buildFloor(scene);
    fireLights.push(other.light);
    flames.push(other.flame);

    const disposed = new Set<string>();
    floor.kit.addEventListener('dispose', () => disposed.add('kitInstances'));
    floor.kitGeo.addEventListener('dispose', () => disposed.add('kitGeo'));
    floor.kitMat.addEventListener('dispose', () => disposed.add('kitMat'));
    floor.ownedGeo.addEventListener('dispose', () => disposed.add('ownedGeo'));
    floor.ownedMat.addEventListener('dispose', () => disposed.add('ownedMat'));

    retireInteriorGroup(host, floor.group);

    expect(scene.children).not.toContain(floor.group);
    expect(scene.children).toContain(other.group);
    // Registry pruning is scoped to the retired floor's nodes.
    expect(fireLights).toEqual([other.light]);
    expect(flames).toEqual([other.flame]);
    expect(rankDirty()).toBe(1);
    expect(retired.length).toBe(1);
    expect(retired[0].has(floor.flame)).toBe(true);
    // Disposal: per-build resources and instance buffers freed, shared kit
    // caches untouched (a missed tag here would brick every other interior).
    expect(disposed.has('ownedGeo')).toBe(true);
    expect(disposed.has('ownedMat')).toBe(true);
    expect(disposed.has('kitInstances')).toBe(true);
    expect(disposed.has('kitGeo')).toBe(false);
    expect(disposed.has('kitMat')).toBe(false);
  });

  it('leaves the light rank alone when the retired floor owned no fire light', () => {
    const { host, scene, fireLights, rankDirty } = fakeHost();
    const floor = buildFloor(scene);
    // The floor's light was never registered (lowGfx floors register none).
    void fireLights;
    retireInteriorGroup(host, floor.group);
    expect(rankDirty()).toBe(0);
  });
});
