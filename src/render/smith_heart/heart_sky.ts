// The Smith's Heart's sky: the storm over Stormcrag seen up out of the
// mountain's fissures. A bruised slate deck racing over the summits, torn
// so a colder grey shows through, and lightning walking inside the cloud
// (no sun: the light comes from the storm and the veins). One shader on the
// dome, no light; the blockout borrows the Sunken Bastion's storm-dusk fog
// and light state, so the horizon is that fog's colour.
//
// The dome's onBeforeRender is the slot's frame driver: the dome draws every
// frame the interior is shown (never culled), so the gates, the seal and the
// light-rivers advance from here even while they are off screen.

import * as THREE from 'three';
import { SUNKEN_BASTION_FOG_COLOR } from '../fog_scene_state';
import { sharedUniforms } from '../gfx';

export interface HeartSkyOptions {
  lowGfx: boolean;
  /** Called once per drawn frame (the interior's frame driver). */
  onFrame: () => void;
}

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
uniform float uDetail;
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
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  // Slate overhead, a colder grey band, the fog at the rim (linear values).
  vec3 zenith = vec3(0.02, 0.024, 0.032);
  vec3 band = vec3(0.07, 0.078, 0.09);
  vec3 col = mix(band, zenith, smoothstep(0.08, 0.75, up));
  col = mix(uHorizon, col, smoothstep(-0.03, 0.22, up));
  // The deck: two warped decks racing over the summits.
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
  // Lightning inside the deck, anywhere round the sky.
  float ba; float bb;
  float fa = strike(uTime, 8.0, ba);
  float fb = strike(uTime + 3.7, 11.0, bb);
  float azim = atan(d.x, d.z) / 6.2831853 + 0.5;
  float nearA = 1.0 - smoothstep(0.0, 0.08, abs(azim - ba));
  float nearB = 1.0 - smoothstep(0.0, 0.07, abs(azim - bb));
  float lit = (fa * nearA + fb * nearB) * smoothstep(-0.02, 0.1, up);
  col += vec3(0.42, 0.48, 0.66) * lit * (0.35 + 0.9 * cloud);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** The dome (and the slot's frame driver). */
export function buildHeartSky(opts: HeartSkyOptions): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    name: 'smithHeartSky',
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uHorizon: { value: new THREE.Color(SUNKEN_BASTION_FOG_COLOR) },
      uDetail: { value: opts.lowGfx ? 0.4 : 1 },
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
  mesh.onBeforeRender = () => {
    const now = sharedUniforms.uTime.value;
    if (now === stamp) return;
    stamp = now;
    opts.onFrame();
  };
  return mesh;
}
