// The Galecrest's dressing, render-only: the Old Beacon lighthouse on its
// head (a body of stacked crenellated KayKit tower drums under the blue
// cap, with a slowly turning light, the realm's landmark from anywhere on
// the downs, plus the grey stone stair the sim's beaconSpiralLift makes
// walkable, hugging the column up to the C balcony), the stilt piers and
// boardwalk of Wickharbor's harbor (drawn from the SAME sim/gale_harbor.ts
// decks the player walks), sea stacks standing off the Shear, and the ribs
// of old hulls half-buried on the Wreckfields. Same contract as the sibling
// realm modules: build once, update(time) turns the beacon.
import * as THREE from 'three';
import { BEACON_SPIRAL, beaconSpiralLift } from '../sim/beacon_spiral';
import { GALE_HARBOR_DECKS, galeDeckSurfaceAt } from '../sim/gale_harbor';
import { hash2 } from '../sim/rng';
import { terrainHeight, WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';

// The lighthouse, bottom to top: four crenellated grey body drums (each
// seated into the battlement ring of the one below, so the shaft reads as
// one banded stone column) under the blue-roofed cap that carries the lamp.
// h is each drum's effective rise including the seat overlap.
const TOWER_STACK = [
  { url: '/models/biome/hexb_tower_base.glb', scale: 6.0, h: 8.1 },
  { url: '/models/biome/hexb_tower_base.glb', scale: 5.55, h: 7.5 },
  { url: '/models/biome/hexb_tower_base.glb', scale: 5.15, h: 7.0 },
  { url: '/models/biome/hexb_tower_base.glb', scale: 4.75, h: 6.4 },
  { url: '/models/biome/hexb_tower_b.glb', scale: 4.4, h: 10.9 },
] as const;
const towerScenes: (THREE.Group | null)[] = TOWER_STACK.map(() => null);
for (let i = 0; i < TOWER_STACK.length; i++) {
  registerPreload(
    loadGltf(TOWER_STACK[i].url).then((gltf) => {
      towerScenes[i] = gltf.scene;
    }),
  );
}

export const galeFeaturesPreloadInternalsForTest = {
  towerAssetUrl: TOWER_STACK.map((t) => t.url),
};

export interface GaleFeaturesView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
  update(time: number): void;
}

const BEACON = { x: 498, z: 308 };
// stacks stand in the water off the Shear's cliffs
const SEA_STACKS = [
  { x: 496, z: 512, r: 4.2, h: 22 },
  { x: 510, z: 546, r: 3.4, h: 17 },
  { x: 488, z: 576, r: 5.0, h: 26 },
  { x: 522, z: 492, r: 2.8, h: 13 },
  { x: 504, z: 608, r: 3.8, h: 19 },
  { x: 474, z: 616, r: 3.0, h: 15 },
] as const;
// hull ribs on the Wreckfields beach: position, heading, rib count, size
const WRECKS = [
  { x: 322, z: 656, rot: 0.7, ribs: 7, r: 5.2 },
  { x: 356, z: 666, rot: -0.9, ribs: 5, r: 3.8 },
  { x: 300, z: 634, rot: 2.2, ribs: 6, r: 4.4 },
] as const;

function mat(color: number, rough = 0.85): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true })
    : new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// merge a pile of box geometries into one mesh (position + normal only)
function mergeBoxes(parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  let total = 0;
  for (const g of parts) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  const norm = new Float32Array(total * 3);
  let off = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, off);
    norm.set(g.getAttribute('normal').array as Float32Array, off);
    off += g.getAttribute('position').count * 3;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// a box beam from p0 to p1 (long axis along the run, yaw/pitch aligned)
function beamBetween(
  parts: THREE.BufferGeometry[],
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  w: number,
  h: number,
): void {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const lenH = Math.hypot(dx, dz);
  const len = Math.hypot(lenH, dy);
  if (len < 1e-4) return;
  const g = new THREE.BoxGeometry(w, h, len + w * 0.6);
  g.rotateX(Math.atan2(dy, lenH));
  g.rotateY(Math.atan2(dx, dz));
  g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  parts.push(g.toNonIndexed());
}

