// Resolves the correct `--since` ref for `biome ci --changed` when run LOCALLY
// (npm run ci:changed, consumed by scripts/gate.mjs and .githooks/pre-push).
//
// Without --since, biome falls back to biome.json's vcs.defaultBranch
// ("origin/main"). Every feature branch here is created off the latest
// release branch, not main (root CLAUDE.md: "Base your work off the latest
// release branch ... main trails it"), so a bare `biome ci --changed` sweeps
// in the ENTIRE drift between the branch and main, often 1000+ unrelated
// files, instead of the branch's real diff. Real CI never hits this: the
// `lint` job in .github/workflows/ci.yml resolves the PR's actual base_ref
// and passes it explicitly. This module gives the local scripts the same
// correct behavior: prefer the branch's own upstream tracking ref (set by
// `git checkout -b <name> <base>` or `git worktree add <path> <base> -b
// <name>`, which is how every worktree in this repo is created), and only
// fall back to origin/main when no tracking ref exists (a branch checked out
// with no upstream, matching biome's own default).
//
// Pure: takes an injected `execGit` so a unit test never shells out.

const DEFAULT_FALLBACK = 'origin/main';

/**
 * @param {{ execGit: (args: string[]) => string }} deps
 * @param {string} [fallback]
 * @returns {string}
 */
export function resolveChangedBaseRef({ execGit }, fallback = DEFAULT_FALLBACK) {
  try {
    const ref = execGit([
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    ]).trim();
    if (ref.length > 0 && ref !== '@{upstream}') return ref;
  } catch {
    // No upstream tracking ref (detached HEAD, or a branch checked out with
    // no `-b <base>`/`--track`): fall through to the default.
  }
  return fallback;
}
