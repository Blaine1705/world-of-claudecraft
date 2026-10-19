// The Smith's Heart's gates as structures (heart_gates_core.ts): the stone
// slabs that split and sink, the bronze forge seals whose film dies as the
// ring sinks away, flaring while a guardian holds them sealed. Each reads
// its on-screen state from the shared gate memory
// (../hollow_crypt/crypt_gate_state_core.ts, fed by the mirrored gate
// entities through ../gate_objects.ts); the interior's frame driver calls
// `update` once per drawn frame, and a gate writes its pose only while it
// moves. Drawn whole on every tier: a gate is what blocks the raid.

import * as THREE from 'three';
import { SMITH_HEART_GATES } from '../../sim/content/smith_heart';
import { SMITH_HEART_VEIN_COLORS } from '../../sim/content/smith_heart_layout';
import { sharedUniforms, surfaceMat } from '../gfx';
import { gateMemoryKey, gateView } from '../hollow_crypt/crypt_gate_state_core';
import { markSharedGeometry } from '../shared_resource';
import {
  HEART_SEAL_RING_TUBE,
  HEART_SLAB,
  heartGateRig,
  heartSealGatePose,
  heartSlabPose,
} from './heart_gates_core';
import { HEART_PALETTE } from './heart_plan_core';

interface GateRig {
  root: THREE.Group;
  apply(openness: number, sealed: boolean, t: number): void;
}

let unitBox: THREE.BufferGeometry | null = null;
let unitDisc: THREE.BufferGeometry | null = null;

function box(): THREE.BufferGeometry {
  unitBox ??= markSharedGeometry(new THREE.BoxGeometry(1, 1, 1));
  return unitBox;
}

function disc(): THREE.BufferGeometry {
  unitDisc ??= markSharedGeometry(new THREE.CircleGeometry(1, 40));
  return unitDisc;
}

/** The slab: two halves across the passage with a glowing seam. */
function slabRig(width: number): GateRig {
  const root = new THREE.Group();
  const stone = surfaceMat({
    color: HEART_PALETTE.stone,
    roughness: 0.92,
    flatShading: true,
  });
  const seam = surfaceMat({
    color: 0x2a2018,
    emissive: SMITH_HEART_VEIN_COLORS.hammer,
    emissiveIntensity: 1.2,
    flatShading: true,
  });
  const half = width / 2;
  const halves: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(box(), stone);
    m.scale.set(half, HEART_SLAB.height, HEART_SLAB.thick);
    m.userData.side = side;
    halves.push(m);
    root.add(m);
  }
  const crack = new THREE.Mesh(box(), seam);
  crack.scale.set(0.25, HEART_SLAB.height * 0.9, HEART_SLAB.thick + 0.1);
  root.add(crack);
  let last = -1;
  return {
    root,
    apply(k) {
      if (k === last) return;
      last = k;
      const pose = heartSlabPose(k);
      for (const m of halves) {
        const side = m.userData.side as number;
        m.position.set(side * (half / 2 + pose.part), HEART_SLAB.height / 2 - pose.sink, 0);
        m.visible = pose.shown;
      }
      crack.position.set(0, HEART_SLAB.height * 0.45 - pose.sink, 0);
      crack.visible = pose.shown && pose.part < 0.6;
    },
  };
}

/** The forge seal: a bronze ring standing across the passage, a forge-light
 *  film across it, two plinths at its feet. */
function sealRig(width: number): GateRig {
  const root = new THREE.Group();
  const r = width / 2;
  const bronze = surfaceMat({
    color: HEART_PALETTE.bronze,
    metalness: 0.6,
    roughness: 0.45,
    flatShading: true,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, HEART_SEAL_RING_TUBE, 8, 40), bronze);
  const film = new THREE.MeshBasicMaterial({
    color: SMITH_HEART_VEIN_COLORS.heat,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    name: 'smithHeartForgeSealFilm',
  });
  const sheet = new THREE.Mesh(disc(), film);
  sheet.scale.set(r - HEART_SEAL_RING_TUBE, r - HEART_SEAL_RING_TUBE, 1);
  const moving = new THREE.Group();
  moving.add(ring, sheet);
  root.add(moving);
  for (const side of [-1, 1]) {
    const plinth = new THREE.Mesh(box(), bronze);
    plinth.scale.set(1.4, 1.6, 1.8);
    plinth.position.set(side * (r + 0.2), 0.8, 0);
    root.add(plinth);
  }
  let lastK = -1;
  let lastFilm = -1;
  return {
    root,
    apply(k, sealed, t) {
      const pose = heartSealGatePose(k, sealed, t);
      if (k !== lastK) {
        lastK = k;
        // The ring's foot rests on the floor; it sinks straight down.
        moving.position.set(0, r - pose.sink, 0);
        moving.visible = pose.shown;
      }
      const f = Math.round(pose.film * 50) / 50;
      if (f !== lastFilm) {
        lastFilm = f;
        film.opacity = Math.min(0.85, 0.42 * f);
        sheet.visible = f > 0;
      }
    },
  };
}

export interface HeartGates {
  group: THREE.Group;
  update(): void;
}

/**
 * Every gate structure of the slot anchored at (ox, oz), driven by its gate
 * memory. Returns the group (instance-local frame).
 */
export function buildHeartGates(
  ox: number,
  oz: number,
  ground: (x: number, z: number) => number,
): HeartGates {
  const group = new THREE.Group();
  group.name = 'smithHeartGates';
  const rigs: { key: string; rig: GateRig }[] = [];
  for (const gate of SMITH_HEART_GATES) {
    const kind = heartGateRig(gate.kind);
    if (!kind) continue;
    const width = gate.hw * 2;
    const rig = kind === 'slab' ? slabRig(width) : sealRig(width);
    const holder = new THREE.Group();
    holder.name = `gate:${gate.id}`;
    holder.position.set(gate.x, ground(gate.x, gate.z), gate.z);
    holder.rotation.y = gate.rot;
    holder.add(rig.root);
    // Paint the shut pose before the first frame (the compile gate links
    // every part as it stands).
    rig.apply(0, false, 0);
    group.add(holder);
    rigs.push({ key: gateMemoryKey(ox, oz, gate.id), rig });
  }
  return {
    group,
    update() {
      const now = sharedUniforms.uTime.value;
      for (const { key, rig } of rigs) {
        const view = gateView(key, now);
        rig.apply(view.openness, view.state === 'sealed', now);
      }
    },
  };
}
