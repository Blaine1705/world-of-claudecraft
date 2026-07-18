// The Galecrest's dressing, render-only: the Old Beacon lighthouse on its
// head (stacked KayKit tower drums with a slowly turning light, the realm's
// landmark from anywhere on the downs, plus the plank stair the sim's
// beaconSpiralLift makes walkable), sea stacks standing off the Shear, and
// the ribs of old hulls half-buried on the Wreckfields. Same contract as
// the sibling realm modules: build once, update(time) turns the beacon.
import * as THREE from 'three';
import { BEACON_SPIRAL, beaconSpiralLift } from '../sim/beacon_spiral';
import { hash2 } from '../sim/rng';
import { galeLandness, terrainHeight, WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';

// The lighthouse drums, bottom to top: blue base, blue drum, red drum (the
// stripe), blue-roofed cap. Stacked at build; scales tuned so each drum
// seats on the one below.
const TOWER_STACK = [
  { url: '/models/biome/hexb_tower_base.glb', scale: 5.5, h: 8.25 },
  { url: '/models/biome/hexb_tower_a.glb', scale: 5, h: 10.95 },
  { url: '/models/biome/hexr_tower_a.glb', scale: 4.5, h: 9.86 },
  { url: '/models/biome/hexb_tower_b.glb', scale: 4, h: 9.96 },
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

export function buildGaleFeatures(seed: number): GaleFeaturesView {
  const group = new THREE.Group();
  group.name = 'gale-features';
  const glowLights: THREE.PointLight[] = [];

  // --- the Old Beacon: stacked tower drums, striped like a lighthouse ---
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
    const lampY = beaconY + lift - 3.2;
    // the plank stair and gallery ring: drawn from the SAME beaconSpiralLift
    // samples the sim walks on, so deck and footing never disagree
    {
      const s = BEACON_SPIRAL;
      const wood = mat(0x8a6a4a, 0.9);
      const parts: THREE.BufferGeometry[] = [];
      const plank = (x: number, z: number, w: number, len: number, yaw: number): void => {
        const h = terrainHeight(x, z, seed) + beaconSpiralLift(x, z);
        const g2 = new THREE.BoxGeometry(w, 0.32, len);
        g2.rotateY(yaw);
        g2.translate(x, h - 0.14, z);
        parts.push(g2.toNonIndexed());
      };
      // the winding stair: planks laid along the sweep
      const steps = 64;
      const rMid = (s.stairIn + s.stairOut) / 2;
      for (let i = 0; i <= steps; i++) {
        const a = s.a0 + (i / steps) * s.sweep;
        plank(s.x + Math.sin(a) * rMid, s.z + Math.cos(a) * rMid, s.stairOut - s.stairIn, 0.72, a);
      }
      // the gallery ring around the drum
      const ringMid = (s.coreR + s.ringR) / 2;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        plank(s.x + Math.sin(a) * ringMid, s.z + Math.cos(a) * ringMid, s.ringR - s.coreR, 0.8, a);
      }
      // the bridge from stair top to ring
      for (const rb of [s.ringR + 0.2, (s.ringR + s.stairIn) / 2, s.stairIn - 0.1]) {
        const a = s.a0 + s.sweep;
        plank(s.x + Math.sin(a) * rb, s.z + Math.cos(a) * rb, 1.9, 0.85, a);
      }
      // outer railing posts along the stair and ring edges
      const post = (x: number, z: number): void => {
        const deckH = terrainHeight(x, z, seed) + beaconSpiralLift(x, z);
        const g2 = new THREE.BoxGeometry(0.22, 1.15, 0.22);
        g2.translate(x, deckH + 0.45, z);
        parts.push(g2.toNonIndexed());
      };
      for (let i = 0; i <= 16; i++) {
        const a = s.a0 + (i / 16) * s.sweep;
        post(s.x + Math.sin(a) * (s.stairOut - 0.25), s.z + Math.cos(a) * (s.stairOut - 0.25));
      }
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        post(s.x + Math.sin(a) * (s.ringR - 0.2), s.z + Math.cos(a) * (s.ringR - 0.2));
      }
      let total = 0;
      for (const g2 of parts) total += g2.getAttribute('position').count;
      const pos = new Float32Array(total * 3);
      const norm = new Float32Array(total * 3);
      let off = 0;
      for (const g2 of parts) {
        pos.set(g2.getAttribute('position').array as Float32Array, off);
        norm.set(g2.getAttribute('normal').array as Float32Array, off);
        off += g2.getAttribute('position').count * 3;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
      const deck = new THREE.Mesh(merged, wood);
      deck.castShadow = true;
      deck.receiveShadow = true;
      group.add(deck);
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
