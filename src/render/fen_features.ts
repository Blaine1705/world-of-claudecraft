// The Willowfen's dressing, render-only: the maintainer's generated willow
// trees trailing over the pools, water-lily rafts on the still water, river
// reeds rooted along every shoreline, clumped mushroom-and-log patches out
// on the fen floor, and the old flowering hedge tufts. All the modeled
// pieces are GPU-instanced from five optimized GLBs (the flower-bed
// fidelity recipe; scripts/assets/build_willowfen_props.mjs). Same contract
// as the sibling realm modules: build once, update(time) animates gently.
import * as THREE from 'three';
import { WILLOWFEN_ZONE } from '../sim/content/willowfen';
import { hash2 } from '../sim/rng';
import { roadDistance, terrainHeight, WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';

export interface FenFeaturesView {
  group: THREE.Group;
  update(time: number): void;
}

const FEN_ZMIN = 180;
const FEN_ZMAX = 700;
const BLOOM_TINTS = [0xf2a8c8, 0xf2e0a0, 0xd8b8f2, 0xffffff, 0xf2a88f];

// the five Willowfen prop models (built by build_willowfen_props.mjs)
const FEN_PROP_URLS = {
  willow: '/models/props/willow_tree.glb',
  lilies: '/models/props/fen_lilies.glb',
  reeds: '/models/props/fen_reeds.glb',
  mushrooms: '/models/props/fen_mushrooms.glb',
  log: '/models/props/fen_log.glb',
} as const;
type FenPropKey = keyof typeof FEN_PROP_URLS;
const propScenes: Partial<Record<FenPropKey, THREE.Group>> = {};
for (const key of Object.keys(FEN_PROP_URLS) as FenPropKey[]) {
  registerPreload(
    loadGltf(FEN_PROP_URLS[key]).then((gltf) => {
      propScenes[key] = gltf.scene;
    }),
  );
}

export const fenFeaturesPreloadInternalsForTest = {
  propUrls: Object.values(FEN_PROP_URLS),
};

function mat(opts: {
  color: number;
  roughness?: number;
  flatShading?: boolean;
}): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({
        color: opts.color,
        roughness: opts.roughness ?? 0.85,
        flatShading: opts.flatShading ?? true,
      })
    : new THREE.MeshLambertMaterial({ color: opts.color, flatShading: opts.flatShading ?? true });
}

interface Placement {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  tint?: number;
}

// bake a loaded scene into (geometry, material) parts: world matrices
// applied, the whole model re-based so xz is centered and min-y sits at 0
function extractParts(scene: THREE.Group): { geo: THREE.BufferGeometry; mat: THREE.Material }[] {
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
  return parts;
}

