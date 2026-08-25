import { beforeEach, describe, expect, it, vi } from 'vitest';

// Postgres is mocked (hoisted above the server/game import), the bank_wire.test.ts
// block plus insertBankLedgerRow, so GameServer runs with no live DB and the
// fire-and-forget ledger writer is a spy we can assert against.
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
  insertBankLedgerRows: vi.fn(async () => {}),
}));

import { bankLedgerIdle, diffBankOp, diffBankSocketOp, recordBankOp } from '../server/bank_ledger';
import { insertBankLedgerRow, insertBankLedgerRows } from '../server/db';
import { GameServer } from '../server/game';
import { REALM } from '../server/realm';
import type { BankInfo } from '../src/world_api';

const insertMock = vi.mocked(insertBankLedgerRow);
// The vault observer writes through the BATCHED sibling (one insert per op,
// however many materials the diff produced); the personal bank and guild arms
// stay on the single-row writer above.
const insertRowsMock = vi.mocked(insertBankLedgerRows);

// A BankInfo with the given slots; capacity/nextExpansionCost are set for realism
// but diffBankOp only reads slots, purchasedSlots, and (for buy) nextExpansionCost.
function info(
  slots: BankInfo['slots'],
  purchasedSlots = 0,
  nextExpansionCost: number | null = 500,
): BankInfo {
  return {
    slots,
    capacity: 24 + purchasedSlots,
    purchasedSlots,
    bonusSlots: 0,
    nextExpansionCost,
    bonusSources: [],
    socketsUnlocked: 0,
    socketBags: [null, null, null, null],
    nextSocketCost: 1000000,
    generalCapacity: 24 + purchasedSlots,
    materialsCapacity: 0,
    generalUsed: slots.length,
    materialsUsed: 0,
  };
}

describe('diffBankOp (pure)', () => {
  it('a deposit of a new stack yields the deposited count', () => {
    expect(diffBankOp('deposit', info([]), info([{ itemId: 'wolf_fang', count: 3 }]))).toEqual([
      { itemId: 'wolf_fang', count: 3, instance: null, copperDelta: 0, purchasedSlotsAfter: 0 },
    ]);
  });

  it('a deposit merging into an existing stack records the MOVED amount, not the total', () => {
    // before 2, after 5: the ledger records the delta 3 (what moved), never 5.
    // Conservation replay depends on this: an earlier deposit of 2 plus this 3 nets
    // to the resulting 5, whereas recording 5 here would over-count to 7.
    expect(
      diffBankOp(
        'deposit',
        info([{ itemId: 'wolf_fang', count: 2 }]),
        info([{ itemId: 'wolf_fang', count: 5 }]),
      ),
    ).toEqual([
      { itemId: 'wolf_fang', count: 3, instance: null, copperDelta: 0, purchasedSlotsAfter: 0 },
    ]);
  });

  it('a partial withdraw records the withdrawn count', () => {
    expect(
      diffBankOp(
        'withdraw',
        info([{ itemId: 'wolf_fang', count: 5 }]),
        info([{ itemId: 'wolf_fang', count: 3 }]),
      ),
    ).toEqual([
      { itemId: 'wolf_fang', count: 2, instance: null, copperDelta: 0, purchasedSlotsAfter: 0 },
    ]);
  });

  it('an instanced deposit carries the instance payload with count 1', () => {
    const instance = { signer: 'Vaulta', rolled: { quality: 'rare' } };
    expect(
      diffBankOp('deposit', info([]), info([{ itemId: 'signed_blade', count: 1, instance }])),
    ).toEqual([
      { itemId: 'signed_blade', count: 1, instance, copperDelta: 0, purchasedSlotsAfter: 0 },
    ]);
  });

  it('a buy_slots yields one row: negated BEFORE price, item fields null', () => {
    // The first expansion price is 500 (src/sim/bank.ts BANK_EXPANSION_PRICES), read
    // off the BEFORE snapshot; after.purchasedSlots is the new 6.
    expect(diffBankOp('buy_slots', info([], 0, 500), info([], 6, 1000))).toEqual([
      { itemId: null, count: null, instance: null, copperDelta: -500, purchasedSlotsAfter: 6 },
    ]);
  });

  it('identical snapshots (a refused/no-op call) yield no rows', () => {
    const slots = [{ itemId: 'wolf_fang', count: 4 }];
    expect(diffBankOp('deposit', info(slots), info(slots))).toEqual([]);
    expect(diffBankOp('withdraw', info(slots), info(slots))).toEqual([]);
    // A buy that did not raise purchasedSlots is also a no-op.
    expect(diffBankOp('buy_slots', info([], 6, 1000), info([], 6, 1000))).toEqual([]);
  });

  it('a null snapshot on either side (away from a banker) yields no rows', () => {
    expect(diffBankOp('deposit', null, info([{ itemId: 'wolf_fang', count: 1 }]))).toEqual([]);
    expect(diffBankOp('withdraw', info([{ itemId: 'wolf_fang', count: 1 }]), null)).toEqual([]);
    expect(diffBankOp('buy_slots', null, null)).toEqual([]);
  });
});

// A BankInfo with the socket dimensions parameterized; the slot dimensions stay
// at info([])'s defaults so a socket diff can never be confused with a slot one.
function sinfo(o: Partial<BankInfo>): BankInfo {
  return { ...info([]), ...o };
}

describe('diffBankSocketOp (pure)', () => {
  it('an unlock yields one copper row at the negated BEFORE price', () => {
    // purchasedSlots 6 proves purchasedSlotsAfter is the BYSTANDER slot-ladder
    // stamp (the audit monotonicity contract), never the new socket count 1.
    expect(
      diffBankSocketOp(
        sinfo({ socketsUnlocked: 0, nextSocketCost: 1000000, purchasedSlots: 6 }),
        sinfo({ socketsUnlocked: 1, nextSocketCost: 2000000, purchasedSlots: 6 }),
      ),
    ).toEqual([
      {
        op: 'unlock_socket',
        delta: {
          itemId: null,
          count: null,
          instance: null,
          copperDelta: -1000000,
          purchasedSlotsAfter: 6,
        },
      },
    ]);
  });

  it('socketing into an empty socket yields one socket_bag row', () => {
    expect(
      diffBankSocketOp(
        sinfo({ socketsUnlocked: 1, socketBags: [null, null, null, null] }),
        sinfo({ socketsUnlocked: 1, socketBags: ['linen_pouch', null, null, null] }),
      ),
    ).toEqual([
      {
        op: 'socket_bag',
        delta: {
          itemId: 'linen_pouch',
          count: 1,
          instance: null,
          copperDelta: 0,
          purchasedSlotsAfter: 0,
        },
      },
    ]);
  });

  it('a swap yields exactly its two rows, the displaced bag FIRST', () => {
    // Unsocket-before-socket within the index keeps the audit replay's running
    // socket net from dipping below zero on a legitimate history.
    expect(
      diffBankSocketOp(
        sinfo({ socketsUnlocked: 1, socketBags: ['linen_pouch', null, null, null] }),
        sinfo({ socketsUnlocked: 1, socketBags: ['burlap_reagent_pouch', null, null, null] }),
      ),
    ).toEqual([
      {
        op: 'unsocket_bag',
        delta: {
          itemId: 'linen_pouch',
          count: 1,
          instance: null,
          copperDelta: 0,
          purchasedSlotsAfter: 0,
        },
      },
      {
        op: 'socket_bag',
        delta: {
          itemId: 'burlap_reagent_pouch',
          count: 1,
          instance: null,
          copperDelta: 0,
          purchasedSlotsAfter: 0,
        },
      },
    ]);
  });

  it('an unsocket yields one unsocket_bag row', () => {
    expect(
      diffBankSocketOp(
        sinfo({ socketsUnlocked: 1, socketBags: ['linen_pouch', null, null, null] }),
        sinfo({ socketsUnlocked: 1, socketBags: [null, null, null, null] }),
      ),
    ).toEqual([
      {
        op: 'unsocket_bag',
        delta: {
          itemId: 'linen_pouch',
          count: 1,
          instance: null,
          copperDelta: 0,
          purchasedSlotsAfter: 0,
        },
      },
    ]);
  });

  it('identical snapshots (a refusal, or a same-bag-id swap) yield no rows', () => {
    const held = sinfo({ socketsUnlocked: 2, socketBags: ['linen_pouch', null, null, null] });
    expect(diffBankSocketOp(held, sinfo({ ...held }))).toEqual([]);
  });

  it('a null snapshot on either side yields no rows', () => {
    expect(diffBankSocketOp(null, sinfo({ socketsUnlocked: 1 }))).toEqual([]);
    expect(diffBankSocketOp(sinfo({ socketsUnlocked: 1 }), null)).toEqual([]);
  });

  it('pins the structural ceiling: a hand-built every-index diff yields 4 + 4 + 1 rows', () => {
    // The loop is bounded by the socket count, so the differ's TRUE ceiling is
    // one unsocket plus one socket per index plus the unlock row: 9 for a
    // four-socket bank. Only the sim's one-index-per-command rule makes the
    // real per-command bound 2; a future bulk verb (a socket sort, a bag-set
    // swap) would ride this ceiling and must re-price the retention header
    // (the write-volume rule). This pin is what makes that ceiling explicit
    // rather than an accident of today's commands.
    const rows = diffBankSocketOp(
      sinfo({
        socketsUnlocked: 3,
        socketBags: ['a', 'b', 'c', 'd'],
        nextSocketCost: 5000000,
      }),
      sinfo({
        socketsUnlocked: 4,
        socketBags: ['e', 'f', 'g', 'h'],
        nextSocketCost: null,
      }),
    );
    expect(rows).toHaveLength(9);
    expect(rows.filter((r) => r.op === 'unlock_socket')).toHaveLength(1);
    expect(rows.filter((r) => r.op === 'unsocket_bag')).toHaveLength(4);
    expect(rows.filter((r) => r.op === 'socket_bag')).toHaveLength(4);
  });
});

