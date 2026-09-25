import { beforeEach, describe, expect, it } from 'vitest';
import { queryOpenWorldColliders, supportHeightAt } from '../src/sim/colliders';
import {
  EASTBROOK_FERRY_HULL,
  EASTBROOK_WICKHARBOR_FERRY,
  TRANSPORT_ROUTES,
} from '../src/sim/content/transport_ships';
import { handleFerryDevChat } from '../src/sim/dev/ferry_dev';
import { restorePet } from '../src/sim/pet/pet_commands';
import { Sim } from '../src/sim/sim';
import { deckToWorld, worldToDeck } from '../src/sim/transport_deck';
import { transportClock } from '../src/sim/transport_ferry';
import {
  type TransportPose,
  transportCycleSeconds,
  transportLaneLength,
  transportPhaseAt,
  transportShipPoseAt,
  transportShipSpeedAt,
  transportVoyageSeconds,
  voyageMotionAt,
} from '../src/sim/transport_schedule';
import { shipToWorld } from '../src/sim/transport_ship';
import { DT, type Entity } from '../src/sim/types';
import { groundHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The scheduled, free, round-trip ferry between Eastbrook and Wickharbor
// (Phases 2 and 3). The timetable is a pure function of the schedule clock;
// the ship sails the whole voyage in sight along its sea lanes, and a
// passenger walks its moving deck (transport_deck.test.ts pins the walking).
// These drive the REAL Sim through departures and arrivals and pin who
// sails, what the voyage does to them, and where they step off.

const ROUTE = EASTBROOK_WICKHARBOR_FERRY;
const HULL = EASTBROOK_FERRY_HULL;
const T = ROUTE.timings;
const EAST = ROUTE.berths[0];
const WICK = ROUTE.berths[1];
const VOYAGE_EAST = transportVoyageSeconds(ROUTE, 0);
const VOYAGE_WICK = transportVoyageSeconds(ROUTE, 1);
/** Clock of the first departure from Eastbrook (the cycle opens docked there). */
const DEPART_EAST = T.docked;
const ARRIVE_WICK = T.docked + VOYAGE_EAST;
const DEPART_WICK = ARRIVE_WICK + T.docked;
const CYCLE = transportCycleSeconds(ROUTE);
const DECK = WATER_LEVEL + HULL.mainDeckY;

function berthPose(i: 0 | 1) {
  const b = ROUTE.berths[i];
  return { x: b.x, z: b.z, rot: b.rot, baseY: WATER_LEVEL };
}

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

function placeOnDeck(e: Entity, berth: 0 | 1, lx: number, lz: number): void {
  const at = shipToWorld(berthPose(berth), lx, lz);
  place(e, at.x, DECK, at.z);
}

function deckSpot(sim: Sim, e: Entity): { x: number; z: number } {
  const pose: TransportPose = { x: 0, z: 0, rot: 0 };
  transportShipPoseAt(ROUTE, transportClock(sim.ctx), pose);
  return worldToDeck(pose, e.pos.x, e.pos.z, { x: 0, z: 0 });
}

describe('the timetable (pure)', () => {
  it('runs one fixed cycle: docked, the voyage out, docked, the voyage home', () => {
    expect(CYCLE).toBeCloseTo(2 * T.docked + VOYAGE_EAST + VOYAGE_WICK, 9);
    const at = (c: number) => {
      const s = transportPhaseAt(ROUTE, c);
      return `${s.phase}@${ROUTE.berths[s.berth].id}`;
    };
    expect(at(0)).toBe('docked@eastbrook');
    expect(at(DEPART_EAST - 0.001)).toBe('docked@eastbrook');
    expect(at(DEPART_EAST)).toBe('sailing@wickharbor');
    expect(at(ARRIVE_WICK - 0.001)).toBe('sailing@wickharbor');
    expect(at(ARRIVE_WICK)).toBe('docked@wickharbor');
    expect(at(DEPART_WICK)).toBe('sailing@eastbrook');
    expect(at(CYCLE - 0.001)).toBe('sailing@eastbrook');
    // periodic, and defined for any clock (a negative dev offset included)
    expect(at(CYCLE)).toBe('docked@eastbrook');
    expect(at(-1)).toBe('sailing@eastbrook');
    expect(transportPhaseAt(ROUTE, 10).departsIn).toBeCloseTo(DEPART_EAST - 10, 9);
    expect(transportPhaseAt(ROUTE, DEPART_EAST + 1).departsIn).toBe(0);
  });

  it('is deterministic: the same clock gives the same pose, every time', () => {
    const a: TransportPose = { x: 0, z: 0, rot: 0 };
    const b: TransportPose = { x: 0, z: 0, rot: 0 };
    for (let c = 0.011; c < CYCLE; c += 0.37) {
      transportShipPoseAt(ROUTE, c, a);
      transportShipPoseAt(ROUTE, c + 7 * CYCLE, b);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.z).toBeCloseTo(a.z, 6);
      expect(b.rot).toBeCloseTo(a.rot, 6);
    }
  });

  it('sails a WoW-length voyage each way, in sight and without a jump', () => {
    // just under two minutes each way, a long sea road (not a hop)
    expect(VOYAGE_EAST).toBeGreaterThan(60);
    expect(VOYAGE_EAST).toBeLessThan(120);
    expect(VOYAGE_WICK).toBeGreaterThan(60);
    expect(VOYAGE_WICK).toBeLessThan(120);
    for (const lane of ROUTE.lanes) expect(transportLaneLength(lane)).toBeGreaterThan(1000);
    // consecutive ticks never jump: the ship is a moving body the whole cycle
    const prev: TransportPose = { x: 0, z: 0, rot: 0 };
    const cur: TransportPose = { x: 0, z: 0, rot: 0 };
    transportShipPoseAt(ROUTE, 0, prev);
    let maxStep = 0;
    let maxTurn = 0;
    for (let c = DT; c < CYCLE; c += DT) {
      transportShipPoseAt(ROUTE, c, cur);
      maxStep = Math.max(maxStep, Math.hypot(cur.x - prev.x, cur.z - prev.z));
      let d = (cur.rot - prev.rot) % (2 * Math.PI);
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      maxTurn = Math.max(maxTurn, Math.abs(d));
      prev.x = cur.x;
      prev.z = cur.z;
      prev.rot = cur.rot;
    }
    // (a hair of slack: the arc-length table is sampled, not exact)
    expect(maxStep).toBeLessThanOrEqual(T.cruise * DT * 1.01);
    // the heading never swings faster than the ship's turn rate (plus the
    // profile's one-yard sampling slack)
    expect(maxTurn).toBeLessThan(T.turnRate * DT * 1.35);
  });

  it('leaves and arrives at rest, and cruises in between', () => {
    expect(transportShipSpeedAt(ROUTE, DEPART_EAST)).toBe(0);
    expect(transportShipSpeedAt(ROUTE, DEPART_EAST + 0.2)).toBeLessThan(1);
    expect(transportShipSpeedAt(ROUTE, ARRIVE_WICK - 0.2)).toBeLessThan(1);
    expect(transportShipSpeedAt(ROUTE, 20)).toBe(0);
    let cruising = 0;
    for (let t = 0; t < VOYAGE_EAST; t += 0.5) {
      if (transportShipSpeedAt(ROUTE, DEPART_EAST + t) >= T.cruise - 1e-6) cruising += 0.5;
    }
    // the long reaches run at cruise; the harbors and the strait elbows do not
    expect(cruising).toBeGreaterThan(VOYAGE_EAST * 0.4);
    // distance is continuous and monotone along the lane
    const m = { distance: 0, speed: 0 };
    let last = 0;
    for (let t = 0; t <= VOYAGE_EAST + 1; t += 0.05) {
      voyageMotionAt(ROUTE.lanes[0], T, t, m);
      expect(m.distance).toBeGreaterThanOrEqual(last - 1e-9);
      expect(m.distance - last).toBeLessThanOrEqual(T.cruise * 0.05 + 1e-6);
      last = m.distance;
    }
    expect(last).toBeCloseTo(transportLaneLength(ROUTE.lanes[0]), 6);
  });

  it('each lane runs from its berth pose to the far berth pose', () => {
    for (let i = 0; i < 2; i++) {
      const lane = ROUTE.lanes[i];
      const from = ROUTE.berths[i];
      const to = ROUTE.berths[1 - i];
      expect(lane[0]).toEqual({ x: from.x, z: from.z, rot: from.rot });
      expect(lane[lane.length - 1]).toEqual({ x: to.x, z: to.z, rot: to.rot });
    }
    // the moored pose at both ends of each voyage, heading included
    const p: TransportPose = { x: 0, z: 0, rot: 0 };
    transportShipPoseAt(ROUTE, ARRIVE_WICK - 1e-6, p);
    expect(p.x).toBeCloseTo(WICK.x, 3);
    expect(p.z).toBeCloseTo(WICK.z, 3);
    expect(Math.cos(p.rot - WICK.rot)).toBeCloseTo(1, 6);
    transportShipPoseAt(ROUTE, CYCLE - 1e-6, p);
    expect(p.x).toBeCloseTo(EAST.x, 3);
    expect(Math.cos(p.rot - EAST.rot)).toBeCloseTo(1, 6);
  });
});

