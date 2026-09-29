// The Hollow Crypt's Blender kit (docs/design/dungeon-rework/kit/build_hollow_crypt_kit.py,
// shipped as public/models/props/hollow_crypt_kit.glb): every Kit_* node baked
// once into shared geometry split by material slot (lit stone, emissive glow,
// translucent silk), then instanced per piece over the sim layout's props, the
// cliff-edge dressing, the curtain walls and the render-only set dressing.
//
// A kit that fails to load costs the necropolis its detail, never the player
// the dungeon: every piece has a plain procedural stand-in.

import * as THREE from 'three';
import { HOLLOW_CRYPT_FIELD } from '../../sim/content/hollow_crypt_layout';
import type { FieldProp } from '../../sim/instances/authored_field';
import { loadGltf, releaseGltf } from '../assets/loader';
import { registerDeferredPreload } from '../assets/preload';
import { GFX } from '../gfx';
import { markSharedGeometry, markSharedMaterial } from '../shared_resource';
import { type EdgeDressing, planEdgeDressing } from './crypt_plan_core';
import { HOLLOW_CRYPT_SET_DRESSING, type KitPlacement } from './crypt_set_dressing_core';

export const HOLLOW_CRYPT_KIT_URL = '/models/props/hollow_crypt_kit.glb';

type Slot = 'stone' | 'glow' | 'silk';
type BakedPiece = Partial<Record<Slot, THREE.BufferGeometry>>;

const baked = new Map<string, BakedPiece>();
let loading: Promise<void> | null = null;
let loaded = false;

function bakeNode(node: THREE.Object3D): BakedPiece {
  node.updateWorldMatrix(true, true);
  const parts: Record<Slot, THREE.BufferGeometry[]> = { stone: [], glow: [], silk: [] };
  node.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const attr = child.geometry.getAttribute(name);
      if (!attr) continue;
      const size = name === 'color' ? 3 : attr.itemSize;
      const values = new Float32Array(attr.count * size);
      for (let i = 0; i < attr.count; i++)
        for (let j = 0; j < size; j++) values[i * size + j] = attr.getComponent(i, j);
      geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
    }
    if (child.geometry.index) geometry.setIndex(child.geometry.index.clone());
    geometry.applyMatrix4(child.matrixWorld);
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    const name = material?.name ?? '';
    const slot: Slot = /glow/i.test(name) ? 'glow' : /silk|web/i.test(name) ? 'silk' : 'stone';
    parts[slot].push(geometry.index ? geometry.toNonIndexed() : geometry);
  });
  const out: BakedPiece = {};
  for (const slot of ['stone', 'glow', 'silk'] as Slot[]) {
    if (parts[slot].length === 0) continue;
    out[slot] = markSharedGeometry(mergeNonIndexed(parts[slot]));
  }
  return out;
}

function mergeNonIndexed(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3).fill(1);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    const c = g.attributes.color?.array as Float32Array | undefined;
    if (c) col.set(c, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function startKitLoad(): Promise<void> {
  loading ??= loadGltf(HOLLOW_CRYPT_KIT_URL)
    .then((gltf) => {
      gltf.scene.traverse((node) => {
        if (node.name.startsWith('Kit_') && !baked.has(node.name))
          baked.set(node.name, bakeNode(node));
      });
      releaseGltf(HOLLOW_CRYPT_KIT_URL);
    })
    .catch(() => undefined)
    .then(() => {
      loaded = true;
    });
  return loading;
}

// World content: fetched on the deferred lane once the game starts, so the
// first approach to the crypt usually finds the kit already baked.
if (typeof window !== 'undefined') registerDeferredPreload(() => startKitLoad());

/** Fetch and bake the kit once. Never rejects; resolves within the wait cap
 *  (a later arrival upgrades the stand-ins in place, see buildCryptKit). */
export function ensureCryptKit(): Promise<void> {
  if (loaded || typeof window === 'undefined') return Promise.resolve();
  return Promise.race([startKitLoad(), new Promise<void>((r) => setTimeout(r, 8000))]);
}

// ---- materials --------------------------------------------------------------------

let stoneMat: THREE.Material | null = null;
let glowMat: THREE.Material | null = null;
let silkMat: THREE.Material | null = null;

function slotMaterial(slot: Slot): THREE.Material {
  if (slot === 'stone') {
    stoneMat ??= GFX.standardMaterials
      ? new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.88,
          metalness: 0.02,
          flatShading: true,
          name: 'HollowCryptKitStone',
        })
      : new THREE.MeshLambertMaterial({
          vertexColors: true,
          flatShading: true,
          name: 'HollowCryptKitStone',
        });
    markSharedMaterial(stoneMat);
    return stoneMat;
  }
  if (slot === 'glow') {
    glowMat ??= new THREE.MeshBasicMaterial({
      vertexColors: true,
      name: 'HollowCryptKitGlow',
      toneMapped: false,
    });
    markSharedMaterial(glowMat);
    return glowMat;
  }
  silkMat ??= new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: 0x8a96a8,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
    name: 'HollowCryptKitSilk',
  });
  markSharedMaterial(silkMat);
  return silkMat;
}

