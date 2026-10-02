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
uniform float uSheet;
${NOISE_GLSL}
// A sheet of lightning deep inside the cloud deck: a short double pulse on
// its own slow clock, lighting the clouds round one bearing.
float sheet(vec3 d, float period, float offset, vec3 bearing) {
  float beat = floor(uTime / period + offset);
  float into = fract(uTime / period + offset) * period;
  float lit = step(into, 0.34) * (step(into, 0.1) + step(0.17, into)) * 0.5 * step(0.35, hash(vec2(beat, offset)));
  vec3 b = normalize(bearing + vec3(hash(vec2(beat, 3.0)) - 0.5, 0.0, hash(vec2(beat, 7.0)) - 0.5) * 0.9);
  return lit * pow(max(0.0, dot(d, b)), 9.0);
}
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  // A deep storm: near-black blue overhead, the haze's own grey-blue low down.
  vec3 zenith = vec3(0.03, 0.042, 0.075);
  vec3 col = mix(uHorizon, zenith, smoothstep(0.0, 0.55, up));
  // Two decks of rolling cloud on a flat projection of the dome: a slow,
  // heavy anvil deck and a faster scud under it.
  vec2 q = d.xz / max(0.12, d.y + 0.25) * 1.6;
  float t = uTime * 0.018;
  float c = fbm(q + vec2(t, t * 0.6));
  float c2 = fbm(q * 2.1 - vec2(t * 1.7, 0.0) + c);
  float scud = fbm(q * 4.3 + vec2(t * 3.4, -t * 1.2));
  float cloud = smoothstep(0.32, 0.78, c * 0.6 + c2 * 0.5);
  float billow = smoothstep(0.25, 0.75, c2 * 0.7 + scud * 0.4);
  vec3 dark = vec3(0.02, 0.027, 0.046);
  vec3 lit = vec3(0.115, 0.155, 0.24);
  // Daylight breaking through low in the west: the thin cloud toward the
  // sun burns pale gold-white, and the deck's rims catch it.
  float sunA = max(0.0, dot(d, normalize(uSunDir)));
  vec3 cloudCol = mix(lit, dark, cloud);
  cloudCol = mix(cloudCol, cloudCol * 1.45 + vec3(0.03, 0.035, 0.05), billow * (1.0 - cloud) * 0.6);
  cloudCol += vec3(1.0, 0.74, 0.42) * pow(sunA, 26.0) * (1.0 - cloud * 0.6) * 1.1;
  cloudCol += vec3(0.95, 0.6, 0.34) * pow(sunA, 6.0) * (1.0 - cloud) * (0.25 + billow * 0.45) * 0.34;
  col = mix(col, cloudCol, smoothstep(-0.05, 0.12, d.y));
  // Shafts of daylight fanning down from the break.
  float shaft = pow(sunA, 3.0) * (0.5 + 0.5 * noise(vec2(atan(d.x, d.z) * 18.0, 0.5)));
  col += vec3(1.0, 0.8, 0.55) * shaft * 0.3 * (1.0 - smoothstep(0.08, 0.55, d.y));
  // Sheet lightning walking round the storm, far off.
  float far = sheet(d, 5.3, 0.0, vec3(-0.6, 0.35, 0.7)) + sheet(d, 7.1, 0.37, vec3(0.8, 0.3, -0.4))
    + sheet(d, 9.7, 0.71, vec3(0.1, 0.4, 1.0));
  col += vec3(0.62, 0.74, 1.0) * far * (0.7 + cloud) * 1.5 * uSheet;
  // The strike: the clouds light from inside round the coil, the dome flares.
  float near = pow(max(0.0, dot(d, normalize(uFlashDir))), 5.0);
  col += vec3(0.8, 0.9, 1.0) * uFlash * (0.14 + near * 1.1 * (0.4 + cloud));
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
    // The far sheet lightning sheds on the low tier with the strike flash.
    uSheet: { value: opts.lowGfx ? 0 : 1 },
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

/** One rock massif: a many-sided cone whose rings swell and pinch with the
 *  bearing (ridges and ravines running down from an off-centre summit), shaded
 *  by height, ravine depth and a ragged snow line. `haze` (0..1) washes a far
 *  range toward the storm's grey so the ranges layer back in depth. */
