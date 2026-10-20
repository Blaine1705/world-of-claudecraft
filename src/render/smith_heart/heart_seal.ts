// The heart seal at the Heart's centre: a flush inlay of four quarters, each
// facing its vein's mouth (heart_seal_core.ts HEART_SEAL_QUARTERS), dark stone
// until its vein lights and then burning in the vein's colour (a short flare,
// then a steady glow), round a bronze boss. Flush with the sim floor (the
// final boss fights on it), on the floor ladder's ground rung, so every
// telegraph paints over it. Drawn on every tier: it is the raid's progress.
// Its four quarter materials belong to this slot (their colour is the slot's
// state); one colour write per quarter per change, nothing while steady.

import * as THREE from 'three';
import {
  SEAL_DAIS as HEART,
  HEART_SEAL,
  SMITH_HEART_VEIN_COLORS,
  SMITH_HEART_VEINS,
} from '../../sim/content/smith_heart_layout';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { surfaceMat } from '../gfx';
import { markSharedGeometry } from '../shared_resource';
import { HEART_PALETTE, scaleColor } from './heart_plan_core';
import { HEART_SEAL_QUARTERS, type HeartSealView, heartSealQuarterLevel } from './heart_seal_core';

/** Inner radius of the quarters (the bronze boss inside it). */
const BOSS_R = 1.8;
/** The gap between two quarters (radians). */
const GAP = 0.05;
const LIFT = 0.05;

let bossGeometry: THREE.BufferGeometry | null = null;

export interface HeartSeal {
  group: THREE.Group;
  update(view: HeartSealView): void;
}

/** The seal of one slot (instance-local). */
export function buildHeartSeal(): HeartSeal {
  const group = new THREE.Group();
  group.name = 'smithHeartSeal';
  const y = HEART.h + LIFT;
  const quarters: { material: THREE.MeshBasicMaterial; color: number; level: number }[] = [];
  for (const vein of SMITH_HEART_VEINS) {
    const q = HEART_SEAL_QUARTERS.find((s) => s.vein === vein);
    const bearing = ((q?.bearingDeg ?? 0) * Math.PI) / 180;
    // RingGeometry lies in xy; rotated flat, the angle theta points at
    // bearing theta + 90 degrees (clockwise from north).
    const geometry = new THREE.RingGeometry(
      BOSS_R,
      HEART_SEAL.r,
      12,
      1,
      bearing - Math.PI / 2 - Math.PI / 4 + GAP,
      Math.PI / 2 - GAP * 2,
    ).rotateX(-Math.PI / 2);
    const color = SMITH_HEART_VEIN_COLORS[vein];
    const material = new THREE.MeshBasicMaterial({
      color: scaleColor(color, 0.16),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      name: `smithHeartSealQuarter:${vein}`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `sealQuarter:${vein}`;
    mesh.position.set(HEART_SEAL.x, y, HEART_SEAL.z);
    mesh.renderOrder = floorVfxRenderOrder('ground', 5);
    group.add(mesh);
    quarters.push({ material, color, level: -1 });
  }
  bossGeometry ??= markSharedGeometry(
    new THREE.CircleGeometry(BOSS_R - 0.15, 24).rotateX(-Math.PI / 2),
  );
  const boss = new THREE.Mesh(
    bossGeometry,
    surfaceMat({
      color: HEART_PALETTE.bronze,
      emissive: HEART_PALETTE.ring,
      emissiveIntensity: 0.35,
      metalness: 0.5,
      roughness: 0.5,
    }),
  );
  boss.name = 'sealBoss';
  boss.position.set(HEART_SEAL.x, y + 0.01, HEART_SEAL.z);
  boss.renderOrder = floorVfxRenderOrder('ground', 5);
  group.add(boss);
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    o.matrixAutoUpdate = false;
  });
  const tint = new THREE.Color();
  const full = new THREE.Color();
  return {
    group,
    update(view) {
      for (let i = 0; i < quarters.length; i++) {
        const q = quarters[i];
        // Quantized so a steady seal writes nothing.
        const level = Math.round(heartSealQuarterLevel(view.since[i]) * 64) / 64;
        if (level === q.level) continue;
        q.level = level;
        full.setHex(q.color);
        tint.setHex(scaleColor(q.color, 0.16)).lerp(full, Math.min(1, level));
        if (level > 1) tint.multiplyScalar(level);
        q.material.color.copy(tint);
      }
    },
  };
}
