// The Smith's Heart's open-air interior (docs/design/raid/smith_heart.md):
// the authored field's terraces (Stormcrag slate, quarried earth, snow and
// lake ice, the forge's soot and plate, the dais's and the Heart's ritual
// floors) with bedded-strata cliffs, the mountain's rock rising along every
// outer lip (each vein an open fissure, the Cornice a summit, the Heart a
// chamber inside the mountain), the rooms' hero props, each vein's colour
// lights, the floor light-rivers, the heart seal, the portals, the Heart's
// core, chains and keels, the gates, and the sky (the storm over the main
// map, the ember night over the Heart). Built once per claimed slot the
// player approaches, attached through the renderer's compile gate (dungeon.ts
// via open_air_fields.ts), never removed.

import * as THREE from 'three';
import {
  inSmithHeartRoom,
  SMITH_HEART_FIELD,
  SMITH_HEART_FLOATING_SURFACES,
} from '../../sim/content/smith_heart_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { buildAuthoredFieldTerrain } from '../authored_field/field_terrain';
import { sharedUniforms } from '../gfx';
import type { FireLightSink } from '../point_light_budget';
import { buildHammerAir } from './hammer_air';
import { dressHammerVein, ensureHammerKit, HAMMER_KIT_KINDS, hammerKitReady } from './hammer_kit';
import { buildHeartGates } from './heart_gates';
import { buildHeartLights } from './heart_lights';
import { buildHeartMountain } from './heart_mountain';
import { buildHeartPortals } from './heart_portal';
import {
  heartAreaBlend,
  heartHopLanding,
  heartHopStage,
  heartPortalStage,
} from './heart_portal_core';
import { buildHeartProps, buildHeartWalls } from './heart_props';
import { buildHeartRivers } from './heart_rivers';
import { buildHeartRoom } from './heart_room';
import { buildHeartSeal } from './heart_seal';
import { heartSealSlotKey, heartSealView, newHeartSealView } from './heart_seal_core';
import { buildHeartSky } from './heart_sky';

export interface SmithHeartInteriorDeps {
  lowGfx: boolean;
  flames: THREE.Mesh[];
  fireLights: FireLightSink;
}

const ground = (x: number, z: number): number => authoredFieldHeight(SMITH_HEART_FIELD, x, z);

/** A pause longer than this (the interior hidden: the player left the run)
 *  forgets the last camera, so the next frame is never read as a hop. */
const DRIVER_GAP = 0.5;

/** Build the whole Smith's Heart for the slot anchored at (ox, oz),
 *  instance-local. Waits (capped) for the veins' Blender kits first. */
export async function buildSmithHeartInterior(
  deps: SmithHeartInteriorDeps,
  ox: number,
  oz: number,
): Promise<THREE.Group> {
  await ensureHammerKit();
  const group = new THREE.Group();
  group.name = 'smithHeartField';
  group.add(
    buildAuthoredFieldTerrain(SMITH_HEART_FIELD, {
      lowGfx: deps.lowGfx,
      cliffRock: 'strata',
      // The round islands hang over the void on keels (heart_room.ts).
      shallow: { surfaces: new Set(SMITH_HEART_FLOATING_SURFACES), depth: 3 },
    }),
  );
  group.add(buildHeartMountain(deps.lowGfx));
  group.add(buildHeartWalls(deps.lowGfx));
  const kitReady = hammerKitReady();
  const props = buildHeartProps(HAMMER_KIT_KINDS, kitReady ? HAMMER_KIT_KINDS : new Set());
  group.add(props.group);
  dressHammerVein(group, props.kitOwned, deps.lowGfx);
  group.add(buildHammerAir(deps.lowGfx));
  group.add(buildHeartRoom(deps.lowGfx));
  buildHeartLights(group, deps, ground);
  const rivers = buildHeartRivers();
  group.add(rivers.group);
  const seal = buildHeartSeal();
  group.add(seal.group);
  const portals = buildHeartPortals(deps.lowGfx, ground);
  group.add(portals.group);
  const gates = buildHeartGates(ox, oz, ground);
  group.add(gates.group);
  const slot = heartSealSlotKey(ox, oz);
  const view = newHeartSealView();
  const stage = heartPortalStage(-1);
  const hop = heartHopStage(-1);
  const local = { x: 0, y: 0, z: 0 };
  let prev: { x: number; z: number } | null = null;
  let lastNow = -1;
  let blend = 0;
  let hopAt = -1;
  let hopSide: 'heart' | 'ring' | null = null;
  const sky = buildHeartSky({
    lowGfx: deps.lowGfx,
    onFrame: (camera) => {
      const now = sharedUniforms.uTime.value;
      const dt = lastNow < 0 ? 999 : now - lastNow;
      lastNow = now;
      local.x = camera.x - ox;
      local.y = camera.y;
      local.z = camera.z - oz;
      if (dt > DRIVER_GAP) prev = null;
      // The hop: the camera crossed from one area to the other in a frame.
      const landed = heartHopLanding(prev, local);
      if (landed) {
        hopAt = now;
        hopSide = landed;
      }
      if (prev) {
        prev.x = local.x;
        prev.z = local.z;
      } else {
        prev = { x: local.x, z: local.z };
      }
      blend = heartAreaBlend(blend, inSmithHeartRoom(local.x, local.z), dt);
      sky.setCore(blend);
      heartSealView(slot, now, view);
      heartPortalStage(view.portalSince, stage);
      heartHopStage(hopAt < 0 ? -1 : now - hopAt, hop);
      rivers.update(view);
      seal.update(view, stage);
      portals.update(stage, hop, hopSide);
      portals.wash(hop.flash, local);
      gates.update();
    },
  });
  group.add(sky.mesh);
  return group;
}
