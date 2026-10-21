// The mountain's rock cut away round the camera (phase 2E). The rock kit
// skins the mountain right up to the fissures' clearance, and the camera may
// stand inside it: zoomed far out behind a player at an arena's rim (a boss
// target lifts the zoom ceiling to 40 yd), it sits in the mountain past the
// rim. The heightfield was see-through from inside (its faces culled); the
// rock's faces near the camera would stand as a wall. So the rock's material
// discards its fragments within HEART_ROCK_CUT_NEAR of the camera and
// dithers them out to HEART_ROCK_CUT_FAR: rock never hides the player from
// their own camera. Cosmetic only (the rock has no collider), on every tier.

import type * as THREE from 'three';
import { HEART_ROCK_CUT_FAR, HEART_ROCK_CUT_NEAR } from './heart_rock_plan_core';

const KEY = `smith-heart-rock-cutaway|${HEART_ROCK_CUT_NEAR}|${HEART_ROCK_CUT_FAR}`;

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
      );
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${KEY}|${prevKey()}`;
}
