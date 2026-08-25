import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  DATABASE_URL: 'postgres://movement-stop-test.invalid/test',
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  saveMarketState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  loadMarketState: vi.fn(async () => null),
  loadMailState: vi.fn(async () => null),
  insertBankLedgerRow: vi.fn(async () => {}),
  acquireCharacterLease: vi.fn(async () => true),
  releaseCharacterLease: vi.fn(async () => {}),
  heartbeatCharacterLeases: vi.fn(async () => {}),
  releaseAllCharacterLeases: vi.fn(async () => {}),
}));

import { GameServer } from '../server/game';
import { applyBufferedMovementFrames } from '../server/movement_input_timeline';
import { finishMovementStops, prepareMovementStops } from '../server/movement_stop';
import { fakeWs, joinServer } from './helpers/bare_client';

describe('authoritative movement stop endpoint wiring', () => {
  function advanceMovement(server: GameServer, targetTime: number): void {
    while (server.sim.time + 1e-9 < targetTime) {
      applyBufferedMovementFrames(server.sim, server.clients.values());
      prepareMovementStops(server.sim, server.clients.values());
      server.sim.tick();
      finishMovementStops(server.sim, server.clients.values());
    }
  }

  it('lands on a fractional endpoint inside the server segment and clears held movement', () => {
    const server = new GameServer();
    const session = joinServer(server, fakeWs(), 101, 'Stopper');
    const entity = server.sim.entities.get(session.pid);
    const meta = server.sim.meta(session.pid);
    if (!entity || !meta) throw new Error('joined player missing');
    entity.facing = 0;

    server.handleMessage(session, JSON.stringify({ t: 'input', seq: 1, mi: { f: 1 } }));
    server.sim.tick();
    const targetZ = entity.prevPos.z + (entity.pos.z - entity.prevPos.z) * 0.5;

    server.handleMessage(
      session,
      JSON.stringify({ t: 'input', seq: 2, mi: {}, stop: { x: entity.pos.x, z: targetZ } }),
    );

    expect(entity.pos.z).toBeCloseTo(targetZ, 10);
    expect(meta.moveInput.forward).toBe(false);
    expect(session.pendingMovementStop).toBeNull();
    server.stop();
  });

  it('continues at normal server speed until an ahead endpoint is crossed', () => {
    const server = new GameServer();
    const session = joinServer(server, fakeWs(), 102, 'Runner');
    const entity = server.sim.entities.get(session.pid);
    const meta = server.sim.meta(session.pid);
    if (!entity || !meta) throw new Error('joined player missing');
    entity.facing = 0;

    server.handleMessage(session, JSON.stringify({ t: 'input', seq: 1, mi: { f: 1 } }));
    server.sim.tick();
    const targetZ = entity.pos.z + 0.2;
    server.handleMessage(
      session,
      JSON.stringify({ t: 'input', seq: 2, mi: {}, stop: { x: entity.pos.x, z: targetZ } }),
    );

    expect(meta.moveInput.forward).toBe(true);
    prepareMovementStops(server.sim, server.clients.values());
    server.sim.tick();
    finishMovementStops(server.sim, server.clients.values());

    expect(entity.pos.z).toBeCloseTo(targetZ, 10);
    expect(meta.moveInput.forward).toBe(false);
    expect(session.pendingMovementStop).toBeNull();
    server.stop();
  });

  it('rejects a sideways client endpoint without moving the authority toward it', () => {
    const server = new GameServer();
    const session = joinServer(server, fakeWs(), 103, 'Validator');
    const entity = server.sim.entities.get(session.pid);
    const meta = server.sim.meta(session.pid);
    if (!entity || !meta) throw new Error('joined player missing');
    entity.facing = 0;

    server.handleMessage(session, JSON.stringify({ t: 'input', seq: 1, mi: { f: 1 } }));
    server.sim.tick();
    const before = { ...entity.pos };
    server.handleMessage(
      session,
      JSON.stringify({
        t: 'input',
        seq: 2,
        mi: {},
        stop: { x: entity.pos.x + 1, z: entity.pos.z + 0.2 },
      }),
    );
    expect(entity.pos).toEqual(before);
    expect(meta.moveInput.forward).toBe(false);
    expect(session.pendingMovementStop).toBeNull();
    server.stop();
  });

  it('does not keep moving after a buffered combination endpoint is rejected', () => {
    const server = new GameServer();
    const session = joinServer(server, fakeWs(), 105, 'Combined');
    const entity = server.sim.entities.get(session.pid);
    const meta = server.sim.meta(session.pid);
    if (!entity || !meta) throw new Error('joined player missing');
    entity.facing = 0;
    server.handleMessage(
      session,
      JSON.stringify({ t: 'input', mv: 2, mt: 1_000, seq: 1, mi: { f: 1 } }),
    );
    server.handleMessage(
      session,
      JSON.stringify({ t: 'input', mv: 2, mt: 1_050, seq: 2, mi: { f: 1, sl: 1 } }),
    );
    server.handleMessage(
      session,
      JSON.stringify({
        t: 'input',
        mv: 2,
        mt: 1_100,
        seq: 3,
        mi: {},
        stop: { x: entity.pos.x + 1, z: entity.pos.z + 0.2 },
      }),
    );
    expect(session.lastInputSeq).toBe(0);
    expect(session.lastReceivedInputSeq).toBe(3);

    for (let i = 0; i < 6; i++) {
      applyBufferedMovementFrames(server.sim, server.clients.values());
      prepareMovementStops(server.sim, server.clients.values());
      server.sim.tick();
      finishMovementStops(server.sim, server.clients.values());
    }

    expect(meta.moveInput.forward).toBe(false);
    expect(meta.moveInput.strafeLeft).toBe(false);
    expect(session.pendingMovementStop).toBeNull();
    expect(session.lastInputSeq).toBe(3);
    const stoppedAt = { ...entity.pos };
    for (let i = 0; i < 10; i++) server.sim.tick();
    expect(entity.pos.x).toBeCloseTo(stoppedAt.x, 10);
    expect(entity.pos.z).toBeCloseTo(stoppedAt.z, 10);
    server.stop();
  });

  it('lands on the client endpoint when a timestamped press and release span fractional ticks', () => {
    const server = new GameServer();
    const session = joinServer(server, fakeWs(), 106, 'Fractional');
    const entity = server.sim.entities.get(session.pid);
    const meta = server.sim.meta(session.pid);
    if (!entity || !meta) throw new Error('joined player missing');
    entity.facing = 0;
    const startZ = entity.pos.z;

    server.handleMessage(
      session,
      JSON.stringify({
        t: 'input',
        mv: 2,
        mt: 0,
        seq: 1,
        mi: {},
        p: { x: entity.pos.x, z: startZ },
      }),
    );
    advanceMovement(server, 0.8);
    server.handleMessage(
      session,
      JSON.stringify({
        t: 'input',
        mv: 2,
        mt: 796.2,
        seq: 2,
        mi: { f: 1 },
        p: { x: entity.pos.x, z: startZ },
      }),
    );
    const targetZ = startZ + 14.3941538753;
    const movementDurationMs = 2_905.4 - 796.2;
    let seq = 2;
    for (let elapsedMs = 50; elapsedMs <= 2_050; elapsedMs += 50) {
      seq++;
      server.handleMessage(
        session,
        JSON.stringify({
          t: 'input',
          mv: 2,
          mt: 796.2 + elapsedMs,
          seq,
          mi: { f: 1 },
          p: {
            x: entity.pos.x,
            z: startZ + (targetZ - startZ) * (elapsedMs / movementDurationMs),
          },
        }),
      );
    }
    advanceMovement(server, 2.9);

    seq++;
    server.handleMessage(
      session,
      JSON.stringify({
        t: 'input',
        mv: 2,
        mt: 2_905.4,
        seq,
        mi: {},
        p: { x: entity.pos.x, z: targetZ },
        stop: { x: entity.pos.x, z: targetZ },
      }),
    );
    advanceMovement(server, 3.2);

    expect(entity.pos.z).toBeCloseTo(targetZ, 10);
    expect(meta.moveInput.forward).toBe(false);
    expect(session.lastInputSeq).toBe(seq);
    server.stop();
  });
});
