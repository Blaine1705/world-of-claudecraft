# Phase 07 QA: baselines + packet close-out (packet-level)

Phase spec: packet-0-instruments.md, "Phase 07" (rulings R12 and R13 binding). Status:
COMPLETE. This is the packet-level QA file: it records the baseline captures, the R13
refresh decision with its numbers, the full-packet reviewer fan-out and dispositions, and
the packet-wide adversarial pass. All acceptance checks below passed on 2026-07-24.

## What changed (the close-out diff)

- NEW `docs/design/player-performance/baselines.md`: the committed baseline record
  (machine table, exact commands, captured values, PENDING maintainer rows).
- NEW `docs/design/player-performance/jitter-soak-baseline.json`: the committed 80-bot
  IDLE soak artifact, the Packet 6 gap-p99 comparison base.
- `tests/hud_perf_budget.baseline.md` + `tests/hud_perf_budget.test.ts`: the R13 refresh
  (numbers below): the stale `hudHotDomWrites` anchor 153 replaced by a single canonical
  row 640 in the real-GPU section, the frame-gate rows kept, and every
  byte-identical-across-viewports comment re-derived. Baseline and test land in the same
  commit.
- `scripts/crowd_fps_bench.mjs`: the per-bot X-Forwarded-For now also rides the WS
  upgrade (the REST half already did). Without it the per-IP hard WS cap
  (`MAX_WS_PER_IP_HARD`, default 20) refuses every socket past 20, surfacing as join
  timeouts, and the phase 04 exact-join gate correctly fails the run: the fix is what let
  the 80-bot curve stage at all. Mirrors the sibling `server_load_jitter.mjs` pattern;
  loopback-trusted only (the privacy reviewer confirmed the production path discards
  XFF from untrusted sockets).
- `scripts/pr_shot_targets.mjs`: a `perf-nudge` change-aware screenshot target (modeled
  on the `gpu-notice` target: import the module via Vite's /src serving, force the id
  set), four variants covering both copy arms, the desktop-shell split, and mobile
  landscape.
- NEW `docs/screenshots/perf-nudge-toast/` (four `after-*.png`): the packet's one visual
  change, captured through the target above. `docs/screenshots/` is gitignored
  (`screenshots/`), so the PNGs are force-added, the same way the existing tracked
  screenshots landed (qa-checklist should-fix, applied at the commit step).
- `src/styles/shell.css` + `tests/perf_nudge_css.test.ts`: `env(safe-area-inset-right)`
  added to the nudge toast's right offset with the pin updated in the same change (the
  frontend reviewer's one note, applied: unlike its pre-game portrait sibling, the nudge
  surfaces IN-GAME where web mobile is landscape-only, so a rotated notch can sit on the
  right edge).
- `tests/bench_gate.test.ts`: format-only wrap of one over-100-column line (a phase 04
  review-nit test committed with a format drift; caught by the gate's changed-files
  biome step, 36/36 still green).
- `tests/net_pipeline_stats.test.ts`: the stall-gap test's 900 ms rewind
  (`lastSnapAt = performance.now() - 900`) goes NEGATIVE in a vitest worker younger
  than 900 ms (performance.now() starts near zero per process), and the recorder in
  online.ts reads `lastSnapAt <= 0` as the no-prior-snapshot sentinel, so the gap
  silently never records (count 0 vs expected 1). Solo runs always pass (startup costs
  push past 900 ms); a warm-cache full-suite worker reaches the file faster and fails
  deterministically, which is exactly how the close-out gate caught it twice. Fixed by
  waiting out the process's first 901 ms before the rewind (usually a no-op), with the
  failure mode documented in the test. The sibling rewinds in net_interp.test.ts were
  swept and are safe: netUpdatedAt's sentinel is `undefined`, not `> 0`, and its
  consumers use time differences, so a negative value only reads as older.
- `progress.md`: packet 0 marked complete pending the maintainer track.

## Acceptance evidence per runbook step

