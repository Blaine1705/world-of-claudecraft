// The Stormbrass Foundry's molten brass: the river of it in the gulf under
// the Line Catwalk (fed by the furnace on its pier at the west end, spilling
// over the east end into the drop as a glowing fall), the pour streams from
// the ladles into the moulds on the crane pad, the heat haze over both, and
// the spark showers they throw (foundry_sparks.ts). The channel's trough, the
// furnace, the ladles and the moulds are kit pieces (foundry_kit_plan_core.ts);
// this module draws only the hot metal.
//
// Motion is shader-side on the shared clock; the pour streams follow the
// ladles' pure curve (ladleState) with one matrix write per stream in its own
// onBeforeRender, which also gates the pours' spark showers. Cosmetic only:
// nothing here is walkable or actionable, and the glow stays below the floor
// telegraphs (it lies six yards under the catwalk, in the gulf).

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_FIELD } from '../../sim/content/stormbrass_foundry_layout';
import { FOUNDRY_POUR_LINE } from '../../sim/content/stormbrass_foundry_machinery';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { sharedUniforms } from '../gfx';
import { markSharedGeometry, markSharedMaterial } from '../shared_resource';
import { radialGlowTexture } from '../textures';
import {
  FOUNDRY_MOLTEN_CHANNEL as C,
  FOUNDRY_KIT_SIZES,
  FOUNDRY_POUR_MOULDS,
  ladleState,
} from './foundry_kit_plan_core';
import { LADLE_TIP } from './foundry_machines';
import { buildFoundrySparks, type SparkEmitter, setSparkGate } from './foundry_sparks';

const ground = (x: number, z: number): number =>
  authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z);

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { s += noise(p) * a; p *= 2.07; a *= 0.5; }
  return s;
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// The channel: u runs along the flow (yards), v across (0..1). Plates of
// cooling slag (warped cells) drift east on the flow; the metal burns
// white-gold in the cracks between them and deep orange where the crust has
// not closed; the walls run cooler and redder.
const CHANNEL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uLength;
${NOISE}
#include <fog_pars_fragment>
void main() {
  float u = vUv.x * uLength;
  float v = vUv.y;
  vec2 p = vec2(u * 0.3 - uTime * 0.42, v * 2.7);
  vec2 w = p + (vec2(fbm(p * 0.6 + uTime * 0.02), fbm(p * 0.6 + 7.3)) - 0.5) * 1.1;
  vec2 cell = floor(w);
  vec2 f = fract(w);
  float d1 = 9.0;
  float d2 = 9.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash(cell + g), hash(cell + g + 13.7));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  float seam = d2 - d1;
  float heat = fbm(vec2(u * 0.09 - uTime * 0.16, v * 1.3));
  float wall = smoothstep(0.0, 0.2, v) * smoothstep(1.0, 0.8, v);
  // How far the crust has closed here: open metal in the hot lanes mid-flow.
  float closed = smoothstep(0.34, 0.6, heat + (1.0 - wall) * 0.3);
  vec3 vein = vec3(1.0, 0.8, 0.4);
  vec3 open = vec3(1.0, 0.36, 0.05);
  vec3 slag = vec3(0.13, 0.035, 0.012);
  vec3 ember = vec3(0.55, 0.11, 0.02);
  vec3 plate = mix(ember, slag, smoothstep(0.1, 0.42, seam));
  vec3 col = mix(open * (0.85 + 0.5 * fbm(p * 2.3)), plate, closed);
  col = mix(vein, col, smoothstep(0.0, 0.09 + 0.1 * closed, seam));
  col *= 0.7 + 0.4 * wall;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

