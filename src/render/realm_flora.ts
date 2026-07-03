// Glowing flora, crystal formations, and realm-only trees for the Veiled
// Hollow: the magical dressing layered over the regular biome foliage.
//
// - Glowing mushrooms reuse the bundled mushroom prop GLBs WITH their painted
//   materials (spots and caps stay readable), lifted by a soft emissive
//   rather than a flat neon re-material. Giants rise over the Gleaming Deep
//   and the Duskfall path, each seeding a ring of small "spore" mushrooms;
//   per-area instance tints shift the hue (teal deep, rose path, violet
//   elsewhere).
// - Crystal outcrops are pure procedural clusters rooted INTO the ground:
//   bases buried, leaned with the terrain gradient so hillside crystals jut
//   from the slope. A dim faceted outer shell carries the depth; a small
//   bright core carries the glow; low roughness picks up env glints.
// - Duskbell flowers, weeping willows (lakeshores), blossom trees (roadsides
//   and the town fringe), and mossy boulders are procedural or reuse bundled
//   rocks: no new asset files anywhere.
// - Placement is a deterministic hash grid from the world seed (no rng
//   stream), skipping the hub plateau, roads, and water, so every client
//   grows the same realm.
// - A handful of glow point lights ride the campfire light budget (the
//   renderer rank-culls and flickers them via userData.baseIntensity).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REALM_PROPS, REALM_ZONE } from '../sim/content/realm';
import { hash2 } from '../sim/rng';
import { roadDistance, terrainHeight, WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX, surfaceMat } from './gfx';

const MUSHROOM_URLS = ['/models/props/mushroom_red.glb', '/models/props/mushroom_tan.glb'];
const BOULDER_URL = '/models/props/rock_large_d.glb';
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

// Per-material parts of a GLB, world-baked, with the SOURCE material kept so
// painted detail (cap spots) survives. Cache entries are immutable; clone
// materials before mutating.
interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}
const loadedParts = new Map<string, ModelPart[]>();
for (const url of [...MUSHROOM_URLS, BOULDER_URL]) {
  registerPreload(
    loadGltf(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: ModelPart[] = [];
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
        parts.push({ geometry: geo, material: mesh.material as THREE.Material });
      });
      loadedParts.set(url, parts);
    }),
  );
}

// Placement regions (see the ZoneDef POIs in sim/content/realm.ts).
const GLEAMING_DEEP = { x: -70, z: 1155, r: 58 };
const SHALLOWS = { x: 75, z: 1165, r: 48 };
const SUNKEN_COURT = { x: 125, z: 1085, r: 42 };
const STARFALL_RIM = { x: 110, z: 985, r: 36 };
const STARFALL_LAKE = { x: 110, z: 985, r: 22 };
const SHALLOWS_LAKE = { x: 75, z: 1165, r: 18 };
const ELDER_GROVE = { x: 30, z: 955, r: 40 };
const DUSKFALL_Z_MAX = 1012; // the arrival path corridor (roadside giants)

const GRID_STEP = 8;
const GLOW_LIGHT_COUNT = 12;

function within(x: number, z: number, c: { x: number; z: number; r: number }): boolean {
  const dx = x - c.x,
    dz = z - c.z;
  return dx * dx + dz * dz < c.r * c.r;
}

// Terrain gradient at a point (for leaning growth into hillsides).
function terrainGradient(x: number, z: number, seed: number): { gx: number; gz: number } {
  const e = 0.75;
  const gx = (terrainHeight(x + e, z, seed) - terrainHeight(x - e, z, seed)) / (2 * e);
  const gz = (terrainHeight(x, z + e, seed) - terrainHeight(x, z - e, seed)) / (2 * e);
  return { gx, gz };
}

// Per-area hue families. Instance colors multiply the painted materials, so
// they read as regional varieties rather than flat repaints.
type Area = 'deep' | 'path' | 'shallows' | 'court' | 'glade';
function areaAt(x: number, z: number, dRoad: number): Area {
  if (within(x, z, GLEAMING_DEEP)) return 'deep';
  if (z < DUSKFALL_Z_MAX && x < -55 && dRoad < 15) return 'path';
  if (within(x, z, SHALLOWS) || within(x, z, STARFALL_RIM)) return 'shallows';
  if (within(x, z, SUNKEN_COURT)) return 'court';
  return 'glade';
}

