import { HORDE_QUEST_ID, HORDE_SITE } from '../sim/content/world_quest_horde';
import { HORDE_DEPTH, HORDE_HALF_WIDTH } from '../sim/minigames/horde_barricade';
import type { IWorld } from '../world_api';
import type { VehicleCameraTarget } from './vehicle_camera_core';

export function hordeCameraTarget(
  world: Pick<IWorld, 'worldQuestLog'> & { player: Pick<IWorld['player'], 'pos'> },
): VehicleCameraTarget | null {
  const state = world.worldQuestLog.get(HORDE_QUEST_ID)?.horde;
  if (!state || (state.phase !== 'countdown' && state.phase !== 'active')) return null;
  return {
    x: HORDE_SITE.x,
    z: HORDE_SITE.z,
    y: world.player.pos.y,
    yaw: 0,
    // Keep the firing position above the normal player frame and action bar.
    focusOffsetZ: -8,
    field: {
      minX: HORDE_SITE.x - HORDE_HALF_WIDTH,
      maxX: HORDE_SITE.x + HORDE_HALF_WIDTH,
      minZ: HORDE_SITE.z,
      maxZ: HORDE_SITE.z + HORDE_DEPTH,
    },
  };
}