// ── GameServer dispatch integration ───────────────────────────────────────────

function fakeWs() {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (p: string) => sent.push(JSON.parse(p)) } };
}

// Distinct accountId (7) and characterId (42) so a swapped-field bug in the row
// mapping is caught (equal ids would hide it).
function joinLedger(server: GameServer, fw: ReturnType<typeof fakeWs>, name: string) {
  const s = server.join(fw.ws as any, 7, 42, name, 'warrior', null) as any;
  if ('error' in s) throw new Error(s.error);
  s.blockListLoaded = true;
  return s;
}

function send(server: GameServer, session: any, msg: Record<string, unknown>): void {
  server.handleMessage(session, JSON.stringify({ t: 'cmd', ...msg }));
}

function bringBankerToPlayer(sim: any, pid: number): any {
  const banker = sim.entities.get(sim.bankerIds[0]);
  const p = sim.entities.get(pid);
  banker.pos = { ...p.pos };
  banker.prevPos = { ...banker.pos };
  return banker;
}

function wolfFangIndex(sim: any, pid: number): number {
  return sim.players.get(pid).inventory.findIndex((s: any) => s.itemId === 'wolf_fang');
}

describe('bank ledger dispatch integration', () => {
  beforeEach(async () => {
    // Drain any pending writes from a prior test, then clear the call history but
    // keep the default async impl.
    await bankLedgerIdle();
    insertMock.mockClear();
  });

  it('deposit, withdraw, and buy each write exactly one row with the right fields', async () => {
    const server = new GameServer();
    const fw = fakeWs();
    const s = joinLedger(server, fw, 'Ledgera');
    const pid = s.pid;
    const sim = server.sim as any;
    bringBankerToPlayer(sim, pid);
    sim.addItem('wolf_fang', 5, pid);

    // 1) deposit 2 of 5: one deposit row, count 2, no copper, 0 purchased slots.
    send(server, s, { cmd: 'bank_deposit', slot: wolfFangIndex(sim, pid), count: 2 });
    await bankLedgerIdle();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toEqual({
      realm: REALM,
      characterId: 42,
      accountId: 7,
      op: 'deposit',
      itemId: 'wolf_fang',
      count: 2,
      instance: null,
      copperDelta: 0,
      purchasedSlotsAfter: 0,
      container: 'personal',
      containerId: null,
    });

    // 2) withdraw 1: one withdraw row, count 1.
    send(server, s, { cmd: 'bank_withdraw', slot: 0, count: 1 });
    await bankLedgerIdle();
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock.mock.calls[1][0]).toEqual({
      realm: REALM,
      characterId: 42,
      accountId: 7,
      op: 'withdraw',
      itemId: 'wolf_fang',
      count: 1,
      instance: null,
      copperDelta: 0,
      purchasedSlotsAfter: 0,
      container: 'personal',
      containerId: null,
    });

    // 3) buy the first expansion: one buy_slots row, copperDelta -500, +6
    // slots, stamped with the gold rail (Bank Storage phase 11 paid-with).
    sim.players.get(pid).copper = 1000;
    send(server, s, { cmd: 'bank_buy_slots' });
    await bankLedgerIdle();
    expect(insertMock).toHaveBeenCalledTimes(3);
    expect(insertMock.mock.calls[2][0]).toEqual({
      realm: REALM,
      characterId: 42,
      accountId: 7,
      op: 'buy_slots',
      itemId: null,
      count: null,
      instance: { paidWith: 'gold' },
      copperDelta: -500,
      purchasedSlotsAfter: 6,
      container: 'personal',
      containerId: null,
    });
  });

  it('the socket trio writes bounded BATCHES: unlock one row, socket one, swap two, refusals zero', async () => {
    // Socket ops ride the BATCHED writer (insertBankLedgerRows), one call per
    // player command however many rows the diff produced: a swap's two rows
    // land atomically (all-or-none, the vault_deposit_all rule), so a DB blip
    // can never strand half a swap as a permanent audit finding. The
    // single-row writer must see NO socket traffic.
    const server = new GameServer();
    const fw = fakeWs();
    const s = joinLedger(server, fw, 'Ledgersock');
    const pid = s.pid;
    const sim = server.sim as any;
    bringBankerToPlayer(sim, pid);
    const meta = sim.players.get(pid);
    meta.copper = 1000000; // exactly the first socket price (src/sim/bank.ts)
    sim.addItem('linen_pouch', 1, pid);
    sim.addItem('burlap_reagent_pouch', 1, pid);
    insertRowsMock.mockClear();

    // 1) the unlock: ONE batch of ONE copper-only row at the negated table
    // price, with the slot-ladder bystander stamp (purchasedSlots is 0 here).
    send(server, s, { cmd: 'bank_unlock_socket' });
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(1);
    expect(insertRowsMock.mock.calls[0][0]).toEqual([
      {
        realm: REALM,
        characterId: 42,
        accountId: 7,
        op: 'unlock_socket',
        itemId: null,
        count: null,
        instance: null,
        copperDelta: -1000000,
        purchasedSlotsAfter: 0,
        container: 'personal',
        containerId: null,
      },
    ]);

    // 2) socketing a carried bag: ONE batch of ONE socket_bag row.
    send(server, s, { cmd: 'bank_socket_bag', item: 'linen_pouch' });
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(2);
    expect(insertRowsMock.mock.calls[1][0]).toHaveLength(1);
    expect(insertRowsMock.mock.calls[1][0][0]).toMatchObject({
      op: 'socket_bag',
      itemId: 'linen_pouch',
      count: 1,
      copperDelta: 0,
      container: 'personal',
    });

    // 3) a swap into the occupied socket 0: ONE batch of exactly TWO rows,
    // the displaced bag's unsocket_bag first, then the incoming socket_bag.
    send(server, s, { cmd: 'bank_socket_bag', item: 'burlap_reagent_pouch', socket: 0 });
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(3);
    const swapRows = insertRowsMock.mock.calls[2][0];
    expect(swapRows).toHaveLength(2);
    expect(swapRows[0]).toMatchObject({ op: 'unsocket_bag', itemId: 'linen_pouch', count: 1 });
    expect(swapRows[1]).toMatchObject({
      op: 'socket_bag',
      itemId: 'burlap_reagent_pouch',
      count: 1,
    });

    // 4) refusals write nothing: an unaffordable unlock (copper is spent), an
    // unsocket of an empty socket, and socketing into a locked index.
    send(server, s, { cmd: 'bank_unlock_socket' });
    send(server, s, { cmd: 'bank_unsocket_bag', socket: 3 });
    send(server, s, { cmd: 'bank_socket_bag', item: 'linen_pouch', socket: 2 });
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(3);

    // 5) the real unsocket: ONE batch of ONE unsocket_bag row.
    send(server, s, { cmd: 'bank_unsocket_bag', socket: 0 });
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(4);
    expect(insertRowsMock.mock.calls[3][0]).toHaveLength(1);
    expect(insertRowsMock.mock.calls[3][0][0]).toMatchObject({
      op: 'unsocket_bag',
      itemId: 'burlap_reagent_pouch',
      count: 1,
    });
    // ...and the single-row writer carried NOTHING this whole test: only
    // socket commands ran, so an exact zero distinguishes "no socket traffic
    // on the single-row path" from a scan over an accidentally empty log
    // (beforeEach cleared the mock before the first send).
    expect(insertMock).toHaveBeenCalledTimes(0);
  });

  it('a refused op away from every banker writes zero rows', async () => {
    const server = new GameServer();
    const fw = fakeWs();
    const s = joinLedger(server, fw, 'Ledgerc');
    const pid = s.pid;
    const sim = server.sim as any;
    const banker = bringBankerToPlayer(sim, pid);
    const p = sim.entities.get(pid);
    sim.addItem('wolf_fang', 5, pid);

    // Move the only banker far away: the proximity gate refuses and bankInfoFor
    // returns null on both sides, so the diff is empty and nothing is written.
    banker.pos = { x: p.pos.x + 1000, y: p.pos.y, z: p.pos.z + 1000 };
    send(server, s, { cmd: 'bank_deposit', slot: wolfFangIndex(sim, pid), count: 1 });
    await bankLedgerIdle();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('an op refused AT the banker writes zero rows (identical non-null snapshots)', async () => {
    // The other refusal arm: the player IS at the banker, so bankInfoFor is
    // non-null on both sides, and the refusal must surface as an empty diff.
    const server = new GameServer();
    const fw = fakeWs();
    const s = joinLedger(server, fw, 'Ledgerd');
    const pid = s.pid;
    const sim = server.sim as any;
    bringBankerToPlayer(sim, pid);

    // Withdrawing from an empty bank slot changes nothing.
    send(server, s, { cmd: 'bank_withdraw', slot: 0, count: 1 });
    await bankLedgerIdle();
    expect(insertMock).not.toHaveBeenCalled();

    // An unaffordable slot purchase changes nothing.
    sim.players.get(pid).copper = 0;
    send(server, s, { cmd: 'bank_buy_slots' });
    await bankLedgerIdle();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('a rejecting insert neither throws into dispatch nor stops the next op writing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = new GameServer();
    const fw = fakeWs();
    const s = joinLedger(server, fw, 'Ledgerd');
    const pid = s.pid;
    const sim = server.sim as any;
    bringBankerToPlayer(sim, pid);
    sim.addItem('wolf_fang', 5, pid);

    // The first insert rejects; the second uses the default resolving impl.
    insertMock.mockRejectedValueOnce(new Error('ledger down'));
    expect(() =>
      send(server, s, { cmd: 'bank_deposit', slot: wolfFangIndex(sim, pid), count: 2 }),
    ).not.toThrow();
    await bankLedgerIdle();

    send(server, s, { cmd: 'bank_withdraw', slot: 0, count: 1 });
    await bankLedgerIdle();

    // Both ops enqueued their insert; the rejection was logged, not thrown.
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledWith('bank_ledger write failed:', expect.any(Error));
    errSpy.mockRestore();
  });

  it('recordBankOp is fire-and-forget: returns void and never blocks the loop', async () => {
    // Directly: a diffed op returns undefined (not a promise).
    expect(
      recordBankOp(
        'deposit',
        { characterId: 42, accountId: 7 },
        info([]),
        info([{ itemId: 'wolf_fang', count: 1 }]),
      ),
    ).toBeUndefined();
    await bankLedgerIdle();
    insertMock.mockClear();

    // Through dispatch, with an insert that stays pending: the deposit still lands
    // in the sim and dispatch returns synchronously (the loop never awaits the
    // write). Release the pending insert afterward so the shared FIFO drains.
    let releasePending: () => void = () => {};
    insertMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releasePending = resolve)),
    );
    const server = new GameServer();
    const fw = fakeWs();
    const s = joinLedger(server, fw, 'Ledgere');
    const pid = s.pid;
    const sim = server.sim as any;
    bringBankerToPlayer(sim, pid);
    sim.addItem('wolf_fang', 3, pid);

    send(server, s, { cmd: 'bank_deposit', slot: wolfFangIndex(sim, pid), count: 2 });
    // The non-blocking proof: send() returned and the sim already applied the
    // deposit, even though the enqueued insert will never settle. dispatch did not
    // await the writer (recordBankOp returned void and the FIFO runs off-loop).
    expect(sim.players.get(pid).bank.inventory).toEqual([{ itemId: 'wolf_fang', count: 2 }]);

    // Let the FIFO microtask fire the enqueued (still-pending) insert, then release
    // it so the shared tail drains rather than poisoning later suites.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(insertMock).toHaveBeenCalledTimes(1);
    releasePending();
    await bankLedgerIdle();
  });
});

