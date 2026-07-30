import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const disabledLayers = new Set<string>();

vi.mock('../src/render/gfx', () => ({
  GFX: {
    ao: true,
    aoFullRes: true,
    bloom: true,
    composer: true,
    msaaSamples: 4,
    smaa: false,
  },
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
  transparencyRenderTargetDWFalse?: THREE.WebGLRenderTarget | null;
  transparencyRenderTargetDWTrue?: THREE.WebGLRenderTarget | null;
}

interface BloomInternals {
  renderTargetBright: THREE.WebGLRenderTarget;
  renderTargetsHorizontal: THREE.WebGLRenderTarget[];
  renderTargetsVertical: THREE.WebGLRenderTarget[];
}

describe('live post pipeline', () => {
  beforeEach(() => {
    disabledLayers.clear();
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
      'OpaqueCompositeN8AOPass',
      'UnrealBloomPass',
      'OutputGradePass',
    ]);
    expect(post.composer.renderTarget1).toBe(post.composer.renderTarget2);
    expect(post.composer.renderTarget1.samples).toBe(0);
    expect(post.composer.renderTarget1.depthBuffer).toBe(false);

    const ao = post.ao as unknown as N8AOInternals;
    expect(ao.beautyRenderTarget.width).toBe(1280);
    expect(ao.beautyRenderTarget.height).toBe(720);
    expect(ao.beautyRenderTarget.texture.type).toBe(THREE.HalfFloatType);
    expect(ao.beautyRenderTarget.depthTexture?.type).toBe(THREE.UnsignedIntType);
    expect(ao.writeTargetInternal.texture.type).toBe(THREE.UnsignedByteType);
    expect(ao.readTargetInternal.texture.type).toBe(THREE.UnsignedByteType);
    expect(ao.accumulationRenderTarget.texture.type).toBe(THREE.HalfFloatType);
    expect(ao.transparencyRenderTargetDWFalse).toBeFalsy();
    expect(ao.transparencyRenderTargetDWTrue).toBeFalsy();

    const bloom = post.bloom as unknown as BloomInternals;
    expect(bloom.renderTargetBright.texture.type).toBe(THREE.HalfFloatType);
    expect(bloom.renderTargetsHorizontal).toHaveLength(5);
    expect(bloom.renderTargetsVertical).toHaveLength(5);
    expect(bloom.renderTargetsHorizontal.map((target) => [target.width, target.height])).toEqual([
      [640, 360],
      [320, 180],
      [160, 90],
      [80, 45],
      [40, 23],
    ]);
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
  });
});
