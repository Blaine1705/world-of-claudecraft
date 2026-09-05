import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CannonEncounterVisual } from '../src/render/cannon_encounter_visual';
import { createCannonEncounter } from '../src/sim/minigames/cannon_encounter';
import type { VehicleSession } from '../src/sim/types';

vi.mock('../src/render/characters/assets', () => ({ charactersReady: async () => {} }));
vi.mock('../src/render/assets/loader', () => ({
  loadGltf: async () => ({ scene: new THREE.Group() }),
}));
vi.mock('../src/render/characters', () => ({
  CharacterVisual: class {
    root = new THREE.Group();
    height = 2.6;
    setShadow() {}
    setProxyShadow() {}
    update() {}
    dispose() {}
  },
}));

describe('private cannon scene', () => {
  it('does not reattach or revive actors when disposed during the entry gate', async () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scene = new THREE.Scene();
    const visual = new CannonEncounterVisual(
      scene,
      () => 0,
      () => pending,
    );
    await vi.waitFor(() => expect(scene.children).toContain(visual.group));
    expect(scene.children).toContain(visual.group);
    visual.dispose();
    release();
    await visual.readyForEntry;
    expect(scene.children).not.toContain(visual.group);
    expect(visual.group.getObjectByName('cannon-enemies')).toBeUndefined();
  });
  it('gates before entry, presents only owner actors, clears on exit and releases geometry', async () => {
    const scene = new THREE.Scene();
    const gate = vi.fn(async () => {});
    const visual = new CannonEncounterVisual(scene, () => 3, gate);
    await visual.readyForEntry;
    expect(gate).toHaveBeenCalledWith(visual.group);
    expect(visual.group.getObjectByName('cannon-enemies')?.children).toHaveLength(51);
    const session: VehicleSession = {
      kind: 'cannon',
      stationId: 'north_watch_cannon',
      cycle: 'wq3_8',
      origin: { x: 368, y: 3, z: 1142 },
      encounter: createCannonEncounter(),
    };
    session.encounter.enemies.push({
      id: 1,
      kind: 'commander',
      x: 368,
      z: 1100,
      hp: 400,
      slowUntilTick: 0,
    });
    const before = JSON.stringify(session);
    visual.update(session);
    const content = visual.group.children[0];
    expect(content.visible).toBe(true);
    const enemies = visual.group.getObjectByName('cannon-enemies')!;
    const commander = enemies.getObjectByName('cannon-commander')!;
    expect(commander.visible).toBe(true);
    expect(commander.position.toArray()).toEqual([368, 3, 1100]);
    expect(enemies.children.filter((child) => child.visible)).toHaveLength(1);
    expect(JSON.stringify(session)).toBe(before);
    visual.update(null);
    expect(content.visible).toBe(false);
    visual.dispose();
    expect(scene.children).not.toContain(visual.group);
    visual.update(session);
    expect(content.visible).toBe(false);
  });
});
