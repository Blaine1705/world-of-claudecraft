// Cross-process advisory lock serializing the "vitest (full suite)" step across
// concurrent local `npm run gate` runs (issue #2808). Split out per scripts/CLAUDE.md's
// module-first rule: the lock-state logic (acquire, contended wait, stale reclaim,
// opt-out) is pure enough to unit-test without ever spawning a real gate, and the few
// impure bits (clock, pid liveness, sleep) are injectable so tests run instantly.
//
// Why this exists. This repo's own default task workflow asks for a separate worktree
// per task, so several `npm run gate` runs routinely overlap. Each sizes its own Vitest
// pool independently (computeGateWorkers, gate_workers.mjs), as if it owned the host: two
// gates that each correctly claim half the cores still request the whole machine between
// them, and the arithmetic gets worse with three or four concurrent worktrees. Only
// cross-process coordination bounds the total, which per-process sizing cannot do.
//
// The lock is a single JSON file in os.tmpdir() (shared by every worktree of the repo on
// that host): { pid, startedAt }. Node's 'wx' open flag (fail if the path exists) is an
// atomic create on every platform Node supports, so no platform-specific locking
// primitive is needed. A holder whose pid is gone, or whose lock is older than a generous
// staleness ceiling, is reclaimed rather than honored, so a crashed or killed gate can
// never wedge later runs. GATE_NO_LOCK=1 (read by the caller, passed as `optOut`) restores
// today's fully concurrent behavior for a user who deliberately wants it.
//
// This is a pure wall-clock OPTIMIZATION, never a correctness gate: anything the lock
// itself cannot resolve (a persistently unremovable stale file, a filesystem error, an
// unreasonably long wait) degrades to running the full suite UNSERIALIZED rather than
// failing or hanging the gate, because that is the only direction that can never turn
// into "the merge bar silently ran zero tests." Every degrade path logs loudly so the
// job log still shows what happened.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_LOCK_FILE_NAME = 'woc-gate-full-suite.lock';
// Long enough that no real full-suite run (routinely tens of minutes under contention)
// is ever mistaken for stale; short enough that a lock orphaned by a killed gate does not
// block worktrees indefinitely. Primary reclaim signal is pid liveness (exact); this
// ceiling only backstops the rare case a dead pid still reads as alive (pid reuse, a
// pid-namespace mismatch under a container).
export const DEFAULT_STALE_MS = 3 * 60 * 60 * 1000; // 3 hours
export const DEFAULT_POLL_MS = 5000;
// Safety valve, well above any plausible legitimate full-suite duration (observed up to
// ~28 minutes under four-way contention): if waiting this long has not produced the
// lock, stop trusting the wait and proceed unserialized rather than sit silent for up to
// DEFAULT_STALE_MS. Never triggers a normal contended wait; only a genuinely stuck one
// (e.g. a dead gate's pid reused by a long-lived process, so liveness never reclaims it).
export const DEFAULT_MAX_WAIT_MS = 60 * 60 * 1000; // 1 hour
// How often a still-waiting run re-announces the same holder, so a long wait speaks
// periodically instead of printing one line and going silent for up to an hour.
export const DEFAULT_REANNOUNCE_MS = 2 * 60 * 1000; // 2 minutes
// A stale lock that cannot be removed (permission, read-only/full filesystem) is retried
// this many times, yielding between attempts, before giving up on the lock entirely
// rather than spinning. Each attempt already waits pollMs, so this bounds worst case to
// a handful of poll intervals, not a hang.
const MAX_RECLAIM_FAILURES = 3;

/**
 * Is `pid` a currently running process? Signal 0 sends no actual signal on any platform
 * Node supports; it only probes existence, so this needs no platform-specific primitive.
 * EPERM means the process exists but is owned by another user, which still counts as
 * alive for this lock's purposes.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err != null && typeof err === 'object' && 'code' in err && err.code === 'EPERM';
  }
}

function lockPathFor(lockDir, lockFileName) {
  return path.join(lockDir ?? os.tmpdir(), lockFileName ?? DEFAULT_LOCK_FILE_NAME);
}

/**
 * Parses the lock file's holder, or null when it is missing, unreadable, corrupt, or
 * names an unusable pid (not a positive integer: a zero-filled or hand-edited file could
 * otherwise smuggle in pid 0 or -1, which process.kill(pid, 0) treats as the caller's own
 * process group or "every signalable process" respectively, always reading as "alive"
 * and defeating the liveness reclaim entirely). Any of these is safe to reclaim.
 */
function readHolder(lockPath, readFile) {
  try {
    const data = JSON.parse(readFile(lockPath, 'utf8'));
    if (
      typeof data.pid === 'number' &&
      Number.isInteger(data.pid) &&
      data.pid > 0 &&
      typeof data.startedAt === 'number'
    ) {
      return data;
    }
  } catch {
    // missing, unreadable, or corrupt: no usable holder info, caller reclaims
  }
  return null;
}

function tryCreate(lockPath, pid, now, writeFile) {
  try {
    writeFile(lockPath, JSON.stringify({ pid, startedAt: now() }), { flag: 'wx' });
    return true;
  } catch (err) {
    if (err && err.code === 'EEXIST') return false;
    throw err;
  }
}

