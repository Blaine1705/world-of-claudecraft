// The Stamping Press's gantry over the Main Line (plan: foundry_press_core.ts):
// one overhead rail along each belt, hung from two trussed portals and landing
// on the press frame; on every rail a carriage that carries that belt's hammer
// on a telescoping ram; and the hammer's shadow on the belt under it. The
// creature effect painter (foundry_creature_fx.ts) writes each carriage's pose
// (where it stands on its rail, how far its hammer has fallen, how dark its
// shadow is) from the press strips it sees, and every moving mesh places
// itself in its own onBeforeRender (one matrix write, the cranes' pattern).
// Shared by every built Foundry: one claim is in view at a time, like
// FOUNDRY_BELT_UNIFORMS.
//
// The rails are fixed and render-only (no floor, no collider): the hammers
// come to the players, the map never shifts.
//
// The carriage and the hammer are built procedurally here (carriageParts,
// hammerParts: riveted, ribbed, collared), each as its own PartBin so the
// Blender kit's Kit_PressCarriage and Kit_PressHammer can replace either
// builder without touching the rig.

import * as THREE from 'three';
import { MAIN_LINE_BELTS, STAMPING_PRESS } from '../../sim/content/stormbrass_foundry_layout';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { PartBin } from './foundry_mesh';
import {
  HAMMER_FACE_Y,
  HAMMER_HALF_LENGTH,
  HAMMER_HALF_WIDTH,
  HAMMER_TRAVEL,
  PRESS_HOME_Z,
  PRESS_RAIL_STOPS,
  PRESS_RAIL_Y,
  PRESS_RAIL_Z0,
} from './foundry_press_core';

type Ground = (x: number, z: number) => number;

/** Each belt's carriage pose, west to east (the belts' order): its
 *  instance-local z on the rail, its hammer's drop (0 raised, 1 on the belt, a
 *  little negative is the wind-up) and its shadow's strength (0 to 1). */
export const FOUNDRY_PRESS_HAMMERS: readonly { z: number; drop: number; shadow: number }[] =
  MAIN_LINE_BELTS.xs.map(() => ({ z: PRESS_HOME_Z, drop: 0, shadow: 0 }));

/** The hammer head's height, and where the ram's sleeve ends under the rail. */
const HEAD_H = 2.6;
const SLEEVE_DROP = 3.0;
/** The portals: where they stand, the legs' x, the truss chords over the rail. */
const PORTAL_ZS = [PRESS_RAIL_Z0 + 0.45, -24] as const;
const PORTAL_LEG_X = 23.3;
const CHORD_LOW = 1.35;
const CHORD_HIGH = 3.0;
/** A moving piece is drawn wherever its carriage stands: one generous bound
 *  over the whole rail, so culling never reads a stale place. */
