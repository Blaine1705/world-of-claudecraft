# State: CI Speed (cross-phase cheat sheet)

**Current phase:** Phase 5 DONE + D11 path-matrix **STOPPED** (two MISS).
Locked **N=8**. Completeness **1939**. PR wall samples UNDER 8 min (424s /
442s) on default packs. D11 residual ~1.32 accepted. Worktree
`/home/fernandoramirez/Documents/world-of-claudecraft-ci-speed` on
`feature/ci-speed`. PR #2737.

**Next action:** Owner merge of #2737 (or follow-ups). Optional docs/ci-speed/
teardown only with explicit confirm. Do not raise N past 8. No more rename
loops. No third path-matrix approach without measured per-file import costs.
Release-arm live probe DEFERRED (OPEN item 6).

## Locked decisions

- **D1 Runners:** stay on free standard `ubuntu-latest` runners. Larger
  runners / self-hosted are OUT of this packet unless the owner explicitly
  unlocks them mid-flight (record as an OPEN item flip, do not invent).
- **D2 Single workflow file:** keep one `.github/workflows/ci.yml` for the
  PR/release gate. Do not split into multiple workflow files for wall-clock
  reasons. Job fan-out inside the file is the parallelism unit.
- **D3 npm test + pretest:** every CI test shard runs `npm test` (with
  pretest regenerating i18n artifacts). Never bare `npx vitest` in CI. Local
  `scripts/gate.mjs` stays one full unsharded vitest with bounded workers.
