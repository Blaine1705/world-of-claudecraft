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
import { buildFoundryGates } from './foundry_gates';
import { ensureFoundryKit } from './foundry_kit';
import { FOUNDRY_OPEN_WALK_FASCIA, FOUNDRY_OPEN_WALKS } from './foundry_kit_plan_core';
import { buildFoundryLandmarks } from './foundry_landmarks';
import { buildFoundryLights } from './foundry_lights';
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
      }),
    ),
  );
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
