// The Three half of the night light field: the shared uniform block and GLSL
// snippet the terrain splat material splices, so every lamp, camp fire, and
// nearby body lights the ground as a REAL light (direction, distance falloff,
// surface normal), not as an additive decal draped over it.
//
// All the decisions (slot layout, nearest-K selection, falloff curve, the body
// collector) live in night_light_field_core.ts, which is Node-tested; this
// file only owns the registry, the uniforms, and the strings. The pattern is
// biome_haze_field.ts, the repo's cross-surface shader service reference.
//
// Cost: two flat uniform arrays (16 vec4 + 16 vec3) written once per frame,
// and a bounded loop in the terrain fragment shader that the count uniform
// exits immediately by day (the count is 0 whenever the world is lit). This
// is how "every lamp lights the road" coexists with the pinned live
// THREE.PointLight budget: the point lights still light characters and props
// near the player; the field carries the ground everywhere else.
//
// `?nightlights=off` is the A/B switch back to the draped ground pools, which
// remain the fallback wherever the field is absent (the Lambert tier splats no
// standard material to splice).

import { GFX } from './gfx';
import { NIGHT_LIGHT_SLOTS, type NightLightSite, packNightLights } from './night_light_field_core';
import { renderLayerDisabled } from './render_dev_flags';

const uNightLightPosR = { value: new Float32Array(NIGHT_LIGHT_SLOTS * 4) };
const uNightLightColor = { value: new Float32Array(NIGHT_LIGHT_SLOTS * 3) };
const uNightLightCount = { value: 0 };

let active = false;
let decided = false;
/** Keyed by owner so a rebuilt scene (the editor viewport) REPLACES its own
 *  entries instead of stacking a second copy of every lamp's light. */
const staticByOwner = new Map<string, readonly NightLightSite[]>();
let staticSites: NightLightSite[] = [];

function rebuildStaticSites(): void {
  staticSites = [];
  for (const sites of staticByOwner.values()) pushAll(staticSites, sites);
}

/**
 * Decide once whether the field runs this session. Call BEFORE building the
 * terrain: the splat material gates its shader patch on hasNightLightField()
 * at compile time, so a field enabled later would never be read. The Lambert
 * tier compiles no standard splat material, so it keeps the draped pools.
 */
export function ensureNightLightField(): void {
  if (decided) return;
  decided = true;
  active = GFX.standardMaterials && !renderLayerDisabled('nightlights');
}

/** True when the terrain splices the field this session (compile-time gate). */
export function hasNightLightField(): boolean {
  return active;
}

/** World-static lights (lamps, braziers, camp fires) join the field at build.
 *  The set is read per frame, so builders may register in any order; a builder
 *  registering again under the same owner replaces its previous entries. */
export function registerStaticNightLights(owner: string, sites: readonly NightLightSite[]): void {
  staticByOwner.set(owner, sites.slice());
  rebuildStaticSites();
}

function pushAll(target: NightLightSite[], sites: readonly NightLightSite[]): void {
  // a loop, not push(...sites): a spread turns every site into a call
  // argument, which hits engine argument caps abruptly if the set grows
  for (const site of sites) target.push(site);
}

/**
 * Write this frame's light set. `anchorX`/`anchorZ` is the PLAYER position,
 * the same anchor the point-light budget and the disc layer rank by.
 * `dynamics` is the body collector's pooled array with its live
 * `dynamicsCount` (entries past it are stale); the glow drivers are the
 * shared night curves (night_lighting_core.ts), already zeroed indoors by the
 * caller.
 */
export function updateNightLightField(
  anchorX: number,
  anchorZ: number,
  staticGlow: number,
  dynamicGlow: number,
  time: number,
  dynamics: readonly NightLightSite[],
  dynamicsCount: number,
): void {
  if (!active) return;
  uNightLightCount.value = packNightLights(
    staticSites,
    dynamics,
    dynamicsCount,
    anchorX,
    anchorZ,
    staticGlow,
    dynamicGlow,
    time,
    uNightLightPosR.value,
    uNightLightColor.value,
  );
}

