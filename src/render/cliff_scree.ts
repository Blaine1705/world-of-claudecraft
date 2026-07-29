import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { SCREE_CELL, screeSinkY, screeSpotAt } from '../sim/scree';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';
import { applySurfaceDetail } from './worn_stone';

// Cliff scree: boulders scattered over steep slopes and piled at their feet,
// so cliff faces stop reading as bare smooth wedges. One InstancedMesh per
// kit rock variant (3 draws) rides the same toroidal grid the blade-grass
// carpet uses, just far coarser: slots are coarse cells over a ~65u radius,
// and a cell only ever grows a rock where the local relief probes say
// "cliff" (a height-delta band over short probes) or "cliff base" (a
// moderate incline whose uphill neighbour is in the band: the scree apron).
// Almost every slot stays a zero-scale empty, which is what lets the pool
// stay this small.
//
// The grid is toroidal: slot (i, j) always owns the world cell congruent to
// (i, j) mod GRID_W nearest the player, so walking re-places only the ring
// of slots whose target cell changed: no allocation, no map churn.
// Placement is budgeted per frame.
//
// Geometry comes from the same kit rock GLBs foliage.ts bakes its boulder
// fields from, but through the public loader cache (foliage's parsed-model
// map is private, and importing foliage.ts from here is deliberately
// avoided). The loader's promise cache dedupes the fetch; a host that
// builds this module before the models resolve simply starts empty and
// populates on resolution.

const MODEL_DIR = 'models/foliage/';
const MODEL_URLS = [1, 2, 3].map((i) => `${MODEL_DIR}rock_${i}.glb`);

// Placement tunables and the placement itself live in sim/scree.ts — the
// single source groundHeight also reads, so the visual rock and the solid
// rock can never drift apart. Only the presentation grid stays here.
const CELL = SCREE_CELL; // yards between candidate spots
const RADIUS = 65; // scatter radius (world units)
const GRID_W = Math.ceil((RADIUS * 2) / CELL); // slots per axis
const POOL = GRID_W * GRID_W; // 400 candidate cells, mostly empty
const PLACE_BUDGET = 60; // re-placements per frame while moving

export interface CliffScreeView {
  group: THREE.Group;
  update(px: number, pz: number): void;
}

// kick off fetches at import (the loader cache shares them with foliage.ts's
// preload of the same URLs, so this costs no extra network); the normal boot
// flow awaits the gate, letting build read the resolved models synchronously
const loadedRocks: GLTF[] = [];
const rocksReady = Promise.all(MODEL_URLS.map((url) => loadGltf(url))).then((gltfs) => {
  loadedRocks.push(...gltfs);
});
registerPreload(rocksReady);

// media-manifest coverage hook (tests/render_glb_replacement_assets.test.ts)
export const cliffScreePreloadInternalsForTest = { rockUrls: MODEL_URLS };

// The shipped GLBs are meshopt-quantized: bake attributes to float32 + world
// space once so the geometry can back an InstancedMesh directly. (Same trick
// as foliage.ts's bakeGeometry, re-stated here because that module is not an
// importable seam.)
function toFloatAttribute(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): THREE.BufferAttribute {
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let j = 0; j < attr.itemSize; j++) out[i * attr.itemSize + j] = attr.getComponent(i, j);
  }
  return new THREE.BufferAttribute(out, attr.itemSize);
}

interface RockSource {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

// each kit rock GLB is a single mesh wearing the shared 'Rocks' sheet
function extractRock(gltf: GLTF): RockSource {
  gltf.scene.updateMatrixWorld(true);
  const found: THREE.Mesh[] = [];
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) found.push(mesh);
  });
  const mesh = found[0];
  if (!mesh) throw new Error('cliff scree: rock model has no meshes');
  const src = mesh.geometry;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const attr = src.getAttribute(name);
    if (attr) out.setAttribute(name, toFloatAttribute(attr));
  }
  if (src.index) out.setIndex(src.index.clone());
  out.applyMatrix4(mesh.matrixWorld);
  return { geometry: out, material: mesh.material as THREE.MeshStandardMaterial };
}

interface RockVariant {
  geometry: THREE.BufferGeometry;
}

interface BakedRocks {
  variants: RockVariant[];
  material: THREE.MeshStandardMaterial;
}

// bake once, cache module-level so a renderer rebuild reuses it (the same
// contract foliage.ts keeps with its extractedParts cache)
let baked: BakedRocks | null = null;