// ---------------------------------------------------------------------------
// Materials Vault rows (Bank Storage Phase 2): the pure vault differ and its
// recorder on the shared FIFO tail. VaultInfo fixtures mirror info() above.
// The wire-level integration (dispatch, refusals, owner-only delta) lives in
// tests/vault_wire.test.ts; this block owns the pure diff contract.
// ---------------------------------------------------------------------------

import { diffVaultOp, recordVaultCraftConsume, recordVaultOp } from '../server/bank_ledger';
import {
  noopGameMetricsCounters,
  setGameMetricsCounters,
  type VaultLedgerIncident,
} from '../server/http/game_signals';
import type { VaultInfo } from '../src/world_api';

// perMaterialCap follows VAULT_BASE_CAP + VAULT_UPGRADE_STEP * (upgrades - 1)
// for realism, but diffVaultOp reads only stock, upgrades, and (for a buy)
// nextUpgradeCost.
function vinfo(
  stock: Record<string, number>,
  upgrades = 1,
  nextUpgradeCost: number | null = 50000,
): VaultInfo {
  return {
    stock,
    upgrades,
    perMaterialCap: upgrades > 0 ? 40 + 40 * (upgrades - 1) : 0,
    nextUpgradeCost,
  };
}

describe('diffVaultOp (pure)', () => {
  it('a deposit of a new material yields the deposited count with a null instance', () => {
    expect(diffVaultOp('deposit', vinfo({}), vinfo({ copper_ore: 3 }))).toEqual([
      { itemId: 'copper_ore', count: 3, instance: null, copperDelta: 0, purchasedSlotsAfter: 1 },
    ]);
  });

  it('a deposit onto an existing count records the MOVED amount, not the total', () => {
    // before 2, after 5: the ledger records the delta 3. Conservation replay
    // depends on this: an earlier deposit of 2 plus this 3 nets to the resulting
    // 5, whereas recording 5 here would over-count to 7.
    expect(diffVaultOp('deposit', vinfo({ copper_ore: 2 }), vinfo({ copper_ore: 5 }))).toEqual([
      { itemId: 'copper_ore', count: 3, instance: null, copperDelta: 0, purchasedSlotsAfter: 1 },
    ]);
  });

  it('a partial withdraw records the withdrawn count', () => {
    expect(diffVaultOp('withdraw', vinfo({ copper_ore: 5 }), vinfo({ copper_ore: 3 }))).toEqual([
      { itemId: 'copper_ore', count: 2, instance: null, copperDelta: 0, purchasedSlotsAfter: 1 },
    ]);
  });

  it('a full withdraw records the whole before-count even though the key is DELETED', () => {
    // vaultWithdraw deletes the row rather than leaving a zero, so the after
    // snapshot has no key at all. A differ that walked only the after keys would
    // silently record nothing here and leave the audit short by the whole stack.
    expect(diffVaultOp('withdraw', vinfo({ copper_ore: 7 }), vinfo({}))).toEqual([
      { itemId: 'copper_ore', count: 7, instance: null, copperDelta: 0, purchasedSlotsAfter: 1 },
    ]);
  });

  it('a key that reached zero without being deleted is still a full withdraw', () => {
    expect(diffVaultOp('withdraw', vinfo({ copper_ore: 4 }), vinfo({ copper_ore: 0 }))).toEqual([
      { itemId: 'copper_ore', count: 4, instance: null, copperDelta: 0, purchasedSlotsAfter: 1 },
    ]);
  });

  it('emits multiple changed keys in SORTED id order, not insertion order', () => {
    // Vault stock round-trips through JSONB, whose key order Postgres does not
    // preserve, so an insertion-ordered walk would make row order depend on how
    // the snapshot happened to be built. The `after` fixture is deliberately in
    // reverse-sorted insertion order.
    const after = vinfo({ tin_ore: 2, copper_ore: 4, arcanite_bar: 1 });
    expect(diffVaultOp('deposit', vinfo({}), after).map((d) => d.itemId)).toEqual([
      'arcanite_bar',
      'copper_ore',
      'tin_ore',
    ]);
  });

  it('a deposit ignores keys that FELL and a withdraw ignores keys that ROSE', () => {
    // Direction gating: only the op's own direction produces rows, so a
    // mis-labelled op can never mint a row of the opposite sign.
    expect(diffVaultOp('deposit', vinfo({ copper_ore: 5 }), vinfo({ copper_ore: 2 }))).toEqual([]);
    expect(diffVaultOp('withdraw', vinfo({ copper_ore: 2 }), vinfo({ copper_ore: 5 }))).toEqual([]);
  });

  it('reads a prototype-named key on the missing side as zero, not NaN', () => {
    // A tolerated save can hold dormant stock under an inherited name; a plain
    // index would reach Object.prototype.constructor on the side that lacks the
    // OWN key and make the delta NaN, which fails every > 0 test and silently
    // drops the row.
    const after = vinfo(Object.fromEntries([['constructor', 3]]));
    expect(diffVaultOp('deposit', vinfo({}), after)).toEqual([
      { itemId: 'constructor', count: 3, instance: null, copperDelta: 0, purchasedSlotsAfter: 1 },
    ]);
  });

  it('a non-finite stored count reads as ZERO on its side of the diff', () => {
    // A garbage count from a tampered save would otherwise turn the delta into
    // NaN, which fails both direction gates and silently drops the ledger row;
    // the isFinite arm turns the garbage side into an honest zero instead. The
    // two arms red in OPPOSITE directions if the guard is deleted: the deposit
    // would emit nothing (NaN delta) and the withdraw would emit an Infinity.
    expect(
      diffVaultOp(
        'deposit',
        vinfo({ copper_ore: 'garbage' as unknown as number }),
        vinfo({ copper_ore: 3 }),
      ),
    ).toEqual([
      { itemId: 'copper_ore', count: 3, instance: null, copperDelta: 0, purchasedSlotsAfter: 1 },
    ]);
    expect(diffVaultOp('withdraw', vinfo({ copper_ore: Infinity }), vinfo({}))).toEqual([]);
  });

  it('a buy_slots yields one row: negated BEFORE price, item fields null, rung after', () => {
    // The rung is priced from the BEFORE snapshot's nextUpgradeCost (50000),
    // never the new next price (100000) the after snapshot advertises.
    expect(diffVaultOp('buy_slots', vinfo({}, 1, 50000), vinfo({}, 2, 100000))).toEqual([
      {
        itemId: null,
        count: null,
        instance: null,
        copperDelta: -50000,
        purchasedSlotsAfter: 2,
      },
    ]);
  });

  it('the UNLOCK (rung 0 -> 1) is priced at the 20000 copper table entry', () => {
    expect(diffVaultOp('buy_slots', vinfo({}, 0, 20000), vinfo({}, 1, 50000))).toEqual([
      { itemId: null, count: null, instance: null, copperDelta: -20000, purchasedSlotsAfter: 1 },
    ]);
  });

  it('carries the vault RUNG as purchased_slots_after on item rows too', () => {
    // The column is the container's monotonic ladder analogue, so an item row
    // must report the rung in force, not 0.
    const rows = diffVaultOp('deposit', vinfo({}, 3), vinfo({ iron_ore: 2 }, 3));
    expect(rows).toHaveLength(1);
    expect(rows[0].purchasedSlotsAfter).toBe(3);
  });

  it('the unreachable null-price buy arm emits copperDelta -0, never a clamp or a skip', () => {
    // The comment beside `before.nextUpgradeCost ?? 0` forbids silencing this
    // arm: a null price on a SUCCESSFUL climb is a broken invariant, and the
    // NEGATED zero it produces is exactly what trips the audit's
    // nonnegative_buy_cost alarm (-0 >= 0). A clamp to a positive price or a
    // skipped row here would hide the broken invariant from the audit.
    const rows = diffVaultOp('buy_slots', vinfo({}, 4, null), vinfo({}, 5, null));
    expect(rows).toEqual([
      { itemId: null, count: null, instance: null, copperDelta: -0, purchasedSlotsAfter: 5 },
    ]);
    expect(Object.is(rows[0].copperDelta, -0)).toBe(true);
  });

  it('identical snapshots (a refused/no-op call) yield no rows', () => {
    const stock = { copper_ore: 4 };
    expect(diffVaultOp('deposit', vinfo(stock), vinfo(stock))).toEqual([]);
    expect(diffVaultOp('withdraw', vinfo(stock), vinfo(stock))).toEqual([]);
    // A buy that did not raise the rung is also a no-op (the purchase cap).
    expect(diffVaultOp('buy_slots', vinfo({}, 5, null), vinfo({}, 5, null))).toEqual([]);
  });

  it('a null snapshot on either side (away from a banker) yields no rows', () => {
    expect(diffVaultOp('deposit', null, vinfo({ copper_ore: 1 }))).toEqual([]);
    expect(diffVaultOp('withdraw', vinfo({ copper_ore: 1 }), null)).toEqual([]);
    expect(diffVaultOp('buy_slots', null, null)).toEqual([]);
  });
});

