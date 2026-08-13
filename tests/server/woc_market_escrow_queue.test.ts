// The escrow custody critical section rides the per-character save FIFO (H5:
// the listing custody edge). The hazard it pins: the 30s autosave serializes
// the character INSIDE its queued thunk and commits after an await gap, so an
// escrow write that bypasses the queue can commit first and then be
// overwritten by the autosave's PRE-extraction blob, restoring the item to
// durable bags while the listing holds the escrowed copy (sell it and keep
// it, no crash needed). Drives the REAL GameServer + Sim + custody bridge +
// WocMarketService with the db layer mocked (the guild_bank_persistence
// idiom) and the marketplace db faked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  // biome-ignore lint/suspicious/noExplicitAny: the hoisted double predates its typed impl
  saveCharacterState: vi.fn(async (..._args: any[]) => true),
  // biome-ignore lint/suspicious/noExplicitAny: the hoisted double predates its typed impl
  saveCharacterAndGuildBankState: vi.fn(async (..._args: any[]) => true),
  // biome-ignore lint/suspicious/noExplicitAny: the hoisted double predates its typed impl
  saveCharacterAndMarketState: vi.fn(async (..._args: any[]) => true),
}));

vi.mock('../../server/db', () => ({
  pool: {
    query: vi.fn(async () => ({ rows: [] })),
  },
  GUILD_BANK_ROW_MAX_BYTES: 262144,
  saveCharacterState: dbMock.saveCharacterState,
  saveCharacterAndGuildBankState: dbMock.saveCharacterAndGuildBankState,
  saveCharacterAndMarketState: dbMock.saveCharacterAndMarketState,
  saveMailState: vi.fn(async () => {}),
  insertBankLedgerRow: vi.fn(async () => {}),
  loadGuildBankRows: vi.fn(async (): Promise<unknown[]> => []),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  releaseCharacterLease: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => null),
}));

import { type ClientSession, GameServer } from '../../server/game';
import type { CharacterSaveArgs, WocMarketCustody } from '../../server/woc_market';
import { WocMarketService } from '../../server/woc_market';
import { createWocMarketCustody } from '../../server/woc_market_custody';
import { createDevWocMarketEconomy } from '../../server/woc_market_proxy';
import type { WocListingParams } from '../../server/woc_market_rules';
import { WOC_MARKET_RESTRICTED_POLICY } from '../../server/woc_market_rules';
import { ITEMS } from '../../src/sim/data';
import type { CharacterState } from '../../src/sim/sim';
import { FakeWocMarketDb } from './helpers/fake_woc_market_db';

const REALM = 'test-realm';
const SELLER = 21;
const SELLER_CHAR = 21;
const NONCE = 'nonce-live';
const GUILD = 913;

// A real eligible equipment def from the content tables (the service-test
// fixture shape): tradable, non-quest, so only the custody edge is under test.
const EPIC_ITEM = (() => {
  const id = Object.keys(ITEMS).find((candidate) => {
    const def = ITEMS[candidate];
    return (
      def.quality === 'epic' &&
      !def.soulbound &&
      def.slot !== undefined &&
      !def.noMarketList &&
      def.kind !== 'quest'
    );
  });
  if (!id) throw new Error('no eligible epic equipment def in ITEMS');
  return id;
})();

function listingParams(): WocListingParams {
  return {
    format: 'auction',
    directedBuyerAccount: null,
    startCents: 5000,
    reserveCents: null,
    buyNowCents: null,
    durationHours: 12,
    offerNext: false,
  };
}

function fakeWs(): unknown {
  return { readyState: 1, send: () => {}, close: () => {}, terminate: () => {} };
}

interface Rig {
  server: GameServer;
  session: ClientSession;
  custody: WocMarketCustody;
  db: FakeWocMarketDb;
  service: WocMarketService;
  /** Every character write across BOTH channels, in commit order, with
   *  whether that blob still holds the escrow item. */
  commits: Array<{ channel: string; holdsItem: boolean }>;
  itemIndex: () => number;
  bagsHold: (itemId: string) => boolean;
  join: (accountId: number, characterId: number, name: string) => ClientSession;
}

const blobHoldsItem = (state: CharacterState, itemId: string): boolean =>
  state.inventory.some((s) => s.itemId === itemId);

