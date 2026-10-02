// The Stormbrass Foundry's sparks and embers: every spark shower of the
// dressing in ONE instanced draw, each spark a streak whose whole flight is
// computed in the vertex shader from its emitter, its seed and the shared
// clock (sharedUniforms.uTime): no per-frame JavaScript per spark. The pours
// gate their showers on (a uniform per gate the painter writes once a frame:
// the ladles' pours, the coil's strike), the rest spit forever (the grinder,
// the furnaces' mouths, the molten channel's embers and its fall). Cosmetic
// only: counts shed with the effects tier.

import * as THREE from 'three';
import { sharedUniforms } from '../gfx';
import { markSharedMaterial } from '../shared_resource';

/** A spark emitter: where, which way and how hard, how long a spark lives. */
export interface SparkEmitter {
  x: number;
  y: number;
  z: number;
  /** Mean launch velocity (yd/s). */
  vx: number;
  vy: number;
  vz: number;
  /** Random spread of the launch velocity (yd/s). */
  spread: number;
  /** Seconds a spark lives. */
  life: number;
  /** Gravity (yd/s^2, negative rises: embers on the heat). */
  gravity: number;
  /** Streak width (yd). */
  size: number;
  count: number;
  /** 0 forge sparks (white-gold to red), 1 storm sparks (blue-white). */
  hue: number;
  /** Which gate switches it (0 is always on). */
  gate: number;
  /** Sideways spread of the emitter itself (a line of embers). */
  across?: { x: number; z: number };
}

/** Gates: 0 always on; the painter writes the rest each frame. */
export const SPARK_GATES = 5;

const VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute vec4 aParams; // spread, life, gravity, size
attribute vec4 aMisc;   // seed, hue, gate, across length
attribute vec2 aAcross;
uniform float uTime;
uniform float uGates[${SPARK_GATES}];
varying float vAge;
varying float vHue;
varying float vAlpha;
varying vec2 vUv;
#include <fog_pars_vertex>
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float seed = aMisc.x;
  float life = aParams.y;
  float cycle = uTime / life + seed;
  float k = fract(cycle);
  float gen = floor(cycle);
  vec3 r = vec3(h1(seed * 91.7 + gen * 3.1), h1(seed * 37.3 + gen * 5.7), h1(seed * 13.9 + gen * 1.3));
  float age = k * life;
  vec3 v = aVel + (r * 2.0 - 1.0) * aParams.x;
  vec3 origin = aOrigin + vec3(aAcross.x, 0.0, aAcross.y) * (h1(seed * 7.7 + gen) - 0.5) * aMisc.w;
  vec3 p = origin + v * age + vec3(0.0, -0.5 * aParams.z * age * age, 0.0);
  vec3 vel = v + vec3(0.0, -aParams.z * age, 0.0);
  float gate = uGates[int(aMisc.z + 0.5)];
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 vv = (modelViewMatrix * vec4(vel, 0.0)).xyz;
  vec2 dir = length(vv.xy) > 1e-4 ? normalize(vv.xy) : vec2(0.0, 1.0);
  // (side, dir) keeps the quad's winding facing the camera.
  vec2 side = vec2(dir.y, -dir.x);
  float len = aParams.w * (1.0 + min(6.0, length(vel) * 0.18));
  float w = aParams.w * gate;
  mv.xy += dir * position.y * len * gate + side * position.x * w;
  gl_Position = projectionMatrix * mv;
  vAge = k;
  vHue = aMisc.y;
  vAlpha = gate;
  vUv = position.xy + 0.5;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying float vAge;
varying float vHue;
varying float vAlpha;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float core = smoothstep(0.5, 0.0, abs(vUv.x - 0.5)) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  vec3 fire = mix(vec3(1.0, 0.92, 0.6), mix(vec3(1.0, 0.45, 0.08), vec3(0.6, 0.08, 0.02), smoothstep(0.5, 1.0, vAge)), smoothstep(0.0, 0.45, vAge));
  vec3 storm = mix(vec3(0.92, 0.97, 1.0), vec3(0.45, 0.65, 1.0), vAge);
  vec3 col = mix(fire, storm, vHue);
  float a = core * vAlpha * (1.0 - smoothstep(0.7, 1.0, vAge));
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * 1.6, a);
  #include <fog_fragment>
}
`;

let material: THREE.ShaderMaterial | null = null;
const gates = { value: new Array<number>(SPARK_GATES).fill(1) };

/** Write a gate (0..1) for this frame. Gate 0 stays on. */
export function setSparkGate(gate: number, value: number): void {
  if (gate > 0 && gate < SPARK_GATES) gates.value[gate] = Math.max(0, Math.min(1, value));
}

function sparkMaterial(): THREE.ShaderMaterial {
  if (!material) {
    material = new THREE.ShaderMaterial({
      name: 'stormbrassSparks',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: sharedUniforms.uTime,
        uGates: gates,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      // Additive: fog would add its grey to every spark at range.
      fog: false,
    });
    markSharedMaterial(material);
  }
  return material;
}

/** Every spark of every emitter in one instanced streak mesh. `density`
 *  (0..1) thins the counts on the lower tiers. */
export function buildFoundrySparks(emitters: readonly SparkEmitter[], density: number): THREE.Mesh {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  let total = 0;
  const counts = emitters.map((e) => Math.max(1, Math.round(e.count * density)));
  for (const c of counts) total += c;
  const origin = new Float32Array(total * 3);
  const vel = new Float32Array(total * 3);
  const params = new Float32Array(total * 4);
  const misc = new Float32Array(total * 4);
  const across = new Float32Array(total * 2);
  let i = 0;
  emitters.forEach((e, ei) => {
    for (let k = 0; k < counts[ei]; k++, i++) {
      origin.set([e.x, e.y, e.z], i * 3);
      vel.set([e.vx, e.vy, e.vz], i * 3);
      params.set([e.spread, e.life, e.gravity, e.size], i * 4);
      const len = e.across ? Math.hypot(e.across.x, e.across.z) : 0;
      misc.set([(k + 0.5) / counts[ei] + ei * 0.137, e.hue, e.gate, len], i * 4);
      across.set(len > 0 && e.across ? [e.across.x / len, e.across.z / len] : [0, 0], i * 2);
    }
  });
  geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
  geo.setAttribute('aVel', new THREE.InstancedBufferAttribute(vel, 3));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(misc, 4));
  geo.setAttribute('aAcross', new THREE.InstancedBufferAttribute(across, 2));
  geo.instanceCount = total;
  // Bound the whole flight of every spark (a few yards round each emitter).
  const box = new THREE.Box3();
  for (const e of emitters) {
    const reach =
      (Math.hypot(e.vx, e.vy, e.vz) + e.spread) * e.life +
      2 +
      (e.across ? Math.hypot(e.across.x, e.across.z) : 0);
    box.expandByPoint(
      new THREE.Vector3(
        e.x - reach,
        e.y - reach - Math.max(0, e.gravity) * e.life * e.life,
        e.z - reach,
      ),
    );
    box.expandByPoint(new THREE.Vector3(e.x + reach, e.y + reach, e.z + reach));
  }
  geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  geo.boundingBox = box;
  const mesh = new THREE.Mesh(geo, sparkMaterial());
  mesh.name = 'stormbrassSparks';
  mesh.renderOrder = 7;
  return mesh;
}
