// The Stormbrass Foundry's gates and seals as structures, built from the kit
// (foundry_kit.ts): the steam shutters (a slatted brass roller shutter between
// two riveted pillars that rolls up into its housing in a burst of steam), the
// arc fences (lightning crackling between two coil posts, powering down with a
// stutter), and the Crane Bridge: the bridge crane on the Crane Landing
// carries the whole span on its hook, slews it across the gulf and lowers it
// onto its seats in steam and a shower of sparks (foundry_bridge_core.ts).
//
// Each gate reads its on-screen state from the shared gate memory
// (../hollow_crypt/crypt_gate_state_core.ts, fed by the mirrored gate entities
// through ../gate_objects.ts) in an onBeforeRender hook, so a state swap plays
// as a reveal and costs nothing off screen. A sealed gate flares red-white.

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_GATES } from '../../sim/content/stormbrass_foundry';
import type { DungeonGateDef } from '../../sim/types';
import { sharedUniforms } from '../gfx';
import { gateMemoryKey, gateView } from '../hollow_crypt/crypt_gate_state_core';
import {
  BRIDGE_SPARK_GATE,
  craneBridgePose,
  craneBridgeProgress,
  craneBridgeRig,
} from './foundry_bridge_core';
import { foundryKitMeshes, foundryKitRun, upgradeWhenKitLands } from './foundry_kit';
import { FOUNDRY_KIT_SIZES } from './foundry_kit_plan_core';
import {
  arcFenceCharge,
  CRANE_BRIDGE_APRON,
  craneBridgeDeck,
  shutterLift,
} from './foundry_plan_core';
import { setSparkGate } from './foundry_sparks';

interface GateRig {
  root: THREE.Group;
  /** True when the rig places itself in the instance frame (the bridge). */
  absolute?: boolean;
  /** Called every rendered frame with the gate's view and the clock. */
  apply(openness: number, seal: number, since: number, open: boolean): void;
}

/** Push a group's own matrix and its descendants' world matrices (the rigs
 *  move inside an onBeforeRender, after the scene's matrix pass). */
