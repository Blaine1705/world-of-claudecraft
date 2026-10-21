// The Smith's Heart's Blender kits (one per vein, the Hammer's first:
// docs/design/raid/kit/build_smith_heart_hammer_kit.py, shipped as
// public/models/props/smith_heart_hammer_kit.glb): every Kit_* node baked once
// into shared geometry split by material slot (KitStone: rock, carving,
// timber, bronze, iron, rope, told apart by the vertex colour; KitGlow: the
// vein's light, the geodes' hearts, the runes), then instanced per piece over
// a pure plan's placements (hammer_kit_plan_core.ts).
//
// A kit that fails to load (or has not landed when the interior is built)
// costs the raid its detail, never the player the raid: the placeholder props
// stay drawn (heart_props.ts) and a kit that lands late swaps in under the
// same group (`upgradeWhenHeartKitLands`). GPU preparation: every kit group is
// part of the interior group the renderer attaches through its compile gate,
// and carries hidden carriers of both slot materials in both variants, so a
// late swap links no program. No lights here (heart_lights.ts owns them).

import * as THREE from 'three';
import { loadGltf, releaseGltf } from '../assets/loader';
import { registerDeferredPreload } from '../assets/preload';
import { GFX } from '../gfx';
import { markSharedGeometry, markSharedMaterial } from '../shared_resource';
import { applySurfaceDetail } from '../worn_stone';
import type { HeartKitPlacement } from './heart_kit_core';

export const SMITH_HEART_HAMMER_KIT_URL = '/models/props/smith_heart_hammer_kit.glb';

export type HeartKitSlot = 'stone' | 'glow';
export type HeartBakedPiece = Partial<Record<HeartKitSlot, THREE.BufferGeometry>>;
export const HEART_KIT_SLOTS: readonly HeartKitSlot[] = ['stone', 'glow'];

/** How long the interior waits for a kit before building with placeholders. */
const KIT_WAIT_MS = 8000;

interface KitState {
  baked: Map<string, HeartBakedPiece>;
  loading: Promise<void> | null;
  loaded: boolean;
}

const kits = new Map<string, KitState>();

function stateOf(url: string): KitState {
  let s = kits.get(url);
  if (!s) {
    s = { baked: new Map(), loading: null, loaded: false };
    kits.set(url, s);
  }
  return s;
}

function slotOf(materialName: string): HeartKitSlot {
  return /glow/i.test(materialName) ? 'glow' : 'stone';
}

/** Merge geometries into ONE indexed geometry (position, normal, colour). */
export function mergeHeartKitParts(list: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  let indices = 0;
  for (const g of list) {
    count += g.attributes.position.count;
    indices += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3).fill(1);
  const index = count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let o = 0;
  let io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array as Float32Array, o * 3);
    const c = g.attributes.color?.array as Float32Array | undefined;
    if (c && g.attributes.color.itemSize === 3) col.set(c, o * 3);
    if (g.index) {
      const src = g.index.array;
      for (let k = 0; k < src.length; k++) index[io++] = src[k] + o;
    } else {
      for (let k = 0; k < n; k++) index[io++] = o + k;
    }
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}

function bakeNode(node: THREE.Object3D): HeartBakedPiece {
  node.updateWorldMatrix(true, true);
  const parts: Record<HeartKitSlot, THREE.BufferGeometry[]> = { stone: [], glow: [] };
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
    parts[slotOf(material?.name ?? '')].push(geometry);
  });
  const out: HeartBakedPiece = {};
  for (const slot of HEART_KIT_SLOTS) {
    if (parts[slot].length === 0) continue;
    out[slot] = markSharedGeometry(mergeHeartKitParts(parts[slot]));
    for (const g of parts[slot]) g.dispose();
  }
  return out;
}

function startKitLoad(url: string): Promise<void> {
  const s = stateOf(url);
  s.loading ??= loadGltf(url)
    .then((gltf) => {
      gltf.scene.traverse((node) => {
        if (node.name.startsWith('Kit_') && !s.baked.has(node.name))
          s.baked.set(node.name, bakeNode(node));
      });
      releaseGltf(url);
    })
    .catch(() => undefined)
    .then(() => {
      s.loaded = true;
    });
  return s.loading;
}

// World content: fetched on the deferred lane once the game starts.
if (typeof window !== 'undefined')
  registerDeferredPreload(() => startKitLoad(SMITH_HEART_HAMMER_KIT_URL));

/** Fetch and bake a kit once. Never rejects; resolves within the wait cap
 *  (a later arrival upgrades in place: upgradeWhenHeartKitLands). */
export function ensureHeartKit(url: string): Promise<void> {
  if (stateOf(url).loaded || typeof window === 'undefined') return Promise.resolve();
  return Promise.race([
    startKitLoad(url),
    new Promise<void>((resolve) => setTimeout(resolve, KIT_WAIT_MS)),
  ]);
}

/** Has the kit landed with its pieces? */
export function heartKitLoaded(url: string): boolean {
  const s = stateOf(url);
  return s.loaded && s.baked.size > 0;
}

/** A baked kit piece by node name (Kit_*), or null until the kit has landed. */
export function heartKitPiece(url: string, piece: string): HeartBakedPiece | null {
  return stateOf(url).baked.get(piece) ?? null;
}

// ---- materials --------------------------------------------------------------------

const slotMats = new Map<HeartKitSlot, THREE.Material>();

/** The shared material of a slot (one program per slot for every Smith's
 *  Heart kit). The stone takes the shared triplanar rock detail (real
 *  KTX2 normal, AO and roughness, world space) on the tiers that draw it. */
