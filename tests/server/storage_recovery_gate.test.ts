// Bank Storage phase 14: the login-storm recovery gate, in its OWN FILE on
// purpose.
//
// The module state under test here (the ladder-hold table and the FIFO gate's
// live slot count) is process-global, and the flow's background tasks outlive
// the case that started them: a settle parked on a backoff, or a fail-closed
// re-kick, calls kickStoragePurchaseRecovery from a `finally` long after its
// own test finished. In a shared file that stray kick DRAINS the gate queue,
// so the arms below passed for the wrong reason and a mutant that held a slot
// through the whole recovery survived. Vitest isolates by file, so this suite
// starts with an empty gate and no leftover drivers. Found by mutation, not by
// review: the pass in the shared file was green.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AMBIGUITY_HOLD_MAX_MS, WEDGED_HOLD_MAX_MS } from '../../server/storage_ladder_hold';
import {
  configureStoragePurchaseRuntime,
  executeStoragePurchase,
  kickStoragePurchaseRecovery,
  RECOVERY_DRIVE_CONCURRENCY,
  resetStoragePurchasesForTests,
  type StoragePurchaseHost,
  storagePurchaseInFlight,
} from '../../server/storage_purchases';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Await full quiescence of the fire-and-forget chains; condition-polled, never
// a real sleep.
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

describe('phase 14: a login storm cannot shut an innocent gold rail', () => {
  // RULING 14, the reproduction. The provisional hold is armed synchronously at
  // a fresh join and the kicks queue through a small FIFO gate. Before this
  // phase a gate SLOT was held for a WHOLE recovery, including a pending row's
  // service spend, so a character with no purchase at all waited behind other
  // characters' money and was refused a GOLD bank_buy_slots the entire time.

  /** A host serving one pending row to each blocker character and none to
   *  anyone else, whose SPENDS hang until released. accountId is the
   *  characterId here so the flow's live-session check resolves. */
  function stormHost(blockers: number[]) {
    const releases: (() => void)[] = [];
    const scans: number[] = [];
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: () =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve({
              result: {
                granted: false,
                balance: 0,
                costClaudium: 100,
                reason: 'insufficient_balance',
              },
              neverReached: false,
            }),
          );
        }),
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async (characterId: number) => {
          scans.push(characterId);
          return blockers.includes(characterId)
            ? [
                {
                  id: characterId,
                  realm: 'testrealm',
                  accountId: characterId,
                  characterId,
                  itemId: 'strongbox_rung_01',
                  expectedCostClaudium: 100,
                  idempotencyKey: `blocker-${characterId}`,
                  status: 'pending' as const,
                },
              ]
            : [];
        },
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    return { host, releases, scans };
  }

  it('releases the gate slot at scan-answer, so row work never queues another character', async () => {
    const BLOCKERS = [911, 912, 913, 914];
    const { host, releases, scans } = stormHost(BLOCKERS);
    configureStoragePurchaseRuntime(() => host);
    for (const id of BLOCKERS) kickStoragePurchaseRecovery(id);
    // Every blocker is now parked inside its own service spend, which is the
    // slowest part of a recovery and the part that used to hold a slot.
    await waitFor(() => releases.length === BLOCKERS.length);
    for (const id of BLOCKERS) expect(storagePurchaseInFlight(id)).toBe(true);

    // A character with NO purchase joins while all four are still in flight.
    kickStoragePurchaseRecovery(915);
    // Its scan runs (the slots were freed the moment the blockers' scans
    // answered) and finds nothing, so its rail reopens with four spends still
    // hanging. Before this phase it would have waited for all four to finish.
    await waitFor(() => storagePurchaseInFlight(915) === false);
    expect(scans).toContain(915);
    expect(releases.length).toBe(BLOCKERS.length);
    // The blockers are STILL held, which is what makes the pass above a
    // release rather than a global lapse: their money may be in the air.
    for (const id of BLOCKERS) expect(storagePurchaseInFlight(id)).toBe(true);

    for (const release of releases) release();
    await waitFor(() => BLOCKERS.every((id) => storagePurchaseInFlight(id) === false));
  }, 20_000);

  it('a character whose scan finds a row keeps the rail through the whole drive', async () => {
    // The other direction: releasing the SLOT early must not release the HOLD
    // early. The row's own key replaces the provisional hold with no gap.
    const { host, releases } = stormHost([921]);
    configureStoragePurchaseRuntime(() => host);
    kickStoragePurchaseRecovery(921);
    await waitFor(() => releases.length === 1);
    expect(storagePurchaseInFlight(921)).toBe(true);
    releases[0]();
    await waitFor(() => storagePurchaseInFlight(921) === false);
  }, 20_000);
});

