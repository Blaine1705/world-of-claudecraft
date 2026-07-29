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
// - on the HIGH and ULTRA tiers, a multi-tap parallax (3 taps on high, 6 on
//   ultra) walks the projection along the view ray using the family's
//   Displacement map (per-family amplitude and clamp: deep on stone/rock/
//   bark, shallow on plaster/fabric) so surfaces gain clearly per-pixel
//   height response against both the light AND the camera, and the sampled
//   height also shades the diffuse (recesses darken, crests lighten) so the
//   relief reads even head-on.
// Seven families (stone: Bricks076A dressed masonry, rock: Rock026 natural
// geological fracture, wood: MedievalWood, plaster: Plaster007, bark: Bark012,
// fabric: Fabric030, metal: Metal013 with a real Metalness map), shared
// textures loaded once; zero per-frame work; the Lambert (low) tier is
// skipped entirely. The
// stone/rock split matters: masonry carries running-bond mortar lines that
// look absurd on a boulder, so anything geological routes to rock. The layer
// must stay SUBTLE: the game's look is cozy low-poly, the detail suggests
// material, never photoreal.
import type * as THREE from 'three';
import { loadTexture } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX, type SurfaceMatOpts, surfaceMat } from './gfx';

export type SurfaceFamily = 'stone' | 'rock' | 'wood' | 'plaster' | 'bark' | 'fabric' | 'metal';

interface FamilyTextures {
  normal: THREE.Texture | null;
  ao: THREE.Texture | null;
  rough: THREE.Texture | null;
  /** ultra-only parallax height field; stays null on lower import-time tiers */
  disp: THREE.Texture | null;
  /** per-texel metalness (the metal family only): rust patches stay
   *  dielectric while bare metal actually reflects the IBL */
  metal: THREE.Texture | null;
}

interface FamilyDef {
  /** texture basename under /textures/structures/ (or `dir` when set) */
  prefix: string;
  /** texture directory override (rock reuses the shipped terrain set) */
  dir?: string;
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
  /** floor for envMapIntensity, so the family catches the sky/interior IBL
   *  (metal only today; raised, never lowered, at apply time) */
  envMapMin?: number;
  /** how far metalnessFactor lerps toward the family Metalness map (metal
   *  only; the map is fetched exactly when this is set) */
  metalMix?: number;
  /** MEASURED mean of the family Displacement map: the height signal centers
   *  on this so a biased map (Rock026 mean 0.76) cannot push a constant
   *  parallax drift or a constant brightness lift */
  dispCenter: number;
  /** MEASURED standard deviation of the family Displacement map. The maps
   *  span a 10x spread (Bricks 0.219 to Plaster 0.054), so one global
   *  amplitude can never work: the walk amplitude derives as
   *  parallaxDepth / dispSd, normalizing every family to its target depth. */
  dispSd: number;
  /** TARGET typical parallax depth in projection space (one sd of height
   *  moves the projection this far; world depth = this / tileScale). Deep for
   *  stone/rock/bark, shallow for plaster/fabric. The offset clamp derives as
   *  2.2x this value, so tails cannot break the low-poly silhouette. */
  parallaxDepth: number;
  /** diffuse modulation per ONE SD of sampled height (clamped at 1.5 sd):
   *  recesses darken, crests lighten, so height reads even head-on where the
   *  parallax walk is subtle */
  heightShade: number;
  tex: FamilyTextures;
}

