// The Frostveil's aurora: long translucent ribbons hung high over the Reach,
// drawn with soft canvas gradients and additive blending so they bloom gently
// on composer tiers. Render-only; update(time) drives a slow shimmer (drift,
// waving opacity) with no per-frame allocation.
import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import { terrainHeight } from '../sim/world';

export interface FrostSkyView {
  group: THREE.Group;
  update(time: number): void;
}

// Ice shards: glassy blue spires scattered over the benches, with monolith
// rings at the landmarks (the Reach's answer to the Hollow's crystals).
const ICE_FIELDS = [
  { x: 30, z: 2345, r: 26, n: 12 }, // the Aurora Steps
  { x: 52, z: 2238, r: 20, n: 8 }, // Glacier Tarn's shore
  { x: 96, z: 2416, r: 22, n: 9 }, // the Howling Terraces
  { x: -84, z: 2338, r: 18, n: 6 }, // the Shiverfen's edge
  { x: -10, z: 2260, r: 40, n: 8 }, // the inner valley, scattered wide
] as const;
const ICE_TINTS = [0xbfe8ff, 0x9fd4f2, 0xd8f2ff];

const RIBBONS = [
  { x: -60, z: 2260, y: 130, len: 420, h: 46, rot: 0.5, tint: 0x62f2b2, phase: 0 },
  { x: 40, z: 2340, y: 150, len: 470, h: 56, rot: -0.35, tint: 0x52e8d8, phase: 2.1 },
  { x: -10, z: 2180, y: 118, len: 360, h: 36, rot: 0.15, tint: 0x96f2da, phase: 4.2 },
  { x: 90, z: 2430, y: 142, len: 340, h: 42, rot: -0.7, tint: 0x72e8a2, phase: 1.3 },
  { x: -90, z: 2400, y: 158, len: 380, h: 40, rot: 0.9, tint: 0x58e8c0, phase: 3.2 },
  { x: 30, z: 2500, y: 136, len: 320, h: 34, rot: -0.15, tint: 0x7af2c8, phase: 5.1 },
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

export function buildFrostSky(seed = 0): FrostSkyView {
  const group = new THREE.Group();
  group.name = 'frost-sky';

  // --- ice shards on the benches ---
  {
    const shardGeo = new THREE.OctahedronGeometry(1, 0);
    shardGeo.scale(0.34, 1.9, 0.34);
    const geo = shardGeo.toNonIndexed();
    const spots: { x: number; z: number; y: number; s: number; rot: number; tint: number }[] = [];
    ICE_FIELDS.forEach((f, fi) => {
      for (let k = 0; k < f.n; k++) {
        const ang = hash2(k + fi * 17, 5, 4021) * Math.PI * 2;
        const dist = Math.sqrt(hash2(k, fi + 9, 4031)) * f.r;
        const x = f.x + Math.sin(ang) * dist;
        const z = f.z + Math.cos(ang) * dist;
        const y = terrainHeight(x, z, seed);
        if (y < -3) continue;
        spots.push({
          x,
          z,
          y: y + 0.4,
          s: 0.8 + hash2(k, fi, 4041) * 2.6,
          rot: hash2(fi, k, 4051) * Math.PI * 2,
          tint: ICE_TINTS[Math.floor(hash2(k + fi, 3, 4061) * ICE_TINTS.length)],
        });
      }
    });
    if (spots.length > 0) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xcfeaf8,
        emissive: 0x2a5a78,
        emissiveIntensity: 0.35,
        roughness: 0.15,
        metalness: 0.1,
        flatShading: true,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const qT = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const axis = new THREE.Vector3();
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3();
      spots.forEach((sp, i) => {
        q.setFromAxisAngle(up, sp.rot);
        axis.set(Math.sin(sp.rot * 2.3), 0, Math.cos(sp.rot * 2.3)).normalize();
        qT.setFromAxisAngle(axis, (hash2(i, 7, 4071) - 0.5) * 0.5);
        q.premultiply(qT);
        v.set(sp.x, sp.y + sp.s * 0.7, sp.z);
        sc.set(sp.s, sp.s, sp.s);
        mesh.setMatrixAt(i, m.compose(v, q, sc));
        mesh.setColorAt(i, new THREE.Color(sp.tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  const tex = auroraTexture();
  const ribbons: { mat: THREE.MeshBasicMaterial; base: number; phase: number }[] = [];

  if (tex) {
    for (const r of RIBBONS) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: r.tint,
        transparent: true,
        opacity: 0.8,
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
      ribbons.push({ mat, base: 0.8, phase: r.phase });
    }
  }

  return {
    group,
    update(time: number): void {
      for (const r of ribbons) {
        // slow curtain shimmer: opacity waves and the ray columns drift
        r.mat.opacity = r.base * (0.75 + 0.25 * Math.sin(time * 0.21 + r.phase));
        if (r.mat.map) r.mat.map.offset.x = (time * 0.008 + r.phase) % 1;
      }
    },
  };
}
