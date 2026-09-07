import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HordeBarricadeVisual } from '../src/render/horde_barricade_visual';
import { HORDE_QUEST_ID, HORDE_SITE } from '../src/sim/content/world_quest_horde';
import {
  createHordeBarricade,
  HORDE_MAX_PROJECTILES,
  HORDE_MAX_SHOTS,
  HORDE_MAX_UNITS,
  HORDE_PROJECTILE_SPACING,
  type HordeUpgrade,
} from '../src/sim/minigames/horde_barricade';
import type { IWorld } from '../src/world_api';

vi.mock('../src/render/characters/assets', () => ({
  charactersReady: async () => {},
  prepareVisual: () => ({
    idleGeo: new THREE.BoxGeometry(1, 2.5, 1),
    idleSrcMats: [new THREE.MeshBasicMaterial()],
  }),
}));
vi.mock('../src/render/assets/loader', () => ({
  loadGltf: async () => ({
    scene: new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1.5), new THREE.MeshBasicMaterial()),
  }),
}));

function pool(visual: HordeBarricadeVisual, name: string): THREE.InstancedMesh {
  return visual.group.getObjectByName(`horde-${name}`) as THREE.InstancedMesh;
}

describe('personal horde scene', () => {
  it('requires its complete pool to link before entry and never reattaches after disposal', async () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gate = vi.fn(() => pending);
    const scene = new THREE.Scene();
    const visual = new HordeBarricadeVisual(scene, () => 0, gate);
    await vi.waitFor(() => expect(gate).toHaveBeenCalledWith(visual.group));
    expect(visual.group.visible).toBe(false);
    expect(pool(visual, 'boss').instanceMatrix.count).toBe(HORDE_MAX_UNITS);
    expect(pool(visual, 'explosive-shots').instanceMatrix.count).toBe(HORDE_MAX_SHOTS);
    expect(pool(visual, 'crates').instanceColor).not.toBeNull();
    expect(pool(visual, 'upgrades').instanceColor).not.toBeNull();
    expect(pool(visual, 'runner').instanceMatrix.count).toBe(HORDE_MAX_UNITS);
    visual.dispose();
    release();
    await visual.readyForEntry;
    expect(scene.children).not.toContain(visual.group);
  });

  it('places all bounded actors on authoritative world terrain without creating more meshes', async () => {
    const visual = new HordeBarricadeVisual(new THREE.Scene(), (x, z) => x * 0.1 + z * 0.01);
    await visual.readyForEntry;
    const count = visual.group.children[0].children.length;
    const state = createHordeBarricade(1);
    state.units = Array.from({ length: HORDE_MAX_UNITS }, (_, id) => ({
      id,
      kind: 'zombie',
      x: 3,
      z: 12,
      hp: 6,
      maxHp: 6,
    }));
    state.shots = Array.from({ length: HORDE_MAX_SHOTS }, (_, id) => ({
      id,
      x: 3,
      z: 7,
      age: 1,
      damage: 8,
      pierce: 1,
    }));
    visual.sync(state, true);
    expect(pool(visual, 'zombie').count).toBe(HORDE_MAX_UNITS);
    expect(pool(visual, 'health').count).toBe(HORDE_MAX_UNITS);
    expect(pool(visual, 'shots').count).toBe(HORDE_MAX_SHOTS);
    const matrix = new THREE.Matrix4();
    pool(visual, 'zombie').getMatrixAt(0, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    const x = HORDE_SITE.x + 3,
      z = HORDE_SITE.z + 12 * HORDE_SITE.direction;
    expect(position.x).toBe(x);
    expect(position.z).toBe(z);
    expect(position.y).toBeCloseTo(x * 0.1 + z * 0.01, 4);
    visual.sync(state);
    expect(visual.group.children[0].children).toHaveLength(count);
    visual.dispose();
  });

  it('distinguishes breakable upgrades, tough enemies and explosive shots on every motion setting', async () => {
    const visual = new HordeBarricadeVisual(new THREE.Scene(), () => 3);
    await visual.readyForEntry;
    const state = createHordeBarricade(3);
    state.upgrade = 3;
    state.projectiles = 2;
    state.units = [
      { id: 1, kind: 'crate', x: -5, z: 24, hp: 12, maxHp: 24 },
      { id: 2, kind: 'brute', x: 2, z: 25, hp: 28, maxHp: 28 },
      { id: 3, kind: 'boss', x: 0, z: 37, hp: 260, maxHp: 260 },
    ];
    state.shots = [{ id: 4, x: 0, z: 5, age: 1, damage: 12, pierce: 4 }];
    for (const reducedMotion of [false, true]) {
      visual.sync(state, reducedMotion);
      expect(pool(visual, 'crates').count).toBe(1);
      expect(pool(visual, 'upgrades').count).toBe(2);
      expect(pool(visual, 'crate-health').count).toBe(1);
      expect(pool(visual, 'brute').count).toBe(1);
      expect(pool(visual, 'boss').count).toBe(1);
      expect(pool(visual, 'explosive-shots').count).toBe(1);
      expect(pool(visual, 'shots').count).toBe(0);
      expect(visual.group.getObjectByName('horde-crossbow-0')?.position.x).toBe(-0.3);
      expect(visual.group.getObjectByName('horde-crossbow-1')?.visible).toBe(true);
    }
    state.upgrade = 0;
    state.projectiles = 1;
    state.playerX = -4;
    visual.sync(state, true);
    expect(visual.group.getObjectByName('horde-crossbow-0')?.position.x).toBe(0);
    expect(visual.group.getObjectByName('horde-crossbow-1')?.visible).toBe(false);
    expect(visual.group.getObjectByName('horde-repeater')?.position.x).toBe(HORDE_SITE.x - 4);
    visual.dispose();
  });

  it('preallocates eight barrels and tracks the authoritative volley spread', async () => {
    const visual = new HordeBarricadeVisual(new THREE.Scene(), () => 0);
    await visual.readyForEntry;
    const state = createHordeBarricade(1);
    const root = visual.group.getObjectByName('horde-repeater') as THREE.Group;
    const childCount = root.children.length;
    for (const projectiles of [1, 2, 4, HORDE_MAX_PROJECTILES, 1]) {
      state.projectiles = projectiles;
      visual.sync(state, true);
      for (let i = 0; i < HORDE_MAX_PROJECTILES; i++) {
        const mount = visual.group.getObjectByName(`horde-crossbow-${i}`) as THREE.Group;
        expect(mount.visible).toBe(i < projectiles);
        expect(mount.position.x).toBe((i - (projectiles - 1) / 2) * HORDE_PROJECTILE_SPACING);
      }
      expect(root.children).toHaveLength(childCount);
    }
    visual.dispose();
  });

  it('uses distinct crate colors and shapes without changing shader attributes during play', async () => {
    const visual = new HordeBarricadeVisual(new THREE.Scene(), () => 0);
    await visual.readyForEntry;
    const crateColors = pool(visual, 'crates').instanceColor;
    const badgeColors = pool(visual, 'upgrades').instanceColor;
    const state = createHordeBarricade(1);
    const rewards: HordeUpgrade[] = ['projectile', 'double', 'haste', 'pierce', 'explosive'];
    state.units = rewards.map((reward, id) => ({
      id,
      kind: 'crate',
      x: id - 2,
      z: 20,
      hp: 16,
      maxHp: 16,
      reward,
      choiceId: id,
    }));
    for (const reducedMotion of [false, true]) {
      visual.sync(state, reducedMotion);
      const colors = new Set<number>();
      for (let i = 0; i < rewards.length; i++) {
        const color = new THREE.Color();
        pool(visual, 'crates').getColorAt(i, color);
        colors.add(color.getHex());
      }
      expect(colors.size).toBe(5);
      expect(pool(visual, 'crates').count).toBe(5);
      expect(pool(visual, 'upgrades').count).toBe(11);
      expect(pool(visual, 'explosive-badges').count).toBe(1);
      expect(pool(visual, 'crates').instanceColor).toBe(crateColors);
      expect(pool(visual, 'upgrades').instanceColor).toBe(badgeColors);
    }
    visual.dispose();
  });

  it('keeps runners and their health visible with reduced motion and maximum occupancy', async () => {
    const visual = new HordeBarricadeVisual(new THREE.Scene(), () => 0);
    await visual.readyForEntry;
    const state = createHordeBarricade(1);
    state.units = Array.from({ length: HORDE_MAX_UNITS }, (_, id) => ({
      id,
      kind: 'runner',
      x: 0,
      z: 20,
      hp: 4,
      maxHp: 4,
    }));
    for (const reducedMotion of [false, true]) {
      visual.sync(state, reducedMotion);
      expect(pool(visual, 'runner').count).toBe(HORDE_MAX_UNITS);
      expect(pool(visual, 'health').count).toBe(HORDE_MAX_UNITS);
    }
    visual.dispose();
  });

  it('only reads the local quest log and clears every instance on exit', async () => {
    const visual = new HordeBarricadeVisual(new THREE.Scene(), () => 0);
    await visual.readyForEntry;
    const state = createHordeBarricade(2);
    const world = {
      worldQuestLog: new Map([[HORDE_QUEST_ID, { horde: state }]]),
    } as unknown as IWorld;
    visual.update(world);
    expect(visual.group.children[0].visible).toBe(true);
    visual.update({ worldQuestLog: new Map() } as unknown as IWorld);
    expect(visual.group.children[0].visible).toBe(false);
    visual.group.traverse((node) => {
      if ((node as THREE.InstancedMesh).isInstancedMesh)
        expect((node as THREE.InstancedMesh).count).toBe(0);
    });
    visual.dispose();
  });

  it.each(['won', 'failed'] as const)(
    'hides the whole scene after %s while retaining the result and allowing replay',
    async (phase) => {
      const visual = new HordeBarricadeVisual(new THREE.Scene(), () => 0);
      await visual.readyForEntry;
      const state = createHordeBarricade(2);
      state.phase = 'active';
      state.units = [{ id: 1, kind: 'brute', x: 0, z: 20, hp: 28, maxHp: 28 }];
      state.shots = [{ id: 2, x: 0, z: 5, age: 1, damage: 8, pierce: 1 }];
      const world = {
        worldQuestLog: new Map([[HORDE_QUEST_ID, { horde: state }]]),
      } as unknown as IWorld;
      visual.update(world);
      state.tick++;
      state.units[0].hp = 16;
      visual.update(world);
      expect(pool(visual, 'impacts').count).toBe(1);
      expect(pool(visual, 'shots').count).toBe(1);
      state.phase = phase;
      state.result = { kills: 1, barrier: 50, score: 260, rating: 'bronze' };
      const terminal = structuredClone(state);
      visual.update(world);
      expect(visual.group.children[0].visible).toBe(false);
      visual.group.traverse((node) => {
        if ((node as THREE.InstancedMesh).isInstancedMesh)
          expect((node as THREE.InstancedMesh).count).toBe(0);
      });
      expect(state).toEqual(terminal);
      // Resume at the same observed tick to expose stale hit effects too.
      state.phase = 'countdown';
      visual.update(world);
      expect(visual.group.children[0].visible).toBe(true);
      expect(pool(visual, 'shots').count).toBe(1);
      expect(pool(visual, 'impacts').count).toBe(0);
      visual.dispose();
    },
  );

  it('shows a short pooled hit response and drops cosmetic motion when requested', async () => {
    const visual = new HordeBarricadeVisual(new THREE.Scene(), () => 0);
    await visual.readyForEntry;
    const state = createHordeBarricade(1);
    state.units = [{ id: 1, kind: 'brute', x: 0, z: 20, hp: 28, maxHp: 28 }];
    visual.sync(state);
    state.tick++;
    state.units[0].hp = 16;
    visual.sync(state);
    expect(pool(visual, 'impacts').count).toBe(1);
    visual.sync(state, true);
    expect(pool(visual, 'impacts').count).toBe(0);
    state.tick += 6;
    visual.sync(state);
    expect(pool(visual, 'impacts').count).toBe(0);
    visual.dispose();
  });
});
