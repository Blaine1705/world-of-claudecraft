// The Last Keep's lived-in furnishing: KayKit castle (kcas) furniture GLBs
// instanced along the authored room walls of the lastkeep interior. A sibling
// module the interior builder calls (the rift_decor idiom), not a method bank
// on dungeon.ts.
//
// The spot list is PURE data derived from the same LASTKEEP_ROOMS/DOORS/DECOR
// tables the sim builds collision from, so tests/last_keep.test.ts can assert
// the placement contract without a renderer: every piece sits inside a room,
// off the stair ramps, keeps a 1.5yd lane through every doorway, and never
// lands on a sim decor collider. The furniture itself carries NO collider (it
// hugs the walls by construction); the sim's decor list stays the collision
// truth.
//
// Assets load through PROP_ASSET_DEFS urls via loadGltf: props.ts preloads the
// whole registry at boot, so these are cache hits, and a missing model simply
// skips its spots instead of breaking the interior.

import * as THREE from 'three';
import {
  type AuthoredRoom,
  LASTKEEP_DECOR,
  LASTKEEP_DOORS,
  LASTKEEP_ROOMS,
} from '../sim/dungeon_layout';
import { authoredLiftAt } from '../sim/rift/authored';
import { loadGltf } from './assets/loader';
import { PROP_ASSET_DEFS } from './props';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

const KEEP_DRESSING_KEYS = [
  'kcasBookcase',
  'kcasTableLong',
  'kcasBench',
  'kcasKeg',
  'kcasBarrel',
  'kcasChestGold',
  'kcasTorch',
  'kcasTorchMounted',
  'kcasBannerRedA',
  'kcasBannerRedShield',
  'kcasBannerRedTriple',
] as const;
export type KeepDressingKind = (typeof KEEP_DRESSING_KEYS)[number];

// Warm candle light for the mounted torch sconces: the same hue as
// TORCH_COLORS.lastkeep.light in dungeon.ts (kept in sync by hand; this module
// must not import dungeon.ts or the two would cycle).
const KEEP_TORCH_LIGHT = 0xffa14e;

export interface KeepDressingSpot {
  kind: KeepDressingKind;
  x: number;
  z: number;
  /** absolute y (room lift + any mount height) */
  y: number;
  yaw: number;
  s: number;
  /** footprint clearance radius, for the doorway-lane contract test */
  clearR: number;
  /** wall-mounted (banners, sconces): exempt from the floor-lane contract */
  mounted: boolean;
  /** sconce spots additionally emit a warm point light */
  light?: boolean;
}

const roomById = new Map<string, AuthoredRoom>(LASTKEEP_ROOMS.map((r) => [r.id, r]));
const lift = (id: string): number => roomById.get(id)?.lift ?? 0;

// Footprint clearance radius per kind at scale 1 (half the model's larger
// horizontal extent, measured from the GLBs).
const CLEAR_R: Record<KeepDressingKind, number> = {
  kcasBookcase: 2.0,
  kcasTableLong: 2.0,
  kcasBench: 0.9,
  kcasKeg: 0.95,
  kcasBarrel: 0.9,
  kcasChestGold: 1.15,
  kcasTorch: 0.3,
  kcasTorchMounted: 0.35,
  kcasBannerRedA: 0.8,
  kcasBannerRedShield: 1.2,
  kcasBannerRedTriple: 1.9,
};

let spotsCache: KeepDressingSpot[] | null = null;

