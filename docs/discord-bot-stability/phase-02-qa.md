# Phase 2 QA: Discord rate-limit governor

The governor is the module that has to hold under fault, in production, where nobody is watching:
if a guard is inverted or a boundary is off by one, the failure mode is another temporary API ban
rather than a red test. This session verifies that every D2, D3, and D4 behavior is actually
implemented and actually asserted, that nothing in the rewire changed which Discord calls the bot
makes, and it mutation-checks bot/rate_governor.ts guard by guard.

## Starter prompt

```
This is Phase 2 QA of the Discord Bot Stability packet: verify the Discord rate-limit governor.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent before it
counts) plus mutation spot checks on bot/rate_governor.ts. Judge every refutation yourself rather
than taking it on faith, and require the skeptic to have the file open before a refutation
counts.
Worktree: /Users/fernando/Documents/wocc-discord-bot.

STEP 0 - PRE-FLIGHT: run `git status` and confirm it is clean with Phase 2 committed; another
session may share this checkout, so ASK before touching anything you did not create. Memory scan
including the test-pin trap index (READ IT before judging or writing any pin), plus
mutation-harness-must-prove-tests-ran, mutation-test-uncommitted-revert-trap, the clock and
timer traps (cachedread-captured-clock-vs-fake-timers, settimeout-fractional-delay-fires-early),
env-empty-numeric-default-shift, and the worktree/node_modules entries
(worktree-symlink-vitest-limitation, stale-node-modules-fullsuite-failure-set) since the mutation
pass needs a second worktree that can actually run vitest.

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
docs/discord-bot-stability/progress.md, docs/discord-bot-stability/phase-02-rate-limit-governor.md,
and the Phase 2 diff (find the phase-start commit from the branch log, the commit immediately
before the first Phase 2 commit, and diff it against HEAD). It returns: the promised deliverables
and acceptance criteria, the files touched with a one-line summary of each change, the governor's
public surface and internal state machine in prose, the new env keys with their defaults, and a
map of which test covers which D2/D3/D4 behavior.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering: report every gap with confidence and
severity, do not pre-filter):
  - Correctness agent, Discord contract: does the governor provably never dispatch at
    `Remaining == 0`? Is the FULL retry_after honored on all three scopes with no ceiling (the
    old 10 second clamp gone)? Does a non-JSON 429 body pause for DISCORD_BAN_PAUSE_MS and log,
    rather than short-retrying? Does the breaker exclude scope `shared` from its count, trip at
    DISCORD_BREAKER_LIMIT, roll its 10 minute window, and half-open only after a full quiet
    window? Does the forbidden cache actually suppress retries for its TTL and expose a
    role-position invalidation? Are the provisional bucket key and the returned bucket hash
    reconciled without double counting? Are there any hard-coded per-route numeric limits (O2
    says there must be none)? Is /api/v10 pinned, the User-Agent still valid, X-Audit-Log-Reason
    present on member PATCHes, and X-RateLimit-Scope logged on every 429 (O5)?
  - Correctness agent, rewire: did the call set change? Every Discord REST call the bot made
    before must still be made, with the same method, path, and payload, and the caller-visible
    contracts (what throws, what returns null, what is swallowed) must be intact or deliberately
    and documentedly changed. Check purity: no fetch, ws, Date.now, setTimeout, setInterval, or
    performance.now inside bot/rate_governor.ts. Check the D-invariants: D7 (no new dependency),
    D8 (pure module plus thin shell plus wiring in main.ts), no src/ or server/ edit, no secret
    committed, no em dash, en dash, or emoji in the diff including log strings.
  - Test coverage agent: is every arm named in the phase spec actually present and decisive?
    Header-driven pacing, the three 429 scopes, the HTML-body 429, breaker trip and half-open and
    window roll, forbidden-cache no-retry and TTL expiry, queue ordering, bucket remap, counter
    correctness, and the same-inputs-same-schedule determinism run. Flag any arm that asserts a
    call count where it should assert a schedule, any timing test whose clock cannot actually
    advance, any breaker test that only checks the tripping side of the boundary, and any pin
    that re-reads the value it claims to pin. Confirm the env defaults are asserted with an
    empty-string arm, not only an unset arm, and that all four keys reached the commented Discord
    block in .env.example with their defaults (ruling R8), with no real secret committed.
  - Dead-code agent: the old retry path fully deleted (no orphaned constant, no unused import, no
    unreachable branch left from the 10 second clamp), unused exports on the governor, and types
    that no longer have a consumer.
  - Review Dispatch Matrix rows matching the diff, per implementation-plan.md: the bot code
    matches no row, but the sanctioned .env.example edit (R8) matches the
    `privacy-security-review` row, so that reviewer plus `qa-checklist` is the expected set, and
    the .env.example edit is NOT scope creep. Any OTHER matching row (server/, src/net/, compose,
    CI) is a finding: the phase went out of scope.
  Mutation pass on bot/rate_governor.ts, in an ISOLATED worktree created from the Phase 2 HEAD
  commit (never check out over uncommitted work), each mutant applied one at a time:
    - Guard inversions: dispatch WHEN Remaining is 0; count scope `shared` toward the breaker;
      skip the global pause on a global-scope 429; treat a non-JSON 429 body as a normal 429.
    - Boundary shifts: `Remaining <= 0` to `< 0`; Reset-After read as milliseconds instead of
      seconds (or the reverse); breaker limit off by one in each direction; the rolling window
      edge (an entry exactly at 10 minutes); the forbidden TTL edge.
    - Dropped calls: never record a 429; never open the breaker; never write the forbidden cache;
      never increment a counter; never remap the provisional bucket key.
    - Half-open: probe without waiting for a full quiet window; close the breaker on a FAILED
      probe.
    Each mutant must be killed by a NAMED test. Prove the suite actually ran for every mutant:
    record the vitest summary line (files, tests, passed, failed) and confirm a nonzero failure
    count, since a config or path mistake that runs zero tests looks like a pass.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Then
review the fix round itself with a fresh-eyes agent, because the fixes are unreviewed code. Then
re-run the state.md bot-only validation row: `npx tsc --noEmit`,
`npx vitest run tests/discord_bot.test.ts` plus every bot test file, `npm run build:bot`,
`npm run ci:changed`, and `npm run gate` at close. Commit with explicit paths, a scoped
Conventional Commit subject, and a body; no `git add -A`.

STEP 4 - DOCS: update docs/discord-bot-stability/progress.md (Phase 2 QA row complete, plus
deferrals under the per-phase notes) and docs/discord-bot-stability/state.md (drift the audit
found, the final env key names and defaults, the counter names Phase 8 will consume, and any new
implementer gotcha). If the audit answered or sharpened an OPEN item (O2, O5), say so in state.md
rather than closing it silently. Record genuinely reusable traps to memory as one file per fact
plus its MEMORY.md pointer line.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts found and fixed by
severity, the mutation kill tally (mutants planted, killed, survived, with the survivor
explained), deferrals with reasons, and a one-line handoff for the Phase 3 session.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing Phase 2's
scope (for example a contract gap whose fix belongs to the Phase 3 scheduler or the Phase 6 sweep
rewrite). Stop if a surviving mutant can only be killed by changing behavior rather than by
adding a test, and report it as a finding instead of changing behavior here. Stop if closing a
gap would need a new npm dependency (D7): escalate to the user instead. Stop if the mutation
worktree cannot run the suite, rather than reporting an unproven kill.
```
