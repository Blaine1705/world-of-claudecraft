import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; only server/game.ts's WS input
// dispatch and the shared Sim tick are under test.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
}));

import { GameServer } from '../server/game';
import {
  initialJumpLatchState,
  noteJumpInput,
  resolveJumpInput,
  SERVER_JUMP_LATCH_S,
} from '../server/jump_latch';

function fakeWs() {
  return { readyState: 1, send: () => {} };
}

// Drives one server tick the same way GameServer's own interval loop does:
// the latch resolver MUST run immediately before Sim.tick() (see
// GameServer.applyJumpLatches), so tests go through this helper rather than
// calling server.sim.tick() bare.
function tick(server: GameServer): void {
  (server as any).applyJumpLatches();
  server.sim.tick();
}

describe('jump_latch pure core', () => {
  it('does nothing on a frame that never asked to jump', () => {
    const state = initialJumpLatchState();
    noteJumpInput(state, false, 5);
    expect(state).toEqual({ rawJump: false, latchUntil: 0 });
    expect(resolveJumpInput(state, 5)).toBe(false);
  });

  it('a press resolves true immediately and latches the deadline forward', () => {
    const state = initialJumpLatchState();
    noteJumpInput(state, true, 10);
    expect(state.latchUntil).toBeCloseTo(10 + SERVER_JUMP_LATCH_S, 10);
    expect(resolveJumpInput(state, 10)).toBe(true);
  });

  it('a release frame landing inside the latch window still resolves true', () => {
    const state = initialJumpLatchState();
    noteJumpInput(state, true, 10);
    // A release frame arriving 20ms later (well inside the 150ms window,
    // exactly the coalesced-delivery case) updates the raw flag but must not
    // shorten the window, and resolution must still read true.
    noteJumpInput(state, false, 10.02);
    expect(state.rawJump).toBe(false);
    expect(resolveJumpInput(state, 10.02)).toBe(true);
  });

  it('resolves false again once the latch window has actually elapsed', () => {
    const state = initialJumpLatchState();
    noteJumpInput(state, true, 10);
    noteJumpInput(state, false, 10.02);
    expect(resolveJumpInput(state, 10 + SERVER_JUMP_LATCH_S + 0.01)).toBe(false);
  });

  it('a held press keeps resolving true for as long as the raw flag is true', () => {
    const state = initialJumpLatchState();
    noteJumpInput(state, true, 10);
    // Long past the original latch window, but the key is still down.
    expect(resolveJumpInput(state, 10 + SERVER_JUMP_LATCH_S + 5)).toBe(true);
  });
});

describe('server-side jump latch (dispatchMessage + applyJumpLatches integration)', () => {
  it('still fires the jump when the press and release frames land in the same inter-tick window', () => {
    const server = new GameServer();
    const session = server.join(fakeWs() as any, 1, 1, 'Jumper', 'warrior', null);
    if ('error' in session) throw new Error(session.error);

    const entity = server.sim.entities.get(session.pid)!;
    // Sanity precondition: the fresh spawn is grounded, so any airborne state
    // observed below is caused by the jump, not a pre-existing fall.
    expect(entity.onGround).toBe(true);

    // The coalesced-delivery bug: a jittery link can deliver the jump-press
    // frame and its own jump-release frame close enough together that BOTH
    // arrive before the next Sim tick runs. Model that here by handling both
    // messages back to back with no intervening tick.
    server.handleMessage(session, JSON.stringify({ t: 'input', seq: 1, mi: { f: 1, j: 1 } }));
    server.handleMessage(session, JSON.stringify({ t: 'input', seq: 2, mi: { f: 1 } }));

    // The very next tick already falls inside the server-side latch window
    // (SERVER_JUMP_LATCH_S), so it must still observe the press and fire the
    // jump: last-write-wins on the raw moveInput would have discarded it and
    // left the player grounded here.
    tick(server);
    expect(entity.onGround).toBe(false);
  });

  it('never gets stuck true: a genuinely silent connection settles back to grounded after the window', () => {
    const server = new GameServer();
    const session = server.join(fakeWs() as any, 1, 1, 'Jumper2', 'warrior', null);
    if ('error' in session) throw new Error(session.error);
    const entity = server.sim.entities.get(session.pid)!;

    // One press, one release, both squeezed before the first tick, then
    // total silence (no further input frames at all): the pathological case
    // a single write-and-forget latch could leave stuck true forever.
    server.handleMessage(session, JSON.stringify({ t: 'input', seq: 1, mi: { j: 1 } }));
    server.handleMessage(session, JSON.stringify({ t: 'input', seq: 2, mi: {} }));

    tick(server);
    expect(entity.onGround).toBe(false); // jumped

    // Run out the arc and well past the latch window with no more input.
    for (let i = 0; i < 40 && !entity.onGround; i++) tick(server);
    expect(entity.onGround).toBe(true); // landed

    // A stuck-true latch would auto-refire the instant it touched down.
    let refired = false;
    for (let i = 0; i < 10; i++) {
      tick(server);
      if (!entity.onGround) refired = true;
    }
    expect(refired).toBe(false);
  });

  it('a real held jump key (raw true across many ticks) still only fires once per airborne cycle', () => {
    const server = new GameServer();
    const session = server.join(fakeWs() as any, 1, 1, 'Jumper3', 'warrior', null);
    if ('error' in session) throw new Error(session.error);
    const entity = server.sim.entities.get(session.pid)!;

    // The client's own latch (KEY_JUMP_LATCH_MS) holds jump: true across
    // several resends; model a few consecutive true frames with real ticks
    // interleaved, the ordinary (non-jittery) case.
    for (let i = 0; i < 3; i++) {
      server.handleMessage(session, JSON.stringify({ t: 'input', seq: i + 1, mi: { j: 1 } }));
      tick(server);
    }
    expect(entity.onGround).toBe(false); // jumped once, stayed airborne

    server.handleMessage(session, JSON.stringify({ t: 'input', seq: 4, mi: {} }));
    for (let i = 0; i < 40 && !entity.onGround; i++) tick(server);
    expect(entity.onGround).toBe(true); // landed normally, exactly one jump
  });
});