const MUSHROOM_AREA_TINTS: Record<Area, number[]> = {
  deep: [0x9fd8e8, 0x8fe8c8, 0xbde8f2], // spirit teals
  path: [0xf2b8d8, 0xe8a8c0, 0xf2d0e0], // rose lantern
  shallows: [0xc8b8f2, 0xb8d0f2, 0xd8c8f2], // amethyst-blue
  court: [0xd8cfa8, 0xc8bfa0, 0xe0d8b8], // old-gold ruin
  glade: [0xd8c8e8, 0xc8d8d0, 0xe8d8e0], // soft violet-sage
};

const CRYSTAL_AREA_TINTS: Record<Area, number[]> = {
  deep: [0x8fe8d8, 0xa8e8e0],
  path: [0xe8a8d0, 0xf2c0dc],
  shallows: [0xb392e8, 0xc4a8f2, 0x9fb8f2],
  court: [0xd8c890, 0xe8d8a8],
  glade: [0xc0a8e8, 0xd0b8e8],
};

interface Spot {
  x: number;
  z: number;
  y: number;
  scale: number;
  rot: number;
  variant: number; // model/colorway pick within the family
  tint: number;
  lean?: { gx: number; gz: number }; // terrain gradient for rooted growth
}

interface Placements {
  mushrooms: Spot[];
  crystals: Spot[];
  flowers: Spot[];
  willows: Spot[];
  blossoms: Spot[];
  boulders: Spot[];
}

