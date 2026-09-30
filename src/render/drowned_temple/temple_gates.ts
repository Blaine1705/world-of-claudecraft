// The Drowned Temple's gates and seals as structures: the Choir Veil (a
// curtain of water falling from its arch across the Choir Stair, parting down
// the middle), the warded arches of the Court Stairs and the Prism Ward (a
// membrane of moonlight with drifting glyphs, dissolving upward), the Prism
// Stair that RISES out of the lagoon as the Hydra's pool drains, the Moonbridge
// that assembles plank by plank out of moonlight, and the Altar Ward's rite
// disc that shatters.
//
// Each gate reads its on-screen state from the shared gate memory
// (../hollow_crypt/crypt_gate_state_core.ts, fed by the mirrored gate entities
// through ../gate_objects.ts) in an onBeforeRender hook, so a state swap plays
// as a reveal and costs nothing off screen. A sealed gate flares.

import * as THREE from 'three';
import { DROWNED_TEMPLE_GATES } from '../../sim/content/drowned_temple';
import { DROWNED_TEMPLE_FIELD, MOONBRIDGE } from '../../sim/content/drowned_temple_layout';
import type { FieldPathSurface } from '../../sim/instances/authored_field/types';
import type { DungeonGateDef } from '../../sim/types';
import { GFX, sharedUniforms } from '../gfx';
import { gateMemoryKey, gateView } from '../hollow_crypt/crypt_gate_state_core';
import { templeKitPiece, templeSlotMaterial } from './temple_kit';

interface GateRig {
  root: THREE.Group;
  /** Called every rendered frame with the gate's openness and seal pulse. */
  apply(openness: number, seal: number, since: number): void;
}

const SHEET_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// ---- the Choir Veil: a curtain of falling water that parts ------------------------------

const VEIL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uOpen;
uniform float uSeal;
${NOISE}
void main() {
  float u = vUv.x;
  float t = 1.0 - vUv.y;
  // The curtain parts from the middle outward; the two halves thin to threads.
  float gap = abs(u - 0.5) * 2.0;
  float part = smoothstep(uOpen * 1.1 - 0.08, uOpen * 1.1 + 0.06, gap + (noise(vec2(u * 20.0, t * 4.0 - uTime)) - 0.5) * 0.1);
  vec2 q = vec2(u * 34.0, t * 5.0 - uTime * 5.5);
  float streak = noise(vec2(q.x, q.y * 0.3)) * 0.6 + noise(vec2(q.x * 2.1, q.y * 0.7)) * 0.4;
  float white = smoothstep(0.6, 0.95, streak) + smoothstep(0.1, 0.0, t) * 0.5 + smoothstep(0.9, 1.0, t) * 0.6;
  vec3 col = mix(vec3(0.3, 0.42, 0.58), vec3(0.85, 0.9, 1.0), clamp(white, 0.0, 1.0));
  // Sealed while Selthe sings: the water burns gold with her choir.
  col = mix(col, vec3(1.0, 0.82, 0.45), uSeal * 0.55 * (0.6 + 0.4 * streak));
  float a = (0.42 + 0.4 * smoothstep(0.3, 0.7, streak)) * part * smoothstep(0.0, 0.04, u) * smoothstep(1.0, 0.96, u);
  gl_FragColor = vec4(col, a * (0.85 + 0.15 * uSeal));
  #include <colorspace_fragment>
}
`;

function waterVeil(gate: DungeonGateDef): GateRig {
  const width = gate.hw * 2 + 1.6;
  const height = 12.6;
  const uniforms = { uTime: sharedUniforms.uTime, uOpen: { value: 0 }, uSeal: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    name: 'drownedTempleWaterVeil',
    vertexShader: SHEET_VERT,
    fragmentShader: VEIL_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const root = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), material);
  sheet.position.set(0, height / 2 - 0.2, 0);
  sheet.renderOrder = 9;
  root.add(sheet);
  // The arch the curtain falls from (legs out in the water either side).
  root.add(kitPieceMesh('Kit_VeilArch', 0, -1.6, 0, 0));
  return {
    root,
    apply(openness, seal) {
      uniforms.uOpen.value = openness;
      uniforms.uSeal.value = seal;
    },
  };
}

// ---- a warded arch: a membrane of moonlight ----------------------------------------------

const WARD_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uOpen;
uniform float uSeal;
uniform vec3 uTint;
${NOISE}
void main() {
  vec2 p = vUv * vec2(6.0, 5.0);
  float n = noise(p + vec2(0.0, -uTime * 0.4)) * 0.6 + noise(p * 2.3 + uTime * 0.2) * 0.4;
  // Glyphs drifting up the membrane.
  vec2 g = fract(vec2(vUv.x * 6.0, vUv.y * 4.0 - uTime * 0.15));
  float glyph = smoothstep(0.1, 0.0, abs(g.x - 0.5) - 0.08) * smoothstep(0.1, 0.0, abs(g.y - 0.5) - 0.2)
    * step(0.55, hash(floor(vec2(vUv.x * 6.0, vUv.y * 4.0 - uTime * 0.15))));
  // Dissolves upward as it opens.
  float gone = smoothstep(uOpen * 1.2 - 0.1, uOpen * 1.2 + 0.05, vUv.y + (n - 0.5) * 0.2);
  float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  vec3 col = uTint * (0.5 + 0.6 * n) + vec3(1.0) * glyph * 0.6;
  col = mix(col, vec3(1.0, 0.8, 0.5), uSeal * 0.5);
  float a = (0.28 + 0.25 * n + glyph * 0.4) * gone * edge * (1.0 + uSeal * 0.6);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
  #include <colorspace_fragment>
}
`;

