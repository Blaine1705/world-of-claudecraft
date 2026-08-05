// Reliquary Phase 3: IWorld + wire thrift. Sparse `reliq` self blob, id-only
// `reliquaryUnlock` presentation event, online/offline completion parity for
// scripted state. No UI coverage here.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  insertBankLedgerRow: vi.fn(async () => {}),
}));

import { GameServer } from '../server/game';
import { markItemDiscovered } from '../src/sim/deeds';
import { RELIQUARY_PAGES_BY_ID } from '../src/sim/reliquary';
import type { Sim } from '../src/sim/sim';
import { bareClient } from './helpers/bare_client';

/** Catalogued Hollow Crypt unique used across Reliquary pin tests. */
const CATALOGUE_RELIC = 'cryptbone_helm';
const PAGE_ID = 'conquerors_hollow_crypt';

function fakeWs() {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (p: string) => sent.push(JSON.parse(p)) } };
}

function lastSnap(sent: any[]): any {
  for (let i = sent.length - 1; i >= 0; i--) if (sent[i].t === 'snap') return sent[i];
  return null;
}

function lastEvents(sent: any[]): any[] {
  const out: any[] = [];
  for (const msg of sent) {
    if (msg.t === 'events' && Array.isArray(msg.list)) out.push(...msg.list);
  }
  return out;
}

function joinAt(server: GameServer, fw: ReturnType<typeof fakeWs>, acct: number, name: string) {
  const s = server.join(fw.ws as any, acct, acct, name, 'warrior', null) as any;
  if ('error' in s) throw new Error(s.error);
  s.blockListLoaded = true;
  return s;
}

/** Pump sim events through the server's private routeEvents (HEAVY_SELF dirty). */
function routeEvents(server: GameServer, events: unknown[]): void {
  (server as unknown as { routeEvents(e: unknown[]): void }).routeEvents(events);
}

function scriptedReliquaryState(sim: Sim, pid: number): void {
  const meta = sim.players.get(pid)!;
  meta.deedStats.dungeonClears.hollow_crypt = 4;
  markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
  // A second catalogued unique so recent is multi-entry and completion is partial.
  markItemDiscovered(sim.ctx, meta, 'cryptbone_greaves');
}

describe('Reliquary wire thrift', () => {
  it('heavy self ships sparse reliq only (no dual itemsDiscovered on the blob)', () => {
    const server = new GameServer();
    const fw = fakeWs();
    const session = joinAt(server, fw, 1, 'RelicA');
    const sim = server.sim as Sim;
    scriptedReliquaryState(sim, session.pid);

    fw.sent.length = 0;
    (server as any).broadcastSnapshots();
    const snap = lastSnap(fw.sent);
    expect(snap).not.toBeNull();
    expect(snap.self).toHaveProperty('reliq');

    const reliq = snap.self.reliq;
    // Sparse shape: firstFind + recent only. Never a second discovery array.
    expect(reliq).not.toHaveProperty('itemsDiscovered');
    expect(Object.keys(reliq).sort()).toEqual(['firstFind', 'recent']);
    expect(reliq.firstFind[CATALOGUE_RELIC]).toEqual({
      clears: 4,
      pageId: PAGE_ID,
    });
    expect(reliq.firstFind.cryptbone_greaves).toEqual({
      clears: 4,
      pageId: PAGE_ID,
    });
    expect(reliq.recent).toEqual([CATALOGUE_RELIC, 'cryptbone_greaves']);

    // Payload thrift: the sparse blob is far smaller than re-shipping dstats discovery.
    const reliqBytes = JSON.stringify(reliq).length;
    const dstatsDiscoveryBytes = JSON.stringify(snap.self.dstats?.itemsDiscovered ?? []).length;
    expect(reliqBytes).toBeLessThan(400);
    // dstats may still carry discovery (ownership authority); reliq must not grow into it.
    expect(reliqBytes).toBeLessThan(dstatsDiscoveryBytes + 200);

    // Ownership still rides dstats, not a duplicate list on reliq.
    expect(snap.self.dstats.itemsDiscovered).toContain(CATALOGUE_RELIC);
  });

  it('quiet ticks omit reliq (dirty-only); a catalogued find re-ships it', () => {
    const server = new GameServer();
    const fw = fakeWs();
    const session = joinAt(server, fw, 2, 'RelicB');
    const sim = server.sim as Sim;
    const meta = sim.players.get(session.pid)!;

    (server as any).broadcastSnapshots(); // first full self
    sim.tick();
    fw.sent.length = 0;
    (server as any).broadcastSnapshots();
    const quiet = lastSnap(fw.sent);
    expect(quiet.self).not.toHaveProperty('reliq');
    expect(quiet.self).not.toHaveProperty('dstats');

    meta.deedStats.dungeonClears.hollow_crypt = 1;
    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    // routeEvents marks HEAVY_SELF_EVENTS (reliquaryUnlock) so the next snapshot
    // re-diffs sparse reliq without waiting on the staggered backstop.
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'reliquaryUnlock')).toBe(true);
    routeEvents(server, events);
    fw.sent.length = 0;
    (server as any).broadcastSnapshots();
    const after = lastSnap(fw.sent);
    expect(after.self).toHaveProperty('reliq');
    expect(after.self.reliq.firstFind[CATALOGUE_RELIC]).toEqual({
      clears: 1,
      pageId: PAGE_ID,
    });
  });

  it('reliquaryUnlock is id-only with pageIds and no English', () => {
    const server = new GameServer();
    const fw = fakeWs();
    const session = joinAt(server, fw, 3, 'RelicC');
    const sim = server.sim as Sim;
    const meta = sim.players.get(session.pid)!;

    meta.deedStats.dungeonClears.hollow_crypt = 2;
    fw.sent.length = 0;
    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    const events = sim.drainEvents();
    routeEvents(server, events);
    (server as any).broadcastSnapshots();

    const unlocks = lastEvents(fw.sent).filter((e) => e.type === 'reliquaryUnlock');
    expect(unlocks.length).toBe(1);
    const ev = unlocks[0];
    expect(ev.itemId).toBe(CATALOGUE_RELIC);
    expect(ev.markId).toBeUndefined();
    expect(ev.pageIds).toEqual([PAGE_ID]);
    expect(ev.pid).toBe(session.pid);
    // Wire keys are the id-only contract; no display text fields.
    expect(Object.keys(ev).sort()).toEqual(['itemId', 'pageIds', 'pid', 'type'].sort());
    expect(ev.name).toBeUndefined();
    expect(ev.label).toBeUndefined();
    expect(ev.message).toBeUndefined();
    expect(ev.text).toBeUndefined();
  });
});

