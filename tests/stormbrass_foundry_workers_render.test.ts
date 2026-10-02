// The chained workers' visual plan (src/render/stormbrass_foundry/
// foundry_worker_fx_core.ts) and their looks: a chain spans from the camp's
// post to the worker's ankle with one link every pitch, only chained bodies
// wear one, a struck chain falls to the floor, and every worker template has
// a look whose clips exist on its rig.

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FOUNDRY_WORKER_LOOKS,
  FOUNDRY_WORKER_MOB_KEYS,
} from '../src/render/characters/foundry_worker_looks';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { gateObjectPlan } from '../src/render/gate_objects';
import { FoundryWorkerFx } from '../src/render/stormbrass_foundry/foundry_worker_fx';
import {
  type ChainPose,
  chainFall,
  chainPoseInto,
  fallenHeight,
  isChainedWorkerTemplate,
  WORKER_CHAIN,
  WORKER_CHAIN_MAX_LINKS,
  workerCampAt,
} from '../src/render/stormbrass_foundry/foundry_worker_fx_core';
import {
  FOUNDRY_WORKER_CAMP_TEMPLATES,
  FOUNDRY_WORKER_CAMPS,
  FOUNDRY_WORKER_TEMPLATES,
} from '../src/sim/content/stormbrass_foundry_workers';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import type { Entity } from '../src/sim/types';
import type { IWorld } from '../src/world_api';

const pose = (): ChainPose => ({ yaw: 0, pitch: 0, length: 0, links: 0 });

function glbClipNames(url: string): Set<string> {
  const b = readFileSync(`public/${url}`);
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as {
    animations?: { name: string }[];
  };
  return new Set((json.animations ?? []).map((a) => a.name));
}

describe('the chain', () => {
  it('only a chained miner or hauler wears one', () => {
    expect(isChainedWorkerTemplate(FOUNDRY_WORKER_TEMPLATES.miner)).toBe(true);
    expect(isChainedWorkerTemplate(FOUNDRY_WORKER_TEMPLATES.hauler)).toBe(true);
    expect(isChainedWorkerTemplate(FOUNDRY_WORKER_TEMPLATES.freed)).toBe(false);
    expect(isChainedWorkerTemplate('brass_sentry')).toBe(false);
  });

  it('spans from the post to the ankle: heading, dip and one link a pitch', () => {
    // Due north (+z), level.
    const north = chainPoseInto(pose(), 0, 1, 0, 0, 1, 5);
    expect(north.yaw).toBeCloseTo(0);
    expect(north.pitch).toBeCloseTo(0);
    expect(north.length).toBeCloseTo(5);
    expect(north.links).toBe(Math.round(5 / WORKER_CHAIN.pitch));
    // East (+x), and the far end lower: the chain dips.
    const east = chainPoseInto(pose(), 0, WORKER_CHAIN.postY, 0, 4, WORKER_CHAIN.ankleY, 0);
    expect(east.yaw).toBeCloseTo(Math.PI / 2);
    expect(east.pitch).toBeGreaterThan(0);
    // The far end of the chain, rebuilt from the pose, lands on the ankle.
    const y = WORKER_CHAIN.postY - Math.sin(east.pitch) * east.length;
    const flat = Math.cos(east.pitch) * east.length;
    expect(y).toBeCloseTo(WORKER_CHAIN.ankleY);
    expect(Math.sin(east.yaw) * flat).toBeCloseTo(4);
    expect(Math.cos(east.yaw) * flat).toBeCloseTo(0);
  });

  it('never draws past the links its geometry holds', () => {
    const far = chainPoseInto(pose(), 0, 0, 0, 0, 0, 500);
    expect(far.length).toBe(WORKER_CHAIN.maxLength);
    expect(far.links).toBe(WORKER_CHAIN_MAX_LINKS);
    expect(chainPoseInto(pose(), 0, 0, 0, 0, 0, 0).links).toBe(1);
  });

  it('holds every authored worker spot and the whole haul loop', () => {
    for (const c of FOUNDRY_WORKER_CAMPS) {
      const spots = [...c.workers, c.heap.stand, c.cart.stand];
      for (const s of spots) {
        const d = Math.hypot(s.x - c.post.x, s.z - c.post.z);
        expect(d, `${c.id} ${s.x},${s.z}`).toBeLessThan(WORKER_CHAIN.maxLength - 1);
        expect(d, `${c.id} ${s.x},${s.z}`).toBeGreaterThan(1.5);
      }
    }
  });

  it('a struck chain falls to the floor and stays there', () => {
    expect(chainFall(0)).toBe(0);
    expect(chainFall(WORKER_CHAIN.fallSeconds / 2)).toBeGreaterThan(0);
    expect(chainFall(WORKER_CHAIN.fallSeconds / 2)).toBeLessThan(0.5);
    expect(chainFall(WORKER_CHAIN.fallSeconds)).toBe(1);
    expect(chainFall(99)).toBe(1);
    expect(fallenHeight(WORKER_CHAIN.postY, 0)).toBe(WORKER_CHAIN.postY);
    expect(fallenHeight(WORKER_CHAIN.postY, 1)).toBeCloseTo(WORKER_CHAIN.floorY);
  });

  it('knows a camp by its post', () => {
    for (const c of FOUNDRY_WORKER_CAMPS) {
      expect(workerCampAt(c.post.x, c.post.z)?.id).toBe(c.id);
      expect(workerCampAt(c.post.x + 0.5, c.post.z - 0.5)?.id).toBe(c.id);
    }
    expect(workerCampAt(0, 0)).toBeNull();
  });

  it('a camp state object draws no default object: an empty anchor', () => {
    for (const templateId of Object.values(FOUNDRY_WORKER_CAMP_TEMPLATES)) {
      const plan = gateObjectPlan({
        templateId,
        dungeonId: 'stormbrass_foundry',
        pos: { x: 0, z: 0 },
      });
      expect(plan, templateId).toEqual({ encounterAnchor: true, height: 2 });
    }
  });
});

