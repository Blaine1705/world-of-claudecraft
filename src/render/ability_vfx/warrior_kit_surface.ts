import * as THREE from 'three';
import { GFX } from '../gfx';

export type WarriorKitSurface = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

/** The Warrior kit's lit surface in the tier's material family: MeshStandard
 *  where the tier draws standard materials, Lambert where the rest of the tier
 *  does (Low, the iOS memory profile). MeshStandard scales its diffuse by
 *  (1 - metalness), so the Lambert base colour takes the same factor: the
 *  diffuse term matches and only the specular highlight goes. */
export function warriorKitSurface(
  name: string,
  options: THREE.MeshStandardMaterialParameters,
): WarriorKitSurface {
  if (GFX.standardMaterials) return new THREE.MeshStandardMaterial({ ...options, name });
  const { roughness: _roughness, metalness, ...lambert } = options;
  const material = new THREE.MeshLambertMaterial({ ...lambert, name });
  material.color.multiplyScalar(1 - (metalness ?? 0));
  return material;
}
