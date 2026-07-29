// Shared triplanar surface-detail layer for the flat-palette 3D asset
// families. Their GLB UVs point at solid palette cells or thin gradient
// strips, so per-mesh detail texturing has nothing to work with; instead the
// layer samples a real CC0 PBR set per MATERIAL FAMILY with a WORLD-SPACE
// (or, for held weapons, object-space) triplanar projection and composes it
// over whatever the material already does:
// - the shading normal bends toward the family's detail normal (subtle by
//   default, so the beveled low-poly silhouette survives),
// - diffuse multiplies by the AO map remapped into a family band (grime
//   settles in mortar lines / plank seams while raised faces lighten a touch,
//   so the surface reads worn rather than just dirty),
// - roughness lerps partway toward the set's roughness map,
// - on the ULTRA tier only, a cheap 2-tap parallax walks the projection along
//   the view ray using the family's Displacement map (clamped to 0.02 in
//   projection space) so structure surfaces gain real height response.
// Three families (stone: Bricks076A, wood: MedievalWood, plaster: Plaster007),
// three or four shared textures each, loaded once; zero per-frame work; the
// Lambert (low) tier is skipped entirely. The layer must stay SUBTLE: the
// game's look is cozy low-poly, the detail suggests material, never photoreal.
import type * as THREE from 'three';
import { loadTexture } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';

export type SurfaceFamily = 'stone' | 'wood' | 'plaster';

interface FamilyTextures {
  normal: THREE.Texture | null;
  ao: THREE.Texture | null;
  rough: THREE.Texture | null;
  /** ultra-only parallax height field; stays null on lower import-time tiers */
  disp: THREE.Texture | null;
}

interface FamilyDef {
  /** texture basename under /textures/structures/ */
  prefix: string;
  /** default shading-normal blend toward the family detail normal */
  strength: number;
  /** projection tiles per world unit */
  tileScale: number;
  /** AO remap floor (diffuse multiplier at ao=0) */
  aoLo: number;
  /** AO remap span (floor + span is the multiplier at ao=1) */
  aoSpan: number;
  /** how far roughness lerps toward the family roughness map */
  roughMix: number;
  tex: FamilyTextures;
}

const emptyTex = (): FamilyTextures => ({ normal: null, ao: null, rough: null, disp: null });

// Per-family defaults. Stone keeps the original worn-stone numbers exactly
// (one ashlar course reads ~2.6 units); wood and plaster are progressively
// gentler so painted timber and washed walls stay toy-like.
const FAMILIES: Record<SurfaceFamily, FamilyDef> = {
  stone: {
    prefix: 'Bricks076A',
    strength: 0.45,
    tileScale: 1 / 2.6,
    aoLo: 0.72,
    aoSpan: 0.32,
    roughMix: 0.5,
    tex: emptyTex(),
  },
  wood: {
    prefix: 'MedievalWood',
    strength: 0.4,
    tileScale: 1 / 1.8,
    aoLo: 0.78,
    aoSpan: 0.26,
    roughMix: 0.4,
    tex: emptyTex(),
  },
  plaster: {
    prefix: 'Plaster007',
    strength: 0.35,
    tileScale: 1 / 2.2,
    aoLo: 0.82,
    aoSpan: 0.2,
    roughMix: 0.35,
    tex: emptyTex(),
  },
};

/** Parallax amplitude in projection space; the walked offset clamps to 0.02. */
const PARALLAX_AMPLITUDE = 0.035;
const PARALLAX_CLAMP = 0.02;

// Low tier never compiles the layer, so skip the fetches there (the
// detail_normals.ts pattern). Loader cache results are immutable: we own
// CLONES (shared decoded image, one extra GPU texture each), so the
// anisotropy tweak cannot leak into another consumer of the same URL. All
// maps are non-color data and stay in linear space. Displacement fetches key
// off the IMPORT-TIME ultra guess: if the live tier lands lower the texture
// merely idles, and if a non-ultra guess later runs ultra the parallax branch
// fails soft to the plain layer (the detail_normals null contract).
if (GFX.standardMaterials) {
  const wantDisp = GFX.tier === 'ultra';
  for (const fam of Object.values(FAMILIES)) {
    const prep = (name: string): Promise<THREE.Texture> =>
      loadTexture(`/textures/structures/${fam.prefix}_${name}.jpg`, { repeat: true }).then(
        (tex) => {
          const t = tex.clone();
          t.anisotropy = 4;
          t.needsUpdate = true;
          return t;
        },
      );
    registerPreload(
      Promise.all([
        prep('NormalGL'),
        prep('AmbientOcclusion'),
        prep('Roughness'),
        wantDisp ? prep('Displacement') : Promise.resolve(null),
      ]).then(([n, a, r, d]) => {
        fam.tex.normal = n;
        fam.tex.ao = a;
        fam.tex.rough = r;
        fam.tex.disp = d;
      }),
    );
  }
}

