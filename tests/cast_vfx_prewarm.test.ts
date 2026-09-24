// The host half of the cast-VFX gate (src/render/cast_vfx_prewarm.ts): what it
// reads off three to answer "is this material's program linked". three assigns
// `currentProgram` when the program cache hands the program over, which is
// BEFORE the link resolves under KHR_parallel_shader_compile, so the presence
// of a program is NOT the answer, and a driver query from a live frame is
// forbidden (linked_program_readiness.ts). The answer is the settle record:
// each cast unit marks its root's programs once its compile settled, and the
// gate reads the record.

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { castVfxProgramUnits, createSceneCastVfxReadiness } from '../src/render/cast_vfx_prewarm';
import type { CompileArmHost } from '../src/render/compile_arms';
import { markProgramReady } from '../src/render/linked_program_readiness';
import type { LinkedProgramLike } from '../src/render/linked_program_touch';
import { desktopTierProfile } from './helpers/gfx_tier';
import { stripComments } from './helpers/strip_comments';
import { threeProgramKeys } from './helpers/three_program_keys';

/** A pooled VFX mesh: `renderCategory` is the tag abilityVfxCompileMaterials
 *  selects on, so this is what the gate's scene walk collects. */
function vfxMesh(
  name: string,
  material: THREE.Material = new THREE.MeshBasicMaterial(),
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.name = name;
  mesh.userData.renderCategory = 'vfx';
  return mesh;
}

/** A program handle as the record keys it: identity is all that matters. */
function program(): LinkedProgramLike {
  return { getUniforms: () => ({}), getAttributes: () => ({}) } as unknown as LinkedProgramLike;
}

function harness(meshes: THREE.Mesh[]) {
  const scene = new THREE.Scene();
  for (const mesh of meshes) scene.add(mesh);
  const programs = new Map<THREE.Material, LinkedProgramLike | null | undefined>();
  const webgl = {
    properties: {
      get: (material: THREE.Material) => ({ currentProgram: programs.get(material) }),
    },
  };
  // Never reached: every unit here injects its own compile.
  const host = {} as CompileArmHost;
  const readiness = createSceneCastVfxReadiness(
    scene,
    webgl,
    // Staged with nothing of its own: the lazy stand-in group is not what is
    // under test here.
    () => [],
    () => 0,
  );
  const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.Material;
  return { scene, host, webgl, readiness, programs, materialOf };
}

