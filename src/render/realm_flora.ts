// Glowing flora and crystal formations for the Veiled Hollow: the realm's
// signature magical dressing, layered over the regular biome foliage.
//
// - Glowing mushrooms reuse the bundled mushroom prop GLBs with an emissive
//   re-material (no new asset files); giants line the Duskfall path and the
//   Gleaming Deep, small ones sprinkle the whole glade.
// - Crystal outcrops are pure procedural geometry (stretched octahedra merged
//   into clusters), concentrated around the Crystalline Shallows and the
//   Sunken Court ruins.
// - Placement is a deterministic hash grid from the world seed (no rng
//   stream), skipping the hub plateau, roads, and water, so every client
//   grows the same realm.
// - A handful of glow point lights ride the campfire light budget (the
//   renderer rank-culls and flickers them via userData.baseIntensity).
//
// Everything is instanced: two mushroom variants and two crystal variants,
// four draw calls total.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REALM_ZONE } from '../sim/content/realm';
import { hash2 } from '../sim/rng';
import { roadDistance, terrainHeight, WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX, surfaceMat } from './gfx';

const MUSHROOM_URLS = ['/models/props/mushroom_red.glb', '/models/props/mushroom_tan.glb'];
// The great tree of Eldergleam: one hand-placed giant of the twisted elder
// model the realm's forests already use, kept with its own materials (the
// loader cache is immutable, so the scene is cloned before use).
const GREAT_TREE_URL = '/models/foliage/twisted_1.glb';
let greatTreeScene: THREE.Group | null = null;
registerPreload(
  loadGltf(GREAT_TREE_URL).then((gltf) => {
    greatTreeScene = gltf.scene;
  }),
);

const loadedGeos = new Map<string, THREE.BufferGeometry>();
for (const url of MUSHROOM_URLS) {
  registerPreload(
    loadGltf(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.geometry;
        const geo = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) {
          const attr = src.getAttribute(name);
          if (attr) geo.setAttribute(name, attr.clone());
        }
        if (src.index) geo.setIndex(src.index.clone());
        geo.applyMatrix4(mesh.matrixWorld);
        parts.push(geo);
      });
      // mergeGeometries rejects mixed attribute sets: drop uv everywhere
      // unless every part carries it (the emissive re-material ignores uv)
      if (parts.some((p) => !p.getAttribute('uv'))) {
        for (const p of parts) p.deleteAttribute('uv');
      }
      const merged = mergeGeometries(parts);
      if (merged) loadedGeos.set(url, merged);
    }),
  );
}

// Placement regions (see the ZoneDef POIs in sim/content/realm.ts).
const GLEAMING_DEEP = { x: -70, z: 1155, r: 58 };
const SHALLOWS = { x: 75, z: 1165, r: 48 };
const SUNKEN_COURT = { x: 125, z: 1085, r: 42 };
const STARFALL_RIM = { x: 110, z: 985, r: 36 };
const DUSKFALL_Z_MAX = 1012; // the arrival path corridor (roadside giants)

const GRID_STEP = 8;
const GLOW_LIGHT_COUNT = 12;

function within(x: number, z: number, c: { x: number; z: number; r: number }): boolean {
  const dx = x - c.x,
    dz = z - c.z;
  return dx * dx + dz * dz < c.r * c.r;
}

interface Spot {
  x: number;
  z: number;
  y: number;
  scale: number;
  rot: number;
  variant: number; // 0/1 within its family
  r: number; // the cell's hash draw, reused for light picks
}

interface Placements {
  mushrooms: Spot[];
  crystals: Spot[];
}

function placeFlora(seed: number): Placements {
  const mushrooms: Spot[] = [];
  const crystals: Spot[] = [];
  const hub = REALM_ZONE.hub;
  for (let gx = -172; gx <= 172; gx += GRID_STEP) {
    for (let gz = REALM_ZONE.zMin + 8; gz <= REALM_ZONE.zMax - 10; gz += GRID_STEP) {
      const r = hash2(gx, gz, seed + 201);
      const ox = (hash2(gx, gz, seed + 211) - 0.5) * GRID_STEP;
      const oz = (hash2(gx, gz, seed + 221) - 0.5) * GRID_STEP;
      const x = gx + ox,
        z = gz + oz;
      const dHub = Math.hypot(x - hub.x, z - hub.z);
      if (dHub < hub.radius + 6) continue;
      const dRoad = roadDistance(x, z);
      if (dRoad < 4.5) continue;
      const y = terrainHeight(x, z, seed);
      if (y < WATER_LEVEL + 1) continue;

      const rot = hash2(gx, gz, seed + 231) * Math.PI * 2;
      const variant = hash2(gx, gz, seed + 241) < 0.5 ? 0 : 1;
      const inDeep = within(x, z, GLEAMING_DEEP);
      const onPath = z < DUSKFALL_Z_MAX && x < -55 && dRoad < 15;
      const inShallows = within(x, z, SHALLOWS) || within(x, z, STARFALL_RIM);
      const inCourt = within(x, z, SUNKEN_COURT);

      if (inDeep || onPath) {
        // mushroom country: proper giants where the hash runs lowest
        if (r < 0.09) {
          mushrooms.push({ x, z, y, scale: 4 + r * 55, rot, variant, r });
        } else if (r < 0.58) {
          mushrooms.push({ x, z, y, scale: 0.9 + (r - 0.09) * 3.4, rot, variant, r });
        }
      } else if (inShallows || inCourt) {
        const chance = inCourt ? 0.16 : 0.4;
        if (r < chance) {
          crystals.push({ x, z, y, scale: 0.9 + r * 4.5, rot, variant, r });
        }
      } else {
        // the wider glade gets a soft sprinkle of both
        if (r < 0.055) mushrooms.push({ x, z, y, scale: 0.8 + r * 12, rot, variant, r });
        else if (r > 0.985) crystals.push({ x, z, y, scale: 0.8 + (1 - r) * 60, rot, variant, r });
      }
    }
  }
  return { mushrooms, crystals };
}

