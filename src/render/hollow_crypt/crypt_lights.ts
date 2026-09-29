// The Hollow Crypt's lights: tallow lanterns and braziers (the only warm,
// "living" light), cold frost glows in the gallery webs, violet choir fire and
// the soul-green light under the column. Every point light rides the renderer's
// budgeted carriers (pushed to the fire-light sink); flames flicker through the
// renderer's shared flame list. No light is added outside that seam.

import * as THREE from 'three';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { sharedUniforms } from '../gfx';
import type { FireLightSink } from '../point_light_budget';
import { markSharedGeometry, markSharedMaterial } from '../shared_resource';
import { radialGlowTexture } from '../textures';
import { CRYPT_LIGHT_STYLE, type CryptLightKind, HOLLOW_CRYPT_LIGHTS } from './crypt_plan_core';

export interface CryptLightDeps {
  lowGfx: boolean;
  flames: THREE.Mesh[];
  fireLights: FireLightSink;
}

let flameGeometry: THREE.BufferGeometry | null = null;
let glowGeometry: THREE.BufferGeometry | null = null;
const flameMaterials = new Map<CryptLightKind, THREE.MeshBasicMaterial>();
const glowMaterials = new Map<CryptLightKind, THREE.MeshBasicMaterial>();
const haloMaterials = new Map<CryptLightKind, THREE.SpriteMaterial>();

function flameMaterial(kind: CryptLightKind): THREE.MeshBasicMaterial {
  let m = flameMaterials.get(kind);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: CRYPT_LIGHT_STYLE[kind].flame,
      transparent: true,
      opacity: 0.95,
      name: `hollowCryptFlame:${kind}`,
    });
    markSharedMaterial(m);
    flameMaterials.set(kind, m);
  }
  return m;
}

function glowMaterial(kind: CryptLightKind): THREE.MeshBasicMaterial {
  let m = glowMaterials.get(kind);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: radialGlowTexture(),
      color: CRYPT_LIGHT_STYLE[kind].color,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      name: `hollowCryptGlow:${kind}`,
    });
    markSharedMaterial(m);
    glowMaterials.set(kind, m);
  }
  return m;
}

function haloMaterial(kind: CryptLightKind): THREE.SpriteMaterial {
  let m = haloMaterials.get(kind);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: radialGlowTexture(),
      color: CRYPT_LIGHT_STYLE[kind].flame,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      name: `hollowCryptHalo:${kind}`,
    });
    markSharedMaterial(m);
    haloMaterials.set(kind, m);
  }
  return m;
}

/** Plant every flame, halo, floor glow and budgeted point light. */
export function buildCryptLights(
  group: THREE.Group,
  deps: CryptLightDeps,
  ground: (x: number, z: number) => number,
): void {
  flameGeometry ??= new THREE.ConeGeometry(0.22, 0.75, 7);
  markSharedGeometry(flameGeometry);
  glowGeometry ??= new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  markSharedGeometry(glowGeometry);
  for (const spot of HOLLOW_CRYPT_LIGHTS) {
    const style = CRYPT_LIGHT_STYLE[spot.kind];
    const gy = ground(spot.x, spot.z);
    const y = gy + spot.lift;
    if (spot.kind !== 'soul') {
      const flame = new THREE.Mesh(flameGeometry, flameMaterial(spot.kind));
      flame.position.set(spot.x, y, spot.z);
      const s = spot.kind === 'brazier' ? 2.2 : spot.kind === 'candle' ? 0.8 : 1;
      flame.scale.setScalar(s);
      group.add(flame);
      deps.flames.push(flame);
    }
    const halo = new THREE.Sprite(haloMaterial(spot.kind));
    halo.position.set(spot.x, y + 0.2, spot.z);
    const hs = spot.kind === 'soul' ? 16 : spot.kind === 'brazier' ? 5 : 2.6;
    halo.scale.set(hs, hs, 1);
    group.add(halo);
    const light = new THREE.PointLight(
      style.color,
      deps.lowGfx ? style.intensity * 0.6 : style.intensity,
      deps.lowGfx ? style.range * 0.7 : style.range,
      2,
    );
    if (!deps.lowGfx) light.userData.baseIntensity = style.intensity * 1.8;
    light.position.set(spot.x, y + 1, spot.z);
    group.add(light);
    deps.fireLights.push(light);
    if (!deps.lowGfx) {
      const glow = new THREE.Mesh(glowGeometry, glowMaterial(spot.kind));
      glow.position.set(spot.x, gy + 0.06, spot.z);
      glow.scale.setScalar(style.range * 0.32);
      // A torch pool on the world's own floor rung: every encounter telegraph
      // paints over it (docs/design/vfx-floor-layering.md).
      glow.renderOrder = floorVfxRenderOrder('ground', 1);
      group.add(glow);
    }
  }
}

// ---- the soul column's floor pool -----------------------------------------------

/** The soul-green pool under the column, on the ring floor (ground rung, dim
 *  and additive: Morthen's telegraphs always paint over it). */
export function buildColumnPool(x: number, y: number, z: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    name: 'hollowCryptColumnPool',
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float glow = pow(max(0.0, 1.0 - d), 2.6);
        float a = glow * 0.42 * (0.85 + 0.15 * sin(uTime * 2.1));
        gl_FragColor = vec4(vec3(0.45, 1.0, 0.78) * a, a);
        #include <colorspace_fragment>
      }
    `,
    uniforms: { uTime: sharedUniforms.uTime },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), material);
  pool.position.set(x, y + 0.08, z);
  pool.renderOrder = floorVfxRenderOrder('ground', 2);
  return pool;
}
