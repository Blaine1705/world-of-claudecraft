// The cast gate's families: the pooled programs the ability-VFX painter draws
// behind it. The ENGINE family is what it draws for every class (the
// AbilityVfxFx engine pools and the Vfx particle cloud its bursts ride). The
// KIT family is the Warrior kit's pools AbilityVfxFx builds with the engine:
// several of their pieces draw with no readiness check of their own (the
// baked layers' non-strict kinds and every kind before a preparation exists,
// the solid fragments, the crests outside their authored kinds), so the gate
// is their only protection. The gate (cast_vfx_prewarm.ts) waits on both.
// Every other 'vfx' drawable (the bespoke class pools, the lazy spell
// stand-ins, the generic basics) keeps its compile unit in the same warm-up,
// but never holds a cast: none of them is drawn behind the gate.
//
// A drawable joins at the site that builds it, and the tag is read off each
// object's OWN userData, like the prewarm walk's category tag, so a pool must
// tag every drawable it builds, never only a root.

import type * as THREE from 'three';
import { setRenderCategory } from './renderer_diagnostics';

const ENGINE = 'engine';
const KIT = 'kit';

/** Tag a pooled drawable as cast VFX AND as a member of the engine family. */
export function tagCastVfxEngine(object: THREE.Object3D): void {
  setRenderCategory(object, 'vfx');
  object.userData.castVfxFamily = ENGINE;
}

/** Tag a Warrior kit pool drawable as cast VFX AND as a member of the kit family. */
export function tagCastVfxKit(object: THREE.Object3D): void {
  setRenderCategory(object, 'vfx');
  object.userData.castVfxFamily = KIT;
}

/** Whether this object, by its own tag, is an engine-family drawable. */
export function inCastVfxEngine(object: THREE.Object3D): boolean {
  return object.userData?.castVfxFamily === ENGINE;
}

/** Whether this object, by its own tag, is a kit-family drawable. */
export function inCastVfxKit(object: THREE.Object3D): boolean {
  return object.userData?.castVfxFamily === KIT;
}