function wardedArch(gate: DungeonGateDef, tint: number): GateRig {
  const width = gate.hw * 2;
  const height = 9.5;
  const uniforms = {
    uTime: sharedUniforms.uTime,
    uOpen: { value: 0 },
    uSeal: { value: 0 },
    uTint: { value: new THREE.Color(tint) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'drownedTempleWard',
    vertexShader: SHEET_VERT,
    fragmentShader: WARD_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const root = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), material);
  sheet.position.set(0, height / 2, 0);
  sheet.renderOrder = 9;
  root.add(sheet);
  root.add(kitPieceMesh('Kit_WardArch', 0, 0, 0, 0, (width + 1.6) / 12.6));
  return {
    root,
    apply(openness, seal) {
      uniforms.uOpen.value = openness;
      uniforms.uSeal.value = seal;
    },
  };
}

// ---- the Altar Ward: a spinning rite disc that shatters ----------------------------------

const RITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uOpen;
uniform float uSeal;
${NOISE}
void main() {
  vec2 q = vUv - 0.5;
  float r = length(q) * 2.0;
  float a = atan(q.y, q.x) + uTime * 0.4;
  float rings = smoothstep(0.03, 0.0, abs(r - 0.92)) + smoothstep(0.02, 0.0, abs(r - 0.6)) * 0.8
    + smoothstep(0.02, 0.0, abs(r - 0.3)) * 0.6;
  float spokes = smoothstep(0.02, 0.0, abs(sin(a * 6.0)) * r - 0.0) * step(0.3, r) * step(r, 0.92) * 0.5;
  float cell = hash(floor(vec2(a * 3.0, r * 8.0)));
  float crack = step(uOpen * 1.1, cell);
  float fill = smoothstep(1.0, 0.0, r) * 0.18;
  vec3 col = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.55), uSeal);
  float alpha = (rings + spokes + fill) * crack * step(r, 1.0);
  gl_FragColor = vec4(col * (1.0 + uSeal), clamp(alpha, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

function riteWard(gate: DungeonGateDef): GateRig {
  const width = gate.hw * 2;
  const uniforms = { uTime: sharedUniforms.uTime, uOpen: { value: 0 }, uSeal: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    name: 'drownedTempleRiteWard',
    vertexShader: SHEET_VERT,
    fragmentShader: RITE_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const root = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(width, width, 1, 1), material);
  disc.position.set(0, width / 2 + 0.2, 0);
  disc.renderOrder = 9;
  root.add(disc);
  root.add(kitPieceMesh('Kit_WardArch', 0, 0, 0, 0, (width + 1.6) / 12.6));
  return {
    root,
    apply(openness, seal) {
      uniforms.uOpen.value = openness;
      uniforms.uSeal.value = seal;
      disc.scale.setScalar(1 + openness * 0.25);
    },
  };
}

// ---- the Prism Stair rising out of the lagoon -----------------------------------------------

function pathSurface(id: string): FieldPathSurface {
  const s = DROWNED_TEMPLE_FIELD.surfaces.find((x) => x.id === id);
  if (!s || s.kind !== 'path') throw new Error(`no path ${id}`);
  return s;
}

/** A flight of pearl steps along a path (gate-local frame supplied by caller). */
function stairGeometry(
  path: FieldPathSurface,
  originX: number,
  originZ: number,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pts = path.points;
  const w = path.halfWidth * 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az, ah] = pts[i];
    const [bx, bz, bh] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const rise = bh - ah;
    const steps = Math.max(1, Math.round(Math.abs(rise) / 0.42) || Math.round(len / 1.4));
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const top = ah + rise * t1;
      const cx = ax + (bx - ax) * ((t0 + t1) / 2) - originX;
      const cz = az + (bz - az) * ((t0 + t1) / 2) - originZ;
      const depth = (len / steps) * 1.04;
      const h = top + 30;
      const g = new THREE.BoxGeometry(w, h, depth).translate(0, top - h / 2, 0);
      g.rotateY(yaw);
      g.translate(cx, 0, cz);
      parts.push(g.index ? g.toNonIndexed() : g);
    }
  }
  return mergeFlat(parts, 0xdcd8cc);
}

