import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { loadGltf } from '../src/render/assets/loader';
import { buildFarshoreShipwreck, prepareFarshoreShipwreck } from '../src/render/farshore_shipwreck';
import { disposeUnsharedMeshResources } from '../src/render/shared_resource';
import { createWorldQuestPlacerModel } from '../src/render/world_quest_placer_assets';

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: vi.fn(async () => {
    const scene = new THREE.Group();
    scene.position.set(1, -3, 2);
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardMaterial()));
    return { scene };
  }),
}));

describe('authored Farshore shipwreck', () => {
  it('replaces the ship, dock and ropes with the supplied wreck at its exact exported transform', async () => {
    await prepareFarshoreShipwreck();
    const root = buildFarshoreShipwreck()!;
    expect(root.name).toBe('farshore-shipwreck');
    expect(root.children).toHaveLength(1);
    const ship = root.children[0];
    expect(ship.name).toBe('farshore-broken-ship');
    expect(ship.position.toArray()).toEqual([306, -4.75, 123.05]);
    expect(ship.rotation.x).toBeCloseTo(0);
    expect(ship.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(ship.rotation.z).toBeCloseTo(0);
    expect(ship.scale.toArray()).toEqual([14, 14, 14]);
    expect(root.getObjectByName('farshore-broken-dock')).toBeUndefined();
    expect(root.getObjectByName('farshore-mooring-lines')).toBeUndefined();
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).not.toContain(
      '/models/biome/sea_boat_sail_b.glb',
    );
    expect(vi.mocked(loadGltf).mock.calls.map(([url]) => url)).toContain(
      '/models/world_quests/shipwreck/shipwreck.glb',
    );
    const preview = createWorldQuestPlacerModel('wq_shipwreck');
    preview.position.set(306, -4.75, 123.05);
    preview.rotation.y = Math.PI / 2;
    preview.scale.setScalar(14);
    expect(new THREE.Box3().setFromObject(ship)).toEqual(new THREE.Box3().setFromObject(preview));
  });

  it('shares immutable resources without sharing instance transforms or disposing the next build', async () => {
    await prepareFarshoreShipwreck();
    const first = buildFarshoreShipwreck()!;
    const second = buildFarshoreShipwreck()!;
    first.children[0].position.x = 999;
    expect(second.children[0].position.x).toBe(306);
    expect(disposeUnsharedMeshResources(first, { geometries: true, materials: true })).toEqual({
      geometries: 0,
      materials: 0,
    });
    expect(new THREE.Box3().setFromObject(second).isEmpty()).toBe(false);
  });

  it('is composed by the existing Farshore feature builder', () => {
    const source = readFileSync('src/render/farshore_features.ts', 'utf8');
    expect(source).toContain('const shipwreck = buildFarshoreShipwreck();');
    expect(source).toContain('if (shipwreck) group.add(shipwreck);');
  });
});
