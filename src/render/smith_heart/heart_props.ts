// The Smith's Heart's blockout dressing: the placeholder of every `sh_*`
// prop the field places (heart_plan_core.ts HEART_PROP_RECIPES: boxes,
// cylinders, cones and gems in the vein's colour family) and the mountain's
// rock along the field's outer lips (heart_walls_core.ts, one instanced draw
// per rock shape). Static: every matrix is written once at build. The geometries and
// materials are shared process-wide (surfaceMat dedupes the materials); the
// interior group owns only the meshes.

import * as THREE from 'three';
import { SMITH_HEART_FIELD } from '../../sim/content/smith_heart_layout';
import { surfaceMat } from '../gfx';
import { markSharedGeometry } from '../shared_resource';
import {
  HEART_PALETTE,
  HEART_PROP_RECIPES,
  type HeartPart,
  type HeartTone,
  heartHash,
  heartHueColor,
  heartPropBase,
  scaleColor,
} from './heart_plan_core';
import { HEART_ROCK_VARIANTS, heartRockShape, planHeartWalls } from './heart_walls_core';

const geometries = new Map<string, THREE.BufferGeometry>();

function sharedGeometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = markSharedGeometry(make());
    geometries.set(key, g);
  }
  return g;
}

/** The unit geometry of a part (scaled by the part's dimensions). */
function partGeometry(p: HeartPart): THREE.BufferGeometry {
  if (p.shape === 'box') return sharedGeometry('box', () => new THREE.BoxGeometry(1, 1, 1));
  if (p.shape === 'cone') return sharedGeometry('cone', () => new THREE.ConeGeometry(0.5, 1, 8));
  if (p.shape === 'gem') return sharedGeometry('gem', () => new THREE.OctahedronGeometry(0.5));
  // A cylinder's top radius is d / 2 against a foot of w / 2: one geometry
  // per rounded ratio, scaled uniformly across.
  const ratio = Math.round((p.d / Math.max(1e-3, p.w)) * 20) / 20;
  return sharedGeometry(`cyl:${ratio}`, () => new THREE.CylinderGeometry(0.5 * ratio, 0.5, 1, 10));
}

/** Blend a colour toward another by `k` (0..1). */
function mix(a: number, b: number, k: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const lerp = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
  return (lerp(16) << 16) | (lerp(8) << 8) | lerp(0);
}

/** The shared material of a tone in a hue. */
export function heartToneMaterial(tone: HeartTone, hueColor: number): THREE.Material {
  if (tone === 'glow') {
    return surfaceMat({
      color: scaleColor(hueColor, 0.35),
      emissive: hueColor,
      emissiveIntensity: 1.3,
      flatShading: true,
      roughness: 0.6,
    });
  }
  if (tone === 'bronze') {
    return surfaceMat({
      color: mix(HEART_PALETTE.bronze, hueColor, 0.12),
      metalness: 0.55,
      roughness: 0.5,
      flatShading: true,
    });
  }
  const base = tone === 'dark' ? HEART_PALETTE.dark : HEART_PALETTE.stone;
  return surfaceMat({ color: mix(base, hueColor, 0.14), roughness: 0.92, flatShading: true });
}

function partMesh(p: HeartPart): THREE.Mesh {
  const mesh = new THREE.Mesh(partGeometry(p), heartToneMaterial(p.tone, heartHueColor(p.hue)));
  if (p.shape === 'box') mesh.scale.set(p.w, p.h, p.d);
  else mesh.scale.set(p.w, p.h, p.w);
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.set(p.tiltX ?? 0, p.yaw ?? 0, p.tiltZ ?? 0, 'YXZ');
  return mesh;
}

/** Every placeholder prop of the field (instance-local). */
export function buildHeartProps(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'smithHeartProps';
  for (const prop of SMITH_HEART_FIELD.props) {
    const recipe = HEART_PROP_RECIPES[prop.kind];
    if (!recipe || recipe.length === 0) continue;
    const holder = new THREE.Group();
    holder.name = `prop:${prop.kind}`;
    holder.position.set(prop.x, heartPropBase(prop.x, prop.z), prop.z);
    holder.rotation.y = prop.rot;
    if (prop.scale) holder.scale.setScalar(prop.scale);
    for (const p of recipe) holder.add(partMesh(p));
    group.add(holder);
  }
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    o.matrixAutoUpdate = false;
  });
  return group;
}

/** A weathered rock palette, darker than the props' stone, matching the
 *  strata cliffs: basalt shadow to lichen-grey granite. */
const ROCK_DARK = 0x2b2927;
const ROCK_LIGHT = 0x5a544d;

/**
 * The mountain's rock: one instanced draw per rock shape (heartRockShape:
 * spires, crags, split slabs), each block squashed across, turned and leaning
 * out (a shear of its top). The low tier spaces them wider (a cosmetic shed;
 * what stays open stays open on every tier).
 */
export function buildHeartWalls(lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'smithHeartWalls';
  const blocks = planHeartWalls(lowGfx ? 7 : 5);
  const material = surfaceMat({ color: 0xffffff, roughness: 0.96, flatShading: true });
  const scale = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const shear = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let variant = 0; variant < HEART_ROCK_VARIANTS; variant++) {
    const mine = blocks.filter((b) => b.variant === variant);
    if (mine.length === 0) continue;
    const geometry = sharedGeometry(`rock:${variant}`, () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(heartRockShape(variant), 3));
      g.computeVertexNormals();
      return g;
    });
    const mesh = new THREE.InstancedMesh(geometry, material, mine.length);
    mesh.name = `smithHeartRock:${variant}`;
    mine.forEach((b, i) => {
      const h = b.top - b.base;
      scale.makeScale(b.rx, h, b.rz);
      turn.makeRotationY(b.yaw);
      // The lean: x and z slide with height, so the top sits out by
      // (leanX, leanZ) yards while the foot stays put.
      shear.set(1, b.leanX / h, 0, b.x, 0, 1, 0, b.base, 0, b.leanZ / h, 1, b.z, 0, 0, 0, 1);
      m.multiplyMatrices(shear, turn).multiply(scale);
      mesh.setMatrixAt(i, m);
      // Basalt to granite, the taller crags a shade paler where the storm
      // light catches them.
      const k = heartHash(Math.round(b.x * 3), Math.round(b.z * 3));
      const tall = Math.min(1, (b.top - SMITH_HEART_FIELD.voidHeight) / 160);
      color.setHex(mix(ROCK_DARK, ROCK_LIGHT, 0.2 + k * 0.45 + tall * 0.25));
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}
