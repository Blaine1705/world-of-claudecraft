// The underwater compile gate (src/render/underwater.ts): the wash (tint and
// bubbles) and the water's from-below ceiling linked their programs live on
// the first dive, because the view starts hidden and no prewarm entry or gate
// ever saw them. UnderwaterView.setCompileGate makes them clients of the
// renderer's live compile gate: once water is NEAR the player (the lattice
// probe, water_approach_core.ts) or the camera is over water, the gate links
// the LIVE group and one live underside mesh, and until it settles the wash
// and every underside stay hidden. The fog override is outside the hold.
//
// Both water tiers are built for real (Phong on Low, the shader water with its
// underside twins on medium and up), with the sim's waterline stubbed to a
// set of test ponds.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnderwaterView } from '../src/render/underwater';
import type { WaterView } from '../src/render/water';
import {
  WATER_APPROACH_DISC_POINTS,
  WATER_APPROACH_RADIUS,
} from '../src/render/water_approach_core';
import { stripComments } from './helpers/strip_comments';

const WATERLINE = 0;
const SEED = 20061;
const ponds: { x: number; z: number; r: number }[] = [];

function pondLevel(x: number, z: number): number {
  for (const p of ponds) {
    if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) return WATERLINE;
  }
  return Number.NEGATIVE_INFINITY;
}

type Tier = 'low' | 'medium';

async function load(tier: Tier) {
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadTexture: vi.fn(async () => new THREE.Texture()),
  }));
  vi.doMock('../src/render/assets/preload', () => ({
    registerPreload: vi.fn(),
    registerDeferredPreload: vi.fn((start: () => unknown) => start()),
  }));
  vi.doMock('../src/render/gfx', () => ({
    GFX: { standardMaterials: tier !== 'low' },
    SUN_DIR: new THREE.Vector3(1, 1, 1).normalize(),
    sharedUniforms: { uTime: { value: 0 } },
  }));
  vi.doMock('../src/render/textures', () => ({
    waterNormalish: vi.fn(() => new THREE.Texture()),
    waterNormalMaps: vi.fn(() => [new THREE.Texture(), new THREE.Texture()]),
  }));
  vi.doMock('../src/sim/world', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../src/sim/world')>()),
    waterLevelAt: (x: number, z: number) => pondLevel(x, z),
  }));
  const { buildWater, hasWaterShaderAssets } = await import('../src/render/water');
  const { UnderwaterView: View } = await import('../src/render/underwater');
  await Promise.resolve();
  expect(hasWaterShaderAssets()).toBe(tier !== 'low');
  return { water: buildWater(SEED), view: new View(tier === 'low') };
}

interface GateCall {
  root: THREE.Object3D;
  resolve: () => void;
  reject: (error: Error) => void;
}

