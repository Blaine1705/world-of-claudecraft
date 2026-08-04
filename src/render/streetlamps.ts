// Streetlamps: an iron post with a warm lantern head, standing beside every
// road in the world. Dark by day, lit through the night, so the whole road
// network stays readable after dusk without the world ceasing to read as night.
//
// Procedural, in the low-poly kit style the rest of the world dressing uses
// (frost_sky.ts's Icemantle lanterns are the nearest sibling): a merged
// six-sided fixture and an octahedral glass, instanced once per zone so a zone
// costs three draws and the zone-feature distance cull drops the zones the
// player is not standing in.
//
// Three layers make the light, in falling cost order:
//   1. a terrain-draped additive ground pool under every lamp (the thing that
//      actually paints the road; one merged draw per zone, every tier; see
//      ground_glow_patch.ts for why it drapes instead of lying flat),
//   2. an HDR emissive lantern head above the bloom threshold, so the lamp reads
//      as a light source on the composer tiers,
//   3. a real THREE.PointLight on every third lamp, riding the renderer's shared
//      fire-light budget (renderer.ts budgetFireLights), which keeps only the
//      nearest GFX.maxPointLights alive.
// Layers 1 and 2 are what a low tier keeps if the budget never reaches a lamp,
// and they are the layers that carry the readability; the point lights only add
// falloff on nearby geometry.
//
// Placement is streetlamp_placement_core.ts (pure, tested): every road end to
// end, clearance-banded against the sim's roadDistance so a post stands beside
// the PAINTED track, never on it. Ground heights come from the sim's
// terrainHeight, per the "terrain height = sim height" invariant.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { resolvePosition } from '../sim/colliders';
import { getActiveWorldContent, zoneAt } from '../sim/data';
import { propPlacementRoll } from '../sim/prop_layout';
import { roadDistance, terrainHeight } from '../sim/world';
import { EMISSIVE_LIGHT, GFX } from './gfx';
import { buildDrapedGlowGeometry, type GlowPatchSite } from './ground_glow_patch';
import { hasNightLightField, registerStaticNightLights } from './night_light_field';
import {
  type LampSite,
  lampCarriesLight,
  planStreetlamps,
  type StreetlampPlan,
} from './streetlamp_placement_core';
import { radialGlowTexture } from './textures';

export interface StreetlampsView {
  group: THREE.Group;
  /** point lights for the renderer's shared fire-light budget */
  glowLights: THREE.PointLight[];
  /** per-zone subtrees, so the zone-feature distance cull works per zone */
  cullGroups: THREE.Group[];
  /** Drive the whole set from the frame's lamp glow amount (0 = out, 1 = full). */
  update(glow: number, time: number): void;
}

/** The whole fixture is authored at unit scale and blown up by this. */
export const LAMP_SCALE = 1.5;

const POST_HEIGHT = 2.7;
const IRON_COLOR = 0x3a3128;
const GLASS_COLOR = 0xffdca0;
// Warmer than the first pass on purpose: the lantern reads amber, not white.
const GLASS_EMISSIVE = 0xffa14a;
const LIGHT_COLOR = 0xff9d42;
const LIGHT_INTENSITY = 14;
const LIGHT_DISTANCE = 28;
/** The glass centre of the scaled fixture, where the real light hangs. */
const LIGHT_HEIGHT = (POST_HEIGHT + 0.45) * LAMP_SCALE;
const POOL_RADIUS = 4.2;
// Every lamp lays one of these, and a town centre has a dozen lamps in frame:
// what looks right for a single pool stacks into a lit plaza, so this is tuned
// against the crowd of them, not against one.
const POOL_OPACITY = 0.3;
/** Night-light-field entries: the punctual cutoff and candela-style level.
 *  Calibrated to the ground, not to the units: the head hangs 4.7 yd up, so
 *  the patch straight below it gets intensity * 0.045 / pi of the albedo,
 *  and reading CLEARLY lit on dark night ground needs the level up here. */
const FIELD_RADIUS = 22;
const FIELD_INTENSITY = 40;
/** Lantern glow as warm linear amber. */
const FIELD_COLOR = [1.0, 0.52, 0.16] as const;
/** A glassed lantern wavers gently, a shade under the shared fire-flicker
 *  amplitude its own point light rides, so post and ground breathe together. */
const FIELD_FLICKER = 0.1;
/** How far a lamp may be nudged by a collider before we give up on the spot. */
const CLEARANCE_EPSILON = 0.05;
const LAMP_CLEARANCE = 1.1;

