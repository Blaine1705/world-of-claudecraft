import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { syncDelveInteractableVisibility } from '../src/render/delve_props';
import { buildFarshoreShipwreck } from '../src/render/farshore_shipwreck';
import { setWorldQuestPlacerMask } from '../src/render/world_quest_placer_mask';
import {
  createCurrentQuestModel,
  currentQuestPlacements,
  disposeQuestPlacerInstances,
  prepareCurrentQuestAssets,
  type QuestPlacerWorld,
} from '../src/render/world_quest_placer_sources';
import type { Entity } from '../src/sim/types';

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: vi.fn(async () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardMaterial()));
    return { scene };
  }),
}));

function world(variant: number): QuestPlacerWorld {
  const entities = new Map<number, Entity>();
  for (let i = 0; i < 12; i++) {
    const id = 2147100100 + i;
    entities.set(id, { id, pos: { x: 280 + i, y: -1, z: 96 }, facing: 0.2, scale: 1.3 } as Entity);
  }
  return {
    entities,
    worldQuestCycle: '2026-09-21',
    worldQuestLog: new Map([
      ['wq_farshore_salvage', { state: 'active', puzzleVariant: variant } as never],
    ]),
  };
}

describe('current shipwreck authoring sources', () => {
  it('recreates the current ship at its exact authored transform without old scenery', async () => {
    await prepareCurrentQuestAssets();
    const original = buildFarshoreShipwreck()!;
    const rows = currentQuestPlacements(world(0));
    expect(rows).toHaveLength(13);
    const row = rows[0];
    const preview = createCurrentQuestModel(row.key);
    preview.position.set(row.x, row.y, row.z);
    preview.rotation.y = THREE.MathUtils.degToRad(row.rot);
    preview.scale.setScalar(row.scale);
    expect(new THREE.Box3().setFromObject(preview)).toEqual(
      new THREE.Box3().setFromObject(original),
    );
    expect(row).toMatchObject({ x: 306, y: -4.75, z: 123.05, rot: 90, scale: 14 });
    expect(rows.some((entry) => /dock|moorings/.test(entry.key))).toBe(false);
  });

  it('imports all twelve pieces even with a legacy variant and preserves entity state', async () => {
    await prepareCurrentQuestAssets();
    const source = world(2);
    const before = JSON.stringify([...source.entities]);
    const rows = currentQuestPlacements(source).slice(1);
    expect(rows.map((row) => row.sourceId)).toEqual(
      Array.from({ length: 12 }, (_, i) => `salvage:${2147100100 + i}`),
    );
    expect(rows[0]).toEqual({
      key: 'wq_existing_debris_4',
      sourceId: 'salvage:2147100100',
      x: 280,
      y: -1,
      z: 96,
      rot: THREE.MathUtils.radToDeg(0.2),
      scale: 1.3,
    });
    rows[0].x += 20;
    expect(JSON.stringify([...source.entities])).toBe(before);
  });

  it('keeps original quest bodies hidden across normal frame sync and restores normal policy on close', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.userData.entityId = 2147100100;
    scene.add(group);
    const entity = {
      id: 2147100100,
      pos: { x: 280, y: 0, z: 96 },
      objectItemId: 'wq_shipwreck_debris',
      templateId: '',
      lootable: true,
    } as never;
    setWorldQuestPlacerMask(scene, ['salvage:2147100100']);
    for (let i = 0; i < 3; i++) {
      group.visible = true; // the renderer's earlier culling pass
      expect(syncDelveInteractableVisibility(group, entity, new Map(), false)).toBe(false);
      expect(group.visible).toBe(false);
    }
    const otherScene = new THREE.Scene();
    const other = group.clone();
    otherScene.add(other);
    expect(syncDelveInteractableVisibility(other, entity, new Map(), false)).toBe(true);
    setWorldQuestPlacerMask(scene, []);
    expect(syncDelveInteractableVisibility(group, entity, new Map(), false)).toBe(true);
    expect(syncDelveInteractableVisibility(group, entity, new Map(), true)).toBe(false);
  });

  it('releases cloned instance buffers without disposing shared geometry or material', async () => {
    await prepareCurrentQuestAssets();
    const copy = createCurrentQuestModel('wq_existing_ship');
    const instance = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      1,
    );
    copy.add(instance);
    const disposed = vi.fn();
    instance.addEventListener('dispose', disposed);
    const geometryDispose = vi.spyOn(instance.geometry, 'dispose');
    const materialDispose = vi.spyOn(instance.material as THREE.Material, 'dispose');
    disposeQuestPlacerInstances(copy);
    expect(disposed).toHaveBeenCalledOnce();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(createCurrentQuestModel('wq_existing_ship').children[0]).not.toBe(instance);
  });
});
