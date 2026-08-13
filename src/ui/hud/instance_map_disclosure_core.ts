// Host-neutral disclosure boundary for actionable live instance-map markers.
//
// Offline Sim retains the complete instance roster while online ClientWorld is
// interest-scoped. Keeping map disclosure inside the server's 90-yard ordinary
// entity enter radius makes both hosts reveal the same enemy and object state.

export const INSTANCE_MAP_ENTITY_DISCLOSURE_RADIUS = 80;
const INSTANCE_MAP_ENTITY_DISCLOSURE_RADIUS_SQ =
  INSTANCE_MAP_ENTITY_DISCLOSURE_RADIUS * INSTANCE_MAP_ENTITY_DISCLOSURE_RADIUS;

/** Inclusive planar-distance check, allocation-free for hot map redraws. */
export function isInstanceMapEntityDisclosed(
  playerX: number,
  playerZ: number,
  entityX: number,
  entityZ: number,
): boolean {
  const dx = entityX - playerX;
  const dz = entityZ - playerZ;
  return dx * dx + dz * dz <= INSTANCE_MAP_ENTITY_DISCLOSURE_RADIUS_SQ;
}