// Material.clone() copies userData (a false "already applied" marker on
// clones, which deliberately DROP the onBeforeCompile hook), so the real
// once-per-instance guard is identity-based; userData.surfaceDetail stays as
// an inspectable marker only.
const applied = new WeakSet<THREE.Material>();

export interface SurfaceDetailOpts {
  /** Shading-normal blend toward the family detail normal (family default). */
  strength?: number;
  /** Projection tiles per unit (family default). */
  tileScale?: number;
  /**
   * Project in OBJECT space instead of world space: for props that MOVE
   * (held weapons), a world projection swims across the mesh as it animates.
   * Object mode pins the pattern to the mesh and composes AO + roughness
   * only: reorienting a tangent-space detail normal sampled on object planes
   * against the world lighting frame needs the model rotation in the
   * fragment shader (not available), and scalar terms need no orientation.
   * strength then scales the AO/roughness depth instead. Parallax is skipped
   * (the view ray is only known in world space).
   */
  objectSpace?: boolean;
}

/** Back-compat option alias (the layer began stone-only). */
export type WornStoneOpts = SurfaceDetailOpts;

// ---------------------------------------------------------------------------
// Family routing for the shared GLB-kit material converters (props.ts and
// quest_objects.ts import this so the table lives in exactly one place).
// Matching runs on the SOURCE material name: the converters already key their
// caches by kit + source name, so application is deterministic per material.
// ---------------------------------------------------------------------------

/** Kit-wide stone members (hex curtain walls, the Evergarden gate arch sample
 *  palette gradient strips; minerock boulders are untextured override colors
 *  and carry a slightly stronger normal). */
const STONE_KITS: Record<string, number> = {
  khex: 0.45,
  kiron: 0.45,
  minerock: 0.6,
};

/** Kits whose materials route per NAME into a family. */
const FAMILY_KITS = new Set([
  'village',
  'kmed',
  'tent',
  'pirate',
  'stable',
  'grave',
  'town',
  'qprops',
]);

const WOOD_NAME = /wood|plank|log|stump|bark|timber|crate|barrel|fence/i;
const STONE_NAME = /stone|rock|brick|pillar|column|grave|ruin/i;
const PLASTER_NAME = /plaster|wall/i;

export interface WornFamilyPick {
  family: SurfaceFamily;
  strength: number;
}

/**
 * Resolve which surface-detail family (if any) a kit material takes, from the
 * kit id and the SOURCE material name. Kit-wide stone entries win; the family
 * kits then route wood-named, stone-named, and plaster/wall-named materials.
 */
export function wornFamilyFor(kit: string, materialName: string): WornFamilyPick | null {
  const kitWide = STONE_KITS[kit];
  if (kitWide !== undefined) return { family: 'stone', strength: kitWide };
  if (!FAMILY_KITS.has(kit)) return null;
  if (WOOD_NAME.test(materialName)) return { family: 'wood', strength: 0.35 };
  if (STONE_NAME.test(materialName)) return { family: 'stone', strength: 0.4 };
  if (PLASTER_NAME.test(materialName)) return { family: 'plaster', strength: 0.35 };
  return null;
}

/**
 * Attach the triplanar surface-detail layer for a material family to a
 * standard material. Composes with any existing onBeforeCompile hook (runs it
 * first) and is additive over the material's own map/vertexColors path, so
 * palette-atlas colorways survive. Safe to call more than once on the same
 * instance (the first application wins); no-op on the Lambert tier.
 */
