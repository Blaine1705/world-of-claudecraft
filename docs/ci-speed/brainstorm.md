# CI Speed: research record

Authoring date: 2026-08-01. Base tip: `origin/release/v0.34.0` at
`94f5ac63d` (Merge PR #2733). Worktree:
`/home/fernandoramirez/Documents/world-of-claudecraft-ci-speed`.

## Goal

Cut CI wall clock so PR feedback stays usable as the suite grows. Accept a
higher Actions-minutes bill if wall time drops (D7).

## Current CI shape (do not rediscover)

One workflow: `.github/workflows/ci.yml`.

| Job | Trigger | Role |
|---|---|---|
| `lint` | always | Biome `--changed --since` |
| `browser-gate` | always | Playwright Chromium suite |
| `pr-gate` matrix shard 1..4 | non-release | `npm test -- --shard=i/4` (PR i18n tier) |
| `pr-checks` | non-release | i18n:gen, freshness, malware, typecheck, 3 builds |
| `release-gate` matrix shard 1..4 | release | Same tests + `I18N_RELEASE_TIER=1`; serialized checks on shard 1 |
| `release-version-gate` | release | `npm run release:check` |

Local mirror: `scripts/gate.mjs` (serial, ONE unsharded vitest, bounded
workers). Pins: `tests/ci_workflow.test.ts`.

Prior packet history (Toolchain Modernization, mid-July 2026):

- Phase 3: `pr-checks` parallel to tests; FFmpeg from npm statics. Pre-split
  PR wall ~547 to 658s; post-split wall ~531s with pr-gate 527s.
- Phase 4: N=4 shards; PR wall **184 / 194 / 188s** over three runs; **1,129**
  test files; design locked as D7 in that packet.

## Live measurements (2026-08-01)

### Suite size

- ~1,926 `tests/**/*.test.ts` files (browser suite separate).
- Live PR run sums: 482+482+481+481 = 1,926 files; ~24,413 tests across shards.

### PR wall (representative green runs)

| Run | Branch | Wall | Critical job |
|---|---|---|---|
| 30705333396 | fix/eastbrook-stray-fence | **12.8 min** | pr-gate shard 3, 762s |
| 30704449673 | feature/vendor-buy-stack | **14.2 min** | pr-gate shard 3, 842s |
| 30703789135 | main push | **11.7 min** | pr-gate shard 2, 635s |

### Per-shard vitest (run 30705333396)

| Shard | Files | Tests | Duration | Import | Tests (sum) | Setup |
|---|---|---|---|---|---|---|
| 1 | 482 | 5.5k | 414s | 184s | 442s | ~102s |
| 2 | 482 | 6.4k | 588s | 174s | 825s | ~98s |
| 3 | 481 | 6.6k | **683s** | **482s** | 697s | ~101s |
| 4 | 481 | 5.9k | 370s | 202s | 374s | ~86s |

**Finding:** file counts are balanced; **runtime is not**. Shard 3 spends ~8
minutes importing. That is the smoking gun for Phase 3 rebalance work.

Fixed overhead per shard job: checkout ~20 to 30s + setup-node ~8 to 11s +
`npm ci` ~25 to 30s ≈ **60 to 70s** before vitest starts. Multiplied by N.

### Non-critical jobs (same run)

| Job | Time | Notes |
|---|---|---|
| pr-checks | ~109s | i18n:gen ~6s, typecheck ~15s, client build ~18s |
| browser-gate | ~95s | Chromium install ~23s, tests ~10s |
| lint | **622s** outlier / **~130 to 190s** typical | Biome itself ~1s; **checkout is the whole job** |

### Lint checkout (sample of recent runs)

`fetch-depth: 0` full history for Biome `--changed --since`:

- Typical: 96 to 195s checkout
- Outlier: **588s** checkout (run 30705333396)
- Biome step: always ~0 to 1s

The job already does `git fetch --depth=1 origin $BASE_REF` for PRs. Full
history is not required for `--since=origin/<base>`.

### Release runs

- release-gate shards green in ~9 to 12 min on the same suite.
- Recent release red was `release-version-gate` (version surfaces), not speed.
  Out of scope for this packet unless it blocks a measurement push.

## What is NOT the bottleneck

- i18n generation (~6s in pr-checks). The two-tier i18n job split already
  paid off; do not invent a third i18n workflow for wall clock.
- Typecheck and builds on the PR critical path (already parallel in pr-checks).
- Separate workflow files: they do not create extra concurrency beyond jobs
  in one workflow; they add maintenance and branch-protection check-name churn.

## Industry practices applied

Sources consulted 2026-08-01 (GitHub Actions community, monorepo guides,
performance writeups):

1. Parallel independent jobs (already done).
2. Matrix / shard expensive suites (done at N=4; escalate N + rebalance).
3. Cache deps (`setup-node` npm cache present).
4. Avoid full-history checkout unless required (lint violates this).
5. Path filters for monorepo partial CI (optional docs-only fast path).
6. Cancel in-progress PR runs on new pushes (missing today).
7. Larger runners: more cores help in-shard workers; bill more per minute.
   Deferred (D1) unless the owner unlocks Team larger runners.
8. Minutes vs wall tradeoff: more shards raise billed minutes; this packet
   accepts that for wall time (D7).

## Candidate heavy files (line-count proxy + shard 3 membership)

Not a runtime ranking. Phase 3 must re-rank from live logs. Proxies that land
on the slow side of the hash today:

- `tests/corpse_harvest_sim.test.ts` (~3.7k lines, shard 3)
- `tests/server/admin.test.ts` (~3.0k, shard 3)
- `tests/nythraxis_raid_unit.test.ts` (~2.7k, shard 3)
- `tests/hud_perf_budget.test.ts` (~2.7k, shard 3)
- `tests/localization_coverage.test.ts` (~1.8k, shard 3)
- `tests/guide.test.ts` (~1.7k, shard 3)
- `tests/localization_fixes.test.ts` (~1.6k, shard 3)
- Also watch large files on other shards for post-split re-clustering:
  `tests/snapshots.test.ts`, `tests/delves.test.ts`, `tests/dungeons.test.ts`.

Prior exemplar for pure describe-boundary splits:
`tests/vale_cup_*.test.ts` + `tests/vale_cup_util.ts` (Toolchain Phase 4).

## Rejected approaches (for this packet)

| Approach | Why rejected now |
|---|---|
| More workflow YAML files for the same jobs | No wall-clock gain |
| Re-serializing checks into tests | Undoes Phase 3 |
| Skipping the full suite on most code PRs | Unsafe for this monorepo |
| Dropping pretest / bare `npx vitest` in CI | Breaks S3, guide freshness, git-subprocess suites (pinned) |
| fail-fast: true on shards | Hides half the suite on first red |
| Raising N above 8 without new evidence | Setup tax dominates; Phase 2 stopping rule |
| Deep per-test import-graph rewrite | Open-ended; follow-up, not a phase |

## Success envelope

| Milestone | Wall target | How measured |
|---|---|---|
| Baseline (today) | 12 to 14 min | Three recent green PR runs |
| After Phase 2 | **≤ 8 min** over 3 consecutive green PR runs | Workflow wall = createdAt to last job complete |
| After Phase 3 (stretch) | **≤ 6 min** if balance allows | Same; do not fail Phase 3 solely on 6 if ≤ 8 holds and balance met |
| Lint job | **≤ 90s** typical checkout ≤ 40s | Three consecutive runs |
| Shard balance | Worst vitest duration within **20%** of median | From job logs |
| Completeness | Sum of per-shard test-file counts == unsharded count | Every green measurement run |

## OPEN questions settled only by Phase 2 measurement

- Exact N in {6, 8}.
- Whether N=6 already hits ≤ 8 min without Phase 3 (then Phase 3 is pure
  balance + stretch, not required for the 8 min bar).
