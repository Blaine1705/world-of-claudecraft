// The Claudium storage purchase flow (Bank Storage phase 11): sell Strongbox
// charters and single rungs from the game server, applying slots exactly
// once against an idempotent spend receipt, never partially, and never past
// the ceiling gold reaches.
//
// THE ORDER IS THE DESIGN, and it is locked; changing any step changes what
// a crash can strand:
//   1. initiation requires the LIVE character session (never a client-named
//      character, never an offline spend);
//   2. the per-character purchase mutex is taken before the first await and
//      held from initiation until slot application (a gold rung buy at the
//      banker is refused while it is held: server/bank_wire.ts consults
//      storagePurchaseInFlight);
//   3. the FULL grant is validated against the ladder ceiling before any
//      money moves (bankGrantStorageSlots dryRun: fit, next-rung, and the
//      applied-key replay gate share ONE body with the real apply);
//   4. the pending-purchase row is persisted and durable BEFORE the service
//      call (server/storage_purchase_db.ts: what makes the purchase
//      recoverable across a dropped session or a process restart);
//   5. the spend declares kind 'storage' under the client-minted idempotency
//      key; an AMBIGUOUS outcome ('unavailable': never-reached and
//      debited-but-reply-lost are indistinguishable) is resolved only by
//      retrying the SAME key until the service answers definitively, here in
//      a background settle task that inherits the mutex;
//   6. a granted receipt applies exactly once. The dedupe key lands INSIDE
//      the character's bank blob next to the counter it guards
//      (BankState.appliedStorageKeys), so the row may only settle 'applied'
//      AFTER a character save confirms that blob durable: a crash in any
//      window replays to exactly one durable apply. The apply-time re-check
//      (the same dryRun rules, re-run inside the real apply) is DEFENSE IN
//      DEPTH behind the mutex; it stays even though the mutex makes it
//      unreachable, and if it ever fires the row settles 'unresolved' for
//      operator attention: never a clawback, never a partial grant.
//   7. a session dropped between spend and apply auto-applies at the next
//      fresh login (resumeStoragePurchasesAtLogin, kicked from ws_auth's
//      fresh-join arm; a linkdead resume needs no kick because this
//      module's in-process flow survives the socket drop). The kick arms a
//      PROVISIONAL hold synchronously, so after a process restart the gold
//      rail is closed before the client's first command can race the
//      pending-row scan, and every settle re-kicks the scan so no pending
//      row is left holding a debit without a driver while its character
//      stays online. The claudium bank_ledger row is written only when the
//      apply's save CONFIRMS, so a fenced-out apply leaves no audit row.
//
// NEVER confirm a storage purchase by re-reading the store's `owned`: a
// storage spend writes no grant row, so owned is false by construction and
// forever. The receipt (granted, with already_granted as the replay marker
// and `granted` as the one discriminator) is the only confirmation.
//
// Host seam: everything stateful arrives through StoragePurchaseHost, so a
// Vitest drives the whole flow with a hand-rolled host and no GameServer, no
// pg, and no real timers (tests/server/storage_purchases.test.ts).

import { BANK_STORAGE_KEY_MAX_LENGTH, type StorageGrantResult } from '../src/sim/bank';
import type {
  ClaudiumSpendInput,
  ClaudiumSpendOutcome,
  ClaudiumSpendResult,
} from './claudium_proxy';
import {
  type LadderHold,
  type LadderHoldReason,
  ladderHoldBlocksGold,
  WEDGED_HOLD_MAX_MS,
} from './storage_ladder_hold';
import type { StoragePurchaseRow } from './storage_purchase_db';

/** The wire-boundary key rule the spend gate enforces BEFORE the flow runs:
 *  a bounded safe-charset token (UUIDs and ULIDs fit; whitespace and control
 *  characters do not, so a key can never forge log lines or blow the btree
 *  index tuple limit). The length ties to the ONE shared constant the sim's
 *  apply and load paths enforce, so "acceptable", "applicable", and
 *  "persistable" are the same set. Phase 12's client must mint keys inside
 *  this format (crypto.randomUUID does). */
export const STORAGE_KEY_PATTERN = new RegExp(
  `^[A-Za-z0-9_.:-]{1,${BANK_STORAGE_KEY_MAX_LENGTH}}$`,
);

/** Upper bound on the client-declared cost, far above any real catalog price
 *  (2000 today) and far below the INT column and the service's own bounds:
 *  a silly declared cost refuses as invalid_request instead of reaching the
 *  int4 insert (the declared cost is fingerprint-bound and persisted
 *  verbatim, so it must be storable). */
export const STORAGE_MAX_EXPECTED_COST_CLAUDIUM = 1_000_000;

export interface StoragePurchaseInput {
  accountId: number;
  itemId: string;
  expectedCostClaudium: number;
  idempotencyKey: string;
}

/** The narrow host the flow runs against (wired to the live game in
 *  server/main.ts; hand-rolled in tests). */
export interface StoragePurchaseHost {
  /** The account's ONE live character session, or null (no session, or an
   *  ambiguous multi-session account, which only GM supervision can create). */
  resolveLiveCharacter(accountId: number): { characterId: number; pid: number } | null;
  /** bankGrantStorageSlots against the live sim (the one rules body). */
  grant(pid: number, skuId: string, purchaseKey: string, dryRun: boolean): StorageGrantResult;
  /** The bank_ledger buy_slots row for an applied grant (claudium rail). */
  recordGrantLedger(
    who: { characterId: number; accountId: number },
    skuId: string,
    purchasedSlotsBefore: number,
    purchasedSlotsAfter: number,
  ): void;
  /** Durably persist the character's live state (GameServer.saveCharacter:
   *  per-character queued, so writes are ordered). false = not saved. */
  saveCharacter(characterId: number): Promise<boolean>;
  /** claudiumSpendDetailed. Fails closed with reason 'unavailable', never
   *  throws, and reports whether the request PROVABLY never reached the
   *  service (server/service_reachability.ts): the one failure shape under
   *  which no debit is possible. */
  spend(input: ClaudiumSpendInput & { kind: 'storage' }): Promise<ClaudiumSpendOutcome>;
  db: {
    begin(row: {
      realm: string;
      accountId: number;
      characterId: number;
      itemId: string;
      expectedCostClaudium: number;
      idempotencyKey: string;
    }): Promise<{ inserted: boolean; existing: StoragePurchaseRow | null }>;
    byKey(idempotencyKey: string): Promise<StoragePurchaseRow | null>;
    settle(idempotencyKey: string, status: 'applied' | 'refused' | 'unresolved'): Promise<boolean>;
    reopen(idempotencyKey: string): Promise<boolean>;
    pendingFor(characterId: number): Promise<StoragePurchaseRow[]>;
  };
  realm: string;
  /** Backoff sleep for the background settle task (tests inject an
   *  immediate resolve; production unrefs its timer). */
  delay(ms: number): Promise<void>;
  /** Dev-channel only; never player-visible text. */
  warn(message: string): void;
}

