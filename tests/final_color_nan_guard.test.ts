import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installFinalColorNanGuard } from '../src/render/final_color_nan_guard';

describe('installFinalColorNanGuard', () => {
  it('installs itself as an import side effect, before any test here calls it explicitly', () => {
    // This file's own top-level import above is the only thing that has run
    // so far; nothing in this test calls installFinalColorNanGuard first, yet
    // the shared THREE.ShaderChunk is already patched.
    expect(THREE.ShaderChunk.opaque_fragment).toContain('WOC_OPAQUE_NAN_GUARD');
    expect(THREE.ShaderChunk.fog_fragment).toContain('WOC_FOG_NAN_GUARD');
  });

  it('reports unchanged calling the default (THREE.ShaderChunk) form again: already installed', () => {
    expect(installFinalColorNanGuard()).toBe(false);
  });

  it('detects a change when either chunk differs, and is idempotent on a synthetic source pair', () => {
    // Independent of THREE.ShaderChunk's real (already-patched) state: minimal
    // stand-ins containing just the anchor each core patch function requires.
    const chunks = {
      opaque_fragment: 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
      fog_fragment: 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
    };
    const changed = installFinalColorNanGuard(chunks);
    expect(changed).toBe(true);
    expect(chunks.opaque_fragment).toContain('WOC_OPAQUE_NAN_GUARD');
    expect(chunks.fog_fragment).toContain('WOC_FOG_NAN_GUARD');

    const changedAgain = installFinalColorNanGuard(chunks);
    expect(changedAgain).toBe(false);
  });
});

describe('installFinalColorNanGuard call sites', () => {
  it('module scope installs unconditionally, so no renderer construction site has to remember to', () => {
    // characters/preview.ts, characters/portrait.ts and armory_preview.ts each
    // build their own WebGLRenderer and never call initGfxTier; a per-site call
    // was tried and missed two of those three. The last statement in the
    // module is the bare, unconditional install call: importing this module
    // anywhere in the game client's static import graph (it is, via gfx.ts,
    // itself imported from main.ts) is what covers all of them.
    const source = readFileSync(
      new URL('../src/render/final_color_nan_guard.ts', import.meta.url),
      'utf8',
    );
    const lastStatement = source
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('//'))
      .at(-1);
    expect(lastStatement).toBe('installFinalColorNanGuard();');
  });

  it('gfx.ts imports final_color_nan_guard.ts for the module-scope install, and never calls it directly', () => {
    // gfx.ts is what every renderer in this codebase reaches, directly or
    // transitively (world renderer, CharacterPreview, character portraits,
    // armory preview, the guide viewer, the editor's asset thumbnails, the
    // outfit-audit dev tool): a bare import here is what actually gives all
    // of them the guard. installPbrPointLightShaderPruning is DIFFERENT: it
    // stays an explicit call inside initGfxTier on purpose (see the comment
    // there), since only the world renderer needs point-light pruning today.
    // A call here for the NaN guard would be provably dead code (the bare
    // import below, itself a static dependency of this file, always runs
    // first) with a comment implying otherwise; that was tried and reverted.
    const gfx = readFileSync(new URL('../src/render/gfx.ts', import.meta.url), 'utf8');
    expect(gfx).toMatch(/^import ['"]\.\/final_color_nan_guard['"];?\s*$/m);
    expect(gfx).not.toContain('installFinalColorNanGuard(');
  });

  it('the world renderer reaches gfx.ts (and so the guard) before it can compile or render', () => {
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const rendererCreated = renderer.indexOf('this.webgl = new THREE.WebGLRenderer');
    const rendererInit = renderer.indexOf('initGfxTier(this.webgl)', rendererCreated);
    const firstCompile = renderer.indexOf('this.webgl.compile', rendererCreated);
    const firstRender = renderer.indexOf('this.webgl.render', rendererCreated);

    expect(rendererCreated).toBeGreaterThanOrEqual(0);
    expect(rendererInit).toBeGreaterThan(rendererCreated);
    expect(firstCompile).toBeGreaterThan(rendererInit);
    expect(firstRender).toBeGreaterThan(rendererInit);
  });
});

describe('the #ifndef USE_FOG skip in patchOpaqueFragmentNanGuard depends on this holding', () => {
  it('every ShaderLib entry with <opaque_fragment> also has <fog_fragment>', () => {
    // final_color_nan_guard_core.ts skips the opaque arm's rgb scrub under
    // USE_FOG, relying on fog_fragment's guard to cover it instead. That is
    // only sound for a compiled program that includes BOTH chunks: a three
    // bump, or a repo ShaderMaterial, that pairs <opaque_fragment> with a
    // fogged scene but omits <fog_fragment> would silently lose the rgb
    // guard with no test failure and no visible symptom until a driver
    // emits a NaN. This walks every stock ShaderLib entry and pins the
    // coupling directly, rather than trusting it holds by inspection.
    const missingFog: string[] = [];
    for (const [name, shader] of Object.entries(THREE.ShaderLib)) {
      const hasOpaque = shader.fragmentShader.includes('#include <opaque_fragment>');
      const hasFog = shader.fragmentShader.includes('#include <fog_fragment>');
      if (hasOpaque && !hasFog) missingFog.push(name);
    }
    expect(missingFog).toEqual([]);
  });
});
