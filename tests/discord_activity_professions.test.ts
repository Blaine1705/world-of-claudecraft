// Discord activity feed, professions moments (phase 15): the pure deed
// feed-worthiness gate (discordFeedDeed) and the two new detectActivity arms,
// masterwork procs and feed-worthy deed unlocks (titles + the first koi). The
// server rig mirrors tests/vale_cup_online.test.ts (GameServer over a mocked
// db) and drives detectActivity with synthetic events, the
// tests/game_sessions.test.ts precedent. Each test joins a DISTINCT account:
// the queue's dedupe keys are account-scoped and its recent-key map is
// module-global wall-clock state, so a shared account would collapse cards
// across tests.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  loadMarketState: vi.fn(async () => ({ listings: [], collections: new Map() })),
  saveMarketState: vi.fn(async () => {}),
  loadMailState: vi.fn(async () => ({})),
  saveMailState: vi.fn(async () => {}),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  insertBankLedgerRow: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  acquireCharacterLease: vi.fn(async () => true),
  releaseCharacterLease: vi.fn(async () => {}),
  heartbeatCharacterLeases: vi.fn(async () => {}),
  releaseAllCharacterLeases: vi.fn(async () => {}),
}));

import * as db from '../server/db';
import { discordFeedDeed, FIRST_KOI_DEED_ID } from '../server/deeds_records';
import { drainActivity } from '../server/discord_activity';
import { type ClientSession, GameServer } from '../server/game';
import type { PlayerClass } from '../src/sim/types';

interface FakeClient {
  sent: unknown[];
  ws: { readyState: number; send: (payload: string) => void };
}

function fakeWs(): FakeClient {
  const sent: unknown[] = [];
  return {
    sent,
    ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) },
  };
}

function joinServer(
  server: GameServer,
  fc: FakeClient,
  characterId: number,
  name: string,
  cls: PlayerClass = 'warrior',
): ClientSession {
  const session = server.join(fc.ws as any, characterId, characterId, name, cls, null);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

// The deed fan-out reads the broadcast opt-out (mocked pool.query) before it
// enqueues; setImmediate lands after every pending microtask in that chain.
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('discordFeedDeed: the feed-worthiness gate', () => {
  it('maps a title deed to its name and title text', () => {
    expect(discordFeedDeed('chr_vale_chapter_iii')).toEqual({
      deedName: 'Chronicle of the Vale',
      deedTitle: 'of the Vale',
    });
  });

  it('maps the first-koi deed to a catch payload (no title)', () => {
    expect(discordFeedDeed(FIRST_KOI_DEED_ID)).toEqual({
      deedName: 'Glimmer of Hope',
      itemName: 'Sunglint Koi',
    });
  });

  it('returns null for a real deed that is neither titled nor the koi', () => {
    expect(discordFeedDeed('col_junk_drawer')).toBeNull();
  });

  it('fails CLOSED on a hidden deed even when it rewards a title', () => {
    // hid_saul_footnote rewards the title "the Footnote"; without the
    // public-surface gate this would return a title payload.
    expect(discordFeedDeed('hid_saul_footnote')).toBeNull();
  });

  it('fails CLOSED on an unknown deed id', () => {
    expect(discordFeedDeed('deed_from_a_newer_build')).toBeNull();
  });
});

describe('detectActivity: professions arms (GameServer)', () => {
  let server: GameServer;

  beforeEach(() => {
    server = new GameServer();
    vi.clearAllMocks();
    (db.pool.query as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ rows: [] }));
    drainActivity(); // the activity queue is module-global; start each test empty
  });

  it('masterwork proc enqueues one card with the resolved item name', () => {
    const session = joinServer(server, fakeWs(), 101, 'Smith');
    (server as any).detectActivity([
      {
        type: 'masterwork',
        recipeId: 'recipe_eastbrook_arming_sword',
        itemId: 'eastbrook_arming_sword',
        crafter: session.pid,
        pid: session.pid,
      },
    ]);
    const cards = drainActivity();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: 'masterwork',
      accountIds: [101],
      names: ['Smith'],
      itemName: 'Eastbrook Arming Sword',
    });
  });

  it('a same-account masterwork burst collapses to one card (account dedupe)', () => {
    const session = joinServer(server, fakeWs(), 102, 'Burst');
    const ev = (itemId: string) => ({
      type: 'masterwork',
      recipeId: 'recipe_eastbrook_arming_sword',
      itemId,
      crafter: session.pid,
      pid: session.pid,
    });
    (server as any).detectActivity([ev('eastbrook_arming_sword')]);
    (server as any).detectActivity([ev('eastbrook_chain_vest')]);
    expect(drainActivity()).toHaveLength(1);
  });

  it('a masterwork proc with no session (a bot crafter) enqueues nothing', () => {
    (server as any).detectActivity([
      {
        type: 'masterwork',
        recipeId: 'recipe_eastbrook_arming_sword',
        itemId: 'eastbrook_arming_sword',
        crafter: 424242,
        pid: 424242,
      },
    ]);
    expect(drainActivity()).toHaveLength(0);
  });

  it('a title-deed unlock enqueues a deed card behind the opt-out read', async () => {
    const session = joinServer(server, fakeWs(), 103, 'Chronicler');
    (server as any).detectActivity([
      { type: 'deedUnlocked', deedId: 'chr_vale_chapter_iii', pid: session.pid },
    ]);
    expect(drainActivity()).toHaveLength(0); // not before the async opt-out read
    await flushAsync();
    const cards = drainActivity();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: 'deed',
      accountIds: [103],
      names: ['Chronicler'],
      deedId: 'chr_vale_chapter_iii',
      deedName: 'Chronicle of the Vale',
      deedTitle: 'of the Vale',
    });
  });

  it('the first-koi unlock enqueues the catch-flavored deed card', async () => {
    const session = joinServer(server, fakeWs(), 104, 'Angler');
    (server as any).detectActivity([
      { type: 'deedUnlocked', deedId: FIRST_KOI_DEED_ID, pid: session.pid },
    ]);
    await flushAsync();
    const cards = drainActivity();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: 'deed',
      deedId: FIRST_KOI_DEED_ID,
      deedName: 'Glimmer of Hope',
      itemName: 'Sunglint Koi',
    });
    expect(cards[0].deedTitle).toBeUndefined();
  });

  it('a RETRO unlock never reaches the feed', async () => {
    const session = joinServer(server, fakeWs(), 105, 'Veteran');
    (server as any).detectActivity([
      { type: 'deedUnlocked', deedId: 'chr_vale_chapter_iii', retro: true, pid: session.pid },
    ]);
    await flushAsync();
    expect(drainActivity()).toHaveLength(0);
  });

  it('a non-feed-worthy unlock never reaches the feed', async () => {
    const session = joinServer(server, fakeWs(), 106, 'Collector');
    (server as any).detectActivity([
      { type: 'deedUnlocked', deedId: 'col_junk_drawer', pid: session.pid },
    ]);
    await flushAsync();
    expect(drainActivity()).toHaveLength(0);
  });

  it('the deed-broadcasts opt-out suppresses the feed card', async () => {
    const session = joinServer(server, fakeWs(), 107, 'Private');
    (db.pool.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) =>
      typeof sql === 'string' && sql.includes('deed_broadcasts')
        ? { rows: [{ deed_broadcasts: false }] }
        : { rows: [] },
    );
    (server as any).detectActivity([
      { type: 'deedUnlocked', deedId: 'chr_vale_chapter_iii', pid: session.pid },
    ]);
    await flushAsync();
    expect(drainActivity()).toHaveLength(0);
  });
});
