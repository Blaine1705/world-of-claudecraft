# Phase 06 QA: soak, detector re-check, and packet close-out

Phase spec: packet-3-input-cadence.md, "Phase 06" (rulings R1 and R11 binding;
this file is also the PACKET-level adversarial "what is missing" pass).
Status: COMPLETE. All acceptance checks below passed on 2026-07-24. The packet
is CLOSED pending the maintainer's push and PR decision; the branch stays
local per the plan header.

ADDENDUM, same day, after the maintainer's ruling: the security review's
list-read finding (below) was RESOLVED IN-PACKET on the maintainer's explicit
choice of the read-guard option. See "Addendum: the list-read guard" at the
end of this file; the plan doc's packet-level notes carry the ruling record.
The reviewer-findings entry for the WARNING below is superseded from RECORDED
to RESOLVED by that addendum.

Base check (R1): at execution time origin/release/v0.30.0 still tips at
802f2fc78 (this branch's base), no newer release branch exists, and packet 0
(cf3412e66) is NOT merged anywhere on origin, so no release merge and no
release-merge-audit run were needed at close-out either.

## Runbook item results

1. Jitter soak (BOTS=80 IDLE=1 DURATION_MS=60000, fresh server, throwaway
   Postgres, /metrics scraped before and after): observer gap p50 50.6, p95
   52.2, p99 54.9, max 64.8 ms against the packet 0 baseline 51.3 / 56.9 /
   61.2 / 65.8; zero gaps over 100 ms in 1,185; avg snapshot 10,752 bytes
   (baseline 10,710); identical world (504 sim entities, 144 avg interest,
   80/80 joined plus observer). Drop counters: ZERO increments of any cause
   across 96,095 inbound fleet frames; zero kicks; zero seq-gap frames.
   Acceptance MET. Full record: soak-packet-3.md and
   jitter-soak-packet3.json beside this file.
2. 120 Hz-class turn soak: one scripted client at a drift-corrected flat
   80/s (the R2 analytic hard cap, harder than the measured 60 to 64/s of a
   real 120 Hz display) for 5 minutes on a fresh server: 24,000 input frames
   sent with contiguous seqs, ack high-water 24,000 (shortfall zero), no
   error frame, clean logout; all drop counters zero and the seq-gap counter
   flat. Acceptance MET. Driver source and scrapes: soak-packet-3.md.
3. R11 detector re-check: `diff -rq` of private/bot_detector/ in the main
   tree against /Users/fernando/Documents/wocc-bot-protection exits 0
   (byte-identical, git-clean); a symbol sweep of the overlay src for
   msgRate, violations, consumeMsgToken, consumeInboundFrame,
   consumeLaneToken, msgLanes, msg_rate_limit, msg_lanes, rate_limit finds
   ZERO references, re-confirming no strategy consumes limiter state. The
   R11 verdict stands against the overlay tip of record:
   d63425a6c1ec82e054582d9c686b9c9358019215 (2026-07-09, merge of PR #14,
   fix/grace-period), unchanged since packet authoring.
4. Full `npm run gate` PASS (all 11 steps; 1,515 test files passed, 5
   skipped; browser suite 8/8; typecheck; all five builds), run via Monitor
   with pipefail and no masking pipe, exit 0, load1 well under cores; then
   RE-RUN green after the review-driven test additions below landed, so the
   gate verdict covers the exact close-out tree. The /qa fan-out ran seven
   fresh read-only reviewers (the four the runbook names plus the three the
   gate and the qa skill add): qa-checklist, privacy-security-review,
   test-coverage-auditor, frontend-seam-reviewer, cross-platform-sync (named
   by the qa-checklist gate), a correctness pass, and a dead-code pass.
   Findings and resolutions below.
5. progress.md: the packet 3 row is at PHASES COMPLETE with the QA file
   list and the PENDING maintainer items; the consequence ledger stays in
   packet-3-input-cadence.md for the PR body.
6. Maintainer post-deploy scrape commands documented in soak-packet-3.md
   (production /metrics with the bearer token, the two families to watch,
   and the R9 caveat on reading the seq-gap counter). PENDING, maintainer.

## What changed in phase 06

- NEW docs: soak-packet-3.md (both soak records, environment, the inlined
  turn-soak driver, the maintainer scrape commands) and
  jitter-soak-packet3.json (the raw jitter report). This branch's jitter
  script has no verdict gate (that enhancement rides packet 0), so the
  acceptance comparison lives in the doc per R1's quoted-baseline ruling.
- `tests/msg_lanes.test.ts` (+2 arms, from the coverage audit): "kicks a
  sustained chat flood through the same shared abuse window" (the third
  lane's kick, previously composition-covered only) and "kicks a mixed
  cause flood through the shared abuse window across seconds" (movement
  lane plus gate causes reaching the kick together, with the additivity
  split re-asserted in second zero).
