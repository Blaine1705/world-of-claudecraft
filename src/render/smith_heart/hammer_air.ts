// The Hammer vein's air (plan: hammer_air_core.ts): quarry dust drifting in
// the low sun over the pit and the Gallery, grit trickling off the terraces'
// lips and the colossi's shoulders, the collapse spot shedding a steady
// warning of grit onto the lower Gallery, a warm haze low over the quarry
// floor, and the geodes' amber halos. One draw per system, every motion in
// the vertex shader on the shared clock (no per-frame CPU), billboards built
// in view space from the camera-relative model-view (never a world point
// times the view matrix on the GPU). Cosmetic: the low tier builds a third of
// it; nothing here is a telegraph. Built with the interior, so the compile
// gate links it; no light, no texture.

import * as THREE from 'three';
import { sharedUniforms } from '../gfx';
import { type HammerAirPlan, planHammerAir } from './hammer_air_core';
import { heartHash } from './heart_plan_core';

const QUAD = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

/** Merged quads: per vertex a corner, the quad's base point and its params. */
function quadGeometry(
  bases: readonly (readonly [number, number, number])[],
  params: readonly (readonly [number, number, number, number])[],
): THREE.BufferGeometry {
  const n = bases.length;
  const corner = new Float32Array(n * 8);
  const base = new Float32Array(n * 12);
  const prm = new Float32Array(n * 16);
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    for (let v = 0; v < 4; v++) {
      corner.set(QUAD[v], (i * 4 + v) * 2);
      base.set(bases[i], (i * 4 + v) * 3);
      prm.set(params[i], (i * 4 + v) * 4);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  // `position` carries the base so three's bounds see the system's extent.
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aParams', new THREE.BufferAttribute(prm, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const MOTE_VERT = /* glsl */ `
uniform float uTime;
attribute vec2 aCorner;
attribute vec4 aParams; // seed, size, rise speed, column height
varying vec2 vCorner;
varying float vFade;
void main() {
  float seed = aParams.x;
  float t = uTime * aParams.z + seed * 17.0;
  float lift = fract(t / aParams.w);
  vec3 p = position;
  p.y += lift * aParams.w;
  p.x += sin(uTime * 0.21 + seed * 6.28) * 2.2 + sin(uTime * 0.73 + seed * 31.0) * 0.4;
  p.z += cos(uTime * 0.17 + seed * 5.1) * 2.2;
  vFade = smoothstep(0.0, 0.15, lift) * (1.0 - smoothstep(0.75, 1.0, lift));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += aCorner * aParams.y;
  vCorner = aCorner;
  gl_Position = projectionMatrix * mv;
}
`;
const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vCorner;
varying float vFade;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float a = (1.0 - d * d) * vFade * uAlpha;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

const GRIT_VERT = /* glsl */ `
uniform float uTime;
attribute vec2 aCorner;
attribute vec4 aParams; // seed, width, fall speed, drop
varying vec2 vCorner;
varying float vFade;
void main() {
  float seed = aParams.x;
  float fall = fract(uTime * aParams.z / aParams.w + seed);
  vec3 p = position;
  p.y -= fall * aParams.w;
  p.x += sin(seed * 41.0) * 0.25;
  vFade = smoothstep(0.0, 0.1, fall) * (1.0 - smoothstep(0.7, 1.0, fall));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // A streak: narrow, drawn out along its fall (view up).
  mv.x += aCorner.x * aParams.y;
  mv.y += aCorner.y * aParams.y * 6.0;
  vCorner = aCorner;
  gl_Position = projectionMatrix * mv;
}
`;
const GRIT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vCorner;
varying float vFade;
void main() {
  float a = (1.0 - abs(vCorner.x)) * (1.0 - vCorner.y * vCorner.y) * vFade * uAlpha;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

const HAZE_VERT = /* glsl */ `
uniform float uTime;
attribute vec2 aCorner;
attribute vec4 aParams; // seed, size, drift, aspect
varying vec2 vCorner;
varying float vSeed;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.05 + aParams.x * 6.28) * aParams.z;
  p.z += cos(uTime * 0.04 + aParams.x * 3.1) * aParams.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += aCorner * aParams.y * vec2(1.0, aParams.w);
  vCorner = aCorner;
  vSeed = aParams.x;
  gl_Position = projectionMatrix * mv;
}
`;
const HAZE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vCorner;
varying float vSeed;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float breathe = 0.75 + 0.25 * sin(uTime * 0.3 + vSeed * 9.0);
  float a = (1.0 - d) * (1.0 - d) * uAlpha * breathe;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

function airMaterial(
  name: string,
  vert: string,
  frag: string,
  color: number,
  alpha: number,
  additive: boolean,
): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    name,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: alpha },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return m;
}

function points(plan: HammerAirPlan) {
  const motes: [number, number, number][] = [];
  const moteP: [number, number, number, number][] = [];
  plan.motes.forEach((v, vi) => {
    for (let i = 0; i < v.count; i++) {
      const h = (k: number) => heartHash(vi * 1000 + i, k);
      motes.push([v.x + (h(1) - 0.5) * 2 * v.hw, v.y0, v.z + (h(2) - 0.5) * 2 * v.hd]);
      moteP.push([h(3), 0.05 + h(4) * 0.12, 0.25 + h(5) * 0.5, v.y1 - v.y0]);
    }
  });
  const grit: [number, number, number][] = [];
  const gritP: [number, number, number, number][] = [];
  plan.grit.forEach((s, si) => {
    const n = s.heavy ? 22 : 8;
    for (let i = 0; i < n; i++) {
      const h = (k: number) => heartHash(si * 100 + i, k + 40);
      grit.push([
        s.x + (h(1) - 0.5) * (s.heavy ? 2.4 : 0.8),
        s.top,
        s.z + (h(2) - 0.5) * (s.heavy ? 2.4 : 0.8),
      ]);
      gritP.push([h(3), s.heavy ? 0.07 : 0.04, s.heavy ? 6 + h(4) * 4 : 3 + h(4) * 3, s.drop]);
    }
  });
  const haze = plan.haze.map((c) => [c.x, c.y, c.z] as [number, number, number]);
  const hazeP = plan.haze.map(
    (c, i) =>
      [heartHash(i, 91), c.size, 3 + heartHash(i, 93) * 4, 0.32] as [
        number,
        number,
        number,
        number,
      ],
  );
  const geo = plan.geodes.map((g) => [g.x, g.y, g.z] as [number, number, number]);
  const geoP = plan.geodes.map(
    (g, i) => [heartHash(i, 97), g.size, 0, 1] as [number, number, number, number],
  );
  return { motes, moteP, grit, gritP, haze, hazeP, geo, geoP };
}

/** The vein's air, instance-local (a cosmetic group: the low tier builds a
 *  third of it). */
export function buildHammerAir(lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'smithHeartHammerAir';
  const p = points(planHammerAir(lowGfx ? 0.35 : 1));
  const add = (
    name: string,
    bases: [number, number, number][],
    params: [number, number, number, number][],
    mat: THREE.ShaderMaterial,
    order: number,
  ) => {
    if (bases.length === 0) return;
    const mesh = new THREE.Mesh(quadGeometry(bases, params), mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };
  add(
    'smithHeartDustMotes',
    p.motes,
    p.moteP,
    airMaterial('smithHeartDustMotes', MOTE_VERT, MOTE_FRAG, 0xffd9a0, 0.55, true),
    5,
  );
  add(
    'smithHeartGrit',
    p.grit,
    p.gritP,
    airMaterial('smithHeartGrit', GRIT_VERT, GRIT_FRAG, 0xb9a080, 0.6, false),
    6,
  );
  add(
    'smithHeartPitHaze',
    p.haze,
    p.hazeP,
    airMaterial('smithHeartPitHaze', HAZE_VERT, HAZE_FRAG, 0xc8a47a, 0.14, false),
    4,
  );
  add(
    'smithHeartGeodeHalos',
    p.geo,
    p.geoP,
    airMaterial('smithHeartGeodeHalos', HAZE_VERT, HAZE_FRAG, 0xff9a3a, 0.35, true),
    7,
  );
  return group;
}
