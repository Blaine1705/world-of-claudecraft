import { beforeEach, describe, expect, it } from 'vitest';
import { supportHeightAt } from '../src/sim/colliders';
import {
  EASTBROOK_FERRY_HULL,
  EASTBROOK_WICKHARBOR_FERRY,
  TRANSPORT_ROUTES,
} from '../src/sim/content/transport_ships';
import { handleFerryDevChat } from '../src/sim/dev/ferry_dev';
import { restorePet } from '../src/sim/pet/pet_commands';
import { Sim } from '../src/sim/sim';
import { transportClock } from '../src/sim/transport_ferry';
import {
  type TransportPose,
  transportCycleSeconds,
  transportPathLength,
  transportPathPose,
  transportPhaseAt,
  transportShipPoseAt,
} from '../src/sim/transport_schedule';
import { shipToWorld, worldToShip } from '../src/sim/transport_ship';
import { DT, type Entity } from '../src/sim/types';
import { groundHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// Phase 2 of the Eastbrook ferry: the scheduled, free, round-trip crossing to
// Wickharbor. The timetable is a pure function of the schedule clock; these
// drive the REAL Sim through departures and arrivals and pin who sails, where
// they ride, and where they step off.

const ROUTE = EASTBROOK_WICKHARBOR_FERRY;
const HULL = EASTBROOK_FERRY_HULL;
const T = ROUTE.timings;
const EAST = ROUTE.berths[0];
const WICK = ROUTE.berths[1];
/** Clock of the first departure from Eastbrook (the cycle opens docked there). */
const DEPART_EAST = T.docked;
const ARRIVE_WICK = T.docked + T.departing + T.atSea + T.arriving;
const DEPART_WICK = ARRIVE_WICK + T.docked;
const CYCLE = transportCycleSeconds(ROUTE);

function berthPose(i: 0 | 1) {
  const b = ROUTE.berths[i];
  return { x: b.x, z: b.z, rot: b.rot, baseY: WATER_LEVEL };
}

const idle = {
  forward: false,
  back: false,
  turnLeft: false,
  turnRight: false,
  strafeLeft: false,
  strafeRight: false,
  jump: false,
  dive: false,
  surface: false,
};

function setClock(sim: Sim, clock: number): void {
  sim.transportClockOffset = clock - sim.time;
}

function tickSeconds(sim: Sim, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) sim.tick();
}

function place(e: Entity, x: number, y: number, z: number): void {
  e.pos.x = x;
  e.pos.y = y;
  e.pos.z = z;
  e.prevPos = { ...e.pos };
  e.vx = 0;
  e.vy = 0;
  e.vz = 0;
  e.onGround = true;
}

function placeOnDeck(sim: Sim, e: Entity, berth: 0 | 1, lx: number, lz: number): void {
  const at = shipToWorld(berthPose(berth), lx, lz);
  place(e, at.x, WATER_LEVEL + HULL.mainDeckY, at.z);
  void sim;
}

