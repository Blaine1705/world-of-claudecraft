# Phase 4: Release-checks split

Mirror the PR-tier `pr-checks` pattern on the release tier so release wall is
max(test shards, checks), not tests-then-builds on shard 1.

## Outcome

- New `release-checks` job runs in parallel with `release-gate` (no `needs`
  either way).
- `release-gate` is tests-only (matrix of N shards), same shape as `pr-gate`
  plus job-level `I18N_RELEASE_TIER=1`.
- Pins re-derived; no stale `matrix.shard == 1` gated checks on release-gate.
- Live release probe or explicit deferral (OPEN item 6 / D8).

## Scope

In: `.github/workflows/ci.yml`, `tests/ci_workflow.test.ts`, comments in
`ci.yml` / `scripts/gate.mjs`, progress/state docs.

Out: changing N; path filters; lint/browser; gate.mjs gaining new steps
unless a comment-only sync.

## Suggested branch

`feature/ci-speed-release-checks` off latest release/** after Phase 2
(Phase 3 optional).

## Starter prompt

```
This is Phase 4 of the CI Speed packet: Release-checks split.

Goal: split release serialized checks into release-checks parallel to
release-gate tests, mirroring pr-checks / pr-gate, without dropping any
release-tier enforcement (D8).

STEP 0 - PRE-FLIGHT:
- Worktree off latest release/**. Branch: feature/ci-speed-release-checks.
- Phase 2 must be merged (known N). Phase 3 optional.

STEP 1 - LOAD CONTEXT:
- state.md D3, D8, D13; this phase file; progress.md
- ci.yml: pr-checks (the template), release-gate (current serialized steps),
  if-conditions for release vs PR
- tests/ci_workflow.test.ts full file (every count pin)
Return: exact list of steps that must move; current check:types occurrence
count; current matrix.shard == 1 count; job-slicing regex constraints.

STEP 2 - EXECUTE:
1) Add release-checks:
   - Same if-condition as release-gate (release/** push or release-to-main PR)
   - runs-on ubuntu-latest
   - Job-level env I18N_RELEASE_TIER: '1' only if any step needs it for
     correctness; prefer putting it only where required. Freshness/malware/
     builds usually do not need the flag; do not put the flag on pr-* jobs.
   - Steps: checkout, setup-node, npm ci, i18n:gen, coverage summary,
     freshness git diff, security:gate, check:types, build:env, build:server,
     build (client). Match pr-checks ordering and comments where applicable.
   - No needs: toward release-gate

2) Slim release-gate to tests-only:
   - Keep matrix, fail-fast false, I18N_RELEASE_TIER job-level env (required
     so every test shard is release-tier; existing pin)
   - Steps: checkout, setup-node, npm ci, npm test -- --shard=.../N
   - Remove all if: matrix.shard == 1 steps (they moved)
   - Keep pretest-by-design comment

3) Pins (D13): re-read YAML and rewrite pins; do not assume counts.
   - check:types should still appear exactly where intended (likely pr-checks
     + release-checks = 2)
   - release-gate must NOT contain matrix.shard == 1
   - release-checks must not contain strategy/matrix or npm test
   - pr-gate / pr-checks pins stay green
   - Step-name counts on release-gate become the tests-only shape
   - Add pins that release-checks exists with the required steps and the same
     if-fragment as release-gate
   - Prove at least one red path mentally or with a quick temporary edit

4) Comments in ci.yml header and gate.mjs: describe PR parallel pair and
   release parallel pair; gate stays serial.

STEP 3 - VALIDATE:
- npx vitest run tests/ci_workflow.test.ts
- Push draft PR
- Release arm: preferred, push a scratch release/<ver>-ci-speed-probe branch
  with version surfaces valid enough for release-version-gate, or document
  DEFER to next real release push in progress.md (OPEN item 6). Do not leave
  the probe branch around.
- Confirm release-checks and release-gate both ran (or both skipped together
  on a non-release PR)

STEP 4 - REVIEW + HANDOFF:
- privacy-security-review, test-coverage-auditor
- Update progress/state; draft PR; QA marks ready

STOPPING RULES:
- Never drop I18N_RELEASE_TIER from the test job env.
- Never let release-checks run on ordinary PRs.
- Do not change N here.
```

## Exit criteria

- [x] release-checks parallel, complete step list
- [x] release-gate tests-only
- [x] Pins green and count-correct
- [x] Probe or deferred note (DEFERRED OPEN item 6)
- [x] Draft PR open (#2737 stacked; Phases 1 to 4)
