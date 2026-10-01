// The Stormbrass Foundry's landmarks: the storm coil taking its strikes (a
// jagged bolt out of the clouds onto the coil's crown every few seconds, a
// flare at the crown, sparks racing down the cables), and the Prime Draft: a
// colossal half-built automaton in its scaffold beyond the Gantry, one brass arm
// finished and one a bare iron frame, cables from the tower into its back, one
// glass eye in an unfinished face. Its head turns to follow the group as they
// climb (render only), and it twitches when lightning hits the coil.
//
// The fightable Prime Draft is the boss entity in front of it (a placeholder
// body in phase 1); phase 3's Blender colossus replaces both looks with one
// model, and phase 2 decides whether the landmark steps down into the fight.
//
// Motion: the bolts and the flare ride the shared strike clock
// (foundry_plan_core.ts coilStrikeAt) in their own onBeforeRender; the head
// is one matrix write in its onBeforeRender. Cosmetic only.

import * as THREE from 'three';
import { sharedUniforms } from '../gfx';
import { markSharedMaterial } from '../shared_resource';
import { radialGlowTexture } from '../textures';
import { PartBin } from './foundry_mesh';
import {
  boltPath,
  COIL_TOP,
  coilStrikeAt,
  FOUNDRY_PALETTE,
  PRIME_DRAFT_LANDMARK as L,
  primeDraftHeadYaw,
} from './foundry_plan_core';

const BOLT_SHAPES = 3;

let boltMaterial: THREE.MeshBasicMaterial | null = null;

function boltMat(): THREE.MeshBasicMaterial {
  if (!boltMaterial) {
    boltMaterial = new THREE.MeshBasicMaterial({
      color: FOUNDRY_PALETTE.lightning,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      name: 'stormbrassBolt',
    });
    markSharedMaterial(boltMaterial);
  }
  return boltMaterial;
}

/** One bolt shape as a chain of thin boxes (a main channel and a fork). */
function boltMesh(seed: number): THREE.Mesh {
  const bin = new PartBin();
  const top = {
    x: COIL_TOP.x + 30 - seed * 22,
    y: COIL_TOP.y + 90,
    z: COIL_TOP.z - 20 + seed * 15,
  };
  const bottom = { x: COIL_TOP.x, y: COIL_TOP.y + 3.2, z: COIL_TOP.z };
  const path = boltPath(seed + 1, top, bottom, 14, 7);
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    bin.beam('glow', [a.x, a.y, a.z], [b.x, b.y, b.z], 0.28);
  }
  const fork = boltPath(
    seed + 7,
    path[5],
    { x: path[5].x - 18, y: path[5].y - 30, z: path[5].z + 8 },
    6,
    4,
  );
  for (let i = 0; i + 1 < fork.length; i++) {
    const a = fork[i];
    const b = fork[i + 1];
    bin.beam('glow', [a.x, a.y, a.z], [b.x, b.y, b.z], 0.16);
  }
  const g = bin.build(`stormbrassBolt:${seed}`, false);
  const mesh = g.children[0] as THREE.Mesh;
  mesh.material = boltMat();
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}

