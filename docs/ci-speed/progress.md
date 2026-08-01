# Progress: CI Speed

## Status board

| Phase | Status | PR | Notes |
|---|---|---|---|
| 1 Fixed-cost waste | DONE | #2737 | Lint checkout 22 to 25s; job 59 to 68s |
| 1 QA | PASS-WITH-FOLLOWUPS | #2737 ready | Docs + pin harden followups only; no BLOCKING |
| 2 Shard count | DONE (wall DEFER) | #2737 | Locked N=8; DEFER ≤8 min; wall babysitting stopped |
| 2 QA | NOT STARTED | | Ready for phase-02-qa.md; no more wall re-runs |
| 3 Shard rebalance | STOPPED (D11 MISS) | #2737 | Three rounds; wall UNDER; D11 ~1.32; accept miss or path-matrix |
| 3 QA | NOT STARTED | | Wall win banked; D11 residual accepted unless path-matrix |
| 4 Release-checks split | DONE (probe DEFER) | #2737 | release-checks parallel; release-gate tests-only; OPEN item 6 probe DEFER |
| 4 QA | PASS | #2737 | privacy-security PASS; test-coverage PASS after pin harden; scoped checklist green; probe DEFER |
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
| 2026-08-01 | p3-b1 | 30710303793 | ~493 (att1) | 420 | 8 | after tank+trend splits; s4 teardown flake then re-run green; files 1939; D11 FAIL 1.60; wall OVER |
| 2026-08-01 | p3-b2 | 30710958267 | 424 | 351 | 8 | after s5 heavy renames; green; files 1939; D11 FAIL 1.315 (need 1.20); wall UNDER 8 min (7.07); stretch MISS |
| 2026-08-01 | p3-b3 | 30712431702 | 442 | 359 | 8 | s5 import-heavies renamed off; green; files 1939; D11 FAIL 1.327; wall UNDER (7.37); s5 still import-bound |

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