function makeRig(opts: { escrowWaitMs?: number } = {}): Rig {
  const server = new GameServer();
  const join = (accountId: number, characterId: number, name: string): ClientSession => {
    const joined = server.join(fakeWs() as never, accountId, characterId, name, 'warrior', null);
    if ('error' in joined) throw new Error(joined.error);
    joined.blockListLoaded = true;
    joined.leaseNonce = NONCE;
    return joined;
  };
  const session = join(SELLER, SELLER_CHAR, 'Selara');
  server.sim.addItem(EPIC_ITEM, 1, session.pid, { silent: true });
  const custody = createWocMarketCustody(
    {
      get sim() {
        return server.sim;
      },
      wocCustodySession: (characterId) => server.wocCustodySession(characterId),
      persistMailBlob: () => server.persistMailBlob(),
      enqueueCharacterWrite: (characterId, job) => server.enqueueCharacterWrite(characterId, job),
      serializeCharacterForPersist: (characterId) =>
        server.serializeCharacterForPersist(characterId),
      hasDirtyGuildBooks: (characterId) => server.hasDirtyGuildBooks(characterId),
      flushDirtyGuildBooks: (characterId) => server.flushDirtyGuildBooks(characterId),
    },
    opts,
  );
  const db = new FakeWocMarketDb({
    characters: [{ characterId: SELLER_CHAR, accountId: SELLER, name: 'Selara', realm: REALM }],
  });
  const commits: Rig['commits'] = [];
  const origEscrow = db.escrowInsertListing.bind(db);
  db.escrowInsertListing = async (save: CharacterSaveArgs, listing) => {
    commits.push({ channel: 'escrow', holdsItem: blobHoldsItem(save.state, EPIC_ITEM) });
    return origEscrow(save, listing);
  };
  const service = new WocMarketService({
    db,
    economy: createDevWocMarketEconomy(),
    custody,
    verifiedWallet: async () => 'wallet-seller',
    balanceTokens: async () => 100_000_000,
    config: {
      enabled: true,
      realm: REALM,
      policy: WOC_MARKET_RESTRICTED_POLICY,
      confirmingReviewMs: 6 * 3600 * 1000,
    },
  });
  const inventory = () => {
    const meta = server.sim.players.get(session.pid);
    if (!meta) throw new Error('missing player meta');
    return meta.inventory;
  };
  return {
    server,
    session,
    custody,
    db,
    service,
    commits,
    itemIndex: () => inventory().findIndex((s) => s.itemId === EPIC_ITEM),
    bagsHold: (itemId) => inventory().some((s) => s.itemId === itemId),
    join,
  };
}

function createListing(rig: Rig) {
  return rig.service.createListing({
    account: SELLER,
    characterId: SELLER_CHAR,
    itemRef: { index: rig.itemIndex(), itemId: EPIC_ITEM },
    params: listingParams(),
  });
}

/** Hold the NEXT plain-path autosave commit open; it serializes immediately
 *  (item still aboard) and its commit parks until released. */
