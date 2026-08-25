// Bank Storage phase 11: the Claudium storage purchase flow
// (server/storage_purchases.ts) driven end to end against the REAL sim grant
// command (bankGrantStorageSlots through sim.ctx, the exact production call
// shape) with a hand-rolled host: scripted spend results, an in-memory
// pending-row table with the SQL guards mirrored, a controllable save, and
// an immediate delay so no test ever sleeps on a real timer.
//
// The matrix here is the phase's ordering contract: exactly-once under
// ambiguous retry, the settle-only-after-save rule, the apply-time re-check
// (never partial, never clawback, unresolved surfaces), the per-character
// mutex, the next-login auto-apply, and the refuse-before-money gates.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudiumSpendOutcome, ClaudiumSpendResult } from '../../server/claudium_proxy';
import { AMBIGUITY_HOLD_MAX_MS, WEDGED_HOLD_MAX_MS } from '../../server/storage_ladder_hold';
import type { StoragePurchaseRow } from '../../server/storage_purchase_db';
import {
  configureStoragePurchaseRuntime,
  executeStoragePurchase,
  kickStoragePurchaseRecovery,
  resetStoragePurchasesForTests,
  resumeStoragePurchasesAtLogin,
  type StoragePurchaseHost,
  storagePurchaseInFlight,
} from '../../server/storage_purchases';
import {
  BANK_EXPANSION_PRICES,
  BANK_EXPANSION_SLOTS,
  bankGrantStorageSlots,
} from '../../src/sim/bank';
import { BUILTIN_WORLD } from '../../src/sim/data';
import { Sim } from '../../src/sim/sim';
import type { WorldContent } from '../../src/sim/types';

const GRANT_TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};

const ACCOUNT = 7;
const CHARACTER = 42;

const granted = (over: Partial<ClaudiumSpendResult> = {}): ClaudiumSpendResult => ({
  granted: true,
  balance: 900,
  costClaudium: 100,
  reason: null,
  ...over,
});
const unavailable = (): ClaudiumSpendResult => ({
  granted: false,
  balance: null,
  costClaudium: null,
  reason: 'unavailable',
});
/** The outage shape: the spend PROVABLY never reached the service, so no debit
 *  is possible (a connect refusal, not a timeout). */
const neverReached = (): ClaudiumSpendOutcome => ({
  result: unavailable(),
  neverReached: true,
});

interface FakeRow extends StoragePurchaseRow {
  resolvedAt: number | null;
}

// The in-memory stand-in for storage_purchase_db, mirroring the SQL guards
// exactly: unique key on begin, settle only FROM pending, reopen only FROM
// refused, pendingFor filters status pending.
function makeFakeDb() {
  const rows = new Map<string, FakeRow>();
  let nextId = 1;
  return {
    rows,
    begin: vi.fn(
      async (row: {
        realm: string;
        accountId: number;
        characterId: number;
        itemId: string;
        expectedCostClaudium: number;
        idempotencyKey: string;
      }) => {
        const existing = rows.get(row.idempotencyKey);
        if (existing) return { inserted: false, existing: { ...existing } };
        const fresh: FakeRow = {
          id: nextId++,
          realm: row.realm,
          accountId: row.accountId,
          characterId: row.characterId,
          itemId: row.itemId,
          expectedCostClaudium: row.expectedCostClaudium,
          idempotencyKey: row.idempotencyKey,
          status: 'pending',
          resolvedAt: null,
        };
        rows.set(row.idempotencyKey, fresh);
        return { inserted: true, existing: { ...fresh } };
      },
    ),
    byKey: vi.fn(async (key: string) => {
      const row = rows.get(key);
      return row ? { ...row } : null;
    }),
    settle: vi.fn(async (key: string, status: 'applied' | 'refused' | 'unresolved') => {
      const row = rows.get(key);
      if (!row || row.status !== 'pending') return false;
      row.status = status;
      row.resolvedAt = 1;
      return true;
    }),
    reopen: vi.fn(async (key: string) => {
      const row = rows.get(key);
      if (!row || row.status !== 'refused') return false;
      row.status = 'pending';
      row.resolvedAt = null;
      return true;
    }),
    pendingFor: vi.fn(async (characterId: number) =>
      [...rows.values()]
        .filter((r) => r.characterId === characterId && r.status === 'pending')
        .map((r) => ({ ...r })),
    ),
  };
}

function makeHarness(seed = 42) {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: false, world: GRANT_TEST_WORLD });
  const meta = sim.meta(sim.playerId)!;
  const db = makeFakeDb();
  type ScriptedSpend =
    | ClaudiumSpendResult
    | ClaudiumSpendOutcome
    | (() =>
        | ClaudiumSpendResult
        | ClaudiumSpendOutcome
        | Promise<ClaudiumSpendResult | ClaudiumSpendOutcome>);
  const spendResults: ScriptedSpend[] = [];
  // The parameter is DECLARED so mock.calls is typed: a fingerprint pin has to
  // read the request object, and an untyped vi.fn() gives it an empty tuple.
  // A bare result is normalized to the REACHED outcome, so only a case that
  // deliberately scripts neverReached() exercises the transport arm.
  const spend = vi.fn(async (_input: Parameters<StoragePurchaseHost['spend']>[0]) => {
    const next = spendResults.shift();
    if (next === undefined) throw new Error('spend called with no scripted result');
    const value = typeof next === 'function' ? await next() : next;
    return 'result' in value ? value : { result: value, neverReached: false };
  });
  const state = { live: true, saveResult: true as boolean | Promise<boolean> };
  const saveCharacter = vi.fn(async () => state.saveResult);
  const warn = vi.fn();
  const host: StoragePurchaseHost = {
    resolveLiveCharacter: (accountId) =>
      state.live && accountId === ACCOUNT ? { characterId: CHARACTER, pid: sim.playerId } : null,
    grant: (pid, skuId, key, dryRun) => bankGrantStorageSlots(sim.ctx, pid, skuId, key, { dryRun }),
    recordGrantLedger: vi.fn(),
    saveCharacter: (characterId) =>
      characterId === CHARACTER ? saveCharacter() : Promise.resolve(false),
    spend,
    db,
    realm: 'testrealm',
    delay: async () => {},
    warn,
  };
  return { sim, meta, db, spend, spendResults, state, saveCharacter, warn, host };
}

// Await full quiescence of the fire-and-forget chains (save -> settle, the
// background settle task): condition-polled, never a real sleep.
async function waitFor(cond: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    if (!cond()) throw new Error('not yet');
  });
}

beforeEach(() => {
  resetStoragePurchasesForTests();
});
afterEach(() => {
  resetStoragePurchasesForTests();
});