// The per-character storage-purchase mutex: characterId -> the LADDER HOLD of
// the purchase that holds it (its key, why it was taken, and when). In-process
// on purpose: a process restart clears it, and the pending TABLE plus the login
// recovery re-arm what matters. Keyed by characterId (never ws or pid) so it
// survives a linkdead resume.
//
// TWO READERS, TWO RULES (Bank Storage phase 14). The CLAUDIUM flow reads this
// table directly and serializes on mere PRESENCE, unchanged: at most one open
// purchase per character, ever. The GOLD rail reads it only through
// storagePurchaseInFlight, which applies the per-reason lifetime in
// server/storage_ladder_hold.ts, so a hold that has outlived its argued bound
// stops shutting the gold rail while still refusing a new Claudium purchase.
const inFlightByCharacter = new Map<number, LadderHold>();

/** Take the ladder for `key`. The caller has already established that no other
 *  holder exists (synchronously, before its first await). */
function takeLadderHold(characterId: number, key: string, reason: LadderHoldReason): void {
  inFlightByCharacter.set(characterId, { key, reason, sinceMs: Date.now() });
}

/** Re-label OUR hold as the flow moves between phases, restarting its clock:
 *  a purchase handed to the background retry becomes 'settling', whose bound is
 *  measured from the handoff rather than from the request that preceded it.
 *  A no-op if we no longer hold, so a lapsed or replaced hold is never revived. */
function retagLadderHold(characterId: number, key: string, reason: LadderHoldReason): void {
  const held = inFlightByCharacter.get(characterId);
  if (held?.key !== key) return;
  // NEVER DOWNGRADE A PROVEN-PENDING HOLD. The provisional scan hold and the
  // post-scan drive hold share one key (RECOVERY_HOLD_KEY), so a key-only guard
  // let a SECOND kick's admission re-stamp flip a 'recovery-drive' hold back to
  // 'recovery-scan', trading its 10-minute bound for the 60s backstop. A relog
  // or any settle fires such a kick, so the gold rail would then open a minute
  // later over a row an earlier scan had already PROVED was pending: exactly
  // the failure 'recovery-drive' exists to prevent, reintroduced by the fix for
  // it. A scan answering YES is new information; a later kick arriving is not.
  if (held.reason === 'recovery-drive' && reason === 'recovery-scan') return;
  inFlightByCharacter.set(characterId, { key, reason, sinceMs: Date.now() });
}

/** Drop a PROVISIONAL hold that has outlived its bound.
 *
 *  The recovery hold is the one entry in this table with no owning promise
 *  guaranteed to remove it: a scan that FAILS keeps it deliberately (nothing is
 *  known), and nothing else is scheduled to revisit it. Without an eviction it
 *  would sit in a module-global map for the life of the process, one per
 *  character whose scan failed, which during the pool saturation that causes
 *  those failures means many at once. A lapsed provisional hold blocks nothing
 *  (both rails read it through its bound), so dropping it is safe by the
 *  module's own policy and is what keeps this table proportional to live work.
 *  Real purchase keys are never evicted here: their release lives in a
 *  `finally`, and their presence is what serializes the Claudium rail. */
function evictLapsedRecoveryHold(characterId: number, nowMs: number): void {
  const held = inFlightByCharacter.get(characterId);
  if (!held || held.key !== RECOVERY_HOLD_KEY) return;
  if (ladderHoldBlocksGold(held, nowMs)) return;
  inFlightByCharacter.delete(characterId);
  clearYieldWarning(characterId);
}

/** The key currently holding this character's ladder, or undefined. */
function ladderHoldKey(characterId: number): string | undefined {
  return inFlightByCharacter.get(characterId)?.key;
}

/** Release, but only if `key` is still the holder. */
function releaseLadderHold(characterId: number, key: string): void {
  if (ladderHoldKey(characterId) === key) inFlightByCharacter.delete(characterId);
}

// Characters whose applied grant is between the sim mutation and its durable
// claudium bank_ledger row. The GOLD rail alone consults this (below): a gold
// rung landing in that window inserts its ledger row FIRST, so the claudium
// row lands behind it carrying a LOWER purchased_slots_after, and
// scripts/bank_audit.mjs reads that pair as purchased_regression, a
// keep-forever false positive on the rail whose whole job is to make a real
// regression visible. Deliberately NOT the purchase mutex: holding that
// across the save would answer a client's ordinary same-key retry with
// purchase_in_progress instead of the already_granted it is owed.
// characterId -> the wall clock at which the window opened, so the same
// stuck-promise backstop the ladder hold carries applies here too: this is the
// OTHER structure the gold rail reads, its release lives in a `finally`, and a
// save that never settles must not shut the rail forever.
interface LedgerOrderingHold {
  /** The purchase key that opened this window, so a CONCURRENT applied settle
   *  for the same character cannot close a window it does not own. */
  readonly key: string;
  readonly sinceMs: number;
}
const ledgerOrderingHold = new Map<number, LedgerOrderingHold>();

/** The gold-path guard (server/bank_wire.ts): while a character's storage
 *  purchase is between initiation and slot application, a conflicting
 *  ladder purchase must refuse rather than race the fit check. Slot
 *  application is not finished until the audit row is durable, so the guard
 *  spans the settle chain too (ledgerOrderingHold). */
export function storagePurchaseInFlight(characterId: number): boolean {
  const now = Date.now();
  const hold = inFlightByCharacter.get(characterId);
  if (ladderHoldBlocksGold(hold, now)) return true;
  if (hold) {
    noteLadderYield(characterId, hold, now);
    // A lapsed PROVISIONAL hold is dropped rather than kept: see
    // evictLapsedRecoveryHold. This is the reader that reliably runs again.
    evictLapsedRecoveryHold(characterId, now);
  }
  const ledgerSince = ledgerOrderingHold.get(characterId)?.sinceMs;
  if (ledgerSince === undefined) {
    // Nothing holds this character at all: forget any yield token so the map
    // stays proportional to live yields and a later incident logs again.
    if (!hold) clearYieldWarning(characterId);
    return false;
  }
  const age = now - ledgerSince;
  // Fails CLOSED on an unreadable age, exactly as the ladder-hold policy does.
  if (!Number.isFinite(age) || age < WEDGED_HOLD_MAX_MS) return true;
  noteLedgerOrderingYield(characterId, age);
  return false;
}

// A yield is the one place this module lets a gold rung past a claim that is
// still standing, so it must not be silent: without a line here the only
// surface for the residual the ladder-hold header accepts (an ambiguous spend
// that DID debit, plus a gold buy taken during the yield, settling
// 'unresolved') is the offline audit script, hours later. Dev channel only,
// never player-visible text.
//
// Once per (character, hold KEY AND REASON) so a player mashing the button
// cannot flood the log: the gold rail reads this predicate on every attempt.
//
// The reason belongs in the token for two independent cases the key alone got
// wrong. Every recovery hold carries the SAME constant key, so keying on it
// silenced every recovery yield after a character's first one, for the life of
// the process, which is precisely the signal the phase added. And one purchase
// key legitimately yields TWICE with different meanings: a 'purchase' wedge
// yield, then the 'settling' ambiguity yield after the retag; keyed on the key
// alone the wedge message suppressed the money-relevant one that followed.
//
// BOUNDED, and be exact about by what. An entry is written only when a
// character actually yields, and it is dropped when a later read of either rail
// finds that character holding nothing at all, or when a lapsed provisional
// hold is evicted. So it tracks characters with a LIVE yield plus a tail that
// clears on their next bank interaction, rather than accumulating one row per
// character that ever yielded. It is not a TTL: a character who yields once and
// never touches a bank again keeps one small entry until the process restarts.
// That is acceptable at the scale of a realm's yields, which are outage-shaped
// events, and it is written down rather than implied so nobody reads a stronger
// promise into it.
const warnedYields = new Map<number, string>();