function holdNextAutosave(rig: Rig): { release: () => void } {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  dbMock.saveCharacterState.mockImplementationOnce(
    async (_id: number, _level: number, state: CharacterState) => {
      await held;
      rig.commits.push({ channel: 'autosave', holdsItem: blobHoldsItem(state, EPIC_ITEM) });
      return true;
    },
  );
  return { release };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  dbMock.saveCharacterState.mockClear();
  dbMock.saveCharacterState.mockImplementation(async () => true);
  dbMock.saveCharacterAndGuildBankState.mockClear();
  dbMock.saveCharacterAndGuildBankState.mockImplementation(async () => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the escrow critical section rides the per-character save queue (H5)', () => {
  it('a stale autosave snapshot can never resurrect an escrowed item', async () => {
    const rig = makeRig();
    const gate = holdNextAutosave(rig);
    const autosaveDone = rig.server.saveCharacter(rig.session);
    await vi.waitFor(() => expect(dbMock.saveCharacterState).toHaveBeenCalledTimes(1));

    // The listing rides in while that pre-extraction snapshot is in flight.
    const listingDone = createListing(rig);
    await settle();
    // The critical section has not even STARTED: nothing was extracted (the
    // live bags still hold the copy, so a crash right now loses nothing) and
    // no escrow write committed while the stale snapshot was in flight.
    expect(rig.bagsHold(EPIC_ITEM)).toBe(true);
    expect(rig.db.escrowSaves).toHaveLength(0);

    gate.release();
    const [saved, listed] = await Promise.all([autosaveDone, listingDone]);
    expect(saved).toBe(true);
    if (!listed.ok) throw new Error(`createListing refused: ${listed.reason}`);

    // Commit order is queue order: the stale autosave first (item still
    // aboard, harmless because it commits BEFORE the extraction exists),
    // then the escrow write with a FRESH item-free blob. The LAST committed
    // blob must never hold the item once a listing exists.
    expect(rig.commits.map((c) => c.channel)).toEqual(['autosave', 'escrow']);
    expect(rig.commits[0]?.holdsItem).toBe(true);
    expect(rig.commits.at(-1)?.holdsItem).toBe(false);
    expect(rig.bagsHold(EPIC_ITEM)).toBe(false);
    expect(rig.db.escrowSaves).toHaveLength(1);
  });

  it('the escrow blob is serialized inside the job, after every queued commit', async () => {
    const rig = makeRig();
    const meta = rig.server.sim.players.get(rig.session.pid);
    if (!meta) throw new Error('missing player meta');
    meta.copper = 111;
    const gate = holdNextAutosave(rig);
    const autosaveDone = rig.server.saveCharacter(rig.session);
    await vi.waitFor(() => expect(dbMock.saveCharacterState).toHaveBeenCalledTimes(1));
    const listingDone = createListing(rig);
    await settle();
    // Money moves while the job is still queued: the committed escrow blob
    // must carry the LATER value, proving the job serializes at run time
    // rather than replaying a request-time snapshot.
    meta.copper = 999_999;
    gate.release();
    const [, listed] = await Promise.all([autosaveDone, listingDone]);
    if (!listed.ok) throw new Error(`createListing refused: ${listed.reason}`);
    expect(rig.db.escrowSaves).toHaveLength(1);
    expect(rig.db.escrowSaves[0]?.state.copper).toBe(999_999);
  });

  it('the escrow blob carries the session save fixups, not the raw live state', async () => {
    const rig = makeRig();
    // A spectating seller: the ordinary save persists the SAVED position and
    // the stowed pet, never the spectator body. The escrow write must apply
    // the same fixups or a listing while spectating corrupts the blob.
    rig.session.spectating = {
      characterId: 999,
      name: 'Watched',
      savedPos: { x: 111, y: 0, z: 222 },
      priorGm: false,
      stowedPet: null,
    };
    const listed = await createListing(rig);
    if (!listed.ok) throw new Error(`createListing refused: ${listed.reason}`);
    const blob = rig.db.escrowSaves[0]?.state;
    expect(blob?.pos).toEqual({ x: 111, z: 222 });
    expect(blob?.pet).toBeNull();
  });

  it('a quarantined session cannot enter custody at all', async () => {
    const rig = makeRig();
    // A refused guild-bank escrow abandoned this session's live state; the
    // durable row (which still holds the item) is the only truth left, so
    // no custody op may read or persist ANY serialization of it.
    const mailBefore = rig.server.sim.postOffice.mail.length;
    rig.session.escrowQuarantined = true;
    expect(rig.server.wocCustodySession(SELLER_CHAR)).toBeNull();
    const res = await createListing(rig);
    expect(res).toEqual({ ok: false, reason: 'character_invalid' });
    expect(rig.db.escrowSaves).toHaveLength(0);
    // No compensation parcel either: mailing over a durable blob that still
    // holds the item would mint the second copy.
    expect(rig.server.sim.postOffice.mail).toHaveLength(mailBefore);
  });

  it('flushes dirty guild books BEFORE the escrow write, atomically with their character half', async () => {
    const rig = makeRig();
    rig.server.sim.loadGuildBank(GUILD, { treasury: 1000, inventory: [], purchasedSlots: 24 });
    rig.session.dirtyGuildBanks.set(GUILD, 1);
    const order: string[] = [];
    dbMock.saveCharacterAndGuildBankState.mockImplementation(async () => {
      order.push('books');
      return true;
    });
    const origEscrow = rig.db.escrowInsertListing.bind(rig.db);
    rig.db.escrowInsertListing = async (save, listing) => {
      order.push('escrow');
      return origEscrow(save, listing);
    };
    const listed = await createListing(rig);
    if (!listed.ok) throw new Error(`createListing refused: ${listed.reason}`);
    // The book-carrying save committed first (character half + book half in
    // one transaction), so the escrow write's character-row-only commit can
    // never make a book-paired character half durable without its book.
    expect(order).toEqual(['books', 'escrow']);
    expect(rig.server.hasDirtyGuildBooks(SELLER_CHAR)).toBe(false);
  });

  it('refuses contended instead of tearing when the dirty books cannot flush clear', async () => {
    const rig = makeRig();
    // A dirty mark for a guild with NO loaded book: the flush save SKIPS it
    // (nothing to serialize), so the mark survives and the in-job re-check
    // must refuse rather than commit a character row alone.
    rig.session.dirtyGuildBanks.set(999, 1);
    const res = await createListing(rig);
    expect(res).toEqual({ ok: false, reason: 'contended' });
    expect(rig.bagsHold(EPIC_ITEM)).toBe(true);
    expect(rig.db.escrowSaves).toHaveLength(0);
  });

  it('refuses contended within the wait deadline instead of hanging, with nothing extracted', async () => {
    const rig = makeRig({ escrowWaitMs: 50 });
    let releaseQueue!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    // Wedge the character's FIFO (any earlier job): the listing request must
    // give up within its deadline, and because the job never started,
    // nothing was extracted and no compensation is owed.
    const wedge = rig.server.enqueueCharacterWrite(SELLER_CHAR, async () => {
      await held;
    });
    const res = await createListing(rig);
    expect(res).toEqual({ ok: false, reason: 'contended' });
    expect(rig.bagsHold(EPIC_ITEM)).toBe(true);
    expect(rig.db.escrowSaves).toHaveLength(0);
    releaseQueue();
    await wedge;
    // The cancelled job drains as a no-op: a later listing still works.
    const retry = await createListing(rig);
    expect(retry.ok).toBe(true);
  });

  it('caps queued escrow jobs at one per character', async () => {
    const rig = makeRig();
    let releaseQueue!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    const wedge = rig.server.enqueueCharacterWrite(SELLER_CHAR, async () => {
      await held;
    });
    const first = createListing(rig);
    await settle();
    // The second request refuses IMMEDIATELY (depth cap), while the first is
    // still waiting for the wedge.
    const second = await createListing(rig);
    expect(second).toEqual({ ok: false, reason: 'contended' });
    releaseQueue();
    await wedge;
    const firstOut = await first;
    expect(firstOut.ok).toBe(true);
  });

  it('wocCustodySession refuses a quarantined session for every custody op', () => {
    const rig = makeRig();
    expect(rig.server.wocCustodySession(SELLER_CHAR)).not.toBeNull();
    rig.session.escrowQuarantined = true;
    expect(rig.server.wocCustodySession(SELLER_CHAR)).toBeNull();
  });

  it('enqueueCharacterWrite shares the saveCharacter FIFO, per character only', async () => {
    const rig = makeRig();
    const other = rig.join(22, 22, 'Brint');
    const order: string[] = [];
    let releaseJob!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseJob = resolve;
    });
    const jobDone = rig.server.enqueueCharacterWrite(SELLER_CHAR, async () => {
      await held;
      order.push('job');
      return 'ran';
    });
    dbMock.saveCharacterState.mockImplementation(async (id: number) => {
      order.push(`save:${id}`);
      return true;
    });
    const saveA = rig.server.saveCharacter(rig.session);
    // Character B's save is NOT serialized behind A's held job: the queue is
    // per character, never realm-wide.
    await rig.server.saveCharacter(other);
    expect(order).toEqual(['save:22']);
    releaseJob();
    await saveA;
    expect(await jobDone).toBe('ran');
    expect(order).toEqual(['save:22', 'job', 'save:21']);
  });

  it('saveCharacter still propagates a db throw to its caller through the queue', async () => {
    const rig = makeRig();
    dbMock.saveCharacterState.mockImplementationOnce(async () => {
      throw new Error('db down');
    });
    await expect(rig.server.saveCharacter(rig.session)).rejects.toThrow('db down');
    // The chain is not poisoned: the next save for the same character runs.
    await expect(rig.server.saveCharacter(rig.session)).resolves.toBe(true);
  });
});