function mergeFlat(parts: THREE.BufferGeometry[], color: number): THREE.BufferGeometry {
  let count = 0;
  for (const g of parts) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color(color);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      const y = (g.attributes.position.array as Float32Array)[i * 3 + 1];
      // Algae and wet dark stone low on the risers.
      const wet = Math.max(0, Math.min(1, (6 - y) / 8));
      col.set([c.r * (1 - wet * 0.55), c.g * (1 - wet * 0.4), c.b * (1 - wet * 0.35)], (o + i) * 3);
    }
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function sunkenStair(gate: DungeonGateDef): GateRig {
  const path = pathSurface('prism_stair_sunken');
  const geo = stairGeometry(path, gate.x, gate.z);
  const mesh = new THREE.Mesh(geo, templeSlotMaterial('stone'));
  mesh.castShadow = !!GFX.standardMaterials;
  mesh.receiveShadow = true;
  const holder = new THREE.Group();
  holder.add(mesh);
  // Water streaming off the rising steps.
  const streamMat = new THREE.MeshBasicMaterial({
    color: 0xbfd6ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    name: 'drownedTempleStairRunoff',
  });
  const runoff = new THREE.Mesh(new THREE.BoxGeometry(path.halfWidth * 2.1, 14, 16), streamMat);
  runoff.position.set(8, 2, 6);
  runoff.rotation.y = Math.atan2(0.73, 0.68);
  holder.add(runoff);
  const root = new THREE.Group();
  // The gate group stands at the gate point rotated by gate.rot; the stair is
  // authored in instance axes, so undo the rotation for it.
  root.rotation.y = -gate.rot;
  root.add(holder);
  return {
    root,
    apply(openness, _seal, since) {
      // Sunk well under the lagoon until the pool drains, then it rises.
      holder.position.y = (1 - openness) * -16;
      const pour =
        openness > 0 && openness < 1 ? 1 : Math.max(0, 1 - since / 3) * (openness >= 1 ? 1 : 0);
      streamMat.opacity = 0.35 * pour;
      runoff.visible = pour > 0.01;
    },
  };
}

// ---- the Moonbridge ------------------------------------------------------------------------

