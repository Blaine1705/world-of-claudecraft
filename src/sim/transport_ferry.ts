// The scheduled ferry's passengers (Phase 2 of the Eastbrook ferry): who
// sails, how they ride, and where they step off. The timetable itself is
// the pure transport_schedule.ts; the deck colliders at each berth are gated
// by transport_gates.ts; this module is the SimContext system that ties them
// to the players, run once at the top of every tick
// (`updateTransportFerries`, before any player moves).
//
// The rules, all derived from the schedule clock (ctx.time plus the dev-only
// ctx.transportClockOffset):
//  - Departure: at the tick the ship leaves a berth, every player standing on
//    its deck becomes a passenger (their deck-local spot is recorded), except
//    a player in combat or a released spirit, who is set down on the pier;
//    anyone still on the gangway or gangplank is set down on the pier too, so
//    nobody drops into the water when the deck colliders go. A passenger is
//    dismounted and their pet is parked (the delve pet-park round trip).
//  - Carrying: the ship's pose owns a passenger's position (and heading)
//    every tick; Sim.updatePlayerMovement skips them, so movement input is
//    locked while chat, emotes, casts and looking around still work. On the
//    hidden at-sea leg they are held with the ship's held pose and cross
//    from the departure path's end to the arrival path's start at its middle.
//  - Arrival: once the ship lies docked, every passenger is released on the
//    deck at the same local spot, their pet returns, and the crossing marks
//    their Book of Deeds (the ferry deed takes both directions).
//  - Anything else that moves a passenger (a dev teleport, a hearth, an
//    unstuck) ends the ride where it put them. A passenger who dies rides on
//    as a corpse and is set down with the ship; one who releases their spirit
//    leaves the ride and their corpse is carried to the destination pier.
//  - A save taken aboard (logout, disconnect, autosave) records the
//    destination pier, and a save taken on a docked deck records that berth's
//    pier, so a reconnect never lands in the sea (`ferrySavePosition`).
//
// Draws ZERO rng; iterates players in roster order; `src/sim`-pure.

import { setColliderGateOpen } from './colliders';
import { TRANSPORT_ROUTES, TRANSPORT_SHIP_HULLS } from './content/transport_ships';
import { isBuiltinWorldActive } from './data';
import { markVisited } from './deeds';
import { forceDismount } from './mounts';
import { restorePetFromDelveStash, stowPetForDelve } from './pet/pet_commands';
import { cancelProfessionSessionOnDisplacement } from './professions/session_teardown';
import type { SimContext } from './sim_context';
import { settleTeleportArrival } from './teleport_arrival';
import { syncTransportGates } from './transport_gates';
import {
  emptyTransportFerryView,
  type TransportFerryView,
  type TransportPhaseState,
  type TransportPose,
  type TransportRouteDef,
  transportFerryViewAt,
  transportPhaseAt,
  transportShipPoseAt,
} from './transport_schedule';
import { type ShipHullLayout, shipToWorld, worldToShip } from './transport_ship';
import { DT, type Entity } from './types';
import { WATER_LEVEL } from './world';

/** Feet this far below the main deck still count as aboard (a stair tread,
 *  the hatch step, a landing from a hop). A swimmer is far lower. */
const ABOARD_BELOW_DECK = 1.0;
/** ...and never more than this far above the waterline (a leap overhead). */
const ABOARD_MAX_ABOVE_WATER = 14;
/** How far outside a boarding volume (gangway, gangplank) still counts as on it. */
const BOARDING_MARGIN = 0.6;
/** A passenger found this far from where the ride last put them was moved by
 *  something else (a teleport): the ride ends there. */
const RIDE_DISPLACED_YD = 1.5;
/** A carried step longer than this is the at-sea crossing, treated as a
 *  teleport (interpolation reset, rebucket, session teardown). */
const RIDE_JUMP_YD = 30;

/** The schedule clock: sim seconds plus the dev-only skip offset. */
export function transportClock(ctx: SimContext): number {
  return ctx.time + ctx.transportClockOffset;
}

function hullFor(route: TransportRouteDef): ShipHullLayout | null {
  return Object.hasOwn(TRANSPORT_SHIP_HULLS, route.ship) ? TRANSPORT_SHIP_HULLS[route.ship] : null;
}