function placeFlora(seed: number): Placements {
  const out: Placements = {
    mushrooms: [],
    crystals: [],
    flowers: [],
    willows: [],
    blossoms: [],
    boulders: [],
  };
  const hub = REALM_ZONE.hub;

  const usable = (x: number, z: number, minRoad: number, hubPad = 6): number | null => {
    const dHub = Math.hypot(x - hub.x, z - hub.z);
    if (dHub < hub.radius + hubPad) return null;
    if (roadDistance(x, z) < minRoad) return null;
    const y = terrainHeight(x, z, seed);
    if (y < WATER_LEVEL + 1) return null;
    return y;
  };

  const pickTint = (table: number[], r: number): number =>
    table[Math.floor(r * 997) % table.length];

  // --- mushrooms + crystals + flowers on the main hash grid ---
  for (let gx = -172; gx <= 172; gx += GRID_STEP) {
    for (let gz = REALM_ZONE.zMin + 8; gz <= REALM_ZONE.zMax - 10; gz += GRID_STEP) {
      const r = hash2(gx, gz, seed + 201);
      const ox = (hash2(gx, gz, seed + 211) - 0.5) * GRID_STEP;
      const oz = (hash2(gx, gz, seed + 221) - 0.5) * GRID_STEP;
      const x = gx + ox,
        z = gz + oz;
      const dRoad = roadDistance(x, z);
      const y = usable(x, z, 4.5);
      if (y === null) continue;

      const rot = hash2(gx, gz, seed + 231) * Math.PI * 2;
      const variant = hash2(gx, gz, seed + 241) < 0.5 ? 0 : 1;
      const area = areaAt(x, z, dRoad);
      const shroomTint = pickTint(MUSHROOM_AREA_TINTS[area], r);
      const inShroomCountry = area === 'deep' || area === 'path';
      const inCrystalCountry = area === 'shallows' || area === 'court';

      const pushShroom = (scale: number) => {
        out.mushrooms.push({ x, z, y, scale, rot, variant, tint: shroomTint });
        if (scale >= 3.2) {
          // a giant seeds a spore-ring of small ones around its foot
          const kids = 3 + Math.floor(hash2(gx, gz, seed + 251) * 4);
          for (let k = 0; k < kids; k++) {
            const ang = hash2(gx + k + 1, gz, seed + 261) * Math.PI * 2;
            const dist = 1.6 + hash2(gx, gz + k + 1, seed + 271) * (1.2 + scale * 0.35);
            const kx = x + Math.sin(ang) * dist;
            const kz = z + Math.cos(ang) * dist;
            const ky = usable(kx, kz, 2.5);
            if (ky === null) continue;
            out.mushrooms.push({
              x: kx,
              z: kz,
              y: ky,
              scale: 0.45 + hash2(gx + k, gz + k, seed + 281) * 0.7,
              rot: ang * 2.3,
              variant: hash2(gx - k, gz + k, seed + 291) < 0.5 ? 0 : 1,
              tint: shroomTint,
            });
          }
        }
      };

      if (inShroomCountry) {
        if (r < 0.085)
          pushShroom(4 + r * 55); // giants, 4 to ~8.5
        else if (r < 0.62) pushShroom(0.8 + (r - 0.085) * 2.6);
      } else if (inCrystalCountry) {
        const chance = area === 'court' ? 0.18 : 0.42;
        if (r < chance) {
          out.crystals.push({
            x,
            z,
            y,
            scale: 0.9 + r * 4.5,
            rot,
            variant,
            tint: pickTint(CRYSTAL_AREA_TINTS[area], r * 3.7),
            lean: terrainGradient(x, z, seed),
          });
        } else if (r > 0.9) {
          pushShroom(0.7 + (1 - r) * 8);
        }
      } else {
        // the wider glade: a softer mix of everything
        if (r < 0.1)
          pushShroom(0.8 + r * 26); // occasional big one
        else if (r > 0.982) {
          out.crystals.push({
            x,
            z,
            y,
            scale: 0.8 + (1 - r) * 60,
            rot,
            variant,
            tint: pickTint(CRYSTAL_AREA_TINTS.glade, r * 5.1),
            lean: terrainGradient(x, z, seed),
          });
        }
      }

      // duskbell flowers: meadow drifts wherever the grass grows, thicker in
      // the glade and near the town's garden fringe
      const fr = hash2(gx, gz, seed + 301);
      const flowerChance = area === 'glade' ? 0.5 : 0.3;
      if (fr < flowerChance) {
        const patch = 2 + Math.floor(hash2(gx, gz, seed + 311) * 5);
        for (let k = 0; k < patch; k++) {
          const fx = x + (hash2(gx + 7 * k, gz, seed + 321) - 0.5) * 5;
          const fz = z + (hash2(gx, gz + 7 * k, seed + 331) - 0.5) * 5;
          const fy = usable(fx, fz, 1.2, 2); // flowers may hug the garden ring
          if (fy === null) continue;
          out.flowers.push({
            x: fx,
            z: fz,
            y: fy,
            scale: 0.7 + hash2(gx + k, gz - k, seed + 341) * 0.7,
            rot: hash2(gx - k, gz - k, seed + 351) * Math.PI * 2,
            variant: Math.floor(hash2(gx + k, gz + k, seed + 361) * 4),
            tint: 0xffffff,
          });
        }
      }
    }
  }

  // --- steep-slope crystals: jutting from the southern wall and hill faces ---
  for (let gx = -168; gx <= 168; gx += 6) {
    for (const gz of [952, 958, 964]) {
      const r = hash2(gx, gz, seed + 371);
      if (r > 0.3) continue;
      const x = gx + (hash2(gx, gz, seed + 381) - 0.5) * 5;
      const z = gz + (hash2(gx, gz, seed + 391) - 0.5) * 4;
      const y = terrainHeight(x, z, seed);
      if (y < WATER_LEVEL + 1 || roadDistance(x, z) < 5) continue;
      const grad = terrainGradient(x, z, seed);
      if (Math.hypot(grad.gx, grad.gz) < 0.35) continue; // only real slopes
      out.crystals.push({
        x,
        z,
        y,
        scale: 1.2 + r * 8,
        rot: hash2(gx, gz, seed + 401) * Math.PI * 2,
        variant: r < 0.15 ? 0 : 1,
        tint: r < 0.1 ? 0xe8a8d0 : 0xb392e8,
        lean: grad,
      });
    }
  }

  // --- weeping willows around the two lakeshores ---
  for (const lake of [STARFALL_LAKE, SHALLOWS_LAKE]) {
    for (let k = 0; k < 14; k++) {
      const ang = (k / 14) * Math.PI * 2 + hash2(k, lake.x, seed + 411) * 0.5;
      const dist = lake.r + 5 + hash2(lake.x, k, seed + 421) * 7;
      const x = lake.x + Math.sin(ang) * dist;
      const z = lake.z + Math.cos(ang) * dist;
      const y = usable(x, z, 3);
      if (y === null) continue;
      if (hash2(Math.round(x), Math.round(z), seed + 431) > 0.7) continue;
      out.willows.push({
        x,
        z,
        y,
        scale: 0.85 + hash2(k, k + 1, seed + 441) * 0.5,
        rot: ang,
        variant: 0,
        tint: 0xffffff,
      });
    }
  }

  // --- blossom trees along the roads and the town fringe ---
  for (let gx = -168; gx <= 168; gx += 10) {
    for (let gz = REALM_ZONE.zMin + 20; gz <= REALM_ZONE.zMax - 20; gz += 10) {
      const r = hash2(gx, gz, seed + 451);
      if (r > 0.22) continue;
      const x = gx + (hash2(gx, gz, seed + 461) - 0.5) * 6;
      const z = gz + (hash2(gx, gz, seed + 471) - 0.5) * 6;
      const dRoad = roadDistance(x, z);
      const dHub = Math.hypot(x - hub.x, z - hub.z);
      const roadside = dRoad > 5 && dRoad < 10;
      const townFringe = dHub > hub.radius + 4 && dHub < hub.radius + 16;
      if (!roadside && !townFringe) continue;
      const y = usable(x, z, 5, 4);
      if (y === null) continue;
      out.blossoms.push({
        x,
        z,
        y,
        scale: 0.8 + r * 2.2,
        rot: r * Math.PI * 9,
        variant: hash2(gx, gz, seed + 481) < 0.6 ? 0 : 1,
        tint: 0xffffff,
      });
    }
  }

  // --- mossy boulders in the Grove and the Deep ---
  for (const region of [ELDER_GROVE, GLEAMING_DEEP]) {
    for (let k = 0; k < 18; k++) {
      const ang = hash2(k, region.x, seed + 491) * Math.PI * 2;
      const dist = hash2(region.x, k, seed + 501) * region.r * 0.9;
      const x = region.x + Math.sin(ang) * dist;
      const z = region.z + Math.cos(ang) * dist;
      const y = usable(x, z, 4);
      if (y === null) continue;
      if (hash2(Math.round(x), Math.round(z), seed + 511) > 0.6) continue;
      out.boulders.push({
        x,
        z,
        y,
        scale: 1.2 + hash2(k, k, seed + 521) * 2.2,
        rot: ang * 3.1,
        variant: 0,
        tint: 0xffffff,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Procedural geometry: crystals, duskbell flowers, willows, blossom trees.
// All low-poly primitives in the game's flat-shaded style.
// ---------------------------------------------------------------------------

function crystalShellGeo(): THREE.BufferGeometry {
  const shard = (
    sx: number,
    sy: number,
    sz: number,
    tilt: number,
    leanY: number,
    ox: number,
    oz: number,
  ): THREE.BufferGeometry => {
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.applyMatrix4(new THREE.Matrix4().makeScale(sx, sy, sz));
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(tilt));
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(leanY));
    // bases sit BELOW the origin so the cluster reads as rooted once the
    // instance origin is sunk into the ground
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(ox, sy * 0.22, oz));
    return g;
  };
  return mergeGeometries([
    shard(0.55, 1.8, 0.55, 0.14, 0.3, 0, 0),
    shard(0.38, 1.1, 0.38, -0.42, 1.9, 0.48, 0.12),
    shard(0.3, 0.75, 0.3, 0.5, 4.1, -0.4, 0.3),
    shard(0.22, 0.5, 0.22, -0.25, 5.2, 0.1, -0.42),
  ]);
}

function crystalCoreGeo(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(0.5, 0);
  g.applyMatrix4(new THREE.Matrix4().makeScale(0.3, 1.15, 0.3));
  g.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.14));
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.35, 0));
  return g;
}

