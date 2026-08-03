// The near-camera paint fade (meadow_tuning.ts GRASS_PAINT_NEAR_*): underfoot
// the near splat terrain must show the PLAIN grass layer, not the baked blade
// artwork, and the swap must not move the meadow's average colour. The far
// tiles must stay distance-free: they are never seen this close, and their
// mip-averaged meadow is what the near ground has to keep matching.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  GRASS_PAINT_GAIN,
  GRASS_PAINT_NEAR_END,
  GRASS_PAINT_NEAR_START,
} from '../src/render/meadow_tuning';

interface FakeShader {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

const BAKE_MEAN: [number, number, number] = [0.41, 0.47, 0.29];

// Compile the splat material for one preset with the ground bake installed.
// The bake singleton and the terrain module must come from the SAME module
// graph, so both are imported after the reset.
async function compileWithBake(preset: string): Promise<FakeShader> {
  vi.resetModules();
  vi.stubGlobal('location', { search: `?gfx=${preset}` });
  const { setGrassGroundBake } = await import('../src/render/grass_ground_bake');
  setGrassGroundBake({ texture: new THREE.Texture(), mean: BAKE_MEAN });
  const { terrainInternalsForTest } = await import('../src/render/terrain');
  const shader: FakeShader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  terrainInternalsForTest
    .createSplatMaterial()
    .onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
  setGrassGroundBake(null);
  return shader;
}

beforeAll(() => {
  vi.doMock('../src/render/assets/loader', () => ({
    loadTexture: () => Promise.resolve(new THREE.Texture()),
  }));
  vi.doMock('../src/render/assets/preload', () => ({
    registerPreload: () => undefined,
    registerDeferredPreload: () => undefined,
  }));
  vi.doMock('../src/render/textures', () => ({
    groundDetailTexture: () => new THREE.Texture(),
    groundSplatMaps: () => ({}),
    macroNoiseTexture: () => new THREE.Texture(),
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../src/render/assets/loader');
  vi.doUnmock('../src/render/assets/preload');
  vi.doUnmock('../src/render/textures');
});

describe('near-camera paint fade window', () => {
  it('opens under a tight zoom and closes well before the blade band does', () => {
    expect(GRASS_PAINT_NEAR_START).toBeGreaterThan(0);
    // A long ramp is the point: a short one puts the whole handoff in one
    // narrow ring that travels with the player.
    expect(GRASS_PAINT_NEAR_END - GRASS_PAINT_NEAR_START).toBeGreaterThanOrEqual(8);
    // The paint must be back at full strength inside the near blade carpet,
    // so no ground is left carrying neither the paint nor real blades.
    expect(GRASS_PAINT_NEAR_END).toBeLessThan(24);
  });
});

// ultra takes the rich (combed, jittered) grass stack, medium the plain one:
// both emit the bake layer, so both have to emit the fade.
describe.each(['ultra', 'medium'] as const)('%s near terrain paint fade', (preset) => {
  let fragmentShader = '';
  let uniforms: Record<string, THREE.IUniform> = {};

  beforeAll(async () => {
    const shader = await compileWithBake(preset);
    fragmentShader = shader.fragmentShader;
    uniforms = shader.uniforms;
  });

  it('keys the fade off camera distance, over the tuned window', () => {
    expect(fragmentShader).toContain(
      `float wocPaintT = smoothstep(${GRASS_PAINT_NEAR_START.toFixed(1)}, ` +
        `${GRASS_PAINT_NEAR_END.toFixed(1)}, wocCamDist);`,
    );
    // wocCamDist is declared once, unconditionally, above the grass block:
    // the fade cannot compile on a tier that never emitted it.
    const camDistAt = fragmentShader.indexOf('float wocCamDist =');
    expect(camDistAt).toBeGreaterThan(-1);
    expect(camDistAt).toBeLessThan(fragmentShader.indexOf('float wocPaintT ='));
  });

  it('hands the near ground to the plain splat layer, level-matched to the bake mean', () => {
    expect(fragmentShader).toContain('grassAlb = mix(wocPlainAlb, grassAlb, wocPaintT);');
    // Divided by its OWN top mip (average exactly 1) and lifted to the bake's
    // measured mean: this is what keeps the average colour identical across
    // the ramp, so the band blades' sunk bases still match the ground.
    expect(fragmentShader).toContain(
      `vec3 wocPlainAlb = texture2D(uGrass, tuv).rgb * uGrassBakeMean
              / max(texture2D(uGrass, tuv, 20.0).rgb, vec3(1e-4));`,
    );
    // Two taps on the near band, no more: this runs on most of a meadow frame.
    const near = fragmentShader.slice(
      fragmentShader.indexOf('float wocPaintT'),
      fragmentShader.indexOf('grassAlb = mix(wocPlainAlb'),
    );
    expect(near.match(/texture2D\(/g) ?? []).toHaveLength(2);
    expect(fragmentShader).toContain('uniform vec3 uGrassBakeMean;');
    const mean = uniforms.uGrassBakeMean?.value as THREE.Vector3;
    expect([mean.x, mean.y, mean.z]).toEqual(BAKE_MEAN);
  });

  it('leaves the full-strength paint and the shader itself intact', () => {
    // Beyond the window the grass layer is the bake at the constructed gain,
    // exactly as before: the fade only replaces the near end.
    expect(fragmentShader).toContain(
      `vec3 alb = grassAlb * vtint * ${(GRASS_PAINT_GAIN / 2).toFixed(4)} * vSplatR.x`,
    );
    expect(fragmentShader.match(/{/g) ?? []).toHaveLength(
      (fragmentShader.match(/}/g) ?? []).length,
    );
  });
});

describe('far tiles keep a distance-free paint', () => {
  const source = readFileSync(new URL('../src/render/far_terrain.ts', import.meta.url), 'utf8');
  // The tiles' whole paint: the template literal that REPLACES their
  // '#include <color_fragment>' hook (the backtick tells it apart from the
  // plain-string search argument on the line above it).
  const at = source.indexOf('`#include <color_fragment>');
  const paint = source.slice(at + 1, source.indexOf('`', at + 1));

  it('gates the bake on the per-vertex grass weight and nothing else', () => {
    expect(at).toBeGreaterThan(-1);
    expect(paint).toContain('uGrassBake');
    expect(paint).toContain('GRASS_PAINT_GAIN');
    expect(paint).toContain('vGrassW);');
    // No camera term of any kind: the tiles start past the detail horizon,
    // and their mip-averaged meadow is the colour the near ground matches.
    for (const distanceTerm of ['smoothstep', 'cameraPosition', 'uFarCut', 'wocCamDist']) {
      expect(paint).not.toContain(distanceTerm);
    }
  });

  it('never reaches for the near-fade window', () => {
    expect(source).not.toContain('GRASS_PAINT_NEAR');
  });
});
