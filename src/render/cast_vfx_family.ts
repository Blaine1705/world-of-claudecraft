// The cast gate's ENGINE family: the pooled programs the ability-VFX painter
// draws for every class (the AbilityVfxFx engine pools and the Vfx particle
// cloud its bursts ride). The gate (cast_vfx_prewarm.ts) waits on these
// programs only. Every other 'vfx' drawable (the bespoke class pools, the
// lazy spell stand-ins, the generic basics, the Warrior kit's upgrade layer)
// keeps its compile unit in the same warm-up, but never holds a cast: none of
// them is drawn behind the gate, so waiting on them delayed every cast and
// protected nothing.
//
// A drawable joins at the site that builds it, and the tag is read off each
// object's OWN userData, like the prewarm walk's category tag, so a pool must
// tag every drawable it builds, never only a root.

import type * as THREE from 'three';
import { setRenderCategory } from './renderer_diagnostics';

const ENGINE = 'engine';

/** Tag a pooled drawable as cast VFX AND as a member of the engine family. */
export function tagCastVfxEngine(object: THREE.Object3D): void {
  setRenderCategory(object, 'vfx');
  object.userData.castVfxFamily = ENGINE;
}

/** Whether this object, by its own tag, is an engine-family drawable. */
export function inCastVfxEngine(object: THREE.Object3D): boolean {
  return object.userData?.castVfxFamily === ENGINE;
}
