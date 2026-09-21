import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { collectAbilityVfxCompileTargets } from '../src/render/ability_vfx/prewarm';
import { bindSceneSamples, OpaqueSceneCapture } from '../src/render/scene_sampling';

describe('opaque scene copy ownership', () => {
  it('copies a distinct current-frame pair, restores the source and exposes the active region', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 2, 0.2, 700);
    const source = new THREE.WebGLRenderTarget(800, 400, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(800, 400, THREE.UnsignedIntType),
    });
    source.viewport.set(0, 0, 600, 300);
    let current: THREE.WebGLRenderTarget | null = source;
    const renderer = {
      initRenderTarget: vi.fn(),
      getRenderTarget: () => current,
      copyTextureToTexture: vi.fn(),
      setRenderTarget: vi.fn(),
    };
    const capture = new OpaqueSceneCapture(
      renderer as unknown as THREE.WebGLRenderer,
      scene,
      800,
      400,
    );
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial());
    scene.add(mesh);
    const unbind = bindSceneSamples(scene, mesh);
    const sentinel = scene.getObjectByName('opaqueVfxCapture')!;
    const draw = () =>
      sentinel.onBeforeRender(
        renderer as unknown as THREE.WebGLRenderer,
        scene,
        camera,
        mesh.geometry,
        mesh.material,
        null as never,
      );
    draw();
    const u = mesh.material.uniforms;
    expect(renderer.copyTextureToTexture).toHaveBeenCalledTimes(2);
    expect(u.uOpaqueColor.value).not.toBe(source.texture);
    expect(u.uOpaqueDepth.value).not.toBe(source.depthTexture);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(source);
    expect(u.uSceneReady.value).toBe(1);
    expect(u.uSceneExtent.value.toArray()).toEqual([1 / 800, 1 / 400, 0.75, 0.75]);
    expect(u.uSceneClip.value.toArray()).toEqual([0.2, 700]);
    expect(collectAbilityVfxCompileTargets(scene).some((t) => t.object === sentinel)).toBe(true);
    mesh.visible = false;
    draw();
    expect(u.uSceneReady.value).toBe(0);
    expect(renderer.copyTextureToTexture).toHaveBeenCalledTimes(2);
    mesh.visible = true;
    source.samples = 4;
    draw();
    expect(u.uSceneReady.value).toBe(0);
    current = null;
    draw();
    expect(u.uSceneReady.value).toBe(0);
    unbind();
    capture.dispose();
    capture.dispose();
    expect(u.uOpaqueColor.value).toBeNull();
    expect(scene.getObjectByName('opaqueVfxCapture')).toBeUndefined();
    source.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});