describe('the scene cast-VFX gate over three', () => {
  it('is not ready while a material has no program at all', () => {
    const { readiness } = harness([vfxMesh('ring')]);
    expect(readiness.ready()).toBe(false);
    expect(readiness.snapshot().pending).toBe(1);
  });

  it('is not ready on a program the record has not proved, whatever three holds', () => {
    // The old predicate opened here: `currentProgram` exists the moment the
    // program cache hands it over, links still in flight.
    const mesh = vfxMesh('ring');
    const { readiness, programs, materialOf } = harness([mesh]);
    const handle = program();
    programs.set(materialOf(mesh), handle);
    expect(readiness.ready()).toBe(false);
    expect(readiness.snapshot().pending).toBe(1);
    markProgramReady(handle);
    expect(readiness.ready()).toBe(true);
    expect(readiness.snapshot()).toMatchObject({ ready: true, pending: 0, forced: false });
  });

  it('opens once the unit that compiled the program settled, and not before', async () => {
    const mesh = vfxMesh('ring');
    const { scene, host, webgl, readiness, programs, materialOf } = harness([mesh]);
    programs.set(materialOf(mesh), program());
    let settle: () => void = () => {};
    const compile = () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      });
    const [unit] = castVfxProgramUnits(scene, null, host, webgl, compile);
    const run = unit.run();
    expect(readiness.ready()).toBe(false);
    settle();
    await run;
    expect(readiness.ready()).toBe(true);
  });

  it('opens over Points, line and Sprite pools once their units settled, never by the deadline', async () => {
    // A class pool is not only meshes (wisp points, lash lines, glow sprites):
    // a proof walk that saw meshes alone left these pending until the gate
    // was forced open.
    const { scene, host, webgl, readiness, programs } = harness([]);
    const drawables: Array<THREE.Points | THREE.LineSegments | THREE.Sprite> = [
      new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial()),
      new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()),
      new THREE.Sprite(new THREE.SpriteMaterial()),
    ];
    for (const drawable of drawables) {
      drawable.userData.renderCategory = 'vfx';
      scene.add(drawable);
      programs.set(drawable.material as THREE.Material, program());
    }
    const units = castVfxProgramUnits(scene, null, host, webgl, () => Promise.resolve());
    expect(units).toHaveLength(3);
    expect(readiness.ready()).toBe(false);
    await Promise.all(units.map((unit) => unit.run()));
    expect(readiness.snapshot()).toMatchObject({ ready: true, pending: 0, forced: false });
  });

  it('compiles two clones on one program as one unit, and opens on that one proof', async () => {
    // A pool clones one material per slot. three hands the second clone the
    // program the first linked (same cache key, acquireProgram returns the
    // existing WebGLProgram), so the clone never needs its own link and the
    // gate must not wait for a currentProgram it will only get at first draw.
    const proto = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const clone = proto.clone();
    clone.color.setHex(0xff2040);
    const first = vfxMesh('slot-0', proto);
    const second = vfxMesh('slot-1', clone);
    const { scene, host, webgl, readiness, programs } = harness([first, second]);
    const shared = program();
    programs.set(proto, shared);
    let settle: () => void = () => {};
    const units = castVfxProgramUnits(
      scene,
      null,
      host,
      webgl,
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    expect(units.map((unit) => unit.roots)).toEqual([[first]]);
    const run = units[0].run();
    // Held while the shared program is not proved.
    expect(readiness.ready()).toBe(false);
    expect(readiness.snapshot().pending).toBe(1);
    settle();
    await run;
    expect(readiness.snapshot()).toMatchObject({ ready: true, pending: 0, forced: false });
  });

  it('keeps two programs apart: each holds the gate until its own unit settles', async () => {
    const opaque = vfxMesh('opaque');
    const transparent = vfxMesh('glow', new THREE.MeshBasicMaterial({ transparent: true }));
    const { scene, host, webgl, readiness, programs, materialOf } = harness([opaque, transparent]);
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    points.userData.renderCategory = 'vfx';
    scene.add(points);
    for (const material of [materialOf(opaque), materialOf(transparent), points.material]) {
      programs.set(material as THREE.Material, program());
    }
    const units = castVfxProgramUnits(scene, null, host, webgl, () => Promise.resolve());
    expect(units.map((unit) => unit.roots?.[0])).toEqual([opaque, transparent, points]);
    await units[0].run();
    await units[2].run();
    // The transparent program is the one really unlinked: it holds the gate.
    expect(readiness.ready()).toBe(false);
    expect(readiness.snapshot().pending).toBe(1);
    await units[1].run();
    expect(readiness.snapshot()).toMatchObject({ ready: true, pending: 0, forced: false });
  });

  it('records nothing for a compile that failed: an unseen link is not a proof', async () => {
    const mesh = vfxMesh('ring');
    const { scene, host, webgl, readiness, programs, materialOf } = harness([mesh]);
    programs.set(materialOf(mesh), program());
    const [unit] = castVfxProgramUnits(scene, null, host, webgl, () =>
      Promise.reject(new Error('lost')),
    );
    await expect(unit.run()).rejects.toThrow('lost');
    expect(readiness.ready()).toBe(false);
  });

  it('answers with the PROGRAM the record proved, not with the material', () => {
    // The record answers per program while the gate asks per material, so a
    // boolean would be an answer about a program that can already be gone.
    const ready = vfxMesh('ring');
    const pending = vfxMesh('decal', new THREE.MeshBasicMaterial({ transparent: true }));
    const h = harness([ready, pending]);
    const proved = program();
    markProgramReady(proved);
    h.programs.set(h.materialOf(ready), proved);
    h.programs.set(h.materialOf(pending), program());
    for (let i = 0; i < 5; i++) expect(h.readiness.ready()).toBe(false);
    expect(h.readiness.snapshot().pending).toBe(1);
  });

  it('re-closes on a program the record has not proved, however the earlier one answered', () => {
    // three repoints `currentProgram` on a key change or a clone. A gate
    // latched on the MATERIAL would keep answering for the program that is
    // gone and let a cast draw on one still in flight.
    const ring = vfxMesh('ring');
    const decal = vfxMesh('decal', new THREE.MeshBasicMaterial({ transparent: true }));
    const h = harness([ring, decal]);
    const a = program();
    markProgramReady(a);
    h.programs.set(h.materialOf(ring), a);
    const decalProgram = program();
    h.programs.set(h.materialOf(decal), decalProgram);
    // Ring answered on A; the gate is still shut on the other material.
    expect(h.readiness.ready()).toBe(false);
    expect(h.readiness.snapshot().pending).toBe(1);

    // Ring is handed B, which no settle has proved: pending again.
    const b = program();
    h.programs.set(h.materialOf(ring), b);
    expect(h.readiness.ready()).toBe(false);
    expect(h.readiness.snapshot().pending).toBe(2);

    // B proved, and the gate opens once both answer.
    markProgramReady(b);
    expect(h.readiness.ready()).toBe(false);
    markProgramReady(decalProgram);
    expect(h.readiness.ready()).toBe(true);
  });
});

