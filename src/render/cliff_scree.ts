import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { getActiveWorldContent, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z } from '../sim/data';
import { roadDistance, terrainHeight, WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { insideGrassHubExclusion } from './foliage_core';
import { GFX } from './gfx';

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

const CELL = 6.5; // yards between candidate spots
const RADIUS = 65; // scatter radius (world units)
const GRID_W = Math.ceil((RADIUS * 2) / CELL); // slots per axis
const POOL = GRID_W * GRID_W; // 400 candidate cells, mostly empty
const PLACE_BUDGET = 60; // re-placements per frame while moving
const PROBE = 1.5; // relief probe reach
const SLOPE_MIN = 0.45; // height delta over PROBE where the cliff band starts
const SLOPE_MAX = 1.6; // past this the face is a sheer smear: rocks would float
const APRON_ELIGIBLE = 0.12; // minimum local incline for cliff-base rubble
const APRON_PROBE = 3; // how far uphill the apron looks for its cliff
const CLIFF_DENSITY = 0.65; // hash acceptance inside the band
const APRON_DENSITY = 0.4; // sparser rubble below it
const SINK = 0.15; // fraction of rock height buried in the ground
const EDGE = 16; // keep-out margin from the world rectangle

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
  sinkY: number; // origin offset burying SINK of the rock's height at scale 1
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
    }
    rock.geometry.computeBoundingBox();
    const bb = rock.geometry.boundingBox;
    const minY = bb ? bb.min.y : 0;
    const maxY = bb ? bb.max.y : 1;
    variants.push({ geometry: rock.geometry, sinkY: minY + (maxY - minY) * SINK });
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
  // shadow map to catch them, so it skips the system entirely
  if (!GFX.standardMaterials) {
    return { group, update: () => undefined };
  }

  const meshes: THREE.InstancedMesh[] = [];
  const sinks: number[] = [];
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
      sinks.push(variant.sinkY);
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

  const hash = (i: number, j: number, k: number): number => {
    let h = (i * 374761393 + j * 668265263 + k * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function placeSlot(slot: number, ci: number, cj: number): void {
    // clear every variant's slot first; at most one gets a rock back below
    for (const im of meshes) im.setMatrixAt(slot, zero);
    const r1 = hash(ci, cj, 1);
    // density gate up front: the cheapest reject, and APRON_DENSITY sits
    // under CLIFF_DENSITY so a cell that fails here can never place at all
    if (r1 >= CLIFF_DENSITY) return;
    const x = ci * CELL + (hash(ci, cj, 2) - 0.5) * CELL * 0.9;
    const z = cj * CELL + (hash(ci, cj, 3) - 0.5) * CELL * 0.9;
    if (Math.abs(x) > WORLD_MAX_X - EDGE || z < WORLD_MIN_Z + EDGE || z > WORLD_MAX_Z - EDGE) {
      return;
    }
    const h = terrainHeight(x, z, seed);
    if (h < WATER_LEVEL + 0.5) return; // shorelines keep their own dressing
    // local relief: max height delta over four short probes, the same signal
    // the terrain shader's slope treatment keys from
    const hE = terrainHeight(x + PROBE, z, seed);
    const hW = terrainHeight(x - PROBE, z, seed);
    const hS = terrainHeight(x, z + PROBE, seed);
    const hN = terrainHeight(x, z - PROBE, seed);
    const slope = Math.max(Math.abs(hE - h), Math.abs(hW - h), Math.abs(hS - h), Math.abs(hN - h));
    if (slope > SLOPE_MAX) return;
    // uphill direction from the probe stencil; doubles as the lean direction
    const gx = hE - hW;
    const gz = hS - hN;
    const glen = Math.hypot(gx, gz);
    let apron = false;
    if (slope < SLOPE_MIN) {
      // Scree apron: a moderate incline directly below a cliff collects its
      // fallen rock. Probe uphill and require a genuine band there; flats
      // and gentle meadows (no meaningful gradient) never qualify.
      if (slope < APRON_ELIGIBLE || glen < 1e-4 || r1 >= APRON_DENSITY) return;
      const ux = x + (gx / glen) * APRON_PROBE;
      const uz = z + (gz / glen) * APRON_PROBE;
      const uh = terrainHeight(ux, uz, seed);
      const uSlope = Math.max(
        Math.abs(terrainHeight(ux + PROBE, uz, seed) - uh),
        Math.abs(terrainHeight(ux - PROBE, uz, seed) - uh),
        Math.abs(terrainHeight(ux, uz + PROBE, seed) - uh),
        Math.abs(terrainHeight(ux, uz - PROBE, seed) - uh),
      );
      if (uSlope < SLOPE_MIN || uSlope > SLOPE_MAX) return;
      apron = true;
    }
    if (roadDistance(x, z) < 3) return;
    if (insideGrassHubExclusion(getActiveWorldContent().zones, x, z)) return;
    const vi = Math.min(meshes.length - 1, Math.floor(hash(ci, cj, 4) * meshes.length));
    // apron rubble runs smaller; the band itself holds the boulders
    const s = 0.5 + hash(ci, cj, 5) * (apron ? 0.7 : 1.3);
    qYaw.setFromAxisAngle(up, hash(ci, cj, 6) * Math.PI * 2);
    if (glen > 1e-4) {
      // slight settle-lean downhill about the cross-slope axis, stronger on
      // steeper ground; the sink hides the lifted edge
      axis.set(-gz / glen, 0, gx / glen);
      qTilt.setFromAxisAngle(axis, (0.06 + hash(ci, cj, 7) * 0.22) * Math.min(1, slope * 1.5));
      q.multiplyQuaternions(qTilt, qYaw);
    } else {
      q.copy(qYaw);
    }
    m.compose(v.set(x, h - s * sinks[vi], z), q, sv.set(s, s, s));
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
