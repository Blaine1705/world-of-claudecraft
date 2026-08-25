import type { PlayerMeta, Sim } from '../src/sim/sim';
import { DT, type Entity, RUN_SPEED, type Vec3 } from '../src/sim/types';

const OVERRIDE_CC_KINDS = new Set(['stun', 'root', 'incapacitate', 'polymorph']);
const POSITION_EPSILON = 1e-9;

export interface MovementOverrideSignature {
  crowdControlled: boolean;
  feared: boolean;
  charging: boolean;
  following: boolean;
  heroicLeaping: boolean;
  valkyrsCalling: boolean;
  mountRaceLocked: boolean;
  climbing: boolean;
  moveSpeedMult: number;
}

export interface MovementOverrideSessionState {
  pid: number;
  movementWireVersion: 1 | 2;
  movementOverrideSignature: MovementOverrideSignature | null;
  movementOverrideEpoch: number;
  movementOverrideActive: boolean;
  movementMoveSpeedMult: number;
  movementAuthoritativePosition: Vec3 | null;
}

export function createMovementOverrideSessionState(): Pick<
  MovementOverrideSessionState,
  | 'movementOverrideSignature'
  | 'movementOverrideEpoch'
  | 'movementOverrideActive'
  | 'movementMoveSpeedMult'
  | 'movementAuthoritativePosition'
> {
  return {
    movementOverrideSignature: null,
    movementOverrideEpoch: 0,
    movementOverrideActive: false,
    movementMoveSpeedMult: 1,
    movementAuthoritativePosition: null,
  };
}

export function computeOverrideSignature(
  entity: Entity,
  meta: Pick<PlayerMeta, 'mountRace'>,
  moveSpeedMult: number,
): MovementOverrideSignature {
  return {
    crowdControlled: entity.auras.some((aura) => OVERRIDE_CC_KINDS.has(aura.kind)),
    feared: entity.auras.some((aura) => aura.id === 'fear_incap' && aura.kind === 'incapacitate'),
    charging: entity.chargeTargetId !== null,
    following: entity.followTargetId !== null,
    heroicLeaping: entity.leap != null,
    valkyrsCalling: entity.valkyrsCalling != null,
    mountRaceLocked: meta.mountRace?.phase === 'countdown',
    climbing: entity.climb != null,
    moveSpeedMult,
  };
}

export function overrideActive(signature: MovementOverrideSignature): boolean {
  return (
    signature.crowdControlled ||
    signature.feared ||
    signature.charging ||
    signature.following ||
    signature.heroicLeaping ||
    signature.valkyrsCalling ||
    signature.mountRaceLocked ||
    signature.climbing
  );
}

function signaturesEqual(a: MovementOverrideSignature, b: MovementOverrideSignature): boolean {
  return (
    a.crowdControlled === b.crowdControlled &&
    a.feared === b.feared &&
    a.charging === b.charging &&
    a.following === b.following &&
    a.heroicLeaping === b.heroicLeaping &&
    a.valkyrsCalling === b.valkyrsCalling &&
    a.mountRaceLocked === b.mountRaceLocked &&
    a.climbing === b.climbing &&
    a.moveSpeedMult === b.moveSpeedMult
  );
}

function positionDiscontinuous(
  entity: Entity,
  previousPosition: Vec3,
  signature: MovementOverrideSignature,
  previousSignature: MovementOverrideSignature | null,
): boolean {
  const dx = entity.pos.x - previousPosition.x;
  const dy = entity.pos.y - previousPosition.y;
  const dz = entity.pos.z - previousPosition.z;
  const movedSq = dx * dx + dy * dy + dz * dz;
  if (movedSq <= POSITION_EPSILON) return false;
  if (
    entity.pos.x === entity.prevPos.x &&
    entity.pos.y === entity.prevPos.y &&
    entity.pos.z === entity.prevPos.z
  ) {
    return true;
  }
  if (overrideActive(signature) || (previousSignature && overrideActive(previousSignature))) {
    return false;
  }
  const maxIntentStep =
    RUN_SPEED * Math.max(signature.moveSpeedMult, previousSignature?.moveSpeedMult ?? 0) * DT;
  return Math.hypot(dx, dz) > maxIntentStep + POSITION_EPSILON;
}

export function updateMovementOverrideEpochs(
  sim: Pick<Sim, 'entities' | 'meta' | 'moveSpeedMult'>,
  sessions: Iterable<MovementOverrideSessionState>,
): void {
  for (const session of sessions) {
    if (session.movementWireVersion !== 2) continue;
    const entity = sim.entities.get(session.pid);
    const meta = sim.meta(session.pid);
    if (!entity || !meta) continue;
    const signature = computeOverrideSignature(entity, meta, sim.moveSpeedMult(entity));
    const signatureChanged =
      session.movementOverrideSignature !== null &&
      !signaturesEqual(session.movementOverrideSignature, signature);
    const discontinuous =
      session.movementAuthoritativePosition !== null &&
      positionDiscontinuous(
        entity,
        session.movementAuthoritativePosition,
        signature,
        session.movementOverrideSignature,
      );
    if (signatureChanged || discontinuous) session.movementOverrideEpoch++;
    session.movementOverrideSignature = signature;
    session.movementOverrideActive = overrideActive(signature);
    session.movementMoveSpeedMult = signature.moveSpeedMult;
    session.movementAuthoritativePosition = { ...entity.pos };
  }
}
