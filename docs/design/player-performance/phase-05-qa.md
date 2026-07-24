# Phase 05 QA: the cadence-model test matrix

Phase spec: packet-3-input-cadence.md, "Phase 05" (rulings R13, R14 binding;
R3, R5, R6 define the chain semantics the model drives).
Status: COMPLETE. All acceptance checks below passed on 2026-07-24.

Base check (R1): at execution time origin/release/v0.30.0 still tips at
802f2fc78 (this branch's base), no newer release branch exists, and packet 0
(cf3412e66) is NOT merged anywhere on origin, so no release merge and no
release-merge-audit run were needed.

## What changed

- NEW `src/net/input_send_cadence.ts` (R13), pure constants plus predicate
  with zero imports: `INPUT_SEND_TIMER_INTERVAL_MS` 50,
  `INPUT_FLUSH_GATE_MS` 16, and `inputFlushGateOpen(nowMs, lastSentAtMs)`
  mirroring the `now - lastInputSentAt < 16` skip in online.ts sendInput
  exactly (the predicate is the negation, `>= 16`, identical on every real
  number input). The header documents the send scheme, the shared-gate
  suppression that yields the measured 60 to 64/s steady rates and the
  analytic 82.5/s hard cap, and the R13/Decision 3 exclusion of client-side
  send coalescing.
- `src/net/online.ts` (the whole client diff, zero behavior change): the
  constructor's `setInterval(..., 50)` becomes
  `setInterval(..., INPUT_SEND_TIMER_INTERVAL_MS)` and sendInput's inline
  `now - this.lastInputSentAt < 16` gate becomes
  `!inputFlushGateOpen(now, this.lastInputSentAt)`. Nothing else changed;
  the untouched online/net suites passing unedited is the neutrality proof
  (acceptance evidence 3).
- `src/net/CLAUDE.md`: the client-to-server wire bullet's stale "20 Hz move
  intent, setInterval 50 ms" phrasing is replaced with the two-path scheme
  and the constants' new home, anchored on `input_send_cadence.ts` and the
  matrix test per the docs anchor rule.
- NEW `tests/input_cadence_model.test.ts` (30 tests): a deterministic
  timeline generator models the real client send scheme from the REAL
  imported constants (one merged walk over the timer grid and the rAF grid;
  the timer arm sends unconditionally with the input state as of the last
  rendered frame; the flush arm sends only when the facing signature changed
  AND `inputFlushGateOpen` allows; every send resets the shared gate clock,
  the timer-resets-the-gate interaction; a held turn integrates the real
  `TURN_SPEED` per frame so the signature changes every frame). Timelines
  drive a chain harness composing the REAL pure modules in the exact
  game.ts order (gate before parse per R3, classify, lane, lane drops
  tallying into the shared abuse window per R6, exempt never lane-checked,
  kick and logout ending the run). Arms per R14:
  - Lockstep pins: the constants against disagreeing literals 50 and 16, the
    gate-predicate boundary both sides, and the R5 sizing property that both
    server refills clear the analytic 82.5/s cap DERIVED from the client
    constants.
  - The legitimate matrix: 5 refresh rates x 5 timer-phase offsets x 4
    mixes (pure held turn; turn plus GCD casts; turn plus a 2 s 30/s
    castSlot mash; the full mix adding ladder-legal chat, one telemetry
    beat per 10 s, a mid-stream challengeResponse, and a final logout), 30
    simulated seconds each: zero drops of any cause, zero abusive seconds,
    every frame of every kind processed, with the exemption contract pinned
    explicitly (telemetry 3 of 3, challenge 1 of 1, logout 1 of 1). A
    model-honesty guard bounds the generated input rate per combo (average
    35 to 82.5/s, no single second above 84) so a broken generator cannot
    pass the zero-drop arms vacuously.
  - Stall then flush: a 20 s stall at 240 Hz buffers about 1,200 frames,
    delivered inside one receive-time second: at least 800 drops, NEVER a
    kick, exactly one to two abusive seconds, and zero drops from one
    second after live traffic resumes (with the recovery tail pinned
    non-empty).
  - Flood arms: a 500/s frame flood kicks inside the window with every drop
    cause rate or lane_movement; a 120/s stream of exactly-1 KiB lane-exempt
    telemetry frames (the phase 03 filler trick, keeping the arm cause-pure)
    kicks through the byte budget in 5 to 10 s with every drop cause bytes
    and zero rate drops; a 60/s cast flood alongside a normal 60 Hz turn
    drains only the command lane (zero input drops, zero gate drops, over
    110 lane_command drops, cast accounting exact, no kick inside the
    4-abusive-second run); the core pin, split per the honesty ruling below
    into a gate-bounded 0.8 s 300/s movement burst that drops not one cast
    by any cause (48 movement-lane drops, gate silent, exactly one abusive
    second, clean recovery) and a sustained 300/s arm pinning zero
    lane_command drops ever, every gate-admitted cast processed, and the
    abuse-window kick verdict arriving.
  - Post-review addition (see "Reviewer findings and resolutions"): a
    harness-semantics pin that a clean logout ends the run and nothing
    after it is processed, mirroring the real stale-session guard.

## Deviations from the spec text, recorded

- THE core pin (R14: "a 300/s movement flood never drops a single cast ...
  asserted over the window UP TO the abuse-window kick verdict") is
  structurally unsatisfiable in its literal sustained reading, and the arm
  is split into its two honest halves. Why: the pre-parse gate is
  deliberately class-blind (R3, the placement IS the flood defense), and
  the constants tie exactly: MSG_ABUSE_SECOND_DROP_FLOOR (30) plus the
  movement lane refill (90) equals MSG_RATE_REFILL_PER_SECOND (120), so any
  sustained flood able to book an abusive second from the movement lane
  alone must offer at least 120 movement frames per second, which is the
  gate refill itself: every kick-able sustained flood saturates the gate
  first, and a saturated class-blind gate sheds casts probabilistically
  alongside the flood. The split: (a) the gate-bounded burst arm delivers
  the literal property (a 300/s movement flood, sized inside the gate's
  burst-plus-refill budget, sheds 48 movement frames at the LANE while not
  one cast drops by any cause), the pure-module mirror of the phase 02
  GameServer-seam pin; (b) the sustained arm pins what the lanes actually
  guarantee up to the kick: the flood consumes ZERO command-lane capacity
  (no cast is ever lane-dropped) and every cast the gate admits is
  processed, with any cast loss carrying cause rate, never a lane cause.
  R5's own property statement ("the command lane is reserved capacity
  movement can never consume") is the lane-level claim, which holds in
  full.
- The stall arm stalls 20 s, not R14's 15 s. The spec's "about 1,200
  frames" backlog arithmetic assumed the 80/s ceiling; the honest model
  yields the MEASURED steady rate of about 60/s at 240 Hz (the timer
  replaces one grid flush and pushes the next outside the gate, exactly
  R2's 60 to 64/s band), so 15 s buffers about 900 frames. 20 s delivers
  the specced 1,200-frame magnitude, still well inside the keepalive
  termination window R6 shaped the score against. The one-receive-second
  delivery, the never-kicks bound, the at-most-two abusive seconds, and
  the one-second recovery are all asserted as specced.
- The 500/s flood arm asserts the kick inside (4 s, 10 s], not R14's "5 to
  10 s": tallyDrop marks a second abusive the moment its tally reaches the
  30-drop floor, so under a 380 drops-per-second flood the fifth dropping
  second crosses its floor about 80 ms in and the kick lands just past
  4.1 s. R6's "about 5 to 6 s at 500/s" counted whole seconds; the
  byte-budget flood arm, whose drop rate crosses the floor mid-second,
  lands inside the literal 5-to-10 band and is pinned there.
- The spec's diff shape names the extraction as the whole client diff; one
  bullet of `src/net/CLAUDE.md` was also updated because it pinned the
  stale inline-literal description ("setInterval 50 ms") this phase
  relocated, per the docs anchor rule.

## Design decisions recorded

- The chain harness composes the REAL pure modules rather than driving
  GameServer: phase 05's gotcha bans fake timers, and handleMessage reads
  `Date.now()` internally, so the seam-level wiring proof stays with the
  phase 02/03 integration pins (which this file's matrix deliberately does
  not duplicate) while the matrix proves the CONTRACT against the client
  model with injected receive times only.
- Tie order at equal timestamps: the model processes the timer beat before
  the rendered frame (the interval callback sees the pre-frame facing, and
  the following flush is gate-suppressed at zero elapsed), the
  suppression-maximal order, applied deterministically.
- The generator's per-combo honesty guard double-checks the model against
  its own analytic envelope (timer floor to hard cap) so generator
  regressions fail loudly instead of weakening the matrix silently.
- Frame shapes are the real serialized wire shapes (input frames with the
  full mi flag set and a raw double facing land in the measured 74 to 106
  byte range), so the byte budget is exercised with honest raw.length
  values.
- The abusive-seconds-ever count unions the pruned ring after every drop,
  observing every second the window ever held without reimplementing the
  window arithmetic.

## Acceptance evidence

1. `npx vitest run tests/input_cadence_model.test.ts`: 30 tests green (29 at
   review time; the 30th is the post-review logout harness pin).
2. Mutation checks, both reverted after: (a) the phase's mandated probe:
   `MSG_LANE_MOVEMENT_REFILL_PER_SECOND` 90 to 45; 19 tests failed,
   including every zero-drop matrix arm at 60 Hz and above plus the sizing
   lockstep pin, while the 30 Hz arms rightly survived (a 40/s stream fits
   a 45/s lane), proving the zero-drop arms decisive and honest. (b) the
   R13 lockstep probe: `INPUT_FLUSH_GATE_MS` 16 to 8 in the NEW module; 12
   tests failed (the constant pin plus the matrix arms the faster client
   cadence now floods), proving a client cadence change flips the matrix
   loudly, the stated purpose of the extraction.
3. Neutrality proof: the untouched online/net suites pass unedited:
   `npx vitest run tests/net_online_visibility_reconnect.test.ts
   tests/snapshots.test.ts tests/bandwidth.test.ts tests/net_interp.test.ts
   tests/snapshot_timer_wire.test.ts tests/client_snapshot_timer_wire.test.ts
   tests/net_interaction_outcome.test.ts`: 7 files, 207 tests green.
   Neighbor server-chain regression: `tests/msg_lanes.test.ts`,
   `tests/msg_rate_limit.test.ts`, `tests/game_state_metrics.test.ts`,
   `tests/server/tunables.test.ts`: 118 tests green, all unedited.
4. `npx tsc --noEmit`: clean.
5. `npm run ci:changed`: exit 0. `npx @biomejs/biome ci` over the three
   touched TS files: exit 0, no errors (warnings pre-existing on untouched
   lines).
6. Hygiene scans: no em or en dashes or emojis on any added line (rg over
   the diff and both new files), no `.only(`, no `debugger`, no parens in
   test titles, no fake timers, and no Date.now / Math.random /
   performance.now anywhere in the model or the new module.
7. Reviewer fan-out (fresh subagents, coverage mode): test-coverage-auditor
   over the matrix and a spec-conformance reviewer over the whole diff
   against the phase spec. Findings and resolutions recorded below.

## Reviewer findings and resolutions

Two fresh subagents reviewed the uncommitted diff in coverage mode: the
test-coverage-auditor over the matrix and a spec-conformance reviewer over
the whole diff against the phase spec. Neither found a blocking or
should-fix gap; every finding was applied or recorded.

- Coverage auditor, verdict: all 13 claimed behaviors COVERED with decisive,
  vacuity-guarded assertions; both mutation checks confirmed genuine; the
  three deliberate deviations confirmed honestly implemented. Explicitly
  passed: no constant-self-comparison (client constants pinned to literals,
  the sizing inequality anchored to the literal 82.5), the chain drives the
  REAL server modules rather than a reimplementation, the reserved-lane
  property exercised in both directions, the two gate dimensions isolated
  with per-dimension negatives, and hygiene clean.
- Coverage auditor, nit (medium): the command-lane refill lower bound is
  unpinned in this file (burst alone absorbs the 2 s mash). RECORDED as
  owned by the constants pin in tests/msg_lanes.test.ts; the matrix pins
  the cadence contract, not the lane arithmetic.
- Coverage auditor, nit (high): the lane_chat drop cause is declared but
  never produced (chat rides at the ladder-legal 0.33/s, far under the
  lane). RECORDED: chat-lane shedding is outside R14's matrix and owned by
  tests/msg_lanes.test.ts.
- Coverage auditor, nit (high): the harness's logout-ends-the-session break
  was unpinned (logout always last in the full mix). RESOLVED: new arm
  "ends the harness session at a clean logout and processes nothing after
  it" (the 30th test), pinning leave semantics directly.
- Coverage auditor, info: abusiveSecondCount is a test-side instrument; the
  kick verdict itself rides the real tallyDrop return. RECORDED (design
  decisions above).
- Spec reviewer, verdict: PASS on every Phase 05 requirement at high
  confidence: the R13 extraction exact with bit-identical boundary
  semantics and the module imported only by online.ts and the test,
  coalescing untouched (zero src/game/ diff), the R14 axes and arms
  complete with the generator deriving only from imported constants, the
  chain harness faithful to the game.ts order end to end, server modules
  byte-identical to HEAD, no phase 06 leakage, the CLAUDE.md bullet
  accurate and anchor-clean, and all three deviations mathematically
  verified (including the 4.07 s crossing-drop kick arithmetic and the
  60/s measured steady rate behind the 20 s stall).
- Spec reviewer, info: runChain draws a command token uniformly for
  command-classified frames, without the KNOWN_COMMANDS split of the real
  dispatch (known commands observe-then-draw pre-switch, unknown shapes
  draw after their anomaly observation). Both paths draw exactly one
  command token, the harness generates only known shapes, and the
  garbage/unknown arms are phase 02's seam pins. RECORDED, no coverage gap.
- Spec reviewer, info: the full mix's telemetry and challenge beats do not
  coincide with the mash burst, so exemption under simultaneous
  command-lane saturation is not stressed here; that under-pressure pin
  lives at the GameServer seam in tests/msg_lanes.test.ts (phase 02), and
  the harness exempts by classification unconditionally, so the property
  holds under pressure by construction. RECORDED.

## Adversarial pass: what is missing or deliberately left

- The matrix proves the CONTRACT against the modeled client; it does not
  re-prove the game.ts wiring (owned by the phase 02/03 seam pins) nor the
  live client loop (the phase 06 soak's 120 Hz-class scripted-client arm is
  the field check).
- The model assumes zero network reordering (TCP ordering) and models
  receive time equal to send time outside the stall arm; real jitter only
  spreads arrivals further apart, which is strictly easier on every bucket.
- The sustained-flood honesty ruling above means the packet's consequence
  ledger phrase "casts stop being silently eaten during sustained turns at
  healthy FPS" holds for every LEGITIMATE stream (pinned by the matrix);
  under an active super-ceiling flood the gate is class-blind by design and
  the kick is the remedy.
- The R11 detector re-check against the private overlay tip of record, the
  jitter soak against packet 0's baseline, and the full `npm run gate` plus
  `/qa` fan-out remain phase 06's close-out obligations.
- Client-side send coalescing stays out of scope (R13/Decision 3); nothing
  in `src/game/` was touched.
