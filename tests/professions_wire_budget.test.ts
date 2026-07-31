// Phase 16 CI-assertable wire budgets for the professions self-delta keys
// (docs/design/professions-tuning-packet-review.md, Phase 16 item 2): bytes
// per player per tick for ncd/tslot under the delta rules, the legacy
// per-tick ncd arm's worst-case payload, and the allocation behavior of the
// empty arms. These are the pins half of the budget split; the measured Mac
// numbers (tick time, broadcast percentiles) live in
// docs/design/player-performance/professions-load-baseline.md and are never
// asserted here.
//
// Byte pins read the RAW frame string (the tests/snapshots.test.ts:4297
// raw-capturing socket idiom): a substring pin on the unparsed payload is
// byte-exact, so a change that reshapes or re-orders the serialized field
// fails even when the parsed value still matches.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
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
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
}));

import { type ClientSession, GameServer } from '../server/game';
import { GATHER_NODES } from '../src/sim/data';
import { EMPTY_TOOL_EFFECT_SLOT_VIEWS } from '../src/sim/professions/tools';
import { probeAllocationStability } from './util/alloc_probe';

interface RawClient {
  sent: string[];
  ws: { readyState: number; send: (payload: string) => void };
}

function rawWs(): RawClient {
  const sent: string[] = [];
  return { sent, ws: { readyState: 1, send: (payload: string) => sent.push(payload) } };
}

