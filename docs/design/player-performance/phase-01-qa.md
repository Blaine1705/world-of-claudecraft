# Phase 01 QA: pre-parse gate redesign

Phase spec: packet-3-input-cadence.md, "Phase 01" (rulings R2, R4, R6, R7, R12
binding; R3 placement honored unchanged).
Status: COMPLETE. All acceptance checks below passed on 2026-07-24.

Base check (R1): at execution time origin/release/v0.30.0 still tips at
802f2fc78 (this branch's base) and packet 0 (cf3412e66) is NOT merged, so no
release merge and no release-merge-audit run were needed.

## What changed

- `server/msg_rate_limit.ts` rewritten in place, keeping the pure
  state-plus-functions contract (injected nowSec only; no Date.now, no
  session/ws imports). New constant set: `MSG_RATE_REFILL_PER_SECOND` 120,
  `MSG_RATE_BURST` 180, `MSG_BYTE_REFILL_PER_SECOND` 64 KiB, `MSG_BYTE_BURST`
  128 KiB, `MSG_ABUSE_WINDOW_SECONDS` 10, `MSG_ABUSE_KICK_SECONDS` 5,
  `MSG_ABUSE_SECOND_DROP_FLOOR` 30. `MsgRateBucketState` grows the byte bucket
  (`byteTokens`) and the per-second abuse window (`dropSecond`,
  `dropsThisSecond`, the pruned `abusiveSeconds` ring); `createMsgRateBucket`
  seeds both buckets full. `consumeMsgToken(state, nowSec)` became
  `consumeInboundFrame(state, nowSec, approxBytes)` returning
  `{verdict: 'allow'} | {verdict: 'drop' | 'kick', cause: 'rate' | 'bytes'}`.
  `MSG_RATE_VIOLATIONS_FOR_KICK` and the `violations` field are deleted (the
  dead consecutive-kick ladder, R6). The header comment is rewritten around the
  measured cadence model (R2): it cites `flushInput` and the 50 ms interval
  timer in `src/net/online.ts`, the shared-gate suppression that yields the
  measured 60 to 64/s steady rates and the analytic 82.5/s hard cap, and the
  stall-then-flush constraint that shaped the windowed abuse score (R6). The
  20 Hz premise is gone deliberately (R7).
- `server/game.ts` (thin consumer edit only): `handleMessage` passes
  `raw.length` into the gate and switches on the verdict object; the kick arm
  keeps the literal pair `'rejected by server'` / `'moderation action'` this
  phase (the dedicated reason is phase 04). The gate stays ABOVE `JSON.parse`
  (R3, load-bearing); `wsMessage('in')` keeps its count-before-verdict
  placement (R8). Session resume continues to carry the existing bucket:
  `resumeSession` never touches `session.msgRate` (verified; R2 rules the
  faster refill makes the carried state benign).
- `tests/msg_rate_limit.test.ts` rewritten with the module: the stale 20 Hz
  premise test is replaced by "keeps an 80 per second mixed stream drop-free
  indefinitely" (120 simulated seconds of 80/s traffic at the measured 74 to
  106 byte input sizes plus a chat line and a command per second, after a full
  burst drain), with a 20 Hz arm kept as the trivial lower bound; burst-drain
  and refill arms at the new constants; byte arms (a 16 KiB frame spends
  exactly 16384 byte tokens; byte exhaustion drops with cause `'bytes'` while
  frame tokens remain and spends nothing; the byte bucket refills at 64 KiB per
  second up to its cap); abuse-window arms (a second one drop under the floor
  is never abusive across more seconds than the window holds; the fifth abusive
  second in the window kicks and the fourth does not; allowed frames landing
  mid-second between drop runs never reset the window; a single-second
  thousand-drop burst never kicks and live traffic resumes drop-free; abusive
  seconds age out past the window; an exact-boundary arm pins ten-seconds-back
  out, nine-seconds-back in).