const emptyTex = (): FamilyTextures => ({
  normal: null,
  ao: null,
  rough: null,
  disp: null,
  metal: null,
});

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
    dispCenter: 0.456,
    dispSd: 0.219,
    parallaxDepth: 0.06,
    heightShade: 0.15,
    tex: emptyTex(),
  },
  // NATURAL geological stone: chaotic fracture, no mortar lines. Boulders,
  // scree, cliffs, cave mouths, and meteor rock route here so they never grow
  // the ashlar running-bond pattern that belongs to MASONRY (the 'stone'
  // family above). Reuses the shipped terrain Rock026 set; tiled coarser than
  // stone because natural fracture reads better at boulder scale.
  rock: {
    prefix: 'Rock026',
    dir: '/textures/terrain/',
    strength: 0.5,
    tileScale: 1 / 3.4,
    aoLo: 0.72,
    aoSpan: 0.3,
    roughMix: 0.5,
    dispCenter: 0.76,
    dispSd: 0.077,
    parallaxDepth: 0.06,
    heightShade: 0.19,
    tex: emptyTex(),
  },
  wood: {
    prefix: 'MedievalWood',
    strength: 0.4,
    tileScale: 1 / 1.8,
    aoLo: 0.78,
    aoSpan: 0.26,
    roughMix: 0.4,
    dispCenter: 0.468,
    dispSd: 0.118,
    parallaxDepth: 0.045,
    heightShade: 0.11,
    tex: emptyTex(),
  },
  plaster: {
    prefix: 'Plaster007',
    strength: 0.35,
    tileScale: 1 / 2.2,
    aoLo: 0.82,
    aoSpan: 0.2,
    roughMix: 0.35,
    // capped low: the plaster height map has little signal to give (sd
    // 0.054), and amplifying it further just amplifies compression noise
    dispCenter: 0.459,
    dispSd: 0.054,
    parallaxDepth: 0.02,
    heightShade: 0.07,
    tex: emptyTex(),
  },
  // Vertical oak ridges; the triplanar side planes map texture Y to world Y,
  // so the grain runs along the trunk. Deep displacement (std 0.125) makes
  // trunks the best parallax reader in the set.
  bark: {
    prefix: 'Bark012',
    strength: 0.55,
    tileScale: 1 / 1.6,
    aoLo: 0.7,
    aoSpan: 0.34,
    roughMix: 0.45,
    dispCenter: 0.5,
    dispSd: 0.125,
    parallaxDepth: 0.07,
    heightShade: 0.21,
    tex: emptyTex(),
  },
  // Plain isotropic weave (row/col variance ratio 0.77 to 1.15 at 1K): reads
  // as thread-level roughness variation, never corduroy. Kept the gentlest of
  // the set so banners/tents stay painted-cloth, not upholstery.
  fabric: {
    prefix: 'Fabric030',
    strength: 0.3,
    tileScale: 1 / 1.2,
    aoLo: 0.86,
    aoSpan: 0.15,
    roughMix: 0.35,
    dispCenter: 0.432,
    dispSd: 0.11,
    parallaxDepth: 0.015,
    heightShade: 0.04,
    tex: emptyTex(),
  },
  // Patina-worn metal (ambientCG Metal013): rust patches over bare steel WITH
  // a real per-texel Metalness map (mean 0.787, sd 0.232), so rust reads
  // dielectric while bare metal actually reflects the IBL. The old
  // RustCoarse01 set physically could not gleam: rough mean 0.777, disp sd
  // 0.020, no metalness anywhere, and its envMapMin 1.55 was boosting an IBL
  // term the BRDF discarded at metalness 0. With real metalness the floor
  // drops to a cozy 1.2. No AmbientOcclusion map ships with the set (aoSpan
  // 0 skips both the fetch and the grime term); the roughness + metalness
  // mixes carry the patch variation instead.
  metal: {
    prefix: 'Metal013',
    strength: 0.35,
    tileScale: 1 / 1.4,
    aoLo: 1,
    aoSpan: 0,
    roughMix: 0.75,
    envMapMin: 1.2,
    metalMix: 0.9,
    dispCenter: 0.271,
    dispSd: 0.122,
    parallaxDepth: 0.045,
    heightShade: 0.08,
    tex: emptyTex(),
  },
};

/** View-ray refinement taps per fragment: ultra takes 6, high 3. The
 *  normalized amplitudes walk real depth now, and the deeper clamps need the
 *  extra refinement to stay swim-free; the high tier additionally shrinks its
 *  clamp (PARALLAX_HIGH_CLAMP_K) so three taps never step-band at grazing
 *  angles. */
const PARALLAX_TAPS_ULTRA = 6;
const PARALLAX_TAPS_HIGH = 3;
const PARALLAX_HIGH_CLAMP_K = 0.65;
/** Offset clamp as a multiple of the family's target depth (2.2 sd of height
 *  is where the tails start breaking the low-poly silhouette). */