// A fall or a pour: v runs down the stream (0 at the lip), u across. The
// stream narrows and breaks into gobbets as it falls; uPour fades it.
const FALL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uPour;
uniform float uLength;
${NOISE}
#include <fog_pars_fragment>
void main() {
  float d = vUv.y * uLength;
  float n = fbm(vec2(vUv.x * 4.0, d * 0.5 - uTime * 3.2));
  float width = mix(0.42, 0.18, smoothstep(0.0, 1.0, vUv.y));
  float body = smoothstep(width, width * 0.35, abs(vUv.x - 0.5) + (n - 0.5) * 0.12);
  float breakup = smoothstep(0.55, 1.0, vUv.y) * smoothstep(0.42, 0.62, n);
  float a = body * (1.0 - breakup) * uPour * smoothstep(1.0, 0.82, vUv.y);
  if (a < 0.02) discard;
  vec3 col = mix(vec3(1.0, 0.86, 0.5), vec3(1.0, 0.42, 0.08), smoothstep(0.1, 0.9, vUv.y) + n * 0.2);
  gl_FragColor = vec4(col * 1.3, a);
  #include <fog_fragment>
}
`;

function shader(name: string, frag: string, extra: Record<string, THREE.IUniform>, blend = false) {
  const m = new THREE.ShaderMaterial({
    name,
    vertexShader: VERT,
    fragmentShader: frag,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: sharedUniforms.uTime,
      ...extra,
    },
    transparent: blend,
    depthWrite: !blend,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: true,
  });
  return m;
}

/** The molten river: one plane over the trough's inside, flowing east. */
function buildChannel(): THREE.Mesh {
  const len = C.x1 - C.x0;
  const width = FOUNDRY_KIT_SIZES.channelInnerHalf * C.scale * 2;
  const geo = new THREE.PlaneGeometry(len, width, 1, 1).rotateX(-Math.PI / 2);
  geo.translate((C.x0 + C.x1) / 2, C.y, C.z);
  const mat = shader('stormbrassMoltenChannel', CHANNEL_FRAG, { uLength: { value: len } });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'stormbrassMoltenChannel';
  return mesh;
}

/** A vertical stream card pair hanging from (0, 0, 0) down `length` yards,
 *  `width` wide (two crossed planes, uv.y running down). */
function streamGeometry(width: number, length: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(width, length).translate(0, -length / 2, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  // PlaneGeometry's v runs up: flip so v = 0 at the lip.
  for (const g of [a, b]) {
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  const out = new THREE.BufferGeometry();
  const pa = a.getAttribute('position').array as Float32Array;
  const pb = b.getAttribute('position').array as Float32Array;
  const ua = a.getAttribute('uv').array as Float32Array;
  const ub = b.getAttribute('uv').array as Float32Array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa);
  pos.set(pb, pa.length);
  const uv = new Float32Array(ua.length + ub.length);
  uv.set(ua);
  uv.set(ub, ua.length);
  const ia = Array.from(a.index?.array ?? []);
  const ib = Array.from(b.index?.array ?? []).map((i) => i + pa.length / 3);
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex([...ia, ...ib]);
  out.computeBoundingSphere();
  a.dispose();
  b.dispose();
  return out;
}

/** The fall off the channel's east end, down into the drop. */
function buildFall(): THREE.Mesh {
  const length = C.y - C.fall.bottom;
  const geo = streamGeometry(5.5, length);
  geo.translate(C.fall.x, C.y + 0.2, C.z);
  const mat = shader(
    'stormbrassMoltenFall',
    FALL_FRAG,
    { uPour: { value: 1 }, uLength: { value: length } },
    true,
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'stormbrassMoltenFall';
  mesh.renderOrder = 6;
  return mesh;
}

/** The furnace's spout pouring into the channel's west end. */
function buildSpout(): THREE.Mesh {
  const geo = streamGeometry(2.2, 2.2);
  geo.translate(C.furnace.x + 3.4, C.furnace.y + 1.6, C.z);
  const mat = shader(
    'stormbrassMoltenSpout',
    FALL_FRAG,
    { uPour: { value: 1 }, uLength: { value: 2.2 } },
    true,
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'stormbrassMoltenSpout';
  mesh.renderOrder = 6;
  return mesh;
}

/** The ladles' pour streams, one per mould, following the pure ladle curve. */
function buildPourStreams(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassPourStreams';
  const L = FOUNDRY_POUR_LINE;
  const floor = ground(L.posts[0], L.railZ);
  const pivotY = floor + L.railLift - FOUNDRY_KIT_SIZES.ladleHang;
  const mouldTop = floor + 0.8;
  const length = pivotY - mouldTop;
  const geo = markSharedGeometry(streamGeometry(0.9, 1));
  FOUNDRY_POUR_MOULDS.forEach((_, lane) => {
    const pour = { value: 0 };
    const mat = shader(
      `stormbrassPour:${lane}`,
      FALL_FRAG,
      { uPour: pour, uLength: { value: length } },
      true,
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `stormbrassPour:${lane}`;
    mesh.renderOrder = 6;
    mesh.matrixAutoUpdate = false;
    // The ladles' phases (planFoundryMovers): half a round apart.
    const phase = lane * 0.5;
    const place = (): void => {
      const s = ladleState(sharedUniforms.uTime.value, phase, lane);
      const th = s.tip * LADLE_TIP;
      // The pouring lip (local 0, -0.6, 1.3 off the trunnions) after the tip.
      const ly = -0.6 * Math.cos(th) - 1.3 * Math.sin(th);
      const lz = -0.6 * Math.sin(th) + 1.3 * Math.cos(th);
      const top = pivotY + ly;
      mesh.position.set(s.x, top, L.railZ + lz);
      mesh.scale.set(0.6 + 0.4 * s.pour, Math.max(0.1, top - mouldTop), 1);
      mesh.updateMatrix();
      mesh.matrixWorld.multiplyMatrices(group.matrixWorld, mesh.matrix);
      pour.value = s.pour;
      setSparkGate(1 + lane, s.pour);
    };
    place();
    mesh.onBeforeRender = place;
    // Never culled: the stream follows its ladle down the rail, and its hook
    // is what gates the pour's sparks.
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  return group;
}

/** A soft heat glow hanging over the hot metal (additive cards). */
function buildHeatGlow(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassHeatGlow';
  const mat = new THREE.SpriteMaterial({
    map: radialGlowTexture(),
    color: 0xff7a26,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    name: 'stormbrassHeatGlow',
  });
  markSharedMaterial(mat);
  for (let x = C.x0 + 6; x < C.x1; x += 13) {
    const s = new THREE.Sprite(mat);
    s.position.set(x, C.y + 2.5, C.z);
    s.scale.set(16, 8, 1);
    group.add(s);
  }
  const L = FOUNDRY_POUR_LINE;
  const g = ground(L.furnace.x, L.furnace.z);
  for (const x of [L.furnace.x + 4, ...FOUNDRY_POUR_MOULDS]) {
    const s = new THREE.Sprite(mat);
    s.position.set(x, g + 1.6, L.railZ);
    s.scale.set(7, 4, 1);
    group.add(s);
  }
  return group;
}

/** The spark showers of the hot metal (and the grinder). */
export function moltenSparkEmitters(
  grinder: { x: number; z: number; rot: number } | null,
): SparkEmitter[] {
  const L = FOUNDRY_POUR_LINE;
  const pad = ground(L.furnace.x, L.furnace.z);
  const out: SparkEmitter[] = [];
  FOUNDRY_POUR_MOULDS.forEach((x, lane) => {
    // The splash off the mould, and the cascade down the stream from the lip.
    out.push({
      x,
      y: pad + 0.9,
      z: L.railZ,
      vx: 0,
      vy: 6.2,
      vz: 0,
      spread: 5.2,
      life: 1.2,
      gravity: 11,
      size: 0.13,
      count: 150,
      hue: 0,
      gate: 1 + lane,
    });
    out.push({
      x,
      y: pad + L.railLift - FOUNDRY_KIT_SIZES.ladleHang - 1.2,
      z: L.railZ + 0.8,
      vx: 0,
      vy: 0.6,
      vz: 0,
      spread: 2.4,
      life: 1.1,
      gravity: 10,
      size: 0.1,
      count: 90,
      hue: 0,
      gate: 1 + lane,
    });
  });
  // The pour furnace's mouth spitting.
  out.push({
    x: L.furnace.x + 3.4,
    y: pad + 1.4,
    z: L.furnace.z,
    vx: 1.8,
    vy: 2.6,
    vz: 0,
    spread: 1.9,
    life: 0.9,
    gravity: 9,
    size: 0.1,
    count: 36,
    hue: 0,
    gate: 0,
  });
  // The channel furnace's spout splashing into the river.
  out.push({
    x: C.furnace.x + 4,
    y: C.y + 0.4,
    z: C.z,
    vx: 1.6,
    vy: 3.2,
    vz: 0,
    spread: 2.8,
    life: 1.1,
    gravity: 9,
    size: 0.13,
    count: 60,
    hue: 0,
    gate: 0,
  });
  // Embers rising off the whole river on the heat.
  for (let x = C.x0 + 6; x < C.x1; x += 16) {
    out.push({
      x,
      y: C.y + 0.3,
      z: C.z,
      vx: 0.6,
      vy: 1.6,
      vz: 0,
      spread: 0.7,
      life: 3.2,
      gravity: -0.4,
      size: 0.09,
      count: 30,
      hue: 0,
      gate: 0,
      across: { x: 14, z: 6 },
    });
  }
  // The fall's lip, flinging gobbets out over the drop.
  out.push({
    x: C.fall.x,
    y: C.y + 0.3,
    z: C.z,
    vx: 2.2,
    vy: 1.4,
    vz: 0,
    spread: 2.4,
    life: 1.6,
    gravity: 9,
    size: 0.14,
    count: 50,
    hue: 0,
    gate: 0,
  });
  if (grinder) {
    const c = Math.cos(grinder.rot);
    const s = Math.sin(grinder.rot);
    const g = ground(grinder.x, grinder.z);
    // Off the wheel's rim, along the stand's local +x.
    out.push({
      x: grinder.x + 0.4 * c,
      y: g + 1.25,
      z: grinder.z - 0.4 * s,
      vx: 3.2 * c,
      vy: 1.4,
      vz: -3.2 * s,
      spread: 1.2,
      life: 0.55,
      gravity: 9,
      size: 0.06,
      count: 36,
      hue: 0,
      gate: 0,
    });
  }
  return out;
}

export interface FoundryMoltenOptions {
  lowGfx: boolean;
  /** 0..1 cosmetic density (tier shed). */
  density: number;
  /** Extra spark emitters (the coil's strike). */
  extraSparks: readonly SparkEmitter[];
  grinder: { x: number; z: number; rot: number } | null;
}

/** The whole hot-metal layer. */
export function buildFoundryMolten(opts: FoundryMoltenOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassMolten';
  group.add(buildChannel());
  group.add(buildFall());
  group.add(buildSpout());
  group.add(buildPourStreams());
  if (!opts.lowGfx) group.add(buildHeatGlow());
  group.add(
    buildFoundrySparks(
      [...moltenSparkEmitters(opts.grinder), ...opts.extraSparks],
      opts.lowGfx ? 0.35 : opts.density,
    ),
  );
  return group;
}
