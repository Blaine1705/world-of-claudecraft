# Phase 3: Shard rebalance

Flatten the worst shards under the locked N by pure test-file splits (and
only if needed, a documented path-matrix redesign with owner OK). Hit D11
balance; pursue the ≤ 6 min stretch wall without raising N (D5).

## Outcome

- Worst shard vitest Duration within 20% of the median on the same run.
- Suite completeness preserved (no dropped or double-run files).
- PR wall still ≤ 8 min; ≤ 6 min if achievable.
- Heavy co-located files split along describe boundaries (vale_cup pattern).

## Scope

In: heavy `tests/**/*.test.ts` splits + local `*_util.ts` helpers if needed;
optional tiny shard-simulation helper under `tests/` if it earns a pin;
`docs/ci-speed/progress.md` + `state.md`. Workflow matrix N stays fixed.

Out: changing N; release-checks; path filters; deleting tests; rewriting app
imports for speed (D15).

## Suggested branch

`feature/ci-speed-rebalance` off latest release/** after Phase 2 merges.

## Starter prompt

```
This is Phase 3 of the CI Speed packet: Shard rebalance.

Goal: under the locked N from state.md, make the worst shard Duration within
20% of the median (D11) via pure test-file splits, without raising N or
dropping tests. Stretch: PR wall ≤ 6 min if balance allows.

STEP 0 - PRE-FLIGHT:
- Worktree off latest release/** with Phase 2 merged. Branch:
  feature/ci-speed-rebalance.
- Confirm locked N in state.md. If N is unset, stop; Phase 2 is not done.

STEP 1 - LOAD CONTEXT:
- state.md (D6, D11, D15), progress.md measurement log, brainstorm.md heavy
  file candidates, this phase file
- Latest green CI logs for all shards under locked N (gh run view --log):
  extract Duration and, if present, slowest files
- Prior split exemplar: tests/vale_cup_*.test.ts and tests/vale_cup_util.ts
- How vitest --shard assigns files (sha1 of path; confirm against current
  vitest version behavior before simulating)
Return: ranked cost files on the worst one or two shards; which describes
are safe split boundaries; a shard-simulation approach.

STEP 2 - SIMULATE before moving:
- Build a small script or one-off node snippet that assigns each test file
  path to shard i/N the same way vitest does (verify against a live
  --shard run's file list if unsure).
- Propose renames/splits that move monsters off the worst shard without
  stacking them onto the same destination shard.
- Prefer 2 to 4 high-impact splits first; re-measure; iterate once more if
  needed. Do not boil the ocean.

STEP 3 - EXECUTE splits (vale_cup rules):
- Pure moves: identical test bodies and assertions; shared helpers to a local
  util only when duplication would be worse
- No logic or assertion changes
- Names chosen so the simulator places siblings on different shards when that
  is the point
- Keep total test count stable (count before/after)
- If after two split rounds D11 still fails, STOP and write a short design
  note in progress.md for a path-matrix alternative; do NOT implement a
  path matrix without owner OK (default remains --shard)

STEP 4 - VALIDATE:
- npx vitest run on the split files (and util)
- Push; three green CI runs
- From logs: compute median and worst Duration; worst <= median * 1.20
- Completeness sum == full file count
- Wall times into progress.md (≤ 8 required; ≤ 6 stretch)

STEP 5 - REVIEW + HANDOFF:
- test-coverage-auditor (splits must not weaken assertions; count preservation)
- qa-checklist at end
- privacy-security only if ci.yml changed (it should not)
- Update progress/state; draft PR

STOPPING RULES:
- No N change. No test deletion. No fail-fast true.
- Do not merge unbalanced "optimizations" that only rename without simulation.
```

## Tests

- Split suites keep decisive assertions.
- Optional: pin the shard-simulation helper if introduced.
- No requirement to change `ci_workflow.test.ts` unless a workflow comment
  needs a wording fix.

## Exit criteria

- [ ] D11 balance met on three runs (or two runs + one more if flaky schedule)
- [ ] Completeness holds
- [ ] Wall ≤ 8 min; stretch ≤ 6 recorded if hit
- [ ] Draft PR open

## State for Phase 4

Phase 4 can proceed in parallel after Phase 2 if needed; after Phase 3 is
ideal so wall numbers in the release-checks PR are not churned by rebalance
pushes.