describe('executeStoragePurchase: the happy path and the ordering contract', () => {
  it('applies a granted rung once, records the ledger, and settles only after the save', async () => {
    const h = makeHarness();
    let saveResolve!: (v: boolean) => void;
    h.state.saveResult = new Promise<boolean>((r) => {
      saveResolve = r;
    });
    h.spendResults.push(granted());
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-1',
    });
    expect(res).toEqual({ granted: true, balance: 900, costClaudium: 100, reason: null });
    expect(h.meta.bank.purchasedSlots).toBe(6);
    expect(h.meta.bank.appliedStorageKeys).toEqual(['key-1']);
    // Neither the applied settle NOR the claudium ledger row may land until
    // the character save resolves (the durability rule: a fenced-out apply
    // must leave no audit row and no applied mark). The GOLD rail stays shut
    // across that window: a gold rung landing here would insert its ledger
    // row ahead of the claudium one and read as purchased_regression.
    expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
    expect(h.db.rows.get('key-1')?.status).toBe('pending');
    expect(h.host.recordGrantLedger).not.toHaveBeenCalled();
    saveResolve(true);
    await waitFor(() => h.db.rows.get('key-1')?.status === 'applied');
    // ... and reopens once the audit row is durable.
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
    expect(h.host.recordGrantLedger).toHaveBeenCalledWith(
      { characterId: CHARACTER, accountId: ACCOUNT },
      'strongbox_rung_01',
      0,
      6,
    );
    // The pending row was durable BEFORE the money moved.
    expect(h.db.begin.mock.invocationCallOrder[0]).toBeLessThan(
      h.spend.mock.invocationCallOrder[0],
    );
  });

  it('a failed save leaves the row pending, and a fresh login replays to exactly one durable apply', async () => {
    const h = makeHarness();
    h.state.saveResult = false;
    h.spendResults.push(granted());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-2',
    });
    await waitFor(() => h.saveCharacter.mock.calls.length === 1);
    expect(h.db.rows.get('key-2')?.status).toBe('pending');
    // An apply that never proved durable writes NO audit row: the durable
    // replay below writes exactly one (the verify round's over-count fix).
    expect(h.host.recordGrantLedger).not.toHaveBeenCalled();
    resetStoragePurchasesForTests();
    // The process dies before any save: the reloaded state has neither the
    // slots nor the key (a FRESH sim from the same seed), and the login
    // recovery retries the SAME key; the service replays already_granted
    // with no second debit, and the grant applies exactly once against the
    // durable state.
    const h2 = makeHarness();
    for (const [k, v] of h.db.rows) h2.db.rows.set(k, { ...v });
    h2.spendResults.push(granted({ reason: 'already_granted' }));
    await resumeStoragePurchasesAtLogin(h2.host, CHARACTER);
    expect(h2.meta.bank.purchasedSlots).toBe(6);
    expect(h2.meta.bank.appliedStorageKeys).toEqual(['key-2']);
    await waitFor(() => h2.db.rows.get('key-2')?.status === 'applied');
    expect(h2.spend).toHaveBeenCalledTimes(1);
    // Exactly ONE audit row across both attempts: the durable apply's.
    expect(h2.host.recordGrantLedger).toHaveBeenCalledTimes(1);
  });

  it('the KNOWN audit gap: a save-refused apply that later becomes durable settles with no ledger row', async () => {
    // Pins the bounded gap the module header records, so it cannot silently
    // widen and a future "fix" cannot quietly start writing a SECOND row.
    // saveCharacter returning false is ORDINARY concurrency, not a failure:
    // server/game.ts returns false when the guild-book half of the transaction
    // is escrow-refused, and the periodic autosave persists the same blob a
    // moment later. The slots and the key are then durable while the row is
    // still pending, so the replay settles it 'applied' and no claudium
    // bank_ledger row is ever written for that purchase.
    const h = makeHarness();
    h.state.saveResult = false;
    h.spendResults.push(granted());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-audit-gap',
    });
    await waitFor(() => h.saveCharacter.mock.calls.length === 1);
    expect(h.db.rows.get('key-audit-gap')?.status).toBe('pending');
    expect(h.host.recordGrantLedger).not.toHaveBeenCalled();
    // The slots and the key ARE in the live blob; the ordinary save that lands
    // next makes them durable. Unlike the fresh-sim case above, this harness
    // KEEPS that state, which is exactly what distinguishes the two.
    expect(h.meta.bank.purchasedSlots).toBe(6);
    expect(h.meta.bank.appliedStorageKeys).toEqual(['key-audit-gap']);
    h.state.saveResult = true;

    await resumeStoragePurchasesAtLogin(h.host, CHARACTER);
    await waitFor(() => h.db.rows.get('key-audit-gap')?.status === 'applied');
    // Exactly-once still holds and no money moved twice: the replay never
    // reached the service, because the key was already in the blob.
    expect(h.meta.bank.purchasedSlots).toBe(6);
    expect(h.spend).toHaveBeenCalledTimes(1);
    // THE GAP, pinned: the purchase is applied and paid, with zero audit rows.
    expect(h.host.recordGrantLedger).not.toHaveBeenCalled();
  });

  it('settleDefinitive already_applied re-settles behind a save and writes NO second ledger row', async () => {
    // The defense-in-depth arm behind the mutex: the service answers granted
    // for a key whose slots are already in the blob. No production caller
    // chain reaches it today (the pre-spend dry run and the login recovery
    // both catch an applied key earlier, and the per-character mutex keeps a
    // second flow off the same key), so it is driven straight through the
    // injected host. A mutation audit found it completely uncovered, which
    // matters because it is one of the four sites that could write a claudium
    // audit row: this pins that it writes NONE, so exactly-once on the ledger
    // cannot be broken here without a test going red.
    const h = makeHarness();
    h.spendResults.push(granted());
    const realGrant = h.host.grant;
    let calls = 0;
    h.host.grant = ((pid, sku, key, dryRun) => {
      calls += 1;
      // Call 1 is the pre-spend dry run (let it pass); call 2 is the real
      // apply, which reports the slots already landed under this key.
      if (calls === 2) return { status: 'already_applied' } as ReturnType<typeof realGrant>;
      return realGrant(pid, sku, key, dryRun);
    }) as typeof h.host.grant;

    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-already-applied-arm',
    });
    // Granted stays true (the money moved) and the replay marker is surfaced.
    expect(res.granted).toBe(true);
    expect(res.reason).toBe('already_granted');
    // The row settles only behind a confirmed save, and NO audit row is
    // written: the one that counted rode the original apply.
    await waitFor(() => h.db.rows.get('key-already-applied-arm')?.status === 'applied');
    expect(h.saveCharacter).toHaveBeenCalled();
    expect(h.host.recordGrantLedger).not.toHaveBeenCalled();
    // Nothing was clamped or double-applied: the arm mutates no state.
    expect(h.meta.bank.purchasedSlots).toBe(0);
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
  });

  it('an OPEN row whose ladder position moved answers ambiguously, never an innocent refusal', async () => {
    // A pending prior means this key may already have taken the money, so the
    // dry run's verdict about the CURRENT ladder must not be reported as if
    // the purchase were fresh. Before this guard the caller heard
    // not_next_rung, which reads as "nothing happened".
    const h = makeHarness();
    await h.db.begin({
      realm: 'testrealm',
      accountId: ACCOUNT,
      characterId: CHARACTER,
      itemId: 'strongbox_rung_02',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-open-moved',
    });
    // The ladder moved under the open row: rung_02 is no longer next.
    // (Nothing applied yet, so position 0 is next and rung_02 wants 1.)
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_02',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-open-moved',
    });
    expect(res.reason).toBe('unavailable');
    expect(res.granted).toBe(false);
    // Nothing spent from the request path, and the row is left open for
    // recovery to settle against what actually happened to the money.
    expect(h.spend).not.toHaveBeenCalled();
    expect(h.db.rows.get('key-open-moved')?.status).toBe('pending');
    expect(h.meta.bank.purchasedSlots).toBe(0);
  });

  it('an OPEN row that no longer FITS answers ambiguously too, not an innocent does_not_fit', async () => {
    // The ceiling gate's half of the same diversion, and the one the CLIENT
    // leans on hardest: does_not_fit is in the client's definitive-refusal set
    // (src/ui/store_purchase_intent.ts), so the client CLOSES its intent on it
    // and the next click mints a fresh key. That is only safe because this arm
    // guarantees a does_not_fit can never be answered over a pending row. Delete
    // the diversion here and the client silently starts minting second keys over
    // live debits, with every other test still green.
    const h = makeHarness();
    // The ladder is already full, so any grant overshoots the ceiling.
    h.meta.bank.purchasedSlots = BANK_EXPANSION_PRICES.length * BANK_EXPANSION_SLOTS;
    await h.db.begin({
      realm: 'testrealm',
      accountId: ACCOUNT,
      characterId: CHARACTER,
      itemId: 'strongbox_charter_1',
      expectedCostClaudium: 500,
      idempotencyKey: 'key-open-nofit',
    });
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_charter_1',
      expectedCostClaudium: 500,
      idempotencyKey: 'key-open-nofit',
    });
    expect(res.reason).toBe('unavailable');
    expect(res.reason).not.toBe('does_not_fit');
    expect(res.granted).toBe(false);
    expect(h.spend).not.toHaveBeenCalled();
    expect(h.db.rows.get('key-open-nofit')?.status).toBe('pending');
  });

  it('a FRESH purchase that does not fit still gets the innocent does_not_fit', async () => {
    // The negative arm, and what makes the client's definitive classification
    // correct: with NO prior row under this key nothing can be behind it, so the
    // honest specific token is owed. A guard that answered every overshoot with
    // unavailable would pass the case above and fail here.
    const h = makeHarness();
    h.meta.bank.purchasedSlots = BANK_EXPANSION_PRICES.length * BANK_EXPANSION_SLOTS;
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_charter_1',
      expectedCostClaudium: 500,
      idempotencyKey: 'key-fresh-nofit',
    });
    expect(res.reason).toBe('does_not_fit');
    expect(res.granted).toBe(false);
    expect(h.spend).not.toHaveBeenCalled();
  });

  it('a FRESH purchase at a wrong ladder position still gets the innocent token', async () => {
    // The negative arm: without a prior row nothing is owed, so the honest
    // answer is the specific refusal. A guard that answered every wrong-rung
    // request with unavailable would pass the case above and fail here.
    const h = makeHarness();
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_02',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-fresh-wrongrung',
    });
    expect(res.reason).toBe('not_next_rung');
    expect(h.db.rows.has('key-fresh-wrongrung')).toBe(false);
    expect(h.spend).not.toHaveBeenCalled();
  });

  it('the recovery replay re-sends the EXACT fingerprint, not just the key', async () => {
    // The service binds item + kind + cost to the idempotency key, so a replay
    // that drifted on any of them would hit the conflict arm and be read as
    // already_granted with granted false: a paid purchase reported as refused.
    // Pinned as a literal request shape rather than "was called".
    const h = makeHarness();
    h.state.saveResult = false;
    h.spendResults.push(granted());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_charter_1',
      expectedCostClaudium: 500,
      idempotencyKey: 'key-fingerprint',
    });
    await waitFor(() => h.saveCharacter.mock.calls.length === 1);
    expect(h.spend.mock.calls[0][0]).toEqual({
      accountId: ACCOUNT,
      itemId: 'strongbox_charter_1',
      kind: 'storage',
      expectedCostClaudium: 500,
      idempotencyKey: 'key-fingerprint',
    });

    resetStoragePurchasesForTests();
    const h2 = makeHarness();
    for (const [k, v] of h.db.rows) h2.db.rows.set(k, { ...v });
    h2.spendResults.push(granted({ reason: 'already_granted' }));
    await resumeStoragePurchasesAtLogin(h2.host, CHARACTER);
    await waitFor(() => h2.db.rows.get('key-fingerprint')?.status === 'applied');
    // The replay's request is byte-for-byte the original, rebuilt from the
    // persisted row (which is why expected_cost_claudium is stored at all).
    expect(h2.spend.mock.calls[0][0]).toEqual({
      accountId: ACCOUNT,
      itemId: 'strongbox_charter_1',
      kind: 'storage',
      expectedCostClaudium: 500,
      idempotencyKey: 'key-fingerprint',
    });
    expect(h2.meta.bank.purchasedSlots).toBe(12);
  });

  it('the definitive refusal set is EXACTLY the service spend vocabulary', async () => {
    // Six tokens, matching service/src/claudium/spend.ts's declared result
    // type. Pinned as literals rather than through the production constant, so
    // widening the set has to be a deliberate edit here too. 'invalid_request'
    // is deliberately ABSENT: the service emits it only from its admin
    // recovery surface, and treating a token the spend surface cannot return
    // as definitive would settle 'refused' over a live debit if it ever did.
    for (const [reason, definitive] of [
      ['insufficient_balance', true],
      ['unknown_item', true],
      ['already_granted', true],
      ['not_cosmetic', true],
      ['kind_mismatch', true],
      ['price_changed', true],
      ['invalid_request', false],
      ['unavailable', false],
      ['some_future_token', false],
    ] as [string, boolean][]) {
      const h = makeHarness();
      h.spendResults.push({ granted: false, balance: null, costClaudium: null, reason });
      const res = await executeStoragePurchase(h.host, {
        accountId: ACCOUNT,
        itemId: 'strongbox_rung_01',
        expectedCostClaudium: 100,
        idempotencyKey: `key-vocab-${reason}`,
      });
      if (definitive) {
        // Settled terminally, and the caller sees the service's own token.
        await waitFor(() => h.db.rows.get(`key-vocab-${reason}`)?.status === 'refused');
        expect(res.reason).toBe(reason);
      } else {
        // Ambiguous: the row stays pending over a possible debit and the
        // background task inherits the mutex to retry the SAME key.
        expect(res.reason).toBe('unavailable');
        expect(h.db.rows.get(`key-vocab-${reason}`)?.status).toBe('pending');
      }
      resetStoragePurchasesForTests();
    }
  }, 20_000);

  it('a begin-conflict row belonging to ANOTHER purchase is refused, never settled', async () => {
    // byKey saw no row, so a colliding key was inserted between the two reads.
    // settle() and reopen() are keyed by idempotency_key alone, so without the
    // identity recheck on the conflict arm this flow would reopen and spend
    // against someone else's pending purchase.
    const h = makeHarness();
    await h.db.begin({
      realm: 'testrealm',
      accountId: ACCOUNT + 1,
      characterId: CHARACTER + 1,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-collide',
    });
    // Hide it from the pre-read so the flow reaches the begin conflict.
    h.db.byKey.mockResolvedValueOnce(null);
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-collide',
    });
    expect(res.granted).toBe(false);
    expect(res.reason).toBe('already_granted');
    // Nothing spent, and the other purchase's row is untouched.
    expect(h.spend).not.toHaveBeenCalled();
    expect(h.db.rows.get('key-collide')?.status).toBe('pending');
    expect(h.db.rows.get('key-collide')?.accountId).toBe(ACCOUNT + 1);
    expect(h.meta.bank.purchasedSlots).toBe(0);
  });

  it('a fail-closed throw re-kicks recovery, so a possibly-debited row keeps a driver', async () => {
    // The catch arm is the one settle exit that used to release the mutex with
    // nothing left to revisit the row. Make the settle throw AFTER a granted
    // spend: the money may be gone, the row is pending, and the character is
    // still online, so recovery must be re-armed rather than deferred to the
    // next login.
    const h = makeHarness();
    // The original spend, then the recovery's same-key replay (the service
    // answers already_granted with no second debit).
    h.spendResults.push(granted(), granted({ reason: 'already_granted' }));
    // Make the real apply throw, so the failure lands inside the try AFTER the
    // spend: exactly the window where the money may already be gone.
    const realGrant = h.host.grant;
    let calls = 0;
    h.host.grant = ((pid, sku, key, dryRun) => {
      calls += 1;
      if (calls === 2) throw new Error('grant blew up after the spend');
      return realGrant(pid, sku, key, dryRun);
    }) as typeof h.host.grant;
    configureStoragePurchaseRuntime(() => {
      h.host.grant = realGrant;
      return h.host;
    });

    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-failclosed',
    });
    expect(res.reason).toBe('unavailable');
    // The re-kicked scan finds the pending row and converges it against the
    // same key, so the debit ends as applied slots instead of sitting idle.
    await waitFor(() => h.db.rows.get('key-failclosed')?.status === 'applied');
    expect(h.meta.bank.purchasedSlots).toBe(6);
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
  }, 20_000);

  it('a granted:false reply with an unknown or null reason is AMBIGUOUS, never a refusal settle', async () => {
    const h = makeHarness();
    // A malformed 2xx (an interposed proxy, service version skew) coerces to
    // granted:false reason:null; settling that 'refused' could erase a
    // debited purchase. It must retry the same key like 'unavailable'.
    h.spendResults.push(
      { granted: false, balance: null, costClaudium: null, reason: null },
      { granted: false, balance: null, costClaudium: null, reason: 'mystery_token' },
      granted(),
    );
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-mal',
    });
    expect(res.reason).toBe('unavailable');
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
    expect(h.meta.bank.purchasedSlots).toBe(6);
    await waitFor(() => h.db.rows.get('key-mal')?.status === 'applied');
    expect(h.spend).toHaveBeenCalledTimes(3);
  });

  it('a swept refused row re-inserts before the retry spends (the reopen race)', async () => {
    const h = makeHarness();
    h.spendResults.push({
      granted: false,
      balance: 0,
      costClaudium: 100,
      reason: 'insufficient_balance',
    });
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-swept',
    });
    expect(h.db.rows.get('key-swept')?.status).toBe('refused');
    // The retention sweep takes the aged refused row between the byKey read
    // and the reopen: reopen reports false, and the flow must re-insert a
    // pending row before any money can move.
    h.db.reopen.mockImplementationOnce(async (key: string) => {
      h.db.rows.delete(key);
      return false;
    });
    h.spendResults.push(granted());
    const retry = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-swept',
    });
    expect(retry.granted).toBe(true);
    await waitFor(() => h.db.rows.get('key-swept')?.status === 'applied');
    expect(h.meta.bank.purchasedSlots).toBe(6);
    // The re-insert provably preceded the retry's spend: three begin calls
    // (the first purchase, the retry's conflict read, the post-reopen-miss
    // re-insert), the last ordered before the retry's spend.
    const beginOrders = h.db.begin.mock.invocationCallOrder;
    expect(beginOrders.length).toBe(3);
    expect(beginOrders[2]).toBeLessThan(h.spend.mock.invocationCallOrder[1]);
  });

  it('resolves an ambiguous outcome by retrying the SAME key in the background, applying once', async () => {
    const h = makeHarness();
    h.spendResults.push(unavailable(), granted());
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-3',
    });
    // The client sees unavailable; the mutex stays held by the background
    // settle task until the service answers definitively.
    expect(res.reason).toBe('unavailable');
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
    expect(h.meta.bank.purchasedSlots).toBe(6);
    expect(h.meta.bank.appliedStorageKeys).toEqual(['key-3']);
    await waitFor(() => h.db.rows.get('key-3')?.status === 'applied');
    // Both calls carried the identical fingerprint: same key, same item,
    // same declared cost. Never a second minted key.
    expect(h.spend).toHaveBeenCalledTimes(2);
    expect(h.spend.mock.calls[0]).toEqual(h.spend.mock.calls[1]);
  });

  it('a same-key retry after a completed purchase answers already_granted without spending again', async () => {
    const h = makeHarness();
    h.spendResults.push(granted());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-4',
    });
    await waitFor(() => h.db.rows.get('key-4')?.status === 'applied');
    const retry = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-4',
    });
    expect(retry.granted).toBe(true);
    expect(retry.reason).toBe('already_granted');
    // EXACTLY once: the counter did not move again and the service was not
    // called a second time (the in-blob key answers the replay).
    expect(h.meta.bank.purchasedSlots).toBe(6);
    expect(h.spend).toHaveBeenCalledTimes(1);
  });

  it('never confirms through the store: no owned read exists anywhere in the flow', async () => {
    const h = makeHarness();
    h.spendResults.push(granted());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-5',
    });
    // The host surface IS the capability boundary: it exposes no store
    // read at all, so the receipt is the only confirmation the flow can
    // even reach. The spend was called exactly once with kind storage.
    expect(h.spend).toHaveBeenCalledTimes(1);
    expect(h.spend.mock.calls[0]).toEqual([
      {
        accountId: ACCOUNT,
        itemId: 'strongbox_rung_01',
        kind: 'storage',
        expectedCostClaudium: 100,
        idempotencyKey: 'key-5',
      },
    ]);
  });
});

