import { GLIDER_QUEST_ID } from '../sim/content/world_quest_glider';
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
  return gliderControlsActive(world) || hordeControlsActive(world);
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

/** A walking destination must not inject steering, speed or automatic jumps in flight. */
export function resolveGliderMove(world: Pick<IWorld, 'worldQuestLog'>, input: GliderInput) {
  if (!gliderControlsActive(world)) return null;
  input.clearClickMove();
  return { mi: input.readMoveInput(), facing: gliderCameraFacing(input) };
}
