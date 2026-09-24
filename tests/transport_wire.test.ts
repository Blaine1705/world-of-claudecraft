// The wire half of the scheduled ferry: the server's `fry` passenger bit and
// the snapshot head's schedule clock (`time`, or `fc` under a dev skip), and
// the ClientWorld decode that turns them back into the same timetable view the
// offline Sim serves (src/net/transport_wire.ts). The sim half lives in
// tests/transport_ferry.test.ts; the end-to-end ride in
// tests/transport_ferry_online.test.ts.

import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; only the wire encoding is under
// test (the hoisted-mock idiom in tests/CLAUDE.md, "Server tests").
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
}));

import { wireEntity } from '../server/game';
import { transportHeadJson } from '../server/transport_head';
import { isMovementFrozen } from '../src/game/self_motion_gate';
import { transportClockFromHead } from '../src/net/transport_wire';
import { EASTBROOK_WICKHARBOR_FERRY } from '../src/sim/content/transport_ships';
import { Sim } from '../src/sim/sim';
import { transportPhaseAt } from '../src/sim/transport_schedule';
import { WORLD_SEED } from '../src/sim/world_seed';
import { bareClient } from './helpers/bare_client';

const ROUTE = EASTBROOK_WICKHARBOR_FERRY;

function ride(atSea: boolean) {
  return { route: ROUTE.id, to: 1, lx: 1, ly: 3.3, lz: 0.8, lf: 0, wx: 0, wz: 0, atSea };
}

describe('the fry passenger bit', () => {
  it('is absent for a player on foot, 1 aboard, 2 on the hidden at-sea leg', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    const e = sim.player;
    expect(wireEntity(e)).not.toHaveProperty('fry');
    e.ferryRide = ride(false);
    expect(wireEntity(e).fry).toBe(1);
    e.ferryRide = ride(true);
    expect(wireEntity(e).fry).toBe(2);
  });

  it('decodes onto the client mirrors, and clears when the key is absent', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    const e = sim.player;
    const client = bareClient(e.id + 1000);
    const apply = (s: unknown) =>
      (client as unknown as { applySnapshot(s: unknown): void }).applySnapshot(s);
    e.ferryRide = ride(true);
    apply({ t: 'snap', time: 1, ents: [wireEntity(e)] });
    expect(client.entities.get(e.id)?.ferryRiding).toBe(true);
    expect(client.entities.get(e.id)?.ferryAtSea).toBe(true);
    e.ferryRide = null;
    apply({ t: 'snap', time: 2, ents: [wireEntity(e)] });
    expect(client.entities.get(e.id)?.ferryRiding).toBe(false);
    expect(client.entities.get(e.id)?.ferryAtSea).toBe(false);
  });
});

describe('the schedule clock on the snapshot head', () => {
  it('rides as `time` in play; a dev skip adds `fc`', () => {
    expect(transportHeadJson({ time: 12.5, transportClockOffset: 0 })).toBe('');
    expect(transportHeadJson({ time: 12.5, transportClockOffset: 40 })).toBe(',"fc":52.5');
    expect(transportClockFromHead({ time: 12.5 })).toBe(12.5);
    expect(transportClockFromHead({ time: 12.5, fc: 52.5 })).toBe(52.5);
    expect(transportClockFromHead({ time: 'x' })).toBeNull();
    expect(transportClockFromHead({ time: Number.NaN, fc: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('gives the ClientWorld the same timetable view the offline Sim serves', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    const client = bareClient(sim.player.id + 1000);
    const apply = (s: unknown) =>
      (client as unknown as { applySnapshot(s: unknown): void }).applySnapshot(s);
    for (const clock of [5, 61, 75, 85, 100, 150, 170]) {
      sim.transportClockOffset = clock - sim.time;
      apply({ t: 'snap', time: sim.time, fc: sim.time + sim.transportClockOffset, ents: [] });
      const online = client.ferryView();
      const offline = sim.ferryView();
      if (!online || !offline) throw new Error('no ferry view');
      expect({ ...online, passenger: false }).toEqual({ ...offline, passenger: false });
      expect(online.phase).toBe(transportPhaseAt(ROUTE, clock).phase);
    }
  });
});

describe('a passenger is movement-frozen on the client (both worlds)', () => {
  it('freezes the online mirror bit and the offline ride alike, and nobody else', () => {
    const alive = { dead: false, ghost: false };
    expect(isMovementFrozen(alive)).toBe(false);
    expect(isMovementFrozen({ ...alive, ferryRiding: true })).toBe(true);
    expect(isMovementFrozen({ ...alive, ferryRide: ride(false) })).toBe(true);
    expect(isMovementFrozen({ ...alive, ferryRiding: false, ferryRide: null })).toBe(false);
    // the corpse rule is unchanged
    expect(isMovementFrozen({ dead: true, ghost: false })).toBe(true);
    expect(isMovementFrozen({ dead: true, ghost: true })).toBe(false);
  });
});
