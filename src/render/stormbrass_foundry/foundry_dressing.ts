// The Stormbrass Foundry's set dressing (phase 1, procedural): every kit prop
// the authored field places (sim/content/stormbrass_foundry_layout.ts PROPS)
// built from brass, iron and verdigris primitives and merged per material, plus
// the pieces that move: the Main Line's four conveyor belts with their scrolling
// chevrons, the Stamping Press over their north end, the cranes sweeping their
// arms, the steam venting from every pipe, the rails of the yard, and the brass
// bands round the storm-coil tower. Phase 3 swaps the static props for the
// Blender kit (build_stormbrass_foundry_kit.py) keyed on the same prop kinds.
//
// Motion is shader-side on the shared clock, or one matrix write per moving
// mesh in its own onBeforeRender (the cranes): no per-frame JavaScript pass,
// nothing off screen costs anything. Everything here is cosmetic.

import * as THREE from 'three';
import {
  COIL_CROWN,
  MAIN_LINE,
  MAIN_LINE_BELTS,
  PARTS_CHUTE,
  STAMPING_PRESS,
  STORMBRASS_FOUNDRY_FIELD,
} from '../../sim/content/stormbrass_foundry_layout';
import type { FieldProp } from '../../sim/instances/authored_field/types';
import { sharedUniforms } from '../gfx';
import { markSharedMaterial } from '../shared_resource';
import { PartBin } from './foundry_mesh';
import { craneYaw } from './foundry_plan_core';

type Ground = (x: number, z: number) => number;

