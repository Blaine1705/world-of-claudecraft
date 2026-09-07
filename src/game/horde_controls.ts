import { HORDE_QUEST_ID } from '../sim/content/world_quest_horde';
import type { MoveInput } from '../sim/types';
import type { IWorld } from '../world_api';

const exitRequests = new WeakMap<object, number>();

export function requestHordeExit(world: Pick<IWorld, 'worldQuestLog'>): void {
  const state = world.worldQuestLog.get(HORDE_QUEST_ID)?.horde;
  if (state && hordeControlsActive(world)) exitRequests.set(world, state.seed);
}

/** Hold ordinary backward intent until the server acknowledges departure. */
export function hordeExitInput(world: Pick<IWorld, 'worldQuestLog'>, input: MoveInput): MoveInput {
  const seed = exitRequests.get(world);
  if (seed === undefined) return input;
  if (hordeControlsActive(world) && world.worldQuestLog.get(HORDE_QUEST_ID)?.horde?.seed === seed) {
    input.back = true;
  } else exitRequests.delete(world);
  return input;
}

/** The lane owns facing and locomotion while raw movement keys still steer it. */
export function hordeControlsActive(world: Pick<IWorld, 'worldQuestLog'>): boolean {
  const phase = world.worldQuestLog.get(HORDE_QUEST_ID)?.horde?.phase;
  return phase === 'countdown' || phase === 'active';
}