/**
 * Post, collar, lantern housing, and finial, merged into one instanced draw,
 * then scaled up as one piece (LAMP_SCALE).
 *
 * Every part is a CylinderGeometry/ConeGeometry on purpose: mergeGeometries
 * refuses a mixed set (Three's polyhedra come back NON-indexed while the lathe
 * primitives are indexed), and a null merge here fails the whole scene build.
 * `tests/streetlamps.test.ts` pins the merge rather than leaving it to a boot.
 */
export function buildLampFixtureGeometry(): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(0.075, 0.135, POST_HEIGHT, 6);
  post.translate(0, POST_HEIGHT * 0.5, 0);
  const collar = new THREE.CylinderGeometry(0.16, 0.19, 0.13, 6);
  collar.translate(0, POST_HEIGHT + 0.06, 0);
  // the lantern housing: a flared skirt under the glass and a peaked cap over it
  const skirt = new THREE.ConeGeometry(0.25, 0.2, 6);
  skirt.rotateX(Math.PI);
  skirt.translate(0, POST_HEIGHT + 0.22, 0);
  const cap = new THREE.ConeGeometry(0.29, 0.3, 6);
  cap.translate(0, POST_HEIGHT + 0.73, 0);
  const finial = new THREE.ConeGeometry(0.07, 0.16, 4);
  finial.translate(0, POST_HEIGHT + 0.96, 0);
  const parts = [post, collar, skirt, cap, finial];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('streetlamps: lamp fixture geometry failed to merge');
  merged.scale(LAMP_SCALE, LAMP_SCALE, LAMP_SCALE);
  merged.computeVertexNormals();
  return merged;
}

export function buildLampGlassGeometry(): THREE.BufferGeometry {
  const glass = new THREE.OctahedronGeometry(0.23, 0);
  glass.scale(1, 1.35, 1);
  glass.translate(0, POST_HEIGHT + 0.45, 0);
  glass.scale(LAMP_SCALE, LAMP_SCALE, LAMP_SCALE);
  return glass;
}

/** Emissive-capable material on every tier (Lambert carries emissive too). */
function glassMaterial(): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  const opts = {
    color: GLASS_COLOR,
    emissive: GLASS_EMISSIVE,
    emissiveIntensity: 0,
    flatShading: true,
  };
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({ ...opts, roughness: 0.45, metalness: 0 })
    : new THREE.MeshLambertMaterial(opts);
}

function ironMaterial(): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  const opts = { color: IRON_COLOR, flatShading: true };
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({ ...opts, roughness: 0.82, metalness: 0.25 })
    : new THREE.MeshLambertMaterial(opts);
}

function buildPlan(seed: number): StreetlampPlan {
  const content = getActiveWorldContent();
  const towns = content.zones.map((zone) => ({
    x: zone.hub.x,
    z: zone.hub.z,
    radius: zone.hub.radius,
  }));
  return planStreetlamps(content.roads, towns, {
    groundAt: (x, z) => terrainHeight(x, z, seed),
    blocked: (x, z) => {
      // A lamp inside a building, stall, well, or fence is worse than no lamp.
      // resolvePosition pushes a body out of whatever it overlaps, so a spot
      // that comes back moved was already occupied.
      const resolved = resolvePosition(seed, x, z, LAMP_CLEARANCE);
      return (
        Math.abs(resolved.x - x) > CLEARANCE_EPSILON || Math.abs(resolved.z - z) > CLEARANCE_EPSILON
      );
    },
    roll: propPlacementRoll,
    roadClear: roadDistance,
  });
}