function joinServer(
  server: GameServer,
  fc: RawClient,
  id: number,
  name: string,
  meta?: Parameters<GameServer['join']>[7],
): ClientSession {
  const session = server.join(fc.ws as never, id, id, name, 'warrior', null, false, meta);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

const STABLE_META = { timerWireVersion: 2 } as unknown as Parameters<GameServer['join']>[7];

function broadcast(server: GameServer): void {
  (server as unknown as { broadcastSnapshots: () => void }).broadcastSnapshots();
}

function lastRawSnap(sent: readonly string[]): string {
  for (let i = sent.length - 1; i >= 0; i--) {
    if (sent[i].startsWith('{"t":"snap"')) return sent[i];
  }
  throw new Error('no snapshot frame captured');
}

function mustMeta(server: GameServer, pid: number) {
  const meta = server.sim.players.get(pid);
  if (!meta) throw new Error(`missing player meta ${pid}`);
  return meta;
}

describe('tslot bytes per player per tick under the delta rules', () => {
  it('ships "tslot":[] exactly once for a non-slotter, then 0 bytes per quiet tick', () => {
    const server = new GameServer();
    const fc = rawWs();
    joinServer(server, fc, 1, 'Nonslotter');
    broadcast(server);
    // First snapshot of the session: every registered key ships; the empty
    // projection is the exact two-byte array literal.
    expect(lastRawSnap(fc.sent)).toContain('"tslot":[]');
    // Steady state: byte cost is ZERO per tick (the key is absent entirely),
    // across several quiet ticks, not just one.
    for (let i = 0; i < 5; i++) {
      fc.sent.length = 0;
      server.sim.tick();
      broadcast(server);
      expect(lastRawSnap(fc.sent)).not.toContain('"tslot"');
    }
  });

  it('re-ships only on a real change: the charge spend costs one row, then elides again', () => {
    const server = new GameServer();
    const fc = rawWs();
    const session = joinServer(server, fc, 1, 'Slotter');
    const meta = mustMeta(server, session.pid);
    // The dirtyEveryDeltaField seed shape (a REAL slot written straight onto
    // meta: the wire shape under test is the delta, not the mint).
    meta.toolEffectSlots = {
      mining: {
        effectId: 'gatherers_cache',
        durability: 12,
        maxDurability: 20,
        confirmMode: 'always',
      },
    };
    broadcast(server);
    const first = lastRawSnap(fc.sent);
    expect(first).toContain('"tslot":[{');
    expect(first).toContain('"charges":12');
    // Unchanged rows elide.
    fc.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    expect(lastRawSnap(fc.sent)).not.toContain('"tslot"');
    // A spent charge is a real change: exactly one re-ship, then quiet again.
    const miningSlot = meta.toolEffectSlots.mining;
    if (!miningSlot) throw new Error('fixture slot missing');
    miningSlot.durability = 11;
    fc.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    expect(lastRawSnap(fc.sent)).toContain('"charges":11');
    fc.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    expect(lastRawSnap(fc.sent)).not.toContain('"tslot"');
  });

  it('the empty projection is allocation-stable: one shared frozen instance, both empty arms', () => {
    const server = new GameServer();
    const fc = rawWs();
    const session = joinServer(server, fc, 1, 'Nonslotter');
    // Reference identity across repeated snapshot-path reads, ASSERTED (the
    // review round found the probe's verdict discarded): a fresh array per
    // call, even a fresh FROZEN one, is exactly the allocation this fast
    // path removes and fails both pins below.
    const probe = probeAllocationStability(() => server.sim.toolEffectSlotsFor(session.pid));
    expect(probe.stable, probe.detail).toBe(true);
    expect(server.sim.toolEffectSlotsFor(session.pid)).toBe(EMPTY_TOOL_EFFECT_SLOT_VIEWS);
    expect(Object.isFrozen(server.sim.toolEffectSlotsFor(session.pid))).toBe(true);
    // The second empty arm (a slots object present with zero surviving rows)
    // rides the same shared instance.
    mustMeta(server, session.pid).toolEffectSlots = {};
    expect(server.sim.toolEffectSlotsFor(session.pid)).toBe(EMPTY_TOOL_EFFECT_SLOT_VIEWS);
  });

  it('clearing the last slot ships "tslot":[] exactly once, then elides again', () => {
    const server = new GameServer();
    const fc = rawWs();
    const session = joinServer(server, fc, 1, 'Slotter');
    const meta = mustMeta(server, session.pid);
    meta.toolEffectSlots = {
      mining: {
        effectId: 'gatherers_cache',
        durability: 5,
        maxDurability: 20,
        confirmMode: 'always',
      },
    };
    broadcast(server);
    expect(lastRawSnap(fc.sent)).toContain('"tslot":[{');
    // The non-empty to empty transition rides the empty fast path and must be
    // byte-identical to the old chain's JSON.stringify([]).
    meta.toolEffectSlots = undefined;
    fc.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    expect(lastRawSnap(fc.sent)).toContain('"tslot":[]');
    fc.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    expect(lastRawSnap(fc.sent)).not.toContain('"tslot"');
  });
});

describe('ncd bytes per player per tick under the delta rules (stable arm)', () => {
  it('a cooling map ships once as absolute deadlines, then 0 bytes per quiet tick', () => {
    const server = new GameServer();
    const fc = rawWs();
    const session = joinServer(server, fc, 1, 'Stable', STABLE_META);
    const meta = mustMeta(server, session.pid);
    meta.nodeHarvestReadyAt.ore_eastbrook_1 = server.sim.time + 30;
    broadcast(server);
    expect(lastRawSnap(fc.sent)).toContain('"ncd":{"ore_eastbrook_1":');
    // While the timer runs and nothing changes, the stable arm is BYTE-FREE:
    // the client ages the deadline locally.
    for (let i = 0; i < 5; i++) {
      fc.sent.length = 0;
      server.sim.tick();
      broadcast(server);
      expect(lastRawSnap(fc.sent)).not.toContain('"ncd"');
    }
  });

  it('the worst-case map (every live node cooling) stays under the node_persist wire budget', () => {
    const server = new GameServer();
    const fc = rawWs();
    const session = joinServer(server, fc, 1, 'Stable', STABLE_META);
    const meta = mustMeta(server, session.pid);
    // Absolute deadlines GROW with realm uptime (the review round: measuring
    // at sim.time near zero understates the stable arm and is numerically
    // indistinguishable from legacy remaining-seconds). Thirty days of
    // uptime with a fractional clock is the honest worst case.
    (server.sim as unknown as { time: number }).time = 2_592_000.33;
    for (const node of GATHER_NODES) meta.nodeHarvestReadyAt[node.id] = server.sim.time + 240;
    broadcast(server);
    const raw = lastRawSnap(fc.sent);
    // The arm under measurement really is the stable wire.
    expect(raw).toContain('"tw":2');
    const m = raw.match(/"ncd":(\{[^}]*\})/);
    expect(m).not.toBeNull();
    const payload = m?.[1] ?? '';
    expect(Object.keys(JSON.parse(payload))).toHaveLength(GATHER_NODES.length);
    // The wire twin of tests/professions_node_persist.test.ts's 4096-byte
    // persistence ceiling: the same 120-entry record, absolute-deadline form
    // at day-scale deadline widths. Growth history there: 2048 -> 4096 when
    // live nodes went 54 -> 120.
    expect(payload.length).toBeLessThanOrEqual(4096);
  });
});

