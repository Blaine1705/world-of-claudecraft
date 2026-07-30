import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const disabledLayers = new Set<string>();
const gfxSettings = vi.hoisted(() => ({
  ao: true,
  aoFullRes: true,
  bloom: true,
  composer: true,
  msaaSamples: 4,
  smaa: false,
}));

vi.mock('../src/render/gfx', () => ({
  GFX: gfxSettings,
  sharedUniforms: {
    uTime: { value: 0 },
  },
}));

vi.mock('../src/render/render_dev_flags', () => ({
  renderLayerDisabled: (name: string) => disabledLayers.has(name),
}));

function rendererStub(): THREE.WebGLRenderer {
  return {
    capabilities: { isWebGL2: true },
    getDrawingBufferSize: (out: THREE.Vector2) => out.set(1280, 720),
    getPixelRatio: () => 1,
  } as unknown as THREE.WebGLRenderer;
}

interface N8AOInternals {
  beautyRenderTarget: THREE.WebGLRenderTarget;
  writeTargetInternal: THREE.WebGLRenderTarget;
  readTargetInternal: THREE.WebGLRenderTarget;
  accumulationRenderTarget: THREE.WebGLRenderTarget;
  effectCompositerQuad: {
    material: THREE.ShaderMaterial;
  };
  transparencyRenderTargetDWFalse?: THREE.WebGLRenderTarget | null;
  transparencyRenderTargetDWTrue?: THREE.WebGLRenderTarget | null;
}

interface BloomInternals {
  renderTargetBright: THREE.WebGLRenderTarget;
  renderTargetsHorizontal: THREE.WebGLRenderTarget[];
  renderTargetsVertical: THREE.WebGLRenderTarget[];
  bloomTexture: THREE.Texture;
  compositeMaterial: THREE.ShaderMaterial;
}

describe('live post pipeline', () => {
  beforeEach(() => {
    disabledLayers.clear();
    gfxSettings.aoFullRes = true;
    gfxSettings.smaa = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructs the insane chain with one composer buffer and the pinned pass order', async () => {
    const { buildComposer } = await import('../src/render/post');
    const post = buildComposer(
      rendererStub(),
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      1280,
      720,
    );

    expect(post.composer.passes.map((pass) => pass.constructor.name)).toEqual([
      'StaticOpaqueN8AOPass',
      'PreparedBloomPass',
      'OutputGradePass',
    ]);
    expect(post.composer.renderTarget1).toBe(post.composer.renderTarget2);
    expect(post.composer.renderTarget1.samples).toBe(0);
    expect(post.composer.renderTarget1.depthBuffer).toBe(false);
    expect(post.composer.renderTarget1.resolveDepthBuffer).toBe(true);

    const ao = post.ao as unknown as N8AOInternals;
    expect(ao.beautyRenderTarget.width).toBe(1280);
    expect(ao.beautyRenderTarget.height).toBe(720);
    expect(ao.beautyRenderTarget.texture.type).toBe(THREE.HalfFloatType);
    expect(ao.beautyRenderTarget.depthTexture?.type).toBe(THREE.UnsignedIntType);
    expect(ao.beautyRenderTarget.resolveDepthBuffer).toBe(true);
    expect(ao.writeTargetInternal.texture.type).toBe(THREE.UnsignedByteType);
    expect(ao.readTargetInternal.texture.type).toBe(THREE.UnsignedByteType);
    expect(ao.accumulationRenderTarget).toBe(ao.writeTargetInternal);
    expect(ao.effectCompositerQuad.material.fragmentShader).toContain(
      'quantizeAccumulatedAo(texelFetch(tDiffuse, pixel, 0))',
    );
    expect(ao.transparencyRenderTargetDWFalse).toBeFalsy();
    expect(ao.transparencyRenderTargetDWTrue).toBeFalsy();

    const bloom = post.bloom as unknown as BloomInternals;
    expect(bloom.renderTargetBright.texture.type).toBe(THREE.HalfFloatType);
    expect(bloom.renderTargetsHorizontal).toHaveLength(5);
    expect(bloom.renderTargetsVertical).toHaveLength(5);
    expect(bloom.renderTargetBright).not.toBe(bloom.renderTargetsVertical[0]);
    expect(
      new Set([
        bloom.renderTargetBright,
        ...bloom.renderTargetsHorizontal,
        ...bloom.renderTargetsVertical,
      ]).size,
    ).toBe(11);
    expect(bloom.bloomTexture).toBe(bloom.renderTargetsHorizontal[0].texture);
    expect(post.grade.uniforms.tBloom.value).toBe(bloom.bloomTexture);
    expect(
      [
        bloom.renderTargetBright,
        ...bloom.renderTargetsHorizontal,
        ...bloom.renderTargetsVertical,
      ].every((target) => !target.depthBuffer),
    ).toBe(true);
    expect(bloom.renderTargetsHorizontal.map((target) => [target.width, target.height])).toEqual([
      [640, 360],
      [320, 180],
      [160, 90],
      [80, 45],
      [40, 23],
    ]);
    expect(bloom.compositeMaterial.fragmentShader).not.toContain('bloomTintColors');
    expect(
      bloom.compositeMaterial.fragmentShader.match(
        /lerpBloomFactor\(bloomFactors\[\d]\) \* texture2D/g,
      ),
    ).toHaveLength(5);
  });

  it('keeps medium MSAA on only the geometry target', async () => {
    const { buildComposer } = await import('../src/render/post');
    const post = buildComposer(
      rendererStub(),
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      1280,
      720,
      { gradeOnly: true },
    );

    expect(post.composer.passes.map((pass) => pass.constructor.name)).toEqual([
      'RenderPass',
      'OutputGradePass',
    ]);
    expect(post.composer.renderTarget1).toBe(post.composer.renderTarget2);
    expect(post.composer.renderTarget1.samples).toBe(4);
    expect(post.composer.renderTarget1.depthBuffer).toBe(true);
    expect(post.composer.renderTarget1.resolveDepthBuffer).toBe(false);
  });

  it('keeps high half-resolution AO depth available to every AO stage', async () => {
    gfxSettings.aoFullRes = false;
    gfxSettings.smaa = true;
    vi.stubGlobal('Image', class {});
    const { buildComposer } = await import('../src/render/post');
    const post = buildComposer(
      rendererStub(),
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      1280,
      720,
    );
    const ao = post.ao as unknown as N8AOInternals & {
      configuration: { halfRes: boolean };
    };

    expect(post.composer.renderTarget1).not.toBe(post.composer.renderTarget2);
    expect(post.composer.renderTarget1.resolveDepthBuffer).toBe(true);
    expect(post.composer.renderTarget2.resolveDepthBuffer).toBe(true);
    expect(ao.configuration.halfRes).toBe(true);
    expect(ao.beautyRenderTarget.depthTexture).toBeTruthy();
    expect(ao.beautyRenderTarget.resolveDepthBuffer).toBe(true);
  });
});