- `server/game.ts`: the pre-existing `msgRate` field comment extended to
  name the byte bucket and abuse window (comment only, from the dead-code
  pass).
- `packet-3-input-cadence.md`: a new adjacent-defect bullet recording the
  security review's list-read finding (below) as out of scope pending a
  maintainer ruling.
- `progress.md`: the packet 3 row to PHASES COMPLETE.

## Design decisions recorded

- The turn-soak driver is inlined in soak-packet-3.md rather than committed
  under scripts/: the maintainer's post-deploy check is a /metrics scrape,
  not a driver run, and the artifacts doc keeps the method reproducible
  without growing the scripts surface. Promote it to scripts/ if it becomes
  a recurring gate.
- The turn soak drives a flat 80/s rather than the modeled two-path scheme:
  strictly harder than any real display class under R2's cadence model, so
  the zero-drop result bounds them all.
- Both soaks ran against a throwaway Postgres container so the dev database
  gains no load accounts; jitter numbers are same-machine-relative to the
  packet 0 baseline (same M4 Max, same Node 26.5.0).

## Acceptance evidence

1. Full `npm run gate`: PASS twice (before and after the phase 06 test
   additions), exit 0 both times, no masking pipes (Monitor + pipefail).
2. Targeted suites after the additions: tests/msg_lanes.test.ts,
   tests/msg_rate_limit.test.ts, tests/game_state_metrics.test.ts,
   tests/game_sessions.test.ts, tests/server/tunables.test.ts: 161 tests
   green (31 in msg_lanes, up from 29).
3. Mutation checks on the new arms, reverted after: (a) chat lane budget
   inflated 4/8 to 400/800: exactly 4 tests failed including "kicks a
   sustained chat flood through the same shared abuse window", proving the
   new arm decisive against a chat lane that cannot drop. An earlier probe
   flipping chat CLASSIFICATION to exempt reddened only the classification
   pin, which is correct: the chat case draws its lane by literal at the R5
   placement, so classification is not that arm's kill path. (b) The mixed
   arm re-asserts the cross-cause 15 plus 20 split from the additivity arm,
   whose gate and lane drivers were mutation-verified in phases 01 and 02.
4. `npx tsc --noEmit` clean; `npm run ci:changed` exit 0; biome ci over the
   two touched source files 0 errors; malware scan PASS re-run with the new
   docs in the tree; no em or en dashes or emojis on any added line; no
   parens in the new test titles.
5. Soak acceptance: runbook items 1 and 2 above, both MET.

## Reviewer findings and resolutions

Seven fresh read-only reviewers over the full packet diff plus the close-out
docs. No blocking finding anywhere; every finding applied or recorded.

- qa-checklist gate: implementation READY with zero code findings; its two
  should-fix items (phase-06-qa.md not yet written, close-out artifacts not
  yet committed) are this file and the close-out commit, resolved by
  construction. Its VERIFY list (security fan-out, i18n:gen freshness, soak
  artifact, full gate) is satisfied by this session's runs recorded above.
  It named cross-platform-sync, which was then dispatched.
- privacy-security-review, WARNING, RECORDED as an adjacent defect pending
  a maintainer ruling (the plan doc's packet-level notes now carry it): the
  ignore/block LIST-READ chat commands break out of the chat case before
  the chat lane and the ladder (the R5 ordering, deliberate so a silenced
  player can manage lists), and each read is an uncached per-call DB
  SELECT, so a hostile authenticated client can sustain list-read frames at
  the full pre-parse ceiling with zero drops, unkickable by the abuse
  window; this packet's ceiling raise tripled the reachable rate (40 to
  120 per second). Partly pre-existing; not fixed here because any
  mitigation (a read guard above the router, an in-session list cache, or a
  lane draw ahead of the read break) changes what R5 pinned and what the
  phase 02 chat-exhaustion test deliberately asserts. Needs the
  maintainer's decision, then a separate issue or packet.
