# Progress: CI Speed

## Status board

| Phase | Status | PR | Notes |
|---|---|---|---|
| 1 Fixed-cost waste | DONE | #2737 | Lint checkout 22 to 25s; job 59 to 68s |
| 1 QA | PASS-WITH-FOLLOWUPS | #2737 ready | Docs + pin harden followups only; no BLOCKING |
| 2 Shard count | NOT STARTED | | Measure N, lock, apply |
| 2 QA | NOT STARTED | | Wall ≤ 8 min bar |
| 3 Shard rebalance | NOT STARTED | | 20% balance; stretch ≤ 6 min |
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

- [ ] Measure N=6 wall + completeness
- [ ] Measure N=8 wall + completeness
- [ ] Lock N in state.md
- [ ] Matrix applied pr-gate + release-gate
- [ ] Pins + comments updated (no hardcoded /4 left unless N=4, which it must not be)
- [ ] gate.mjs still unsharded
- [ ] Three consecutive green PR walls ≤ 8 min OR explicit deferral numbers to Phase 3
- [ ] Branch-protection check names listed in PR body
- [ ] Draft PR + Phase 2 QA PASS

## Phase 3 checklist

- [ ] Live top-cost files under locked N
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