export function heartKitSlotMaterial(slot: HeartKitSlot): THREE.Material {
  let m = slotMats.get(slot);
  if (m) return m;
  if (slot === 'stone') {
    if (GFX.standardMaterials) {
      const std = new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.04,
        roughness: 0.86,
        name: 'SmithHeartKitStone',
      });
      applySurfaceDetail(std, 'rock', { strength: 0.5 });
      m = std;
    } else {
      m = new THREE.MeshLambertMaterial({ vertexColors: true, name: 'SmithHeartKitStone' });
    }
  } else {
    m = new THREE.MeshBasicMaterial({
      vertexColors: true,
      name: 'SmithHeartKitGlow',
      toneMapped: false,
    });
  }
  markSharedMaterial(m);
  slotMats.set(slot, m);
  return m;
}

// ---- the instancer ------------------------------------------------------------------

export type { HeartKitPlacement } from './heart_kit_core';

const tmpQ = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScl = new THREE.Vector3();
const tmpShear = new THREE.Matrix4();
const tmpM = new THREE.Matrix4();
const tmpOut = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

/** A placement's instance matrix: T * R * Shear * S. */
export function heartKitPlacementMatrix(p: HeartKitPlacement, out: THREE.Matrix4): THREE.Matrix4 {
  tmpQ.setFromAxisAngle(UP, p.rot);
  tmpPos.set(p.x, p.y, p.z);
  const s = p.scale ?? 1;
  tmpScl.set(s * (p.stretch ?? 1), s, s);
  if (!p.shear) return out.compose(tmpPos, tmpQ, tmpScl);
  // y += shear * x in the piece's own (stretched) frame.
  out.compose(tmpPos, tmpQ, ONE);
  tmpShear.set(1, 0, 0, 0, p.shear, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  tmpM.makeScale(tmpScl.x, tmpScl.y, tmpScl.z);
  return out.multiply(tmpShear).multiply(tmpM);
}

/** The side of a culling cell (yards). */
const CULL_CELL = 80;

/** Instance a list of placements of one kit (one InstancedMesh per piece,
 *  culling cell, shadow class and slot), plus the slot program warmers. */
export function instanceHeartKit(
  url: string,
  list: readonly HeartKitPlacement[],
  lowGfx: boolean,
  name: string,
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const buckets = new Map<string, HeartKitPlacement[]>();
  for (const p of list) {
    if (lowGfx && p.cosmetic) continue;
    if (!heartKitPiece(url, p.piece)) continue;
    const key = `${p.piece}|${Math.floor(p.x / CULL_CELL)}|${Math.floor(p.z / CULL_CELL)}|${p.noShadow ? 1 : 0}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(p);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    const piece = bucket[0].piece;
    const geo = heartKitPiece(url, piece);
    if (!geo) continue;
    const casts = !lowGfx && !bucket[0].noShadow;
    for (const slot of HEART_KIT_SLOTS) {
      const g = geo[slot];
      if (!g) continue;
      const mesh = new THREE.InstancedMesh(g, heartKitSlotMaterial(slot), bucket.length);
      mesh.name = `${piece}:${slot}`;
      for (const [i, p] of bucket.entries())
        mesh.setMatrixAt(i, heartKitPlacementMatrix(p, tmpOut));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = casts && slot === 'stone';
      mesh.receiveShadow = slot === 'stone';
      mesh.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  group.add(heartKitProgramWarmers());
  return group;
}

let warmGeometry: THREE.BufferGeometry | null = null;

/** Hidden carriers of every slot material in both variants (instanced and
 *  plain, casting a shadow), built with every kit group: the compile gate
 *  links them with the interior, so a kit that lands late, a gate's moving
 *  pieces and the Slab's tumbling chunks link no program in a live frame. */
export function heartKitProgramWarmers(): THREE.Group {
  if (!warmGeometry) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    g.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3),
    );
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
    warmGeometry = markSharedGeometry(g);
  }
  const group = new THREE.Group();
  group.name = 'smithHeartKitWarmers';
  for (const slot of HEART_KIT_SLOTS) {
    const inst = new THREE.InstancedMesh(warmGeometry, heartKitSlotMaterial(slot), 1);
    const plain = new THREE.Mesh(warmGeometry, heartKitSlotMaterial(slot));
    for (const m of [inst, plain]) {
      m.castShadow = slot === 'stone';
      m.receiveShadow = slot === 'stone';
      m.visible = false;
      m.frustumCulled = false;
      m.name = `smithHeartKitWarmer:${slot}`;
      group.add(m);
    }
  }
  return group;
}

/** One plain Mesh per slot of a kit piece under a group (for the painters
 *  that move a single piece: the Slab's halves and chunks). */
export function heartKitMeshes(url: string, piece: string): THREE.Group | null {
  const geo = heartKitPiece(url, piece);
  if (!geo) return null;
  const group = new THREE.Group();
  group.name = piece;
  for (const slot of HEART_KIT_SLOTS) {
    const g = geo[slot];
    if (!g) continue;
    const mesh = new THREE.Mesh(g, heartKitSlotMaterial(slot));
    mesh.name = `${piece}:${slot}`;
    mesh.castShadow = slot === 'stone';
    mesh.receiveShadow = slot === 'stone';
    group.add(mesh);
  }
  return group;
}

/** Swap a group built before a kit landed for the kit's build the moment it
 *  lands (same materials, so no new program). `build` rebuilds it. */
export function upgradeWhenHeartKitLands(
  url: string,
  group: THREE.Object3D,
  build: () => THREE.Object3D,
): void {
  const s = stateOf(url);
  if (s.loaded || !s.loading) return;
  void s.loading.then(() => {
    const parent = group.parent;
    if (!parent || s.baked.size === 0) return;
    parent.add(build());
    group.removeFromParent();
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
  });
}
