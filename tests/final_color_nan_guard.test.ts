import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { GraphicsSettingsSnapshot } from '../src/game/graphics_rebuild_core';
import { installFinalColorNanGuard } from '../src/render/final_color_nan_guard';
import { activateGfxProfile, type GfxCapabilities, resolveGfxProfile } from '../src/render/gfx';

const originalOpaqueFragment = THREE.ShaderChunk.opaque_fragment;
const originalFogFragment = THREE.ShaderChunk.fog_fragment;

const desktopCapabilities: GfxCapabilities = Object.freeze({
  deviceMemory: 8,
  hardwareConcurrency: 12,
  maxTouchPoints: 0,
  coarsePointer: false,
  narrowViewport: false,
  gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)',
  nativeApp: false,
  tightMemory: false,
  platform: 'other',
  softwareRendering: false,
});

const basePreferences: GraphicsSettingsSnapshot = {
  graphicsPreset: 2,
  terrainDetail: 1,
  foliageDensity: 1,
  surfaceDetail: 1,
  effectsQuality: 1,
  shadowQuality: 1,
  antiAliasing: 1,
  bloomQuality: 1,
  ambientOcclusion: 1,
  viewDistance: 1,
  waterQuality: 1,
  characterDetail: 1,
  dynamicLights: 1,
  particleEffects: 1,
};

afterEach(() => {
  THREE.ShaderChunk.opaque_fragment = originalOpaqueFragment;
  THREE.ShaderChunk.fog_fragment = originalFogFragment;
});

describe('installFinalColorNanGuard', () => {
  it('patches both chunks on a fresh chunk set and reports changed', () => {
    const chunks = {
      opaque_fragment: THREE.ShaderChunk.opaque_fragment,
      fog_fragment: THREE.ShaderChunk.fog_fragment,
    };
    const changed = installFinalColorNanGuard(chunks);
    expect(changed).toBe(true);
    expect(chunks.opaque_fragment).toContain('WOC_OPAQUE_NAN_GUARD');
    expect(chunks.fog_fragment).toContain('WOC_FOG_NAN_GUARD');
  });

  it('reports unchanged on a second call against the same chunk set', () => {
    const chunks = {
      opaque_fragment: THREE.ShaderChunk.opaque_fragment,
      fog_fragment: THREE.ShaderChunk.fog_fragment,
    };
    installFinalColorNanGuard(chunks);
    const changed = installFinalColorNanGuard(chunks);
    expect(changed).toBe(false);
  });

  it('patches global chunks when profile activation switches into direct rendering', () => {
    THREE.ShaderChunk.opaque_fragment = originalOpaqueFragment;
    THREE.ShaderChunk.fog_fragment = originalFogFragment;

    const gradePassProfile = resolveGfxProfile(desktopCapabilities, basePreferences, '');
    expect(gradePassProfile.settings.gradePass).toBe(true);
    activateGfxProfile(gradePassProfile);
    expect(THREE.ShaderChunk.opaque_fragment).not.toContain('WOC_OPAQUE_NAN_GUARD');
    expect(THREE.ShaderChunk.fog_fragment).not.toContain('WOC_FOG_NAN_GUARD');

    const directProfile = resolveGfxProfile(
      desktopCapabilities,
      { ...basePreferences, graphicsPreset: 1 },
      '',
    );
    expect(directProfile.settings.gradePass).toBe(false);
    activateGfxProfile(directProfile);
    expect(THREE.ShaderChunk.opaque_fragment).toContain('WOC_OPAQUE_NAN_GUARD');
    expect(THREE.ShaderChunk.fog_fragment).toContain('WOC_FOG_NAN_GUARD');
  });
});
