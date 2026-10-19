// Hands on a handle: a two-bone reach that puts a mounted rider's hands ON the grip of a
// mount ridden astride a shaft (the Emberbristle Broom), whatever the body's proportions.
//
// The seated loop's arms are authored for a saddle or a chair and land anywhere relative
// to a broom handle, and an additive nudge lands wherever the base pose happens to put
// them (tall and short bodies differ by a forearm). So this solves it: each arm's shoulder,
// elbow and wrist are read from the posed rig, the grip point is placed in the rider's own
// frame (forward and up from the root, so it rides the hover bob with him), and the classic
// two-bone triangle (law of cosines, elbow bent toward a down-and-out pole) gives the elbow.
// Each bone is then turned so its limb points along the solved segment: a world-space
// "aim" that needs no knowledge of the rig's local bone axes, only that a joint's child
// joint lies down its limb. Blended by `k` (the ride pose's own fade).
//
// Per frame, per rider ON such a mount only; no allocation (module scratch), and only
// the arm chains' world matrices are recomputed.
import * as THREE from 'three';

export interface RideGrip {
  /** Grip centre ahead of the rider's root, in the root's local units (yards at scale 1). */
  forward: number;
  /** Grip height above the rider's root. */
  up: number;
  /** How far apart the two hands sit along the handle (the leading hand ahead). */
  stagger: number;
}

const tmpS = new THREE.Vector3();
const tmpE = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpPole = new THREE.Vector3();
const tmpElbow = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const qDelta = new THREE.Quaternion();
const qWorld = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qLocal = new THREE.Quaternion();

/** Turn `bone` (blend k) so the limb from it to `childPos` points at `target` (world). */
function aim(
  bone: THREE.Object3D,
  childPos: THREE.Vector3,
  target: THREE.Vector3,
  k: number,
): void {
  bone.getWorldPosition(tmpA);
  tmpB.subVectors(childPos, tmpA);
  const from = tmpB.lengthSq() > 1e-10 ? tmpB.normalize() : null;
  tmpA.subVectors(target, tmpA);
  if (!from || tmpA.lengthSq() < 1e-10) return;
  qDelta.setFromUnitVectors(from, tmpA.normalize());
  bone.getWorldQuaternion(qWorld);
  qWorld.premultiply(qDelta);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(qParent);
    qLocal.copy(qParent).invert().multiply(qWorld);
  } else {
    qLocal.copy(qWorld);
  }
  bone.quaternion.slerp(qLocal, k);
  bone.updateMatrixWorld(true);
}

/** Solve one arm (upper arm, forearm, hand bones) onto `target` (world). `outSign` is +1
 *  for the left arm, -1 for the right (the elbow's pole points out to that side). */
export function reachArm(
  upper: THREE.Object3D,
  fore: THREE.Object3D,
  hand: THREE.Object3D,
  target: THREE.Vector3,
  rootQuat: THREE.Quaternion,
  outSign: number,
  k: number,
): void {
  upper.getWorldPosition(tmpS);
  fore.getWorldPosition(tmpE);
  hand.getWorldPosition(tmpW);
  const l1 = tmpS.distanceTo(tmpE);
  const l2 = tmpE.distanceTo(tmpW);
  if (l1 < 1e-4 || l2 < 1e-4) return;
  tmpDir.subVectors(target, tmpS);
  const reach = Math.min(tmpDir.length(), (l1 + l2) * 0.999);
  if (reach < 1e-4) return;
  tmpDir.normalize();
  // the elbow drops down and a little out, the way hands on a stick hold it
  tmpPole.set(outSign * 0.6, -1, -0.2).applyQuaternion(rootQuat);
  tmpPole.addScaledVector(tmpDir, -tmpPole.dot(tmpDir));
  if (tmpPole.lengthSq() < 1e-8) return;
  tmpPole.normalize();
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  tmpElbow.copy(tmpS).addScaledVector(tmpDir, a).addScaledVector(tmpPole, h);
  tmpT.copy(tmpS).addScaledVector(tmpDir, reach);
  aim(upper, tmpE, tmpElbow, k);
  fore.getWorldPosition(tmpE);
  hand.getWorldPosition(tmpW);
  aim(fore, tmpW, tmpT, k);
}

