// The Stormbrass Foundry's open-air interior: the brass-and-slate terraces
// from the authored field, the procedural set dressing (props, belts, press,
// cranes, steam, rails), the gates and seals, the lights, the storm sky with
// its peaks and cloud sea, and the landmarks (the storm coil's strikes and the
// Prime Draft in its scaffold). Built once per claimed slot the player
// approaches, attached through the renderer's compile gate (dungeon.ts via
// open_air_fields.ts), never removed.

import * as THREE from 'three';
import { STORMBRASS_FOUNDRY_FIELD } from '../../sim/content/stormbrass_foundry_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { buildAuthoredFieldTerrain } from '../authored_field/field_terrain';
import { GFX, gfxTierAtLeast } from '../gfx';
import type { FireLightSink } from '../point_light_budget';
import { buildFoundryDressing } from './foundry_dressing';
import { buildFoundryGates } from './foundry_gates';
import { buildFoundryLandmarks } from './foundry_landmarks';
import { buildFoundryLights } from './foundry_lights';
import { buildFoundrySky } from './foundry_sky';

export interface StormbrassFoundryInteriorDeps {
  lowGfx: boolean;
  flames: THREE.Mesh[];
  fireLights: FireLightSink;
}

const ground = (x: number, z: number): number =>
  authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z);

/** The generic field terrain, graded for a brass foundry on slate: the paved
 *  tops cool toward slate grey, the cliff faces darken to wet mountain rock.
 *  Vertex paint only (the shared materials stay untouched). */
function tintFoundryTerrain(terrain: THREE.Group): THREE.Group {
  const grades: Record<string, [number, number, number]> = {
    fieldCliffs: [0.82, 0.86, 0.92],
    'fieldTop:stone': [1.08, 1.08, 1.12],
    'fieldTop:soil': [0.95, 0.94, 0.92],
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
export function buildStormbrassFoundryInterior(
  deps: StormbrassFoundryInteriorDeps,
  ox: number,
  oz: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassFoundryField';
  // Cosmetic density sheds with the effects tier (never a telegraph or a gate).
  const density = deps.lowGfx ? 0.35 : gfxTierAtLeast(GFX.effectsTier, 'high') ? 1 : 0.6;
  group.add(
    tintFoundryTerrain(
      buildAuthoredFieldTerrain(STORMBRASS_FOUNDRY_FIELD, { lowGfx: deps.lowGfx, wet: true }),
    ),
  );
  group.add(buildFoundryDressing(ground, deps.lowGfx));
  group.add(buildFoundryGates(ox, oz, ground));
  buildFoundryLights(group, deps, ground);
  group.add(buildFoundrySky({ lowGfx: deps.lowGfx, density }));
  group.add(buildFoundryLandmarks(deps.lowGfx));
  return group;
}
