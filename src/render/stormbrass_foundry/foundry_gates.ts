// The Stormbrass Foundry's gates and seals as structures: the steam shutters
// (a riveted brass shutter between two pillars that grinds up into its housing
// in a burst of steam), the arc fences (lightning crackling between two coil
// posts, powering down with a stutter), and the Crane Bridge (a gantry deck
// that swings out from the Crane Landing and runs out across the gulf to the
// Drafting Yard).
//
// Each gate reads its on-screen state from the shared gate memory
// (../hollow_crypt/crypt_gate_state_core.ts, fed by the mirrored gate entities
// through ../gate_objects.ts) in an onBeforeRender hook, so a state swap plays
// as a reveal and costs nothing off screen. A sealed gate flares red-white.

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_GATES } from '../../sim/content/stormbrass_foundry';
import { CRANE_BRIDGE } from '../../sim/content/stormbrass_foundry_layout';
import type { DungeonGateDef } from '../../sim/types';
import { sharedUniforms } from '../gfx';
import { gateMemoryKey, gateView } from '../hollow_crypt/crypt_gate_state_core';
import { PartBin } from './foundry_mesh';
import {
  arcFenceCharge,
  bridgeExtension,
  CRANE_BRIDGE_APRON,
  craneBridgeDeck,
  shutterLift,
} from './foundry_plan_core';

interface GateRig {
  root: THREE.Group;
  /** Called every rendered frame with the gate's openness, seal pulse and clock. */
  apply(openness: number, seal: number, since: number): void;
}

const SHEET_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ---- the steam shutter ---------------------------------------------------------------------

const PUFF_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uPuff;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float n = noise(vec2(vUv.x * 6.0, vUv.y * 4.0 - uTime * 2.0)) * 0.7 + noise(vUv * 13.0 + uTime) * 0.3;
  float body = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.4, vUv.y);
  gl_FragColor = vec4(vec3(0.93, 0.95, 0.96), n * body * uPuff * 0.85);
}
`;

function steamShutter(gate: DungeonGateDef): GateRig {
  const w = gate.hw;
  const bin = new PartBin();
  // Two riveted pillars and the housing lintel the shutter rises into.
  for (const side of [-1, 1]) {
    bin.box('iron', side * (w + 0.7), 4.5, 0, 0.7, 4.5, 0.9);
    bin.box('hazard', side * (w + 0.7), 1, -0.92, 0.72, 0.9, 0.04);
  }
  bin.box('brass', 0, 10.2, 0, w + 1.6, 1.3, 1.1);
  bin.box('iron', 0, 11.7, 0, w + 1.2, 0.3, 0.9);
  const frame = bin.build(`stormbrassShutterFrame:${gate.id}`);
  const panelBin = new PartBin();
  panelBin.box('brass', 0, 4.25, 0, w, 4.25, 0.25);
  for (let y = 1; y < 8.5; y += 1.8) panelBin.box('iron', 0, y, -0.28, w, 0.14, 0.05);
  for (let x = -w + 0.6; x < w; x += 1.6) panelBin.box('verdigris', x, 4.25, -0.3, 0.06, 4, 0.04);
  panelBin.box('hazard', 0, 0.35, -0.3, w * 0.98, 0.3, 0.05);
  const panel = panelBin.build(`stormbrassShutterPanel:${gate.id}`);
  const puffU = { uTime: sharedUniforms.uTime, uPuff: { value: 0 } };
  const puff = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 2 + 3, 9),
    new THREE.ShaderMaterial({
      name: 'stormbrassShutterSteam',
      vertexShader: SHEET_VERT,
      fragmentShader: PUFF_FRAG,
      uniforms: puffU,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  puff.position.set(0, 4.5, -1.2);
  puff.renderOrder = 9;
  // The seal: two warning lamps on the lintel that pulse while a boss holds it.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x551111, name: 'stormbrassSealLamp' });
  const lamps = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lampMat);
  lamps.position.set(0, 10.2, -1.2);
  const root = new THREE.Group();
  root.add(frame, panel, puff, lamps);
  return {
    root,
    apply(openness, seal, since) {
      panel.position.y = shutterLift(openness) * 10.5;
      panel.updateMatrix();
      if (panel.parent) panel.matrixWorld.multiplyMatrices(panel.parent.matrixWorld, panel.matrix);
      for (const c of panel.children) {
        const m = c as THREE.Mesh;
        m.matrixWorld.multiplyMatrices(panel.matrixWorld, m.matrix);
      }
      // A burst of steam as it lifts (and as it slams down again).
      puffU.uPuff.value = since < 3 ? Math.max(0, 1 - since / 3) : 0;
      lampMat.color.setRGB(0.35 + seal * 0.65, 0.07 + seal * 0.25, 0.07 + seal * 0.2);
    },
  };
}

// ---- the arc fence --------------------------------------------------------------------------

const ARC_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uCharge;
uniform float uSeal;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  // Four crackling strands between the posts, each re-jittered many times a second.
  float a = 0.0;
  float step = floor(uTime * 18.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float base = 0.18 + fi * 0.2;
    float k = floor(vUv.x * 14.0);
    float f = fract(vUv.x * 14.0);
    float j0 = (hash(k * 7.1 + fi * 13.0 + step) - 0.5) * 0.12;
    float j1 = (hash((k + 1.0) * 7.1 + fi * 13.0 + step) - 0.5) * 0.12;
    float yLine = base + mix(j0, j1, f);
    a += smoothstep(0.02, 0.0, abs(vUv.y - yLine));
    a += smoothstep(0.07, 0.0, abs(vUv.y - yLine)) * 0.3;
  }
  vec3 col = mix(vec3(0.75, 0.88, 1.0), vec3(1.0, 0.85, 0.9), uSeal);
  float veil = 0.08 * uCharge;
  gl_FragColor = vec4(col, (min(1.0, a) + veil) * uCharge);
}
`;