/** The full furnishing plan, instance-local. Pure and deterministic. */
export function lastKeepFurnishings(): readonly KeepDressingSpot[] {
  if (spotsCache) return spotsCache;
  const out: KeepDressingSpot[] = [];
  const add = (
    kind: KeepDressingKind,
    room: string,
    x: number,
    z: number,
    yaw: number,
    s: number,
    opts?: { dy?: number; mounted?: boolean; light?: boolean },
  ): void => {
    out.push({
      kind,
      x,
      z,
      y: lift(room) + (opts?.dy ?? 0),
      yaw,
      s,
      clearR: CLEAR_R[kind] * s,
      mounted: opts?.mounted ?? false,
      light: opts?.light,
    });
  };
  const HALF = Math.PI / 2;
  const sconce = (room: string, x: number, z: number, yaw: number): void =>
    add('kcasTorchMounted', room, x, z, yaw, 1.7, { dy: 3.3, mounted: true, light: true });

  // ---- entrance hall: heraldry over the threshold, sconces down both walls
  add('kcasBannerRedShield', 'hall_entrance', -7, 6.65, Math.PI, 1.5, { dy: 2.0, mounted: true });
  add('kcasBannerRedShield', 'hall_entrance', 7, 6.65, Math.PI, 1.5, { dy: 2.0, mounted: true });
  add('kcasBannerRedA', 'hall_entrance', -6, -14.65, 0, 1.5, { dy: 2.0, mounted: true });
  add('kcasBannerRedA', 'hall_entrance', 6, -14.65, 0, 1.5, { dy: 2.0, mounted: true });
  sconce('hall_entrance', -8.65, -12, HALF);
  sconce('hall_entrance', -8.65, -2, HALF);
  sconce('hall_entrance', 10.65, -12, -HALF);
  sconce('hall_entrance', 10.65, 2, -HALF);

  // ---- great hall: two rows of feast tables with benches, triple banners and
  // sconces the length of both walls, banners flanking the throne stair
  for (const tx of [-6.5, 6.5]) {
    for (const tz of [20, 32]) {
      add('kcasTableLong', 'great_hall', tx, tz, 0, 1.5);
      for (const bx of [tx - 1.9, tx + 1.9]) {
        for (const bz of [tz - 1.6, tz + 1.6]) {
          add('kcasBench', 'great_hall', bx, bz, HALF, 1.5);
        }
      }
    }
  }
  for (const bz of [12, 24, 36]) {
    add('kcasBannerRedTriple', 'great_hall', -12.65, bz, HALF, 1.6, { dy: 2.2, mounted: true });
    add('kcasBannerRedTriple', 'great_hall', 12.65, bz, -HALF, 1.6, { dy: 2.2, mounted: true });
  }
  add('kcasBannerRedTriple', 'great_hall', -9, 46.65, Math.PI, 1.6, { dy: 2.2, mounted: true });
  add('kcasBannerRedTriple', 'great_hall', 9, 46.65, Math.PI, 1.6, { dy: 2.2, mounted: true });
  sconce('great_hall', -12.65, 18, HALF);
  sconce('great_hall', -12.65, 42, HALF);
  sconce('great_hall', 12.65, 18, -HALF);
  sconce('great_hall', 12.65, 30, -HALF);
  sconce('great_hall', 12.65, 42, -HALF);

  // ---- ballroom: benches along the south wall, banners and sconces; the
  // dance floor itself stays open
  for (const bx of [-32, -27, -22]) add('kcasBench', 'ballroom', bx, 19.8, 0, 1.5);
  add('kcasBannerRedTriple', 'ballroom', -36.65, 24, HALF, 1.6, { dy: 2.2, mounted: true });
  add('kcasBannerRedTriple', 'ballroom', -36.65, 38, HALF, 1.6, { dy: 2.2, mounted: true });
  add('kcasBannerRedTriple', 'ballroom', -22, 42.65, Math.PI, 1.6, { dy: 2.2, mounted: true });
  sconce('ballroom', -36.65, 28, HALF);
  sconce('ballroom', -36.65, 34, HALF);
  sconce('ballroom', -15.35, 20, -HALF);
  sconce('ballroom', -15.35, 40, -HALF);

  // ---- kitchen: the cook's work table, keg and barrel stores off the lanes
  add('kcasTableLong', 'kitchen', -30, 52, HALF, 1.4);
  add('kcasKeg', 'kitchen', -36, 56.2, 0.4, 1.05);
  add('kcasKeg', 'kitchen', -34.2, 56.4, 1.9, 1.05);
  add('kcasBarrel', 'kitchen', -36.6, 45.2, 0.8, 1.0);
  sconce('kitchen', -25.35, 46.5, -HALF);

  // ---- pantry: the larder, stacked stores along both walls
  add('kcasKeg', 'pantry', -21, 54.4, 0.7, 1.05);
  add('kcasKeg', 'pantry', -18.9, 54.6, 2.3, 1.05);
  add('kcasBarrel', 'pantry', -18.5, 47.4, 0.3, 1.0);
  add('kcasBarrel', 'pantry', -20.4, 47.6, 1.4, 1.0);

  // ---- council chamber: the long table over the crest, benches all round
  add('kcasTableLong', 'council', 23, 49, HALF, 1.6);
  add('kcasBench', 'council', 20, 46.6, 0, 1.5);
  add('kcasBench', 'council', 26, 46.6, 0, 1.5);
  add('kcasBench', 'council', 20, 51.4, 0, 1.5);
  add('kcasBench', 'council', 26, 51.4, 0, 1.5);
  add('kcasBannerRedShield', 'council', 30.65, 45, -HALF, 1.5, { dy: 2.2, mounted: true });
  sconce('council', 15.35, 49, HALF);
  sconce('council', 26, 54.65, Math.PI);

  // ---- treasury: the crown's gold chest beside the plinth, sealed stores
  add('kcasChestGold', 'treasury', 35.5, 45.8, -0.4, 1.5);
  add('kcasBarrel', 'treasury', 40.8, 47.8, 0.9, 1.0);
  add('kcasBarrel', 'treasury', 40.4, 52.4, 2.1, 1.0);

  // ---- the two stairs to the residence: sconce-lit landings
  sconce('stair_grand', 15.35, 61, HALF);
  sconce('stair_grand', 22.65, 61, -HALF);
  sconce('stair_servants', -32.65, 63, HALF);
  sconce('stair_servants', -25.35, 63, -HALF);

  // ---- the long gallery: benches under the north-wall banner row
  for (const bx of [-20, -14, -8, -2, 4, 10]) add('kcasBench', 'gallery', bx, 67.8, 0, 1.5);
  for (const bx of [-16, -6, 6, 16]) {
    add('kcasBannerRedA', 'gallery', bx, 76.65, Math.PI, 1.5, { dy: 1.8, mounted: true });
  }
  sconce('gallery', -11, 67.35, 0);
  sconce('gallery', 1, 67.35, 0);
  sconce('gallery', 13, 67.35, 0);
  sconce('gallery', -21, 76.65, Math.PI);
  sconce('gallery', 21, 76.65, Math.PI);

  // ---- royal chamber: the king's table, shelves, and heraldry
  add('kcasTableLong', 'royal_chamber', -33, 74, HALF, 1.4);
  add('kcasBench', 'royal_chamber', -33, 76.6, 0, 1.4);
  add('kcasBookcase', 'royal_chamber', -40.35, 73, HALF, 1.4);
  add('kcasBookcase', 'royal_chamber', -40.35, 79, HALF, 1.4);
  add('kcasBookcase', 'royal_chamber', -30, 82.35, Math.PI, 1.4);
  add('kcasBookcase', 'royal_chamber', -36, 82.35, Math.PI, 1.4);
  add('kcasBannerRedShield', 'royal_chamber', -25.35, 78.5, -HALF, 1.5, {
    dy: 1.8,
    mounted: true,
  });
  sconce('royal_chamber', -38, 69.35, 0);
  sconce('royal_chamber', -33, 82.65, Math.PI);

  // ---- solar (the study): a reading table ringed by shelves
  add('kcasTableLong', 'solar', 0, 84.5, 0, 1.3);
  add('kcasBench', 'solar', 2.9, 84.5, HALF, 1.3);
  add('kcasBookcase', 'solar', -6.55, 84, HALF, 1.35);
  add('kcasBookcase', 'solar', 6.55, 82.5, -HALF, 1.35);
  add('kcasBookcase', 'solar', -1.5, 88.55, Math.PI, 1.35);
  sconce('solar', -6.65, 80.5, HALF);

  // ---- the LIBRARY: bookcase-lined walls, reading tables down the middle
  for (const bz of [65, 71, 77]) add('kcasBookcase', 'library', 40.35, bz, -HALF, 1.4);
  for (const bx of [26.5, 38.5]) add('kcasBookcase', 'library', bx, 61.65, 0, 1.4);
  add('kcasBookcase', 'library', 25.65, 63.5, HALF, 1.4);
  add('kcasBookcase', 'library', 26.6, 78.35, Math.PI, 1.4);
  add('kcasTableLong', 'library', 30, 70, 0, 1.4);
  add('kcasTableLong', 'library', 36, 70, 0, 1.4);
  add('kcasBench', 'library', 28.3, 70, HALF, 1.4);
  add('kcasBench', 'library', 37.7, 70, HALF, 1.4);
  add('kcasTorch', 'library', 25.6, 76.8, 0, 1.5, { light: true });
  sconce('library', 37, 78.65, Math.PI);

  // ---- the watch tower: sconce-lit turn, standing torches on the lookout
  sconce('tower_mid', 29.35, 85, HALF);
  sconce('tower_mid', 36.65, 85, -HALF);
  add('kcasTorch', 'tower_lookout', 29.8, 98.2, 0, 1.5, { light: true });
  add('kcasTorch', 'tower_lookout', 36.2, 98.2, 0, 1.5, { light: true });

  // ---- the undercroft stores (story 0 keeps its dungeon dressing; the
  // storeroom and wine cellar just gain their kegs and barrels)
  add('kcasBarrel', 'storeroom', 36.3, 21.2, 0.4, 1.0);
  add('kcasBarrel', 'storeroom', 35.2, 22.6, 1.6, 1.0);
  add('kcasBarrel', 'storeroom', 36.5, 23.8, 2.7, 1.0);
  add('kcasBarrel', 'storeroom', 24.8, 28.6, 0.9, 1.0);
  add('kcasKeg', 'storeroom', 31.5, 17.6, 0.5, 1.05);
  add('kcasKeg', 'storeroom', 33.6, 17.4, 1.8, 1.05);
  add('kcasKeg', 'storeroom', 30.4, 18.9, 2.9, 1.05);
  for (const kz of [33.5, 35.7, 37.9, 40.1]) add('kcasKeg', 'wine_cellar', 23.9, kz, HALF, 1.05);
  for (const kz of [33.5, 35.7, 37.9]) add('kcasKeg', 'wine_cellar', 36.1, kz, -HALF, 1.05);
  add('kcasBarrel', 'wine_cellar', 30, 40.4, 0.6, 1.0);
  add('kcasBarrel', 'wine_cellar', 28.2, 40.2, 1.7, 1.0);
  add('kcasBarrel', 'wine_cellar', 31.8, 40.6, 2.5, 1.0);

  spotsCache = out;
  return out;
}

