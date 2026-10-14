import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { inFarBand, installFarBandExperiment } from '../scripts/lib/far_band_experiment.mjs';
import {
  inMiddleBand,
  installMiddleBandExperiment,
} from '../scripts/lib/middle_band_experiment.mjs';
import { installSceneryDistanceExperiment } from '../scripts/lib/scenery_distance_experiment.mjs';

function fixture(x = 90) {
  const scene = new THREE.Scene(),
    root = new THREE.Group();
  root.name = 'jungle-features';
  scene.add(root);
  const mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> =
    new THREE.InstancedMesh(new THREE.BoxGeometry(8, 12, 8), new THREE.MeshLambertMaterial(), 2);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(20, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(x, 0, 0));
  root.add(mesh);
  scene.updateMatrixWorld(true);
  const webgl = {
    shadowMap: { enabled: false },
    render: vi.fn(),
    compileAsync: vi.fn(async () => {}),
    getRenderTarget: () => null,
    getViewport: (v: THREE.Vector4) => v.set(0, 0, 900, 400),
    getScissor: (v: THREE.Vector4) => v.set(0, 0, 900, 400),
    getScissorTest: () => false,
    getClearColor: (v: THREE.Color) => v.set(0),
    getClearAlpha: () => 1,
    autoClear: true,
    setRenderTarget: vi.fn(),
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
  };
  const renderer = {
    scene,
    camera: new THREE.PerspectiveCamera(),
    foliage: { update: vi.fn() },
    entryDetailHorizon: { sceneryCullFar: (d: number) => d },
    updateZoneFeatureVisibility: vi.fn(),
    zoneFeatureGroups: [{ group: root }],
    webgl,
    compileGate: vi.fn(async () => {}),
  };
  return { renderer, mesh, root };
}

describe('far scenery research', () => {
  it('does not charge outer-band selection work to the disabled comparison arm', async () => {
    const { renderer } = fixture(190);
    const distance = installSceneryDistanceExperiment(renderer);
    const far = await installFarBandExperiment(renderer, distance);
    distance.set(60);
    const selection = vi.spyOn(distance, 'retains');
    renderer.foliage.update();
    expect(selection).not.toHaveBeenCalled();
    far.set(true);
    selection.mockClear();
    renderer.foliage.update();
    expect(selection).toHaveBeenCalled();
    far.set(false);
    selection.mockClear();
    renderer.foliage.update();
    expect(selection).not.toHaveBeenCalled();
    expect(renderer.scene.getObjectByName('research-far-band')?.visible).toBe(false);
    far.dispose();
    distance.dispose();
  });
  it('joins at 120 yards with no overlap and stops at 240, using the same distance law', () => {
    for (const kind of ['foliage', 'landmark', 'zone-instance']) {
      for (const d of [119, 120, 120.01, 180, 240, 240.01]) {
        const item = { kind, bounds: [d, d + 20, -10, 10], x: d, z: 0 };
        expect(inFarBand(item, 0, 0)).toBe(d > 120 && d <= 240);
        expect(inMiddleBand(item, 0, 0) && inFarBand(item, 0, 0)).toBe(false);
      }
    }
  });
  it('only adds far geometry and transfers ownership to the middle band as the camera approaches', async () => {
    const { renderer, mesh } = fixture(190),
      original = renderer.foliage.update;
    const matrices = mesh.instanceMatrix.array.slice();
    const sourceDisposed = vi.fn();
    mesh.geometry.addEventListener('dispose', sourceDisposed);
    const distance = installSceneryDistanceExperiment(renderer);
    const far = await installFarBandExperiment(renderer, distance);
    const middle = await installMiddleBandExperiment(renderer, distance);
    middle.set('simple');
    far.set(true);
    expect(far.snapshot().active).toEqual([1]);
    expect(far.snapshot().triangles).toBeGreaterThan(0);
    expect(middle.snapshot().active).toEqual([]);
    const root = renderer.scene.getObjectByName('research-far-band');
    expect(root?.visible).toBe(true);
    far.set(false);
    expect(root?.visible).toBe(false);
    expect(far.snapshot().triangles).toBe(0);
    far.set(true);
    renderer.camera.position.x = 80;
    renderer.foliage.update();
    expect(far.snapshot().active).toEqual([]);
    expect(far.snapshot().triangles).toBe(0);
    expect(middle.snapshot().active).toEqual([1]);
    middle.dispose();
    far.dispose();
    far.dispose();
    distance.dispose();
    expect(renderer.foliage.update).toBe(original);
    expect(mesh.instanceMatrix.array).toEqual(matrices);
    expect(sourceDisposed).not.toHaveBeenCalled();
    expect(root?.parent).toBe(null);
  });
  it('starts empty without accidentally drawing near scenery and cleans up failed preparation', async () => {
    const { renderer, mesh } = fixture(30);
    const distance = installSceneryDistanceExperiment(renderer),
      original = renderer.foliage.update;
    const far = await installFarBandExperiment(renderer, distance);
    far.set(true);
    expect(far.snapshot().active).toEqual([]);
    expect(far.snapshot().triangles).toBe(0);
    far.dispose();
    renderer.compileGate.mockRejectedValueOnce(Error('gate rejected'));
    await expect(installFarBandExperiment(renderer, distance)).rejects.toThrow('gate rejected');
    expect(renderer.scene.getObjectByName('research-far-band')).toBeUndefined();
    expect(renderer.foliage.update).toBe(original);
    expect(mesh.count).toBe(2);
    distance.dispose();
  });
  it('reduces complex source geometry while retaining borrowed attributes and textures', async () => {
    const { renderer, mesh } = fixture(190);
    mesh.geometry = new THREE.SphereGeometry(8, 24, 16);
    const positions = mesh.geometry.attributes.position.array.slice();
    const distance = installSceneryDistanceExperiment(renderer);
    const far = await installFarBandExperiment(renderer, distance);
    distance.set(60);
    far.set(true);
    const stats = far.snapshot().stats;
    expect(stats.every((s) => s.after > 0 && s.after <= 32 && s.after < s.before)).toBe(true);
    expect(mesh.geometry.attributes.position.array).toEqual(positions);
    far.dispose();
    distance.dispose();
  });
});
