import * as THREE from 'three';

interface PbrShaderChunks {
  lights_fragment_begin: string;
}

const PATCH_MARKER = 'WOC_PBR_SKIP_ZERO_POINT_LIGHT';
const RIM_PATCH_MARKER = 'WOC_PBR_RIM_REUSE';
const POINT_INFO_ANCHOR = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
const POINT_DIRECT_ANCHOR =
  'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const SPOT_LIGHT_ANCHOR = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )';
const COMMON_ANCHOR = '#include <common>';
const LIGHTS_BEGIN_ANCHOR = '#include <lights_fragment_begin>';

/**
 * Three r165 records whether a point light contributes zero, but still runs
 * the full PBR direct-light equation. The renderer deliberately keeps six
 * point-light slots compiled at all times, filling unused slots with
 * zero-intensity pads, so those no-op GGX evaluations are a common path.
 *
 * The guards wrap existing statements without changing them. Non-PBR
 * materials preprocess the STANDARD blocks away. PBR materials skip a slot
 * only when its uniform color is exactly zero, or when stock attenuation made
 * directLight.visible false because its resulting color is exactly zero.
 */
export function patchPbrPointLightFragmentChunk(source: string): string {
  if (source.includes(PATCH_MARKER)) return source;

  const pointInfo = source.indexOf(POINT_INFO_ANCHOR);
  const pointDirect = source.indexOf(POINT_DIRECT_ANCHOR, pointInfo + POINT_INFO_ANCHOR.length);
  const spotLights = source.indexOf(SPOT_LIGHT_ANCHOR);
  if (pointInfo < 0 || pointDirect < 0 || spotLights < 0 || pointDirect >= spotLights) {
    return source;
  }

  const guardedPointInfo = `#ifdef STANDARD
\t\t// ${PATCH_MARKER}: uniform-coherent pad-light fast path.
\t\tif ( pointLight.color != vec3( 0.0 ) ) {
\t\t#endif

\t\t${POINT_INFO_ANCHOR}`;
  const guardedPointDirect = `#ifdef STANDARD
\t\tif ( directLight.visible ) {
\t\t#endif

\t\t${POINT_DIRECT_ANCHOR}

\t\t#ifdef STANDARD
\t\t}
\t\t}
\t\t#endif`;

  return (
    source.slice(0, pointInfo) +
    guardedPointInfo +
    source.slice(pointInfo + POINT_INFO_ANCHOR.length, pointDirect) +
    guardedPointDirect +
    source.slice(pointDirect + POINT_DIRECT_ANCHOR.length)
  );
}

/**
 * Move the character rim term after the stock light setup so it can reuse
 * geometryViewDir. Every character render path uses a PerspectiveCamera, where
 * Three defines that value with the exact normalize(vViewPosition) expression
 * the old patch evaluated independently.
 */
export function patchPbrRimGlowFragmentShader(source: string): string {
  if (source.includes(RIM_PATCH_MARKER)) return source;
  if (!source.includes(COMMON_ANCHOR) || !source.includes(LIGHTS_BEGIN_ANCHOR)) {
    return source;
  }
  return source
    .replace(
      COMMON_ANCHOR,
      `${COMMON_ANCHOR}
      // ${RIM_PATCH_MARKER}
      uniform float uRimBoost;`,
    )
    .replace(
      LIGHTS_BEGIN_ANCHOR,
      `${LIGHTS_BEGIN_ANCHOR}
      totalEmissiveRadiance += vec3(0.5, 0.6, 0.8) * 0.12 * uRimBoost *
        pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);`,
    );
}

/**
 * Install before the renderer compiles scene materials. Returns true only
 * when this call changed the shared chunk. A changed Three anchor leaves the
 * stock chunk untouched so a renderer upgrade cannot break page rendering.
 */
export function installPbrPointLightShaderPruning(
  chunks: PbrShaderChunks = THREE.ShaderChunk,
): boolean {
  const patched = patchPbrPointLightFragmentChunk(chunks.lights_fragment_begin);
  if (patched === chunks.lights_fragment_begin) return false;
  chunks.lights_fragment_begin = patched;
  return true;
}