describe('lazy opaque capture residency', () => {
  function setup() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 2, 0.2, 700);
    const source = new THREE.WebGLRenderTarget(800, 400, {
      depthTexture: new THREE.DepthTexture(800, 400, THREE.UnsignedIntType),
    });
    const renderer = {
      initRenderTarget: vi.fn(),
      getRenderTarget: () => source,
      copyTextureToTexture: vi.fn(),
      setRenderTarget: vi.fn(),
    };
    const capture = new OpaqueSceneCapture(
      renderer as unknown as THREE.WebGLRenderer,
      scene,
      800,
      400,
    );
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial());
    const group = new THREE.Group();
    group.add(mesh);
    scene.add(group);
    const draw = () =>
      scene
        .getObjectByName('opaqueVfxCapture')
        ?.onBeforeRender(
          renderer as unknown as THREE.WebGLRenderer,
          scene,
          camera,
          mesh.geometry,
          mesh.material,
          null as never,
        );
    const dispose = () => {
      capture.dispose();
      source.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    };
    return { scene, source, renderer, capture, mesh, group, draw, dispose };
  }

  it('allocates no capture attachments at construction, resize or a frame with no consumers', () => {
    const f = setup();
    try {
      f.capture.setSize(1600, 800);
      f.capture.begin();
      f.draw();
      expect(f.renderer.initRenderTarget).not.toHaveBeenCalled();
      expect(f.renderer.copyTextureToTexture).not.toHaveBeenCalled();
      const unbind = bindSceneSamples(f.scene, f.mesh);
      expect(f.mesh.material.uniforms.uOpaqueColor.value).toBeNull();
      expect(f.mesh.material.uniforms.uOpaqueDepth.value).toBeNull();
      unbind();
    } finally {
      f.dispose();
    }
    expect(f.renderer.initRenderTarget).not.toHaveBeenCalled();
  });

  it('waits for a visible attached consumer and valid source, then reuses its allocation', () => {
    const f = setup();
    const unbind = bindSceneSamples(f.scene, f.mesh);
    try {
      f.group.visible = false;
      f.draw();
      f.group.visible = true;
      f.group.removeFromParent();
      f.draw();
      f.scene.add(f.group);
      f.source.samples = 4;
      f.draw();
      expect(f.renderer.initRenderTarget).not.toHaveBeenCalled();
      expect(f.mesh.material.uniforms.uSceneReady.value).toBe(0);
      f.source.samples = 0;
      f.draw();
      expect(f.renderer.initRenderTarget).toHaveBeenCalledTimes(1);
      expect(f.mesh.material.uniforms.uSceneReady.value).toBe(1);
      const target = f.renderer.initRenderTarget.mock.calls[0][0] as THREE.WebGLRenderTarget;
      expect(target.width).toBe(800);
      expect(target.texture).not.toBe(f.source.texture);
      expect(target.depthTexture).not.toBe(f.source.depthTexture);
      f.capture.begin();
      expect(f.mesh.material.uniforms.uSceneReady.value).toBe(0);
      f.draw();
      expect(f.renderer.initRenderTarget).toHaveBeenCalledTimes(1);
      expect(f.renderer.copyTextureToTexture).toHaveBeenCalledTimes(4);
      const released = vi.spyOn(target, 'dispose');
      f.capture.dispose();
      f.capture.dispose();
      expect(released).toHaveBeenCalledTimes(1);
      expect(f.mesh.material.uniforms.uSceneReady.value).toBe(0);
      expect(f.mesh.material.uniforms.uOpaqueColor.value).toBeNull();
      expect(f.mesh.material.uniforms.uOpaqueDepth.value).toBeNull();
    } finally {
      unbind();
      f.dispose();
    }
  });

  it('defers resized attachment allocation until the next visible consumer draw', () => {
    const f = setup();
    const unbind = bindSceneSamples(f.scene, f.mesh);
    try {
      f.capture.setSize(1600, 800);
      f.source.setSize(1600, 800);
      f.draw();
      const target = f.renderer.initRenderTarget.mock.calls[0][0] as THREE.WebGLRenderTarget;
      expect([target.width, target.height]).toEqual([1600, 800]);
      f.mesh.visible = false;
      f.capture.setSize(400, 200);
      f.source.setSize(400, 200);
      f.draw();
      expect(f.renderer.initRenderTarget).toHaveBeenCalledTimes(1);
      expect(f.mesh.material.uniforms.uSceneReady.value).toBe(0);
      f.mesh.visible = true;
      f.draw();
      expect(f.renderer.initRenderTarget).toHaveBeenCalledTimes(2);
      expect([target.width, target.height]).toEqual([400, 200]);
      expect(f.mesh.material.uniforms.uSceneReady.value).toBe(1);
    } finally {
      unbind();
      f.dispose();
    }
  });

  it('restores the source and keeps sampling disabled when lazy initialization fails', () => {
    const f = setup();
    const unbind = bindSceneSamples(f.scene, f.mesh);
    try {
      f.renderer.initRenderTarget.mockImplementationOnce(() => {
        throw new Error('capture init');
      });
      expect(f.draw).toThrow('capture init');
      expect(f.renderer.setRenderTarget).toHaveBeenLastCalledWith(f.source);
      expect(f.mesh.material.uniforms.uSceneReady.value).toBe(0);
      expect(f.renderer.copyTextureToTexture).not.toHaveBeenCalled();
      f.draw();
      expect(f.renderer.initRenderTarget).toHaveBeenCalledTimes(2);
      expect(f.mesh.material.uniforms.uSceneReady.value).toBe(1);
    } finally {
      unbind();
      f.dispose();
    }
  });
});
