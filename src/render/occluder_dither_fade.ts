// PROTOTYPE, behind `?ghostfade=dither`: a camera-ghost fade that never flips
// `transparent`.
//
// The shipped fade (occluder_fade.ts) turns a structure's materials transparent,
// and three keys a second program on that flip, so every hideable material owns
// a transparent twin: about a sixth of the compile cost measured on Windows
// D3D11. This variant keeps the material OPAQUE and drops fragments instead, on
// a 4x4 ordered (Bayer) screen-door pattern driven by one uniform. One program
// per material, no twin, no gate, no prewarm group.
//
// What it costs, so the trade is judged honestly: the look changes (a stipple
// instead of a smooth blend), and the `discard` sits in the material's one
// program for good, faded or not, which takes early depth rejection away from
// every hideable surface on GPUs that rely on it.
import type * as THREE from 'three';

const PROGRAM_CACHE_KEY = 'ghost-dither-fade-v1';
const ANCHOR = '#include <clipping_planes_fragment>';
const UNIFORM_SLOT = 'ghostDitherFade';

let enabled: boolean | null = null;

/** Read once: the mode is a page-load choice, never a per-frame one. */
export function ditherFadeEnabled(): boolean {
  if (enabled === null) {
    const search = typeof location === 'undefined' ? '' : location.search;
    enabled = new URLSearchParams(search).get('ghostfade') === 'dither';
  }
  return enabled;
}

export function setDitherFadeEnabledForTest(value: boolean | null): void {
  enabled = value;
}

const DITHER_GLSL = `${ANCHOR}
  if ( uGhostFade < 1.0 ) {
    // 4x4 Bayer matrix, thresholds centred in their cells so a fade of 0 drops
    // every fragment and a fade of 1 (guarded above) keeps them all.
    ivec2 ghostCell = ivec2( mod( gl_FragCoord.xy, 4.0 ) );
    int ghostIndex = ghostCell.x + ghostCell.y * 4;
    float ghostBayer[16] = float[16](
      0.0, 8.0, 2.0, 10.0,
      12.0, 4.0, 14.0, 6.0,
      3.0, 11.0, 1.0, 9.0,
      15.0, 7.0, 13.0, 5.0
    );
    if ( uGhostFade <= ( ghostBayer[ ghostIndex ] + 0.5 ) / 16.0 ) discard;
  }`;

interface FadeUniform {
  value: number;
}

/** The fade uniform a decorated material owns, or null when undecorated. */
export function ditherFadeUniform(material: THREE.Material): FadeUniform | null {
  return (material.userData as { [UNIFORM_SLOT]?: FadeUniform })[UNIFORM_SLOT] ?? null;
}

/** Chain the screen-door layer onto a hideable material. Idempotent. */
export function attachDitherFade(material: THREE.Material): void {
  if (ditherFadeUniform(material)) return;
  const uniform: FadeUniform = { value: 1 };
  (material.userData as { [UNIFORM_SLOT]?: FadeUniform })[UNIFORM_SLOT] = uniform;
  const previousCompile = material.onBeforeCompile.bind(material);
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    shader.uniforms.uGhostFade = uniform;
    shader.fragmentShader = `uniform float uGhostFade;\n${shader.fragmentShader}`.replace(
      ANCHOR,
      DITHER_GLSL,
    );
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|${PROGRAM_CACHE_KEY}`;
  material.needsUpdate = true;
}