function heldGate() {
  const calls: GateCall[] = [];
  const gate = (root: THREE.Object3D) =>
    new Promise<unknown>((resolve, reject) => {
      calls.push({ root, resolve: () => resolve(undefined), reject });
    });
  return { gate, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function undersides(water: WaterView): THREE.Mesh[] {
  return water.group.children.filter(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.name === 'water-underside',
  );
}

class Rig {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  readonly player = { x: 0, z: 0 };
  time = 0;

  constructor(
    readonly view: UnderwaterView,
    readonly water: WaterView,
  ) {
    this.scene.fog = new THREE.Fog(0x88aacc, 30, 220);
    this.scene.add(view.group, water.group);
  }

  place(px: number, pz: number, camY = 12, camX = px, camZ = pz): void {
    this.player.x = px;
    this.player.z = pz;
    this.camera.position.set(camX, camY, camZ);
    this.camera.updateMatrixWorld();
  }

  frame(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.time += 1 / 30;
      const cam = this.camera.position;
      this.water.update(this.time, cam.x, cam.z, 200, cam.y);
      this.view.frame(this.camera, this.scene, this.player, SEED, 1 / 30);
    }
  }

  /** Enough frames for the probe to read its whole disc from one spot. */
  settleProbe(): void {
    this.frame(WATER_APPROACH_DISC_POINTS);
  }

  undersideShown(): boolean {
    return undersides(this.water).some((mesh) => mesh.visible);
  }
}

afterEach(() => {
  ponds.length = 0;
  vi.doUnmock('../src/render/assets/loader');
  vi.doUnmock('../src/render/assets/preload');
  vi.doUnmock('../src/render/gfx');
  vi.doUnmock('../src/render/textures');
  vi.doUnmock('../src/sim/world');
});

for (const tier of ['low', 'medium'] as const) {
  describe(`underwater compile gate, ${tier} tier`, () => {
    it('exposes the live underside only where the water has one', async () => {
      const { water } = await load(tier);
      const root = water.undersideRoot();
      if (tier === 'low') {
        expect(root).toBeNull();
        expect(undersides(water)).toEqual([]);
        return;
      }
      const all = undersides(water);
      expect(all.length).toBeGreaterThan(0);
      expect(all).toContain(root);
      const material = (root as THREE.Mesh).material as THREE.ShaderMaterial;
      expect(material.side).toBe(THREE.BackSide);
      expect(material.defines).toHaveProperty('WATER_UNDERSIDE');
      for (const mesh of all) expect(mesh.material).toBe(material);
    });

    it('links the live group and live underside on approach, hidden until it settles', async () => {
      const { water, view } = await load(tier);
      const rig = new Rig(view, water);
      const { gate, calls } = heldGate();
      view.setCompileGate(gate, () => water);
      ponds.push({ x: 100, z: 0, r: 18 });

      rig.place(100 - 18 - (WATER_APPROACH_RADIUS - 20), 0);
      rig.settleProbe();
      expect(calls.map((c) => c.root)).toEqual(
        tier === 'low' ? [view.group] : [view.group, water.undersideRoot()],
      );

      rig.place(100, 0, WATERLINE - 3);
      rig.frame(40);
      expect(view.group.visible).toBe(false);
      expect(rig.undersideShown()).toBe(false);

      calls[0].resolve();
      await flush();
      rig.frame();
      if (tier === 'medium') {
        expect(view.group.visible).toBe(false);
        calls[1].resolve();
        await flush();
        rig.frame();
      }
      expect(view.group.visible).toBe(true);
      rig.frame();
      expect(rig.undersideShown()).toBe(tier === 'medium');
      expect(calls).toHaveLength(tier === 'low' ? 1 : 2);
    });

    it('shows at once with no gate installed', async () => {
      const { water, view } = await load(tier);
      const rig = new Rig(view, water);
      view.setCompileGate(null, () => water);
      ponds.push({ x: 0, z: 0, r: 30 });
      rig.place(0, 0, WATERLINE - 3);
      rig.frame(2);
      expect(view.group.visible).toBe(true);
      expect(rig.undersideShown()).toBe(tier === 'medium');
    });

    it('shows once a rejected link settles: the wash is cosmetic', async () => {
      const { water, view } = await load(tier);
      const rig = new Rig(view, water);
      const { gate, calls } = heldGate();
      view.setCompileGate(gate, () => water);
      ponds.push({ x: 0, z: 0, r: 30 });
      rig.place(0, 0, WATERLINE - 3);
      rig.frame(10);
      expect(view.group.visible).toBe(false);
      for (const call of calls) call.reject(new Error('context lost'));
      await flush();
      rig.frame(2);
      expect(view.group.visible).toBe(true);
      expect(rig.undersideShown()).toBe(tier === 'medium');
    });

    it('shows once a gate that throws on submit is caught', async () => {
      const { water, view } = await load(tier);
      const rig = new Rig(view, water);
      view.setCompileGate(
        () => {
          throw new Error('no queue');
        },
        () => water,
      );
      ponds.push({ x: 0, z: 0, r: 30 });
      rig.place(0, 0, WATERLINE - 3);
      rig.frame(3);
      expect(view.group.visible).toBe(true);
    });

    it('does not arm with water just past its radius', async () => {
      const { water, view } = await load(tier);
      const rig = new Rig(view, water);
      const { gate, calls } = heldGate();
      view.setCompileGate(gate, () => water);
      ponds.push({ x: WATER_APPROACH_RADIUS + 40, z: 0, r: 10 });
      rig.place(0, 0);
      rig.settleProbe();
      expect(calls).toEqual([]);
    });

    it('never arms, and stops reading, for a player who never nears water', async () => {
      const { water, view } = await load(tier);
      const rig = new Rig(view, water);
      const { gate, calls } = heldGate();
      view.setCompileGate(gate, () => water);
      ponds.push({ x: 5000, z: 5000, r: 40 });
      for (let z = 0; z < 400; z += 0.5) {
        rig.place(0, z);
        rig.frame();
      }
      rig.settleProbe();
      expect(calls).toEqual([]);
      expect(view.group.visible).toBe(false);
      expect(rig.undersideShown()).toBe(false);
    });

    it('arms on the first camera-over-water frame where the lattice misses a small pond', async () => {
      const { water, view } = await load(tier);
      const rig = new Rig(view, water);
      const { gate, calls } = heldGate();
      view.setCompileGate(gate, () => water);
      ponds.push({ x: 5, z: 5, r: 1 });
      rig.place(5, 5, 12, 5, 20);
      rig.settleProbe();
      expect(calls).toEqual([]);
      rig.place(5, 5, 12, 5, 5);
      rig.frame();
      expect(calls[0]?.root).toBe(view.group);
    });

    it('keeps the fog override outside the hold', async () => {
      const held = await load(tier);
      const heldRig = new Rig(held.view, held.water);
      held.view.setCompileGate(heldGate().gate, () => held.water);
      const open = await load(tier);
      const openRig = new Rig(open.view, open.water);
      open.view.setCompileGate(null, () => open.water);
      ponds.push({ x: 0, z: 0, r: 30 });
      for (const rig of [heldRig, openRig]) {
        rig.place(0, 0, WATERLINE - 3);
        rig.frame(20);
      }
      expect(held.view.group.visible).toBe(false);
      expect(open.view.group.visible).toBe(true);
      const heldFog = heldRig.scene.fog as THREE.Fog;
      const openFog = openRig.scene.fog as THREE.Fog;
      expect(heldFog.far).toBeLessThan(100);
      expect(heldFog.far).toBe(openFog.far);
      expect(heldFog.near).toBe(openFog.near);
      expect(heldFog.color.getHex()).toBe(openFog.color.getHex());
    });
  });
}

describe('renderer wiring', () => {
  const source = stripComments(
    readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
  );

  it('installs the live compile gate and the live water on the underwater view', () => {
    expect(source).toMatch(
      /this\.underwaterView\.setCompileGate\(this\.worldCompileGate\(\) \?\? null, \(\) => this\.waterView\)/,
    );
    expect(source).toMatch(
      /private worldCompileGate\(\)[^{]*\{\s*return this\.asyncCompileSupported \? \(target\) => this\.compileGate\(target\) : undefined;/,
    );
  });

  it('drives the view from the player position on both frame paths', () => {
    const calls = source.match(
      /this\.underwaterView\.frame\(this\.camera, this\.scene, p\.pos, this\.sim\.cfg\.seed, dt\)/g,
    );
    expect(calls).toHaveLength(2);
  });
});
