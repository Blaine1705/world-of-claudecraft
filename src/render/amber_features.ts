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

// Sunbeam fans breaking from the cloud line over the weald (x, z, lean,
// size): stretched wide so the ray columns read as a spread of beams.
const RAYS = [
  { x: -40, z: 2700, rot: 0.4, w: 70, h: 110, phase: 0 },
  { x: 50, z: 2760, rot: -0.3, w: 55, h: 100, phase: 1.7 },
  { x: 0, z: 2860, rot: 0.15, w: 85, h: 120, phase: 3.1 }, // over the Great Mere
  { x: -80, z: 2930, rot: 0.6, w: 50, h: 95, phase: 4.4 },
  { x: 90, z: 2900, rot: -0.5, w: 60, h: 105, phase: 2.3 },
  { x: -20, z: 2620, rot: 0.2, w: 50, h: 90, phase: 5.2 },
  // ...and two wide fans low over the sunset bank itself
  { x: -180, z: 2840, rot: 1.55, w: 120, h: 130, phase: 2.9 },
  { x: 180, z: 2840, rot: -1.55, w: 120, h: 130, phase: 0.9 },
] as const;

// The aurora curtain's anatomy turned upside down and gilded: a bright top
// edge (the cloud gap) fanning DOWNWARD into parallel ray columns of uneven
// length, so each plane reads as a spread of sunbeams breaking through.
function rayTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // body: brightest at the cloud line, long fade toward the ground
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.4)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  // the beams: tall streaks dropping from the bright line, uneven reach
  for (let i = 0; i < 40; i++) {
    const sx = (i * 89 + ((i * i * 31) % 48)) % 512;
    const w = 3 + ((i * 13) % 14);
    const a = 0.1 + ((i * 29) % 12) / 30;
    const reach = 0.5 + ((i * 41) % 50) / 100; // rays reach different depths
    const ray = ctx.createLinearGradient(0, 0, 0, 128);
    ray.addColorStop(0, `rgba(255,255,255,${a})`);
    ray.addColorStop(Math.min(1, reach), 'rgba(255,255,255,0)');
    ctx.fillStyle = ray;
    ctx.fillRect(sx, 0, w, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
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
      // hung from the cloud line: the bright top edge sits up at the bank
      mesh.position.set(r.x, Math.max(groundY, -2) + r.h * 0.52, r.z);
      mesh.rotation.y = r.rot;
      mesh.rotation.z = 0.14; // lean every fan the same way: one sun
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
    // three tiers, reference-style: bright gold-cream masses low over the
    // glow, deeper amber-brown shapes above them (the dark sunset masses),
    // and a high scattered tier catching the last light
    const TIERS = [
      { radius: 380, count: 14, color: 0xffe8c0, y: 22, yj: 22, wMin: 200, wMax: 340, op: 0.95 },
      { radius: 450, count: 11, color: 0xc9925c, y: 52, yj: 30, wMin: 240, wMax: 380, op: 0.85 },
      { radius: 520, count: 8, color: 0xffd8a0, y: 95, yj: 40, wMin: 200, wMax: 320, op: 0.7 },
    ];
    TIERS.forEach((tier, ring) => {
      for (let k = 0; k < tier.count; k++) {
        const ang = ((k + ring * 0.37) / tier.count) * Math.PI * 2;
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          color: tier.color,
          transparent: true,
          opacity: tier.op,
          depthWrite: false,
          fog: false,
        });
        const w = tier.wMin + hash2(k, ring, 5011) * (tier.wMax - tier.wMin);
        const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.4), mat);
        cloud.position.set(
          CENTER.x + Math.sin(ang) * tier.radius,
          tier.y + hash2(ring, k, 5021) * tier.yj,
          CENTER.z + Math.cos(ang) * tier.radius,
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
    });
  }

  return {
    group,
    update(time: number): void {
      // the beam fans breathe slowly, out of phase, like cloud gaps
      // drifting, and their columns slide the way the aurora's do
      for (const r of rays) {
        r.mat.opacity = 0.24 * (0.55 + 0.45 * Math.sin(time * 0.13 + r.phase));
        if (r.mat.map) r.mat.map.offset.x = (time * 0.004 + r.phase) % 1;
      }
      // the bank drifts almost imperceptibly
      for (const c of bankClouds) {
        c.mesh.position.x = c.baseX + Math.sin(time * 0.014 * c.speed) * 14;
      }
    },
  };
}