function isStale(holder, now, staleMs, isAlive) {
  if (!holder) return true; // unreadable/corrupt: safe to reclaim
  if (!isAlive(holder.pid)) return true;
  return now() - holder.startedAt > staleMs;
}

/**
 * Blocks (async) until this process holds the full-suite lock, `optOut` is set, or the
 * lock proves unworkable (see module header): every one of those outcomes resolves with
 * a usable `release()`, never a throw and never an unbounded wait, so a lock-management
 * problem can only ever cost wall-clock time, never the gate's ability to run tests.
 *
 * @param {{
 *   optOut?: boolean,
 *   lockDir?: string,
 *   lockFileName?: string,
 *   pid?: number,
 *   now?: () => number,
 *   staleMs?: number,
 *   pollMs?: number,
 *   maxWaitMs?: number,
 *   reannounceMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   log?: (msg: string) => void,
 *   readFile?: (path: string, encoding: 'utf8') => string,
 *   writeFile?: (path: string, data: string, opts: { flag: string }) => void,
 *   unlink?: (path: string) => void,
 *   isAlive?: (pid: number) => boolean,
 * }} [opts]
 * @returns {Promise<{ release: () => void }>}
 */
export async function acquireFullSuiteLock(opts = {}) {
  if (opts.optOut) return { release: () => {} };

  const lockPath = lockPathFor(opts.lockDir, opts.lockFileName);
  const pid = opts.pid ?? process.pid;
  const now = opts.now ?? Date.now;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const reannounceMs = opts.reannounceMs ?? DEFAULT_REANNOUNCE_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = opts.log ?? ((msg) => console.log(msg));
  const readFile = opts.readFile ?? fs.readFileSync;
  const writeFile = opts.writeFile ?? fs.writeFileSync;
  const unlink = opts.unlink ?? fs.unlinkSync;
  const isAlive = opts.isAlive ?? isPidAlive;

  const runUnserialized = () => ({ release: () => {} });
  const waitStartedAt = now();
  let announcedHolderPid = null;
  let lastAnnouncedAt = waitStartedAt;
  let consecutiveReclaimFailures = 0;

  try {
    for (;;) {
      if (tryCreate(lockPath, pid, now, writeFile)) {
        return {
          release: () => {
            const holder = readHolder(lockPath, readFile);
            if (holder && holder.pid === pid) {
              try {
                unlink(lockPath);
              } catch {
                // already gone: fine, the goal (nobody honors our lock) already holds
              }
            }
          },
        };
      }

      const holder = readHolder(lockPath, readFile);
      if (isStale(holder, now, staleMs, isAlive)) {
        try {
          // Re-read immediately before unlinking and only remove the file if it still
          // names the exact holder just judged stale (same pid and startedAt). Without
          // this, two waiters that both observed the same stale holder could otherwise
          // race: the first unlinks the stale file and creates its own fresh lock, then
          // the second (still acting on its earlier read) unlinks that fresh lock too,
          // letting a third waiter (or the second itself) acquire while the first still
          // believes it holds the lock. A holder that no longer matches means someone
          // else already reclaimed it, so this waiter loops back and re-evaluates rather
          // than removing a lock it never actually observed as stale.
          const current = readHolder(lockPath, readFile);
          const stillSameHolder = holder
            ? current && current.pid === holder.pid && current.startedAt === holder.startedAt
            : !current; // originally corrupt/missing: still safe to reclaim iff still so
          if (stillSameHolder) {
            try {
              unlink(lockPath);
            } catch (err) {
              // someone else already removed the exact file we just re-verified: fine,
              // the goal (this stale holder no longer blocks anyone) already holds
              if (!(err && err.code === 'ENOENT')) throw err;
            }
          }
          consecutiveReclaimFailures = 0;
        } catch {
          consecutiveReclaimFailures++;
          if (consecutiveReclaimFailures > MAX_RECLAIM_FAILURES) {
            log(
              `[gate] WARN: could not remove a stale full-suite lock after ` +
                `${MAX_RECLAIM_FAILURES} attempts, running unserialized`,
            );
            return runUnserialized();
          }
          // Yield before retrying: a hot, unbounded spin is worse than a slow one, and
          // this path must never busy-loop the process.
          await sleep(pollMs);
        }
        continue;
      }

      if (now() - waitStartedAt > maxWaitMs) {
        log(
          `[gate] WARN: waited over ${Math.round(maxWaitMs / 60000)}m for the full-suite ` +
            'lock, running unserialized',
        );
        return runUnserialized();
      }

      if (holder.pid !== announcedHolderPid || now() - lastAnnouncedAt > reannounceMs) {
        const ageMs = Math.max(0, now() - holder.startedAt);
        log(
          `[gate] waiting for the full-suite lock held by pid ${holder.pid} ` +
            `(running ${Math.round(ageMs / 1000)}s)...`,
        );
        announcedHolderPid = holder.pid;
        lastAnnouncedAt = now();
      }
      await sleep(pollMs);
    }
  } catch (err) {
    const detail = (err && (err.code ?? err.message)) ?? String(err);
    log(`[gate] WARN: full-suite lock unavailable (${detail}), running unserialized`);
    return runUnserialized();
  }
}