export function buildFenFeatures(seed: number): FenFeaturesView {
  const group = new THREE.Group();
  group.name = 'fen-features';

  const instance = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    spots: Placement[],
    tinted = false,
  ) => {
    if (spots.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, material, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    spots.forEach((sp, i) => {
      q.setFromAxisAngle(up, sp.rot);
      v.set(sp.x, sp.y, sp.z);
      sc.set(sp.s, sp.s, sp.s);
      mesh.setMatrixAt(i, m.compose(v, q, sc));
      if (tinted && sp.tint !== undefined) mesh.setColorAt(i, new THREE.Color(sp.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };

  // instance every part of a loaded prop model at the given placements
  const instanceProp = (key: FenPropKey, spots: Placement[]): void => {
    const scene = propScenes[key];
    if (!scene || spots.length === 0) return;
    for (const part of extractParts(scene)) {
      instance(part.geo, part.mat, spots);
    }
  };

  const hub = WILLOWFEN_ZONE.hub;

  // --- the willows: the modeled weeping willow, ringing every pool and the
  // town moat (kept off the roads and out of the town's own lanes) ---
  {
    const spots: Placement[] = [];
    for (const lake of WILLOWFEN_ZONE.lakes) {
      const count = 2 + Math.floor(hash2(lake.x, lake.z, seed + 2101) * 3);
      for (let k = 0; k < count; k++) {
        const ang = hash2(k, lake.x + lake.z, seed + 2111) * Math.PI * 2;
        const dist = lake.radius + 5 + hash2(lake.x, k, seed + 2121) * 6;
        const x = lake.x + Math.sin(ang) * dist;
        const z = lake.z + Math.cos(ang) * dist;
        if (z < FEN_ZMIN + 8 || z > FEN_ZMAX - 8) continue;
        const y = terrainHeight(x, z, seed);
        if (y < WATER_LEVEL + 0.6) continue;
        if (Math.hypot(x - hub.x, z - hub.z) < 15) continue;
        if (roadDistance(x, z) < 5) continue;
        spots.push({
          x,
          z,
          y: y - 0.15,
          s: 7 + hash2(k, lake.z, seed + 2131) * 3.5,
          rot: hash2(lake.x + k, k, seed + 2141) * Math.PI * 2,
        });
      }
    }
    instanceProp('willow', spots);
  }

  // --- the water lilies: modeled lily rafts drifting on every pool ---
  {
    const spots: Placement[] = [];
    for (const lake of WILLOWFEN_ZONE.lakes) {
      const count = 2 + Math.floor(hash2(lake.z, lake.x, seed + 2201) * 3);
      for (let k = 0; k < count; k++) {
        const ang = hash2(k * 3, lake.x, seed + 2211) * Math.PI * 2;
        const dist = Math.sqrt(hash2(lake.z, k * 5, seed + 2221)) * lake.radius * 0.7;
        const x = lake.x + Math.sin(ang) * dist;
        const z = lake.z + Math.cos(ang) * dist;
        if (terrainHeight(x, z, seed) > WATER_LEVEL - 0.7) continue;
        if (roadDistance(x, z) < 4) continue;
        spots.push({
          x,
          z,
          y: WATER_LEVEL + 0.03,
          s: 3.5 + hash2(lake.x, k + 11, seed + 2241) * 2,
          rot: hash2(k, lake.x + 7, seed + 2231) * Math.PI * 2,
        });
      }
    }
    instanceProp('lilies', spots);
  }

  // --- the river reeds: rooted in the shallows along every shoreline ---
  {
    const spots: Placement[] = [];
    for (const lake of WILLOWFEN_ZONE.lakes) {
      const count = 4 + Math.floor(hash2(lake.x + 3, lake.z, seed + 2401) * 3);
      for (let k = 0; k < count; k++) {
        const ang = hash2(k * 7, lake.z, seed + 2411) * Math.PI * 2;
        // walk outward until the shallows band at the waterline is found
        let placed = false;
        for (let dist = lake.radius * 0.9; dist < lake.radius * 1.7; dist += 0.6) {
          const x = lake.x + Math.sin(ang) * dist;
          const z = lake.z + Math.cos(ang) * dist;
          const y = terrainHeight(x, z, seed);
          if (y < WATER_LEVEL - 0.45 || y > WATER_LEVEL + 0.25) continue;
          if (roadDistance(x, z) < 4) break;
          spots.push({
            x,
            z,
            y: y - 0.1,
            s: 2.6 + hash2(lake.z, k + 5, seed + 2421) * 1.2,
            rot: hash2(k, lake.x + 13, seed + 2431) * Math.PI * 2,
          });
          placed = true;
          break;
        }
        if (!placed) continue;
      }
    }
    instanceProp('reeds', spots);
  }

  // --- mushroom-and-log patches: clumped clusters out on the fen floor ---
  {
    const mushroomSpots: Placement[] = [];
    const logSpots: Placement[] = [];
    for (let gx = -520; gx <= -200; gx += 14) {
      for (let gz = FEN_ZMIN + 30; gz <= FEN_ZMAX - 60; gz += 14) {
        // a coarse patch gate: most cells stay empty, the rest clump
        if (hash2(gx, gz, seed + 2501) > 0.16) continue;
        const n = 2 + Math.floor(hash2(gz, gx, seed + 2511) * 2);
        for (let k = 0; k <= n; k++) {
          const x = gx + (hash2(gx + k, gz, seed + 2521) - 0.5) * 9;
          const z = gz + (hash2(gx, gz + k, seed + 2531) - 0.5) * 9;
          const y = terrainHeight(x, z, seed);
          if (y < WATER_LEVEL + 0.8) continue;
          if (roadDistance(x, z) < 4.5) continue;
          if (Math.hypot(x - hub.x, z - hub.z) < 22) continue;
          const spot: Placement = {
            x,
            z,
            y: y - 0.08,
            s: 2.4 + hash2(x, z, seed + 2541) * 1.4,
            rot: hash2(z, x, seed + 2551) * Math.PI * 2,
          };
          // one log anchors some patches; the rest are mushroom clusters
          if (k === 0 && hash2(gx, gz, seed + 2561) < 0.45) logSpots.push({ ...spot, s: 3 });
          else mushroomSpots.push(spot);
        }
      }
    }
    instanceProp('mushrooms', mushroomSpots);
    instanceProp('log', logSpots);
  }

  // --- flowering hedges: puffball bushes with bloom tints, near roadsides
  // and shores across the whole band ---
  {
    const bloomGeo = new THREE.IcosahedronGeometry(0.8, 0);
    bloomGeo.scale(1, 0.7, 1);
    const geo = bloomGeo.toNonIndexed();
    const spots: Placement[] = [];
    for (let gx = -520; gx <= -200; gx += 11) {
      for (let gz = FEN_ZMIN + 30; gz <= FEN_ZMAX - 60; gz += 11) {
        const r = hash2(gx, gz, seed + 2301);
        if (r > 0.42) continue;
        const x = gx + (hash2(gx, gz, seed + 2311) - 0.5) * 10;
        const z = gz + (hash2(gz, gx, seed + 2321) - 0.5) * 10;
        const y = terrainHeight(x, z, seed);
        if (y < WATER_LEVEL + 0.8) continue;
        spots.push({
          x,
          z,
          y: y + 0.3,
          s: 0.6 + hash2(gx + 1, gz, seed + 2331) * 1.1,
          rot: hash2(gx, gz + 1, seed + 2341) * Math.PI * 2,
          tint: BLOOM_TINTS[Math.floor(hash2(gx - 1, gz, seed + 2351) * BLOOM_TINTS.length)],
        });
      }
    }
    instance(geo, mat({ color: 0xffffff, roughness: 0.85 }), spots, true);
  }

  return {
    group,
    update(): void {
      // everything modeled sits still; the fen's motion is the water's
    },
  };
}