// The ledger-ordering yield keeps its OWN map rather than sharing the one
// above. Sharing looked tidy and was a bug: the two writers hold mutually
// exclusive token shapes, and storagePurchaseInFlight can call BOTH in one
// invocation, so each overwrote the other's token, every later dedupe check
// missed, and a character with both a lapsed ladder hold and a wedged
// ledger-ordering hold emitted TWO synchronous warns per gold press. That is
// the flood the dedupe exists to prevent, doubled.
const warnedLedgerYields = new Set<number>();

/** Clear a character's yield-warning tokens once nothing is yielding for it, so
 *  the maps track live yields rather than accumulating a row per character that
 *  ever had one, and so a later incident logs again. */
function clearYieldWarning(characterId: number): void {
  warnedYields.delete(characterId);
  warnedLedgerYields.delete(characterId);
}

function noteLadderYield(characterId: number, hold: LadderHold, nowMs: number): void {
  const token = `${hold.reason}:${hold.key}`;
  if (warnedYields.get(characterId) === token) return;
  warnedYields.set(characterId, token);
  const ageSec = Math.round((nowMs - hold.sinceMs) / 1000);
  if (hold.reason === 'settling') {
    console.warn(
      `[storage-purchase] character ${characterId}: ambiguous purchase ${hold.key} has held the gold rail ${ageSec}s; yielding it. If that spend did debit, a gold rung taken now settles the purchase unresolved (scripts/bank_audit.mjs reports it).`,
    );
    return;
  }
  if (hold.reason === 'recovery-drive') {
    // Distinct from the arm above because the operator action differs: this
    // one says the DRIVE QUEUE has been saturated for the whole window, which
    // is a capacity signal (RECOVERY_DRIVE_CONCURRENCY) rather than a signal
    // about one purchase.
    console.warn(
      `[storage-purchase] character ${characterId}: a scanned pending purchase waited ${ageSec}s for a recovery drive slot; yielding the gold rail. If that purchase did debit, a gold rung taken now settles it unresolved (scripts/bank_audit.mjs reports it). A persistent wait here means the drive gate is saturated.`,
    );
    return;
  }
  // The wedge arm is a bound on a BUG, so it is the louder one: reaching it
  // means a promise that should have settled in seconds never did, and that
  // character's CLAUDIUM rail stays shut until this process restarts.
  console.warn(
    `[storage-purchase] character ${characterId}: WEDGED ${hold.reason} hold ${hold.key} stuck ${ageSec}s; yielding the gold rail. This should not happen: something in the purchase flow never settled.`,
  );
}

function noteLedgerOrderingYield(characterId: number, ageMs: number): void {
  // Same once-per-claim rule as the ladder arm above, and for a sharper reason:
  // storagePurchaseInFlight runs on EVERY gold bank_buy_slots command, which is
  // a client-driven WS path sharing a thread with the 20 Hz world loop. A
  // wedged save plus a player holding the buy button would otherwise emit a
  // synchronous console.warn per press, indefinitely.
  if (warnedLedgerYields.has(characterId)) return;
  warnedLedgerYields.add(characterId);
  console.warn(
    `[storage-purchase] character ${characterId}: WEDGED ledger-ordering hold stuck ${Math.round(ageMs / 1000)}s; yielding the gold rail. A character save never settled, so a gold rung landing now can reorder the claudium audit row.`,
  );
}

/** Test-only: clear the mutex table, the recovery-kick gate, and any
 *  configured runtime between cases. */
export function resetStoragePurchasesForTests(): void {
  inFlightByCharacter.clear();
  ledgerOrderingHold.clear();
  recoveryKicksActive = 0;
  recoveryKickQueue.length = 0;
  recoveryDrivesActive = 0;
  recoveryDriveQueue.length = 0;
  warnedYields.clear();
  warnedLedgerYields.clear();
  runtimeHostFactory = null;
}

/** An OPEN row whose grant no longer fits: the money may already be gone, so
 *  the caller must never hear an innocent ladder refusal. Answer 'unavailable'
 *  (retry-me) and let recovery drive the row to whatever the service says
 *  actually happened. */
function ambiguousOpenRow(
  host: StoragePurchaseHost,
  key: string,
  refused: string,
): ClaudiumSpendResult {
  host.warn(
    `storage purchase ${key}: open row no longer applies (${refused}); deferring to recovery`,
  );
  return refusal('unavailable');
}

const refusal = (reason: string): ClaudiumSpendResult => ({
  granted: false,
  balance: null,
  costClaudium: null,
  reason,
});

// The service's DEFINITIVE refusal vocabulary (state.md, phase 10). Only a
// granted:false carrying one of THESE settles a row 'refused': an unknown or
// null reason on a 2xx (an interposed proxy rewriting the body, service
// version skew renaming fields) could be hiding a debit behind a malformed
// reply, so it is treated exactly like 'unavailable': ambiguous, resolved
// only by retrying the SAME key. The safe failure direction on purpose: a
// NEW legitimate service refusal token added without updating this set
// retries forever instead of mis-settling a possibly-debited purchase.
// EXACTLY the six the service's spend surface declares (its own result type in
// service/src/claudium/spend.ts). 'invalid_request' used to sit here and does
// NOT belong: the service emits it only from the admin recovery surface, never
// from spend, and listing a token the spend surface cannot return inverts this
// set's whole safety direction for it. If some future version DID answer
// invalid_request after taking the money, the game would settle 'refused' over
// a live debit, which is the one outcome the classifier exists to prevent. The
// game's own invalid_request refusals never pass through here: they are
// returned to the caller directly and are never a spend RESULT.
const DEFINITIVE_REFUSAL_REASONS = new Set([
  'insufficient_balance',
  'unknown_item',
  'already_granted',
  'not_cosmetic',
  'kind_mismatch',
  'price_changed',
]);

function isAmbiguousSpendResult(result: ClaudiumSpendResult): boolean {
  return !result.granted && !DEFINITIVE_REFUSAL_REASONS.has(result.reason ?? '');
}

// The provisional recovery hold: the leading SPACE is outside the key
// charset (STORAGE_KEY_PATTERN), so it can never collide with a real key.
// Armed SYNCHRONOUSLY by kickStoragePurchaseRecovery so the gold rail is
// closed from the instant a fresh join exists, BEFORE the pending-row scan's
// database round-trip answers whether a debited-but-unapplied purchase is
// waiting (the post-restart re-arm window the verify round found).
//
// ITS LIFETIME IS (QUEUE WAIT + SCAN), and Bank Storage phase 14 cut what that
// costs. The arm still happens before the FIFO gate, because the window it
// closes is exactly "a gold command arrives before we know whether a debited
// but unapplied purchase is waiting". What changed is what the gate holds: only
// the SCAN rides a slot now, and the per-row drive (spend, apply, settle) runs
// outside it, so a restart storm drains at the rate of an indexed read rather
// than the rate of whole recoveries. The hold is also released the moment a
// scan comes back EMPTY, which is the case that used to refuse a GOLD
// bank_buy_slots to a character with no purchase at all.
//
// Do NOT "fix" the remainder by moving the arm inside run(): that reopens the
// exact race. The residual (a scan that never answers) is covered by the
// stuck-promise backstop in server/storage_ladder_hold.ts, which is a bound on
// a bug rather than a policy.
const RECOVERY_HOLD_KEY = ' recovery-scan';

