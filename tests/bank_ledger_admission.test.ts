import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  insertBankLedgerRow: vi.fn(async () => {}),
  insertBankLedgerRows: vi.fn(async () => {}),
}));
vi.mock('../server/guild_bank_log', () => ({
  bustGuildBankLog: vi.fn(),
  GUILD_BANK_LOG_VISIBLE_OPS: [],
}));
vi.mock('../server/http/game_signals', () => ({
  gameMetricsCounters: () => ({ vaultLedgerIncident: vi.fn() }),
}));
vi.mock('../server/storage_purchases', () => ({
  storagePurchaseInFlight: () => false,
}));
vi.mock('../server/storage_store_cache', () => ({
  nextRungClaudiumPriceFor: () => undefined,
}));

import {
  bankLedgerIdle,
  buildGuildBankLedgerRows,
  buildVaultCraftConsumeLedgerRows,
  recordGuildBankDeltas,
  recordVaultCraftConsume,
} from '../server/bank_ledger';
import {
  type BankLedgerAdmission,
  BankLedgerOutboxAdmission,
} from '../server/bank_ledger_admission';
import { BankLedgerOutbox, BankLedgerOutboxBudget } from '../server/bank_ledger_outbox';
import { type BankSim, dispatchBankCommand } from '../server/bank_wire';
import { type BankLedgerRow, insertBankLedgerRow, insertBankLedgerRows } from '../server/db';
import { REALM } from '../server/realm';
import { dispatchVaultCommand, type VaultSim } from '../server/vault_wire';
import type { BankInfo, VaultInfo } from '../src/world_api';

const WHO = Object.freeze({ characterId: 101, accountId: 202 });
const insertOne = vi.mocked(insertBankLedgerRow);
const insertMany = vi.mocked(insertBankLedgerRows);

function bankInfo(overrides: Partial<BankInfo> = {}): BankInfo {
  return {
    slots: [],
    capacity: 24,
    purchasedSlots: 0,
    bonusSlots: 0,
    nextExpansionCost: 500,
    bonusSources: [],
    socketsUnlocked: 0,
    socketBags: [null, null, null, null],
    nextSocketCost: 1_000_000,
    generalCapacity: 24,
    materialsCapacity: 0,
    generalUsed: 0,
    materialsUsed: 0,
    ...overrides,
  };
}

function vaultInfo(overrides: Partial<VaultInfo> = {}): VaultInfo {
  return {
    stock: {},
    special: [],
    upgrades: 1,
    perMaterialCap: 40,
    nextUpgradeCost: 50_000,
    ...overrides,
  };
}

function ledgerRow(overrides: Partial<BankLedgerRow> = {}): BankLedgerRow {
  return {
    realm: REALM,
    characterId: WHO.characterId,
    accountId: WHO.accountId,
    op: 'deposit',
    itemId: 'peacebloom',
    count: 1,
    instance: null,
    copperDelta: 0,
    purchasedSlotsAfter: 0,
    container: 'personal',
    containerId: null,
    ...overrides,
  };
}

function outboxRig(options: { rows?: number; bytes?: number } = {}) {
  let key = 0;
  const rows = options.rows ?? 200;
  const bytes = options.bytes ?? 64 * 1024;
  const budget = new BankLedgerOutboxBudget({ maxRows: rows, maxEncodedBytes: bytes });
  const outbox = new BankLedgerOutbox({
    owner: { realm: REALM, ...WHO },
    budget,
    limits: { maxRows: rows, maxEncodedBytes: bytes },
    nextBatchKey: () => `wire:${++key}`,
  });
  return { outbox, admission: new BankLedgerOutboxAdmission(outbox), keys: () => key };
}

function bankSim(initial: BankInfo = bankInfo()): BankSim & {
  errors: string[];
  setInfo(info: BankInfo): void;
} {
  let info = initial;
  const errors: string[] = [];
  return {
    errors,
    setInfo(next) {
      info = next;
    },
    ctx: {
      resolve: () => ({ meta: { entityId: 77, bank: { purchasedSlots: info.purchasedSlots } } }),
      error: (_id, text) => void errors.push(text),
    },
    bankInfoFor: () => info,
    bankDeposit: vi.fn(),
    bankWithdraw: vi.fn(),
    bankBuySlots: vi.fn(),
    bankUnlockSocket: vi.fn(),
    bankSocketBag: vi.fn(),
    bankUnsocketBag: vi.fn(),
  };
}

