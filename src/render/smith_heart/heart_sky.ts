// The Smith's Heart's sky, one dome for both areas of the slot:
//   - over the main map, the storm over Stormcrag seen up out of the
//     mountain's fissures: a bruised slate deck racing over the summits, torn
//     so a colder grey shows through, and lightning walking inside the cloud;
//   - over the Heart, the sky seen up out of the chamber inside the mountain:
//     a deep ember-violet night full of slow stars, warm veils drifting where
//     the heart's light catches the high air, no storm at all.
// `uCore` blends the two (heart_portal_core.ts heartAreaBlend eases it after
// a hop, so the sky turns as the raid arrives). One shader on the dome, no
// light; the horizon is the area's fog colour.
//
// The dome's onBeforeRender is the slot's frame driver: the dome draws every
// frame the interior is shown (never culled), so the gates, the seal, the
// portals and the light-rivers advance from here even while they are off
// screen. It hands the driver the camera (the area, the hop and the wash).

import * as THREE from 'three';
import { SUNKEN_BASTION_FOG_COLOR } from '../fog_scene_state';
import { sharedUniforms } from '../gfx';

export interface HeartSkyOptions {
  lowGfx: boolean;
  /** Called once per drawn frame (the interior's frame driver), with the
   *  camera's world position. */
  onFrame: (camera: THREE.Vector3) => void;
}

