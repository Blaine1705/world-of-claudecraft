// The Drakelands' volcanic dressing, all render-only: glowing lava surfaces
// in the shaped basins (world.ts EMBER_LAVA_POOLS), ember plumes rising off
// them, and the Bloodglass Fields' red crystal spurs. Same contract as
// realm_flora: build once, update(time) animates, lights join the renderer's
// rank-culled fireLights budget.
import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import { EMBER_LAVA_FLOOR, EMBER_LAVA_POOLS, terrainHeight } from '../sim/world';
import { GFX } from './gfx';

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
  const pulsingLava: THREE.MeshBasicMaterial[] = [];

  // --- lava surfaces: unlit glowing discs riding above each basin floor
  // (MeshBasic like the falls pool: immune to the scene lighting, always
  // reads molten; the point light below carries the glow onto the rocks) ---
  for (const pool of EMBER_LAVA_POOLS) {
    const lavaMat = new THREE.MeshBasicMaterial({
      color: 0xff6a1e,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });
    pulsingLava.push(lavaMat);
    const lava = new THREE.Mesh(new THREE.CircleGeometry(pool.r * 0.92, 22), lavaMat);
    lava.rotation.x = -Math.PI / 2;
    // riding well above the shaped floor: the render terrain LOD undershoots
    // small basins, so a surface at floor height would sink under the mesh
    lava.position.set(pool.x, EMBER_LAVA_FLOOR + 1.5, pool.z);
    group.add(lava);
    const light = new THREE.PointLight(0xff6a20, 7, pool.r * 3.2, 2);
    light.position.set(pool.x, EMBER_LAVA_FLOOR + 3.2, pool.z);
    light.userData.baseIntensity = 7;
    glowLights.push(light);
    group.add(light);
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

  return {
    group,
    glowLights,
    update(time: number): void {
      // the lava breathes: a slow molten pulse shared by every pool
      const pulse = 0.86 + Math.sin(time * 0.7) * 0.09 + Math.sin(time * 2.3) * 0.04;
      for (const mat of pulsingLava) mat.opacity = pulse;
    },
  };
}
