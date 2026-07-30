import { N8AOPass } from 'n8ao';
import type { Camera, Scene, ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from 'three';

interface N8AOFullScreenTriangle {
  material: ShaderMaterial;
  render(renderer: WebGLRenderer): void;
}

interface N8AOStaticFrameInternals {
  writeTargetInternal: WebGLRenderTarget;
  accumulationRenderTarget: WebGLRenderTarget;
  accumulationQuad: N8AOFullScreenTriangle;
  effectShaderQuad?: N8AOFullScreenTriangle;
  poissonBlurQuad?: N8AOFullScreenTriangle;
  effectCompositerQuad: N8AOFullScreenTriangle;
  depthDownsampleTarget?: WebGLRenderTarget | null;
  depthDownsampleQuad?: N8AOFullScreenTriangle | null;
}

const noClearQuads = new WeakSet<N8AOFullScreenTriangle>();

const ACCUMULATION_QUANTIZE_SHADER = /* glsl */ `
    vec4 quantizeAccumulatedAo(vec4 value) {
      vec2 rg = unpackHalf2x16(packHalf2x16(value.rg));
      vec2 ba = unpackHalf2x16(packHalf2x16(vec2(value.b, 1.0)));
      return vec4(rg, ba);
    }

    vec4 sampleAccumulatedAo(vec2 uv) {
      return quantizeAccumulatedAo(texture2D(tDiffuse, uv));
    }

    vec4 fetchAccumulatedAo(ivec2 pixel) {
      return quantizeAccumulatedAo(texelFetch(tDiffuse, pixel, 0));
    }
`;

function replacePinned(source: string, from: string, to: string, expected: number): string {
  const count = source.split(from).length - 1;
  if (count !== expected) {
    throw new Error(
      `Pinned n8ao 1.10.3 shader changed at "${from}" (${count}, expected ${expected})`,
    );
  }
  return source.split(from).join(to);
}

function preserveAccumulationQuantization(material: ShaderMaterial): void {
  let shader = material.fragmentShader;
  shader = replacePinned(
    shader,
    'vec4 texel = texture2D(tDiffuse, vUv);',
    'vec4 texel = sampleAccumulatedAo(vUv);',
    3,
  );
  shader = replacePinned(
    shader,
    'texel = texture2D(tDiffuse, vUv);',
    'texel = sampleAccumulatedAo(vUv);',
    1,
  );
  shader = replacePinned(shader, 'texelFetch(tDiffuse, p, 0)', 'fetchAccumulatedAo(p)', 1);
  shader = replacePinned(
    shader,
    '    void main() {',
    `${ACCUMULATION_QUANTIZE_SHADER}\n    void main() {`,
    1,
  );
  material.fragmentShader = shader;
  material.needsUpdate = true;
}

function suppressFullCoverageClear(quad: N8AOFullScreenTriangle | null | undefined): void {
  if (!quad || noClearQuads.has(quad)) return;
  const render = quad.render.bind(quad);
  quad.render = (renderer): void => {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      render(renderer);
    } finally {
      renderer.autoClear = oldAutoClear;
    }
  };
  noClearQuads.add(quad);
}

/**
 * The shipped static-frame path never enables N8AO temporal accumulation.
 * Its frame-zero accumulation draw is only an RGBA8 to RGBA16F copy with
 * alpha 1. The composite samples the final denoise target directly and
 * performs the same binary16 conversion in shader instead.
 */
export class StaticOpaqueN8AOPass extends N8AOPass {
  constructor(scene: Scene, camera: Camera, width: number, height: number) {
    super(scene, camera, width, height);
    if (this.configuration.accumulate || this.configuration.denoiseIterations !== 2) {
      throw new Error('Static N8AO path requires accumulation off and exactly two denoise passes');
    }

    const state = this as unknown as N8AOStaticFrameInternals;
    state.accumulationRenderTarget.dispose();
    state.accumulationRenderTarget = state.writeTargetInternal;
    state.accumulationQuad.material.dispose();
    state.accumulationQuad.render = () => {};
  }

  override detectTransparency(): void {
    // The shipped mode is transparencyAware=false. Overriding the virtual
    // constructor hook avoids two beauty targets and a depth-copy pass.
  }

  override configureAOPass(depthBufferType?: number, ortho?: boolean): void {
    super.configureAOPass(depthBufferType, ortho);
    const state = this as unknown as N8AOStaticFrameInternals;
    suppressFullCoverageClear(state.effectShaderQuad);
  }

  override configureDenoisePass(depthBufferType?: number, ortho?: boolean): void {
    super.configureDenoisePass(depthBufferType, ortho);
    const state = this as unknown as N8AOStaticFrameInternals;
    suppressFullCoverageClear(state.poissonBlurQuad);
  }

  override configureEffectCompositer(depthBufferType?: number, ortho?: boolean): void {
    super.configureEffectCompositer(depthBufferType, ortho);
    const state = this as unknown as N8AOStaticFrameInternals;
    preserveAccumulationQuantization(state.effectCompositerQuad.material);
    suppressFullCoverageClear(state.effectCompositerQuad);
  }

  override configureHalfResTargets(): void {
    super.configureHalfResTargets();
    const state = this as unknown as N8AOStaticFrameInternals;
    if (state.depthDownsampleTarget) state.depthDownsampleTarget.depthBuffer = false;
    suppressFullCoverageClear(state.depthDownsampleQuad);
  }
}
