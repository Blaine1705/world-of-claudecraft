# Phase 9 QA: /api/discord caching, and packet close

Two jobs in one session. First, adversarially verify the Phase 9 diff: a per-account cache is
a privacy surface, so a keying mistake here does not just serve stale data, it serves one
player's Discord identity to another. Second, close the packet: run the whole-feature matrix
in qa-checklist.md across all nine phases, run the full gate, file the follow-ups that were
deliberately deferred, surface the OPEN items that need a human, and offer teardown of this
planning directory.

Starter prompt for the session:

```
This is Phase 9 QA of the Discord Bot Stability packet: verify /api/discord caching, then
close the packet.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent before
it counts) plus mutation spot checks on the Phase 9 cache keying, TTL, and bust wiring.
Worktree: /Users/fernando/Documents/wocc-discord-bot.

STEP 0 - PRE-FLIGHT: git status clean (Phase 9 committed). Memory scan including the test-pin
trap index (READ IT before judging or writing any pin), cached-read-bust-inflight-joiner,
cachedread-captured-clock-vs-fake-timers, the cache-bust and memo-reset entries, and
full-npm-test-contention-flakes (the full gate run in STEP 5 goes through a Monitor with
bounded workers, never an ad-hoc chain).

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
progress.md, phase-09-api-discord-caching.md, and the Phase 9 diff (git diff against the
phase-start commit). It returns: the promised deliverables and acceptance criteria; every file
touched; the cache module's exported surface, its key, its TTL source and its bound; the
enumerated bust-site list Phase 9 recorded in state.md; and which tests cover which arm.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering; every finding independently confirmed
by a skeptic agent before it counts):
  - Correctness agent: every deliverable and acceptance criterion actually met. Specifically:
    is the cache key genuinely per-account everywhere it is read, with no path that can share
    an entry across accounts; is the enumerated bust list COMPLETE (re-derive it independently
    by finding every writer of every field in the payload, do not trust the recorded list);
    does each bust fire on the shared code path so both /api/discord arms are covered; is the
    TTL bounded and env-configurable; is the cache bounded with a real eviction path; does the
    presence block stay live per request; is the rate guard untouched; does a failed refresh
    stale-serve in a way that could outlive a moderation action (read the stale-serve arm in
    server/cached_read.ts before judging).
  - Test coverage agent (or test-coverage-auditor): are the assertions DECISIVE. The
    zero-query claim must assert a query COUNT, not a response body. Each bust test must drive
    the real write function, not call bust() directly. The cross-account test must actually
    populate two accounts with DIFFERENT payloads (identical fixtures make the assertion
    vacuous, the constant-self-comparison trap). The TTL test must use the injected clock.
    Check that no test passes only because the cache was cold.
  - Dead-code agent: unused imports and types, an exported cache method nobody calls, leftover
    pre-cache code paths, a config key added and never read.
  - Review Dispatch Matrix rows matching the diff: privacy-security-review (account-data
    privacy on a keyed cache) and database-performance-reviewer (query cadence on a hot read).
    Confirm no other row matches.
  - qa-checklist over the diff.
  - Mutation pass, in an ISOLATED worktree (never over the live checkout; a stash is shared
    across worktrees, so do not lean on one). Mutate, one at a time, and prove the suite kills
    each mutant:
      1. Key the cache by a constant so every account shares one entry (the cross-account
         isolation test MUST fail; if it does not, that test is vacuous and this is BLOCKING).
      2. Make the TTL effectively infinite, and separately make it zero.
      3. Delete one bust call site, then another; every enumerated site should have a test
         that fails.
      4. Replace bust() with a plain cache-entry delete that does not bump the epoch (the
         in-flight-joiner arm must fail).
      5. Remove the eviction bound so the keyed map grows forever.
      6. Serve the cached presence block instead of reading it fresh.
      7. Cache on only ONE of the two /api/discord arms.
    For every mutant, PROVE THE TESTS RAN (memory: mutation-harness-must-prove-tests-ran):
    capture runner output showing the test count and the failing assertion, never just a
    nonzero exit code. Record every survivor and the test that should have caught it.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Then
review the fix round itself with a FRESH eyes agent (the fixes are unreviewed code). Re-run the
validation matrix: npx tsc --noEmit; npx vitest run tests/server/internal.test.ts
tests/discord_server.test.ts tests/server/discord.test.ts tests/discord_db.test.ts plus the
Phase 9 cache tests; the http spine (tests/server/http/parity.test.ts, completeness.test.ts,
ownership_coverage.test.ts); npm run build:server; npm run ci:changed.

STEP 4 - DOCS: progress.md (Phase 9 QA complete, packet status), state.md (drift found, the
verified bust-site enumeration, anything the mutation pass taught).

STEP 5 - PACKET CLOSE (this is the final phase, so this step runs in full):
  a. Whole-feature matrix: work through EVERY row of docs/discord-bot-stability/qa-checklist.md
     against the full packet diff (git diff release/v0.33.0...HEAD), not just Phase 9. The
     first row is scope containment: prove no src/ path is in the diff. Each row gets a verdict
     backed by a command or a test, never an assertion. Fan out across rows in parallel; they
     are independent. Audit against the "Rulings settled during authoring" block in state.md
     as well as the D-numbers: every ruling (R1 onward) either landed as written across the
     nine phases, or carries a recorded and justified deviation. Read that block BEFORE
     raising anything, and check it again before writing a finding up: an apparent gap that a
     ruling already settles is not a finding, it is a ruling you had not read.
  b. Full gate: npm run gate in the worktree. It is exit-code-safe, so run it directly and read
     its exit code; never pipe it through tail and never substitute an ad-hoc && chain. Run it
     through a Monitor (memory: full-npm-test-contention-flakes) and expect it to include
     build:bot, which Phase 1 added. Green is required to call the packet done.
  c. Follow-up issues: brainstorm.md ends with a list of work deliberately left out of scope.
     ASK THE USER FIRST, then file the ones they approve with the file-issue skill, in the
     maintainer's house format: (1) the two-way chat relay from Discord into the world, with
     its moderation, sanitization and i18n surface; (2) /api/site-presence write cadence; (3)
     retiring the now-unused per-endpoint internal GET routes (relay, activity, winners) once
     the frozen legacy ladder deletion lands (D11). Do NOT file the fourth item, retiring the
     legacy handleDiscordInternal ladder itself: brainstorm.md assigns it to the pipeline
     packet, not this one. Report the issue numbers in the final response.
  d. Surface the OPEN items that need a human, verbatim and unresolved: O4, confirm the
     GUILD_MEMBERS and GUILD_PRESENCES privileged intents stay enabled in the Discord Developer
     Portal under the 2026-06-10 policy (self-serve under 10,000 users); and O5, whether
     member-write 429s return user or shared scope, which decides ban-counter exposure and
     resolves from production logs after the first deploy. Neither is a blocker and neither is
     yours to decide.
  e. Teardown offer, exactly per docs/discord-bot-stability/README.md: offer to delete the
     planning directory before the PR. Delete it ONLY on explicit user confirmation, and only
     with an explicit path: git rm -r docs/discord-bot-stability. Never git add -A, and never
     delete anything else. If the user does not confirm, leave the directory in place and say
     so.
  f. Do not push the branch, open a PR, or merge anything unless the user explicitly asks.
     Report what a PR would contain instead.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL) for Phase 9 AND for the
packet; counts found and fixed by severity; mutation kill tally (killed over attempted, with
any survivor named and its fix); the qa-checklist.md matrix results row by row; the gate
result; issue numbers filed; O4 and O5 surfaced for the user; teardown status; and anything
deferred, with a one-line statement of what remains before this packet can ship.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing phase
scope. Stop and surface if a whole-feature matrix row fails for a reason that belongs to an
EARLIER phase: report it with the phase number rather than expanding this session into a
re-implementation. Stop and surface if the mutation pass cannot prove the tests ran. Do not
run the mutation pass over the live worktree, do not delete the planning directory without
explicit confirmation, and do not file an issue the user has not approved.
```
