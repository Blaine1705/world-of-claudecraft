# Phase 2: Shard count escalation

Measure N=6 and N=8 on the live suite, lock N, apply the matrix to `pr-gate`
and `release-gate`, and hit the ≤ 8 minute PR wall bar (D5, D6).

## Outcome

- Locked N in {6, 8} recorded in `state.md` with measurement evidence.
- Both test matrices use `shard: [1, .., N]` and `--shard=${{ matrix.shard }}/N`.
- Three consecutive green PR walls ≤ 8 minutes, or an explicit numerical
  deferral into Phase 3 (not a silent miss).
- Pins and comments no longer hardcode 4.

## Scope

In: `.github/workflows/ci.yml` (pr-gate, release-gate matrices and test run
lines; release-gate `matrix.shard == 1` conditions stay if Phase 4 not done),
`tests/ci_workflow.test.ts`, keep-in-sync comments in `ci.yml` /
`scripts/gate.mjs`, `docs/ci-speed/state.md` + `progress.md`.

Out: heavy file splits (Phase 3), release-checks job (Phase 4), path filters
(Phase 5), changing maxWorkers formula, larger runners (D1).

## Suggested branch

`feature/ci-speed-shard-n` off latest release/** after Phase 1 merges (or off
Phase 1 branch only if Phase 1 is not yet merged and you accept rebasing).

## Starter prompt

```
This is Phase 2 of the CI Speed packet: Shard count escalation.

Goal: pick N in {6, 8} by measurement, apply it to pr-gate and release-gate,
update pins, and land three consecutive green PR walls at or under 8 minutes
(D5). Do not rebalance files yet (Phase 3). Do not raise N past 8.

STEP 0 - PRE-FLIGHT:
- Worktree off latest release/** with Phase 1 merged (or include Phase 1).
  Branch: feature/ci-speed-shard-n.
- Confirm docs/ci-speed/ is present. Read state.md D3, D5, D6, D9, D13.

STEP 1 - LOAD CONTEXT:
- state.md, progress.md, brainstorm.md (shard timing table), this phase file
- ci.yml pr-gate and release-gate jobs
- tests/ci_workflow.test.ts (the whole shard pin block)
- scripts/gate.mjs header (must stay unsharded)
Return: every hardcoded "4" related to shards in YAML, tests, and comments.

STEP 2 - MEASURE FIRST (before locking N):
- On this branch, temporarily set N=6, push, record: wall, per-shard Duration
  from logs, Test Files counts per shard, completeness sum.
- Then N=8, same measurements.
- Optional: local probe npm test -- --shard=i/N for i in 1..N is useful for
  completeness only; wall acceptance is CI wall, not local.
- Append rows to docs/ci-speed/progress.md measurement log.
- Lock N: prefer the smallest N in {6, 8} that hits ≤ 8 min wall on a green
  run; if neither hits, lock N=8, record the miss, and note Phase 3 must
  rebalance before re-checking the bar (D5 stopping rule: do not try N=10).

STEP 3 - APPLY permanently:
- strategy.matrix.shard: [1, 2, ..., N] on pr-gate and release-gate
- run: npm test -- --shard=${{ matrix.shard }}/N with the existing half-core
  maxWorkers cap (D3, D6)
- fail-fast: false
- release-gate: keep I18N_RELEASE_TIER job-level env; keep existing
  if: matrix.shard == 1 on serialized steps until Phase 4 removes them
- Update ALL pins in tests/ci_workflow.test.ts that mention 4 shards, /4,
  step counts, and match counts. Prefer deriving N from a single constant in
  the test file if that reduces thrash, but do not over-abstract.
- Update ci.yml and gate.mjs comments that say "4-shard".
- gate.mjs must still not contain --shard (D9).

STEP 4 - VALIDATE:
- npx vitest run tests/ci_workflow.test.ts
- Push; collect THREE consecutive green PR (or workflow_dispatch on a PR-like
  path) walls ≤ 8 min. If using a draft PR, force-empty commits are OK for
  re-runs only if they do not pollute history preferately use workflow_dispatch
  or re-run jobs; record run ids.
- Completeness: for each of the three runs, sum Test Files across shards and
  compare to a single unsharded file count from a local or one-job reference.
- List new GitHub check names for branch protection in the PR body (OPEN item 3).

STEP 5 - REVIEW + HANDOFF:
- privacy-security-review, test-coverage-auditor
- Update state.md: locked N, supersede N=4, current phase line
- Update progress.md Phase 2 checklist
- Draft PR; Phase 2 QA marks ready

STOPPING RULES:
- N only in {6, 8}. Owner approval required to go higher.
- If completeness fails (files lost/duplicated), fix before accepting wall times.
- Never bare npx vitest in CI.
```

## Tests

- Rewrite the shard pin block in `tests/ci_workflow.test.ts` for N.
- Prove red paths: wrong denominator, missing matrix, gate gaining --shard.

## Validation

```bash
npx vitest run tests/ci_workflow.test.ts
# CI: three green runs; record walls in progress.md
```

## Exit criteria

- [ ] N locked with measurement table
- [ ] YAML + pins + comments consistent
- [ ] Completeness holds on measurement runs
- [ ] Three walls ≤ 8 min OR explicit deferral with numbers toward Phase 3
- [ ] Branch-protection names in PR body
- [ ] Draft PR open

## State for Phase 3

Phase 3 needs the locked N and at least one green run's per-shard Duration
breakdown to rank heavy files.
