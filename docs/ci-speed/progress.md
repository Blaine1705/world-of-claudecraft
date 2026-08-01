# Progress: CI Speed

## Status board

| Phase | Status | PR | Notes |
|---|---|---|---|
| 1 Fixed-cost waste | DONE | #2737 | Lint checkout 22 to 25s; job 59 to 68s |
| 1 QA | PASS-WITH-FOLLOWUPS | #2737 ready | Docs + pin harden followups only; no BLOCKING |
| 2 Shard count | DONE (wall DEFER) | #2737 | Locked N=8; DEFER ≤8 min; wall babysitting stopped |
| 2 QA | NOT STARTED | | Ready for phase-02-qa.md; no more wall re-runs |
| 3 Shard rebalance | NOT STARTED | | 20% balance; re-check ≤ 8 min under N=8 |
| 3 QA | NOT STARTED | | |
| 4 Release-checks split | NOT STARTED | | |
| 4 QA | NOT STARTED | | |
| 5 Path filters + close | NOT STARTED | | |
| 5 QA | NOT STARTED | | Whole-packet + teardown offer |

## Measurement log

Append-only. Each row: date, phase, run id, wall (s), worst shard (s), N, notes.

| Date | Phase | Run | Wall s | Worst shard s | N | Notes |
|---|---|---|---|---|---|---|
| 2026-08-01 | baseline | 30705333396 | 765 | 683 | 4 | PR green, eastbrook fence |
| 2026-08-01 | baseline | 30704449673 | 853 | 776 | 4 | PR green, vendor stack |
| 2026-08-01 | baseline | 30703789135 | 702 | 573 | 4 | main push green |
| 2026-08-01 | p2-measure | 30707931452 | 594 | 502 | 6 | PR green; files sum 1926; MISS 8-min bar |
| 2026-08-01 | p2-measure | 30708423524 | ~524 (att1) | 436 | 8 | att1 shard 4 flake then re-run green; files 1926; critical path shard 5 job 520s; MISS 8-min bar |
| 2026-08-01 | p2-wall | 30709155848 | 449 | 376 | 8 | PR green (lock commit); files 1926; UNDER 8 min (7.48 min); not three-in-a-row |
| 2026-08-01 | p2-wall | 30709485828 | 514 | 436 | 8 | workflow_dispatch green; files 1926; OVER 8 min (8.57 min); babysitting stopped |

### Phase 2 N=6 detail (run 30707931452, green)

| Shard | Job s | Vitest Duration s | Test Files |
|---|---|---|---|
| 1 | 296 | 228.16 | 321 |
| 2 | 394 | 326.96 | 321 |
| 3 | 382 | 313.55 | 321 |
| 4 | 575 | 502.39 | 321 |
| 5 | 307 | 237.54 | 321 |
| 6 | 310 | 241.97 | 321 |
| **sum** | | | **1926** |

Wall: createdAt 16:20:57Z to last job complete 16:30:51Z = **594s (9.90 min)**.
Worst/median vitest = 502.39 / 313.55 ≈ 1.60. Completeness: 1926 matches suite baseline.

### Phase 2 N=8 detail (run 30708423524)

First attempt: wall ~524s (8.73 min) to last completing shard (shard 5 at 16:42:53Z);
shard 4 failed with `EnvironmentTeardownError: Closing rpc while onUserConsoleLog
was pending` (vitest worker teardown flake, not a suite shrink). Re-run --failed
made the run green; shard 4 re-attempt vitest 360.58s.

| Shard | Job s | Vitest Duration s | Test Files | Notes |
|---|---|---|---|---|
| 1 | 271 | 211.72 | 241 | att1 green |
| 2 | 279 | 209.55 | 241 | att1 green |
| 3 | 247 | 179.20 | 241 | att1 green |
| 4 | 437 (re) | 360.58 (re) | 241 | att1 flake; re-run green |
| 5 | 520 | 435.88 | 241 | worst vitest; drives critical path |
| 6 | 333 | 258.19 | 241 | att1 green |
| 7 | 283 | 208.15 | 240 | att1 green |
| 8 | 315 | 246.84 | 240 | att1 green |
| **sum** | | | **1926** | completeness OK |

