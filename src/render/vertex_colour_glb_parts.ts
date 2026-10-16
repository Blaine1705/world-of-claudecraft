// The shared plumbing of the Blender-built, vertex-coloured props (the harbor route
// markers, harbor_route_markers.ts, and the Wyrmwatch cliff harbor, wyrmwatch_harbor.ts):
// convert a GLB material into the surface family's vertex-coloured standard/lambert
// material (a "glow" material becomes the warm lantern emissive), read one mesh's
// geometry dequantized into a chosen frame, and merge the collected geometries into one
// mesh part per material. Extracted at the second vertex-coloured prop (the rule of
// three: the ship's converter, transport_ship.ts, buckets by attribute layout too).
// Nothing here runs per frame; callers build templates at world build.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dequantizeAttribute } from './characters/dequantize_attribute';
import { GFX, surfaceMat } from './gfx';

/** One merged mesh part: its geometry and the converted material it draws with. */
export interface VertexColourPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** A material converter with its own cache (cleared on a graphics-profile rebuild). */
export interface VertexColourMaterialConverter {
  convert(source: THREE.Material): THREE.Material;
  clear(): void;
}

/** Warm lantern panes and windows: the ferry's own glow (transport_ship.ts). */
export const VERTEX_COLOUR_GLOW_EMISSIVE = 0xff9a3c;

/** The factor a GLB material's vertex colours are multiplied back by: a painted material stores
 *  them under a headroom (so baked light can lift the paint above its map) and names the
 *  factor in its extras, which three's loader hands over as `userData`; 1 otherwise. */
export function vertexColourScaleOf(source: THREE.Material): number {
  const scale = (source.userData as { vertexColourScale?: unknown }).vertexColourScale;
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function vertexColourMaterialConverter(): VertexColourMaterialConverter {
  const cache = new Map<string, THREE.Material>();
  return {
    convert(source: THREE.Material): THREE.Material {
      const std = source as THREE.MeshStandardMaterial;
      const glow = /glow/i.test(source.name);
      const key = `${source.name}|${GFX.standardMaterials ? 's' : 'l'}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const mat = surfaceMat({
        color: 0xffffff,
        vertexColors: true,
        roughness: std.roughness ?? 0.85,
        metalness: std.metalness ?? 0,
        emissive: glow ? VERTEX_COLOUR_GLOW_EMISSIVE : 0x000000,
        emissiveIntensity: glow ? (GFX.standardMaterials ? 1.9 : 1.0) : 1,
      });
      cache.set(key, mat);
      return mat;
    },
    clear(): void {
      cache.clear();
    },
  };
}

/** A mesh's position, normal and colour (dequantized) and its index, mapped by `frame`. */
export function vertexColourMeshGeometry(
  mesh: THREE.Mesh,
  frame: THREE.Matrix4,
): THREE.BufferGeometry {
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

/** File a geometry under its material. */
export function addToBucket(
  buckets: Map<THREE.Material, THREE.BufferGeometry[]>,
  material: THREE.Material,
  geometry: THREE.BufferGeometry,
): void {
  const list = buckets.get(material);
  if (list) list.push(geometry);
  else buckets.set(material, [geometry]);
}

/** One merged part per material (the merged-away sources are disposed). */
export function mergeVertexColourBuckets(
  buckets: Map<THREE.Material, THREE.BufferGeometry[]>,
): VertexColourPart[] {
  const parts: VertexColourPart[] = [];
  for (const [material, geos] of buckets) {
    const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geometry) continue;
    for (const g of geos) if (g !== geometry) g.dispose();
    geometry.computeBoundingSphere();
    parts.push({ geometry, material });
  }
  return parts;
}

/** Set on a material whose colour already carries its factor (a clone carries it too). */
const VERTEX_COLOUR_SCALED = 'vertexColourScaleApplied';

/**
 * The painted materials of a parsed GLB that draws with its OWN materials (the Highwatch manor,
 * a placed town building: the town view clones them per building, eastbrook_placed_building.ts,
 * and an authored map draws them as they are) brought back above their headroom: each material
 * whose extras name a `vertexColourScale` has its colour (the glTF base colour factor)
 * multiplied by it, once however many meshes share it, and is marked so it never is again.
 * Runs in the loader's parse chain (assets/loader.ts) before any consumer sees the scene; a
 * converter that builds fresh materials reads the factor itself (vertexColourScaleOf). A GLB
 * with no such extras is untouched. Returns the number of materials scaled.
 */
export function applyVertexColourScale(root: THREE.Object3D): number {
  // a loader stub in a test may hand over a scene with no graph at all
  if (typeof root?.traverse !== 'function') return 0;
  let scaled = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = material as THREE.MeshStandardMaterial | undefined;
      if (!mat?.color || mat.userData[VERTEX_COLOUR_SCALED]) continue;
      const scale = vertexColourScaleOf(mat);
      if (scale === 1) continue;
      mat.color.multiplyScalar(scale);
      mat.userData[VERTEX_COLOUR_SCALED] = true;
      scaled++;
    }
  });
  return scaled;
}
