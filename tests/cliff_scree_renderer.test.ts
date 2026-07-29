import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadGltf: vi.fn(),
  registerPreload: vi.fn(),
}));

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: mocks.loadGltf,
}));

vi.mock('../src/render/assets/preload', () => ({
  registerPreload: mocks.registerPreload,
}));

vi.mock('../src/render/worn_stone', () => ({
  applySurfaceDetail: vi.fn(),
}));

function rockGltf(): { scene: THREE.Group } {
  const scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x777777 });
  scene.add(new THREE.Mesh(geometry, material));
  return { scene };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('cliff scree renderer', () => {
  it('gates the view by tier, places instanced rocks, and can invalidate unchanged slots', async () => {
    mocks.loadGltf.mockImplementation(() => Promise.resolve(rockGltf()));
    const { GFX } = await import('../src/render/gfx');
    const original = GFX.cliffScree;
    const mutableGfx = GFX as unknown as { cliffScree: boolean };
    try {
      mutableGfx.cliffScree = false;
      const module = await import('../src/render/cliff_scree');
      await Promise.all(mocks.registerPreload.mock.calls.map(([promise]) => promise));

      const low = module.buildCliffScree(1337);
      expect(low.group.children).toEqual([]);
      expect(() => low.invalidate()).not.toThrow();

      mutableGfx.cliffScree = true;
      const high = module.buildCliffScree(1337);
      expect(high.group.children).toHaveLength(3);
      expect(high.group.children.every((child) => child instanceof THREE.InstancedMesh)).toBe(true);

      for (let pass = 0; pass < 8; pass++) high.update(0, 0);
      const meshes = high.group.children as THREE.InstancedMesh[];
      const matrix = new THREE.Matrix4();
      let visibleInstances = 0;
      for (const mesh of meshes) {
        for (let index = 0; index < mesh.count; index++) {
          mesh.getMatrixAt(index, matrix);
          if (Math.abs(matrix.determinant()) > 1e-8) visibleInstances++;
        }
      }
      expect(visibleInstances).toBeGreaterThan(0);

      const versions = meshes.map((mesh) => mesh.instanceMatrix.version);
      high.update(0, 0);
      expect(meshes.map((mesh) => mesh.instanceMatrix.version)).toEqual(versions);
      high.invalidate();
      high.update(0, 0);
      expect(meshes.every((mesh, index) => mesh.instanceMatrix.version > versions[index])).toBe(
        true,
      );
    } finally {
      mutableGfx.cliffScree = original;
    }
  });

  it('is mounted and advanced by Renderer', () => {
    const renderer = readFileSync(path.join(__dirname, '../src/render/renderer.ts'), 'utf8');
    expect(renderer).toContain('this.cliffScree = buildCliffScree(this.sim.cfg.seed);');
    expect(renderer).toContain('this.scene.add(this.cliffScree.group);');
    expect(renderer).toContain('this.cliffScree.update(p.pos.x, p.pos.z);');
  });
});
