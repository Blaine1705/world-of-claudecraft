import { describe, expect, it, vi } from 'vitest';
import type { BankLedgerAdmission } from '../../server/bank_ledger_admission';
import {
  BANK_VAULT_LEDGER_ACCOUNT_IDLE_TTL_SECONDS,
  BANK_VAULT_LEDGER_COMMAND_BURST,
  BANK_VAULT_LEDGER_COMMAND_REFILL_PER_SECOND,
  BANK_VAULT_LEDGER_MAX_ACCOUNT_STATES,
  BANK_VAULT_LEDGER_REALM_ROW_BURST,
  BANK_VAULT_LEDGER_REALM_ROW_REFILL_PER_SECOND,
  BANK_VAULT_LEDGER_ROW_BURST,
  BANK_VAULT_LEDGER_ROW_REFILL_PER_SECOND,
  bankVaultLedgerMaxRows,
  createBankVaultLedgerGuard,
  createBankVaultLedgerGuardCoordinator,
  refundBankVaultLedgerCommand,
  reserveBankVaultLedgerCommand,
  settleBankVaultLedgerCommand,
  VAULT_DEPOSIT_ALL_LEDGER_MAX_ROWS,
} from '../../server/bank_vault_ledger_guard';
import type { BankLedgerRow } from '../../server/db';

function reserveRequired(
  state: ReturnType<typeof createBankVaultLedgerGuard>,
  command: Parameters<typeof reserveBankVaultLedgerCommand>[1],
  nowSec: number,
) {
  const reservation = reserveBankVaultLedgerCommand(state, command, nowSec);
  if (!reservation) throw new Error(`expected ${command} reservation`);
  return reservation;
}

function fakeAdmission() {
  const commits: unknown[][] = [];
  const tryReserve = vi.fn(() => ({
    commit(rows: readonly BankLedgerRow[]) {
      commits.push([...rows]);
      return true;
    },
    cancel: vi.fn(() => true),
    failAfterMutation: vi.fn(),
  }));
  const admission: BankLedgerAdmission = { tryReserve };
  return { admission, tryReserve, commits };
}

const row = {} as BankLedgerRow;

