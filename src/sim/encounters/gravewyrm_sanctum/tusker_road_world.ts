// The Trample lane in WORLD coordinates, for the clients that read the fight
// off mirrored entities (the renderer's lane paint and the HUD alert): the
// same plan the encounter makes (tusker_road.ts planTrampleLane) from the
// Tusker's world position, its locked facing and the outcrop objects in view.
// The Sanctum's instances are laid out along z, so a world z names its slot.
//
// Zero rng, no SimContext.

import { DUNGEONS, instanceOrigin, instanceSlotForZ } from '../../data';
import type { TuskerLane } from '../../types';
import { SANCTUM_DUNGEON } from './ids';
import { type OutcropSpot, planTrampleLane } from './tusker_road';

/** The origin of the Sanctum instance a world z lies in. */
export function sanctumOriginAt(z: number): { x: number; z: number } {
  const def = DUNGEONS[SANCTUM_DUNGEON];
  if (!def) return { x: 0, z: 0 };
  return instanceOrigin(def.index, instanceSlotForZ(z));
}

/**
 * The Trample lane from a world spot along `yaw`, given the standing outcrops
 * in world coordinates. The lane comes back in WORLD coordinates (its start is
 * the spot given); its length, reach and outcrop are the encounter's own.
 */
export function planTrampleLaneWorld(
  x: number,
  z: number,
  yaw: number,
  outcrops: readonly OutcropSpot[],
): TuskerLane {
  const o = sanctumOriginAt(z);
  const local = outcrops.map((spot) => ({ id: spot.id, x: spot.x - o.x, z: spot.z - o.z }));
  const lane = planTrampleLane(x - o.x, z - o.z, yaw, local);
  return { ...lane, x, z };
}
