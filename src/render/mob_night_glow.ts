// A faint warm pool of light on the ground under every nearby character after
// dark, so a mob standing in an unlit field still reads as a body rather than as
// a patch of shadow. Deliberately NOT an outline or a highlight: it is the light
// the world is missing at night, put back under the thing you need to see.
//
// One pooled InstancedMesh for the whole scene (one additive draw), filled from
// the renderer's existing entity loop through begin/add/end. The per-frame path
// allocates nothing: matrices, colors, and the scratch transform are owned once
// here, and `add` past the pool cap simply drops the extra disc, which is the
// crowd-safe failure mode (the discs are cosmetic; nameplates, health bars, and
// the rigs themselves are untouched).
//
// This is a NIGHT VISIBILITY layer, so it runs identically on every graphics
// tier: no tier scaling, no tier gate. It is driven purely by the frame's night
// amount (night_lighting_core.ts), which is already 0 on the one tier whose
// world never darkens.
import * as THREE from 'three';
import { MOB_GLOW_POOL } from './night_lighting_core';
import { radialGlowTexture } from './textures';

/** World yards of the unit disc; `add` scales this by the body's radius. */
const DISC_RADIUS = 1.0;
/**
 * Default disc radius in world yards for a scale-1 body: wide enough to light
 * the ground a body stands on, tight enough that a pack of mobs does not merge
 * into one lit blob. Callers multiply by the entity's own scale.
 */
export const MOB_GLOW_DISC_RADIUS = 1.45;
const DISC_SEGMENTS = 14;
/** Above the ground sample, matching the selection ring's drape lift. */
const LIFT = 0.09;
// A pale warm rather than a saturated orange: a saturated pool reads as a
// spotlight (or as ground on fire) instead of as the light night took away.
const GLOW_COLOR = 0xffc894;
/** Opacity at full strength. Low on purpose: a hint of warmth, not a spotlight. */
const MAX_OPACITY = 0.32;

export interface MobNightGlowView {
  group: THREE.Group;
  /**
   * Open the frame. `strength` is the frame's glow amount (0 hides the whole
   * layer and makes `add` a no-op). Returns true when the caller should bother
   * emitting discs at all.
   */
  begin(strength: number): boolean;
  /**
   * Emit one character's disc. `feetY` is the body's DRAWN feet height (the
   * entity view's own y), not a fresh terrain sample: that is what keeps a pool
   * flush with a body standing on a dock, a bridge, or a step the smoother is
   * still easing, and it costs nothing. The tradeoff is that a jumping body
   * carries its pool for the arc, which reads as carried light rather than as a
   * fault. `radius` scales the disc to the body; `strength` is that character's
   * own distance-faded amount from mobGlowStrength.
   */
  add(x: number, feetY: number, z: number, radius: number, strength: number): void;
  /** Close the frame: commit the instance count and the upload. */
  end(): void;
}

export function buildMobNightGlow(): MobNightGlowView {
  const group = new THREE.Group();
  group.name = 'mob-night-glow';
  group.visible = false;

  const geometry = new THREE.CircleGeometry(DISC_RADIUS, DISC_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    map: radialGlowTexture(),
    color: GLOW_COLOR,
    transparent: true,
    opacity: MAX_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, MOB_GLOW_POOL);
  // Instances are rewritten every frame from anywhere in the draw band, so a
  // baked bounding sphere is stale the moment it is computed.
  mesh.frustumCulled = false;
  mesh.renderOrder = 1; // over the ground, under the world's own decals
  mesh.count = 0;
  // Seed every matrix once so an unwritten slot can never inherit a factory
  // zero and collapse a disc onto the world origin.
  const identity = new THREE.Matrix4();
  for (let i = 0; i < MOB_GLOW_POOL; i++) mesh.setMatrixAt(i, identity);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MOB_GLOW_POOL * 3), 3);
  group.add(mesh);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const tint = new THREE.Color();
  const base = new THREE.Color(GLOW_COLOR);
  let count = 0;
  let open = false;

  return {
    group,
    begin(strength: number): boolean {
      count = 0;
      open = strength > 0.001;
      group.visible = open;
      return open;
    },
    add(x: number, feetY: number, z: number, radius: number, strength: number): void {
      if (!open || count >= MOB_GLOW_POOL || strength <= 0.001) return;
      position.set(x, feetY + LIFT, z);
      scale.set(radius, 1, radius);
      mesh.setMatrixAt(count, matrix.compose(position, quaternion, scale));
      // Per-instance strength rides the instance color rather than the shared
      // opacity, so one draw can hold discs at different distances.
      tint.copy(base).multiplyScalar(strength);
      mesh.setColorAt(count, tint);
      count++;
    },
    end(): void {
      mesh.count = count;
      if (!open) return;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
