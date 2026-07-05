// The Amberfall's dressing, render-only: golden god-rays beaming down
// through the cloud gaps, and the dry-stone walls flanking Lanternmere's
// gate. Same contract as the sibling realm modules.
import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import { terrainHeight } from '../sim/world';
import { cloudTexture } from './textures';

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

  // --- the horizon cloud bank: two staggered rings of big gold-lit cumulus
  // standing between the camera and the day sky's photographed hills, so the
  // Amberfall's horizon is cloud on cloud, never a mountain photo ---
  const bankClouds: { mesh: THREE.Mesh; baseX: number; speed: number }[] = [];
  {
    const tex = cloudTexture(16, 0.62);
    const CENTER = { x: 0, z: 2840 };
    for (let ring = 0; ring < 2; ring++) {
      const radius = 400 + ring * 90;
      const count = 12;
      for (let k = 0; k < count; k++) {
        const ang = ((k + ring * 0.5) / count) * Math.PI * 2;
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          color: ring === 0 ? 0xffe4b8 : 0xffd8a0, // golden-lit, warmer behind
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          fog: false,
        });
        const w = 220 + hash2(k, ring, 5011) * 140;
        const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.4), mat);
        cloud.position.set(
          CENTER.x + Math.sin(ang) * radius,
          26 + hash2(ring, k, 5021) * 34 + ring * 14,
          CENTER.z + Math.cos(ang) * radius,
        );
        cloud.rotation.y = ang + Math.PI; // face the realm
        cloud.renderOrder = 1;
        bankClouds.push({
          mesh: cloud,
          baseX: cloud.position.x,
          speed: 0.6 + hash2(k, ring, 5031),
        });
        group.add(cloud);
      }
    }
  }

  return {
    group,
    update(time: number): void {
      // the shafts breathe slowly, out of phase, like cloud gaps drifting
      for (const r of rays) {
        r.mat.opacity = 0.22 * (0.55 + 0.45 * Math.sin(time * 0.13 + r.phase));
      }
      // the bank drifts almost imperceptibly
      for (const c of bankClouds) {
        c.mesh.position.x = c.baseX + Math.sin(time * 0.014 * c.speed) * 14;
      }
    },
  };
}
