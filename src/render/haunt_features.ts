// The Wraithwood's dressing, render-only: the giant overgrown trees the
// realm is named for (drawn from the same WRAITHWOOD_PROPS.greatTrees
// records that give the sim its solid trunk colliders), curtains of hanging
// moss under their canopies, a low ground mist that never lifts, and
// ghost-lights drifting between the trunks. Same contract as the sibling
// realm modules: build once, update(time) animates gently, glowLights join
// the renderer's rank-culled fireLights budget.
import * as THREE from 'three';
import { WRAITHWOOD_PROPS } from '../sim/content/wraithwood';
import { hash2 } from '../sim/rng';
import { terrainHeight, WATER_LEVEL } from '../sim/world';
import { GFX } from './gfx';

export interface HauntFeaturesView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
  update(time: number): void;
}

const WOOD_ZMIN = 4200;
const WOOD_ZMAX = 4760;

// Ground-mist banks: wide soft sheets pooled in the realm's low spots.
const MISTS = [
  { x: 0, z: 4330, r: 46, phase: 0 },
  { x: -70, z: 4440, r: 40, phase: 1.6 }, // Widow's Thicket pools
  { x: 76, z: 4462, r: 42, phase: 3.1 }, // the Hanging Glade
  { x: -56, z: 4566, r: 38, phase: 4.5 }, // the chapel tarn
  { x: 16, z: 4620, r: 44, phase: 2.2 }, // the Huntsman's clearing
  { x: -20, z: 4500, r: 40, phase: 5.3 },
] as const;

// Ghost-lights: pale will-o-wisps that circle slowly between the trunks.
const WISP_HOMES = [
  { x: -62, z: 4548, r: 9, phase: 0.4 }, // the chapel graves
  { x: 24, z: 4614, r: 10, phase: 2.1 }, // the Huntsman's ring
  { x: -80, z: 4432, r: 8, phase: 3.8 },
  { x: 60, z: 4488, r: 9, phase: 5.0 },
  { x: 24, z: 4358, r: 7, phase: 1.2 }, // Gallowmere's own graveyard
] as const;

function mistTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function glowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function mat(color: number, rough = 0.9): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true })
    : new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export function buildHauntFeatures(seed: number): HauntFeaturesView {
  const group = new THREE.Group();
  group.name = 'haunt-features';
  const glowLights: THREE.PointLight[] = [];

  // --- the giant trees: colossal trunks under one shared broken ceiling ---
  // Each greatTrees record grows a tapered trunk, a few root buttresses, and
  // a wide stack of dark canopy domes; neighboring canopies overlap so the
  // wood reads as closed cover with murk beneath.
  {
    const trunkMat = mat(0x3e362e, 0.95);
    const canopyMat = mat(0x38412f, 0.9);
    const mossMat = mat(0x55624a, 0.9);
    for (const t of WRAITHWOOD_PROPS.greatTrees ?? []) {
      const y = terrainHeight(t.x, t.z, seed);
      if (y < WATER_LEVEL) continue;
      const h = 17 + hash2(t.x, t.z, seed + 4101) * 7; // trunk height
      const tree = new THREE.Group();
      tree.position.set(t.x, y - 0.6, t.z);
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(t.r * 0.62, t.r * 1.15, h, 9),
        trunkMat,
      );
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);
      // root buttresses: leaning cones ringing the base
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + hash2(t.x + i, t.z, seed + 4111) * 0.6;
        const root = new THREE.Mesh(new THREE.ConeGeometry(t.r * 0.42, 4.6, 5), trunkMat);
        root.position.set(Math.sin(ang) * t.r * 1.1, 1.7, Math.cos(ang) * t.r * 1.1);
        root.rotation.z = Math.sin(ang) * 0.5;
        root.rotation.x = Math.cos(ang) * -0.5;
        root.receiveShadow = true;
        tree.add(root);
      }
      // the canopy: overlapping squashed domes, huge and low-slung
      const domes = 3 + Math.floor(hash2(t.z, t.x, seed + 4121) * 2);
      for (let i = 0; i < domes; i++) {
        const ang = hash2(i, t.x + t.z, seed + 4131) * Math.PI * 2;
        const spread = i === 0 ? 0 : 4 + hash2(t.x, i, seed + 4141) * 5;
        const cr = 9 + hash2(i + 1, t.z, seed + 4151) * 6;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(cr, 8, 6), canopyMat);
        dome.scale.set(1, 0.42, 1);
        dome.position.set(Math.sin(ang) * spread, h - 1 + i * 1.6, Math.cos(ang) * spread);
        dome.castShadow = true;
        tree.add(dome);
        // hanging moss: sparse strands trailing from each dome's rim
        for (let k = 0; k < 6; k++) {
          const mang = (k / 6) * Math.PI * 2 + hash2(k, i + t.x, seed + 4161);
          const len = 3 + ((k * 7 + i * 3) % 5) * 0.9;
          const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.045, len, 3), mossMat);
          strand.position.set(
            dome.position.x + Math.sin(mang) * cr * 0.85,
            dome.position.y - len / 2,
            dome.position.z + Math.cos(mang) * cr * 0.85,
          );
          tree.add(strand);
        }
      }
      group.add(tree);
    }
  }

  // --- ground mist: soft sheets that breathe and slide ---
  const mists: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  const mistTex = mistTexture();
  if (mistTex) {
    for (const m of MISTS) {
      const material = new THREE.MeshBasicMaterial({
        map: mistTex,
        color: 0xaebbac,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        fog: false,
      });
      const y = Math.max(terrainHeight(m.x, m.z, seed), WATER_LEVEL) + 1.4;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(m.r * 2, m.r * 2), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(m.x, y, m.z);
      mesh.renderOrder = 3;
      mists.push({ mesh, mat: material, phase: m.phase });
      group.add(mesh);
    }
  }

  // --- ghost-lights: drifting will-o-wisps with a dim halo each ---
  const wisps: {
    sprite: THREE.Sprite;
    light: THREE.PointLight;
    home: { x: number; z: number; r: number };
    phase: number;
    baseY: number;
  }[] = [];
  const glowTex = glowTexture();
  if (glowTex) {
    for (const w of WISP_HOMES) {
      if (w.z < WOOD_ZMIN + 8 || w.z > WOOD_ZMAX - 8) continue;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xbfe8c8,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      sprite.scale.setScalar(1.6);
      const baseY = Math.max(terrainHeight(w.x, w.z, seed), WATER_LEVEL) + 2.2;
      sprite.position.set(w.x, baseY, w.z);
      const light = new THREE.PointLight(0x9fe0b0, 1.1, 20, 2);
      light.position.copy(sprite.position);
      group.add(sprite);
      group.add(light);
      glowLights.push(light);
      wisps.push({ sprite, light, home: w, phase: w.phase, baseY });
    }
  }

  return {
    group,
    glowLights,
    update(time: number): void {
      // the mist breathes and slowly slides; the ghost-lights wander their
      // little circuits like someone pacing a grave row
      for (const m of mists) {
        m.mat.opacity = 0.13 + 0.05 * Math.sin(time * 0.17 + m.phase);
        m.mesh.rotation.z = time * 0.008 + m.phase;
      }
      for (const w of wisps) {
        const a = time * 0.16 + w.phase;
        w.sprite.position.set(
          w.home.x + Math.sin(a) * w.home.r,
          w.baseY + Math.sin(time * 0.5 + w.phase * 2) * 0.7,
          w.home.z + Math.cos(a * 0.8) * w.home.r,
        );
        w.light.position.copy(w.sprite.position);
        const flicker = 0.9 + 0.25 * Math.sin(time * 2.3 + w.phase * 3);
        w.light.intensity = 1.1 * flicker;
        (w.sprite.material as THREE.SpriteMaterial).opacity = 0.55 + 0.25 * flicker;
      }
    },
  };
}