export function buildStreetlamps(seed = 0): StreetlampsView {
  const group = new THREE.Group();
  group.name = 'streetlamps';
  const glowLights: THREE.PointLight[] = [];
  const cullGroups: THREE.Group[] = [];
  const poolMeshes: THREE.Mesh[] = [];

  const plan = buildPlan(seed);
  if (plan.sites.length === 0) {
    return { group, glowLights, cullGroups, update: () => undefined };
  }

  // The ground illumination: EVERY lamp joins the night light field where the
  // terrain splices it (real reactive light, not just the stride-3 budget
  // lights); the draped pools below are the fallback where it does not.
  registerStaticNightLights(
    'streetlamps',
    plan.sites.map((site) => ({
      x: site.x,
      y: site.y + LIGHT_HEIGHT,
      z: site.z,
      radius: FIELD_RADIUS,
      r: FIELD_COLOR[0],
      g: FIELD_COLOR[1],
      b: FIELD_COLOR[2],
      intensity: FIELD_INTENSITY,
      flicker: FIELD_FLICKER,
    })),
  );
  const usePools = !hasNightLightField();

  // Bucket by zone so the distance cull drops the zones the player is not in
  // (the lamps span the whole road network now, so per-town groups no longer
  // cover them; this is the ember_pools bucketing).
  const content = getActiveWorldContent();
  const byZone = new Map<number, LampSite[]>();
  for (const site of plan.sites) {
    const zoneIndex = content.zones.indexOf(zoneAt(site.x, site.z));
    const bucket = byZone.get(zoneIndex);
    if (bucket) bucket.push(site);
    else byZone.set(zoneIndex, [site]);
  }

  const fixtureGeo = buildLampFixtureGeometry();
  const glassGeo = buildLampGlassGeometry();
  const ironMat = ironMaterial();
  const glassMat = glassMaterial();
  // Built only on the fallback tiers: on field tiers no pool mesh exists, and
  // a material attached to nothing would be dead per-frame opacity writes.
  const poolMat = usePools
    ? new THREE.MeshBasicMaterial({
        map: radialGlowTexture(),
        color: LIGHT_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    : null;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const patchSites: GlowPatchSite[] = [];

  for (const [zoneIndex, sites] of byZone) {
    const zoneGroup = new THREE.Group();
    zoneGroup.name = `streetlamps-zone-${zoneIndex}`;
    const fixtures = new THREE.InstancedMesh(fixtureGeo, ironMat, sites.length);
    const glasses = new THREE.InstancedMesh(glassGeo, glassMat, sites.length);

    patchSites.length = 0;
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      quaternion.setFromAxisAngle(up, site.yaw);
      position.set(site.x, site.y, site.z);
      fixtures.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      glasses.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      patchSites.push({ x: site.x, z: site.z, radius: POOL_RADIUS });
      if (lampCarriesLight(i)) {
        const light = new THREE.PointLight(LIGHT_COLOR, 0, LIGHT_DISTANCE, 2);
        light.position.set(site.x, site.y + LIGHT_HEIGHT, site.z);
        light.userData.baseIntensity = 0;
        // The renderer pins the VISIBLE point-light count at GFX.maxPointLights
        // from the first frame (pad lights fill the rest); a lamp that arrived
        // visible would push the count over and recompile every lit material.
        light.visible = false;
        glowLights.push(light);
        zoneGroup.add(light);
      }
    }
    fixtures.instanceMatrix.needsUpdate = true;
    glasses.instanceMatrix.needsUpdate = true;
    fixtures.castShadow = true;
    fixtures.computeBoundingSphere();
    glasses.computeBoundingSphere();
    if (poolMat) {
      // The fallback pool: one merged terrain-draped patch per zone, so a
      // hillside road keeps its lamplight when the shader field is absent.
      const pools = new THREE.Mesh(
        buildDrapedGlowGeometry(patchSites, (x, z) => terrainHeight(x, z, seed)),
        poolMat,
      );
      pools.geometry.computeBoundingSphere();
      pools.renderOrder = 1; // over the ground it drapes on
      pools.visible = false; // no pool until the lamps light
      poolMeshes.push(pools);
      zoneGroup.add(pools);
    }
    zoneGroup.add(fixtures);
    zoneGroup.add(glasses);
    group.add(zoneGroup);
    cullGroups.push(zoneGroup);
  }

  let poolsShown = false;
  return {
    group,
    glowLights,
    cullGroups,
    update(glow: number, time: number): void {
      const lit = glow > 0.001;
      if (lit !== poolsShown) {
        poolsShown = lit;
        for (const pool of poolMeshes) pool.visible = lit;
      }
      if (!lit) {
        glassMat.emissiveIntensity = 0;
        if (poolMat) poolMat.opacity = 0;
        for (const light of glowLights) light.userData.baseIntensity = 0;
        return;
      }
      // A lantern flame breathes rather than strobing: two slow out-of-phase
      // sines, the same idiom the Icemantle lanterns use.
      const flicker = 1 + Math.sin(time * 5.7) * 0.05 + Math.sin(time * 1.9) * 0.04;
      glassMat.emissiveIntensity = EMISSIVE_LIGHT * glow * flicker;
      if (poolMat) poolMat.opacity = POOL_OPACITY * glow;
      // The budget owns light.intensity (renderer.ts applyPointLightBudget +
      // flickerContributingFireLights read this base), so a lamp out of budget
      // costs nothing and a lit one picks the level up on the next pass.
      const base = LIGHT_INTENSITY * glow;
      for (const light of glowLights) light.userData.baseIntensity = base;
    },
  };
}
