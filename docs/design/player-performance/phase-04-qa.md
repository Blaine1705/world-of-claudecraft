# Phase 04 QA: honest gates (frame gate + bench scripts)

Phase spec: packet-0-instruments.md, "Phase 04" (rulings R12 and R13 binding;
brainstorm finding 21). Status: COMPLETE. All acceptance checks below passed on
2026-07-23.

## What changed

- NEW `scripts/lib/bench_gate.mjs` + `bench_gate.d.mts` (the mob_stall_parse
  lib-with-typing-sidecar pattern): the pure pass/fail logic both bench scripts
  route their verdicts through. `parseCeilingEnv` (trimmed input; a set-but-blank
  or whitespace-only value means unset, never `Number(' ') === 0`; a non-numeric
  value throws instead of silently running ungated), `evaluateCrowdRun`
  (unconditional exact-join enforcement per R12 with no escape-hatch env; a
  missing or non-finite fps is missing evidence and fails; the CROWD_MIN_FPS
  floor applies when set; composer-tier samples must report draw calls above the
  fullscreen floor, the dead-instrument signature phase 01 fixed), `minGapsFor`
  plus `evaluateJitterRun` (the JITTER_MAX_P95 ceiling gates the OBSERVER p95
  only, refusing to pass on a disabled observer or fewer than
  `floor(DURATION_MS / 50 * 0.5)` gaps; join enforcement unconditional), and
  `pct` + `gapStats` moved VERBATIM from server_load_jitter (the floor
  nearest-rank percentile convention now pinned by tests).
- `scripts/crowd_fps_bench.mjs`: thin orchestrator over the lib. Join accounting
  is ACTUAL sockets (`bots.length`, pushed only after the full
  register/create/auth handshake), never attempts; every staged sample carries
  `expectedJoined`/`actualJoined`; the verdict routes to the exit code and the
  evidence JSON (`CROWD_JSON_OUT`, default `tmp/crowd-fps-latest.json`) is
  written before the exit code is decided. New envs `CROWD_MIN_FPS` and
  `CROWD_JSON_OUT` documented in the header.
- `scripts/server_load_jitter.mjs`: imports `pct`/`gapStats`/`parseCeilingEnv`/
  `evaluateJitterRun` from the lib (local copies deleted); `JITTER_MAX_P95`
  ceiling; the verdict lands in the JSON_OUT report (`report.verdict`) and the
  script exits `verdict.ok ? 0 : 1`; partial joins now fail.
- `scripts/perf_tour.mjs`: `frames` (the PerfMonitor frame counter) added to
  `summarizeResult`; opt-in `PERF_GPU=1` headed real-GPU mode (the default stays
  headless swiftshader); the artifact records `gpuMode`.
- `tests/hud_perf_budget.test.ts` ARM 3: `readBaselineFrameP95`, its
  `HUD_PERF_BUDGET_TOUR_FRAME_BASELINE` override, and the frameP95 `it()` are
  deleted in this same commit; `readBaselineLongFrames` and
  `readBaselineTourMinFrames` added in the canonical-row regex style (they parse
  ONLY `| frameLong50 | <n> |` and `| tourMinFrames | <n> |` table rows, never a
  loose includes), read at module top level so a missing row fails bare
  `npm test` loudly at collection; new assertions `frames >= tourMinFrames` and
  `frameLong50 <= anchor` (override env
  `HUD_PERF_BUDGET_TOUR_LONG50_BASELINE` for other machines). The
  hudHotDomWrites and fctBurst arms and ARMs 1 and 2 are byte-identical (the
  diff hunks touch only the ARM 3 header comment, the readers, and the
  frameP95-to-new-gates region).
