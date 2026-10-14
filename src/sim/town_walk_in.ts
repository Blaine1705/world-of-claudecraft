// Walk-in town buildings. A placed painted building whose model bakes an open
// doorway (fenbridge_layout.ts `walkIn`) is entered the way the same model is
// as a Studio placement: its record collides on the model's own baked walls
// and furniture (authored_town_buildings.ts buildingRecordColliders) instead
// of one sealed box, and the floor and entry step it bakes are walkable
// ground (placement_ramps.ts, beside the placements' decks). Both come from
// the ONE placement this leaf resolves, so the walls, the floor and the drawn
// model cannot drift apart. Pure leaf: no rng, no clock, no SimContext.

import { FENBRIDGE_LAYOUT } from './fenbridge_layout';
import type { BuildingDef, PlacedAsset, WorldContent } from './types';

/** The height a placed model is normalized to by its largest dimension: a
 *  baked collision row is stored in multiples of that dimension over this
 *  (placed_assets.ts targetHeightFor, the editor's TARGET_HEIGHT). */
const PLACED_TARGET_HEIGHT = 2.2;
const EPSILON = 1e-6;

const WALK_IN_BUILDINGS = FENBRIDGE_LAYOUT.buildings.filter((building) => building.walkIn);

/** One world box round every walk-in building's whole model (its reach, with
 *  a yard to spare), where its floor and entry step can stand. */
const WALK_IN_BOUNDS = (() => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const building of WALK_IN_BUILDINGS) {
    const reach = building.reach;
    const radius = Math.hypot(reach.halfWidth, reach.halfDepth) + 1;
    minX = Math.min(minX, reach.center.x - radius);
    maxX = Math.max(maxX, reach.center.x + radius);
    minZ = Math.min(minZ, reach.center.z - radius);
    maxZ = Math.max(maxZ, reach.center.z + radius);
  }
  return { minX, maxX, minZ, maxZ };
})();

/** Whether (x, z) lies where a walk-in town floor could stand: the cheap test
 *  that lets a world with no placements skip the deck table everywhere else. */
export function nearTownWalkIn(x: number, z: number): boolean {
  return (
    x >= WALK_IN_BOUNDS.minX &&
    x <= WALK_IN_BOUNDS.maxX &&
    z >= WALK_IN_BOUNDS.minZ &&
    z <= WALK_IN_BOUNDS.maxZ
  );
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/**
 * The Studio-placement form of a walk-in town record, or null for any other
 * record. A record a custom world moved, turned or resized gets null: its
 * walls and floor are authored around the layout's own anchor, so it falls
 * back to one sealed box rather than leaving invisible walls behind.
 */
export function walkInPlacementFor(building: BuildingDef): PlacedAsset | null {
  if (building.id === undefined) return null;
  const record = WALK_IN_BUILDINGS.find((candidate) => candidate.id === building.id);
  if (!record) return null;
  if (
    !sameNumber(record.position.x, building.x) ||
    !sameNumber(record.position.z, building.z) ||
    !sameNumber(record.nativeDimensions.width, building.w) ||
    !sameNumber(record.nativeDimensions.depth, building.d) ||
    !sameNumber(record.rotation, building.rot)
  ) {
    return null;
  }
  const placement = record.placement;
  return {
    path: record.assetId,
    x: placement.x,
    z: placement.z,
    rotY: placement.rotation,
    scale: (placement.scale * placement.modelSize) / PLACED_TARGET_HEIGHT,
    y: placement.lift,
    collideRadius: 1,
  };
}

/**
 * Every walk-in record a world stands, as placements. A document that owns
 * the towns' buildings as its own placements (promotedScenery.authoredTowns)
 * stands the records down, and its placements carry the floors instead.
 */
export function townWalkInPlacements(content: WorldContent): PlacedAsset[] {
  if (content.promotedScenery?.authoredTowns === true) return [];
  const out: PlacedAsset[] = [];
  for (const building of content.props?.buildings ?? []) {
    const placement = walkInPlacementFor(building);
    if (placement) out.push(placement);
  }
  return out;
}
