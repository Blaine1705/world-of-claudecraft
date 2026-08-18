// Boot prewarm for the POST-EFFECT chain's full-screen programs (SMAA, N8AO,
// the screen FX, the output grade).
//
// Every other compile root in the manifest is a scene object. The composer's
// passes are not: they draw a full-screen quad from materials nothing in the
// scene graph wears, so `compileAsync` over the world never reaches them and
// the prewarm's OWN settle render (world.initial-frame -> PostEffectComposer)
// is the first thing that ever draws them. Production 2026-08-18 measured that
// as sixteen never-compiled programs, 496.1 ms, every row at `rootIndex -1,
// depth 0`, inside the one initial frame.
//
// Two roots, because three keys a program on the bound target's output colour
// space:
//   - the OFFSCREEN root carries every pass material, compiled with a render
//     target bound (the working colour space every intermediate pass draws in);
//   - the SCREEN root carries the LAST enabled pass's materials, compiled with
//     the canvas bound, because that pass alone runs with `renderToScreen` and
//     its program is a different key from its offscreen twin. A pass that keeps
//     internal passes of its own (SMAA's edge and weight materials still draw
//     into the pass's own targets) pays one redundant link there; two links
//     behind the loading cover is the price of not leaving the one material
//     that really draws to the canvas cold in the settle frame.
//
// The materials are the LIVE ones, never clones: a clone drops
// `onBeforeCompile` and links its own program (material_clone_hooks.ts), and
// the quad meshes here exist only to give `compileAsync` something to traverse.
// Nothing is disposed, because disposing a material releases the program this
// lane exists to keep.

import * as THREE from 'three';
import type { PrewarmResumeUnit } from './prewarm_resume';

/** Field names never probed for a material. `accumulationQuad` is n8ao's
 *  temporal-accumulation quad, whose material `StaticOpaqueN8AOPass` disposes
 *  at construction (its render is stubbed out), so linking it would resurrect
 *  a program the static path never draws. */
const SKIPPED_PASS_FIELDS: ReadonlySet<string> = new Set(['accumulationQuad']);

/** A composer pass, structurally: the enabled flag plus whatever material
 *  fields its class happens to carry. Kept shapeless on purpose, so the pinned
 *  three passes (`material`), SMAA (`_materialEdges` and friends), bloom
 *  (`separableBlurMaterials[]`) and n8ao (quads holding a `.material`) are all
 *  read the same way and a new pass needs no entry here. */
export interface PostEffectPassLike {
  enabled?: boolean;
}

/** The composer half of the renderer's post pipeline, structurally. */
export interface PostEffectComposerLike {
  composer: { passes: readonly PostEffectPassLike[] };
}

function isMaterial(value: unknown): value is THREE.Material {
  return (value as THREE.Material | null)?.isMaterial === true;
}

/**
 * Every material one pass can draw its quad with, found one level down over
 * the pass's own fields: a material, an array of materials (bloom's per-mip
 * blur set), or a quad wrapper exposing `.material` (three's FullScreenQuad
 * and n8ao's FullScreenTriangle both do, publicly).
 */
export function postEffectPassMaterials(pass: PostEffectPassLike): THREE.Material[] {
  const found: THREE.Material[] = [];
  for (const [key, value] of Object.entries(pass as unknown as Record<string, unknown>)) {
    if (SKIPPED_PASS_FIELDS.has(key)) continue;
    if (isMaterial(value)) {
      found.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) if (isMaterial(item)) found.push(item);
      continue;
    }
    const nested = (value as { material?: unknown } | null)?.material;
    if (isMaterial(nested)) found.push(nested);
  }
  return found;
}

/** Every material the whole chain can draw, deduped by identity, in pass
 *  order. An empty list on a tier with no composer. */
export function postEffectChainMaterials(post: PostEffectComposerLike | null): THREE.Material[] {
  if (!post) return [];
  const seen = new Set<THREE.Material>();
  for (const pass of post.composer.passes) {
    for (const material of postEffectPassMaterials(pass)) seen.add(material);
  }
  return [...seen];
}

