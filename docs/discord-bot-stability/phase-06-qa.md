# Phase 6 QA: Bot consumes the new surface

Phase 6 is the phase whose regressions are invisible in a green suite: a linked set that
quietly grows to the whole online roster, a stream the outbox fan-out silently drops, a write
path that skips the governor because it was easier to call the REST shell directly, or a
deletion that left the old poller registered under a different name. This QA session checks the
load profile the packet exists to change, not just the code that claims to change it, and it
proves the tests bite by mutating the linked-set maintenance and the outbox dispatch fan-out.

```
This is Phase 6 QA of the Discord Bot Stability packet: verify Bot consumes the new surface.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent before it
counts) plus mutation spot checks on the linked-set maintenance module and the outbox dispatch
fan-out (decision D19: every phase's QA runs ultracode).
Worktree: /Users/fernando/Documents/wocc-discord-bot.

STEP 0 - PRE-FLIGHT: `git status` clean and Phase 6 committed (if the tree is dirty, ASK; this
checkout may be shared). Memory scan including the test-pin trap index: READ IT before judging
or writing any pin. Load at minimum the constant-self-comparison trap, the "prove the tests
RAN" rule, the no-checkout-over-WIP mutation trap, the vitest `-t` regex trap, the unquoted
vitest filter trap, and the clock traps (fake timers versus captured clocks, fractional
setTimeout firing early, clamp-after-jitter ordering).

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
docs/discord-bot-stability/progress.md, docs/discord-bot-stability/phase-06-bot-new-surface.md,
and the Phase 6 diff (`git diff <phase-start-commit>..HEAD` plus `git log` for the phase's
commits). It returns: the promised deliverables, the acceptance criteria claimed, every file
touched, the before-and-after outbound call inventory Phase 6 recorded, and every new or
changed test with the behavior it claims to pin.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering):
  - Load-profile agent (the highest-value audit of this phase): independently enumerate every
    outbound call the bot can now make, from the source rather than from the phase's own
    inventory. Confirm there is exactly ONE outbox loop, that no timer or interval outside the
    scheduler survives anywhere in bot/, that no code path can start a second loop (a
    GUILD_CREATE re-sweep on every re-IDENTIFY is the known trap), and that the sweep's
    iteration source is the linked set rather than the presence-derived online set. Recompute
    the steady-state request rate at the D18 envelope and compare it against the number Phase 6
    reported.
  - Correctness agent: is every deliverable and acceptance criterion actually met? Does the
    linked set add on link events and REMOVE on unlink and on member departure, and does it
    survive a reconnect without a full re-discovery? Does every Discord write in the sweep path
    go through the governor (grep for direct REST shell calls)? Are writes really spread across
    the sweep window, or merely queued and then drained in one tick? Do the D-invariants hold:
    D1 (one poll, adaptive cadence with both bounds), D2/D3/D4 (no governor bypass), D5 (zero
    writes at steady state, echo suppression intact), D6 (linked members only), D7 (no new
    dependency), D8 (pure logic in a tested module, shells stay thin), D11 (no server route
    edited), D13 (new cadences env-configurable with safe defaults)?
  - Test coverage agent: are the assertions DECISIVE? Does the fan-out test assert per stream,
    or would dropping one stream still pass? Does the "spread writes" test actually fail if
    every write fires in one tick? Does the steady-state zero-writes test use a fixture where
    a write WOULD occur without the diff (a test that would pass with no members at all proves
    nothing)? Do the timing tests use injected clocks or fake timers correctly for the
    scheduler under test? Any orphaned test, any single-arm test of an "each" claim?
  - Dead-code agent: leftovers from the deletion pass. Unreferenced ServerClient methods,
    orphaned logic helpers, unused imports and types, a poll function that is gone from the
    interval block but still defined, and any comment that still describes the deleted
    three-poller design.
  - Per the Review Dispatch Matrix in implementation-plan.md, a bot-only diff matches no
    domain reviewer row: run qa-checklist and do not spawn one. If the diff touches server/ or
    a deploy file, that is itself a finding (Phase 6 went out of scope) and the matching rows
    apply.
  Mutation pass, in an ISOLATED worktree (never over the working tree; consult the memory
  entries on worktree symlinks and on stash being shared across worktrees before creating it):
  mutate, one at a time, and prove the suite kills each mutant:
    1. Linked set: never remove on unlink (the set only grows).
    2. Linked set: seed it from the online-user set instead of flex-batch results (the D6
       regression, and the exact shape of the original incident).
    3. Linked set: drop the link-change stream update so the set goes stale.
    4. Outbox fan-out: skip one stream (do this once per stream, four mutants).
    5. Outbox fan-out: dispatch the same envelope twice.
    6. Cadence: pin the loop to the fast interval so the idle decay never happens, and
       separately pin it to the idle interval so a busy drain never speeds up.
    7. Sweep: dispatch all writes in the first tick instead of spreading them.
    8. Sweep: bypass the governor for one write path.
  For every mutant, PROVE the tests ran: capture vitest output showing the test count and the
  failing test names, never a bare nonzero exit code. Record a kill tally.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Then
review the fix round itself with a fresh-eyes agent: the fixes are unreviewed code. Re-run the
state.md bot-only validation row (`npx tsc --noEmit`, `npx vitest run tests/discord_bot.test.ts`
plus the phase's bot test files, `npm run build:bot`) and `npm run ci:changed`.

STEP 4 - DOCS: update docs/discord-bot-stability/progress.md (Phase 6 QA complete, deferrals,
the mutation kill tally, and the connection-count status if it is still verify-at-deploy) and
docs/discord-bot-stability/state.md (any drift in the locked decisions, the env-key list, or
the key file paths). Commit with explicit paths and a body.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts of findings found
and fixed by severity, the independently recomputed steady-state request rate against the one
Phase 6 claimed, the mutation kill tally (killed / survived, and what a survivor means),
deferrals with their reason, and a one-line handoff for Phase 7.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing phase
scope. Stop and surface if the load-profile audit finds the steady-state request rate is not
materially better than the incident baseline (that is a design problem, not a QA fix). Stop and
surface if a mutant SURVIVES and the test that should have killed it cannot be strengthened
without redesigning the Phase 6 implementation.
```
