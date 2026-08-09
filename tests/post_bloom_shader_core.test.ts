import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { describe, expect, it } from 'vitest';
import { restoreClassicBloomComposite } from '../src/render/post_bloom_shader_core';

const NUM_MIPS = 5;
// The real composite shader from the installed three, not a hand-written stand
// in. _getCompositeMaterial (r185's underscore-private spelling) does not read
// `this` and builds no GL resources, so a Node test can read the pinned source
// directly.
const INSTALLED_COMPOSITE: string = (
  UnrealBloomPass.prototype as unknown as {
    _getCompositeMaterial(nMips: number): { fragmentShader: string };
  }
)._getCompositeMaterial(NUM_MIPS).fragmentShader;

// Every mip factor multiplies its own FULL vec4 blurred sample (no .rgb
// truncation), whitespace aside: the r165-equivalent accumulation whose alpha
// OutputGradePass multiplies back in as bloom.rgb * bloom.a.
const FACTOR_TIMES_SAMPLE =
  /lerpBloomFactor\s*\(\s*bloomFactors\s*\[\s*\d\s*\]\s*\)\s*\*\s*texture2D\s*\(\s*blurTexture[1-5]\s*,\s*vUv\s*\)\s*(?!\.)/g;

// The composite body three shipped BEFORE r182, pinned verbatim from r165:
// full vec4 samples with identity tint multipliers and no 3.0 scale. The
// restore must fail closed on it (a downgrade or a fork would otherwise get
// the classic body spliced over a shape it does not have).
const R165_COMPOSITE = `
  uniform float bloomFactors[NUM_MIPS];
  uniform vec3 bloomTintColors[NUM_MIPS];

  float lerpBloomFactor(const in float factor) {
    float mirrorFactor = 1.2 - factor;
    return mix(factor, mirrorFactor, bloomRadius);
  }

  void main() {
    gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
      lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
      lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
      lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
      lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
  }
`;

describe('restoreClassicBloomComposite', () => {
  it('rebuilds the classic tint-free accumulation from the installed three composite', () => {
    const patched = restoreClassicBloomComposite(INSTALLED_COMPOSITE, NUM_MIPS);

    // The installed r185 shape carries every piece the restore must remove.
    expect(INSTALLED_COMPOSITE).toContain('bloomTintColors');
    expect(INSTALLED_COMPOSITE).toContain('3.0 * bloomStrength');
    expect(INSTALLED_COMPOSITE).toContain('bloomAlpha');

    expect(patched).not.toContain('bloomTintColors');
    expect(patched).not.toContain('3.0 * bloomStrength');
    expect(patched).not.toContain('bloomAlpha');
    expect(patched.match(FACTOR_TIMES_SAMPLE)).toHaveLength(NUM_MIPS);
    expect(patched).toContain('gl_FragColor = bloomStrength * (');
    // The helper the rebuilt body calls must survive the splice.
    expect(patched).toContain('float lerpBloomFactor');
  });

  it('tolerates whitespace inside the pinned shipped terms', () => {
    const respaced = INSTALLED_COMPOSITE.replace(
      /bloomTintColors\[ (\d) \]/g,
      'bloomTintColors[$1]',
    ).replace(/texture2D\( (blurTexture\d), vUv \)/g, 'texture2D($1 , vUv )');
    expect(respaced).not.toEqual(INSTALLED_COMPOSITE);

    const patched = restoreClassicBloomComposite(respaced, NUM_MIPS);

    expect(patched).not.toContain('bloomTintColors');
    expect(patched.match(FACTOR_TIMES_SAMPLE)).toHaveLength(NUM_MIPS);
  });

  it('fails closed on the pre-r182 composite instead of splicing over it', () => {
    expect(() => restoreClassicBloomComposite(R165_COMPOSITE, NUM_MIPS)).toThrow(
      'Pinned UnrealBloom composite shader shape changed (composite main body)',
    );
  });

  it('fails closed when the tint uniform declaration is absent', () => {
    const withoutUniform = INSTALLED_COMPOSITE.replace(
      'uniform vec3 bloomTintColors[NUM_MIPS];',
      '',
    );

    expect(() => restoreClassicBloomComposite(withoutUniform, NUM_MIPS)).toThrow(
      'Pinned UnrealBloom composite shader shape changed (tint uniform declaration)',
    );
  });

  it('fails closed when a shipped mip term is missing', () => {
    const truncated = INSTALLED_COMPOSITE.replace(
      /lerpBloomFactor\( bloomFactors\[ 3 \] \) \* bloomTintColors\[ 3 \] \* texture2D\( blurTexture4, vUv \)\.rgb \+\s*/,
      '',
    );
    expect(truncated).not.toEqual(INSTALLED_COMPOSITE);

    expect(() => restoreClassicBloomComposite(truncated, NUM_MIPS)).toThrow(
      'Pinned UnrealBloom composite shader shape changed (composite main body)',
    );
  });

  it('fails closed when the alpha derivation changes', () => {
    const changedAlpha = INSTALLED_COMPOSITE.replace(
      'float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );',
      'float bloomAlpha = 1.0;',
    );
    expect(changedAlpha).not.toEqual(INSTALLED_COMPOSITE);

    expect(() => restoreClassicBloomComposite(changedAlpha, NUM_MIPS)).toThrow(
      'Pinned UnrealBloom composite shader shape changed (composite main body)',
    );
  });
});
