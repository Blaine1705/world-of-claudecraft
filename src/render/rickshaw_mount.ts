// The Bonebound Rickshaw is the one mount that composes a SECOND character
// visual: the cart (mount_rickshaw_mount, a static image-to-glb prop) carries
// no puller geometry of its own, so a full character rig is loaded separately
// and parented under the cart's own CharacterVisual root. Every other mount is
// a single self-contained GLB, so this stays a bespoke adapter rather than a
// generic mount hook (see src/render/CLAUDE.md, "New visual system"). The puller
// runs a real gait: renderer.ts feeds it the same locomotion state the cart's own
// visual gets, so it walks and runs with the rider rather than idling in place.
//
// The puller is skel_rickshaw_puller: a real skeleton grunt, not the
// player_warrior stand-in an earlier pass here used. It rides its own rebuilt
// rig, skeleton_minion_free.glb (scripts/assets/rebuild_kaykit_skeletons_free.mjs,
// built from the KayKit_Skeletons_1.1_FREE pack), instead of the shared
// skeleton_minion.glb every other skel_minion consumer still uses: this is a
// SEPARATE key in manifest.ts (skel_rickshaw_puller), not a repoint of
// skel_minion itself, so nothing else in the game changes. See
// manifest.ts's RICKSHAW_PULLER_CLIPS comment for the full reasoning.
//
// The puller attaches by a HARDCODED offset, not a GLB node lookup: the
// authoring pipeline (scripts/assets/rickshaw_mount/model.js) places a
// Socket_Puller marker for preview purposes, but build_assets.mjs's prune
// pass drops empty non-mesh nodes, so it never survives into the shipped
// GLB. The offset below is that same authored value (RICKSHAW_SOCKET_DEFINITIONS
// 'puller': local [0, 0, 0.55]) at RICKSHAW_SCALE (2.0): world (0, 0, 1.1).
// Both this mount's root AND the puller's own CharacterVisual root are
// floor-pivoted, unscaled conventions (see visual.ts, "pivot at feet, faces
// +Z"), so parenting at that outer level needs no further scale correction:
// the puller's own normalization already sizes it to its authored height.

import * as THREE from 'three';
import { CharacterVisual } from './characters';
import { mountAssetsReady, preloadMountAssets } from './characters/assets';

export const RICKSHAW_MOUNT_VISUAL_KEY = 'mount_rickshaw_mount';
export const RICKSHAW_PULLER_VISUAL_KEY = 'skel_rickshaw_puller';
// scripts/assets/rickshaw_mount/model.js's SHAFT_TIP_Y/Z/SIDE_X are measured
// against this exact offset; change them together. 2026-08-08: moved 1.4 ->
// 1.8 (world units) alongside that file's SHAFT_TIP_Z extending 0.743 ->
// 0.943 local: a live look with the real skel_rickshaw_puller flagged the
// poles as too short and the puller standing too close to the rider.
const RICKSHAW_PULLER_OFFSET_Z = 1.8;
// 2026-08-08: a live look flagged the puller as standing too low. Both this
// mount's root and the puller's own CharacterVisual root are floor-pivoted
// (see the module header), so this is a deliberate small lift off the true
// floor-seated height, not a correction to it.
const RICKSHAW_PULLER_OFFSET_Y = 0.12;

export function rickshawPullerAssetsReady(): boolean {
  return mountAssetsReady(RICKSHAW_PULLER_VISUAL_KEY);
}

export function preloadRickshawPullerAssets(): Promise<void> {
  return preloadMountAssets(RICKSHAW_PULLER_VISUAL_KEY);
}

/** The cart's puller. */
export function createRickshawPullerVisual(): CharacterVisual {
  return new CharacterVisual(RICKSHAW_PULLER_VISUAL_KEY, 0xffffff, 0, null, null);
}

/** Parents the puller directly under the cart's CharacterVisual root, so it
 *  inherits the cart's transform (position, procedural bob, visibility) for
 *  free. See the module header for why this is a fixed offset rather than a
 *  lookup into the cart's own GLB. */
export function attachRickshawPuller(cartRoot: THREE.Object3D, puller: CharacterVisual): void {
  puller.root.position.set(0, RICKSHAW_PULLER_OFFSET_Y, RICKSHAW_PULLER_OFFSET_Z);
  cartRoot.add(puller.root);
}

/** Node names a rolling mount exposes for procedural wheel spin (currently only
 *  the Bonebound Rickshaw; scripts/assets/rickshaw_mount/model.js WHEEL_NODES). */
const ROLLING_WHEEL_NODES = ['Wheel_L', 'Wheel_R'] as const;
/** u/s below which a rolling mount's wheels are treated as stopped. */
const WHEEL_SPIN_DEADZONE = 0.05;
const wheelBoundsScratch = new THREE.Box3();

/** The subset of an EntityView's mount-wheel fields spinMountWheels reads and
 *  writes: a caller-owned cache so the lookup runs once per built model. */
export interface WheelSpinView {
  mountVisual: CharacterVisual | null;
  mountWheels?: THREE.Object3D[] | null;
  mountWheelRadius?: number;
}

/**
 * Roll a mount's wheels from its ground speed.
 *
 * Deliberately NOT baked animation clips, which is where this started. A clip
 * cannot express "hold exactly where you are" on stop: the mixer fills any
 * weight deficit from an action's cached original value, so crossfading a spin
 * clip out drags the wheel back toward its bind rotation: visible backwards
 * spin every time the player stops. Angle is a pure function of distance
 * travelled anyway (theta += v*dt/r), so integrating it here tracks input
 * exactly, stops dead the frame speed hits zero, and needs no reference speeds.
 *
 * Costs two quaternion writes per frame per rolling mount, and nothing at all
 * for every other mount (the lookup result is cached, including its absence).
 */
export function spinMountWheels(
  v: WheelSpinView,
  speed: number,
  backwards: boolean,
  dt: number,
): void {
  const root = v.mountVisual?.root;
  if (!root) return;
  if (v.mountWheels === undefined) {
    const found = ROLLING_WHEEL_NODES.map((name) => root.getObjectByName(name)).filter(
      (node): node is THREE.Object3D => !!node,
    );
    v.mountWheels = found.length ? found : null;
    if (found.length) {
      // Measure the radius off the built model instead of hardcoding it: the
      // export pipeline rewrites node scale and translation during
      // quantization, so any authored number would be a second source of truth
      // that silently drifts. Half the wheel's world height IS the radius.
      wheelBoundsScratch.setFromObject(found[0]);
      v.mountWheelRadius = (wheelBoundsScratch.max.y - wheelBoundsScratch.min.y) / 2;
    }
  }
  const wheels = v.mountWheels;
  const radius = v.mountWheelRadius;
  if (!wheels || !radius) return;
  // Deadzone rather than `> 0`: network extrapolation and float noise leave a
  // few thousandths of a unit of jitter on a parked cart, which reads as the
  // wheels never quite settling. Well under a walking pace, so a real crawl
  // still rolls.
  if (speed <= WHEEL_SPIN_DEADZONE) return;
  // +X is the axle; a POSITIVE angle carries the top of the wheel toward +Z,
  // which is the cart's own frontAxis.
  const delta = ((backwards ? -speed : speed) * dt) / radius;
  for (const wheel of wheels) wheel.rotateX(delta);
}
