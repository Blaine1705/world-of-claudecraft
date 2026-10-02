// The live half of VisualDef.glowPulses (math: glow_pulse_core.ts): one rig's
// emissive flares. While a pulse runs (or a dead body's glow is fading out)
// the visual mounts private clones of its emissive-mapped materials and this
// writes their emissiveIntensity each frame; once every pulse is spent the
// rig goes back to its shared materials.
//
// The clones come from cloneMaterialWithHooks, so they keep the source's
// program cache key: mounting one costs no shader link (the same rule as the
// aura glow and the rune tint). Base materials are shared per-asset caches,
// which is why the intensity is never written on them.

import type * as THREE from 'three';
import { cloneMaterialWithHooks } from '../material_clone_hooks';
import { type GlowPulseSet, glowPulseLevel, glowPulseSpan, glowPulsesFor } from './glow_pulse_core';

type Emissive = THREE.Material & { emissiveMap?: THREE.Texture | null; emissiveIntensity?: number };

export class GlowPulse {
  /** Source material to its glowing clone (disposed with the visual). */
  readonly materials = new Map<THREE.Material, THREE.Material>();
  private readonly ages: Float32Array;
  private readonly spans: number[];
  private readonly hits: number[] = [];
  private deadFor = -1;
  private level = 1;
  /** The clones are mounted (a pulse runs or the death fade holds). */
  active = false;

  constructor(private readonly set: GlowPulseSet) {
    this.ages = new Float32Array(set.pulses.length).fill(-1);
    this.spans = set.pulses.map(glowPulseSpan);
  }

  /** Start the pulses a gesture names; true when it named one. */
  handle(gesture: string): boolean {
    glowPulsesFor(this.set, gesture, this.hits);
    for (const i of this.hits) this.ages[i] = 0;
    return this.hits.length > 0;
  }

  /** Advance the pulses; returns true when the mount must change (the
   *  clones go on or come off). */
  step(dt: number, dead: boolean): boolean {
    let running = false;
    for (let i = 0; i < this.ages.length; i++) {
      if (this.ages[i] < 0) continue;
      this.ages[i] += dt;
      if (this.ages[i] > this.spans[i]) this.ages[i] = -1;
      else running = true;
    }
    if (dead && this.set.deathFade !== undefined) this.deadFor = Math.max(0, this.deadFor) + dt;
    else this.deadFor = -1;
    const fading = this.deadFor >= 0;
    const want = running || fading;
    const level = glowPulseLevel(this.set, this.ages, this.deadFor);
    if (want && level !== this.level) {
      this.level = level;
      for (const [src, clone] of this.materials) this.write(src, clone);
    }
    if (want === this.active) return false;
    this.active = want;
    if (!want) this.level = 1;
    return true;
  }

  /** The clone to mount over `src` (only an emissive-mapped material glows). */
  material(src: THREE.Material): THREE.Material {
    if (!(src as Emissive).emissiveMap) return src;
    let clone = this.materials.get(src);
    if (!clone) {
      clone = cloneMaterialWithHooks(src);
      this.materials.set(src, clone);
    }
    this.write(src, clone);
    return clone;
  }

  private write(src: THREE.Material, clone: THREE.Material): void {
    (clone as Emissive).emissiveIntensity = ((src as Emissive).emissiveIntensity ?? 1) * this.level;
  }
}
