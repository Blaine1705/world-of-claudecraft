// The colour pass may simplify scenery; its original shadow remains intact.
// Three reads the geometry index / instance count after onBeforeShadow and
// restores colour state through onAfterShadow. No material or light changes.
import type * as THREE from 'three';

export function preserveSceneryShadow(
  mesh: THREE.Mesh,
  source: THREE.BufferGeometry,
  count: number,
): () => void {
  const before = mesh.onBeforeShadow;
  const after = mesh.onAfterShadow;
  let previousCount = 0;
  let previousIndex: THREE.BufferAttribute | null = null;
  mesh.onBeforeShadow = function (...args): void {
    before.apply(this, args);
    const geometry = args[4];
    previousIndex = geometry.index;
    geometry.index = source.index;
    const instanced = this as THREE.InstancedMesh;
    if (instanced.isInstancedMesh) {
      previousCount = instanced.count;
      instanced.count = count;
    }
  };
  mesh.onAfterShadow = function (...args): void {
    args[4].index = previousIndex;
    const instanced = this as THREE.InstancedMesh;
    if (instanced.isInstancedMesh) instanced.count = previousCount;
    after.apply(this, args);
  };
  return () => {
    mesh.onBeforeShadow = before;
    mesh.onAfterShadow = after;
  };
}
