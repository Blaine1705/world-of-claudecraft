import { ONLINE_WORLD_AUTH_TYPE, PET_SPECIAL_WIRE_VERSION } from '../world_api';
import { STABLE_TIMER_WIRE_VERSION } from './snapshot_timer_wire';

export function buildWebSocketAuthMessage(
  token: string,
  characterId: number,
  clientSeed = '',
): {
  t: typeof ONLINE_WORLD_AUTH_TYPE;
  token: string;
  character: number;
  clientSeed: string;
  timerWire: typeof STABLE_TIMER_WIRE_VERSION;
  petSpecialWire: typeof PET_SPECIAL_WIRE_VERSION;
  movementWire: 2;
} {
  return {
    t: ONLINE_WORLD_AUTH_TYPE,
    token,
    character: characterId,
    clientSeed,
    timerWire: STABLE_TIMER_WIRE_VERSION,
    petSpecialWire: PET_SPECIAL_WIRE_VERSION,
    movementWire: 2,
  };
}
