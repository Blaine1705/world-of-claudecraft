import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createVariantPrewarmSlot } from '../src/render/variant_prewarm_slot';

function host() {
  const scene = new THREE.Scene();
  const compiled: THREE.Group[] = [];
  return {
    scene,
    compiled,
    api: {
      scene,
      compileColorPrograms: async (group: THREE.Group) => {
        compiled.push(group);
      },
    },
  };
}

describe('createVariantPrewarmSlot', () => {
  it('stages the built group under the scene, tagged prewarm, and reports it', () => {
    const h = host();
    const twin = new THREE.Group();
    twin.add(new THREE.Mesh());
    const build = vi.fn(() => twin);
    const slot = createVariantPrewarmSlot(h.api, 'ghost-fade-variants', build);
    expect(slot.group).toBeNull();
    expect(slot.staged()).toEqual(['ghost-fade-variants', null]);
    expect(slot.detail()).toBe('objects=0');
    slot.run();
    expect(build).toHaveBeenCalledWith(h.scene);
    expect(slot.group).toBe(twin);
    expect(twin.parent).toBe(h.scene);
    expect(twin.userData.renderCategory).toBe('prewarm');
    expect(slot.staged()).toEqual(['ghost-fade-variants', twin]);
    expect(slot.detail()).toBe('objects=1');
  });

  it('exposes two resume units, stage then compile, sharing the builder', async () => {
    const h = host();
    const twin = new THREE.Group();
    const slot = createVariantPrewarmSlot(h.api, 'character-effect-variants', () => twin);
    const units = slot.resumeUnits();
    expect(units.map((u) => u.id)).toEqual([
      'character-effect-variants:group',
      'character-effect-variants:compile',
    ]);
    await units[1].run();
    expect(h.compiled).toEqual([]);
    await units[0].run();
    await units[1].run();
    expect(h.compiled).toEqual([twin]);
    expect(twin.parent).toBe(h.scene);
  });

  it('hides at entry and removes without disposing at cleanup', () => {
    const h = host();
    const twin = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const dispose = vi.spyOn(material, 'dispose');
    twin.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    const slot = createVariantPrewarmSlot(h.api, 'ghost-fade-variants', () => twin);
    slot.hide();
    slot.run();
    slot.hide();
    expect(twin.visible).toBe(false);
    slot.cleanup();
    expect(twin.parent).toBeNull();
    expect(dispose).not.toHaveBeenCalled();
    expect(slot.group).toBeNull();
    expect(slot.staged()).toEqual(['ghost-fade-variants', null]);
    slot.cleanup();
  });
});
