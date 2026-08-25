import * as THREE from 'three';
import type { WallSeg } from '../sim/rift/authored';
import { surfaceMat } from './gfx';
import { cloneMaterialWithHooks } from './material_clone_hooks';
import { markSharedGeometry } from './shared_resource';

export const IGNIVAR_RAID_WALL_TINT = 0x68473c;
export const IGNIVAR_RAID_FLOOR_TINT = 0x8d756a;

export interface IgnivarRaidWallFacade {
  group: THREE.Group;
  fadeMaterials: THREE.Material[];
}

let facadeBoxGeometry: THREE.BoxGeometry | null = null;

function matrixFor(
  segment: WallSeg,
  along: number,
  y: number,
  alongSize: number,
  height: number,
  depth: number,
): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const position =
    segment.axis === 'x'
      ? new THREE.Vector3(along, y, segment.fixed)
      : new THREE.Vector3(segment.fixed, y, along);
  const scale =
    segment.axis === 'x'
      ? new THREE.Vector3(alongSize, height, depth)
      : new THREE.Vector3(depth, height, alongSize);
  return matrix.compose(position, new THREE.Quaternion(), scale);
}

function instanced(
  name: string,
  material: THREE.Material,
  matrices: readonly THREE.Matrix4[],
): THREE.InstancedMesh {
  facadeBoxGeometry ??= markSharedGeometry(new THREE.BoxGeometry(1, 1, 1));
  const mesh = new THREE.InstancedMesh(facadeBoxGeometry, material, matrices.length);
  mesh.name = name;
  for (let index = 0; index < matrices.length; index++) mesh.setMatrixAt(index, matrices[index]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Add industrial ironwork inside one authored wall footprint. The returned
 * materials are unique to this wall run because its camera fade is independent
 * from every neighboring run. Geometry stays shared and the whole facade uses
 * two instanced batches regardless of run length.
 */
export function buildIgnivarRaidWallFacade(
  segment: WallSeg,
  lowGfx: boolean,
): IgnivarRaidWallFacade {
  const length = Math.max(0.4, segment.b - segment.a);
  const center = (segment.a + segment.b) * 0.5;
  const ironMaterial = cloneMaterialWithHooks(
    surfaceMat({ color: 0x211d1c, metalness: 0.86, roughness: 0.66 }),
  );
  const emberMaterial = cloneMaterialWithHooks(
    surfaceMat({
      color: 0x35150b,
      emissive: 0xff7a24,
      emissiveIntensity: lowGfx ? 0.14 : 0.32,
      metalness: 0.18,
      roughness: 0.7,
    }),
  );

  const ironMatrices: THREE.Matrix4[] = [
    matrixFor(segment, center, 0.42, length, 0.84, 1.46),
    matrixFor(segment, center, 6.55, length, 0.42, 1.42),
  ];
  const braceCount = Math.max(2, Math.floor(length / 8) + 1);
  for (let index = 0; index < braceCount; index++) {
    const t = braceCount === 1 ? 0.5 : index / (braceCount - 1);
    const along = segment.a + 0.35 + (length - 0.7) * t;
    ironMatrices.push(matrixFor(segment, along, 3.7, 0.42, 6.6, 1.52));
  }

  const emberMatrices = [
    matrixFor(segment, center, 2.08, length, 0.075, 1.54),
    matrixFor(segment, center, 5.72, length, 0.06, 1.54),
  ];
  const group = new THREE.Group();
  group.name = 'ignivarWallFacade';
  group.userData.wallSegment = { ...segment };
  group.userData.renderCategory = 'dungeon';
  group.userData.collision = 'none';
  group.add(
    instanced('ignivarWallIronwork', ironMaterial, ironMatrices),
    instanced('ignivarWallEmberSeams', emberMaterial, emberMatrices),
  );
  return { group, fadeMaterials: [ironMaterial, emberMaterial] };
}

export function resetIgnivarRaidWallFacadeResourcesForTest(): void {
  facadeBoxGeometry = null;
}
