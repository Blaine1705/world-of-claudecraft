// Loader and template cache for the Ignivar raid dressing props (the baked
// ignivar_prop_*.glb set under models/dungeon). Follows the
// varkhul_grand_forge adapter shape, generalized over the whole drop: every
// prop loads once, bakes to ONE canonical shared geometry + material
// (long axis on X, seated at y 0, centred in x/z), and the dressing builder
// consumes them as clones or instanced meshes. Fail-soft: a missing model
// skips its placements instead of breaking the interior.
import * as THREE from 'three';
import { loadGltf, releaseGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import type { IgnivarEnvPropKey, IgnivarPropPlacement } from './ignivar_dressing_plan_core';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

export const IGNIVAR_ENV_PROP_URLS: Record<IgnivarEnvPropKey, string> = {
  beam: '/models/dungeon/ignivar_prop_beam.glb',
  curved_wall: '/models/dungeon/ignivar_prop_curved_wall.glb',
  firepit: '/models/dungeon/ignivar_prop_firepit.glb',
  gear_machine: '/models/dungeon/ignivar_prop_gear_machine.glb',
  vault_door: '/models/dungeon/ignivar_prop_vault_door.glb',
  gear_wall: '/models/dungeon/ignivar_prop_gear_wall.glb',
  pillar_broad: '/models/dungeon/ignivar_prop_pillar_broad.glb',
  pillar_slim: '/models/dungeon/ignivar_prop_pillar_slim.glb',
  reactor: '/models/dungeon/ignivar_prop_reactor.glb',
  gear_wall_rusty: '/models/dungeon/ignivar_prop_gear_wall_rusty.glb',
  lava_face: '/models/dungeon/ignivar_prop_lava_face.glb',
  anvil: '/models/dungeon/ignivar_prop_anvil.glb',
  forge: '/models/dungeon/ignivar_prop_forge.glb',
  chain: '/models/dungeon/ignivar_prop_chain.glb',
  chain_hanging: '/models/dungeon/ignivar_prop_chain_hanging.glb',
};

/** Props whose silhouette earns a shadow; density props (beams, chains,
 *  firepits) stay cast-free to keep the shadow pass flat. */
const SHADOW_CASTERS: ReadonlySet<IgnivarEnvPropKey> = new Set([
  'pillar_broad',
  'pillar_slim',
  'gear_machine',
  'gear_wall',
  'gear_wall_rusty',
  'curved_wall',
  'reactor',
  'vault_door',
  'lava_face',
  'forge',
  'anvil',
]);

interface IgnivarEnvPropTemplate {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const templates = new Map<IgnivarEnvPropKey, IgnivarEnvPropTemplate>();
let loadTask: Promise<void> | null = null;

/** Bake possibly-quantized attributes to plain float so the canonical
 *  transform below can write real-world coordinates (same trick as the
 *  dungeon kit's extractModule). */
function toFloatAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const itemSize = attribute.itemSize;
  const array = new Float32Array(attribute.count * itemSize);
  for (let index = 0; index < attribute.count; index++) {
    array[index * itemSize] = attribute.getX(index);
    if (itemSize > 1) array[index * itemSize + 1] = attribute.getY(index);
    if (itemSize > 2) array[index * itemSize + 2] = attribute.getZ(index);
    if (itemSize > 3) array[index * itemSize + 3] = attribute.getW(index);
  }
  return new THREE.BufferAttribute(array, itemSize);
}

function canonicalGeometry(source: THREE.Object3D): {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
} | null {
  let mesh: THREE.Mesh | null = null;
  source.updateWorldMatrix(true, true);
  source.traverse((child) => {
    if (!mesh && child instanceof THREE.Mesh) mesh = child;
  });
  if (!mesh) return null;
  const found: THREE.Mesh = mesh;
  const geometry = found.geometry.clone();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attribute = geometry.getAttribute(name);
    if (attribute) geometry.setAttribute(name, toFloatAttribute(attribute));
  }
  geometry.applyMatrix4(found.matrixWorld);
  geometry.computeBoundingBox();
  let box = geometry.boundingBox as THREE.Box3;
  const size = box.getSize(new THREE.Vector3());
  if (size.z > size.x) {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    geometry.computeBoundingBox();
    box = geometry.boundingBox as THREE.Box3;
  }
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = Array.isArray(found.material) ? found.material[0] : found.material;
  return { geometry, material };
}

