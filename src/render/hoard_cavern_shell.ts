import * as THREE from 'three';
import { buildHoardCavernShellPlan } from './hoard_cavern_core';
import type { HoardValleyLayoutInput, HoardValleyPlan } from './hoard_valley_core';
import { markSharedGeometry } from './shared_resource';

let cliff: THREE.BufferGeometry | undefined;
let root: THREE.BufferGeometry | undefined;

/** Angular, stratified rock shared by walls and broken ceiling slabs. */
export function hoardCavernRockGeometry(): THREE.BufferGeometry {
  if (cliff) return cliff;
  const geometry = new THREE.CylinderGeometry(0.82, 1, 2, 7, 4).toNonIndexed();
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    const layer = 1 + Math.sin(y * 9 + 1.2) * 0.1;
    vertices.setXYZ(i, x * layer + y * 0.11, y, z * layer);
  }
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(vertices.count * 3);
  for (let i = 0; i < vertices.count; i++) {
    const shade = 0.62 + Math.max(0, normals.getY(i)) * 0.23 + normals.getX(i) * 0.07;
    colors.set([shade, shade, shade], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  cliff = markSharedGeometry(geometry);
  return cliff;
}

/** All producers are descendants of the valley's preparation-gated scene group. */
export function buildHoardCavernShell(
  layout: HoardValleyLayoutInput,
  plan: HoardValleyPlan,
  material: THREE.Material,
  shadows: boolean,
): THREE.Group {
  const shell = buildHoardCavernShellPlan(layout, plan);
  const group = new THREE.Group();
  group.name = 'HoardCavernBrokenRoof';
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  for (const [name, placements] of [
    ['HoardCavernCornice', shell.ledges],
    ['HoardCavernEntryRoof', shell.entryRoof],
  ] as const) {
    const ledges = new THREE.InstancedMesh(hoardCavernRockGeometry(), material, placements.length);
    ledges.name = name;
    placements.forEach((ledge, i) => {
      transform.position.set(ledge.x, ledge.y, ledge.z);
      transform.rotation.set(0, ledge.yaw, 0.035 * Math.sin(i));
      transform.scale.set(ledge.scaleX, ledge.scaleY, ledge.scaleZ);
      transform.updateMatrix();
      ledges.setMatrixAt(i, transform.matrix);
      ledges.setColorAt(i, color.setHex(ledge.color));
    });
    ledges.instanceMatrix.needsUpdate = true;
    if (ledges.instanceColor) ledges.instanceColor.needsUpdate = true;
    ledges.castShadow = shadows;
    ledges.computeBoundingSphere();
    ledges.computeBoundingBox();
    group.add(ledges);
  }
  if (!root) {
    root = markSharedGeometry(new THREE.CylinderGeometry(0.45, 1, 1, 5));
    const colors = new Float32Array(root.getAttribute('position').count * 3).fill(0.8);
    root.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const roots = new THREE.InstancedMesh(root, material, shell.roots.length);
  roots.name = 'HoardCavernHangingRoots';
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  shell.roots.forEach((strand, i) => {
    start.fromArray(strand.start);
    end.fromArray(strand.end);
    direction.subVectors(start, end);
    transform.position.copy(start).add(end).multiplyScalar(0.5);
    transform.quaternion.setFromUnitVectors(up, direction.clone().normalize());
    transform.scale.set(strand.radius, direction.length(), strand.radius);
    transform.updateMatrix();
    roots.setMatrixAt(i, transform.matrix);
    roots.setColorAt(i, color.setHex(plan.zone.trunk));
  });
  for (const mesh of [roots]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    group.add(mesh);
  }
  return group;
}
