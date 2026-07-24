# Phase 03 QA: observability, the drop, kick, and seq-gap counters

Phase spec: packet-3-input-cadence.md, "Phase 03" (rulings R8, R9 binding; R3,
R6, R12 honored unchanged).
Status: COMPLETE. All acceptance checks below passed on 2026-07-24.

Base check (R1): at execution time origin/release/v0.30.0 still tips at
802f2fc78 (this branch's base), no newer release branch exists, and packet 0
(cf3412e66) is NOT merged anywhere on origin, so no release merge and no
release-merge-audit run were needed.

## What changed

- `server/http/game_signals.ts`: the seam gains the closed cause vocabulary
  (`WS_DROP_CAUSES`, exactly `'rate' | 'bytes' | 'lane_movement' |
  'lane_command' | 'lane_chat'`, exported as data plus the `WsDropCause`
  type) and three new `GameMetricsCounters` hooks: `wsMessageDropped(cause)`,
  `wsRateKick()`, and `wsInputSeqGap(missed)`. `noopGameMetricsCounters` is
  extended to match. The header now lists all six counter families and the
  cardinality contract comment states the two bounded label sets (direction, a
  fixed two; cause, the fixed five), nothing per-player.
- `server/http/game_metrics.ts`: `registerGameStateMetrics` registers
  `woc_ws_messages_dropped_total{cause}`, `woc_ws_rate_kicks_total`, and
  `woc_input_frames_missed_total` (name constants exported beside the existing
  ones). Every cause series is pre-registered at zero at boot
  (`inc({cause}, 0)` over `WS_DROP_CAUSES`: prom counters cannot backfill a
  scrape, so dashboards must see each series from boot); the two unlabeled
  counters expose 0 from construction (pinned). Each sink method wraps its inc
  in the seam's never-throw try/catch. The header cardinality comment gains
  the cause set.
- `server/msg_rate_limit.ts`: `MSG_SEQ_GAP_SANITY` (1000) exported beside the
  limiter constants with the R9 comment (what a seq gap proves, and why one
  observation is capped: a client/server seq-reset mismatch must never book a
  giant fictitious gap).
- `server/game.ts` (thin consumer edits only): the `handleMessage` gate arm
  collapses the two verdict ifs into one non-allow block that emits
  `wsMessageDropped(gate.cause)` and, on the kick verdict, `wsRateKick()`
  before the unchanged `kickSession` call (control flow identical;
  `wsMessage('in')` keeps its count-before-verdict placement untouched, R8).
  `consumeLane` emits `wsMessageDropped(LANE_DROP_CAUSE[lane])` on every lane
  drop and `wsRateKick()` on the lane-driven kick, so all seven consumeLane
  call sites are counted through the one helper phase 02 centralized for
  exactly this. The input arm computes the parsed-seq gap at the pre-existing
  `lastInputSeq` site: only when the high-water is positive, only a forward
  jump past plus one, capped per observation by `MSG_SEQ_GAP_SANITY`, fed to
  `wsInputSeqGap`. `LANE_DROP_CAUSE` sits beside `KNOWN_COMMANDS` as a
  compile-complete map (`satisfies Record<MsgLane, WsDropCause>`).
- `tests/game_state_metrics.test.ts` (new section, 11 tests, recording-fake
  sink over the real GameServer with a fake Date clock, the msg_lanes
  pattern): the gate rate drop emitting `'rate'` while `wsMessage('in')` still
  counts the frame and the drop returns before dispatch (a control chat routes,
  the starved one never does); the byte-budget boundary pin with a MULTIBYTE
  filler proving `raw.length` (UTF-16 code units) reaches the gate as
  approxBytes (a Buffer.byteLength implementation reddens the
  empty-until-eight arm at frame five); the gate kick counted exactly once
  with the full teardown (error frame, closed socket, session gone); per-lane
  cause pins for all three lanes; a lane-driven kick riding the same kick
  counter with every drop `'lane_command'`; seq-gap arithmetic (plus-one
  contiguity, exact miss count, stale lower seq books nothing); the
  fresh-join and resume guard driven through the REAL `socketClosed` plus
  join resume path (`lastInputSeq` zeroed, restarted counter books nothing);
  the sanity cap; and the attribution arm (a movement-lane drop books nothing
  itself, the next processed frame books exactly the shed count). Every
  single-drop arm also asserts zero kicks. The two phase-01-deferred
  handleMessage-seam pin sets land here, closing that audit item.
- `tests/server/http/game_metrics.test.ts` (four new exporter tests): the
  zero-init exposition (all five cause series plus the two unlabeled counters
  at an explicit 0 before any sink call, names pinned as literals, and
  `WS_DROP_CAUSES` pinned to the exact five-string array); sink increments
  (the seq-gap sink adds the whole observed gap, 7 plus 2 exposing 9, not one
  per call); the cause label bounded to the fixed five; and the never-throw
  contract (every one of the six counters' inc forced to throw, every sink
  method swallows it).
- `tests/server/tunables.test.ts`: `MSG_SEQ_GAP_SANITY` joins the inbound
  gate constants row, pinned against the disagreeing literal 1000.

## Design decisions recorded

- A kick verdict counts under BOTH counters at both sites: the kick rides the
  crossing drop, so `woc_ws_messages_dropped_total` keeps the clean meaning
  "every non-allowed inbound frame" and `woc_ws_rate_kicks_total` counts the
  teardown. Verified single-tally: the gate's `tallyDrop` runs inside
  `consumeInboundFrame` only, never again at the emission site.
- The cause vocabulary lives on the seam (`WS_DROP_CAUSES` in
  game_signals.ts) and game.ts never passes a raw lane string: gate causes
  are structurally checked (`MsgDropCause` is a subset of `WsDropCause`) and
  lane causes go through the `satisfies`-checked `LANE_DROP_CAUSE` map, so a
  lane rename or a vocabulary drift is a compile error, and the label set
  cannot grow at a call site.
- `wsInputSeqGap` adds the observed gap per observation (`inc(missed)`), so
  the counter is frames missed, not gap events.
- The seq-gap read attaches at the pre-existing `lastInputSeq` site, after
  the movement-lane check: a gate- or lane-dropped frame returns before any
  seq parse, so a drop can never book its own gap; the NEXT processed frame
  attributes it (pinned by the attribution arm).
- Emission ordering inside both kick arms is count-then-kick, and the
  emission calls are void inserts whose results are never consulted: a
  recording, noop, or throwing sink cannot alter control flow.
- Test filler choices: lane-EXEMPT telemetry frames drain the gate so gate
  arms stay cause-pure; the byte arm's filler is one code unit but two UTF-8
  bytes, making the raw.length convention itself decisive.

## Acceptance evidence

1. `npx vitest run tests/game_state_metrics.test.ts
   tests/server/http/game_metrics.test.ts tests/msg_lanes.test.ts
   tests/msg_rate_limit.test.ts tests/server/tunables.test.ts
   tests/game_sessions.test.ts`: 6 files, 169 tests, all green, including the
   R8 count-at-top pin unedited (no diff hunk touches it; the coverage
   auditor verified it byte-identical against HEAD).
2. Mutation checks, both reverted after: (a) the phase's mandated cause-pin
   probe: `consumeLane` emitting `'lane_command'` for every lane drop;
   exactly 3 tests failed (the lane movement cause pin, the lane chat cause
   pin, and the attribution arm), proving the cause pins decisive. (b) the
   seq-gap guard probe: the positive-high-water guard stripped; exactly
   "never books a gap from the zero high-water on a fresh join or a resume"
   failed.
3. `npx tsc --noEmit`: clean.
4. `npm run ci:changed`: exit 0. Biome over the seven touched files: no
   errors (the 4 warnings and 1 info are pre-existing on untouched lines).
5. Live scrape: a local server boot with `METRICS_TOKEN` set; GET /metrics
   with the bearer showed all three families present at zero before any
   traffic, with all five cause series exposed
   (`woc_ws_messages_dropped_total{cause="..."} 0` for each,
   `woc_ws_rate_kicks_total 0`, `woc_input_frames_missed_total 0`).
6. Hygiene scans: no em or en dashes, no emojis, no `.only(`, no `debugger`
   in the diff; no parens in the new test titles; the diff touches only the
   seven phase files.
7. Reviewer fan-out (fresh subagents, coverage mode): test-coverage-auditor
   over the pins and a spec-conformance reviewer over the whole diff against
   the phase spec. Findings and resolutions recorded below.

## Reviewer findings and resolutions

Two fresh subagents reviewed the uncommitted diff in coverage mode: the
test-coverage-auditor over the test files and a spec-conformance reviewer
over the whole diff. No blocking finding; every finding was applied.

- Coverage auditor, verdict: coverage decisive, every mandated Phase 03 pin
  present, both phase-01 deferred pin sets satisfied, both mutation checks
  genuine. Explicitly passed: value-exact assertions, no
  constant-self-comparison, fakes only at the sink/db/ws boundary, all five
  causes exercised, both seq-gap guard conjuncts with negative cases, both
  kick teardowns, hygiene.
- Coverage auditor, should-fix (low real-world risk): the never-throw
  contract of the new sink methods was untested. RESOLVED: new exporter arm
  forces every counter's inc to throw and proves all six sink methods swallow
  it (also closing the same inherited gap for the three pre-existing
  methods).
- Coverage auditor, nit: the ASCII byte-boundary filler could not distinguish
  raw.length from a Buffer.byteLength implementation. RESOLVED: multibyte
  filler; the boundary arithmetic now reddens on the wrong convention.
- Coverage auditor, nit: single-drop arms never asserted the kick counter
  stayed zero. RESOLVED: `rateKicks()` pinned to 0 on all five single-drop
  arms.
- Spec reviewer, verdict CONFORMS with no blocking or should-fix finding.
  Explicitly passed: R8 (placement, names, pre-registration, never-throw,
  truthful cardinality comments), R9 (guards, cap, placement,
  drop-cannot-book), R12/R3 (thin consumer, call-only edits, gate above
  JSON.parse, nothing queues, the kick literal pair unchanged this phase),
  kick dual-counting consistent at both sites with no double tally,
  behavior-neutral observability, drop-path completeness (all seven
  consumeLane sites funnel through the counting helper), scope discipline
  (no phase 04/05 leakage, no detector edits), typography.
- Spec reviewer, observation (low): the seq high-water sits after the
  spectating early-return, so a spectate interval can book one capped gap
  when normal input resumes. Pre-existing placement, inside R9's best-effort
  framing, bounded by the cap. RECORDED (adversarial pass below).
- Spec reviewer, observation: single-kick-per-session depends on kickSession
  synchronously setting `session.left`; verified synchronous through
  `clients.delete`, with the stale-session guard short-circuiting buffered
  frames. PASSES.
- Spec reviewer, observation: one pre-existing em dash in an untouched
  dispatchMessage context comment; inherited debt, not part of this diff.

## Adversarial pass: what is missing or deliberately left

- Honesty framing, restated per R9: on an ordered TCP socket
  `woc_input_frames_missed_total` is NOT an independent blind-spot detector.
  It is the INPUT-FRAME-ATTRIBUTED share of the server's own drops (gate and
  movement-lane drops of input frames, plus rare client-side send races),
  and that attribution is its value: it isolates how much of the loss hit
  the movement stream, which the cause-labeled totals cannot say. A
  pre-parse drop never parses a seq, so it can never book a gap directly.