describe('phase 14 fix round: row work is bounded, just not by the scan gate', () => {
  // The review round found that moving the drive OUT of the login-storm gate
  // removed the only bound on how many recoveries touch the database at once,
  // and the population of pending rows is exactly correlated with the incident
  // that causes a mass recovery. The drive now has its own wider gate: no
  // character waits for another character's money before their GOLD rail
  // reopens, and the pool still sees a bounded number of drives.

  /** Every character has a pending row, and every spend hangs until released,
   *  so the number of released spends IS the number of concurrent drives. */
  function fanOutHost() {
    const releases: (() => void)[] = [];
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: () =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve({
              result: {
                granted: false,
                balance: 0,
                costClaudium: 100,
                reason: 'insufficient_balance',
              },
              neverReached: false,
            }),
          );
        }),
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async (characterId: number) => [
          {
            id: characterId,
            realm: 'testrealm',
            accountId: characterId,
            characterId,
            itemId: 'strongbox_rung_01',
            expectedCostClaudium: 100,
            idempotencyKey: `fan-${characterId}`,
            status: 'pending' as const,
          },
        ],
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    return { host, releases };
  }

  it('caps concurrent drives, and drains the rest as slots free', async () => {
    const { host, releases } = fanOutHost();
    configureStoragePurchaseRuntime(() => host);
    const ids = Array.from({ length: 20 }, (_, i) => 950 + i);
    for (const id of ids) kickStoragePurchaseRecovery(id);

    // Every scan answers quickly (the scan gate is fast), but the drives queue.
    // The cap is read from the module rather than repeated here, so a retune
    // moves the expectation with the code; what this pins is that a cap EXISTS
    // and that twenty simultaneous recoveries do not all hit the database.
    await waitFor(() => releases.length === RECOVERY_DRIVE_CONCURRENCY);
    await sleep(150);
    expect(releases.length).toBe(RECOVERY_DRIVE_CONCURRENCY);
    expect(RECOVERY_DRIVE_CONCURRENCY).toBeLessThan(ids.length);
    // The VALUE as a literal, once. Everything above moves with the constant,
    // so on its own it admits any cap below the fixture's 20: raising the drive
    // gate to 19 would keep all three assertions green while removing the
    // practical bound on concurrent database drives during exactly the restart
    // storm this gate exists for. Same mitigation the hold bounds already
    // carry in tests/server/storage_ladder_hold.ts.
    expect(RECOVERY_DRIVE_CONCURRENCY).toBe(8);

    // Nothing is dropped: releasing the in-flight drives admits the next batch,
    // and the queue drains completely.
    for (let round = 0; round < 20 && releases.length < ids.length; round++) {
      for (const release of releases.splice(0, releases.length)) release();
      await sleep(60);
    }
    await waitFor(() => ids.every((id) => storagePurchaseInFlight(id) === false));
  }, 30_000);
});