describe('refusals before any money moves', () => {
  it.each([
    { itemId: 'no_such_sku', reason: 'unknown_item' },
    { itemId: 'strongbox_rung_03', reason: 'not_next_rung' },
  ])(
    '$itemId refuses with $reason, writing no row and spending nothing',
    async ({ itemId, reason }) => {
      const h = makeHarness();
      const res = await executeStoragePurchase(h.host, {
        accountId: ACCOUNT,
        itemId,
        expectedCostClaudium: 100,
        idempotencyKey: 'key-6',
      });
      expect(res).toEqual({ granted: false, balance: null, costClaudium: null, reason });
      expect(h.db.begin).not.toHaveBeenCalled();
      expect(h.spend).not.toHaveBeenCalled();
      expect(h.meta.bank.purchasedSlots).toBe(0);
      expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
    },
  );

  it('refuses a charter that no longer fits, whole, with no partial clamp', async () => {
    const h = makeHarness();
    h.meta.bank.purchasedSlots = 66;
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_charter_1',
      expectedCostClaudium: 500,
      idempotencyKey: 'key-7',
    });
    expect(res.reason).toBe('does_not_fit');
    expect(h.spend).not.toHaveBeenCalled();
    expect(h.meta.bank.purchasedSlots).toBe(66);
  });

  it('a database failure fails CLOSED as unavailable instead of throwing', async () => {
    const h = makeHarness();
    h.db.begin.mockRejectedValueOnce(new Error('pool exhausted'));
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-db-down',
    });
    // The typed refusal shape, never a rejected promise into the HTTP
    // handler; nothing spent, mutex released, retry-same-key semantics.
    expect(res).toEqual({
      granted: false,
      balance: null,
      costClaudium: null,
      reason: 'unavailable',
    });
    expect(h.spend).not.toHaveBeenCalled();
    expect(h.meta.bank.purchasedSlots).toBe(0);
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
    expect(h.warn).toHaveBeenCalled();
  });

  it('refuses with no_live_character when the account has no session', async () => {
    const h = makeHarness();
    h.state.live = false;
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-8',
    });
    expect(res.reason).toBe('no_live_character');
    expect(h.db.begin).not.toHaveBeenCalled();
    expect(h.spend).not.toHaveBeenCalled();
  });

  it('a definitive service refusal settles the row refused and passes the reason through', async () => {
    const h = makeHarness();
    h.spendResults.push({
      granted: false,
      balance: 40,
      costClaudium: 100,
      reason: 'insufficient_balance',
    });
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-9',
    });
    expect(res.reason).toBe('insufficient_balance');
    expect(res.balance).toBe(40);
    expect(h.db.rows.get('key-9')?.status).toBe('refused');
    expect(h.meta.bank.purchasedSlots).toBe(0);
    // A later same-key retry is a legitimate fresh attempt (the service
    // keeps no record of a refusal): the row reopens and the retry lands.
    h.spendResults.push(granted());
    const retry = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-9',
    });
    expect(retry.granted).toBe(true);
    expect(h.meta.bank.purchasedSlots).toBe(6);
  });

  it('cross-purchase key reuse refuses as the already_granted conflict without spending', async () => {
    const h = makeHarness();
    h.spendResults.push(granted());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-10',
    });
    await waitFor(() => h.db.rows.get('key-10')?.status === 'applied');
    // Same key, different item: the fingerprint no longer matches.
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_02',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-10',
    });
    expect(res).toEqual({
      granted: false,
      balance: null,
      costClaudium: null,
      reason: 'already_granted',
    });
    expect(h.spend).toHaveBeenCalledTimes(1);
    expect(h.meta.bank.purchasedSlots).toBe(6);
  });
});