- privacy-security-review, INFO, RECORDED: woc_input_frames_missed_total is
  client-seq-derived and a hostile client can inflate it (capped per
  observation by MSG_SEQ_GAP_SANITY); operators must not read it as an
  integrity signal. The maintainer scrape section in soak-packet-3.md now
  carries the caveat beside the commands.
- test-coverage-auditor: no blocking or should-fix gaps; every ruling R2 to
  R14, the consequence ledger, and all three deferred-item promises
  verified landed. Its two nits RESOLVED by the two new kick arms above;
  its third note (the R13 neutrality proof resting on the untouched net
  suites) RECORDED as the repo's accepted neutrality model, with
  net_online_visibility_reconnect independently re-run green.
- frontend-seam-reviewer: NO FINDINGS; matcher path verified end to end,
  M16 fills verified, i18n:gen fresh, extraction byte-neutral, no
  render/ui/styles surface touched.
- cross-platform-sync: no drift at any severity; wire/IWorld-untouched
  claim verified; kick-literal lockstep, lane-vs-client-vocabulary, and the
  seq contract across every reconnect path all consistent. Its three INFO
  observations (the R9 high-water blind spot as designed, a latent
  pre-existing double command-draw for a hypothetical COMMAND_NAME without
  a switch case, and the R10 source pin being line-shaped so a reformat
  fails loudly rather than silently) RECORDED, no action.
- correctness pass: no new defects; traced the refill and window arithmetic
  both sides, the single-kick semantics, the seq-gap guards, the
  raw.length convention, the shared-refill-clock equivalence proof, and the
  model generator's conservative divergences (all recorded in phase 05).
- dead-code pass: no dead runtime code, no functional stragglers, no
  debugging artifacts. Its comment nit RESOLVED (the game.ts msgRate
  comment above). RECORDED as deliberate: the exported
  InboundFrameVerdict and MsgLaneClass types are the declared return types
  of exported functions (module public contract); brainstorm.md's one
  consumeMsgToken mention stays because that file is the verbatim R1 copy
  of packet 0's revision 2 (byte-identical to cf3412e66, verified) and R1's
  merge resolution discards branch-side brainstorm edits.

## Adversarial pass: what is missing at the packet level

- The list-read flood lever above was the one open consequence of this
  packet's own ceiling raise; it is now CLOSED by the addendum below (the
  maintainer's same-day ruling chose the read guard). With it, the flood
  posture claim holds uniformly: every flood class this packet knows about,
  gate, lane, or list-read, is score-kickable through the one shared window.
- The client-side surfacing of drop counts (the perf-report beacon field)
  stays DEFERRED until packet 0 merges (R9); the /metrics counters are the
  fleet surface this packet ships.
- The 15 Latin locales carry loading.messageRateExceeded as pending rows on
  English fallback: legal at PR tier, filled by the maintainer's
  release-time i18n-locale-fill pass (M16's five non-Latin fills shipped
  with the key in phase 04).
- The soak numbers are same-machine-relative; the production check is the
  PENDING maintainer scrape in soak-packet-3.md, not these local runs. The
  jitter comparison could not reuse packet 0's verdict-gated runner (it
  rides the unmerged packet 0 branch); the plan's quoted baseline plus the
  committed JSON is the comparison of record per R1.
- The defect this packet fixes stays INACTIVE below about 30 fps, so no
  live-town repro exists by design; the cadence matrix plus the 80/s turn
  soak are the proof, and packets 1 and 2 will activate the fix fleet-wide.
- Adjacent defects deliberately left for separate issues, unchanged from
  the packet-level notes: the 'moderation action' kick reason rendering raw
  English (no matcher arm), the protocol_conformance header doc drift in
  both detector copies, and stale-session-guard frames staying uncounted
  before wsMessage('in').
