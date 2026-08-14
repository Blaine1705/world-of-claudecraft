// Lit lamps carried on a mount's own skeleton (the Lanternback Troll's pair of
// storm lanterns, hung off the iron throne he wears).
//
// The lights are parented to the SWINGING BONE, not to the mount root, so the
// flame stays inside its glass through every swing of the run cycle for free:
// the skeleton already solves that motion, and a world-space light re-aimed
// each frame would always trail it by one update. The offset down the chain
// lives in the mount's visual spec (mount_visuals.ts) in MODEL units, so the
// same numbers hold whatever height the manifest normalizes the mount to.
//
// Point lights here join the renderer's ranked budget as DYNAMIC entries: they
// move, so the budget has to re-read their world position every frame, and in
// exchange it only ever zeroes their intensity and never restores it. That is
// why `updateMountLamps` re-drives the level every frame from before the pass
// (the same contract weapon_vfx.ts lights keep).
//
// The GLASS itself is not this module's job. The lamp material in the GLB is
// named `lantern_Glow`, and buildTintedClone (characters/assets.ts) already
// pins any material whose name contains `Glow` to EMISSIVE_GLOW, the intensity
// calibrated against the bloom threshold. Re-boosting it here would fight that
// one calibration from a second place, and would not even reach: the low
// graphics tier rebuilds materials as Lambert and drops their names.

import * as THREE from 'three';
import {
  MOUNT_LAMP_COLOR,
  MOUNT_LAMP_DISTANCE,
  MOUNT_LAMP_INTENSITY,
  type MountVisualSpec,
  mountLampFlicker,
} from './mount_visuals';

export interface MountLamps {
  lights: THREE.PointLight[];
}

/**
 * Hang one point light inside each lamp on a freshly built mount visual.
 *
 * Returns null when the mount carries no lamps, or when the GLB is missing the
 * bones the spec names (a model swap that renamed a joint degrades to an unlit
 * lantern rather than throwing inside the per-frame render path).
 */
export function attachMountLamps(root: THREE.Object3D, spec: MountVisualSpec): MountLamps | null {
  if (spec.lamps.length === 0) return null;
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((object) => {
    if (!bones.has(object.name)) bones.set(object.name, object);
  });
  const lights: THREE.PointLight[] = [];
  for (const lamp of spec.lamps) {
    const bone = bones.get(lamp.bone);
    if (!bone) continue;
    const light = new THREE.PointLight(
      MOUNT_LAMP_COLOR,
      MOUNT_LAMP_INTENSITY,
      MOUNT_LAMP_DISTANCE,
      2,
    );
    light.position.set(lamp.offset[0], lamp.offset[1], lamp.offset[2]);
    // Born hidden and dark: the budget pass owns `visible` from the frame it
    // first ranks this light, and a light that counted into numPointLights
    // before it was ranked would relink every lit material in view.
    light.visible = false;
    light.intensity = 0;
    light.userData.budgetDynamic = true;
    bone.add(light);
    lights.push(light);
  }
  return lights.length > 0 ? { lights } : null;
}

/** Re-drive each lamp's flame level for this frame. Must run BEFORE the point
 *  light budget pass; the budget zeroes what it will not shine. */
export function updateMountLamps(lamps: MountLamps, timeSec: number): void {
  for (let i = 0; i < lamps.lights.length; i++) {
    lamps.lights[i].intensity = MOUNT_LAMP_INTENSITY * mountLampFlicker(timeSec, i);
  }
}

/** Detach and dispose every lamp light (mount dismissed, swapped, or culled). */
export function disposeMountLamps(lamps: MountLamps): void {
  for (const light of lamps.lights) {
    light.removeFromParent();
    light.dispose();
  }
  lamps.lights.length = 0;
}
