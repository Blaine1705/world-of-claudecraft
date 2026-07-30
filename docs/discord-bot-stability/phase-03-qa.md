# Phase 3 QA: Loop scheduler + diff-before-write

Phase 3 rewrote how every bot loop is driven and made two write paths conditional, which is the
change most likely to be subtly wrong in a way tests wave through: a skip condition that skips
the wrong case, a cache updated before the write it is supposed to record, or an echo suppression
that also suppresses a real update. This session verifies the migration preserved behavior beyond
cadence, that a steady state genuinely writes nothing, and it mutation-checks bot/scheduler.ts
and the nickname and members-meta diff logic.

## Starter prompt

```
This is Phase 3 QA of the Discord Bot Stability packet: verify the loop scheduler and
diff-before-write.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent before it
counts) plus mutation spot checks on bot/scheduler.ts and the nickname and members-meta diff
logic. Judge every refutation yourself rather than taking it on faith, and require the skeptic to
have the file open before a refutation counts.
Worktree: /Users/fernando/Documents/wocc-discord-bot.

STEP 0 - PRE-FLIGHT: run `git status` and confirm it is clean with Phase 3 committed; another
session may share this checkout, so ASK before touching anything you did not create. Memory scan
including the test-pin trap index (READ IT before judging or writing any pin), plus
mutation-harness-must-prove-tests-ran, mutation-test-uncommitted-revert-trap, the clock and timer
traps (cachedread-captured-clock-vs-fake-timers, settimeout-fractional-delay-fires-early), and
the worktree/node_modules entries (worktree-symlink-vitest-limitation,
stale-node-modules-fullsuite-failure-set) since the mutation pass needs a second worktree that
can actually run vitest.

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-03-scheduler-and-diffs.md, and the Phase 3 diff (find the
phase-start commit from the branch log, the commit immediately before the first Phase 3 commit,
and diff it against HEAD). It returns: the promised deliverables and acceptance criteria, the
files touched with a one-line summary of each change, a before-and-after table of the six loops
plus the presence debounce (what drove each before, what drives it now, at what cadence, under
which config key), and where the nick cache and the last-pushed meta cache live and who writes
them.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering: report every gap with confidence and
severity, do not pre-filter):
  - Correctness agent, migration: did every one of the six loops survive with the same function,
    the same ordering (including the refreshSpecialRoles then pushAllMemberMeta pairing), and the
    same failure handling? Is any loop now silently unscheduled, double-scheduled, or scheduled
    off a different trigger? Do the GUILD_CREATE kicks coalesce rather than multiply, given that
    GUILD_CREATE fires on every re-IDENTIFY? Are timers still unref'd so the process can exit? Is
    `setInterval` really gone from bot/main.ts (the gateway heartbeat is out of scope and stays)?
    Do the env-configurable intervals still default to 300000, 4000, and 3000, with an
    empty-or-non-numeric value falling back to the default rather than to 0?
  - Correctness agent, diffs: does the nickname skip fire on equality and only on equality, and
    is the cache updated ONLY after a successful PATCH (the computeRoleSync pattern)? Is the nick
    cache fed from every source that can change a nick (GUILD_CREATE seeding, member chunks,
    GUILD_MEMBER_ADD, GUILD_MEMBER_UPDATE), and is it reading the live nick rather than a display
    name that falls back to global_name or username? Does the members-meta diff compare against
    the last SUCCESSFULLY pushed record? Do the clearing paths (GUILD_MEMBER_REMOVE,
    clearDepartedFlair) still push, and is a departed member's cache entry dropped so a rejoin
    re-pushes? Does echo suppression suppress only the bot's own writes, never a genuine
    third-party change? Check the D-invariants: D5 (diff-before-write universal), D6 explicitly
    NOT started here (the sweep's iteration set must be unchanged), D7 (no new dependency), D8
    (pure cores plus wiring only in main.ts), no src/ or server/ edit, no em dash, en dash, or
    emoji in the diff.
  - Test coverage agent: are the arms decisive? Overlap (a run longer than its interval never
    starts a second concurrent run), backoff in both directions (walks to idle, snaps back on
    work), coalescing (N kicks during a run produce exactly one follow-up), jitter band, the
    nick-diff no-op / changed / failure-leaves-cache-untouched arms, the meta-diff arms, the
    echo-suppression arm plus its negative twin (a real third-party update still pushes), and a
    steady-state assertion of ZERO writes at the D18 envelope. Flag any timing test whose clock
    cannot actually advance, any arm asserting a call count where it should assert cache state,
    and any pin that re-reads the value it claims to pin.
  - Dead-code agent: the deleted setIntervals leaving no orphaned constants, helpers, or imports;
    unused exports on the scheduler; superseded comments in bot/main.ts and bot/CLAUDE.md that
    now describe a cadence mechanism that no longer exists.
  - Review Dispatch Matrix rows matching the diff, per implementation-plan.md: a bot-only diff
    matches no row, so `qa-checklist` is the reviewer set. If a row for server/, src/, or a
    deploy file matches, that itself is a finding: the phase went out of scope.
  Mutation pass in an ISOLATED worktree created from the Phase 3 HEAD commit (never check out
  over uncommitted work), each mutant applied one at a time:
    - bot/scheduler.ts: remove the overlap guard so a slow run can stack; flip the backoff
      direction (idle to active instead of active to idle); drop coalescing so each kick queues
      its own run; coalesce too aggressively so a kick during a run is dropped entirely; shift the
      next-delay boundary by one tick; widen or zero the jitter band; schedule the next run before
      the previous one settles.
    - Nickname diff: invert the skip condition (write when equal, skip when different); move the
      cache update BEFORE the awaited PATCH so a failed write is masked; update the cache even in
      the catch path.
    - members-meta diff: compare against the freshly built record instead of the last pushed one;
      remove echo suppression entirely; over-suppress so a genuine third-party update is dropped;
      skip the clearing push for a departed member.
    Each mutant must be killed by a NAMED test. Prove the suite actually ran for every mutant:
    record the vitest summary line (files, tests, passed, failed) and confirm a nonzero failure
    count, since a config or path mistake that runs zero tests looks like a pass.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Then
review the fix round itself with a fresh-eyes agent, because the fixes are unreviewed code. Then
re-run the state.md bot-only validation row: `npx tsc --noEmit`,
`npx vitest run tests/discord_bot.test.ts` plus every bot test file, `npm run build:bot`,
`npm run ci:changed`, and `npm run gate` at close. Commit with explicit paths, a scoped
Conventional Commit subject, and a body; no `git add -A`.

STEP 4 - DOCS: update docs/discord-bot-stability/progress.md (Phase 3 QA row complete, plus
deferrals under the per-phase notes) and docs/discord-bot-stability/state.md (drift the audit
found, the final interval env key names and defaults, and any new implementer gotcha, especially
around the GUILD_CREATE coalescing trap). If bot/CLAUDE.md's "Poll loops" section still describes
the old bare-interval world, fix it here. Record genuinely reusable traps to memory as one file
per fact plus its MEMORY.md pointer line.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts found and fixed by
severity, the mutation kill tally (mutants planted, killed, survived, with the survivor
explained), deferrals with reasons, and a one-line handoff for the Phase 4 session.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing Phase 3's
scope (for example a diff that can only be made correct once the Phase 5 change feed exists, or a
sweep-iteration problem that is Phase 6's D6 work). Stop if a surviving mutant can only be killed
by changing behavior rather than by adding a test, and report it as a finding instead of changing
behavior here. Stop if the mutation worktree cannot run the suite, rather than reporting an
unproven kill.
```