export function applySurfaceDetail(
  mat: THREE.MeshStandardMaterial,
  family: SurfaceFamily,
  opts?: SurfaceDetailOpts,
): void {
  if (!GFX.standardMaterials || !mat.isMeshStandardMaterial) return;
  if (applied.has(mat)) return;
  applied.add(mat);
  mat.userData.surfaceDetail = family;
  if (family === 'stone') mat.userData.wornStone = true; // legacy marker
  const fam = FAMILIES[family];
  const strength = opts?.strength ?? fam.strength;
  const tileScale = opts?.tileScale ?? fam.tileScale;
  const objectSpace = opts?.objectSpace === true;
  // In object mode strength cannot act on the (skipped) normal blend, so it
  // scales the scalar terms relative to the family default instead.
  const scalarK = objectSpace ? Math.min(strength / fam.strength, 1) : 1;
  const aoLo = 1 - (1 - fam.aoLo) * scalarK;
  const aoSpan = fam.aoSpan * scalarK;
  const roughMix = fam.roughMix * scalarK;
  const prev = mat.onBeforeCompile;
  const prevSrc = typeof prev === 'function' ? prev.toString() : '';
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    // Fail soft before the preload gate resolves: the material simply ships
    // without the layer (the detail_normals null contract).
    if (!fam.tex.normal || !fam.tex.ao || !fam.tex.rough) return;
    // Parallax gates on the LIVE tier at compile time plus a resolved height
    // field, and needs the world-space view ray.
    const parallax = !objectSpace && GFX.tier === 'ultra' && fam.tex.disp !== null;
    shader.uniforms.uWornNormal = { value: fam.tex.normal };
    shader.uniforms.uWornAo = { value: fam.tex.ao };
    shader.uniforms.uWornRough = { value: fam.tex.rough };
    shader.uniforms.uWornStrength = { value: strength };
    shader.uniforms.uWornTile = { value: tileScale };
    shader.uniforms.uWornAoLo = { value: aoLo };
    shader.uniforms.uWornAoSpan = { value: aoSpan };
    shader.uniforms.uWornRoughMix = { value: roughMix };
    if (parallax) shader.uniforms.uWornDisp = { value: fam.tex.disp };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWornWorldPos;
        varying vec3 vWornWorldNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        objectSpace
          ? // Object space: the raw pre-instance, pre-model position pins the
            // pattern to the mesh however its node animates.
            `#include <project_vertex>
        vWornWorldPos = transformed;
        vWornWorldNormal = normalize( objectNormal );`
          : `#include <project_vertex>
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
        uniform float uWornAoLo;
        uniform float uWornAoSpan;
        uniform float uWornRoughMix;
        ${parallax ? 'uniform sampler2D uWornDisp;' : ''}
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
        ${
          parallax
            ? `{
          // 2-tap parallax: estimate height, refine one step along the view
          // ray, then walk the projection by the averaged offset, clamped so
          // the layer never breaks the low-poly silhouette.
          vec3 wornV = normalize( vWornWorldPos - cameraPosition );
          float wornH = wornTriR( uWornDisp, wornP, wornW ) - 0.5;
          float wornH2 = wornTriR( uWornDisp,
            wornP + wornV * ( wornH * ${PARALLAX_AMPLITUDE.toFixed(3)} ), wornW ) - 0.5;
          wornP += clamp(
            wornV * ( ( wornH + wornH2 ) * 0.5 * ${PARALLAX_AMPLITUDE.toFixed(3)} ),
            vec3( -${PARALLAX_CLAMP.toFixed(3)} ), vec3( ${PARALLAX_CLAMP.toFixed(3)} ) );
        }`
            : ''
        }
        float wornAoV = wornTriR( uWornAo, wornP, wornW );
        diffuseColor.rgb *= uWornAoLo + wornAoV * uWornAoSpan;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, wornTriR( uWornRough, wornP, wornW ), uWornRoughMix );`,
      );
    if (!objectSpace) {
      shader.fragmentShader = shader.fragmentShader.replace(
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
    }
  };
  // The default program cache key stringifies onBeforeCompile, and every worn
  // wrapper stringifies identically even when the chained PREVIOUS hook (which
  // edits different source) differs, so re-include its source text (the
  // foliage_collapse precedent). The family's texture-ready state keys too
  // (before the preload resolves the hook compiles to a plain pass-through),
  // as do the projection mode and the ultra parallax branch.
  mat.customProgramCacheKey = () => {
    const ready = fam.tex.normal && fam.tex.ao && fam.tex.rough ? 'on' : 'off';
    const par = !objectSpace && GFX.tier === 'ultra' && fam.tex.disp !== null ? 'p' : '-';
    return `surface-detail|${family}|${ready}|${par}|${objectSpace ? 'o' : 'w'}|${prevSrc}`;
  };
}

/**
 * Back-compat entry for the original stone-only layer (castle features, realm
 * flora ruins, the portal arch): the stone family with the original defaults.
 */
export function applyWornStone(mat: THREE.MeshStandardMaterial, opts?: WornStoneOpts): void {
  applySurfaceDetail(mat, 'stone', opts);
}