// ---------------------------------------------------------------------------
// Asset extraction + instanced build
// ---------------------------------------------------------------------------

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

const partsCache = new Map<KeepDressingKind, Part[]>();
let loadTask: Promise<void> | null = null;

// Meshopt-quantized attributes are normalized ints; bake them to plain floats
// FIRST or applyMatrix4/translate clamp world-space values back into the
// normalized [-1, 1] domain and the furniture collapses (the same guard
// dungeon.ts's module extraction carries). getComponent denormalizes.
function attributeToFloat(geo: THREE.BufferGeometry, name: string): void {
  const attr = geo.getAttribute(name);
  if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) return;
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
  }
  geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
}

// Bake a loaded kcas scene into parts, xz-centered with min-y at 0. Geometry
// is cloned (loader cache results are immutable); the materials stay the
// loader's shared instances, marked shared so view disposal skips them.
function extractParts(scene: THREE.Group): Part[] {
  scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    attributeToFloat(geo, 'position');
    attributeToFloat(geo, 'normal');
    geo.applyMatrix4(mesh.matrixWorld);
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push({ geo: markSharedGeometry(geo), mat: markSharedMaterial(mat) });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox as THREE.Box3);
  }
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (const p of parts) {
    p.geo.translate(-cx, -box.min.y, -cz);
    p.geo.computeBoundingBox();
    p.geo.computeBoundingSphere();
  }
  return parts;
}