describe('recordVaultOp (the shared FIFO writer)', () => {
  beforeEach(async () => {
    await bankLedgerIdle();
    insertMock.mockClear();
    insertRowsMock.mockClear();
  });

  it('writes container=vault rows with a null container_id and the caller identity', async () => {
    recordVaultOp(
      'deposit',
      { characterId: 42, accountId: 7 },
      vinfo({}),
      vinfo({ copper_ore: 6 }),
    );
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(1);
    expect(insertRowsMock.mock.calls[0][0]).toEqual([
      {
        realm: REALM,
        characterId: 42,
        accountId: 7,
        op: 'deposit',
        itemId: 'copper_ore',
        count: 6,
        instance: null,
        copperDelta: 0,
        purchasedSlotsAfter: 1,
        container: 'vault',
        containerId: null,
      },
    ]);
    // No counterparty side is stamped: the vault is a personal container, and
    // the audit must SKIP an unrecorded side rather than read it as balanced.
    expect(insertRowsMock.mock.calls[0][0][0]).not.toHaveProperty('counterpartyCopperDelta');
    expect(insertRowsMock.mock.calls[0][0][0]).not.toHaveProperty('counterpartyCount');
    // Never the single-row writer: the vault arm batches (the Phase 03 ruling),
    // and a silent fallback to per-row inserts would re-open the write
    // amplification the batch exists to close.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('batches every changed key into ONE insert, in the differ SORTED order', async () => {
    recordVaultOp(
      'deposit',
      { characterId: 42, accountId: 7 },
      vinfo({}),
      vinfo({ tin_ore: 1, copper_ore: 2 }),
    );
    await bankLedgerIdle();
    // One WRITE for the whole diff (the deposit-all shape): the row order
    // inside the batch is the differ's sorted key union.
    expect(insertRowsMock).toHaveBeenCalledTimes(1);
    expect(insertRowsMock.mock.calls[0][0].map((r) => r.itemId)).toEqual(['copper_ore', 'tin_ore']);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('an empty diff (a refusal) writes nothing', async () => {
    const stock = { copper_ore: 4 };
    recordVaultOp('deposit', { characterId: 42, accountId: 7 }, vinfo(stock), vinfo(stock));
    recordVaultOp('withdraw', { characterId: 42, accountId: 7 }, null, vinfo(stock));
    await bankLedgerIdle();
    expect(insertRowsMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('is fire-and-forget: a rejecting insert never throws and the next op still writes', async () => {
    insertRowsMock.mockRejectedValueOnce(new Error('vault ledger down'));
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      recordVaultOp(
        'deposit',
        { characterId: 42, accountId: 7 },
        vinfo({}),
        vinfo({ iron_ore: 1 }),
      ),
    ).not.toThrow();
    await bankLedgerIdle();
    // The message must NAME the character: the incident metric never carries
    // the id (unbounded label), so this line is the identifying detail the
    // VAULT_LEDGER_INCIDENTS docblock promises an operator.
    expect(errs).toHaveBeenCalled();
    expect(String(errs.mock.calls[0][0])).toContain('vault write failed for character 42');

    // The FIFO survived the rejection: the next op still lands.
    recordVaultOp('deposit', { characterId: 42, accountId: 7 }, vinfo({}), vinfo({ iron_ore: 2 }));
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(2);
    errs.mockRestore();
  });

  it('counts a rejecting insert on the vault ledger incident series', async () => {
    // A rejected insert is a HOLE in a keep-forever audit trail, so it has to
    // reach production alerting and not only stderr: that character's vault
    // will reconcile as a permanent ledger_state_mismatch, and a real dupe
    // investigation would come up clean. Its own series rather than a
    // guild-bank kind, because a guild alert rule must never fire on a
    // personal per-character store.
    const kinds: VaultLedgerIncident[] = [];
    setGameMetricsCounters({
      ...noopGameMetricsCounters,
      vaultLedgerIncident: (kind) => kinds.push(kind),
    });
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    // try/finally, not a trailing restore pair: a failing expect below throws,
    // and a leaked counter sink plus a swallowed console.error would follow this
    // file's later tests around as a silent cross-test contamination.
    try {
      insertRowsMock.mockRejectedValueOnce(new Error('vault ledger down'));
      recordVaultOp(
        'deposit',
        { characterId: 42, accountId: 7 },
        vinfo({}),
        vinfo({ iron_ore: 1 }),
      );
      await bankLedgerIdle();
      // A single-row batch that fails counts ONE incident: the counter is per
      // LOST ROW (the multi-row arm below pins the distinction), and this
      // batch lost one.
      expect(kinds).toEqual(['ledger_write_failed']);

      // A LANDING insert counts nothing. The series means "a hole exists", so a
      // healthy write moving it would make `> 0` alerting useless.
      recordVaultOp(
        'deposit',
        { characterId: 42, accountId: 7 },
        vinfo({}),
        vinfo({ iron_ore: 2 }),
      );
      await bankLedgerIdle();
      expect(kinds).toEqual(['ledger_write_failed']);

      // The PERSONAL bank arm is deliberately still log-only (a recorded
      // follow-up, not an oversight): pinned here so the asymmetry is a decision
      // somebody sees rather than a gap somebody assumes is covered.
      insertMock.mockRejectedValueOnce(new Error('bank ledger down'));
      recordBankOp(
        'deposit',
        { characterId: 42, accountId: 7 },
        info([]),
        info([{ itemId: 'wolf_fang', count: 1 }]),
      );
      await bankLedgerIdle();
      expect(kinds).toEqual(['ledger_write_failed']);

      // A rejected MULTI-ROW batch (the deposit-all shape) counts once per
      // LOST ROW, preserving the per-row phase-02 alert baseline: the series
      // sizes the audit-trail hole, and one increment for a two-row hole
      // would under-read it.
      insertRowsMock.mockRejectedValueOnce(new Error('vault ledger down'));
      recordVaultOp(
        'deposit',
        { characterId: 42, accountId: 7 },
        vinfo({}),
        vinfo({ copper_ore: 2, iron_ore: 1 }),
      );
      await bankLedgerIdle();
      expect(kinds).toEqual(['ledger_write_failed', 'ledger_write_failed', 'ledger_write_failed']);
    } finally {
      setGameMetricsCounters(noopGameMetricsCounters);
      errs.mockRestore();
    }
  });

  it('a synchronously THROWING snapshot never escapes into dispatch and counts the incident', async () => {
    // The outer try/catch is the observer's last line: diffVaultOp reads every
    // stocked count through property access, so a hostile getter on a snapshot
    // can throw SYNCHRONOUSLY, before any insert is enqueued. The dispatch path
    // must survive it, the incident series must see it (this is the second
    // emission site, distinct from the per-insert .catch above), and no row may
    // be written.
    const kinds: VaultLedgerIncident[] = [];
    setGameMetricsCounters({
      ...noopGameMetricsCounters,
      vaultLedgerIncident: (kind) => kinds.push(kind),
    });
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const hostileStock: Record<string, number> = {};
      Object.defineProperty(hostileStock, 'copper_ore', {
        enumerable: true,
        get(): number {
          throw new Error('hostile getter');
        },
      });
      expect(() =>
        recordVaultOp(
          'deposit',
          { characterId: 42, accountId: 7 },
          vinfo(hostileStock),
          vinfo({ copper_ore: 3 }),
        ),
      ).not.toThrow();
      await bankLedgerIdle();
      expect(kinds).toEqual(['ledger_write_failed']);
      expect(insertRowsMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
      // The OUTER arm's message names the character too, and its distinct
      // prefix pins WHICH arm fired (the sync guard, not the per-insert catch).
      expect(errs).toHaveBeenCalled();
      expect(String(errs.mock.calls[0][0])).toContain('recordVaultOp failed for character 42');
    } finally {
      setGameMetricsCounters(noopGameMetricsCounters);
      errs.mockRestore();
    }
  });

  it('the drain budget clamps to a whole-millisecond floor of at least 1', async () => {
    // A fractional setTimeout delay can fire EARLY (the integer-delay note in
    // the deadline test below) and a zero or negative budget would otherwise
    // hand the timer an immediate delay: the clamp gives it a real integer of
    // at least 1. Pin the exact delay the timer receives, which is the only
    // non-flaky way to red on a deleted clamp.
    let releaseInsert: () => void = () => {};
    insertRowsMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseInsert = () => resolve();
        }),
    );
    recordVaultOp('deposit', { characterId: 42, accountId: 7 }, vinfo({}), vinfo({ iron_ore: 1 }));
    // Let the tail actually START the wedged insert before any assertion can
    // throw: the mock body is what assigns releaseInsert, and a sync expect
    // failure before the first await would otherwise leave it the no-op,
    // wedging the module FIFO for every later test in this file.
    await bankLedgerIdle(1);
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      // 2.7 pins the Math.floor half of the clamp (2.7 floors to 2; Math.max
      // alone would hand the timer the fractional 2.7); the other three all
      // reach 1 and pin the Math.max half.
      for (const [budget, expected] of [
        [0.5, 1],
        [0, 1],
        [-30, 1],
        [2.7, 2],
      ] as const) {
        const callsBefore = timeoutSpy.mock.calls.length;
        const drained = bankLedgerIdle(budget);
        // The executor runs synchronously, so the timer registered between the
        // two reads is exactly this call's; nothing can interleave.
        expect(timeoutSpy.mock.calls.slice(callsBefore).map((c) => c[1])).toEqual([expected]);
        await expect(drained).resolves.toBe(false);
      }
    } finally {
      timeoutSpy.mockRestore();
      releaseInsert();
      await bankLedgerIdle();
    }
  });

  it('bankLedgerIdle(deadline) resolves false when the tail outlives the budget', async () => {
    // The shutdown drain's whole point (server/main.ts passes
    // BANK_LEDGER_SHUTDOWN_DRAIN_MS): a database that accepts the connection and
    // never answers must not hold the process past the supervisor's kill grace.
    // The insert below is never resolved WHILE the deadline runs (the wedge the
    // deadline exists for); it is released afterwards rather than left dangling
    // so the module-wide FIFO every other test in this file awaits stays clean.
    let releaseInsert: () => void = () => {};
    insertRowsMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseInsert = () => resolve();
        }),
    );
    recordVaultOp('deposit', { characterId: 42, accountId: 7 }, vinfo({}), vinfo({ iron_ore: 1 }));
    // Integer delay: a fractional setTimeout delay can fire EARLY, which would
    // make a sub-millisecond budget prove nothing.
    await expect(bankLedgerIdle(50)).resolves.toBe(false);
    // The abandoned insert is still in flight, exactly the transient hole the
    // deadline accepts: the drain returned without it landing.
    expect(insertRowsMock).toHaveBeenCalledTimes(1);

    releaseInsert();
    // Now the same finite budget drains cleanly, so `false` above was the
    // deadline firing and not the bounded form always reporting failure.
    await expect(bankLedgerIdle(50)).resolves.toBe(true);
    // And the unbounded form (every other await in this file) reports true.
    await expect(bankLedgerIdle()).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Guild bank rows (Guild Bank Phase 3): the pure guild differ and the shared
// FIFO recorder. GuildBankInfo fixtures mirror the info() helper above.
// ---------------------------------------------------------------------------

import {
  diffGuildBankOp,
  GUILD_BANK_ESCROW_DEFICIT_OP,
  type GuildBankLedgerOp,
  guildCreateFeeDelta,
  recordGuildBankDeltas,
  recordGuildBankEscrowRollback,
} from '../server/bank_ledger';
import type { GuildBankOpDelta } from '../src/sim/guild_bank';
import type { GuildBankInfo } from '../src/world_api';

function ginfo(
  treasury: number,
  slots: GuildBankInfo['slots'] = [],
  purchasedSlots = 0,
  nextExpansionPrice: number | null = 50000,
): GuildBankInfo {
  return {
    treasury,
    slots,
    capacity: 12 + purchasedSlots,
    purchasedSlots,
    nextExpansionPrice,
    canEdit: true,
  };
}

describe('recordVaultCraftConsume (the tick-side event recorder, Phase 04)', () => {
  beforeEach(async () => {
    await bankLedgerIdle();
    insertMock.mockClear();
    insertRowsMock.mockClear();
  });

  it('writes one craft_consume row per take, batched as ONE insert, verbatim from the event', async () => {
    recordVaultCraftConsume([
      {
        who: { characterId: 42, accountId: 7 },
        takes: [
          { itemId: 'copper_ore', count: 4 },
          { itemId: 'tin_ore', count: 1 },
        ],
        upgrades: 2,
      },
    ]);
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(1);
    expect(insertRowsMock.mock.calls[0][0]).toEqual([
      {
        realm: REALM,
        characterId: 42,
        accountId: 7,
        op: 'craft_consume',
        itemId: 'copper_ore',
        count: 4,
        instance: null,
        copperDelta: 0,
        purchasedSlotsAfter: 2,
        container: 'vault',
        containerId: null,
      },
      {
        realm: REALM,
        characterId: 42,
        accountId: 7,
        op: 'craft_consume',
        itemId: 'tin_ore',
        count: 1,
        instance: null,
        copperDelta: 0,
        purchasedSlotsAfter: 2,
        container: 'vault',
        containerId: null,
      },
    ]);
    // The vault discipline holds here too: no counterparty side, never the
    // single-row writer.
    expect(insertRowsMock.mock.calls[0][0][0]).not.toHaveProperty('counterpartyCopperDelta');
    expect(insertRowsMock.mock.calls[0][0][0]).not.toHaveProperty('counterpartyCount');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('an empty batch writes nothing (a pure-carried craft emits no event, but guard it)', async () => {
    recordVaultCraftConsume([]);
    recordVaultCraftConsume([{ who: { characterId: 42, accountId: 7 }, takes: [], upgrades: 1 }]);
    await bankLedgerIdle();
    expect(insertRowsMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('coalesces the whole tick into ONE insert across characters, order preserved (F2)', async () => {
    // Two players complete casts on the same tick: the observer hands both
    // consumptions over together and the recorder issues ONE batched insert,
    // rows in event order, so N crafters cost one round trip, not N.
    recordVaultCraftConsume([
      {
        who: { characterId: 42, accountId: 7 },
        takes: [
          { itemId: 'copper_ore', count: 2 },
          { itemId: 'tin_ore', count: 1 },
        ],
        upgrades: 1,
      },
      {
        who: { characterId: 43, accountId: 8 },
        takes: [{ itemId: 'iron_ore', count: 5 }],
        upgrades: 3,
      },
    ]);
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(1);
    expect(
      insertRowsMock.mock.calls[0][0].map((r) => [
        r.characterId,
        r.itemId,
        r.count,
        r.purchasedSlotsAfter,
      ]),
    ).toEqual([
      [42, 'copper_ore', 2, 1],
      [42, 'tin_ore', 1, 1],
      [43, 'iron_ore', 5, 3],
    ]);
  });

  it('a rejected multi-character batch names EVERY character in one log line', async () => {
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      insertRowsMock.mockRejectedValueOnce(new Error('vault ledger down'));
      recordVaultCraftConsume([
        {
          who: { characterId: 42, accountId: 7 },
          takes: [{ itemId: 'copper_ore', count: 2 }],
          upgrades: 1,
        },
        {
          who: { characterId: 43, accountId: 8 },
          takes: [{ itemId: 'iron_ore', count: 5 }],
          upgrades: 3,
        },
      ]);
      await bankLedgerIdle();
      expect(errs).toHaveBeenCalled();
      expect(String(errs.mock.calls[0][0])).toContain(
        'vault craft-consume write failed for characters 42, 43',
      );
    } finally {
      errs.mockRestore();
    }
  });

  it('shares the module FIFO tail with recordVaultOp, preserving cross-recorder op order', async () => {
    // A withdraw at the banker followed by a craft consumption must land in
    // that order, or the audit replay would see the consumption momentarily
    // exceed the deposited net. The two recorders chain the SAME tail.
    recordVaultOp(
      'deposit',
      { characterId: 42, accountId: 7 },
      vinfo({}),
      vinfo({ copper_ore: 6 }),
    );
    recordVaultCraftConsume([
      {
        who: { characterId: 42, accountId: 7 },
        takes: [{ itemId: 'copper_ore', count: 2 }],
        upgrades: 1,
      },
    ]);
    await bankLedgerIdle();
    expect(insertRowsMock).toHaveBeenCalledTimes(2);
    expect(insertRowsMock.mock.calls[0][0][0]).toMatchObject({ op: 'deposit', count: 6 });
    expect(insertRowsMock.mock.calls[1][0][0]).toMatchObject({ op: 'craft_consume', count: 2 });
  });

  it('a rejected batch counts one incident per LOST ROW and names the character', async () => {
    const kinds: VaultLedgerIncident[] = [];
    setGameMetricsCounters({
      ...noopGameMetricsCounters,
      vaultLedgerIncident: (kind) => kinds.push(kind),
    });
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      insertRowsMock.mockRejectedValueOnce(new Error('vault ledger down'));
      recordVaultCraftConsume([
        {
          who: { characterId: 42, accountId: 7 },
          takes: [
            { itemId: 'copper_ore', count: 2 },
            { itemId: 'tin_ore', count: 1 },
          ],
          upgrades: 1,
        },
      ]);
      await bankLedgerIdle();
      expect(kinds).toEqual(['ledger_write_failed', 'ledger_write_failed']);
      // The DISTINCT prefix pins which recorder lost the rows.
      expect(errs).toHaveBeenCalled();
      expect(String(errs.mock.calls[0][0])).toContain(
        'vault craft-consume write failed for characters 42',
      );
    } finally {
      setGameMetricsCounters(noopGameMetricsCounters);
      errs.mockRestore();
    }
  });

  it('a synchronous throw never escapes into the event pass and sizes the hole it can count', async () => {
    // Unlike recordVaultOp's outer catch (no diff evidence existed), a sync
    // throw here loses REAL event rows. The arm counts one incident per take
    // it can still count (Array.isArray guard) and floors at ONE when the
    // same caller drift that threw also defeats the count.
    const kinds: VaultLedgerIncident[] = [];
    setGameMetricsCounters({
      ...noopGameMetricsCounters,
      vaultLedgerIncident: (kind) => kinds.push(kind),
    });
    const errs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const hostileTakes = {
        map() {
          throw new Error('hostile takes');
        },
      } as unknown as readonly { itemId: string; count: number }[];
      // Floor arm: the only consumption is uncountable, so exactly ONE.
      expect(() =>
        recordVaultCraftConsume([
          { who: { characterId: 42, accountId: 7 }, takes: hostileTakes, upgrades: 1 },
        ]),
      ).not.toThrow();
      await bankLedgerIdle();
      expect(kinds).toEqual(['ledger_write_failed']);
      expect(insertRowsMock).not.toHaveBeenCalled();
      // The OUTER arm's distinct prefix pins which arm fired.
      expect(errs).toHaveBeenCalled();
      expect(String(errs.mock.calls[0][0])).toContain('recordVaultCraftConsume failed');
      // Per-lost-row arm: a countable consumption (two takes) rides in the
      // same batch as the uncountable one that throws, so the two REAL rows
      // it lost are both sized: two incidents, not one.
      kinds.length = 0;
      expect(() =>
        recordVaultCraftConsume([
          {
            who: { characterId: 42, accountId: 7 },
            takes: [
              { itemId: 'copper_ore', count: 2 },
              { itemId: 'tin_ore', count: 1 },
            ],
            upgrades: 1,
          },
          { who: { characterId: 43, accountId: 8 }, takes: hostileTakes, upgrades: 1 },
        ]),
      ).not.toThrow();
      await bankLedgerIdle();
      expect(kinds).toEqual(['ledger_write_failed', 'ledger_write_failed']);
      expect(insertRowsMock).not.toHaveBeenCalled();
    } finally {
      setGameMetricsCounters(noopGameMetricsCounters);
      errs.mockRestore();
    }
  });
});

describe('diffGuildBankOp (pure)', () => {
  it('deposit_gold records the positive treasury delta', () => {
    expect(diffGuildBankOp('deposit_gold', ginfo(1000), ginfo(3500))).toEqual([
      {
        itemId: null,
        count: null,
        instance: null,
        copperDelta: 2500,
        purchasedSlotsBefore: 0,
        purchasedSlotsAfter: 0,
      },
    ]);
  });

  it('withdraw_gold records the negative treasury delta', () => {
    expect(diffGuildBankOp('withdraw_gold', ginfo(3500), ginfo(1000))).toEqual([
      {
        itemId: null,
        count: null,
        instance: null,
        copperDelta: -2500,
        purchasedSlotsBefore: 0,
        purchasedSlotsAfter: 0,
      },
    ]);
  });

  it('a gold op whose treasury moved the WRONG direction records nothing', () => {
    // Direction-checked per op: a mislabeled call can never fabricate a row.
    expect(diffGuildBankOp('deposit_gold', ginfo(3500), ginfo(1000))).toEqual([]);
    expect(diffGuildBankOp('withdraw_gold', ginfo(1000), ginfo(3500))).toEqual([]);
  });

  it('an item deposit/withdraw diffs the book multiset like the personal bank', () => {
    expect(
      diffGuildBankOp('deposit', ginfo(0, []), ginfo(0, [{ itemId: 'wolf_fang', count: 3 }])),
    ).toEqual([
      {
        itemId: 'wolf_fang',
        count: 3,
        instance: null,
        craftedRecipeId: null,
        copperDelta: 0,
        purchasedSlotsBefore: 0,
        purchasedSlotsAfter: 0,
      },
    ]);
    expect(
      diffGuildBankOp(
        'withdraw',
        ginfo(0, [{ itemId: 'wolf_fang', count: 3 }]),
        ginfo(0, [{ itemId: 'wolf_fang', count: 1 }]),
      ),
    ).toEqual([
      {
        itemId: 'wolf_fang',
        count: 2,
        instance: null,
        craftedRecipeId: null,
        copperDelta: 0,
        purchasedSlotsBefore: 0,
        purchasedSlotsAfter: 0,
      },
    ]);
  });

  it('keys crafted and plain copies of one item SEPARATELY (the revert-path contract)', () => {
    // The guild key has three dimensions (itemId, instance, craftedRecipeId):
    // withdrawing the plain copy while a crafted copy sits in the book must
    // record the PLAIN provenance, or the revert would mint provenance the
    // moved copy never had.
    const both = [
      { itemId: 'iron_sword', count: 1, craftedRecipeId: 'smith_iron_sword' },
      { itemId: 'iron_sword', count: 1 },
    ];
    const craftedOnly = [{ itemId: 'iron_sword', count: 1, craftedRecipeId: 'smith_iron_sword' }];
    expect(diffGuildBankOp('withdraw', ginfo(0, both), ginfo(0, craftedOnly))).toEqual([
      {
        itemId: 'iron_sword',
        count: 1,
        instance: null,
        craftedRecipeId: null,
        copperDelta: 0,
        purchasedSlotsBefore: 0,
        purchasedSlotsAfter: 0,
      },
    ]);
  });

  it('pins the sim and server guild-op vocabularies in lockstep (both ways)', () => {
    // GuildBankOpDelta['op'] (src/sim/guild_bank.ts) and GuildBankLedgerOp
    // (server/bank_ledger.ts) redeclare the same five literals (the sim never
    // imports server code). An op added on one side without the other would
    // otherwise compile and silently never revert (or never record).
    type SimOp = GuildBankOpDelta['op'];
    type AssertBothWays = [SimOp] extends [GuildBankLedgerOp]
      ? [GuildBankLedgerOp] extends [SimOp]
        ? true
        : never
      : never;
    const lockstep: AssertBothWays = true;
    expect(lockstep).toBe(true);
  });

  it('item deltas carry the moved slot craft provenance for the revert path', () => {
    // craftedRecipeId is NOT a ledger column (insertBankLedgerRow picks its
    // columns explicitly); it rides the delta so Sim.revertGuildBankDeltas can
    // restore a reverted withdraw byte-identically.
    expect(
      diffGuildBankOp(
        'withdraw',
        ginfo(0, [{ itemId: 'iron_sword', count: 1, craftedRecipeId: 'smith_iron_sword' }]),
        ginfo(0, []),
      ),
    ).toEqual([
      {
        itemId: 'iron_sword',
        count: 1,
        instance: null,
        craftedRecipeId: 'smith_iron_sword',
        copperDelta: 0,
        purchasedSlotsBefore: 0,
        purchasedSlotsAfter: 0,
      },
    ]);
  });

  it('buy_slots negates the BEFORE table price the treasury paid', () => {
    expect(
      diffGuildBankOp('buy_slots', ginfo(60000, [], 24, 25000), ginfo(35000, [], 30, 50000)),
    ).toEqual([
      {
        itemId: null,
        count: null,
        instance: null,
        // ABSOLUTE: the guild escrow log replays a slot op as "raise the
        // ladder to at least 30, but only from 24", never as a relative +6.
        copperDelta: -25000,
        purchasedSlotsBefore: 24,
        purchasedSlotsAfter: 30,
      },
    ]);
  });

  it('open_bank (rung 0) negates the BEFORE table price the officer PURSE paid', () => {
    // The 0 -> 24 opening: the row records the purse copper (the treasury
    // never moved between the snapshots), and the audit's treasury replay
    // excludes the op like create_fee.
    expect(
      diffGuildBankOp('open_bank', ginfo(60000, [], 0, 90000), ginfo(60000, [], 24, 25000)),
    ).toEqual([
      {
        itemId: null,
        count: null,
        instance: null,
        copperDelta: -90000,
        purchasedSlotsBefore: 0,
        purchasedSlotsAfter: 24,
      },
    ]);
  });

  it('ALWAYS sets the ladder before-witness on every guild delta it emits', () => {
    // The escrow log replays slot ops absolutely, so a delta without a before
    // witness would replay onto the wrong base. GameServer carries a defensive
    // `?? 0`; this is the pin that keeps that fallback dead code.
    const cases: ReturnType<typeof diffGuildBankOp>[] = [
      diffGuildBankOp('deposit_gold', ginfo(0), ginfo(1500)),
      diffGuildBankOp('withdraw_gold', ginfo(1500), ginfo(0)),
      diffGuildBankOp('deposit', ginfo(0, []), ginfo(0, [{ itemId: 'wolf_fang', count: 1 }])),
      diffGuildBankOp('withdraw', ginfo(0, [{ itemId: 'wolf_fang', count: 1 }]), ginfo(0, [])),
      diffGuildBankOp('buy_slots', ginfo(60000, [], 24, 25000), ginfo(35000, [], 30, 50000)),
      diffGuildBankOp('open_bank', ginfo(0, [], 0, 90000), ginfo(0, [], 24, 25000)),
    ];
    for (const deltas of cases) {
      expect(deltas.length).toBe(1);
      expect(typeof deltas[0].purchasedSlotsBefore).toBe('number');
    }
  });

  it('identical or null snapshots (refusals) record nothing', () => {
    expect(diffGuildBankOp('deposit_gold', ginfo(500), ginfo(500))).toEqual([]);
    expect(diffGuildBankOp('deposit', null, ginfo(500))).toEqual([]);
    expect(diffGuildBankOp('withdraw', ginfo(500), null)).toEqual([]);
    expect(diffGuildBankOp('buy_slots', ginfo(500, [], 30), ginfo(500, [], 30))).toEqual([]);
    expect(diffGuildBankOp('open_bank', ginfo(500, [], 0), ginfo(500, [], 0))).toEqual([]);
    // The ITEM arms under identical non-null snapshots: exactly the shape a
    // plain MEMBER's refused deposit/withdraw takes since the v0.35 read-only
    // view (the membership-gated read answers, the op refuses rank-side and
    // moves nothing), so no ledger row and no dirty mark may come of it.
    const slot = { itemId: 'wolf_fang', count: 3 };
    expect(diffGuildBankOp('deposit', ginfo(500, [slot], 30), ginfo(500, [slot], 30))).toEqual([]);
    expect(diffGuildBankOp('withdraw', ginfo(500, [slot], 30), ginfo(500, [slot], 30))).toEqual([]);
  });
});

describe('recordGuildBankDeltas + guildCreateFeeDelta (the FIFO writer)', () => {
  beforeEach(() => {
    insertMock.mockClear();
    insertMock.mockResolvedValue(undefined);
  });

  it('writes container=guild rows with the guild id and the caller identity', async () => {
    recordGuildBankDeltas(
      'deposit_gold',
      { characterId: 42, accountId: 7 },
      913,
      diffGuildBankOp('deposit_gold', ginfo(0), ginfo(1500)),
    );
    await bankLedgerIdle();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      realm: REALM,
      characterId: 42,
      accountId: 7,
      op: 'deposit_gold',
      itemId: null,
      count: null,
      instance: null,
      copperDelta: 1500,
      purchasedSlotsAfter: 0,
      container: 'guild',
      containerId: 913,
      // The differ sees only the BOOK, so an unstamped delta carries no
      // counterparty side and the columns bind NULL. The stamp is the dispatch
      // observer's job (server/game.ts runGuildBankOp), pinned end to end in
      // tests/bank_counterparty.test.ts.
      counterpartyCopperDelta: null,
      counterpartyCount: null,
    });
  });

  it('the create_fee row negates the charged purse copper with zero slots', async () => {
    recordGuildBankDeltas('create_fee', { characterId: 42, accountId: 7 }, 913, [
      guildCreateFeeDelta(100000, -100000),
    ]);
    await bankLedgerIdle();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      op: 'create_fee',
      copperDelta: -100000,
      purchasedSlotsAfter: 0,
      container: 'guild',
      containerId: 913,
      // The counterparty IS the founder's purse and it paid exactly the
      // recorded fee, so the two halves plus the fee's burn sum to zero.
      counterpartyCopperDelta: -100000,
      counterpartyCount: 0,
    });
  });

  it('an empty delta list (a refusal) writes nothing', async () => {
    recordGuildBankDeltas('withdraw', { characterId: 1, accountId: 1 }, 913, []);
    await bankLedgerIdle();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('records ONE aggregate anomaly row per rollback, with SIGNED direction', async () => {
    // One row per EVENT, never per delta: the log holds up to
    // GUILD_BANK_UNFLUSHED_OP_CAP entries and bank_ledger is keep-forever, so
    // per-delta rows are an unbounded write amplifier on a table nothing prunes.
    const gold = (copperDelta: number) => ({
      op: copperDelta > 0 ? 'deposit_gold' : 'withdraw_gold',
      itemId: null,
      count: null,
      copperDelta,
    });
    recordGuildBankEscrowRollback(
      { characterId: 42, accountId: 7 },
      913,
      [gold(1_000), gold(-40_000)],
      { itemId: null },
    );
    await bankLedgerIdle();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      realm: REALM,
      characterId: 42,
      accountId: 7,
      op: GUILD_BANK_ESCROW_DEFICIT_OP,
      itemId: null,
      count: null,
      instance: null,
      // NEGATIVE: the discarded work was taking copper OUT of the book, which
      // is the shape that would have minted had it been allowed to commit. An
      // abandoned DEPOSIT reads positive, so the two are distinguishable.
      copperDelta: -39_000,
      purchasedSlotsAfter: 0,
      container: 'guild',
      containerId: 913,
      // Mirrored from the acting character's side: the discarded work would
      // have moved 39_000 INTO that purse, which is the direction an operator
      // reads first. Derived from the discarded op log, not snapshotted (the
      // ops are long gone), so it is a report and takes no part in the audit's
      // per-op balance identity.
      counterpartyCopperDelta: 39_000,
      counterpartyCount: null,
    });
  });

  it('signs the ITEM movement the same way, so a mint and a loss differ', async () => {
    const item = (op: 'deposit' | 'withdraw', count: number) => ({
      op,
      itemId: 'wolf_fang',
      count,
      copperDelta: 0,
    });
    recordGuildBankEscrowRollback({ characterId: 42, accountId: 7 }, 913, [item('withdraw', 4)], {
      itemId: 'wolf_fang',
    });
    recordGuildBankEscrowRollback({ characterId: 42, accountId: 7 }, 913, [item('deposit', 4)], {
      itemId: 'wolf_fang',
    });
    await bankLedgerIdle();
    const counts = insertMock.mock.calls.map(
      (c) => (c[0] as unknown as { count: number | null }).count,
    );
    expect(counts).toEqual([-4, 4]);
  });

  it('is fire-and-forget: returns void and a rejecting insert never throws', async () => {
    insertMock.mockRejectedValueOnce(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      recordGuildBankDeltas('deposit', { characterId: 1, accountId: 1 }, 913, [
        {
          itemId: 'wolf_fang',
          count: 1,
          instance: null,
          copperDelta: 0,
          purchasedSlotsBefore: 0,
          purchasedSlotsAfter: 0,
        },
      ]),
    ).toBeUndefined();
    await bankLedgerIdle();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    // The chain survives: the next write still lands in order.
    recordGuildBankDeltas('deposit', { characterId: 1, accountId: 1 }, 913, [
      {
        itemId: 'wolf_fang',
        count: 2,
        instance: null,
        copperDelta: 0,
        purchasedSlotsBefore: 0,
        purchasedSlotsAfter: 0,
      },
    ]);
    await bankLedgerIdle();
    expect(insertMock).toHaveBeenCalledTimes(2);
  });
});