function duskbellGeo(): THREE.BufferGeometry {
  // a thin stem with a nodding bell head: reads as a flower at any distance
  const stem = new THREE.CylinderGeometry(0.015, 0.025, 0.42, 4);
  stem.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.21, 0));
  const bell = new THREE.ConeGeometry(0.09, 0.14, 6);
  bell.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI * 0.82)); // nodding
  bell.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.42, 0.05));
  const leaf = new THREE.ConeGeometry(0.05, 0.16, 3);
  leaf.applyMatrix4(new THREE.Matrix4().makeRotationZ(1.2));
  leaf.applyMatrix4(new THREE.Matrix4().makeTranslation(0.07, 0.12, 0));
  return mergeGeometries([stem, bell, leaf]);
}

function willowGeo(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.22, 0.42, 3.2, 6);
  trunk.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.12));
  trunk.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.6, 0));
  const parts: THREE.BufferGeometry[] = [];
  const dome = new THREE.SphereGeometry(1.9, 8, 5);
  dome.applyMatrix4(new THREE.Matrix4().makeScale(1.15, 0.62, 1.15));
  dome.applyMatrix4(new THREE.Matrix4().makeTranslation(0.35, 3.5, 0));
  parts.push(dome);
  // hanging strands around the canopy rim: the weeping silhouette
  for (let k = 0; k < 10; k++) {
    const ang = (k / 10) * Math.PI * 2;
    const strand = new THREE.ConeGeometry(0.16, 2.4 + (k % 3) * 0.5, 4);
    strand.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI)); // point down
    strand.applyMatrix4(
      new THREE.Matrix4().makeTranslation(
        0.35 + Math.sin(ang) * 1.75,
        2.5 - (k % 3) * 0.22,
        Math.cos(ang) * 1.75,
      ),
    );
    parts.push(strand);
  }
  return { trunk, canopy: mergeGeometries(parts) };
}