function pushMassif(
  positions: number[],
  colors: number[],
  indices: number[],
  base: number,
  c: {
    x: number;
    z: number;
    r: number;
    y0: number;
    y1: number;
    salt: number;
    sides: number;
    rings: number;
    haze: number;
  },
): number {
  const ridges = 3 + Math.floor(foundryHash(c.salt, 11) * 3);
  const phase = foundryHash(c.salt, 12) * Math.PI * 2;
  const lean = (foundryHash(c.salt, 13) - 0.5) * c.r * 0.5;
  const lean2 = (foundryHash(c.salt, 14) - 0.5) * c.r * 0.5;
  const h = c.y1 - c.y0;
  const tint = (v: number, cold: number) => {
    const g = 0.18;
    colors.push(
      v + (g - v) * c.haze,
      v + 0.006 + (g + 0.02 - v) * c.haze,
      v + cold + (g + 0.05 - v) * c.haze,
    );
  };
  for (let ring = 0; ring <= c.rings; ring++) {
    const t = ring / c.rings;
    // A concave flank: steep under the summit, spreading at the foot.
    const rr = c.r * (1 - t) ** 1.35;
    for (let k = 0; k < c.sides; k++) {
      const a = (k / c.sides) * Math.PI * 2;
      const ridge =
        Math.cos(a * ridges + phase + t * 1.7) * 0.26 +
        (foundryHash(c.salt * 131 + k * 17 + ring, 8) - 0.5) * 0.22;
      const swell = 1 + ridge * (0.35 + 0.65 * (1 - t));
      const y =
        c.y0 + h * t + (foundryHash(c.salt * 57 + k + ring * 31, 9) - 0.5) * h * 0.05 * (1 - t);
      positions.push(
        c.x + Math.cos(a) * rr * swell + lean * t,
        y,
        c.z + Math.sin(a) * rr * swell + lean2 * t,
      );
      const snowLine = 0.62 + ridge * 0.35;
      if (c.y1 > 150 && t > snowLine) tint(0.34 + (t - snowLine) * 0.3, 0.035);
      else tint(0.045 + t * 0.06 + Math.max(0, ridge) * 0.07, 0.012);
    }
  }
  for (let ring = 0; ring < c.rings; ring++) {
    for (let k = 0; k < c.sides; k++) {
      const a0 = base + ring * c.sides + k;
      const a1 = base + ring * c.sides + ((k + 1) % c.sides);
      const b0 = a0 + c.sides;
      const b1 = a1 + c.sides;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }
  return base + (c.rings + 1) * c.sides;
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
    base = pushMassif(positions, colors, indices, base, {
      x: t.x,
      z: t.z,
      r: t.r,
      y0: t.base,
      y1: t.top,
      salt: 500 + i,
      sides: 9,
      rings: 4,
      haze: 0,
    });
  });
  // Two ranges on ovals round the long shelf: the near wall of the valley
  // (broad, ridged, snow on the heights) and a taller far range washed into
  // the storm haze behind its gaps.
  const near = Math.round(14 + 10 * opts.density);
  for (let i = 0; i < near; i++) {
    const a = (i / near) * Math.PI * 2 + foundryHash(i, 4) * 0.25;
    const dist = 210 + foundryHash(i, 5) * 110;
    const x = Math.sin(a) * (114 + dist);
    const z = Math.cos(a) * (240 + dist);
    const y0 = foundryValleyHeight(x, z) - 30;
    base = pushMassif(positions, colors, indices, base, {
      x,
      z,
      r: 130 + foundryHash(i, 7) * 90,
      y0,
      y1: y0 + 170 + foundryHash(i, 6) * 150,
      salt: i,
      sides: 14,
      rings: 6,
      haze: 0,
    });
  }
  const far = Math.round(10 + 8 * opts.density);
  for (let i = 0; i < far; i++) {
    const a = ((i + 0.5) / far) * Math.PI * 2 + foundryHash(i, 44) * 0.3;
    const dist = 470 + foundryHash(i, 45) * 160;
    const x = Math.sin(a) * (114 + dist);
    const z = Math.cos(a) * (240 + dist);
    base = pushMassif(positions, colors, indices, base, {
      x,
      z,
      r: 210 + foundryHash(i, 47) * 130,
      y0: -80,
      y1: 330 + foundryHash(i, 46) * 230,
      salt: 200 + i,
      sides: 14,
      rings: 6,
      haze: 0.45,
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
