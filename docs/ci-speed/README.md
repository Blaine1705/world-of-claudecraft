# CI Speed packet

Bring the PR and release CI wall clock back under control after the suite
outgrew the mid-July 4-shard design. The job graph from the Toolchain
Modernization packet (parallel `pr-checks`, 4-way vitest shards, two-tier
i18n) stays; this packet re-measures, re-shards, rebalances, and removes
fixed-cost waste that no longer pays for itself.

**Problem (measured 2026-08-01 on `release/v0.34.0`):** PR wall ~12 to 14
minutes; worst shard ~11 minutes of vitest; suite ~1,926 test files /
~24k tests. Phase 4 of the prior packet shipped at ~3 minutes wall with
~1,129 files. Growth, not a missing workflow file, is the regression.

**Non-goal:** inventing extra workflow YAML files for the same jobs. Job
parallelism already exists inside `ci.yml`. Wall clock equals the longest
job, not the sum.

Related prior work (historical, already merged): Toolchain Modernization
Phases 3 and 4 (`pr-checks` split, N=4 shards). Do not re-open those
decisions except where this packet explicitly supersedes them (shard
count N, lint checkout depth).

## Reading order

1. `brainstorm.md`: research record, live timings, baselines.
2. `implementation-plan.md`: phases, workflow, review matrix.
3. `state.md`: locked decisions, validation matrix, OPEN items, resume point.
4. `progress.md`: live checklists.
5. `qa-checklist.md`: whole-packet integration criteria (run at Phase 5 QA).

## Phase files (fresh session per file, in order)

| Order | File | One-line scope |
|---|---|---|
| 1 | `phase-01-fixed-cost-waste.md` | Lint checkout, PR concurrency cancel, Playwright cache; lands the packet |
| 1 QA | `phase-01-qa.md` | Verify Phase 1 |
| 2 | `phase-02-shard-count.md` | Measure N=6 and N=8; lock N; apply matrix + pins |
| 2 QA | `phase-02-qa.md` | Verify Phase 2 (wall ≤ 8 min bar) |
| 3 | `phase-03-shard-rebalance.md` | Split heavy co-located files; balance worst shard |
| 3 QA | `phase-03-qa.md` | Verify Phase 3 (balance + stretch wall) |
| 4 | `phase-04-release-checks-split.md` | Mirror `pr-checks` as `release-checks` |
| 4 QA | `phase-04-qa.md` | Verify Phase 4 |
| 5 | `phase-05-path-filters-and-close.md` | Docs-only fast path; packet close |
| 5 QA | `phase-05-qa.md` | Whole-packet QA; teardown offer |

Ordering: Phase 1 first (lands the packet + free wins). Phase 2 needs Phase 1
merged only for a clean critical-path measurement (lint no longer spikes into
the same wall). Phase 3 needs Phase 2's locked N. Phase 4 is independent of 3
in code but should land after 2 so pin counts do not thrash. Phase 5 is last.

## Worktree

Planning worktree (this packet was authored here):

`/home/fernandoramirez/Documents/world-of-claudecraft-ci-speed`

Branch at authoring: `feature/ci-speed` tracking `origin/release/v0.34.0`
(packet commit lives here; implementation phases cut their own feature branches).

Each implementation phase creates its own feature branch and worktree off the
**latest** `release/**` tip (re-fetch; do not trust a stale base). Suggested
branch names are in each phase file.
