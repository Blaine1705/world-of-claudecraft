// The Stormbrass Foundry's open-air interior: the steel and soot terraces from
// the authored field (deck plate, catwalk grating, sooty flagstone; the steel
// walks open to the air under them), the Blender kit and everything that
// works on it (foundry_dressing.ts: machinery, belts, molten brass, steam and
// smoke), the gates and seals, the lights, the storm sky over the mountain,
// and the landmarks (the storm coil's strikes and the Prime Draft in its
// scaffold). Built once per claimed slot the player approaches, attached
// through the renderer's compile gate (dungeon.ts via open_air_fields.ts),
// never removed.

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_FIELD } from '../../sim/content/stormbrass_foundry_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { buildAuthoredFieldTerrain } from '../authored_field/field_terrain';
import { GFX, gfxTierAtLeast } from '../gfx';
import type { FireLightSink } from '../point_light_budget';
import { buildFoundryDressing } from './foundry_dressing';
import { buildFoundryFloorDecals } from './foundry_floor_decals';
import { buildFoundryGates } from './foundry_gates';
import { ensureFoundryKit } from './foundry_kit';
import { FOUNDRY_OPEN_WALK_FASCIA, FOUNDRY_OPEN_WALKS } from './foundry_kit_plan_core';
import { buildFoundryLandmarks } from './foundry_landmarks';
import { buildFoundryLights } from './foundry_lights';
import { foundryHash } from './foundry_plan_core';
import { buildFoundrySky } from './foundry_sky';
import { buildFoundryVents } from './foundry_vents';
import { buildFoundryWorkerCamps } from './foundry_worker_camps';

export interface StormbrassFoundryInteriorDeps {
  lowGfx: boolean;
  flames: THREE.Mesh[];
  fireLights: FireLightSink;
}

const ground = (x: number, z: number): number =>
  authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z);

/** The generic field terrain, graded for a foundry under a storm: the steel
 *  floors and the sooty flagstone warm toward brass and cinder (the storm's
 *  cold light and blue shadows then pull against them), the range's packed
 *  cinder earth darkens, the cliff faces sink to soot-dark mountain rock.
 *  Vertex paint only (the shared materials stay untouched). */
function tintFoundryTerrain(terrain: THREE.Group): THREE.Group {
  const grades: Record<string, [number, number, number]> = {
    fieldCliffs: [0.8, 0.74, 0.7],
    'fieldTop:stone': [1.08, 0.98, 0.9],
    'fieldTop:soil': [0.84, 0.76, 0.7],
    'fieldTop:plate': [1.1, 1.0, 0.92],
    'fieldTop:grating': [1.04, 1.0, 0.98],
  };
  terrain.traverse((o) => {
    const grade = grades[o.name];
    const mesh = o as THREE.Mesh;
    if (!grade || !mesh.isMesh) return;
    const col = mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!col) return;
    if (o.name === 'fieldCliffs') {
      paintStrata(mesh.geometry, col);
      return;
    }
    for (let i = 0; i < col.count; i++) {
      col.setXYZ(
        i,
        Math.min(1, col.getX(i) * grade[0]),
        Math.min(1, col.getY(i) * grade[1]),
        Math.min(1, col.getZ(i) * grade[2]),
      );
    }
    col.needsUpdate = true;
  });
  return terrain;
}

/** The beds of the mountain the shelf is cut into, bottom to top and round
 *  again: warm ochre sandstone, cold slate, a dark shale, a rust-red ironstone. */
const BEDS: readonly (readonly [number, number, number])[] = [
  [0.62, 0.53, 0.42],
  [0.44, 0.45, 0.49],
  [0.32, 0.3, 0.3],
  [0.58, 0.38, 0.27],
  [0.52, 0.48, 0.43],
  [0.38, 0.4, 0.44],
];

/** A smooth 0..1 noise from the plan's hash (trilinear over a lattice). */
function lattice(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const at = (a: number, b: number) => foundryHash(a * 157 + b * 313, salt);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * ux;
  const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * ux;
  return top + (bot - top) * uy;
}

/** Repaint the cliff faces as bedded rock: level strata a few yards thick
 *  that dip gently across the shelf, each bed its own tone, seams of ore
 *  (brass ochre, verdigris) slanting through them, and the generic painter's
 *  own depth shading kept (its brightness says how deep the face has sunk). */
function paintStrata(geo: THREE.BufferGeometry, col: THREE.BufferAttribute): void {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < col.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const lum = (col.getX(i) + col.getY(i) + col.getZ(i)) / 3;
    const shade = Math.min(1.25, Math.max(0.3, lum / 0.17));
    // The beds dip a yard in thirty and wander a little.
    const h = y + x * 0.035 - z * 0.02 + (lattice(x * 0.04, z * 0.04, 71) - 0.5) * 5;
    const bed = Math.floor(h / 3.4);
    const a = BEDS[((bed % BEDS.length) + BEDS.length) % BEDS.length];
    const k = 0.82 + foundryHash(bed, 72) * 0.36;
    let r = a[0] * k;
    let g = a[1] * k;
    let b = a[2] * k;
    // Ore seams: thin slanting sheets through the beds.
    const vein = lattice(x * 0.05 + y * 0.16, z * 0.05 - y * 0.12, 73);
    const ore = Math.max(0, 1 - Math.abs(vein - 0.5) / 0.035);
    if (ore > 0) {
      const green = lattice(x * 0.02, z * 0.02, 74) > 0.5;
      const o = green ? [0.3, 0.62, 0.5] : [0.86, 0.62, 0.22];
      r += (o[0] - r) * ore * 0.75;
      g += (o[1] - g) * ore * 0.75;
      b += (o[2] - b) * ore * 0.75;
    }
    // (The vertex colour multiplies the rock texture: about a third.)
    col.setXYZ(i, r * shade * 0.5, g * shade * 0.5, b * shade * 0.5);
  }
  col.needsUpdate = true;
}

/** Build the whole foundry for the slot anchored at (ox, oz), instance-local. */
export async function buildStormbrassFoundryInterior(
  deps: StormbrassFoundryInteriorDeps,
  ox: number,
  oz: number,
): Promise<THREE.Group> {
  await ensureFoundryKit();
  const group = new THREE.Group();
  group.name = 'stormbrassFoundryField';
  // Cosmetic density sheds with the effects tier (never a telegraph or a gate).
  const density = deps.lowGfx ? 0.35 : gfxTierAtLeast(GFX.effectsTier, 'high') ? 1 : 0.6;
  group.add(
    tintFoundryTerrain(
      buildAuthoredFieldTerrain(STORMBRASS_FOUNDRY_FIELD, {
        lowGfx: deps.lowGfx,
        shallow: { surfaces: FOUNDRY_OPEN_WALKS, depth: FOUNDRY_OPEN_WALK_FASCIA },
        cliffRock: 'strata',
      }),
    ),
  );
  const decals = buildFoundryFloorDecals(deps.lowGfx);
  if (decals) group.add(decals);
  group.add(buildFoundryDressing(ground, deps.lowGfx, density));
  // The chained workers' camps (stand-ins until the kit carries their kinds).
  group.add(buildFoundryWorkerCamps(ground));
  group.add(buildFoundryGates(ox, oz, ground));
  // Line-Master Tock's Scalding Vents: the walkway grilles and their jets.
  group.add(buildFoundryVents(ground, deps.lowGfx));
  buildFoundryLights(group, deps, ground);
  group.add(buildFoundrySky({ lowGfx: deps.lowGfx, density }));
  group.add(buildFoundryLandmarks(deps.lowGfx));
  return group;
}
