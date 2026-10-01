// The Stormbrass Foundry's sky and surroundings: a storm dome in daylight
// (dark rolling clouds lit from inside, shafts of daylight breaking through
// low in the south-west, the whole dome flaring white-blue when lightning hits
// the coil), a ring of slate peaks round the shelf, a sea of cloud far below
// the drop, and a veil of rain gusting round the camera.
//
// All motion is shader-side on the shared clock (sharedUniforms.uTime); the
// flash is read from the same strike clock the coil's bolts use
// (foundry_plan_core.ts coilStrikeAt), once per drawn frame in the dome's own
// onBeforeRender. Counts and the rain shed with the graphics tier; every
// element is cosmetic (no telegraph, no actionable information), and the flash
// is a fill on the sky only, so it never masks a floor telegraph.

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_VOID_HEIGHT } from '../../sim/content/stormbrass_foundry_layout';
import { STORMBRASS_FOUNDRY_FOG_COLOR } from '../fog_scene_state';
import { sharedUniforms } from '../gfx';
import { STORMBRASS_FOUNDRY_SUN_DIRECTION } from '../interior_light_rig';
import { markSharedMaterial } from '../shared_resource';
import { COIL_TOP, coilStrikeAt, foundryHash } from './foundry_plan_core';

export interface FoundrySkyOptions {
  lowGfx: boolean;
  /** 0..1 cosmetic density (tier shed). */
  density: number;
}

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; }
  return s;
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uFlash;
uniform vec3 uSunDir;
uniform vec3 uFlashDir;
uniform vec3 uHorizon;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  vec3 zenith = vec3(0.11, 0.13, 0.17);
  vec3 col = mix(uHorizon, zenith, smoothstep(0.0, 0.7, up));
  // Rolling storm clouds on a flat projection of the dome.
  vec2 q = d.xz / max(0.12, d.y + 0.25) * 1.6;
  float t = uTime * 0.018;
  float c = fbm(q + vec2(t, t * 0.6));
  float c2 = fbm(q * 2.1 - vec2(t * 1.7, 0.0) + c);
  float cloud = smoothstep(0.35, 0.8, c * 0.6 + c2 * 0.5);
  vec3 dark = vec3(0.09, 0.1, 0.13);
  vec3 lit = vec3(0.36, 0.41, 0.49);
  // Daylight breaking through: the thin cloud toward the sun glows.
  float sunA = max(0.0, dot(d, normalize(uSunDir)));
  vec3 cloudCol = mix(lit, dark, cloud);
  cloudCol += vec3(0.86, 0.9, 0.96) * pow(sunA, 6.0) * (1.0 - cloud) * 0.7;
  col = mix(col, cloudCol, smoothstep(-0.05, 0.12, d.y));
  // Shafts of daylight fanning down from the break.
  float shaft = pow(sunA, 3.0) * (0.5 + 0.5 * noise(vec2(atan(d.x, d.z) * 18.0, 0.5)));
  col += vec3(0.82, 0.88, 0.94) * shaft * 0.14 * (1.0 - smoothstep(0.1, 0.6, d.y));
  // The strike: the clouds light from inside round the coil, the dome flares.
  float near = pow(max(0.0, dot(d, normalize(uFlashDir))), 5.0);
  col += vec3(0.8, 0.9, 1.0) * uFlash * (0.12 + near * 0.9 * (0.4 + cloud));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function buildDome(opts: FoundrySkyOptions): THREE.Mesh {
  const uniforms = {
    uTime: sharedUniforms.uTime,
    uFlash: { value: 0 },
    uSunDir: { value: STORMBRASS_FOUNDRY_SUN_DIRECTION.clone() },
    uFlashDir: { value: new THREE.Vector3(COIL_TOP.x, 180, COIL_TOP.z).normalize() },
    uHorizon: { value: new THREE.Color(STORMBRASS_FOUNDRY_FOG_COLOR) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'stormbrassSky',
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 40, 20), material);
  mesh.name = 'stormbrassSky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.onBeforeRender = () => {
    uniforms.uFlash.value = opts.lowGfx ? 0 : coilStrikeAt(sharedUniforms.uTime.value, 3).flash;
  };
  return mesh;
}

// ---- the cloud sea far below the drop ----------------------------------------------------