// One crystal cluster: three tilted, stretched octahedra sharing a base.
function crystalClusterGeo(): THREE.BufferGeometry {
  const shard = (
    sx: number,
    sy: number,
    sz: number,
    tilt: number,
    lean: number,
    ox: number,
    oz: number,
  ): THREE.BufferGeometry => {
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.applyMatrix4(new THREE.Matrix4().makeScale(sx, sy, sz));
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(tilt));
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(lean));
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(ox, sy * 0.34, oz));
    return g;
  };
  return mergeGeometries([
    shard(0.5, 1.7, 0.5, 0.12, 0.3, 0, 0),
    shard(0.34, 1.05, 0.34, -0.38, 1.9, 0.42, 0.1),
    shard(0.26, 0.7, 0.26, 0.45, 4.1, -0.35, 0.28),
  ]);
}

export interface RealmFloraView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
  update(time: number): void;
}

const MUSHROOM_EMISSIVE = [0xff8fca, 0x8fe8d8]; // rose cap / spirit teal
const CRYSTAL_EMISSIVE = [0xb388e8, 0xe88fc0]; // amethyst / rose quartz
const GLOW_LIGHT_COLOR = 0xdf9fe0;

export function buildRealmFlora(seed: number): RealmFloraView {
  const group = new THREE.Group();
  group.name = 'realm-flora';
  const glowLights: THREE.PointLight[] = [];
  const { mushrooms, crystals } = placeFlora(seed);
  const pulsing: { mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial; base: number }[] =
    [];

  const instance = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    spots: Spot[],
    yLift: number,
  ): void => {
    if (spots.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    spots.forEach((spot, i) => {
      q.setFromAxisAngle(up, spot.rot);
      v.set(spot.x, spot.y + yLift * spot.scale, spot.z);
      s.set(spot.scale, spot.scale, spot.scale);
      mesh.setMatrixAt(i, m.compose(v, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // spans the whole band; the band is one zone
    group.add(mesh);
  };

  // Mushrooms: split by variant so each emissive color is one draw call.
  for (const variant of [0, 1]) {
    const geo = loadedGeos.get(MUSHROOM_URLS[variant]);
    if (!geo) continue;
    const base = GFX.composer ? 0.85 : 0.55;
    const mat = surfaceMat({
      color: 0xcfc0d8,
      emissive: MUSHROOM_EMISSIVE[variant],
      emissiveIntensity: base,
      roughness: 0.7,
    }) as THREE.MeshStandardMaterial;
    pulsing.push({ mat, base });
    instance(
      geo,
      mat,
      mushrooms.filter((sp) => sp.variant === variant),
      0,
    );
  }

  // Crystals: shared cluster geometry, two colorways.
  const clusterGeo = crystalClusterGeo();
  for (const variant of [0, 1]) {
    const base = GFX.composer ? 1.4 : 0.8;
    const mat = surfaceMat({
      color: 0x9a86b8,
      emissive: CRYSTAL_EMISSIVE[variant],
      emissiveIntensity: base,
      roughness: 0.35,
      flatShading: true,
    }) as THREE.MeshStandardMaterial;
    pulsing.push({ mat, base });
    instance(
      clusterGeo,
      mat,
      crystals.filter((sp) => sp.variant === variant),
      0.2,
    );
  }

  // The great tree of Eldergleam, rising over the town square.
  if (greatTreeScene) {
    const hub = REALM_ZONE.hub;
    const tree = greatTreeScene.clone(true);
    const tx = hub.x,
      tz = hub.z - 4;
    tree.position.set(tx, terrainHeight(tx, tz, seed) - 0.2, tz);
    tree.scale.setScalar(6.5);
    tree.rotation.y = 0.8;
    tree.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    group.add(tree);
    const canopyLight = new THREE.PointLight(GLOW_LIGHT_COLOR, 9, 20, 2);
    canopyLight.position.set(tx, terrainHeight(tx, tz, seed) + 7, tz);
    canopyLight.userData.baseIntensity = 9;
    glowLights.push(canopyLight);
    group.add(canopyLight);
  }

  // Glow lights at the largest features (deterministic pick: lowest hash
  // draws are the giants). They join the renderer's fireLights budget.
  const lit = [...mushrooms, ...crystals].sort((a, b) => b.scale - a.scale);
  for (const spot of lit.slice(0, GLOW_LIGHT_COUNT)) {
    const light = new THREE.PointLight(GLOW_LIGHT_COLOR, 7, 15, 2);
    light.position.set(spot.x, spot.y + 1.2 + spot.scale * 0.5, spot.z);
    light.userData.baseIntensity = 7;
    glowLights.push(light);
    group.add(light);
  }

  return {
    group,
    glowLights,
    update(time: number): void {
      // one gentle shared breath across the glowing materials
      const breathe = 1 + Math.sin(time * 0.9) * 0.18;
      for (const entry of pulsing) entry.mat.emissiveIntensity = entry.base * breathe;
    },
  };
}