describe('the units the resume lane runs', () => {
  it('links through the colour arm by default, and marks the program on the settle', async () => {
    // The shipped arm, with no compile injected: the unit must reach
    // linkColorPrograms, which submits the root under each colour target the
    // tier covers and restores the ambient target, and the settle is what
    // writes the record the gate opens on.
    const mesh = vfxMesh('ring');
    const { scene, webgl, readiness, programs, materialOf } = harness([mesh]);
    const handle = program();
    programs.set(materialOf(mesh), handle);

    const compiled: Array<{ root: THREE.Object3D; target: THREE.WebGLRenderTarget | null }> = [];
    let current: THREE.WebGLRenderTarget | null = null;
    const offscreenTarget = {} as THREE.WebGLRenderTarget;
    let settle: (value: THREE.Object3D) => void = () => {};
    const armed = new Promise<THREE.Object3D>((resolve) => {
      settle = resolve;
    });
    const camera = new THREE.PerspectiveCamera();
    const host: CompileArmHost = {
      webgl: () => ({
        getRenderTarget: () => current,
        setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
          current = target;
        },
        compileAsync: (root: THREE.Object3D) => {
          compiled.push({ root, target: current });
          return armed;
        },
      }),
      camera: () => camera,
      scene: () => scene,
      shadowCamera: () => camera,
      // A direct tier: the canvas variant is its gameplay variant, and the
      // unit asks for no offscreen one.
      offscreen: () => false,
      offscreenTarget: () => offscreenTarget,
      depthMaterials: () => new Map(),
      shadowArm: () => false,
    };

    const [unit] = castVfxProgramUnits(scene, null, host, webgl);
    const run = unit.run();
    await Promise.resolve();
    // Submitted with the unit's own root, under the canvas target.
    expect(compiled).toEqual([{ root: mesh, target: null }]);
    expect(unit.roots).toEqual([mesh]);
    // Nothing is proved until that compile settles.
    expect(readiness.ready()).toBe(false);

    settle(scene);
    await run;
    // The ambient target is back, and the settle wrote the record.
    expect(current).toBeNull();
    expect(readiness.ready()).toBe(true);
  });

  it('compiles the program variant the world pass draws, on every tier', async () => {
    // three keys tone mapping and the output colour space on the bound target
    // (none and linear into any target), so a unit compiling the canvas variant
    // under a composer's scene pass would leave every never-compiled clone to
    // link live under a ready gate. The renderer builds `post` exactly on the
    // composer or grade tiers, draws the world through it (its scene pass
    // renders into the composer target), and hands the arm offscreen = !!post.
    const renderer = stripComments(readFileSync('src/render/renderer.ts', 'utf8'));
    expect(renderer).toContain(
      'if (GFX.composer || GFX.gradePass)\n      this.post = buildComposer(',
    );
    expect(renderer).toContain('offscreen: () => !!this.post,');
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    const mesh = vfxMesh('ring', material);
    const composerTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const keyAt = (target: THREE.WebGLRenderTarget | null) =>
      threeProgramKeys(material, mesh, target);
    expect(keyAt(composerTarget), 'the two variants are two programs').not.toBe(keyAt(null));
    for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
      const { composer, gradePass } = desktopTierProfile(tier).settings;
      expect(composer || gradePass, `${tier} draws into a target`).toBe(tier !== 'low');
      const { scene, webgl } = harness([mesh]);
      const bound: Array<THREE.WebGLRenderTarget | null> = [];
      let current: THREE.WebGLRenderTarget | null = null;
      const host = {
        webgl: () => ({
          getRenderTarget: () => current,
          setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
            current = target;
          },
          compileAsync: (root: THREE.Object3D) => {
            bound.push(current);
            return Promise.resolve(root);
          },
        }),
        camera: () => new THREE.PerspectiveCamera(),
        scene: () => scene,
        offscreen: () => composer || gradePass,
        offscreenTarget: () => new THREE.WebGLRenderTarget(8, 8),
      } as unknown as CompileArmHost;
      await Promise.all(castVfxProgramUnits(scene, null, host, webgl).map((unit) => unit.run()));
      const drawn = keyAt(composer || gradePass ? composerTarget : null);
      expect(bound.map(keyAt), tier).toEqual([drawn]);
    }
  });
});
