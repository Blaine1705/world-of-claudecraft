import * as THREE from 'three';
import {
  COLUMN_ZONES,
  columnBlendAt,
  STRIP_MAX_X,
  STRIP_MIN_X,
  STRIP_ZONES,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_Z,
  ZONES,
} from '../sim/data';
import { fbm2 } from '../sim/rng';
import type { BiomeId, ZoneDef } from '../sim/types';
import { roadDistance, terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../sim/world';
import { loadTexture } from './assets/loader';
import { registerPreload } from './assets/preload';
import { type ChunkGrid, type GroundPendingAt, orderCellsForEntry } from './chunk_residency_core';
import { GFX, SUN_DIR } from './gfx';
import { idleSlot } from './idle_queue';
import { impactCraterTerrainBlend } from './impact_terrain';
import {
  beginChunkGeometry,
  type ChunkGeometryArrays,
  type ChunkGeometryBuildState,
  fillChunkIndexRow,
  fillChunkVertexRow,
} from './terrain_chunk_build';
import { terrainChunkPool } from './terrain_chunk_pool';
import {
  chunkIntersectsRegion,
  normalTexelBounds,
  owningRectIndex,
  type TexelBounds,
  type WorldRect,
} from './terrain_region_core';
import { groundDetailTexture, groundSplatMaps, macroNoiseTexture } from './textures';

// Chunked terrain across the whole 360x1080 zone strip.
//
// - ~60u chunks with their own bounding volumes so frustum culling actually
//   works (the old single-plane-per-zone terrain was always fully submitted).
// - LOD by distance from the nearest hub at build time: settlements (where
//   the camera lingers) get dense vertices, the wilderness gets coarse ones.
//   Chunks carrying the impassable mountain walls (inter-zone ridges, world
//   rim) are promoted to the densest band regardless: the terraced walls hold
//   the heightfield's highest frequencies and the far band smears them into
//   ragged shards.
// - Skirts hang from every chunk edge to hide LOD cracks: a 0.3u base drop
//   plus the vertex slope times the coarsest band spacing, since a T-junction
//   hole grows with both the neighbor's chord span and the local gradient
//   (terraced cliffs open multi-yard holes that a flat drop cannot cover).
// - High tier: MeshStandardMaterial + splat shading (grass/dirt/rock/sand
//   weights precomputed per vertex from slope/height/roadDistance into a vec4
//   attribute) over the biome vertex-color tint, plus a world-space macro
//   normal map baked from terrainHeight.
// - Low tier: the legacy vertex-color Lambert look, still chunked for culling.

const CHUNK_SIZE = 60;
// An 'idle'-paced zone build waits for a browser idle slot between batches;
// this timeout forces one batch through anyway under sustained frame load.
const IDLE_BUILD_TIMEOUT_MS = 200;

// ---------------------------------------------------------------------------
// Real PBR splat layers (ambientCG 1K, shipped under public/textures/terrain).
// Kicked off at module import and registered with the preload gate, so by the
// time buildTerrain runs the resolved textures are available synchronously.
// ---------------------------------------------------------------------------

const TERRAIN_TEX: Record<string, THREE.Texture> = {};
const ALBEDO_ANISOTROPY = 8;
const NORMAL_ANISOTROPY = 4;

function kickTerrainTex(key: string, file: string, srgb: boolean): void {
  registerPreload(
    loadTexture(`/textures/terrain/${file}`, { srgb, repeat: true }).then((tex) => {
      tex.anisotropy = srgb ? ALBEDO_ANISOTROPY : NORMAL_ANISOTROPY;
      TERRAIN_TEX[key] = tex;
      return tex;
    }),
  );
}

// ~15MB of JPEGs — skip when the URL already forces the Lambert tier (an
// auto-detected low tier still fetches them; the URL guess can't know yet)
if (GFX.terrainSplat) {
  kickTerrainTex('grassC', 'Grass001_Color.jpg', true);
  kickTerrainTex('grassN', 'Grass001_NormalGL.jpg', false);
  // Ground023 (leaf-littered packed earth), not Ground048: at the splat tile
  // scale 048 is one uniform high-frequency crumble (measured large/fine
  // luminance-std ratio 0.21, saturation 0.39, R/G 1.35) and paths read as
  // pink carpet. 023 carries real medium-scale features (ratio 0.47), an
  // earthier desaturated hue (R/G 1.15, saturation 0.26), a clean row/col
  // variance ratio (1.34, no corduroy) and a usable AO map (sd 0.117).
  kickTerrainTex('dirtC', 'Ground023_Color.jpg', true);
  kickTerrainTex('dirtN', 'Ground023_NormalGL.jpg', false);
  // Rock026 (fractured cliff plates), not Rock051: Rock051's striations are
  // directional (anisotropy 2.57), and wall-projecting them at one scale is
  // what gave mountainsides the vertical corduroy. Rock051 stays on disk for
  // voxel_terrain.
  kickTerrainTex('rockC', 'Rock026_Color.jpg', true);
  kickTerrainTex('rockN', 'Rock026_NormalGL.jpg', false);
  kickTerrainTex('sandC', 'Ground080_Color.jpg', true);
  kickTerrainTex('sandN', 'Ground080_NormalGL.jpg', false);
  kickTerrainTex('mudC', 'Ground071_Color.jpg', true); // marsh wet mud (dirt variant)
  kickTerrainTex('snowC', 'Snow010A_Color.jpg', true);
  // The packs' relief channels, packed offline into one RGBA texture by
  // scripts/assets/pack_ground_ao.mjs (R grass AO, G dirt AO, B rock height,
  // A sand AO): one sampler instead of four keeps the splat material under
  // the 16-sampler fragment limit. B is a Rock026+Rock060 displacement blend,
  // not an AO map: Rock026's authored AO is near-white, and displacement is
  // the honest cavity signal for the new rocks. Linear data: cavity = dark,
  // open surface = bright.
  kickTerrainTex('groundAO', 'GroundAO_Packed.png', false);
}

export function hasTerrainSplatAssets(): boolean {
  return Boolean(
    TERRAIN_TEX.grassC &&
      TERRAIN_TEX.grassN &&
      TERRAIN_TEX.dirtC &&
      TERRAIN_TEX.dirtN &&
      TERRAIN_TEX.rockC &&
      TERRAIN_TEX.rockN &&
      TERRAIN_TEX.sandC &&
      TERRAIN_TEX.sandN &&
      TERRAIN_TEX.mudC &&
      TERRAIN_TEX.snowC &&
      TERRAIN_TEX.groundAO,
  );
}

// Per-layer constant roughness, eyeballed from the packs' roughness-map means
// (saves four samplers vs. real roughness maps; terrain is never glossy
// enough for the difference to read at gameplay camera distance).
const ROUGH_GRASS = 0.8;
const ROUGH_DIRT = 0.95; // raised with the gravel blend: packed trail grit, not smooth paint
const ROUGH_ROCK = 0.75;
const ROUGH_SAND = 0.85;
const ROUGH_MUD = 0.62; // wet sheen
const ROUGH_SNOW = 0.72;

// vertex spacing by distance from the nearest hub centre
const LOD_BANDS = {
  high: [
    { maxHubDist: 95, spacing: 1.2 },
    { maxHubDist: 185, spacing: 1.6 },
    { maxHubDist: Infinity, spacing: 2.6 },
  ],
  low: [
    { maxHubDist: 95, spacing: 3.0 },
    { maxHubDist: 185, spacing: 4.4 },
    { maxHubDist: Infinity, spacing: 6.5 },
  ],
} as const;

// Mountain-wall chunks are promoted to the densest LOD band. Half-widths
// mirror sim/world.ts: the ridge contribution lives within RIDGE_SIGMA*3
// (30yd) of each inter-zone ridge line, and the rim rise starts 30yd inside
// the world edge (plus crest-noise margin).
const WALL_LOD_RIDGE_HALF = 30;
const WALL_LOD_RIM_MARGIN = 40;

// Macro relief only needs to carry broad slopes: vertex normals and the four
// tiled material normals own close detail. The atlas spans the whole expanded
// world but is baked sparsely by zone, so keep it compact enough that entering
// a new region never turns tens of thousands of terrainHeight samples into a
// second boot. At the current bounds this is roughly 3yd/texel.
const NORMAL_TEX_W = 320;
const NORMAL_TEX_H = 960;
// nudged up from 1.35: at 3yd/texel the macro relief was reading flat next
// to the strengthened per-material detail normals
const NORMAL_TEX_STRENGTH = 1.55;

// Ground colors per biome; boundaries blend across the same window as the
// heightfield's shape blend. This is the tint layer the splat albedo
// multiplies into (splat textures are authored near mid-gray).
function finishChunkGeometry(state: ChunkGeometryArrays): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(state.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(state.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(state.colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(state.uvs, 2));
  if (state.splats) geo.setAttribute('aSplat', new THREE.BufferAttribute(state.splats, 4));
  if (state.extras) geo.setAttribute('aExtra', new THREE.BufferAttribute(state.extras, 4));
  geo.setIndex(new THREE.BufferAttribute(state.indices, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function buildChunkGeometry(
  x0: number,
  z0: number,
  size: number,
  spacing: number,
  seed: number,
  withSplat: boolean,
  skirtSpan: number,
  lowShade: boolean,
): THREE.BufferGeometry {
  const state = beginChunkGeometry(x0, z0, size, spacing, seed, withSplat, skirtSpan, lowShade);
  for (let row = 0; row < state.gh; row++) fillChunkVertexRow(state, row);
  for (let row = 0; row < state.gh - 1; row++) fillChunkIndexRow(state, row);
  return finishChunkGeometry(state);
}

const IDLE_GEOMETRY_SLICE_MS = 6;

async function buildChunkGeometryIdle(
  x0: number,
  z0: number,
  size: number,
  spacing: number,
  seed: number,
  withSplat: boolean,
  skirtSpan: number,
  lowShade: boolean,
  yieldSlice: () => Promise<void>,
  cancelled: () => boolean,
): Promise<THREE.BufferGeometry | null> {
  const state = beginChunkGeometry(x0, z0, size, spacing, seed, withSplat, skirtSpan, lowShade);
  const drainRows = async (rows: number, fill: (row: number) => void): Promise<boolean> => {
    let row = 0;
    while (row < rows) {
      await yieldSlice();
      if (cancelled()) return false;
      const started = performance.now();
      do fill(row++);
      while (row < rows && performance.now() - started < IDLE_GEOMETRY_SLICE_MS);
    }
    return true;
  };
  if (!(await drainRows(state.gh, (row) => fillChunkVertexRow(state, row)))) return null;
  if (!(await drainRows(state.gh - 1, (row) => fillChunkIndexRow(state, row)))) return null;
  return finishChunkGeometry(state);
}

// ---------------------------------------------------------------------------
// Macro relief: a DataTexture normal map baked from terrainHeight in
// strip-planar UV space — cliffs and ridges get per-pixel light response far
// beyond the vertex density.
// ---------------------------------------------------------------------------

// Bake the normal texels [i0..i1] x [j0..j1] (inclusive) into `data`, sampling
// the CURRENT terrainHeight. The full build and the editor's partial rebake
// share this one path so a partial rebake is byte-identical to a full one:
// heights are sampled one texel beyond the baked rect (clamped at the texture
// border, exactly like the full bake's clamped derivative stencil).
function bakeNormalRegion(
  data: Uint8Array,
  seed: number,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
): void {
  const w = NORMAL_TEX_W,
    h = NORMAL_TEX_H;
  const worldW = WORLD_MAX_X * 2;
  const worldD = WORLD_MAX_Z - WORLD_MIN_Z;
  const stepX = worldW / w;
  const stepZ = worldD / h;
  // height window: the baked rect plus the 1-texel derivative stencil
  const hi0 = Math.max(0, i0 - 1),
    hi1 = Math.min(w - 1, i1 + 1);
  const hj0 = Math.max(0, j0 - 1),
    hj1 = Math.min(h - 1, j1 + 1);
  const hw = hi1 - hi0 + 1;
  const heights = new Float32Array(hw * (hj1 - hj0 + 1));
  for (let j = hj0; j <= hj1; j++) {
    const z = WORLD_MIN_Z + (j + 0.5) * stepZ;
    for (let i = hi0; i <= hi1; i++) {
      heights[(j - hj0) * hw + (i - hi0)] = terrainHeight(
        -WORLD_MAX_X + (i + 0.5) * stepX,
        z,
        seed,
      );
    }
  }
  const hAt = (i: number, j: number): number => heights[(j - hj0) * hw + (i - hi0)];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const iw = Math.max(0, i - 1),
        ie = Math.min(w - 1, i + 1);
      const jn = Math.max(0, j - 1),
        js = Math.min(h - 1, j + 1);
      const dhdx = (hAt(ie, j) - hAt(iw, j)) / ((ie - iw) * stepX);
      const dhdz = (hAt(i, js) - hAt(i, jn)) / ((js - jn) * stepZ);
      const nx = -dhdx * NORMAL_TEX_STRENGTH;
      const nz = -dhdz * NORMAL_TEX_STRENGTH;
      const inv = 1 / Math.hypot(nx, 1, nz);
      const o = (j * w + i) * 4;
      data[o] = (nx * inv * 0.5 + 0.5) * 255;
      data[o + 1] = (nz * inv * 0.5 + 0.5) * 255; // green follows +v (+z)
      data[o + 2] = (inv * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
}

function terrainNormalTexture(): THREE.DataTexture {
  const data = new Uint8Array(NORMAL_TEX_W * NORMAL_TEX_H * 4);
  // Zone texels are baked on demand. Unloaded areas remain a flat normal and
  // have no geometry, so they cannot be sampled on screen.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, NORMAL_TEX_W, NORMAL_TEX_H, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  // Mipmapped minification (DataTexture defaults it off): the bake packs the
  // terraces' near-vertical risers next to flat treads at 0.56u/texel, and
  // sampling that unfiltered from a distant camera aliases the lighting into
  // shimmering checker patterns. Mips average the relief away smoothly with
  // distance instead. WebGL2 handles the NPOT mip chain; the editor's
  // rebakeNormalRegion re-upload regenerates it automatically.
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = NORMAL_ANISOTROPY;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

// Editor brush cursor: a soft additive ring projected onto the ground in world
// XZ space, injected into BOTH terrain materials so it reads identically on the
// splat and Lambert tiers. One shared uniform-value set per terrain view; the
// uniform objects are installed once at material build (onBeforeCompile) and
// per-frame updates only write .value, never rebuild a material. Radius 0
// disables (the default), so the shipped game pays one uniform branch and
// nothing else.
interface BrushUniforms {
  uBrushCenter: { value: THREE.Vector2 };
  uBrushRadius: { value: number };
  uBrushColor: { value: THREE.Color };
}

function makeBrushUniforms(): BrushUniforms {
  return {
    uBrushCenter: { value: new THREE.Vector2(0, 0) },
    uBrushRadius: { value: 0 },
    uBrushColor: { value: new THREE.Color(0x6fd2ff) },
  };
}

// Two smoothsteps: a feathered rise to the radius and a feathered fall past it.
const BRUSH_RING_GLSL = /* glsl */ `
uniform vec2 uBrushCenter;
uniform float uBrushRadius;
uniform vec3 uBrushColor;
vec3 wocBrushRing(vec2 p) {
  if (uBrushRadius <= 0.0) return vec3(0.0);
  float d = distance(p, uBrushCenter);
  float w = max(0.28, uBrushRadius * 0.055);
  float ring = smoothstep(uBrushRadius - w, uBrushRadius, d)
             * (1.0 - smoothstep(uBrushRadius, uBrushRadius + w, d));
  return uBrushColor * ring * 1.35;
}
`;

// Fragment-only relief for the splat ground: offset parallax plus a cavity
// shading term, both driven by the packs' authored AO maps (packed offline
// into one RGBA texture: R grass, G dirt, B rock, A sand). Vertex
// displacement is deliberately not an option here, at any amplitude: selection
// rings, feet placement and water shorelines all sample the analytic height
// field in src/sim, and moving the visual mesh off it breaks them.
//
// The previous proxy used splat albedo luminance centred on 0.45 — but the
// albedo samplers are sRGB, so the shader receives LINEAR values whose real
// means are 0.06-0.18. The 0.28-0.39 DC bias ate the whole parallax clamp:
// at the default chase-camera pitch, dirt and rock produced a constant UV
// slide with zero relief modulation. The AO channels below are centred on
// their measured means instead, so the signal is zero-mean by construction —
// and mip averaging returns it to zero with distance, fading both parallax
// and cavity out for free.
// One clod-scale step toward the sun in ground-UV space, inlined into the
// micro-shadow branch at material build (tuv = xz * 0.22 maps +uv straight
// onto +world-xz, so the sun azimuth needs no basis change).
const SUN_UV_STEP = (() => {
  const h = Math.hypot(SUN_DIR.x, SUN_DIR.z) || 1;
  return {
    x: ((SUN_DIR.x / h) * 0.016).toFixed(5),
    y: ((SUN_DIR.z / h) * 0.016).toFixed(5),
  };
})();

const GROUND_RELIEF_GLSL = /* glsl */ `
// 0.16 (was 0.14): with Ground048's near-flat crumble AO the dirt offset read
// as a decal slide; Ground023's AO carries real clod/stone height, and the
// bump keeps paths visibly standing up at grazing chase-camera angles.
const float WOC_PARALLAX_SCALE = 0.16;
const float WOC_PARALLAX_CLAMP = 0.04;   // UV units, ~0.18 world: past this it swims
float wocGroundHeight(vec2 uv, vec4 sw) {
  vec4 aoBase = texture2D(uGroundAO, uv);      // grass + sand share the base tiling
  float aoDirt = texture2D(uGroundAO, uv * 0.8).g;
  float aoRock = texture2D(uGroundAO, uv * 0.6).b;
  // means measured by scripts/assets/pack_ground_ao.mjs; B (rock) is the
  // Rock026/Rock060 displacement blend, centred like the AO channels so the
  // signal stays zero-mean and mips fade it out with distance
  return (aoBase.r - 0.812) * sw.x
       + (aoDirt - 0.897) * sw.y
       + (aoRock - 0.623) * sw.z
       + (aoBase.a - 0.883) * sw.w;
}
// Coarse soil-clump octave, one repeat per ~28 yards. The fine cavity above
// lives at the texture's native tiling, where mip averaging pulls it to zero
// within chase-camera distance — this octave's features are ~6x larger, so
// they keep shading the mid-field where the player actually looks. Uses the
// dirt channel for every layer: grass's own AO is near-uniform (sd 0.018),
// and BSL-style ground reads come from soil structure under the grass, not
// from the grass sheet itself.
float wocGroundMacroRelief(vec2 uv) {
  return texture2D(uGroundAO, uv * 0.16).g - 0.897;
}
`;

function buildSplatMaterial(
  normalTex: THREE.DataTexture,
  brush: BrushUniforms,
): THREE.MeshStandardMaterial {
  // Legacy canvas splats are still generated (result unused): textures.ts
  // shares one LCG across all generators, so dropping this call would shift
  // the look of every texture generated after it (foliage, props, ...).
  groundSplatMaps();
  const macro = macroNoiseTexture();
  const t = TERRAIN_TEX;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(1.15, 1.15),
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, brush);
    Object.assign(sh.uniforms, {
      uGrass: { value: t.grassC },
      uGrassN: { value: t.grassN },
      uDirt: { value: t.dirtC },
      uDirtN: { value: t.dirtN },
      uRock: { value: t.rockC },
      uRockN: { value: t.rockN },
      uSand: { value: t.sandC },
      uSandN: { value: t.sandN },
      uMud: { value: t.mudC },
      uSnow: { value: t.snowC },
      uMacro: { value: macro },
      uGroundAO: { value: t.groundAO },
    });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aSplat;
        attribute vec4 aExtra;
        varying vec4 vSplat;
        varying vec4 vExtra;
        varying vec3 vWPos;
        varying vec3 vWNorm;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSplat = aSplat;
        vExtra = aExtra;
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWNorm = objectNormal; // terrain mesh is untransformed: object == world`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vSplat;
        varying vec4 vExtra;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        uniform sampler2D uGrass, uGrassN, uDirt, uDirtN, uRock, uRockN, uSand, uSandN, uMud, uSnow, uMacro, uGroundAO;
        ${GROUND_RELIEF_GLSL}
        ${BRUSH_RING_GLSL}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += wocBrushRing(vWPos.xz);`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 tuv = vWPos.xz * 0.22;
        // Fragment-side splat reshape: the vertex-interpolated dirt weight
        // crosses triangles linearly, so a path edge is a chain of straight
        // segments that reads as sawtooth triangles the moment shading
        // contrast lands on it. Re-thresholding against AO noise moves the
        // boundary at texel scale instead: crisper, and it wanders like a
        // real worn margin instead of tracing the mesh. The other layers
        // give up weight pro rata so the four still sum to one.
        vec4 vSplatR = vSplat;
        // bn is hoisted out of the reshape block: the path-wear bands below
        // reuse it so their margins wander with the same worn-edge noise.
        float bn = texture2D(uGroundAO, tuv * 0.5).g - 0.897;
        {
          float shaped = smoothstep(0.32, 0.68, vSplat.y + bn * 1.1);
          float rest = max(1.0 - vSplat.y, 1e-4);
          float restScale = (1.0 - shaped) / rest;
          vSplatR = vec4(vSplat.x * restScale, shaped, vSplat.z * restScale, vSplat.w * restScale);
        }
        // Offset parallax: slide the ground UVs along the view ray by the
        // AO height proxy, so the painted clods and stones stand up at
        // grazing angles instead of reading as a decal on flat ground. Rock and
        // dirt carry it hardest, grass and sand take a light pass. Faded by
        // slope (planar-XZ UVs stretch on cliffs, the same reason the detail
        // normals fade below) and by distance, where mips have averaged the
        // relief away and an offset would only shimmer. Everything below
        // reuses tuv, so the detail normals follow the same height proxy and
        // lighting agrees with the displacement.
        vec3 pRay = cameraPosition - vWPos;
        float pDist = length(pRay);
        float upW = normalize(vWNorm).y;
        float pRelief = (vSplatR.x * 0.55 + vSplatR.y + vSplatR.z * 0.9 + vSplatR.w * 0.35)
          * (1.0 - vExtra.y)
          * smoothstep(0.55, 0.85, upW)
          * (1.0 - smoothstep(16.0, 44.0, pDist));
        if (pRelief > 0.015) {
          // planar-XZ UVs put the tangent frame on world x/z with world y as
          // the surface normal, so the ray projects without a TBN; the divisor
          // floor is the grazing-angle limiter (an unclamped 1/y diverges)
          vec2 pDir = pRay.xz / max(pRay.y, pDist * 0.3);
          vec2 pOff = clamp(
            pDir * wocGroundHeight(tuv, vSplatR) * WOC_PARALLAX_SCALE * pRelief,
            -WOC_PARALLAX_CLAMP, WOC_PARALLAX_CLAMP);
          ${
            // refine on high as well as ultra: the second wocGroundHeight read
            // is three taps of the 512^2 packed AO texture, far under the high
            // tier's frame budget, and it is what keeps clod edges from
            // overshooting and swimming at grazing view angles
            GFX.tier === 'ultra' || GFX.tier === 'high'
              ? `// second iteration: re-read the height where the first offset
          // landed, which keeps steep clod edges from overshooting
          pOff = clamp(
            pDir * wocGroundHeight(tuv + pOff, vSplatR) * WOC_PARALLAX_SCALE * pRelief,
            -WOC_PARALLAX_CLAMP, WOC_PARALLAX_CLAMP);`
              : ''
          }
          tuv += pOff;
        }
        // Cavity shading: the same zero-mean AO signal, applied to the diffuse
        // directly. Unlike the parallax it is view-independent, so the clods
        // and stones still read from the high pitched-down chase camera where
        // a grazing-angle offset does nothing. Mip averaging pulls the signal
        // to zero with distance, so the far field keeps its painted colour.
        float cavH = wocGroundHeight(tuv, vSplatR);
        // tighter slope fade than before: the AO/relief signal lives in the
        // planar-XZ projection, which stretches on banks — full-strength
        // cavity there amplified the stretch into vertical streaking
        float cavW = (1.0 - vExtra.y) * smoothstep(0.62, 0.88, upW);
        // fine pores + coarse soil clumps: the macro octave carries the read
        // out past the distance where mips flatten the fine one, and grass
        // (whose own AO sheet is near-uniform) takes it at full weight so
        // meadows undulate instead of rendering as one green wash
        float relief = cavH * 3.8 + wocGroundMacroRelief(tuv) * (0.5 + vSplatR.x * 0.5) * 4.2;
        // turf lip: where grass feathers into bare soil (roads, patches),
        // shade the transition band so paths sit INTO the meadow as worn
        // hollows instead of lying on it as paint. Broken up by the fine AO
        // signal so the lip reads as crumbled soil edge, not a drawn contour
        // (a clean contour also traces the coarse vertex splat into visible
        // triangle steps — the earlier derivative-based normal tilt made the
        // same triangulation read as hard facets and is gone for that reason).
        float rim = vSplatR.y * (1.0 - vSplatR.y) * 4.0 * clamp(0.55 + cavH * 4.0, 0.2, 1.2);
        float groundShade = mix(1.0, clamp(1.0 + relief, 0.38, 1.28) * (1.0 - rim * 0.17), cavW);
        ${
          GFX.tier === 'ultra'
            ? `// micro sun-shadow: terrain never casts real shadows at any
        // scale, so march the height proxy two steps toward the sun and shade
        // texels whose sunward neighbourhood sits higher — clod-scale
        // self-shadowing that gives the relief a lit and a shade side.
        {
          vec2 sunStep = vec2(${SUN_UV_STEP.x}, ${SUN_UV_STEP.y});
          float occl = max(
            wocGroundHeight(tuv + sunStep, vSplatR) - cavH - 0.02,
            (wocGroundHeight(tuv + sunStep * 2.2, vSplatR) - cavH) * 0.55 - 0.02);
          groundShade *= 1.0 - min(max(occl, 0.0) * 4.5, 0.42) * cavW;
        }`
            : ''
        }
        // hill-scale macro noise, hoisted above the grass blend so the grass
        // octave balance, the rock wall blend, and the hue drift below all
        // share one tap
        float macro2 = texture2D(uMacro, vWPos.xz * 0.0045 + 0.37).r;
        // grass blends two scales so the 1K photo source never reads as tile.
        // The second octave samples with swapped/negated components (a 90
        // degree rotation), so the two scales can never phase-align into a
        // shared repeat; the blend weight wanders with the hill-scale macro
        // noise so different hills favor different octaves instead of every
        // meadow sharing one fixed balance. Base weight 0.50 (was 0.42):
        // leaning toward the coarse octave softens the uniform blade stipple
        // that read as repeating noise underfoot, without losing the lush
        // and dark patch structure the macro terms carry.
        vec3 grassAlb = mix(
          texture2D(uGrass, tuv).rgb,
          texture2D(uGrass, vec2(-tuv.y, tuv.x) * 0.31).rgb,
          0.50 + (macro2 - 0.5) * 0.3);
        // rock: top-down projection smears into vertical streaks on cliffs,
        // so steep faces blend toward wall-planar (world XY/ZY) samples
        vec3 an = abs(normalize(vWNorm));
        float wallW = clamp(1.0 - an.y * 1.45, 0.0, 1.0);
        float axisW = an.x / max(1e-4, an.x + an.z);
        // dirt smears the same way and shows it sooner (paths climb banks the
        // player stands right next to), so it takes its own wall blend with a
        // gentler onset than rock's cliff threshold
        float dirtWallW = smoothstep(0.1, 0.42, 1.0 - an.y);
        // --- de-carpeted dirt: multi-scale soil instead of one speckle ---
        // A rotated second dirt octave (0.63x the base 0.8 scale, 37 degrees:
        // cos 0.799 and sin 0.601 folded into the constants), lerped by a
        // ~9yd macro mask: the two scales can never phase-align into one
        // repeat, and patches of coarse and fine soil mottle into each other
        // instead of averaging to mush (same idiom as the grass octave pair).
        vec2 dirtUv2 = vec2(tuv.x * 0.403 - tuv.y * 0.303, tuv.x * 0.303 + tuv.y * 0.403);
        float dirtOctMask = texture2D(uMacro, vWPos.xz * 0.11 + 0.29).r;
        vec3 dirtFlat = mix(
          texture2D(uDirt, tuv * 0.8).rgb,
          texture2D(uDirt, dirtUv2).rgb,
          0.22 + dirtOctMask * 0.5);
        // Two macro octaves hand the soil the low-frequency structure a photo
        // tile cannot carry: ~6yd value mottling (footworn patches) and ~20yd
        // value plus grey-brown hue drift (damp hollows). Both reuse uMacro;
        // combined value swing tops out near +-13%.
        float dirtMac6 = texture2D(uMacro, vWPos.xz * 0.17 + 0.61).r - 0.5;
        float dirtMac20 = texture2D(uMacro, vWPos.xz * 0.052 + 0.13).r - 0.5;
        dirtFlat *= 1.0 + dirtMac6 * 0.16 + dirtMac20 * 0.22;
        vec3 dirtGrey = vec3(dot(dirtFlat, vec3(0.35, 0.45, 0.2))) * vec3(1.0, 0.97, 0.9);
        dirtFlat = mix(dirtFlat, dirtGrey, clamp(0.18 + dirtMac20 * 0.4, 0.0, 0.6));
        // Path wear across the trail: the vertex dirt weight sits near 0.85
        // at a trail's core and feathers out over ~1.4yd at the margin, so it
        // doubles as a smooth cross-path coordinate. The core reads compacted
        // (a touch lighter, smoother, tighter), the margin reads kicked-up
        // (slightly darker, rougher); bn wanders both bands at texel scale so
        // neither traces the vertex mesh into sawteeth. Faded by the marsh
        // mud swap: wet mud does not wear like packed earth. The roughness
        // and detail-normal chunks below reuse pathCore/pathEdge.
        float pathCore = smoothstep(0.55, 0.92, vSplat.y + bn * 0.6) * (1.0 - vExtra.x);
        float pathEdge = vSplatR.y * (1.0 - pathCore) * (1.0 - vExtra.x);
        dirtFlat *= 1.0 + pathCore * 0.07 - pathEdge * 0.05;
        dirtFlat = mix(dirtFlat, texture2D(uMud, tuv * 0.8).rgb, vExtra.x);
        // Trails read as packed grit, not smooth brown paint: fold a
        // high-frequency rock tap into the dry dirt (no new sampler, the
        // material sits at 15 of 16). The weight fades with the marsh mud
        // swap so wet mud keeps its smooth sheen. 0.10 (was 0.16): with the
        // macro soil structure above, the old weight let single-scale
        // micro-grain dominate the read again, the exact carpet failure.
        float gravelW = 0.10 * (1.0 - vExtra.x);
        dirtFlat = mix(dirtFlat, texture2D(uRock, tuv * 2.8).rgb, gravelW);
        vec3 dirtWall = mix(
          texture2D(uDirt, vWPos.xy * 0.176).rgb,
          texture2D(uDirt, vWPos.zy * 0.176).rgb,
          axisW);
        // marsh swaps packed dirt for wet mud (roads, hub discs included)
        vec3 dirtAlb = mix(dirtFlat, dirtWall, dirtWallW);
        // Flat rock (scree, summits, outcrops) mottles between two scales the
        // way grass and dirt do: a second tap of the same rock at 0.55x the
        // base 0.6 scale, rotated 52 degrees (cos 0.616 and sin 0.788 folded
        // into the constants), lerped by a ~30yd macro mask so no two
        // outcrops share one tiling period.
        vec2 rockUv2 = vec2(tuv.x * 0.203 - tuv.y * 0.260, tuv.x * 0.260 + tuv.y * 0.203);
        float rockOctMask = texture2D(uMacro, vWPos.xz * 0.033 + 0.83).r;
        vec3 rockFlat = mix(
          texture2D(uRock, tuv * 0.6).rgb,
          texture2D(uRock, rockUv2).rgb,
          0.2 + rockOctMask * 0.5);
        // macro2 (hoisted above the grass blend) also drives the wall plate
        // mix, so plate zones vary across a mountainside without spending a
        // second uMacro tap on cliff fragments
        // Anti-corduroy wall projection. A single-scale planar projection
        // hands every cliff the same tiling period, and any directional bias
        // in the source repeats in lockstep down the whole face, and that is
        // the corduroy. Two breaks: each plane folds a ~3x coarser octave over the
        // base scale (no single period survives at mountain distance), and the
        // ZY plane samples with its axes swapped, a 90-degree rotation, so the
        // two wall planes can never share stripe alignment even where they
        // meet at a corner. The octave ratio wanders with the hill-scale
        // macro noise so plate zones read as geology, not wallpaper.
        // rockDrift (~25yd) varies the plate-octave ratio span by span on top
        // of macro2's hill-scale wander, and drives the stone hue drift after
        // the wall blend, so adjacent cliff spans stop reading as copies.
        float rockDrift = texture2D(uMacro, vWPos.xz * 0.041 + 0.47).r;
        float plateMix = 0.58 + (macro2 - 0.5) * 0.55 + (rockDrift - 0.5) * 0.3;
        vec3 rockWall = mix(
          mix(texture2D(uRock, vWPos.xy * 0.132).rgb,
              texture2D(uRock, vWPos.xy * 0.043).rgb, plateMix),
          mix(texture2D(uRock, vWPos.yz * 0.132).rgb,
              texture2D(uRock, vWPos.yz * 0.043).rgb, plateMix),
          axisW);
        vec3 rockAlb = mix(rockFlat, rockWall, wallW);
        // Macro stone drift: cooler grey patches against warmer tan ones,
        // +-6% value folded into the tint. XZ-keyed so it varies along a
        // wall's run rather than repeating down its height.
        rockAlb *= mix(vec3(0.94, 0.97, 1.04), vec3(1.06, 1.0, 0.92), rockDrift);
        // Cliff cavity: groundShade's planar AO fades out by slope on purpose
        // (its XZ projection streaks on banks), which left steep faces
        // shadeless. Re-sample the packed B channel (the Rock026/Rock060
        // displacement blend) through the same wall-planar frames as the
        // projected rock albedo, at the coarse octave only, so it shades
        // whole fracture plates rather than re-tracing the fine tiling the
        // albedo mix just broke up. Centred on the channel's measured mean
        // like wocGroundHeight, so mip averaging fades it out with distance
        // for free.
        float wallCav = mix(
          texture2D(uGroundAO, vWPos.xy * 0.043).b,
          texture2D(uGroundAO, vWPos.yz * 0.043).b,
          axisW) - 0.623;
        groundShade *= mix(
          1.0, clamp(1.0 + wallCav * 2.6, 0.58, 1.18),
          vSplatR.z * wallW * (1.0 - vExtra.y));
        vec3 alb = grassAlb * vSplatR.x
                 + dirtAlb * vSplatR.y
                 + rockAlb * vSplatR.z
                 + texture2D(uSand, tuv).rgb * vSplatR.w;
        // snow cover on the peaks/rim, by baked per-vertex weight
        alb = mix(alb, texture2D(uSnow, tuv * 0.7).rgb, vExtra.y);
        // Wet shoreline: within ~1.6u above the waterline (WATER_LEVEL is
        // inlined from src/sim/world.ts at material build), sand and dirt
        // darken and tighten as if soaked, so every shore carries a wet
        // margin instead of dry ground meeting water at a hard line. Pure
        // math on values already sampled: no extra tap. The roughness chunk
        // below reuses wetW for the damp sheen.
        float shoreWet = (1.0 - smoothstep(${(WATER_LEVEL + 0.1).toFixed(2)},
          ${(WATER_LEVEL + 1.6).toFixed(2)}, vWPos.y)) * (1.0 - vExtra.y);
        float wetW = shoreWet * clamp(vSplatR.w + vSplatR.y * 0.85, 0.0, 1.0);
        alb *= 1.0 - wetW * 0.22;
        // Third, very-low-frequency ground variety (~300u wavelength): a
        // subtle warm/cool hue swing so far-apart regions stop sharing one
        // identical tone. Applied before the impact mix so authored crater
        // colours stay exact; damped under snow so peaks stay clean.
        float macro3 = texture2D(uMacro, vWPos.xz * 0.003 + 0.71).r;
        vec3 hue3 = mix(vec3(1.04, 1.005, 0.96), vec3(0.96, 0.995, 1.04), macro3);
        alb *= mix(vec3(1.0), hue3, 1.0 - vExtra.y * 0.5);
        // macro brightness swing breaks distant tiling
        float macro = mix(0.88, 1.12, texture2D(uMacro, vWPos.xz * 0.012).r);
        // Meteor impact terrain is authored by the same crater profile as the
        // heightfield. Apply it in albedo space so the PBR textures do not wash
        // the crater floor back toward marsh sand.
        vec3 impactAlb = mix(vec3(0.20, 0.08, 0.035), vec3(0.055, 0.040, 0.032), vExtra.w);
        alb = mix(alb, impactAlb, clamp(vExtra.z * 0.86 + vExtra.w * 0.18, 0.0, 0.96));
        // very-low-frequency hue drift (~100u wavelength) keeps distant
        // hills from flattening into one uniform lawn green (macro2 itself is
        // sampled up by the rock wall blend, which shares it)
        alb = mix(alb, alb * vec3(1.07, 1.03, 0.86), (macro2 - 0.5) * 0.75 * vSplat.x);
        // real albedo carries the hue now; vertex color only modulates gently
        // so the biome painting (roads, hub discs, snowline) still reads.
        // (vColor was authored as a full sRGB ground color, so re-centre it
        // around 1.0 before using it as a multiplier.)
        vec3 vtint = clamp(vColor.rgb * 2.0, 0.0, 2.0);
        diffuseColor.rgb *= alb * mix(vec3(1.0), vtint, 0.35) * macro * groundShade;`,
      )
      .replace(
        '#include <color_fragment>',
        `
        // vertex color already folded into the splat albedo above (gently);
        // the stock full multiply would re-tint the real textures to mush`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `
        // The macro swing doubles as a per-material surface break-up: loose
        // layers (dirt, sand) take it strongly so they read as damp/dry
        // patches, rock takes little so stone stays tight and specular.
        float roughBreak = (macro - 1.0) * (vSplatR.y * 1.4 + vSplatR.z * 0.4 + vSplatR.w * 0.9);
        float roughnessFactor = roughness * clamp(mix(
          dot(vSplatR, vec4(${ROUGH_GRASS}, mix(${ROUGH_DIRT}, ${ROUGH_MUD}, vExtra.x), ${ROUGH_ROCK}, ${ROUGH_SAND})),
          ${ROUGH_SNOW}, vExtra.y) + roughBreak, 0.35, 1.0);
        // path wear (pathCore/pathEdge from the albedo chunk): compacted
        // trail cores tighten a touch, kicked-up margins scatter more
        roughnessFactor += (pathEdge * 0.05 - pathCore * 0.06) * vSplatR.y;
        // Cliff faces at ROUGH_ROCK read sheeny under the low sun: weathered
        // stone scatters, so steepness pushes rock toward full matte (snow
        // keeps its own response via the vExtra.y damp). A uniform 0.95 made
        // big faces read as one flat sheet, though: raised plate centres
        // (positive wallCav, the coarse displacement blend already sampled for
        // cavity) ease back toward 0.8 so a mountainside reads faceted, each
        // plate catching the light a little differently.
        float plateHi = smoothstep(0.02, 0.14, wallCav);
        roughnessFactor = mix(roughnessFactor, mix(0.95, 0.8, plateHi),
          vSplatR.z * wallW * (1.0 - vExtra.y));
        // wet shoreline (wetW from the albedo chunk): soaked sand and dirt
        // tighten toward a damp sheen instead of staying bone-dry matte
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.55), wetW);
        // Snow sparkle: tiny speckle cells pull toward glossy so sun-facing
        // snow glints. The hash folds in the fine AO height already sampled
        // (cavH), so speckles sit on the texture grain rather than a bare
        // grid: no new texture tap. Distance-faded so far snow stays matte
        // and never shimmers; overall snow keeps its matte ROUGH_SNOW base.
        float sparkCell = fract(sin(dot(floor(vWPos.xz * 12.0),
          vec2(127.1, 311.7)) + cavH * 41.0) * 43758.5453);
        float snowSpark = step(0.94, sparkCell)
          * smoothstep(0.45, 0.85, vExtra.y)
          * (1.0 - smoothstep(18.0, 55.0, pDist));
        roughnessFactor = mix(roughnessFactor, 0.55, snowSpark * 0.8);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // per-layer detail normals (GL-convention), weighted by splat: rock
        // carries the hardest relief, then dirt, grass moderate, sand soft
        vec3 gN = texture2D(uGrassN, tuv).xyz * 2.0 - 1.0;
        vec3 dN = texture2D(uDirtN, tuv * 0.8).xyz * 2.0 - 1.0;
        vec3 rN = texture2D(uRockN, tuv * 0.6).xyz * 2.0 - 1.0;
        vec3 sN = texture2D(uSandN, tuv).xyz * 2.0 - 1.0;
        // A second octave at 4x the base tiling: without it the ground is one
        // blurred frequency underfoot and reads as plastic. Two taps rather
        // than one per layer, since the octave only supplies grain and its
        // source map is indistinguishable once summed into a layer's normal:
        // the hard layers share the crisp tap, the soft layers the gentle one.
        vec2 fineHard = texture2D(uRockN, tuv * 2.4).xy * 2.0 - 1.0;
        // 3.0 (was 4.0): slightly larger blotches so the finest grass octave
        // stops reading as one uniform repeating stipple underfoot
        vec2 fineSoft = texture2D(uGrassN, tuv * 3.0).xy * 2.0 - 1.0;
        // gravel grain at the trail albedo's own tap scale, so the grit a
        // path shows is lit rather than painted (gravelW already fades it
        // with the marsh mud swap)
        vec2 gvN = texture2D(uRockN, tuv * 2.8).xy * 2.0 - 1.0;
        // wet mud lumps smoothly where dry dirt crumbles; footworn trail
        // cores are packed smoother than their kicked-up margins (pathCore
        // from the albedo chunk)
        float dirtDetail = (1.0 - vExtra.x * 0.35) * (1.0 - pathCore * 0.3);
        // dirt micro-grain eased (1.55/0.7/0.5, were 1.8/0.9/0.7): the macro
        // soil octaves own the mid-scale read now, and the old weights let
        // single-frequency speckle dominate again; grass fine octave down to
        // 0.65 for the same reason, its blade normal gN keeps full weight
        vec2 detN = (gN.xy + fineSoft * 0.65) * vSplatR.x * 1.5
                  + (dN.xy + fineHard * 0.7 + gvN * gravelW * 0.5) * vSplatR.y * 1.55 * dirtDetail
                  + (rN.xy + fineHard * 0.9) * vSplatR.z * 1.5 * (1.0 - wallW)
                  + (sN.xy + fineSoft * 0.9) * vSplatR.w * 1.1;
        detN *= 1.0 - vExtra.y * 0.7; // snow softens the relief beneath it
        // Planar-XZ UVs stretch on steep faces and the detail normals smear
        // into vertical streaks there; fade them out by slope and let the
        // wall projection below own the cliff relief.
        detN *= smoothstep(0.5, 0.82, vWNorm.y);
        normal = normalize(normal + tbn * vec3(detN, 0.0));
        // cliffs: wall-projected rock normal so steep faces get real relief
        // (approximate world-space tangent frames per projection plane; the
        // handedness flip on back faces is invisible on noisy rock). The
        // +-x plane samples axes-swapped (yz, the same 90-degree rotation as
        // the albedo/cavity taps above) so whatever directional bias survives
        // in the normal map can never line up across the two wall planes
        // (matching stripe phase on adjacent planes is what read as corduroy).
        if (vSplat.z * wallW > 0.01) {
          vec3 rNx = texture2D(uRockN, vWPos.yz * 0.132).xyz * 2.0 - 1.0; // +-x faces, rotated
          vec3 rNz = texture2D(uRockN, vWPos.xy * 0.132).xyz * 2.0 - 1.0; // +-z faces
          // rotated frame: the yz sample's tangent u runs along world y and
          // v along world z, so its xy perturbation lands on (0, n.x, n.y)
          vec3 wallPerturb = mix(vec3(rNz.x, rNz.y, 0.0), vec3(0.0, rNx.x, rNx.y), axisW);
          // 1.1 (was 0.8): the projected relief flattened against the
          // strengthened planar detail normals and cliffs read smooth
          normal = normalize(normal + mat3(viewMatrix) * wallPerturb * (vSplat.z * wallW * 1.1));
        }`,
      );
  };
  return mat;
}

function buildLambertMaterial(brush: BrushUniforms): THREE.MeshLambertMaterial {
  const detail = groundDetailTexture();
  // strip-planar uv: keep the legacy ~2.25u texture period in both axes
  detail.repeat.set(160, 480);
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: detail,
    emissive: GFX.lowPlus ? 0x182014 : 0x000000,
    emissiveIntensity: GFX.lowPlus ? 0.08 : 1,
  });
  // The Lambert tier has no world-position varying of its own, so the brush
  // patch carries one (r165 chunk names; same idiom as the splat patch above).
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, brush);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWocWPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWocWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWocWPos;
        ${BRUSH_RING_GLSL}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += wocBrushRing(vWocWPos.xz);`,
      );
  };
  return mat;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface EnsureZoneOptions {
  /** Build the cells nearest this point first (e.g. the entry position).
   *  Falls back to buildTerrain's priorityPoint when omitted. */
  priority?: { x: number; z: number };
  /** 'fast' (default): the caller is gating on the result (boot, a teleport
   *  behind the loading screen), so yield only between small batches.
   *  'idle': a background prepare; every batch waits for a browser idle slot
   *  (requestIdleCallback with a forced-progress timeout) so the build never
   *  steals time an interactive frame needs. */
  pace?: 'fast' | 'idle';
}

export interface TerrainView {
  group: THREE.Group;
  /** Materialize one overworld zone. Repeated calls share the cached task. */
  ensureZone(
    zone: ZoneDef,
    onProgress?: (done: number, total: number) => void,
    opts?: EnsureZoneOptions,
  ): Promise<void>;
  isZoneLoaded(zoneId: string): boolean;
  /**
   * The chunk lattice this view builds on, plus whether a given cell still owes
   * geometry. The outdoor fog clamp reads ground residency through this narrow
   * accessor (never through the renderer's zone-level `preparedZones`), so it
   * stops at the nearest UNBUILT CHUNK rather than the nearest unprepared zone
   * rectangle, and so retiring zone residency later is one implementation swap.
   * The returned object is stable across calls: it is read every frame.
   */
  groundResidency(): { grid: ChunkGrid; isPending: GroundPendingAt };
  /** hides chunks that sit entirely past the fog far plane */
  update(camX: number, camZ: number, fogFar: number): void;
  /**
   * Editor-only: re-mesh ONLY the chunks intersecting the world-space region
   * (a sculpt brush footprint), swapping each geometry in place on the existing
   * mesh (old geometry disposed, shared material kept). Cheap enough to run
   * several times per second during a brush drag; the stale macro normal
   * texture is NOT touched here (see rebakeNormalRegion, for stroke end).
   */
  rebuildRegion(minX: number, minZ: number, maxX: number, maxZ: number): void;
  /**
   * Editor-only: rebake the region's texels of the macro normal DataTexture
   * from the current terrainHeight and flag it for re-upload. Byte-identical
   * to a full bake over those texels. Call at stroke end, never per drag
   * sample. No-op on the Lambert tier (it has no normal map).
   */
  rebakeNormalRegion(minX: number, minZ: number, maxX: number, maxZ: number): void;
  /**
   * Editor-only: project the brush ring at world (x, z) with the given radius
   * (yards) onto both terrain materials. Writes uniform values only (no
   * material rebuild). Radius <= 0 hides the ring, as does clearBrush().
   */
  setBrush(x: number, z: number, radius: number, color?: THREE.ColorRepresentation): void;
  /** Editor-only: hide the brush ring. */
  clearBrush(): void;
  /**
   * Stops any in-flight ensureZone build from adding further chunks. Call
   * before discarding this view (see renderer rebuildTerrain), or the
   * abandoned zone builds keep running on a setTimeout chain.
   */
  cancelStreaming(): void;
}

export function buildTerrain(seed: number, priorityPoint?: { x: number; z: number }): TerrainView {
  const lowGfx = !GFX.terrainSplat || !hasTerrainSplatAssets();
  // Resolved here, not inside the generator: gfx.ts reads document/navigator, so
  // a worker running the same generator would resolve a different tier.
  const lowShade = GFX.lowPlus && !GFX.terrainSplat;
  const brush = makeBrushUniforms();
  const normalTex = lowGfx ? null : terrainNormalTexture();
  const mat = normalTex ? buildSplatMaterial(normalTex, brush) : buildLambertMaterial(brush);
  const bands = lowGfx ? LOD_BANDS.low : LOD_BANDS.high;
  const group = new THREE.Group();
  group.name = 'terrain';
  const worldDepth = WORLD_MAX_Z - WORLD_MIN_Z;
  const chunksX = Math.ceil((WORLD_MAX_X * 2) / CHUNK_SIZE);
  const chunksZ = Math.ceil(worldDepth / CHUNK_SIZE);
  const grid: ChunkGrid = {
    size: CHUNK_SIZE,
    countX: chunksX,
    countZ: chunksZ,
    originX: -WORLD_MAX_X,
    originZ: WORLD_MIN_Z,
  };
  // 1 = this cell is owed terrain geometry and has not attached it yet, which
  // is the only state that may clamp the outdoor fog. Ownership is TOTAL
  // since the gap-cell fill (cellOwnerId assigns every cell its containing
  // zone, else the nearest rectangle), so ALL 792 cells seed pending and each
  // one is genuinely buildable by its owner: pending-until-attach is the
  // correct state everywhere, and the old carve-out for unowned cells (the
  // rects do not tile; 96 cells used to be permanently unbuildable) is gone.
  const groundPending = new Uint8Array(chunksX * chunksZ);
  // x/z/half feed the per-frame fog cull; x0/z0/size/spacing are the exact
  // buildChunkGeometry inputs, kept so an editor rebuild re-runs the same build.
  const chunks: {
    mesh: THREE.Mesh;
    x: number;
    z: number;
    half: number;
    x0: number;
    z0: number;
    size: number;
    spacing: number;
  }[] = [];

  // True when the chunk cell overlaps a mountain-wall band: an inter-zone
  // ridge line (ZONES[i].zMax) or the world rim. Those chunks always take the
  // densest band; the walls sit far from every hub, so hub-distance LOD alone
  // hands the steepest, most looked-at cliffs the coarsest grid.
  const wallChunkAt = (x0: number, z0: number, size: number): boolean => {
    if (x0 < -WORLD_MAX_X + WALL_LOD_RIM_MARGIN || x0 + size > WORLD_MAX_X - WALL_LOD_RIM_MARGIN) {
      return true;
    }
    if (z0 < WORLD_MIN_Z + WALL_LOD_RIM_MARGIN || z0 + size > WORLD_MAX_Z - WALL_LOD_RIM_MARGIN) {
      return true;
    }
    for (let i = 0; i + 1 < ZONES.length; i++) {
      const ridgeZ = ZONES[i].zMax;
      if (z0 - WALL_LOD_RIDGE_HALF < ridgeZ && z0 + size + WALL_LOD_RIDGE_HALF > ridgeZ) {
        return true;
      }
    }
    return false;
  };

  // The zone rectangles do NOT tile the world box. Three kinds of cell fall
  // outside every one of them: the whole quadrant west of Eastbrook Vale (no
  // realm sits at x < -180 for z -180..180), the centre column north of
  // Frostveil, and the grid's last row, which overhangs WORLD_MAX_Z and so
  // carries the northern 20yd of the Drakelands rim. Those cells still hold
  // ground a player reaches on foot: the tongue of land running south out of
  // the Willowfen border around (-195, 161) sits 1.6yd ABOVE the waterline.
  // Leaving them unowned meant no zone's build ever meshed them, so that
  // ground rendered as a hole you could see (and fall) through.
  const zoneRects: WorldRect[] = ZONES.map((zone) => ({
    minX: zone.xMin ?? STRIP_MIN_X,
    maxX: zone.xMax ?? STRIP_MAX_X,
    minZ: zone.zMin,
    maxZ: zone.zMax,
  }));
  const insideAnyZone = (x: number, z: number): boolean =>
    zoneRects.some((r) => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ);

  const bandIndexAt = (cx: number, cz: number): number => {
    const x0 = -WORLD_MAX_X + cx * CHUNK_SIZE;
    const z0 = WORLD_MIN_Z + cz * CHUNK_SIZE;
    const centerX = x0 + CHUNK_SIZE / 2;
    const centerZ = z0 + CHUNK_SIZE / 2;
    // Cells outside every realm (see zoneRects) are open sea floor and the
    // outer face of the rim: no quest, camp, or road ever lands there, and the
    // sim drowns a player who swims out. They take the coarsest band whatever
    // wallChunkAt says, so the gap fill costs a handful of merged super-chunks
    // instead of a dense grid over water nobody stands on. Checked BEFORE the
    // wall promotion, which would otherwise hand the empty south-west quadrant
    // the 1.2u spacing meant for the terraced inter-zone walls.
    if (!insideAnyZone(centerX, centerZ)) return bands.length - 1;
    if (wallChunkAt(x0, z0, CHUNK_SIZE)) return 0;
    let hubDist = Infinity;
    for (const zn of ZONES) {
      hubDist = Math.min(hubDist, Math.hypot(centerX - zn.hub.x, centerZ - zn.hub.z));
    }
    const idx = bands.findIndex((b) => hubDist <= b.maxHubDist);
    return idx === -1 ? bands.length - 1 : idx;
  };

  // the coarsest spacing any neighbor chunk can have; sizes the slope-aware
  // skirt drop so a fine chunk's skirt always reaches past the coarsest
  // neighbor's chord (and vice versa)
  const skirtSpan = bands[bands.length - 1].spacing;

  const attachChunk = (
    geo: THREE.BufferGeometry,
    x0: number,
    z0: number,
    size: number,
    spacing: number,
  ): void => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    // Terrain casts too: without this no hill can shade its own lee side or
    // the valley under it, and open country reads shadow-flat however the
    // rig is tuned — form shadows are the difference between painted dunes
    // and lit ones. Chunks outside the 105u shadow frustum are culled from
    // the depth pass, so the cost is a dozen static meshes re-drawn there.
    mesh.castShadow = GFX.dynamicShadows;
    group.add(mesh);
    // A chunk's transform never changes after this point (its shape lives in
    // the geometry, not the mesh matrix), so it can freeze immediately rather
    // than waiting for the caller's group-wide freezeStaticMatrices pass.
    // That pass only runs once, right after the synchronous near ring returns,
    // so every chunk streamed in afterward (the majority, on the far bands)
    // would otherwise keep matrixAutoUpdate = true and recompose every frame
    // for the rest of the session.
    mesh.updateMatrixWorld(true);
    mesh.matrixAutoUpdate = false;
    // Ground residency flips HERE, where the mesh actually joins the scene, and
    // never at the point the cell is claimed for building: `built` below is set
    // BEFORE the (idle-paced, possibly multi-second) geometry build is awaited,
    // so keying the fog off it would open the view over ground that has not
    // arrived. A far-band super-chunk covers a 2x2 block, hence the span.
    const span = Math.max(1, Math.round(size / CHUNK_SIZE));
    const cx0 = Math.round((x0 + WORLD_MAX_X) / CHUNK_SIZE);
    const cz0 = Math.round((z0 - WORLD_MIN_Z) / CHUNK_SIZE);
    for (let dz = 0; dz < span; dz++) {
      for (let dx = 0; dx < span; dx++) {
        const cx = cx0 + dx;
        const cz = cz0 + dz;
        if (cx < 0 || cx >= chunksX || cz < 0 || cz >= chunksZ) continue;
        groundPending[cz * chunksX + cx] = 0;
      }
    }
    chunks.push({
      mesh,
      x: x0 + size / 2,
      z: z0 + size / 2,
      half: size / 2,
      x0,
      z0,
      size,
      spacing,
    });
  };
  const addChunk = (x0: number, z0: number, size: number, spacing: number): void => {
    attachChunk(
      buildChunkGeometry(x0, z0, size, spacing, seed, !lowGfx, skirtSpan, lowShade),
      x0,
      z0,
      size,
      spacing,
    );
  };
  // One pool per view, torn down with it. Null wherever module workers are
  // unavailable (Vitest under Node, an old WebView, a blocked CSP), in which
  // case every build below takes the main-thread path exactly as before.
  let pool: ReturnType<typeof terrainChunkPool> | null | undefined;
  const chunkPool = (): ReturnType<typeof terrainChunkPool> => {
    if (pool === undefined) pool = terrainChunkPool();
    return pool;
  };
  // A background chunk built OFF-THREAD. Generation is pure arithmetic, so the
  // only reason the idle path yields constantly is to protect frames; with no
  // frame to protect it runs flat out. Returns false only when the caller
  // should fall back, never on cancellation, which the caller checks itself.
  const addChunkInWorker = async (
    x0: number,
    z0: number,
    size: number,
    spacing: number,
  ): Promise<boolean> => {
    const active = chunkPool();
    if (!active) return false;
    const arrays = await active.build({
      x0,
      z0,
      size,
      spacing,
      seed,
      withSplat: !lowGfx,
      skirtSpan,
      lowShade,
    });
    if (!arrays) return false;
    if (cancelled) return true; // discarded view: drop the result, do not attach
    attachChunk(finishChunkGeometry(arrays), x0, z0, size, spacing);
    return true;
  };
  const addChunkIdle = async (
    x0: number,
    z0: number,
    size: number,
    spacing: number,
    yieldSlice: () => Promise<void>,
  ): Promise<boolean> => {
    if (await addChunkInWorker(x0, z0, size, spacing)) return !cancelled;
    const geo = await buildChunkGeometryIdle(
      x0,
      z0,
      size,
      spacing,
      seed,
      !lowGfx,
      skirtSpan,
      lowShade,
      yieldSlice,
      () => cancelled,
    );
    if (!geo) return false;
    attachChunk(geo, x0, z0, size, spacing);
    return true;
  };

  // far-LOD cells merge 2x2 into super-chunks: the far field is where draw
  // count hurts and culling granularity matters least
  const farBand = bands.length - 1;
  const built = new Set<number>();
  const loadedZones = new Set<string>();
  const pendingZones = new Map<string, Promise<void>>();
  // Set by cancelStreaming(): every in-flight ensureZone loop bails at its next
  // yield point without marking its zone loaded, so a discarded view (see
  // renderer rebuildTerrain) stops adding chunks instead of building on a
  // setTimeout chain for the rest of the session.
  let cancelled = false;
  // Every cell of the grid gets exactly one owner: the zone containing it,
  // else (the gap cells described at zoneRects) the nearest zone rectangle.
  // See owningRectIndex for why nearest-rect and not zoneAt's z-band clamp.
  const cellOwnerId = (cx: number, cz: number): string => {
    const x = -WORLD_MAX_X + (cx + 0.5) * CHUNK_SIZE;
    const z = WORLD_MIN_Z + (cz + 0.5) * CHUNK_SIZE;
    return ZONES[owningRectIndex(x, z, zoneRects)].id;
  };
  groundPending.fill(1);
  const residency = {
    grid,
    isPending: (cx: number, cz: number): boolean => groundPending[cz * chunksX + cx] === 1,
  };
  const zoneCells = (zone: ZoneDef): [number, number][] => {
    const out: [number, number][] = [];
    for (let cz = 0; cz < chunksZ; cz++) {
      for (let cx = 0; cx < chunksX; cx++) {
        if (cellOwnerId(cx, cz) === zone.id) out.push([cx, cz]);
      }
    }
    return out;
  };
  const yieldBuild = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  // Background ('idle') builds advance one batch per idle slot instead: the
  // timeout still forces progress under sustained load, so a later gating
  // caller awaiting the same shared task is never starved indefinitely.
  const yieldIdle = (): Promise<void> => idleSlot(IDLE_BUILD_TIMEOUT_MS);
  const normalTexelsOver = (minX: number, minZ: number, maxX: number, maxZ: number) =>
    normalTexelBounds(
      minX,
      minZ,
      maxX,
      maxZ,
      -WORLD_MAX_X,
      WORLD_MIN_Z,
      WORLD_MAX_X * 2,
      WORLD_MAX_Z - WORLD_MIN_Z,
      NORMAL_TEX_W,
      NORMAL_TEX_H,
      1,
    );
  // The macro normal texels this zone's build must bake: its own rectangle,
  // plus one region per owned cell lying outside it (the gap cells above).
  // An unbaked texel stays flat, so without the extra regions the macro relief
  // would stop dead at the realm border. Region-per-cell rather than one
  // bounding box over rect + cells: the gap west of Eastbrook Vale is as wide
  // as the realm itself, and a bbox would re-bake that whole empty quadrant.
  const normalRegionsFor = (zone: ZoneDef, cells: readonly [number, number][]): TexelBounds[] => {
    const minX = zone.xMin ?? STRIP_MIN_X;
    const maxX = zone.xMax ?? STRIP_MAX_X;
    const regions: TexelBounds[] = [];
    const zoneBounds = normalTexelsOver(minX, zone.zMin, maxX, zone.zMax);
    if (zoneBounds) regions.push(zoneBounds);
    for (const [cx, cz] of cells) {
      const x0 = -WORLD_MAX_X + cx * CHUNK_SIZE;
      const z0 = WORLD_MIN_Z + cz * CHUNK_SIZE;
      const inside =
        x0 >= minX && x0 + CHUNK_SIZE <= maxX && z0 >= zone.zMin && z0 + CHUNK_SIZE <= zone.zMax;
      if (inside) continue; // already covered by zoneBounds
      const cellBounds = normalTexelsOver(x0, z0, x0 + CHUNK_SIZE, z0 + CHUNK_SIZE);
      if (cellBounds) regions.push(cellBounds);
    }
    return regions;
  };
  const ensureZone = (
    zone: ZoneDef,
    onProgress?: (done: number, total: number) => void,
    opts?: EnsureZoneOptions,
  ): Promise<void> => {
    if (loadedZones.has(zone.id)) {
      onProgress?.(1, 1);
      return Promise.resolve();
    }
    const pending = pendingZones.get(zone.id);
    if (pending) return pending;
    const idlePace = opts?.pace === 'idle';
    const yieldSlice = idlePace ? yieldIdle : yieldBuild;
    // Gating builds race in batches of four. Idle geometry has its own
    // row/time-sliced builder, preserving one mesh per cell without a blocking
    // 60 yd build or the old four-mesh subdivision workaround.
    const cellsPerSlice = 4;
    const task = (async () => {
      // Build order is the "which chunk next" seam, and it lives in the pure
      // core so a later globally nearest-first queue replaces one function
      // instead of the zone lane around it.
      const cells = orderCellsForEntry(
        zoneCells(zone),
        grid,
        opts?.priority ?? priorityPoint,
        CHUNK_SIZE * 3,
      );
      const normalRegions = normalTex ? normalRegionsFor(zone, cells) : [];
      const rowsPerSlice = 12;
      const normalSlices = normalRegions.reduce(
        (slices, region) => slices + Math.ceil((region.j1 - region.j0 + 1) / rowsPerSlice),
        0,
      );
      const total = Math.max(1, normalSlices + cells.length);
      let done = 0;
      if (normalTex && normalRegions.length > 0) {
        for (const region of normalRegions) {
          for (let j = region.j0; j <= region.j1; j += rowsPerSlice) {
            if (cancelled) return;
            bakeNormalRegion(
              normalTex.image.data as Uint8Array,
              seed,
              region.i0,
              region.i1,
              j,
              Math.min(region.j1, j + rowsPerSlice - 1),
            );
            onProgress?.(++done, total);
            await yieldSlice();
          }
        }
        normalTex.needsUpdate = true;
      }
      for (const [cx, cz] of cells) {
        if (cancelled) return;
        const cell = cz * chunksX + cx;
        if (!built.has(cell)) {
          const superCells = [
            [cx, cz],
            [cx + 1, cz],
            [cx, cz + 1],
            [cx + 1, cz + 1],
          ] as const;
          const superOk =
            cx % 2 === 0 &&
            cz % 2 === 0 &&
            cx + 1 < chunksX &&
            cz + 1 < chunksZ &&
            superCells.every(
              ([sx, sz]) =>
                cellOwnerId(sx, sz) === zone.id &&
                !built.has(sz * chunksX + sx) &&
                bandIndexAt(sx, sz) === farBand,
            );
          if (superOk) {
            for (const [sx, sz] of superCells) built.add(sz * chunksX + sx);
            const x0 = -WORLD_MAX_X + cx * CHUNK_SIZE;
            const z0 = WORLD_MIN_Z + cz * CHUNK_SIZE;
            if (idlePace) {
              if (!(await addChunkIdle(x0, z0, CHUNK_SIZE * 2, bands[farBand].spacing, yieldSlice)))
                return;
            } else {
              addChunk(x0, z0, CHUNK_SIZE * 2, bands[farBand].spacing);
            }
          } else {
            built.add(cell);
            const x0 = -WORLD_MAX_X + cx * CHUNK_SIZE;
            const z0 = WORLD_MIN_Z + cz * CHUNK_SIZE;
            const spacing = bands[bandIndexAt(cx, cz)].spacing;
            if (idlePace) {
              if (!(await addChunkIdle(x0, z0, CHUNK_SIZE, spacing, yieldSlice))) return;
            } else {
              addChunk(x0, z0, CHUNK_SIZE, spacing);
            }
          }
        }
        onProgress?.(++done, total);
        if (!idlePace && done % cellsPerSlice === 0) await yieldSlice();
      }
      loadedZones.add(zone.id);
      onProgress?.(total, total);
    })().finally(() => pendingZones.delete(zone.id));
    pendingZones.set(zone.id, task);
    return task;
  };
  return {
    group,
    ensureZone,
    isZoneLoaded: (zoneId: string) => loadedZones.has(zoneId),
    groundResidency: () => residency,
    cancelStreaming(): void {
      cancelled = true;
      pool?.dispose();
    },
    update(camX: number, camZ: number, fogFar: number): void {
      // fully-fogged chunks are pure overdraw; drop them before the frustum
      for (const chunk of chunks) {
        const dx = Math.max(Math.abs(camX - chunk.x) - chunk.half, 0);
        const dz = Math.max(Math.abs(camZ - chunk.z) - chunk.half, 0);
        chunk.mesh.visible = Math.hypot(dx, dz) < fogFar;
      }
    },
    rebuildRegion(minX: number, minZ: number, maxX: number, maxZ: number): void {
      // No allocation beyond the replacement geometries: the chunk list is
      // scanned in place and only intersecting chunks re-mesh.
      for (const chunk of chunks) {
        if (!chunkIntersectsRegion(chunk.x0, chunk.z0, chunk.size, minX, minZ, maxX, maxZ)) {
          continue;
        }
        const geo = buildChunkGeometry(
          chunk.x0,
          chunk.z0,
          chunk.size,
          chunk.spacing,
          seed,
          !lowGfx,
          skirtSpan,
          lowShade,
        );
        chunk.mesh.geometry.dispose();
        chunk.mesh.geometry = geo; // bounding box/sphere already computed by the build
      }
    },
    rebakeNormalRegion(minX: number, minZ: number, maxX: number, maxZ: number): void {
      if (!normalTex) return; // Lambert tier: no macro normal map
      // margin 1: texels just outside the region read sculpted heights through
      // the derivative stencil, so they go stale too.
      const bounds = normalTexelBounds(
        minX,
        minZ,
        maxX,
        maxZ,
        -WORLD_MAX_X,
        WORLD_MIN_Z,
        WORLD_MAX_X * 2,
        WORLD_MAX_Z - WORLD_MIN_Z,
        NORMAL_TEX_W,
        NORMAL_TEX_H,
        1,
      );
      if (!bounds) return;
      bakeNormalRegion(
        normalTex.image.data as Uint8Array,
        seed,
        bounds.i0,
        bounds.i1,
        bounds.j0,
        bounds.j1,
      );
      normalTex.needsUpdate = true;
    },
    setBrush(x: number, z: number, radius: number, color?: THREE.ColorRepresentation): void {
      brush.uBrushCenter.value.set(x, z);
      brush.uBrushRadius.value = Math.max(0, radius);
      if (color !== undefined) brush.uBrushColor.value.set(color);
    },
    clearBrush(): void {
      brush.uBrushRadius.value = 0;
    },
  };
}