describe('the per-character mutex', () => {
  it('refuses a second purchase while the first is in flight, and releases after', async () => {
    const h = makeHarness();
    let resolveSpend!: (v: ClaudiumSpendResult) => void;
    h.spendResults.push(
      () =>
        new Promise<ClaudiumSpendResult>((r) => {
          resolveSpend = r;
        }),
    );
    const first = executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-11',
    });
    await waitFor(() => h.spend.mock.calls.length === 1);
    expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
    const second = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_charter_1',
      expectedCostClaudium: 500,
      idempotencyKey: 'key-12',
    });
    expect(second).toEqual({
      granted: false,
      balance: null,
      costClaudium: null,
      reason: 'purchase_in_progress',
    });
    // The refused conflicting purchase persisted nothing.
    expect(h.db.rows.has('key-12')).toBe(false);
    resolveSpend(granted());
    const res = await first;
    expect(res.granted).toBe(true);
    expect(h.meta.bank.purchasedSlots).toBe(6);
    // The purchase mutex is released at slot application, so a fresh claudium
    // purchase is admitted immediately; the GOLD rail alone stays shut for the
    // durability chain's ledger-ordering window and reopens after it.
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
  });

  it('a same-key duplicate racing the in-flight original also refuses in progress', async () => {
    const h = makeHarness();
    let resolveSpend!: (v: ClaudiumSpendResult) => void;
    h.spendResults.push(
      () =>
        new Promise<ClaudiumSpendResult>((r) => {
          resolveSpend = r;
        }),
    );
    const first = executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-13',
    });
    await waitFor(() => h.spend.mock.calls.length === 1);
    const dup = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-13',
    });
    expect(dup.reason).toBe('purchase_in_progress');
    resolveSpend(granted());
    await first;
    // One spend, one apply: the duplicate neither double-spent nor
    // double-applied.
    expect(h.spend).toHaveBeenCalledTimes(1);
    expect(h.meta.bank.purchasedSlots).toBe(6);
  });
});