function blossomGeo(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.14, 0.3, 2.1, 5);
  trunk.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.18));
  trunk.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.05, 0));
  const branch = new THREE.CylinderGeometry(0.07, 0.12, 1.1, 4);
  branch.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.9));
  branch.applyMatrix4(new THREE.Matrix4().makeTranslation(0.55, 2.0, 0.1));
  const trunkAll = mergeGeometries([trunk, branch]);
  const puff = (s: number, x: number, y: number, z: number): THREE.BufferGeometry => {
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
    return g;
  };
  const canopy = mergeGeometries([
    puff(1.0, -0.15, 2.6, 0),
    puff(0.75, 0.95, 2.75, 0.2),
    puff(0.6, 0.35, 3.15, -0.45),
  ]);
  return { trunk: trunkAll, canopy };
}

export interface RealmFloraView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
  update(time: number): void;
}

const GLOW_LIGHT_COLOR = 0xdf9fe0;
const WILLOW_LEAF = 0x9fb8a8; // silver-sage, unlike any existing canopy
const WILLOW_BARK = 0x8a7a90;
const BLOSSOM_PINKS = [0xf2b8cc, 0xf8e0ea]; // cherry pink / near-white
const BLOSSOM_BARK = 0x6e5a66;
const FLOWER_TINTS = [0xf2a8c8, 0xe8e0f8, 0xa8d8e8, 0xd8b8f2]; // duskbell colorways
const BOULDER_MOSS = 0x9caa96;