describe('bank and vault retained-ledger guard', () => {
  it('pins account and process budgets to the finite command row shapes', () => {
    expect(BANK_VAULT_LEDGER_COMMAND_BURST).toBe(10);
    expect(BANK_VAULT_LEDGER_COMMAND_REFILL_PER_SECOND).toBe(2);
    expect(BANK_VAULT_LEDGER_ROW_REFILL_PER_SECOND).toBe(4);
    expect(BANK_VAULT_LEDGER_ROW_BURST).toBe(121);
    expect(BANK_VAULT_LEDGER_REALM_ROW_BURST).toBe(242);
    expect(BANK_VAULT_LEDGER_REALM_ROW_REFILL_PER_SECOND).toBe(8);
    expect(BANK_VAULT_LEDGER_ACCOUNT_IDLE_TTL_SECONDS).toBe(60);
    expect(BANK_VAULT_LEDGER_MAX_ACCOUNT_STATES).toBe(4_096);
    expect(BANK_VAULT_LEDGER_ROW_BURST).toBe(
      VAULT_DEPOSIT_ALL_LEDGER_MAX_ROWS + BANK_VAULT_LEDGER_COMMAND_BURST - 1,
    );

    expect(bankVaultLedgerMaxRows('bank_deposit')).toBe(1);
    expect(bankVaultLedgerMaxRows('bank_withdraw')).toBe(1);
    expect(bankVaultLedgerMaxRows('bank_buy_slots')).toBe(1);
    expect(bankVaultLedgerMaxRows('bank_unlock_socket')).toBe(1);
    expect(bankVaultLedgerMaxRows('bank_socket_bag')).toBe(2);
    expect(bankVaultLedgerMaxRows('bank_unsocket_bag')).toBe(1);
    expect(bankVaultLedgerMaxRows('vault_deposit')).toBe(1);
    expect(bankVaultLedgerMaxRows('vault_withdraw')).toBe(1);
    expect(VAULT_DEPOSIT_ALL_LEDGER_MAX_ROWS).toBe(112);
    expect(bankVaultLedgerMaxRows('vault_deposit_all')).toBe(112);
    expect(bankVaultLedgerMaxRows('vault_buy_upgrade')).toBe(1);
  });

  it('admits nine ordinary rows followed immediately by one full legal vault sweep', () => {
    const state = createBankVaultLedgerGuard(0);
    for (let index = 0; index < 9; index++) {
      settleBankVaultLedgerCommand(state, reserveRequired(state, 'bank_deposit', 0), 1);
    }
    settleBankVaultLedgerCommand(state, reserveRequired(state, 'vault_deposit_all', 0), 112);

    expect(state).toEqual({ commandTokens: 0, rowTokens: 0, lastRefillSec: 0 });
    expect(reserveBankVaultLedgerCommand(state, 'bank_deposit', 0)).toBeNull();
  });

  it('charges attempted no-ops, refunds only unused rows, and fully refunds cancellation', () => {
    const state = createBankVaultLedgerGuard(0);
    const noOp = reserveRequired(state, 'bank_socket_bag', 0);
    settleBankVaultLedgerCommand(state, noOp, 0);
    expect(state).toEqual({ commandTokens: 9, rowTokens: 121, lastRefillSec: 0 });

    const cancelled = reserveRequired(state, 'bank_socket_bag', 0);
    refundBankVaultLedgerCommand(state, cancelled);
    expect(state).toEqual({ commandTokens: 9, rowTokens: 121, lastRefillSec: 0 });
    expect(() => refundBankVaultLedgerCommand(state, cancelled)).toThrow(/already settled/i);
  });

  it('refills at no more than two receipts and four account rows per second', () => {
    const state = createBankVaultLedgerGuard(0);
    for (let index = 0; index < 9; index++) {
      settleBankVaultLedgerCommand(state, reserveRequired(state, 'bank_deposit', 0), 1);
    }
    settleBankVaultLedgerCommand(state, reserveRequired(state, 'vault_deposit_all', 0), 112);

    expect(reserveBankVaultLedgerCommand(state, 'bank_socket_bag', 0.25)).toBeNull();
    const swap = reserveRequired(state, 'bank_socket_bag', 0.5);
    settleBankVaultLedgerCommand(state, swap, 2);
    expect(state).toEqual({ commandTokens: 0, rowTokens: 0, lastRefillSec: 0.5 });

    // A regressed clock cannot mint the same refill interval twice.
    expect(reserveBankVaultLedgerCommand(state, 'bank_deposit', 0.25)).toBeNull();
    expect(state.lastRefillSec).toBe(0.5);
  });

  it('keeps account capacity across runtime release and reconnect', () => {
    let now = 0;
    const coordinator = createBankVaultLedgerGuardCoordinator(() => now);
    const inner = fakeAdmission();
    const firstRefusals = vi.fn();
    const first = coordinator.createRuntime(7, inner.admission, firstRefusals);

    for (let index = 0; index < 10; index++) {
      expect(first.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    }
    first.release();

    const reconnectRefusals = vi.fn();
    const reconnect = coordinator.createRuntime(7, inner.admission, reconnectRefusals);
    expect(reconnect.admission.tryReserve(1, 0, 'personal')).toBeNull();
    expect(reconnectRefusals).toHaveBeenCalledWith('account_command', 0);
    expect(inner.tryReserve).toHaveBeenCalledTimes(10);

    now = 0.5;
    expect(reconnect.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    expect(firstRefusals).not.toHaveBeenCalled();
  });

  it('shares one 242-row process burst across accounts and refunds a realm refusal', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const first = fakeAdmission();
    const second = fakeAdmission();
    const third = fakeAdmission();
    const firstRuntime = coordinator.createRuntime(1, first.admission, vi.fn());
    const secondRuntime = coordinator.createRuntime(2, second.admission, vi.fn());
    const thirdRefusals = vi.fn();
    const thirdRuntime = coordinator.createRuntime(3, third.admission, thirdRefusals);

    const fullSweep = Array.from({ length: 112 }, () => row);
    expect(firstRuntime.admission.tryReserve(112, 0, 'vault')?.commit(fullSweep)).toBe(true);
    expect(secondRuntime.admission.tryReserve(112, 0, 'vault')?.commit(fullSweep)).toBe(true);
    expect(coordinator.snapshot().realmRowTokens).toBe(18);

    expect(thirdRuntime.admission.tryReserve(112, 0, 'vault')).toBeNull();
    expect(thirdRefusals).toHaveBeenCalledWith('realm_rows', 0);
    expect(third.tryReserve).not.toHaveBeenCalled();

    // The failed realm reservation refunded the account command and row tail.
    expect(thirdRuntime.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    expect(coordinator.snapshot().realmRowTokens).toBe(17);
  });

  it('refills the shared realm budget at exactly eight rows per second', () => {
    let now = 0;
    const coordinator = createBankVaultLedgerGuardCoordinator(() => now);
    const fullSweep = Array.from({ length: 112 }, () => row);
    const first = coordinator.createRuntime(1, fakeAdmission().admission, vi.fn());
    const second = coordinator.createRuntime(2, fakeAdmission().admission, vi.fn());
    const thirdRefusals = vi.fn();
    const third = coordinator.createRuntime(3, fakeAdmission().admission, thirdRefusals);

    expect(first.admission.tryReserve(112, 0, 'vault')?.commit(fullSweep)).toBe(true);
    expect(second.admission.tryReserve(112, 0, 'vault')?.commit(fullSweep)).toBe(true);
    expect(coordinator.snapshot().realmRowTokens).toBe(18);

    now = 11.625;
    expect(third.admission.tryReserve(112, 0, 'vault')).toBeNull();
    expect(thirdRefusals).toHaveBeenLastCalledWith('realm_rows', 11.625);
    expect(coordinator.snapshot().realmRowTokens).toBe(111);

    now = 11.75;
    expect(third.admission.tryReserve(112, 0, 'vault')?.commit(fullSweep)).toBe(true);
    expect(coordinator.snapshot()).toMatchObject({
      realmRowTokens: 0,
      realmLastRefillSec: 11.75,
    });

    // A regressed clock cannot mint the already-accounted refill interval.
    now = 11;
    expect(coordinator.snapshot()).toMatchObject({
      realmRowTokens: 0,
      realmLastRefillSec: 11.75,
    });
  });

  it('hard-bounds account state and admits a waiting runtime after safe idle refill cleanup', () => {
    let now = 0;
    const coordinator = createBankVaultLedgerGuardCoordinator(() => now, {
      maxAccountStates: 2,
      accountIdleTtlSeconds: 60,
    });
    const first = fakeAdmission();
    const second = fakeAdmission();
    const third = fakeAdmission();
    const firstRuntime = coordinator.createRuntime(1, first.admission, vi.fn());
    expect(firstRuntime.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    firstRuntime.release();
    const secondRuntime = coordinator.createRuntime(2, second.admission, vi.fn());
    expect(secondRuntime.admission.tryReserve(1, 0, 'personal')?.cancel()).toBe(true);

    const refusals = vi.fn();
    const waiting = coordinator.createRuntime(3, third.admission, refusals);
    expect(waiting.admission.tryReserve(1, 0, 'personal')).toBeNull();
    expect(refusals).toHaveBeenCalledWith('account_registry', 0);
    expect(coordinator.snapshot().accountStates).toBe(2);

    // At 16 seconds the empty account bucket has naturally refilled to full.
    // Pressure cleanup may now remove it without granting capacity it lacked.
    now = 16;
    expect(waiting.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    expect(coordinator.snapshot().accountStates).toBe(2);
  });

  it('fully refunds a wrapper cancellation that proves Sim never ran', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const runtime = coordinator.createRuntime(1, fakeAdmission().admission, vi.fn());

    expect(runtime.admission.tryReserve(1, 0, 'personal')?.cancel()).toBe(true);
    expect(coordinator.snapshot().realmRowTokens).toBe(242);
    for (let index = 0; index < 10; index++) {
      expect(runtime.admission.tryReserve(1, 0, 'personal')?.commit([])).toBe(true);
    }
    expect(runtime.admission.tryReserve(1, 0, 'personal')).toBeNull();
  });

  it('fully refunds account and realm capacity when inner admission returns null', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const refusedInner: BankLedgerAdmission = { tryReserve: vi.fn(() => null) };
    const refused = coordinator.createRuntime(1, refusedInner, vi.fn());

    expect(refused.admission.tryReserve(112, 0, 'vault')).toBeNull();
    expect(coordinator.snapshot().realmRowTokens).toBe(242);

    const recovered = coordinator.createRuntime(1, fakeAdmission().admission, vi.fn());
    expect(
      recovered.admission
        .tryReserve(112, 0, 'vault')
        ?.commit(Array.from({ length: 112 }, () => row)),
    ).toBe(true);
    for (let index = 0; index < 9; index++) {
      expect(recovered.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    }
    expect(recovered.admission.tryReserve(1, 0, 'personal')).toBeNull();
    expect(coordinator.snapshot().realmRowTokens).toBe(121);
  });

  it('fully refunds account and realm capacity when inner admission throws', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const expected = new Error('inner admission failed');
    const throwingInner: BankLedgerAdmission = {
      tryReserve: vi.fn(() => {
        throw expected;
      }),
    };
    const refused = coordinator.createRuntime(1, throwingInner, vi.fn());

    expect(() => refused.admission.tryReserve(112, 0, 'vault')).toThrow(expected);
    expect(coordinator.snapshot().realmRowTokens).toBe(242);

    const recovered = coordinator.createRuntime(1, fakeAdmission().admission, vi.fn());
    expect(
      recovered.admission
        .tryReserve(112, 0, 'vault')
        ?.commit(Array.from({ length: 112 }, () => row)),
    ).toBe(true);
    for (let index = 0; index < 9; index++) {
      expect(recovered.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    }
    expect(recovered.admission.tryReserve(1, 0, 'personal')).toBeNull();
    expect(coordinator.snapshot().realmRowTokens).toBe(121);
  });

  it('retains worst-case capacity when downstream commit returns false and stays terminal', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const cancel = vi.fn(() => true);
    const failAfterMutation = vi.fn();
    const admission: BankLedgerAdmission = {
      tryReserve: vi.fn(() => ({
        commit: vi.fn(() => false),
        cancel,
        failAfterMutation,
      })),
    };
    const runtime = coordinator.createRuntime(1, admission, vi.fn());
    const handle = runtime.admission.tryReserve(112, 0, 'vault');

    expect(handle?.commit([row])).toBe(false);
    expect(handle?.cancel()).toBe(false);
    handle?.failAfterMutation(new Error('second terminal callback'));
    expect(cancel).not.toHaveBeenCalled();
    expect(failAfterMutation).not.toHaveBeenCalled();
    expect(coordinator.snapshot().realmRowTokens).toBe(130);

    for (let index = 0; index < 9; index++) {
      expect(runtime.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(false);
    }
    expect(runtime.admission.tryReserve(1, 0, 'personal')).toBeNull();
    expect(coordinator.snapshot().realmRowTokens).toBe(121);
  });

  it('retains worst-case capacity when downstream cancel returns false and stays terminal', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const commit = vi.fn(() => true);
    const failAfterMutation = vi.fn();
    const admission: BankLedgerAdmission = {
      tryReserve: vi.fn(() => ({
        commit,
        cancel: vi.fn(() => false),
        failAfterMutation,
      })),
    };
    const runtime = coordinator.createRuntime(1, admission, vi.fn());
    const handle = runtime.admission.tryReserve(112, 0, 'vault');

    expect(handle?.cancel()).toBe(false);
    expect(handle?.commit([row])).toBe(false);
    handle?.failAfterMutation(new Error('second terminal callback'));
    expect(commit).not.toHaveBeenCalled();
    expect(failAfterMutation).not.toHaveBeenCalled();
    expect(coordinator.snapshot().realmRowTokens).toBe(130);

    for (let index = 0; index < 9; index++) {
      expect(runtime.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    }
    expect(runtime.admission.tryReserve(1, 0, 'personal')).toBeNull();
    expect(coordinator.snapshot().realmRowTokens).toBe(121);
  });

  it('charges exact craft rows and refunds proved-no-mutation craft reservations', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const inner = fakeAdmission();
    const runtime = coordinator.createRuntime(1, inner.admission, vi.fn());
    const commit = vi.fn();
    const cancel = vi.fn();

    runtime.reserveVaultConsumption(2, () => ({ commit, cancel }))?.commit();
    expect(commit).toHaveBeenCalledOnce();
    expect(coordinator.snapshot().realmRowTokens).toBe(240);

    runtime.reserveVaultConsumption(3, () => ({ commit, cancel }))?.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(coordinator.snapshot().realmRowTokens).toBe(240);

    expect(runtime.reserveVaultConsumption(1, () => null)).toBeNull();
    expect(coordinator.snapshot().realmRowTokens).toBe(240);

    // Only the committed craft spends a command. A defensive cancel and a
    // journal refusal both prove no mutation and refund fully.
    for (let index = 0; index < 9; index++) {
      expect(runtime.admission.tryReserve(1, 0, 'personal')?.commit([])).toBe(true);
    }
    expect(runtime.admission.tryReserve(1, 0, 'personal')).toBeNull();
  });

  it('does not evict charged state on short TTL or regressed clocks', () => {
    let now = 10;
    const coordinator = createBankVaultLedgerGuardCoordinator(() => now, {
      maxAccountStates: 1,
      accountIdleTtlSeconds: 0,
    });
    const first = coordinator.createRuntime(1, fakeAdmission().admission, vi.fn());
    expect(first.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    first.release();

    now = 9;
    expect(coordinator.pruneIdle()).toBe(0);
    expect(coordinator.snapshot().accountStates).toBe(1);

    const refusals = vi.fn();
    const second = coordinator.createRuntime(2, fakeAdmission().admission, refusals);
    expect(second.admission.tryReserve(1, 0, 'personal')).toBeNull();
    expect(refusals).toHaveBeenCalledWith('account_registry', 9);
  });

  it('retains worst-case capacity after a possible post-mutation failure', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const failAfterMutation = vi.fn();
    const admission: BankLedgerAdmission = {
      tryReserve: vi.fn(() => ({
        commit: vi.fn(() => true),
        cancel: vi.fn(() => true),
        failAfterMutation,
      })),
    };
    const runtime = coordinator.createRuntime(1, admission, vi.fn());
    const handle = runtime.admission.tryReserve(112, 0, 'vault');

    handle?.failAfterMutation(new Error('projection failed'));

    expect(failAfterMutation).toHaveBeenCalledOnce();
    expect(coordinator.snapshot().realmRowTokens).toBe(130);

    // The account also retains the 112-row worst case. Only its remaining nine
    // command and row tokens are available after the ambiguous mutation.
    for (let index = 0; index < 9; index++) {
      expect(runtime.admission.tryReserve(1, 0, 'personal')?.commit([row])).toBe(true);
    }
    expect(runtime.admission.tryReserve(1, 0, 'personal')).toBeNull();
    expect(coordinator.snapshot().realmRowTokens).toBe(121);
  });

  it('keeps exact craft capacity charged when journal commit throws', () => {
    const coordinator = createBankVaultLedgerGuardCoordinator(() => 0);
    const runtime = coordinator.createRuntime(1, fakeAdmission().admission, vi.fn());
    const craft = runtime.reserveVaultConsumption(2, () => ({
      commit: () => {
        throw new Error('journal quarantine');
      },
      cancel: vi.fn(),
    }));

    expect(() => craft?.commit()).toThrow('journal quarantine');
    expect(coordinator.snapshot().realmRowTokens).toBe(240);
  });
});