function vaultSim(initial: VaultInfo = vaultInfo()): VaultSim & {
  errors: string[];
  setInfo(info: VaultInfo): void;
} {
  let info = initial;
  const errors: string[] = [];
  return {
    errors,
    setInfo(next) {
      info = next;
    },
    ctx: {
      resolve: () => ({ meta: { entityId: 88 } }),
      error: (_id, text) => void errors.push(text),
    },
    vaultInfoFor: () => info,
    vaultDeposit: vi.fn(),
    vaultWithdraw: vi.fn(),
    vaultDepositAll: vi.fn(),
    vaultBuyUpgrade: vi.fn(),
  };
}

beforeEach(async () => {
  await bankLedgerIdle();
  insertOne.mockClear();
  insertMany.mockClear();
});

describe('BankLedgerOutboxAdmission', () => {
  it('reserves the entire remaining byte allowance and completes each handle once', () => {
    const { outbox, admission, keys } = outboxRig({ rows: 4, bytes: 4_096 });
    const first = admission.tryReserve(2);
    if (!first) throw new Error('expected admission capacity');

    expect(outbox.usage).toEqual({
      queuedRows: 0,
      queuedEncodedBytes: 0,
      reservedRows: 2,
      reservedEncodedBytes: 4_096,
    });
    expect(first.cancel()).toBe(true);
    expect(first.cancel()).toBe(false);

    const second = admission.tryReserve(1);
    if (!second) throw new Error('expected admission capacity');
    expect(second.commit([])).toBe(true);
    expect(second.commit([ledgerRow()])).toBe(false);
    expect(outbox.hasPending).toBe(false);
    expect(keys()).toBe(2);
  });

  it('keeps legacy guild and craft writers byte-shaped with their pure row builders', async () => {
    const craftInput = [
      {
        who: WHO,
        takes: [
          { itemId: 'peacebloom', count: 2 },
          { itemId: 'silverleaf', count: 1 },
        ],
        upgrades: 3,
      },
    ];
    const craftRows = buildVaultCraftConsumeLedgerRows(craftInput);
    recordVaultCraftConsume(craftInput);
    await bankLedgerIdle();
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(insertMany).toHaveBeenCalledWith(craftRows);

    insertMany.mockClear();
    const deltas = [
      {
        itemId: 'linen_cloth',
        count: 4,
        instance: null,
        copperDelta: 0,
        purchasedSlotsAfter: 12,
        counterpartyCopperDelta: 0,
        counterpartyCount: -4,
      },
    ];
    const guildRows = buildGuildBankLedgerRows('deposit', WHO, 303, deltas);
    recordGuildBankDeltas('deposit', WHO, 303, deltas);
    await bankLedgerIdle();
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(insertOne).toHaveBeenCalledWith(guildRows[0]);
  });
});