- `tests/server/tunables.test.ts`: the 60/40/200 row is replaced by the
  seven-constant set (the 200-kick row deleted with its constant), every pin an
  exported constant against a disagreeing literal.
- Post-review additions (see "Reviewer findings and resolutions"): `tallyDrop`
  clamps its accounting second monotonic (a backwards clock step can never
  push a duplicate ring entry); the dead `MsgRateVerdict` export is deleted;
  the header names `WS_KEEPALIVE_PING_MS` (server/game.ts) for the keepalive
  window; new test arms cover a sustained byte flood kicking with cause
  `'bytes'` through the same window, the backwards-clock clamp, the kick
  verdict's cause field, a rate drop leaving the byte bucket untouched, and
  the whole-token refill boundary (half a token drops, two allow).

## Design decisions recorded

- Verdict shape: a discriminated union rather than a bare string, so the phase
  03 counters get the drop cause without a second call, and a kick frame also
  carries the cause of the drop that crossed the threshold.
- Dropped frames spend nothing: neither the frame token nor byte tokens are
  consumed on any drop. The byte budget bounds PARSE exposure and a dropped
  frame never parses; symmetrically a byte-drop leaves the frame bucket intact
  (both directions pinned).
- Check order: the frame-token check precedes the byte check, so a
  doubly-exhausted frame reports cause `'rate'`.
- Window semantics: drops bucket into `floor(nowSec)` receive-time seconds; a
  second becomes abusive exactly when its tally reaches the floor (pushed
  exactly once, on the crossing drop); the ring is pruned on every drop to
  seconds `s` with `sec - s < MSG_ABUSE_WINDOW_SECONDS`, so it holds at most 10
  entries; the kick verdict fires on the drop that brings the in-window count
  to `MSG_ABUSE_KICK_SECONDS`. Allowed frames never touch abuse state.
- `tallyDrop` stays module-private this phase. R6 says drops of every cause
  (including lane drops) tally into the same window; phase 02 exports or
  threads it when the lanes land, a one-line seam.
- Backwards-clock posture: the refill already clamps negative elapsed to zero;
  the abuse accounting now mirrors that by clamping its second to the latest
  seen (`Math.max(floor(nowSec), dropSecond)`). Only an already-dropping
  client can even reach this path, so the clamp is ring-bound hygiene, not a
  fairness fix. The pre-existing `lastRefillSec = nowSec` rewind on backwards
  time is untouched (it can only inflate a flooder's refill briefly).
- The tunables row title changed from "msg-rate trio" to "inbound gate
  constants" (the trio is gone); no script or doc referenced the old title.

## Acceptance evidence

1. `npx vitest run tests/msg_rate_limit.test.ts tests/server/tunables.test.ts`:
   2 files, 66 tests, all green (15 in msg_rate_limit).
2. Mutation checks: (a) the phase's mandated probe: `MSG_RATE_REFILL_PER_SECOND`
   set back to 40; exactly the premise test "keeps an 80 per second mixed
   stream drop-free indefinitely" failed; reverted and re-verified at 120.
   (b) the post-review clamp probe: reverting the monotonic accounting clamp
   to plain `floor(nowSec)` failed exactly "keeps the abuse accounting
   monotonic when the clock steps backwards"; reverted, suite green again.
3. `npx tsc --noEmit`: clean.
4. `npm run ci:changed`: exit 0. `npx @biomejs/biome ci` over the four touched
   files: no errors; the 4 warnings and 1 info are pre-existing on untouched
   lines (`server/game.ts` useLiteralKeys; `tests/server/tunables.test.ts`
   noTemplateCurlyInString on the SQL-text pins).
5. Consumer-seam regression: `npx vitest run tests/game_state_metrics.test.ts
   tests/game_sessions.test.ts` green (51 tests), including the
   count-at-top-of-handleMessage pin that R8 requires to stay green unedited.
6. Straggler scan: zero references to `MSG_RATE_VIOLATIONS_FOR_KICK` or
   `consumeMsgToken` anywhere in server/, src/, tests/, headless/; no em or en
   dashes in the diff.
7. Reviewer fan-out (fresh subagents, coverage mode): test-coverage-auditor
   over the two test files and a general diff reviewer against the phase spec.
   Findings and resolutions recorded below.

## Reviewer findings and resolutions

Two fresh subagents reviewed the uncommitted diff in coverage mode (report
everything, filter later): the test-coverage-auditor over the test files and a
general spec-conformance reviewer over the whole diff against the phase spec.
Neither found a gap above low severity; every finding was applied.

- Coverage auditor, should-fix (medium): byte-caused drops never fed the abuse
  window in any test and a byte-caused kick was unpinned, so a regression that
  stopped the byte path from tallying would pass. RESOLVED: new arm "kicks a
  sustained byte flood with cause bytes through the same window" (five
  seconds of 30 byte-exhaustion drops each; the fifth kicks with cause
  `'bytes'`).
