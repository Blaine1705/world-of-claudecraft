// The heart seal on the Seal Dais: a flush inlay of four quarters, each
// facing the bearing its vein's light-river arrives from
// (heart_seal_core.ts HEART_SEAL_QUARTERS), carved with rune rings round a
// bronze boss. Dark stone until its vein lights; when the river reaches the
// seal the quarter FILLS from the rim inward behind a white-hot front, a
// column of its colour stands up off it, and it burns steady. When the seal
// opens (heart_portal_core.ts) the quarters charge white, then slide apart
// and the boss is gone: the portal grows in the gap (heart_portal.ts).
//
// Flush with the sim floor, on the floor ladder's ground rung, so every
// telegraph paints over it. Drawn on every tier: it is the raid's progress.
// Its quarter and column materials belong to this slot (their uniforms are
// the slot's state); the frame driver writes them only while they change.

import * as THREE from 'three';
import {
  HEART_SEAL,
  SEAL_DAIS,
  SMITH_HEART_VEIN_COLORS,
} from '../../sim/content/smith_heart_layout';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { sharedUniforms, surfaceMat } from '../gfx';
import { markSharedGeometry } from '../shared_resource';
import { heartBeamMaterial } from './heart_fx_materials';
import { HEART_PALETTE } from './heart_plan_core';
import { HEART_PORTAL_SPLIT_OUT, type HeartPortalStage } from './heart_portal_core';
import {
  HEART_SEAL_QUARTERS,
  type HeartSealView,
  heartSealColumn,
  heartSealQuarterFill,
  heartSealQuarterLevel,
} from './heart_seal_core';

/** Inner radius of the quarters (the bronze boss inside it). */
const BOSS_R = 1.8;
/** The gap between two quarters (radians). */
const GAP = 0.05;
const LIFT = 0.05;
/** The arrival column: where it stands on its quarter and its size. */
const COLUMN = { r: 5.4, foot: 2.4, top: 0.7, height: 24 } as const;

