// The only point lights three gathers in the world scene: a fixed set of
// carriers, packed from the live sources on every render of that scene (the
// ordering contract lives in point_light_carriers_core.ts). Their count is
// the pinned NUM_POINT_LIGHTS of every lit program, so it never moves.
import * as THREE from 'three';
import {
  darkenPointLightCarriers,
  packPointLightSources,
  pointLightCarriesLight,
} from './point_light_carriers_core';

const CARRIER_KEY = 'pointLightCarrier';

export type PointLightSourceList = () => readonly THREE.PointLight[];

export const NO_POINT_LIGHTS: readonly THREE.PointLight[] = [];

export function isPointLightCarrier(object: THREE.Object3D): boolean {
  return object.userData[CARRIER_KEY] === true;
}

/** Every point light three would gather from `scene` for `camera` that is not
 *  a carrier. A stray is drawn in its traversal slot, where a dark carrier in
 *  front of it makes the shader break before it. A whole-scene walk: for tests
 *  and a console session, never a frame path. */
export function findStrayPointLights(
  scene: THREE.Object3D,
  camera: THREE.Camera,
): THREE.PointLight[] {
  const strays: THREE.PointLight[] = [];
  scene.traverseVisible((object) => {
    const light = object as THREE.PointLight;
    if (light.isPointLight && light.layers.test(camera.layers) && !isPointLightCarrier(light)) {
      strays.push(light);
    }
  });
  return strays;
}

/** For a scene without carriers whose lights never change (a one-shot
 *  snapshot): a black light draws nothing, and hidden it cannot sit in front
 *  of a live one where the shader loop stops. */
export function hideBlackPointLights(root: THREE.Object3D): void {
  root.traverse((object) => {
    const light = object as THREE.PointLight;
    if (light.isPointLight && !pointLightCarriesLight(light.color, light.intensity)) {
      light.visible = false;
    }
  });
}

export class PointLightCarriers {
  readonly lights: readonly THREE.PointLight[];
  private readonly sources: readonly PointLightSourceList[];
  private overflowReported = false;

  constructor(scene: THREE.Object3D, count: number, sources: readonly PointLightSourceList[]) {
    const lights: THREE.PointLight[] = [];
    for (let i = 0; i < count; i++) {
      const carrier = new THREE.PointLight(0x000000, 0, 0, 2);
      carrier.name = `point-light-carrier-${i}`;
      carrier.userData[CARRIER_KEY] = true;
      // The pack writes matrixWorld directly after three's own update pass.
      carrier.matrixAutoUpdate = false;
      carrier.matrixWorldAutoUpdate = false;
      scene.add(carrier);
      lights.push(carrier);
    }
    this.lights = lights;
    this.sources = sources;
  }

  /** Packs the live sources into carriers 0..k-1 and darkens the rest. */
  pack(scene: THREE.Object3D, camera: THREE.Camera): number {
    const mask = camera.layers.mask;
    let cursor = 0;
    for (let i = 0; i < this.sources.length; i++) {
      cursor = packPointLightSources(this.sources[i](), this.lights, cursor, scene, mask);
    }
    darkenPointLightCarriers(this.lights, cursor);
    if (import.meta.env.DEV && cursor > this.lights.length && !this.overflowReported) {
      this.overflowReported = true;
      console.error(
        `PointLightCarriers: ${cursor} live point lights for ${this.lights.length} carriers; the last ones listed are dropped`,
      );
    }
    return cursor;
  }
}

/** Adds `count` carriers to `scene` and packs them on every render of it.
 *  three calls the scene's onBeforeRender after scene.updateMatrixWorld() and
 *  before it gathers lights, so the sources' world matrices are the ones this
 *  very render draws with, and every render path (composer, prewarm, census)
 *  is covered without a call of its own. */
export function attachPointLightCarriers(
  scene: THREE.Scene,
  count: number,
  sources: readonly PointLightSourceList[],
): PointLightCarriers {
  const carriers = new PointLightCarriers(scene, count, sources);
  const previous = scene.onBeforeRender;
  const hook = (
    renderer: THREE.WebGLRenderer,
    rendered: THREE.Scene,
    camera: THREE.Camera,
    target: unknown,
  ) => {
    (previous as (...args: unknown[]) => void).call(scene, renderer, rendered, camera, target);
    carriers.pack(scene, camera);
  };
  scene.onBeforeRender = hook as unknown as THREE.Scene['onBeforeRender'];
  return carriers;
}