function arcFence(gate: DungeonGateDef): GateRig {
  const w = gate.hw;
  const bin = new PartBin();
  for (const side of [-1, 1]) {
    const x = side * (w + 0.5);
    bin.cyl('iron', x, 0, 6.5, 0, 0.35, 0.55, 10);
    for (let y = 1; y < 6; y += 0.9) bin.ring('brass', x, y, 0, 0.62, 0.1);
    bin.add('glow', new THREE.SphereGeometry(0.45, 10, 8), x, 6.9, 0);
  }
  const posts = bin.build(`stormbrassArcPosts:${gate.id}`);
  const u = { uTime: sharedUniforms.uTime, uCharge: { value: 1 }, uSeal: { value: 0 } };
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 2 + 1, 6.4),
    new THREE.ShaderMaterial({
      name: 'stormbrassArcFence',
      vertexShader: SHEET_VERT,
      fragmentShader: ARC_FRAG,
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  sheet.position.set(0, 3.4, 0);
  sheet.renderOrder = 9;
  const root = new THREE.Group();
  root.add(posts, sheet);
  return {
    root,
    apply(openness, seal) {
      u.uCharge.value = Math.max(arcFenceCharge(openness, sharedUniforms.uTime.value), seal);
      u.uSeal.value = seal;
      sheet.visible = u.uCharge.value > 0.001;
    },
  };
}

// ---- the crane bridge ------------------------------------------------------------------------

function craneBridge(gate: DungeonGateDef): GateRig {
  // Built in the gate's own frame: the deck runs along +z (north) from the
  // Crane Landing's lip, pitched up from the landing's height to the yard's.
  // The deck's numbers are the pure plan's (craneBridgeDeck), which a test
  // pins to the walked floor: the ramp lands on the yard's lip, the apron
  // tucks under it.
  const { len, pitch } = craneBridgeDeck();
  const hw = CRANE_BRIDGE.halfWidth;
  const bin = new PartBin();
  bin.box('iron', 0, -0.35, len / 2, hw, 0.3, len / 2);
  bin.box('brass', 0, 0.02, len / 2, hw * 0.92, 0.06, len / 2);
  for (let z = 1; z < len; z += 2) bin.box('black', 0, 0.09, z, hw * 0.9, 0.03, 0.08);
  for (const side of [-1, 1]) {
    bin.box('hazard', side * (hw - 0.1), 1.1, len / 2, 0.08, 0.08, len / 2);
    for (let z = 0.5; z < len; z += 3)
      bin.box('iron', side * (hw - 0.1), 0.55, z, 0.07, 0.55, 0.07);
    // Truss beneath.
    bin.beam('iron', [side * hw * 0.8, -0.6, 0.5], [side * hw * 0.8, -2.8, len / 2], 0.18);
    bin.beam('iron', [side * hw * 0.8, -2.8, len / 2], [side * hw * 0.8, -0.6, len - 0.5], 0.18);
  }
  const deck = bin.build(`stormbrassCraneBridge:${gate.id}`);
  deck.rotation.x = pitch;
  // The flat apron past the ramp's end, level with the yard (counter-pitched
  // in the deck's frame), so the landing never shows a sliver of the drop.
  const apronBin = new PartBin();
  apronBin.box('iron', 0, -0.35, CRANE_BRIDGE_APRON / 2, hw, 0.3, CRANE_BRIDGE_APRON / 2 + 0.1);
  apronBin.box('brass', 0, 0.02, CRANE_BRIDGE_APRON / 2, hw * 0.92, 0.06, CRANE_BRIDGE_APRON / 2);
  const apron = apronBin.build(`stormbrassCraneBridgeApron:${gate.id}`);
  apron.position.set(0, 0, len);
  apron.rotation.x = -pitch;
  deck.add(apron);
  // The crane that swings it: a pivot tower on the landing's lip.
  const towerBin = new PartBin();
  towerBin.box('hazard', -hw - 1.6, 5, -1, 0.8, 5, 0.8);
  towerBin.box('iron', -hw - 1.6, 10.4, -1, 1.2, 0.5, 1.2);
  towerBin.beam('black', [-hw - 1.6, 10.4, -1], [0, 1, len * 0.5], 0.06);
  const tower = towerBin.build(`stormbrassCraneBridgeTower:${gate.id}`);
  const swing = new THREE.Group();
  swing.add(deck);
  const root = new THREE.Group();
  root.add(swing, tower);
  const apply = (openness: number): void => {
    const e = bridgeExtension(openness);
    // Folded: the deck stands upright against the tower, retracted; it swings
    // down over the gulf, then runs out to full length along its rails.
    swing.rotation.x = -(1 - e.swing) * 1.35;
    deck.scale.z = 0.35 + 0.65 * e.run;
    swing.updateMatrix();
    deck.updateMatrix();
    if (swing.parent) swing.matrixWorld.multiplyMatrices(swing.parent.matrixWorld, swing.matrix);
    deck.matrixWorld.multiplyMatrices(swing.matrixWorld, deck.matrix);
    for (const c of deck.children) c.matrixWorld.multiplyMatrices(deck.matrixWorld, c.matrix);
    apron.updateMatrix();
    apron.matrixWorld.multiplyMatrices(deck.matrixWorld, apron.matrix);
    for (const c of apron.children) c.matrixWorld.multiplyMatrices(apron.matrixWorld, c.matrix);
  };
  return { root, apply: (openness) => apply(openness) };
}

/**
 * Every gate structure of one slot, driven by the gate memory of the slot
 * anchored at (ox, oz). Returns the group (instance-local frame).
 */
export function buildFoundryGates(
  ox: number,
  oz: number,
  ground: (x: number, z: number) => number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassGates';
  for (const gate of STORMBRASS_FOUNDRY_GATES) {
    const key = gateMemoryKey(ox, oz, gate.id);
    const rig =
      gate.kind === 'arc_fence'
        ? arcFence(gate)
        : gate.kind === 'crane_bridge'
          ? craneBridge(gate)
          : steamShutter(gate);
    const holder = new THREE.Group();
    holder.name = `gate:${gate.id}`;
    if (gate.kind === 'crane_bridge') {
      // The bridge hangs off the Crane Landing's lip (its path's start).
      holder.position.set(CRANE_BRIDGE.x, CRANE_BRIDGE.fromH, CRANE_BRIDGE.fromZ);
    } else {
      holder.position.set(gate.x, ground(gate.x, gate.z), gate.z);
      holder.rotation.y = gate.rot;
    }
    holder.add(rig.root);
    const refresh = (): void => {
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
