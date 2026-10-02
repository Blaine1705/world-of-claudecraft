// The Stormbrass Foundry's working machinery: the kit pieces that MOVE
// (foundry_kit_plan_core.ts planFoundryMovers): the crane jibs slewing over
// the yards, the engine houses' flywheels and the press's gear train turning,
// the piston rods pumping, the ladles riding the pour line out to the moulds,
// tipping and riding back. One InstancedMesh per piece and slot (the slots of
// a piece share ONE instance-matrix buffer, rewritten once per drawn frame in
// the first slot's onBeforeRender), so a machine off screen costs nothing and
// the whole yard's motion is a handful of matrix writes and one upload per
// piece. Everything here is cosmetic.

import * as THREE from 'three';
import { sharedUniforms } from '../gfx';
import { FOUNDRY_SLOTS, foundryPieceGeometry, foundryPieceMaterial } from './foundry_kit';
import {
  FOUNDRY_KIT_SIZES,
  type FoundryMover,
  jibYaw,
  ladleState,
  pistonStroke,
  planFoundryMovers,
} from './foundry_kit_plan_core';

/** How far a ladle swings over to pour (radians about its trunnions). */
export const LADLE_TIP = 1.55;

const q = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const m = new THREE.Matrix4();

/** A mover's pose at render time `t` (the painter and the pour streams
 *  share it). */
export function moverMatrix(mv: FoundryMover, t: number, out: THREE.Matrix4): THREE.Matrix4 {
  let yaw = mv.rot;
  let roll = 0;
  pos.set(mv.x, mv.y, mv.z);
  switch (mv.motion) {
    case 'spin':
      roll = mv.phase + t * mv.rate;
      break;
    case 'pump':
      pos.y += pistonStroke(t, mv.rate, mv.phase) * FOUNDRY_KIT_SIZES.pistonStroke * mv.scale;
      break;
    case 'slew':
      yaw = jibYaw(t, mv.rot, mv.rate, mv.phase, mv.amp ?? 0.9);
      break;
    case 'ladle':
    case 'trolley': {
      const s = ladleState(t, mv.phase, mv.amp ?? 0);
      pos.x = s.x;
      if (mv.motion === 'ladle') roll = s.tip * LADLE_TIP;
      break;
    }
  }
  q.setFromAxisAngle(UP, yaw);
  if (roll !== 0) q.multiply(qa.setFromAxisAngle(X, roll));
  scl.setScalar(mv.scale);
  return out.compose(pos, q, scl);
}

/** The farthest any vertex of a piece reaches from its origin. */
function reach(piece: string): number {
  let r = 0;
  const geo = foundryPieceGeometry(piece);
  for (const slot of FOUNDRY_SLOTS) {
    const g = geo[slot];
    if (!g) continue;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
  }
  return r;
}

/** Instance every mover; each piece's slots share one matrix buffer. */
export function buildFoundryMachines(
  movers: readonly FoundryMover[] = planFoundryMovers(),
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassMachines';
  const byPiece = new Map<string, FoundryMover[]>();
  for (const mv of movers) {
    const list = byPiece.get(mv.piece) ?? [];
    list.push(mv);
    byPiece.set(mv.piece, list);
  }
  for (const [piece, list] of byPiece) {
    const geo = foundryPieceGeometry(piece);
    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 16), 16);
    matrices.setUsage(THREE.DynamicDrawUsage);
    let stamp = Number.NaN;
    const pose = (): void => {
      const t = sharedUniforms.uTime.value;
      if (t === stamp) return;
      stamp = t;
      list.forEach((mv, i) => {
        moverMatrix(mv, t, m);
        m.toArray(matrices.array as Float32Array, i * 16);
      });
      matrices.needsUpdate = true;
    };
    pose();
    // A sphere over every instance's whole travel (a ladle rides the rail).
    const r = reach(piece);
    const box = new THREE.Box3();
    for (const mv of list) {
      const travel = mv.motion === 'ladle' || mv.motion === 'trolley' ? 26 : 0;
      const ext = r * mv.scale + travel;
      box.expandByPoint(new THREE.Vector3(mv.x - ext, mv.y - ext, mv.z - ext));
      box.expandByPoint(new THREE.Vector3(mv.x + ext, mv.y + ext, mv.z + ext));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    for (const slot of FOUNDRY_SLOTS) {
      const g = geo[slot];
      if (!g) continue;
      const mesh = new THREE.InstancedMesh(g, foundryPieceMaterial(piece, slot), list.length);
      mesh.name = `${piece}:${slot}:moving`;
      mesh.instanceMatrix = matrices;
      mesh.boundingSphere = sphere;
      mesh.castShadow = slot === 'metal' || slot === 'paint';
      mesh.receiveShadow = slot === 'metal' || slot === 'paint';
      // One matrix write per instance per drawn frame (the first slot drawn
      // does it for the piece; the others find the stamp current).
      mesh.onBeforeRender = pose;
      group.add(mesh);
    }
  }
  return group;
}
