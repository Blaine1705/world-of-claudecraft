// The authored look on the wire: it has to REACH both audiences, and it has to
// cost the server almost nothing to keep sending.
//
// `app` is the heaviest identity field by an order of magnitude (~0.6 KB against
// a handful of bytes for everything else) and the only one that cannot change
// during a session — it is stamped at join from the character's own column and
// no command mutates it. Composing it into identityFields therefore meant
// JSON.stringify walking half a kilobyte per online player 20 times a second to
// produce the identical string, so it is serialized once per entity and spliced
// instead. These tests pin both halves: the bytes still arrive, and the memo is
// actually a memo.
//
// The self record is the subtle one. The broadcast loop SKIPS the viewer's own
// entity, so a player's own look can only reach them through bcastSelf, where it
// rides the same delta channel as the other heavy fields: sent once, omitted
// afterwards. That makes "absent" mean "unchanged" there and "no authored look"
// everywhere else, which is why the client decode takes a selfDelta flag.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import { type ClientSession, GameServer } from '../server/game';
import type { PlayerClass } from '../src/sim/types';

const LOOK = { gender: 'female', hair: 'highbun', skinLight: 0.4 };

interface FakeClient {
  sent: any[];
  ws: any;
}

function fakeWs(): FakeClient {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) } };
}

function lastSnap(sent: any[]): any {
  for (let i = sent.length - 1; i >= 0; i--) if (sent[i].t === 'snap') return sent[i];
  return null;
}

function joinServer(
  server: GameServer,
  fc: FakeClient,
  characterId: number,
  name: string,
  cls: PlayerClass,
  appearance: Record<string, unknown> | null,
): ClientSession {
  const session = server.join(fc.ws, characterId, characterId, name, cls, null, false, {
    appearance,
  } as never);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

function broadcast(server: GameServer): void {
  (server as any).broadcastSnapshots();
}

describe('authored look on the wire', () => {
  let server: GameServer;

  beforeEach(() => {
    server = new GameServer();
  });

  it('reaches a peer in the first full entity record it sees', () => {
    const a = fakeWs();
    const b = fakeWs();
    joinServer(server, a, 1, 'Watcher', 'warrior', null);
    const other = joinServer(server, b, 2, 'Designed', 'mage', LOOK);
    a.sent.length = 0;
    broadcast(server);

    const wire = lastSnap(a.sent).ents.find((e: any) => e.id === other.pid);
    expect(wire.k).toBe('player'); // a first-sight record is full
    expect(wire.app).toEqual(LOOK);
  });

  it('reaches the viewer own self record, which the entity list never carries', () => {
    const fc = fakeWs();
    const session = joinServer(server, fc, 1, 'Designed', 'mage', LOOK);
    broadcast(server);

    const snap = lastSnap(fc.sent);
    expect(snap.self.app).toEqual(LOOK);
    // The loop skips `e.id === anchorEntity.id`, so this is the ONLY copy.
    expect(snap.ents.some((e: any) => e.id === session.pid)).toBe(false);
  });

  it('ships the self look once, then omits it (the heavy-field delta channel)', () => {
    const fc = fakeWs();
    joinServer(server, fc, 1, 'Designed', 'mage', LOOK);
    broadcast(server);
    expect(lastSnap(fc.sent).self.app).toEqual(LOOK);
    fc.sent.length = 0;
    broadcast(server);
    // Unchanged, so not re-sent. The client treats absence on a self record as
    // "unchanged" rather than "cleared" (online.ts applyWire selfDelta).
    expect(lastSnap(fc.sent).self).not.toHaveProperty('app');
  });

  it('serializes the look ONCE per entity, not once per tick', () => {
    const a = fakeWs();
    const b = fakeWs();
    joinServer(server, a, 1, 'Watcher', 'warrior', null);
    const other = joinServer(server, b, 2, 'Designed', 'mage', LOOK);
    const entity = server.sim.entities.get(other.pid)!;
    // TICK, not just broadcast. wireCacheFor gates every identity stringify on
    // `cache.tick !== sim.tickCount`, so a loop of bare broadcasts enters the
    // serializing arm exactly once whatever the code underneath does — the
    // pre-memo version passes that loop too. Advancing the sim is what makes
    // this measure the memo instead of the per-tick cache.
    let serialized = 0;
    const original = (entity.modularAppearance as any).toJSON;
    Object.defineProperty(entity.modularAppearance, 'toJSON', {
      configurable: true,
      value() {
        serialized++;
        return { ...LOOK };
      },
    });
    const startTick = server.sim.tickCount;
    for (let i = 0; i < 20; i++) {
      server.sim.tick();
      broadcast(server);
    }
    if (original) (entity.modularAppearance as any).toJSON = original;
    expect(server.sim.tickCount).toBeGreaterThan(startTick + 18); // the loop really ticked
    expect(serialized).toBe(1);
  });

  it('keeps sending the look on every FULL record, memo or not', () => {
    // The other half, split out because it needs a full record to look at and
    // a settled entity emits lite ones: assert on first sight, where identity
    // always rides.
    const a = fakeWs();
    const b = fakeWs();
    joinServer(server, a, 1, 'Watcher', 'warrior', null);
    const other = joinServer(server, b, 2, 'Designed', 'mage', LOOK);
    a.sent.length = 0;
    broadcast(server);
    const first = lastSnap(a.sent).ents.find((e: any) => e.id === other.pid);
    expect(first.k).toBe('player');
    expect(first.app).toEqual(LOOK);

    // ...and an identity CHANGE re-emits it from the memo rather than dropping
    // it, since the splice runs inside the change arm.
    server.sim.entities.get(other.pid)!.level = 42;
    a.sent.length = 0;
    server.sim.tick();
    broadcast(server);
    const changed = lastSnap(a.sent).ents.find((e: any) => e.id === other.pid && e.k);
    expect(changed.lv).toBe(42);
    expect(changed.app).toEqual(LOOK);
  });

  it('keeps the key off a character with no authored look', () => {
    const a = fakeWs();
    const b = fakeWs();
    joinServer(server, a, 1, 'Watcher', 'warrior', null);
    const other = joinServer(server, b, 2, 'Legacy', 'mage', null);
    a.sent.length = 0;
    broadcast(server);

    const wire = lastSnap(a.sent).ents.find((e: any) => e.id === other.pid);
    expect(wire).not.toHaveProperty('app');
    expect(lastSnap(a.sent).self).not.toHaveProperty('app');
  });
});
