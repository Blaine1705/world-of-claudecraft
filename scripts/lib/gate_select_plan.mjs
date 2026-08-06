// Pure planning helpers for scripts/gate_select.mjs, the selective gate.
// Kept free of spawn/fs/git so Vitest can pin every branch without a shell.
//
// The selective gate runs the FULL gate's step list (i18n gen + freshness, wiki,
// malware, biome, sfx, browser, typecheck, all four builds) and changes exactly
// one step: the full unsharded vitest run becomes two bounded runs.
//
//   1. always-run   every test whose coverage reaches outside the module graph
//                   (scripts/lib/test_visibility.mjs). `vitest related` can never
//                   select these reliably, so they are never selected at all:
//                   they just always run.
//   2. related      `vitest related` over the changed source files, which models
//                   the remaining ~80% of the suite correctly.
//
// Two invocations rather than one because `related` is a subcommand, not a flag,
// so it cannot be mixed with an explicit file list. The overlap between the two
// (a 'partial' test selected by both) re-runs a handful of files and is pure
// wasted time, never a correctness gap.
//
// SAFETY FALLBACK: any change this planner cannot reason about (a broad config
// file, a lockfile, a vitest/vite/tsconfig edit) drops the whole plan to the FULL
// suite. Selection is an optimization for changes we understand; anything else
// gets the old bar. Failing toward MORE tests is the only safe direction, since
// a selection miss is silent.

import {
  isNonCodePath,
  isRelatedSourcePath,
  isTestPath,
  normalizeRepoPath,
} from './gate_fast_plan.mjs';

// NOTE: this deliberately does NOT reuse gate_fast_plan's isBroadConfigPath.
// That predicate means the OPPOSITE thing there: gate:fast uses it to EXCLUDE a
// path from `vitest --changed` (because expanding on it would run nearly the
// whole suite), whereas here the same class of path must FORCE the whole suite.
// Reusing it would have inverted the safety fallback.
//
// It is also incomplete for this purpose: it still names `package-lock.json`,
// which the Phase 7 pnpm migration removed, and never learned `pnpm-lock.yaml`.
// Under gate_fast_plan's own rules a lockfile change falls through to
// isNonCodePath (.yaml / .lock) and is treated as inert. For the merge bar that
// would be a silent hole: a dependency bump could change behavior anywhere and
// select nothing.
const FULL_SUITE_TRIGGER_RE =
  /^(package\.json|package-lock\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|turbo\.json|biome\.json|vite\.config\.[cm]?[jt]s|vitest(?:\..+)?\.config\.[cm]?[jt]s|tsconfig(?:\..+)?\.json)$/;

/**
 * Changes that must widen the run to the FULL suite: build/test/dependency
 * configuration whose blast radius the import graph cannot express.
 *
 * @param {string} p
 * @returns {boolean}
 */
