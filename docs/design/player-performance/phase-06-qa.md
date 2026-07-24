# Phase 06 QA: predictor stall-replay coverage

Phase spec: packet-0-instruments.md, "Phase 06" (ruling R11 binding; brainstorm
section 4.2 and the round-2 self-motion verification notes). Status: COMPLETE.
All acceptance checks below passed on 2026-07-23.

## What changed

Test-only, two files, ZERO production changes:

- `tests/self_motion.test.ts`: the Lab harness gains the scripted broadcast
  stall: a `skipDeliveries` counter under which tick boundaries still advance
  the server Sim (it never stops simulating) while the mirror and `lastSnapMs`
  are suppressed, so the predictor renders against a frozen snapshot exactly
  like a real broadcast gap (skipping n deliveries makes the wall-clock gap
  n plus 1 snapshot intervals). `FrameResult` gains `ac`, the leash's own
  anchor (alpha clamped at 1, mirroring the predictor's internal clamp so
  containment is measured against the same point the clamp enforces), and a
  `delivered` flag locating the resume frame. New `scripted broadcast stalls`
  describe block: `it.each` arms at 100/250/400/500 ms gaps asserting all six
  R11 properties per arm (leash containment on every stall frame; saturation
  so containment is a boundary claim; no backward step on resume plus a
  cumulative backslide bound; bounded forward step with per-arm measured
  ceilings; recovery to the steady lead band within about a second, matched
  against an unstalled control run over the same absolute frame window; zero
  lateral drift as the yaw-untouched proxy, with a server-lane assert making
  the proxy non-vacuous), plus one 2500 ms arm pinning the deliberate 6 yd
  snap-reset (exactly one frame stepping past the rule, landing ON the fresh
  anchor) with a `SELF_MOTION_SNAP_DIST_SQ` literal pin closing the
  detection-vs-decision drift hole.
- `tests/net_interp.test.ts`: the companion continuity pin. A remote entity
  with a learned ~100 ms cadence goes silent for 400 ms so the renderer's
  alpha provably rides `POS_EXTRAPOLATION_CAP`; the gap-ending record must
  re-anchor `prevPos` at that SAME capped pose (the LOCKSTEP contract in
  `net_interp_core.ts`), so the frame after resume draws where the frame
  before resume did. The equality is non-trivial by construction: the drawn
  pose sits past the last wire pose and off the incoming one.

The phase spec's optional single export (`LEASH_SLACK_YD`) was deliberately
DECLINED: `Lab.budget()` keeps its disagreeing 0.05 literal, so a production
widening of the slack flips containment red. Exporting and sharing the
constant would move both operands of the containment assert together and hide
exactly that mutation (the constant-self-comparison trap). The diff therefore
touches no production file at all.

