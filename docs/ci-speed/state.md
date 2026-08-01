# State: CI Speed (cross-phase cheat sheet)

**Current phase:** Phase 1 NOT STARTED. Packet authored 2026-08-01 on
`feature/ci-speed` / worktree
`/home/fernandoramirez/Documents/world-of-claudecraft-ci-speed` from
`origin/release/v0.34.0` at `94f5ac63d`.

**Next action:** start Phase 1 (`phase-01-fixed-cost-waste.md`) on a fresh
worktree off the **latest** `release/**` tip (re-fetch; do not trust this
header's tip).

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
- **D6 Shard N:** choose from {6, 8} by Phase 2 measurement. Supersedes the
  prior toolchain packet's locked N=4 for this surface only. `fail-fast:
  false` always. Half-core `maxWorkers` cap retained.
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
- **D11 Balance metric:** after Phase 3, worst shard vitest **Duration**
  within **20%** of the median shard Duration on the same run.
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
| Suite files | ~1,926 | worktree count + live sum |
| Suite tests | ~24.4k | live shard sum |
| Prior N=4 ship wall | 184 / 194 / 188s | toolchain Phase 4, ~1,129 files |
| Lint checkout typical | 96 to 195s | sample of 16 runs |
| pr-checks | ~110s | not critical path |
| browser-gate | ~95s | Chromium install ~23s |

## Pinned surfaces

- `.github/workflows/ci.yml` (all jobs, if-conditions, matrix, concurrency)
- `scripts/gate.mjs` (step list comments; no --shard)
- `tests/ci_workflow.test.ts` (structural pins)
- Optional new: small pure helper for shard-simulation in tests if Phase 3
  needs a durable pin (prefer inline in the test file unless reused)

## OPEN items

1. **Exact N (6 vs 8):** Phase 2 measurement. Until then treat N as unset in
   pins beyond "greater than 4".
2. **Heavy-file split list:** Phase 3 live ranking under locked N. Brainstorm
   candidates are proxies only.
3. **Branch protection check names:** owner action after Phase 2; track in
   progress.md.
4. **Larger runners:** locked off (D1). Flip only with owner + cost note.
5. **Aggregator job for path filters:** only if branch protection cannot
   accept skipped required checks; Phase 5 decides with evidence.
6. **release-version-gate red on v0.34.0:** observed 2026-08-01; not this
   packet's bug. Do not block speed work on it; use a scratch release branch
   with correct version surfaces for release probes, or defer release-arm
   verification.

## Resume point

- Packet docs exist only in the planning worktree until Phase 1 merges.
- No implementation commits yet.
- First executable step: Phase 1 starter prompt.