describe('phase 14 QA: a queued drive is not a wedged one', () => {
  /** A host whose scan ALWAYS finds one pending row and whose spends hang, so
   *  the drive gate saturates and later characters sit in the drive QUEUE with
   *  a row the scan has already proved is pending. */
  function saturatingHost() {
    const spendsStarted: number[] = [];
    const scanned: number[] = [];
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: (input) => {
        spendsStarted.push(input.accountId);
        return new Promise(() => {});
      },
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async (characterId: number) => {
          scanned.push(characterId);
          return [
            {
              id: characterId,
              realm: 'testrealm',
              accountId: characterId,
              characterId,
              itemId: 'strongbox_rung_01',
              expectedCostClaudium: 100,
              idempotencyKey: `queued-${characterId}`,
              status: 'pending' as const,
            },
          ];
        },
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    return { host, spendsStarted, scanned };
  }

  // THE REGRESSION. Phase 14 moved row work out of the scan's gate, which is
  // what freed the gold rail for players with no purchase at all. The hold left
  // behind still carried the 60s stuck-promise backstop, measured from the
  // KICK, so a character whose scan had ALREADY PROVED a pending row exists
  // lost the gold rail's protection while its drive was merely QUEUED. That is
  // the restart-storm-after-an-outage case the drive gate exists for, and the
  // money in those rows may already have moved: the rung would be sold for gold
  // and the drive would then settle the purchase 'unresolved'.
  it('keeps the gold rail shut past the wedge bound while a proven pending row waits for a drive slot', async () => {
    const { host, spendsStarted, scanned } = saturatingHost();
    configureStoragePurchaseRuntime(() => host);

    const fillers = Array.from({ length: RECOVERY_DRIVE_CONCURRENCY }, (_, i) => 700 + i);
    for (const id of fillers) kickStoragePurchaseRecovery(id);
    await waitFor(() => spendsStarted.length === RECOVERY_DRIVE_CONCURRENCY);

    const queued = 799;
    kickStoragePurchaseRecovery(queued);
    await waitFor(() => scanned.includes(queued));
    // Its drive is QUEUED, not running: no slot was free.
    expect(spendsStarted).not.toContain(queued);
    expect(storagePurchaseInFlight(queued)).toBe(true);

    // Read AFTER the retag, so this is at or past the hold's own sinceMs. The
    // exact boundary belongs to the pure policy's suite
    // (tests/server/storage_ladder_hold.test.ts, which injects the clock);
    // what this arm owns is WHICH BOUND the flow assigned, so it steps well
    // clear of the edge rather than racing the retag instant by a millisecond.
    const armed = Date.now();
    const clock = vi.spyOn(Date, 'now');
    try {
      // Past the stuck-promise backstop the provisional hold was armed with.
      // A queue wait is not a wedge, so the rail must still be shut.
      clock.mockReturnValue(armed + WEDGED_HOLD_MAX_MS + 5_000);
      expect(storagePurchaseInFlight(queued)).toBe(true);
      // Still shut deep inside the ambiguity window.
      clock.mockReturnValue(armed + AMBIGUITY_HOLD_MAX_MS - 60_000);
      expect(storagePurchaseInFlight(queued)).toBe(true);

      // It is not held forever either: the same argued window an ambiguous
      // spend gets, because it is the same claim (the money may have moved and
      // only the service can say).
      clock.mockReturnValue(armed + AMBIGUITY_HOLD_MAX_MS + 60_000);
      expect(storagePurchaseInFlight(queued)).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  // The negative arm, and it is what stops the fix from being a blanket
  // "recovery always holds for ten minutes". A scan that answers EMPTY is the
  // ruling-14 case: the character has no purchase at all and its gold rail must
  // reopen at once, not on any bound.
  it('still frees the rail immediately when the scan finds nothing', async () => {
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: async () => {
        throw new Error('no spend should happen with an empty scan');
      },
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async () => [],
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => host);
    kickStoragePurchaseRecovery(801);
    await waitFor(() => storagePurchaseInFlight(801) === false);
    expect(storagePurchaseInFlight(801)).toBe(false);
  });
});

describe('phase 14 QA: recovery defers to a live purchase, and never strands a sibling row', () => {
  // M25. drivePendingPurchases checks the ladder holder before every row and
  // returns if a REAL purchase key holds it. Without that check a recovery
  // drive would spend the same key ALONGSIDE the live flow that already holds
  // the character, which is a second outbound spend on a money path whose whole
  // guarantee is one driver per character at a time.
  it('a queued drive does not spend while a real purchase holds the character', async () => {
    const spends: string[] = [];
    const liveReleases: (() => void)[] = [];
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: (input) => {
        spends.push(input.idempotencyKey);
        return new Promise((resolve) => {
          liveReleases.push(() =>
            resolve({
              result: {
                granted: false,
                balance: 0,
                costClaudium: 1,
                reason: 'insufficient_balance',
              },
              neverReached: false,
            }),
          );
        });
      },
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async (characterId: number) => [
          {
            id: characterId,
            realm: 'testrealm',
            accountId: characterId,
            characterId,
            itemId: 'strongbox_rung_01',
            expectedCostClaudium: 100,
            idempotencyKey: `recovered-${characterId}`,
            status: 'pending' as const,
          },
        ],
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => host);

    // A LIVE purchase takes the character first and parks inside its spend.
    void executeStoragePurchase(host, {
      accountId: 610,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'live-610',
    });
    await waitFor(() => spends.includes('live-610'));

    // Recovery is kicked underneath it. The scan may run, but the DRIVE must
    // defer: the live flow owns this character.
    kickStoragePurchaseRecovery(610);
    await sleep(150);
    expect(spends).not.toContain('recovered-610');
    expect(spends).toEqual(['live-610']);
    // And the rail is still shut by the LIVE purchase, not by recovery.
    expect(storagePurchaseInFlight(610)).toBe(true);
    for (const release of liveReleases) release();
  });

  // M30. settleInBackground re-kicks recovery from its finally, which is the
  // module's whole claim that no pending row is left without a driver while its
  // character stays online. A SECOND row (one the one-at-a-time drive skipped,
  // or one that out-raced the login kick) is only ever converged by that
  // re-kick, so deleting it strands real money silently.
  it('a finished background settle re-kicks recovery so a sibling pending row is not stranded', async () => {
    const scans: number[] = [];
    const spends: string[] = [];
    let ambiguousOnce = true;
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: async (input) => {
        spends.push(input.idempotencyKey);
        if (ambiguousOnce) {
          ambiguousOnce = false;
          // ambiguous: hands off to the background settle
          return {
            result: { granted: false, balance: null, costClaudium: null, reason: 'unavailable' },
            neverReached: false,
          };
        }
        return {
          result: { granted: false, balance: 0, costClaudium: 1, reason: 'insufficient_balance' },
          neverReached: false,
        };
      },
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async (characterId: number) => {
          scans.push(characterId);
          return [];
        },
      },
      realm: 'testrealm',
      // an immediate backoff so the retry lands inside the test
      delay: async () => {},
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => host);

    await executeStoragePurchase(host, {
      accountId: 620,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'amb-620',
    });
    // The background settle retries the SAME key, gets a definitive answer, and
    // its finally must kick recovery for this character. Without the re-kick no
    // scan for 620 ever happens.
    await waitFor(() => scans.includes(620));
    expect(scans).toContain(620);
    expect(spends.filter((k) => k === 'amb-620').length).toBeGreaterThanOrEqual(2);
  });
});

