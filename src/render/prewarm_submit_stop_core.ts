// The compile-submit lane's HARD STOP: the bound that exists when the manifest
// deadline is not one.
//
// prewarmSubmitShouldStop's deadline clause is exempted by
// finishFullManifestBeforeReveal (desktop Insane's contract is a complete
// manifest behind the loading cover), so on that arm the submit loop had no
// stop at all. Two production shapes paid for the rules below:
//   - 17/08 prod login: 'programs.compile-submit' spent 11843.9 ms of the 12 s
//     budget and the twelve entries behind it timed out.
//   - the boot scene sweep (tests/reveal_gate_wiring.test.ts): units whose
//     programs were ALREADY linked (entity views hidden behind their live
//     compile gates) settle instantly, the AIMD reads instant settles as
//     headroom, the window grows, and the lane submits to the wall.
// So both rules here are independent of finishFullManifestBeforeReveal, and
// both measure the SUBMIT LANE alone, from its FIRST submission, never from
// the manifest start: the lane's own runaway is what they bound, not the work
// that ran before it.
//
// Deferred units are not lost when a stop fires: the caller pushes them to its
// deferred list and the post-manifest hand-off gives them to the resume lane,
// exactly as a deadline stop does.
//
// Pure and clock-free (every reading is injected), so a test drives the whole
// runaway on a fake clock with no timers.

/** Which rule stopped the lane. Reported on the verdict, in the pacing
 *  receipt, and as the key of the one `submit-stop` gpu-prep event. */
export type PrewarmSubmitStopReason = 'lane-max' | 'no-useful-link';

export interface PrewarmSubmitStopConfig {
  /** Wall clock the lane may spend from its FIRST submission, whatever it is
   *  achieving. Half the soft manifest budget: it would have caught the prod
   *  run at less than half of its 11.8 s. */
  laneMaxMs: number;
  /** How long the lane may keep submitting with no unit reporting a POSITIVE
   *  program delta. Armed by evidence, never by silence: it can only fire once
   *  at least one unit has settled having linked nothing, so a slow machine
   *  whose first unit is still linking is never truncated by it (a genuinely
   *  stuck lane is the adaptive budget's noProgress case). */
  noUsefulLinkMs: number;
  /** Consecutive zero-delta settles that stop the lane without waiting out
   *  noUsefulLinkMs. The instant-settle runaway produces these back to back,
   *  so the streak catches it in the units it takes to prove the pattern. */
  zeroDeltaStreakLimit: number;
}

export const PREWARM_SUBMIT_LANE_MAX_MS = 6000;
export const PREWARM_SUBMIT_NO_USEFUL_LINK_MS = 1500;
export const PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT = 8;

export const PREWARM_SUBMIT_STOP_CONFIG: PrewarmSubmitStopConfig = {
  laneMaxMs: PREWARM_SUBMIT_LANE_MAX_MS,
  noUsefulLinkMs: PREWARM_SUBMIT_NO_USEFUL_LINK_MS,
  zeroDeltaStreakLimit: PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT,
};

export interface PrewarmSubmitStopVerdict {
  stop: boolean;
  reason: PrewarmSubmitStopReason | null;
  /** Since the first submission, at the reading this verdict was taken at. */
  elapsedMs: number;
  submissions: number;
}

export interface PrewarmSubmitStopSnapshot {
  submissions: number;
  /** Settles whose program delta was positive: the lane's actual output. */
  usefulSettles: number;
  /** Settles that linked nothing (the instant-settle runaway's signature). */
  zeroDeltaSettles: number;
  zeroDeltaStreak: number;
  /** Synchronous compile prologues observed, and how many linked nothing. */
  syncEnds: number;
  zeroDeltaSyncEnds: number;
  /** Since the first submission, at the last reading the lane fed in. */
  elapsedMs: number;
  /** Since the last positive delta (or the first submission), same reading. */
  sinceUsefulMs: number;
  stopped: boolean;
  reason: PrewarmSubmitStopReason | null;
}

export interface PrewarmSubmitStop {
  /** One compile unit's compileAsync was submitted. */
  noteSubmitted(nowMs: number): void;
  /** That unit's synchronous prologue ended, having created `links` programs.
   *  Diagnostic only: the settle carries the same number and is the timed
   *  observation, so the decision is taken once, there. */
  noteSyncEnd(links: number): void;
  /** One submitted unit settled, having created `links` programs. */
  noteSettled(nowMs: number, links: number): void;
  shouldStop(nowMs: number): PrewarmSubmitStopVerdict;
  snapshot(): PrewarmSubmitStopSnapshot;
}

