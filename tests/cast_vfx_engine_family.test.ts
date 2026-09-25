// The cast gate waits on the ENGINE family alone (src/render/cast_vfx_family.ts):
// the pools the ability-VFX painter draws a cast with for every class, plus the
// Vfx particle cloud its bursts ride. Built here from the REAL AbilityVfxFx and
// Vfx, the way the renderer builds them, so the membership below is the
// shipped one, not a fixture's.
//
// Every drawable the engine builds belongs to a named pool, and every pool is
// named in exactly one of two tables: ENGINE (joins the gate) or UPGRADE (the
// Warrior kit, an optional layer with its own per-piece readiness checks,
// which keeps its compile unit and never holds a cast). A pool added to the
// engine without a row fails the attribution case; a row in ENGINE whose pool
// does not tag its drawables fails the membership case.

import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(async () => ({ image: null })),
  releaseTexture: vi.fn(),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: vi.fn(),
  registerDeferredPreload: vi.fn(),
}));

import { AbilityVfxFx } from '../src/render/ability_vfx/fx';
import {
  abilityVfxEngineMaterials,
  collectAbilityVfxCompileTargets,
} from '../src/render/ability_vfx/prewarm';
import { inCastVfxEngine } from '../src/render/cast_vfx_family';
import { DrainLifeVfx } from '../src/render/drain_life_vfx';
import { drawProgramSignature } from '../src/render/draw_program_signature_core';
import { UmbralAnchorMarker } from '../src/render/umbral_anchor_marker';
import { Vfx } from '../src/render/vfx';
import { createVfxAnchor } from '../src/render/vfx_anchor';
import { buildCastVfxBasicStandIns } from '../src/render/vfx_basic_materials';
import { drawsUnder, threeProgramKeys } from './helpers/three_program_keys';

/** Engine pools (AbilityVfxFx fields) and the distinct programs each draws. */
const ENGINE: Record<string, number> = {
  ribbons: 1,
  rings: 1,
  decals: 2,
  overlay: 1,
  pillars: 1,
  shells: 1,
  groundAuras: 1,
  flipbooks: 1,
};
/** The Vfx particle cloud: one Points program, drawn from the first frame. */
const CLOUD_PROGRAMS = 1;
/** The Warrior kit's pools: an upgrade layer, never a gate member. */
const UPGRADE = [
  'crests',
  'guards',
  'powerForms',
  'spiritHammers',
  'furyStates',
  'baked',
  'fragments',
] as const;
/** Pools that build no drawable of their own at construction (the spirit
 *  holders are material-less; each puppet runs its own compile gate). */
const NO_DRAWABLE = ['spirits'] as const;

type Draw = { object: THREE.Object3D; material: THREE.Material };

function installCanvasStub(): void {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'createImageData' || key === 'getImageData') {
          return (a: number, b: number, c?: number, d?: number) => ({
            data: new Uint8ClampedArray((c ?? a) * (d ?? b) * 4),
          });
        }
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        if (key === 'createPattern') return () => gradient;
        if (key === 'measureText') return () => ({ width: 1 });
        return noop;
      },
      set: () => true,
    },
  );
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
}

/** Every Object3D a pool instance reaches through its own fields (slots,
 *  arrays, nested records), stopping at the scene and the camera it was
 *  handed. The attribution a drawable gets is the pool that holds it. */