const PROP_KEY_COUNT = Object.keys(IGNIVAR_ENV_PROP_URLS).length;

export function prepareIgnivarEnvProps(): Promise<void> {
  // The in-flight task must win over the fast path: templates fill one by
  // one, so a size check alone would report complete after the FIRST asset
  // and let an interior build (and cache) a partial prop set.
  if (loadTask) return loadTask;
  if (templates.size === PROP_KEY_COUNT) return Promise.resolve();
  loadTask = Promise.all(
    (Object.keys(IGNIVAR_ENV_PROP_URLS) as IgnivarEnvPropKey[]).map(async (key) => {
      const url = IGNIVAR_ENV_PROP_URLS[key];
      // Per-asset fail-soft: one missing model skips its placements and
      // never rejects the whole preparation (or wedges loadTask).
      try {
        const gltf = await loadGltf(url);
        const baked = canonicalGeometry(gltf.scene);
        if (baked) {
          templates.set(key, {
            geometry: markSharedGeometry(baked.geometry),
            material: markSharedMaterial(baked.material),
          });
        }
      } catch {
        console.warn(`ignivar env prop failed to load: ${url}`);
      } finally {
        releaseGltf(url);
      }
    }),
  ).then(() => {
    loadTask = null;
  });
  return loadTask;
}

if (typeof window !== 'undefined') {
  registerDeferredPreload(prepareIgnivarEnvProps);
}

export function resetIgnivarEnvPropCaches(): void {
  templates.clear();
  loadTask = null;
}

function propMatrix(placement: IgnivarPropPlacement): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  matrix.makeRotationY(placement.ry);
  matrix.scale(new THREE.Vector3(placement.scale, placement.scale, placement.scale));
  matrix.setPosition(placement.x, placement.y, placement.z);
  return matrix;
}

/** Append every placement to the group: one InstancedMesh per prop kind that
 *  repeats, a plain mesh for the one-offs. Missing templates skip their
 *  placements (fail-soft, same contract as the grand forge adapter). */
export function appendIgnivarEnvProps(
  group: THREE.Group,
  placements: readonly IgnivarPropPlacement[],
  lowGfx: boolean,
): number {
  const byKey = new Map<IgnivarEnvPropKey, IgnivarPropPlacement[]>();
  for (const placement of placements) {
    const list = byKey.get(placement.key);
    if (list) list.push(placement);
    else byKey.set(placement.key, [placement]);
  }
  let appended = 0;
  for (const [key, list] of byKey) {
    const template = templates.get(key);
    if (!template) {
      console.warn(`ignivar env prop template missing, skipping ${list.length}x ${key}`);
      continue;
    }
    const castShadow = !lowGfx && SHADOW_CASTERS.has(key);
    // Instance from two repeats up: the low tier drops density placements,
    // and a higher threshold would push shrunken kinds back into per-mesh
    // draws (MORE draw calls on the tier the shed exists for).
    if (list.length >= 2) {
      const instanced = new THREE.InstancedMesh(template.geometry, template.material, list.length);
      instanced.name = `ignivarEnvProp:${key}`;
      for (let index = 0; index < list.length; index++)
        instanced.setMatrixAt(index, propMatrix(list[index]));
      instanced.instanceMatrix.needsUpdate = true;
      instanced.castShadow = castShadow;
      instanced.receiveShadow = true;
      group.add(instanced);
      appended += list.length;
    } else {
      for (const placement of list) {
        const mesh = new THREE.Mesh(template.geometry, template.material);
        mesh.name = `ignivarEnvProp:${key}`;
        mesh.applyMatrix4(propMatrix(placement));
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        group.add(mesh);
        appended += 1;
      }
    }
  }
  return appended;
}

export function ignivarEnvPropTemplateCount(): number {
  return templates.size;
}

export const ignivarEnvPropsInternalsForTest = {
  urls: IGNIVAR_ENV_PROP_URLS,
  templates,
  canonicalGeometry,
  shadowCasters: SHADOW_CASTERS,
  prepare: prepareIgnivarEnvProps,
};