Untouched by contract: every phase 01-05 instrument and gate (including the
stale hudHotDomWrites anchor, phase 07's recapture), `src/sim/` entirely,
`tests/parity/` byte-unmodified, the net-interp production seam
(`net_interp_core.ts`, `online.ts`), and the predictor itself. No fake
timers, no real-loop polling, no jsdom: pure Node on the Lab's synthetic
clock throughout.

## The R11 argument (restated)

R11 scopes stall-replay coverage to server-keeps-ticking stall arms at
100/250/400/500 ms, PLUS one greater-than-500 ms arm pinning the deliberate
6 yd snap-reset boundary, with the yaw-untouched claim pinned via the
zero-lateral-drift proxy on a straight run. The shape follows the round-2
verification findings: the leash freeze during snapshot stalls is INTENDED
anti-divergence behavior (latency-scaled budget, 0.47 yd at the 60 ms cap
floor to 2.5 yd at the 350 ms cap, exhausted within roughly 0.07 to 0.36 s of
held movement), and no test exercised the 100 to 500 ms broadcast-gap regime
at all. Yaw is never server-gated, so yaw stutter during lag is client jank
by construction; the predictor must never touch the display heading, and on a
straight run any yaw contamination materializes as lateral drift, which the
proxy pins at exactly zero. The greater-than-500 arm is the boundary pin, not
a bug repro: the reset is the same deliberate rule the teleport arm
exercises, so it must fire above the regime and never inside it.

Measured mechanics worth recording: on resume the anchor sweeps the whole gap
distance over one 50 ms snapshot interval (it does not jump), so at the
test's 150 ms echo (1.10 yd budget) the pre-clamp distance first exceeds the
6 yd rule near a 2.1 s gap; the snap arm sits at 2500 ms, and the 500 ms arm
proves the regime below never resets.

## Acceptance evidence

1. All new arms green: `self_motion` 21/21 and `net_interp` 6/6 on the final
   tree (re-run after the literal-pin edit), inside the full-suite run below.
2. The deliberate leash-budget mutation flips them red: widening the budget
   line by 0.75 yd turned all five new arms red (plus the two existing leash
   tests). Applied and restored by file copy; `git diff` on `src/` empty
   afterwards.
3. The snap fires there and ONLY there: rule widened (36 to 400) makes the
   snap arm red (the expected single reset never fires); rule tightened (36
   to 4) makes the 500 ms arm red (a reset fired inside the no-snap regime)
   and the snap arm red (multiple resets). The detection threshold sharing
   production's constant is closed by the applied literal pin
   (`expect(SELF_MOTION_SNAP_DIST_SQ).toBe(36)`).
4. Full mutation ledger (one at a time, file-copy restore, every one red):
   - leash budget widened +0.75 yd: all five new arms red.
   - snap rule 36 to 400: snap arm red.
   - snap rule 36 to 4: 500 ms arm and snap arm red.
   - leash clamps prevPos too (the documented sawtooth artifact): 400 and
     500 ms arms red. The EXISTING netem arm does not catch this one; the
     stall arms are the only guard, new coverage in the exact sense R11 asked.
   - kernel heading perturbed +0.05 rad: all five arms red via the
     lateral-drift proxy (the yaw-untouched pin works).
   - `SELF_MOTION_BLEND_RATE` 12 to 0.5: all four it.each arms red via the
     recovery band.
   - `online.ts` re-anchor cap 1.25 to 1 (LOCKSTEP drift): the net_interp
     continuity pin red.
   - harness mutation, `skipDeliveries` ignored: all five arms red; the
     saturation floors are what catch an empty stall (the coverage auditor's
     independent probe measured an unstalled run reaching only 0.7849 against
     floors of 0.95/1.05), so assertion (b)'s decisiveness is auditable.
5. Measured values behind the literals (fully deterministic rig: synthetic
   clock, seed 42, no wall-clock reads): steady-state lead 0.7849 yd at the
   150 ms echo (budget 1.100); stall saturation 0.9967 at 100 ms (the anchor
   keeps sweeping the last delivered segment for the first 50 ms of a
   one-interval gap, hence the lower floor) and 1.0981 at 250 ms and up;
   resume max steps 0.148/0.205/0.274/0.498 yd against ceilings
   0.25/0.35/0.45/0.75, all far below both the one-frame gap replay
   (0.7/1.75/2.8/3.5 yd) and the 6 yd rule; worst resume backslide a single
   2.3 cm servo-settle frame at 250 ms; the snap arm's single 9.28 yd step
   lands on the anchor with error 0.000; lateral drift exactly 0 on both the
   display and the server lane.
6. Regression: `self_motion` + `net_interp` + `spawn_cinematic` +
   `architecture` in one targeted run, 65 passed. Bare full `npm test` at the
   end: exit 0, 1513 test files passed (6 env-gated DB skips), 18776 tests
   passed. Run unpiped to a scratch log after waiting out another session's
   load spike (load1 49 on 16 cores at first check); the error-level log
   lines in the output are the woc_balance/moderation mock-injected fixtures
   inside passing suites.
7. `npx tsc --noEmit` clean. `npx @biomejs/biome ci` over the two changed
   files (list piped through xargs): zero errors, zero format diffs (the 8
   warnings are the pre-existing `noExplicitAny` test-cast idiom the gate
   does not fail on). Diff scanned: no em or en dashes, no emojis, no
   `.only(`, no `debugger`, no parentheses in test names (the vitest -t regex
   trap). All probe artifacts and mutation backups stayed in the session
   scratchpad, outside the repo.

## Reviewer fan-out and dispositions

Two fresh read-only reviewers on the final diff, per the phase-04 test-only
precedent. qa-checklist: READY, 0 blocking, 0 should-fix, 1 VERIFY
(independent mutation-decisiveness confirmation, closed by the coverage audit
and the ledger above); it explicitly rejected the other six domain reviewers
as not applicable (no sim, wire, ui/render, DDL, SQL, or secret surface) and
confirmed the two-reviewer precedent. test-coverage-auditor: all eight
behaviors covered, with two should-fixes and two nits, every one applied or
dispositioned:

- SHOULD-FIX, APPLIED: the snap arm detected the reset with the same imported
  constant production decides with, so a moderate rule drift (36 to 64) would
  move detection and decision together and stay invisible. Closed with the
  literal pin `expect(SELF_MOTION_SNAP_DIST_SQ).toBe(36)`.
- SHOULD-FIX, APPLIED: assertion (b) had no auditable mutation evidence (no
  production mutation exercises it). The harness mutation is now run and
  recorded in the ledger (item 4): ignoring `skipDeliveries` turns all five
  arms red through the saturation floors.
- NIT, DISPOSITIONED: several literals sit near their observed values
  (saturation floor 0.95 vs observed 0.9967; backslide floor -0.03 vs the
  observed -0.023 servo blip). The rig is fully deterministic, so these are
  stable behavior pins rather than flake sources, and a deliberate predictor
  retune is expected to update them; the observed values are documented in
  the test comments beside the literals.
- NIT, DISPOSITIONED: the companion pin's final `toBeCloseTo(poseBeforeX, 2)`
  depends on sub-4 ms statement scheduling through `performance.now`. This
  matches the file's existing bareClient wall-clock idiom, and both sides of
  the decisive re-anchor equality saturate at the cap, making that assert
  (12 digits) clock-free; only the softer post-resume redraw check carries
  the clock at all.

## Adversarial pass: what is missing or deliberately left

- The exact gap where the reset first fires (between 500 and 2500 ms;
  analytically near 2.1 s at the 150 ms echo, because the resume sweep
  spreads the anchor jump over one snapshot interval) is not pinned. R11 asks
  for one greater-than-500 arm; the boundary is bracketed from both sides,
  and pinning the exact flip would couple the suite to sweep-mechanics
  constants a later packet may retune.
- The arms run at a single echo (150 ms, mid-band: both the cap and the
  measurement window are latency-scaled there, neither floor- nor
  cap-pinned). The extremes already have arms in this file (the containment
  run at 100, the cap run at 500 echo); the freeze mechanics are
  echo-independent once the leash binds, so per-echo stall arms would
  multiply runtime for no new claim.
- Turn-during-stall is not exercised: R11's yaw claim is the straight-run
  proxy, and a turning stall would make the lateral-drift oracle unusable
  (lateral motion becomes legitimate). Facing behavior has its own suites.
- The stall is a total broadcast outage; degraded-but-present cadence and
  jitter during the stall belong to the netem arm and Packet 6's
  instrumentation, not this pin set.
- The companion pin covers position continuity only; facing continuity needs
  no capped-pose equivalent because `facingAlpha` never extrapolates, and the
  prevFacing basis test already covers the re-anchor.
- Not run here: full `npm run gate` and the /qa full fan-out; both are
  packet-close items (phase 07) per the packet cadence.
