import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { sceneryReduction } from './scenery_detail_core';

export const scenerySimplifierReady = MeshoptSimplifier.ready;

/** One model/level per preparation unit, never called from a distance flip.
 * Standard simplification protects UV seams. Palm crowns allow seam collapse,
 * but never use sloppy clustering, which produced detached canopy fragments. */
export function buildSceneryDetailIndex(
  geometry: THREE.BufferGeometry,
  level: number,
  palm: boolean,
): THREE.BufferAttribute {
  const position = geometry.getAttribute('position');
  const base = geometry.index
    ? Uint32Array.from(geometry.index.array)
    : Uint32Array.from({ length: position.count }, (_, i) => i);
  const policy = sceneryReduction(level, base.length / 3, palm);
  if (policy.triangles * 3 >= base.length) return new THREE.BufferAttribute(base, 1);
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  const [indices] = MeshoptSimplifier.simplify(
    base,
    positions,
    3,
    policy.triangles * 3,
    policy.error,
    palm ? ['Permissive'] : [],
  );
  return new THREE.BufferAttribute(indices.length ? indices : base, 1);
}