describe('the worker looks', () => {
  it('every worker template has its own look, wired into the manifest', () => {
    for (const templateId of Object.values(FOUNDRY_WORKER_TEMPLATES)) {
      const key = FOUNDRY_WORKER_MOB_KEYS[templateId];
      expect(key, templateId).toBeDefined();
      expect(VISUALS[key], key).toBe(FOUNDRY_WORKER_LOOKS[key]);
      expect(visualKeyFor({ kind: 'mob', templateId } as Entity)).toBe(key);
    }
  });

  it('every clip a look names exists on its rig', () => {
    for (const [key, def] of Object.entries(FOUNDRY_WORKER_LOOKS)) {
      const names = glbClipNames(def.url);
      for (const url of def.animUrls ?? []) for (const n of glbClipNames(url)) names.add(n);
      const used = [
        def.clips.idle,
        def.clips.walk,
        def.clips.run,
        def.clips.death,
        ...def.clips.attack,
      ];
      for (const clip of used) expect(names.has(clip), `${key} ${clip}`).toBe(true);
    }
  });

  it('a miner swings a two-hand chop at the seam, the freed cheer', () => {
    const miner = FOUNDRY_WORKER_LOOKS[FOUNDRY_WORKER_MOB_KEYS[FOUNDRY_WORKER_TEMPLATES.miner]];
    const freed = FOUNDRY_WORKER_LOOKS[FOUNDRY_WORKER_MOB_KEYS[FOUNDRY_WORKER_TEMPLATES.freed]];
    expect(miner.clips.idle).toBe('2H_Melee_Attack_Chop');
    expect(freed.clips.idle).toBe('Cheer');
    // The freed dropped their tools.
    expect(freed.attach ?? []).toEqual([]);
    expect((miner.attach ?? []).length).toBe(1);
  });
});

describe('the chains painter (FoundryWorkerFx)', () => {
  const origin = instanceOrigin(DUNGEONS.stormbrass_foundry.index, 0);
  const campA = FOUNDRY_WORKER_CAMPS[0];
  function world(campTemplate: string, workerTemplate: string) {
    const entities = new Map<number, unknown>();
    entities.set(1, {
      id: 1,
      kind: 'object',
      templateId: campTemplate,
      pos: { x: origin.x + campA.post.x, y: 0, z: origin.z + campA.post.z },
    });
    campA.workers.forEach((w, i) => {
      entities.set(10 + i, {
        id: 10 + i,
        kind: 'mob',
        dead: false,
        templateId: workerTemplate,
        pos: { x: origin.x + w.x, y: 0, z: origin.z + w.z },
      });
    });
    return { entities, entityRosterVersion: 1 } as unknown as IWorld & {
      entities: Map<number, { templateId: string }>;
    };
  }
  const visible = (scene: THREE.Scene, name: string): number => {
    let n = 0;
    scene.traverse((o) => {
      if (o.name === name && o.visible) n++;
    });
    return n;
  };
  const sparksLive = (scene: THREE.Scene): boolean => {
    let live = false;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).name === 'stormbrassWorkerChainSparks')
        live = m.visible;
    });
    return live;
  };

  it('hangs a chain per chained worker, strikes them with sparks once, then lets them lie', () => {
    const scene = new THREE.Scene();
    const w = world(FOUNDRY_WORKER_CAMP_TEMPLATES.guarded, FOUNDRY_WORKER_TEMPLATES.miner);
    const fx = new FoundryWorkerFx(scene, () => 0, w);
    fx.update(0.05);
    expect(visible(scene, 'foundryWorkerChain')).toBe(campA.workers.length);
    expect(visible(scene, 'foundryWorkerShackle')).toBe(campA.workers.length);
    expect(sparksLive(scene)).toBe(false);
    // Freed in view: the sparks fly and the chains stay drawn (on the floor).
    const camp = w.entities.get(1);
    if (camp) camp.templateId = FOUNDRY_WORKER_CAMP_TEMPLATES.freed;
    fx.update(0.05);
    expect(sparksLive(scene)).toBe(true);
    for (let i = 0; i < 80; i++) fx.update(0.05);
    expect(sparksLive(scene)).toBe(false);
    expect(visible(scene, 'foundryWorkerChain')).toBe(campA.workers.length);
    // The camp's object gone (the claim freed): nothing is left drawn.
    w.entities.delete(1);
    (w as { entityRosterVersion: number }).entityRosterVersion++;
    fx.update(0.05);
    expect(visible(scene, 'foundryWorkerChain')).toBe(0);
    fx.dispose();
    fx.dispose();
    fx.update(0.05);
  });

  it('a camp met already freed has its chains on the floor and no burst', () => {
    const scene = new THREE.Scene();
    const w = world(FOUNDRY_WORKER_CAMP_TEMPLATES.freed, FOUNDRY_WORKER_TEMPLATES.freed);
    const fx = new FoundryWorkerFx(scene, () => 0, w);
    fx.update(0.05);
    expect(visible(scene, 'foundryWorkerChain')).toBe(campA.workers.length);
    expect(sparksLive(scene)).toBe(false);
    fx.dispose();
  });
});