export function buildRealmFlora(seed: number): RealmFloraView {
  const group = new THREE.Group();
  group.name = 'realm-flora';
  const glowLights: THREE.PointLight[] = [];
  const spots = placeFlora(seed);
  const pulsing: { mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial; base: number }[] =
    [];

  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qLean = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const leanAxis = new THREE.Vector3();

  const instance = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    list: Spot[],
    opts: { sink?: number; castShadow?: boolean; tinted?: boolean; leanInto?: boolean } = {},
  ): THREE.InstancedMesh | null => {
    if (list.length === 0) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((spot, i) => {
      q.setFromAxisAngle(up, spot.rot);
      if (opts.leanInto && spot.lean) {
        // lean the growth axis against the slope so it juts from the face
        const g = spot.lean;
        const mag = Math.hypot(g.gx, g.gz);
        if (mag > 0.15) {
          leanAxis.set(g.gz, 0, -g.gx).normalize(); // perpendicular to gradient
          qLean.setFromAxisAngle(leanAxis, Math.min(0.9, mag * 0.55));
          q.premultiply(qLean);
        }
      }
      const sink = (opts.sink ?? 0) * spot.scale;
      v.set(spot.x, spot.y - sink, spot.z);
      s.set(spot.scale, spot.scale, spot.scale);
      mesh.setMatrixAt(i, m.compose(v, q, s));
      if (opts.tinted) mesh.setColorAt(i, new THREE.Color(spot.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = opts.castShadow ?? false;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };

  // --- mushrooms: painted GLB materials + a soft emissive lift, per-area
  // instance tints, and giants casting real shadows for depth ---
  for (const variant of [0, 1]) {
    const parts = loadedParts.get(MUSHROOM_URLS[variant]);
    if (!parts) continue;
    const list = spots.mushrooms.filter((sp) => sp.variant === variant);
    for (const part of parts) {
      const mat = part.material.clone() as THREE.MeshStandardMaterial;
      if ('emissive' in mat) {
        mat.emissive = new THREE.Color(variant === 0 ? 0xff8fca : 0x8fe8d8);
        mat.emissiveIntensity = GFX.composer ? 0.28 : 0.18;
      }
      pulsing.push({ mat, base: (mat as THREE.MeshStandardMaterial).emissiveIntensity ?? 0 });
      instance(part.geometry, mat, list, { castShadow: true, tinted: true });
    }
  }

  // --- crystals: dim faceted shell for depth, bright core for the glow,
  // both rooted into the ground and leaned with the slope ---
  const shellGeo = crystalShellGeo();
  const coreGeo = crystalCoreGeo();
  const shellMat = surfaceMat({
    color: 0x8a76a8,
    emissive: 0x7a5fa0,
    emissiveIntensity: GFX.composer ? 0.3 : 0.2,
    roughness: 0.16,
    metalness: 0.18, // env glints off the facets
    flatShading: true,
  }) as THREE.MeshStandardMaterial;
  const coreMat = surfaceMat({
    color: 0xd8c8f2,
    emissive: 0xc9a8f2,
    emissiveIntensity: GFX.composer ? 1.1 : 0.7,
    roughness: 0.3,
    flatShading: true,
  }) as THREE.MeshStandardMaterial;
  pulsing.push({ mat: shellMat, base: shellMat.emissiveIntensity });
  pulsing.push({ mat: coreMat, base: coreMat.emissiveIntensity });
  instance(shellGeo, shellMat, spots.crystals, {
    sink: 0.3,
    castShadow: true,
    tinted: true,
    leanInto: true,
  });
  instance(coreGeo, coreMat, spots.crystals, { sink: 0.28, tinted: true, leanInto: true });

  // --- duskbell flowers, four colorways ---
  const flowerGeo = duskbellGeo();
  for (let colorway = 0; colorway < FLOWER_TINTS.length; colorway++) {
    const mat = surfaceMat({
      color: FLOWER_TINTS[colorway],
      emissive: FLOWER_TINTS[colorway],
      emissiveIntensity: GFX.composer ? 0.16 : 0.1,
      roughness: 0.8,
    }) as THREE.MeshStandardMaterial;
    instance(
      flowerGeo,
      mat,
      spots.flowers.filter((sp) => sp.variant === colorway),
    );
  }

  // --- weeping willows on the lakeshores ---
  const willow = willowGeo();
  instance(willow.trunk, surfaceMat({ color: WILLOW_BARK, roughness: 0.9 }), spots.willows, {
    castShadow: true,
  });
  instance(
    willow.canopy,
    surfaceMat({ color: WILLOW_LEAF, roughness: 0.85, flatShading: true }),
    spots.willows,
    { castShadow: true },
  );

  // --- blossom trees, two pinks ---
  const blossom = blossomGeo();
  instance(blossom.trunk, surfaceMat({ color: BLOSSOM_BARK, roughness: 0.9 }), spots.blossoms, {
    castShadow: true,
  });
  for (const variant of [0, 1]) {
    instance(
      blossom.canopy,
      surfaceMat({ color: BLOSSOM_PINKS[variant], roughness: 0.8, flatShading: true }),
      spots.blossoms.filter((sp) => sp.variant === variant),
      { castShadow: true },
    );
  }

  // --- mossy boulders (bundled rock, moss tint) ---
  const boulderParts = loadedParts.get(BOULDER_URL);
  if (boulderParts) {
    for (const part of boulderParts) {
      const mat = part.material.clone() as THREE.MeshStandardMaterial;
      if ('color' in mat) mat.color.multiply(new THREE.Color(BOULDER_MOSS));
      instance(part.geometry, mat, spots.boulders, { sink: 0.12, castShadow: true });
    }
  }

  // The great tree of Eldergleam, rising over the town square. Position and
  // trunk radius come from REALM_PROPS.greatTrees: the same record the sim's
  // collision grid consumes, so the visual and the collider never drift.
  const treeSpot = REALM_PROPS.greatTrees?.[0];
  if (greatTreeScene && treeSpot) {
    const tree = greatTreeScene.clone(true);
    const tx = treeSpot.x,
      tz = treeSpot.z;
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

  // Glow lights at the largest features (deterministic pick: the biggest
  // scales are the giants). They join the renderer's fireLights budget.
  const lit = [...spots.mushrooms, ...spots.crystals].sort((a, b) => b.scale - a.scale);
  for (const spot of lit.slice(0, GLOW_LIGHT_COUNT)) {
    const light = new THREE.PointLight(GLOW_LIGHT_COLOR, 6, 15, 2);
    light.position.set(spot.x, spot.y + 1.2 + spot.scale * 0.5, spot.z);
    light.userData.baseIntensity = 6;
    glowLights.push(light);
    group.add(light);
  }

  return {
    group,
    glowLights,
    update(time: number): void {
      // one gentle shared breath across the glowing materials
      const breathe = 1 + Math.sin(time * 0.9) * 0.16;
      for (const entry of pulsing) entry.mat.emissiveIntensity = entry.base * breathe;
    },
  };
}