const positiveMs = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const positiveCount = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;

const readingOf = (value: number): number | null => (Number.isFinite(value) ? value : null);

const linksOf = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

function normalizedConfig(config: PrewarmSubmitStopConfig): PrewarmSubmitStopConfig {
  return {
    laneMaxMs: positiveMs(config.laneMaxMs, PREWARM_SUBMIT_LANE_MAX_MS),
    noUsefulLinkMs: positiveMs(config.noUsefulLinkMs, PREWARM_SUBMIT_NO_USEFUL_LINK_MS),
    zeroDeltaStreakLimit: positiveCount(
      config.zeroDeltaStreakLimit,
      PREWARM_SUBMIT_ZERO_DELTA_STREAK_LIMIT,
    ),
  };
}

/**
 * The lane's stop state machine. Latching: once a rule fires the verdict keeps
 * its reason, so the receipt and the one recorded event attribute a truncated
 * manifest to the rule that truncated it rather than to whatever the lane
 * looked like afterwards.
 */
export function createPrewarmSubmitStop(
  inputConfig: PrewarmSubmitStopConfig = PREWARM_SUBMIT_STOP_CONFIG,
): PrewarmSubmitStop {
  const config = normalizedConfig(inputConfig);
  let firstSubmitAtMs: number | null = null;
  let lastReadingMs: number | null = null;
  let lastUsefulAtMs: number | null = null;
  let submissions = 0;
  let usefulSettles = 0;
  let zeroDeltaSettles = 0;
  let zeroDeltaStreak = 0;
  let syncEnds = 0;
  let zeroDeltaSyncEnds = 0;
  let stopped = false;
  let reason: PrewarmSubmitStopReason | null = null;

  const observe = (nowMs: number): number | null => {
    const at = readingOf(nowMs);
    if (at === null) return null;
    lastReadingMs = at;
    return at;
  };
  const elapsedAt = (at: number | null): number =>
    at === null || firstSubmitAtMs === null ? 0 : Math.max(0, at - firstSubmitAtMs);
  const sinceUsefulAt = (at: number | null): number =>
    at === null || lastUsefulAtMs === null ? 0 : Math.max(0, at - lastUsefulAtMs);

  return {
    noteSubmitted(nowMs) {
      submissions++;
      const at = observe(nowMs);
      if (at === null || firstSubmitAtMs !== null) return;
      firstSubmitAtMs = at;
      // The no-useful-link window runs from the lane's first submission, so a
      // lane that never links anything is bounded from its own start.
      lastUsefulAtMs = at;
    },
    noteSyncEnd(links) {
      syncEnds++;
      if (linksOf(links) === 0) zeroDeltaSyncEnds++;
    },
    noteSettled(nowMs, links) {
      const at = observe(nowMs);
      if (linksOf(links) > 0) {
        usefulSettles++;
        zeroDeltaStreak = 0;
        if (at !== null) lastUsefulAtMs = at;
        return;
      }
      zeroDeltaSettles++;
      zeroDeltaStreak++;
    },
    shouldStop(nowMs) {
      const at = observe(nowMs);
      if (!stopped && at !== null && firstSubmitAtMs !== null) {
        if (elapsedAt(at) >= config.laneMaxMs) {
          stopped = true;
          reason = 'lane-max';
        } else if (
          zeroDeltaSettles > 0 &&
          (zeroDeltaStreak >= config.zeroDeltaStreakLimit ||
            sinceUsefulAt(at) >= config.noUsefulLinkMs)
        ) {
          stopped = true;
          reason = 'no-useful-link';
        }
      }
      return { stop: stopped, reason, elapsedMs: elapsedAt(at), submissions };
    },
    snapshot() {
      return {
        submissions,
        usefulSettles,
        zeroDeltaSettles,
        zeroDeltaStreak,
        syncEnds,
        zeroDeltaSyncEnds,
        elapsedMs: elapsedAt(lastReadingMs),
        sinceUsefulMs: sinceUsefulAt(lastReadingMs),
        stopped,
        reason,
      };
    },
  };
}