const PARALLAX_CLAMP_K = 2.2;
/** Height-shade clamp in sd units: recess darkening saturates at 1.5 sd. */
const HEIGHT_SHADE_CLAMP_SD = 1.5;

const parallaxTierTaps = (): number =>
  GFX.tier === 'ultra' ? PARALLAX_TAPS_ULTRA : GFX.tier === 'high' ? PARALLAX_TAPS_HIGH : 0;

// Low tier never compiles the layer, so skip the fetches there (the
// detail_normals.ts pattern). Loader cache results are immutable: we own
// CLONES (shared decoded image, one extra GPU texture each), so the
// anisotropy tweak cannot leak into another consumer of the same URL. All
// maps are non-color data and stay in linear space. Displacement fetches key
// off the IMPORT-TIME high/ultra guess: if the live tier lands lower the
// texture merely idles, and if a lower guess later runs high/ultra the
// parallax branch fails soft to the plain layer (the detail_normals null
// contract).
if (GFX.standardMaterials) {
  const wantDisp = parallaxTierTaps() > 0;
  for (const fam of Object.values(FAMILIES)) {
    const prep = (name: string): Promise<THREE.Texture> =>
      loadTexture(`${fam.dir ?? '/textures/structures/'}${fam.prefix}_${name}.jpg`, {
        repeat: true,
      }).then(
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
        // aoSpan 0 also means the set ships no AmbientOcclusion (Metal013)
        fam.aoSpan > 0 ? prep('AmbientOcclusion') : Promise.resolve(null),
        prep('Roughness'),
        wantDisp ? prep('Displacement') : Promise.resolve(null),
        fam.metalMix !== undefined ? prep('Metalness') : Promise.resolve(null),
      ]).then(([n, a, r, d, m]) => {
        fam.tex.normal = n;
        fam.tex.ao = a;
        fam.tex.rough = r;
        fam.tex.disp = d;
        fam.tex.metal = m;
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
  /**
   * 4x4 atlas-cell strength mask (16 entries, row-major from the top-left
   * cell, the EASTBROOK_SURFACE_CELLS numbering): scales the whole layer per
   * fragment by the cell the material's own `map` UV lands in, so one merged
   * vertex-colored batch can carry full detail on stone cells and taper it on
   * canvas/crystal cells. Requires a bound `map` whose UVs were synthesized
   * into the 4x4 cell layout; ignored otherwise. Compile-time constant.
   */
  cellMask?: readonly number[];
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
 *  palette gradient strips are dressed MASONRY; minerock boulders are
 *  geological and take the natural rock family instead). */
const STONE_KITS: Record<string, WornFamilyPick> = {
  khex: { family: 'stone', strength: 0.45 },
  kiron: { family: 'stone', strength: 0.45 },
  minerock: { family: 'rock', strength: 0.55 },
};

/** Names that must NEVER take the layer: canopies and ground cover stay clean
 *  color cards, organic skin/face/hair belongs to the character art, and
 *  glass/window/glow/fx surfaces are transparent or self-lit. */
const SKIP_NAME =
  /leaf|leaves|foliage|bush|grass|flower|plant|vine|moss|skin|face|body|hair|eye|glass|window|glow|flame|fire|lava|water|crystal|gem/i;
const BARK_NAME = /bark|trunk/i;
const FABRIC_NAME = /cloth|fabric|banner|flag|tent|sail|awning|carpet|rug|bag|leather|strap|rope/i;
const METAL_NAME_ROUTE = /metal|iron|steel|gold|silver|anvil|chain|blade|bell/i;
const WOOD_NAME = /wood|plank|log|stump|timber|crate|barrel|fence|furniture|walnut/i;
/** Clay/slate roof tiles (RoofTiles, RoofTiles_Red across the palette kits):
 *  course-lined like masonry but softer, so low-strength stone. */
const ROOF_NAME = /roof|shingle|tile/i;
/** NATURAL geological surfaces: never the ashlar masonry pattern. Checked
 *  before STONE_NAME so 'boulder'/'cliff' names cannot land on brick. */
const ROCK_NAME = /rock|boulder|canyon|cliff|crag|scree|cave/i;
/** Player-built / dressed architectural stone (masonry courses). */
const STONE_NAME = /stone|brick|pillar|column|grave|ruin|marble|statue|mine/i;
const PLASTER_NAME = /plaster|wall/i;

export interface WornFamilyPick {
  family: SurfaceFamily;
  strength: number;
}

/** Per-kit fallback for materials whose NAME says nothing (measured against
 *  the shipped kits: single-atlas palettes such as colormap/texture). null is
 *  an explicit skip (Tripo painterly bakes, mushroom caps). Kits absent here
 *  fall through to the low-strength bare-coverage stone default. */
const KIT_FALLBACK: Record<string, WornFamilyPick | null> = {
  hollow: null, // Tripo painterly bakes with a soft emissive re-emit
  shroom: null, // mushroom caps read as clean color cards
  tent: { family: 'fabric', strength: 0.3 }, // colorRed/colorRedDark canvas
  pirate: { family: 'wood', strength: 0.35 }, // colormap docks/rowboats
  town: { family: 'wood', strength: 0.35 }, // colormap timber pillar
  grave: { family: 'stone', strength: 0.45 }, // colormap gravestones
  dungeon: { family: 'rock', strength: 0.45 }, // 'texture' atlas delve cave mouths
  kcas: { family: 'stone', strength: 0.4 }, // 'texture' atlas castle pieces
  tools: { family: 'wood', strength: 0.3 }, // 'tools' atlas crafting stations
};

/** Bare-coverage default: nothing in the kit pipeline ships without a family,
 *  but unmatched palette cells stay at a whisper of stone. This is the
 *  EXPLICIT landing spot for the say-nothing names measured across the kits
 *  (_defaultMat, Main, Top, Bottom, Beige, Black, Material.00N, ...): they
 *  route here deliberately, after the kit fallbacks have had their say. */
const FALLBACK_STONE_STRENGTH = 0.22;

/**
 * Name-only family heuristic shared by every converter. Returns a pick, null
 * for an explicit skip (leaves, skin, glass, glow), or undefined when the
 * name says nothing (the caller then applies its kit/module fallback).
 */
export function wornFamilyForName(materialName: string): WornFamilyPick | null | undefined {
  if (SKIP_NAME.test(materialName)) return null;
  if (BARK_NAME.test(materialName)) return { family: 'bark', strength: 0.5 };
  if (FABRIC_NAME.test(materialName)) return { family: 'fabric', strength: 0.3 };
  if (METAL_NAME_ROUTE.test(materialName)) return { family: 'metal', strength: 0.35 };
  if (WOOD_NAME.test(materialName)) return { family: 'wood', strength: 0.35 };
  if (ROOF_NAME.test(materialName)) return { family: 'stone', strength: 0.3 };
  if (ROCK_NAME.test(materialName)) return { family: 'rock', strength: 0.5 };
  if (STONE_NAME.test(materialName)) return { family: 'stone', strength: 0.4 };
  if (PLASTER_NAME.test(materialName)) return { family: 'plaster', strength: 0.35 };
  return undefined;
}

export interface WornFamilyContext {
  /** glowing surfaces stay clean (painted windows, lantern glass) */
  emissive?: boolean;
  /** transparent surfaces stay clean */
  transparent?: boolean;
  /** the material ships its own normal/roughness maps (Tripo PBR props): the
   *  bare-coverage fallback is skipped, explicit name routes still apply */
  hasOwnMaps?: boolean;
}

/**
 * Resolve which surface-detail family a kit material takes, from the kit id
 * and the SOURCE material name. Kit-wide stone entries win; names route next;
 * per-kit fallbacks cover single-atlas palettes; everything else that is
 * opaque, non-emissive, and not already PBR-mapped lands on low-strength
 * stone so no kit material ships bare. Deterministic and log-free.
 */
export function wornFamilyFor(
  kit: string,
  materialName: string,
  ctx?: WornFamilyContext,
): WornFamilyPick | null {
  if (ctx?.emissive || ctx?.transparent) return null;
  const kitWide = STONE_KITS[kit];
  if (kitWide !== undefined) return kitWide;
  const named = wornFamilyForName(materialName);
  if (named !== undefined) return named;
  const kitFallback = KIT_FALLBACK[kit];
  if (kitFallback !== undefined) return kitFallback;
  if (ctx?.hasOwnMaps) return null;
  return { family: 'stone', strength: FALLBACK_STONE_STRENGTH };
}

/**
 * Routing for the foliage kit's own converter: trunks take bark, the shared
 * boulder fields take a stronger stone; leaves/flowers/mushrooms return null
 * (canopies must stay clean).
 */
export function foliageWornFamilyFor(materialName: string): WornFamilyPick | null {
  if (BARK_NAME.test(materialName)) return { family: 'bark', strength: 0.55 };
  if (/rock/i.test(materialName)) return { family: 'rock', strength: 0.5 };
  return null;
}

/**
 * Coarse, strong bark for the GIANT landmark trees (the greatTrees clones in
 * realm_flora / garden / haunt / jungle features): the default 1/1.6 bark
 * tiling reads as noise on a trunk yards wide, so giants take ridges nearly
 * 3x larger and a stronger normal so the grain survives at vista distance.
 */
export const GREAT_TREE_BARK_DETAIL: SurfaceDetailOpts = Object.freeze({
  strength: 0.65,
  tileScale: 1 / 4.5,
});

/** Shared trunk matcher for the great-tree decorators (Bark_TwistedTree). */
export function isBarkMaterialName(name: string): boolean {
  return BARK_NAME.test(name);
}

/**
 * Routing for rigged character/creature materials: explicit cloth-named and
 * armor-metal-named materials only, at LOW strength (the caller applies the
 * layer in OBJECT space: rigs animate, a world projection swims). Class-body
 * atlases (knight, mage, ...), creature fur, and skin/face/hair never match,
 * and there is deliberately NO fallback here.
 */
export function riggedWornFamilyFor(materialName: string): WornFamilyPick | null {
  if (SKIP_NAME.test(materialName)) return null;
  if (FABRIC_NAME.test(materialName)) return { family: 'fabric', strength: 0.2 };
  if (METAL_NAME_ROUTE.test(materialName)) return { family: 'metal', strength: 0.2 };
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
  // JSON-safe reapplication record: Material.clone() deep-copies userData but
  // DROPS onBeforeCompile, so clone sites (the camera-ghost material clones in
  // props.ts registerHideable) re-attach the layer from this spec.
  mat.userData.surfaceDetailSpec = {
    family,
    strength: opts?.strength,
    tileScale: opts?.tileScale,
    objectSpace: opts?.objectSpace,
    cellMask: opts?.cellMask ? [...opts.cellMask] : undefined,
  };
  const fam = FAMILIES[family];
  // Reflectivity floor (metal): raise, never lower, so the props/weapon env
  // boosts that already sit higher keep their tuned values.
  if (fam.envMapMin !== undefined && mat.envMapIntensity < fam.envMapMin)
    mat.envMapIntensity = fam.envMapMin;
  const strength = opts?.strength ?? fam.strength;
  const tileScale = opts?.tileScale ?? fam.tileScale;
  const objectSpace = opts?.objectSpace === true;
  // The cell mask reads the material's own map UV (vMapUv only exists with a
  // bound map) and is baked as a compile-time constant array.
  const cellMask = opts?.cellMask && opts.cellMask.length === 16 && mat.map ? opts.cellMask : null;
  // In object mode strength cannot act on the (skipped) normal blend, so it
  // scales the scalar terms relative to the family default instead.
  const scalarK = objectSpace ? Math.min(strength / fam.strength, 1) : 1;
  const aoLo = 1 - (1 - fam.aoLo) * scalarK;
  const aoSpan = fam.aoSpan * scalarK;
  const roughMix = fam.roughMix * scalarK;
  const metalMix = (fam.metalMix ?? 0) * scalarK;
  const prev = mat.onBeforeCompile;
  const prevSrc = typeof prev === 'function' ? prev.toString() : '';
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    // Fail soft before the preload gate resolves: the material simply ships
    // without the layer (the detail_normals null contract). AO is required
    // only for families that actually run the grime term (Metal013 ships no
    // AmbientOcclusion and sets aoSpan 0).
    if (!fam.tex.normal || !fam.tex.rough) return;
    const hasAo = fam.aoSpan > 0 && fam.tex.ao !== null;
    if (fam.aoSpan > 0 && !hasAo) return;
    const hasMetal = metalMix > 0 && fam.tex.metal !== null;
    // Parallax gates on the LIVE tier at compile time (3 taps on high, 6 on
    // ultra) plus a resolved height field, and needs the world-space view ray.
    const taps = !objectSpace && fam.tex.disp !== null ? parallaxTierTaps() : 0;
    const parallax = taps > 0;
    // Normalized amplitude: one sd of height walks the projection by the
    // family's target depth, whatever the map's dynamic range (the shipped
    // sds span 10x, so a global amplitude can never read evenly).
    const parallaxAmp = fam.parallaxDepth / fam.dispSd;
    // The high tier walks fewer taps, so it takes a shallower clamp: depth it
    // cannot refine would otherwise swim at grazing angles.
    const parallaxClamp =
      PARALLAX_CLAMP_K *
      fam.parallaxDepth *
      (taps >= PARALLAX_TAPS_ULTRA ? 1 : PARALLAX_HIGH_CLAMP_K);
    shader.uniforms.uWornNormal = { value: fam.tex.normal };
    if (hasAo) shader.uniforms.uWornAo = { value: fam.tex.ao };
    shader.uniforms.uWornRough = { value: fam.tex.rough };
    shader.uniforms.uWornStrength = { value: strength };
    shader.uniforms.uWornTile = { value: tileScale };
    if (hasAo) shader.uniforms.uWornAoLo = { value: aoLo };
    if (hasAo) shader.uniforms.uWornAoSpan = { value: aoSpan };
    shader.uniforms.uWornRoughMix = { value: roughMix };
    if (hasMetal) shader.uniforms.uWornMetal = { value: fam.tex.metal };
    if (hasMetal) shader.uniforms.uWornMetalMix = { value: metalMix };
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
        uniform sampler2D uWornRough;
        uniform float uWornStrength;
        uniform float uWornTile;
        uniform float uWornRoughMix;
        ${hasAo ? 'uniform sampler2D uWornAo; uniform float uWornAoLo; uniform float uWornAoSpan;' : ''}
        ${hasMetal ? 'uniform sampler2D uWornMetal; uniform float uWornMetalMix;' : ''}
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
        float wornCellK = 1.0;
        ${
          cellMask
            ? `{
          const float wornCellMask[16] = float[16]( ${cellMask
            .map((k) => k.toFixed(3))
            .join(', ')} );
          int wornCol = clamp( int( floor( vMapUv.x * 4.0 ) ), 0, 3 );
          int wornRow = clamp( int( floor( ( 1.0 - vMapUv.y ) * 4.0 ) ), 0, 3 );
          wornCellK = wornCellMask[ wornRow * 4 + wornCol ];
        }`
            : ''
        }
        ${
          parallax
            ? `float wornHShade = 0.0;
        {
          // Multi-tap parallax (3 on high, 6 on ultra): estimate height, then
          // refine along the view ray, walking the projection by the averaged
          // offset. The amplitude is sd-normalized (one sd of height = the
          // family's target depth) and the offset clamps at 2.2 sd so tails
          // never break the low-poly silhouette.
          vec3 wornV = normalize( vWornWorldPos - cameraPosition );
          float wornH = wornTriR( uWornDisp, wornP, wornW ) - ${fam.dispCenter.toFixed(3)};
          float wornHAcc = wornH;
          ${Array.from(
            { length: taps - 1 },
            () => `wornH = wornTriR( uWornDisp,
            wornP + wornV * ( wornH * ${parallaxAmp.toFixed(3)} ), wornW ) - ${fam.dispCenter.toFixed(3)};
          wornHAcc += wornH;`,
          ).join('\n          ')}
          wornP += clamp(
            wornV * ( wornHAcc * ${(parallaxAmp / taps).toFixed(4)} ),
            vec3( -${parallaxClamp.toFixed(3)} ), vec3( ${parallaxClamp.toFixed(3)} ) );
          wornHShade = clamp( wornH * ${(1 / fam.dispSd).toFixed(3)},
            -${HEIGHT_SHADE_CLAMP_SD.toFixed(1)}, ${HEIGHT_SHADE_CLAMP_SD.toFixed(1)} );
        }`
            : ''
        }
        ${
          parallax
            ? `diffuseColor.rgb *= 1.0 + wornHShade * ${fam.heightShade.toFixed(2)} * wornCellK;`
            : ''
        }
        ${
          hasAo
            ? `float wornAoV = wornTriR( uWornAo, wornP, wornW );
        diffuseColor.rgb *= mix( 1.0, uWornAoLo + wornAoV * uWornAoSpan, wornCellK );`
            : ''
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, wornTriR( uWornRough, wornP, wornW ), uWornRoughMix * wornCellK );`,
      );
    if (hasMetal) {
      // metalnessmap_fragment unconditionally declares `float metalnessFactor
      // = metalness;`, so the per-texel patina composes cleanly after it: rust
      // patches stay dielectric, bare metal reflects the IBL per fragment.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix( metalnessFactor, wornTriR( uWornMetal, wornP, wornW ), uWornMetalMix * wornCellK );`,
      );
    }
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
  // as do the projection mode and the tier's parallax tap count.
  mat.customProgramCacheKey = () => {
    const ready =
      fam.tex.normal && fam.tex.rough && (fam.aoSpan === 0 || fam.tex.ao) ? 'on' : 'off';
    const par = !objectSpace && fam.tex.disp !== null ? `p${parallaxTierTaps()}` : '-';
    const mask = cellMask ? `m${cellMask.join(',')}` : '-';
    const met = metalMix > 0 && fam.tex.metal !== null ? 'met' : '-';
    return `surface-detail|${family}|${ready}|${par}|${mask}|${met}|${objectSpace ? 'o' : 'w'}|${prevSrc}`;
  };
}