/** Is the body on the ship's deck (inside the hull, at deck height)? */
function aboard(hull: ShipHullLayout, pose: TransportPose, e: Entity): boolean {
  const local = worldToShip({ ...pose, baseY: WATER_LEVEL }, e.pos.x, e.pos.z);
  const above = e.pos.y - WATER_LEVEL;
  return (
    Math.abs(local.z) <= hull.length / 2 &&
    Math.abs(local.x) <= hull.beam / 2 &&
    above >= hull.mainDeckY - ABOARD_BELOW_DECK &&
    above <= ABOARD_MAX_ABOVE_WATER
  );
}

/** Is the body on a boarding volume (the gangway platform or gangplank)? */
function onBoardingRoute(hull: ShipHullLayout, pose: TransportPose, e: Entity): boolean {
  const local = worldToShip({ ...pose, baseY: WATER_LEVEL }, e.pos.x, e.pos.z);
  const above = e.pos.y - WATER_LEVEL;
  if (above < hull.mainDeckY - 2 || above > ABOARD_MAX_ABOVE_WATER) return false;
  for (const v of hull.volumes) {
    if (v.kind !== 'gangway' && v.kind !== 'gangplank') continue;
    const hw = (v.hw ?? 0.5) + BOARDING_MARGIN;
    const hd = (v.hd ?? 0.5) + BOARDING_MARGIN;
    if (Math.abs(local.x - v.x) <= hw && Math.abs(local.z - v.z) <= hd) return true;
  }
  return false;
}

/** Put a player down on a berth's pier (no log line: the HUD explains). */
function setDown(ctx: SimContext, p: Entity, landing: { x: number; z: number; facing: number }) {
  cancelProfessionSessionOnDisplacement(ctx, p);
  p.pos = ctx.groundPos(landing.x, landing.z);
  p.prevPos = { ...p.pos };
  ctx.rebucket(p);
  p.facing = landing.facing;
  settleTeleportArrival(p);
}

function board(
  ctx: SimContext,
  route: TransportRouteDef,
  hull: ShipHullLayout,
  berth: number,
): void {
  const b = route.berths[berth];
  const pose: TransportPose = { x: b.x, z: b.z, rot: b.rot };
  for (const meta of ctx.players.values()) {
    const p = ctx.entities.get(meta.entityId);
    if (!p || p.ferryRide) continue;
    if (!aboard(hull, pose, p)) {
      if (onBoardingRoute(hull, pose, p) && !p.dead) setDown(ctx, p, b.landing);
      continue;
    }
    if (p.ghost || p.inCombat) {
      // a spirit or a fighter stays behind: set down on the pier
      setDown(ctx, p, b.landing);
      if (p.inCombat) ctx.error(p.id, 'You cannot board the ferry while in combat.');
      continue;
    }
    const local = worldToShip({ ...pose, baseY: WATER_LEVEL }, p.pos.x, p.pos.z);
    p.ferryRide = {
      route: route.id,
      to: 1 - berth,
      lx: local.x,
      ly: Math.max(hull.mainDeckY, p.pos.y - WATER_LEVEL),
      lz: local.z,
      lf: p.facing - b.rot,
      wx: p.pos.x,
      wz: p.pos.z,
      atSea: false,
    };
    forceDismount(ctx, p);
    stowPetForDelve(ctx, p.id);
    p.targetId = null;
    p.autoAttack = false;
    settleTeleportArrival(p);
  }
}

/** Where a passenger's local spot lies on the ship at `pose`. */
function carry(ctx: SimContext, p: Entity, pose: TransportPose, atSea: boolean): void {
  const ride = p.ferryRide;
  if (!ride) return;
  const at = shipToWorld({ ...pose, baseY: WATER_LEVEL }, ride.lx, ride.lz);
  const jump = Math.hypot(at.x - p.pos.x, at.z - p.pos.z) > RIDE_JUMP_YD;
  p.pos.x = at.x;
  p.pos.z = at.z;
  p.pos.y = WATER_LEVEL + ride.ly;
  p.facing = pose.rot + ride.lf;
  p.vx = 0;
  p.vz = 0;
  settleTeleportArrival(p);
  if (jump) {
    // the at-sea crossing: a teleport behind the sea card
    cancelProfessionSessionOnDisplacement(ctx, p);
    p.prevPos = { ...p.pos };
    ctx.rebucket(p);
  }
  ride.wx = p.pos.x;
  ride.wz = p.pos.z;
  ride.atSea = atSea;
}

