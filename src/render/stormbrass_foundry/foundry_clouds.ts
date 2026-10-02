// The storm's cloud banks AMONG the Stormbrass Foundry's peaks
// (foundry_plan_core.ts planFoundryCloudBanks): every bank a camera-facing
// card in ONE instanced draw, its billows computed in the fragment shader on
// the shared clock. They are depth-tested against the mountains, so a ridge
// stands in front of the bank snagged behind it and the peaks rise out of
// cloud. Each bank is lit from behind by its own sheet lightning (a short
// double pulse on its own slow clock: the thin edges glow, the core stays
// dark) and by the coil's strikes. Cosmetic: fewer banks and no lightning on
// the low tier.

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_FOG_COLOR } from '../fog_scene_state';
import { sharedUniforms } from '../gfx';
import { STORMBRASS_FOUNDRY_SUN_DIRECTION } from '../interior_light_rig';
import { planFoundryCloudBanks } from './foundry_plan_core';

const VERT = /* glsl */ `
attribute vec3 aCentre;
attribute vec3 aShape; // width, height, seed
varying vec2 vUv;
varying float vSeed;
varying float vNear;
varying vec3 vWorld;
void main() {
  vUv = position.xy + 0.5;
  vSeed = aShape.z;
  vec4 world = modelMatrix * vec4(aCentre, 1.0);
  vec4 mv = viewMatrix * world;
  mv.xy += position.xy * aShape.xy;
  vWorld = world.xyz;
  // A bank the camera walks into thins away instead of filling the screen.
  vNear = smoothstep(150.0, 320.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vSeed;
varying float vNear;
varying vec3 vWorld;
uniform float uTime;
uniform float uFlash;
uniform float uSheet;
uniform vec3 uHaze;
uniform vec3 uSunDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + 11.3; a *= 0.5; }
  return s;
}
void main() {
  vec2 p = vUv - 0.5;
  float t = uTime * 0.008;
  float big = fbm(vUv * vec2(2.6, 1.8) + vSeed * 31.0 + vec2(t, 0.0));
  float fine = fbm(vUv * vec2(7.0, 5.0) - vSeed * 17.0 + vec2(-t * 2.3, t));
  // A flat-bottomed, heaped bank: wide at its foot, billowing at its head.
  float body = 1.0 - length(p * vec2(1.75, 2.1 + 0.9 * step(0.0, -p.y)));
  float dens = smoothstep(0.12, 0.62, body + (big - 0.5) * 0.85 + (fine - 0.5) * 0.3);
  float a = dens * 0.92 * vNear;
  if (a < 0.01) discard;
  // Slate underside, storm-grey heads catching the sky; a warm rim toward the sun.
  vec3 under = vec3(0.035, 0.042, 0.062);
  vec3 head = vec3(0.21, 0.25, 0.33);
  vec3 col = mix(under, head, smoothstep(0.25, 0.85, vUv.y + (big - 0.5) * 0.5));
  col *= 0.75 + 0.5 * fine;
  vec3 toSun = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  float sunward = max(0.0, dot(normalize(vec3(vWorld.x, 0.0, vWorld.z)), toSun));
  col += vec3(0.5, 0.31, 0.16) * pow(sunward, 3.0) * (1.0 - dens) * 0.9;
  // Lit from behind: this bank's own sheet lightning, and the coil's strike.
  float period = 5.0 + vSeed * 9.0;
  float beat = floor(uTime / period + vSeed * 7.0);
  float into = fract(uTime / period + vSeed * 7.0) * period;
  float sheet = step(into, 0.36) * (step(into, 0.1) + step(0.18, into)) * 0.5 * step(0.5, hash(vec2(beat, vSeed)));
  float core = smoothstep(0.75, 0.0, length(p - (vec2(hash(vec2(beat, 3.0)), hash(vec2(beat, 5.0))) - 0.5) * 0.5));
  float lit = sheet * uSheet * core + uFlash * 0.45;
  col += vec3(0.62, 0.74, 1.0) * lit * (0.22 + 1.5 * (1.0 - dens) + 0.5 * big);
  // The banks sink into the same haze the ranges do.
  col = mix(col, uHaze, 0.25);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

const flash = { value: 0 };

/** The coil strike's flash on every bank (0..1; the sky's dome hook drives it). */
export function setFoundryCloudFlash(v: number): void {
  flash.value = Math.max(0, Math.min(1, v));
}

/** Every cloud bank as one instanced mesh. */
export function buildFoundryClouds(lowGfx: boolean, density: number): THREE.Mesh {
  const banks = planFoundryCloudBanks(lowGfx ? 0 : density);
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const centre = new Float32Array(banks.length * 3);
  const shape = new Float32Array(banks.length * 3);
  banks.forEach((b, i) => {
    centre.set([b.x, b.y, b.z], i * 3);
    shape.set([b.w, b.h, b.seed], i * 3);
  });
  geo.setAttribute('aCentre', new THREE.InstancedBufferAttribute(centre, 3));
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 3));
  geo.instanceCount = banks.length;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      name: 'stormbrassCloudBanks',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uFlash: flash,
        uSheet: { value: lowGfx ? 0 : 1 },
        uHaze: { value: new THREE.Color(STORMBRASS_FOUNDRY_FOG_COLOR) },
        uSunDir: { value: STORMBRASS_FOUNDRY_SUN_DIRECTION.clone() },
      },
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  mesh.name = 'stormbrassCloudBanks';
  mesh.frustumCulled = false;
  // After the dome and the rock, before the world's own transparents.
  mesh.renderOrder = -4;
  return mesh;
}
