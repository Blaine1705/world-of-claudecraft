// The boot prewarm of the post-effect chain's full-screen programs.
//
// The measured defect (production 2026-08-18): sixteen never-compiled programs
// linked for 496.1 ms inside world.initial-frame, every row at `rootIndex -1,
// depth 0` (a full-screen quad), decoding to SMAA, N8AO, ScreenFxShader and
// OutputGradeShader. Nothing prewarmed them, because every other compile root
// in the manifest is a scene object and the composer's pass materials wear
// none.
//
// The pass shapes below mirror the pinned versions: three's ShaderPass and the
// repo's OutputGradePass expose `.material`; SMAAPass keeps three private
// material fields and one shared quad; UnrealBloomPass keeps an array of
// per-mip blur materials; n8ao keeps quad wrappers exposing `.material`.

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPostEffectPrewarmRoot,
  createPostEffectPrewarmLane,
  type PostEffectComposerLike,
  type PostEffectPassLike,
  postEffectChainMaterials,
  postEffectPassMaterials,
  postEffectScreenMaterials,
} from '../src/render/post_effect_prewarm';

const mat = (name: string): THREE.Material => {
  const material = new THREE.ShaderMaterial();
  material.name = name;
  return material;
};

/** A composer with the three pass shapes the live chain really carries. */
function fakePost(over: { enabled?: boolean[] } = {}): {
  post: PostEffectComposerLike;
  materials: Record<string, THREE.Material>;
} {
  const materials = {
    aoEffect: mat('ao-effect'),
    aoComposite: mat('ao-composite'),
    aoAccumulate: mat('ao-accumulate'),
    blurA: mat('blur-a'),
    blurB: mat('blur-b'),
    grade: mat('grade'),
    edges: mat('smaa-edges'),
    blend: mat('smaa-blend'),
  };
  const passes = [
    {
      // n8ao: quad wrappers exposing `.material`, plus the accumulation quad
      // the static pass disposes.
      effectShaderQuad: { material: materials.aoEffect },
      effectCompositerQuad: { material: materials.aoComposite },
      accumulationQuad: { material: materials.aoAccumulate },
      separableBlurMaterials: [materials.blurA, materials.blurB],
    },
    { material: materials.grade },
    { _materialEdges: materials.edges, _materialBlend: materials.blend },
  ].map((pass, index) => ({ ...pass, enabled: over.enabled?.[index] ?? true }));
  return { post: { composer: { passes } }, materials };
}

interface CompileCall {
  root: THREE.Object3D;
  target: THREE.WebGLRenderTarget | null;
}

function fakeHost(post: PostEffectComposerLike | null) {
  const calls: CompileCall[] = [];
  let bound: THREE.WebGLRenderTarget | null = null;
  const offscreen = new THREE.WebGLRenderTarget(8, 8);
  const webgl = {
    getRenderTarget: () => bound,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
      bound = target;
    },
    compileAsync: vi.fn((root: THREE.Object3D) => {
      calls.push({ root, target: bound });
      return Promise.resolve(root);
    }),
  };
  const lane = createPostEffectPrewarmLane({
    webgl: webgl as never,
    camera: new THREE.PerspectiveCamera(),
    scene: new THREE.Scene(),
    post: () => post,
    offscreenTarget: () => offscreen,
  });
  const drawn = (call: CompileCall): THREE.Material[] =>
    call.root.children.map((child) => (child as THREE.Mesh).material as THREE.Material);
  return { lane, calls, offscreen, drawn, boundAfter: () => bound };
}

describe('enumerating a pass', () => {
  it('finds a material, an array of them and a quad wrapper', () => {
    const { post, materials } = fakePost();
    expect(postEffectPassMaterials(post.composer.passes[1])).toEqual([materials.grade]);
    expect(postEffectPassMaterials(post.composer.passes[2])).toEqual([
      materials.edges,
      materials.blend,
    ]);
    const ao = postEffectPassMaterials(post.composer.passes[0]);
    expect(ao).toContain(materials.aoEffect);
    expect(ao).toContain(materials.aoComposite);
    expect(ao).toContain(materials.blurA);
    expect(ao).toContain(materials.blurB);
  });

  it('skips the accumulation quad, whose material the static pass disposes', () => {
    const { post, materials } = fakePost();
    expect(postEffectPassMaterials(post.composer.passes[0])).not.toContain(materials.aoAccumulate);
  });

  it('finds nothing on a pass that draws the real scene', () => {
    // RenderPass: a scene and a camera, no quad material of its own.
    const renderPass: PostEffectPassLike = { enabled: true, ...{ scene: new THREE.Scene() } };
    expect(postEffectPassMaterials(renderPass)).toEqual([]);
  });
});