describe('the timetable (pure)', () => {
  it('runs one fixed cycle: docked, departing, at sea, arriving, then the mirror trip', () => {
    expect(CYCLE).toBe(2 * (T.docked + T.departing + T.atSea + T.arriving));
    const at = (c: number) => {
      const s = transportPhaseAt(ROUTE, c);
      return `${s.phase}@${ROUTE.berths[s.berth].id}`;
    };
    expect(at(0)).toBe('docked@eastbrook');
    expect(at(DEPART_EAST - 0.001)).toBe('docked@eastbrook');
    expect(at(DEPART_EAST)).toBe('departing@eastbrook');
    expect(at(DEPART_EAST + T.departing)).toBe('atSea@wickharbor');
    expect(at(DEPART_EAST + T.departing + T.atSea)).toBe('arriving@wickharbor');
    expect(at(ARRIVE_WICK)).toBe('docked@wickharbor');
    expect(at(DEPART_WICK)).toBe('departing@wickharbor');
    expect(at(DEPART_WICK + T.departing)).toBe('atSea@eastbrook');
    expect(at(CYCLE - 0.001)).toBe('arriving@eastbrook');
    // periodic, and defined for any clock (a negative dev offset included)
    expect(at(CYCLE)).toBe('docked@eastbrook');
    expect(at(-1)).toBe('arriving@eastbrook');
    expect(transportPhaseAt(ROUTE, 10).departsIn).toBeCloseTo(DEPART_EAST - 10, 9);
    expect(transportPhaseAt(ROUTE, DEPART_EAST + 1).departsIn).toBe(0);
  });

  it('is deterministic: the same clock gives the same pose, every time', () => {
    const a: TransportPose = { x: 0, z: 0, rot: 0 };
    const b: TransportPose = { x: 0, z: 0, rot: 0 };
    for (let c = 0.011; c < CYCLE; c += 0.37) {
      const va = transportShipPoseAt(ROUTE, c, a);
      const vb = transportShipPoseAt(ROUTE, c + 7 * CYCLE, b);
      expect(vb).toBe(va);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.z).toBeCloseTo(a.z, 6);
      expect(b.rot).toBeCloseTo(a.rot, 6);
    }
  });

  it('paths start and end exactly on their berths, and the ship moves continuously', () => {
    for (const b of ROUTE.berths) {
      expect(b.departure[0]).toEqual({ x: b.x, z: b.z, rot: b.rot });
      expect(b.arrival[b.arrival.length - 1]).toEqual({ x: b.x, z: b.z, rot: b.rot });
      expect(transportPathLength(b.departure)).toBeGreaterThan(30);
      expect(transportPathLength(b.arrival)).toBeGreaterThan(30);
    }
    // no jumps while the ship is drawn: consecutive ticks stay within a stride
    const prev: TransportPose = { x: 0, z: 0, rot: 0 };
    const cur: TransportPose = { x: 0, z: 0, rot: 0 };
    let prevVisible = transportShipPoseAt(ROUTE, 0, prev);
    for (let c = DT; c < CYCLE; c += DT) {
      const visible = transportShipPoseAt(ROUTE, c, cur);
      if (visible && prevVisible) {
        expect(Math.hypot(cur.x - prev.x, cur.z - prev.z)).toBeLessThan(1.2);
      }
      prevVisible = visible;
      prev.x = cur.x;
      prev.z = cur.z;
      prev.rot = cur.rot;
    }
  });

  it('hides the ship at sea, holding its passengers off each harbor', () => {
    const p: TransportPose = { x: 0, z: 0, rot: 0 };
    expect(transportShipPoseAt(ROUTE, DEPART_EAST + T.departing + 1, p)).toBe(false);
    const east = transportPathPose(EAST.departure, 1, { x: 0, z: 0, rot: 0 });
    expect(p.x).toBeCloseTo(east.x, 6);
    expect(transportShipPoseAt(ROUTE, ARRIVE_WICK - T.arriving - 1, p)).toBe(false);
    const wick = transportPathPose(WICK.arrival, 0, { x: 0, z: 0, rot: 0 });
    expect(p.x).toBeCloseTo(wick.x, 6);
    expect(p.z).toBeCloseTo(wick.z, 6);
  });
});

describe('the deck exists only where, and while, the ship lies docked', () => {
  it('gates each berth by the schedule', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    const deckTop = (berth: 0 | 1) => {
      const at = shipToWorld(berthPose(berth), 1.5, 0.8);
      return supportHeightAt(WORLD_SEED, at.x, at.z, 0.5, WATER_LEVEL + 10);
    };
    const onDeck = WATER_LEVEL + HULL.mainDeckY;
    setClock(sim, 5);
    sim.tick();
    expect(deckTop(0)).toBeCloseTo(onDeck, 6);
    expect(deckTop(1)).toBe(-Infinity);
    setClock(sim, DEPART_EAST + 1);
    sim.tick();
    expect(deckTop(0)).toBe(-Infinity);
    expect(deckTop(1)).toBe(-Infinity);
    setClock(sim, ARRIVE_WICK + 1);
    sim.tick();
    expect(deckTop(0)).toBe(-Infinity);
    expect(deckTop(1)).toBeCloseTo(onDeck, 6);
    // back to the clock-0 state so no later suite inherits a closed berth
    setClock(sim, 1);
    sim.tick();
    expect(deckTop(0)).toBeCloseTo(onDeck, 6);
  });
});

