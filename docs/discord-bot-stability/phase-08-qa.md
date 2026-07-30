# Phase 8 QA: Observability

Adversarial verification of the Phase 8 diff. Telemetry fails quietly: a series that renders
a frozen 0, a staleness rule that never fires, a clamp that silently accepts a hostile value,
or a counter that landed on one presence arm and not the other. None of those break a test
anyone is watching, and all of them mean the next incident is invisible again. This session
proves the numbers are real, bounded, and correct on both arms.

Starter prompt for the session:

```
This is Phase 8 QA of the Discord Bot Stability packet: verify Observability.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent
before it counts) plus mutation spot checks on the Phase 8 clamp, render, and staleness
logic (the bot-side counter collector, the server-side snapshot module, and the metrics
register function).
Worktree: /Users/fernando/Documents/wocc-discord-bot.

STEP 0 - PRE-FLIGHT: git status clean (Phase 8 committed). Memory scan including the
test-pin trap index (READ IT before judging or writing any pin), plus
prom-counter-no-scrape-backfill and the captured-clock versus fake-timers entries: both
decide whether this phase's tests can catch what they claim to catch.

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
progress.md, phase-08-observability.md, and the Phase 8 diff (git diff against the
phase-start commit). It returns: the promised deliverables and acceptance criteria; every
file touched; the recorded decisions (cumulative versus delta, Gauge versus Counter, the
unknown-scope rule, which fields zero on staleness); the full list of new series names and
their label sets; and the clamp bounds now applied on each presence arm.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering; every finding independently
confirmed by a skeptic agent before it counts):
  - Correctness agent: every deliverable and acceptance criterion actually met. Specifically:
    do the two presence arms store byte-identical state for the same body (or is there a
    ledgered deviation with a real justification); is every clamp bound sane and no
    pre-existing bound loosened; can any bot-supplied string reach a label value; does the
    chosen Counter-or-Gauge shape survive a bot restart (the pushed value going DOWN); does
    the staleness rule actually fire, and does it zero the fields the phase said it would;
    can a malformed or oversized counters block break a presence push (it must not); is the
    register function wired at boot on the same registry /metrics serves.
  - Test coverage agent (or test-coverage-auditor): are the assertions DECISIVE. Check that
    the exposition assertions pin literal series names and values, not a regex that would
    pass on an empty body. Check the "renders at 0 before any push" arm exists (the
    no-backfill trap publishes a frozen 0, which a post-push-only test cannot distinguish
    from a working counter). Check per-field negative cases: a multi-field clamp test that
    only ever violates one field proves nothing about the others. Check both arms of every
    either/or claim, and that the staleness test asserts the boundary in BOTH directions.
  - Dead-code agent: unused imports and types, a counter collected by the bot and never
    read by the server, a series registered and never set, a config key added and never
    used, leftovers of any replaced code.
  - Review Dispatch Matrix rows matching the diff: privacy-security-review (server/ change).
    database-performance-reviewer only if the diff touched a database call site or added
    stored growth; if it did, that is itself a finding, since Phase 8 should touch neither.
    Confirm no other row matches; if one does, the phase went out of scope, and that is
    BLOCKING.
  - qa-checklist over the diff.
  - Mutation pass, in an ISOLATED worktree (never over the live checkout; a stash is shared
    across worktrees, so do not lean on one). Mutate, one at a time, and prove the suite
    kills each mutant:
      1. Widen one clamp bound by an order of magnitude, and separately remove one clamp
         entirely (the raw value flows through).
      2. Drop the counters block from the LEGACY presence arm only, leaving the RouteDef arm
         correct (the dual-arm pin must fail).
      3. Drop one field from the rendered series set.
      4. Invert the staleness comparison, and separately shift the staleness threshold by
         one interval.
      5. Delete the registration-time touch that makes each series render at 0.
      6. Accept an unrecognized 429 scope string as a label value.
      7. If the phase chose delta-incremented Counters: remove the restart guard so a
         decreasing pushed value produces a negative or wrapped delta. If it chose Gauges:
         make collect() read a stale local copy instead of the live snapshot getter.
    For every mutant, PROVE THE TESTS RAN (memory: mutation-harness-must-prove-tests-ran):
    capture runner output showing the test count and the failing assertion, never just a
    nonzero exit code. Record every survivor and the test that should have caught it.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Then
review the fix round itself with a FRESH eyes agent (the fixes are unreviewed code). Re-run
the validation matrix: npx tsc --noEmit; the bot suite plus the Phase 8 bot tests;
npm run build:bot; npx vitest run tests/server/internal.test.ts tests/discord_server.test.ts
tests/server/discord.test.ts tests/discord_db.test.ts plus the new metrics test file; the
http spine (tests/server/http/parity.test.ts, completeness.test.ts,
ownership_coverage.test.ts); npm run build:server; npm run ci:changed.

STEP 4 - DOCS: progress.md (Phase 8 QA complete, with any deferral named), state.md (drift
found, plus anything the mutation pass taught about these pins).

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL); counts found and fixed
by severity; mutation kill tally (killed over attempted, with any survivor named and its
fix); deferrals; one-line handoff for Phase 9.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing phase
scope. Stop and surface if a fix would require widening a clamp or adding a route, a table,
or a poll: none is authorized in this phase, so report it as a follow-up instead. Stop and
surface if the mutation pass cannot prove the tests ran. Do not run the mutation pass over
the live worktree.
```
