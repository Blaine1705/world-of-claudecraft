// The shadow-depth material factory the prewarm shadow pass uses to link the
// exact RGBADepthPacking skinned/alpha-tested depth variants three's real
// WebGLShadowMap draws (a plain compileAsync never enumerates the
// renderer-owned shadow material). Extracted from renderer.ts so the compile
// helpers and the self-spirit prewarm can share one keyed cache instead of a
// method bound to the renderer's private state.
import * as THREE from 'three';
import type { TextureBackedMaterial } from './renderer_diagnostics';

/**
 * A cached MeshDepthMaterial equivalent to `source` for the shadow pass. Keyed
 * by exactly the inputs three folds into the depth program cache key (shadow
 * side, map/alphaMap/displacement PRESENCE, alpha-test arm, wireframe), so a
 * whole rig of recoloured, re-atlased materials collapses onto a handful of
 * depth programs. depthPacking is pinned to RGBADepthPacking to MATCH the real
 * shadow pass: three's shared shadow depth material uses it and depthPacking
 * sits in the program cache key, so the default BasicDepthPacking would link a
 * variant the shadow pass never draws and every "prewarmed" caster relinked at
 * its first shadow draw anyway.
 */
export function prewarmDepthMaterial(
  cache: Map<string, THREE.MeshDepthMaterial>,
  source: THREE.Material,
): THREE.MeshDepthMaterial {
  const textured = source as TextureBackedMaterial & {
    displacementScale?: number;
    displacementBias?: number;
    wireframe?: boolean;
  };
  const shadowSide =
    source.shadowSide ??
    (source.side === THREE.FrontSide
      ? THREE.BackSide
      : source.side === THREE.BackSide
        ? THREE.FrontSide
        : THREE.DoubleSide);
  const key = [
    shadowSide,
    textured.map ? 1 : 0,
    textured.alphaMap ? 1 : 0,
    source.alphaToCoverage || source.alphaTest > 0 ? 1 : 0,
    textured.displacementMap ? 1 : 0,
    textured.wireframe ? 1 : 0,
  ].join('|');
  const cached = cache.get(key);
  if (cached) return cached;
  const depth = new THREE.MeshDepthMaterial({
    side: shadowSide,
    map: textured.map ?? null,
    alphaMap: textured.alphaMap ?? null,
    alphaTest: source.alphaToCoverage ? 0.5 : source.alphaTest,
    displacementMap: textured.displacementMap ?? null,
    displacementScale: textured.displacementScale ?? 1,
    displacementBias: textured.displacementBias ?? 0,
    wireframe: textured.wireframe ?? false,
    depthPacking: THREE.RGBADepthPacking,
  });
  depth.name = `prewarm-depth:${key}`;
  cache.set(key, depth);
  return depth;
}