Stack: `docker start eastbrook-db` (healthy), `ALLOW_DEV_COMMANDS=1 npm run server`,
`npm run dev` (this worktree held :5173; every browser run passed
`GAME_URL=http://localhost:5173` explicitly). All probe scripts, doctored artifacts, and
capture JSONs stayed in the session scratchpad; the committed artifacts are exactly
baselines.md, jitter-soak-baseline.json, and the four PNGs.

1. **Local crowd curve** (runbook step 2): perf:crowd at CROWD_BATCHES=20,40,60,80 for
   all four CROWD_GFX tiers, every run verdict PASS with exact joins (80/80). Full
   tables in baselines.md. Three protocol facts were discovered and are recorded there
   as binding for re-runs: (a) the WS-upgrade XFF fix above; (b) **fresh server per
   tier**: `LINKDEAD_GRACE_MS` (5 min) holds dropped bots in-world, so back-to-back
   tier runs sampled the previous tier's 80 linkdead bots (solo entity count ~137 vs 60
   on a fresh world, expiring mid-run); the committed curves are all fresh-world runs
   with consistent per-label entity counts; (c) **ultra at 1600x900**: at 1920x1080 the
   ultra render tab crashed reproducibly (three attempts, detached frame progressively
   deeper into the run) under vsync-off peak load; the reduced window is recorded as a
   deviation in baselines.md. The composer-tier draw counts are real live data (solo
   727 calls to 1,476 at crowd-80), the phase 01 instrument confirmed against the
   phase 04 bench-gate sanity arm in a full 80-bot run.
2. **Jitter soak** (runbook step 3): BOTS=80 IDLE=1 DURATION_MS=60000 on a fresh server
   with JITTER_MAX_P95=250 SET, per the phase 04 adversarial note (a ceiling forces
   observer evidence, so the committed baseline cannot be hollow). Verdict PASS, 80/80
   plus observer, 1,173 observer gaps (minGaps floor 600): p50/p95/p99/max =
   51.3/56.9/61.2/65.8 ms, zero gaps over 100 ms, server loop p95 16.4 ms at 504
   entities. Artifact committed beside baselines.md.