describe('Reliquary online / offline parity for scripted state', () => {
  it('ClientWorld mirrors reliq and answers completion identically to Sim', () => {
    const server = new GameServer();
    const fw = fakeWs();
    const session = joinAt(server, fw, 4, 'RelicD');
    const sim = server.sim as Sim;
    scriptedReliquaryState(sim, session.pid);
    sim.tick();

    fw.sent.length = 0;
    (server as any).broadcastSnapshots();
    const snap = lastSnap(fw.sent);
    const client = bareClient(session.pid);
    (client as any).applySnapshot(snap);

    // Sparse mirrors.
    expect(client.reliquaryFirstFind[CATALOGUE_RELIC]).toEqual(
      sim.reliquaryFirstFind[CATALOGUE_RELIC],
    );
    expect([...client.reliquaryMarks]).toEqual([...sim.reliquaryMarks]);
    expect(client.reliquaryRecent).toEqual([...sim.reliquaryRecent]);

    // Ownership for completion still rides deedStats discovery, mirrored via dstats.
    expect(client.deedStats.itemsDiscovered.has(CATALOGUE_RELIC)).toBe(true);
    expect(client.deedStats.itemsDiscovered.has('cryptbone_greaves')).toBe(true);

    const offlinePage = sim.reliquaryPageCompletion(PAGE_ID);
    const onlinePage = client.reliquaryPageCompletion(PAGE_ID);
    expect(onlinePage).toEqual(offlinePage);
    expect(onlinePage).not.toBeNull();
    expect(onlinePage!.owned).toBe(2);
    expect(onlinePage!.total).toBe(RELIQUARY_PAGES_BY_ID[PAGE_ID]!.relics.length);
    expect(onlinePage!.complete).toBe(false);

    expect(client.reliquaryCatalogCompletion()).toEqual(sim.reliquaryCatalogCompletion());
    expect(client.reliquaryCuratorRank()).toBe(sim.reliquaryCuratorRank());
    expect(client.reliquaryPageClearCount(PAGE_ID)).toBe(sim.reliquaryPageClearCount(PAGE_ID));
    expect(client.reliquaryPageClearCount(PAGE_ID)).toBe(4);
    expect(client.reliquaryPageCompletion('not_a_page')).toBeNull();
  });

  it('does not force saveCharacter on pure relic fill', async () => {
    const { saveCharacterState } = await import('../server/db');
    const saveMock = saveCharacterState as ReturnType<typeof vi.fn>;
    saveMock.mockClear();

    const server = new GameServer();
    const fw = fakeWs();
    const session = joinAt(server, fw, 5, 'RelicE');
    const sim = server.sim as Sim;
    const meta = sim.players.get(session.pid)!;

    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    const events = sim.drainEvents();
    routeEvents(server, events);
    // detectActivity must not force a deed-style save on reliquaryUnlock.
    (server as unknown as { detectActivity(e: unknown[]): void }).detectActivity(events);
    (server as any).broadcastSnapshots();

    // Pure relic fill must not schedule an immediate character save (ride 30s autosave).
    // Deed unlocks force save; reliquaryUnlock must not.
    expect(saveMock).not.toHaveBeenCalled();
    expect(meta.reliquary.firstFind[CATALOGUE_RELIC]).toBeDefined();
  });
});
