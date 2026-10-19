// The Smith's Heart's blockout dressing: the placeholder of every `sh_*`
// prop the field places (heart_plan_core.ts HEART_PROP_RECIPES: boxes,
// cylinders, cones and gems in the vein's colour family) and the mountain's
// rock walls along the field's outer lips (heart_walls_core.ts, one instanced
// draw). Static: every matrix is written once at build. The geometries and
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
import { planHeartWalls } from './heart_walls_core';

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

/**
 * The mountain's walls: one instanced draw of tapered six-sided rock blocks.
 * The low tier spaces them wider (a cosmetic shed; what stays open stays
 * open on every tier).
 */
export function buildHeartWalls(lowGfx: boolean): THREE.InstancedMesh {
  const blocks = planHeartWalls(lowGfx ? 7 : 5);
  const geometry = sharedGeometry('wallBlock', () =>
    new THREE.CylinderGeometry(0.62, 1, 1, 6).translate(0, 0.5, 0),
  );
  const material = surfaceMat({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, blocks.length));
  mesh.name = 'smithHeartWalls';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  blocks.forEach((b, i) => {
    q.setFromAxisAngle(up, b.yaw);
    s.set(b.r, b.top - b.base, b.r);
    t.set(b.x, b.base, b.z);
    m.compose(t, q, s);
    mesh.setMatrixAt(i, m);
    // Granite to basalt: the faces vary so the mass never reads as one tint.
    const k = heartHash(Math.round(b.x * 3), Math.round(b.z * 3));
    color.setHex(mix(HEART_PALETTE.dark, HEART_PALETTE.stone, 0.35 + k * 0.55));
    mesh.setColorAt(i, color);
  });
  mesh.count = blocks.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  return mesh;
}
