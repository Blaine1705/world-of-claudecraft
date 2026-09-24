import { describe, expect, it, vi } from 'vitest';

// Postgres is mocked before the server/game import the harness pulls in
// (tests/CLAUDE.md, Server tests). Superset shape, copied from
// tests/self_pose_teleport_online.test.ts.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  saveMarketState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  acquireCharacterLease: vi.fn(async () => true),
  releaseCharacterLease: vi.fn(async () => {}),
  heartbeatCharacterLeases: vi.fn(async () => {}),
  releaseAllCharacterLeases: vi.fn(async () => {}),
}));

import {
  EASTBROOK_FERRY_HULL,
  EASTBROOK_WICKHARBOR_FERRY,
} from '../src/sim/content/transport_ships';
import { shipToWorld, worldToShip } from '../src/sim/transport_ship';
import { WATER_LEVEL } from '../src/sim/world';
import { createOnlineHarness } from './helpers/online_harness';

// The scheduled ferry end to end: one real ClientWorld against one real
// GameServer over the simulated link (tests/helpers/online_harness.ts). A
// player stands on the Eastbrook deck as the ship leaves, holds forward the
// whole crossing, and must step off docked at Wickharbor at the same deck
// spot, with the client mirroring the ride: the passenger bit, the timetable
// derived from the snapshot clock, and the self-predictor standing down so the
// held key never draws the body walking off a moving deck.

const ROUTE = EASTBROOK_WICKHARBOR_FERRY;
const T = ROUTE.timings;
const EAST = ROUTE.berths[0];
const WICK = ROUTE.berths[1];
const LOCAL = { x: 1.5, z: 0.8 };
const LEAD_S = 1;
const CROSSING_S = T.departing + T.atSea + T.arriving;

describe('a ferry crossing online', () => {
  it('rides the server pose, mirrors the passenger state, and lands docked at Wickharbor', () => {
    const harness = createOnlineHarness({
      latency: {
        toServer: { baseMs: 40, jitterMs: 5, seed: 1337 },
        toClient: { baseMs: 40, jitterMs: 5, seed: 4242 },
      },
      frameMs: 50,
    });
    try {
      const sim = harness.server.sim;
      const e = harness.serverEntity;
      sim.transportClockOffset = T.docked - LEAD_S - sim.time;
      const deck = shipToWorld(
        { x: EAST.x, z: EAST.z, rot: EAST.rot, baseY: WATER_LEVEL },
        LOCAL.x,
        LOCAL.z,
      );
      e.pos = { x: deck.x, y: WATER_LEVEL + EASTBROOK_FERRY_HULL.mainDeckY, z: deck.z };
      e.prevPos = { ...e.pos };
      sim.rebucket(e);
      let sawPassenger = false;
      let sawSeaCard = false;
      const run = harness.runScript({
        durationMs: (LEAD_S + CROSSING_S + 1.5) * 1000,
        // held forward from the moment the ship is under way until just
        // before it docks
        script: [
          { atMs: 0, mi: {}, facing: 0 },
          { atMs: (LEAD_S + 1) * 1000, mi: { forward: true }, facing: 0 },
          { atMs: (LEAD_S + CROSSING_S - 0.5) * 1000, mi: { forward: false }, facing: 0 },
        ],
        actions: Array.from({ length: 30 }, (_, i) => ({
          atMs: (LEAD_S + 1 + i) * 1000,
          run: () => {
            const view = harness.client.ferryView();
            const self = harness.client.entities.get(harness.pid);
            if (view?.passenger && self?.ferryRiding) sawPassenger = true;
            if (view?.passenger && self?.ferryAtSea && !view.shipVisible) sawSeaCard = true;
          },
        })),
      });
      expect(sawPassenger).toBe(true);
      expect(sawSeaCard).toBe(true);
      // the predictor never owned the pose while the ship carried the body
      const riding = run.frames.filter(
        (f) => f.tMs > (LEAD_S + 1) * 1000 && f.tMs < (LEAD_S + CROSSING_S - 1) * 1000,
      );
      expect(riding.length).toBeGreaterThan(100);
      expect(riding.filter((f) => f.predictorActive)).toEqual([]);
      // set down on the Wickharbor deck at the same local spot, then free
      const wick = { x: WICK.x, z: WICK.z, rot: WICK.rot, baseY: WATER_LEVEL };
      expect(e.ferryRide ?? null).toBeNull();
      const local = worldToShip(wick, e.pos.x, e.pos.z);
      expect(local.x).toBeCloseTo(LOCAL.x, 2);
      expect(local.z).toBeCloseTo(LOCAL.z, 2);
      expect(e.pos.y - WATER_LEVEL).toBeCloseTo(EASTBROOK_FERRY_HULL.mainDeckY, 3);
      const last = run.frames[run.frames.length - 1];
      expect(Math.hypot(last.mirrorX - e.pos.x, last.mirrorZ - e.pos.z)).toBeLessThan(3);
      const view = harness.client.ferryView();
      expect(view?.phase).toBe('docked');
      expect(view?.berth).toBe('wickharbor');
      expect(view?.passenger).toBe(false);
    } finally {
      harness.dispose();
    }
  }, 120_000);
});