export function isFullSuiteTrigger(p) {
  const n = normalizeRepoPath(p);
  if (!n) return false;
  const base = n.includes('/') ? n.slice(n.lastIndexOf('/') + 1) : n;
  if (FULL_SUITE_TRIGGER_RE.test(base)) return true;
  // Vitest setup/global-setup and the shared test helpers change behavior for
  // every file that runs, so they can never be narrowed either. NESTED helper
  // directories too (tests/server/helpers/), excluding the test files that
  // merely live beside the fakes: a changed test runs itself through the
  // ordinary test bucket, and promoting it to everything is pure waste.
  // Nested FIXTURE dirs (tests/server/fixtures/) deliberately stay inert: the
  // golden corpus is huge, endpoint PRs regenerate it routinely, and every
  // consuming suite reaches its fixtures through fs and therefore rides the
  // always-run floor (verified against the real classifier; a future
  // fixture-importing GRAPH test would be the thing to revisit here).
  if (n.startsWith('tests/helpers/') || n.startsWith('tests/fixtures/')) return true;
  if (/^tests\/.+\/helpers\//.test(n) && !isTestPath(n)) return true;
  if (/^tests\/(global_setup|jsdom_local_storage_setup)\.[cm]?ts$/.test(n)) return true;
  return false;
}

/**
 * The regenerated i18n artifacts the selective planner treats as INERT rather
 * than unclassifiable. These are the ONLY generated trees with that standing,
 * and the standing rests on one structural invariant: ci.yml's pr-checks job
 * (and its release-checks mirror, and the full local gate's i18n step) reruns
 * `npm run i18n:gen` and fails on `git diff --exit-code` over EXACTLY these
 * paths, on every code PR, in every test mode. So a hand-edited or stale
 * artifact is a red check regardless of test selection, and a faithful
 * regeneration is a pure function of catalog/overlay/generator sources that
 * are themselves classified normally (related sources reaching every consumer
 * the import graph models). Suites that consume the artifacts from OUTSIDE
 * the modeled graph ride the always-run floor via the generated-i18n entry in
 * lib/test_visibility.mjs OUT_OF_GRAPH_PATTERNS.
 *
 * tests/ci_workflow.test.ts pins this list against the freshness-diff paths in
 * ci.yml itself: a path may only be listed here while the freshness step
 * proves it, so the two cannot drift apart silently.
 *
 * Any OTHER `.generated` path keeps today's behavior (unrecognized: widen to
 * the full suite); do not add one here without its own freshness-equivalent
 * proof.
 */
export const GENERATED_I18N_ARTIFACT_PREFIXES = Object.freeze([
  'src/ui/i18n.resolved.generated/',
  'src/admin/i18n.resolved.generated/',
]);

export const GENERATED_I18N_ARTIFACT_FILES = Object.freeze([
  'src/ui/i18n.catalog/translation_keys.generated.ts',
]);

/**
 * True only for the freshness-guarded generated i18n artifact paths above.
 *
 * @param {string} p
 * @returns {boolean}
 */
export function isGeneratedI18nArtifactPath(p) {
  const n = normalizeRepoPath(p);
  if (!n) return false;
  if (GENERATED_I18N_ARTIFACT_FILES.includes(n)) return true;
  return GENERATED_I18N_ARTIFACT_PREFIXES.some((prefix) => n.startsWith(prefix));
}

/**
 * @typedef {'full' | 'selective'} SelectMode
 * @typedef {{
 *   mode: SelectMode,
 *   reason: string,
 *   alwaysRunFiles: string[],
 *   relatedSources: string[],
 *   changedTestFiles: string[],
 * }} SelectPlan
 */

/**
 * Split a changed-path list into the buckets the plan needs.
 *
 * @param {string[]} paths
 * @returns {{
 *   testFiles: string[],
 *   relatedSources: string[],
 *   broadConfigs: string[],
 *   nonCode: string[],
 *   generatedI18n: string[],
 * }}
 */
export function classifySelectPaths(paths) {
  const testFiles = [];
  const relatedSources = [];
  const broadConfigs = [];
  const nonCode = [];
  const generatedI18n = [];
  for (const raw of paths ?? []) {
    const p = normalizeRepoPath(raw);
    if (!p) continue;
    if (isFullSuiteTrigger(p)) {
      broadConfigs.push(p);
      continue;
    }
    // Freshness-guarded generated i18n artifacts: inert for `related` (their
    // driving sources classify normally), own bucket so every consumer of this
    // classification can apply its deletion guard and audit line.
    if (isGeneratedI18nArtifactPath(p)) {
      generatedI18n.push(p);
      continue;
    }
    if (isTestPath(p)) {
      testFiles.push(p);
      continue;
    }
    if (isRelatedSourcePath(p)) {
      relatedSources.push(p);
      continue;
    }
    // A TypeScript declaration file is erased at runtime, so it cannot change
    // behavior any test could observe; it can only change what `tsc` accepts,
    // and check:types runs in FULL on every selective gate. Without this arm a
    // .d.mts lands in the unrecognized bucket and forces the whole suite, which
    // fires on every new scripts/lib module (each ships a hand-written .d.mts).
    if (/\.d\.[cm]?ts$/.test(p)) {
      nonCode.push(p);
      continue;
    }
    if (isNonCodePath(p)) {
      nonCode.push(p);
      continue;
    }
    // Anything unrecognized is treated as a reason to widen, not narrow.
    broadConfigs.push(p);
  }
  return { testFiles, relatedSources, broadConfigs, nonCode, generatedI18n };
}

/**
 * Build the selective plan.
 *
 * @param {{
 *   changedPaths: string[],
 *   alwaysRunFiles: string[],
 *   exists?: (p: string) => boolean,
 * }} opts
 * @returns {SelectPlan}
 */
export function buildSelectPlan({ changedPaths, alwaysRunFiles, exists }) {
  const always = [...new Set(alwaysRunFiles ?? [])].sort();
  const { testFiles, relatedSources, broadConfigs, generatedI18n } =
    classifySelectPaths(changedPaths);

  if (broadConfigs.length > 0) {
    return {
      mode: 'full',
      reason: `broad/unclassified change (${broadConfigs.slice(0, 3).join(', ')}${
        broadConfigs.length > 3 ? ', ...' : ''
      }): running the full suite`,
      alwaysRunFiles: always,
      relatedSources: [],
      changedTestFiles: testFiles,
    };
  }

  // A generated i18n artifact is inert only while it is PRESENT: the freshness
  // step's `git diff` cannot flag a deleted-then-regenerated file (regeneration
  // recreates it untracked, which `git diff` does not show), so a diff that
  // deletes one is unprovable and widens. A caller that cannot check existence
  // widens too.
  if (generatedI18n.length > 0) {
    if (typeof exists !== 'function') {
      return {
        mode: 'full',
        reason: `generated i18n artifact(s) changed but existence cannot be verified (${generatedI18n[0]}): running the full suite`,
        alwaysRunFiles: always,
        relatedSources: [],
        changedTestFiles: testFiles,
      };
    }
    const missing = generatedI18n.filter((p) => !exists(p));
    if (missing.length > 0) {
      return {
        mode: 'full',
        reason: `generated i18n artifact(s) removed (${missing.slice(0, 3).join(', ')}${
          missing.length > 3 ? ', ...' : ''
        }): running the full suite`,
        alwaysRunFiles: always,
        relatedSources: [],
        changedTestFiles: testFiles,
      };
    }
  }

  // Present in the reason so an audited log never reads "no changes" while
  // artifacts moved; the freshness step is the integrity bar for these.
  const artifactNote =
    generatedI18n.length > 0
      ? `; ${generatedI18n.length} generated i18n artifact(s) inert (freshness-guarded)`
      : '';

  // A changed test file always runs, whether or not the graph would pick it.
  const alwaysWithChangedTests = [...new Set([...always, ...testFiles])].sort();

  if (relatedSources.length === 0 && testFiles.length === 0) {
    return {
      mode: 'selective',
      reason: `no code or test changes: always-run set only${artifactNote}`,
      alwaysRunFiles: alwaysWithChangedTests,
      relatedSources: [],
      changedTestFiles: testFiles,
    };
  }

  return {
    mode: 'selective',
    reason: `${relatedSources.length} changed source file(s), ${testFiles.length} changed test file(s)${artifactNote}`,
    alwaysRunFiles: alwaysWithChangedTests,
    relatedSources,
    changedTestFiles: testFiles,
  };
}

/**
 * Vitest argv for the always-run leg.
 *
 * @param {{ files: string[], workers: number }} opts
 * @returns {string[]}
 */
export function buildAlwaysRunArgs({ files, workers }) {
  return ['run', ...files, `--maxWorkers=${workers}`];
}

/**
 * Vitest argv for the `related` leg, or null when there is nothing to relate.
 *
 * @param {{ sources: string[], workers: number }} opts
 * @returns {string[] | null}
 */
export function buildRelatedArgs({ sources, workers }) {
  if (!sources || sources.length === 0) return null;
  return ['related', ...sources, '--run', '--passWithNoTests', `--maxWorkers=${workers}`];
}

/**
 * Vitest argv for the full-suite fallback.
 *
 * @param {{ workers: number }} opts
 * @returns {string[]}
 */
export function buildFullSuiteArgs({ workers }) {
  return ['run', `--maxWorkers=${workers}`];
}
