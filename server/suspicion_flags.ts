// Suspicion-flag emitters and the Flagged-view cache: the logic half over
// suspicion_flags_db.ts. Two emitters feed the store today:
//
//   1. Bot detector: the detector PUSHES at its own decision points through
//      the BotDetectorHost it is handed at boot (attachDetectorFlagHost, one
//      line in server/game.ts). It records a case when it decides one, and
//      refreshes the case's details when the evidence behind it grows; nothing
//      here polls or samples detector state, so occurrences counts decisions
//      and last_seen_at is a real observation time. Storage policy, including
//      the write cadence, stays on this side of the seam: the detector build
//      is bundled independently, so refreshes are paced and coalesced per
//      account here rather than trusted to the detector's own pacing. Writes
//      ride a fire-and-forget FIFO (the bank_ledger.ts pattern).
//   2. Registration bursts: moderation_db.ts calls flagRegistrationBurst
//      beside its existing automated player_report, carrying the tripped
//      signals and the burst cohort as related accounts.
//
// The economy-watch detectors are the intended third emitter: mint flags with
// source 'economy_watch' through upsertSuspicionFlag and everything downstream
// (workflow, audit trail, admin UI) works unchanged.

import type {
  BotDetector,
  BotDetectorHost,
  SuspicionFlagObservation,
} from './bot_detector/contract';
import { type CachedRead, createCachedRead } from './cached_read';
import { DETECTOR_FLAG_SEVERITY, severityForRegistrationBurst } from './suspicion_flag_workflow';
import {
  refreshSuspicionFlagDetails as refreshFlagDetailsSql,
  SUSPICION_FLAG_DETAILS_MAX,
  type SuspicionFlagDataset,
  upsertSuspicionFlag,
} from './suspicion_flags_db';

// One flag per account per detector, not per evidence row: the kind is stable
// so repeat decisions bump one active flag instead of stacking rows.
export const DETECTOR_FLAG_KIND = 'session_automation';

// The per-account floor between two details refreshes. Sits under the
// detector's own pacing (it refreshes at most every 30 s per case), so a
// well-behaved detector never hits it; a runaway one is capped at one indexed
// UPDATE per account per window, and its latest summary still lands on the
// next accepted refresh (every summary is the whole evidence list, not a
// delta). A queued refresh for the same account is replaced, latest wins, so
// a slow database never stacks duplicate rewrites.
export const DETECTOR_FLAG_REFRESH_FLOOR_MS = 10_000;

// The fire-and-forget FIFO (the bank_ledger.ts recordBankOp shape): callers on
// the tick path never await; failures log and drop the one write. Each write
// also resolves its own outcome for a caller that wants it (the detector host
// hands it back to the detector so a lost write can be retried). The Flagged
// view cache busts only for writes that change the flag set or its ordering
// (a record, a burst); a details refresh rides the 15 s TTL, or the cache
// would be busted every few seconds by a handful of live confirmed sessions.
let writeTail: Promise<void> = Promise.resolve();

function enqueueFlagWrite(run: () => Promise<void>, bust: boolean): Promise<boolean> {
  const landed = writeTail.then(run).then(
    () => {
      if (bust) bustSuspicionFlagCache();
      return true;
    },
    (err) => {
      console.error('suspicion flag write failed:', err);
      return false;
    },
  );
  writeTail = landed.then(() => {});
  return landed;
}

/** Drain pending flag writes (shutdown, tests). */
export function suspicionFlagsIdle(): Promise<void> {
  return writeTail.then(() => {});
}

function validObservation(observation: SuspicionFlagObservation): boolean {
  return Number.isSafeInteger(observation.accountId) && observation.accountId > 0;
}

interface PendingRefresh {
  details: string;
  landed: Promise<boolean>;
}

/**
 * The host the detector pushes through. Storage policy stays here: source,
 * kind, severity, dedupe (the active partial index), the details cap, and the
 * refresh cadence. The detector supplies the decision and its own evidence
 * summary, nothing else.
 */
