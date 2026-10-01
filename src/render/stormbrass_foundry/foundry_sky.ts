// The Stormbrass Foundry's sky and surroundings: a storm dome in daylight
// (dark rolling clouds lit from inside, shafts of daylight breaking through
// low in the south-west, the whole dome flaring white-blue when lightning hits
// the coil), and the mountain the shelf is cut into: a deep scree valley far
// below the drop, rock buttresses standing out of it round the shelf, flanks
// climbing to a ring of slate peaks. A dry storm: no rain, and no sea (the old
// cloud sea and rain veil read as a small island in the rain).
//
// All motion is shader-side on the shared clock (sharedUniforms.uTime); the
// flash is read from the same strike clock the coil's bolts use
// (foundry_plan_core.ts coilStrikeAt), once per drawn frame in the dome's own
// onBeforeRender. Counts shed with the graphics tier; every
// element is cosmetic (no telegraph, no actionable information), and the flash
// is a fill on the sky only, so it never masks a floor telegraph.

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_FOG_COLOR } from '../fog_scene_state';
import { sharedUniforms } from '../gfx';
import { STORMBRASS_FOUNDRY_SUN_DIRECTION } from '../interior_light_rig';
import { markSharedMaterial } from '../shared_resource';
import {
  COIL_TOP,
  coilStrikeAt,
  foundryHash,
  foundryValleyHeight,
  planFoundryButtresses,
} from './foundry_plan_core';

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

// ---- the mountain: valley, buttresses, peaks --------------------------------------------

/** Linear rock colours: dark slate low, a lighter weathered grey up the
 *  flanks, a thin snow on the heights. */
function rockColor(y: number, salt: number, out: number[]): void {
  const shade = 0.05 + foundryHash(salt, 9) * 0.03;
  if (y > 150) {
    out.push(0.42, 0.45, 0.5);
    return;
  }
  const up = Math.min(1, Math.max(0, (y + 90) / 200));
  const v = shade + up * 0.05;
  out.push(v, v + 0.006, v + 0.014);
}

function pushCone(
  positions: number[],
  colors: number[],
  indices: number[],
  base: number,
  c: { x: number; z: number; r: number; y0: number; y1: number; salt: number; sides: number },
): number {
  const cone = new THREE.ConeGeometry(c.r, c.y1 - c.y0, c.sides, 3);
  cone.translate(c.x, (c.y0 + c.y1) / 2, c.z);
  const p = cone.getAttribute('position');
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k);
    // A little ragged: jitter the rings.
    const j = (foundryHash(c.salt * 131 + k, 8) - 0.5) * c.r * 0.25;
    positions.push(p.getX(k) + j, y, p.getZ(k) - j);
    const snow = c.y1 > 120 && y > c.y0 + (c.y1 - c.y0) * 0.8;
    if (snow) colors.push(0.42, 0.45, 0.5);
    else rockColor(Math.min(y, 140), c.salt + k, colors);
  }
  const idx = cone.index;
  if (idx) for (let k = 0; k < idx.count; k++) indices.push(idx.getX(k) + base);
  const n = p.count;
  cone.dispose();
  return base + n;
}

function buildMountain(opts: FoundrySkyOptions): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  let base = 0;
  // The valley: a ridged heightfield from wall to wall of the peaks.
  const segX = Math.round(36 + 28 * opts.density);
  const segZ = Math.round(segX * 1.15);
  const halfX = 720;
  const halfZ = 830;
  for (let iz = 0; iz <= segZ; iz++) {
    for (let ix = 0; ix <= segX; ix++) {
      const x = -halfX + (ix / segX) * halfX * 2;
      const z = -halfZ + (iz / segZ) * halfZ * 2;
      const y = foundryValleyHeight(x, z);
      positions.push(x, y, z);
      rockColor(y, ix * 977 + iz, colors);
    }
  }
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * (segX + 1) + ix;
      const b = a + 1;
      const c = a + segX + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  base = (segX + 1) * (segZ + 1);
  // The buttresses round the shelf's flanks.
  planFoundryButtresses(opts.density).forEach((t, i) => {
    base = pushCone(positions, colors, indices, base, {
      x: t.x,
      z: t.z,
      r: t.r,
      y0: t.base,
      y1: t.top,
      salt: 500 + i,
      sides: 6,
    });
  });
  // The ring of peaks, on an oval round the long shelf.
  const count = Math.round(18 + 14 * opts.density);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + foundryHash(i, 4) * 0.2;
    const dist = 200 + foundryHash(i, 5) * 130;
    const h = 150 + foundryHash(i, 6) * 190;
    const r = 80 + foundryHash(i, 7) * 60;
    const x = Math.sin(a) * (114 + dist);
    const z = Math.cos(a) * (240 + dist);
    base = pushCone(positions, colors, indices, base, {
      x,
      z,
      r,
      y0: foundryValleyHeight(x, z) - 20,
      y1: foundryValleyHeight(x, z) + h,
      salt: i,
      sides: 7,
    });
  }
  // Flat-shaded facets come from the material (one shared program).
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    name: 'stormbrassPeaks',
  });
  markSharedMaterial(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'stormbrassPeaks';
  mesh.frustumCulled = false;
  return mesh;
}

/** The whole storm: the dome over the mountain, the valley, the buttresses
 *  and the ring of peaks (one merged rock mesh). */
export function buildFoundrySky(opts: FoundrySkyOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassSky';
  group.add(buildDome(opts));
  group.add(buildMountain(opts));
  return group;
}
