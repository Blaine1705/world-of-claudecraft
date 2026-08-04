import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NIGHT_LIGHT_DECLARATIONS,
  nightLightFragmentGlsl,
  nightLightStaticCount,
  nightLightUniforms,
  registerStaticNightLights,
  resetNightLightFieldForTest,
  updateNightLightField,
} from '../src/render/night_light_field';
import { NIGHT_LIGHT_SLOTS } from '../src/render/night_light_field_core';

// night_light_field: the Three half of the field (registry, uniforms, GLSL).
// A shader cannot compile in Node, so what gets pinned is what a unit test CAN
// hold: the uniform contract between the strings and the objects, the known
// GLSL traps, and the source seams in terrain.ts and renderer.ts that a
// refactor could silently drop (the day_night.test.ts pin idiom).

describe('the GLSL strings', () => {
  it('declares exactly the uniforms the uniform block installs', () => {
    for (const name of Object.keys(nightLightUniforms())) {
      expect(NIGHT_LIGHT_DECLARATIONS).toContain(name);
    }
    expect(NIGHT_LIGHT_DECLARATIONS).toContain(`[${NIGHT_LIGHT_SLOTS}]`);
  });

  it('loops a compile-time constant bound and exits on the live count', () => {
    const glsl = nightLightFragmentGlsl('vWPos.xyz');
    expect(glsl).toContain(`for (int i = 0; i < ${NIGHT_LIGHT_SLOTS}; i++)`);
    expect(glsl).toContain('if (i >= uNightLightCount) break;');
    expect(glsl).toContain('vWPos.xyz');
  });

  it('avoids the ES 3.00 reserved words that kill promoted shaders silently', () => {
    // "sample" and "patch" are reserved in GLSL ES 3.00: a shader that uses
    // them compiles nothing, with zero errors surfaced under KHR parallel
    // compile. Guarded here because it has shipped broken before.
    const source = NIGHT_LIGHT_DECLARATIONS + nightLightFragmentGlsl('vWPos.xyz');
    expect(source).not.toMatch(/\bsample\b/);
    expect(source).not.toMatch(/\bpatch\b/);
  });

  it('contributes irradiance to the material lighting, never a post-tonemap add', () => {
    // The harsh look this replaced WAS the post-tonemap add: it tinted the
    // ground uniformly instead of multiplying with the albedo under it.
    const glsl = nightLightFragmentGlsl('vWPos.xyz');
    expect(glsl).toContain('reflectedLight.directDiffuse +=');
    expect(glsl).toContain('BRDF_Lambert(diffuseColor.rgb)');
    expect(glsl).not.toContain('gl_FragColor');
  });

  it('lights against the surface normal with the punctual falloff', () => {
    const glsl = nightLightFragmentGlsl('vWPos.xyz');
    expect(glsl).toContain('inverseTransformDirection(normal, viewMatrix)');
    // three's own point-light curve, stated in SQUARED distance: pow4(d / r)
    // is pow2(d2 / r2), and the attenuation divides by d2 either way, so the
    // window and the falloff need no root at all.
    expect(glsl).toContain('float wocNLDist2 = dot(wocNLTo, wocNLTo);');
    expect(glsl).toContain('pow2(saturate(1.0 - pow2(wocNLDist2 / wocNLCutoff2)))');
    expect(glsl).toContain('wocNLWin / max(wocNLDist2, 0.01)');
    // the one root left is the lambert direction, and it is INSIDE the range
    // branch: a light the fragment is out of range of never pays for it, which
    // is what keeps a wide slot window affordable
    expect(glsl).toContain('inversesqrt(');
    expect(glsl.indexOf('inversesqrt(')).toBeGreaterThan(glsl.indexOf('if (wocNLDist2 <'));
    expect(glsl).not.toContain('length(wocNLTo)');
  });
});

describe('the registry and the frame update', () => {
  it('accumulates static sites per owner and packs them into the shared uniforms', () => {
    resetNightLightFieldForTest();
    registerStaticNightLights('streetlamps', [
      { x: 10, y: 6, z: 20, radius: 11, r: 1, g: 0.6, b: 0.3, intensity: 2 },
    ]);
    registerStaticNightLights('ember-pools', [
      { x: -30, y: 2, z: 5, radius: 9, r: 1, g: 0.5, b: 0.2, intensity: 2.6 },
    ]);
    expect(nightLightStaticCount()).toBe(2);
    // a rebuilt scene registers again under the same owner: REPLACED, not stacked
    registerStaticNightLights('streetlamps', [
      { x: 11, y: 6, z: 21, radius: 11, r: 1, g: 0.6, b: 0.3, intensity: 2 },
    ]);
    expect(nightLightStaticCount()).toBe(2);
    // updateNightLightField refuses to run while inactive (the compile gate
    // never spliced a consumer), so the uniforms stay at their zero state.
    updateNightLightField(0, 0, 1, 1, 0, [], 0);
    const uniforms = nightLightUniforms();
    expect((uniforms.uNightLightCount as { value: number }).value).toBe(0);
    resetNightLightFieldForTest();
  });
});

describe('the consumer seams (source pins)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('terrain splices the field into the splat material at the lighting anchor', () => {
    const terrain = read('../src/render/terrain.ts');
    expect(terrain).toContain('const nightLights = hasNightLightField();');
    expect(terrain).toContain("nightLightFragmentGlsl('vWPos.xyz')");
    expect(terrain).toContain('NIGHT_LIGHT_DECLARATIONS');
    // inside the lighting resolve, not after tonemapping: that placement is
    // what makes lamplight interact with the ground instead of painting it
    expect(terrain).toContain("'#include <lights_fragment_end>'");
  });

  it('the renderer decides the field before terrain compiles and drives it per frame', () => {
    const renderer = read('../src/render/renderer.ts');
    expect(renderer).toContain('ensureNightLightField();');
    expect(renderer).toContain('updateNightLightField(');
    expect(renderer).toContain("this.fogState === 'outdoor' ? lampGlow : 0,");
    expect(renderer).toContain('collectBodyNightLights(');
  });

  it('the fallback layers stand down where the field runs', () => {
    // Streetlamps no longer blend a decal under the real light: where the field
    // runs, no pool is BUILT at all, so the lamp is a light source and nothing
    // else. The sprite survives only on the tier that cannot splice the field.
    const streetlamps = read('../src/render/streetlamps.ts');
    expect(streetlamps).toContain('const fieldActive = hasNightLightField()');
    expect(streetlamps).toContain(
      "const usePools = typeof document !== 'undefined' && !fieldActive",
    );
    // and the pool opacity no longer carries a field-present blend factor
    expect(streetlamps).not.toContain('fieldActive ? 0.52 : 1');
    expect(read('../src/render/camp_braziers.ts')).toContain('!hasNightLightField()');
    expect(read('../src/render/ember_pools.ts')).toContain('hasNightLightField()');
    expect(read('../src/render/renderer.ts')).toContain('hasNightLightField() ? 0 : bodyGlow');
  });
});
