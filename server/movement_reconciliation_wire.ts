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
  // Full precision for px/py/pz/pf is LOAD-BEARING for exact-match reconciliation.
  // Rounding makes every acknowledged pose mismatch and forces a replay.
  // The self px/py/pz keys share wireEntity's namespace with its pet-autocast px flag.
  // That flag is ownerId-gated here, so future wireEntity fields must use non-colliding keys.
  return {
    ackCt: session.lastConsumedCt,
    px: entity.pos.x,
    py: entity.pos.y,
    pz: entity.pos.z,
    pf: entity.facing,
    ovE: session.movementOverrideEpoch,
    ...(session.movementOverrideActive ? { ovA: 1 } : {}),
    ...(session.movementMoveSpeedMult !== 1 ? { msm: session.movementMoveSpeedMult } : {}),
  };
}
