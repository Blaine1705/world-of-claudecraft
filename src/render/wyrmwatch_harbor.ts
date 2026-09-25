// The Wyrmwatch cliff harbor on screen: the one Blender-authored model
// (public/models/props/wyrmwatch_harbor.glb, scripts/assets/wyrmwatch_harbor/) placed on
// the waterline at the harbor origin (sim/content/wyrmwatch_harbor.ts), and the path to
// Wyrmwatch laid from its three flagstones along the content's centre line, each stone
// seated on the terrain (the terrain drawn IS the sim's terrainHeight).
//
// Which parts a graphics tier keeps is the pure core's call (wyrmwatch_harbor_core.ts):
// the walkable structure, rails, gate, shack, cargo, lanterns and the path on every tier;
// the iron trim from medium, the loose dressing from high. The tier is the static effects
// tier (GFX.effectsTier), never the frame-rate governor, and a graphics-profile change
// rebuilds the props (the resetter below, registered in assets/graphics_profile.ts).
//
// GPU work: the harbor is built into the props root at world build (props.ts), so the
// world-entry compile links it with the rest of the props, and its distinct (geometry,
// material) programs join the props material prewarm (wyrmwatchHarborPrewarmParts), so
// a harbor first seen after the curtain links nothing in a live frame. The materials are
// the surface family's vertex-coloured standard/lambert (the route marker's, the same
// programs). Nothing here runs per frame.

import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WYRMWATCH_HARBOR_ORIGIN,
  WYRMWATCH_HARBOR_PATH,
  WYRMWATCH_HARBOR_PATH_HALF_WIDTH,
} from '../sim/content/wyrmwatch_harbor';
import { terrainHeight, WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import { dequantizeAttribute } from './characters/dequantize_attribute';
import { GFX, surfaceMat } from './gfx';
import {
  WYRMWATCH_PATH_STONE_PARTS,
  wyrmwatchHarborParts,
  wyrmwatchPathStones,
} from './wyrmwatch_harbor_core';

const HARBOR_URL = '/models/props/wyrmwatch_harbor.glb';
/** Warm lantern panes and the shack window: the ferry's own glow (transport_ship.ts). */
const GLOW_EMISSIVE = 0xff9a3c;

let loaded: GLTF | null = null;
let loadTask: Promise<void> | null = null;

export function prepareWyrmwatchHarborAssets(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadTask) return loadTask;
  loadTask = loadGltf(HARBOR_URL)
    .then((gltf) => {
      loaded = gltf;
      loadTask = null;
    })
    .catch((err) => {
      loadTask = null;
      throw err;
    });
  return loadTask;
}

if (typeof window !== 'undefined') registerDeferredPreload(prepareWyrmwatchHarborAssets);

interface HarborPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

interface HarborTemplate {
  /** The kept parts merged into one geometry per material, in the model's frame. */
  parts: HarborPart[];
  /** The three flagstones, each in its own frame (origin at its centre). */
  stones: HarborPart[];
}

/** Templates by `effectsTier|standard`: a preset change converts anew. */
const templates = new Map<string, HarborTemplate>();
let lastParts: HarborPart[] = [];
const convertedMaterials = new Map<string, THREE.Material>();

/** Drop the prepared templates (graphics-profile rebuilds convert materials anew;
 *  the parsed source survives). Registered in assets/graphics_profile.ts. */
export function resetWyrmwatchHarborCaches(): void {
  templates.clear();
  convertedMaterials.clear();
  lastParts = [];
}

function convertMaterial(source: THREE.Material): THREE.Material {
  const std = source as THREE.MeshStandardMaterial;
  const glow = /glow/i.test(source.name);
  const key = `${source.name}|${GFX.standardMaterials ? 's' : 'l'}`;
  const cached = convertedMaterials.get(key);
  if (cached) return cached;
  const mat = surfaceMat({
    color: 0xffffff,
    vertexColors: true,
    roughness: std.roughness ?? 0.85,
    metalness: std.metalness ?? 0,
    emissive: glow ? GLOW_EMISSIVE : 0x000000,
    emissiveIntensity: glow ? (GFX.standardMaterials ? 1.9 : 1.0) : 1,
  });
  convertedMaterials.set(key, mat);
  return mat;
}

/** A mesh's geometry (dequantized) in the frame `frame` maps it into. */
function meshGeometry(mesh: THREE.Mesh, frame: THREE.Matrix4): THREE.BufferGeometry {
  const src = mesh.geometry;
  const geo = new THREE.BufferGeometry();
  for (const attr of ['position', 'normal', 'color'] as const) {
    const a = src.getAttribute(attr) as THREE.BufferAttribute | undefined;
    if (a) geo.setAttribute(attr, dequantizeAttribute(a));
  }
  if (src.index) geo.setIndex(src.index.clone());
  geo.applyMatrix4(frame);
  return geo;
}

