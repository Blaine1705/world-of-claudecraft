// Pure classification + fail-closed decision logic for the ci.yml `changes`
// job ("Detect code path changes"). The job used to answer "does this PR touch
// the code path set" with a full-history checkout plus `git diff`, which cost
// about 10 serial minutes on every PR (binary-heavy history) and twice wedged
// for 90+ minutes on the checkout step. The answer now comes from the GitHub
// pull request files endpoint (paginated), with the rules extracted here so
// Vitest can pin every branch without a workflow run.
//
// SAFETY DIRECTION: code=true means "run the full PR tier"; code=false means
// "docs-only, skip pr-gate/pr-checks/browser-gate". Every unprovable case
// (non-PR event, missing context, API error, pagination overflow, payload
// mismatch, unclassifiable entry) must resolve to code=true. A slow green is
// acceptable; a fast false-green is not.

// The code path set, matching the shell case patterns the changes job carried
// inline before extraction (kept in the same order). A shell case `dir/*`
// matches any path under the directory (case globs cross `/`), so directory
// entries here are prefixes; bare filenames are exact top-level matches.
const CODE_PATH_PREFIXES = Object.freeze([
  'src/',
  'server/',
  'tests/',
  'headless/',
  'bot/',
  'scripts/',
  '.github/workflows/',
  'electron/',
  'android/',
  'ios/',
  'public/',
  // Security-adjacent / deploy surfaces: must not skip malware+builds.
  'deploy/',
  'mediawiki/',
  'Dockerfile.',
]);

const CODE_PATH_EXACT = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.admin.json',
  'vite.config.ts',
  'vitest.browser.config.ts',
  'biome.json',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

// The pull request files endpoint lists at most 3000 files; past that the
// listing is silently incomplete, so classification cannot be proven.
export const PR_FILES_CAP = 3000;

/**
 * True when the path belongs to the code path set. Anything that is not a
 * classifiable repo-relative string also returns true: an input this predicate
 * cannot read must fail toward the full suite, never toward a skip.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isCodePath(path) {
  if (typeof path !== 'string' || path === '') return true;
  if (CODE_PATH_EXACT.includes(path)) return true;
  return CODE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Classify a full PR file listing. A rename is classified by BOTH ends
 * (`filename` and `previous_filename`): the API folds a rename into one entry,
 * but a file renamed out of the code path set still changes the code path set,
 * exactly as the old `git diff --diff-filter=ACMRD` (which listed the delete
 * and the add separately) saw it.
 *
 * @param {ReadonlyArray<{ filename?: string, previous_filename?: string | null }>} files
 * @returns {{ code: boolean, reason: string }}
 */
export function classifyPrFiles(files) {
  for (const file of files) {
    if (!file || typeof file.filename !== 'string' || file.filename === '') {
      return { code: true, reason: 'unclassifiable file entry: full PR tier (code=true)' };
    }
    if (isCodePath(file.filename)) {
      return { code: true, reason: `code path change detected (${file.filename}): full PR tier` };
    }
    if (file.previous_filename != null && isCodePath(file.previous_filename)) {
      return {
        code: true,
        reason: `code path change detected (renamed from ${file.previous_filename}): full PR tier`,
      };
    }
  }
  return {
    code: false,
    reason: 'docs-only (or non-code) change: skip pr-gate, pr-checks, browser-gate',
  };
}

/**
 * Fetch the complete changed-file list for a pull request, paginated. Throws
 * on any HTTP error, non-array payload, or a listing that exceeds `cap`
 * (provably or by exhausting the page budget); callers translate a throw into
 * code=true.
 *
 * @param {{
 *   repo: string,
 *   prNumber: number,
 *   token: string,
 *   apiUrl?: string,
 *   fetchImpl?: typeof fetch,
 *   perPage?: number,
 *   cap?: number,
 *   timeoutMs?: number,
 * }} opts
 * @returns {Promise<Array<{ filename?: string, previous_filename?: string | null }>>}
 */
export async function fetchPrFiles({
  repo,
  prNumber,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
  perPage = 100,
  cap = PR_FILES_CAP,
  timeoutMs = 30_000,
}) {
  /** @type {Array<{ filename?: string, previous_filename?: string | null }>} */
  const files = [];
  // One page past the cap: reaching it proves the listing overflowed rather
  // than looping forever on a misbehaving endpoint.
  const maxPages = Math.ceil(cap / perPage) + 1;
  for (let page = 1; page <= maxPages; page++) {
    const url = `${apiUrl}/repos/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`pull request files page ${page} failed: HTTP ${res.status}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) {
      throw new Error(`pull request files page ${page} returned a non-array payload`);
    }
    files.push(...batch);
    if (files.length > cap) {
      throw new Error(`pull request lists more than ${cap} files; listing is incomplete`);
    }
    if (batch.length < perPage) return files;
  }
  throw new Error(`pull request files pagination exceeded ${maxPages} pages`);
}

/**
 * The whole decision, fail closed end to end: never throws, and every path
 * that cannot PROVE a docs-only change returns code=true. `reportedCount` is
 * the event payload's `changed_files`; a mismatch against the fetched listing
 * (a push racing the pagination, or a truncated listing) discards the
 * classification.
 *
 * @param {{
 *   eventName: string,
 *   prNumber: number,
 *   reportedCount?: number,
 *   repo: string,
 *   token: string,
 *   apiUrl?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<{ code: boolean, reason: string }>}
 */
export async function detectCode({
  eventName,
  prNumber,
  reportedCount,
  repo,
  token,
  apiUrl,
  fetchImpl,
}) {
  try {
    if (eventName !== 'pull_request') {
      return { code: true, reason: 'non-PR event: full PR tier (code=true)' };
    }
    if (!repo || !Number.isInteger(prNumber) || prNumber <= 0) {
      return { code: true, reason: 'missing PR context: full PR tier (code=true)' };
    }
    if (!token) {
      return { code: true, reason: 'missing API token: full PR tier (code=true)' };
    }
    const files = await fetchPrFiles({ repo, prNumber, token, apiUrl, fetchImpl });
    if (files.length === 0) {
      return { code: true, reason: 'empty file list: full PR tier (code=true)' };
    }
    if (Number.isInteger(reportedCount) && reportedCount !== files.length) {
      return {
        code: true,
        reason: `listed ${files.length} files but the event reports ${reportedCount}: full PR tier (code=true)`,
      };
    }
    return classifyPrFiles(files);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      code: true,
      reason: `changed-file listing failed (${detail}): full PR tier (code=true)`,
    };
  }
}
