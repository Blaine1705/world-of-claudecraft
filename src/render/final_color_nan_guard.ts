import * as THREE from 'three';
import {
  patchFogFragmentNanGuard,
  patchOpaqueFragmentNanGuard,
} from './final_color_nan_guard_core';

interface FinalColorShaderChunks {
  opaque_fragment: string;
  fog_fragment: string;
}

/**
 * Install before any scene material compiles, and only for tiers that render
 * straight to the backbuffer (GFX.gradePass false): the composer/gradePass
 * tiers already get an equivalent scrub one stage later via
 * OutputGradePass's sanitizeFinite, so installing here too would just pay the
 * per-fragment cost twice for the same protection. Returns true only when
 * this call changed a chunk, mirroring installPbrPointLightShaderPruning.
 */
export function installFinalColorNanGuard(
  chunks: FinalColorShaderChunks = THREE.ShaderChunk,
): boolean {
  const patchedOpaque = patchOpaqueFragmentNanGuard(chunks.opaque_fragment);
  const patchedFog = patchFogFragmentNanGuard(chunks.fog_fragment);
  const changed = patchedOpaque !== chunks.opaque_fragment || patchedFog !== chunks.fog_fragment;
  chunks.opaque_fragment = patchedOpaque;
  chunks.fog_fragment = patchedFog;
  return changed;
}
