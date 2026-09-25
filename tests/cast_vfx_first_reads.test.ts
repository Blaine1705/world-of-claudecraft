// The reads a player acts on that still draw through a CLOSED cast gate (the
// hard-CC band's overlay cloud, the terrain-draped area ring) link in their own
// deadline-exempt boot entry, with the Vfx particle cloud, ahead of
// vfx.ability-primitives, and each settle records the programs so the gate
// reads them proved. Before this entry the band's program was linked by the
// band's first draw and the ring's only by a key share with another stand-in.

import { readFileSync } from 'node:fs';
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
import { buildAoeRingMesh } from '../src/render/aoe_ring_mesh';
import {
  CAST_VFX_FIRST_READS_ENTRY_ID,
  castVfxFirstReadsEntry,
  castVfxProgramUnits,
  createSceneCastVfxReadiness,
} from '../src/render/cast_vfx_prewarm';
import type { CompileArmHost } from '../src/render/compile_arms';
import { isProgramKnownReady } from '../src/render/linked_program_readiness';
import type { LinkedProgramLike } from '../src/render/linked_program_touch';
import {
  orderPrewarmResumeEntries,
  prewarmEntryShouldDefer,
  prewarmResumeIsDebt,
} from '../src/render/prewarm_policy';
import { Vfx } from '../src/render/vfx';
import { createVfxAnchor } from '../src/render/vfx_anchor';
import { codeWithoutLineComments } from './helpers/code_without_line_comments';

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

/** A program handle as the settle record keys it: identity is all it reads. */
function program(): LinkedProgramLike {
  return { getUniforms: () => ({}), getAttributes: () => ({}) } as unknown as LinkedProgramLike;
}

/** The area ring, from the builder the renderer's pooled slots use. */
function aoeRing(): THREE.Mesh {
  return buildAoeRingMesh(new THREE.RingGeometry(0.88, 1.0, 64));
}

/** The renderer's cast scene: the real Vfx cloud, the real engine and a
 *  ring, with one program handle per material, none proved yet. */
function castScene() {
  installCanvasStub();
  const scene = new THREE.Scene();
  const vfx = new Vfx(scene, () => null);
  const fx = new AbilityVfxFx(
    scene,
    new THREE.PerspectiveCamera(),
    createVfxAnchor(() => false),
    () => 0,
  );
  const ring = aoeRing();
  scene.add(ring);
  const programs = new Map<THREE.Material, LinkedProgramLike>();
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    for (const entry of Array.isArray(material) ? material : material ? [material] : []) {
      programs.set(entry, program());
    }
  });
  const webgl = {
    properties: { get: (material: THREE.Material) => ({ currentProgram: programs.get(material) }) },
  };
  const readiness = createSceneCastVfxReadiness(scene, webgl, () => 0);
  const roots = [fx.ccBandDrawable(), ring, vfx.cloudDrawable()];
  const compiled: THREE.Object3D[] = [];
  const entry = castVfxFirstReadsEntry(roots, {} as CompileArmHost, webgl, async (root) => {
    compiled.push(root);
  });
  const programOf = (object: THREE.Object3D) =>
    programs.get((object as THREE.Mesh).material as THREE.Material) as LinkedProgramLike;
  return { scene, fx, vfx, ring, webgl, readiness, roots, compiled, entry, programOf };
}

