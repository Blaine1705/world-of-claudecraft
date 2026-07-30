# Phase 5 QA: Outbox + linked-member change feed

Phase 5's dangerous failure is silent: a feed site nobody wired, a stream that merges in an
order the bot's handlers do not expect, or a "destructive read" that is not actually
destructive under concurrency. None of those break a build. This QA session re-derives the
feed-site enumeration independently (rather than trusting the phase's own list), attacks the
drain semantics, and proves the tests bite by mutating the change feed and the outbox drain.

```
This is Phase 5 QA of the Discord Bot Stability packet: verify Outbox + linked-member change
feed.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent before it
counts) plus mutation spot checks on server/discord_link_changes.ts and the outbox drain
handler (decision D19: every phase's QA runs ultracode).
Worktree: /Users/fernando/Documents/wocc-discord-bot.

STEP 0 - PRE-FLIGHT: `git status` clean and Phase 5 committed (if the tree is dirty, ASK; this
checkout may be shared). Memory scan including the test-pin trap index: READ IT before judging
or writing any pin. Load at minimum the constant-self-comparison trap, the "prove the tests
RAN" rule, the no-checkout-over-WIP mutation trap, the vitest `-t` regex trap, the SQL text pin
raw-versus-evaluated trap, and the cached-read traps (bust refuses in-flight joiners, captured
clock versus fake timers).

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-05-outbox-change-feed.md, and the Phase 5 diff
(`git diff <phase-start-commit>..HEAD` plus `git log` for the phase's commits). It returns: the
promised deliverables, the acceptance criteria claimed, every file touched, the feed-site list
Phase 5 recorded in state.md, and every new or changed test with the behavior it claims to pin.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering):
  - Feed-completeness agent (the highest-value audit of this phase): INDEPENDENTLY sweep
    server/ for every site where a linked account's level, class, top character, reward points,
    status tier, or link state changes, WITHOUT reading Phase 5's enumeration first. Then diff
    your list against the one in state.md. Every site in your list and not theirs is a
    candidate BLOCKING gap; every site in theirs and not yours needs an explanation. Also check
    the inverse error: an enqueue at a site that fires for UNLINKED accounts, which would flood
    the feed with items the bot must discard.
  - Correctness agent: is every deliverable and acceptance criterion actually met? Is the
    identity resolution really ONE IN query across all four streams, or does an enrichment loop
    still resolve per item somewhere? Is the drain genuinely destructive and safe against two
    overlapping requests (nothing delivered twice, nothing lost between splice and serialize)?
    Do cap overflows drop the OLDEST items? Is dedupe keyed so that two different accounts
    never collide? Do the D-invariants hold: D1 (one envelope, all four streams), D9 (RouteDef
    only, spine row hand-added), D11 (existing routes untouched and still working), D18
    (assertions at 1,000 players / 5,000 members)?
  - Test coverage agent: are the assertions DECISIVE? Does the query-count pin count real SQL
    statements rather than mock calls? Is the empty-drain zero-query pin actually reachable
    (does the fixture leave every stream empty, including winners on a warm cache)? Is the
    payload-size assertion pinned to a measured bound rather than a value derived from the same
    code it checks? Are both sides of the dedupe TTL boundary covered? Is stream ordering
    asserted, or merely observed?
  - Dead-code agent: unused imports, types, or helpers; enrichment code left behind after the
    IN-query collapse; scaffolding from `npm run new:endpoint`.
  - Plus the Review Dispatch Matrix rows matching the diff (privacy-security-review,
    database-performance-reviewer, and migration-safety only if a DDL or persisted shape moved)
    and qa-checklist.
  Mutation pass, in an ISOLATED worktree (never over the working tree; consult the memory
  entries on worktree symlinks and on stash being shared across worktrees before creating it):
  mutate, one at a time, and prove the suite kills each mutant:
    1. discord_link_changes: raise the cap by one.
    2. discord_link_changes: splice from the wrong end so the NEWEST items are dropped.
    3. discord_link_changes: drop the dedupe check, and separately flip its TTL comparison at
       the boundary.
    4. discord_link_changes: make `drain` non-destructive (return a copy without clearing).
    5. Outbox: omit one stream from the merged envelope (do this once per stream, four
       mutants, since a test that only checks "some items came back" will survive).
    6. Outbox: resolve identities per item again instead of from the batched map.
    7. Outbox: pass only the first stream's account ids to the IN lookup.
    8. Outbox: call the winners lookup twice per drain.
    9. Winners TTL cache (ruling R2 made it a Phase 5 deliverable): drop the day-finalization
       bust so a finalized day keeps serving from cache, and separately drop the cache so every
       drain queries.
  For every mutant, PROVE the tests ran: capture vitest output showing the test count and the
  failing test names, never a bare nonzero exit code (a filter that matched zero tests is the
  classic false kill). Record a kill tally.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Any feed
site the completeness agent found gets wired and tested in this session. Then review the fix
round itself with a fresh-eyes agent: the fixes are unreviewed code. Re-run the state.md
server-only validation row plus the http spine, the new test files, `npm run build:server`, and
`npm run ci:changed`.

STEP 4 - DOCS: update docs/discord-bot-stability/progress.md (Phase 5 QA complete, deferrals,
the mutation kill tally) and docs/discord-bot-stability/state.md (any newly found feed sites
added to the enumeration, plus any drift in the locked decisions or key file paths). Commit
with explicit paths and a body.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts of findings found
and fixed by severity, how many feed sites the independent sweep confirmed and how many it
added, the mutation kill tally (killed / survived, and what a survivor means), deferrals with
their reason, and a one-line handoff for Phase 6.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing phase
scope. Stop and surface if a missing feed site cannot be wired without a new hook or a new
query on a hot path (that is a design decision for the user, not a QA fix). Stop and surface if
a mutant SURVIVES and the test that should have killed it cannot be strengthened without
redesigning the Phase 5 implementation.
```