describe('phase 14 QA: the scan gate cannot be widened by a reset mid-flight', () => {
  // M22. runNextRecoveryKick clamps the live slot count at zero, and the reason
  // is written in the module: resetStoragePurchasesForTests zeroes the counter,
  // so a kick still in flight when a case ends settles AFTERWARDS and would
  // otherwise decrement past zero. A negative count widens the gate for the
  // life of the process, which quietly breaks the login-storm bound for every
  // later test in the run and reads as flakiness, not as a bug. The clamp was
  // unpinned; this is the arm that fails without it.
  it('a kick settling after a reset cannot drive the live count negative', async () => {
    const scanned: number[] = [];
    const gate: (() => void)[] = [];
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: async () => ({
        result: { granted: false, balance: 0, costClaudium: 1, reason: 'insufficient_balance' },
        neverReached: false,
      }),
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: (characterId: number) => {
          scanned.push(characterId);
          return new Promise((resolve) => gate.push(() => resolve([])));
        },
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => host);

    // Four kicks fill the scan gate and park inside their scans.
    for (const id of [500, 501, 502, 503]) kickStoragePurchaseRecovery(id);
    await waitFor(() => scanned.length === 4);

    // The reset a suite runs between cases zeroes the live count while those
    // four scans are still outstanding.
    resetStoragePurchasesForTests();
    configureStoragePurchaseRuntime(() => host);
    for (const release of gate.splice(0, gate.length)) release();
    await sleep(80);

    // The gate must still admit exactly its concurrency, not more. Five fresh
    // kicks: four scan, the fifth waits. Without the clamp the count sits at -4
    // and all five run at once.
    for (const id of [510, 511, 512, 513, 514]) kickStoragePurchaseRecovery(id);
    await waitFor(() => scanned.filter((id) => id >= 510).length >= 4);
    await sleep(120);
    expect(scanned.filter((id) => id >= 510).length).toBe(4);
  });
});