- `tests/hud_perf_budget.baseline.md`: both frameP95 table rows deleted plus
  every prose mention (zero lines remain that the old loose parser, `includes
  frameP95 plus digits-ms, could bind to; verified by scan); new
  "real-GPU tour gates" section with the canonical `frameLong50` (12) and
  `tourMinFrames` (500) rows from PERF_GPU=1 captures on the owner's Mac (R13);
  capture-machine table refreshed with the real-GPU browser/Node/date rows
  beside the original swiftshader rows.
- `package.json`: `perf:crowd` entry; `scripts/CLAUDE.md` perf row updated (the
  npm-wired-script convention).

Untouched by contract: the 250 ms PerfMonitor sample clamp and the 0.25 s
frameDt clamp (they protect dt across tab-hide; the gate METRIC changed, not the
clamps); every phase 01 to 03 instrument; ARMs 1 and 2, the hudHotDomWrites
anchor arm, and the fctBurst arm of hud_perf_budget; the scripts stay
operator-run (ALLOW_DEV_COMMANDS plus the loopback rate-limit trust make them
dev-only by construction) and are wired into no CI step.

## The R12 argument (restated)

Finding 21: the crowd regime had no failable gate. The real-browser frame
assertion was env-gated off with a threshold equal to the sample clamp
(mathematically unfailable), and both bench scripts tolerated partial joins,
null metrics, and too-few samples, with no pass/fail ceilings. R12 fixes the
class, not just the instances: join enforcement is UNCONDITIONAL with no
escape-hatch env, because every escape hatch becomes the default under deadline
pressure; an exploratory run lowers CROWD_BATCHES/BOTS instead, which keeps the
run honest at its actual size. A missing or non-finite metric FAILS as missing
evidence, because `NaN < ceiling` is false and a dead counter would otherwise
sail through the comparison, which is precisely the finding-21 hole. The jitter
ceiling gates the observer p95 only (bot self-gaps measure their own event
loops, the observer measures what a player feels), and refuses to gate without
observer evidence rather than passing vacuously. `gapStats` moved verbatim with
its floor nearest-rank convention pinned by fixtures where the floor and ceil
conventions disagree, so the percentile semantics of every committed and future
jitter baseline cannot drift silently.

## The R13 argument (restated)

The old frameP95 baseline was captured under headless swiftshader at 1 to 2 fps,
where the 250 ms sample clamp saturates and every number is rasterizer noise.
The replacement pair is captured under `PERF_GPU=1` (headed, real GPU) on the
owner's Mac, the machine the standing perf row actually runs on, and the test
plus its baseline rows land in ONE commit so there is no window where the gate
reads rows that do not exist. The committed values came from two back-to-back
both-viewport captures: healthy frames 876/873 (desktop) and 1279/1245 (mobile),
healthy long-frame counts 3/7 (desktop) and 2/2 (mobile). Committed anchor
frameLong50 = 12 (worst healthy 7 plus run-jitter headroom; a hitch-storm run
measures in the hundreds), committed floor tourMinFrames = 500 (worst healthy
873; a fully clamp-saturated run renders roughly 60 to 220 frames over this
tour, a half-speed catastrophe roughly 450). Both directions keep real failing
room, and the packet close (phase 07) refreshes the rows if its captures differ
materially, per R13.

## Acceptance evidence

Stack for the live checks: `docker start eastbrook-db` (container already
healthy), `ALLOW_DEV_COMMANDS=1 npm run server` (restarted after all edits; the
server bundles at start), `npm run dev`. NOTE: the worktree Vite landed on port
5174 because another process held 5173 at start; every browser run below passed
`GAME_URL=http://localhost:5174` explicitly. An earlier capture that hit the
default 5173 sampled a STALE app from the foreign server and was discarded; its
symptom (composer-tier draws stuck at 1, phase 01 apparently absent) is a useful
reminder that GAME_URL must point at the worktree's own dev server. All probe
scripts, doctored artifacts, and capture JSONs stayed in the session scratchpad,
outside the repo; the crowd screenshots land in the gitignored `tmp/`.

1. Partial-join crowd run exits nonzero NAMING the counts: server restarted with
   `MAX_PLAYERS_PER_REALM=4`, so the render client took one slot and only 3 of 5
   bots could join (`CROWD_BATCHES=5`). Exit code 1;
   `GATE FAIL: crowd-5: joined 3 of 5 bots; the crowd was not staged exactly
   (partial joins always fail; lower CROWD_BATCHES for exploratory runs)` (and
   the same for run-through); `verdict: FAIL`; the evidence JSON was written
   before exit. Deterministic and repo-clean: the cap is a server env, not a
   script hack.
2. Full-join control: uncapped server, `CROWD_BATCHES=3`, exit 0 with
   `verdict: PASS`, proving the gate does not false-positive. The ultra-tier
   samples carried real accumulated draw counts (calls 733 to 905, tris around
   3.5M), so the composer-tier sanity arm passed against live phase 01 data.
3. Jitter refusal arm: `OBSERVER=0 JITTER_MAX_P95=500` exits 1 with the refusal
   naming the ceiling. Jitter pass arm: `BOTS=3 IDLE=1 DURATION_MS=10000
   JITTER_MAX_P95=1000` exits 0; the JSON_OUT report carries
   `verdict: {ok: true, failures: [], minGaps: 100}` with observer gaps 181 and
   p95 71.3.
4. Tour arm vs doctored artifacts (kept in the session scratchpad): a copy of
   the real capture with `summary.desktop.frames` doctored to 61 fails the
   frames floor naming 61 vs 500; a copy with `frameLong50` doctored to 214
   fails the anchor naming 214 vs 12. The REAL artifact passes both new arms
   plus the fct arm.
5. PERF_GPU=1 baseline captures on this Mac (the owner's machine): two
   both-viewport runs against the worktree dev server produced the committed
   rows (values in the R13 section above); `gpuMode: real-gpu-headed` recorded
   in the artifacts.
6. One-time decisiveness check: with the `| frameLong50 | 12 |` row stripped
   from the baseline, a bare no-env `npx vitest run tests/hud_perf_budget.test.ts`
   (the same collection path bare `npm test` takes) fails LOUDLY at collection
   with the canonical-row error; row restored, file verified back to the
   committed content.
7. Mutation verification, one at a time with file-copy restore (never a
   checkout over uncommitted work), every one red: join enforcement flipped to
   tolerate any positive join (2 tests red); the crowd non-finite-fps refusal
   dropped (2 red); the jitter ceiling off by one, `> maxP95 + 1` (1 red: the
   exceeds-by-one fixture); `pct` nearest-rank flipped to ceil (2 red: the
   5-element p50 fixture and the end-to-end gapStats fixture); the minGaps
   refusal branch dropped (1 red); the ARM 3 frames comparison inverted to
   toBeLessThanOrEqual (red against the REAL artifact). All files restored
   byte-identical (cmp).
8. Regression net in one run: bench_gate (36 after the review-nit additions),
   hud_perf_budget (34 passed, 4 env-gated ARM 3 skips), perf_tour_entry,
   mob_stall_parse, architecture, all green. The hud_perf_budget ARMs 1 and 2
   hunks are byte-identical (diff inspected hunk by hunk).
9. `npx tsc --noEmit` clean. `npx @biomejs/biome ci` over the changed files:
   zero errors after the two auto-fixes (type-import order, one format wrap).
   Diff scanned: no em or en dashes, no emojis, no `.only(`, no `debugger`.
10. Bare `npm test` green (full suite, exit 0, run unpiped in the worktree
    after waiting out a machine-wide load spike, per the contention-flake
    rule). A follow-up full run that collected the three review-nit test
    additions ran while ANOTHER session's full suite (a different worktree,
    maxWorkers=8) hammered the machine and flaked 22 pure timeouts in
    unrelated sim suites, every one green in the exit-0 run and untouched by
    this diff; bench_gate (36) and hud_perf_budget passed even in that starved
    run, so every file of the committed tree has a green full-suite result
    across the two runs.

## Reviewer fan-out and dispositions

Fresh read-only reviewers on the final diff: qa-checklist (verdict READY, zero
blocking, zero should-fix; its one VERIFY item, the operator-run live captures,
is the acceptance evidence above) and test-coverage-auditor (the one domain
reviewer qa-checklist named; no DDL, beacon, sim, or presentation change this
phase, so the DB, privacy, architecture, and frontend reviewers do not apply).
The coverage auditor confirmed all eight decisive cases, the floor-vs-ceil
fixtures killing both textbook conventions, no constant-self-comparison, and
the loud collection-time readers, and raised five low-severity nits. Four were
APPLIED as new tests (gapStats driven end to end with empty and single-snapshot
series; a direct p99 pin on a rank distinct from p95, killing a label-swap
mutation; the first passing draw count above the fullscreen floor, killing a
floor-plus-one drift; multi-sample failure accumulation with per-sample
attribution). The fifth is dispositioned: the script-glue wiring
(actualJoined = bots.length, the exit-code routing) has no unit pin BY DESIGN,
since the scripts are operator-run against a live server and never in CI (R12);
the wiring is proven by acceptance checks 1 to 3, which drove the real stack
through both the failing and passing paths.

## ARM 3 against the current real capture (pre-existing finding, phase 07 work)

Running ARM 3 against the fresh real-GPU artifact passes the two new frame arms
and the fct arm, and fails ONLY the untouched hudHotDomWrites arm: the capture
measures 538 (desktop) and 631 (mobile) against the committed anchor 153. The
count is still run-length-independent (byte-identical across both capture runs,
and flat across the tour samples: 537 at the first sample, 538 at the last), so
write-elision is intact; the anchor itself is stale. The June baseline predates
the v0.30 HUD growth (deed tracker, yumi strip, party-below-target, tab strip,
mobile action ring all joined HOT_PAINTERS since), which adds establishing
writes at boot and breaks the desktop-equals-mobile coincidence. This phase's
contract keeps that arm and its baseline row byte-identical; the refresh belongs
to the phase 07 packet close under R13's "refreshed if the close-out captures
differ materially" clause, where the anchor row and its
byte-identical-across-viewports prose should be re-derived from fresh captures.

## Adversarial pass: what is missing or deliberately left

- The tourMinFrames floor has NO override env (the spec grants one only to the
  frameLong50 anchor). Another machine running PERF_GPU=1 at vsync pace should
  land in the same frame band, but a 30 Hz display would halve the frame count
  and still clear 500; a machine that cannot clear it has no escape other than
  editing the baseline, which is the honest path anyway.
- ARM 3 artifacts must now be PERF_GPU=1 captures; a swiftshader artifact fails
  the frames floor BY DESIGN (documented in the baseline). Anyone keeping an old
  perf-row recipe that feeds ARM 3 a headless artifact will see that failure and
  must switch modes.
- The jitter refusals are scoped to a SET ceiling per R12's wording: an
  exploratory run with no JITTER_MAX_P95 and a dead observer still exits 0 (only
  join enforcement applies). The phase 07 jitter soak baseline run should
  therefore SET a generous ceiling so a dead observer cannot produce a hollow
  committed baseline.
- evaluateCrowdRun gates fps per sample (solo included) when CROWD_MIN_FPS is
  set; a floor chosen for crowd-50 also applies to the healthier solo sample.
  That is strictly tighter, never looser, so it cannot hide a regression.
- The composer-tier draw sanity keys on the sampled `tier` string; a run whose
  perf report omits the renderer block entirely fails the non-finite fps
  refusal first, so there is no path where a missing renderer silently skips
  the draw check with a passing verdict.
- The crowd bench still spends up to the 12 s join timeout per refused bot
  (refused sockets surface as join timeouts because the Bot message handler
  does not parse the server error frame); acceptable for an operator tool, and
  the gate outcome is identical.
- perf_tour's desktop runs currently log one pre-existing console error
  (`character visual unavailable ... training_dummy.glb`), which already made
  the tour exit nonzero before this phase (the errors channel, unrelated to the
  budget failures this phase touches). Not fixed here: measurement-only packet,
  and the artifact is still written and fully consumable by ARM 3.
- The stale hudHotDomWrites anchor (section above) stays red against current
  captures until the phase 07 refresh; ARM 3 is env-gated, so bare `npm test`
  is unaffected.