/** Offset (lx, lz) turned by the prop's yaw, added to its spot. */
function at(p: FieldProp, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

function propPiece(bin: PartBin, p: FieldProp, g: number): void {
  const s = p.scale ?? 1;
  switch (p.kind) {
    case 'sf_lift_station': {
      // The cable-lift's winch house on the shelf's lip, its great pulley and
      // the lightning rod on its roof; the cables run down the mountain.
      bin.box('stone', p.x, g + 0.6, p.z - 1.5, 7, 0.6, 3.5);
      bin.box('iron', p.x, g + 4.2, p.z - 1.8, 5.5, 3.2, 2.6);
      bin.box('brass', p.x, g + 7.7, p.z - 1.8, 6.2, 0.35, 3.1);
      bin.box('brass', p.x, g + 8.4, p.z - 1.8, 4.8, 0.4, 2.2);
      bin.add('brass', new THREE.TorusGeometry(2.4, 0.35, 8, 28), p.x, g + 10.6, p.z - 1.8);
      bin.cyl('iron', p.x, g + 8.6, g + 10.6, p.z - 1.8, 0.35);
      bin.cyl('iron', p.x + 4, g + 8.6, g + 16, p.z - 2, 0.12);
      bin.add('glow', new THREE.SphereGeometry(0.35, 10, 8), p.x + 4, g + 16.2, p.z - 2);
      bin.box('hazard', p.x, g + 1.5, p.z + 1.9, 5.6, 0.25, 0.08);
      for (const dx of [-1.2, 1.2])
        bin.beam('black', [p.x + dx, g + 10.6, p.z - 2], [p.x + dx * 6, g - 90, p.z - 160], 0.09);
      return;
    }
    case 'sf_work_lamp': {
      bin.cyl('iron', p.x, g, g + 3.8, p.z, 0.12, 0.16, 8);
      bin.box('brass', p.x, g + 3.95, p.z, 0.35, 0.22, 0.35);
      bin.add('glow', new THREE.SphereGeometry(0.22, 10, 8), p.x, g + 3.75, p.z);
      return;
    }
    case 'sf_rail_cart': {
      const hw = p.hw ?? 1.6;
      const hd = p.hd ?? 3;
      bin.box('iron', p.x, g + 0.7, p.z, hw, 0.35, hd, p.rot);
      bin.box('brass', p.x, g + 1.6, p.z, hw * 0.95, 0.6, hd * 0.95, p.rot);
      bin.box('verdigris', p.x, g + 2.35, p.z, hw * 0.8, 0.2, hd * 0.8, p.rot);
      for (const lz of [-hd * 0.65, hd * 0.65])
        for (const lx of [-hw, hw]) {
          const [x, z] = at(p, lx, lz);
          bin.add(
            'black',
            new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12),
            x,
            g + 0.45,
            z,
            p.rot,
            [1, 1, 1],
            0,
            Math.PI / 2,
          );
        }
      return;
    }
    case 'sf_plate_stack': {
      const hw = p.hw ?? 2.4;
      const hd = p.hd ?? 1.6;
      const layers = Math.max(3, Math.round((p.h ?? 3) / 0.35));
      for (let i = 0; i < layers; i++) {
        const twist = (i % 3) * 0.05 - 0.05;
        bin.box(
          i % 2 ? 'brass' : 'verdigris',
          p.x,
          g + 0.18 + i * 0.35,
          p.z,
          hw,
          0.15,
          hd,
          p.rot + twist,
        );
      }
      return;
    }
    case 'sf_steam_vent': {
      bin.cyl('iron', p.x, g, g + 1.1, p.z, 0.45, 0.55, 10);
      bin.ring('brass', p.x, g + 1.1, p.z, 0.5, 0.08);
      bin.add(
        'hazard',
        new THREE.TorusGeometry(0.35, 0.06, 6, 16),
        p.x + 0.6,
        g + 0.8,
        p.z,
        Math.PI / 2,
      );
      return;
    }
    case 'sf_water_tower': {
      const r = p.r ?? 2.4;
      for (const [lx, lz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ])
        bin.beam(
          'iron',
          [p.x + lx * r * 0.7, g, p.z + lz * r * 0.7],
          [p.x + lx * r * 0.55, g + 8, p.z + lz * r * 0.55],
          0.18,
        );
      bin.cyl('verdigris', p.x, g + 8, g + 12, p.z, r, r, 18);
      bin.ring('brass', p.x, g + 9, p.z, r + 0.05, 0.1);
      bin.ring('brass', p.x, g + 11, p.z, r + 0.05, 0.1);
      bin.add('verdigris', new THREE.ConeGeometry(r * 1.08, 1.8, 18), p.x, g + 12.9, p.z);
      return;
    }
    case 'sf_parts_line': {
      const hw = p.hw ?? 1.2;
      const hd = p.hd ?? 12;
      bin.box('iron', p.x, g + 0.9, p.z, hw, 0.18, hd, p.rot);
      bin.box('black', p.x, g + 1.1, p.z, hw * 0.85, 0.05, hd * 0.98, p.rot);
      for (let k = -hd + 1.5; k < hd; k += 3) {
        const [x, z] = at(p, 0, k);
        bin.box('brass', x, g + 1.4, z, 0.4, 0.25, 0.5, p.rot + k);
        const [lx0, lz0] = at(p, -hw * 0.9, k);
        const [lx1, lz1] = at(p, hw * 0.9, k);
        bin.cyl('iron', lx0, g, g + 0.8, lz0, 0.1);
        bin.cyl('iron', lx1, g, g + 0.8, lz1, 0.1);
      }
      return;
    }
    case 'sf_crane_base': {
      const h = p.h ?? 16;
      bin.cyl('stone', p.x, g, g + 1, p.z, (p.r ?? 2) + 0.4, (p.r ?? 2) + 0.6, 14);
      // A lattice mast: four legs and cross bracing.
      const w = 0.7;
      for (const [lx, lz] of [
        [-w, -w],
        [w, -w],
        [w, w],
        [-w, w],
      ])
        bin.beam(
          'hazard',
          [p.x + lx, g + 1, p.z + lz],
          [p.x + lx * 0.7, g + h, p.z + lz * 0.7],
          0.12,
        );
      for (let y = g + 3; y < g + h - 1; y += 3) {
        bin.beam('hazard', [p.x - w, y, p.z - w], [p.x + w, y + 1.5, p.z + w], 0.06);
        bin.beam('hazard', [p.x + w, y, p.z - w], [p.x - w, y + 1.5, p.z + w], 0.06);
      }
      bin.cyl('iron', p.x, g + h - 0.3, g + h + 0.5, p.z, 1, 1, 12);
      return;
    }
    case 'sf_press_post': {
      const h = p.h ?? 14;
      bin.cyl('iron', p.x, g, g + h, p.z, p.r ?? 1.3, (p.r ?? 1.3) * 1.15, 12);
      bin.ring('hazard', p.x, g + 1.2, p.z, (p.r ?? 1.3) + 0.05, 0.22);
      bin.ring('brass', p.x, g + h - 1, p.z, (p.r ?? 1.3) + 0.05, 0.2);
      return;
    }
    case 'sf_parts_chute': {
      // The chute's hopper over the belts' south end, raised on legs.
      bin.box('iron', p.x, g + 6.5, p.z - 1, 20, 0.4, 2.2, 0, -0.25);
      bin.box('brass', p.x, g + 7.4, p.z - 2.4, 20.5, 1, 0.4);
      // Legs on the outer walkways only: the Line Catwalk runs in under the middle.
      for (const x of [-21, 21]) bin.cyl('iron', p.x + x, g, g + 6.4, p.z + 1.5, 0.3);
      return;
    }
    case 'sf_bunker': {
      bin.box(
        'stone',
        p.x,
        g + (p.h ?? 1.6) / 2,
        p.z,
        p.hw ?? 4,
        (p.h ?? 1.6) / 2,
        p.hd ?? 1,
        p.rot,
      );
      bin.box('hazard', p.x, g + (p.h ?? 1.6) + 0.05, p.z, (p.hw ?? 4) * 0.98, 0.06, 0.12, p.rot);
      return;
    }
    case 'sf_target_frame': {
      const hw = p.hw ?? 1.6;
      for (const lx of [-hw, hw]) {
        const [x, z] = at(p, lx, 0);
        bin.cyl('wood', x, g, g + (p.h ?? 3), z, 0.12);
      }
      const [cx, cz] = [p.x, p.z];
      bin.add(
        'hazard',
        new THREE.CylinderGeometry(1.2, 1.2, 0.15, 20),
        cx,
        g + 1.9,
        cz,
        p.rot,
        [1, 1, 1],
        Math.PI / 2,
      );
      bin.add(
        'black',
        new THREE.CylinderGeometry(0.75, 0.75, 0.17, 20),
        cx,
        g + 1.9,
        cz,
        p.rot,
        [1, 1, 1],
        Math.PI / 2,
      );
      bin.add(
        'hazard',
        new THREE.CylinderGeometry(0.3, 0.3, 0.19, 16),
        cx,
        g + 1.9,
        cz,
        p.rot,
        [1, 1, 1],
        Math.PI / 2,
      );
      return;
    }
    case 'sf_turret_berm': {
      bin.add(
        'stone',
        new THREE.SphereGeometry(2.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        p.x,
        g - 0.3,
        p.z,
        0,
        [1, 0.7, 1],
      );
      bin.cyl('iron', p.x, g + 1.2, g + 2.2, p.z, 0.9, 1.1, 12);
      bin.add(
        'brass',
        new THREE.CylinderGeometry(0.28, 0.34, 3.2, 10),
        p.x + 1.4,
        g + 2.2,
        p.z,
        0,
        [1, 1, 1],
        0,
        Math.PI / 2 - 0.2,
      );
      return;
    }
    case 'sf_coil_pylon': {
      bin.cyl('iron', p.x, g, g + (p.h ?? 10), p.z, 0.35, 0.6, 10);
      for (let y = 2; y < (p.h ?? 10); y += 2) bin.ring('brass', p.x, g + y, p.z, 0.75, 0.12);
      bin.add('glow', new THREE.SphereGeometry(0.55, 12, 10), p.x, g + (p.h ?? 10) + 0.4, p.z);
      return;
    }
    case 'sf_great_coil': {
      const h = p.h ?? 30;
      bin.cyl('iron', p.x, g, g + 2.2, p.z, (p.r ?? 3.5) + 0.6, (p.r ?? 3.5) + 1, 18);
      bin.cyl('glass', p.x, g + 2, g + h, p.z, 1.2, 1.5, 16);
      for (let y = 3.5; y < h - 1; y += 1.6)
        bin.ring('brass', p.x, g + y, p.z, 2.6 + Math.sin(y) * 0.2, 0.32);
      for (let a = 0; a < 4; a++) {
        const ang = (a / 4) * Math.PI * 2;
        bin.beam(
          'iron',
          [p.x + Math.sin(ang) * 3.4, g + 2, p.z + Math.cos(ang) * 3.4],
          [p.x + Math.sin(ang) * 2.8, g + h - 1, p.z + Math.cos(ang) * 2.8],
          0.22,
        );
      }
      bin.add('brass', new THREE.SphereGeometry(2.2, 16, 12), p.x, g + h + 1.2, p.z);
      bin.add('glow', new THREE.SphereGeometry(1, 12, 10), p.x, g + h + 3.6, p.z);
      return;
    }
    case 'sf_lightning_rod': {
      bin.cyl('iron', p.x, g, g + (p.h ?? 9), p.z, 0.14, 0.3, 8);
      bin.add('brass', new THREE.SphereGeometry(0.4, 10, 8), p.x, g + (p.h ?? 9), p.z);
      return;
    }
    case 'sf_blueprint_table': {
      const hw = p.hw ?? 4;
      const hd = p.hd ?? 2.5;
      for (const [lx, lz] of [
        [-hw * 0.9, -hd * 0.85],
        [hw * 0.9, -hd * 0.85],
        [hw * 0.9, hd * 0.85],
        [-hw * 0.9, hd * 0.85],
      ]) {
        const [x, z] = at(p, lx, lz);
        bin.cyl('wood', x, g, g + 1.15, z, 0.15);
      }
      bin.box('wood', p.x, g + 1.2, p.z, hw, 0.1, hd, p.rot);
      bin.box('blueprint', p.x, g + 1.32, p.z, hw * 0.92, 0.02, hd * 0.9, p.rot, -0.05);
      bin.box('brass', p.x + 1, g + 1.45, p.z, 0.5, 0.1, 0.12, p.rot + 0.6);
      return;
    }
    case 'sf_model_frame': {
      const hw = p.hw ?? 2;
      const h = p.h ?? 7;
      const corners: [number, number][] = [
        [-hw, -hw],
        [hw, -hw],
        [hw, hw],
        [-hw, hw],
      ].map(([lx, lz]) => at(p, lx, lz));
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % 4];
        bin.beam('iron', [ax, g, az], [ax, g + h, az], 0.12);
        bin.beam('iron', [ax, g + h, az], [bx, g + h, bz], 0.1);
        bin.beam('iron', [ax, g + 0.1, az], [bx, g + 0.1, bz], 0.1);
      }
      // A half-built brass figure inside: torso, head, one arm.
      bin.box('brass', p.x, g + 3.4, p.z, 0.9, 1.3, 0.6, p.rot);
      bin.box('brass', p.x, g + 5.2, p.z, 0.45, 0.45, 0.45, p.rot);
      bin.beam('iron', [p.x - 0.4, g, p.z], [p.x - 0.4, g + 2.1, p.z], 0.18);
      bin.beam('iron', [p.x + 0.4, g, p.z], [p.x + 0.4, g + 2.1, p.z], 0.18);
      return;
    }
    case 'sf_cell_rack_small':
    case 'sf_cell_rack': {
      const big = p.kind === 'sf_cell_rack';
      const hw = p.hw ?? 2.5;
      const h = p.h ?? 3.5;
      bin.box('iron', p.x, g + 0.25, p.z, hw, 0.25, p.hd ?? 1, p.rot);
      bin.box('iron', p.x, g + h, p.z, hw, 0.2, p.hd ?? 1, p.rot);
      for (const lx of [-hw, hw]) {
        const [x, z] = at(p, lx, 0);
        bin.cyl('iron', x, g, g + h, z, 0.2);
      }
      const n = big ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const lx = -hw + ((i + 0.5) / n) * hw * 2;
        const [x, z] = at(p, lx, 0);
        bin.cyl('glass', x, g + 0.6, g + h - 0.4, z, big ? 0.55 : 0.4, big ? 0.55 : 0.4, 12);
        bin.ring('brass', x, g + 0.7, z, big ? 0.6 : 0.45, 0.08);
        bin.ring('brass', x, g + h - 0.5, z, big ? 0.6 : 0.45, 0.08);
      }
      if (big) bin.box('hazard', p.x, g + h + 0.35, p.z, hw * 0.9, 0.15, 0.1, p.rot);
      return;
    }
    case 'sf_gantry_scaffold': {
      // The scaffold gantry the Prime Draft was built in: two lattice towers
      // and the crossbeams it hangs from (the colossus itself stands behind,
      // foundry_landmarks.ts).
      const hw = p.hw ?? 11;
      const h = p.h ?? 34;
      for (const side of [-1, 1]) {
        const tx = p.x + side * hw;
        for (const [lx, lz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ])
          bin.beam('iron', [tx + lx, g, p.z + lz], [tx + lx, g + h, p.z + lz], 0.2);
        for (let y = 2; y < h; y += 4) {
          bin.beam('iron', [tx - 1, g + y, p.z - 1], [tx + 1, g + y + 2, p.z + 1], 0.09);
          bin.beam('iron', [tx + 1, g + y, p.z - 1], [tx - 1, g + y + 2, p.z + 1], 0.09);
        }
        bin.box('hazard', tx, g + 1, p.z, 1.3, 1, 1.3);
      }
      for (const y of [h * 0.55, h - 0.8]) bin.box('iron', p.x, g + y, p.z, hw + 1.2, 0.5, 0.8);
      bin.box('hazard', p.x, g + h - 0.8, p.z - 0.85, hw, 0.35, 0.06);
      return;
    }
    default:
      void s;
  }
}