/**
 * Back-compat entry for the original stone-only layer (castle features, realm
 * flora ruins, the portal arch): the stone family with the original defaults.
 */
export function applyWornStone(mat: THREE.MeshStandardMaterial, opts?: WornStoneOpts): void {
  applySurfaceDetail(mat, 'stone', opts);
}

/**
 * Re-attach the surface-detail layer to a Material.clone() of a detailed
 * material: clone copies userData (including the JSON spec recorded at apply
 * time) but silently DROPS the onBeforeCompile hook, which is how the
 * camera-ghost buildings (props.ts registerHideable clones every mesh
 * material so hiding one structure cannot blank a shared material) shipped
 * bare walls while merged siblings kept their texture. No-op for clones of
 * undetailed materials.
 */
export function reapplySurfaceDetailToClone(clone: THREE.Material): void {
  const std = clone as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial) return;
  const spec = std.userData?.surfaceDetailSpec as
    | (SurfaceDetailOpts & { family: SurfaceFamily })
    | undefined;
  if (!spec || !FAMILIES[spec.family]) return;
  applySurfaceDetail(std, spec.family, spec);
}

// ---------------------------------------------------------------------------
// surfaceMat + family, for the procedural feature modules.
// ---------------------------------------------------------------------------

const detailedMats = new Map<string, THREE.Material>();

/**
 * A surfaceMat with the surface-detail family attached. surfaceMat dedupes
 * app-wide, so the detailed variant is a one-time CLONE cached per
 * (base uuid, family, opts), never a mutation of the shared instance (the
 * quest_objects.ts pattern). Lambert tier passes the base through untouched.
 * Do not combine with opts.rim: Material.clone() drops the rim hook.
 */
export function detailedSurfaceMat(
  opts: SurfaceMatOpts,
  family: SurfaceFamily,
  detail?: SurfaceDetailOpts,
): THREE.Material {
  const base = surfaceMat(opts);
  if (!GFX.standardMaterials || !(base as THREE.MeshStandardMaterial).isMeshStandardMaterial)
    return base;
  const key = `${base.uuid}|${family}|${detail?.strength ?? ''}|${detail?.tileScale ?? ''}|${detail?.objectSpace ? 'o' : 'w'}|${detail?.cellMask?.join(',') ?? ''}`;
  let mat = detailedMats.get(key);
  if (!mat) {
    mat = base.clone();
    applySurfaceDetail(mat as THREE.MeshStandardMaterial, family, detail);
    detailedMats.set(key, mat);
  }
  return mat;
}
