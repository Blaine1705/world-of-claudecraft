# Phase 02 QA: per-class lanes

Phase spec: packet-3-input-cadence.md, "Phase 02" (rulings R5, R6, R11, R12
binding; R3 honored unchanged).
Status: COMPLETE. All acceptance checks below passed on 2026-07-24.

Base check (R1): at execution time origin/release/v0.30.0 still tips at
802f2fc78 (this branch's base), no newer release branch exists, and packet 0
(cf3412e66) is NOT merged, so no release merge and no release-merge-audit run
were needed.

## What changed

- NEW `server/msg_lanes.ts`, pure (injected nowSec only; no session/ws
  imports, no Date.now): `classifyMsgLane` mirroring the dispatch switch
  (movement = t 'input'; chat = cmd 'chat'; exempt = t 'logout', cmd
  'telemetry', cmd 'challengeResponse'; every other parsed shape including
  non-object JSON, unknown t, and unknown cmd = command), `MsgLaneState` with
  one shared refill clock (equivalent to lazy per-lane refill because the
  bucket math composes over time splits), `createMsgLanes` seeding every lane
  full, and `consumeLaneToken(state, lane, nowSec)` returning allow or drop
  (a drop spends nothing, mirroring the gate). Constants:
  `MSG_LANE_MOVEMENT_REFILL_PER_SECOND` 90 / `MSG_LANE_MOVEMENT_BURST` 120,
  `MSG_LANE_COMMAND_REFILL_PER_SECOND` 30 / `MSG_LANE_COMMAND_BURST` 60,
  `MSG_LANE_CHAT_REFILL_PER_SECOND` 4 / `MSG_LANE_CHAT_BURST` 8.
- `server/msg_rate_limit.ts`: `tallyDrop` exported (the one-line seam phase 01
  left module-private), with the comment extended to state the R6 contract:
  gate and lane drops share the one abuse window.
- `server/game.ts` (thin consumer edits only): `ClientSession` gains
  `msgLanes` beside `msgRate`, seeded in join; session resume deliberately
  carries the lane buckets exactly as it carries `msgRate` (R2's carry,
  verified: `resumeSession` touches neither). A private `consumeLane` helper
  is the call edit plus the kick arm R12 allows: on a lane drop it feeds
  `tallyDrop(session.msgRate, nowSec)` and kicks through `kickSession` with
  the same literal pair as the gate kick (the dedicated reason is phase 04).
  The R5 placements, exactly:
  - movement: first statement of the input arm, before the spectating check,
    the sim moveInput assignment, and `botDetector.observeInput`.
  - command: immediately after `botDetector.observeCommand`, gated on
    `classifyMsgLane(msg) === 'command'` AND membership in a new
    `KNOWN_COMMANDS` runtime set (built from `COMMAND_NAMES`), so known
    commands are observe-then-drop while unknown cmds fall through to the
    switch default and draw their token AFTER the 'unknown_command' anomaly.
  - garbage: the 'non_object' and 'unknown_type' arms draw a command-lane
    token AFTER their protocol-anomaly observation; no anomaly arm was added
    or moved, and lane drops emit no anomaly of their own.
  - chat: co-located directly above `consumeChatToken` in the chat case, after
    the moderation router, `handleChatFilterCommand`, and `isChatMuted`, all
    of which stay upstream and lane-unthrottled.
- The chat ladder (`consumeChatToken`, its constants, and its player-facing
  strings) is byte-untouched: the game.ts diff is pure insertions. The other
  two `consumeChatToken` sites (guild_event_create, mail send) and the
  `isChatFilterWrite` site are deliberately NOT chat-lane-checked: those
  frames are command-lane traffic by classification, and the ladder token
  they burn is the pre-existing player-text metering.
- NEW `tests/msg_lanes.test.ts` (29 tests): the constants pin, classification
  pins for every message type (including a COMMAND_NAMES sweep, the three
  exemptions, cmd-scoped exemption non-transfer to t, unknown shapes, and
  non-object JSON), per-lane budget arithmetic (burst, exact refill,
  whole-token boundary, idle cap, drop-spends-nothing, backwards-clock
  clamp), the reserved-lane property in all three directions, and the
  GameServer-seam integration pins (below).
- `tests/server/tunables.test.ts`: a sibling "inbound lane constants" row
  pinning the six exports against disagreeing literals.

## Integration pins at the GameServer seam

Real `GameServer` + real `Sim`, mocked db, fake ws, the game_sessions
spread-pattern detector sink, and a fake Date clock
(`vi.useFakeTimers({toFake: ['Date']})`) so `handleMessage`'s internal
`Date.now()` is deterministic:

- A 300/s movement flood with six interleaved casts: every cast reaches the
  sim (`castAbilityBySlot` spy), movement frames are shed by the lane
  (observeInput count under offered, movement bucket dry), exactly one
  abusive second tallies, and the session survives (THE reserved-capacity
  pin; the same arm is the mandated mutation target, below).
- A 30/s cast mash for three seconds with telemetry beats and a
  challengeResponse riding along: zero drops of any kind, all 90 casts land.
- Exemption contract with the command lane exhausted: a control cast
  lane-drops, then a telemetry beat and a challengeResponse neither tally a
  drop nor touch lane state (deep-equal), while observeCommand still saw
  both.
- Logout with the command lane exhausted (and the control drop proving it
  dry) still tears the session down cleanly.
- Chat-lane exhaustion never touches the upstream chat surfaces: with the
  chat lane dry and a control drop tallied, ten `/ignorelist` readouts all
  reach `social.ignoreList` and ten moderation commands all reach the
  moderation router, with zero further drops.
- Ladder messaging preserved: the sixth rapid chat passes the LANE and is
  refused by the LADDER with its player-facing rate copy, with zero lane
  drops (the lane is the more generous pre-guard, R5).
- Observe-then-drop: 61 casts at one instant; observeCommand saw 61,
  the sim saw 60, one drop tallied.
- Drop-before-observe: 121 input frames at one instant; observeInput saw
  120, `lastInputSeq` stays 120, the dropped frame's distinct facing never
  lands on the entity, one drop tallied.
- Garbage after anomaly: with the command lane dry, one non-object, one
  unknown t, and one unknown cmd each still reach the protocol-anomaly
  channel in order AND tally lane drops (the lane never mutes the detector).
- R6 end to end: a sustained 150/s movement stream (under the pre-parse burst
  for its first six seconds, so the early shedding is the movement lane's)
  accumulates abusive seconds through the shared window and kicks with the
  gate's exact error frame and a closed socket; a 100/s cast flood (under the
  pre-parse refill entirely, so every drop is the command lane's) kicks
  through the same window, proving the path is not movement-specific.
- Cross-cause additivity: 15 movement-lane drops plus 20 pre-parse gate drops
  inside one second, neither cause alone crossing the 30-drop floor, sum to
  one abusive second in the shared window.

## Design decisions recorded

- `consumeLaneToken` takes the lane by name (`MsgLane`), and `classifyMsgLane`
  returns `MsgLane | 'exempt'`: exempt frames are never lane-checked at all,
  so they neither spend nor refill lane state (pinned by the deep-equal arm).
- game.ts consumes with the lane literal at each R5 placement (the arm already
  knows its class); `classifyMsgLane` is a production consumer at the command
  switch, where it decides command-vs-chat-vs-exempt in one place instead of
  duplicating the exemption list in the coordinator.
- The known/unknown command split at the pre-switch site exists because R5
  orders the unknown-cmd token draw AFTER its anomaly observation: a
  pre-switch draw would either mute the 'unknown_command' anomaly on a lane
  drop or reorder it. `KNOWN_COMMANDS` is the `COMMAND_NAMES` table as a
  runtime set, so the split cannot drift from the dispatch vocabulary
  (`tests/command_schema.test.ts` pins the case labels to the same table).
- The command-lane check sits before the jailed check and the
  `HEAVY_SELF_CMDS` dirty flag: a lane-dropped frame must not trigger the
  jailed notice sends nor force a heavy self re-diff (drops are drops).
- Lane drops during spectate: the movement check is the literal top of the
  input arm, so a spectator's input stream is metered too (harmless: the
  frames were already discarded, and metering keeps the flood posture
  uniform).
- One shared `lastRefillSec` across the three lanes instead of three clocks:
  refilling untouched lanes on any consume is mathematically identical to
  lazy per-lane refill and keeps the state four numbers.

## Acceptance evidence

1. `npx vitest run tests/msg_lanes.test.ts`: 29 tests green.
   Neighbor regression: `npx vitest run tests/msg_lanes.test.ts
   tests/msg_rate_limit.test.ts tests/server/tunables.test.ts
   tests/game_sessions.test.ts tests/game_state_metrics.test.ts
   tests/command_schema.test.ts`: 6 files, 157 tests, all green (including
   the R8 count-at-top pin, unedited).
2. Mutation checks, both reverted after: (a) the phase's mandated probe:
   casts routed through the movement lane (the pre-switch `consumeLane`
   flipped to 'movement'); 5 tests failed including "delivers every cast
   intact through a 300 per second movement flood", proving the
   reserved-lane pin decisive. (b) the telemetry/challengeResponse exemption
   stripped from `classifyMsgLane`; exactly the classification exemption pin
   and the lane-exhausted exemption integration pin failed.
3. `npx tsc --noEmit`: clean (also proves no other ClientSession literal
   misses the new field).
4. `npm run ci:changed`: exit 0. `npx @biomejs/biome ci` over the five
   touched files: no errors; the 4 warnings and 1 info are pre-existing on
   untouched lines (`server/game.ts` useLiteralKeys,
   `tests/server/tunables.test.ts` noTemplateCurlyInString on the SQL-text
   pins).
5. Hygiene scans: no em or en dashes, no emojis, no `.only(`, no `debugger`
   in the diff or the new files; no parens in test titles; no
   Date.now/Math.random/performance.now in the pure module.
6. Reviewer fan-out (fresh subagents, coverage mode): test-coverage-auditor
   over the pins and a spec-conformance reviewer over the whole diff against
   the phase spec. Findings and resolutions recorded below.

## Reviewer findings and resolutions

Two fresh subagents reviewed the uncommitted diff in coverage mode: the
test-coverage-auditor over the pins and a spec-conformance reviewer over the
whole diff against the phase spec. Neither found a blocking or should-fix
gap; every finding was applied or recorded.

- Coverage auditor, verdict: the phase 02 mandated test list is fully
  satisfied with decisive assertions; both mutation checks confirmed genuine
  (the killed tests flip on exactly the mutated behavior). Explicitly passed:
  literal-disagreeing constant pins, fakes only at the boundary, the
  drop-before-observe and observe-then-drop pins each decisive against a
  placement move, and the 150/s kick arm's arithmetic traced to prove the
  five abusive seconds are driven entirely by LANE drops.
- Coverage auditor, nit (medium): the reserved-lane property was pinned in
  the two R5-named directions but not the third (a chat flood leaving
  movement and command untouched). RESOLVED: new unit arm "a chat flood
  never consumes a movement or command token".
- Coverage auditor, nit (low): gate and lane drops were never shown summing
  inside one second (each abusive second in the kick arms forms from lane
  drops alone). RESOLVED: new integration arm "adds gate drops and lane
  drops into one abusive second across causes" (15 lane drops plus 20 gate
  drops, neither crossing the 30 floor alone, one abusive second).