const RIG_BOUND = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 64);

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// The hammer's shadow: a soft dark footprint that swells and darkens as the
// hammer comes, with a hot rim in the last moment (uStrength past 0.8).
const SHADOW_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uStrength;
void main() {
  vec2 d = abs(vUv - 0.5) * 2.0;
  float edge = max(d.x, d.y);
  float body = 1.0 - smoothstep(0.62, 1.0, edge);
  float rim = smoothstep(0.7, 0.9, edge) * (1.0 - smoothstep(0.9, 1.0, edge));
  float hot = smoothstep(0.8, 1.0, uStrength);
  // The strip under it is far brighter than white (the telegraph palette):
  // only a near-opaque black reads as a shadow on it, so the footprint is
  // dense and its strength is eased in early.
  vec3 col = mix(vec3(0.0), vec3(2.6, 0.9, 0.3), rim * hot);
  float dense = 1.0 - pow(1.0 - clamp(uStrength, 0.0, 1.0), 3.0);
  // Hazard bands, not a slab: half the footprint stays open, so the strip's
  // own fill (its countdown) is always read between them.
  float band = smoothstep(0.42, 0.5, abs(fract((vUv.x * 0.65 + vUv.y) * 5.0) - 0.5) * 2.0);
  float a = (body * band * 0.94 + rim * hot * 0.6) * dense;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

/** The static gantry: four rails with their stop blocks and buffers, two
 *  trussed portals on legs at the Main Line's edges, and the saddles that land
 *  the rails on the press frame. */
function gantryParts(bin: PartBin, ground: Ground): void {
  const zEnd = STAMPING_PRESS.z;
  const zc = (PRESS_RAIL_Z0 + zEnd) / 2;
  const half = (zEnd - PRESS_RAIL_Z0) / 2;
  const floor = ground(0, zc);
  const y = floor + PRESS_RAIL_Y;
  for (const x of MAIN_LINE_BELTS.xs) {
    // An I-beam: two flanges and a web, brass wear strips where the wheels run.
    bin.box('iron', x, y + 0.98, zc, 0.62, 0.09, half);
    bin.box('iron', x, y + 0.52, zc, 0.13, 0.4, half);
    bin.box('iron', x, y + 0.07, zc, 0.62, 0.09, half);
    for (const side of [-1, 1]) bin.box('brass', x + side * 0.4, y + 0.18, zc, 0.11, 0.025, half);
    // Web stiffeners every four yards, a brass stop block under every stop.
    for (let z = PRESS_RAIL_Z0 + 2; z < zEnd - 1; z += 4)
      bin.box('iron', x, y + 0.52, z, 0.58, 0.38, 0.05);
    for (const stop of PRESS_RAIL_STOPS) {
      bin.box('brass', x, y - 0.07, stop, 0.34, 0.07, 0.1);
      bin.box('hazard', x, y + 0.52, stop, 0.15, 0.2, 0.16);
    }
    // The chute-end buffer, and the saddle onto the press frame's head.
    bin.box('hazard', x, y + 0.5, PRESS_RAIL_Z0 + 0.15, 0.72, 0.6, 0.15);
    bin.cyl('iron', x, floor + 14.4, y, zEnd, 0.42, 0.55, 10);
    bin.ring('brass', x, y - 0.25, zEnd, 0.5, 0.1);
  }
  for (const z of PORTAL_ZS) {
    const span = PORTAL_LEG_X + 0.5;
    bin.box('iron', 0, y + CHORD_LOW, z, span, 0.2, 0.3);
    bin.box('iron', 0, y + CHORD_HIGH, z, span, 0.18, 0.26);
    bin.box('brass', 0, y + CHORD_HIGH + 0.24, z, span, 0.06, 0.3);
    // The zigzag between the chords.
    const bays = 12;
    for (let i = 0; i < bays; i++) {
      const xa = -span + (i * 2 * span) / bays;
      const xb = -span + ((i + 1) * 2 * span) / bays;
      const up = i % 2 === 0;
      bin.beam(
        'iron',
        [xa, y + (up ? CHORD_LOW : CHORD_HIGH), z],
        [xb, y + (up ? CHORD_HIGH : CHORD_LOW), z],
        0.09,
      );
    }
    // A hanger down to every rail.
    for (const x of MAIN_LINE_BELTS.xs) {
      bin.box('iron', x, y + 1.18, z, 0.5, 0.14, 0.34);
      bin.box('brass', x, y + 1.36, z, 0.56, 0.05, 0.4);
    }
    for (const side of [-1, 1]) {
      const lx = side * PORTAL_LEG_X;
      const g = ground(lx, z);
      const topY = y + CHORD_HIGH;
      bin.cyl('iron', lx, g, topY, z, 0.36, 0.48, 12);
      bin.box('iron', lx, g + 0.12, z, 0.85, 0.12, 0.85);
      bin.ring('hazard', lx, g + 1.2, z, 0.5, 0.14);
      bin.ring('brass', lx, topY - 0.5, z, 0.42, 0.1);
      // A knee brace into the lower chord.
      bin.beam('iron', [lx, y - 2.6, z], [lx - side * 3.2, y + CHORD_LOW, z], 0.12);
    }
  }
}

/** A carriage, about its rail's underside at (0, 0, 0): the trolley clasping
 *  the rail on four brass wheels, its motor housing and the ram's sleeve. */
function carriageParts(bin: PartBin): void {
  bin.box('iron', 0, -0.52, 0, 1.2, 0.4, 1.75);
  bin.box('iron', 0, -0.98, 0, 0.95, 0.1, 1.5);
  for (const side of [-1, 1]) {
    // Cheek plates up past the flange, a wheel fore and aft on each.
    bin.box('iron', side * 0.86, 0.3, 0, 0.1, 0.62, 1.55);
    for (const end of [-1, 1]) {
      bin.add(
        'brass',
        new THREE.CylinderGeometry(0.27, 0.27, 0.2, 14),
        side * 0.62,
        0.36,
        end * 1.05,
        0,
        [1, 1, 1],
        0,
        Math.PI / 2,
      );
      bin.box('hazard', side * 1.21, -0.52, end * 1.2, 0.02, 0.36, 0.42);
    }
    // Rivet rows along the trolley's flanks.
    for (let z = -1.5; z <= 1.5; z += 0.5) {
      bin.box('brass', side * 1.22, -0.2, z, 0.03, 0.05, 0.05);
      bin.box('brass', side * 1.22, -0.84, z, 0.03, 0.05, 0.05);
    }
  }
  for (const end of [-1, 1]) bin.box('hazard', 0, -0.52, end * 1.76, 1.2, 0.36, 0.02);
  // The motor housing and the sleeve the ram slides in, banded in brass.
  bin.cyl('brass', 0, -1.5, -1.08, 0, 1.0, 1.1, 16);
  bin.cyl('iron', 0, -SLEEVE_DROP, -1.5, 0, 0.72, 0.8, 16);
  bin.ring('brass', 0, -SLEEVE_DROP + 0.12, 0, 0.74, 0.1);
  bin.ring('brass', 0, -2.3, 0, 0.78, 0.08);
  for (const end of [-1, 1]) {
    bin.cyl('iron', 0, -SLEEVE_DROP + 0.5, -1.08, end * 2.5, 0.3, 0.34, 10);
    bin.box('iron', 0, -1.2, end * 2.1, 0.5, 0.14, 0.7);
  }
}

/** A hammer head, its striking face at y = 0: a ribbed iron block with a
 *  hazard skirt, a stepped crown, a brass collar and rivet rows. */
function hammerParts(bin: PartBin): void {
  const w = HAMMER_HALF_WIDTH;
  const l = HAMMER_HALF_LENGTH;
  bin.box('black', 0, 0.05, 0, w - 0.08, 0.05, l - 0.08);
  bin.box('hazard', 0, 0.26, 0, w + 0.03, 0.16, l + 0.03);
  bin.box('iron', 0, 1.3, 0, w, 0.9, l);
  // The stepped crown under the collar.
  bin.box('iron', 0, 2.3, 0, w - 0.35, 0.14, l - 0.4);
  bin.box('iron', 0, 2.52, 0, w - 0.9, 0.1, l - 1.1);
  bin.box('brass', 0, HEAD_H + 0.12, 0, 1.45, 0.14, 2.3);
  bin.cyl('brass', 0, HEAD_H + 0.2, HEAD_H + 0.75, 0, 0.78, 0.95, 16);
  for (const end of [-1, 1]) bin.cyl('brass', 0, HEAD_H, HEAD_H + 0.6, end * 2.5, 0.4, 0.46, 10);
  for (const side of [-1, 1]) {
    // Ribs down the flanks and a rivet at the head and foot of every bay.
    for (const z of [-3.2, -1.6, 0, 1.6, 3.2])
      bin.box('iron', side * (w + 0.07), 1.3, z, 0.08, 0.86, 0.13);
    for (let z = -3.6; z <= 3.61; z += 0.8) {
      bin.box('brass', side * (w + 0.04), 2.0, z, 0.04, 0.07, 0.07);
      bin.box('brass', side * (w + 0.04), 0.62, z, 0.04, 0.07, 0.07);
    }
  }
  for (const end of [-1, 1]) {
    bin.box('iron', 0, 1.3, end * (l + 0.07), w - 0.5, 0.86, 0.08);
    for (let x = -2; x <= 2.01; x += 1) bin.box('brass', x, 2.0, end * (l + 0.1), 0.07, 0.07, 0.04);
  }
}

/** The ram, a unit tall from y = 0: the polished main rod and its two guides
 *  (the mesh is stretched from the hammer's crown up into the sleeve). */
function ramParts(bin: PartBin): void {
  bin.cyl('brass', 0, 0, 1, 0, 0.44, 0.44, 14);
  for (const end of [-1, 1]) bin.cyl('brass', 0, 0, 1, end * 2.5, 0.17, 0.17, 8);
}

/** Give every mesh of `part` its place each frame: `place` writes the part's
 *  transform, then each mesh takes it (one matrix write a mesh). */
function drive(part: THREE.Object3D, place: () => void): void {
  for (const child of part.children) {
    const m = child as THREE.Mesh;
    // Its own copy: three recomputes a bound in place.
    m.geometry.boundingSphere = RIG_BOUND.clone();
    m.onBeforeRender = () => {
      place();
      part.updateMatrix();
      if (part.parent) part.matrixWorld.multiplyMatrices(part.parent.matrixWorld, part.matrix);
      m.matrixWorld.multiplyMatrices(part.matrixWorld, m.matrix);
    };
  }
}

/** The gantry, the four carriages with their hammers and rams, and the
 *  hammers' shadows on the belts; they move by FOUNDRY_PRESS_HAMMERS. */
export function buildPressHammers(ground: Ground): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassPressHammers';
  const gantry = new PartBin();
  gantryParts(gantry, ground);
  group.add(gantry.build('stormbrassPressGantry'));
  const shadowGeo = new THREE.PlaneGeometry(HAMMER_HALF_WIDTH * 2, HAMMER_HALF_LENGTH * 2);
  shadowGeo.rotateX(-Math.PI / 2);
  shadowGeo.boundingSphere = RIG_BOUND.clone();
  MAIN_LINE_BELTS.xs.forEach((x, i) => {
    const state = FOUNDRY_PRESS_HAMMERS[i];
    const floor = ground(x, PRESS_HOME_Z);
    const railY = floor + PRESS_RAIL_Y;
    const faceY = (): number => floor + HAMMER_FACE_Y - state.drop * HAMMER_TRAVEL;

    const carriageBin = new PartBin();
    carriageParts(carriageBin);
    const carriage = carriageBin.build(`stormbrassPressCarriage:${i}`);
    carriage.position.set(x, railY, state.z);
    drive(carriage, () => {
      carriage.position.z = state.z;
    });
    group.add(carriage);

    const hammerBin = new PartBin();
    hammerParts(hammerBin);
    const hammer = hammerBin.build(`stormbrassHammer:${i}`);
    hammer.position.set(x, faceY(), state.z);
    drive(hammer, () => {
      hammer.position.set(x, faceY(), state.z);
    });
    group.add(hammer);

    const ramBin = new PartBin();
    ramParts(ramBin);
    const ram = ramBin.build(`stormbrassPressRam:${i}`);
    const stretch = (): void => {
      const crown = faceY() + HEAD_H + 0.5;
      ram.position.set(x, crown, state.z);
      // Up into the sleeve, whatever the drop: the ram never shows a gap.
      ram.scale.y = Math.max(0.2, railY - SLEEVE_DROP + 1.4 - crown);
    };
    stretch();
    drive(ram, stretch);
    group.add(ram);

    // The shadow on the belt: its own material (one program for the four),
    // its strength and footprint written with its place.
    const shadowMat = new THREE.ShaderMaterial({
      name: `stormbrassPressShadow${i}`,
      vertexShader: SHADOW_VERT,
      fragmentShader: SHADOW_FRAG,
      uniforms: { uStrength: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    const m = new THREE.Mesh(shadowGeo, shadowMat);
    m.name = `stormbrassPressShadow:${i}`;
    // Over the press strip's fill (foundry_fx.ts lanes, step 17), under its
    // curtain: the footprint darkens the strip the hammer is about to take.
    m.renderOrder = floorVfxRenderOrder('encounter', 18);
    m.position.set(x, floor + 0.1, state.z);
    m.onBeforeRender = () => {
      // Small and faint while the hammer is high, the full footprint as it lands.
      const s = 0.55 + 0.45 * state.shadow;
      shadowMat.uniforms.uStrength.value = state.shadow;
      m.position.z = state.z;
      m.scale.set(s, 1, s);
      m.updateMatrix();
      if (m.parent) m.matrixWorld.multiplyMatrices(m.parent.matrixWorld, m.matrix);
    };
    group.add(m);
  });
  return group;
}