- Coverage auditor, should-fix (low): nothing asserted a rate drop leaves the
  byte bucket untouched. RESOLVED: asserted in the burst-drain arm.
- Coverage auditor, nit: the kick verdict's `cause` field was never asserted.
  RESOLVED: `makeAbusiveSecond` now pins `{verdict: 'kick', cause: 'rate'}`
  and the byte-flood arm pins `{verdict: 'kick', cause: 'bytes'}`.
- Coverage auditor, nit: the game.ts wiring (raw.length as approxBytes, kick
  tear-down, drop early-return) is unpinned at the handleMessage seam.
  DEFERRED BY PLAN: the phase 03 test list owns the handleMessage-level pins
  (dropped frame emits its cause while `wsMessage('in')` still counts); noted
  here so phase 03 closes it.
- Coverage auditor, nit (low): the negative-elapsed clamp and the whole-token
  boundary were unpinned defensive guards. RESOLVED: the backwards-clock arm
  pins the clamp posture and the refill arm pins the boundary (half a
  refilled token drops, two allow).
- Diff reviewer, low: under a backwards clock step across a second boundary,
  `tallyDrop` could re-open an older second and push a duplicate ring entry
  (bounded in practice; only an already-flooding client could reach it).
  RESOLVED in code: the accounting second is clamped monotonic; the new test
  is mutation-verified decisive (see acceptance evidence 2b).
- Diff reviewer, low: `MsgRateVerdict` became a dead export in the rewrite.
  RESOLVED: deleted.
- Diff reviewer, micro-nit: the header referenced the keepalive termination
  window without naming its symbol. RESOLVED: names `WS_KEEPALIVE_PING_MS`
  (server/game.ts).
- Both reviewers explicitly passed everything else: constants exact, rename
  and deletion complete with zero stragglers, header cites the real client
  symbols, module purity, window boundary arithmetic both sides, R3 placement
  (gate above `JSON.parse`), R8 count-at-top placement, resume carry, scope
  discipline (no phase 02 to 04 leakage), and no dashes or emoji.

## Adversarial pass: what is missing or deliberately left

- No live repro was attempted: the defect this packet fixes is inactive below
  about 30 fps (the current town framerate), per the plan's standing gotcha;
  the cadence tests are the proof.
- Drops remain operator-invisible until phase 03 lands the R8 counters; this
  phase changes only the verdict math.
- The limiter kick still renders as the generic connection rejection in the
  client; phase 04 owns the dedicated reason literal and matcher lockstep
  (R10).
- Per-class lanes (R5) do not exist yet: a cast flood and a movement flood
  still share the one ceiling until phase 02.
- The abuse window only sees pre-parse drops this phase; lane drops join the
  tally in phase 02 per R6.
- No state-shape migration concern: bucket state lives only in process memory
  and every live object was created by this build's `createMsgRateBucket`; a
  deploy restarts the process and recreates all buckets, and in-process resume
  reuses the same object (R2's deliberate carry).
