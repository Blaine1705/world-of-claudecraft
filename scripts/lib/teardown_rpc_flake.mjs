// Exact-signature detector for the vitest worker-teardown RPC flake, the ONE
// known-flake class CI is sanctioned to auto-retry (CI/CD performance packet,
// Phase 6). The packet's non-goals forbid any blanket retry policy because
// retries hide real regressions; everything in here exists to keep the match
// narrow enough that nothing else can ride it.
//
// The signature, first recorded 2026-08-05 (PR #2935, three hits in one
// evening, and repeatedly since on loaded runners): the vitest summary shows
// every test file and every test PASSED, but the process exits 1 with an
// unhandled `EnvironmentTeardownError: [vitest-worker]: Closing rpc while
// "onUserConsoleLog" was pending`: a worker-teardown race on the console-log
// RPC in suites that log near teardown. It is not a test failure and not
// diff-related, so retrying exactly this signature papers over nothing.
//
// Deliberately narrow, each arm pinned by tests/teardown_rpc_flake.test.ts:
// exit status must be exactly 1 (a signal kill or any other code never
// matches); BOTH final summary lines must be present in the captured tail and
// show only passing buckets (skipped and todo are fine, any `failed` bucket
// disqualifies); and the exact quoted RPC message must be present. Anything
// else fails the job exactly as it always did.

/**
 * Rolling-tail size the leg runner keeps for classification. The vitest
 * summary and the unhandled-rejection banner both print at the very end of a
 * run, so a bounded tail is enough and keeps memory flat against the
 * multi-megabyte full-suite logs.
 */
export const TEARDOWN_RPC_TAIL_BYTES = 256 * 1024;

/** The exact unhandled-rejection message of the known flake. */
export const TEARDOWN_RPC_MESSAGE = 'Closing rpc while "onUserConsoleLog" was pending';

// vitest colors its CI output (tinyrainbow enables ANSI inside GitHub
// Actions), so the summary labels and buckets arrive wrapped in escape
// sequences; strip them before matching. The escape byte is spelled via
// fromCharCode because a control character in a regex literal trips the
// suspicious-regex lint, and biome auto-rewrites a plain-string constructor
// back into that literal.
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * Final occurrence of a summary line for the given label ("Test Files" or
 * "Tests"), or null when the tail holds none. Last occurrence wins so a tail
 * that somehow holds two summaries is judged on the final one.
 *
 * @param {string} text
 * @param {string} label
 * @returns {string | null}
 */
function lastSummaryBuckets(text, label) {
  const re = new RegExp(`^\\s*${label} {2,}(.+)$`, 'gm');
  let buckets = null;
  for (const match of text.matchAll(re)) {
    buckets = match[1];
  }
  return buckets;
}

/**
 * A summary bucket list counts as all-passing when it has a passed bucket and
 * no failed bucket. Skipped and todo buckets are allowed: the full suite
 * carries DB-gated skips on every healthy run.
 *
 * @param {string} buckets
 * @returns {boolean}
 */
function isAllPassing(buckets) {
  return /\bpassed\b/.test(buckets) && !/\bfailed\b/.test(buckets);
}

/**
 * True exactly when a finished leg matches the teardown-rpc flake signature:
 * exit code 1, both summary lines all-passing, and the exact RPC message in
 * the tail. This is the only predicate the leg runner may retry on.
 *
 * @param {{ status: number | null, tail: string }} result
 * @returns {boolean}
 */
export function isTeardownRpcFlake({ status, tail }) {
  if (status !== 1) return false;
  if (typeof tail !== 'string' || tail === '') return false;
  const text = tail.replace(ANSI_RE, '').replace(/\r/g, '');
  if (!text.includes('EnvironmentTeardownError')) return false;
  if (!text.includes(TEARDOWN_RPC_MESSAGE)) return false;
  const files = lastSummaryBuckets(text, 'Test Files');
  const tests = lastSummaryBuckets(text, 'Tests');
  if (files === null || tests === null) return false;
  return isAllPassing(files) && isAllPassing(tests);
}