export function buildGaleFeatures(seed: number): GaleFeaturesView {
  const group = new THREE.Group();
  group.name = 'gale-features';
  const glowLights: THREE.PointLight[] = [];

  // --- the Old Beacon: a banded stone shaft under the blue cap ---
  const beaconY = terrainHeight(BEACON.x, BEACON.z, seed);
  const beam = new THREE.Group();
  {
    let lift = 0;
    for (let i = 0; i < TOWER_STACK.length; i++) {
      const scene = towerScenes[i];
      if (!scene) continue;
      const drum = scene.clone(true);
      drum.position.set(BEACON.x, beaconY + lift - (i === 0 ? 0.15 : 0.05), BEACON.z);
      drum.scale.setScalar(TOWER_STACK[i].scale);
      drum.rotation.y = i * 0.9; // stagger the drum details around the column
      drum.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      group.add(drum);
      lift += TOWER_STACK[i].h;
    }
    const lampY = beaconY + lift - 3.5;
    // the stone stair, two flights and two C balconies: drawn from the SAME
    // beaconSpiralLift samples the sim walks on, so deck and footing never
    // disagree
    {
      const s = BEACON_SPIRAL;
      const stone = mat(0x8f959c, 0.95);
      const iron = mat(0x4b4f56, 0.8);
      const slabs: THREE.BufferGeometry[] = [];
      const rails: THREE.BufferGeometry[] = [];
      const deckAt = (x: number, z: number): number =>
        terrainHeight(x, z, seed) + beaconSpiralLift(x, z);
      const slab = (x: number, z: number, w: number, len: number, yaw: number): void => {
        const h = deckAt(x, z);
        const g = new THREE.BoxGeometry(w, 0.4, len);
        g.rotateY(yaw);
        g.translate(x, h - 0.18, z);
        slabs.push(g.toNonIndexed());
      };
      // whether an unwrapped angle sits on a balcony (wide band) or a flight
      const onBalcony = (a: number): boolean =>
        (a > s.flight1End && a <= s.balcony1End) || (a > s.flight2End && a <= s.balcony2End);
      // slabs along the whole climb: treads on the flights, wider boards on
      // the balconies, every one butted against the column face
      const total = s.balcony2End - 0.03;
      const slabsN = 130;
      for (let i = 0; i <= slabsN; i++) {
        const rel = (i / slabsN) * total;
        const balc = onBalcony(rel);
        const outR = balc ? s.balconyOut : s.stairOut;
        const midR = (s.coreR + outR) / 2;
        const a = s.a0 + rel;
        slab(
          s.x + Math.sin(a) * midR,
          s.z + Math.cos(a) * midR,
          balc ? 0.95 : 0.62,
          outR - s.coreR,
          a,
        );
      }
      // the handrail: posts along the outer edge, and a continuous helical
      // double rail sampled finely so it runs DIAGONALLY up the flights and
      // levels off around each balcony
      const railPts: THREE.Vector3[] = [];
      const railN = 96;
      for (let i = 0; i <= railN; i++) {
        const rel = (i / railN) * (s.balcony2End - 0.04);
        const outR = (onBalcony(rel) ? s.balconyOut : s.stairOut) - 0.2;
        const a = s.a0 + rel;
        const x = s.x + Math.sin(a) * outR;
        const z = s.z + Math.cos(a) * outR;
        railPts.push(new THREE.Vector3(x, deckAt(x, z), z));
      }
      for (let i = 0; i + 1 < railPts.length; i++) {
        for (const lift2 of [1.04, 0.56]) {
          beamBetween(
            rails,
            new THREE.Vector3(railPts[i].x, railPts[i].y + lift2, railPts[i].z),
            new THREE.Vector3(railPts[i + 1].x, railPts[i + 1].y + lift2, railPts[i + 1].z),
            0.08,
            0.1,
          );
        }
      }
      for (let i = 0; i <= 32; i++) {
        const p = railPts[Math.round((i / 32) * railN)];
        const g = new THREE.BoxGeometry(0.16, 1.12, 0.16);
        g.translate(p.x, p.y + 0.52, p.z);
        rails.push(g.toNonIndexed());
      }
      // the top balcony's far end: a short radial rail back to the tower
      const endA = s.a0 + s.balcony2End - 0.04;
      const endPts: THREE.Vector3[] = [];
      for (const r of [s.balconyOut - 0.2, (s.balconyOut + s.coreR) / 2, s.coreR + 0.25]) {
        const x = s.x + Math.sin(endA) * r;
        const z = s.z + Math.cos(endA) * r;
        const h = deckAt(x, z);
        const g = new THREE.BoxGeometry(0.16, 1.12, 0.16);
        g.translate(x, h + 0.52, z);
        rails.push(g.toNonIndexed());
        endPts.push(new THREE.Vector3(x, h, z));
      }
      for (let i = 0; i + 1 < endPts.length; i++) {
        for (const lift2 of [1.04, 0.56]) {
          beamBetween(
            rails,
            new THREE.Vector3(endPts[i].x, endPts[i].y + lift2, endPts[i].z),
            new THREE.Vector3(endPts[i + 1].x, endPts[i + 1].y + lift2, endPts[i + 1].z),
            0.08,
            0.1,
          );
        }
      }
      group.add(mergeBoxes(slabs, stone));
      group.add(mergeBoxes(rails, iron));
    }
    // the turning light: two opposed additive cones riding a pivot
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    for (const flip of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 60, 12, 1, true), beamMat);
      cone.rotation.z = (flip * Math.PI) / 2;
      cone.position.x = flip * 30;
      beam.add(cone);
    }
    beam.position.set(BEACON.x, lampY, BEACON.z);
    group.add(beam);
    const light = new THREE.PointLight(0xffd890, 5, 40, 2);
    light.position.set(BEACON.x, lampY, BEACON.z);
    light.userData.baseIntensity = 5;
    glowLights.push(light);
    group.add(light);
  }

  // --- Wickharbor's harbor: plank decks on stilts over the bay ---
  // Drawn from the same GALE_HARBOR_DECKS rectangles groundHeight walks, so
  // the plank plane underfoot is exactly the plank plane on screen.
  {
    const wood = mat(0x8a6a4a, 0.9);
    const postWood = mat(0x6b523d, 0.92);
    const planks: THREE.BufferGeometry[] = [];
    const posts: THREE.BufferGeometry[] = [];
    const terrain = (x: number, z: number): number => terrainHeight(x, z, seed);
    for (const d of GALE_HARBOR_DECKS) {
      const dirx = Math.sin(d.rot);
      const dirz = Math.cos(d.rot);
      const pxu = dirz; // unit across (perp) axis
      const pzu = -dirx;
      const yAt = (along: number): number => galeDeckSurfaceAt(d, along, terrain, WATER_LEVEL);
      const ramp = Math.atan2(yAt(d.hl) - yAt(-d.hl), d.hl * 2);
      // plank courses laid across the walking direction
      const step = 1.05;
      for (let along = -d.hl + step / 2; along < d.hl; along += step) {
        const cx = d.x + dirx * along;
        const cz = d.z + dirz * along;
        const g = new THREE.BoxGeometry(d.hw * 2, 0.16, 0.88);
        g.rotateX(ramp);
        g.rotateY(d.rot);
        g.translate(cx, yAt(along) - 0.08, cz);
        planks.push(g.toNonIndexed());
      }
      // side beams along both edges, and stilt posts marching to the seabed
      for (const side of [1, -1]) {
        const ex = pxu * (d.hw - 0.14) * side;
        const ez = pzu * (d.hw - 0.14) * side;
        beamBetween(
          planks,
          new THREE.Vector3(d.x - dirx * d.hl + ex, yAt(-d.hl) + 0.06, d.z - dirz * d.hl + ez),
          new THREE.Vector3(d.x + dirx * d.hl + ex, yAt(d.hl) + 0.06, d.z + dirz * d.hl + ez),
          0.24,
          0.2,
        );
        for (let along = -d.hl + 1.0; along < d.hl; along += 2.2) {
          const px = d.x + dirx * along + pxu * (d.hw - 0.3) * side;
          const pz = d.z + dirz * along + pzu * (d.hw - 0.3) * side;
          const top = yAt(along) - 0.05;
          const bed = Math.min(terrain(px, pz), top - 0.4);
          const g = new THREE.BoxGeometry(0.3, top - bed + 0.4, 0.3);
          g.translate(px, (top + bed - 0.4) / 2 + 0.2, pz);
          posts.push(g.toNonIndexed());
        }
      }
      // mooring bollards on the two tip corners of each pier
      for (const side of [1, -1]) {
        const bx = d.x + dirx * (d.hl - 0.5) + pxu * (d.hw - 0.35) * side;
        const bz = d.z + dirz * (d.hl - 0.5) + pzu * (d.hw - 0.35) * side;
        const g = new THREE.BoxGeometry(0.26, 0.72, 0.26);
        g.translate(bx, yAt(d.hl - 0.5) + 0.3, bz);
        posts.push(g.toNonIndexed());
      }
    }
    group.add(mergeBoxes(planks, wood));
    group.add(mergeBoxes(posts, postWood));
  }

  // --- the sea stacks off the Shear ---
  {
    const stackGeo = new THREE.CylinderGeometry(0.55, 1, 1, 7);
    const stackMat = mat(0x74787c, 0.95);
    const mesh = new THREE.InstancedMesh(stackGeo.toNonIndexed(), stackMat, SEA_STACKS.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    SEA_STACKS.forEach((s, i) => {
      const bed = Math.min(terrainHeight(s.x, s.z, seed), WATER_LEVEL - 1);
      q.setFromAxisAngle(up, hash2(s.x, s.z, seed + 7301) * Math.PI * 2);
      v.set(s.x, bed + s.h / 2, s.z);
      sc.set(s.r, s.h, s.r);
      mesh.setMatrixAt(i, m.compose(v, q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // --- the Wreckfields: hull ribs arcing out of the shingle ---
  {
    const ribGeo = new THREE.TorusGeometry(1, 0.08, 5, 10, Math.PI);
    const ribMat = mat(0x5a5048, 0.9);
    let count = 0;
    for (const w of WRECKS) count += w.ribs;
    const mesh = new THREE.InstancedMesh(ribGeo.toNonIndexed(), ribMat, count);
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let i = 0;
    for (const w of WRECKS) {
      const dx = Math.sin(w.rot);
      const dz = Math.cos(w.rot);
      for (let k = 0; k < w.ribs; k++) {
        const t = (k - (w.ribs - 1) / 2) * 1.7;
        const x = w.x + dx * t;
        const z = w.z + dz * t;
        const y = terrainHeight(x, z, seed);
        // ribs shrink toward bow and stern, like a keel picked clean
        const shape = 1 - Math.abs(k - (w.ribs - 1) / 2) / w.ribs;
        const r = w.r * (0.6 + shape * 0.5);
        q.setFromEuler(e.set(0, w.rot + Math.PI / 2, (hash2(x, z, seed + 7401) - 0.5) * 0.24));
        v.set(x, y - 0.4, z);
        sc.set(r, r, r);
        mesh.setMatrixAt(i, m.compose(v, q, sc));
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return {
    group,
    glowLights,
    update(time: number): void {
      // the beacon turns, slow and steady, the way it always has
      beam.rotation.y = time * 0.45;
    },
  };
}
