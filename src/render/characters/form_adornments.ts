// The per-rig owner of the shapeshift form adornments. CharacterVisual holds
// one (lazily, only once a form flag first turns on) and forwards the two form
// edges it already receives every frame from the renderer (`setMoonkin`,
// `setShadowform`), its per-frame tick and its teardown; everything else lives
// here and in the pieces this composes:
//   form_adornment_core.ts   what a rig wears, and how it moves (pure)
//   moonwing_adornment.ts    antlers, crescent and wings (THREE)
//   gloamveil_veil.ts        the veil and burning eyes (THREE)
import type * as THREE from 'three';
import {
  createMoonwingPose,
  formAdornmentPlan,
  gloamveilEyeGlow,
  moonwingPoseInto,
} from './form_adornment_core';
import { GloamveilVeil } from './gloamveil_veil';
import { MoonwingAdornment } from './moonwing_adornment';

export class FormAdornments {
  private moonwing: MoonwingAdornment | null = null;
  private veil: GloamveilVeil | null = null;
  private moonwingElapsed = 0;
  private veilElapsed = 0;
  private readonly pose = createMoonwingPose();

  /** `model` holds the rig's bones; `composed` is whether it is a modular
   *  look (form_adornment_core.formAdornmentPlan decides the antlers on it). */
  constructor(
    private readonly model: THREE.Object3D,
    private readonly composed: boolean,
  ) {}

  /** Mount or unmount the pieces for the current form flags. Idempotent: the
   *  caller forwards only the edges, but a repeat is a no-op. */
  sync(moonkin: boolean, shadowform: boolean): void {
    const plan = formAdornmentPlan(moonkin, shadowform, this.composed);
    if (plan.moonwing && !this.moonwing) {
      this.moonwing = new MoonwingAdornment(this.model, plan.antlers);
      this.moonwingElapsed = 0;
      // Every shift starts folded: the pose still holds the LAST form's
      // unfurled wings, which would pop the new pair open on its first frame.
      this.moonwing.apply(Object.assign(this.pose, createMoonwingPose()));
    } else if (!plan.moonwing && this.moonwing) {
      this.moonwing.dispose();
      this.moonwing = null;
    }
    if (plan.gloamveil && !this.veil) {
      this.veil = new GloamveilVeil(this.model);
      this.veilElapsed = 0;
    } else if (!plan.gloamveil && this.veil) {
      this.veil.dispose();
      this.veil = null;
    }
  }

  /** Advance the pieces one frame. `visible` false (a culled or far-LOD rig,
   *  whose subtree is hidden anyway) skips the pose work and holds the clock. */
  update(
    dt: number,
    moving: boolean,
    casting: boolean,
    reducedMotion: boolean,
    visible: boolean,
  ): void {
    if (!visible) return;
    if (this.moonwing) {
      this.moonwingElapsed += dt;
      this.moonwing.apply(
        moonwingPoseInto(this.moonwingElapsed, moving, casting, reducedMotion, this.pose),
      );
    }
    if (this.veil) {
      this.veilElapsed += dt;
      this.veil.apply(gloamveilEyeGlow(this.veilElapsed, reducedMotion));
    }
  }

  dispose(): void {
    this.moonwing?.dispose();
    this.moonwing = null;
    this.veil?.dispose();
    this.veil = null;
  }
}
