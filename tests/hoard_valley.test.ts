import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildHoardValley,
  disposeHoardValleyGroup,
  resolveHoardValleyEffectsProfile,
  updateHoardValleyDayNight,
} from '../src/render/hoard_valley';
import type { RiftFloorPlan } from '../src/sim/rift/types';

function floorPlan(): RiftFloorPlan {
  return {
    seed: 0x91234567,
    baseLevel: 20,
    floorIndex: 0,
    floorCount: 1,
    isBoss: true,
    name: 'Buried Hoard',
    themeName: 'Hidden Valley',
    layout: {
      zMin: -19,
      zMax: 145,
      sideWallZ: 63,
      sideWallHd: 83,
      wallX: 35,
      floorHalfX: 34,
      pillars: [],
      tombs: [],
      stubs: [],
      clutter: [],
      dais: { x: 0, z: 126, r: 13 },
      shellPolygon: [
        { x: 9, z: -19 },
        { x: 9, z: 10 },
        { x: 17, z: 28 },
        { x: 30, z: 50 },
        { x: 34, z: 145 },
        { x: -34, z: 145 },
        { x: -30, z: 50 },
        { x: -17, z: 28 },
        { x: -9, z: 10 },
        { x: -9, z: -19 },
      ],
    },
    style: {
      kit: 'temple',
      torch: { flame: 0xffffff, emissive: 0xffffff, light: 0xffffff },
      fog: { color: 0xffffff, near: 10, far: 100 },
    },
    entry: { x: 0, z: -11 },
    spawns: [],
    objects: [],
    puzzle: { kind: 'none', pylonCount: 0 },
    hazards: [],
    iceZone: null,
    rollers: [],
    platform: null,
    gate: null,
    outdoor: { zoneId: 'amberfall', gorgeEndZ: 18, valleyStartZ: 39 },
  };
}

describe('hoard valley painter', () => {
  it('attaches hidden through the GPU compile gate and seats at the instance offset', async () => {
    const scene = new THREE.Scene();
    let release = (): void => {};
    let compiled: THREE.Object3D | null = null;
    const gate = (target: THREE.Object3D) =>
      new Promise<void>((resolve) => {
        compiled = target;
        release = resolve;
      });
    const view = buildHoardValley({
      scene,
      compileGate: gate,
      plan: floorPlan(),
      offset: { x: 80, y: -3, z: 400 },
      effectsProfile: resolveHoardValleyEffectsProfile('high'),
    });
    expect(compiled).toBe(view.group);
    expect(scene.children).toContain(view.group);
    expect(view.group.visible).toBe(false);
    expect(view.group.position.toArray()).toEqual([80, -3, 400]);
    release();
    await view.readyForEntry;
    expect(view.group.visible).toBe(true);
    view.dispose();
  });

  it('builds shared-resource instancing for the ground, boundary and zone props', async () => {
    const scene = new THREE.Scene();
    const view = buildHoardValley({
      scene,
      plan: floorPlan(),
      offset: { x: 0, y: 0, z: 0 },
      effectsProfile: resolveHoardValleyEffectsProfile('ultra'),
    });
    await view.readyForEntry;
    const instances: THREE.InstancedMesh[] = [];
    view.group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) instances.push(object);
    });
    expect(instances.map((mesh) => mesh.name)).toContain('HoardValleyGround');
    expect(instances.map((mesh) => mesh.name)).toContain('HoardValleyBoundaryCliffs');
    expect(instances.length).toBeLessThanOrEqual(5);
    for (const mesh of instances) {
      expect(mesh.geometry.userData.sharedRendererResource).toBe(true);
      expect((mesh.material as THREE.Material).userData.sharedRendererResource).toBe(true);
      expect(mesh.geometry.getAttribute('color')).toBeDefined();
    }
    updateHoardValleyDayNight({ fog: [0.14, 0.2, 0.32] });
    const material = instances[0].material as THREE.MeshBasicMaterial;
    expect(material.color.toArray()).toEqual([0.14, 0.2, 0.32]);
    updateHoardValleyDayNight({ fog: [1, 1, 1] });
    view.dispose();
  });

  it('retires through a group-only registry adapter and releases instance buffers', async () => {
    const scene = new THREE.Scene();
    const view = buildHoardValley({
      scene,
      plan: floorPlan(),
      offset: { x: 0, y: 0, z: 0 },
      effectsProfile: resolveHoardValleyEffectsProfile('low'),
    });
    await view.readyForEntry;
    const ground = view.group.getObjectByName('HoardValleyGround') as THREE.InstancedMesh;
    let disposed = false;
    ground.addEventListener('dispose', () => {
      disposed = true;
    });
    expect(disposeHoardValleyGroup(view.group)).toBe(true);
    expect(disposed).toBe(true);
    expect(scene.children).not.toContain(view.group);
    expect(disposeHoardValleyGroup(view.group)).toBe(false);
  });
});