export function createDetectorFlagHost(now: () => number = () => Date.now()): BotDetectorHost {
  const lastRefreshAt = new Map<number, number>();
  const pendingRefresh = new Map<number, PendingRefresh>();
  const forgetStaleRefreshes = (at: number): void => {
    if (lastRefreshAt.size <= 10_000) return;
    for (const [accountId, last] of lastRefreshAt) {
      if (at - last >= DETECTOR_FLAG_REFRESH_FLOOR_MS) lastRefreshAt.delete(accountId);
    }
  };
  return {
    recordSuspicionFlag(observation) {
      if (!validObservation(observation)) return Promise.resolve(false);
      return enqueueFlagWrite(
        () =>
          upsertSuspicionFlag({
            accountId: observation.accountId,
            source: 'bot_detector',
            kind: DETECTOR_FLAG_KIND,
            severity: DETECTOR_FLAG_SEVERITY,
            details: observation.details.slice(0, SUSPICION_FLAG_DETAILS_MAX),
          }),
        true,
      );
    },
    refreshSuspicionFlagDetails(observation) {
      if (!validObservation(observation)) return Promise.resolve(false);
      const accountId = observation.accountId;
      const queued = pendingRefresh.get(accountId);
      if (queued) {
        queued.details = observation.details;
        return queued.landed;
      }
      const at = now();
      const last = lastRefreshAt.get(accountId);
      if (last !== undefined && at - last < DETECTOR_FLAG_REFRESH_FLOOR_MS) {
        return Promise.resolve(true);
      }
      lastRefreshAt.set(accountId, at);
      forgetStaleRefreshes(at);
      const pending: PendingRefresh = {
        details: observation.details,
        landed: Promise.resolve(true),
      };
      pendingRefresh.set(accountId, pending);
      pending.landed = enqueueFlagWrite(async () => {
        pendingRefresh.delete(accountId);
        await refreshFlagDetailsSql({
          accountId,
          source: 'bot_detector',
          kind: DETECTOR_FLAG_KIND,
          details: pending.details.slice(0, SUSPICION_FLAG_DETAILS_MAX),
        });
      }, false);
      return pending.landed;
    },
  };
}

/**
 * Boot wiring: hand the detector its host if this detector build accepts one.
 * Returns whether it did, and says so on the console either way, so an
 * operator reading the boot log knows where automated cases land (Flagged, or
 * the Reports inbox the detector falls back to without a host).
 */
export function attachDetectorFlagHost(
  detector: BotDetector,
  log: (line: string) => void = (line) => console.log(line),
): boolean {
  if (typeof detector.attachHost !== 'function') {
    log('[bot-detector] suspicion-flag host: not accepted by this detector build');
    return false;
  }
  detector.attachHost(createDetectorFlagHost());
  log('[bot-detector] suspicion-flag host: attached');
  return true;
}

/** The registration-burst emitter, called by moderation_db.ts beside its
 *  automated report. Fire-and-forget like the detector hook. */
export function flagRegistrationBurst(input: {
  accountId: number;
  signals: readonly string[];
  cohortAccountIds: readonly number[];
}): void {
  if (input.signals.length === 0) return;
  enqueueFlagWrite(
    () =>
      upsertSuspicionFlag({
        accountId: input.accountId,
        source: 'registration_burst',
        kind: 'registration_burst',
        severity: severityForRegistrationBurst(input.signals.length),
        details: `Automated registration pattern: ${input.signals.join('; ')}`.slice(
          0,
          SUSPICION_FLAG_DETAILS_MAX,
        ),
        relatedAccountIds: input.cohortAccountIds,
      }),
    true,
  );
}

// ---------------------------------------------------------------------------
// The Flagged-view cache: single-key, single-flight, short TTL, bust-wired to
// every flag write (emitter upserts above, workflow transitions and notes via
// bustSuspicionFlagCache from the admin handlers).
// ---------------------------------------------------------------------------

export const SUSPICION_FLAG_LIST_TTL_MS = 15_000;

let datasetSource: (() => Promise<SuspicionFlagDataset>) | null = null;
let datasetCache: CachedRead<SuspicionFlagDataset> | null = null;

/** Inject the dataset SQL read (boot wiring, or a test fake). */
export function configureSuspicionFlagDataset(source: () => Promise<SuspicionFlagDataset>): void {
  datasetSource = source;
  datasetCache = null;
}

/** Clear the injected source and cache (test-only). */
export function resetSuspicionFlagDatasetForTests(): void {
  datasetSource = null;
  datasetCache = null;
}

/** The cached Flagged-view dataset both admin dispatch arms read. */
export function readSuspicionFlagDataset(): Promise<SuspicionFlagDataset> {
  if (datasetSource === null) {
    throw new Error(
      'suspicion flag dataset source is not configured; call configureSuspicionFlagDataset',
    );
  }
  const source = datasetSource;
  datasetCache ??= createCachedRead(() => source(), { ttlMs: SUSPICION_FLAG_LIST_TTL_MS });
  return datasetCache.read();
}

/** Bust the Flagged-view cache; wired to every flag write so an admin's
 *  transition or a fresh detection is visible on the next read. */
export function bustSuspicionFlagCache(): void {
  datasetCache?.bust();
}