describe('the apply-time re-check (defense in depth) and the unresolved surface', () => {
  it('a ladder move landing mid-spend yields no partial grant and an unresolved record', async () => {
    const h = makeHarness();
    h.meta.bank.purchasedSlots = 66;
    // Fits at request time (66 + 6 = 72). The scripted spend simulates the
    // impossible-state interleave (a bug or a restore from backup: the
    // mutex refuses the reachable version of this race) by moving the
    // ladder underneath the purchase before answering granted.
    h.spendResults.push(() => {
      h.meta.bank.purchasedSlots = 72;
      return granted();
    });
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_12',
      expectedCostClaudium: 1200,
      idempotencyKey: 'key-14',
    });
    // Granted stays true (the money moved); the grant did NOT apply, did
    // NOT clamp, and the record survives as unresolved for the operator.
    expect(res.granted).toBe(true);
    expect(res.reason).toBe('grant_unresolved');
    expect(h.meta.bank.purchasedSlots).toBe(72);
    expect(h.meta.bank.appliedStorageKeys).toEqual([]);
    expect(h.db.rows.get('key-14')?.status).toBe('unresolved');
    expect(h.warn).toHaveBeenCalled();
    // A later same-key retry keeps surfacing the unresolved state, never
    // re-spends, and never applies.
    const retry = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_12',
      expectedCostClaudium: 1200,
      idempotencyKey: 'key-14',
    });
    expect(retry.reason).toBe('grant_unresolved');
    expect(h.spend).toHaveBeenCalledTimes(1);
  });

  it('a session dropping between spend and apply defers to the next login, then applies once', async () => {
    const h = makeHarness();
    // The character logs out while the spend is in flight.
    h.spendResults.push(() => {
      h.state.live = false;
      return granted();
    });
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-15',
    });
    expect(res.granted).toBe(true);
    expect(res.reason).toBe('apply_deferred');
    expect(h.meta.bank.purchasedSlots).toBe(0);
    expect(h.db.rows.get('key-15')?.status).toBe('pending');
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
    // Next login: the recovery replays the same key and applies exactly once.
    h.state.live = true;
    h.spendResults.push(granted({ reason: 'already_granted' }));
    await resumeStoragePurchasesAtLogin(h.host, CHARACTER);
    expect(h.meta.bank.purchasedSlots).toBe(6);
    await waitFor(() => h.db.rows.get('key-15')?.status === 'applied');
  });
});

