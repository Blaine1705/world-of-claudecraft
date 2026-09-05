import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { IWorld } from '../src/world_api';

const calls = vi.hoisted(() => ({
  events: [] as string[],
  fizz: vi.fn(),
  dispose: vi.fn(),
  traceGate: vi.fn(),
  ready: Promise.resolve(),
}));
vi.mock('../src/render/race_line', () => ({
  RaceLine: class {
    update() {
      calls.events.push('race');
    }
  },
}));
vi.mock('../src/render/mount_beacon', () => ({
  MountBeacon: class {
    update(active: boolean) {
      calls.events.push(`mount:${active}`);
    }
  },
}));
vi.mock('../src/render/island_guidance', () => ({
  IslandGuidance: class {
    update() {
      calls.events.push('island');
    }
    npcFizz = calls.fizz;
  },
}));
vi.mock('../src/render/world_quest_trace_visual', () => ({
  WorldQuestTraceVisual: class {
    readyForEntry = calls.ready;
    constructor(
      scene: THREE.Object3D,
      _ground: unknown,
      gate?: (root: THREE.Object3D) => Promise<unknown>,
    ) {
      if (gate) calls.traceGate(gate(scene));
    }
    update() {
      calls.events.push('trace');
    }
    dispose = calls.dispose;
  },
}));

import { WorldGuidance } from '../src/render/world_guidance';

vi.mock('../src/render/cannon_encounter_visual', () => ({
  CannonEncounterVisual: class {
    readyForEntry = calls.ready;
    update() {
      calls.events.push('cannon');
    }
    dispose() {}
  },
}));

describe('personal world guidance coordinator', () => {
  it('marks the timed drawing gate as entry-required and exposes the readiness barrier', () => {
    const gate = vi.fn(() => Promise.resolve());
    const scene = new THREE.Scene();
    const guidance = new WorldGuidance(scene, () => 0, gate);
    expect(gate).toHaveBeenCalledWith(scene, true);
    expect(guidance.readyForEntry).toBeInstanceOf(Promise);
  });
  it.each([null, {}])(
    'preserves race/island/start ordering and riding quest admission with race=%s',
    (race) => {
      calls.events.length = 0;
      const guidance = new WorldGuidance(new THREE.Scene(), () => 0);
      const world = { mountRaceView: () => race, questState: () => 'active' } as unknown as IWorld;
      guidance.update(world, 10, 0.05);
      expect(calls.events).toEqual(['race', 'island', `mount:${!race}`, 'trace', 'cannon']);
    },
  );
  it('forwards NPC fizz arguments unchanged and releases the new visual', () => {
    const guidance = new WorldGuidance(new THREE.Scene(), () => 0);
    const args = [
      {} as IWorld,
      { id: 1, templateId: 'scribe' },
      { castSparkle: vi.fn() },
      4,
      0.05,
    ] as const;
    guidance.npcFizz(...args);
    expect(calls.fizz).toHaveBeenCalledWith(...args);
    guidance.dispose();
    expect(calls.dispose).toHaveBeenCalled();
  });
});