const BRIDGE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vWorld;
uniform float uTime;
${NOISE}
void main() {
  float n = noise(vWorld.xz * 0.6 + uTime * 0.3);
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  vec3 col = mix(vec3(0.62, 0.72, 0.95), vec3(0.95, 0.98, 1.0), n);
  gl_FragColor = vec4(col, 0.55 + 0.3 * n * edge);
  #include <colorspace_fragment>
}
`;

function moonbridge(gate: DungeonGateDef): GateRig {
  const path = pathSurface('moonbridge');
  const planks: THREE.Mesh[] = [];
  const material = new THREE.ShaderMaterial({
    name: 'drownedTempleMoonbridge',
    vertexShader: SHEET_VERT,
    fragmentShader: BRIDGE_FRAG,
    uniforms: { uTime: sharedUniforms.uTime },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.MeshBasicMaterial({
    color: 0xdde8f5,
    transparent: true,
    opacity: 0.9,
    name: 'drownedTempleMoonbridgeRail',
  });
  const holder = new THREE.Group();
  const from = MOONBRIDGE.fromX + 3;
  const to = MOONBRIDGE.toX - 3;
  const count = 26;
  const plankGeo = new THREE.BoxGeometry(1, 0.35, path.halfWidth * 2);
  const railGeo = new THREE.BoxGeometry(1, 0.12, 0.2);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = from + (to - from) * t;
    const h =
      x >= MOONBRIDGE.fromX
        ? MOONBRIDGE.fromH
        : x <= MOONBRIDGE.toX
          ? MOONBRIDGE.toH
          : MOONBRIDGE.fromH +
            ((MOONBRIDGE.toH - MOONBRIDGE.fromH) * (MOONBRIDGE.fromX - x)) /
              (MOONBRIDGE.fromX - MOONBRIDGE.toX);
    const plank = new THREE.Mesh(plankGeo, material);
    plank.scale.x = (Math.abs(to - from) / count) * 0.94;
    plank.position.set(x - gate.x, h - 0.17, MOONBRIDGE.z - gate.z);
    plank.renderOrder = 6;
    holder.add(plank);
    planks.push(plank);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, edgeMat);
      rail.scale.x = plank.scale.x;
      rail.position.set(0, 1.1, side * (path.halfWidth - 0.1));
      plank.add(rail);
    }
  }
  // An always-drawn carrier: the planks hide while the bridge is unmade, and
  // the gate's refresh rides the render of whatever is on screen.
  const carrier = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  carrier.frustumCulled = false;
  carrier.position.set((from + to) / 2 - gate.x, MOONBRIDGE.fromH, MOONBRIDGE.z - gate.z);
  holder.add(carrier);
  const root = new THREE.Group();
  root.rotation.y = -gate.rot;
  root.add(holder);
  return {
    root,
    apply(openness) {
      // The planks gather from the terrace outward, each dropping into place.
      planks.forEach((p, i) => {
        const at = i / planks.length;
        const k = Math.max(0, Math.min(1, (openness - at * 0.8) / 0.2));
        p.visible = k > 0.01;
        p.scale.y = k;
        p.scale.z = 0.4 + 0.6 * k;
      });
    },
  };
}

// ---- shared ------------------------------------------------------------------------------

/** A kit piece as a plain mesh group (gate dressing, one each). */
function kitPieceMesh(
  piece: string,
  x: number,
  z: number,
  y: number,
  rot: number,
  scale = 1,
): THREE.Group {
  const g = new THREE.Group();
  const baked = templeKitPiece(piece);
  for (const slot of ['stone', 'glow', 'glass'] as const) {
    const geo = baked[slot];
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, templeSlotMaterial(slot));
    mesh.castShadow = slot === 'stone' && !!GFX.standardMaterials;
    mesh.receiveShadow = slot === 'stone';
    g.add(mesh);
  }
  g.position.set(x, y, z);
  g.rotation.y = rot;
  g.scale.setScalar(scale);
  return g;
}

/**
 * Every gate structure of one slot, driven by the gate memory of the slot
 * anchored at (ox, oz). Returns the group (instance-local frame).
 */
export function buildTempleGates(
  ox: number,
  oz: number,
  ground: (x: number, z: number) => number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'drownedTempleGates';
  for (const gate of DROWNED_TEMPLE_GATES) {
    const key = gateMemoryKey(ox, oz, gate.id);
    const rig =
      gate.kind === 'water_veil'
        ? waterVeil(gate)
        : gate.kind === 'sunken_stair'
          ? sunkenStair(gate)
          : gate.kind === 'light_bridge'
            ? moonbridge(gate)
            : gate.kind === 'rite_ward'
              ? riteWard(gate)
              : wardedArch(gate, gate.id === 'prism_ward' ? 0xb9a6ff : 0xc8d8ff);
    const holder = new THREE.Group();
    holder.name = `gate:${gate.id}`;
    const gy =
      gate.kind === 'sunken_stair' || gate.kind === 'light_bridge' ? 0 : ground(gate.x, gate.z);
    holder.position.set(gate.x, gy, gate.z);
    holder.rotation.y = gate.rot;
    holder.add(rig.root);
    const refresh = () => {
      const view = gateView(key, sharedUniforms.uTime.value);
      const seal =
        view.state === 'sealed' ? 0.7 + 0.3 * Math.sin(sharedUniforms.uTime.value * 5) : 0;
      rig.apply(view.openness, seal, view.since);
    };
    holder.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).onBeforeRender = refresh;
    });
    group.add(holder);
  }
  return group;
}

/** The on-screen openness of one of this slot's gates (the pool drains with
 *  the Prism Stair's rise). */
export function templeGateOpenness(ox: number, oz: number, gateId: string): number {
  return gateView(gateMemoryKey(ox, oz, gateId), sharedUniforms.uTime.value).openness;
}