describe('login recovery', () => {
  it('a pending row whose key is already in the loaded blob settles without a service call', async () => {
    const h = makeHarness();
    // The apply landed and saved, but the settle was lost (crash after
    // save, before the row update): state carries the key, row pending.
    bankGrantStorageSlots(h.sim.ctx, h.sim.playerId, 'strongbox_rung_01', 'key-16');
    await h.db.begin({
      realm: 'testrealm',
      accountId: ACCOUNT,
      characterId: CHARACTER,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-16',
    });
    await resumeStoragePurchasesAtLogin(h.host, CHARACTER);
    await waitFor(() => h.db.rows.get('key-16')?.status === 'applied');
    expect(h.spend).not.toHaveBeenCalled();
    expect(h.meta.bank.purchasedSlots).toBe(6);
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
  });

  it('an ambiguous recovery keeps the mutex with the background task until definitive', async () => {
    const h = makeHarness();
    await h.db.begin({
      realm: 'testrealm',
      accountId: ACCOUNT,
      characterId: CHARACTER,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-17',
    });
    h.spendResults.push(unavailable(), unavailable(), granted());
    await resumeStoragePurchasesAtLogin(h.host, CHARACTER);
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
    expect(h.meta.bank.purchasedSlots).toBe(6);
    await waitFor(() => h.db.rows.get('key-17')?.status === 'applied');
    expect(h.spend).toHaveBeenCalledTimes(3);
  });

  it('the kick closes the gold rail SYNCHRONOUSLY, before the scan answers', async () => {
    const h = makeHarness();
    let resolvePending!: (rows: never[]) => void;
    h.db.pendingFor.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolvePending = r as never;
        }),
    );
    configureStoragePurchaseRuntime(() => h.host);
    kickStoragePurchaseRecovery(CHARACTER);
    // The post-restart re-arm window: the provisional hold is up before the
    // pending-row scan's round-trip resolves, so a gold bank_buy_slots
    // racing the login kick is refused instead of interleaving a debited,
    // unapplied purchase.
    expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
    resolvePending([]);
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
  });

  it('a kick with a pending row converges it, then releases the hold', async () => {
    const h = makeHarness();
    await h.db.begin({
      realm: 'testrealm',
      accountId: ACCOUNT,
      characterId: CHARACTER,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-kick',
    });
    h.spendResults.push(granted({ reason: 'already_granted' }));
    configureStoragePurchaseRuntime(() => h.host);
    kickStoragePurchaseRecovery(CHARACTER);
    expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
    await waitFor(() => h.db.rows.get('key-kick')?.status === 'applied');
    expect(h.meta.bank.purchasedSlots).toBe(6);
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
  });

  it('a settle re-kicks the scan, converging the sibling row the hand-off abandoned', async () => {
    // The one behaviour settleInBackground's finally exists for. The login scan
    // is one-at-a-time: when a row's spend comes back ambiguous it hands off to
    // the background task and RETURNS, leaving every later pending row of that
    // character untouched. Only the re-kick revisits them, and until it does the
    // mutex is free, so a gold rung buy can advance the ladder underneath the
    // abandoned row and turn its eventual replay into a debit with no slots.
    //
    // configureStoragePurchaseRuntime is load-bearing here, not scaffolding:
    // kickStoragePurchaseRecovery returns at its first line when no runtime
    // factory is set, and resetStoragePurchasesForTests nulls it between cases,
    // so without this line the re-kick is inert and the case would pass with or
    // without the code under test.
    const h = makeHarness();
    for (const [itemId, idempotencyKey] of [
      ['strongbox_rung_01', 'key-sibling-a'],
      ['strongbox_rung_02', 'key-sibling-b'],
    ]) {
      await h.db.begin({
        realm: 'testrealm',
        accountId: ACCOUNT,
        characterId: CHARACTER,
        itemId,
        expectedCostClaudium: 100,
        idempotencyKey,
      });
    }
    // A: ambiguous once, then granted by the background retry. B: granted on
    // the re-kicked scan's first attempt.
    h.spendResults.push(unavailable(), granted(), granted());
    configureStoragePurchaseRuntime(() => h.host);

    await resumeStoragePurchasesAtLogin(h.host, CHARACTER);
    // The hand-off really did abandon B: the scan returned with B untouched.
    expect(h.db.rows.get('key-sibling-b')?.status).toBe('pending');

    await waitFor(() => h.db.rows.get('key-sibling-b')?.status === 'applied');
    expect(h.db.rows.get('key-sibling-a')?.status).toBe('applied');
    // Decisive: BOTH rungs landed, so the counter advanced by two whole grants
    // rather than stopping at the one the scan happened to reach.
    expect(h.meta.bank.purchasedSlots).toBe(12);
    expect(h.meta.bank.appliedStorageKeys).toEqual(['key-sibling-a', 'key-sibling-b']);
    expect(h.spend).toHaveBeenCalledTimes(3);
    // The chain terminates: the final re-kick finds nothing left and the rail
    // reopens, so this is convergence and not a hot loop holding the mutex.
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
  }, 15_000);

  it('a QUEUED kick holds the gold rail for its whole wait, not just its scan', async () => {
    // The RESIDUAL exposure after phase 14, kept observable. The gate now
    // holds only the SCAN (the sibling storm suite pins that row work no
    // longer queues anyone), so this arm is deliberately built out of scans
    // that never answer: a character whose kick is still queued behind four
    // WEDGED scans is refused a GOLD bank_buy_slots although it has no
    // purchase at all. That remainder is covered by the stuck-promise
    // backstop in server/storage_ladder_hold.ts, which is a bound on a bug
    // rather than a policy, and the arm below runs well inside it.
    const h = makeHarness();
    // Four slow scans occupy every slot in the gate.
    const release: (() => void)[] = [];
    h.db.pendingFor.mockImplementation(
      () =>
        new Promise((r) => {
          release.push(() => r([]));
        }),
    );
    configureStoragePurchaseRuntime(() => h.host);
    const BLOCKERS = [901, 902, 903, 904];
    for (const id of BLOCKERS) kickStoragePurchaseRecovery(id);
    await waitFor(() => release.length === 4);

    // The fifth character joins. Its kick can only QUEUE, so its scan has not
    // started, yet its rail is already closed.
    kickStoragePurchaseRecovery(905);
    expect(release.length).toBe(4);
    expect(storagePurchaseInFlight(905)).toBe(true);

    // Draining one slot is not enough to reach it either: strictly FIFO.
    release[0]();
    await waitFor(() => release.length === 5);
    // Now its scan runs; once it answers, the rail reopens.
    release[4]();
    await waitFor(() => storagePurchaseInFlight(905) === false);

    for (const r of release.slice(1, 4)) r();
    await waitFor(() => BLOCKERS.every((id) => storagePurchaseInFlight(id) === false));
  }, 20_000);

  it('recovery for an offline character leaves the row pending and takes nothing', async () => {
    const h = makeHarness();
    await h.db.begin({
      realm: 'testrealm',
      accountId: ACCOUNT,
      characterId: CHARACTER,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'key-18',
    });
    h.state.live = false;
    await resumeStoragePurchasesAtLogin(h.host, CHARACTER);
    expect(h.spend).not.toHaveBeenCalled();
    expect(h.db.rows.get('key-18')?.status).toBe('pending');
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
  });
});

