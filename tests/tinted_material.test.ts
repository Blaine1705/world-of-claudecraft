import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyMaterials, tintedMaterial } from '../src/render/characters/assets';
import type { VisualDef } from '../src/render/characters/manifest';
import { gfxInternalsForTest } from '../src/render/gfx';
import { createWeaponVfx, type WeaponVfxSpec } from '../src/render/weapon_vfx';

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

      // tintStrength is pinned in the def so the 0.4 handed to tintedMaterial
      // below is coupled locally, not to DEFAULT_TINT_STRENGTH in assets.ts.
      const def = { tint: 0x336699, tintStrength: 0.4 } as VisualDef;
      expect(() => applyMaterials(root, def, 0xffffff)).not.toThrow();

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

  it('leaves a weapon-skin fresnel shell material untouched through a full pass', () => {
    const restoreGfx = gfxInternalsForTest.overrideSettings({ standardMaterials: true });
    try {
      const weapon = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
      );
      weapon.userData.weaponMesh = true;
      const root = new THREE.Group();
      root.add(weapon);
      const spec: WeaponVfxSpec = {
        tier: 'epic',
        name: 'test blade',
        type: 'sword',
        lore: '',
        fx: [],
      };
      const handle = createWeaponVfx(weapon, spec, { grounded: false });
      const shell = weapon.children.find((o) => o.userData.__vfx) as THREE.Mesh;
      expect(shell).toBeTruthy();
      expect(shell.userData.weaponVfxMesh).toBe(true);
      const shellMat = shell.material as THREE.ShaderMaterial;

      applyMaterials(root, { tint: 0x336699, tintStrength: 0.4 } as VisualDef, 0xffffff);

      // The sweep must not re-own the shell: the rig's per-frame uniform
      // writes go to this exact material instance, and a clone would render
      // frozen while the original absorbs every uTime/uStr write.
      expect(shell.material).toBe(shellMat);
      handle.update(0.25);
      expect(shellMat.uniforms.uTime.value).toBe(0.25);
      handle.dispose();
    } finally {
      restoreGfx();
    }
  });
});