Worst/median vitest ≈ 435.88 / 246.84 ≈ 1.77. N=8 improves wall vs N=6 (594s ->
~524s) but is not stable under 480s. **Lock N=8. DEFER ≤ 8 min bar to Phase 3
rebalance.**

### Phase 2 wall samples after lock (babysitting stopped)

| Run | Event | Wall s | Worst vitest s | Files | vs 480s |
|---|---|---|---|---|---|
| 30709155848 | pull_request | 449 | 375.7 | 1926 | UNDER |
| 30709485828 | workflow_dispatch | 514 | 436.31 | 1926 | OVER |

D5 wants three consecutive green walls ≤ 480s. Observed variance straddles the
bar (one under, one over). Owner stopped further re-runs; treat Phase 2 wall
acceptance as **explicit DEFER to Phase 3** (rebalance heavy shards under N=8).
PR #2737 remains green on the lock commit (N=8 matrix live).

### Phase 1 lint timing (checkout step seconds; target ≤ 40s checkout, ≤ 90s job)

| Date | Run | Lint checkout s | Lint job s | Notes |
|---|---|---|---|---|
| 2026-08-01 | 30707112749 | 25 | 59 | PR push #1; Biome 1s; success (later cancelled mid-matrix by supersession) |
| 2026-08-01 | 30707206995 | 22 | 68 | PR push #2 (pin harden); success; later cancelled mid-matrix |
| 2026-08-01 | 30707453993 | 24 | 60 | workflow_dispatch on branch; success |
| 2026-08-01 | 30707518969 | 25 | 63 | tip resample after docs timing commit; lint success |

Baseline was 96 to 195s checkout (outlier 588s). All Phase 1 checkouts
are ≤ 40s and jobs ≤ 90s.

### Phase 1 Playwright cache evidence

| Date | Run | Event | Cache key result | Notes |
|---|---|---|---|---|
| 2026-08-01 | 30707112749 | pull_request | MISS | First PR run; saved `playwright-chromium-Linux-1.61.1` |
| 2026-08-01 | 30707206995 | pull_request | HIT | Second PR run; install still ran (OS deps); no browser download |
| 2026-08-01 | 30707453993 | workflow_dispatch | MISS | Expected: GHA cache scope is `refs/heads/*` vs PR `refs/pull/<n>/merge` |
| 2026-08-01 | 30707518969 | pull_request | HIT | Tip PR run; hit primary key; no browser download |

Install always runs after restore (`npx playwright install --with-deps chromium`).

## Phase 1 checklist