describe('sailing (the real Sim)', () => {
  let sim: Sim;

  beforeEach(() => {
    sim = new Sim({ seed: WORLD_SEED, playerClass: 'hunter' });
    sim.setPlayerLevel(20);
  });

  it('carries a player on deck at departure and sets them down docked at Wickharbor', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(sim, p, 0, 1.5, 0.8);
    tickSeconds(sim, 1);
    expect(p.ferryRide).toBeTruthy();
    // movement input is locked: holding forward never moves them on deck
    const meta = sim.players.get(p.id);
    if (!meta) throw new Error('meta');
    Object.assign(meta.moveInput, { ...idle, forward: true });
    tickSeconds(sim, 3);
    const pose: TransportPose = { x: 0, z: 0, rot: 0 };
    transportShipPoseAt(ROUTE, transportClock(sim.ctx), pose);
    const local = worldToShip({ ...pose, baseY: WATER_LEVEL }, p.pos.x, p.pos.z);
    expect(local.x).toBeCloseTo(1.5, 3);
    expect(local.z).toBeCloseTo(0.8, 3);
    expect(p.pos.y).toBeCloseTo(WATER_LEVEL + HULL.mainDeckY, 3);
    Object.assign(meta.moveInput, idle);
    // the at-sea leg: off Wickharbor by its second half
    tickSeconds(sim, T.departing - 3.5 + T.atSea * 0.75);
    expect(p.ferryRide?.atSea).toBe(true);
    expect(Math.hypot(p.pos.x - WICK.x, p.pos.z - WICK.z)).toBeLessThan(80);
    // docked: released at the same local spot, on the Wickharbor deck
    tickSeconds(sim, T.atSea * 0.25 + T.arriving + 0.5);
    expect(p.ferryRide ?? null).toBeNull();
    const there = worldToShip(berthPose(1), p.pos.x, p.pos.z);
    expect(there.x).toBeCloseTo(1.5, 3);
    expect(there.z).toBeCloseTo(0.8, 3);
    expect(p.pos.y).toBeCloseTo(WATER_LEVEL + HULL.mainDeckY, 3);
    // standing on the real deck now: it holds them over the next ticks
    tickSeconds(sim, 1);
    expect(p.pos.y).toBeCloseTo(WATER_LEVEL + HULL.mainDeckY, 3);
    expect(meta.deedStats.visited.has('ferry:eastbrook_wickharbor')).toBe(true);
  });

  it('leaves a player on the pier behind', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    place(
      p,
      EAST.landing.x,
      groundHeight(EAST.landing.x, EAST.landing.z, WORLD_SEED),
      EAST.landing.z,
    );
    tickSeconds(sim, 3);
    expect(p.ferryRide ?? null).toBeNull();
    expect(Math.hypot(p.pos.x - EAST.landing.x, p.pos.z - EAST.landing.z)).toBeLessThan(0.5);
  });

  it('sails the round trip back to Eastbrook', () => {
    const p = sim.player;
    setClock(sim, DEPART_WICK - 0.5);
    placeOnDeck(sim, p, 1, -2, 4);
    tickSeconds(sim, 1);
    expect(p.ferryRide?.to).toBe(0);
    tickSeconds(sim, T.departing + T.atSea + T.arriving);
    expect(p.ferryRide ?? null).toBeNull();
    const there = worldToShip(berthPose(0), p.pos.x, p.pos.z);
    expect(there.x).toBeCloseTo(-2, 3);
    expect(there.z).toBeCloseTo(4, 3);
    const meta = sim.players.get(p.id);
    expect(meta?.deedStats.visited.has('ferry:wickharbor_eastbrook')).toBe(true);
  });

  it('sets a player in combat, or on the gangplank, down on the pier', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - DT / 2);
    placeOnDeck(sim, p, 0, 0, 2);
    p.inCombat = true;
    sim.tick();
    expect(p.ferryRide ?? null).toBeNull();
    expect(Math.hypot(p.pos.x - EAST.landing.x, p.pos.z - EAST.landing.z)).toBeLessThan(0.5);
    expect(p.pos.y).toBeGreaterThan(WATER_LEVEL + 2);
    p.inCombat = false;
    // the gangplank's outer tread (ship x 7.7) also puts you on the pier
    setClock(sim, DEPART_EAST - DT / 2);
    const plank = shipToWorld(berthPose(0), 7.7, 0.8);
    place(p, plank.x, WATER_LEVEL + HULL.mainDeckY - 0.44, plank.z);
    sim.tick();
    expect(p.ferryRide ?? null).toBeNull();
    expect(Math.hypot(p.pos.x - EAST.landing.x, p.pos.z - EAST.landing.z)).toBeLessThan(0.5);
  });

  it('dismounts a rider and parks their pet for the crossing', () => {
    const p = sim.player;
    restorePet(sim.ctx, p, {
      templateId: 'wild_boar',
      name: 'Rip',
      level: p.level,
      hp: 1,
      dead: false,
      mode: 'defensive',
    });
    expect(sim.petOf(p.id)).toBeTruthy();
    p.mountKey = 'valorsteed';
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(sim, p, 0, 1, -2);
    tickSeconds(sim, 1);
    expect(p.ferryRide).toBeTruthy();
    expect(p.mountKey).toBe('');
    expect(sim.petOf(p.id, true)).toBeNull();
    // a save mid-crossing keeps the pet (the stash) and records the far pier
    const saved = sim.serializeCharacter(p.id);
    expect(saved?.pet?.templateId).toBe('wild_boar');
    expect(saved?.pos).toEqual({ x: WICK.landing.x, z: WICK.landing.z });
    tickSeconds(sim, T.departing + T.atSea + T.arriving);
    expect(p.ferryRide ?? null).toBeNull();
    const pet = sim.petOf(p.id);
    expect(pet).toBeTruthy();
    expect(Math.hypot((pet?.pos.x ?? 0) - p.pos.x, (pet?.pos.z ?? 0) - p.pos.z)).toBeLessThan(6);
  });

  it('a reconnect mid-voyage lands on the destination pier, never in the sea', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(sim, p, 0, 1.5, 0.8);
    tickSeconds(sim, 1 + T.departing + 2);
    expect(p.ferryRide?.atSea).toBe(true);
    const state = sim.serializeCharacter(p.id);
    if (!state) throw new Error('no save');
    expect(state.pos).toEqual({ x: WICK.landing.x, z: WICK.landing.z });
    // a fresh world, at a moment the ship is NOT docked at Wickharbor
    const next = new Sim({ seed: WORLD_SEED, playerClass: 'hunter', noPlayer: true });
    setClock(next, DEPART_EAST + 2);
    const pid = next.addPlayer('hunter', 'Returner', { state });
    const back = next.entities.get(pid);
    if (!back) throw new Error('no entity');
    next.tick();
    tickSeconds(next, 1);
    expect(Math.hypot(back.pos.x - WICK.landing.x, back.pos.z - WICK.landing.z)).toBeLessThan(1);
    // standing on the pier deck, well above the water
    expect(back.pos.y).toBeGreaterThan(WATER_LEVEL + 0.5);
    expect(back.ferryRide ?? null).toBeNull();
  });

  it('a save on a docked deck records that berth pier', () => {
    const p = sim.player;
    setClock(sim, 10);
    placeOnDeck(sim, p, 0, 0, -3);
    sim.tick();
    expect(sim.serializeCharacter(p.id)?.pos).toEqual({ x: EAST.landing.x, z: EAST.landing.z });
  });

  it('a teleport ends the ride where it put the player', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(sim, p, 0, 1.5, 0.8);
    tickSeconds(sim, 2);
    expect(p.ferryRide).toBeTruthy();
    place(p, -60, groundHeight(-60, -60, WORLD_SEED), -60);
    sim.tick();
    expect(p.ferryRide ?? null).toBeNull();
    expect(Math.hypot(p.pos.x + 60, p.pos.z + 60)).toBeLessThan(1);
  });

  it('a passenger who dies rides on as a corpse and is set down with the ship', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(sim, p, 0, 1.5, 0.8);
    tickSeconds(sim, 2);
    p.hp = 0;
    p.dead = true;
    tickSeconds(sim, T.departing + T.atSea + T.arriving);
    expect(p.ferryRide ?? null).toBeNull();
    const there = worldToShip(berthPose(1), p.pos.x, p.pos.z);
    expect(there.x).toBeCloseTo(1.5, 3);
    // no crossing credit for a corpse
    expect(sim.players.get(p.id)?.deedStats.visited.has('ferry:eastbrook_wickharbor')).toBe(false);
  });

  it('/dev ferry depart skips to just before the next departure', () => {
    const ctx = sim.ctx;
    setClock(sim, 5);
    expect(handleFerryDevChat(ctx, '/dev ferry depart', sim.player.id)).toBe(true);
    const s = transportPhaseAt(ROUTE, transportClock(ctx));
    expect(s.phase).toBe('docked');
    expect(s.remaining).toBeCloseTo(3, 4);
    expect(handleFerryDevChat(ctx, '/dev ferry at 70', sim.player.id)).toBe(true);
    expect(transportPhaseAt(ROUTE, transportClock(ctx)).phase).toBe('atSea');
    expect(handleFerryDevChat(ctx, '/dev feral', sim.player.id)).toBe(false);
  });
});

describe('route content', () => {
  it('ships one route, the Eastbrook ferry between Eastbrook and Wickharbor', () => {
    expect(TRANSPORT_ROUTES).toEqual([ROUTE]);
    expect(ROUTE.berths.map((b) => b.id)).toEqual(['eastbrook', 'wickharbor']);
    expect(T).toEqual({ docked: 60, departing: 8, atSea: 12, arriving: 8 });
  });
});