describe('bank and vault synchronous ledger admission', () => {
  it('refuses capacity and null-admission commands before any Sim mutation', () => {
    const { admission } = outboxRig({ rows: 1 });
    const filled = admission.tryReserve(1);
    if (!filled) throw new Error('expected initial capacity');
    expect(filled.commit([ledgerRow()])).toBe(true);

    const bank = bankSim();
    dispatchBankCommand(bank, WHO, 'bank_deposit', { slot: 0 }, 1, admission);
    expect(bank.bankDeposit).not.toHaveBeenCalled();
    expect(bank.errors).toEqual(['You are busy.']);

    const vault = vaultSim();
    dispatchVaultCommand(vault, WHO, 'vault_deposit', { slot: 0 }, 1, null);
    expect(vault.vaultDeposit).not.toHaveBeenCalled();
    expect(vault.errors).toEqual(['You are busy.']);
  });

  it('pins the worst-case row reservation for every synchronous command', () => {
    const bankRows: number[] = [];
    const vaultRows: number[] = [];
    const collector = (target: number[]): BankLedgerAdmission => ({
      tryReserve: (maxRows) => {
        target.push(maxRows);
        return { commit: () => true, cancel: () => true };
      },
    });
    const bank = bankSim();
    const bankAdmission = collector(bankRows);
    dispatchBankCommand(bank, WHO, 'bank_deposit', { slot: 0 }, 1, bankAdmission);
    dispatchBankCommand(bank, WHO, 'bank_withdraw', { slot: 0 }, 1, bankAdmission);
    dispatchBankCommand(bank, WHO, 'bank_buy_slots', {}, 1, bankAdmission);
    dispatchBankCommand(bank, WHO, 'bank_unlock_socket', {}, 1, bankAdmission);
    dispatchBankCommand(bank, WHO, 'bank_socket_bag', { item: 'mooncloth_bag' }, 1, bankAdmission);
    dispatchBankCommand(bank, WHO, 'bank_unsocket_bag', { socket: 0 }, 1, bankAdmission);

    const vault = vaultSim();
    const vaultAdmission = collector(vaultRows);
    dispatchVaultCommand(vault, WHO, 'vault_deposit', { slot: 0 }, 1, vaultAdmission);
    dispatchVaultCommand(vault, WHO, 'vault_withdraw', { itemId: 'peacebloom' }, 1, vaultAdmission);
    dispatchVaultCommand(vault, WHO, 'vault_deposit_all', {}, 1, vaultAdmission);
    dispatchVaultCommand(vault, WHO, 'vault_buy_upgrade', {}, 1, vaultAdmission);

    expect(bankRows).toEqual([1, 1, 1, 1, 2, 1]);
    expect(vaultRows).toEqual([1, 1, 112, 1]);
  });

  it('cancels the full byte reservation when a Sim mutation throws', () => {
    const bankRig = outboxRig();
    const bank = bankSim();
    vi.mocked(bank.bankDeposit).mockImplementation(() => {
      throw new Error('bank mutation failed');
    });
    expect(() =>
      dispatchBankCommand(bank, WHO, 'bank_deposit', { slot: 0 }, 1, bankRig.admission),
    ).toThrow('bank mutation failed');
    expect(bankRig.outbox.hasPending).toBe(false);
    expect(bankRig.outbox.usage.reservedEncodedBytes).toBe(0);

    const vaultRig = outboxRig();
    const vault = vaultSim();
    vi.mocked(vault.vaultDepositAll).mockImplementation(() => {
      throw new Error('vault mutation failed');
    });
    expect(() =>
      dispatchVaultCommand(vault, WHO, 'vault_deposit_all', {}, 1, vaultRig.admission),
    ).toThrow('vault mutation failed');
    expect(vaultRig.outbox.hasPending).toBe(false);
    expect(vaultRig.outbox.usage.reservedEncodedBytes).toBe(0);
  });

  it('commits a socket swap as one immutable ordered batch without a legacy insert', async () => {
    const { outbox, admission } = outboxRig();
    const before = bankInfo({ socketsUnlocked: 1, socketBags: ['linen_bag', null, null, null] });
    const bank = bankSim(before);
    vi.mocked(bank.bankSocketBag).mockImplementation(() => {
      bank.setInfo(
        bankInfo({ socketsUnlocked: 1, socketBags: ['mooncloth_bag', null, null, null] }),
      );
    });

    dispatchBankCommand(
      bank,
      WHO,
      'bank_socket_bag',
      { item: 'mooncloth_bag', socket: 0 },
      1,
      admission,
    );

    const snapshot = outbox.snapshot();
    expect(snapshot.batches).toHaveLength(1);
    expect(snapshot.batches[0]?.rows.map((row) => [row.op, row.itemId])).toEqual([
      ['unsocket_bag', 'linen_bag'],
      ['socket_bag', 'mooncloth_bag'],
    ]);
    expect(Object.isFrozen(snapshot.batches[0])).toBe(true);
    expect(Object.isFrozen(snapshot.batches[0]?.rows)).toBe(true);
    await bankLedgerIdle();
    expect(insertOne).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();
  });

  it('commits a vault sweep as one sorted batch and releases a no-op reservation', async () => {
    const sweepRig = outboxRig();
    const vault = vaultSim();
    vi.mocked(vault.vaultDepositAll).mockImplementation(() => {
      vault.setInfo(vaultInfo({ stock: { silverleaf: 3, peacebloom: 2 } }));
    });
    dispatchVaultCommand(vault, WHO, 'vault_deposit_all', {}, 1, sweepRig.admission);

    const sweep = sweepRig.outbox.snapshot();
    expect(sweep.batches).toHaveLength(1);
    expect(sweep.batches[0]?.rows.map((row) => [row.itemId, row.count])).toEqual([
      ['peacebloom', 2],
      ['silverleaf', 3],
    ]);

    const noOpRig = outboxRig();
    const bank = bankSim();
    dispatchBankCommand(bank, WHO, 'bank_deposit', { slot: 0 }, 1, noOpRig.admission);
    expect(noOpRig.outbox.usage).toEqual({
      queuedRows: 0,
      queuedEncodedBytes: 0,
      reservedRows: 0,
      reservedEncodedBytes: 0,
    });
    expect(noOpRig.outbox.snapshot().batches).toEqual([]);
    expect(noOpRig.keys()).toBe(1);

    await bankLedgerIdle();
    expect(insertOne).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();
  });
});
