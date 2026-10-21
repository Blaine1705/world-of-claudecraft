// The Smith's Heart's gates as structures (heart_gates_core.ts): the stone
// slabs that split and sink, and the forge seals, a low bronze sill with a
// rune line and a row of thin light bars that burn shut, flare while a
// guardian holds them sealed, and die as the sill sinks away. Each reads its
// on-screen state from the shared gate memory
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
  type HeartGatePart,
  type HeartGateRig,
  heartGatePartPose,
  heartGateParts,
  heartGateRig,
  heartSealGatePose,
} from './heart_gates_core';
import { heartKitMeshes, heartKitPiece, SMITH_HEART_HAMMER_KIT_URL } from './heart_kit';
import { HEART_PALETTE } from './heart_plan_core';

let unitBox: THREE.BufferGeometry | null = null;

function box(): THREE.BufferGeometry {
  unitBox ??= markSharedGeometry(new THREE.BoxGeometry(1, 1, 1));
  return unitBox;
}

function stoneMaterial(): THREE.Material {
  return surfaceMat({ color: HEART_PALETTE.stone, roughness: 0.92, flatShading: true });
}

function bronzeMaterial(): THREE.Material {
  return surfaceMat({
    color: HEART_PALETTE.bronze,
    metalness: 0.6,
    roughness: 0.45,
    flatShading: true,
  });
}

function seamMaterial(): THREE.Material {
  return surfaceMat({
    color: 0x2a2018,
    emissive: SMITH_HEART_VEIN_COLORS.hammer,
    emissiveIntensity: 1.2,
    flatShading: true,
  });
}

interface GateRig {
  root: THREE.Group;
  apply(openness: number, sealed: boolean, t: number): void;
}

/** One gate: a mesh per planned part, posed from the plan. The seal's light
 *  (bars and runes) is one material per gate, its brightness the gate's
 *  state. */
function buildRig(rig: HeartGateRig, width: number): GateRig {
  const root = new THREE.Group();
  const light =
    rig === 'seal'
      ? new THREE.MeshBasicMaterial({
          color: SMITH_HEART_VEIN_COLORS.heat,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          name: 'smithHeartForgeSealLight',
        })
      : null;
  const glow = new THREE.Color(SMITH_HEART_VEIN_COLORS.heat);
  const meshes: { part: HeartGatePart; mesh: THREE.Object3D; kit: boolean }[] = [];
  for (const part of heartGateParts(rig, width)) {
    // The Slab's halves are the Hammer kit's carved halves once it has
    // landed (both in the shut slab's frame: its base centre); the box
    // stand-ins and the seam otherwise.
    if (rig === 'slab') {
      const kit =
        part.role === 'half'
          ? heartKitMeshes(
              SMITH_HEART_HAMMER_KIT_URL,
              (part.side ?? 1) < 0 ? 'Kit_SlabHalfL' : 'Kit_SlabHalfR',
            )
          : null;
      if (kit) {
        root.add(kit);
        meshes.push({ part, mesh: kit, kit: true });
        continue;
      }
      if (part.role === 'crack' && heartKitPiece(SMITH_HEART_HAMMER_KIT_URL, 'Kit_SlabHalfL'))
        continue;
    }
    const material =
      part.role === 'half'
        ? stoneMaterial()
        : part.role === 'crack'
          ? seamMaterial()
          : (part.role === 'bar' || part.role === 'rune') && light
            ? light
            : bronzeMaterial();
    const mesh = new THREE.Mesh(box(), material);
    mesh.scale.set(part.w, part.h, part.d);
    mesh.position.set(part.x, part.y, part.z);
    root.add(mesh);
    meshes.push({ part, mesh, kit: false });
  }
  let lastK = -1;
  let lastFilm = -1;
  return {
    root,
    apply(k, sealed, t) {
      if (k !== lastK) {
        lastK = k;
        for (const { part, mesh, kit } of meshes) {
          const pose = heartGatePartPose(part, rig, k);
          // A kit half stands on the slab's base centre: it moves by the
          // pose's offset from the box half's own shut centre.
          if (kit) mesh.position.set(pose.x - part.x, pose.y - part.y, pose.z - part.z);
          else mesh.position.set(pose.x, pose.y, pose.z);
          mesh.visible = pose.shown;
        }
      }
      if (!light) return;
      const f = Math.round(heartSealGatePose(k, sealed, t).film * 50) / 50;
      if (f === lastFilm) return;
      lastFilm = f;
      // Shut reads as burning bars; sealed, they flare past white-gold.
      light.color.copy(glow).multiplyScalar(Math.max(0, f));
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
    const rig = buildRig(kind, gate.hw * 2);
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