interface PurchaseRef {
  accountId: number;
  characterId: number;
  itemId: string;
  expectedCostClaudium: number;
  key: string;
}

async function safeSettle(
  host: StoragePurchaseHost,
  key: string,
  status: 'applied' | 'refused' | 'unresolved',
): Promise<'settled' | 'not-pending' | 'failed'> {
  try {
    // settle() is guarded FROM pending, so a false here is not an error: it
    // means somebody else already moved the row to a terminal status. That is a
    // closed row needing no driver, and conflating it with a failed WRITE armed
    // a recovery scan for work that does not exist, on the outage path where
    // the pool is already the scarce thing.
    return (await host.db.settle(key, status)) ? 'settled' : 'not-pending';
  } catch (err) {
    // The row stays pending; the next login recovery converges it.
    host.warn(`storage purchase ${key}: settle(${status}) failed, deferred: ${String(err)}`);
    return 'failed';
  }
}

// A row settles 'applied' ONLY behind a confirmed character save: the save
// is what makes the in-blob dedupe key durable, and settling before it
// would let a crash strand a paid, recorded-applied, never-persisted grant.
// A failed or refused save (a fenced-out session after a takeover included)
// leaves the row pending on purpose; the next login replays the SAME key
// (the service answers already_granted with no second debit) against
// whatever state proved durable, applying at most once more. `onDurable`
// runs once when the save confirms: the claudium bank_ledger row rides it,
// so a fenced-out apply that never became durable writes NO audit row.
//
// KNOWN, BOUNDED AUDIT GAP (pinned by tests/server/storage_purchases.test.ts,
// queued as a maintainer ruling): the row is written ONLY by the first apply
// whose own save confirms. The replay arms cannot write it, because the sim's
// already_applied result carries no before/after pair and the historical one
// cannot be reconstructed once any other ladder move has landed. So an apply
// whose save returns false (an escrow-refused save is ordinary concurrency,
// not a failure) and whose blob then becomes durable through the periodic
// save settles 'applied' on the next replay with NO claudium ledger row. No
// money and no slots are lost and exactly-once still holds; what is lost is
// that purchase's line in the keep-forever audit rail. storage_purchases
// retains the full record until retention, and the service keeps the debit.
function scheduleAppliedSettle(
  host: StoragePurchaseHost,
  p: PurchaseRef,
  onDurable?: () => void,
): void {
  // Only the arm that WRITES the audit row takes the ordering hold; the replay
  // arms write none, so a gold buy beside them reorders nothing.
  if (onDurable) ledgerOrderingHold.set(p.characterId, { key: p.key, sinceMs: Date.now() });
  void host
    .saveCharacter(p.characterId)
    .then((saved) => {
      if (!saved) return undefined;
      onDurable?.();
      return host.db.settle(p.key, 'applied');
    })
    .catch((err) =>
      host.warn(`storage purchase ${p.key}: applied settle deferred to next login: ${String(err)}`),
    )
    .finally(() => {
      // Key-guarded, exactly as the ladder hold's release is. drivePendingPurchases
      // fires these without awaiting, so two applied settles for ONE character
      // can overlap: without the guard the first save to confirm would close the
      // second purchase's audit-ordering window while its own ledger row was
      // still unwritten, and a gold rung landing in that gap would reorder the
      // claudium row behind it.
      if (onDurable && ledgerOrderingHold.get(p.characterId)?.key === p.key) {
        ledgerOrderingHold.delete(p.characterId);
        // The window is closed, so a LATER wedged one is a new incident and
        // must be able to log again.
        warnedLedgerYields.delete(p.characterId);
      }
    });
}

// Interpret a DEFINITIVE service answer (the caller has already routed
// 'unavailable' elsewhere). Does not touch the mutex; every caller owns its
// own release.
async function settleDefinitive(
  host: StoragePurchaseHost,
  p: PurchaseRef,
  result: ClaudiumSpendResult,
): Promise<ClaudiumSpendResult> {
  if (!result.granted) {
    // A definitive refusal debits nothing (already_granted with granted
    // false included: that is the same-key different-fingerprint conflict).
    await safeSettle(host, p.key, 'refused');
    return result;
  }
  const live = host.resolveLiveCharacter(p.accountId);
  if (!live || live.characterId !== p.characterId) {
    // Dropped between spend and apply: the pending row auto-applies at the
    // character's next fresh login. Granted stays true (the money moved);
    // the reason names the deferral for the phase 12 UI.
    return { ...result, reason: 'apply_deferred' };
  }
  const applied = host.grant(live.pid, p.itemId, p.key, false);
  switch (applied.status) {
    case 'applied':
      // The audit row waits for the durability confirm: an apply whose save
      // is fenced out (a session takeover) never became real, so it must
      // write no ledger row; the durable replay writes exactly one.
      scheduleAppliedSettle(host, p, () =>
        host.recordGrantLedger(
          { characterId: p.characterId, accountId: p.accountId },
          p.itemId,
          applied.purchasedSlotsBefore,
          applied.purchasedSlotsAfter,
        ),
      );
      return result;
    case 'already_applied':
      // The crash-window replay: the slots landed under this key before.
      // Exactly-once holds because the grant refused; re-settle behind a
      // fresh save-confirm (the earlier settle may not have landed).
      scheduleAppliedSettle(host, p);
      return { ...result, reason: result.reason ?? 'already_granted' };
    default:
      // Impossible-state territory (the mutex makes an interleaved ladder
      // move unreachable; a bug or a restore from backup could still get
      // here). NEVER partial, NEVER clawback: the record survives as
      // unresolved and is surfaced for operator attention.
      host.warn(
        `storage purchase ${p.key} (${p.itemId}) granted but could not apply: ${applied.status}`,
      );
      await safeSettle(host, p.key, 'unresolved');
      return { ...result, reason: 'grant_unresolved' };
  }
}

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];

