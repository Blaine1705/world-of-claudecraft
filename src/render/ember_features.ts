// The Drakelands' volcanic dressing, all render-only: the maintainer's
// modeled lava set (pools in the shaped basins plus a flat-land network of
// pools and connecting rivers, and terraces cascading the volcano flanks),
// dragon-den hoards and egg clutches, giant ember-lily trees, ember
// crystal clusters, and the Bloodglass Fields' red crystal spurs. Same
// contract as realm_flora: build once, update(time) animates, lights join
// the renderer's rank-culled fireLights budget.
import * as THREE from 'three';
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
  terrace: '/models/props/lava_terrace.glb',
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

  // --- the lava: the modeled pool filling every shaped basin (the old
  // procedural discs are gone), a flat-land pool-and-river network out on
  // the waste, terraces cascading the volcano flanks into the pools, and
  // each basin's glow light kept ---
  {
    const T = (x: number, z: number): number => terrainHeight(x, z, seed);
    const poolSpots: PropPlacement[] = EMBER_LAVA_POOLS.map((pool) => ({
      x: pool.x,
      z: pool.z,
      y: pool.floor + 0.4,
      fp: pool.r * 2.15,
      rot: hash2(pool.x, pool.z, seed + 801) * Math.PI * 2,
    }));
    // the flat-land network: render-only pools on probed level ground,
    // joined to one another and to the shaped basins by long river runs
    poolSpots.push({ x: 330, z: 2250, y: T(330, 2250) - 0.2, fp: 16, rot: 0.7 });
    poolSpots.push({ x: 344, z: 2233, y: T(344, 2233) - 0.2, fp: 12, rot: 2.1 });
    poolSpots.push({ x: 418, z: 2196, y: T(418, 2196) - 0.2, fp: 14, rot: 1.4 });
    instanceProp('pool', poolSpots);
    const seg = (x: number, z: number, rot: number, fp = 9): PropPlacement => ({
      x,
      z,
      y: T(x, z) - 0.1,
      fp,
      rot,
    });
    // a connecting run: alternating river variants laid nose to tail from
    // just outside one pool's rim to just outside the other's
    const riverSegs: PropPlacement[][] = [[], [], []];
    const endSegs: PropPlacement[] = [];
    const chain = (x0: number, z0: number, x1: number, z1: number, fp: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const rot = Math.atan2(x1 - x0, z1 - z0);
      const step = fp * 0.82;
      let k = 0;
      for (let d = step * 0.5; d < len - step * 0.4; d += step) {
        const t = d / len;
        riverSegs[k % 3].push(seg(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rot, fp));
        k++;
      }
      endSegs.push(seg(x1 - Math.sin(rot) * step * 0.3, z1 - Math.cos(rot) * step * 0.3, rot, fp));
    };
    chain(330, 2250, 344, 2233, 9); // the twin pools' own link
    chain(330, 2250, 302, 2328, 10); // the long run south into the waste basin
    chain(294, 2318, 302, 2328, 8); // the west cone's terrace outflow
    chain(418, 2196, 446, 2220, 9); // the north pool into the spring basin
    instanceProp('riverA', riverSegs[0]);
    instanceProp('riverB', riverSegs[1]);
    instanceProp('riverC', riverSegs[2]);
    // river mouths: the chain ends, the Moltenmaw saddle overflow, and the
    // east cone's foot
    instanceProp('riverEnd', [
      ...endSegs,
      seg(428, 2335, Math.atan2(438 - 418, 2326 - 2342), 11),
      seg(480, 2343, Math.atan2(-14, -15), 9),
    ]);
    // the terraces, stepped down the flanks toward the pools below
    const terr = (x: number, z: number, tx: number, tz: number): PropPlacement => ({
      x,
      z,
      y: T(x, z) - 0.15,
      fp: 10,
      rot: Math.atan2(tx - x, tz - z),
    });
    instanceProp('terrace', [
      // the Drakemaw's southeast flank, down into the Moltenmaw
      terr(400, 2328, 418, 2342),
      terr(406, 2333, 418, 2342),
      terr(412, 2338, 418, 2342),
      // the west cone, down toward the waste pool
      terr(276, 2292, 302, 2328),
      terr(292, 2320, 302, 2328),
      // the east cone's northwest face, to the river mouth at its foot
      terr(494, 2358, 480, 2343),
      terr(486, 2350, 480, 2343),
    ]);
    for (const pool of EMBER_LAVA_POOLS) {
      const light = new THREE.PointLight(0xff5a18, 8, pool.r * 3.4, 2);
      light.position.set(pool.x, pool.floor + 2.6, pool.z);
      light.userData.baseIntensity = 8;
      glowLights.push(light);
      group.add(light);
    }
    for (const p2 of [
      { x: 330, z: 2250, r: 8 },
      { x: 344, z: 2233, r: 6 },
      { x: 418, z: 2196, r: 7 },
    ]) {
      const light = new THREE.PointLight(0xff5a18, 6, p2.r * 3.4, 2);
      light.position.set(p2.x, T(p2.x, p2.z) + 2.2, p2.z);
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
      if (Math.hypot(x - 330, z - 2250) < 12 || Math.hypot(x - 344, z - 2233) < 9) return false;
      if (Math.hypot(x - 418, z - 2196) < 11) return false;
      // the river runs keep their banks clear
      for (const run of [
        [330, 2250, 302, 2328],
        [294, 2318, 302, 2328],
        [418, 2196, 446, 2220],
        [330, 2250, 344, 2233],
      ] as const) {
        const dx = run[2] - run[0];
        const dz = run[3] - run[1];
        const t = Math.max(
          0,
          Math.min(1, ((x - run[0]) * dx + (z - run[1]) * dz) / (dx * dx + dz * dz)),
        );
        if (Math.hypot(x - (run[0] + dx * t), z - (run[1] + dz * t)) < 8) return false;
      }
      return true;
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
        const spot = {
          x,
          z,
          y: y - 0.1,
          rot: hash2(z, x, seed + 841) * Math.PI * 2,
        };
        if (r < 0.07) {
          // a giant lily only roots on LEVEL ground (the willow rule)
          const e = 1.2;
          const hx = terrainHeight(x + e, z, seed) - terrainHeight(x - e, z, seed);
          const hz = terrainHeight(x, z + e, seed) - terrainHeight(x, z - e, seed);
          if (Math.hypot(hx, hz) / (2 * e) > 0.3) continue;
          lilySpots.push({ ...spot, fp: 7 + hash2(x, z, seed + 851) * 4 });
        } else {
          crystalSpots.push({ ...spot, fp: 1.8 + hash2(x, z, seed + 861) * 1.6 });
        }
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
