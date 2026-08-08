import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyMaterials, tintedMaterial } from '../src/render/characters/assets';
import type { VisualDef } from '../src/render/characters/manifest';
import { gfxInternalsForTest } from '../src/render/gfx';

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: vi.fn(() => new Promise(() => undefined)),
  loadKtx2Texture: vi.fn(() => new Promise(() => undefined)),
  loadTexture: vi.fn(() => new Promise(() => undefined)),
}));

vi.mock('../src/render/assets/preload', () => ({
  registerPreload: vi.fn(),
  registerDeferredPreload: vi.fn((start: () => unknown) => start()),
}));

describe('tinted character materials', () => {
  it('caches a colorless shader clone and continues the material traversal', () => {
    const restoreGfx = gfxInternalsForTest.overrideSettings({ standardMaterials: true });
    try {
      const shader = new THREE.ShaderMaterial();
      const colored = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const shaderMesh = new THREE.Mesh(new THREE.BufferGeometry(), shader);
      const coloredMesh = new THREE.Mesh(new THREE.BufferGeometry(), colored);
      const root = new THREE.Group();
      root.add(shaderMesh, coloredMesh);

      expect(() => applyMaterials(root, { tint: 0x336699 } as VisualDef, 0xffffff)).not.toThrow();

      const shaderClone = shaderMesh.material as THREE.ShaderMaterial;
      expect(shaderClone).not.toBe(shader);
      expect((shaderClone as THREE.ShaderMaterial & { color?: THREE.Color }).color).toBeUndefined();
      expect(tintedMaterial(shader, 0x336699, 0.4)).toBe(shaderClone);
      expect((coloredMesh.material as THREE.MeshStandardMaterial).color.getHex()).not.toBe(
        0xffffff,
      );
    } finally {
      restoreGfx();
    }
  });
});