- [x] Live top-cost files under locked N=8 (run 30709155848 ranking)
- [x] Pure splits (vale_cup pattern) with shard simulation (two rounds)
- [ ] Worst Duration within 20% of median (**MISS** after two rounds: 1.315)
- [x] Completeness holds (1939 files post-split; was 1926)
- [x] Wall ≤ 8 min on solid sample (424s on 30710958267); stretch ≤ 6 MISS
- [ ] Draft PR + Phase 3 QA PASS (still open on #2737; D11 not met)

### Phase 3 ranking (run 30709155848, N=8 pre-split)

Global top Duration files (CI wall ms):

| File | Shard | Duration s |
|---|---|---|
| tests/tank_crit_immunity.test.ts | 4 | 174.4 |
| tests/professions_trend.test.ts | 5 | 104.8 |
| tests/eastbrook_gameplay_integration.test.ts | 4 | 73.0 |
| tests/mail_expiry.test.ts | 3 | 72.8 |
| tests/corpse_harvest_sim.test.ts | 2 | 42.8 |

Pre-split balance (same run): median 254.88s, worst 375.7s (s4), ratio 1.47.

Vitest 4.1.10 shards by sha1 of path after `root` slice (leading `/tests/...`),
sorted, then equal-size slices (see `node_modules/vitest/dist/chunks/coverage.DM_a_rWm.js`).

### Phase 3 batch 1 (splits)

- `tank_crit_immunity` -> util + warrior/paladin/druid pair files (6 tests preserved)
- `professions_trend` -> util + classify / guild_letter / delivery / eligibility / content
  (26 tests preserved)
- Simulated destinations avoided stacking both monsters back on s4/s5
- Local: 32/32 green on split files

### Phase 3 batch 1 measure (run 30710303793)

| Shard | Vitest Duration s | Test Files |
|---|---|---|
| 1 | 263.09 | 243 |
| 2 | 272.10 | 243 |
| 3 | 262.18 | 243 |
| 4 | 274.34 (re) | 242 |
| 5 | **420.50** | 242 |
| 6 | 316.15 | 242 |
| 7 | 261.60 | 242 |
| 8 | 252.84 | 242 |
| **sum** | | **1939** |

Worst/median = 420.50 / 262.63 = **1.60**. s4 att1 EnvironmentTeardownError flake
(all files passed); re-run green. s5 remained critical path: remaining cluster was
escort + ambush + delivery + sfx_export + terrain_escape (not just file size).

### Phase 3 batch 2 (pure renames off s5)

Simulated sha1 moves (identical bodies):

| From | To | Dest shard |
|---|---|---|
| escort.test.ts | escort_quest.test.ts | 2 |
| escort_ambush_leak.test.ts | escort_ambush_convoy.test.ts | 8 |
| professions_trend_delivery.test.ts | professions_trend_delivery_kind.test.ts | 8 |
| sfx_export_bundle.test.ts | sfx_export_core.test.ts | 7 |
| terrain_escape.test.ts | terrain_escape_walkout.test.ts | 4 |

### Phase 3 batch 2 measure (run 30710958267, green)

Wall createdAt 17:43:48Z to last job 17:50:52Z = **424s (7.07 min) UNDER 8 min**.

| Shard | Vitest Duration s | Test Files | Notes |
|---|---|---|---|
| 1 | 244.29 | 243 | paladin pair ~47s |
| 2 | 268.86 | 243 | warrior pair + escort_quest |
| 3 | 283.16 | 243 | mail_expiry ~82s |
| 4 | 265.55 | 242 | eastbrook_gameplay ~68s |
| 5 | **351.26** | 242 | import-bound; max file ~13s |
| 6 | 197.45 | 242 | druid pair ~35s |
| 7 | 269.03 | 242 | guild_letter ~108s |
| 8 | 187.67 | 242 | delivery_kind + ambush_convoy |
| **sum** | | **1939** | completeness OK |

Worst/median = 351.26 / 267.21 = **1.315** (need ≤ 1.20; target worst ≤ 320.65).
D11 **FAIL** after two rounds. Wall clears Phase 2 DEFER sample (≤ 8 min) but
stretch ≤ 6 min MISS. s5 is no longer test-time dominated: import cumulative ~407s
vs ~100s on peer shards while tests sum only ~157s (many large-line low-ms files).

### Phase 3 batch 3 (s5 import-heavy renames)

Simulated destinations (all distinct; none on s5):

| From | To | Dest |
|---|---|---|
| nythraxis_raid.test.ts | nythraxis_raid_unit.test.ts | 4 |
| daily_rewards.test.ts | daily_rewards_table.test.ts | 3 |
| deeds_sites.test.ts | deeds_sites_pin.test.ts | 7 |
| eastbrook_layout.test.ts | eastbrook_layout_suite.test.ts | 1 |
| deed_records.test.ts | deed_records_table.test.ts | 8 |

### Phase 3 batch 3 measure (run 30712431702, green)

Wall **442s (7.37 min) UNDER 8 min**. Files 1939.

| Shard | Duration s | Import s | Tests s |
|---|---|---|---|
| 1 | 260.83 | 108 | 266 |
| 2 | 291.05 | 106 | 331 |
| 3 | 277.99 | 115 | 346 |
| 4 | 263.66 | 94 | 313 |
| **5** | **359.31** | **420** | **149** |
| 6 | 204.68 | 85 | 229 |
| 7 | 206.63 | 81 | 257 |
| 8 | 292.25 | 159 | 323 |

Worst/median = 359.31 / 270.83 = **1.327** (still FAIL D11). The five large-line
files are confirmed **absent** from s5; top s5 test times are only ~13s. s5 remains
**import-bound residual of the sha1 partition** (many medium files, high cumulative
import), not a single monster left to rename. Pure renames cannot close D11.

### Phase 3 stop: accept D11 residual + path-matrix note

**Recommendation locked for this packet:** bank the wall win (UNDER 8 min on
solid green PR runs), accept D11 MISS (~1.32), do not keep renaming. Proceed to
Phase 4 when ready. Path matrix only with owner OK if D11 must be hard-met.

**Path-matrix alternative (owner OK required; do not implement without it):**

1. Replace vitest `--shard=i/N` with an explicit path matrix in `ci.yml`, e.g.
   eight fixed globs or enumerated packs balanced by measured Duration (or a
   generated file list with a completeness pin). Keep `npm test -- <paths>`;
   never bare `npx vitest`.
2. Pros: stable balance independent of sha1; can rebalance import-heavy packs.
3. Cons: matrix maintenance; dropped/double-run risk without a full-suite
   completeness pin (manifest or set-equality test).
4. Default remains `--shard`.
5. Completeness: union of matrix path sets == full suite file set.

Owner path: (a) path-matrix with OK, (b) accept D11 MISS and Phase 4, (c) out-of-
packet import hygiene later (D15).

## Phase 4 checklist

- [x] `release-checks` job parallel to release-gate (same if-fragment; no needs)
- [x] release-gate tests-only (no matrix.shard == 1 steps; job-level I18N_RELEASE_TIER kept)
- [x] Pins re-derived from YAML (check:types = 2 in check jobs; matrix.shard == 1 absent; both test jobs 4 steps)
- [x] Scratch release probe **DEFERRED** (OPEN item 6: release-version-gate may be red on v0.34.0; do not block the packet). Ordinary PR path: both release jobs skip together via shared if. Live release-arm verification waits for a real release/** push with valid version surfaces, or a maintainer-owned probe.
- [x] Stacked on PR #2737 (feature/ci-speed; Phases 1 to 4). Phase 4 QA PASS.
- [x] Base sync: merged origin/release/v0.34.0 (was 7 behind); re-count 0 behind.

### Phase 4 measurement notes

- This phase does **not** claim a PR wall change: PR path already had pr-checks parallel.
- Expected release wall shape after this phase: max(release-gate slowest shard, release-checks), not release-gate shard-1 (tests then builds).
- Red-path: temporary `if: matrix.shard == 1` inject on release-gate failed `splits the release tier...` and the shard pin; YAML restored; pins green again.
- N stays 8; fail-fast false; gate.mjs unsharded; I18N_RELEASE_TIER only on release-gate job env (not on release-checks or pr-*).
- Completeness baseline still 1939 Test Files (post Phase 3); no suite changes in this phase.
- Pin harden (test-coverage-auditor SHOULD-FIX): exact job-level `if:` line match for both release jobs; shared `CHECK_RUN_STEPS` for PR/release parity; named-step count 11 on both check jobs.
- Reviewers: privacy-security PASS (0 BLOCKING/SHOULD-FIX; NIT on workflow_dispatch staying PR-tier only, pre-existing). test-coverage PASS after pin harden.

## Phase 5 checklist

- [ ] Path filter / changes detection
- [ ] Docs-only probe skips test matrix, keeps lint
- [ ] Code PR still full matrix
- [ ] Aggregator only if required (OPEN item 5)
- [ ] Whole-packet QA PASS
- [ ] Teardown offer recorded (delete only on owner confirm)
