// The Stormbrass Foundry's landmarks: the storm coil taking its strikes (a
// jagged bolt out of the clouds onto the coil's crown every few seconds, a
// flare at the crown, the coil's afterglow and its spark shower), and the
// cable run sagging across the gulf from the coil's crown into the Prime
// Draft landmark's back. The landmark itself (a colossal half-built automaton
// hung in its assembly frame beyond the Gantry) is kit pieces placed by the
// plan (foundry_kit_plan_core.ts planPrimeDraftLandmark).
//
// Motion: the bolts and the flare ride the shared strike clock
// (foundry_plan_core.ts coilStrikeAt) in their own onBeforeRender. Cosmetic only.

import * as THREE from 'three';
import { sharedUniforms } from '../gfx';
import { markSharedMaterial } from '../shared_resource';
import { radialGlowTexture } from '../textures';
import { setFoundryCoilGlow, setFoundryStrikeFlash } from './foundry_kit';
import { PartBin } from './foundry_mesh';
import {
  boltPath,
  COIL_TOP,
  coilAfterglowAt,
  coilStrikeAt,
  FOUNDRY_PALETTE,
  PRIME_DRAFT_LANDMARK as L,
} from './foundry_plan_core';
import { setSparkGate } from './foundry_sparks';

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
    x: COIL_TOP.x + 46 - seed * 40,
    y: COIL_TOP.y + 170,
    z: COIL_TOP.z - 34 + seed * 30,
  };
  const bottom = { x: COIL_TOP.x, y: COIL_TOP.y + 3.2, z: COIL_TOP.z };
  const path = boltPath(seed + 1, top, bottom, 20, 13);
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    // A fat trunk tapering toward the coil: it reads from the Lift Landing.
    bin.beam('glow', [a.x, a.y, a.z], [b.x, b.y, b.z], 1.9 - (i / path.length) * 1.1);
  }
  // Forks peeling off the trunk toward the lightning rods round the crown.
  // (They reach for the lightning rods, the yards below and the far valley.)
  const forks: [number, number, number, number][] = [
    [3, -46, -44, 22],
    [5, 38, -52, -30],
    [8, -30, -40, -26],
    [10, 26, -34, 30],
    [13, -22, -30, 12],
    [15, 18, -24, -16],
    [17, -12, -16, -10],
  ];
  forks.forEach(([at, dx, dy, dz], f) => {
    const fork = boltPath(
      seed + 7 + f * 3,
      path[at],
      { x: path[at].x + dx, y: path[at].y + dy, z: path[at].z + dz },
      9,
      6,
    );
    for (let i = 0; i + 1 < fork.length; i++) {
      const a = fork[i];
      const b = fork[i + 1];
      bin.beam('glow', [a.x, a.y, a.z], [b.x, b.y, b.z], Math.max(0.12, 0.8 - i * 0.075));
    }
  });
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
  flare.scale.set(64, 64, 1);
  // A constant soft glow at the crown between strikes.
  const glowMat = flareMat.clone();
  glowMat.opacity = 0.45;
  markSharedMaterial(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.position.copy(flare.position);
  glow.scale.set(9, 9, 1);
  // The always-drawn glow drives the coil's own afterglow (the kit's glow
  // node, foundry_kit.ts) and the strike's spark shower, on every tier.
  glow.onBeforeRender = () => {
    const after = coilAfterglowAt(sharedUniforms.uTime.value);
    setFoundryCoilGlow(after);
    // The strike lights the whole foundry for its instant (not on the low tier).
    setFoundryStrikeFlash(lowGfx ? 0 : coilStrikeAt(sharedUniforms.uTime.value, BOLT_SHAPES).flash);
    glowMat.opacity = 0.45 + after * 0.4;
    setSparkGate(3, after > 0.55 ? 1 : 0);
  };
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

/** Build the coil's strikes and the cable run to the Prime Draft landmark
 *  (the landmark itself is kit pieces: foundry_kit_plan_core.ts
 *  planPrimeDraftLandmark). */
export function buildFoundryLandmarks(lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassLandmarks';
  group.add(buildCoilStrikes(lowGfx));
  group.add(buildCables());
  return group;
}