- Coverage auditor, note: the reverse integration flood (a 60/s cast flood
  draining only the command lane at the seam) is covered at unit level here
  and is a phase 05 cadence-matrix arm per R14. DEFERRED BY PLAN.
- Coverage auditor, note: join seeds fresh lane buckets while resume carries
  them. RECORDED as intentional (mirrors R2's msgRate carry; see What
  changed).
- Spec reviewer, verdict PASS at high confidence on every check: the four R5
  placements verified at their exact sites, R3 (gate above JSON.parse,
  nothing queues, allow-or-drop only), R6 (shared tallyDrop window, both
  kick sites byte-identical literal pairs, same nowSec basis), R11 (neither
  sim nor observeInput sees a dropped movement frame; observeCommand
  precedes the command check; the exemptions end to end; no new anomaly
  kind), R12 (module purity: zero imports, injected time; game.ts thin with
  consumeLane as the sanctioned kick arm), constants and exemptions exact,
  chat ladder byte-untouched with the guild_event_create / mail_send /
  isChatFilterWrite ladder sites correctly outside the chat lane, resume
  carry, no double-draw or missed-draw (the classifyMsgLane guard is
  load-bearing since chat/telemetry/challengeResponse are all in
  COMMAND_NAMES), KNOWN_COMMANDS in lockstep with CommandName by
  construction, and conventions clean.
