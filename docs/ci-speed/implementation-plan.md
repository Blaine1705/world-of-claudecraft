# Implementation Plan: CI Speed

Five implementation phases, each followed by its own QA session (10 sessions
total). Every session is fresh, runs the starter prompt from its phase file,
and obeys `state.md`. Starter prompts are model-neutral: use the active session
model and reasoning setting; do not weaken acceptance criteria for a faster
model.

## Canonical workflow (every phase)

1. **Step 0, pre-flight.** Clean worktree off the **latest** `release/**` tip
   (`git fetch origin 'release/*'` then measure
   `git rev-list --left-right --count HEAD...origin/release/<latest>`). Create
   a dedicated worktree/branch for the phase (names in the phase file). If
   `docs/ci-speed/` is missing (before Phase 1 merges), copy it from the
   planning worktree
   `/home/fernandoramirez/Documents/world-of-claudecraft-ci-speed/docs/ci-speed`.
   Preserve unrelated local work: never `git add -A`.
2. **Step 1, load context.** Explore `state.md`, `progress.md`, the phase
   file, and the phase's listed sources. Return conclusions, not file dumps.
3. **Step 2, execute.** Prefer small serial steps for YAML pin surgery. Fan
   out only for independent test-file splits (Phase 3). Do not invent new
   workflows or dependencies.
4. **Step 3, validate + review.** Run the validation matrix rows in `state.md`
   that match the diff. Dispatch reviewers per the matrix below (only matching
   rows). Prompt for COVERAGE, not filtering. No BLOCKING left before commit.
   Push the phase branch and open a **draft** PR against the release base using
   `.github/PULL_REQUEST_TEMPLATE.md`. The phase QA session marks ready after
   PASS.
5. **Step 4, docs.** Update `progress.md` and `state.md` in the same change
   as the work (explicit paths). Record measured run IDs and wall times.

**Code hygiene:** module-first only if new logic appears (most of this packet
is YAML + test moves); decisive pins for every CI shape change in
`tests/ci_workflow.test.ts` in the **same** commit as the YAML; no em dashes,
en dashes, or emojis; Conventional Commits with a scope and a body.

**Branch protection note:** changing the shard matrix renames matrix check
contexts (e.g. `PR gate (English-only legal) (3)` of 4 becomes of N). After
Phase 2 merges, the owner may need to refresh required checks. Record the
new names in the PR body.

## Review Dispatch Matrix (canonical; phase files reference it)

| Agent | Spawn ONLY when the diff touches | Skip for |
|---|---|---|
| `privacy-security-review` | `.github/workflows/**`, deploy/secret files, or security:gate behavior | pure test-file splits with no workflow change |
| `test-coverage-auditor` | new or changed pins in `tests/ci_workflow.test.ts` or completeness helpers | docs-only |
| `qa-checklist` | a phase is COMPLETE | mid-phase |
| `architecture-reviewer` | `src/sim/` (must not happen) | this packet |
| `frontend-seam-reviewer` | `src/ui/` / `src/render/` / `src/styles/` (must not happen) | this packet |
| `cross-platform-sync` | `src/world_api*` / wire (must not happen) | this packet |
| `migration-safety` / `database-performance-reviewer` | SQL / schema (must not happen) | this packet |

If only docs + `tests/ci_workflow.test.ts` + `ci.yml` change: privacy-security
(for CI yml) + test-coverage-auditor + qa-checklist at end. Pure test-file
moves without workflow edits: test-coverage-auditor + qa-checklist.

## Phase summaries

### Phase 1: Fixed-cost waste

**Outcome:** lint and browser jobs stop burning minutes; PR force-pushes cancel
stale runs; packet docs land on the release base.

- Lint: drop `fetch-depth: 0`; keep shallow checkout; ensure the base ref used
  by Biome `--since` is available (existing PR base fetch; fix push/`workflow_dispatch`
  arms if shallow HEAD alone is insufficient).
