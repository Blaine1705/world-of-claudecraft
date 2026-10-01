// The Stormbrass Foundry's lights: the warm work lamps on their poles and over
// the Stamping Press, the coil's blue-white glow on the crown, and the storm
// cells in the Gantry's charging racks. Every point light rides the renderer's
// budgeted carriers (pushed to the fire-light sink); no light is added outside
// that seam, and the halos are emissive sprites, not lights.

import * as THREE from 'three';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import type { FireLightSink } from '../point_light_budget';
import { markSharedGeometry, markSharedMaterial } from '../shared_resource';
import { radialGlowTexture } from '../textures';
import { FOUNDRY_LIGHT_STYLE, type FoundryLightKind, planFoundryLights } from './foundry_plan_core';

export interface FoundryLightDeps {
  lowGfx: boolean;
  fireLights: FireLightSink;
}

let poolGeometry: THREE.BufferGeometry | null = null;
const haloMaterials = new Map<FoundryLightKind, THREE.SpriteMaterial>();
const poolMaterials = new Map<FoundryLightKind, THREE.MeshBasicMaterial>();

function haloMaterial(kind: FoundryLightKind): THREE.SpriteMaterial {
  let m = haloMaterials.get(kind);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: radialGlowTexture(),
      color: FOUNDRY_LIGHT_STYLE[kind].color,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      name: `stormbrassHalo:${kind}`,
    });
    markSharedMaterial(m);
    haloMaterials.set(kind, m);
  }
  return m;
}

function poolMaterial(kind: FoundryLightKind): THREE.MeshBasicMaterial {
  let m = poolMaterials.get(kind);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: radialGlowTexture(),
      color: FOUNDRY_LIGHT_STYLE[kind].color,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      name: `stormbrassPool:${kind}`,
    });
    markSharedMaterial(m);
    poolMaterials.set(kind, m);
  }
  return m;
}

/** Plant every halo, floor pool and budgeted point light. */
export function buildFoundryLights(
  group: THREE.Group,
  deps: FoundryLightDeps,
  ground: (x: number, z: number) => number,
): void {
  poolGeometry ??= new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  markSharedGeometry(poolGeometry);
  for (const spot of planFoundryLights()) {
    const style = FOUNDRY_LIGHT_STYLE[spot.kind];
    const gy = ground(spot.x, spot.z);
    const y = gy + spot.lift;
    const halo = new THREE.Sprite(haloMaterial(spot.kind));
    halo.position.set(spot.x, y, spot.z);
    const hs = spot.kind === 'crown' ? 10 : 3.4;
    halo.scale.set(hs, hs, 1);
    group.add(halo);
    const light = new THREE.PointLight(
      style.color,
      deps.lowGfx ? style.intensity * 0.6 : style.intensity,
      deps.lowGfx ? style.range * 0.7 : style.range,
      2,
    );
    if (!deps.lowGfx) light.userData.baseIntensity = style.intensity * 1.6;
    light.position.set(spot.x, y, spot.z);
    group.add(light);
    deps.fireLights.push(light);
    if (!deps.lowGfx) {
      const pool = new THREE.Mesh(poolGeometry, poolMaterial(spot.kind));
      pool.position.set(spot.x, gy + 0.06, spot.z);
      pool.scale.setScalar(style.range * 0.3);
      // A lamp pool on the floor's own rung: every telegraph paints over it.
      pool.renderOrder = floorVfxRenderOrder('ground', 1);
      group.add(pool);
    }
  }
}