describe('the cast first-reads boot entry', () => {
  let h: ReturnType<typeof castScene>;
  beforeAll(() => {
    h = castScene();
  });

  it('is a deadline-exempt, optional vfx entry', () => {
    expect(h.entry).toMatchObject({
      id: CAST_VFX_FIRST_READS_ENTRY_ID,
      category: 'vfx',
      required: false,
      deadlineExempt: true,
    });
    expect(CAST_VFX_FIRST_READS_ENTRY_ID).toBe('vfx.cast-first-reads');
  });

  it('carries the CC band cloud, the ring and the particle cloud, each its own unit', () => {
    expect((h.roots[0] as THREE.Points).isPoints).toBe(true);
    expect((h.roots[2] as THREE.Points).isPoints).toBe(true);
    const units = h.entry.resumeProgramUnits?.() ?? [];
    expect(units.map((unit) => unit.roots)).toEqual(h.roots.map((root) => [root]));
    expect(new Set(units.map((unit) => unit.id)).size).toBe(units.length);
  });

  it('links its roots and proves them to the gate before any other cast unit', async () => {
    const pendingBefore = h.readiness.snapshot().pending ?? 0;
    expect(pendingBefore).toBeGreaterThan(2);
    for (const root of h.roots) expect(isProgramKnownReady(h.programOf(root))).toBe(false);
    await h.entry.run();
    expect(h.compiled).toEqual(h.roots);
    for (const root of h.roots) expect(isProgramKnownReady(h.programOf(root))).toBe(true);
    // The band cloud and the particle cloud are engine programs: two fewer
    // pending. The ring is no cast program at all, only proved.
    expect(h.readiness.snapshot()).toMatchObject({ ready: false, pending: pendingBefore - 2 });
    const rest = castVfxProgramUnits(h.scene, null, {} as CompileArmHost, h.webgl, async () => {});
    await Promise.all(rest.map((unit) => unit.run()));
    expect(h.readiness.snapshot()).toMatchObject({ ready: true, pending: 0, forced: false });
  });

  it('records nothing for a root whose compile failed', async () => {
    const ring = aoeRing();
    const handle = program();
    const webgl = { properties: { get: () => ({ currentProgram: handle }) } };
    const entry = castVfxFirstReadsEntry([ring], {} as CompileArmHost, webgl, () =>
      Promise.reject(new Error('lost')),
    );
    await expect(entry.run()).rejects.toThrow('lost');
    expect(isProgramKnownReady(handle)).toBe(false);
  });

  it('lets every other root settle and record before it reports one failure', async () => {
    const [band, ring, cloud] = [aoeRing(), aoeRing(), aoeRing()];
    const handles = new Map([band, ring, cloud].map((root) => [root.material, program()]));
    const webgl = {
      properties: {
        get: (material: THREE.Material) => ({ currentProgram: handles.get(material) }),
      },
    };
    // The failure lands at once; the two good links settle a macrotask later.
    const entry = castVfxFirstReadsEntry(
      [band, ring, cloud],
      {} as CompileArmHost,
      webgl,
      (root) =>
        root === ring
          ? Promise.reject(new Error('lost'))
          : new Promise((resolve) => setTimeout(resolve, 0)),
    );
    await expect(entry.run()).rejects.toThrow('lost');
    expect(isProgramKnownReady(handles.get(band.material) as LinkedProgramLike)).toBe(true);
    expect(isProgramKnownReady(handles.get(cloud.material) as LinkedProgramLike)).toBe(true);
    expect(isProgramKnownReady(handles.get(ring.material) as LinkedProgramLike)).toBe(false);
  });

  it('skips a missing root rather than failing the entry', () => {
    const entry = castVfxFirstReadsEntry(
      [null, aoeRing(), undefined],
      {} as CompileArmHost,
      h.webgl,
      async () => {},
    );
    expect(entry.resumeProgramUnits?.()).toHaveLength(1);
  });
});

describe('when the boot drops it', () => {
  it('runs past the soft deadline and is deferred only past the hard one', () => {
    // entryStarted, soft deadline, hard deadline, exempt, finish-full.
    expect(prewarmEntryShouldDefer(3500, 3000, 5000, true, false)).toBe(false);
    expect(prewarmEntryShouldDefer(5000, 3000, 5000, true, false)).toBe(true);
  });

  it('resumes its links as program debt ahead of the ability primitives', () => {
    const id = `programs.${CAST_VFX_FIRST_READS_ENTRY_ID}`;
    expect(prewarmResumeIsDebt(id)).toBe(true);
    // dropEntry pushes program debt in manifest order, and the entry sits
    // before vfx.ability-primitives (the wiring pin below).
    const ordered = orderPrewarmResumeEntries([
      { id: 'vfx.weapon-skins' },
      { id: 'programs.compile-submit' },
      { id },
      { id: 'programs.vfx.ability-primitives' },
    ]).map((entry) => entry.id);
    expect(ordered.indexOf(id)).toBeLessThan(ordered.indexOf('programs.vfx.ability-primitives'));
    expect(ordered.indexOf(id)).toBeLessThan(ordered.indexOf('vfx.weapon-skins'));
  });
});

describe('the renderer wiring (source pin)', () => {
  const renderer = codeWithoutLineComments(
    readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
  );

  it('builds the entry from the live band cloud, ring and particle cloud, right before the ability primitives', () => {
    const at = renderer.indexOf('      castVfxFirstReadsEntry(\n');
    expect(at).toBeGreaterThan(-1);
    const primitives = renderer.indexOf("        id: 'vfx.ability-primitives',", at);
    expect(primitives).toBeGreaterThan(at);
    const between = renderer.slice(at, primitives);
    expect(between).not.toMatch(/id: '/);
    expect(between).toContain(
      '[this.abilityVfxFx.ccBandDrawable(), this.aoeRings[0]?.ring, this.vfx.cloudDrawable()],',
    );
    expect(between).toContain('this.compileArms,');
    expect(between).toContain('this.webgl,');
    expect(renderer.indexOf('activeKitPrewarmEntry(this.scene')).toBeLessThan(at);
  });

  it('builds every ring slot with the shared builder the fixture uses', () => {
    expect(renderer).toContain('const ring = buildAoeRingMesh(aoeRingGeo);');
    expect(renderer).toContain(
      'this.aoeRings.push({ ring, mat: ring.material, radius: 1, elapsed: AOE_RING_LIFETIME });',
    );
  });
});