describe('the moored deck exists only where, and while, the ship lies docked', () => {
  it('gates each berth by the schedule', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    const deckTop = (berth: 0 | 1) => {
      const at = shipToWorld(berthPose(berth), 1.5, 0.8);
      return supportHeightAt(WORLD_SEED, at.x, at.z, 0.5, WATER_LEVEL + 10);
    };
    setClock(sim, 5);
    sim.tick();
    expect(deckTop(0)).toBeCloseTo(DECK, 6);
    expect(deckTop(1)).toBe(-Infinity);
    setClock(sim, DEPART_EAST + 1);
    sim.tick();
    expect(deckTop(0)).toBe(-Infinity);
    expect(deckTop(1)).toBe(-Infinity);
    setClock(sim, ARRIVE_WICK + 1);
    sim.tick();
    expect(deckTop(0)).toBe(-Infinity);
    expect(deckTop(1)).toBeCloseTo(DECK, 6);
    // a new world syncs its own gates at construction, before any tick: it
    // never inherits the berth another world in the process left open
    const fresh = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    expect(deckTop(0)).toBeCloseTo(DECK, 6);
    expect(deckTop(1)).toBe(-Infinity);
    // a berth that closes and reopens puts its colliders back in the same
    // cell order (gridIndex), whatever its toggle history
    const at = shipToWorld(berthPose(0), 1.5, 0.8);
    const order = () =>
      queryOpenWorldColliders(WORLD_SEED, at.x - 8, at.z - 8, at.x + 8, at.z + 8, []).map(
        (c) => c.gridIndex,
      );
    const before = order();
    for (let i = 0; i < 3; i++) {
      setClock(fresh, DEPART_EAST + 1);
      fresh.tick();
      setClock(fresh, 5);
      fresh.tick();
    }
    expect(order()).toEqual(before);
    void sim;
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
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 1);
    expect(p.ferryRide).toMatchObject({ route: ROUTE.id, from: 0, to: 1 });
    // mid-voyage: far from both harbors, on the same deck spot
    tickSeconds(sim, VOYAGE_EAST / 2);
    expect(p.ferryRide).toBeTruthy();
    expect(Math.hypot(p.pos.x - EAST.x, p.pos.z - EAST.z)).toBeGreaterThan(150);
    expect(Math.hypot(p.pos.x - WICK.x, p.pos.z - WICK.z)).toBeGreaterThan(150);
    const mid = deckSpot(sim, p);
    expect(mid.x).toBeCloseTo(1.5, 2);
    expect(mid.z).toBeCloseTo(0.8, 2);
    expect(p.pos.y).toBeCloseTo(DECK, 3);
    // moored at Wickharbor: the voyage ends where they stand
    tickSeconds(sim, VOYAGE_EAST / 2 + 0.5);
    expect(p.ferryRide ?? null).toBeNull();
    const there = worldToDeck(WICK, p.pos.x, p.pos.z, { x: 0, z: 0 });
    expect(there.x).toBeCloseTo(1.5, 2);
    expect(there.z).toBeCloseTo(0.8, 2);
    expect(p.pos.y).toBeCloseTo(DECK, 3);
    // standing on the real moored deck now: it holds them over the next ticks
    tickSeconds(sim, 1);
    expect(p.pos.y).toBeCloseTo(DECK, 3);
    const meta = sim.players.get(p.id);
    expect(meta?.deedStats.visited.has('ferry:eastbrook_wickharbor')).toBe(true);
  });

  it('both crossings earn the Harbor to Harbor deed', () => {
    const p = sim.player;
    const meta = sim.players.get(p.id);
    if (!meta) throw new Error('meta');
    // the way back already sailed (a save carries the one-way mark)
    meta.deedStats.visited.add('ferry:wickharbor_eastbrook');
    expect(meta.deedsEarned.has('exp_harbor_to_harbor')).toBe(false);
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 1 + VOYAGE_EAST + 1.5);
    expect(meta.deedsEarned.has('exp_harbor_to_harbor')).toBe(true);
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
    placeOnDeck(p, 1, -2, 4);
    tickSeconds(sim, 1);
    expect(p.ferryRide?.to).toBe(0);
    tickSeconds(sim, VOYAGE_WICK);
    expect(p.ferryRide ?? null).toBeNull();
    const there = worldToDeck(EAST, p.pos.x, p.pos.z, { x: 0, z: 0 });
    expect(there.x).toBeCloseTo(-2, 2);
    expect(there.z).toBeCloseTo(4, 2);
    const meta = sim.players.get(p.id);
    expect(meta?.deedStats.visited.has('ferry:wickharbor_eastbrook')).toBe(true);
  });

  it('a player in combat sails too (the ship outruns the fight)', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - DT / 2);
    placeOnDeck(p, 0, 0, 2);
    p.inCombat = true;
    sim.tick();
    expect(p.ferryRide).toBeTruthy();
    expect(deckSpot(sim, p).z).toBeCloseTo(2, 2);
  });

  it('sets a player on the gangplank or the gangway step down on the pier', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - DT / 2);
    const plank = shipToWorld(berthPose(0), 7.7, 0.8);
    place(p, plank.x, DECK - 0.44, plank.z);
    sim.tick();
    expect(p.ferryRide ?? null).toBeNull();
    expect(Math.hypot(p.pos.x - EAST.landing.x, p.pos.z - EAST.landing.z)).toBeLessThan(0.5);
    expect(p.pos.y).toBeGreaterThan(WATER_LEVEL + 2);
    setClock(sim, DEPART_EAST - DT / 2);
    const step = shipToWorld(berthPose(0), 5.3, 0.8);
    place(p, step.x, DECK, step.z);
    sim.tick();
    expect(p.ferryRide ?? null).toBeNull();
    expect(Math.hypot(p.pos.x - EAST.landing.x, p.pos.z - EAST.landing.z)).toBeLessThan(0.5);
  });

  it('dismounts a rider and parks their pet for the voyage', () => {
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
    placeOnDeck(p, 0, 1, -2);
    tickSeconds(sim, 1);
    expect(p.ferryRide).toBeTruthy();
    expect(p.mountKey).toBe('');
    expect(sim.petOf(p.id, true)).toBeNull();
    // a save mid-voyage keeps the pet (the stash) and records the far pier
    const saved = sim.serializeCharacter(p.id);
    expect(saved?.pet?.templateId).toBe('wild_boar');
    expect(saved?.pos).toEqual({ x: WICK.landing.x, z: WICK.landing.z });
    for (let i = 0; i < 4000 && p.ferryRide; i++) sim.tick();
    expect(p.ferryRide ?? null).toBeNull();
    // the owner steps off on the deck; the pet comes back on the pier, where
    // a pet can stand (never on the seabed beside the hull)
    const pet = sim.petOf(p.id);
    expect(pet).toBeTruthy();
    const fromLanding = Math.hypot(
      (pet?.pos.x ?? 0) - WICK.landing.x,
      (pet?.pos.z ?? 0) - WICK.landing.z,
    );
    expect(fromLanding).toBeLessThan(0.5);
    expect(pet?.pos.y ?? 0).toBeGreaterThan(WATER_LEVEL);
    expect(p.ferryPetParked).toBeUndefined();
  });

  it('a passenger who goes overboard gets their pet back beside them', () => {
    const p = sim.player;
    restorePet(sim.ctx, p, {
      templateId: 'wild_boar',
      name: 'Rip',
      level: p.level,
      hp: 1,
      dead: false,
      mode: 'defensive',
    });
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 0, -4);
    tickSeconds(sim, 30);
    expect(p.ferryRide).toBeTruthy();
    // thrown clear of the hull (a knockback, a dev move): no longer aboard
    place(p, p.pos.x + 40, WATER_LEVEL - 0.75, p.pos.z);
    sim.tick();
    expect(p.ferryRide ?? null).toBeNull();
    const pet = sim.petOf(p.id);
    expect(pet).toBeTruthy();
    expect(Math.hypot((pet?.pos.x ?? 0) - p.pos.x, (pet?.pos.z ?? 0) - p.pos.z)).toBeLessThan(6);
  });

  it('keeps a pet parked while its owner lies dead, and hands it back on the revive', () => {
    const p = sim.player;
    restorePet(sim.ctx, p, {
      templateId: 'wild_boar',
      name: 'Rip',
      level: p.level,
      hp: 1,
      dead: false,
      mode: 'defensive',
    });
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 2);
    p.hp = 0;
    p.dead = true;
    tickSeconds(sim, VOYAGE_EAST);
    expect(p.ferryRide ?? null).toBeNull();
    expect(sim.petOf(p.id, true)).toBeNull();
    expect(p.ferryPetParked).toBe(true);
    p.dead = false;
    p.hp = p.maxHp;
    sim.tick();
    expect(sim.petOf(p.id)).toBeTruthy();
    expect(p.ferryPetParked).toBeUndefined();
  });

  it('a relog mid-voyage lands on the destination pier, never in the sea', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 1 + VOYAGE_EAST / 2);
    expect(p.ferryRide).toBeTruthy();
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
    placeOnDeck(p, 0, 0, -3);
    sim.tick();
    expect(sim.serializeCharacter(p.id)?.pos).toEqual({ x: EAST.landing.x, z: EAST.landing.z });
  });

  it('sets a corpse on deck down on the pier instead of sailing it', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 0, 2);
    p.hp = 0;
    p.dead = true;
    tickSeconds(sim, 1);
    expect(p.ferryRide ?? null).toBeNull();
    expect(Math.hypot(p.pos.x - EAST.landing.x, p.pos.z - EAST.landing.z)).toBeLessThan(0.5);
    expect(p.pos.y).toBeGreaterThan(WATER_LEVEL + 2);
  });

  it('boards across a whole-cycle float drift in the clock (never skips a departure)', () => {
    const p = sim.player;
    // a long-lived world: the clock a thousand cycles on, stepping in DT
    setClock(sim, 1000 * CYCLE + DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 1);
    expect(p.ferryRide).toBeTruthy();
  });

  it('drops a movement mode that steers by the static world, under way', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 1);
    p.followTargetId = 12345;
    p.chargeTargetId = 12345;
    sim.tick();
    expect(p.followTargetId).toBeNull();
    expect(p.chargeTargetId).toBeNull();
  });

  it('a feared passenger cowers on deck instead of running off the ship', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, -2, 3);
    tickSeconds(sim, 5);
    const before = deckSpot(sim, p);
    p.auras.push({
      id: 'fear_incap',
      name: 'Fear',
      kind: 'incapacitate',
      value: 0,
      remaining: 3,
      duration: 3,
      sourceId: p.id,
      school: 'shadow',
    });
    tickSeconds(sim, 2);
    const after = deckSpot(sim, p);
    expect(p.ferryRide).toBeTruthy();
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05);
  });

  it('a teleport ends the voyage where it put the player', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 2);
    expect(p.ferryRide).toBeTruthy();
    place(p, -60, groundHeight(-60, -60, WORLD_SEED), -60);
    sim.tick();
    expect(p.ferryRide ?? null).toBeNull();
    expect(Math.hypot(p.pos.x + 60, p.pos.z + 60)).toBeLessThan(1);
  });

  it('a passenger who dies rides on as a corpse, without the crossing credit', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 2);
    p.hp = 0;
    p.dead = true;
    tickSeconds(sim, VOYAGE_EAST);
    expect(p.ferryRide ?? null).toBeNull();
    const there = worldToDeck(WICK, p.pos.x, p.pos.z, { x: 0, z: 0 });
    expect(there.x).toBeCloseTo(1.5, 2);
    expect(sim.players.get(p.id)?.deedStats.visited.has('ferry:eastbrook_wickharbor')).toBe(false);
  });

  it('a passenger who releases at sea leaves their body for the destination pier', () => {
    const p = sim.player;
    setClock(sim, DEPART_EAST - 0.5);
    placeOnDeck(p, 0, 1.5, 0.8);
    tickSeconds(sim, 20);
    p.hp = 0;
    p.dead = true;
    sim.tick();
    sim.releaseSpirit(p.id);
    sim.tick();
    expect(p.ghost).toBe(true);
    expect(p.ferryRide ?? null).toBeNull();
    expect(p.corpsePos).toBeTruthy();
    const corpse = p.corpsePos ?? { x: 0, z: 0 };
    expect(Math.hypot(corpse.x - WICK.landing.x, corpse.z - WICK.landing.z)).toBeLessThan(1);
  });

  it('/dev ferry depart, skip, at and board', () => {
    const ctx = sim.ctx;
    setClock(sim, 5);
    expect(handleFerryDevChat(ctx, '/dev ferry depart', sim.player.id)).toBe(true);
    const s = transportPhaseAt(ROUTE, transportClock(ctx));
    expect(s.phase).toBe('docked');
    expect(s.remaining).toBeCloseTo(3, 4);
    expect(handleFerryDevChat(ctx, '/dev ferry at 90', sim.player.id)).toBe(true);
    expect(transportPhaseAt(ROUTE, transportClock(ctx)).phase).toBe('sailing');
    // board wherever the ship is: on its waist deck, and it carries them
    expect(handleFerryDevChat(ctx, '/dev ferry board', sim.player.id)).toBe(true);
    const p = sim.player;
    sim.tick();
    expect(p.ferryRide).toBeTruthy();
    expect(p.pos.y).toBeCloseTo(DECK, 2);
    // a skip mid-voyage keeps the passenger on the same deck spot
    const spot = deckSpot(sim, p);
    expect(handleFerryDevChat(ctx, '/dev ferry skip', sim.player.id)).toBe(true);
    const after = deckSpot(sim, p);
    expect(Math.hypot(after.x - spot.x, after.z - spot.z)).toBeLessThan(0.05);
    expect(handleFerryDevChat(ctx, '/dev feral', sim.player.id)).toBe(false);
  });
});

describe('route content', () => {
  it('ships one route, the Eastbrook ferry between Eastbrook and Wickharbor', () => {
    expect(TRANSPORT_ROUTES).toEqual([ROUTE]);
    expect(ROUTE.berths.map((b) => b.id)).toEqual(['eastbrook', 'wickharbor']);
    expect(T).toEqual({ docked: 60, cruise: 19, accel: 2, turnRate: 0.25 });
  });

  it('the dev boarding spot and a mid-voyage deck spot agree on the frame', () => {
    const pose: TransportPose = { x: 0, z: 0, rot: 0 };
    transportShipPoseAt(ROUTE, DEPART_EAST + 30, pose);
    const at = deckToWorld(pose, 0, 4, { x: 0, z: 0 });
    const back = worldToDeck(pose, at.x, at.z, { x: 0, z: 0 });
    expect(back.x).toBeCloseTo(0, 9);
    expect(back.z).toBeCloseTo(4, 9);
  });
});