function settle(node: THREE.Object3D): void {
  node.updateMatrix();
  if (node.parent) node.matrixWorld.multiplyMatrices(node.parent.matrixWorld, node.matrix);
  for (const c of node.children) settle(c);
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

/** The kit shutter's own half width and travel (the contract). */
const SHUTTER_HALF = 5.6;
const SHUTTER_TRAVEL = 8.3;

function steamShutter(gate: DungeonGateDef): GateRig {
  const w = gate.hw;
  const stretch = w / SHUTTER_HALF;
  const frame = foundryKitMeshes('Kit_ShutterFrame');
  frame.scale.set(stretch, 1, 1);
  const panel = foundryKitMeshes('Kit_ShutterPanel');
  panel.scale.set(stretch, 1, 1);
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
  // The seal: two warning lamps in the housing's sockets that pulse while a
  // boss holds it.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x551111, name: 'stormbrassSealLamp' });
  const lampGeo = new THREE.SphereGeometry(0.34, 10, 8);
  const lamps = new THREE.Group();
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(side * 3 * stretch, 10.2, 1.18);
    lamps.add(lamp);
  }
  const root = new THREE.Group();
  root.add(frame, panel, puff, lamps);
  return {
    root,
    apply(openness, seal, since) {
      // The shutter rolls up into its housing: its foot climbs, its slats
      // gather under the drum.
      const lift = shutterLift(openness);
      panel.position.y = lift * SHUTTER_TRAVEL;
      panel.scale.set(stretch, 1 - lift * 0.97, 1);
      settle(panel);
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
  const posts = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = foundryKitMeshes('Kit_ArcPost');
    post.position.set(side * (w + 0.5), 0, 0);
    posts.add(post);
  }
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

const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vc2 = new THREE.Vector3();
const vx = new THREE.Vector3();
const vy = new THREE.Vector3();
const vz = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Lay a unit link (the kit's one-yard chain or cable along +x) from a to b. */
function strand(link: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, thick: number): void {
  vx.subVectors(b, a);
  const len = Math.max(1e-3, vx.length());
  vx.multiplyScalar(1 / len);
  vz.crossVectors(vx, WORLD_UP);
  if (vz.lengthSq() < 1e-6) vz.set(0, 0, 1);
  vz.normalize();
  vy.crossVectors(vz, vx);
  link.matrix.makeBasis(vx, vy, vz);
  link.matrix.scale(vc.set(len, thick, thick));
  link.matrix.setPosition(a);
  if (link.parent) link.matrixWorld.multiplyMatrices(link.parent.matrixWorld, link.matrix);
  for (const c of link.children) c.matrixWorld.multiplyMatrices(link.matrixWorld, c.matrix);
}

function craneBridge(): GateRig {
  // The span: the deck tiles merged into one mesh per slot, its origin the
  // south end's walking surface, running along its local +z. The deck's
  // numbers are the pure plan's (craneBridgeDeck), which a test pins to the
  // walked floor: the ramp lands on the yard's lip, the apron tucks under it.
  const deck = craneBridgeDeck();
  const rig = craneBridgeRig();
  const tiles = Math.max(1, Math.round(deck.len / 4));
  const span = new THREE.Group();
  span.name = 'stormbrassCraneBridgeSpan';
  const run = foundryKitRun('Kit_BridgeSpan', tiles, deck.len / tiles, 4);
  // The run tiles along its local +x: turn it to run north (+z).
  run.rotation.y = -Math.PI / 2;
  span.add(run);
  // The flat apron past the ramp's end, level with the yard (counter-pitched
  // in the span's frame), so the landing never shows a sliver of the drop.
  const apron = foundryKitRun('Kit_BridgeSpan', 1, CRANE_BRIDGE_APRON + 0.2, 4);
  apron.rotation.y = -Math.PI / 2;
  const apronHolder = new THREE.Group();
  apronHolder.position.set(0, 0, deck.len - 0.1);
  apronHolder.rotation.x = -deck.pitch;
  apronHolder.add(apron);
  span.add(apronHolder);
  span.rotation.order = 'YXZ';
  // The crane's slewing jib, stretched to reach the span's middle.
  const jib = foundryKitMeshes('Kit_CraneJib');
  jib.position.set(rig.mast.x, rig.mast.top, rig.mast.z);
  jib.scale.set(
    rig.mast.scale * 1.15,
    rig.mast.scale * 1.15,
    rig.reach / FOUNDRY_KIT_SIZES.craneJibReach,
  );
  const hook = foundryKitMeshes('Kit_HookBlock');
  // The hoist cable and the four sling chains to the span's lifting eyes.
  const hoist = foundryKitMeshes('Kit_Cable');
  hoist.matrixAutoUpdate = false;
  const slings = [0, 1, 2, 3].map(() => {
    const s = foundryKitMeshes('Kit_Chain');
    s.matrixAutoUpdate = false;
    return s;
  });
  // The winch's steam while it works, at the mast's foot.
  const steamU = { uTime: sharedUniforms.uTime, uPuff: { value: 0 } };
  const steam = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 12),
    new THREE.ShaderMaterial({
      name: 'stormbrassCraneSteam',
      vertexShader: SHEET_VERT,
      fragmentShader: PUFF_FRAG,
      uniforms: steamU,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  steam.position.set(rig.mast.x + 1.5, rig.mast.top - 12, rig.mast.z + 1.5);
  steam.rotation.y = Math.PI / 4;
  steam.renderOrder = 9;
  const root = new THREE.Group();
  root.add(span, jib, hook, hoist, ...slings, steam);
  // The swing runs on its own slow clock (the gate memory's reveal is a
  // shutter's two seconds): from where it stood when the gate last changed.
  let from: number | null = null;
  let wasOpen = false;
  let k = 0;
  const half = deck.len / 2;
  const eyes: [number, number][] = [
    [-4.6, half - 6.5],
    [4.6, half - 6.5],
    [-4.6, half + 6.5],
    [4.6, half + 6.5],
  ];
  return {
    root,
    absolute: true,
    apply(openness, _seal, since, open) {
      if (from === null) {
        // First sight: a gate the memory snapped (never seen moving) stands
        // where it is; one caught mid-reveal starts its swing from the far end.
        from = openness > 0 && openness < 1 ? (open ? 0 : 1) : open ? 1 : 0;
        wasOpen = open;
      } else if (open !== wasOpen) {
        from = k;
        wasOpen = open;
      }
      k = craneBridgeProgress(open, since, from);
      const pose = craneBridgePose(k, sharedUniforms.uTime.value);
      span.position.set(pose.span.x, pose.span.y, pose.span.z);
      span.rotation.set(pose.span.pitch, pose.span.yaw, 0);
      jib.rotation.y = pose.jibYaw;
      hook.position.set(pose.hook.x, pose.hook.y, pose.hook.z);
      settle(span);
      settle(jib);
      settle(hook);
      strand(hoist, va.set(pose.tip.x, pose.tip.y, pose.tip.z), vb.copy(hook.position), 1.6);
      // The hook's lower eye down to each lifting eye on the girders.
      va.set(pose.hook.x, pose.hook.y - 2.1, pose.hook.z);
      slings.forEach((s, i) => {
        vb.set(eyes[i][0], 1.3, eyes[i][1]).applyMatrix4(span.matrix);
        // Let go once the span is seated: the chains drop to hang under the hook.
        if (pose.release > 0) {
          vc2.set(va.x + eyes[i][0] * 0.07, va.y - 3.2, va.z + (i < 2 ? -0.25 : 0.25));
          vb.lerp(vc2, pose.release);
        }
        strand(s, va, vb, 1.4);
      });
      steamU.uPuff.value = pose.working * 0.9;
      setSparkGate(BRIDGE_SPARK_GATE, pose.touchdown);
    },
  };
}

function buildGates(ox: number, oz: number, ground: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassGates';
  for (const gate of STORMBRASS_FOUNDRY_GATES) {
    const key = gateMemoryKey(ox, oz, gate.id);
    const rig =
      gate.kind === 'arc_fence'
        ? arcFence(gate)
        : gate.kind === 'crane_bridge'
          ? craneBridge()
          : steamShutter(gate);
    const holder = new THREE.Group();
    holder.name = `gate:${gate.id}`;
    if (!rig.absolute) {
      holder.position.set(gate.x, ground(gate.x, gate.z), gate.z);
      holder.rotation.y = gate.rot;
    }
    holder.add(rig.root);
    let stamp = Number.NaN;
    const refresh = (): void => {
      const t = sharedUniforms.uTime.value;
      if (t === stamp) return;
      stamp = t;
      const view = gateView(key, t);
      const seal = view.state === 'sealed' ? 0.7 + 0.3 * Math.sin(t * 5) : 0;
      rig.apply(view.openness, seal, view.since, view.state === 'open');
    };
    holder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.onBeforeRender = refresh;
      // A rig that travels (the bridge's span on the crane) is never culled
      // by where it was built.
      if (rig.absolute) m.frustumCulled = false;
    });
    group.add(holder);
  }
  return group;
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
  const group = buildGates(ox, oz, ground);
  upgradeWhenKitLands(group, () => buildGates(ox, oz, ground));
  return group;
}