function bakeRocks(): BakedRocks | null {
  if (baked) return baked;
  if (loadedRocks.length < MODEL_URLS.length) return null;
  let material: THREE.MeshStandardMaterial | null = null;
  const variants: RockVariant[] = [];
  for (const gltf of loadedRocks) {
    const rock = extractRock(gltf);
    if (!material) {
      // one material for all variants: the kit rocks share one texture sheet,
      // the same dedupe foliage.ts applies to its own boulder fields
      material = new THREE.MeshStandardMaterial({
        map: rock.material.map,
        normalMap: rock.material.normalMap,
        color: rock.material.color.clone(), // baseColorFactor: kit sheets rely on it
        roughness: 0.95,
        metalness: 0,
      });
      // Same triplanar stone strength as foliage.ts gives the shared kit
      // boulder fields, so a scree rock and a dressing rock read identically.
      applySurfaceDetail(material, 'stone', { strength: 0.5 });
    }
    // origin sink comes from sim/scree.ts's baked dims (screeSinkY), not a
    // live bounds measurement: the sim's walkable dome and this mesh must
    // agree on where the rock sits to the millimetre
    variants.push({ geometry: rock.geometry });
  }
  if (!material) return null; // unreachable: MODEL_URLS is non-empty
  // the baked float geometry + runtime material are the retained
  // representation: drop the parsed scenes so they can be collected. The
  // shared loader cache entry stays foliage.ts's to release, since it
  // preloads and extracts these same URLs.
  loadedRocks.length = 0;
  baked = { variants, material };
  return baked;
}

export function buildCliffScree(seed: number): CliffScreeView {
  const group = new THREE.Group();
  group.name = 'cliffScree';
  // form shadows are the whole point of the scatter; the lambert tier has no
  // shadow map to catch them, so it skips the system entirely (and lean
  // foliage machines skip it with the rest of the ground cover)
  if (!GFX.standardMaterials || GFX.leanFoliage) {
    return { group, update: () => undefined };
  }

  const meshes: THREE.InstancedMesh[] = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let ready = false;

  const tryBuild = (): void => {
    if (ready) return;
    const rocks = bakeRocks();
    if (!rocks) return;
    for (const variant of rocks.variants) {
      const im = new THREE.InstancedMesh(variant.geometry, rocks.material, POOL);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // a lit wedge with hard rock shadows across it reads as a face, not a
      // smear: shadows on, both directions
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false; // pool is centred on the player
      for (let s = 0; s < POOL; s++) im.setMatrixAt(s, zero);
      meshes.push(im);
      group.add(im);
    }
    ready = true;
  };
  tryBuild();
  // fail-soft: a lost fetch just leaves the group empty (the boot preload
  // gate has already surfaced the error where it matters)
  if (!ready) void rocksReady.then(tryBuild).catch(() => undefined);

  // per-slot current cell (packed); 0x7fffffff = never placed
  const slotCell = new Int32Array(POOL).fill(0x7fffffff);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const v = new THREE.Vector3();
  const sv = new THREE.Vector3();

  const tiltHash = (i: number, j: number, k: number): number => {
    let h = (i * 374761393 + j * 668265263 + k * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function placeSlot(slot: number, ci: number, cj: number): void {
    // clear every variant's slot first; at most one gets a rock back below
    for (const im of meshes) im.setMatrixAt(slot, zero);
    // Placement is the sim's: screeSpotAt is the shared single source that
    // also feeds groundHeight's walkable dome, so the rock you see is
    // exactly the rock that blocks you and that you can jump onto.
    const spot = screeSpotAt(seed, ci, cj);
    if (!spot) return;
    const vi = Math.min(meshes.length - 1, spot.variant);
    const s = spot.scale;
    qYaw.setFromAxisAngle(up, spot.yaw);
    const glen = Math.hypot(spot.gx, spot.gz);
    if (glen > 1e-4) {
      // slight settle-lean downhill about the cross-slope axis, stronger on
      // steeper ground; the sink hides the lifted edge. Presentation only:
      // the walkable dome stays radially symmetric, and at these angles the
      // visual crown moves less than the dome's flat-crown tolerance.
      axis.set(-spot.gz / glen, 0, spot.gx / glen);
      qTilt.setFromAxisAngle(
        axis,
        (0.06 + tiltHash(ci, cj, 7) * 0.22) * Math.min(1, spot.slope * 1.5),
      );
      q.multiplyQuaternions(qTilt, qYaw);
    } else {
      q.copy(qYaw);
    }
    m.compose(v.set(spot.x, spot.baseY - s * screeSinkY(vi), spot.z), q, sv.set(s, s, s));
    meshes[vi].setMatrixAt(slot, m);
  }

  return {
    group,
    update(px: number, pz: number): void {
      if (!ready) return;
      // target cell block: the GRID_W x GRID_W square centred on the player
      const baseI = Math.floor(px / CELL) - (GRID_W >> 1);
      const baseJ = Math.floor(pz / CELL) - (GRID_W >> 1);
      let budget = PLACE_BUDGET;
      let dirty = false;
      for (let gj = 0; gj < GRID_W && budget > 0; gj++) {
        for (let gi = 0; gi < GRID_W && budget > 0; gi++) {
          // world cell owned by slot (gi, gj): the unique cell in the target
          // block congruent to (gi, gj) mod GRID_W
          const ci = baseI + ((((gi - baseI) % GRID_W) + GRID_W) % GRID_W);
          const cj = baseJ + ((((gj - baseJ) % GRID_W) + GRID_W) % GRID_W);
          const slot = gj * GRID_W + gi;
          const packed = ((ci & 0xffff) << 16) | (cj & 0xffff);
          if (slotCell[slot] === packed) continue;
          slotCell[slot] = packed;
          placeSlot(slot, ci, cj);
          dirty = true;
          budget--;
        }
      }
      if (dirty) {
        for (const im of meshes) im.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