/** Resolve every kcas furniture GLB (cache hits: props.ts preloads the whole
 * registry at boot). A model that fails to load resolves to no parts and its
 * spots are skipped, so a missing asset never breaks the keep. */
export function ensureLastKeepDressing(): Promise<void> {
  loadTask ??= Promise.all(
    KEEP_DRESSING_KEYS.map(async (key) => {
      try {
        const gltf = await loadGltf(PROP_ASSET_DEFS[key].url);
        partsCache.set(key, extractParts(gltf.scene));
      } catch {
        partsCache.set(key, []);
      }
    }),
  ).then(() => undefined);
  return loadTask;
}

/** Instance the furnishing plan into `group` (instance-local coordinates).
 * `addLight` is the interior's budgeted warm point-light hook
 * (DungeonInteriors.addInfernalLight bound to the group), so sconce light
 * rides the same GFX-tier light budget as every other interior. */
export function buildLastKeepDressing(
  group: THREE.Group,
  addLight: (x: number, z: number, color: number, y?: number, scale?: number) => void,
  lowGfx: boolean,
): void {
  const byKind = new Map<KeepDressingKind, KeepDressingSpot[]>();
  for (const spot of lastKeepFurnishings()) {
    const list = byKind.get(spot.kind);
    if (list) list.push(spot);
    else byKind.set(spot.kind, [spot]);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (const [kind, list] of byKind) {
    const parts = partsCache.get(kind);
    if (!parts || parts.length === 0) continue;
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((spot, i) => {
        q.setFromAxisAngle(up, spot.yaw);
        v.set(spot.x, spot.y, spot.z);
        sc.set(spot.s, spot.s, spot.s);
        mesh.setMatrixAt(i, m4.compose(v, q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
      // The interior sun rig is dropped underground, so shadows come from
      // nothing here; keep the furniture receive-only like the kit props.
      mesh.castShadow = false;
      mesh.receiveShadow = !lowGfx;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  // Warm candle pools at every sconce and standing torch. The glow decal sits
  // near the floor; the point light rides the shared fire-light budget.
  for (const spot of lastKeepFurnishings()) {
    if (!spot.light) continue;
    const floorY = spot.mounted ? spot.y - 3.3 : spot.y;
    addLight(spot.x, spot.z, KEEP_TORCH_LIGHT, floorY + 0.12, 0.9);
  }
}

/** Test-only window: the placement-contract pieces the vitest asserts. */
export const lastKeepDressingInternalsForTest = {
  keys: KEEP_DRESSING_KEYS,
  rooms: LASTKEEP_ROOMS,
  doors: LASTKEEP_DOORS,
  decor: LASTKEEP_DECOR,
  liftAt: (x: number, z: number): number => authoredLiftAt(LASTKEEP_ROOMS, LASTKEEP_DOORS, x, z),
};
