// The Drakelands' volcanic dressing, all render-only: the maintainer's
// modeled lava set (pools in the shaped basins plus a flat-land network of
// pools and connecting rivers, and terraces cascading the volcano flanks),
// dragon-den hoards and egg clutches, giant ember-lily trees, ember
// crystal clusters, and the Bloodglass Fields' red crystal spurs. Same
// contract as realm_flora: build once, update(time) animates, lights join
// the renderer's rank-culled fireLights budget.
import * as THREE from 'three';
import {
  EMBER_FLAT_POOLS,
  EMBER_LAVA_LINKS,
  emberLinkPolyline,
  emberNearestOnLink,
} from '../sim/ember_lava_layout';
import { hash2 } from '../sim/rng';
import { EMBER_LAVA_POOLS, EMBER_VOLCANOES, roadDistance, terrainHeight } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';

// the Drakelands prop models (built by build_drakelands_props.mjs)
const EMBER_PROP_URLS = {
  pool: '/models/props/lava_pool.glb',
  riverA: '/models/props/lava_river_a.glb',
  riverB: '/models/props/lava_river_b.glb',
  riverC: '/models/props/lava_river_c.glb',
  riverEnd: '/models/props/lava_river_end.glb',
  hoard: '/models/props/dragon_hoard.glb',
  eggs: '/models/props/dragon_eggs.glb',
  lily: '/models/props/ember_lily.glb',
} as const;
type EmberPropKey = keyof typeof EMBER_PROP_URLS;
const propScenes: Partial<Record<EmberPropKey, THREE.Group>> = {};
for (const key of Object.keys(EMBER_PROP_URLS) as EmberPropKey[]) {
  registerPreload(
    loadGltf(EMBER_PROP_URLS[key]).then((gltf) => {
      propScenes[key] = gltf.scene;
    }),
  );
}

export const emberFeaturesPreloadInternalsForTest = {
  propUrls: Object.values(EMBER_PROP_URLS),
};

interface PropPlacement {
  x: number;
  y: number;
  z: number;
  /** target footprint in world units (the model is normalized per part set) */
  fp: number;
  rot: number;
}

// bake a loaded scene into parts + its native footprint (xz-centered,
// min-y at 0: the fen_features idiom, plus the measured box for scaling)
function extractParts(scene: THREE.Group): {
  parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[];
  foot: number;
} {
  scene.updateMatrixWorld(true);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    parts.push({ geo, mat: mesh.material as THREE.Material });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox as THREE.Box3);
  }
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (const p of parts) {
    p.geo.translate(-cx, -box.min.y, -cz);
    p.geo.computeBoundingBox();
    p.geo.computeBoundingSphere();
  }
  return { parts, foot: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) };
}

export interface EmberFeaturesView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
  update(time: number): void;
}

// The Bloodglass Fields: shard clusters seeded around the POI.
const BLOODGLASS = { x: -90, z: 1890, r: 42 };
const BLOODGLASS_TINTS = [0xd83a2c, 0xb82838, 0xe85838];

function shardGeo(): THREE.BufferGeometry {
  // a stretched octahedron reads as a glassy spur in the flat-shaded style
  const geo = new THREE.OctahedronGeometry(1, 0);
  geo.scale(0.38, 1.7, 0.38);
  return geo.toNonIndexed();
}

