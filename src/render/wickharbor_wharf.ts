// The Wickharbor ferry wharf on screen: the one Blender-authored model
// (public/models/props/wickharbor_wharf.glb, scripts/assets/wickharbor_wharf/) placed on the
// waterline at the wharf origin (sim/content/wickharbor_wharf.ts). Its plank field is the
// surface the sim walks (ferry_piers.ts), laid once: the old crossing decks it replaced are
// gone from the plank builder's list (sim/gale_harbor.ts), so nothing draws a second floor
// in its plane.
//
// Which parts a graphics tier keeps is the pure core's call (wickharbor_wharf_core.ts): the
// walkable structure, rails, lanterns and cargo on every tier; the iron trim from medium, the
// loose dressing from high. The tier is the static effects tier (GFX.effectsTier), never the
// frame-rate governor, and a graphics-profile change rebuilds the props (the resetter below,
// registered in assets/graphics_profile.ts).
//
// GPU work: the wharf is built into the props root at world build (props.ts), so the
// world-entry compile links it with the rest of the props, and its distinct (geometry,
// material) programs join the props material prewarm (wickharborWharfPrewarmParts), so a
// wharf first seen after the curtain links nothing in a live frame. The materials are the
// surface family's vertex-coloured standard/lambert (vertex_colour_glb_parts.ts, shared with
// the route markers and the Wyrmwatch harbor: the same programs). Nothing here runs per frame.

import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WICKHARBOR_WHARF_ORIGIN } from '../sim/content/wickharbor_wharf';
import { WATER_LEVEL } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import { GFX } from './gfx';
import {
  addToBucket,
  mergeVertexColourBuckets,
  type VertexColourPart,
  vertexColourMaterialConverter,
  vertexColourMeshGeometry,
} from './vertex_colour_glb_parts';
import { wickharborWharfParts } from './wickharbor_wharf_core';

const WHARF_URL = '/models/props/wickharbor_wharf.glb';

let loaded: GLTF | null = null;
let loadTask: Promise<void> | null = null;

export function prepareWickharborWharfAssets(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadTask) return loadTask;
  loadTask = loadGltf(WHARF_URL)
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

if (typeof window !== 'undefined') registerDeferredPreload(prepareWickharborWharfAssets);

/** Kept parts merged into one geometry per material, in the model's frame, by
 *  `effectsTier|standard`: a preset change converts anew. */
const templates = new Map<string, VertexColourPart[]>();
let lastParts: VertexColourPart[] = [];
const materials = vertexColourMaterialConverter();

/** Drop the prepared templates (graphics-profile rebuilds convert materials anew; the parsed
 *  source survives). Registered in assets/graphics_profile.ts. */
export function resetWickharborWharfCaches(): void {
  templates.clear();
  materials.clear();
  lastParts = [];
}

function buildTemplate(gltf: GLTF, keep: readonly string[]): VertexColourPart[] {
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
      addToBucket(
        buckets,
        materials.convert(mesh.material as THREE.Material),
        vertexColourMeshGeometry(mesh, frame),
      );
    });
  }
  return mergeVertexColourBuckets(buckets);
}

function templateFor(): VertexColourPart[] {
  const key = `${GFX.effectsTier}|${GFX.standardMaterials ? 's' : 'l'}`;
  let template = templates.get(key);
  if (!template) {
    if (!loaded) throw new Error(`wickharbor wharf model was not preloaded: ${WHARF_URL}`);
    template = buildTemplate(loaded, wickharborWharfParts(GFX.effectsTier));
    templates.set(key, template);
  }
  lastParts = template;
  return template;
}

/** The wharf, built once into the props root (built-in world only). */
export function buildWickharborWharf(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wickharborWharf';
  if (!loaded) {
    console.warn(`wickharbor wharf skipped: ${WHARF_URL} was not preloaded`);
    return group;
  }
  const model = new THREE.Group();
  model.name = 'wickharborWharfModel';
  for (const part of templateFor()) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
  }
  model.position.set(WICKHARBOR_WHARF_ORIGIN.x, WATER_LEVEL, WICKHARBOR_WHARF_ORIGIN.z);
  model.userData.assetUrl = WHARF_URL;
  group.add(model);
  return group;
}

/** The wharf's distinct (geometry, material) programs at the live tier, for the props
 *  material prewarm (props.ts). Empty until buildProps has built the wharf. */
export function wickharborWharfPrewarmParts(): readonly VertexColourPart[] {
  return lastParts;
}

export const wickharborWharfInternalsForTest = {
  assetUrl: WHARF_URL,
  /** Hand a parsed GLB to the preload slot (Node tests have no fetch path). */
  setLoadedGltfForTest(gltf: GLTF | null): void {
    loaded = gltf;
    resetWickharborWharfCaches();
  },
};