const QUARTER_VERT = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const QUARTER_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
uniform float uFill;
uniform float uCharge;
uniform float uOpen;
uniform float uTime;
varying vec2 vLocal;
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float r = length(vLocal);
  float t = clamp((r - ${BOSS_R.toFixed(1)}) / ${(HEART_SEAL.r - BOSS_R).toFixed(1)}, 0.0, 1.0);
  float ang = atan(vLocal.x, vLocal.y);
  float turns = ang / 6.2831853 + 0.5;
  // The carving: three rune rings, a band of runes, spokes between.
  float ring = smoothstep(0.035, 0.0, abs(t - 0.30)) + smoothstep(0.03, 0.0, abs(t - 0.62))
    + smoothstep(0.045, 0.0, abs(t - 0.95));
  float cell = floor(turns * 48.0);
  float inCell = fract(turns * 48.0);
  float rune = step(0.70, t) * step(t, 0.86) * step(0.4, h1(cell * 7.13))
    * step(0.2, inCell) * step(inCell, 0.8)
    * (step(0.5, h1(cell * 3.7)) * step(0.76, t) + step(h1(cell * 3.7), 0.5) * step(t, 0.80) + 0.4);
  float spoke = smoothstep(0.06, 0.0, abs(fract(turns * 24.0) - 0.5) - 0.44) * step(0.32, t) * step(t, 0.6);
  float carve = clamp(ring + rune * 0.9 + spoke * 0.5, 0.0, 1.0);
  // The fill runs from the rim (t 1) inward (t 0) behind a white-hot front.
  float on = step(0.0001, uFill);
  float front = 1.0 - uFill;
  float lit = smoothstep(front - 0.03, front + 0.03, t) * on;
  float edge = smoothstep(0.1, 0.0, abs(t - front)) * on * step(uFill, 0.999);
  float flow = 0.72 + 0.28 * sin(t * 20.0 - uTime * 2.2 + ang * 3.0);
  vec3 stone = vec3(0.05, 0.046, 0.042) + uColor * 0.07 * carve;
  vec3 burn = uColor * (0.45 + 0.9 * carve) * flow * uLevel;
  vec3 col = mix(stone, burn, lit);
  col += vec3(1.0, 0.96, 0.88) * edge * 1.6;
  // The portal gathering: the quarter whitens toward the centre.
  col += mix(uColor, vec3(1.0, 0.96, 0.88), 0.6) * uCharge * (0.4 + 0.9 * (1.0 - t));
  // Parted: the inner lip burns white-gold.
  col += vec3(1.0, 0.88, 0.62) * uOpen * smoothstep(0.3, 0.0, t) * 1.4;
  gl_FragColor = vec4(col, 0.96);
  #include <colorspace_fragment>
}`;

let bossGeometry: THREE.BufferGeometry | null = null;
let columnGeometry: THREE.BufferGeometry | null = null;

interface Quarter {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  column: THREE.Mesh;
  columnMat: THREE.ShaderMaterial;
  dirX: number;
  dirZ: number;
  /** The last written state (fill, level, column, charge, split). */
  last: Float32Array;
}

export interface HeartSeal {
  group: THREE.Group;
  update(view: HeartSealView, portal: HeartPortalStage): void;
}

/** The seal of one slot (instance-local). */
export function buildHeartSeal(): HeartSeal {
  const group = new THREE.Group();
  group.name = 'smithHeartSeal';
  const y = SEAL_DAIS.h + LIFT;
  columnGeometry ??= markSharedGeometry(
    new THREE.CylinderGeometry(COLUMN.top, COLUMN.foot, COLUMN.height, 20, 1, true).translate(
      0,
      COLUMN.height / 2,
      0,
    ),
  );
  const quarters: Quarter[] = [];
  for (const q of HEART_SEAL_QUARTERS) {
    const bearing = (q.bearingDeg * Math.PI) / 180;
    // RingGeometry lies in xy; rotated flat, its angle theta points at
    // bearing theta + 90 degrees (clockwise from north).
    const geometry = new THREE.RingGeometry(
      BOSS_R,
      HEART_SEAL.r,
      24,
      6,
      bearing - Math.PI / 2 - Math.PI / 4 + GAP,
      Math.PI / 2 - GAP * 2,
    ).rotateX(-Math.PI / 2);
    const color = SMITH_HEART_VEIN_COLORS[q.vein];
    const material = new THREE.ShaderMaterial({
      name: `smithHeartSealQuarter:${q.vein}`,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uLevel: { value: 0 },
        uFill: { value: 0 },
        uCharge: { value: 0 },
        uOpen: { value: 0 },
        uTime: sharedUniforms.uTime,
      },
      vertexShader: QUARTER_VERT,
      fragmentShader: QUARTER_FRAG,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `sealQuarter:${q.vein}`;
    mesh.position.set(HEART_SEAL.x, y, HEART_SEAL.z);
    mesh.renderOrder = floorVfxRenderOrder('ground', 5);
    group.add(mesh);
    const dirX = Math.sin(bearing);
    const dirZ = Math.cos(bearing);
    const columnMat = heartBeamMaterial(color, `smithHeartSealColumn:${q.vein}`);
    const column = new THREE.Mesh(columnGeometry, columnMat);
    column.name = `sealColumn:${q.vein}`;
    column.position.set(HEART_SEAL.x + dirX * COLUMN.r, y, HEART_SEAL.z + dirZ * COLUMN.r);
    column.visible = false;
    group.add(column);
    quarters.push({
      mesh,
      material,
      column,
      columnMat,
      dirX,
      dirZ,
      last: new Float32Array(5).fill(-1),
    });
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
  return {
    group,
    update(view, portal) {
      for (let i = 0; i < quarters.length; i++) {
        const q = quarters[i];
        const since = view.since[i];
        const fill = Math.round(heartSealQuarterFill(since) * 128) / 128;
        const level = Math.round(heartSealQuarterLevel(since) * 64) / 64;
        const column = Math.round(heartSealColumn(since) * 64) / 64;
        const charge = Math.round(portal.charge * 64) / 64;
        const split = Math.round(portal.split * 128) / 128;
        // Quantized: a steady seal writes nothing.
        const last = q.last;
        if (
          last[0] === fill &&
          last[1] === level &&
          last[2] === column &&
          last[3] === charge &&
          last[4] === split
        ) {
          continue;
        }
        last[0] = fill;
        last[1] = level;
        last[2] = column;
        last[3] = charge;
        last[4] = split;
        const u = q.material.uniforms;
        u.uFill.value = fill;
        u.uLevel.value = level;
        u.uCharge.value = charge;
        u.uOpen.value = split;
        const out = split * HEART_PORTAL_SPLIT_OUT;
        q.mesh.position.set(HEART_SEAL.x + q.dirX * out, y, HEART_SEAL.z + q.dirZ * out);
        q.columnMat.uniforms.uK.value = column * 1.6;
        q.column.visible = column > 0;
      }
      boss.visible = portal.split < 0.25;
    },
  };
}
