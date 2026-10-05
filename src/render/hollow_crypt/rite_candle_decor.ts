// The four Remembrance Candles' decor, as the interior built it: the kit's
// baked flame (one instance each of the `Kit_RemembranceCandle:glow` batch,
// crypt_kit.ts) and the crypt lights' flame cone, halo and budgeted point
// light (crypt_lights.ts). Morthen's Rite gutters them out and the group lights
// them again (morthen_candle_fx.ts): this registry is how that painter reaches
// the decor without owning it. Each builder registers what it built (a rebuild
// replaces its entries and bumps `generation`, so the painter re-applies its
// looks); the painter flips visibility, zeroes an instance's matrix or scales a
// light's level. Nothing here links a program: no material, texture or define
// changes, only visibility, an instance matrix and a light's intensity (a point
// light stays a carrier source, its count untouched).

import * as THREE from 'three';
import { candleIndexAt } from './morthen_rite_fx_core';

interface CandleLamp {
  flame: THREE.Object3D | null;
  halo: THREE.Object3D | null;
  light: THREE.PointLight | null;
  /** The light's authored levels (budget base and live intensity). */
  base: number | null;
  intensity: number;
}

interface BakedGlow {
  mesh: THREE.InstancedMesh;
  /** Instance index per candle (-1: none), and each instance's authored matrix. */
  instanceOf: number[];
  matrices: THREE.Matrix4[];
}

const lamps: (CandleLamp | null)[] = [null, null, null, null];
let glow: BakedGlow | null = null;
let generation = 0;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Bumped by every registration: a painter re-applies its looks on a change. */
export function riteCandleDecorGeneration(): number {
  return generation;
}

/** crypt_lights.ts: the lamp a Remembrance Candle's holder burns at the
 *  instance-local spot (x, z). */
export function registerRiteCandleLamp(
  x: number,
  z: number,
  flame: THREE.Object3D | null,
  halo: THREE.Object3D | null,
  light: THREE.PointLight | null,
): void {
  const i = candleIndexAt(x, z);
  if (i < 0) return;
  const base = light?.userData.baseIntensity;
  lamps[i] = {
    flame,
    halo,
    light,
    base: typeof base === 'number' ? base : null,
    intensity: light?.intensity ?? 0,
  };
  generation++;
}

/** crypt_kit.ts: the baked-flame batch of the Remembrance Candles and the
 *  instance-local spot of each instance. */
export function registerRiteCandleGlow(
  mesh: THREE.InstancedMesh,
  spots: readonly { x: number; z: number }[],
): void {
  const instanceOf = [-1, -1, -1, -1];
  const matrices: THREE.Matrix4[] = [];
  spots.forEach((s, k) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(k, m);
    matrices.push(m);
    const i = candleIndexAt(s.x, s.z);
    if (i >= 0) instanceOf[i] = k;
  });
  glow = { mesh, instanceOf, matrices };
  generation++;
}

/** Show or hide candle `i`'s decor flame (the baked one and the lamp's cone
 *  and halo) and set its light to `level` of its authored intensity. */
export function setRiteCandleDecor(i: number, flame: boolean, level: number): void {
  const lamp = lamps[i];
  if (lamp) {
    if (lamp.flame) lamp.flame.visible = flame;
    if (lamp.halo) lamp.halo.visible = flame;
    if (lamp.light) {
      // The fire flicker rewrites `intensity` from `baseIntensity` every frame
      // (point_light_budget.ts), so the level rides the base on every tier
      // (a low-tier lamp carries none of its own: its authored intensity is it).
      lamp.light.userData.baseIntensity = (lamp.base ?? lamp.intensity) * level;
      lamp.light.intensity = lamp.intensity * level;
    }
  }
  const g = glow;
  const k = g ? g.instanceOf[i] : -1;
  if (g && k >= 0) {
    g.mesh.setMatrixAt(k, flame ? g.matrices[k] : ZERO);
    g.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Forget a disposed interior's decor (tests, a renderer rebuild). */
export function clearRiteCandleDecor(): void {
  lamps.fill(null);
  glow = null;
  generation++;
}