- **D4 Concurrency:** cancel-in-progress applies to **pull_request** runs.
  Release/** pushes and release-to-main PRs must not be cancelled by unrelated
  PR traffic. Prefer concurrency scoped so release work is isolated (e.g.
  group includes `github.event_name` and ref, or only enable cancel on
  `pull_request`).
- **D5 Wall targets:** Phase 2 acceptance ≤ **8 minutes** PR wall over three
  consecutive green runs. Phase 3 stretch ≤ **6 minutes** if balance allows;
  Phase 3 may still PASS on balance alone if wall stays ≤ 8. Do not raise N
  past **8** without owner approval.
- **D6 Shard N:** **LOCKED N=8** by Phase 2 measurement (see progress.md).
  Supersedes the prior toolchain packet's locked N=4 for this surface only.
  N=6 missed the bar (594s). N=8 walls straddle 480s pre-rebalance; post
  Phase 3 batch 2 sample **424s UNDER**. `fail-fast: false` always. Half-core
  `maxWorkers` cap retained.
- **D7 Minutes vs wall:** more shards and more jobs increase billed Actions
  minutes. Accepted for this packet in exchange for lower wall clock.
- **D8 Enforcement parity:** PR tier and release tier must not drop checks.
  English-only legal PR vs full 21-locale release remains. Browser job stays
  separate. Malware gate, freshness, typecheck, and the three builds stay
  required on code paths.
- **D9 Gate local shape:** `scripts/gate.mjs` never gains `--shard`. It is
  the one full-suite serial pre-merge path.
- **D10 Path filters:** docs/markdown/screenshot-only PRs may skip the test
  matrix; any change under the `code` path set still runs the full suite.
  Release/** pushes always full release tier. Prefer zero new dependencies;
  `dorny/paths-filter` is allowed only if native path/`if` expressions cannot
  express the filter cleanly (justify in progress.md).
  **Status:** native `changes` job landed in Phase 5; no dorny.
- **D11 Balance metric:** after Phase 3, worst shard vitest **Duration**
  within **20%** of the median shard Duration on the same run.
  **Status after three pure-rename rounds: MISS** (359.31 / 270.83 = 1.327 on
  30712431702). Residual is s5 import cumulative (~420s).
  **Path-matrix follow-on (owner OK):** two approaches MISS (LPT 1.59, stripe
  1.64); sequencer unwired; residual remains ~1.32 on default packs. Details in
  `docs/ci-speed/phase-d11-path-matrix.md`.
- **D12 Lint history:** no full-repo `fetch-depth: 0` solely for Biome
  changed-files. Base ref for `--since` must still be correct for PR and push
  events.
- **D13 Pins same commit:** every `ci.yml` shape change updates
  `tests/ci_workflow.test.ts` in the same commit. Red-path the pin when
  practical (prove the pin fails if the YAML regresses).
- **D14 Copy rules:** no em dashes, en dashes, or emojis in code, comments,
  docs, commits, or PR text.
- **D15 Out of scope:** production sim/ui/server behavior, dependency adds
  unrelated to path filtering, coverage report merging, intentional test
  deletion, deep import-graph rewrites of the app under test.

## Non-negotiable constraints

- Root and area `CLAUDE.md` / `AGENTS.md` still apply.
- Shared-worktree care: explicit paths only; never discard other sessions'
  work.
- Branch protection may need an owner update when matrix job names change
  (Phase 2). Implementers document the new check names in the PR body; they
  do not silently change org settings unless authorized.
- `I18N_RELEASE_TIER` must remain a **job-level** env on release test work so
  every shard sees it. Moving it to a single step is a silent tier shrink
  (existing pin).

## Validation matrix (run the rows the diff matches)

| Change type | Commands / checks |
|---|---|
| `ci.yml` shape | `npx vitest run tests/ci_workflow.test.ts`; re-read job if-conditions by hand against D4/D8 |
| Lint checkout | Three CI runs: checkout step ≤ 40s, Biome still fails on a deliberate format break in a probe if used |
| Shard N | Completeness: sum of per-shard "Test Files" counts == single-run file count; three walls recorded |
| Test file splits | Split files + util green under vitest; total test count preserved; shard simulation shows monsters separated |
| Release-checks | Scratch release/** push or deferred note; pins for step counts and `matrix.shard == 1` absence |
| Path filters | Docs-only probe PR skips matrix; code PR full matrix |
| Any phase complete | Matching reviewers + `qa-checklist` / phase QA file |

## Baselines (freeze; update only with measured supersession)

| Metric | Value | Source |
|---|---|---|
| PR wall (2026-08-01) | 12.8 / 14.2 / 11.7 min | runs 30705333396, 30704449673, 30703789135 |
| Worst shard vitest | 683s (shard 3) | run 30705333396 |
| Best shard vitest | 370s (shard 4) | same |
| Suite files (pre Phase 3) | 1,926 | live shard sum (N=6 and N=8) |
| Suite files (post Phase 3 splits) | 1,939 | run 30710958267 |
| Suite tests | ~24.4k | live shard sum |
| Prior N=4 ship wall | 184 / 194 / 188s | toolchain Phase 4, ~1,129 files |
| Phase 2 N=6 green wall | 594s (9.90 min) | run 30707931452 |
| Phase 2 N=6 worst vitest | 502.39s (shard 4) | same |
| Phase 2 N=8 first attempt wall | ~524s (8.73 min) | run 30708423524 attempt 1 (shard 4 flaked; critical path was shard 5) |
| Phase 2 N=8 worst vitest | 435.88s (shard 5) | same |
| Phase 3 batch 2 wall | **424s (7.07 min)** | run 30710958267 |
| Phase 3 batch 2 worst vitest | 351.26s (shard 5) | same; D11 ratio 1.315 |
| Phase 3 batch 3 wall | **442s (7.37 min)** | run 30712431702 |
| Phase 3 batch 3 worst vitest | 359.31s (shard 5) | D11 ratio 1.327; import residual |
| Lint checkout Phase 1 | 22 to 25s | runs 30707112749, 30707206995, 30707453993 |
| Lint job Phase 1 | 59 to 68s | same three runs |
| pr-checks | ~110s | not critical path |
| browser-gate | ~95s | Chromium install ~23s on cold; cache HIT skips browser download |

## Pinned surfaces

- `.github/workflows/ci.yml` (all jobs, if-conditions, matrix, concurrency, path filter)
- `scripts/gate.mjs` (step list comments; no --shard)
- `scripts/ci_shard_partition.mjs` + `scripts/ci_balanced_sequencer.mjs` (D11 LPT packs)
- `vite.config.ts` `sequence.sequencer` wire
- `tests/ci_workflow.test.ts` (structural pins; `SHARD_N = 8`; path-filter + sequencer pins)
- `tests/ci_shard_partition.test.ts` (completeness + balance)

## OPEN items

1. **Exact N (6 vs 8):** CLOSED. Locked N=8. Wall sample UNDER 8 min after
   Phase 3 batch 2; three consecutive not re-babysat.
2. **Heavy-file split list / D11:** CLOSED as residual. Pure renames exhausted;
   path-matrix A1/A2 both MISS; default packs restored. Future work needs
   measured per-file import costs (out of packet unless re-opened).
3. **Branch protection check names:** owner action after Phase 2; track in
   progress.md. New names are `PR gate (English-only legal) (1)` through `(8)`.
   Docs-only PRs additionally skip PR gate / PR checks / browser when the
   path filter fires; confirm skipped required checks stay merge-OK.
4. **Larger runners:** locked off (D1). Flip only with owner + cost note.
5. **Aggregator job for path filters:** CLOSED for this packet. Evidence on
   #2737: release jobs already skip without blocking merge. No `ci-result`
   invented. Reopen only if branch protection starts treating skipped PR
   matrix checks as blocking.
6. **release-version-gate red on v0.34.0:** observed 2026-08-01; not this
   packet's bug. Do not block speed work on it; use a scratch release branch
   with correct version surfaces for release probes, or defer release-arm
   verification.
7. **Phase 1 pin harden followups:** cache key consumption, PR base-arm
   adjacency, cache-order match index (see progress.md). Not BLOCKING.

## Resume point

- Phase 1 code: shallow lint checkout, concurrency cancel, Playwright cache.
- Phase 2 code: N=8 matrices on pr-gate + release-gate; `SHARD_N` pins;
  comments no longer say 4-shard; gate.mjs unsharded.
- Phase 3 code: tank/trend splits; s5 runtime renames; s5 import-heavy renames.
  D11 residual accepted for packet; path-matrix note only.
- Phase 4 code: `release-checks` parallel to tests-only `release-gate`; pins
  re-derived (check:types x2, no matrix.shard == 1); gate.mjs header notes both
  parallel pairs; release probe DEFERRED (OPEN item 6).
- Phase 5 code: native `changes` job; pr-gate/pr-checks/browser-gate compose
  with `needs.changes.outputs.code`; release jobs unfiltered; no aggregator;
  whole-packet QA filled; teardown of `docs/ci-speed/` offered only.
- PR: https://github.com/levy-street/world-of-claudecraft/pull/2737
- Packet close: pending owner merge + optional docs/ci-speed/ teardown confirm.