describe('phase 14 QA: the fix round is code too', () => {
  // F01. A scan that FAILS is not a scan that found nothing. The scan errors
  // when the pool is saturated, which is the same restart storm that produces
  // pending rows, so treating a failure as "all clear" opens the gold rail for
  // a character whose row nobody managed to read.
  it('a FAILED pending scan keeps the provisional hold instead of freeing the rail', async () => {
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: async () => {
        throw new Error('no spend expected');
      },
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async () => {
          throw new Error('pool exhausted');
        },
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => host);
    kickStoragePurchaseRecovery(880);
    // Give every fire-and-forget chain time to settle. The rail must STILL be
    // shut: nothing is known, and the bound is what releases it, not a guess.
    await sleep(200);
    expect(storagePurchaseInFlight(880)).toBe(true);

    // And it is not shut forever: the stuck-promise backstop still governs an
    // unanswered provisional hold.
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(now + WEDGED_HOLD_MAX_MS + 1_000);
      expect(storagePurchaseInFlight(880)).toBe(false);

      // AND the paid rail is bounded too. The Claudium flow serializes on mere
      // PRESENCE, so retaining this hold on a scan failure would otherwise
      // disable that character's real-money purchases until a fresh join: the
      // blocked request returns before it can arrange a re-kick, so nothing
      // would clear it. A REAL purchase key must still block on presence, which
      // the arm below the bound proves.
      const paid = await executeStoragePurchase(host, {
        accountId: 880,
        itemId: 'strongbox_rung_01',
        expectedCostClaudium: 100,
        idempotencyKey: 'after-failed-scan',
      });
      expect(paid.reason).not.toBe('purchase_in_progress');
    } finally {
      clock.mockRestore();
    }
  });

  it('a real purchase key still blocks the paid rail on presence alone', async () => {
    // The negative twin of the arm above, and the property the bound must not
    // cost: a purchase that is genuinely open serializes the Claudium rail
    // whatever its age, which is what stops a yielded hold from minting a
    // second pending row for one character during an outage.
    const h: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: async () => ({
        result: { granted: false, balance: null, costClaudium: null, reason: 'unavailable' },
        neverReached: false,
      }),
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async () => [],
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => h);
    await executeStoragePurchase(h, {
      accountId: 890,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'open-890',
    });
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now');
    try {
      // Far past every bound: the gold rail has long since yielded ...
      clock.mockReturnValue(now + AMBIGUITY_HOLD_MAX_MS * 10);
      expect(storagePurchaseInFlight(890)).toBe(false);
      // ... and the paid rail is STILL refused.
      const second = await executeStoragePurchase(h, {
        accountId: 890,
        itemId: 'strongbox_rung_02',
        expectedCostClaudium: 100,
        idempotencyKey: 'open-890-second',
      });
      expect(second.reason).toBe('purchase_in_progress');
    } finally {
      clock.mockRestore();
    }
  });

  // F02. The provisional hold is armed at the KICK so the rail is shut before
  // the client's first command, but the kick then waits in a 4-wide gate. If
  // the clock were not re-stamped at admission a deep queue would eat the
  // scan's own budget and the hold could lapse mid-scan.
  it('re-stamps the provisional hold when its kick is admitted, so the queue does not eat the scan budget', async () => {
    const scanGate: (() => void)[] = [];
    const scanned: number[] = [];
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: async () => {
        throw new Error('no spend expected');
      },
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: (characterId: number) => {
          scanned.push(characterId);
          return new Promise((resolve) => scanGate.push(() => resolve([])));
        },
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => host);

    // Four kicks occupy the scan gate and park inside their scans.
    for (const id of [860, 861, 862, 863]) kickStoragePurchaseRecovery(id);
    await waitFor(() => scanned.length === 4);
    // A fifth is armed now but QUEUED.
    const queued = 864;
    const armedAt = Date.now();
    kickStoragePurchaseRecovery(queued);
    expect(scanned).not.toContain(queued);

    const clock = vi.spyOn(Date, 'now');
    try {
      // Time passes while it waits, then a slot frees and it is admitted. The
      // admission re-stamp means its bound starts HERE, so a scan that then
      // takes a normal moment is not cut short by the wait it already served.
      clock.mockReturnValue(armedAt + WEDGED_HOLD_MAX_MS - 5_000);
      for (const release of scanGate.splice(0, 1)) release();
      await waitFor(() => scanned.includes(queued));
      // Past the ORIGINAL arm's bound, but only seconds into its own scan.
      clock.mockReturnValue(armedAt + WEDGED_HOLD_MAX_MS + 5_000);
      expect(storagePurchaseInFlight(queued)).toBe(true);
    } finally {
      clock.mockRestore();
      for (const release of scanGate.splice(0, scanGate.length)) release();
    }
  });
});