const SEA_VERT = /* glsl */ `
varying vec2 vXZ;
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vXZ = position.xz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const SEA_FRAG = /* glsl */ `
precision highp float;
varying vec2 vXZ;
uniform float uTime;
uniform vec3 uColor;
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  vec2 p = vXZ * 0.012 + vec2(uTime * 0.01, uTime * 0.004);
  float n = fbm(p) * 0.7 + fbm(p * 2.7 - uTime * 0.006) * 0.3;
  vec3 col = mix(uColor * 0.55, vec3(0.52, 0.57, 0.64), smoothstep(0.35, 0.8, n));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

function buildCloudSea(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    name: 'stormbrassCloudSea',
    vertexShader: SEA_VERT,
    fragmentShader: SEA_FRAG,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: sharedUniforms.uTime,
      uColor: { value: new THREE.Color(STORMBRASS_FOUNDRY_FOG_COLOR) },
    },
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), material);
  mesh.position.y = STORMBRASS_FOUNDRY_VOID_HEIGHT + 30;
  mesh.name = 'stormbrassCloudSea';
  mesh.frustumCulled = false;
  return mesh;
}

// ---- the ring of peaks -------------------------------------------------------------------

function buildPeaks(opts: FoundrySkyOptions): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  const count = Math.round(18 + 14 * opts.density);
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  let base = 0;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + foundryHash(i, 4) * 0.2;
    const dist = 330 + foundryHash(i, 5) * 150;
    const h = 90 + foundryHash(i, 6) * 170;
    const r = 70 + foundryHash(i, 7) * 60;
    const cone = new THREE.ConeGeometry(r, h, 7, 3);
    cone.translate(
      Math.sin(a) * dist,
      STORMBRASS_FOUNDRY_VOID_HEIGHT + h / 2 - 10,
      Math.cos(a) * dist,
    );
    const p = cone.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      // A little ragged: jitter the rings, snow-dust the top fifth. Linear
      // colours: dark slate rock under a thin snow.
      const y = p.getY(k);
      const j = (foundryHash(i * 131 + k, 8) - 0.5) * r * 0.25;
      positions.push(p.getX(k) + j, y, p.getZ(k) - j);
      const snow = y > STORMBRASS_FOUNDRY_VOID_HEIGHT + h * 0.8 ? 1 : 0;
      const shade = 0.05 + foundryHash(i + k, 9) * 0.03;
      colors.push(snow ? 0.42 : shade, snow ? 0.45 : shade + 0.008, snow ? 0.5 : shade + 0.018);
    }
    const idx = cone.index;
    if (idx) for (let k = 0; k < idx.count; k++) indices.push(idx.getX(k) + base);
    base += p.count;
    geos.push(cone);
  }
  for (const g of geos) g.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    name: 'stormbrassPeaks',
  });
  markSharedMaterial(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'stormbrassPeaks';
  return mesh;
}

// ---- rain round the camera -----------------------------------------------------------------

const RAIN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RAIN_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 g = vec2(vUv.x * 220.0, vUv.y * 5.0 + uTime * 3.2);
  vec2 cell = floor(g);
  float h = hash(cell);
  float streak = smoothstep(0.96, 1.0, h) * smoothstep(0.0, 0.4, fract(g.y)) * (1.0 - fract(g.y));
  float gust = 0.55 + 0.45 * sin(uTime * 0.3 + vUv.x * 6.0);
  gl_FragColor = vec4(vec3(0.82, 0.87, 0.93), streak * 0.35 * gust);
}
`;

function buildRain(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    name: 'stormbrassRain',
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    uniforms: { uTime: sharedUniforms.uTime },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 40, 24, 1, true), material);
  mesh.name = 'stormbrassRain';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  const cam = new THREE.Vector3();
  mesh.onBeforeRender = (_r, _s, camera) => {
    // Follow the camera (one matrix write, only while drawn).
    camera.getWorldPosition(cam);
    mesh.matrixWorld.makeTranslation(cam.x, cam.y + 6, cam.z);
  };
  return mesh;
}

/** The whole storm: dome, peaks, cloud sea and (on richer tiers) the rain. */
export function buildFoundrySky(opts: FoundrySkyOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassSky';
  group.add(buildDome(opts));
  group.add(buildCloudSea());
  group.add(buildPeaks(opts));
  if (!opts.lowGfx && opts.density >= 0.6) group.add(buildRain());
  return group;
}
