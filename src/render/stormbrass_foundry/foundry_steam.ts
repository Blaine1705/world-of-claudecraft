// The Stormbrass Foundry's steam and smoke: white steam breathing from every
// vent, safety valve and boiler, sooty smoke belching from every stack (the
// floor stacks, the press's, the engine houses' in the drop), the furnaces'
// fume, and the plumes climbing the mountain's face under the rim. Two
// crossed cards per source in ONE merged mesh; the billow, the breathing and
// the smoke leaning on the wind are all shader-side on the shared clock.
// Cosmetic only; the far plumes shed on the low tier.

import * as THREE from 'three';
import { sharedUniforms } from '../gfx';
import { markSharedMaterial } from '../shared_resource';
import type { FoundryEmitter } from './foundry_kit_plan_core';

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
attribute float aSeed;
attribute float aLean;
uniform float uTime;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vSeed = aSeed;
  // The wind leans the column toward the north-east, more the higher it
  // climbs, with a slow sway.
  float k = uv.y * uv.y;
  float sway = sin(uTime * 0.23 + aSeed * 11.0) * 0.25 + 1.0;
  vec3 p = position + vec3(0.8, 0.0, 0.6) * aLean * k * sway;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vSeed;
uniform float uTime;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float smoke = step(1.5, vSeed);
  float s = fract(vSeed);
  float t = uTime * (0.8 + s * 0.4) + s * 17.0;
  // Steam breathes (a burst every few seconds); smoke pours steadily.
  float puff = mix(0.45 + 0.55 * smoothstep(0.55, 1.0, sin(t * 0.9) * 0.5 + 0.5), 0.85 + 0.15 * sin(t * 0.4), smoke);
  float rise = mix(1.6, 0.9, smoke);
  float n = noise(vec2(vUv.x * 3.0 + s * 5.0, vUv.y * 4.0 - t * rise)) * 0.6
    + noise(vec2(vUv.x * 7.0 + 3.1, vUv.y * 9.0 - t * rise * 1.5)) * 0.4;
  // Billows: the column's edge is eaten by a second, slower field.
  float edge = noise(vec2(vUv.x * 2.0 - s * 3.0, vUv.y * 2.4 - t * rise * 0.45));
  float width = mix(0.16, 0.5, pow(vUv.y, 0.7));
  float body = smoothstep(width, width * 0.15, abs(vUv.x - 0.5) + (edge - 0.5) * 0.16);
  float a = body * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.4, vUv.y) * n * puff;
  // Smoke: sooty at the stack's mouth, thinning to grey as it climbs.
  vec3 soot = mix(vec3(0.09, 0.09, 0.1), vec3(0.34, 0.35, 0.38), smoothstep(0.0, 0.8, vUv.y) * (0.6 + 0.4 * n));
  vec3 col = mix(vec3(0.92, 0.94, 0.95), soot, smoke);
  gl_FragColor = vec4(col, a * mix(0.75, 0.7, smoke));
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`;

let material: THREE.ShaderMaterial | null = null;

function steamMaterial(): THREE.ShaderMaterial {
  if (!material) {
    material = new THREE.ShaderMaterial({
      name: 'stormbrassSteam',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: sharedUniforms.uTime,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    markSharedMaterial(material);
  }
  return material;
}

/** Every steam and smoke column as two crossed cards in one merged mesh. */
export function buildFoundrySteam(emitters: readonly FoundryEmitter[]): THREE.Mesh | null {
  if (emitters.length === 0) return null;
  const cards = emitters.length * 2;
  const pos = new Float32Array(cards * 4 * 3);
  const uv = new Float32Array(cards * 4 * 2);
  const seed = new Float32Array(cards * 4);
  const lean = new Float32Array(cards * 4);
  const index: number[] = [];
  let v = 0;
  emitters.forEach((e, i) => {
    const smoke = e.kind === 'smoke';
    for (let k = 0; k < 2; k++) {
      const a = k * (Math.PI / 2) + i * 0.7;
      const hx = (Math.cos(a) * e.w) / 2;
      const hz = (Math.sin(a) * e.w) / 2;
      const corners: [number, number, number, number, number][] = [
        [-1, 0, 0, 0, 0],
        [1, 0, 1, 0, 0],
        [1, 1, 1, 1, 1],
        [-1, 1, 0, 1, 1],
      ];
      for (const [sx, sy, u, w] of corners) {
        pos.set([e.x + hx * sx, e.y + sy * e.h, e.z + hz * sx], v * 3);
        uv.set([u, w], v * 2);
        seed[v] = (smoke ? 2 : 0) + Math.min(0.999, e.seed);
        lean[v] = smoke ? e.h * 0.45 : e.h * 0.12;
        v++;
      }
      const b = v - 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aLean', new THREE.BufferAttribute(lean, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 30;
  const mesh = new THREE.Mesh(geo, steamMaterial());
  mesh.name = 'stormbrassSteam';
  mesh.renderOrder = 6;
  return mesh;
}