// ---- which piece a placement draws ------------------------------------------------------

function hash(a: number, b: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** The kit node a sim prop kind draws (variants picked by position). */
export function kitPieceForProp(p: FieldProp): string {
  const h = hash(p.x, p.z);
  switch (p.kind) {
    case 'hc_lychgate':
      return 'Kit_Lychgate';
    case 'hc_mourner_statue':
      return 'Kit_MournerStatue';
    case 'hc_cloister_column':
      return h < 0.3 ? 'Kit_CloisterColumnBroken' : 'Kit_CloisterColumn';
    case 'hc_ossuary_monument':
      return 'Kit_OssuaryMonument';
    case 'hc_sarcophagus':
      return 'Kit_Sarcophagus';
    case 'hc_processional_pillar':
      return 'Kit_ShrinePillar';
    case 'hc_wing_arch':
      return 'Kit_WingArch';
    case 'hc_headstone':
      return `Kit_Headstone${'ABCD'[Math.floor(h * 4)]}`;
    case 'hc_lantern_post':
      return 'Kit_LanternPost';
    case 'hc_dead_tree':
      return 'Kit_DeadTree';
    case 'hc_bell_tower':
      return 'Kit_BellTower';
    case 'hc_web_column':
      return 'Kit_WebColumn';
    case 'hc_egg_cluster':
      return 'Kit_EggCluster';
    case 'hc_great_web':
      return 'Kit_GreatWeb';
    case 'hc_choir_pillar':
      return 'Kit_ChoirPillar';
    case 'hc_bone_organ':
      return 'Kit_BoneOrgan';
    case 'hc_pew':
      return 'Kit_Pew';
    case 'hc_nave_column':
      return 'Kit_NaveColumn';
    case 'hc_remembrance_candle':
      return 'Kit_RemembranceCandle';
    case 'hc_rite_altar':
      return 'Kit_RiteAltar';
    case 'hc_sarcophagus_alcove':
      return 'Kit_SarcophagusAlcove';
    default:
      return 'Kit_Rubble';
  }
}

const EDGE_PIECES: Record<EdgeDressing['kind'], string> = {
  balustrade: 'Kit_Balustrade',
  merlon: 'Kit_Parapet',
  boneRail: 'Kit_BoneRail',
  rubble: 'Kit_Rubble',
};

// ---- procedural stand-ins ----------------------------------------------------------------

function fallbackGeometry(piece: string): THREE.BufferGeometry {
  const g = (() => {
    if (/Column|Pillar/.test(piece))
      return new THREE.CylinderGeometry(0.9, 1.1, 9, 8).translate(0, 4.5, 0);
    if (/Headstone/.test(piece)) return new THREE.BoxGeometry(0.9, 1.6, 0.25).translate(0, 0.8, 0);
    if (/Balustrade|Parapet|BoneRail/.test(piece))
      return new THREE.BoxGeometry(4, 1, 0.5).translate(0, 0.5, 0);
    if (/BellTower/.test(piece)) return new THREE.BoxGeometry(8, 36, 8).translate(0, 18, 0);
    if (/Monument|Altar/.test(piece))
      return new THREE.CylinderGeometry(4, 5, 6, 8).translate(0, 3, 0);
    if (/Organ/.test(piece)) return new THREE.BoxGeometry(18, 12, 2.6).translate(0, 6, 0);
    if (/CurtainWall/.test(piece)) return new THREE.BoxGeometry(6, 8, 2.4).translate(0, 4, 0);
    if (/Candle/.test(piece))
      return new THREE.CylinderGeometry(0.9, 1.1, 3.5, 10).translate(0, 1.75, 0);
    return new THREE.BoxGeometry(2, 1.2, 1.4).translate(0, 0.6, 0);
  })();
  const n = g.index ? g.toNonIndexed() : g;
  const col = new Float32Array(n.attributes.position.count * 3).fill(0.42);
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return n;
}

const fallbacks = new Map<string, BakedPiece>();

function pieceGeometry(piece: string): BakedPiece {
  const got = baked.get(piece);
  if (got) return got;
  let fb = fallbacks.get(piece);
  if (!fb) {
    fb = { stone: markSharedGeometry(fallbackGeometry(piece)) };
    fallbacks.set(piece, fb);
  }
  return fb;
}

// ---- placement ------------------------------------------------------------------------

function propPlacements(): KitPlacement[] {
  const out: KitPlacement[] = [];
  for (const p of HOLLOW_CRYPT_FIELD.props) {
    out.push({ piece: kitPieceForProp(p), x: p.x, z: p.z, rot: p.rot, scale: p.scale ?? 1 });
  }
  for (const e of planEdgeDressing()) {
    out.push({
      piece: EDGE_PIECES[e.kind],
      x: e.x,
      z: e.z,
      rot: e.rot,
      scale: 1,
      y: e.y,
      stretch: e.length / 4,
    });
  }
  // Curtain walls: the authored wall boxes tiled with wall segments.
  for (const w of HOLLOW_CRYPT_FIELD.walls) {
    const n = Math.max(1, Math.round((w.hw * 2) / 6));
    const cos = Math.cos(w.rot);
    const sin = Math.sin(w.rot);
    for (let i = 0; i < n; i++) {
      const along = -w.hw + (w.hw * 2 * (i + 0.5)) / n;
      out.push({
        piece: hash(w.x + i, w.z) < 0.35 ? 'Kit_CurtainWallBroken' : 'Kit_CurtainWall',
        x: w.x + along * cos,
        z: w.z - along * sin,
        rot: w.rot,
        scale: 1,
        stretch: (w.hw * 2) / n / 6,
      });
    }
  }
  out.push(...HOLLOW_CRYPT_SET_DRESSING);
  return out;
}

/** Instance the whole kit over the layout (instance-local frame). A kit still
 *  loading when this runs is swapped in the moment it lands (same materials, so
 *  the swap links nothing new). */
export function buildCryptKit(
  ground: (x: number, z: number) => number,
  lowGfx: boolean,
): THREE.Group {
  const group = buildKitGroup(ground, lowGfx);
  if (!loaded && loading) {
    void loading.then(() => {
      const parent = group.parent;
      if (!parent || baked.size === 0) return;
      const fresh = buildKitGroup(ground, lowGfx);
      parent.add(fresh);
      group.removeFromParent();
      group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    });
  }
  return group;
}

function buildKitGroup(ground: (x: number, z: number) => number, lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'hollowCryptKit';
  const byPiece = new Map<string, KitPlacement[]>();
  for (const p of propPlacements()) {
    if (lowGfx && p.cosmetic) continue;
    const list = byPiece.get(p.piece) ?? [];
    list.push(p);
    byPiece.set(p.piece, list);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const [piece, list] of byPiece) {
    const geo = pieceGeometry(piece);
    for (const slot of ['stone', 'glow', 'silk'] as Slot[]) {
      const g = geo[slot];
      if (!g) continue;
      const mesh = new THREE.InstancedMesh(g, slotMaterial(slot), list.length);
      mesh.name = `${piece}:${slot}`;
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        pos.set(p.x, p.y ?? ground(p.x, p.z) + (p.lift ?? 0), p.z);
        scl.set(p.scale * (p.stretch ?? 1), p.scale, p.scale);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = slot === 'stone' && !lowGfx;
      mesh.receiveShadow = slot === 'stone';
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}
