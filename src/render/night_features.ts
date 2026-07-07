// The Nightbloom's dressing, render-only: dreambeams falling through the
// lavender sky, fields of emissive lumen blossoms that carry the realm's
// name, and glow lights at the two stone rings and the Moonwell. Same contract as the sibling realm modules: build once,
// update(time) animates gently, glowLights join the renderer's rank-culled
// fireLights budget.
import * as THREE from 'three';
import { NIGHTBLOOM_ZONE } from '../sim/content/nightbloom';
import { hash2 } from '../sim/rng';
import { terrainHeight, WATER_LEVEL } from '../sim/world';
import { GFX } from './gfx';

export interface NightFeaturesView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
  update(time: number): void;
}

const NIGHT_ZMIN = 3120;
const NIGHT_ZMAX = 3680;

// Dreambeam fans: the aurora/sunbeam texture anatomy in pale violet. Each
// plane's bright top edge is the cloud line the dream-light breaks through;
// the columns fall as soft shafts over the meadows and the Moonwell.
const BEAMS = [
  { x: 60, z: 3242, rot: 0.3, w: 60, h: 105, phase: 0 }, // over the Moonwell
  { x: -70, z: 3348, rot: -0.4, w: 70, h: 110, phase: 1.9 }, // Gloamfield
  { x: 10, z: 3430, rot: 0.5, w: 55, h: 100, phase: 3.4 },
  { x: 90, z: 3400, rot: -0.2, w: 50, h: 95, phase: 4.7 }, // the Vigil
  { x: -20, z: 3520, rot: 0.15, w: 65, h: 115, phase: 2.6 }, // the Barrow
] as const;

// Lumen blossom clusters: patches of tall glowing flowers, thickest around
// the pools and the flower downs (deterministic hash placement like the
// foliage grid, but emissive so they bloom on composer tiers).
const BLOSSOM_FIELDS = [
  { x: -84, z: 3356, r: 34 }, // Gloamfield
  { x: 62, z: 3248, r: 26 }, // the Moonwell's shore
  { x: -20, z: 3200, r: 24 }, // the Nightgate meadows
  { x: 30, z: 3380, r: 28 }, // the midrealm saddle
  { x: 6, z: 3526, r: 22 }, // the barrow downs
] as const;

const BLOSSOM_TINTS = [0x9fdcff, 0xe8f4ff, 0xc8a8ff, 0xa0ffd8];

function beamTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 36; i++) {
    const sx = (i * 97 + ((i * i * 29) % 52)) % 512;
    const w = 3 + ((i * 11) % 12);
    const a = 0.08 + ((i * 31) % 12) / 36;
    const reach = 0.5 + ((i * 43) % 50) / 100;
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

export function buildNightFeatures(seed: number): NightFeaturesView {
  const group = new THREE.Group();
  group.name = 'night-features';
  const glowLights: THREE.PointLight[] = [];
  const beams: { mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  const pulsing: { mat: THREE.MeshStandardMaterial | null; phase: number }[] = [];

  // --- dreambeams: additive violet shafts, one light ---
  const tex = beamTexture();
  if (tex) {
    for (const b of BEAMS) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xe4d2ff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), mat);
      const groundY = terrainHeight(b.x, b.z, seed);
      mesh.position.set(b.x, Math.max(groundY, -2) + b.h * 0.52, b.z);
      mesh.rotation.y = b.rot;
      mesh.rotation.z = 0.1; // one moon: every shaft leans the same way
      mesh.renderOrder = 2;
      beams.push({ mat, phase: b.phase });
      group.add(mesh);
    }
  }

  // --- lumen blossoms: stem + emissive head, instanced per tint ---
  {
    const stemGeo = new THREE.CylinderGeometry(0.035, 0.055, 1.0, 4);
    stemGeo.translate(0, 0.5, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.16, 0);
    headGeo.translate(0, 1.05, 0);
    const stemMat = GFX.standardMaterials
      ? new THREE.MeshStandardMaterial({ color: 0x3c5048, roughness: 0.9, flatShading: true })
      : new THREE.MeshLambertMaterial({ color: 0x3c5048, flatShading: true });
    const spots: { x: number; z: number; y: number; s: number; tint: number }[] = [];
    for (const f of BLOSSOM_FIELDS) {
      const count = 26 + Math.floor(hash2(f.x, f.z, seed + 3101) * 14);
      for (let k = 0; k < count; k++) {
        const ang = hash2(k, f.x + f.z, seed + 3111) * Math.PI * 2;
        const dist = Math.sqrt(hash2(f.z, k * 3, seed + 3121)) * f.r;
        const x = f.x + Math.sin(ang) * dist;
        const z = f.z + Math.cos(ang) * dist;
        if (z < NIGHT_ZMIN + 8 || z > NIGHT_ZMAX - 8) continue;
        const y = terrainHeight(x, z, seed);
        if (y < WATER_LEVEL + 0.6) continue;
        spots.push({
          x,
          z,
          y,
          s: 0.7 + hash2(k, f.z, seed + 3131) * 0.9,
          tint: BLOSSOM_TINTS[Math.floor(hash2(x, z, seed + 3141) * BLOSSOM_TINTS.length)],
        });
      }
    }
    const place = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      tinted: boolean,
    ): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3();
      spots.forEach((sp, i) => {
        q.setFromAxisAngle(up, hash2(sp.x, sp.z, seed + 3151) * Math.PI * 2);
        v.set(sp.x, sp.y, sp.z);
        sc.set(sp.s, sp.s, sp.s);
        mesh.setMatrixAt(i, m.compose(v, q, sc));
        if (tinted) mesh.setColorAt(i, new THREE.Color(sp.tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      return mesh;
    };
    place(stemGeo.toNonIndexed(), stemMat, false);
    const headMat = GFX.standardMaterials
      ? new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 0.9,
          roughness: 0.6,
          flatShading: true,
        })
      : new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    place(headGeo.toNonIndexed(), headMat, true); // instanceColor tints emission
    pulsing.push({
      mat: GFX.standardMaterials ? (headMat as THREE.MeshStandardMaterial) : null,
      phase: 0,
    });
  }

  // --- glow at the stone rings and the tarn: soft dream-fire ---
  const GLOWS = [
    { x: 88, z: 3398, c: 0xc8b4ff, i: 1.6 }, // the Standing Vigil
    { x: 0, z: 3510, c: 0xb0a0e8, i: 1.4 }, // the Sleepless Barrow
    { x: 70, z: 3240, c: 0xffc8ec, i: 1.2 }, // the Moonwell's water glow
  ];
  for (const g of GLOWS) {
    const y = Math.max(terrainHeight(g.x, g.z, seed), WATER_LEVEL) + 3;
    const light = new THREE.PointLight(g.c, g.i, 34, 2);
    light.position.set(g.x, y, g.z);
    group.add(light);
    glowLights.push(light);
  }

  return {
    group,
    glowLights,
    update(time: number): void {
      // dreambeams breathe slowly out of phase, columns drifting like the
      // aurora's; the blossom field pulses almost imperceptibly
      for (const b of beams) {
        b.mat.opacity = 0.18 * (0.55 + 0.45 * Math.sin(time * 0.11 + b.phase));
        if (b.mat.map) b.mat.map.offset.x = (time * 0.003 + b.phase) % 1;
      }
      for (const p of pulsing) {
        if (p.mat) p.mat.emissiveIntensity = 0.8 + 0.25 * Math.sin(time * 0.6 + p.phase);
      }
    },
  };
}
