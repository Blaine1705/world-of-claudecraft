// CI entry for the pr-gate shard matrix ("Run tests (PR tier, shard i of N)").
// Phase 2 of the CI/CD performance packet (docs/prd/ci-cd-performance/plan.md).
//
// Reads the selection decision the `changes` job relayed (TEST_MODE,
// TEST_MODE_REASON, CHANGED_FILES) plus this shard's `--shard=i/N` argv, builds
// the legs through the pure planner (lib/ci_shard_plan.mjs), prints the whole
// decision so a suspicious green can be audited from the job log alone, and
// runs the legs. Fail closed everywhere: any unreadable input runs the full
// suite, which is byte-identical to the pre-selection step.
//
// Selection applies to PR-tier CI only: release-gate keeps its unconditional
// `npm test -- --shard=i/N` run line and never runs this script, and the
// nightly workflow re-proves the full suite on the tips daily (docs/qa-gate.md).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildShardPlan, parseShardArg } from './lib/ci_shard_plan.mjs';
import { collectSuiteVisibility } from './lib/gate_discovery.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const shard = parseShardArg(argv);
if (!shard) {
  // The shard spec comes from the workflow matrix, so a malformed one is a
  // wiring bug: fail loud, never guess a partition.
  console.error('[ci-shard] usage: node scripts/ci_shard_test.mjs --shard=<i>/<N> [--plan-only]');
  process.exit(1);
}
// Audit mode: print the whole decision and the exact leg commands without
// spawning them. For humans reproducing a CI decision locally, and for the
// subprocess tests that prove this entry is actually wired to the planner.
// The ci.yml run line is pinned WITHOUT this flag (tests/ci_workflow.test.ts),
// so it can never quietly turn the real shard step into a no-op.
const planOnly = argv.includes('--plan-only');

// Same worker bound as the run line this replaces: half the runner's cores.
const workers = Math.max(1, Math.floor(os.availableParallelism() / 2));

const mode = process.env.TEST_MODE ?? '';
const modeReason = process.env.TEST_MODE_REASON ?? '';

/** @type {string[] | null} */
let changedPaths = null;
if (mode === 'selective') {
  try {
    const parsed = JSON.parse(process.env.CHANGED_FILES ?? '');
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) {
      changedPaths = parsed;
    }
  } catch {
    changedPaths = null;
  }
}

// The suite classification is recomputed here, in the PR's own tree, with the
// same shared code the local selective gate runs (lib/gate_discovery.mjs), so
// a test added by this very PR classifies the moment it exists.
const { testFiles, alwaysRun, counts } = collectSuiteVisibility({
  root: repoRoot,
  readdirSync,
  readFileSync,
  join: path.join,
  relative: path.relative,
  sep: path.sep,
});

const plan = buildShardPlan({
  mode,
  changedPaths: changedPaths ?? undefined,
  alwaysRun,
  testFiles,
  shard,
  workers,
  exists: (p) => existsSync(path.join(repoRoot, p)),
});

console.log(`[ci-shard] shard ${shard.index}/${shard.total}, workers=${workers}`);
console.log(
  `[ci-shard] changes-job decision: mode=${mode || '(unset)'}${modeReason ? ` (${modeReason})` : ''}`,
);
console.log(
  `[ci-shard] suite: ${testFiles.length} test files (${counts.graph} graph-visible, ` +
    `${counts.blind} blind, ${counts.partial} partial); always-run floor ${alwaysRun.length}`,
);
console.log(`[ci-shard] plan: mode=${plan.mode} (${plan.reason})`);
if (plan.mode === 'selective') {
  console.log(
    `[ci-shard] runs: ${plan.floorCount} floor file(s) sharded ${shard.total} ways, plus ` +
      `vitest related over ${plan.relatedCount} changed source(s)`,
  );
  console.log(
    `[ci-shard] skips: ${plan.skippedCount} graph-visible test file(s) unrelated to this diff. ` +
      'Backstops: the release/** push run and the nightly gate run the full suite (docs/qa-gate.md).',
  );
}

for (const { name, cmd, args } of plan.legs) {
  console.log(`\n[ci-shard] ${name}: ${cmd} ${args.join(' ')}`);
  if (planOnly) continue;
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
  if (res.status !== 0) {
    console.error(`\n[ci-shard] FAIL at "${name}" (exit ${res.status ?? 'killed'})`);
    process.exit(res.status ?? 1);
  }
}

if (planOnly) {
  console.log(`\n[ci-shard] plan-only: ${plan.legs.length} leg(s) printed, nothing spawned`);
} else {
  console.log(
    `\n[ci-shard] PASS: ${plan.legs.length} leg(s) green on shard ${shard.index}/${shard.total}`,
  );
}