function mergeBuckets(buckets: Map<THREE.Material, THREE.BufferGeometry[]>): HarborPart[] {
  const parts: HarborPart[] = [];
  for (const [material, geos] of buckets) {
    const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geometry) continue;
    for (const g of geos) if (g !== geometry) g.dispose();
    geometry.computeBoundingSphere();
    parts.push({ geometry, material });
  }
  return parts;
}

function buildTemplate(gltf: GLTF, keep: readonly string[]): HarborTemplate {
  // loader cache results are immutable: read a clone
  const root = gltf.scene.clone(true);
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const name of keep) {
    const part = root.getObjectByName(name);
    if (!part) continue;
    part.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const frame = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      const material = convertMaterial(mesh.material as THREE.Material);
      let list = buckets.get(material);
      if (!list) {
        list = [];
        buckets.set(material, list);
      }
      list.push(meshGeometry(mesh, frame));
    });
  }
  // the flagstones keep their own frame (the path places each one)
  const stones: HarborPart[] = [];
  for (const name of WYRMWATCH_PATH_STONE_PARTS) {
    const node = root.getObjectByName(name);
    const stoneBuckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    node?.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      const frame = new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().copy(node.matrixWorld).invert(),
        mesh.matrixWorld,
      );
      const material = convertMaterial(mesh.material as THREE.Material);
      const list = stoneBuckets.get(material) ?? [];
      list.push(meshGeometry(mesh, frame));
      stoneBuckets.set(material, list);
    });
    const merged = mergeBuckets(stoneBuckets);
    if (merged.length === 1) stones.push(merged[0]);
  }
  return { parts: mergeBuckets(buckets), stones };
}

function templateFor(): HarborTemplate {
  const key = `${GFX.effectsTier}|${GFX.standardMaterials ? 's' : 'l'}`;
  let template = templates.get(key);
  if (!template) {
    if (!loaded) throw new Error(`wyrmwatch harbor model was not preloaded: ${HARBOR_URL}`);
    template = buildTemplate(loaded, wyrmwatchHarborParts(GFX.effectsTier));
    templates.set(key, template);
  }
  lastParts = [...template.parts, ...template.stones];
  return template;
}

const up = new THREE.Vector3(0, 1, 0);
const normal = new THREE.Vector3();
const tilt = new THREE.Quaternion();
const spin = new THREE.Quaternion();
const place = new THREE.Matrix4();
const scaleV = new THREE.Vector3();
const posV = new THREE.Vector3();

/** The path to Wyrmwatch: every flagstone merged into one mesh per material, its
 *  geometry re-centred on the path so its bounds stay path-sized. */
export function buildWyrmwatchHarborPath(template: HarborTemplate, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wyrmwatchHarborPath';
  if (template.stones.length === 0) return group;
  const stones = wyrmwatchPathStones(
    WYRMWATCH_HARBOR_PATH,
    WYRMWATCH_HARBOR_PATH_HALF_WIDTH,
    (x, z) => terrainHeight(x, z, seed),
  );
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const s of stones) {
    const stone = template.stones[s.variant % template.stones.length];
    normal.set(s.nx, s.ny, s.nz);
    tilt.setFromUnitVectors(up, normal);
    spin.setFromAxisAngle(up, s.yaw);
    tilt.multiply(spin);
    place.compose(posV.set(s.x, s.y, s.z), tilt, scaleV.set(s.scale, 1, s.scale));
    const geo = stone.geometry.clone();
    geo.applyMatrix4(place);
    const list = buckets.get(stone.material) ?? [];
    list.push(geo);
    buckets.set(stone.material, list);
  }
  const centre = new THREE.Vector3();
  for (const part of mergeBuckets(buckets)) {
    part.geometry.computeBoundingBox();
    part.geometry.boundingBox?.getCenter(centre);
    part.geometry.translate(-centre.x, -centre.y, -centre.z);
    part.geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.position.copy(centre);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** The harbor, built once into the props root (built-in world only). */
export function buildWyrmwatchHarbor(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wyrmwatchHarbor';
  if (!loaded) {
    console.warn(`wyrmwatch harbor skipped: ${HARBOR_URL} was not preloaded`);
    return group;
  }
  const template = templateFor();
  const model = new THREE.Group();
  model.name = 'wyrmwatchHarborModel';
  for (const part of template.parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
  }
  model.position.set(WYRMWATCH_HARBOR_ORIGIN.x, WATER_LEVEL, WYRMWATCH_HARBOR_ORIGIN.z);
  model.userData.assetUrl = HARBOR_URL;
  group.add(model);
  group.add(buildWyrmwatchHarborPath(template, seed));
  return group;
}

/** The harbor's distinct (geometry, material) programs at the live tier, for the props
 *  material prewarm (props.ts). Empty until buildProps has built the harbor. */
export function wyrmwatchHarborPrewarmParts(): readonly HarborPart[] {
  return lastParts;
}

export const wyrmwatchHarborInternalsForTest = {
  assetUrl: HARBOR_URL,
  /** Hand a parsed GLB to the preload slot (Node tests have no fetch path). */
  setLoadedGltfForTest(gltf: GLTF | null): void {
    loaded = gltf;
    resetWyrmwatchHarborCaches();
  },
};