/** The uniforms a consumer material installs in its onBeforeCompile. Shared
 *  objects, never copies (the sharedUniforms.uTime idiom). */
export function nightLightUniforms(): Record<string, { value: unknown }> {
  return { uNightLightPosR, uNightLightColor, uNightLightCount };
}

/** Reset for tests: the field is deliberately session-static otherwise. */
export function resetNightLightFieldForTest(): void {
  active = false;
  decided = false;
  staticByOwner.clear();
  staticSites = [];
  uNightLightCount.value = 0;
  uNightLightPosR.value.fill(0);
  uNightLightColor.value.fill(0);
}

/** How many static sites are registered (diagnostics and tests). */
export function nightLightStaticCount(): number {
  return staticSites.length;
}

/** Fragment-stage declarations. Splice into the fragment `<common>` patch. */
export const NIGHT_LIGHT_DECLARATIONS = `
uniform vec4 uNightLightPosR[${NIGHT_LIGHT_SLOTS}];
uniform vec3 uNightLightColor[${NIGHT_LIGHT_SLOTS}];
uniform int uNightLightCount;`;

/**
 * The lighting block. Splice immediately BEFORE `#include <lights_fragment_end>`,
 * with `worldPos` naming the fragment's world position vec3.
 *
 * This lands INSIDE the material's lighting resolve, not after tonemapping:
 * each light contributes irradiance to `reflectedLight.directDiffuse` through
 * `BRDF_Lambert(diffuseColor.rgb)`, the lambert diffuse path a real
 * THREE.PointLight takes (three feeds `material.diffuseColor`, which is the
 * same value times `1 - metalness`; the splat is metalness 0, so the two are
 * identical there). That is what makes it read as light rather than paint: it multiplies
 * with the ground's own albedo (dark peat soaks it up, pale cobbles catch it),
 * it follows the splat's detail normals, and the tonemapper rolls the bright
 * centre off softly instead of clipping it to a harsh disc.
 *
 * The falloff is three's own punctual attenuation (decay 2 with the pow4
 * cutoff window, nightLightFalloff in the core, mirrored term for term), so
 * field light and the budget's real point lights agree about reach.
 *
 * The loop works in SQUARED distance: `pow4(d / r)` is `pow2(d2 / r2)` and the
 * attenuation divides by d2 anyway, so the only root left is the one the
 * lambert term's direction needs, inside the branch a culled light never
 * enters. A light the fragment is out of range of therefore costs a subtract,
 * a dot and a compare, which is what lets the slot window be wide enough to
 * light a road ahead of the player instead of only the ground beneath them.
 */
export function nightLightFragmentGlsl(worldPos: string): string {
  return `
  if (uNightLightCount > 0) {
    vec3 wocNLIrradiance = vec3(0.0);
    vec3 wocNLNormal = inverseTransformDirection(normal, viewMatrix);
    for (int i = 0; i < ${NIGHT_LIGHT_SLOTS}; i++) {
      if (i >= uNightLightCount) break;
      vec3 wocNLTo = uNightLightPosR[i].xyz - ${worldPos};
      float wocNLDist2 = dot(wocNLTo, wocNLTo);
      float wocNLCutoff2 = uNightLightPosR[i].w * uNightLightPosR[i].w;
      if (wocNLDist2 < wocNLCutoff2) {
        float wocNLWin = pow2(saturate(1.0 - pow2(wocNLDist2 / wocNLCutoff2)));
        float wocNLAtt = wocNLWin / max(wocNLDist2, 0.01);
        float wocNLLambert = saturate(dot(wocNLNormal, wocNLTo * inversesqrt(max(wocNLDist2, 1e-8))));
        wocNLIrradiance += uNightLightColor[i] * (wocNLAtt * wocNLLambert);
      }
    }
    reflectedLight.directDiffuse += wocNLIrradiance * BRDF_Lambert(diffuseColor.rgb);
  }`;
}
