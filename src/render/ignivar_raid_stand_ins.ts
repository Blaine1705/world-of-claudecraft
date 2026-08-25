import * as THREE from 'three';
import type { AuthoredDecor } from '../sim/dungeon_layout';
import { surfaceMat } from './gfx';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

export const IGNIVAR_RAID_STAND_INS_NAME = 'ignivarRaidLoadingFootprints';

export interface IgnivarRaidStandIns {
  group: THREE.Group;
  mesh: THREE.InstancedMesh;
  entries: AuthoredDecor[];
}

let footprintGeometry: THREE.CylinderGeometry | null = null;
let footprintMaterial: THREE.Material | null = null;

function ensureFootprintResources(): {
  geometry: THREE.CylinderGeometry;
  material: THREE.Material;
} {
  footprintGeometry ??= markSharedGeometry(new THREE.CylinderGeometry(1, 1, 0.16, 12));
  footprintMaterial ??= markSharedMaterial(
    surfaceMat({
      color: 0x211c1a,
      metalness: 0.82,
      roughness: 0.7,
    }),
  );
  return { geometry: footprintGeometry, material: footprintMaterial };
}

function writeFootprintMatrix(
  mesh: THREE.InstancedMesh,
  index: number,
  entry: AuthoredDecor,
  object: THREE.Object3D,
): void {
  const radius = entry.r ?? 0;
  object.position.set(entry.x, 0.08, entry.z);
  object.rotation.set(0, entry.yaw, 0);
  object.scale.set(radius, 1, radius);
  object.updateMatrix();
  mesh.setMatrixAt(index, object.matrix);
}

/**
 * Build the low iron footprints shown while the authored decor GLBs stream.
 * These are visual loading stand-ins only. Collision remains owned by the
 * authored layout in sim and never depends on this render group.
 */
export function buildIgnivarRaidStandIns(
  decor: readonly AuthoredDecor[],
): IgnivarRaidStandIns | null {
  const entries = decor.filter((entry) => entry.r !== undefined);
  if (entries.length === 0) return null;

  const { geometry, material } = ensureFootprintResources();
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  mesh.name = IGNIVAR_RAID_STAND_INS_NAME;
  mesh.receiveShadow = true;
  const object = new THREE.Object3D();
  for (let index = 0; index < entries.length; index++) {
    writeFootprintMatrix(mesh, index, entries[index], object);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();

  const group = new THREE.Group();
  group.name = `${IGNIVAR_RAID_STAND_INS_NAME}Group`;
  group.userData.renderCategory = 'dungeon';
  group.userData.collision = 'sim-authored';
  group.userData.loadingFallback = true;
  group.add(mesh);
  return { group, mesh, entries };
}

/**
 * Remove footprints whose detailed prop rendered successfully and compact any
 * failed entries into the same one-draw fallback mesh. When every model loaded,
 * the temporary group leaves the scene completely so model and stand-in can
 * never occupy the same footprint after reveal.
 */
export function settleIgnivarRaidStandIns(
  standIns: IgnivarRaidStandIns,
  detailedModelAvailable: (entry: AuthoredDecor) => boolean,
): number {
  const unresolved = standIns.entries.filter((entry) => !detailedModelAvailable(entry));
  if (unresolved.length === 0) {
    standIns.group.parent?.remove(standIns.group);
    standIns.mesh.count = 0;
    return 0;
  }

  const object = new THREE.Object3D();
  for (let index = 0; index < unresolved.length; index++) {
    writeFootprintMatrix(standIns.mesh, index, unresolved[index], object);
  }
  standIns.mesh.count = unresolved.length;
  standIns.mesh.instanceMatrix.needsUpdate = true;
  standIns.mesh.computeBoundingSphere();
  return unresolved.length;
}

export function resetIgnivarRaidStandInResourcesForTest(): void {
  footprintGeometry = null;
  footprintMaterial = null;
}
