// The mountain's rock cut away round the camera (phase 2E). The rock kit
// skins the mountain right up to the fissures' clearance, and the camera may
// stand inside it: zoomed far out behind a player at an arena's rim (a boss
// target lifts the zoom ceiling to 40 yd), it sits in the mountain past the
// rim. The heightfield was see-through from inside (its faces culled); the
// rock's faces near the camera would stand as a wall. So the rock's material
// discards its fragments within HEART_ROCK_CUT_NEAR of the camera and
// dithers them out to HEART_ROCK_CUT_FAR: rock never hides the player from
// their own camera. Cosmetic only (the rock has no collider), on every tier.
// The same layer keeps the rock's shade from sinking to black (phase 2F,
// HEART_ROCK_SHADE_FLOOR).

import type * as THREE from 'three';
import { HEART_ROCK_CUT_FAR, HEART_ROCK_CUT_NEAR, HEART_ROCK_STRATA } from './heart_rock_plan_core';

/** The rock's shade floor (phase 2F): a little of its own colour, a breath
 *  cooler, that no occlusion takes away. Deep in the mountain's joints and
 *  turned from the low sun, 2E's rock sank to a near-black (it read as a
 *  saturated navy beside the warm lit faces); with the floor every shaded
 *  face keeps its cool grey (the painted world's L1 and L6), the lit ones
 *  barely change. */
export const HEART_ROCK_SHADE_FLOOR = ['0.20', '0.215', '0.25'] as const;

/** The world's beds in the rock's paint (phase 2G): each bed of the grid
 *  (`HEART_ROCK_STRATA`) its own value and a breath warmer or cooler (M5),
 *  a soft parting along every bed line, the lines swelling a little across
 *  the mountain (never ruler-straight). Laid on the same grid as the
 *  pieces' ledges, so the strata run on unbroken round the whole mountain
 *  however the pieces meet. */
export const HEART_ROCK_BED_TONE = 0.09;

/** The bed paint's GLSL (`vRockCutWorld` in, `diffuseColor` scaled). */
export function heartRockBedGlsl(): string {
  const S = HEART_ROCK_STRATA;
  return `{
          float bedY = vRockCutWorld.y - ${S.zero.toFixed(2)}
            + 0.45 * sin( vRockCutWorld.x * 0.013 + vRockCutWorld.z * 0.009 );
          float bedU = bedY / ${S.lift.toFixed(2)};
          float bedI = floor( bedU );
          float bedF = fract( bedU );
          float bedH = fract( sin( bedI * 12.9898 + 4.1414 ) * 43758.5453 );
          float bedK = 1.0 + ${HEART_ROCK_BED_TONE.toFixed(2)} * ( bedH * 2.0 - 1.0 );
          float bedLine = 1.0 - 0.14 * ( 1.0 - smoothstep( 0.0, 0.035, bedF ) );
          vec3 bedTint = mix( vec3( 1.03, 1.0, 0.95 ), vec3( 0.96, 0.99, 1.05 ), bedH );
          diffuseColor.rgb *= bedK * bedLine * bedTint;
        }`;
}

const KEY = `smith-heart-rock-cutaway|beds2g|${HEART_ROCK_CUT_NEAR}|${HEART_ROCK_CUT_FAR}|${HEART_ROCK_SHADE_FLOOR.join(',')}`;

/** Wire the cutaway into a rock material (before any other layer: those
 *  compose with it). */
export function applyRockCutaway(mat: THREE.Material): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockCutWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 rockCut = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            rockCut = instanceMatrix * rockCut;
          #endif
          vRockCutWorld = ( modelMatrix * rockCut ).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockCutWorld;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          float rockCut = ( distance( vRockCutWorld, cameraPosition ) - ${HEART_ROCK_CUT_NEAR.toFixed(1)} )
            / ${(HEART_ROCK_CUT_FAR - HEART_ROCK_CUT_NEAR).toFixed(1)};
          float rockDither = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
          if ( rockCut < rockDither ) discard;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${heartRockBedGlsl()}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3( ${HEART_ROCK_SHADE_FLOOR.join(', ')} );`,
      );
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${KEY}|${prevKey()}`;
}
