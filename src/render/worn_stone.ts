// Shared worn-stone layer for the flat-palette stone structures (hex curtain
// walls, the Evergarden garden arch, minerock boulders, castle masses, the
// portal arch). Their GLB UVs point at solid palette cells or thin gradient
// strips, so per-mesh detail texturing has nothing to work with; instead the
// layer samples a real photogrammetry castle-ashlar PBR set (Bricks076A, CC0)
// with a WORLD-SPACE triplanar projection and composes it over whatever the
// material already does:
// - the shading normal bends toward the triplanar brick normal (subtle by
//   default, so the beveled low-poly silhouette survives),
// - diffuse multiplies by the AO map remapped to [0.72, 1.04] (grime settles
//   in the mortar lines while raised block faces lighten a touch, so the
//   stone reads worn rather than just dirty),
// - roughness lerps halfway toward the set's roughness map.
// Three shared textures total, loaded once; zero per-frame work; the Lambert
// (low) tier is skipped entirely.
import type * as THREE from 'three';
import { loadTexture } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';

/** Default shading-normal blend toward the brick normal. */
const DEFAULT_STRENGTH = 0.45;
/** Projection tiles per world unit (one ashlar course reads ~2.6 units). */
const DEFAULT_TILE_SCALE = 1 / 2.6;

let wornNormal: THREE.Texture | null = null;
let wornAo: THREE.Texture | null = null;
let wornRough: THREE.Texture | null = null;

// Low tier never compiles the layer, so skip the fetches there (the
// detail_normals.ts pattern). Loader cache results are immutable: we own
// CLONES (shared decoded image, one extra GPU texture each), so the
// anisotropy tweak cannot leak into another consumer of the same URL. All
// three maps are non-color data and stay in linear space.
if (GFX.standardMaterials) {
  const prep = (name: string): Promise<THREE.Texture> =>
    loadTexture(`/textures/structures/Bricks076A_${name}.jpg`, { repeat: true }).then((tex) => {
      const t = tex.clone();
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    });
  registerPreload(
    Promise.all([prep('NormalGL'), prep('AmbientOcclusion'), prep('Roughness')]).then(
      ([n, a, r]) => {
        wornNormal = n;
        wornAo = a;
        wornRough = r;
      },
    ),
  );
}

// Material.clone() copies userData (a false "already applied" marker on
// clones, which deliberately DROP the onBeforeCompile hook), so the real
// once-per-instance guard is identity-based; userData.wornStone stays as an
// inspectable marker only.
const applied = new WeakSet<THREE.Material>();

export interface WornStoneOpts {
  /** Shading-normal blend toward the brick normal (default 0.45). */
  strength?: number;
  /** Projection tiles per world unit (default 1/2.6). */
  tileScale?: number;
}

/**
 * Attach the world-space triplanar worn-stone layer to a standard material.
 * Composes with any existing onBeforeCompile hook (runs it first) and is
 * additive over the material's own map/vertexColors path, so palette-atlas
 * colorways survive. Safe to call more than once on the same instance (the
 * first application wins); no-op on the Lambert tier.
 */
export function applyWornStone(mat: THREE.MeshStandardMaterial, opts?: WornStoneOpts): void {
  if (!GFX.standardMaterials || !mat.isMeshStandardMaterial) return;
  if (applied.has(mat)) return;
  applied.add(mat);
  mat.userData.wornStone = true;
  const strength = opts?.strength ?? DEFAULT_STRENGTH;
  const tileScale = opts?.tileScale ?? DEFAULT_TILE_SCALE;
  const prev = mat.onBeforeCompile;
  const prevSrc = typeof prev === 'function' ? prev.toString() : '';
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    // Fail soft before the preload gate resolves: the material simply ships
    // without the layer (the detail_normals null contract).
    if (!wornNormal || !wornAo || !wornRough) return;
    shader.uniforms.uWornNormal = { value: wornNormal };
    shader.uniforms.uWornAo = { value: wornAo };
    shader.uniforms.uWornRough = { value: wornRough };
    shader.uniforms.uWornStrength = { value: strength };
    shader.uniforms.uWornTile = { value: tileScale };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWornWorldPos;
        varying vec3 vWornWorldNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wornPos = vec4( transformed, 1.0 );
        vec3 wornNrm = objectNormal;
        #ifdef USE_INSTANCING
          wornPos = instanceMatrix * wornPos;
          wornNrm = mat3( instanceMatrix ) * wornNrm;
        #endif
        vWornWorldPos = ( modelMatrix * wornPos ).xyz;
        vWornWorldNormal = normalize( mat3( modelMatrix ) * wornNrm );`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWornWorldPos;
        varying vec3 vWornWorldNormal;
        uniform sampler2D uWornNormal;
        uniform sampler2D uWornAo;
        uniform sampler2D uWornRough;
        uniform float uWornStrength;
        uniform float uWornTile;
        float wornTriR( sampler2D tex, const in vec3 p, const in vec3 w ) {
          return texture2D( tex, p.zy ).r * w.x + texture2D( tex, p.xz ).r * w.y
            + texture2D( tex, p.xy ).r * w.z;
        }`,
      )
      .replace(
        // color_fragment runs before the roughness and normal chunks, so the
        // shared projection locals declared here are in scope for both.
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 wornP = vWornWorldPos * uWornTile;
        vec3 wornW = pow( abs( normalize( vWornWorldNormal ) ), vec3( 4.0 ) );
        wornW /= ( wornW.x + wornW.y + wornW.z );
        float wornAoV = wornTriR( uWornAo, wornP, wornW );
        diffuseColor.rgb *= 0.72 + wornAoV * 0.32;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, wornTriR( uWornRough, wornP, wornW ), 0.5 );`,
      )
      .replace(
        // Whiteout-blend triplanar normal (Golus), mixed into the shading
        // normal AFTER any material normal map so the layer stays additive.
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 wornGN = normalize( vWornWorldNormal ) * faceDirection;
          vec3 wornNx = texture2D( uWornNormal, wornP.zy ).xyz * 2.0 - 1.0;
          vec3 wornNy = texture2D( uWornNormal, wornP.xz ).xyz * 2.0 - 1.0;
          vec3 wornNz = texture2D( uWornNormal, wornP.xy ).xyz * 2.0 - 1.0;
          wornNx = vec3( wornNx.xy + wornGN.zy, abs( wornNx.z ) * wornGN.x );
          wornNy = vec3( wornNy.xy + wornGN.xz, abs( wornNy.z ) * wornGN.y );
          wornNz = vec3( wornNz.xy + wornGN.xy, abs( wornNz.z ) * wornGN.z );
          vec3 wornWorldN = normalize(
            wornNx.zyx * wornW.x + wornNy.xzy * wornW.y + wornNz.xyz * wornW.z );
          vec3 wornViewN = normalize( ( viewMatrix * vec4( wornWorldN, 0.0 ) ).xyz );
          normal = normalize( mix( normal, wornViewN, uWornStrength ) );
        }`,
      );
  };
  // The default program cache key stringifies onBeforeCompile, and every worn
  // wrapper stringifies identically even when the chained PREVIOUS hook (which
  // edits different source) differs, so re-include its source text (the
  // foliage_collapse precedent). The texture-ready state keys too: before the
  // preload resolves the hook compiles to a plain pass-through.
  mat.customProgramCacheKey = () =>
    `worn-stone|${wornNormal && wornAo && wornRough ? 'on' : 'off'}|${prevSrc}`;
}