- [x] Worktree off latest release/**
- [x] Lint: no `fetch-depth: 0`; base ref still correct for PR and push
- [x] Concurrency cancel-in-progress for PRs; release isolated (D4)
- [x] Playwright Chromium cache on browser-gate
- [x] `tests/ci_workflow.test.ts` pins updated same commits
- [x] `docs/ci-speed/**` committed
- [x] Three runs: lint checkout ≤ 40s, job ≤ 90s typical (22/25/24s; 68/59/60s)
- [x] Draft PR opened (#2737 against release/v0.34.0)
- [x] Phase 1 QA PASS-WITH-FOLLOWUPS (2026-08-01)

### Phase 1 QA evidence (2026-08-01)

- Worktree: `/home/fernandoramirez/Documents/world-of-claudecraft-ci-speed` on
  `feature/ci-speed`. Base sync: ahead of `origin/release/v0.34.0`, not behind.
- Pins: `npx vitest run tests/ci_workflow.test.ts` green (8 tests).
- Red-path local proofs: lint `fetch-depth: 0` fails pins; `cancel-in-progress:
  false` fails; group without `event_name` fails; job-level-only concurrency
  fails adjacency; cache after install fails order; wrong cache path fails.
- Concurrency live: PR runs 30707112749 and 30707206995 cancelled mid-matrix
  after superseding pushes (same `CI-pull_request-<n>` group).
- Reviewers: privacy-security-review CLEAN; test-coverage-auditor PASS;
  qa-checklist PASS-WITH-FOLLOWUPS (docs hygiene + optional pin harden).

### Phase 1 followups (owner-visible; not BLOCKING)

| Severity | Item | Owner |
|---|---|---|
| SHOULD-FIX | Pin harden: require cache `key:` to consume `steps.playwright-version.outputs.version` (not mere `require('playwright/...')` presence) | Phase 2 or small follow commit |
| SHOULD-FIX | Pin harden: PR arm `BASE_REF` / `ref=origin/$BASE_REF` adjacency, not bare token contains | Phase 2 or small follow commit |
| SHOULD-FIX | Pin harden: cache-before-install order against name→uses match, not raw `indexOf` of the step title | Phase 2 or small follow commit |
| NICE-TO-HAVE | Ban `fetch-depth: '0'` (single quotes) on lint | optional |
| NICE-TO-HAVE | `git fetch ... -- "$REF"` defense-in-depth in determine-base | optional |

## Phase 2 checklist

- [x] Measure N=6 wall + completeness (594s green, files 1926)
- [x] Measure N=8 wall + completeness (~524s critical path, files 1926; shard 4 att1 flake)
- [x] Lock N=8 in state.md (N=6 and N=8 both miss ≤ 8 min; max allowed without owner OK)
- [x] Matrix applied pr-gate + release-gate (`shard: [1..8]`, `--shard=i/8`)
- [x] Pins + comments updated (SHARD_N=8; no hardcoded /4 left)
- [x] gate.mjs still unsharded
- [x] Three consecutive green PR walls ≤ 8 min OR explicit deferral numbers to Phase 3
  (**DEFER**: N=6=594s, N=8≈524s; Phase 3 rebalance required)
- [x] Branch-protection check names listed in PR body (owner must update protection)
- [ ] Draft PR + Phase 2 QA PASS (QA gate marks ready per phase-02-qa.md)

### Branch protection check names (owner action, OPEN item 3)

After Phase 2 the required PR-gate matrix checks become:

- `PR gate (English-only legal) (1)`
- `PR gate (English-only legal) (2)`
- `PR gate (English-only legal) (3)`
- `PR gate (English-only legal) (4)`
- `PR gate (English-only legal) (5)`
- `PR gate (English-only legal) (6)`
- `PR gate (English-only legal) (7)`
- `PR gate (English-only legal) (8)`

Unchanged siblings: `Format + lint (Biome, changed files)`,
`PR checks (freshness, typecheck, builds)`, `Browser regressions (Chromium)`.
Remove any required checks still named only `(1)`..`(4)` if the org still pins N=4.

## Phase 3 checklist

- [ ] Live top-cost files under locked N=8
- [ ] Pure splits (vale_cup pattern) with shard simulation
- [ ] Worst Duration within 20% of median
- [ ] Completeness holds
- [ ] Three green runs; wall ≤ 8 min; stretch ≤ 6 min if hit
- [ ] Draft PR + Phase 3 QA PASS

## Phase 4 checklist

- [ ] `release-checks` job parallel to release-gate
- [ ] release-gate tests-only (no matrix.shard == 1 steps)
- [ ] Pins re-derived from YAML
- [ ] Scratch release probe or deferred note
- [ ] Draft PR + Phase 4 QA PASS

## Phase 5 checklist

- [ ] Path filter / changes detection
- [ ] Docs-only probe skips test matrix, keeps lint
- [ ] Code PR still full matrix
- [ ] Aggregator only if required (OPEN item 5)
- [ ] Whole-packet QA PASS
- [ ] Teardown offer recorded (delete only on owner confirm)
