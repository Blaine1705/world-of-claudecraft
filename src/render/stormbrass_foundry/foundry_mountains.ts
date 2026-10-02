// The mountains round the Stormbrass Foundry: the eroded heightfield built by
// docs/design/dungeon-rework/kit/build_stormbrass_foundry_mountains.py and
// shipped by scripts/assets/stormbrass_foundry_mountains/build.mjs as ONE mesh
// (the valley floor under the shelf, the valley walls in the cliffs' own beds,
// the ranges and the three hero peaks) with a painted albedo and an
// OBJECT-SPACE normal map of the 1 yd field (carried in the GLB's occlusion
// slot: see build.mjs), so a 6 yd mesh lights like sculpted rock.
//
// Loaded when a Foundry interior is first built (never at world entry) and
// awaited by the interior, so its one program and its buffers reach the GPU
// behind the interior's compile gate. If the file fails to load the sky keeps
// its procedural massifs (foundry_sky.ts). Cosmetic only: no light, no motion
// but the coil strike's flash (a uniform write the sky's dome hook drives).

import * as THREE from 'three';
import { loadGltf, releaseGltf } from '../assets/loader';
import { markSharedGeometry, markSharedMaterial } from '../shared_resource';

export const STORMBRASS_FOUNDRY_MOUNTAINS_URL = '/models/props/stormbrass_foundry_mountains.glb';

interface MountainParts {
  matrix: THREE.Matrix4;
  geometry: THREE.BufferGeometry;
  map: THREE.Texture | null;
  objectNormals: THREE.Texture | null;
}

let parts: MountainParts | null = null;
let loading: Promise<void> | null = null;
const materials = new Map<boolean, THREE.MeshLambertMaterial>();

/** Fetch the mountains once. Never rejects (a failed load keeps the stand-in). */
export function ensureFoundryMountains(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  loading ??= loadGltf(STORMBRASS_FOUNDRY_MOUNTAINS_URL)
    .then((gltf) => {
      gltf.scene.updateWorldMatrix(true, true);
      gltf.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || parts) return;
        const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
          | THREE.MeshStandardMaterial
          | undefined;
        // (The positions ship quantized: the node's own matrix dequantizes
        // them, so it is carried to the drawn mesh, never baked in.)
        parts = {
          matrix: mesh.matrixWorld.clone(),
          geometry: markSharedGeometry(mesh.geometry),
          map: m?.map ?? null,
          objectNormals: m?.aoMap ?? null,
        };
      });
      releaseGltf(STORMBRASS_FOUNDRY_MOUNTAINS_URL);
    })
    .catch(() => undefined);
  return loading;
}

/** Has the heightfield landed? */
export function foundryMountainsLoaded(): boolean {
  return parts !== null;
}

function mountainMaterial(lowGfx: boolean, p: MountainParts): THREE.MeshLambertMaterial {
  let m = materials.get(lowGfx);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      map: p.map,
      // The strike's flash lights the rock's own paint, not a flat grey.
      emissiveMap: p.map,
      emissive: 0x000000,
      name: 'stormbrassMountainRock',
    });
    if (!lowGfx && p.objectNormals) {
      m.normalMap = p.objectNormals;
      m.normalMapType = THREE.ObjectSpaceNormalMap;
    }
    markSharedMaterial(m);
    materials.set(lowGfx, m);
  }
  return m;
}

/** Wash the mountains in a coil strike's light (0..1). A uniform write. */
export function setFoundryMountainFlash(flash: number): void {
  const f = Math.max(0, Math.min(1, flash));
  for (const m of materials.values()) m.emissive.setRGB(0.5 * f, 0.62 * f, 0.85 * f);
}

/** The mountains' mesh (instance-local frame), or null until they have landed. */
export function buildFoundryMountainMesh(lowGfx: boolean): THREE.Mesh | null {
  if (!parts) return null;
  const mesh = new THREE.Mesh(parts.geometry, mountainMaterial(lowGfx, parts));
  mesh.name = 'stormbrassPeaks';
  mesh.applyMatrix4(parts.matrix);
  // The camera stands inside it: never culled.
  mesh.frustumCulled = false;
  return mesh;
}
