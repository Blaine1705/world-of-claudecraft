import { GLIDER_QUEST_ID } from '../sim/content/world_quest_glider';
import { wispMazeActionsLocked } from '../sim/wisp_maze_action_lock';
import type { IWorld } from '../world_api';
import { hordeControlsActive } from './horde_controls';

/** Countdown and flight both belong to the authoritative flight kernel. */
export function gliderControlsActive(world: Pick<IWorld, 'worldQuestLog'>): boolean {
  const progress = world.worldQuestLog.get(GLIDER_QUEST_ID);
  const phase = progress?.glider?.phase;
  return phase === 'countdown' || phase === 'flying';
}

/** Walking prediction and keyboard yaw integration cannot model these modes. */
export function scriptedMovementActive(world: Pick<IWorld, 'worldQuestLog'>): boolean {
  return (
    gliderControlsActive(world) ||
    hordeControlsActive(world) ||
    wispMazeActionsLocked(world.worldQuestLog)
  );
}

interface GliderInput {
  rightDown: boolean;
  camYaw: number;
  isMouselookActive(): boolean;
  readMoveInput(): import('../sim/types').MoveInput;
  clearClickMove(): void;
}

/** Orbiting or a held movement key never overwrites the flight kernel's yaw. */
export function gliderCameraFacing(
  input: Pick<GliderInput, 'rightDown' | 'camYaw' | 'isMouselookActive'>,
): number | null {
  return input.rightDown && input.isMouselookActive() ? input.camYaw : null;
}

/** Private maze walls and flight cannot use the ordinary click-to-move pathfinder. */
export function resolveGliderMove(world: Pick<IWorld, 'worldQuestLog'>, input: GliderInput) {
  const maze = wispMazeActionsLocked(world.worldQuestLog);
  if (!gliderControlsActive(world) && !maze) return null;
  input.clearClickMove();
  return {
    mi: input.readMoveInput(),
    facing: maze ? (input.isMouselookActive() ? input.camYaw : null) : gliderCameraFacing(input),
  };
}