describe('enumerating the chain', () => {
  it('collects every pass material once', () => {
    const { post, materials } = fakePost();
    const chain = postEffectChainMaterials(post);
    expect(chain).toHaveLength(7);
    expect(new Set(chain).size).toBe(chain.length);
    for (const key of ['aoEffect', 'aoComposite', 'blurA', 'blurB', 'grade', 'edges', 'blend']) {
      expect(chain).toContain(materials[key]);
    }
  });

  it('takes the LAST ENABLED pass for the screen variant', () => {
    const { post, materials } = fakePost();
    expect(postEffectScreenMaterials(post)).toEqual([materials.edges, materials.blend]);
    // Disable it and the pass before it becomes the one drawn to the canvas.
    const { post: withoutSmaa, materials: other } = fakePost({ enabled: [true, true, false] });
    expect(postEffectScreenMaterials(withoutSmaa)).toEqual([other.grade]);
  });

  it('is empty on a tier with no composer', () => {
    expect(postEffectChainMaterials(null)).toEqual([]);
    expect(postEffectScreenMaterials(null)).toEqual([]);
  });
});

describe('the prewarm root', () => {
  it('wears the LIVE materials, hidden and unculled', () => {
    const { materials } = fakePost();
    const root = buildPostEffectPrewarmRoot('post-effect:offscreen', [materials.grade]);
    expect(root.visible).toBe(false);
    const mesh = root.children[0] as THREE.Mesh;
    // Never a clone: a clone drops onBeforeCompile and links its own program.
    expect(mesh.material).toBe(materials.grade);
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.geometry.getAttribute('position')).toBeDefined();
  });
});

describe('the prewarm lane', () => {
  it('submits every pass material once, at the offscreen target', async () => {
    const { post, materials } = fakePost();
    const { lane, calls, offscreen, drawn } = fakeHost(post);
    await lane.run();

    expect(calls).toHaveLength(2);
    expect(calls[0].target).toBe(offscreen);
    const submitted = drawn(calls[0]);
    expect(submitted).toHaveLength(7);
    expect(new Set(submitted).size).toBe(7);
    expect(submitted).toContain(materials.aoEffect);
    expect(submitted).not.toContain(materials.aoAccumulate);
  });

  it('submits the screen pass again with the canvas bound', async () => {
    const { post, materials } = fakePost();
    const { lane, calls, drawn } = fakeHost(post);
    await lane.run();
    expect(calls[1].target).toBeNull();
    expect(drawn(calls[1])).toEqual([materials.edges, materials.blend]);
  });

  it('restores the render target it found bound', async () => {
    const { post } = fakePost();
    const { lane, boundAfter } = fakeHost(post);
    await lane.run();
    expect(boundAfter()).toBeNull();
  });

  it('reports what it warmed, and runs as resumable units', async () => {
    const { post } = fakePost();
    const { lane, calls } = fakeHost(post);
    const units = lane.units();
    expect(units.map((unit) => unit.id)).toEqual(['post-effect:offscreen', 'post-effect:screen']);
    for (const unit of units) await unit.run();
    expect(calls).toHaveLength(2);
    expect(lane.detail()).toBe('programs=9');
  });

  it('does nothing at all on a tier with no composer', async () => {
    const { lane, calls } = fakeHost(null);
    expect(lane.units()).toEqual([]);
    await lane.run();
    expect(calls).toHaveLength(0);
    expect(lane.detail()).toBe('programs=0');
  });
});

describe('the manifest entry (source pins)', () => {
  const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');

  it('runs BEFORE world.initial-frame, which is what draws the chain', () => {
    const entry = renderer.indexOf("id: 'post.effect-programs',");
    const frame = renderer.indexOf("id: 'world.initial-frame',");
    expect(entry).toBeGreaterThan(0);
    expect(frame).toBeGreaterThan(0);
    // The manifest array literal IS the run order (orderedPrewarmIds only ever
    // moves programs.compile, which lands between these two).
    expect(entry).toBeLessThan(frame);
  });

  it('is the lane, wired on both arms', () => {
    const start = renderer.indexOf("        id: 'post.effect-programs',");
    const entry = renderer.slice(start, renderer.indexOf("\n        id: '", start + 30));
    expect(entry).toContain("category: 'post',");
    expect(entry).toContain('resumeUnits: postEffectLane.units,');
    expect(entry).toContain('run: postEffectLane.run,');
    expect(renderer).toContain('const postEffectLane = createPostEffectPrewarmLane({');
    // The composer is read LATE: a graphics-settings change rebuilds it.
    expect(renderer).toContain('post: () => this.post,');
  });
});