- The flood kick still renders as the generic connection rejection with the
  `'rejected by server'` literal; phase 04 owns the dedicated reason and the
  byte-pinned matcher lockstep (R10).
- Frames rejected by the stale-session guard return before `wsMessage('in')`
  and stay uncounted: deliberately out of scope per the packet-level notes.
- Unparseable garbage (the invalid_json arm) takes no drop cause: the gate
  ALLOWED it (and charged its bytes), then it died at parse into the
  protocol-anomaly channel. The five causes deliberately mean "server shed
  load", never "malformed client" (R5's anomaly semantics).
- A spectate interval freezes the high-water, so input resuming after
  spectate can book one capped gap; bounded by `MSG_SEQ_GAP_SANITY`, revisit
  only if the phase 06 soak shows it as noise.
- Client-side surfacing of drop counts (the perf-report beacon field) stays
  DEFERRED until packet 0 merges (R9); the bearer-gated /metrics endpoint is
  the fleet surface this packet ships (R8's reach ruling: process-local
  counters, history persisted by the operator's Prometheus, no admin SPA, no
  DB persistence, no durable moderation record).
- The R14 cadence-model matrix (phase 05) will drive these counters through
  the full chain across refresh rates and traffic mixes; this phase pins the
  emission sites and arithmetic, not the client send scheme.
