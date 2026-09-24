import { beforeAll, describe, expect, it } from 'vitest';
import { supportHeightAt } from '../src/sim/colliders';
import { EASTBROOK_FERRY_HULL } from '../src/sim/content/transport_ships';
import { PROPS } from '../src/sim/data';
import { buildDecorPropColliders } from '../src/sim/decor_prop_colliders';
import { EASTBROOK_HARBOR_DECKS } from '../src/sim/eastbrook_harbor';
import { entityLineOfSightClear } from '../src/sim/line_of_sight_elevation';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';
import { Sim } from '../src/sim/sim';
import { shipToWorld, worldToShip } from '../src/sim/transport_ship';
import type { Entity } from '../src/sim/types';
import { groundHeight, terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The Eastbrook ferry, Phase 1: moored across the ferry pier's T-head, its deck
// walkable. These pin the berth (position, waterline, the harbor it displaced),
// the boarding route from the pier onto the deck and up to the quarterdeck, the
// rails that keep a crowd aboard, and sight lines across the open deck, by
// driving the real movement kernel through the shipped content.

const ferry = PROPS.decorProps?.find((prop) => prop.key === 'eastbrookFerry');
const HULL = EASTBROOK_FERRY_HULL;

function pose() {
  if (!ferry) throw new Error('ferry placement missing');
  return { x: ferry.x, z: ferry.z, rot: ferry.rot ?? 0, baseY: WATER_LEVEL - (ferry.float ?? 0) };
}

describe('Eastbrook ferry berth', () => {
  it('moors one ferry broadside across the ferry pier T-head, on the waterline', () => {
    expect(PROPS.decorProps?.filter((prop) => prop.key === 'eastbrookFerry')).toHaveLength(1);
    expect(ferry).toMatchObject({ x: -125, z: -54.8, rot: 0, float: 0 });
    // the ferry pier keeps its authored width (no widening for the ship)
    const pier = EASTBROOK_HARBOR_DECKS[1];
    expect(pier).toMatchObject({ x: -107, z: -54, hl: 10, hw: 2.2 });
    // the port gangway looks square down the pier's axis
    const gangway = HULL.boarding.find((b) => b.side === 'port');
    if (!gangway) throw new Error('no port gangway');
    const at = shipToWorld(pose(), gangway.x, gangway.z);
    expect(at.z).toBeCloseTo(pier.z, 6);
    // the gap the gangplank spans, from the hull side to the pier's end
    expect(pier.x - pier.hl - at.x).toBeGreaterThan(2);
    expect(pier.x - pier.hl - at.x).toBeLessThan(3.5);
  });

  it('records the harbor it displaced: one hull retired, boats and buoys moved to open water', () => {
    const props = PROPS.decorProps ?? [];
    expect(props.some((p) => p.key === 'hexShipBlue' && p.x === -115 && p.z === -45)).toBe(false);
    expect(props.some((p) => p.key === 'hexShipBlue' && p.x === -115 && p.z === -63)).toBe(false);
    expect(
      props.filter((p) => p.key === 'hexShipBlue' && p.x === -170 && p.z === -22),
    ).toHaveLength(1);
    expect(
      props.filter((p) => p.key === 'seaBoatFishing' && p.x === -113 && p.z === -46),
    ).toHaveLength(1);
    // the fairway buoys now flank the western approach, outside the hull
    expect(props.filter((p) => p.key === 'seaBuoy' && p.x === -134 && p.z === -44)).toHaveLength(1);
    expect(
      props.filter((p) => p.key === 'seaBuoyFlag' && p.x === -134 && p.z === -64),
    ).toHaveLength(1);
  });

  it('floats in water across its whole length, keel clear of the seabed', () => {
    const p = pose();
    for (const z of [-15, -10, -5, 0, 5, 10, 14]) {
      const at = shipToWorld(p, 0, z);
      const seabed = terrainHeight(at.x, at.z, WORLD_SEED);
      // the keel is 2.4 below the waterline amidships and rises toward the ends
      const keel = z > 6.5 || z < -10.5 ? 1.6 : HULL.draft;
      expect(seabed, `seabed at ship z ${z}`).toBeLessThan(WATER_LEVEL - keel);
    }
  });

  it('keeps every other moored hull and the piers clear of its decks', () => {
    const p = pose();
    const decks = HULL.volumes.filter((v) => v.kind === 'deck');
    for (const other of PROPS.decorProps ?? []) {
      // every floating row, walk-through dressing (buoys) included
      if (other.key === 'eastbrookFerry' || other.float === undefined) continue;
      const clearance = other.r ?? 1;
      const local = worldToShip(p, other.x, other.z);
      for (const d of decks) {
        const dx = Math.max(0, Math.abs(local.x - d.x) - (d.hw ?? 0));
        const dz = Math.max(0, Math.abs(local.z - d.z) - (d.hd ?? 0));
        expect(Math.hypot(dx, dz), `${other.key} at (${other.x}, ${other.z})`).toBeGreaterThan(
          clearance,
        );
      }
    }
    for (const d of decks) {
      const at = shipToWorld(p, d.x, d.z);
      expect(groundHeight(at.x, at.z, WORLD_SEED)).toBeLessThan(WATER_LEVEL);
    }
  });

  it('seats the deck volumes on the rendered waterline', () => {
    const colliders = buildDecorPropColliders(WORLD_SEED, ferry ? [ferry] : []);
    expect(colliders).toHaveLength(HULL.volumes.length);
    const main = HULL.volumes.find((v) => v.id === 'main_deck_aft');
    if (!main) throw new Error('no main deck');
    const at = shipToWorld(pose(), main.x + 2, main.z);
    const top = supportHeightAt(WORLD_SEED, at.x, at.z, 0.5, WATER_LEVEL + 10);
    expect(top).toBeCloseTo(WATER_LEVEL + HULL.mainDeckY, 6);
  });
});

describe('walking aboard (the real movement kernel)', () => {
  let sim: Sim;
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

  function place(x: number, z: number, y = groundHeight(x, z, WORLD_SEED)): void {
    const p = sim.player;
    p.pos.x = x;
    p.pos.z = z;
    p.pos.y = y;
    p.prevPos = { ...p.pos };
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.onGround = true;
  }

  function placeLocal(x: number, z: number, y: number): void {
    const at = shipToWorld(pose(), x, z);
    place(at.x, at.z, pose().baseY + y);
  }

  /** Walk toward a ship-frame point; returns where the walk ended, ship frame. */
  function walkToLocal(tx: number, tz: number, jump = false, maxTicks = 240) {
    const target = shipToWorld(pose(), tx, tz);
    const meta = sim.players.get(sim.player.id);
    if (!meta) throw new Error('player meta missing');
    for (let i = 0; i < maxTicks; i++) {
      const p = sim.player;
      const dx = target.x - p.pos.x;
      const dz = target.z - p.pos.z;
      if (Math.hypot(dx, dz) < 0.25) break;
      p.facing = Math.atan2(dx, dz);
      Object.assign(meta.moveInput, { ...idle, forward: true, jump: jump && p.onGround });
      sim.tick();
    }
    Object.assign(meta.moveInput, idle);
    for (let i = 0; i < 20; i++) sim.tick();
    const p = sim.player;
    const local = worldToShip(pose(), p.pos.x, p.pos.z);
    return {
      x: local.x,
      z: local.z,
      y: p.pos.y - pose().baseY,
      overboard: p.pos.y < WATER_LEVEL + 1,
    };
  }

  beforeAll(() => {
    sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(60);
  });

  it('boards from the pier over the gangplank onto the main deck', () => {
    place(-110, -54);
    const pierDeck = sim.player.pos.y - WATER_LEVEL;
    expect(pierDeck).toBeCloseTo(2.64, 2);
    const gangway = HULL.boarding.find((b) => b.side === 'port');
    if (!gangway) throw new Error('no port gangway');
    // every rise on the way is a stride, never a jump
    expect(HULL.mainDeckY - pierDeck).toBeLessThan(MAX_STEP_HEIGHT);
    const onGangway = walkToLocal(gangway.x - 0.3, gangway.z);
    expect(onGangway.y).toBeCloseTo(HULL.mainDeckY, 3);
    const onDeck = walkToLocal(1.5, gangway.z);
    expect(onDeck.y).toBeCloseTo(HULL.mainDeckY, 3);
    expect(Math.abs(onDeck.x - 1.5)).toBeLessThan(0.3);
  });

  it('climbs the port stair to the quarterdeck and the centre stair to the forecastle', () => {
    placeLocal(1.5, 0.8, HULL.mainDeckY);
    walkToLocal(3.72, -1.8);
    const top = walkToLocal(3.72, -8.2);
    expect(top.y).toBeCloseTo(HULL.captainDeckY, 3);
    const helm = walkToLocal(1.4, -12.2);
    expect(helm.y).toBeCloseTo(HULL.captainDeckY, 3);
    placeLocal(-1.2, 5.5, HULL.mainDeckY);
    walkToLocal(0, 6.6);
    const fc = walkToLocal(-1.2, 10.0);
    expect(fc.y).toBeCloseTo(HULL.forecastleY, 3);
  });

  it('the rails hold: walking or jumping at the side keeps the player aboard', () => {
    placeLocal(0, 3.5, HULL.mainDeckY);
    const walked = walkToLocal(-8, 3.5, false, 90);
    expect(walked.overboard).toBe(false);
    expect(walked.x).toBeGreaterThan(-5.2);
    placeLocal(0, -1.8, HULL.mainDeckY);
    const jumped = walkToLocal(8, -1.8, true, 90);
    expect(jumped.overboard).toBe(false);
    expect(jumped.x).toBeLessThan(5.2);
    // the starboard gangway is barred while no dock meets it
    placeLocal(-2, 0.8, HULL.mainDeckY);
    const barred = walkToLocal(-8, 0.8, false, 90);
    expect(barred.overboard).toBe(false);
    expect(barred.x).toBeGreaterThan(-5.2);
    // the quarterdeck's front rail: no walking off onto the waist
    placeLocal(0, -9.5, HULL.captainDeckY);
    const edge = walkToLocal(0, -3.0, false, 90);
    expect(edge.y).toBeCloseTo(HULL.captainDeckY, 3);
    // the bow rail closes the forecastle at the stem
    placeLocal(0.8, 12.5, HULL.forecastleY);
    const bow = walkToLocal(0.8, 18, false, 90);
    expect(bow.y).toBeCloseTo(HULL.forecastleY, 3);
  }, 60_000);

  it('the rails hold beside the edge dressing too (bench, barrels, crates)', () => {
    // jumping at the rail from right beside the bench and the barrels holds too
    placeLocal(3.3, 5.0, HULL.mainDeckY);
    const fromBench = walkToLocal(8, 5.0, true, 90);
    expect(fromBench.overboard).toBe(false);
    placeLocal(-2.4, 7.4, HULL.mainDeckY);
    const fromBarrels = walkToLocal(-8, 7.4, true, 90);
    expect(fromBarrels.overboard).toBe(false);
    placeLocal(2.2, 7.5, HULL.mainDeckY);
    const fromCrates = walkToLocal(8, 7.5, true, 90);
    expect(fromCrates.overboard).toBe(false);
  }, 60_000);

  it('sees across the open deck, while a mast still blocks', () => {
    const at = (x: number, z: number, y: number) => {
      const w = shipToWorld(pose(), x, z);
      return { x: w.x, y: pose().baseY + y, z: w.z };
    };
    // the length of the waist, over the hatch and between the benches
    const a = { ...sim.player, pos: at(2.5, -1.5, HULL.mainDeckY) } as Entity;
    const b = { ...sim.player, id: -1, pos: at(2.5, 6.5, HULL.mainDeckY) } as Entity;
    expect(entityLineOfSightClear(WORLD_SEED, a, b)).toBe(true);
    // across the beam, over both rails' height, from gangway to gangway
    const port = { ...sim.player, id: -5, pos: at(4.2, 0.8, HULL.mainDeckY) } as Entity;
    const starboard = { ...sim.player, id: -6, pos: at(-4.2, 0.8, HULL.mainDeckY) } as Entity;
    expect(entityLineOfSightClear(WORLD_SEED, port, starboard)).toBe(true);
    // from the waist up to the quarterdeck, over its front rail
    const c = { ...sim.player, id: -2, pos: at(0.5, -11, HULL.captainDeckY) } as Entity;
    expect(entityLineOfSightClear(WORLD_SEED, a, c)).toBe(true);
    // straight down the centre line the main mast stands in the way
    const d = { ...sim.player, id: -3, pos: at(0, -2, HULL.mainDeckY) } as Entity;
    const e = { ...sim.player, id: -4, pos: at(0, 7, HULL.mainDeckY) } as Entity;
    expect(entityLineOfSightClear(WORLD_SEED, d, e)).toBe(false);
  });
});