- Top-level `concurrency` on `ci.yml` for pull_request: group by
  `github.workflow` + `github.ref` (or `github.head_ref`),
  `cancel-in-progress: true`. Do **not** cancel release/** pushes mid-flight
  without care: either scope concurrency to `pull_request` only, or use a
  group that isolates release from PR (D4).
- Browser-gate: cache Playwright Chromium (path + key on Playwright version)
  so reinstall is a hit after the first run.
- Pins in `tests/ci_workflow.test.ts` for: no `fetch-depth: 0` on lint (or
  the new allowed shape), concurrency block presence and PR-only (or
  documented) scope, browser cache step.
- Carry `docs/ci-speed/**` into the repo on this PR.

**Out of scope:** shard count, release-checks split, path filters.

**Exit:** three consecutive runs with lint checkout ≤ 40s and lint job ≤ 90s
typical; concurrency observed cancelling a superseded PR run (or a documented
manual probe); draft PR ready after QA.

### Phase 2: Shard count escalation

**Outcome:** locked N in {6, 8}; matrix applied to `pr-gate` and
`release-gate`; PR wall ≤ 8 minutes over three consecutive green runs.

- Measure first on a throwaway branch or temporary commit: N=6 then N=8 (or
  both via two pushes). Record worst-shard vitest duration, job wall, and
  file-count completeness for each.
- Lock N in `state.md` (supersedes prior packet's N=4 lock for this surface).
- Apply `shard: [1, ..., N]` and `--shard=${{ matrix.shard }}/N` on both
  test jobs; keep `fail-fast: false`; keep half-core `maxWorkers` cap; keep
  `npm test` (pretest) never bare vitest.
- Update every pin that hardcodes `4` or `/4` or step counts in
  `tests/ci_workflow.test.ts` and the keep-in-sync comments in `ci.yml` /
  `scripts/gate.mjs`.
- `gate.mjs` stays unsharded (D9).

**Stopping rule (D5):** if N=8 still cannot hit ≤ 8 min over three runs even
with green shards, stop, record measurements, and proceed to Phase 3 before
raising N further. Do not go past N=8 in this packet without owner approval.

**Exit:** N locked; three consecutive green PR walls ≤ 8 min OR an explicit
deferral to Phase 3 with numbers; completeness holds; draft PR.

### Phase 3: Shard rebalance

**Outcome:** worst-shard vitest duration within 20% of the median; stretch
wall ≤ 6 min if achievable without raising N.

- From live logs under the locked N, list the top cost files (import + test
  time) on the worst one or two shards.
- Pure describe-boundary splits (vale_cup pattern): identical assertions,
  shared helpers in a local `*_util.ts` if needed, **names chosen with an
  exact vitest-shard simulation** so monsters do not re-cluster.
- Prefer splits over custom path matrices unless hash sharding still fails
  the 20% bar after two split rounds (then document a path-matrix design and
  get owner OK before implementing; default stays `--shard`).
- Re-measure completeness and balance; update any pins that count files only
  if a structural pin needs it (usually none).

**Out of scope:** rewriting production import graphs; deleting tests;
coverage merge reports.

**Exit:** balance criterion met; wall still ≤ 8 min (and ≤ 6 min if reached);
three green runs recorded; draft PR.

### Phase 4: Release-checks split

**Outcome:** release critical path is max(test shards, checks), not tests then
builds on shard 1.

- New `release-checks` job: same `if` as `release-gate`, `I18N_RELEASE_TIER=1`
  only where release-only steps need it (or job-level env if those steps
  require it; do not put the flag on test jobs). Carry: i18n:gen, coverage
  summary, freshness diff, security:gate, check:types, build:env,
  build:server, build.
- `release-gate` becomes tests-only matrix (mirror `pr-gate` shape): no
  `matrix.shard == 1` gated steps left.
- Update `tests/ci_workflow.test.ts`: `check:types` occurrence count becomes
  2 still? Today: pr-checks + release-gate = 2. After: pr-checks +
  release-checks = 2 (release-gate loses its copy). Re-derive every count pin
  from the real YAML; do not assume.
- Gate.mjs step list unchanged (serial local).
- Live-verify on a scratch `release/**` probe branch (delete after) or defer
  with explicit note to the next real release push.

**Exit:** pins green; release probe or deferred note; draft PR.

### Phase 5: Path filters and packet close

**Outcome:** docs/markdown/screenshot-only PRs skip the full test matrix;
code paths still full suite; packet closed.

- Add a lightweight `changes` (or equivalent) job using
  `dorny/paths-filter` **or** native `paths` / job `if` with
  `github.event` (prefer an approach with zero new deps if native is enough;
  `dorny/paths-filter` is allowed if native cannot express "docs only"
  cleanly: D10).
- Filter groups at minimum: `code` (src/, server/, tests/, headless/, bot/,
  scripts/, package.json, package-lock.json, tsconfig*, vite*, vitest*,
  biome.json, .github/workflows/), `docs` (docs/, **/*.md outside code),
  maybe `assets` (public/ large binaries) if useful.
- When `code` is false and event is pull_request: skip pr-gate matrix and
  optionally pr-checks builds; **keep lint**. Never skip release-gate on
  release/** pushes.
- Document required-check implications (skipped jobs show as skipped, not
  failed; branch protection must allow skipped required checks or use a
  final aggregator job that always runs and fails if a required path was
  skipped incorrectly: prefer a small `ci-result` aggregator if protection
  cannot accept skipped).
- Whole-packet QA via `qa-checklist.md`; offer teardown of `docs/ci-speed/`
  only on explicit owner confirmation after all phase PRs merge.

**Exit:** docs-only probe PR shows skipped test matrix + green lint; code PR
still full matrix; packet QA PASS; teardown deferred unless owner confirms.

## Dependency graph

```
Phase 1  ->  Phase 2  ->  Phase 3
                |
                v
             Phase 4  (after Phase 2 pins stabilize; parallelizable with 3 in
                       separate worktrees if owners accept pin-merge care)
                |
                v
             Phase 5
```

Prefer serial merges in order 1 to 5 to avoid pin thrash. Phases 3 and 4 may
run in parallel worktrees only if one owner merges them with a pin reconcile
pass.

## Completion criteria (whole packet)

- PR wall ≤ 8 min on three consecutive green runs after Phase 2+ (and ≤ 6
  min if Phase 3 stretch met).
- Lint job no longer full-history; typical ≤ 90s.
- PR concurrency cancels superseded runs.
- Release checks parallel to release tests.
- Docs-only PRs do not pay the full matrix.
- `tests/ci_workflow.test.ts` and `scripts/gate.mjs` comments match reality.
- No drop in PR-tier or release-tier enforcement (i18n tiers, malware, builds,
  browser job, completeness of the suite).