function buildCoilStrikes(lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassCoilStrikes';
  const bolts = Array.from({ length: BOLT_SHAPES }, (_, i) => boltMesh(i));
  // The flare at the crown: a big additive glow sprite.
  const flareMat = new THREE.SpriteMaterial({
    map: radialGlowTexture(),
    color: FOUNDRY_PALETTE.lightning,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    name: 'stormbrassCoilFlare',
  });
  markSharedMaterial(flareMat);
  const flare = new THREE.Sprite(flareMat);
  flare.position.set(COIL_TOP.x, COIL_TOP.y + 3.5, COIL_TOP.z);
  flare.scale.set(18, 18, 1);
  // A constant soft glow at the crown between strikes.
  const glowMat = flareMat.clone();
  glowMat.opacity = 0.45;
  markSharedMaterial(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.position.copy(flare.position);
  glow.scale.set(9, 9, 1);
  group.add(glow);
  if (lowGfx) return group;
  // The bolts and the flare read the strike clock once per drawn frame; a
  // bolt that is not the current shape stays drawn at zero opacity is wasteful,
  // so each bolt hides itself instead.
  for (const [i, bolt] of bolts.entries()) {
    bolt.onBeforeRender = () => {
      const s = coilStrikeAt(sharedUniforms.uTime.value, BOLT_SHAPES);
      (bolt.material as THREE.MeshBasicMaterial).opacity = s.flash;
      bolt.scale.setScalar(s.flash > 0 && s.shape === i ? 1 : 1e-4);
      bolt.updateMatrix();
      if (bolt.parent) bolt.matrixWorld.multiplyMatrices(bolt.parent.matrixWorld, bolt.matrix);
    };
    group.add(bolt);
  }
  flare.onBeforeRender = () => {
    flareMat.opacity = coilStrikeAt(sharedUniforms.uTime.value, BOLT_SHAPES).flash;
  };
  group.add(flare);
  return group;
}

// ---- the Prime Draft ------------------------------------------------------------------------

/** The colossus's body (everything but the head), in its own frame: feet at 0,
 *  facing -z (south, toward the lift). */
function primeDraftBody(bin: PartBin): void {
  const H = L.height;
  const s = H / 42;
  const y = (v: number) => v * s;
  // The render-only plinth it was assembled on, out of the drop.
  bin.cyl('stone', 0, y(-120), 0, 0, 16, 20, 10);
  bin.cyl('iron', 0, -0.6, 0, 0, 15, 15, 24);
  // Legs: riveted brass greaves over iron knees.
  for (const side of [-1, 1]) {
    bin.box('iron', side * y(4), y(3), 0, y(2.2), y(3), y(2.6));
    bin.box('brass', side * y(4), y(9), 0, y(2.6), y(3.5), y(2.8));
    bin.add('iron', new THREE.SphereGeometry(y(2.4), 12, 10), side * y(4), y(12.8), 0);
    bin.box('brass', side * y(4), y(16.5), 0, y(2.8), y(3.6), y(3));
  }
  // Hips and the riveted chest, the two-leaf Core Hatch over an empty socket.
  bin.box('iron', 0, y(20.5), 0, y(7), y(1.8), y(3.4));
  bin.box('brass', 0, y(27), 0, y(8), y(5.6), y(4.6));
  bin.box('verdigris', 0, y(31.8), 0, y(8.6), y(1), y(5));
  bin.box('iron', -y(1.6), y(27), -y(4.7), y(1.5), y(3.4), y(0.25), 0.25);
  bin.box('iron', y(1.6), y(27), -y(4.7), y(1.5), y(3.4), y(0.25), -0.25);
  bin.add('glow', new THREE.SphereGeometry(y(1.2), 12, 10), 0, y(27), -y(4.3));
  // Shoulders.
  for (const side of [-1, 1])
    bin.add('brass', new THREE.SphereGeometry(y(3.2), 14, 10), side * y(9.6), y(31), 0);
  // The finished arm (west): brass plates to a closed fist.
  bin.box('brass', -y(11), y(25), 0, y(2), y(5), y(2.2), 0, 0, 0.08);
  bin.add('iron', new THREE.SphereGeometry(y(1.8), 10, 8), -y(11.4), y(19.6), 0);
  bin.box('brass', -y(11.6), y(15), -y(0.6), y(1.8), y(4.2), y(2), 0, -0.18);
  bin.box('iron', -y(11.8), y(9.8), -y(1.4), y(2.2), y(2), y(2.3));
  // The bare frame arm (east): iron struts and pistons, no plating.
  for (const dz of [-1.2, 1.2]) {
    bin.beam('iron', [y(10.6), y(30), y(dz)], [y(12), y(20), y(dz)], y(0.35));
    bin.beam('iron', [y(12), y(20), y(dz)], [y(12.6), y(10.5), y(dz) - y(1.5)], y(0.3));
  }
  bin.beam('brass', [y(11), y(28), 0], [y(12.2), y(21), 0], y(0.55));
  bin.beam('verdigris', [y(12.1), y(19), 0], [y(12.5), y(12), -y(0.8)], y(0.45));
  bin.add('iron', new THREE.SphereGeometry(y(1.3), 10, 8), y(12), y(20), 0);
  // Cables from its back to the tower (the first metres; the rest in the cable run).
  for (const side of [-1, 1])
    bin.beam('black', [side * y(3), y(30), y(4.6)], [side * y(6), y(36), y(14)], y(0.35));
  // The neck collar.
  bin.cyl('iron', 0, y(32.6), y(34.4), 0, y(2.2), y(2.8), 12);
}

/** The head: one glass eye in an unfinished face plate, lightning-rod crest. */
function primeDraftHead(bin: PartBin): void {
  const s = L.height / 42;
  const y = (v: number) => v * s;
  bin.box('brass', 0, y(2.6), 0, y(3), y(2.6), y(2.8));
  bin.box('iron', -y(1.2), y(2.8), -y(2.85), y(1.7), y(2.2), y(0.2));
  bin.add('glow', new THREE.SphereGeometry(y(0.75), 12, 10), y(1.3), y(3.2), -y(2.8));
  bin.box('verdigris', 0, y(5.4), 0, y(3.2), y(0.3), y(3));
  bin.cyl('iron', 0, y(5.6), y(9), 0, y(0.15), y(0.3), 8);
}

function buildPrimeDraft(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassPrimeDraftLandmark';
  group.position.set(L.x, L.y, L.z);
  const body = new PartBin();
  primeDraftBody(body);
  group.add(body.build('stormbrassPrimeDraftBody'));
  const headBin = new PartBin();
  primeDraftHead(headBin);
  const head = headBin.build('stormbrassPrimeDraftHead');
  const s = L.height / 42;
  head.position.set(0, 34.4 * s, 0);
  group.add(head);
  // The scaffold round it: towers either side, a gantry beam over its head.
  const scaffold = new PartBin();
  for (const side of [-1, 1]) {
    const tx = side * 17 * s;
    for (const [lx, lz] of [
      [-1.2, -1.2],
      [1.2, -1.2],
      [1.2, 1.2],
      [-1.2, 1.2],
    ])
      scaffold.beam('iron', [tx + lx, 0, lz], [tx + lx, 46 * s, lz], 0.28);
    for (let yy = 3; yy < 46 * s; yy += 5) {
      scaffold.beam('iron', [tx - 1.2, yy, -1.2], [tx + 1.2, yy + 2.5, 1.2], 0.12);
      scaffold.beam('hazard', [tx - 1.2, yy, 1.2], [tx + 1.2, yy + 2.5, -1.2], 0.12);
    }
    // Clamp arms reaching in to hold its shoulders.
    scaffold.beam('iron', [tx, 30 * s, 0], [side * 11 * s, 31 * s, 0], 0.4);
  }
  scaffold.box('iron', 0, 46 * s, 0, 19 * s, 0.9, 1.4);
  scaffold.box('hazard', 0, 46 * s - 1, -1.45, 18 * s, 0.3, 0.06);
  group.add(scaffold.build('stormbrassPrimeDraftScaffold'));
  // The head turns to follow whoever climbs toward it, and flinches when the
  // coil takes a strike (it feels the current down its cables).
  const cam = new THREE.Vector3();
  const local = new THREE.Vector3();
  for (const child of head.children) {
    const m = child as THREE.Mesh;
    m.onBeforeRender = (_r, _s, camera) => {
      camera.getWorldPosition(cam);
      local.copy(cam);
      group.worldToLocal(local);
      const t = sharedUniforms.uTime.value;
      const strike = coilStrikeAt(t, BOLT_SHAPES).flash;
      head.rotation.y =
        primeDraftHeadYaw(local.x + L.x, local.z + L.z) + strike * 0.06 * Math.sin(t * 60);
      head.rotation.x = -0.12 + strike * 0.05;
      head.updateMatrix();
      head.matrixWorld.multiplyMatrices(group.matrixWorld, head.matrix);
      m.matrixWorld.multiplyMatrices(head.matrixWorld, m.matrix);
    };
  }
  return group;
}

/** The cable run from the coil's crown down across the gulf into the Draft's back. */
function buildCables(): THREE.Group {
  const bin = new PartBin();
  const from = { x: COIL_TOP.x - 2, y: COIL_TOP.y - 4, z: COIL_TOP.z + 2 };
  const to = { x: L.x + 4, y: L.y + L.height * 0.85, z: L.z + 12 };
  for (const off of [-1.4, 1.4]) {
    let prev: [number, number, number] | null = null;
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      const sag = Math.sin(Math.PI * k) * 26;
      const p: [number, number, number] = [
        from.x + (to.x - from.x) * k + off,
        from.y + (to.y - from.y) * k - sag,
        from.z + (to.z - from.z) * k,
      ];
      if (prev) bin.beam('black', prev, p, 0.3);
      prev = p;
    }
  }
  return bin.build('stormbrassCables', false);
}

/** Build the coil's strikes, the cables and the Prime Draft landmark. */
export function buildFoundryLandmarks(lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassLandmarks';
  group.add(buildCoilStrikes(lowGfx));
  group.add(buildCables());
  group.add(buildPrimeDraft());
  return group;
}
