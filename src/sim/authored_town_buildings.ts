// Whether a ZonePropsDef building record IS one of the authored towns'
// (Eastbrook Vale / Fenbridge) rebuild buildings, the sim-side twin of the
// render predicates in eastbrook_town.ts / fenbridge_town.ts, so
// colliders.ts (which must not import src/render) can stand a town
// building's record collider down when the document owns that building as a
// placement (promotedScenery.authoredTowns). Matching is by the same
// coordinate/dimension/rotation identity the render predicates use.

import type { Collider } from './collider_shapes';
import { EASTBROOK_LAYOUT, type Obb2 } from './eastbrook_layout';
import { FENBRIDGE_LAYOUT } from './fenbridge_layout';
import type { BuildingDef, PromotedScenery } from './types';

const EPSILON = 1e-6;

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

const TOWN_BUILDINGS = [...EASTBROOK_LAYOUT.buildings, ...FENBRIDGE_LAYOUT.buildings];

/**
 * The solid annexes of a placed town building (a bell tower, a strongroom, a
 * forge shelter, a stall counter: makePlacedBuilding in sim/eastbrook_layout.ts
 * and sim/fenbridge_layout.ts), for a record that still stands where the
 * layout put it. A record a custom world moved, resized or turned carries no
 * annex: the boxes are authored around the model's own anchor and would be
 * left behind as invisible walls.
 */
export function placedBuildingAnnexes(building: BuildingDef): readonly Obb2[] {
  if (building.id === undefined) return [];
  for (const candidate of TOWN_BUILDINGS) {
    if (candidate.id !== building.id) continue;
    return sameNumber(candidate.position.x, building.x) &&
      sameNumber(candidate.position.z, building.z) &&
      sameNumber(candidate.nativeDimensions.width, building.w) &&
      sameNumber(candidate.nativeDimensions.depth, building.d) &&
      sameNumber(candidate.rotation, building.rot)
      ? candidate.annexes
      : [];
  }
  return [];
}

/**
 * The movement colliders of one asset-backed (or legacy house / inn) building
 * record: the full-height box on its authored footprint, then one more for
 * each annex. `groundAt` anchors each box's pass-under floor on its own
 * ground, so a mover deep in a tube or carve walks beneath surface props
 * instead of hitting invisible walls.
 */
export function buildingRecordColliders(
  building: BuildingDef,
  cameraTopY: number,
  groundAt: (x: number, z: number) => number,
): Collider[] {
  const out: Collider[] = [
    {
      type: 'obb',
      x: building.x,
      z: building.z,
      hw: building.w / 2,
      hd: building.d / 2,
      rot: building.rot,
      cameraTopY,
      underY: groundAt(building.x, building.z),
    },
  ];
  for (const annex of placedBuildingAnnexes(building)) {
    out.push({
      type: 'obb',
      x: annex.center.x,
      z: annex.center.z,
      hw: annex.halfWidth,
      hd: annex.halfDepth,
      rot: annex.rotation,
      cameraTopY,
      underY: groundAt(annex.center.x, annex.center.z),
    });
  }
  return out;
}

/** True when this props record is an authored-town rebuild building. */
export function isAuthoredTownBuildingDef(building: BuildingDef): boolean {
  return TOWN_BUILDINGS.some(
    (candidate) =>
      candidate.kind === building.kind &&
      sameNumber(candidate.position.x, building.x) &&
      sameNumber(candidate.position.z, building.z) &&
      sameNumber(candidate.nativeDimensions.width, building.w) &&
      sameNumber(candidate.nativeDimensions.depth, building.d) &&
      sameNumber(candidate.rotation, building.rot),
  );
}

/**
 * True when the DOCUMENT owns this props record as a placement, so its record
 * collider stands down and the placement's own collision is the only one: a
 * rebuild building under promotedScenery.authoredTowns, the Eastbrook Weekly
 * Vault under promotedScenery.eastbrookVault. The built-in world carries no
 * promoted scenery, so it answers false for every record.
 */
export function promotedTownBuildingStandsDown(
  promoted: PromotedScenery | undefined,
  building: BuildingDef,
): boolean {
  if (!promoted) return false;
  if (promoted.eastbrookVault === true && building.id === EASTBROOK_LAYOUT.weeklyVault.id) {
    return true;
  }
  return promoted.authoredTowns === true && isAuthoredTownBuildingDef(building);
}