function endRide(ctx: SimContext, p: Entity): void {
  p.ferryRide = null;
  // the parked pet comes back beside its owner wherever the ride ended
  restorePetFromDelveStash(ctx, p.id);
}

const phaseNow: TransportPhaseState = {
  phase: 'docked',
  berth: 0,
  from: 0,
  to: 1,
  elapsed: 0,
  remaining: 0,
  departsIn: 0,
};
const phasePrev: TransportPhaseState = { ...phaseNow };
const poseNow: TransportPose = { x: 0, z: 0, rot: 0 };

/** The per-tick ferry system (called at the top of Sim.tick). */
export function updateTransportFerries(ctx: SimContext): void {
  if (!isBuiltinWorldActive()) return;
  const clock = transportClock(ctx);
  syncTransportGates(ctx.cfg.seed, clock, setColliderGateOpen);
  for (const route of TRANSPORT_ROUTES) {
    const hull = hullFor(route);
    if (!hull) continue;
    const visible = transportShipPoseAt(route, clock, poseNow, phaseNow);
    transportPhaseAt(route, clock - DT, phasePrev);
    if (
      phaseNow.phase === 'departing' &&
      phasePrev.phase === 'docked' &&
      phasePrev.berth === phaseNow.berth
    ) {
      board(ctx, route, hull, phaseNow.berth);
    }
    for (const meta of ctx.players.values()) {
      const p = ctx.entities.get(meta.entityId);
      const ride = p?.ferryRide;
      if (!p || !ride || ride.route !== route.id) continue;
      if (p.ghost) {
        // released aboard: the spirit went to its graveyard, and the body
        // is carried to the destination pier with the ship
        if (p.corpsePos) {
          const to = route.berths[ride.to].landing;
          p.corpsePos = ctx.groundPos(to.x, to.z);
        }
        endRide(ctx, p);
        continue;
      }
      if (Math.hypot(p.pos.x - ride.wx, p.pos.z - ride.wz) > RIDE_DISPLACED_YD) {
        endRide(ctx, p);
        continue;
      }
      if (phaseNow.phase === 'docked') {
        // landed: step off at the same deck spot
        const b = route.berths[phaseNow.berth];
        carry(ctx, p, { x: b.x, z: b.z, rot: b.rot }, false);
        if (!p.dead && phaseNow.berth === ride.to) {
          const from = route.berths[1 - ride.to].id;
          markVisited(ctx, meta, `ferry:${from}_${b.id}`);
        }
        endRide(ctx, p);
        continue;
      }
      carry(ctx, p, poseNow, !visible);
    }
  }
}

/**
 * The x/z a character save records: the destination pier for a passenger,
 * a berth's pier for a player on a docked deck (the ship may have sailed by
 * the time they log back in), otherwise where they stand.
 */
export function ferrySavePosition(e: Entity): { x: number; z: number } {
  for (const route of TRANSPORT_ROUTES) {
    const ride = e.ferryRide;
    if (ride && ride.route === route.id) {
      const to = route.berths[ride.to].landing;
      return { x: to.x, z: to.z };
    }
    const hull = hullFor(route);
    if (!hull) continue;
    for (const b of route.berths) {
      if (aboard(hull, { x: b.x, z: b.z, rot: b.rot }, e)) {
        return { x: b.landing.x, z: b.landing.z };
      }
    }
  }
  return { x: e.pos.x, z: e.pos.z };
}

const views = new WeakMap<SimContext, TransportFerryView>();

/** The offline world's IWorld.ferryView: the first route, for `viewer`. */
export function transportFerryView(ctx: SimContext, viewer: Entity | undefined) {
  const route = TRANSPORT_ROUTES[0];
  if (!route || !isBuiltinWorldActive()) return null;
  let view = views.get(ctx);
  if (!view) {
    view = emptyTransportFerryView(route);
    views.set(ctx, view);
  }
  const passenger = !!viewer?.ferryRide && viewer.ferryRide.route === route.id;
  return transportFerryViewAt(route, transportClock(ctx), WATER_LEVEL, passenger, view);
}