export function buildEmberFeatures(seed: number): EmberFeaturesView {
  const group = new THREE.Group();
  group.name = 'ember-features';
  const glowLights: THREE.PointLight[] = [];

  // one instanced draw per (model part, placement list); every model is
  // normalized to its measured footprint so `fp` is real world units
  const instanceProp = (key: EmberPropKey, spots: PropPlacement[]): void => {
    const scene = propScenes[key];
    if (!scene || spots.length === 0) return;
    const { parts, foot } = extractParts(scene);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, spots.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3();
      spots.forEach((sp, i) => {
        const sf = sp.fp / foot;
        q.setFromAxisAngle(up, sp.rot);
        v.set(sp.x, sp.y, sp.z);
        sc.set(sf, sf, sf);
        mesh.setMatrixAt(i, m.compose(v, q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  };

  // --- the lava: the modeled pool filling every shaped basin and crater,
  // and the flat-land pool-and-river network out on the waste. The network
  // geometry (pools, tree links, meander curves) is the shared layout leaf
  // src/sim/ember_lava_layout.ts; the terrain grades a flush bed under the
  // SAME curves (world.ts applyEmberLavaNetwork), so nothing here floats
  // and nothing sinks. One river per pool pair; a crater keeps exactly one
  // pool sized to its pit and nothing else. ---
  {
    const T = (x: number, z: number): number => terrainHeight(x, z, seed);
    // crater pits: one pool each, fitted to the pit rather than the melt
    // record's own r (the Drakemaw's eye nests inside its escape bench)
    const CRATER_FIT: Record<string, number> = {
      '390,2320': 19, // the Drakemaw vent, up to the wade-out ramp
      '270,2282': 14.5, // the west cone's pit
      '487,2356': 12.5, // the east cone's pit
    };
    const poolSpots: PropPlacement[] = EMBER_LAVA_POOLS.map((pool) => ({
      x: pool.x,
      z: pool.z,
      y: pool.floor + 0.4,
      fp: CRATER_FIT[`${pool.x},${pool.z}`] ?? pool.r * 2.15,
      rot: hash2(pool.x, pool.z, seed + 801) * Math.PI * 2,
    }));
    // the flat-land network pools, resting on their graded level pads
    for (const pool of EMBER_FLAT_POOLS) {
      poolSpots.push({
        x: pool.x,
        z: pool.z,
        y: pool.h + 0.15,
        fp: pool.r * 2,
        rot: hash2(pool.x, pool.z, seed + 802) * Math.PI * 2,
      });
    }
    instanceProp('pool', poolSpots);
    const seg = (x: number, z: number, rot: number, fp: number): PropPlacement => ({
      x,
      z,
      y: T(x, z) - 0.1,
      fp,
      rot,
    });
    // each link renders as alternating river variants laid nose to tail
    // along the SHARED meander polyline (the same curve the terrain bed
    // follows). Each model's channel runs along its own axis (variant A
    // along +z, B/C and the end piece along +x, measured from the shipped
    // GLBs), so every piece takes a per-variant yaw offset that lands its
    // channel ON the local tangent; every other piece also flips
    // end-for-end so the mouths meet flush instead of repeating the same
    // closed end down the run.
    const AXIS_OFFSET = [0, -Math.PI / 2, -Math.PI / 2]; // riverA, riverB, riverC
    const riverSegs: PropPlacement[][] = [[], [], []];
    const endSegs: PropPlacement[] = [];
    for (const link of EMBER_LAVA_LINKS) {
      const pts = emberLinkPolyline(link);
      // cumulative arc length along the polyline
      const arc: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        arc.push(arc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      }
      const len = arc[arc.length - 1];
      const at = (d: number): { x: number; z: number } => {
        let i = 1;
        while (i < arc.length - 1 && arc[i] < d) i++;
        const t = (d - arc[i - 1]) / Math.max(1e-6, arc[i] - arc[i - 1]);
        return {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
          z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t,
        };
      };
      const step = link.w * 0.72;
      let k = 0;
      for (let d = link.trim0; d < len - link.trim1; d += step) {
        const here = at(d);
        const ahead = at(Math.min(len, d + 1.5));
        const yaw = Math.atan2(ahead.x - here.x, ahead.z - here.z);
        const variant = k % 3;
        const flip = k % 2 === 1 ? Math.PI : 0;
        riverSegs[variant].push(seg(here.x, here.z, yaw + AXIS_OFFSET[variant] + flip, link.w));
        k++;
      }
      // the receiving mouth's cap, tucked just short of the pool
      const tail = at(Math.max(0, len - link.trim1 + step * 0.25));
      const tailPrev = at(Math.max(0, len - link.trim1 + step * 0.25 - 1.5));
      const tailYaw = Math.atan2(tail.x - tailPrev.x, tail.z - tailPrev.z);
      endSegs.push(seg(tail.x, tail.z, tailYaw - Math.PI / 2, link.w));
    }
    instanceProp('riverA', riverSegs[0]);
    instanceProp('riverB', riverSegs[1]);
    instanceProp('riverC', riverSegs[2]);
    instanceProp('riverEnd', endSegs);
    for (const pool of EMBER_LAVA_POOLS) {
      const light = new THREE.PointLight(0xff5a18, 8, pool.r * 3.4, 2);
      light.position.set(pool.x, pool.floor + 2.6, pool.z);
      light.userData.baseIntensity = 8;
      glowLights.push(light);
      group.add(light);
    }
    for (const pool of EMBER_FLAT_POOLS) {
      const light = new THREE.PointLight(0xff5a18, 6, pool.r * 3.4, 2);
      light.position.set(pool.x, pool.h + 2.2, pool.z);
      light.userData.baseIntensity = 6;
      glowLights.push(light);
      group.add(light);
    }
  }

  // --- the dragon dens: a treasure hoard and egg clutches where the
  // emberwing drakes roost, each piece on its probed LEVEL shelf ---
  instanceProp('hoard', [
    { x: 417, z: 2262, y: terrainHeight(417, 2262, seed) - 0.1, fp: 7, rot: 1.2 },
  ]);
  instanceProp('eggs', [
    { x: 423, z: 2268, y: terrainHeight(423, 2268, seed) - 0.05, fp: 4.5, rot: 0.4 },
    { x: 299, z: 2256, y: terrainHeight(299, 2256, seed) - 0.05, fp: 4.5, rot: 2.6 },
  ]);

  // --- the ember lilies (giant crystal-flower trees) and small ember
  // crystal clusters, scattered across the dry waste ---
  {
    const lilySpots: PropPlacement[] = [];
    const crystalSpots: PropPlacement[] = [];
    const clearOf = (x: number, z: number): boolean => {
      if (roadDistance(x, z) < 6) return false;
      if (Math.hypot(x - 404, z - 1900) < 32) return false; // Wyrmwatch
      for (const pool of EMBER_LAVA_POOLS)
        if (Math.hypot(x - pool.x, z - pool.z) < pool.r * 1.5 + 6) return false;
      for (const v of EMBER_VOLCANOES)
        if (Math.hypot(x - v.x, z - v.z) < v.craterR + 10) return false;
      for (const den of [
        { x: 419, z: 2266 },
        { x: 302, z: 2258 },
      ])
        if (Math.hypot(x - den.x, z - den.z) < 13) return false;
      for (const pool of EMBER_FLAT_POOLS) {
        if (Math.hypot(x - pool.x, z - pool.z) < pool.r * 1.5 + 5) return false;
      }
      // the river links keep their banks clear (the shared meander, so the
      // clearance follows the real channel, not the straight chord)
      for (const link of EMBER_LAVA_LINKS) {
        if (emberNearestOnLink(link, x, z).dist < link.w * 0.8 + 4) return false;
      }
      return true;
    };
    // level-ground gate (the willow rule): lilies only root on flats
    const levelAt = (x: number, z: number): boolean => {
      const e = 1.2;
      const hx = terrainHeight(x + e, z, seed) - terrainHeight(x - e, z, seed);
      const hz = terrainHeight(x, z + e, seed) - terrainHeight(x, z - e, seed);
      return Math.hypot(hx, hz) / (2 * e) <= 0.3;
    };
    for (let gx = 200; gx <= 530; gx += 12) {
      for (let gz = 1830; gz <= 2405; gz += 12) {
        const r = hash2(gx, gz, seed + 811);
        if (r > 0.2) continue;
        const x = gx + (hash2(gx + 1, gz, seed + 821) - 0.5) * 9;
        const z = gz + (hash2(gx, gz + 1, seed + 831) - 0.5) * 9;
        const y = terrainHeight(x, z, seed);
        if (y < 1) continue;
        if (!clearOf(x, z)) continue;
        if (r >= 0.055) {
          crystalSpots.push({
            x,
            z,
            y: y - 0.1,
            rot: hash2(z, x, seed + 841) * Math.PI * 2,
            fp: 1.8 + hash2(x, z, seed + 861) * 1.6,
          });
          continue;
        }
        // a lily GROVE: the giants grow in families, huge elders at the
        // heart, giants around them, smaller lilies at the skirt (1 to 2
        // huge, 2 to 3 giant, 3 to 4 small per clump), every stem on its
        // own probed level ground
        if (!levelAt(x, z)) continue;
        const tier = [
          { n: 1 + Math.round(hash2(gx, gz, seed + 852)), lo: 11, hi: 15, rad: 3.2 },
          { n: 2 + Math.round(hash2(gx, gz, seed + 853)), lo: 7, hi: 10, rad: 7.5 },
          { n: 3 + Math.round(hash2(gx, gz, seed + 854)), lo: 3.5, hi: 6, rad: 11 },
        ];
        let placed = 0;
        tier.forEach((t, ti) => {
          for (let k = 0; k < t.n; k++) {
            const ang = hash2(gx + k, gz + ti * 7, seed + 855) * Math.PI * 2;
            const dist =
              ti === 0 && k === 0
                ? 0
                : t.rad * (0.55 + hash2(gx, gz + k + ti * 13, seed + 856) * 0.45);
            const lx = x + Math.sin(ang) * dist;
            const lz = z + Math.cos(ang) * dist;
            const ly = terrainHeight(lx, lz, seed);
            if (ly < 1 || !clearOf(lx, lz) || !levelAt(lx, lz)) continue;
            lilySpots.push({
              x: lx,
              z: lz,
              y: ly - 0.1,
              fp: t.lo + hash2(lz, lx, seed + 857) * (t.hi - t.lo),
              rot: hash2(lx, lz, seed + 858) * Math.PI * 2,
            });
            placed++;
          }
        });
        // a clump that lost every stem to the gates leaves no mark
        if (placed === 0) continue;
      }
    }
    // a dense crystal garden on the Bloodglass Fields
    for (let k = 0; k < 14; k++) {
      const ang = hash2(k, 3, seed + 871) * Math.PI * 2;
      const dist = Math.sqrt(hash2(k, 5, seed + 881)) * 26;
      const x = 270 + Math.sin(ang) * dist;
      const z = 2270 + Math.cos(ang) * dist;
      const y = terrainHeight(x, z, seed);
      if (y < 1 || !clearOf(x, z)) continue;
      crystalSpots.push({
        x,
        z,
        y: y - 0.1,
        fp: 2.2 + hash2(k, 7, seed + 891) * 1.8,
        rot: hash2(k, 11, seed + 895) * Math.PI * 2,
      });
    }
    instanceProp('lily', lilySpots);
    instanceProp('lily', crystalSpots);
  }

  // --- bloodglass shards: instanced clusters with a dim inner glow ---
  const spots: { x: number; z: number; y: number; s: number; rot: number; tint: number }[] = [];
  for (let k = 0; k < 46; k++) {
    const ang = hash2(k, 11, seed + 901) * Math.PI * 2;
    const dist = Math.sqrt(hash2(k, 23, seed + 911)) * BLOODGLASS.r;
    const x = BLOODGLASS.x + Math.sin(ang) * dist;
    const z = BLOODGLASS.z + Math.cos(ang) * dist;
    const y = terrainHeight(x, z, seed);
    if (y < 0) continue;
    spots.push({
      x,
      z,
      y,
      s: 0.7 + hash2(k, 37, seed + 921) * 2.4,
      rot: hash2(k, 41, seed + 931) * Math.PI * 2,
      tint: BLOODGLASS_TINTS[Math.floor(hash2(k, 53, seed + 941) * BLOODGLASS_TINTS.length)],
    });
  }
  if (spots.length > 0) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb03028,
      emissive: 0x8a1410,
      emissiveIntensity: GFX.composer ? 0.5 : 0.35,
      roughness: 0.35,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(shardGeo(), mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qTilt = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const tiltAxis = new THREE.Vector3();
    spots.forEach((sp, i) => {
      q.setFromAxisAngle(up, sp.rot);
      tiltAxis.set(Math.sin(sp.rot * 3.1), 0, Math.cos(sp.rot * 3.1)).normalize();
      qTilt.setFromAxisAngle(tiltAxis, (hash2(i, 61, seed + 951) - 0.5) * 0.7);
      q.premultiply(qTilt);
      v.set(sp.x, sp.y + sp.s * 0.55, sp.z);
      sc.set(sp.s, sp.s, sp.s);
      mesh.setMatrixAt(i, m.compose(v, q, sc));
      mesh.setColorAt(i, new THREE.Color(sp.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    const fieldLight = new THREE.PointLight(0xc82818, 5, 30, 2);
    fieldLight.position.set(
      BLOODGLASS.x,
      terrainHeight(BLOODGLASS.x, BLOODGLASS.z, seed) + 3,
      BLOODGLASS.z,
    );
    fieldLight.userData.baseIntensity = 5;
    glowLights.push(fieldLight);
    group.add(fieldLight);
  }

  // --- bone fields: ivory remains scattered near the graveyards and the
  // open waste (procedural skulls and rib shards, instanced) ---
  {
    const boneGeo = new THREE.IcosahedronGeometry(0.42, 0);
    boneGeo.scale(1, 0.72, 0.85);
    const ribGeo = new THREE.TorusGeometry(0.55, 0.07, 5, 8, Math.PI);
    const merged: { g: THREE.BufferGeometry; skull: boolean }[] = [
      { g: boneGeo.toNonIndexed(), skull: true },
      { g: ribGeo.toNonIndexed(), skull: false },
    ];
    const FIELDS = [
      { x: -6, z: 1712, r: 22 },
      { x: -60, z: 1796, r: 24 },
      { x: 92, z: 1732, r: 20 },
      { x: 10, z: 1860, r: 34 },
    ];
    for (const part of merged) {
      const spots2: { x: number; z: number; y: number; s: number; rot: number }[] = [];
      FIELDS.forEach((f, fi) => {
        for (let k = 0; k < 9; k++) {
          const ang = hash2(k + fi * 31, 7, seed + 971) * Math.PI * 2;
          const dist = Math.sqrt(hash2(k, fi + 13, seed + 981)) * f.r;
          const x = f.x + Math.sin(ang) * dist;
          const z = f.z + Math.cos(ang) * dist;
          const y = terrainHeight(x, z, seed);
          if (y < 0) continue;
          spots2.push({
            x,
            z,
            y: y + 0.1,
            s: 0.7 + hash2(k, fi, seed + 991) * 1.1,
            rot: hash2(fi, k, seed + 995) * Math.PI * 2,
          });
        }
      });
      if (spots2.length === 0) continue;
      const mat = new THREE.MeshStandardMaterial({
        color: part.skull ? 0xe8e0d0 : 0xdcd2be,
        roughness: 0.9,
        flatShading: true,
      });
      const mesh = new THREE.InstancedMesh(part.g, mat, spots2.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3();
      spots2.forEach((sp, i) => {
        q.setFromAxisAngle(up, sp.rot);
        v.set(sp.x, sp.y, sp.z);
        sc.set(sp.s, sp.s, sp.s);
        mesh.setMatrixAt(i, m.compose(v, q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  return {
    group,
    glowLights,
    update(): void {
      // the modeled melt holds its pose; the glow lights carry the life
    },
  };
}