const gripLocal = new THREE.Vector3();
const gripWorld = new THREE.Vector3();
const rootQ = new THREE.Quaternion();
const handleDir = new THREE.Vector3();
const shoulderAt = new THREE.Vector3();
const toShoulder = new THREE.Vector3();
const elbowAt = new THREE.Vector3();
const wristAt = new THREE.Vector3();

/** How much of a straight arm a grip may take (a hand on a stick never locks the elbow). */
export const GRIP_REACH = 0.94;

/**
 * Where along the handle a hand can close (round 10: the hands floated in front of the
 * chest on the WOC bodies, whose arms are shorter than the old rig's, because the fixed
 * grip lay out of reach and a two-bone reach toward an unreachable point stops short in
 * the air). The handle is the line `origin + t * dir` (dir a unit vector, forward along the
 * broom); `want` is the hand's authored place on it. The answer is `want` when the arm can
 * reach it; else the farthest point along the handle the arm CAN reach (so the hand stays
 * ON the handle, only nearer the rider); and when the handle passes wholly out of reach,
 * the handle point nearest the shoulder. Writes the point into `out` and returns it.
 */
export function gripAlongHandle(
  shoulder: THREE.Vector3,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  want: number,
  reach: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  toShoulder.subVectors(shoulder, origin);
  const t0 = toShoulder.dot(dir);
  const perp2 = Math.max(0, toShoulder.lengthSq() - t0 * t0);
  let t = t0;
  if (perp2 < reach * reach) {
    const span = Math.sqrt(reach * reach - perp2);
    t = Math.min(Math.max(want, t0 - span), t0 + span);
  }
  return out.copy(origin).addScaledVector(dir, t);
}

/** Both hands onto the grip: the leading (right) hand ahead, the left behind it. */
export function applyRideGrip(
  root: THREE.Object3D,
  arms: readonly [
    THREE.Object3D | null,
    THREE.Object3D | null,
    THREE.Object3D | null,
    THREE.Object3D | null,
    THREE.Object3D | null,
    THREE.Object3D | null,
  ],
  grip: RideGrip,
  k: number,
): void {
  // a rig frozen off-screen (rig_visibility_freeze.ts) stays frozen: no solve
  if (!root.matrixWorldAutoUpdate) return;
  root.updateWorldMatrix(true, false);
  root.getWorldQuaternion(rootQ);
  const [ul, fl, hl, ur, fr, hr] = arms;
  // only the two arm chains are brought current (their ancestors and the arm below),
  // never the whole rider subtree the scene pass updates anyway
  ul?.updateWorldMatrix(true, true);
  ur?.updateWorldMatrix(true, true);
  // the handle runs forward along the rider's own +Z through the grip height
  handleDir.set(0, 0, 1).applyQuaternion(rootQ).normalize();
  const scale = root.getWorldScale(gripLocal).x || 1;
  if (ul && fl && hl)
    placeHand(root, ul, fl, hl, 0.04, grip.forward - grip.stagger * 0.5, grip, scale);
  if (ul && fl && hl) reachArm(ul, fl, hl, gripWorld, rootQ, 1, k);
  if (ur && fr && hr)
    placeHand(root, ur, fr, hr, -0.04, grip.forward + grip.stagger * 0.5, grip, scale);
  if (ur && fr && hr) reachArm(ur, fr, hr, gripWorld, rootQ, -1, k);
}

/** One hand's grip on the handle, written into `gripWorld`: its authored place, pulled
 *  back along the handle when this body's arm cannot reach that far (gripAlongHandle). */
function placeHand(
  root: THREE.Object3D,
  upper: THREE.Object3D,
  fore: THREE.Object3D,
  hand: THREE.Object3D,
  side: number,
  forward: number,
  grip: RideGrip,
  scale: number,
): void {
  upper.getWorldPosition(shoulderAt);
  fore.getWorldPosition(elbowAt);
  hand.getWorldPosition(wristAt);
  const reach = (shoulderAt.distanceTo(elbowAt) + elbowAt.distanceTo(wristAt)) * GRIP_REACH;
  root.localToWorld(gripLocal.set(side, grip.up, 0));
  gripAlongHandle(shoulderAt, gripLocal, handleDir, forward * scale, reach, gripWorld);
}
