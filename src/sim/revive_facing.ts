// The heading a revived body lands with. A revive that puts the body back where the
// spirit already stands (corpse resurrection, the Spirit Healer, an instance re-entry,
// a dev or moderator revive in place) is not a teleport: the player keeps the heading
// they were running with, so a held movement key and the follow camera carry straight
// on instead of snapping the body to face +Z (north). Only a revive that actually
// displaces the body (a graveyard revive, a summon to another spot) resets the heading,
// paired with prevFacing so the render-interpolated facing lands cleanly.

/** Two landing points closer than this on the ground plane count as the same spot. */
export const REVIVE_IN_PLACE_EPSILON = 0.01;

export interface ReviveFacing {
  facing: number;
  prevFacing: number;
}

export function reviveFacing(
  current: ReviveFacing,
  from: { x: number; z: number },
  to: { x: number; z: number },
): ReviveFacing {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const inPlace = dx * dx + dz * dz <= REVIVE_IN_PLACE_EPSILON * REVIVE_IN_PLACE_EPSILON;
  if (inPlace && Number.isFinite(current.facing)) {
    return { facing: current.facing, prevFacing: current.facing };
  }
  return { facing: 0, prevFacing: 0 };
}
