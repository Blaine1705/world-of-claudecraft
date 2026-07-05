// The Frostveil's aurora: long translucent ribbons hung high over the Reach,
// drawn with soft canvas gradients and additive blending so they bloom gently
// on composer tiers. Render-only; update(time) drives a slow shimmer (drift,
// waving opacity) with no per-frame allocation.
import * as THREE from 'three';

export interface FrostSkyView {
  group: THREE.Group;
  update(time: number): void;
}

const RIBBONS = [
  { x: -60, z: 2260, y: 130, len: 380, h: 34, rot: 0.5, tint: 0x58e8a8, phase: 0 },
  { x: 40, z: 2340, y: 150, len: 430, h: 42, rot: -0.35, tint: 0x48d8c8, phase: 2.1 },
  { x: -10, z: 2180, y: 118, len: 320, h: 26, rot: 0.15, tint: 0x88e8d0, phase: 4.2 },
  { x: 90, z: 2430, y: 142, len: 300, h: 30, rot: -0.7, tint: 0x68d898, phase: 1.3 },
] as const;

// A vertical soft band: transparent at both edges, bright core, with a few
// brighter columns so the curtain reads as rays instead of a flat sheet.
function auroraTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 64);
  // ray columns: brighter vertical streaks at pseudo-random x
  for (let i = 0; i < 22; i++) {
    const sx = ((i * 47) % 256) + (i % 3);
    const w = 3 + ((i * 13) % 9);
    const a = 0.1 + ((i * 29) % 10) / 40;
    const ray = ctx.createLinearGradient(0, 0, 0, 64);
    ray.addColorStop(0, 'rgba(255,255,255,0)');
    ray.addColorStop(0.4, `rgba(255,255,255,${a})`);
    ray.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = ray;
    ctx.fillRect(sx, 0, w, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function buildFrostSky(): FrostSkyView {
  const group = new THREE.Group();
  group.name = 'frost-sky';
  const tex = auroraTexture();
  const ribbons: { mat: THREE.MeshBasicMaterial; base: number; phase: number }[] = [];

  if (tex) {
    for (const r of RIBBONS) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: r.tint,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      });
      // gentle S-curve: a few segments with a sine offset baked into the verts
      const geo = new THREE.PlaneGeometry(r.len, r.h, 24, 1);
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        pos.setZ(i, Math.sin((px / r.len) * Math.PI * 2 + r.phase) * 16);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(r.x, r.y, r.z);
      mesh.rotation.y = r.rot;
      mesh.rotation.x = 0.18; // lean the curtain slightly overhead
      mesh.renderOrder = 2;
      group.add(mesh);
      ribbons.push({ mat, base: 0.5, phase: r.phase });
    }
  }

  return {
    group,
    update(time: number): void {
      for (const r of ribbons) {
        // slow curtain shimmer: opacity waves and the ray columns drift
        r.mat.opacity = r.base * (0.65 + 0.35 * Math.sin(time * 0.21 + r.phase));
        if (r.mat.map) r.mat.map.offset.x = (time * 0.008 + r.phase) % 1;
      }
    },
  };
}
