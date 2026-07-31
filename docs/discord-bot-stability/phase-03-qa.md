# Phase 3 QA: Loop scheduler + diff-before-write

Phase 3 rewrote how every bot loop is driven and made two write paths conditional, which is the
change most likely to be subtly wrong in a way tests wave through: a skip condition that skips
the wrong case, a cache updated before the write it is supposed to record, or an echo suppression
that also suppresses a real update. This session verifies the migration preserved behavior beyond
cadence, that a steady state genuinely writes nothing, and it mutation-checks `bot/scheduler.ts`
and `bot/member_writes.ts`.

The build session already ran a review round (`qa-checklist` plus `test-coverage-auditor`) and two
mutation rounds, and applied every finding. So this session's value is NOT re-running that pass:
it is finding what a reviewer who already knew the intended design would not think to question.
The residual-scope list in the prompt below exists to keep agents off ground that is already
verified.

## Starter prompt

```
This is Phase 3 QA of the Discord Bot Stability packet: verify the loop scheduler and
diff-before-write.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes (D19), run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic before it counts)
plus mutation spot checks. Judge every refutation yourself rather than taking it on faith, and
require the skeptic to have the file open before a refutation counts.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).

STEP 0 - PRE-FLIGHT.
  - `git status` must be clean with Phase 3 and its review round committed (11 commits,
    8041c84f7 through 4540feefe). Another session shares this checkout: a foreign worktree is
    registered under `.worktrees/fix-play-map-level-toggle`. LEAVE IT ALONE and ASK before
    touching anything you did not create.
  - SYNC THE RELEASE BASE FIRST (standing rule 1). Phase 3 merged `origin/release/v0.33.0` at
    c5e004d8d (110 commits, 3149 files, zero conflicts), so the base was current as of
    2026-07-31. MEASURE rather than trust that: `git fetch origin release/v0.33.0`, then
    `git rev-list --left-right --count HEAD...origin/release/v0.33.0` against the FRESHLY fetched
    tip. If it moved, merge BEFORE any QA work, run the `release-merge-audit` skill, and record
    the sync in progress.md either way.
  - `npm ci` if node_modules is stale. `node -v` should be v26.5.0.

MEMORY SCAN. Read these, which EXIST: unkillable-mutant-diagnosis (THE one for this session: a
surviving mutant is dead code, an unobservable rig, or a real gap, and demanding a test for the
first two is wrong), mutation-checks-commit-first, frozen-clock-rig-hangs-vitest,
vacuous-bound-pin-trap, round-trip-pins-reference-aliasing, worktree-cwd-drift-misroutes-git,
big-diff-reviewer-turn-budgets, fanout-agent-delivery-traps, background-task-notifications-unreliable,
node25-breaks-jsdom-gate, dotenv-files-harness-blocked.
Do NOT go looking for these: cachedread-captured-clock-vs-fake-timers,
settimeout-fractional-delay-fires-early, mutation-harness-must-prove-tests-ran,
mutation-test-uncommitted-revert-trap, worktree-symlink-vitest-limitation,
stale-node-modules-fullsuite-failure-set, or a "test-pin trap index". An earlier draft of THIS
file cited all seven by name and NONE of them exists in the memory store (verified 2026-07-31).
The underlying rules are real and are written down in state.md "Known gotchas for implementers".
If you find yourself citing a memory entry, confirm the file exists first.

MUTATION METHOD, settled by Phase 3 and not to be re-litigated: mutate IN PLACE in this
checkout, never in a second worktree. Commit first (everything is committed, so `git checkout --
<file>` is a provably safe restore), then per mutant: plant with a python/sed edit, run the
NAMED suite expecting red, restore with checkout, re-run green. Two reasons a worktree is wrong
here: a checkout under the repo root makes `scripts/malware_scan.mjs` walk it and reds the gate
with hundreds of `rce-obfuscation` findings that look like yours, and the cwd of one `cd` into a
worktree silently misroutes every later `git` write. Give the harness a PER-RUN timeout that
scores a HANG as a kill: a zero-delay scheduler mutant starves the macrotask queue, so the run
wedges instead of going red and vitest's own testTimeout never fires. Prove the suite ran for
every mutant by recording its summary line and a NONZERO failure count.

WHAT PHASE 3 SHIPPED (read the code, not this summary, but start here):
  - `bot/scheduler.ts`, a pure decision core (overlap guard, coalescing, active-to-idle backoff,
    jitter band) plus a thin driver that owns the one timer. Chained timeouts, never setInterval.
    Two modes: `repeating` (poll loops, kick runs at once) and `debounce` (the presence push, kick
    opens one window). Timers unref'd. Time and the random source injected.
  - `bot/member_writes.ts`, the diff-before-write paths with their cache bookkeeping behind
    injected IO, plus `forgetMember`, `decideMemberUpdate`, `displayNameOf`, `nickOf`. It exists
    as a sibling module because `main.ts` calls `main()` at module scope, so nothing in it is
    reachable from a test (ledger L8).
  - Three pure predicates in `bot/logic.ts`: `nicknameNeedsWrite`, `memberMetaChanged` (plus
    `changedMemberMeta`), `isSelfNickEcho`, and the named `MemberMetaRecord`.
  - SEVEN scheduler tasks in `bot/main.ts`, not six: role-sync, tier-roles, relay, activity,
    daily-rewards-winners, special-roles-and-meta, presence-push.
  - Three D13 env keys in `bot/config.ts`: DISCORD_ROLE_SYNC_INTERVAL_MS (300000),
    DISCORD_PRESENCE_DEBOUNCE_MS (4000), DISCORD_RELAY_POLL_MS (3000), defaulting to the
    bot/cadence.ts constants so the pinned value and the fallback cannot drift.
  - Ledger: L7 CLOSED (dead gateway session dropped), L12 CLOSED (queue map LRU bounded), L11
    found ALREADY closed by Phase 2 QA's dispatch loop and pinned rather than assumed, L13 opened
    (a permanently rejected nickname PATCH retries forever; routed to Phase 7).

RESIDUAL SCOPE, already verified: do not spend agents re-deriving these.
  - 32 mutants across two rounds, all resolved. Round 1 (15) covered the overlap guard,
    coalescing, the backoff in both directions, jitter, the nickname skip and its cache-on-failure
    arm, the meta diff, and echo suppression including over-suppression. Round 2 (17) covered the
    idle kick, double start, the debounce window, both nextIntervalMs clamps, the jitter ceiling,
    the throwing error sink, undefined push results, forgetMember, the drained-queue identity
    guard, the bucket-window slot re-reservation, the silent-drop return, and three main.ts
    wiring mutants.
  - `grep setInterval bot/main.ts` is empty and guarded by tests/discord_bot_main_wiring.test.ts,
    which also pins the seven registrations against their config fields and the startAll-before-
    connect ordering.
  - D6 confirmed NOT started: syncAllOnlineRoles still iterates onlineUsers, pushAllMemberMeta
    still builds from memberRoles.keys(). D7 confirmed: zero dependency changes. No src/ or
    server/ file is touched by the phase.

WHERE TO AIM INSTEAD, because a reviewer who knew the design would not question these:
  a. The THREE recorded behavior deviations. Each is defended in progress.md; your job is to
     decide whether the defense holds, not to rediscover them. (1) The GUILD_CREATE and op 8
     backfill kicks now also run refreshSpecialRoles, because the refresh-then-push pairing had to
     stay one task. (2) The debounce follow-up window opens at run SETTLE where the presenceTimer
     armed from EVENT time. (3) The roster push STOPS at the first refused batch instead of
     attempting the rest. Ask specifically: can any of them starve a member under sustained load?
  b. The interaction between the diff caches and RESTART. Every cache is in-memory, so a bot
     restart re-pushes everything, and a long-lived process never re-pushes an unchanged member.
     Is there a state the server can reach where its stored meta disagrees with the bot's
     lastPushedMeta and nothing ever reconciles? The build session closed the over-cap silent-drop
     path; look for others (a server-side restore, a failed row inside a partially applied batch,
     a members-meta row deleted by moderation).
  c. Ordering under a reconnect storm specifically, since that is the incident: GUILD_CREATE
     arrives, kicks role-sync and special-roles-and-meta, and both may already be running from the
     previous connect. Trace what a second and third GUILD_CREATE 200 ms apart actually produce,
     against the real code, and confirm the answer is one follow-up per task and not one per event.
  d. The scheduler's behavior when a task's run never settles at all (a fetch with no deadline,
     which ledger L10 records as open until Phase 7). A chained timeout arms nothing while a run
     is in flight, so a hung run silently stops that loop forever with no counter and no log. Is
     that acceptable, or does it need a watchdog? Decide and record.
  e. Whether `MIN_INTERVAL_MS` (1000) and `MAX_JITTER_RATIO` (0.5) are the right values, not just
     correctly applied. Both were added during the review round and neither has an operator story.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn ONE Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md (the Phase 3 section
is the real briefing), docs/discord-bot-stability/phase-03-scheduler-and-diffs.md, and the Phase 3
diff (`git diff c5e004d8d..HEAD`, 20 files). Give it a hard 30-tool-call budget and a report-first
line; if it idles without reporting, NUDGE it once rather than respawning (Phase 3's Explore agent
never delivered and had to be superseded by reading directly, so budget for that).
It returns, as conclusions rather than file dumps: the promised acceptance criteria and whether
each is met; a before-and-after table of the seven tasks (what drove each before, what drives it
now, at what cadence, under which config key); and where each cache lives and who writes it.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering: report every gap with confidence and
severity, do not pre-filter). Give EVERY agent a hard 30-tool-call budget, a report-first line,
and the residual-scope list above, or they will re-plow verified ground and die at the turn limit
with nothing written.
  - Correctness agent, migration: the five aim points above, plus whether any loop is now silently
    unscheduled, double-scheduled, or driven off a different trigger.
  - Correctness agent, diffs: does the nickname skip fire on equality and ONLY on equality? Is the
    nick cache fed from every source that can change a nick (GUILD_CREATE seeding, member chunks,
    GUILD_MEMBER_ADD, GUILD_MEMBER_UPDATE, and the bot's own successful PATCH)? Does echo
    suppression suppress only the bot's own writes? Do the clearing paths still push?
  - Test coverage agent: decisiveness of the arms, with the trap list from state.md in hand.
  - Dead-code agent: orphaned constants, helpers or imports left by the deleted setIntervals;
    unused scheduler exports; comments in bot/main.ts and bot/CLAUDE.md that describe a mechanism
    that no longer exists.
  - Reviewer set per the Review Dispatch Matrix: a bot-only diff matches no row, so `qa-checklist`
    is it, plus `test-coverage-auditor` because the phase added a large body of tests. A row
    matching server/, src/, or a deploy file is itself a finding: the phase went out of scope.
  Mutation targets beyond the 32 already killed: the debounce mode's window arithmetic, the
  generation counter that makes stop() reach inside a run, `pushRejected`'s two arms, the
  `forgetMember` call sites, and `resolveCadence`'s fallbacks. For each survivor apply the
  three-way diagnosis (dead code / unobservable rig / real gap) before writing a test.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing rule 3). If a finding
is genuinely not a defect, say so and why; do not silently drop it. Then review the fix round
itself with a FRESH-eyes agent, because the fixes are unreviewed code, and mutation-check any test
it adds. Re-run the state.md bot-only row: `npx tsc --noEmit`, `npx vitest run` over every
tests/discord_bot_*.test.ts file, `npm run build:bot`, `npm run ci:changed` (scoped
`--write` for fixes, never whole-repo). At close run `npm run gate`.

KNOWN GATE FAILURE, exactly ONE, do not chase it and do not report it as a regression:
`tests/malware_scan.test.ts` and the gate's malware step fail while a sibling session has a
worktree parked under `.worktrees/`, because the scanner walks the whole tree and counts every
child_process import in it. Diagnose by running the scanner in a clean detached worktree of HEAD
created OUTSIDE the repo root (it passed there on 2026-07-31: 4531 files, 0 high), and remove
your own worktree before gating. The gate aborts at that step BEFORE tsc and the builds, so run
those by hand. NOTE: `tests/texture_upload.test.ts` is NO LONGER a known failure. The v0.33.0
merge cleared it and it was re-verified green on the post-merge tree, so treat a red there as a
real regression.

STEP 4 - DOCS: update docs/discord-bot-stability/progress.md (the Phase 3 QA row plus deferrals
under the per-phase notes) and docs/discord-bot-stability/state.md (drift the audit found, any new
implementer gotcha, and the resolution of the three recorded deviations). Record genuinely
reusable traps to memory as one file per fact plus its MEMORY.md pointer line, and VERIFY the file
exists after writing it. Commit with explicit paths and a body; never `git add -A`.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts found and fixed by
severity, the mutation tally (planted, killed, survived, each survivor diagnosed), the rulings on
the three recorded deviations, deferrals with reasons, and a one-line handoff for the Phase 4
session.

STOPPING RULES:
  - Stop and surface if a BLOCKING item cannot be fixed without changing Phase 3's scope (a diff
    that can only be correct once the Phase 5 change feed exists, or a sweep-iteration problem
    that is Phase 6's D6 work).
  - Stop if a surviving mutant can only be killed by changing BEHAVIOR rather than by adding a
    test or deleting dead code, and report it as a finding instead of changing behavior here.
  - Stop if closing something would mean rewriting the governor's dispatch loop rather than
    extending it.
  - Stop if the worktree is dirty with work that is not yours.
```

## Open item carried into this session

The three D13 env keys are NOT in `.env.example`. Every `.env*` path is denied at the HARNESS
level in this environment (both Read and Bash, and `.claude/settings.json` has empty permissions),
so the build session could not add them and the maintainer was asked to paste them. Ruling R8
required exactly this for Phase 2's four governor keys, so the obligation stands. Check whether
they landed; if not, re-surface it rather than working around it. The values are the real
defaults, not placeholders: an operator who uncomments a wrong number gets the storm this packet
exists to prevent.