describe('phase 14 QA round 2: the fix must not regress itself', () => {
  // S4-A, and it is the sharpest finding of the review round: the provisional
  // scan hold and the post-scan drive hold share ONE key, and retagLadderHold
  // matched on the key alone. So a SECOND kick (a relog, or any settle's
  // re-kick) re-stamped a 'recovery-drive' hold back to 'recovery-scan',
  // trading its 10-minute bound for the 60s backstop and reopening the gold
  // rail over a row an earlier scan had already PROVED was pending. That is the
  // exact failure 'recovery-drive' was added to prevent, reintroduced by the
  // fix for it.
  it('a second kick cannot downgrade a proven-pending hold back to the scan bound', async () => {
    const spendsStarted: number[] = [];
    const scanned: number[] = [];
    let scanHangs = false;
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: (input) => {
        spendsStarted.push(input.accountId);
        return new Promise(() => {});
      },
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async (characterId: number) => {
          scanned.push(characterId);
          if (scanHangs) await new Promise<void>(() => {});
          return [
            {
              id: characterId,
              realm: 'testrealm',
              accountId: characterId,
              characterId,
              itemId: 'strongbox_rung_01',
              expectedCostClaudium: 100,
              idempotencyKey: `dg-${characterId}`,
              status: 'pending' as const,
            },
          ];
        },
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => host);

    // Saturate the drive gate so the victim's drive stays QUEUED.
    const fillers = Array.from({ length: RECOVERY_DRIVE_CONCURRENCY }, (_, i) => 600 + i);
    for (const id of fillers) kickStoragePurchaseRecovery(id);
    await waitFor(() => spendsStarted.length === RECOVERY_DRIVE_CONCURRENCY);

    const victim = 690;
    const armed = Date.now();
    kickStoragePurchaseRecovery(victim);
    await waitFor(() => scanned.includes(victim));
    expect(spendsStarted).not.toContain(victim);

    // A SECOND kick for the same character, which is what a relog or any
    // settle's re-kick produces. Its own scan HANGS, and that is what makes this
    // arm decisive: with the admission re-stamp free to downgrade there is then
    // nothing behind it to promote the hold back, so the rail opens on the scan
    // bound while the FIRST kick's proven-pending row is still queued. A second
    // scan that ANSWERS re-promotes the hold and masks the defect, which is
    // exactly how the first version of this arm passed with the guard removed.
    scanHangs = true;
    kickStoragePurchaseRecovery(victim);
    await waitFor(() => scanned.filter((id) => id === victim).length === 2);

    const clock = vi.spyOn(Date, 'now');
    try {
      // Past the SCAN bound. If the second kick had downgraded the hold, the
      // gold rail would be open here over a proven-pending row.
      clock.mockReturnValue(armed + WEDGED_HOLD_MAX_MS + 10_000);
      expect(storagePurchaseInFlight(victim)).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  // B2. The provisional hold is the one entry with no owning promise guaranteed
  // to remove it, because a FAILED scan keeps it on purpose. Without eviction it
  // would sit in a module-global map for the life of the process, one per
  // character whose scan failed, which during the pool saturation that causes
  // those failures means many at once.
  it('a lapsed provisional hold is evicted rather than kept for the process lifetime', async () => {
    const host: StoragePurchaseHost = {
      resolveLiveCharacter: (accountId) => ({ characterId: accountId, pid: 1 }),
      grant: () => ({ status: 'fits' }),
      stageAppliedEffect: vi.fn(() => true),
      saveCharacter: async () => true,
      spend: async () => {
        throw new Error('no spend expected');
      },
      db: {
        begin: async () => ({ inserted: true, existing: null }),
        byKey: async () => null,
        settle: async () => true,
        reopen: async () => false,
        pendingFor: async () => {
          throw new Error('pool exhausted');
        },
      },
      realm: 'testrealm',
      delay: () => new Promise<void>(() => {}),
      warn: vi.fn(),
    };
    configureStoragePurchaseRuntime(() => host);
    kickStoragePurchaseRecovery(870);
    await sleep(200);
    expect(storagePurchaseInFlight(870)).toBe(true);

    const now = Date.now();
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(now + WEDGED_HOLD_MAX_MS + 1_000);
      // The read that observes the lapse also drops the entry ...
      expect(storagePurchaseInFlight(870)).toBe(false);
    } finally {
      clock.mockRestore();
    }
    // ... so at the REAL clock the character holds nothing at all, rather than
    // carrying a stranded entry that only a restart would reclaim.
    expect(storagePurchaseInFlight(870)).toBe(false);
    const paid = await executeStoragePurchase(host, {
      accountId: 870,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'evicted-870',
    });
    expect(paid.reason).not.toBe('purchase_in_progress');
  });
});
