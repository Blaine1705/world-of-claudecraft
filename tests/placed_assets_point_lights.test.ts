import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { POINT_LIGHT_SOURCE_MASK } from '../src/render/point_light_carriers_core';

// A placed GLB may carry glTF punctual lights. In the world scene three would
// gather them beside the carriers, in traversal order, where the lit programs'
// point loop can already have stopped at a black carrier.
const template = new THREE.Group();
const lamp = new THREE.PointLight(0xffcc88, 4, 10, 2);
lamp.name = 'glb-lamp';
template.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), lamp);

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: async () => ({ scene: template }),
}));
vi.mock('../src/render/assets/preload', () => ({ registerPreload: () => {} }));

const { PlacedAssetsView } = await import('../src/render/placed_assets');

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('point lights in placed GLBs', () => {
  it('are carrier sources while placed, and leave the source list with their placement', async () => {
    const view = new PlacedAssetsView([], 7);
    view.addPlacement(0, { path: '/models/lamp.glb', x: 0, z: 0, rotY: 0, scale: 1 });
    view.addPlacement(1, { path: '/models/lamp.glb', x: 4, z: 0, rotY: 0, scale: 1 });
    await settle();

    expect(view.pointLights).toHaveLength(2);
    expect(view.pointLights.every((light) => light.name === 'glb-lamp')).toBe(true);
    expect(view.pointLights.every((light) => light.layers.mask === POINT_LIGHT_SOURCE_MASK)).toBe(
      true,
    );
    expect(view.pointLights).not.toContain(lamp);

    const kept = view.pointLights[1];
    view.removePlacement(0);
    expect(view.pointLights).toEqual([kept]);
  });
});