3. **PERF_GPU=1 tour + R13** (runbook step 5's refresh clause): two back-to-back
   both-viewport headed captures on a settled machine (load1 3.87 at start). Numbers
   and the decision in the R13 section below. The refreshed gate was verified in both
   directions: ARM 3 green against both real artifacts on both viewports (38/38), and
   red against a doctored artifact at 641 bypass writes (fails naming 641 vs 640).
4. **baselines.md** (runbook step 5): authored with the machine table, exact commands,
   captured values, and four clearly marked PENDING maintainer rows.
5. **Maintainer track documented, not attempted** (runbook steps 1 and 4): the live-site
   owner session (?perf overlay JSON plus the Chrome Performance trace during an
   arrow-key plaza turn) and the production peak captures (POST
   /admin/api/perf/tick/capture on a busy evening; GET /admin/api/perf/summary after
   48 h of schema version 2 dimensions) exist only on the live site or post-deploy;
   baselines.md section 4 carries their exact commands.

## The R13 refresh decision, with numbers

Committed rows going in: frameLong50 12, tourMinFrames 500 (phase 04 healthy captures:
desktop 876/873 frames with 3/7 long, mobile 1279/1245 with 2/2), hudHotDomWrites 153
(June, pre-v0.30-HUD-growth, flagged stale by phase 04).

Packet-close captures (two runs, both viewports, ~119.5 fps vsync-paced at 120 Hz, tier
ultra): desktop 1586/1589 frames, mobile 1531/1530, frameLong50 0 on all four legs;
hudHotDomWrites desktop 538/539, mobile 632/632; fct burst 64/64/64 on both viewports.

Decision: **frameLong50 12 KEPT** (captures sit at 0, comfortably inside; a hitch storm
measures in the hundreds, so the anchor keeps real failing room, and tightening toward 0
only buys flake risk). **tourMinFrames 500 KEPT** (captures nearly double the phase 04
healthy values; a 60 Hz display halves a 120 Hz frame count to ~790, still clearing 500,
while the saturation signature stays 60 to 220). **hudHotDomWrites REFRESHED 153 to 640**:
the old anchor was materially wrong (the v0.30 HUD growth: deed tracker, yumi strip,
party-below-target, tab strip, mobile action ring all establish writes at boot), the
count is no longer viewport-identical (the touch HUD explains mobile 632 vs desktop
538), and it jitters by a write run to run (538 vs 539). The new anchor covers the worst
viewport plus that jitter; a write-elision collapse balloons toward the frame count
(thousands), so the headroom costs no detection. Every byte-identical claim in the
baseline prose and the test comments was re-derived to match.

## Close-out gate and test evidence

1. Full `npm run gate` (standard tier on this feature branch), four runs to green:
   - Run 1 FAILED at "biome (changed files)": one format-diff error in
     `tests/bench_gate.test.ts` (the phase 04 drift above). Fixed with a targeted
     `biome check --write` on that file; 36/36 tests unchanged.
   - Runs 2 and 3 FAILED at the full vitest suite on the SAME single failure,
     `net_pipeline_stats.test.ts` "reads the raw gap BEFORE applySnapshot" (count 0 vs
     expected 1), while the suite was otherwise 1512 files / 18775 tests passed. The
     first failure was initially misread as a load-contention flake (it passes 3/3
     solo); the second, on a quiet machine, forced the real diagnosis: the young-worker
     negative-rewind bug above, deterministic whenever a warm-cache worker reaches the
     file inside its first 900 ms. The test was hardened (never the production code:
     the `lastSnapAt > 0` sentinel is correct).
   - Run 4, on the finished tree: GREEN (exit 0), all steps (i18n gen + freshness,
     malware scan, changed-files biome, full tests, tsc, all builds).
2. The opt-in PG roundtrip (`tests/client_perf_reports_db_integration.test.ts`,
   TEST_DATABASE_URL at the dev DB) ran GREEN (5/5) on the final tree: the ONLY decisive
   guard for the 44-param positional renumbering, per both DB reviewers.
3. The pg-gated summary differential (`WOCC_PG_DIFFERENTIAL=1`, DATABASE_URL at the dev
   DB) ran GREEN (5/5) on the final tree.
4. Targeted reruns on the close-out edits: hud_perf_budget bare + both ARM 3 viewports
   (38/38 each), perf_nudge_css + css_corpus + css_value_validity (23/23),
   bench_gate (36/36). `npx tsc --noEmit` clean. `npx @biomejs/biome ci` over the
   changed files: warnings only (the pre-existing set), zero errors, zero format diffs.
5. Diff scanned: no em or en dashes, no emojis, no `.only(`, no `debugger`.

## Reviewer fan-out and dispositions

Six fresh read-only reviewers over the WHOLE packet diff vs release/v0.30.0 (committed
phases 01-06 plus the uncommitted close-out), instructed not to re-raise per-phase
dispositions and not to run tests (the gate was executing concurrently; every VERIFY
they named is closed by the gate/PG evidence above).

- **qa-checklist: READY.** One should-fix, APPLIED: the four nudge PNGs sit under the
  gitignored `docs/screenshots/` and must be force-added in the close-out commit (done;
  same force-add the existing tracked screenshots used). One nit, addressed in the PR
  body: only `after-*` variants exist because the toast is a net-new element (before =
  no toast). It confirmed no additional domain reviewer applies (no facet change, no
  src/sim change).
- **frontend-seam-reviewer: PASS, 0 blocking, 0 should-fix, 1 note, APPLIED:**
  `env(safe-area-inset-right)` on the nudge toast (the in-game landscape case its
  pre-game portrait sibling never faces), with the CSS pin updated in the same change.
  All eight of its checks clean, including the R1 fairness argument: the composer path
  is always high/ultra, so the governor always receives the frozen legacy constant
  there and the low/medium passthrough arm never sees a live accumulator.
- **migration-safety: clean, no findings.** Cleared explicitly: additive/idempotent
  boot DDL, metadata-only ALTERs on the populated table, the 44-param 1:1 map verified
  by line read, the concurrent-index post-commit arm with carcass drop, rollback safety
  by construction, legacy-row folds. Its one VERIFY (the PG roundtrip) ran green above.
- **database-performance-reviewer: PASS, two P2 nits, both dispositioned:** (1) the
  worst-10s index has no consuming reader at packet close: the R7-accepted close-out
  condition (prod accrues indexed history before the fleet-view reader lands);
  CARRY-FORWARD for the reader's packet: re-EXPLAIN the real "worst sessions, last N
  hours" query before relying on the (worst_10s DESC, created_at DESC) column order, a
  created_at-leading or partial index may win. (2) a pre-existing worst_rank tie-break
  (no final ORDER BY key) that predates this packet (the diff only added a partition
  key): outside the packet's scope per the no-unrelated-refactors rule, recorded here
  as follow-up material (append gl_renderer_bucket ASC, mirroring vol_rank).
- **privacy-security-review: clean, no findings.** Notables: every beacon field is
  server-clamped before storage; admin surfaces stay behind requireAdmin; the XFF trick
  is loopback-only in production (untrusted sockets' XFF is discarded), so the
  close-out WS-upgrade header adds no production spoofing vector; the committed
  artifacts and PNGs carry no secrets or player data.
- **test-coverage-auditor: clean, no blocking, no should-fix.** Confirmed the three
  cross-phase seams are covered (draw sanity, payload field independence, rawSummary
  allowlist round-trip with a non-vacuous oversized-filler pin), each canonical
  baseline reader matches exactly one row, the new real-GPU section cannot raise the
  ARM 2 skip-rate floor (integers only on its lines), and the constant-self-comparison
  sweep across every new test file is clean (literal anchors present everywhere it
  matters). Its two low nits are self-dispositioned in its report (anchor headroom is
  the R13 decision; the approxBytes sum has an independent literal pin).

## Adversarial pass: what is missing or deliberately left

- The two maintainer capture tracks (live-site trace, production peak + 48 h summary)
  are PENDING by nature; baselines.md carries their commands, and the packet's fleet
  dimensions only start accruing on deploy. The CPU-bound presumption therefore remains
  formally unsettled until the owner trace lands (LOW-parity evidence stands).
- The worst-10s index ships reader-less by R7; the carry-forward caveat above binds the
  packet that lands the fleet view.
- The 44-param positional renumbering has NO in-CI guard: the opt-in PG roundtrip is
  the only decisive test, run green here twice (phase 05 and this close-out). A future
  column addition that skips that run is unprotected; the risk is recorded in both DB
  reviews.
- The crowd curve's ultra tier ran at 1600x900 (documented deviation): cross-tier
  pixel-load comparability at ultra is limited; treat high as the composer-tier draw
  baseline. The tab-crash cause (GPU load under vsync-off) was not root-caused further;
  an operator re-run that survives 1920x1080 may replace the table.
- The crowd-80 fps upticks on medium/high sit inside sample noise; the curve's teeth
  are the exact-join gate and the per-label entity consistency, not any single fps cell.
- The screenshots are after-only (net-new element) and live under a gitignored path via
  force-add; a future screenshot pass that forgets `-f` silently drops additions there.
- The hudHotDomWrites anchor is no longer a byte-identical invariant: it is a
  worst-viewport ceiling. A deliberate new per-frame element updates the row (the test
  message says so); an accidental one now has 640-632 = 8 counts of slack on mobile
  before the gate trips, the price of the run-jitter headroom.
- perf_tour's desktop leg still exits nonzero on the pre-existing
  `training_dummy.glb` console error (errors channel, unrelated to budgets, artifact
  fully written); inherited from phase 04's disposition, untouched by contract.
- The jitter soak is a 60 s IDLE capture on loopback: it baselines broadcast-cadence
  jitter, not combat load (the default combat mode) or WAN jitter; Packet 6 owns the
  richer regimes.
- Phases 01-06 arrived at this close with their own QA files and mutation ledgers; this
  file deliberately does not restate them.