- Spec reviewer, observation O1 (low): unparseable garbage (the invalid_json
  arm) draws no lane token because it dies before dispatch; deliberate
  asymmetry with valid non-object JSON per R3/R4. RECORDED (adversarial pass
  below).
- Spec reviewer, observation O2: spectator input frames are movement-lane
  metered by the literal top-of-arm placement. RECORDED (design decisions).
- Spec reviewer, observation O3: the moderation router and list readouts are
  bounded only by the pre-parse gate, exactly the R5 intent, pinned by the
  chat-exhaustion test. RECORDED.
- Spec reviewer, observation O4 (low): only the movement lane's kick was
  integration-pinned; command and chat kicks were transitive through the one
  consumeLane helper. RESOLVED beyond the ask: new integration arm "kicks a
  sustained cast flood through the same shared abuse window" pins a second
  lane end to end; the chat lane stays transitive through the same single
  code path.

## Adversarial pass: what is missing or deliberately left

- Lane drops are still operator-invisible: the R8 counters
  (`wsMessageDropped('lane_movement' | 'lane_command' | 'lane_chat')`) land
  in phase 03, which is why `consumeLane` centralizes the drop path (the
  counter attaches in one place).
- The handleMessage-seam pins deferred by the phase 01 coverage audit (gate
  wiring: raw.length as approxBytes, drop early-return, cause emission while
  `wsMessage('in')` still counts) remain owed by phase 03's test list.
- The lane kick still renders as the generic connection rejection; phase 04
  owns the dedicated reason literal and matcher lockstep (R10).
- The full cadence-model matrix (refresh rates, phase offsets, mixed traffic,
  the stall-then-flush arm, the flood arms up to the kick boundary) is
  phase 05's; this phase pins the lane contract and its placements, not the
  client send scheme.
- The R11 detector re-check against the private overlay tip of record is
  phase 06's close-out obligation; this phase honored the placement
  obligations R11 states (verified by the observe-then-drop and
  drop-before-observe pins).
- Unparseable garbage (the invalid_json arm in handleMessage) draws no lane
  token: it dies before dispatch, so the lanes never see it. Deliberate
  (lanes are post-parse by design, R3/R5); its flood exposure is bounded by
  the byte budget and the frame ceiling, and R4 owns that accounting.
- No state-shape migration concern: lane state lives only in process memory,
  created per session by this build; in-process resume reuses the object
  (R2's deliberate carry, same as msgRate).