- The kick reason reaches the client only; kickSession still records
  nothing durable for ANY kick (R8's reach ruling), and lane state lives
  only in process memory (R2's deliberate resume carry), so a deploy
  restart resets all buckets, which is fine because the contract is
  per-connection flood defense, not persistent reputation.

## Addendum: the list-read guard (maintainer ruling, 2026-07-24)

The maintainer ruled on the security WARNING the same day and chose the
read-guard option over an in-session cache or deferral. What landed:

- NEW `server/list_read_guard.ts` (same purity contract as the gate and the
  lanes: pure state plus functions, injected nowSec): `LIST_READ_BURST` 10,
  `LIST_READ_REFILL_PER_SECOND` 1, `createListReadGuard`,
  `consumeListReadToken` (a refusal spends nothing). The budget is far above
  any human rate (the readouts are manual slash commands) and caps a flooder
  at one DB read per second sustained.
- `server/game.ts` (thin consumer edits): `ClientSession` gains
  `listReadGuard` seeded at join and carried by resume like `msgRate` and
  `msgLanes`; a `consumeListRead` helper mirrors `consumeLane` (counter,
  shared-window tally, same kick arm and literal);
  `handleChatFilterCommand` gains the injected `nowSec` and draws the guard
  at the TOP of the collapsed ignoreList/blockList read arm, so a refusal
  returns handled BEFORE the DB read. Writes keep their ladder metering,
  the moderation router stays upstream, no chat token is drawn: R5's letter
  is intact, and the if-chain shape is preserved (the command_schema scraper
  sees no new case labels; its suite stays green).
- `server/http/game_signals.ts` + `server/http/game_metrics.ts`: the R8
  cause vocabulary is AMENDED from five to six: `WS_DROP_CAUSES` gains
  `'list_read'`, pre-registered at zero at boot like the rest; comments
  updated on both files.
- Tests: NEW `tests/list_read_guard.test.ts` (6 unit arms: constants
  against disagreeing literals, exact burst, refusal-spends-nothing,
  whole-token boundary, idle cap, backwards-clock clamp); two seam arms in
  `tests/msg_lanes.test.ts` (twelve readouts pass exactly ten with the two
  refusals tallied before the read and writes plus plain chat untouched; a
  45 per second readout flood, previously structurally unkickable, kicks
  through the shared window with the exact frame and teardown); the
  `'list_read'` cause arm in `tests/game_state_metrics.test.ts` (refusal
  emits the cause, the DB read never runs for it, zero kicks); the
  six-value `WS_DROP_CAUSES` pins and sink increment in
  `tests/server/http/game_metrics.test.ts`; the "list-read guard constants"
  row in `tests/server/tunables.test.ts`. The pre-existing ten-readout
  chat-exhaustion arm sits exactly at the guard burst and stays green
  UNEDITED, which is the R5-compatibility proof.
- Mutation check, reverted after: guard budget inflated 10/1 to 1000/1000;
  exactly 6 tests failed (both constants pins, the whole-token arm, both
  seam arms, and the cause arm), proving every new pin decisive against a
  guard that cannot refuse.
- Reviewer pass over the addendum diff, two fresh read-only agents:
  privacy-security-review found NO finding at any actionable severity (the
  lever verified closed against parseChatFilterCommand's full vocabulary
  with no other unmetered pre-lane DB read; the silent refusal endorsed as
  the correct choice since a per-refusal send would be a reflected-send
  amplification vector; kick path, nowSec basis, resume carry, and
  cardinality all verified). test-coverage-auditor found every claimed
  behavior decisively pinned except one low should-fix, RESOLVED: a new
  "carries the drained list-read guard across a linkdead resume" arm
  drives the REAL socketClosed plus join resume path and pins the drained
  bucket surviving reconnect (the R2 carry). Its comment nit is applied
  (the pre-existing ten-readout arm now notes it sits exactly AT the guard
  burst, so a lowered burst fails there first, deliberately); its INFO
  (blockList drop-before-read covered transitively through the shared
  single-call site) recorded, no action.
- The R10 lockstep guard caught the addendum, by design: the third full
  gate run FAILED on exactly one test, the localization_fixes R3 arm
  pinning EXACTLY TWO `kickSession(session, MSG_RATE_KICK_REASON,
  'message flood')` sites, because consumeListRead legitimately added a
  third. That selectivity is the pin's whole purpose (a new kick site must
  consciously join the lockstep), so the pin was updated to three arms
  with the guard site named in its comment, and the title reworded to
  "all three kick sites". Nothing else in the 18,997-test run failed.
- Verification: tsc clean; the affected suites green (the seam suite at 34
  tests after the resume-carry arm; localization_fixes and main_api_error
  green after the pin update); biome clean on the touched files (plus the
  one import-order assist fix in game.ts); full `npm run gate` re-run
  green end to end on the final tree.