describe('phase 14: the gold rail survives the Claudium machinery', () => {
  // The gold rail reads the hold through storagePurchaseInFlight; these arms
  // drive the REAL flow and read that predicate, so they fail if the reservation
  // is taken for too long OR released too early. Every yield has its blocking
  // twin beside it.

  it('an outage press that never reached the service settles refused and reserves nothing', async () => {
    // RULING 27, the reproduction. The economy service is down, the price cache
    // is still quoting, so the Claudium rail is on the button; pressing it must
    // not cost the player their GOLD rung.
    const h = makeHarness();
    h.spendResults.push(neverReached());
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'outage-1',
    });
    expect(res).toEqual({
      granted: false,
      balance: null,
      costClaudium: null,
      reason: 'unavailable',
    });
    // No debit was possible, so the row is settled rather than left open...
    expect(h.db.rows.get('outage-1')?.status).toBe('refused');
    // ... nothing is holding the ladder ...
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
    // ... and no slots were granted on the way through.
    expect(h.meta.bank.purchasedSlots).toBe(0);
    expect(h.meta.bank.appliedStorageKeys).toEqual([]);
  });

  it("one apply's save cannot close ANOTHER apply's ledger-ordering window", async () => {
    // Recovery drives rows in a loop and fires scheduleAppliedSettle WITHOUT
    // awaiting it, so two applied settles for one character overlap. The window
    // exists so a gold rung landing between a sim mutation and its durable
    // claudium ledger row is visible as a purchased_regression; closing it
    // early on somebody else's save reopens exactly that gap.
    const h = makeHarness();
    const saves: ((v: boolean) => void)[] = [];
    h.saveCharacter.mockImplementation(
      () => new Promise<boolean>((resolve) => saves.push(resolve)),
    );
    h.db.rows.set('ord-1', {
      id: 1,
      realm: 'testrealm',
      accountId: ACCOUNT,
      characterId: CHARACTER,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'ord-1',
      status: 'pending',
      resolvedAt: null,
    });
    h.db.rows.set('ord-2', {
      id: 2,
      realm: 'testrealm',
      accountId: ACCOUNT,
      characterId: CHARACTER,
      itemId: 'strongbox_rung_02',
      expectedCostClaudium: 100,
      idempotencyKey: 'ord-2',
      status: 'pending',
      resolvedAt: null,
    });
    h.spendResults.push(granted(), granted());

    await resumeStoragePurchasesAtLogin(h.host, CHARACTER);
    // Both applies have run and both saves are outstanding.
    await waitFor(() => saves.length === 2);
    expect(storagePurchaseInFlight(CHARACTER)).toBe(true);

    // The FIRST purchase's save confirms. Its finally must close only its own
    // window; the second purchase's ledger row is still unwritten.
    saves[0](true);
    await waitFor(() => h.db.rows.get('ord-1')?.status === 'applied');
    expect(storagePurchaseInFlight(CHARACTER)).toBe(true);

    // Once the second confirms too, the rail is genuinely clear.
    saves[1](true);
    await waitFor(() => h.db.rows.get('ord-2')?.status === 'applied');
    await waitFor(() => storagePurchaseInFlight(CHARACTER) === false);
  });

  it('a wedged ledger-ordering hold and a lapsed ladder hold do not flood together', async () => {
    // The two yield warnings used to share ONE map with mutually exclusive
    // token shapes, and storagePurchaseInFlight can reach both arms in a single
    // call, so each overwrote the other's token and every later dedupe check
    // missed. A character in both states then emitted TWO synchronous warns per
    // gold press, on the thread that runs the world loop.
    const h = makeHarness();
    h.state.saveResult = new Promise<boolean>(() => {});
    h.host.delay = () => new Promise<void>(() => {});
    h.spendResults.push(granted());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'flood-ledger',
    });
    // A second purchase leaves an ambiguous LADDER hold beside the wedged
    // ledger-ordering window opened by the first.
    h.spendResults.push(unavailable());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_02',
      expectedCostClaudium: 100,
      idempotencyKey: 'flood-ladder',
    });

    const now = Date.now();
    const clock = vi.spyOn(Date, 'now');
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      clock.mockReturnValue(now + AMBIGUITY_HOLD_MAX_MS + 5_000);
      for (let i = 0; i < 20; i++) storagePurchaseInFlight(CHARACTER);
      const ladder = warns.mock.calls.filter((c) => String(c[0]).includes('ambiguous purchase'));
      const ordering = warns.mock.calls.filter((c) =>
        String(c[0]).includes('WEDGED ledger-ordering hold'),
      );
      expect(ladder.length).toBeLessThanOrEqual(1);
      expect(ordering.length).toBeLessThanOrEqual(1);
    } finally {
      warns.mockRestore();
      clock.mockRestore();
    }
  });

  it('a wedged ledger-ordering window warns ONCE, not once per gold press', async () => {
    // storagePurchaseInFlight runs on every gold bank_buy_slots command, which
    // a player drives by holding the buy button, on the thread that also runs
    // the 20 Hz world loop. A wedged save leaves the window permanently past
    // its bound, so an undeduped warn here is a player-triggerable log flood.
    const h = makeHarness();
    h.state.saveResult = new Promise<boolean>(() => {});
    h.spendResults.push(granted());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'wedged-save',
    });
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now');
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      clock.mockReturnValue(now + WEDGED_HOLD_MAX_MS + 1_000);
      for (let i = 0; i < 25; i++) expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
      const ordering = warns.mock.calls.filter((c) =>
        String(c[0]).includes('WEDGED ledger-ordering hold'),
      );
      expect(ordering).toHaveLength(1);
    } finally {
      warns.mockRestore();
      clock.mockRestore();
    }
  });

  it('a wedge yield does not silence the settling yield that follows it under the same key', async () => {
    // ONE purchase key legitimately yields twice with different meanings: the
    // request itself can wedge (a bound on a bug), and after the ambiguity
    // handoff the SAME key yields again as 'settling' (a bound on money that
    // may have moved). Keyed on the key alone the first message suppressed the
    // second, which is the one that says a gold rung may now land on a live
    // debit. The dedupe token therefore carries the reason as well.
    const h = makeHarness();
    h.host.delay = () => new Promise<void>(() => {});
    let releaseSpend: ((v: ClaudiumSpendOutcome) => void) | undefined;
    h.spendResults.push(
      () =>
        new Promise<ClaudiumSpendOutcome>((resolve) => {
          releaseSpend = resolve;
        }),
    );
    const armed = Date.now();
    const clock = vi.spyOn(Date, 'now');
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const pending = executeStoragePurchase(h.host, {
        accountId: ACCOUNT,
        itemId: 'strongbox_rung_01',
        expectedCostClaudium: 100,
        idempotencyKey: 'two-yields',
      });
      await waitFor(() => releaseSpend !== undefined);

      // The request is still in flight and has outlived the backstop: a WEDGE
      // yield, logged against key 'two-yields'.
      clock.mockReturnValue(armed + WEDGED_HOLD_MAX_MS + 1_000);
      expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
      expect(
        warns.mock.calls.filter((c) => String(c[0]).includes('WEDGED purchase hold')),
      ).toHaveLength(1);

      // The spend now answers ambiguously, so the SAME key is retagged
      // 'settling' with a fresh clock and a different claim.
      releaseSpend?.({ result: unavailable(), neverReached: false });
      await pending;
      const handoff = armed + WEDGED_HOLD_MAX_MS + 1_000;
      clock.mockReturnValue(handoff + AMBIGUITY_HOLD_MAX_MS + 1_000);
      expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
      // The message that matters must NOT have been swallowed by the wedge one.
      expect(
        warns.mock.calls.filter((c) => String(c[0]).includes('ambiguous purchase')),
      ).toHaveLength(1);
    } finally {
      warns.mockRestore();
      clock.mockRestore();
    }
  });

  it('a SECOND press during the same outage still settles refused and still holds nothing', async () => {
    // The phase's goal is that a character's GOLD rung keeps working through a
    // service outage. Pressing an unresponsive button twice is the most
    // ordinary input there is, and the client is documented to retry the SAME
    // key on 'unavailable'. Press two finds its own 'refused' row, reopens it,
    // and used to fall through to the ambiguity retry because the row was not
    // freshly INSERTED, shutting that player's gold rail for ten minutes over a
    // purchase that provably never reached anybody.
    const h = makeHarness();
    h.spendResults.push(neverReached(), neverReached());
    const press = {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'outage-twice',
    };
    await executeStoragePurchase(h.host, press);
    expect(h.db.rows.get('outage-twice')?.status).toBe('refused');
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);

    const second = await executeStoragePurchase(h.host, press);
    expect(second.reason).toBe('unavailable');
    // Reopened, spent, provably never reached, settled again ...
    expect(h.db.rows.get('outage-twice')?.status).toBe('refused');
    // ... and the gold rail is STILL free, with no ten-minute settling hold.
    expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
    expect(h.meta.bank.purchasedSlots).toBe(0);
  });

  it('a never-reached press whose settle write FAILS leaves a driver behind', async () => {
    // The one exit that used to release the mutex over an open row with nothing
    // arranged to revisit it. The settle fails on exactly the infrastructure
    // trouble that accompanies an economy outage, and the row then sits pending
    // with the gold rail open until the character's next login.
    const h = makeHarness();
    h.spendResults.push(neverReached());
    const kicked: number[] = [];
    configureStoragePurchaseRuntime(() => {
      kicked.push(CHARACTER);
      throw new Error('runtime unavailable in this arm');
    });
    // A real write FAILURE, not merely a row that was no longer pending.
    // safeSettle distinguishes the two on purpose: settle() is guarded FROM
    // pending, so a false means somebody else already moved the row to a
    // terminal status, which is a closed row needing no driver. Only a thrown
    // write leaves an open row behind.
    h.db.settle.mockRejectedValue(new Error('pool exhausted'));
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'outage-settle-fails',
    });
    expect(res.reason).toBe('unavailable');
    // The recovery kick is what proves a driver was arranged: it reads the
    // runtime host factory, which this arm counts.
    expect(kicked.length).toBeGreaterThan(0);
  });

  it('a never-reached press whose row was ALREADY settled arranges no driver', async () => {
    // The negative twin, and the reason safeSettle reports three states rather
    // than a boolean. settle() is guarded FROM pending, so a false answer means
    // a concurrent driver already moved the row to a terminal status. Arming a
    // recovery scan for that is a database round trip for work that does not
    // exist, on the outage path where the pool is already the scarce thing.
    const h = makeHarness();
    h.spendResults.push(neverReached());
    const kicked: number[] = [];
    configureStoragePurchaseRuntime(() => {
      kicked.push(CHARACTER);
      throw new Error('runtime unavailable in this arm');
    });
    h.db.settle.mockResolvedValue(false);
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'outage-already-settled',
    });
    expect(res.reason).toBe('unavailable');
    expect(kicked).toHaveLength(0);
  });

  it('a REACHED ambiguous outcome still reserves the ladder: the arm that must not yield', async () => {
    // The negative twin of the case above, and the one that keeps the money
    // guarantee: a timeout or a 5xx may be sitting on top of a live debit, so
    // the reservation stands and the row stays open for the retry.
    const h = makeHarness();
    h.host.delay = () => new Promise<void>(() => {});
    h.spendResults.push(unavailable());
    const res = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'ambiguous-1',
    });
    expect(res.reason).toBe('unavailable');
    expect(h.db.rows.get('ambiguous-1')?.status).toBe('pending');
    expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
  });

  it('one ambiguous attempt poisons the key: a later never-reached retry cannot settle it', async () => {
    // The transport fact covers the request that carried it and nothing else.
    // A row that already exists may have been created by an attempt that
    // reached the service, so answering its retry with a definitive refusal is
    // exactly the mis-settle over a live debit the classifier exists to stop.
    const h = makeHarness();
    h.host.delay = () => new Promise<void>(() => {});
    h.spendResults.push(unavailable());
    await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'poisoned',
    });
    expect(h.db.rows.get('poisoned')?.status).toBe('pending');
    // The client retries the SAME key while the first attempt still holds. The
    // mutex answers first, so no second row and no second spend.
    const retry = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'poisoned',
    });
    expect(retry.reason).toBe('purchase_in_progress');
    expect(h.db.rows.get('poisoned')?.status).toBe('pending');
    expect(h.spend).toHaveBeenCalledTimes(1);

    // And once the holder has gone (a process that dropped the in-memory hold),
    // the retry re-spends the same key and a NEVER-REACHED answer still leaves
    // the row open, because the FIRST attempt may have debited.
    resetStoragePurchasesForTests();
    h.spendResults.push(neverReached());
    const later = await executeStoragePurchase(h.host, {
      accountId: ACCOUNT,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'poisoned',
    });
    expect(later.reason).toBe('unavailable');
    expect(h.db.rows.get('poisoned')?.status).toBe('pending');
  });

  it('an ambiguous hold yields the GOLD rail at its bound, and still refuses a new Claudium buy', async () => {
    const h = makeHarness();
    h.host.delay = () => new Promise<void>(() => {});
    const clock = vi.spyOn(Date, 'now');
    const start = 1_700_000_000_000;
    clock.mockReturnValue(start);
    try {
      h.spendResults.push(unavailable());
      await executeStoragePurchase(h.host, {
        accountId: ACCOUNT,
        itemId: 'strongbox_rung_01',
        expectedCostClaudium: 100,
        idempotencyKey: 'yield-1',
      });
      // Held while the service might still answer.
      expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
      clock.mockReturnValue(start + AMBIGUITY_HOLD_MAX_MS - 1);
      expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
      // At the bound the Claudium price has aged off the button, so holding the
      // GOLD rail to protect a rail that is offline stops making sense.
      clock.mockReturnValue(start + AMBIGUITY_HOLD_MAX_MS);
      expect(storagePurchaseInFlight(CHARACTER)).toBe(false);

      // THE YIELD OPENS THE GOLD RAIL, NOT THE CLAUDIUM RAIL. A new purchase is
      // still refused, so the per-character pending-row count cannot grow
      // through an outage.
      const second = await executeStoragePurchase(h.host, {
        accountId: ACCOUNT,
        itemId: 'strongbox_rung_01',
        expectedCostClaudium: 100,
        idempotencyKey: 'yield-2',
      });
      expect(second.reason).toBe('purchase_in_progress');
      expect(h.db.rows.has('yield-2')).toBe(false);
      expect(h.spend).toHaveBeenCalledTimes(1);
      // The open row is untouched: only the reservation lapsed, not the record.
      expect(h.db.rows.get('yield-1')?.status).toBe('pending');
    } finally {
      clock.mockRestore();
    }
  });

  it('the hold clock restarts at the spend, so slow database work cannot lapse it early', async () => {
    // The review round's arithmetic: the pre-spend path is two to four database
    // round trips, each able to cost the pool's connect timeout plus its
    // statement timeout, so on a degraded database that sum can exceed the
    // stuck-promise backstop. A hold taken only at the start would lapse WHILE
    // the spend was still to come, opening the gold rail on top of money about
    // to move. This drives that shape: the database work eats the whole
    // backstop, and the rail must still be shut when the spend runs.
    const h = makeHarness();
    const clock = vi.spyOn(Date, 'now');
    const start = 1_700_000_000_000;
    clock.mockReturnValue(start);
    let railAtSpend: boolean | null = null;
    try {
      // Every database read advances the clock past the backstop.
      h.db.byKey.mockImplementationOnce(async () => {
        clock.mockReturnValue(start + WEDGED_HOLD_MAX_MS * 2);
        return null;
      });
      h.spendResults.push(() => {
        railAtSpend = storagePurchaseInFlight(CHARACTER);
        return granted();
      });
      await executeStoragePurchase(h.host, {
        accountId: ACCOUNT,
        itemId: 'strongbox_rung_01',
        expectedCostClaudium: 100,
        idempotencyKey: 'slow-db',
      });
      expect(railAtSpend).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('the ledger-ordering window cannot shut the rail forever on a save that never settles', async () => {
    const h = makeHarness();
    h.state.saveResult = new Promise<boolean>(() => {});
    const clock = vi.spyOn(Date, 'now');
    const start = 1_700_000_000_000;
    clock.mockReturnValue(start);
    try {
      h.spendResults.push(granted());
      await executeStoragePurchase(h.host, {
        accountId: ACCOUNT,
        itemId: 'strongbox_rung_01',
        expectedCostClaudium: 100,
        idempotencyKey: 'wedged-save',
      });
      // The apply landed; the audit row is waiting on a save that never comes.
      expect(h.meta.bank.purchasedSlots).toBe(6);
      expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
      clock.mockReturnValue(start + WEDGED_HOLD_MAX_MS - 1);
      expect(storagePurchaseInFlight(CHARACTER)).toBe(true);
      clock.mockReturnValue(start + WEDGED_HOLD_MAX_MS);
      expect(storagePurchaseInFlight(CHARACTER)).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });
});