// Retry the SAME key until the service answers definitively. Owns the mutex
// it inherited; stops (releasing it) when the character leaves the realm,
// because the login recovery re-arms from the pending row.
async function settleInBackground(host: StoragePurchaseHost, p: PurchaseRef): Promise<void> {
  try {
    for (let attempt = 0; ; attempt++) {
      await host.delay(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
      const live = host.resolveLiveCharacter(p.accountId);
      if (!live || live.characterId !== p.characterId) return;
      const { result } = await host.spend({
        accountId: p.accountId,
        itemId: p.itemId,
        kind: 'storage',
        expectedCostClaudium: p.expectedCostClaudium,
        idempotencyKey: p.key,
      });
      // A never-reached retry proves nothing about the AMBIGUOUS attempt that
      // sent us here, so it is deliberately not read: this key is ambiguous
      // until the service itself answers.
      if (isAmbiguousSpendResult(result)) continue;
      await settleDefinitive(host, p, result);
      return;
    }
  } catch (err) {
    host.warn(`storage purchase ${p.key}: background settle crashed: ${String(err)}`);
  } finally {
    releaseLadderHold(p.characterId, p.key);
    // Converge any sibling pending rows this settle was masking (a second
    // row abandoned by the one-at-a-time recovery scan, or a purchase that
    // out-raced the login kick). One bounded re-kick per settle: the scan
    // finds nothing once every row is settled, so the chain terminates.
    kickStoragePurchaseRecovery(p.characterId);
  }
}

/** The /api/claudium/spend kind 'storage' branch (wired through the
 *  ClaudiumGameHooks.storagePurchase runtime hook). Returns the spend wire
 *  shape verbatim; every game-side refusal is a stable reason token the
 *  phase 12/13 UI localizes. */
export async function executeStoragePurchase(
  host: StoragePurchaseHost,
  input: StoragePurchaseInput,
): Promise<ClaudiumSpendResult> {
  const key = input.idempotencyKey;
  const live = host.resolveLiveCharacter(input.accountId);
  if (!live) return refusal('no_live_character');
  const { characterId, pid } = live;
  evictLapsedRecoveryHold(characterId, Date.now());
  const held = inFlightByCharacter.get(characterId);
  if (held && (held.key !== RECOVERY_HOLD_KEY || ladderHoldBlocksGold(held, Date.now()))) {
    // A real purchase key serializes on mere PRESENCE, unchanged and on
    // purpose: that is what stops a yielded hold from becoming a way to mint a
    // second pending row for one character during an outage.
    //
    // The PROVISIONAL hold is different and must carry its bound here too. It
    // is not a purchase: no row is known to exist behind it, and when a scan
    // FAILS it is retained precisely because nothing is known. Serializing the
    // paid rail on its presence alone made one transient pool error during a
    // restart storm disable that character's real-money purchases for the rest
    // of the session, with no way back: the blocked request returns before it
    // can arrange a re-kick, and only a fresh join clears the hold. Reading it
    // through the same lifetime the gold rail applies keeps the anti-minting
    // property (a lapsed provisional hold is indistinguishable from no hold,
    // which is the ordinary case) and gives the paid rail a bound.
    //
    // The lifetime clause is REDUNDANT with the eviction on the line above and
    // is kept as defence in depth: a QA mutation collapsing this to a bare
    // presence test survives, because evictLapsedRecoveryHold has already
    // removed exactly the holds the clause would have let through. That makes
    // it an equivalent mutant rather than a coverage gap. Keep both: the
    // eviction is an optimisation of the table, this clause is the rule, and a
    // future caller reaching the check without the eviction would need it.
    return refusal('purchase_in_progress');
  }
  // Synchronous take, before the first await: two racing requests cannot
  // both pass the check above within one microtask. Reason 'purchase': money
  // may move at any instant inside this window, so it never yields the gold
  // rail (server/storage_ladder_hold.ts).
  takeLadderHold(characterId, key, 'purchase');
  let handedOff = false;
  // Set by any exit that leaves an OPEN row behind without a driver. The kick
  // fires in the finally, AFTER the mutex is released: kicking while we still
  // hold it only arms a hold the scan immediately yields to.
  let needsRecoveryKick = false;
  try {
    // A key with recorded history answers from that record FIRST, before
    // any fresh-purchase judgment: a retry of a settled purchase must
    // surface what actually happened to the money, never be re-refused as
    // if it were new (an unresolved purchase at a full ladder would
    // otherwise read as an innocent does_not_fit).
    const prior = await host.db.byKey(key);
    if (prior) {
      if (
        prior.accountId !== input.accountId ||
        prior.characterId !== characterId ||
        prior.itemId !== input.itemId ||
        prior.expectedCostClaudium !== input.expectedCostClaudium
      ) {
        // Cross-purchase key reuse: the same conflict shape the service
        // maps to already_granted with granted false.
        return refusal('already_granted');
      }
      if (prior.status === 'applied') {
        return { granted: true, balance: null, costClaudium: null, reason: 'already_granted' };
      }
      if (prior.status === 'unresolved') {
        return { granted: true, balance: null, costClaudium: null, reason: 'grant_unresolved' };
      }
    }
    // A PENDING prior means this key may already have taken the money. The
    // dry run below judges the CURRENT ladder, so if it now refuses on ladder
    // state (the position moved under an open purchase) answering with its
    // innocent token would tell the client "nothing happened" over a possible
    // debit. Answer ambiguously instead and hand the row to recovery, which
    // spends the same key and settles it applied, refused, or unresolved:
    // whatever actually happened to the money. A pending prior that still
    // FITS falls through unchanged, which is the ordinary same-key retry.
    const priorPending = prior?.status === 'pending';
    // Pre-spend validation at the one sim entry point (fit, next-rung,
    // replay). Refuse BEFORE any money moves.
    const pre = host.grant(pid, input.itemId, key, true);
    switch (pre.status) {
      case 'unknown_sku':
        return refusal('unknown_item');
      case 'invalid_key':
        return refusal('invalid_request');
      case 'no_player':
        return refusal('no_live_character');
      case 'not_next_rung':
        if (priorPending) {
          needsRecoveryKick = true;
          return ambiguousOpenRow(host, key, 'not_next_rung');
        }
        return refusal('not_next_rung');
      case 'does_not_fit':
        if (priorPending) {
          needsRecoveryKick = true;
          return ambiguousOpenRow(host, key, 'does_not_fit');
        }
        return refusal('does_not_fit');
      case 'already_applied':
        // The key is already inside the character's bank blob: this receipt
        // landed once. Answer the replay without spending, and (re)settle
        // the row behind a save-confirm in case the first settle never
        // landed.
        scheduleAppliedSettle(host, {
          accountId: input.accountId,
          characterId,
          itemId: input.itemId,
          expectedCostClaudium: input.expectedCostClaudium,
          key,
        });
        return { granted: true, balance: null, costClaudium: null, reason: 'already_granted' };
      case 'applied':
        // dryRun never applies; this arm only keeps the switch exhaustive.
        // Refuse closed rather than throw: handleClaudiumApi never throws.
        host.warn(`storage purchase ${key}: dry run unexpectedly returned applied`);
        return refusal('unavailable');
      case 'fits':
        break;
    }
    // Persist the pending record BEFORE the service call: written and
    // durable before any money moves, so the purchase is recoverable. The
    // upsert re-reads under the unique key, so a same-key race that slipped
    // past the byKey read above still converges on one row.
    const begun = await host.db.begin({
      realm: host.realm,
      accountId: input.accountId,
      characterId,
      itemId: input.itemId,
      expectedCostClaudium: input.expectedCostClaudium,
      idempotencyKey: key,
    });
    // Whether NO OTHER ATTEMPT under this key can have debited, which is the
    // precondition for reading a transport fact as a definitive answer below.
    //
    // TWO AXES, and the second is easy to miss. The EARLIER axis is argued
    // below. The CONCURRENT axis is that nothing else may spend this key
    // between the flag being computed and the spend being answered: a recovery
    // kick fired by any settle or fresh join scans the same table and would see
    // the very row this request just reopened. That axis is closed elsewhere,
    // by drivePendingPurchases refusing to drive any row while a REAL purchase
    // key holds the character's ladder (it returns unless the holder is the
    // provisional key), which is exactly the window this flag lives in. Stated
    // here because the guard that closes it is 400 lines away and a reader of
    // this paragraph alone would conclude the flag is unsound.
    // A fresh insert qualifies. So does reopening a row this request has just
    // proved is 'refused' with a matching fingerprint: 'refused' is written on
    // exactly two paths, a DEFINITIVE service refusal and the never-reached
    // outage arm, and neither moves money for this purchase. Without the second
    // case the phase's own goal regressed on the most ordinary input there is,
    // a player pressing an unresponsive buy button twice: press two reopened
    // the row, saw begun.inserted false, and handed a provably debit-free
    // purchase to the ambiguity retry, shutting that player's GOLD rail for ten
    // minutes during the very outage this phase exists to keep it open through.
    let noPriorDebitPossible = begun.inserted;
    if (!begun.inserted) {
      const row = begun.existing;
      if (!row) return refusal('unavailable');
      // Same four-field identity check the byKey read above performs, repeated
      // because this arm answers a DIFFERENT row: byKey saw no row, so this one
      // was inserted by someone else between the two reads. Without the recheck
      // a colliding key would let this flow reopen, spend against, and settle
      // another account's pending purchase. settle() and reopen() are keyed by
      // idempotency_key alone, so the identity guard has to live here.
      if (
        row.accountId !== input.accountId ||
        row.characterId !== characterId ||
        row.itemId !== input.itemId ||
        row.expectedCostClaudium !== input.expectedCostClaudium
      ) {
        return refusal('already_granted');
      }
      if (row.status === 'applied') {
        return { granted: true, balance: null, costClaudium: null, reason: 'already_granted' };
      }
      if (row.status === 'unresolved') {
        return { granted: true, balance: null, costClaudium: null, reason: 'grant_unresolved' };
      }
      if (row.status === 'refused') {
        // The service keeps no record of a refusal, so a same-key retry is
        // a legitimate fresh attempt. The reopen can legitimately MISS: the
        // retention sweep may delete the aged refused row between our read
        // and this update, and spending with no durable row would leave a
        // crash window with a debit and no record, so re-insert and only
        // proceed once a pending row provably exists.
        if (await host.db.reopen(key)) {
          // We moved it from 'refused' back to 'pending' ourselves, so the
          // attempt that settled it left no debit behind.
          noPriorDebitPossible = true;
        } else {
          const again = await host.db.begin({
            realm: host.realm,
            accountId: input.accountId,
            characterId,
            itemId: input.itemId,
            expectedCostClaudium: input.expectedCostClaudium,
            idempotencyKey: key,
          });
          if (!again.inserted && again.existing?.status !== 'pending') {
            return refusal('unavailable');
          }
          // A fresh insert here means the aged refused row was swept between
          // our read and the reopen, which again leaves no debit. Landing on
          // somebody else's PENDING row does not: that one may have debited.
          if (again.inserted) noPriorDebitPossible = true;
        }
      }
      // status 'pending' (or just reopened / re-inserted): fall through.
    }
    const p: PurchaseRef = {
      accountId: input.accountId,
      characterId,
      itemId: input.itemId,
      expectedCostClaudium: input.expectedCostClaudium,
      key,
    };
    // RE-TAKEN AT THE LAST INSTANT BEFORE MONEY CAN MOVE, and this is not
    // hygiene. The stuck-promise backstop is a duration measured from when the
    // hold was taken, and the work above it is 2 to 4 database round trips
    // (byKey, begin, and on the reopen arm a reopen plus a second begin), each
    // able to cost the pool's connect timeout plus its statement timeout. On a
    // degraded-but-alive database that sum can exceed the backstop, so a hold
    // taken before them could lapse WHILE the spend was still to come: the gold
    // rail would open, take the rung, and leave this spend debiting for a rung
    // it can no longer apply. Restarting the clock here makes the backstop what
    // it claims to be, a bound on a stuck promise rather than on the database.
    retagLadderHold(characterId, key, 'purchase');
    const { result, neverReached } = await host.spend({
      accountId: input.accountId,
      itemId: input.itemId,
      kind: 'storage',
      expectedCostClaudium: input.expectedCostClaudium,
      idempotencyKey: key,
    });
    if (isAmbiguousSpendResult(result)) {
      // THE OUTAGE ARM (Bank Storage phase 14). The request provably never
      // reached the service, so no debit is possible and there is nothing to
      // protect: settle the row and hold nothing, leaving the character's GOLD
      // rung working through an outage that could otherwise shut it for as long
      // as the service stayed down.
      //
      // Gated on `noPriorDebitPossible`, and that gate is load-bearing: the
      // transport fact covers THIS request only. A row this request did not
      // establish as debit-free means an earlier attempt under this key may
      // have reached the service and debited, and answering that with a
      // definitive 'refused' is exactly the mis-settle the classifier exists to
      // prevent. In particular a row left PENDING by somebody else never
      // qualifies. 'refused' is the right terminal state rather than a delete:
      // the service kept no record either, so a same-key retry legitimately
      // reopens it, and that reopen is itself proof of no debit.
      if (neverReached && noPriorDebitPossible) {
        // The one site in the system that concludes "no money moved" from a
        // transport fact rather than from the service, so it says so. Without
        // this line a misclassification would erase its own evidence: the row
        // it writes is 'refused', which is the one status retention sweeps.
        host.warn(
          `storage purchase ${key}: spend never reached the service, settling refused (no debit possible)`,
        );
        // The settle can FAIL, and it fails on exactly the infrastructure
        // trouble that accompanies an economy outage. Without this check the
        // row would stay 'pending' with the hold released and no driver
        // arranged, so the gold rail would open over a row nothing was going to
        // revisit until the character's next login. No money is at risk in this
        // particular case (the spend provably never reached the service), but
        // the module's claim is that NO exit leaves an open row without a
        // driver, and this is the exit that used to.
        if ((await safeSettle(host, key, 'refused')) === 'failed') {
          needsRecoveryKick = true;
        }
        return refusal('unavailable');
      }
      // Ambiguous outcome ('unavailable', or a granted:false whose reason is
      // outside the definitive vocabulary): the background task inherits the
      // mutex and retries the SAME key until the service answers
      // definitively. The client sees unavailable and may itself retry. The
      // hold becomes 'settling', the one reason with an argued yield, because
      // the service may stay unreachable for hours.
      handedOff = true;
      retagLadderHold(characterId, key, 'settling');
      void settleInBackground(host, p);
      return refusal('unavailable');
    }
    return await settleDefinitive(host, p, result);
  } catch (err) {
    // A database or host failure must degrade to the typed refusal shape,
    // never a thrown promise into handleClaudiumApi (which promises to
    // never throw). Nothing is lost: if the throw pre-dates the spend no
    // money moved, and if the pending row exists the next same-key retry or
    // login recovery converges it. 'unavailable' tells the client exactly
    // that: retry the same key.
    host.warn(`storage purchase ${key} failed closed: ${String(err)}`);
    // The one settle exit that used to release the mutex with NO driver left
    // behind. If the throw came after the spend, the row is pending over a
    // possible debit, and nothing would revisit it until the character's next
    // login. Every other exit either settles the row or hands it to the
    // background task (whose own finally re-kicks); this one now matches them,
    // so the module's "no pending row is left holding a debit without a driver
    // while its character stays online" claim holds on every path. The kick is
    // fire-and-forget, concurrency-bounded, and a no-op with no runtime wired.
    needsRecoveryKick = true;
    return refusal('unavailable');
  } finally {
    if (!handedOff) releaseLadderHold(characterId, key);
    // After the mutex is released, so the scan can take the row rather than
    // yield to our own dying flow.
    if (needsRecoveryKick) kickStoragePurchaseRecovery(characterId);
  }
}

// The production host, injected from server/main.ts at module scope (the
// configureClaudiumRuntime pattern: a deferred liveGame() factory, read at
// call time). Absent in tests and tools, where the recovery kick is a no-op
// and rows simply stay pending.
let runtimeHostFactory: (() => StoragePurchaseHost) | null = null;

export function configureStoragePurchaseRuntime(factory: () => StoragePurchaseHost): void {
  runtimeHostFactory = factory;
}

// Login-storm bound for the recovery kicks: every fresh join fires one
// pendingStoragePurchasesForCharacter query, and a restart re-admits the
// whole realm at once, so the kicks queue through a small FIFO gate instead
// of racing the joins' own queries for the pool. Nothing is dropped, only
// serialized. A slot covers the SCAN ALONE (Bank Storage phase 14): drain time
// is bounded by an indexed read rather than by the slowest recoveries ahead of
// you, which is what stopped a restart storm from refusing a GOLD rung to
// players with no purchase at all. See RECOVERY_HOLD_KEY. Row work is bounded
// separately, by the drive gate below.
const RECOVERY_KICK_CONCURRENCY = 4;
let recoveryKicksActive = 0;
const recoveryKickQueue: (() => void)[] = [];

// The DRIVE gate. Row work left the scan's gate in phase 14 so that no player
// waits for another player's money before their GOLD rail reopens, but it must
// not therefore be unbounded: the population of pending rows is exactly
// correlated with the incident that produces a mass recovery (a realm restart
// during or after an economy-service outage), and every drive costs an outbound
// spend, a character save and one or two writes against a pool the game loop
// shares. So drives get their OWN queue: wider than the scan gate, because a
// drive is slow by nature and the point is to bound the pool rather than to
// serialize recovery, and separate from it, because a drive waiting for a slot
// must never hold up somebody else's scan.
export const RECOVERY_DRIVE_CONCURRENCY = 8;
let recoveryDrivesActive = 0;
const recoveryDriveQueue: (() => void)[] = [];

// Shared shape for both gates. `next()` is dispatched on a fresh microtask so a
// synchronous throw inside a queued task cannot ride back into the finishing
// task's promise chain, where it would release the WRONG character's hold and
// strand the slot the shifted task had just consumed.
//
// Also defence in depth, and unpinned for the same reason as releaseSlot above:
// both queued shapes are `void <async fn>(...)` with only chained handlers, so
// neither can throw synchronously today and a mutation removing the microtask
// survives every test. Keep it: the property it protects is not local to this
// function, and a future queued task with a synchronous prologue would
// reintroduce exactly the cross-character release this prevents.
function advanceGate(queue: (() => void)[], release: () => void): void {
  const next = queue.shift();
  if (next) queueMicrotask(next);
  else release();
}

function runNextRecoveryKick(): void {
  // Clamped: resetStoragePurchasesForTests zeroes the counter, so an in-flight
  // kick settling afterwards would otherwise drive it NEGATIVE and let the
  // gate admit more than RECOVERY_KICK_CONCURRENCY forever after.
  advanceGate(recoveryKickQueue, () => {
    recoveryKicksActive = Math.max(0, recoveryKicksActive - 1);
  });
}

function runNextRecoveryDrive(): void {
  advanceGate(recoveryDriveQueue, () => {
    recoveryDrivesActive = Math.max(0, recoveryDrivesActive - 1);
  });
}

/** Run one character's row work under the drive gate, releasing the slot and
 *  the character's recovery hold exactly once however it ends. */
function queueRecoveryDrive(
  host: StoragePurchaseHost,
  characterId: number,
  rows: StoragePurchaseRow[],
): void {
  const run = (): void => {
    void drivePendingPurchases(host, characterId, rows)
      .catch((err) =>
        host.warn(`storage purchase recovery kick for character ${characterId}: ${String(err)}`),
      )
      .finally(() => {
        releaseRecoveryHold(characterId);
        runNextRecoveryDrive();
      });
  };
  if (recoveryDrivesActive < RECOVERY_DRIVE_CONCURRENCY) {
    recoveryDrivesActive++;
    run();
  } else {
    recoveryDriveQueue.push(run);
  }
}

// Lift the provisional hold once its scan has answered; a real purchase key
// that replaced it (the scan found and took a pending row) is left alone.
function releaseRecoveryHold(characterId: number): void {
  releaseLadderHold(characterId, RECOVERY_HOLD_KEY);
}

/** The fresh-join hook (server/ws_auth.ts): fire-and-forget recovery of this
 *  character's pending purchases against the configured runtime host. Never
 *  throws into the join path; concurrency-bounded for login storms. Arms the
 *  PROVISIONAL hold synchronously (before the join's ws message handler can
 *  deliver a first gold buy), so the gold rail is closed until this kick's
 *  scan answers. A player's own first purchase in that window sees
 *  purchase_in_progress and retries. The window is the queue wait plus the
 *  scan, not the scan alone (see RECOVERY_HOLD_KEY). */
export function kickStoragePurchaseRecovery(characterId: number): void {
  if (!runtimeHostFactory) return;
  if (!inFlightByCharacter.has(characterId)) {
    takeLadderHold(characterId, RECOVERY_HOLD_KEY, 'recovery-scan');
  }
  const run = (): void => {
    // Exactly one release per admitted kick, whatever path the run takes: a
    // double release would let the gate admit more than its concurrency, and a
    // missed one would shrink it by a slot for the life of the process.
    //
    // DEFENCE IN DEPTH, and deliberately unpinned: a QA mutation pass removed
    // this guard and no test could tell, in either database arm. That is
    // correct rather than a coverage gap. The only way to release twice is for
    // the `.then` below to throw AFTER calling releaseSlot, sending the chain
    // into its `.catch`, and that body holds nothing that can throw (Map writes
    // plus queueRecoveryDrive, which only increments a counter or pushes to an
    // array). The guard stays because the `.then` is not required to stay that
    // way; do not delete it on the strength of a green suite.
    let slotReleased = false;
    const releaseSlot = (): void => {
      if (slotReleased) return;
      slotReleased = true;
      runNextRecoveryKick();
    };
    // Re-arm the provisional hold's clock at ADMISSION, not at the arm. The
    // hold is taken synchronously at the kick so the gold rail is shut before
    // the client's first command, but a kick can then WAIT in this gate, and
    // its bound is documented as covering the scan. Without this re-stamp a
    // deep kick queue eats the scan's own budget, so the hold could lapse part
    // way through a scan that was running perfectly normally.
    //
    // THE RESIDUAL THIS DOES NOT CLOSE, stated rather than left to be
    // rediscovered: a kick still WAITING in the queue keeps the clock it was
    // armed with, so a queue that takes longer than the bound to reach a
    // character lets that character's provisional hold lapse before its scan
    // runs at all, opening the gold rail with no knowledge of whether a
    // possibly-debited row is waiting. Closing it needs the gate to re-stamp
    // every waiter on each release, which is O(queue) per slot. It is left open
    // deliberately: unlike the drive queue (8-wide, each drive parked on a
    // 5s spend, so ~96 characters is enough to cross the bound and that case IS
    // fixed at the queue-entry retag below), this gate is 4-wide over a single
    // indexed read, so reaching it needs a database degraded to seconds per
    // scan during a restart storm. Left as a maintainer tuning call rather
    // than solved speculatively: ordinary pool saturation is the realistic
    // way in, since a checkout that rejects at the pool's connect timeout
    // makes every gate slot burn that timeout.
    retagLadderHold(characterId, RECOVERY_HOLD_KEY, 'recovery-scan');
    let host: StoragePurchaseHost;
    try {
      host = runtimeHostFactory?.() as StoragePurchaseHost;
      if (!host) {
        releaseRecoveryHold(characterId);
        releaseSlot();
        return;
      }
    } catch (err) {
      console.warn(`[storage-purchase] recovery host unavailable: ${String(err)}`);
      releaseRecoveryHold(characterId);
      releaseSlot();
      return;
    }
    // ONLY THE SCAN RIDES THE SLOT. Row work (a service spend, an apply, a
    // settle) can take seconds and belongs to one character; making the rest of
    // the realm queue behind it is what turned a login storm into refused GOLD
    // buys for players with no purchase at all.
    void scanPendingPurchases(host, characterId)
      .then((rows) => {
        releaseSlot();
        if (rows === null) {
          // The scan FAILED, so nothing is known. Treating that as "nothing was
          // waiting" would open the gold rail on exactly the incident that
          // produces pending rows: the scan errors when the pool is saturated,
          // which is the restart storm after an outage. Keep the provisional
          // hold and let its bound expire instead, so an unknown answer costs a
          // bounded delay rather than a gold rung landing on a live debit. A
          // re-kick (every settle fires one) or the next login re-scans.
          return undefined;
        }
        if (rows.length === 0) {
          // Nothing was waiting: the provisional hold has answered its question
          // and the gold rail reopens immediately.
          releaseRecoveryHold(characterId);
          return undefined;
        }
        // The scan ANSWERED YES, so this character's money may already have
        // moved and the provisional claim stops being provisional. Re-arm it
        // under the reason whose bound covers a wait it does not control: the
        // drive QUEUE. Without this the hold kept the 60s stuck-promise
        // backstop it was armed with, measured from the kick, so a saturated
        // drive gate (a restart storm after a service outage, exactly what
        // this gate exists for) let the gold rail open over a row the scan had
        // just proved was pending. Retag is a no-op if a real purchase key has
        // taken the ladder in the meantime, which is the correct outcome: that
        // holder owns its own bound.
        retagLadderHold(characterId, RECOVERY_HOLD_KEY, 'recovery-drive');
        // Row work runs under its OWN bounded gate, so this character's scan
        // slot is already back in circulation while its money is still moving.
        queueRecoveryDrive(host, characterId, rows);
        return undefined;
      })
      .catch((err) => {
        // scanPendingPurchases resolves rather than rejects, so this is the
        // impossible-state net; it must still not strand a slot or a hold.
        console.warn(`[storage-purchase] recovery kick crashed: ${String(err)}`);
        releaseSlot();
        releaseRecoveryHold(characterId);
      });
  };
  if (recoveryKicksActive < RECOVERY_KICK_CONCURRENCY) {
    recoveryKicksActive++;
    run();
  } else {
    recoveryKickQueue.push(run);
  }
}

/** The AWAITED scan-plus-drive composition, and it is a TEST-FACING seam, not
 *  the production login hook. Nothing in server/ calls it: production enters
 *  through `kickStoragePurchaseRecovery` (below), which composes these same two
 *  halves and adds everything that makes the login covenant work, namely the
 *  synchronous provisional ladder hold, the login-storm gate, the clock retag
 *  at admission and the release when the scan comes back empty.
 *
 *  Kept rather than deleted because the recovery CONTRACT reads far better in
 *  an awaitable form than through a fire-and-forget kick, and nine cases in
 *  tests/server/storage_purchases.test.ts drive it that way. A reader auditing
 *  the login rail wants the kick; a test wanting to observe a settled row wants
 *  this. Do not re-word this header to claim ws_auth calls it: it said exactly
 *  that for nineteen phases and sent every reader to the wrong function. */
export async function resumeStoragePurchasesAtLogin(
  host: StoragePurchaseHost,
  characterId: number,
): Promise<void> {
  const rows = await scanPendingPurchases(host, characterId);
  if (rows === null || rows.length === 0) return;
  await drivePendingPurchases(host, characterId, rows);
}

/** The scan half: one indexed read, never throwing. null means the read
 *  failed and the next login converges the rows. Split out because it is the
 *  ONLY part of a recovery that rides the login-storm gate. */
async function scanPendingPurchases(
  host: StoragePurchaseHost,
  characterId: number,
): Promise<StoragePurchaseRow[] | null> {
  try {
    return await host.db.pendingFor(characterId);
  } catch (err) {
    host.warn(`storage purchase recovery for character ${characterId} skipped: ${String(err)}`);
    return null;
  }
}

/** The drive half: retry each open row's SAME key until the service answers.
 *  Runs OUTSIDE the login-storm gate, because it can take a whole service
 *  round trip per row and it concerns exactly one character. */
async function drivePendingPurchases(
  host: StoragePurchaseHost,
  characterId: number,
  rows: StoragePurchaseRow[],
): Promise<void> {
  for (const row of rows) {
    // The provisional hold is OURS to take over; any other holder is a real
    // purchase in flight (its settle re-kicks recovery, so the skipped rows
    // are not abandoned).
    const holder = ladderHoldKey(characterId);
    if (holder !== undefined && holder !== RECOVERY_HOLD_KEY) return;
    // Replaces the provisional hold with no gap, under the reason that never
    // yields: this row's money may already have moved.
    takeLadderHold(characterId, row.idempotencyKey, 'purchase');
    let handedOff = false;
    try {
      const live = host.resolveLiveCharacter(row.accountId);
      if (!live || live.characterId !== characterId) return;
      const p: PurchaseRef = {
        accountId: row.accountId,
        characterId,
        itemId: row.itemId,
        expectedCostClaudium: row.expectedCostClaudium,
        key: row.idempotencyKey,
      };
      // The key inside the FRESHLY LOADED blob proves the apply is already
      // durable; only the row settle is owed. Everything else goes through
      // the same-key spend retry (already_granted replays with no second
      // debit; a real refusal settles refused; an impossible-state apply
      // failure settles unresolved).
      const pre = host.grant(live.pid, row.itemId, row.idempotencyKey, true);
      if (pre.status === 'already_applied') {
        scheduleAppliedSettle(host, p);
        continue;
      }
      const { result } = await host.spend({
        accountId: row.accountId,
        itemId: row.itemId,
        kind: 'storage',
        expectedCostClaudium: row.expectedCostClaudium,
        idempotencyKey: row.idempotencyKey,
      });
      // A recovered row's history is unknowable from here: the attempt that
      // created it may have reached the service and debited, so a never-reached
      // retry is deliberately NOT read as a definitive refusal.
      if (isAmbiguousSpendResult(result)) {
        handedOff = true;
        retagLadderHold(characterId, row.idempotencyKey, 'settling');
        void settleInBackground(host, p);
        return;
      }
      await settleDefinitive(host, p, result);
    } catch (err) {
      host.warn(
        `storage purchase recovery ${row.idempotencyKey} failed, still pending: ${String(err)}`,
      );
    } finally {
      if (!handedOff) releaseLadderHold(characterId, row.idempotencyKey);
    }
  }
}
