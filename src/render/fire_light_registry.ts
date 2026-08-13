// The renderer-side owner of the CONSTANT visible point-light count.
//
// three.js bakes the light counts into every material's program cache key, lit
// materials and unlit ones alike, so the number of VISIBLE point lights must
// never change for the renderer's lifetime: one changed count relinks every
// material drawn in that frame, a measured 100 to 200 ms synchronous stall
// each. `renderer.ts` keeps the registries and the pads; this module owns the
// two operations that must not be open-coded per call site.
//
// Extracted from `renderer.ts` under the monolith ratchet (tests/monolith_budget).
import * as THREE from 'three';
import {
  applyPointLightBudget,
  type FireLightSink,
  flickerContributingFireLights,
  pointLightPadCount,
  type RankedPointLight,
} from './point_light_budget';

export interface FireLightAdopter {
  /** Take a light into the budget: hide it, register it, dirty the rank. */
  adopt(light: THREE.PointLight): void;
  /** The same operation shaped like `Array.push`, for subsystems handed the
   *  registry. They keep calling `.push(light)` and cannot bypass adoption. */
  readonly sink: FireLightSink;
}

/**
 * Adoption is the one way a light joins the budget after construction, and it
 * does two things that are only correct together.
 *
 * It HIDES the light, because three counts a light into numPointLights the
 * moment it is visible (intensity is irrelevant): a light visible before the
 * budget has ranked it changes the count for the frames in between. Measured:
 * one frame in 5434 sat at seven budgeted lights against a pin of six, and the
 * relink it forced is the stall this exists to prevent.
 *
 * And it marks the rank DIRTY, because the rebuild guard compares
 * `rank.length` against a COUNT: a balanced add-and-remove inside one microtask
 * leaves a stale rank that never rules on the new light at all.
 *
 * `battleground.ts` already hid its field lights for exactly the first reason;
 * this is that rule made general and impossible to forget.
 */
export function createFireLightAdopter(
  fireLights: () => THREE.PointLight[],
  markRankDirty: () => void,
): FireLightAdopter {
  const adopt = (light: THREE.PointLight): void => {
    light.visible = false;
    fireLights().push(light);
    markRankDirty();
  };
  return {
    adopt,
    sink: {
      push: (...lights: THREE.PointLight[]): number => {
        for (const light of lights) adopt(light);
        return fireLights().length;
      },
    },
  };
}

export interface FireLightBudgetPass {
  /** Pooled rank, rebuilt in place only when the set changed. */
  rank: RankedPointLight[];
  rankDirty: boolean;
  fireLights: readonly THREE.PointLight[];
  viewLights: readonly THREE.PointLight[];
  pads: readonly THREE.PointLight[];
  px: number;
  pz: number;
  /** The tier constant. This is the pinned count, never the live governor. */
  visibleCount: number;
  /** How many of the counted lights may SHINE, which never changes the count. */
  liveBudget: number;
  rangeSq: number;
  scene: THREE.Object3D;
  /** Clock for the fire flicker, or null to skip it. */
  flickerTime: number | null;
}

/**
 * One budget pass. Ranks the union of static fire lights and entity-view lights
 * (a view light counted separately would change numPointLights as it streams in
 * and out), keeps the nearest `visibleCount` visible, and tops the total up with
 * pad lights so the count holds even when fewer real lights exist.
 *
 * The caller owns the dirty flag; a completed pass always leaves the rank
 * current, so there is nothing to hand back.
 */
export function runFireLightBudgetPass(pass: FireLightBudgetPass): void {
  const ranked = pass.rank;
  const want = pass.fireLights.length + pass.viewLights.length;
  if (pass.rankDirty || ranked.length !== want) {
    ranked.length = 0;
    for (let fireIndex = 0; fireIndex < pass.fireLights.length; fireIndex++) {
      const light = pass.fireLights[fireIndex];
      ranked.push({
        light,
        d2: 0,
        worldPos: light.getWorldPosition(new THREE.Vector3()),
        base: null,
        dynamic: false,
        fireIndex,
      });
    }
    for (const light of pass.viewLights) {
      const stored = light.userData.budgetBase;
      const base = typeof stored === 'number' ? stored : light.intensity;
      const dynamic = light.userData.budgetDynamic === true;
      ranked.push({
        light,
        d2: 0,
        worldPos: light.getWorldPosition(new THREE.Vector3()),
        base: dynamic ? null : base,
        dynamic,
      });
    }
  }
  // Ancestry-aware: a chosen light under a group the world hid (zone streaming,
  // far-LOD wraps, compile gates) is not drawn, so it must not hold a counted
  // slot; the returned drawn count is what the pad fill below keys on.
  const drawnCount = applyPointLightBudget(
    ranked,
    pass.px,
    pass.pz,
    pass.visibleCount,
    pass.liveBudget,
    pass.rangeSq,
    pass.scene,
  );
  if (pass.flickerTime !== null) {
    flickerContributingFireLights(
      ranked,
      pass.flickerTime,
      pass.visibleCount,
      pass.liveBudget,
      pass.rangeSq,
    );
  }
  const padCount = pointLightPadCount(drawnCount, pass.visibleCount);
  for (let i = 0; i < pass.pads.length; i++) pass.pads[i].visible = i < padCount;
}
