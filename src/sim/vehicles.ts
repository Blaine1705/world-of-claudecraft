// Authoritative session adapter. Private actors never enter the shared roster.
import { NORTH_WATCH_CANNON } from './content/vehicle_stations';
import { createGroundObject } from './entity';
import {
  CANNON_RETRY_TICKS,
  createCannonEncounter,
  fireCannon,
  tickCannonEncounter,
} from './minigames/cannon_encounter';
import { cannonResult } from './minigames/cannon_tactics';
import { forceDismount } from './mounts';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import {
  type CannonActionId,
  type CannonPoint,
  type Entity,
  INTERACT_RANGE,
  type VehicleSession,
} from './types';
import { activeWorldQuestsForCycle } from './world_quest_rotation';
import { completeWorldQuestVehicle } from './world_quests';

/** Lazily created without consuming allocator IDs or changing terrain anchors. */
export function ensureVehicleStation(ctx: SimContext): void {
  if (ctx.cfg.world || ctx.entities.has(NORTH_WATCH_CANNON.entityId)) return;
  const station = createGroundObject(
    NORTH_WATCH_CANNON.entityId,
    NORTH_WATCH_CANNON.id,
    'North Watch Cannon',
    ctx.groundPos(NORTH_WATCH_CANNON.x, NORTH_WATCH_CANNON.z),
  );
  station.templateId = NORTH_WATCH_CANNON.id;
  ctx.addEntity(station);
}

function eligible(ctx: SimContext, meta: PlayerMeta, player: Entity): boolean {
  const cycle = meta.devWorldQuestCycle ?? ctx.currentWorldQuestRotation().cycle;
  return (
    !ctx.cfg.world &&
    !meta.leaving &&
    !player.dead &&
    !player.inCombat &&
    meta.worldQuestCycle === cycle &&
    player.level >= 10 &&
    activeWorldQuestsForCycle(meta.worldQuestCycle).some(
      (q) => q.id === NORTH_WATCH_CANNON.questId,
    ) &&
    ['active', 'completed'].includes(
      meta.worldQuestLog.get(NORTH_WATCH_CANNON.questId)?.state ?? '',
    )
  );
}

export function enterVehicle(ctx: SimContext, stationId: string, pid?: number): boolean {
  const resolved = ctx.resolve(pid);
  if (!resolved || stationId !== NORTH_WATCH_CANNON.id) return false;
  const { meta, e: player } = resolved;
  if (
    meta.vehicle ||
    ctx.tickCount < (meta.vehicleRetryAtTick ?? 0) ||
    !eligible(ctx, meta, player)
  )
    return false;
  const station = ctx.entities.get(NORTH_WATCH_CANNON.entityId);
  if (
    !station ||
    station.templateId !== stationId ||
    Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z) > INTERACT_RANGE ||
    Math.abs(player.pos.y - station.pos.y) > INTERACT_RANGE ||
    player.leap ||
    player.climb ||
    player.valkyrsCalling ||
    player.chargeTargetId !== null ||
    player.jumping ||
    meta.mountRace ||
    meta.mountTraining?.state === 'IN_PROGRESS'
  )
    return false;
  ctx.cancelCast(player);
  forceDismount(ctx, player);
  player.autoAttack = false;
  player.followTargetId = null;
  player.vx = player.vy = player.vz = 0;
  meta.vehicle = {
    kind: 'cannon',
    stationId,
    cycle: meta.worldQuestCycle,
    origin: { ...player.pos },
    encounter: createCannonEncounter(),
  };
  meta.wireRev++;
  return true;
}

export function leaveVehicle(ctx: SimContext, pid?: number): void {
  const resolved = ctx.resolve(pid);
  if (!resolved?.meta.vehicle) return;
  resolved.meta.vehicle = null;
  resolved.meta.wireRev++;
}

function remainsAtStation(player: Entity, session: VehicleSession): boolean {
  return (
    Math.hypot(player.pos.x - session.origin.x, player.pos.z - session.origin.z) <= 0.1 &&
    Math.abs(player.pos.y - session.origin.y) <= 0.1
  );
}

export function useVehicleAction(
  ctx: SimContext,
  action: CannonActionId,
  point: CannonPoint,
  pid?: number,
): boolean {
  const resolved = ctx.resolve(pid);
  const session = resolved?.meta.vehicle;
  if (
    !resolved ||
    !session ||
    !eligible(ctx, resolved.meta, resolved.e) ||
    session.cycle !== resolved.meta.worldQuestCycle ||
    !remainsAtStation(resolved.e, session)
  )
    return false;
  return fireCannon(session.encounter, NORTH_WATCH_CANNON.field, action, point);
}

export function tickVehicle(ctx: SimContext, meta: PlayerMeta, player: Entity): void {
  const session = meta.vehicle;
  if (!session) return;
  if (
    !eligible(ctx, meta, player) ||
    session.cycle !== meta.worldQuestCycle ||
    !remainsAtStation(player, session)
  ) {
    leaveVehicle(ctx, meta.entityId);
    return;
  }
  tickCannonEncounter(session.encounter, NORTH_WATCH_CANNON.field);
  if (session.encounter.phase === 'won') {
    completeWorldQuestVehicle(ctx, meta, session.stationId);
    ctx.emit({ type: 'cannonResult', pid: meta.entityId, ...cannonResult(session.encounter) });
    leaveVehicle(ctx, meta.entityId);
  } else if (session.encounter.phase === 'failed') {
    ctx.emit({ type: 'cannonResult', pid: meta.entityId, ...cannonResult(session.encounter) });
    // The encounter's local clock freezes at failure; retry uses the live Sim clock.
    meta.vehicleRetryAtTick = ctx.tickCount + CANNON_RETRY_TICKS;
    leaveVehicle(ctx, meta.entityId);
  }
}

/** Boundary clone: a UI/host caller cannot mutate authoritative actors. */
export function vehicleSessionFor(ctx: SimContext, pid?: number): VehicleSession | null {
  const session = ctx.resolve(pid)?.meta.vehicle;
  if (!session) return null;
  const encounter = session.encounter;
  return {
    ...session,
    origin: { ...session.origin },
    encounter: {
      ...encounter,
      readyAt: { ...encounter.readyAt },
      enemies: encounter.enemies.map((enemy) => ({ ...enemy })),
      shots: encounter.shots.map((shot) => ({ ...shot })),
      fires: encounter.fires.map((fire) => ({ ...fire })),
      barrels: encounter.barrels.map((barrel) => ({ ...barrel })),
      feedback: encounter.feedback.map((effect) => ({ ...effect })),
    },
  };
}
