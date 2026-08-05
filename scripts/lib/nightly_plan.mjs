// Pure planning logic for the nightly full-gate workflow
// (.github/workflows/nightly.yml): which refs to gate, which run jobs count as
// failures, and what to do to the single tracking issue. Kept free of fetch/fs
// so Vitest can pin every branch; the two thin entries
// (scripts/nightly_targets.mjs and scripts/nightly_report.mjs) do the HTTP.
//
// The alerting contract, from the incident that motivated the workflow (a
// release tip carried 67 broken tests for days because push runs were red with
// nobody watching): a red nightly run must land in exactly ONE open tracking
// issue (create it if absent, update it if present, never stack a second), and
// a green run must close that issue with a recovery comment. The label below
// is the finder, so renaming it strands any issue created under the old name.

export const NIGHTLY_ISSUE_LABEL = 'nightly-gate';
export const NIGHTLY_ISSUE_TITLE = 'Nightly full gate is red';

/**
 * Pick the active release branch from a list of branch names: the highest
 * `release/vX.Y.Z` (or `release/X.Y.Z`) by semver. Names that do not parse are
 * ignored rather than string-compared, so a stray `release/next` can never
 * outrank a real version. Returns null when nothing parses.
 *
 * @param {readonly string[]} names
 * @returns {string | null}
 */
export function pickActiveReleaseBranch(names) {
  let best = null;
  let bestKey = null;
  for (const name of names) {
    const match = /^release\/v?(\d+)\.(\d+)\.(\d+)$/.exec(name);
    if (!match) continue;
    const key = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (
      bestKey === null ||
      key[0] > bestKey[0] ||
      (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
      (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])
    ) {
      best = name;
      bestKey = key;
    }
  }
  return best;
}

/**
 * The refs the nightly run gates. A manual dispatch ref replaces the whole
 * list (that is the acceptance path: point the workflow at a scratch branch);
 * otherwise the default branch plus the active release branch, deduplicated.
 *
 * @param {{ inputRef?: string | null, releaseBranch?: string | null, defaultBranch?: string }} opts
 * @returns {string[]}
 */
export function buildTargets({ inputRef, releaseBranch, defaultBranch = 'main' }) {
  const dispatch = typeof inputRef === 'string' ? inputRef.trim() : '';
  if (dispatch !== '') return [dispatch];
  const targets = [defaultBranch];
  if (releaseBranch && releaseBranch !== defaultBranch) targets.push(releaseBranch);
  return targets;
}

/**
 * Split a workflow run's job listing into completed jobs and failures. Only
 * completed jobs are judged (the report job itself is still in progress when
 * it asks); among those, anything that is not success, skipped, or neutral
 * counts as a failure: cancelled, timed_out, action_required, and stale all
 * mean "the nightly did not prove the tip green", which is the fail-closed
 * direction for an alerting job.
 *
 * @param {ReadonlyArray<{ name?: string, status?: string, conclusion?: string | null, html_url?: string }>} jobs
 * @returns {{
 *   completed: Array<{ name: string, conclusion: string, html_url: string }>,
 *   failed: Array<{ name: string, conclusion: string, html_url: string }>,
 * }}
 */
export function summarizeRunJobs(jobs) {
  const completed = [];
  const failed = [];
  for (const job of jobs) {
    if (job?.status !== 'completed') continue;
    const entry = {
      name: typeof job.name === 'string' ? job.name : '(unnamed job)',
      conclusion: typeof job.conclusion === 'string' ? job.conclusion : 'unknown',
      html_url: typeof job.html_url === 'string' ? job.html_url : '',
    };
    completed.push(entry);
    if (
      entry.conclusion !== 'success' &&
      entry.conclusion !== 'skipped' &&
      entry.conclusion !== 'neutral'
    ) {
      failed.push(entry);
    }
  }
  return { completed, failed };
}

/**
 * @param {{ runUrl: string, targets: readonly string[], timestamp: string,
 *   failed: ReadonlyArray<{ name: string, conclusion: string, html_url: string }> }} opts
 * @returns {string}
 */
export function renderIssueBody({ runUrl, targets, timestamp, failed }) {
  const lines = [
    'The scheduled full gate found the tip red. This issue is managed by the',
    'nightly workflow: it is updated on repeat failures and closed automatically',
    'on the first green run, so keep it open until the tip is actually repaired.',
    '',
    `Latest red run: ${runUrl} (${timestamp})`,
    `Refs gated: ${targets.length > 0 ? targets.join(', ') : 'unknown (ref resolution failed)'}`,
    '',
    'Failed jobs:',
    ...failed.map(
      (job) => `- ${job.name}: ${job.conclusion}${job.html_url ? ` (${job.html_url})` : ''}`,
    ),
  ];
  return lines.join('\n');
}

/**
 * @param {{ runUrl: string, timestamp: string,
 *   failed: ReadonlyArray<{ name: string, conclusion: string, html_url: string }> }} opts
 * @returns {string}
 */
export function renderFailureComment({ runUrl, timestamp, failed }) {
  const lines = [
    `Still red: ${runUrl} (${timestamp})`,
    '',
    ...failed.map(
      (job) => `- ${job.name}: ${job.conclusion}${job.html_url ? ` (${job.html_url})` : ''}`,
    ),
  ];
  return lines.join('\n');
}

/**
 * @param {{ runUrl: string, timestamp: string }} opts
 * @returns {string}
 */
export function renderRecoveryComment({ runUrl, timestamp }) {
  return `Recovered: the nightly full gate is green again. ${runUrl} (${timestamp})`;
}

/**
 * Decide what to do to the tracking issue. `openIssues` may be the raw issues
 * listing: pull requests (which the issues API also returns) and anything not
 * open are filtered here, and when several tracking issues exist (which the
 * create rule makes impossible short of a manual duplicate) the OLDEST is
 * updated and none are created, preserving the exactly-one contract.
 *
 * @param {{
 *   failed: ReadonlyArray<{ name: string, conclusion: string, html_url: string }>,
 *   openIssues: ReadonlyArray<{ number?: number, state?: string, pull_request?: unknown }>,
 *   runUrl: string,
 *   targets: readonly string[],
 *   timestamp: string,
 * }} opts
 * @returns {{ action: 'create', title: string, body: string, labels: string[] }
 *   | { action: 'update', issueNumber: number, body: string, comment: string }
 *   | { action: 'close', issueNumber: number, comment: string }
 *   | { action: 'none', reason: string }}
 */
export function planNightlyReport({ failed, openIssues, runUrl, targets, timestamp }) {
  const tracking = openIssues
    .filter((issue) => issue && issue.state === 'open' && issue.pull_request === undefined)
    .filter((issue) => Number.isInteger(issue.number))
    .sort((a, b) => a.number - b.number);
  const existing = tracking[0];

  if (failed.length > 0) {
    const body = renderIssueBody({ runUrl, targets, timestamp, failed });
    if (existing === undefined) {
      return {
        action: 'create',
        title: NIGHTLY_ISSUE_TITLE,
        body,
        labels: [NIGHTLY_ISSUE_LABEL],
      };
    }
    return {
      action: 'update',
      issueNumber: existing.number,
      body,
      comment: renderFailureComment({ runUrl, timestamp, failed }),
    };
  }

  if (existing !== undefined) {
    return {
      action: 'close',
      issueNumber: existing.number,
      comment: renderRecoveryComment({ runUrl, timestamp }),
    };
  }
  return { action: 'none', reason: 'green run and no open tracking issue' };
}