function objectsHeldBy(pool: unknown): Set<THREE.Object3D> {
  const held = new Set<THREE.Object3D>();
  const visited = new Set<unknown>();
  const visit = (value: unknown, depth: number): void => {
    if (value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    const object = value as THREE.Object3D & { isScene?: boolean; isCamera?: boolean };
    if (object.isObject3D) {
      if (object.isScene || object.isCamera) return;
      object.traverse((child) => held.add(child));
      return;
    }
    if (depth === 0 || ArrayBuffer.isView(value)) return;
    const record = value as {
      isMaterial?: boolean;
      isTexture?: boolean;
      isBufferGeometry?: boolean;
    };
    if (record.isMaterial || record.isTexture || record.isBufferGeometry) return;
    for (const entry of Object.values(value as Record<string, unknown>)) visit(entry, depth - 1);
  };
  visit(pool, 3);
  return held;
}

function engineScene() {
  installCanvasStub();
  const scene = new THREE.Scene();
  const vfx = new Vfx(scene, () => null);
  const cloud = (vfx as unknown as { points: THREE.Points }).points;
  const before = new Set<THREE.Object3D>();
  scene.traverse((object) => before.add(object));
  const fx = new AbilityVfxFx(
    scene,
    new THREE.PerspectiveCamera(),
    createVfxAnchor(() => false),
    () => 0,
  );
  const built: Draw[] = [];
  for (const draw of drawsUnder(scene)) if (!before.has(draw.object)) built.push(draw);
  const owners = new Map<THREE.Object3D, string[]>();
  for (const [field, pool] of Object.entries(fx as unknown as Record<string, unknown>)) {
    for (const object of objectsHeldBy(pool)) {
      const list = owners.get(object) ?? [];
      list.push(field);
      owners.set(object, list);
    }
  }
  const drawsOf = (fields: readonly string[]) =>
    built.filter((draw) => fields.includes(owners.get(draw.object)?.[0] ?? ''));
  return { scene, cloud, built, owners, drawsOf };
}

const signaturesOf = (draws: readonly Draw[]) =>
  new Set(draws.map((draw) => drawProgramSignature(draw.object, draw.material)));

describe('the cast gate engine family', () => {
  let h: ReturnType<typeof engineScene>;
  beforeAll(() => {
    h = engineScene();
  });

  it('attributes every drawable the engine builds to one named pool', () => {
    expect(h.built.length).toBeGreaterThan(0);
    const named = new Set<string>([...Object.keys(ENGINE), ...UPGRADE, ...NO_DRAWABLE]);
    for (const draw of h.built) {
      const owners = h.owners.get(draw.object) ?? [];
      expect(owners, `${draw.object.name || draw.object.type} has one owner`).toHaveLength(1);
      expect(named.has(owners[0]), `pool ${owners[0]} is in a table`).toBe(true);
    }
    const drawing = new Set(h.built.map((draw) => h.owners.get(draw.object)?.[0]));
    for (const pool of Object.keys(ENGINE)) expect(drawing.has(pool), pool).toBe(true);
    for (const pool of NO_DRAWABLE) expect(drawing.has(pool), pool).toBe(false);
  });

  it('joins every engine drawable and the cloud, and none of the upgrade layer programs', () => {
    for (const draw of h.drawsOf(Object.keys(ENGINE))) {
      expect(inCastVfxEngine(draw.object), `${h.owners.get(draw.object)?.[0]} joined`).toBe(true);
    }
    expect(inCastVfxEngine(h.cloud)).toBe(true);
    // The kit may own an engine pool instance (the Fury states' fallback
    // ribbon is an AbilityVfxRibbons): that draw joins, on an engine program.
    const engineSignatures = signaturesOf(h.drawsOf(Object.keys(ENGINE)));
    const own = h.drawsOf(UPGRADE).filter((draw) => !inCastVfxEngine(draw.object));
    expect(own.length).toBeGreaterThan(0);
    for (const draw of h.drawsOf(UPGRADE)) {
      if (!inCastVfxEngine(draw.object)) continue;
      const signature = drawProgramSignature(draw.object, draw.material);
      expect(engineSignatures.has(signature), `${h.owners.get(draw.object)?.[0]}`).toBe(true);
    }
  });

  it('gates exactly one representative per engine program', () => {
    for (const [pool, programs] of Object.entries(ENGINE)) {
      expect(signaturesOf(h.drawsOf([pool])).size, `${pool} programs`).toBe(programs);
    }
    const engineDraws = [
      ...h.drawsOf(Object.keys(ENGINE)),
      { object: h.cloud, material: h.cloud.material as THREE.Material },
    ];
    const total = Object.values(ENGINE).reduce((sum, n) => sum + n, CLOUD_PROGRAMS);
    const gated = abilityVfxEngineMaterials(h.scene);
    expect(gated).toHaveLength(total);
    expect(signaturesOf(engineDraws).size).toBe(total);
    // Every gated material is an engine draw's, and every engine program has
    // its representative: a signature is one of three's programs, never two.
    const keyOf = new Map<string, string>();
    for (const draw of engineDraws) {
      const signature = drawProgramSignature(draw.object, draw.material);
      const key = threeProgramKeys(draw.material, draw.object);
      const known = keyOf.get(signature);
      if (known === undefined) keyOf.set(signature, key);
      else expect(key, `${draw.object.name} shares a signature, not a program`).toBe(known);
    }
    const gatedKeys = new Set<string>();
    for (const material of gated) {
      const draw = engineDraws.find((candidate) => candidate.material === material);
      expect(draw, `${material.type} is an engine draw`).toBeDefined();
      if (draw) gatedKeys.add(threeProgramKeys(draw.material, draw.object));
    }
    expect(gatedKeys).toEqual(new Set(keyOf.values()));
  });

  it('keeps the upgrade layer programs out of the gate while they keep compile units', () => {
    const engineSignatures = signaturesOf(h.drawsOf(Object.keys(ENGINE)));
    const own = [...signaturesOf(h.drawsOf(UPGRADE))].filter((sig) => !engineSignatures.has(sig));
    expect(own.length).toBeGreaterThan(0);
    const gated = signaturesOf(
      abilityVfxEngineMaterials(h.scene).map((material) => {
        const draw = h.built.find((candidate) => candidate.material === material);
        return draw ?? { object: h.cloud, material };
      }),
    );
    const linked = new Set<string>();
    for (const target of collectAbilityVfxCompileTargets(h.scene)) {
      for (const draw of drawsUnder(target.object)) {
        linked.add(drawProgramSignature(draw.object, draw.material));
      }
    }
    for (const signature of own) {
      expect(gated.has(signature)).toBe(false);
      expect(linked.has(signature)).toBe(true);
    }
  });

  it('leaves the other cast VFX of the renderer out of the gate, units kept', () => {
    const { scene } = engineScene();
    const gatedBefore = abilityVfxEngineMaterials(scene);
    const unitsBefore = collectAbilityVfxCompileTargets(scene).length;
    scene.add(buildCastVfxBasicStandIns());
    new DrainLifeVfx(scene, () => null, vi.fn());
    const marker = new UmbralAnchorMarker();
    scene.add(marker.group);
    expect(abilityVfxEngineMaterials(scene)).toEqual(gatedBefore);
    expect(collectAbilityVfxCompileTargets(scene).length).toBeGreaterThan(unitsBefore);
  });
});
