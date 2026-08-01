# Progress: CI Speed

## Status board

| Phase | Status | PR | Notes |
|---|---|---|---|
| 1 Fixed-cost waste | IN PROGRESS | | Shallow lint, concurrency, Playwright cache landed; draft PR next |
| 1 QA | NOT STARTED | | |
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
| 2026-08-01 | (pending first CI after push) | | | Fill after draft PR CI runs |

## Phase 1 checklist

- [x] Worktree off latest release/**
- [x] Lint: no `fetch-depth: 0`; base ref still correct for PR and push
- [x] Concurrency cancel-in-progress for PRs; release isolated (D4)
- [x] Playwright Chromium cache on browser-gate
- [x] `tests/ci_workflow.test.ts` pins updated same commits
- [x] `docs/ci-speed/**` committed
- [ ] Three runs: lint checkout ≤ 40s, job ≤ 90s typical
- [ ] Draft PR opened
- [ ] Phase 1 QA PASS

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