/** The materials of the last ENABLED pass: the one the composer runs with
 *  `renderToScreen`, so the only one whose canvas variant is ever drawn. */
export function postEffectScreenMaterials(post: PostEffectComposerLike | null): THREE.Material[] {
  if (!post) return [];
  const enabled = post.composer.passes.filter((pass) => pass.enabled !== false);
  const last = enabled.at(-1);
  if (!last) return [];
  const seen = new Set<THREE.Material>(postEffectPassMaterials(last));
  return [...seen];
}

// One shared unit quad for every twin. The pass materials are ShaderMaterials
// and RawShaderMaterials with no maps and no vertex colours, and three reads a
// geometry into a program key only through those (tangents, vertex colours, the
// active uv channels), so one geometry links the same programs the passes' own
// full-screen quads do.
const QUAD_GEOMETRY = new THREE.PlaneGeometry(2, 2);

/** A hidden root wearing one quad per material, for `compileAsync`. */
export function buildPostEffectPrewarmRoot(
  name: string,
  materials: readonly THREE.Material[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.visible = false;
  group.userData.renderCategory = 'prewarm';
  for (const material of materials) {
    const mesh = new THREE.Mesh(QUAD_GEOMETRY, material);
    mesh.name = `${material.name || material.type}:${name}`;
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/** What the lane needs from the renderer. */
export interface PostEffectPrewarmHost {
  webgl: Pick<THREE.WebGLRenderer, 'getRenderTarget' | 'setRenderTarget' | 'compileAsync'>;
  camera: THREE.Camera;
  scene: THREE.Scene;
  /** Read late: the composer is rebuilt on a graphics-settings change. */
  post: () => PostEffectComposerLike | null;
  /** The offscreen target whose colour space the composer's passes draw in. */
  offscreenTarget: () => THREE.WebGLRenderTarget;
  /** Wall clock past which the lane stops AWAITING (never resubmits: the
   *  links are already in flight off-thread). Omitted means no bound. */
  awaitDeadlineMs?: () => number;
}

export interface PostEffectPrewarmLane {
  units(): readonly PrewarmResumeUnit[];
  run(): Promise<void>;
  detail(): string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * The manifest entry's lane: one unit per output variant, so a deadline drop
 * resumes them one at a time in the background instead of losing them.
 */
export function createPostEffectPrewarmLane(host: PostEffectPrewarmHost): PostEffectPrewarmLane {
  let warmed = 0;
  const compileAt = async (
    root: THREE.Group,
    target: THREE.WebGLRenderTarget | null,
  ): Promise<void> => {
    if (root.children.length === 0) return;
    const previous = host.webgl.getRenderTarget();
    let compilePromise: Promise<unknown>;
    try {
      // three reads the output colour space off the bound target inside
      // compileAsync's SYNCHRONOUS prologue; restore it before awaiting so a
      // live frame never inherits the prewarm target.
      host.webgl.setRenderTarget(target);
      compilePromise = host.webgl.compileAsync(root, host.camera, host.scene);
    } finally {
      host.webgl.setRenderTarget(previous);
    }
    const deadline = host.awaitDeadlineMs?.();
    if (deadline === undefined) await compilePromise;
    else await Promise.race([compilePromise, sleep(deadline - performance.now())]);
    warmed += root.children.length;
  };

  const unit = (
    id: string,
    materials: () => readonly THREE.Material[],
    target: () => THREE.WebGLRenderTarget | null,
  ): PrewarmResumeUnit => ({
    id,
    run: () => compileAt(buildPostEffectPrewarmRoot(id, materials()), target()),
  });

  const units = (): readonly PrewarmResumeUnit[] =>
    host.post()
      ? [
          unit(
            'post-effect:offscreen',
            () => postEffectChainMaterials(host.post()),
            host.offscreenTarget,
          ),
          unit(
            'post-effect:screen',
            () => postEffectScreenMaterials(host.post()),
            () => null,
          ),
        ]
      : [];

  return {
    units,
    run: async () => {
      for (const entry of units()) await entry.run();
    },
    detail: () => `programs=${warmed}`,
  };
}