describe('ncd on the legacy per-tick arm', () => {
  it('an empty map costs "ncd":{} once, then 0 bytes per quiet tick (the fast path)', () => {
    const server = new GameServer();
    const fc = rawWs();
    joinServer(server, fc, 1, 'Legacy');
    broadcast(server);
    expect(lastRawSnap(fc.sent)).toContain('"ncd":{}');
    for (let i = 0; i < 5; i++) {
      fc.sent.length = 0;
      server.sim.tick();
      broadcast(server);
      expect(lastRawSnap(fc.sent)).not.toContain('"ncd"');
    }
  });

  it('a cooling map re-ships EVERY tick (remaining seconds move), and elapse returns to {} then silence', () => {
    const server = new GameServer();
    const fc = rawWs();
    const session = joinServer(server, fc, 1, 'Legacy');
    const meta = mustMeta(server, session.pid);
    meta.nodeHarvestReadyAt.ore_eastbrook_1 = server.sim.time + 30;
    broadcast(server);
    expect(lastRawSnap(fc.sent)).toContain('"ncd":{"ore_eastbrook_1":30}');
    // The legacy arm's per-tick cost while cooling: the WHOLE map, every tick.
    fc.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    const second = lastRawSnap(fc.sent);
    expect(second).toContain('"ncd":{"ore_eastbrook_1":');
    expect(second).not.toContain('"ncd":{"ore_eastbrook_1":30}');
    // Elapse: the projected map is {} again; the fast path must produce a
    // byte-identical transition frame and then full silence.
    meta.nodeHarvestReadyAt.ore_eastbrook_1 = server.sim.time - 1;
    fc.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    expect(lastRawSnap(fc.sent)).toContain('"ncd":{}');
    fc.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    expect(lastRawSnap(fc.sent)).not.toContain('"ncd"');
  });

  it('the worst-case legacy payload (every live node cooling) is bounded like the stable arm', () => {
    const server = new GameServer();
    const fc = rawWs();
    const session = joinServer(server, fc, 1, 'Legacy');
    const meta = mustMeta(server, session.pid);
    for (const node of GATHER_NODES) meta.nodeHarvestReadyAt[node.id] = server.sim.time + 240;
    broadcast(server);
    const raw = lastRawSnap(fc.sent);
    const m = raw.match(/"ncd":(\{[^}]*\})/);
    expect(m).not.toBeNull();
    const payload = m?.[1] ?? '';
    expect(Object.keys(JSON.parse(payload))).toHaveLength(GATHER_NODES.length);
    expect(payload.length).toBeLessThanOrEqual(4096);
    // This payload repeats per player per tick at 20 Hz for a pre-stable
    // client while anything cools: that per-tick repetition is exactly why
    // the stable arm exists, and the load rig measures both arms live.
  });
});
