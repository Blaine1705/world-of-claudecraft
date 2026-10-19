// The Smith's Heart's open-air interior, phase 1 blockout
// (docs/design/raid/smith_heart.md): the authored field's terraces (Stormcrag
// slate, packed earth, snow and lake ice, the forge's soot and plate, the
// Heart's ritual floor) with bedded-strata cliffs, the mountain's rock walls
// rising along every outer lip so each vein reads as an open fissure and the
// Ring as a gallery round the caldera, the placeholder props, each vein's
// colour lights, the floor light-rivers, the heart seal, the gates, and the
// storm sky. Built once per claimed slot the player approaches, attached
// through the renderer's compile gate (dungeon.ts via open_air_fields.ts),
// never removed.

import * as THREE from 'three';
import { SMITH_HEART_FIELD } from '../../sim/content/smith_heart_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { buildAuthoredFieldTerrain } from '../authored_field/field_terrain';
import { sharedUniforms } from '../gfx';
import type { FireLightSink } from '../point_light_budget';
import { buildHeartGates } from './heart_gates';
import { buildHeartLights } from './heart_lights';
import { buildHeartProps, buildHeartWalls } from './heart_props';
import { buildHeartRivers } from './heart_rivers';
import { buildHeartSeal } from './heart_seal';
import { heartSealSlotKey, heartSealView, newHeartSealView } from './heart_seal_core';
import { buildHeartSky } from './heart_sky';

export interface SmithHeartInteriorDeps {
  lowGfx: boolean;
  flames: THREE.Mesh[];
  fireLights: FireLightSink;
}

const ground = (x: number, z: number): number => authoredFieldHeight(SMITH_HEART_FIELD, x, z);

/** Build the whole Smith's Heart for the slot anchored at (ox, oz),
 *  instance-local. */
export function buildSmithHeartInterior(
  deps: SmithHeartInteriorDeps,
  ox: number,
  oz: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'smithHeartField';
  group.add(
    buildAuthoredFieldTerrain(SMITH_HEART_FIELD, { lowGfx: deps.lowGfx, cliffRock: 'strata' }),
  );
  group.add(buildHeartWalls(deps.lowGfx));
  group.add(buildHeartProps());
  buildHeartLights(group, deps, ground);
  const rivers = buildHeartRivers();
  group.add(rivers.group);
  const seal = buildHeartSeal();
  group.add(seal.group);
  const gates = buildHeartGates(ox, oz, ground);
  group.add(gates.group);
  const slot = heartSealSlotKey(ox, oz);
  const view = newHeartSealView();
  group.add(
    buildHeartSky({
      lowGfx: deps.lowGfx,
      onFrame: () => {
        heartSealView(slot, sharedUniforms.uTime.value, view);
        rivers.update(view);
        seal.update(view);
        gates.update();
      },
    }),
  );
  return group;
}