/** The Heart's horizon: an ember-violet dark (its fog state's colour). */
export const HEART_CORE_FOG_COLOR = 0x1c1424;

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
uniform vec3 uHorizon;
uniform vec3 uCoreHorizon;
uniform float uDetail;
uniform float uCore;
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
// One lightning cell: a flash of two or three flickers at a hashed moment
// and bearing inside each cell of the schedule.
float strike(float t, float cell, out float bearing) {
  float k = floor(t / cell);
  float h = hash(vec2(k, 5.3));
  bearing = hash(vec2(k, 2.9));
  float x = t - k * cell - h * (cell - 1.2);
  if (x < 0.0 || x > 0.8) return 0.0;
  float flick = (1.0 - smoothstep(0.0, 0.07, x))
    + step(0.2, x) * (1.0 - smoothstep(0.2, 0.3, x)) * 0.7;
  return flick * step(0.3, hash(vec2(k, 8.1)));
}
vec3 stormSky(vec3 d, float up) {
  // Slate overhead, a colder grey band, the fog at the rim (linear values).
  vec3 zenith = vec3(0.02, 0.024, 0.032);
  vec3 band = vec3(0.07, 0.078, 0.09);
  vec3 col = mix(band, zenith, smoothstep(0.08, 0.75, up));
  col = mix(uHorizon, col, smoothstep(-0.03, 0.22, up));
  float cloud = 0.0;
  float rim = 0.0;
  if (up > -0.08) {
    vec2 uv = d.xz / (up + 0.18);
    vec2 wind = vec2(uTime * 0.016, -uTime * 0.009);
    vec2 warp = vec2(fbm(uv * 0.32 + 2.0 + wind), fbm(uv * 0.32 - 5.0 - wind)) * 1.5;
    float c1 = fbm(uv * 0.45 + warp + wind * 1.4);
    float c2 = fbm(uv * 1.2 - warp * 0.5 + wind * 2.6 + 9.0);
    float c = c1 * 0.7 + c2 * 0.4 * uDetail;
    cloud = smoothstep(0.4, 0.74, c) * smoothstep(-0.06, 0.12, up);
    rim = smoothstep(0.52, 0.42, c) * smoothstep(0.36, 0.44, c);
  }
  vec3 belly = vec3(0.018, 0.02, 0.026);
  vec3 lifted = vec3(0.1, 0.105, 0.115);
  vec3 cloudCol = mix(belly, lifted, smoothstep(0.0, 0.7, up + 0.25));
  col = mix(col, cloudCol, cloud * 0.92);
  col += vec3(0.05, 0.055, 0.065) * rim;
  float ba; float bb;
  float fa = strike(uTime, 8.0, ba);
  float fb = strike(uTime + 3.7, 11.0, bb);
  float azim = atan(d.x, d.z) / 6.2831853 + 0.5;
  float nearA = 1.0 - smoothstep(0.0, 0.08, abs(azim - ba));
  float nearB = 1.0 - smoothstep(0.0, 0.07, abs(azim - bb));
  float lit = (fa * nearA + fb * nearB) * smoothstep(-0.02, 0.1, up);
  col += vec3(0.42, 0.48, 0.66) * lit * (0.35 + 0.9 * cloud);
  return col;
}
vec3 coreSky(vec3 d, float up) {
  // Ember-violet night: warm low (the heart's light on the high air), deep
  // violet-black overhead.
  vec3 zenith = vec3(0.006, 0.004, 0.014);
  vec3 low = vec3(0.07, 0.03, 0.03);
  vec3 col = mix(low, zenith, smoothstep(0.02, 0.7, up));
  col = mix(uCoreHorizon, col, smoothstep(-0.05, 0.2, up));
  if (up > 0.0) {
    vec2 sp = d.xz / (up + 0.2);
    // Stars in three sizes, slow twinkle.
    for (int k = 0; k < 3; k++) {
      float sc = 26.0 + float(k) * 31.0;
      vec2 cell = floor(sp * sc + float(k) * 17.0);
      vec2 f = fract(sp * sc + float(k) * 17.0) - 0.5;
      float h = hash(cell);
      float star = step(0.986 - float(k) * 0.004, h) * smoothstep(0.16 - float(k) * 0.03, 0.0, length(f));
      float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h * 2.5) + h * 40.0);
      col += mix(vec3(1.0, 0.86, 0.7), vec3(0.75, 0.82, 1.0), hash(cell + 3.7)) * star * tw * (1.3 - float(k) * 0.35) * smoothstep(0.04, 0.35, up);
    }
    // Warm veils drifting where the heart's light catches the air.
    vec2 vv = sp * 0.55 + vec2(uTime * 0.006, -uTime * 0.004);
    float veil = fbm(vv + fbm(vv * 1.7) * 0.8);
    col += vec3(0.32, 0.12, 0.05) * smoothstep(0.52, 0.85, veil) * (1.0 - smoothstep(0.1, 0.8, up)) * uDetail;
    col += vec3(0.08, 0.04, 0.12) * smoothstep(0.6, 0.9, fbm(vv * 0.6 + 4.0)) * smoothstep(0.2, 0.9, up);
  }
  return col;
}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = uCore < 0.999 ? stormSky(d, up) : vec3(0.0);
  if (uCore > 0.001) col = mix(col, coreSky(d, up), uCore);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export interface HeartSky {
  mesh: THREE.Mesh;
  /** Blend the dome toward the Heart's sky (0 the storm, 1 the Heart). */
  setCore(k: number): void;
}

/** The dome (and the slot's frame driver). */
export function buildHeartSky(opts: HeartSkyOptions): HeartSky {
  const material = new THREE.ShaderMaterial({
    name: 'smithHeartSky',
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uHorizon: { value: new THREE.Color(SUNKEN_BASTION_FOG_COLOR) },
      uCoreHorizon: { value: new THREE.Color(HEART_CORE_FOG_COLOR) },
      uDetail: { value: opts.lowGfx ? 0.4 : 1 },
      uCore: { value: 0 },
    },
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), material);
  mesh.name = 'smithHeartSky';
  mesh.frustumCulled = false;
  // Once per frame (a hook also fires for shadow passes; the dome casts none).
  let stamp = -1;
  const camera = new THREE.Vector3();
  mesh.onBeforeRender = (_renderer, _scene, cam) => {
    const now = sharedUniforms.uTime.value;
    if (now === stamp) return;
    stamp = now;
    cam.getWorldPosition(camera);
    opts.onFrame(camera);
  };
  let core = -1;
  return {
    mesh,
    setCore(k) {
      const q = Math.round(k * 200) / 200;
      if (q === core) return;
      core = q;
      material.uniforms.uCore.value = q;
    },
  };
}
