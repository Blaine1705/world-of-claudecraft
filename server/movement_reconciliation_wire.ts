import type { Entity } from '../src/sim/types';

export interface MovementReconciliationSessionWireState {
  movementWireVersion: 1 | 2;
  lastConsumedCt: number;
  movementOverrideEpoch: number;
  movementOverrideActive: boolean;
  movementMoveSpeedMult: number;
}

export { updateMovementOverrideEpochs as updateOverrideEpochs } from './movement_override_epoch';

export function reconciliationSelfWire(
  session: MovementReconciliationSessionWireState,
  entity: Entity,
): Record<string, number> {
  if (session.movementWireVersion !== 2) return {};
  return {
    ackCt: session.lastConsumedCt,
    px: entity.pos.x,
    py: entity.pos.y,
    pz: entity.pos.z,
    pf: entity.facing,
    ovE: session.movementOverrideEpoch,
    ...(session.movementOverrideActive ? { ovA: 1 } : {}),
    msm: session.movementMoveSpeedMult,
  };
}