// ---- the Main Line: belts, the Stamping Press ------------------------------------------

const BELT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Chevrons scrolling toward the press (uDir +1) or back to the chute (-1);
// hazard edges down both sides. Phase 2's conveyor regions (G19) drive uDir
// and uAlarm (the red chevrons of a reversal) per belt.
const BELT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uDir;
uniform float uAlarm;
uniform float uLength;
void main() {
  float along = vUv.y * uLength;
  float across = vUv.x - 0.5;
  float scroll = along - uTime * 3.0 * uDir;
  float chev = fract((scroll - abs(across) * 3.0 * uDir) / 3.0);
  float arrow = smoothstep(0.52, 0.56, chev) * smoothstep(0.84, 0.8, chev);
  float slats = 0.85 + 0.15 * step(0.5, fract(scroll * 1.2));
  vec3 rubber = vec3(0.07, 0.075, 0.08) * slats;
  vec3 paint = mix(vec3(0.9, 0.76, 0.16), vec3(0.95, 0.2, 0.12), uAlarm);
  vec3 col = mix(rubber, paint, arrow * 0.85);
  float edge = step(0.44, abs(across));
  float stripe = step(0.5, fract((along + across * 2.0) * 0.8));
  col = mix(col, mix(vec3(0.06), vec3(0.9, 0.76, 0.16), stripe), edge);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function buildBelts(ground: Ground): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassBelts';
  const len = MAIN_LINE_BELTS.z1 - MAIN_LINE_BELTS.z0;
  MAIN_LINE_BELTS.xs.forEach((x, i) => {
    const material = new THREE.ShaderMaterial({
      name: `stormbrassBelt${i}`,
      vertexShader: BELT_VERT,
      fragmentShader: BELT_FRAG,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uDir: { value: 1 },
        uAlarm: { value: 0 },
        uLength: { value: len },
      },
    });
    const geo = new THREE.PlaneGeometry(MAIN_LINE_BELTS.halfWidth * 2, len).rotateX(-Math.PI / 2);
    // PlaneGeometry's v runs +y; after the tilt it runs toward -z: a half turn
    // about y (winding kept, still facing up) makes v run from the chute (z0)
    // to the press (z1).
    geo.rotateY(Math.PI);
    const mesh = new THREE.Mesh(geo, material);
    const zc = (MAIN_LINE_BELTS.z0 + MAIN_LINE_BELTS.z1) / 2;
    mesh.position.set(x, ground(x, zc) + 0.04, zc);
    mesh.name = `stormbrassBelt:${i}`;
    mesh.userData.beltIndex = i;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

function pressPieces(bin: PartBin, ground: Ground): void {
  const g = ground(0, STAMPING_PRESS.z);
  const top = g + 13;
  // The head beam across the posts, the four hammers raised over the belts'
  // last yards, their pistons, and the hazard skirts.
  bin.box('iron', 0, top, STAMPING_PRESS.z, 22, 1.1, 2.2);
  bin.box('brass', 0, top + 1.4, STAMPING_PRESS.z, 21, 0.35, 1.8);
  for (const x of MAIN_LINE_BELTS.xs) {
    bin.cyl('brass', x, top - 5, top, STAMPING_PRESS.z - 3, 0.5, 0.5, 10);
    bin.box('iron', x, top - 6.4, STAMPING_PRESS.z - 3, 2.6, 1.3, 4);
    bin.box('hazard', x, top - 7.8, STAMPING_PRESS.z - 3, 2.65, 0.12, 4.05);
    bin.box('iron', x, top - 1, STAMPING_PRESS.z - 3, 1.2, 1, 1.6);
  }
  // Hazard paint down both edges of every belt: the walkways between read safe.
  const zc = (MAIN_LINE_BELTS.z0 + MAIN_LINE_BELTS.z1) / 2;
  const len = MAIN_LINE_BELTS.z1 - MAIN_LINE_BELTS.z0;
  for (const x of MAIN_LINE_BELTS.xs) {
    const gy = ground(x, zc);
    for (const side of [-1, 1])
      bin.box(
        'hazard',
        x + side * (MAIN_LINE_BELTS.halfWidth + 0.12),
        gy + 0.05,
        zc,
        0.12,
        0.05,
        len / 2,
      );
  }
  void MAIN_LINE;
  void PARTS_CHUTE;
}

// ---- the cranes --------------------------------------------------------------------------

function buildCrane(p: FieldProp, g: number, phase: number): THREE.Group {
  const bin = new PartBin();
  const h = p.h ?? 16;
  // The arm and its counter-jib, the trolley and the hook, in the arm's own frame.
  bin.box('hazard', 0, 0.6, 7, 0.45, 0.45, 9);
  bin.box('hazard', 0, 0.6, -3.5, 0.45, 0.45, 2.5);
  bin.box('iron', 0, 0.2, -5.2, 1, 1, 1);
  bin.box('iron', 0, 0.1, 12, 0.6, 0.4, 0.6);
  bin.beam('black', [0, 0, 12], [0, -h * 0.55, 12], 0.05);
  bin.box('iron', 0, -h * 0.55 - 0.4, 12, 0.5, 0.4, 0.3);
  bin.beam('black', [0, 3, 0], [0, 0.8, 14], 0.04);
  bin.beam('black', [0, 3, 0], [0, 0.8, -5], 0.04);
  bin.cyl('iron', 0, 0, 3, 0, 0.3);
  const arm = bin.build(`stormbrassCrane:${phase}`);
  arm.position.set(p.x, g + h + 0.5, p.z);
  const rest = p.rot + phase;
  const sweep = (): void => {
    // One matrix write per drawn arm mesh: the arm sweeps on the shared clock.
    arm.rotation.y = craneYaw(sharedUniforms.uTime.value, rest, phase);
    arm.updateMatrix();
    if (arm.parent) arm.matrixWorld.multiplyMatrices(arm.parent.matrixWorld, arm.matrix);
  };
  for (const child of arm.children) {
    const m = child as THREE.Mesh;
    m.onBeforeRender = () => {
      sweep();
      m.matrixWorld.multiplyMatrices(arm.matrixWorld, m.matrix);
    };
  }
  return arm;
}

// ---- steam -------------------------------------------------------------------------------

const STEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
attribute float aSeed;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const STEAM_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vSeed;
uniform float uTime;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float t = uTime * (0.8 + vSeed * 0.4) + vSeed * 17.0;
  // Puffs: the vent breathes, a burst every few seconds.
  float puff = 0.45 + 0.55 * smoothstep(0.55, 1.0, sin(t * 0.9) * 0.5 + 0.5);
  float n = noise(vec2(vUv.x * 3.0 + vSeed * 5.0, vUv.y * 4.0 - t * 1.6)) * 0.65
    + noise(vec2(vUv.x * 7.0, vUv.y * 9.0 - t * 2.4)) * 0.35;
  float width = mix(0.18, 0.5, vUv.y);
  float body = smoothstep(width, width * 0.2, abs(vUv.x - 0.5));
  float a = body * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * n * puff;
  gl_FragColor = vec4(vec3(0.91, 0.93, 0.94), a * 0.75);
  #include <fog_fragment>
}
`;

function buildSteam(ground: Ground, lowGfx: boolean): THREE.Mesh | null {
  const vents = STORMBRASS_FOUNDRY_FIELD.props.filter((p) => p.kind === 'sf_steam_vent');
  if (vents.length === 0) return null;
  const geos: THREE.BufferGeometry[] = [];
  vents.forEach((v, i) => {
    const g = ground(v.x, v.z);
    const h = lowGfx ? 5 : 7;
    for (let k = 0; k < 2; k++) {
      const geo = new THREE.PlaneGeometry(3, h);
      geo.translate(0, h / 2 + 1, 0);
      geo.rotateY(k * (Math.PI / 2) + i);
      geo.translate(v.x, g, v.z);
      const seed = new Float32Array(geo.getAttribute('position').count).fill((i * 0.37) % 1);
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      geos.push(geo);
    }
  });
  const merged = mergeFlat(geos);
  const material = new THREE.ShaderMaterial({
    name: 'stormbrassSteam',
    vertexShader: STEAM_VERT,
    fragmentShader: STEAM_FRAG,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: sharedUniforms.uTime },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  markSharedMaterial(material);
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'stormbrassSteam';
  mesh.renderOrder = 6;
  return mesh;
}

function mergeFlat(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of geos) {
    count += g.getAttribute('position').count;
  }
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const seed = new Float32Array(count);
  const index: number[] = [];
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const u = g.getAttribute('uv');
    const s = g.getAttribute('aSeed');
    for (let i = 0; i < p.count; i++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], (o + i) * 3);
      uv.set([u.getX(i), u.getY(i)], (o + i) * 2);
      seed[o + i] = s.getX(i);
    }
    const idx = g.index;
    if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + o);
    o += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  out.setIndex(index);
  out.computeBoundingSphere();
  return out;
}

// ---- rails and the tower bands -------------------------------------------------------------

function railPieces(bin: PartBin, ground: Ground): void {
  // The Hauler's loop round the Rail Yard, and the cart siding on its west side.
  const loop: [number, number][] = [
    [-18, -178],
    [18, -178],
    [18, -142],
    [-18, -142],
  ];
  const runs: [[number, number], [number, number]][] = loop.map((a, i) => [a, loop[(i + 1) % 4]]);
  runs.push([
    [-46, -186],
    [-46, -130],
  ]);
  for (const [a, b] of runs) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const gy = ground((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) + 0.12;
    for (const off of [-1.1, 1.1])
      bin.beam(
        'iron',
        [a[0] + nx * off, gy, a[1] + nz * off],
        [b[0] + nx * off, gy, b[1] + nz * off],
        0.09,
      );
    const yaw = Math.atan2(dx, dz);
    for (let k = 1; k < len; k += 1.6) {
      const x = a[0] + (dx * k) / len;
      const z = a[1] + (dz * k) / len;
      bin.box('wood', x, gy - 0.08, z, 1.6, 0.06, 0.22, yaw);
    }
  }
}

function towerBands(bin: PartBin): void {
  for (const y of [COIL_CROWN.h - 2, COIL_CROWN.h - 18, COIL_CROWN.h - 34, COIL_CROWN.h - 50])
    bin.ring('brass', COIL_CROWN.x, y, COIL_CROWN.z, COIL_CROWN.r + 0.3, 0.55);
  // Pipes running down the tower's face.
  for (const deg of [150, 200, 250]) {
    const a = (deg * Math.PI) / 180;
    const x = COIL_CROWN.x + Math.sin(a) * (COIL_CROWN.r + 0.9);
    const z = COIL_CROWN.z + Math.cos(a) * (COIL_CROWN.r + 0.9);
    bin.cyl('verdigris', x, COIL_CROWN.h - 70, COIL_CROWN.h - 1, z, 0.45, 0.45, 8);
  }
}

/** Build every static prop, the belts, the press, the cranes, the steam. */
export function buildFoundryDressing(ground: Ground, lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassDressing';
  const bin = new PartBin();
  let crane = 0;
  for (const p of STORMBRASS_FOUNDRY_FIELD.props) {
    const g = ground(p.x, p.z);
    propPiece(bin, p, g);
    if (p.kind === 'sf_crane_base') group.add(buildCrane(p, g, crane++));
  }
  pressPieces(bin, ground);
  railPieces(bin, ground);
  towerBands(bin);
  group.add(bin.build('stormbrassProps'));
  group.add(buildBelts(ground));
  const steam = buildSteam(ground, lowGfx);
  if (steam) group.add(steam);
  return group;
}
