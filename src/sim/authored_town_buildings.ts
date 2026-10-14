// Whether a ZonePropsDef building record IS one of the authored towns'
// (Eastbrook Vale / Fenbridge) rebuild buildings, the sim-side twin of the
// render predicates in eastbrook_town.ts / fenbridge_town.ts, so
// colliders.ts (which must not import src/render) can stand a town
// building's record collider down when the document owns that building as a
// placement (promotedScenery.authoredTowns). Matching is by the same
// coordinate/dimension/rotation identity the render predicates use.

import { EASTBROOK_LAYOUT } from './eastbrook_layout';
import { FENBRIDGE_LAYOUT } from './fenbridge_layout';
import type { BuildingDef, PromotedScenery } from './types';

const EPSILON = 1e-6;

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

const TOWN_BUILDINGS = [...EASTBROOK_LAYOUT.buildings, ...FENBRIDGE_LAYOUT.buildings];

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
