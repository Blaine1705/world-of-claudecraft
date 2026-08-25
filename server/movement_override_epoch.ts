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

function positionDiscontinuous(
  entity: Entity,
  previousPosition: Vec3,
  active: boolean,
  moveSpeedMult: number,
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
  if (active || (previousSignature && overrideActive(previousSignature))) {
    return false;
  }
  const maxIntentStep =
    RUN_SPEED * Math.max(moveSpeedMult, previousSignature?.moveSpeedMult ?? 0) * DT;
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
    const crowdControlled = entity.auras.some((aura) => OVERRIDE_CC_KINDS.has(aura.kind));
    const feared = entity.auras.some(
      (aura) => aura.id === 'fear_incap' && aura.kind === 'incapacitate',
    );
    const charging = entity.chargeTargetId !== null;
    const following = entity.followTargetId !== null;
    const heroicLeaping = entity.leap != null;
    const valkyrsCalling = entity.valkyrsCalling != null;
    const mountRaceLocked = meta.mountRace?.phase === 'countdown';
    const climbing = entity.climb != null;
    const moveSpeedMult = sim.moveSpeedMult(entity);
    const active =
      crowdControlled ||
      feared ||
      charging ||
      following ||
      heroicLeaping ||
      valkyrsCalling ||
      mountRaceLocked ||
      climbing;
    const signature = session.movementOverrideSignature;
    const signatureChanged =
      signature !== null &&
      (signature.crowdControlled !== crowdControlled ||
        signature.feared !== feared ||
        signature.charging !== charging ||
        signature.following !== following ||
        signature.heroicLeaping !== heroicLeaping ||
        signature.valkyrsCalling !== valkyrsCalling ||
        signature.mountRaceLocked !== mountRaceLocked ||
        signature.climbing !== climbing ||
        signature.moveSpeedMult !== moveSpeedMult);
    const discontinuous =
      session.movementAuthoritativePosition !== null &&
      positionDiscontinuous(
        entity,
        session.movementAuthoritativePosition,
        active,
        moveSpeedMult,
        signature,
      );
    if (signatureChanged || discontinuous) session.movementOverrideEpoch++;
    if (signature) {
      signature.crowdControlled = crowdControlled;
      signature.feared = feared;
      signature.charging = charging;
      signature.following = following;
      signature.heroicLeaping = heroicLeaping;
      signature.valkyrsCalling = valkyrsCalling;
      signature.mountRaceLocked = mountRaceLocked;
      signature.climbing = climbing;
      signature.moveSpeedMult = moveSpeedMult;
    } else {
      session.movementOverrideSignature = {
        crowdControlled,
        feared,
        charging,
        following,
        heroicLeaping,
        valkyrsCalling,
        mountRaceLocked,
        climbing,
        moveSpeedMult,
      };
    }
    session.movementOverrideActive = active;
    session.movementMoveSpeedMult = moveSpeedMult;
    if (session.movementAuthoritativePosition) {
      session.movementAuthoritativePosition.x = entity.pos.x;
      session.movementAuthoritativePosition.y = entity.pos.y;
      session.movementAuthoritativePosition.z = entity.pos.z;
    } else {
      session.movementAuthoritativePosition = { ...entity.pos };
    }
  }
}
