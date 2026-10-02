// The Stormbrass Foundry's lights: the warm work lamps on their poles and over
// the Stamping Press, the forge's orange off the molten river and the furnace
// mouths, the coil's blue-white glow on the crown, and the storm cells in the
// Gantry's charging racks. Every point light rides the renderer's
// budgeted carriers (pushed to the fire-light sink); no light is added outside
// that seam, and the halos are emissive sprites, not lights.

import * as THREE from 'three';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import type { FireLightSink } from '../point_light_budget';
import { markSharedGeometry, markSharedMaterial } from '../shared_resource';
import { radialGlowTexture } from '../textures';
import {
  FOUNDRY_LIGHT_STYLE,
  type FoundryGlowSpot,
  type FoundryLightKind,
  planFoundryGlows,
  planFoundryLights,
} from './foundry_plan_core';

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

const GLOW_STYLE = {
  flood: { color: 0xffdfa6, halo: 7, opacity: 0.2 },
  ember: { color: 0xff7a2c, halo: 3.2, opacity: 0.3 },
} as const;

// Camera-facing halo quads, every glow of a kind in ONE instanced draw (a GL
// point would pop out whole when its centre leaves the frustum, and stops
// growing at the driver's point-size cap).
const HALO_VERT = /* glsl */ `
attribute vec3 aCentre;
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = position.xy * 2.0;
  vec4 mv = modelViewMatrix * vec4(aCentre, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}
`;
const HALO_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  float a = pow(max(0.0, 1.0 - d), 2.2) * 0.75;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}
`;

function haloQuads(centres: Float32Array, size: number, color: number, name: string): THREE.Mesh {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('aCentre', new THREE.InstancedBufferAttribute(centres, 3));
  geo.instanceCount = centres.length / 3;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < centres.length; i += 3) box.expandByPoint(v.fromArray(centres, i));
  box.expandByScalar(size);
  geo.boundingBox = box;
  geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      name,
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: { uSize: { value: size }, uColor: { value: new THREE.Color(color) } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  );
  return mesh;
}

/** The painted glows (planFoundryGlows): every flood mast's lamp head and
 *  every firebox door as one instanced halo draw per kind, and their pools
 *  of light merged into one floor mesh per kind on the ground rung. No lights. */
function buildFoundryGlows(lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassGlows';
  const spots = planFoundryGlows();
  for (const kind of ['flood', 'ember'] as const) {
    const style = GLOW_STYLE[kind];
    const mine = spots.filter((s: FoundryGlowSpot) => s.kind === kind);
    if (mine.length === 0) continue;
    const at = new Float32Array(mine.length * 3);
    for (const [i, s] of mine.entries()) at.set([s.x, s.y, s.z], i * 3);
    const halos = haloQuads(at, style.halo, style.color, `stormbrassGlow:${kind}`);
    halos.name = `stormbrassGlowHalos:${kind}`;
    group.add(halos);
    if (lowGfx) continue;
    // The pools: one fan of triangles per spot, merged.
    const pools = mine.filter((s) => s.pool !== null);
    const SEG = 20;
    const pos = new Float32Array(pools.length * (SEG + 1) * 3);
    const uv = new Float32Array(pools.length * (SEG + 1) * 2);
    const idx: number[] = [];
    pools.forEach((s, i) => {
      const p = s.pool as NonNullable<FoundryGlowSpot['pool']>;
      const base = i * (SEG + 1);
      pos.set([p.x, p.y + 0.07, p.z], base * 3);
      uv.set([0.5, 0.5], base * 2);
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        pos.set([p.x + Math.cos(a) * p.r, p.y + 0.07, p.z + Math.sin(a) * p.r], (base + 1 + k) * 3);
        uv.set([0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5], (base + 1 + k) * 2);
        idx.push(base, base + 1 + ((k + 1) % SEG), base + 1 + k);
      }
    });
    const poolGeo = new THREE.BufferGeometry();
    poolGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    poolGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    poolGeo.setIndex(idx);
    poolGeo.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      poolGeo,
      new THREE.MeshBasicMaterial({
        map: radialGlowTexture(),
        color: style.color,
        transparent: true,
        opacity: style.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        name: `stormbrassGlowPool:${kind}`,
      }),
    );
    mesh.name = `stormbrassGlowPools:${kind}`;
    // On the floor's own rung: every telegraph paints over it.
    mesh.renderOrder = floorVfxRenderOrder('ground', 1);
    group.add(mesh);
  }
  return group;
}

/** Plant every halo, floor pool and budgeted point light. */
export function buildFoundryLights(
  group: THREE.Group,
  deps: FoundryLightDeps,
  ground: (x: number, z: number) => number,
): void {
  poolGeometry ??= new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  markSharedGeometry(poolGeometry);
  group.add(buildFoundryGlows(deps.lowGfx));
  for (const spot of planFoundryLights()) {
    const style = FOUNDRY_LIGHT_STYLE[spot.kind];
    const gy = ground(spot.x, spot.z);
    const y = spot.y ?? gy + spot.lift;
    const halo = new THREE.Sprite(haloMaterial(spot.kind));
    halo.position.set(spot.x, y, spot.z);
    const hs = spot.kind === 'crown' ? 10 : spot.kind === 'forge' ? 7 : 3.4;
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
    // A pool only under a light that stands over a floor (not the river's).
    if (!deps.lowGfx && spot.y === undefined) {
      const pool = new THREE.Mesh(poolGeometry, poolMaterial(spot.kind));
      pool.position.set(spot.x, gy + 0.06, spot.z);
      pool.scale.setScalar(style.range * 0.3);
      // A lamp pool on the floor's own rung: every telegraph paints over it.
      pool.renderOrder = floorVfxRenderOrder('ground', 1);
      group.add(pool);
    }
  }
}
