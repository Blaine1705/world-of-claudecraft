import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CannonEncounterVisual } from '../src/render/cannon_encounter_visual';
import { LAST_KEEP_CANNON, NORTH_WATCH_CANNON } from '../src/sim/content/vehicle_stations';
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
  it('moves the existing marker pool and shot origin to the active station', async () => {
    const visual = new CannonEncounterVisual(new THREE.Scene(), (x, z) => x + z);
    await visual.readyForEntry;
    const content = visual.group.children[0];
    const meshCount = content.children.length;
    for (const station of [NORTH_WATCH_CANNON, LAST_KEEP_CANNON, NORTH_WATCH_CANNON]) {
      const session: VehicleSession = {
        kind: 'cannon',
        stationId: station.id,
        cycle: 'wq3_8',
        origin: { x: station.x, y: 0, z: station.z },
        encounter: createCannonEncounter(),
      };
      session.encounter.tick = 2;
      session.encounter.shots = [
        {
          id: 1,
          action: 'cannonball',
          x: station.field.minX,
          z: station.field.minZ,
          firedTick: 0,
          impactTick: 4,
        },
      ];
      visual.update(session);
      const x = (station.x + station.field.minX) / 2;
      const z = (station.z + station.field.minZ) / 2;
      expect(content.children[0].position.toArray()).toEqual([x, x + z + 8, z]);
      const marker = content.children[6];
      const laneX = station.field.minX + 0.2 * (station.field.maxX - station.field.minX);
      expect(marker.position.toArray()).toEqual([
        laneX,
        laneX + station.field.minZ + 0.12,
        station.field.minZ,
      ]);
      expect(content.children).toHaveLength(meshCount);
    }
    visual.dispose();
  });
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
