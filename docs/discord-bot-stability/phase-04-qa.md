# Phase 4 QA: Server set-based endpoints

Phase 4 added a new secret-gated endpoint, rewrote a hot write path onto one multi-row
statement across two arms, and wrote the first tests for two previously untested queue modules.
Each of those is a place where a test can look decisive and prove nothing: a query-count pin
that counts mocked calls instead of statements, an `IS DISTINCT FROM` skip that never actually
skips in the fixtures, a cap test that passes because the cap was never reached. This QA
session verifies the deliverables adversarially and then proves the tests bite by mutating the
new logic and watching the suite fail.

```
This is Phase 4 QA of the Discord Bot Stability packet: verify Server set-based endpoints.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent before it
counts) plus mutation spot checks on the flex-batch handler logic, the members-meta bulk
upsert, and the relay/activity queue modules (decision D19: every phase's QA runs ultracode).
Worktree: /Users/fernando/Documents/wocc-discord-bot.

STEP 0 - PRE-FLIGHT: `git status` clean and Phase 4 committed (if the tree is dirty, ASK; this
checkout may be shared). Memory scan including the test-pin trap index: READ IT before judging
or writing any pin. Load at minimum the constant-self-comparison trap, the "prove the tests
RAN" rule, the no-checkout-over-WIP mutation trap, the vitest `-t` regex trap, the unquoted
vitest filter trap, and the pg traps for SQL text pins (raw versus evaluated SQL).

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-04-server-batch-endpoints.md, and the Phase 4 diff
(`git diff <phase-start-commit>..HEAD`, plus `git log` for the phase's commits). It returns:
the deliverables Phase 4 promised, the acceptance criteria it claimed, every file touched, and
every new or changed test with the behavior each one claims to pin.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering):
  - Correctness agent: is every Phase 4 deliverable and acceptance criterion actually met?
    Specifically: does flex-batch really resolve links in one IN pass and batch the follow-on
    loads, or does a per-id loop survive somewhere in the call chain? Are unlinked ids
    genuinely absent rather than answered with a zero-valued payload? Are the input cap, the
    per-id length slice, and the non-string drop identical to members-meta? Does the
    members-meta upsert skip on ALL of the meta fields, including the null and cleared cases
    (a role cleared to null, a name cleared to null, a missing joinedAt)? Do the D-invariants
    hold: D9 (no legacy twin for the new route; both arms edited for members-meta or a
    ledgered deviation), D10 (one statement, both caps intact), D11 (no existing route
    retired), D12 (comment present, no prune added), D18 (assertions at the 1,000 player /
    5,000 member envelope)?
  - Test coverage agent: are the assertions DECISIVE? Does the query-count pin count real SQL
    statements (the makePool `calls` rig) rather than mock invocations that would not move if
    an N+1 returned? Is the batch-size-invariance pin a real comparison rather than a constant
    compared against itself? Are both sides of the activity dedupe TTL boundary tested? Does a
    cap test actually push past the cap and assert WHICH items were dropped? Any orphaned or
    unreferenced test, any single-arm test of an "all fields" claim?
  - Dead-code agent: unused imports, types, or helpers left behind by the members-meta rewrite;
    a now-unreachable per-member update path; leftover scaffolding from `npm run new:endpoint`.
  - Plus the Review Dispatch Matrix rows matching the diff (privacy-security-review,
    migration-safety, database-performance-reviewer) and qa-checklist.
  Mutation pass, in an ISOLATED worktree (never over the working tree; consult the memory
  entries on worktree symlinks and on stash being shared across worktrees before creating it):
  mutate, one at a time, and prove the suite kills each mutant:
    1. flex-batch: invert the linked-only filter so unlinked ids also return payloads.
    2. flex-batch: drop the input cap (remove the array slice).
    3. flex-batch: shift the per-id length slice boundary by one.
    4. members-meta: remove the `IS DISTINCT FROM` skip so every row writes.
    5. members-meta: invert the skip so only unchanged rows write.
    6. members-meta: change the returned skipped count to the total instead of the skipped
       subset.
    7. discord_relay: raise the cap by one, and separately splice from the wrong end so the
       NEWEST items are dropped.
    8. discord_activity: make the dedupe TTL comparison inclusive versus exclusive at the
       boundary, and separately drop the dedupe check entirely.
  For every mutant, PROVE the tests ran (capture the vitest output showing the test count and
  the failing test names, not just a nonzero exit code; a suite that silently matched zero
  tests is the classic false kill). Record a kill tally.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Then
review the fix round itself with a fresh-eyes agent: the fixes are unreviewed code. Re-run the
state.md server-only validation row plus the http spine, the new queue tests,
`npm run build:server`, and `npm run ci:changed`.

STEP 4 - DOCS: update docs/discord-bot-stability/progress.md (Phase 4 QA complete, any
deferrals, the mutation kill tally) and docs/discord-bot-stability/state.md (any drift the
audit found in the locked decisions, the key file paths, or the created-by-this-packet list).
Commit with explicit paths and a body.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts of findings found
and fixed by severity, the mutation kill tally (killed / survived, and what a survivor means),
deferrals with their reason, and a one-line handoff for Phase 5.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing phase
scope. Stop and surface if a mutant SURVIVES and the test that should have killed it cannot be
strengthened without redesigning the Phase 4 implementation.
```
