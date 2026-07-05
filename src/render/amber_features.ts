// The Amberfall's dressing, render-only: golden god-rays beaming down
// through the cloud gaps, and the dry-stone walls flanking Lanternmere's
// gate. Same contract as the sibling realm modules.
import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import { terrainHeight } from '../sim/world';

export interface AmberFeaturesView {
  group: THREE.Group;
  update(time: number): void;
}

// Shafts of gold sunlight over the weald (x, z, lean, size).
const RAYS = [
  { x: -40, z: 2700, rot: 0.4, w: 26, h: 95, phase: 0 },
  { x: 50, z: 2760, rot: -0.3, w: 20, h: 85, phase: 1.7 },
  { x: 0, z: 2860, rot: 0.15, w: 30, h: 100, phase: 3.1 }, // over the Great Mere
  { x: -80, z: 2930, rot: 0.6, w: 18, h: 80, phase: 4.4 },
  { x: 90, z: 2900, rot: -0.5, w: 22, h: 90, phase: 2.3 },
  { x: -20, z: 2620, rot: 0.2, w: 18, h: 75, phase: 5.2 },
] as const;

// Dry-stone wall runs flanking the town gate on the Goldmelt road (the road
// enters Lanternmere from the south at x 0, z ~2790).
const WALLS: { x1: number; z1: number; x2: number; z2: number }[] = [
  { x1: -14, z1: 2788, x2: -4, z2: 2792 }, // west of the gate
  { x1: 4, z1: 2792, x2: 14, z2: 2788 }, // east of the gate
  { x1: -16, z1: 2780, x2: -14, z2: 2788 }, // ...curling outward
  { x1: 14, z1: 2788, x2: 16, z2: 2780 },
];

function rayTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // a soft vertical shaft: bright at the top, fading to nothing at the foot
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  // horizontal falloff to soft edges
  const side = ctx.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.3, 'rgba(0,0,0,0)');
  side.addColorStop(0.7, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 64, 128);
  return new THREE.CanvasTexture(canvas);
}

export function buildAmberFeatures(seed: number): AmberFeaturesView {
  const group = new THREE.Group();
  group.name = 'amber-features';
  const rays: { mat: THREE.MeshBasicMaterial; phase: number }[] = [];

  // --- god-rays: additive gold shafts leaning with the sun ---
  const tex = rayTexture();
  if (tex) {
    for (const r of RAYS) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xffd88a,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), mat);
      const groundY = terrainHeight(r.x, r.z, seed);
      mesh.position.set(r.x, Math.max(groundY, -2) + r.h * 0.42, r.z);
      mesh.rotation.y = r.rot;
      mesh.rotation.z = 0.14; // lean every shaft the same way: one sun
      mesh.renderOrder = 2;
      rays.push({ mat, phase: r.phase });
      group.add(mesh);
    }
  }

  // --- the gate walls: low dry-stone runs built from jittered blocks ---
  {
    const blockGeo = new THREE.BoxGeometry(1.1, 0.55, 0.7);
    const spots: { x: number; z: number; y: number; s: number; rot: number }[] = [];
    WALLS.forEach((wall, wi) => {
      const len = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
      const steps = Math.max(2, Math.round(len / 1.05));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = wall.x1 + (wall.x2 - wall.x1) * t + (hash2(wi, i, seed + 3101) - 0.5) * 0.16;
        const z = wall.z1 + (wall.z2 - wall.z1) * t + (hash2(i, wi, seed + 3111) - 0.5) * 0.16;
        const y = terrainHeight(x, z, seed);
        // two courses: a full lower run, a gappy upper one (dry-stone look)
        spots.push({
          x,
          z,
          y: y + 0.26,
          s: 0.9 + hash2(wi + i, 3, seed + 3121) * 0.25,
          rot:
            Math.atan2(wall.x2 - wall.x1, wall.z2 - wall.z1) +
            (hash2(3, wi + i, seed + 3131) - 0.5) * 0.2,
        });
        if (hash2(wi, i * 7, seed + 3141) < 0.7) {
          spots.push({
            x,
            z,
            y: y + 0.74,
            s: 0.75 + hash2(i, wi * 5, seed + 3151) * 0.25,
            rot:
              Math.atan2(wall.x2 - wall.x1, wall.z2 - wall.z1) +
              (hash2(5, wi - i, seed + 3161) - 0.5) * 0.3,
          });
        }
      }
    });
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8f8a80,
      roughness: 0.95,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(blockGeo, mat, spots.length);
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
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return {
    group,
    update(time: number): void {
      // the shafts breathe slowly, out of phase, like cloud gaps drifting
      for (const r of rays) {
        r.mat.opacity = 0.22 * (0.55 + 0.45 * Math.sin(time * 0.13 + r.phase));
      }
    },
  };
}
