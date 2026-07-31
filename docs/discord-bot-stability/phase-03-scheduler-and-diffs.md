# Phase 3: Loop scheduler + diff-before-write

Two of the incident's root causes live in `bot/main.ts`. Six bare `setInterval` loops
(`bot/main.ts:518-537`) fire whether or not the previous run finished, so once backoff stretches
a sweep past its 5 minute period the sweeps stack, which is what turns a burst into a sustained
storm that survives restarts. And the nickname PATCH (`bot/main.ts:241-247`) is unconditional
where the role sync right above it correctly diffs first, so every linked online member is
written every sweep forever, and each write makes Discord emit `GUILD_MEMBER_UPDATE`, whose
handler POSTs members-meta straight back into the game (about 63 per minute of load the bot
generates against itself). This phase adds the pure scheduler that makes overlap and reconnect
storms impossible, and the diffs that make a steady-state sweep write nothing at all.

## Starter prompt

```
This is Phase 3 of the Discord Bot Stability packet: Loop scheduler + diff-before-write.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).
No Workflow needed for the build: two independent module slices plus one serial wiring stage. Use
a 2-agent fan-out in STEP 2 stage 1 and keep the bot/main.ts migration in the main loop. (D19's
ultracode requirement is on the QA session, not on this build.)

Goal: replace the six bare interval loops with one pure scheduler that cannot overlap or storm,
and make every nickname and members-meta write conditional on an actual change.

STEP 0 - PRE-FLIGHT.
  - `git status` must be clean with Phase 2 and its QA committed. Another session shares this
    checkout, so ASK before touching anything you did not create. Phase 2 QA found a foreign
    worktree registered under `.worktrees/` by a sibling session; leave any such directory alone.
  - SYNC THE RELEASE BASE FIRST (standing rule 1 in state.md). At the end of Phase 2 QA this
    branch was 1 BEHIND: `94142c58ff perf(render): draw-call diet for props, shadows, and world
    batches (#2460)`, 59 files, all src/render plus tests. Run `git fetch origin
    release/v0.33.0`, then `git rev-list --left-right --count HEAD...origin/release/v0.33.0`
    against the FRESHLY fetched tip, merge if behind, then run the `release-merge-audit` skill
    and re-run the gate (a gate that was green before a merge says nothing about the merged
    result). Record the sync in progress.md either way, "no-op" included.
  - Run `npm ci` in this worktree if node_modules is stale. `node -v` should be v26.5.0.

MEMORY SCAN. Read these, which EXIST: frozen-clock-rig-hangs-vitest (THE one for this phase: an
injected clock whose sleep does not advance now() hangs the process instead of failing),
vacuous-bound-pin-trap, mutation-checks-commit-first, worktree-cwd-drift-misroutes-git,
big-diff-reviewer-turn-budgets, fanout-agent-delivery-traps, node25-breaks-jsdom-gate,
dotenv-files-harness-blocked, background-task-notifications-unreliable.
Do NOT go looking for these: cachedread-captured-clock-vs-fake-timers,
settimeout-fractional-delay-fires-early, env-empty-numeric-default-shift. Earlier drafts of THIS
file cited all three by name and none of them exists in the memory store. The underlying rules
are real and are written down in state.md "Known gotchas for implementers"; read them there. If
you find yourself citing a memory entry, confirm the file exists first.

CLOCKS: use tests/helpers/synthetic_clock.ts, the fully VIRTUAL clock Phase 2 shipped. Vitest
fake timers are ruled out for this packet and state.md says to reuse the synthetic clock for
this scheduler. Two reasons, both load bearing: a clock captured at construction does not move
under fake timers, so a suite built on them passes for an implementation that quietly reads the
wall clock; and a fractional delay is allowed to fire EARLY, which makes every boundary
assertion a coin flip. Third reason, learned the hard way in Phase 2 QA: any rig whose `sleep`
does not ADVANCE `now()` makes a gate loop spin on an immediately-resolved promise, which
starves the macrotask queue so vitest's own testTimeout never fires and the RUN HANGS rather
than going red. The synthetic clock has none of these by construction.

WHAT PHASE 2 LEFT YOU (read the governor's public surface, do not re-implement pacing):
  - `bot/rate_governor.ts` owns ALL Discord REST pacing. The scheduler decides WHEN a task runs;
    the governor decides when a request goes out. They must not overlap.
  - Rate state is keyed by the bucket hash PAIRED WITH the major parameter (`majorParameterOf`).
    Discord's X-RateLimit-Bucket is non-inclusive of the top-level resource, so the bare hash
    merges two channels into one bucket. Phase 2 QA found that as a blocking defect; do not
    "simplify" it back.
  - The dispatch gates are a LOOP, not an ordered sequence, and `waitForBucket` plus the pre-send
    `isGated` check both read ONE predicate (`bucketBlockedUntil`) so they cannot disagree.
    Writing that condition twice is what made the loop spin hot and hang.
  - `governorFromConfig(config, clock?, log?)` in bot/discord_api.ts is the ONE construction site
    for a production governor; bot/main.ts calls it. Add scheduler config the same way, with
    trailing seams carrying production defaults, so the mapping is pinnable (main.ts calls
    `main()` at module scope, so nothing in it is reachable from a test).
  - Counters Phase 8 consumes are FOURTEEN fields; read `GovernorCounters`, not a prose summary.

TWO ITEMS PHASE 2 QA ROUTED TO THIS PHASE. Both are recorded in state.md; close them here or say
why not:
  - L11: a request that reserved a global rate slot BEFORE a pause was declared does not
    re-reserve one when the pause lifts, so several fire at the same instant. Phase 2 QA left it
    because the correct fix is a gate loop that re-reserves after any blocking wait, which is
    scheduler-shaped rather than governor-shaped.
  - L12: `this.queues` is the one governor map with no size cap. A request parked in
    `waitForPause` never reaches the job's finally that drops a drained queue, and interaction
    callbacks mint a unique template per interaction id, so during a long ban pause the map, its
    pending sleeps, and `queueDepth` all grow with however many slash commands arrive.
    `activeQueues` makes it observable.
  - JUDGE, do not silently inherit: L7 (a non-resumable INVALID_SESSION never clears
    `this.sessionId` in bot/gateway.ts, so the bot RESUMEs a session Discord just killed) is
    recorded with "natural home is Phase 3 or Phase 7". Reconnect coalescing is this phase's
    subject matter, so decide it here and record the decision.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn one Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md (the Phase 2 and
Phase 2 QA notes are the real briefing), docs/discord-bot-stability/phase-03-scheduler-and-diffs.md,
and these source files: bot/main.ts, bot/logic.ts, bot/cadence.ts, bot/config.ts,
bot/discord_api.ts, bot/server_client.ts, bot/gateway.ts, bot/rate_governor.ts, bot/CLAUDE.md,
the root CLAUDE.md, tests/discord_bot.test.ts plus every tests/discord_bot_* file,
tests/helpers/synthetic_clock.ts, scripts/build_bot.mjs, scripts/gate.mjs, and tsconfig.json.
Give it a hard 30-tool-call budget and a report-first line; if it idles without reporting, nudge
it once rather than respawning.
It returns, as conclusions rather than file dumps:
  a. each bare interval loop in `main()` (grep `setInterval` in bot/main.ts; there are six, near
     the end of main): what it calls, at what cadence, what it does on failure, and every OTHER
     place that same function is invoked (GUILD_CREATE and the member-chunk completion both kick
     some of them);
  b. `schedulePresencePush` and its exact timing semantics, including the presenceTimer guard;
  c. the nickname write path inside `syncRolesFor` (the `cfg.syncNicknames && flex.character`
     block that calls `buildLevelNick` then `discord.setNickname`) and which caches hold a
     member's live nick versus their display name, including what `displayNameOf` falls back to;
  d. the members-meta push paths (single member, full roster, and the clearing paths on
     GUILD_MEMBER_REMOVE and in `clearDepartedFlair`), with the byte-batching contract;
  e. the `computeRoleSync` update-cache-only-after-success pattern as the exemplar to copy;
  f. the governor's public surface, so the scheduler composes with it.

STEP 2 - EXECUTE.

Stage 1 (two parallel agents, disjoint files, neither touching bot/main.ts):
  - Agent A, bot/scheduler.ts plus its tests. A pure core with a thin driver (D8): the decision
    logic (next delay, may-this-run-start, coalesce state, backoff state) is IO-free and takes an
    injected clock; the driver owns the actual timer and is the only part that touches one.
    Deliver:
      * Chained timeouts, never setInterval: the next run is scheduled only after the previous
        run settles, so a slow run cannot stack. Keep an explicit in-flight guard for
        event-triggered kicks as well.
      * Jitter, so several loops do not align on the same tick. The Rng rule in the root
        CLAUDE.md is scoped to src/sim, so Math.random is an acceptable production default here,
        but the source must be injectable so tests are deterministic.
      * Adaptive idle backoff: a task reports whether it did work, and the cadence walks from its
        active interval toward its idle interval and snaps back to active on work. D1's shape for
        the outbox is 3 seconds active decaying to 15 seconds idle; this phase ships the
        mechanism only, the outbox task itself is Phase 6.
      * Coalescing for event-triggered runs: repeated kicks while a run is in flight collapse
        into exactly ONE follow-up run. This is the GUILD_CREATE trap: GUILD_CREATE fires on
        every re-IDENTIFY, so a reconnect storm must not multiply sweeps.
      * Env-configurable intervals (D13) whose defaults are today's values from bot/cadence.ts:
        ROLE_SYNC_INTERVAL_MS 300000, PRESENCE_DEBOUNCE_MS 4000, RELAY_POLL_MS 3000. Key names go
        in bot/config.ts next to the Phase 2 keys, reusing `positiveNumberFromEnv`, which already
        handles the trap: `Number("")` is 0, so a blank line in a .env must fall back to the
        default rather than to a hard 0. Read the VALUE, never a second dynamic `process.env[...]`
        lookup: tests/discord_bot_config.test.ts asserts exactly one and pins the whole key set,
        so a new key also goes in its BOT_ENV_KEYS list.
      * Timers stay unref'd, as today's loops are, so the process can still exit.
  - Agent B, the pure diff cores in bot/logic.ts plus their tests: the nickname decision (given
    the computed nick and the cached live nick, write or skip), the members-meta delta decision
    (given a freshly built record and the last successfully pushed record, push or skip), and the
    self-echo predicate (given an incoming GUILD_MEMBER_UPDATE and what the bot just wrote, is
    this our own echo). Pure functions only, no IO, no caches owned here beyond what a caller
    passes in.

Stage 2 (serial, in the main loop, after both agents land): the bot/main.ts wiring, which is the
only place wiring belongs (D8).
  - Migrate all six loops and the presence debounce onto the scheduler, and delete the bare
    setIntervals. Preserve exactly which function runs and what it does; only the cadence
    mechanism changes. The refreshSpecialRoles-then-pushAllMemberMeta pairing keeps its ordering.
  - The GUILD_CREATE handler's immediate syncAllOnlineRoles and pushAllMemberMeta kicks become
    coalescing kicks on the scheduler rather than bare fire-and-forget calls.
  - Wire the nickname diff: cache the member's live nick from GUILD_CREATE seeding,
    GUILD_MEMBERS_CHUNK, GUILD_MEMBER_ADD, and GUILD_MEMBER_UPDATE, skip the PATCH when the
    computed nick equals the cached one (D5), and update the cache ONLY after a successful PATCH,
    following the computeRoleSync pattern so a failed write retries next sweep instead of being
    masked. Note from the Explore step whether the existing memberNames cache is the right source
    or whether the live nick needs tracking separately, since displayNameOf falls back to
    global_name and username.
  - Wire the members-meta diff: track the last SUCCESSFULLY pushed record per member, push only
    changed members, and keep the existing byte-batching for whatever remains. Suppress
    self-caused GUILD_MEMBER_UPDATE echoes by comparing the incoming state to what the bot just
    wrote (D5). The clearing paths must still push: a cleared record IS a change, and a departed
    member's cache entry must be dropped so a rejoin re-pushes.

Stage 3 (serial): the wiring-level tests, all on the synthetic clock. Scheduler suites (overlap,
backoff, coalescing, jitter band), the nick-diff arms (no-op, changed, failure leaves the cache
untouched), the meta-diff arms, and the echo-suppression arms.

TEST DISCIPLINE, from what Phase 2 QA actually found (these are not style notes; each one is a
defect that shipped green):
  - A bound test that never reaches the bound is vacuous. `expect(size).toBeLessThanOrEqual(CAP)`
    against a population far under CAP passes with the eviction deleted. Reach the cap and assert
    `toBe(CAP)`, and pin WHICH entries survived.
  - Pin a constant against a LITERAL, never against itself. Driving the clock BY a constant and
    asserting AGAINST it is a self-comparison: every scheduler interval needs one
    `expect(INTERVAL_MS).toBe(300_000)`-style line, or changing it keeps the suite green.
  - Assert exact virtual times, not orderings or lower bounds. `>= 2000` also passes for a
    governor that waited ten minutes.
  - A fixture equal to the implementation's own fallback default cannot fail.
  - `rejects.toThrow(string)` is a SUBSTRING match; pass an Error for equality.
  - Ids built as `1000000000000000000 + i` exceed Number.MAX_SAFE_INTEGER, so a loop collapses
    onto a few values and a registry-bound test passes with the bound deleted. Build them by
    string concatenation.
  - State that only exists mid-flight (a run in flight, a non-zero queue depth) is unobservable
    after a helper that drains the whole virtual clock; hold it open with a deferred you resolve
    by hand.

INVARIANTS IN PLAY (from state.md):
  - D1, the adaptive cadence shape (active decaying to idle) is the scheduler's job; the
    consolidated outbox poll that uses it arrives in Phase 6.
  - D5, diff-before-write is universal: a nickname PATCH only when the computed nick differs from
    the cached member nick, members-meta pushed only for members whose meta changed since the
    last successful push, and self-caused GUILD_MEMBER_UPDATE echoes suppressed.
  - D6 is NOT this phase: the sweep still iterates the set it iterates today. Changing the
    iteration set to linked members only is Phase 6.
  - D7, zero new npm dependencies: no scheduler or timer package.
  - D8, the pure/IO split: scheduler and diff cores are pure modules with Vitest coverage, and
    bot/main.ts holds wiring only.
  - D13, intervals are env-configurable with today's values as defaults; DEPLOY.md documentation
    of the keys lands in Phase 7, so record the names in state.md now.
  - D19, the QA session mutation-tests the scheduler and the diff logic, so every guard and every
    cache-update ordering needs a decisive test.
  - Packet non-negotiables: no src/ edit; secrets env only; no em dashes, en dashes, or emojis in
    code, comments, log lines, docs, or commits; commit with EXPLICIT paths, never `git add -A`.

OUT OF SCOPE: the sweep's iteration set (D6, Phase 6), every server/ change (Phases 4 and 5), the
outbox endpoint and its bot-side consumption (Phases 5 and 6), governor internals beyond L11 and
L12 (Phase 2 owns pacing; the scheduler must not re-implement it), deploy and compose files plus
the DEPLOY.md bot section (Phase 7), and observability counters (Phase 8). Do not change what a
sweep DOES beyond skipping writes that would have been no-ops.

STEP 3 - VALIDATION + REVIEW: run the state.md bot-only row: `npx tsc --noEmit`,
`npx vitest run tests/discord_bot.test.ts` plus every Phase 1 to Phase 3 bot test file,
`npm run build:bot`, and `npm run ci:changed` (scoped
`npx @biomejs/biome check --write <file>` for fixes, never a whole-repo write). At phase close
run `npm run gate` (exit-code-safe; never an ad-hoc && chain).
Dispatch reviewers per the Review Dispatch Matrix in implementation-plan.md, matching rows ONLY:
a bot-only diff matches no row, so `qa-checklist` at phase end is the reviewer set, and it also
names `test-coverage-auditor` whenever the change adds or rewrites a body of tests. A row match
for server/, src/, or deploy files means the phase went out of scope. Prompt every reviewer for
COVERAGE, not filtering, with a hard tool-call budget and a report-first line. Resume a truncated
reviewer with: "Stop reading more files. Output the full report now. No more tool calls. Format:
BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do not commit while a BLOCKING finding stands.

KNOWN GATE FAILURES, do not chase either and do not report them as regressions:
  - `tests/malware_scan.test.ts` and the gate's malware step fail whenever a sibling session has
    a git worktree parked under `.worktrees/`, because the scanner walks the whole working tree
    and counts every child_process import in it. Diagnose by scanning a clean detached worktree
    of HEAD; do NOT delete another session's worktree, and remove your own before gating.
  - `tests/texture_upload.test.ts` fails on Three.js version-pin drift and reproduces on a clean
    copy of HEAD. This packet touches no src/ file.
  The gate aborts at the malware step BEFORE tsc and the builds, so finish those by hand.

STEP 4 - COMMITS: Conventional Commits with a scope, explicit paths, and a BODY on every commit
(1 to 4 plain sentences saying what changed and why, wrapped near 72 columns). No em dashes, no
en dashes, no emojis, no trailers. The plan suggests `feat(bot)` twice plus `refactor(bot)` plus
`test(bot)`:
  1. feat(bot): add the pure loop scheduler with overlap guards and adaptive backoff
  2. refactor(bot): run every poll loop and the presence debounce on the scheduler
  3. feat(bot): diff nicknames and members-meta before writing
  4. test(bot): cover the scheduler timing arms and every diff-before-write path

STEP 5 - ACCEPTANCE (every item verifiable by a command or an assertion, not by claim):
  - `grep -n "setInterval" bot/main.ts` returns nothing. The gateway heartbeat interval in
    bot/gateway.ts is not in scope and stays.
  - All six loops plus the presence debounce run through the scheduler, and each names its config
    key; the defaults still equal 300000, 4000, and 3000, each asserted against a LITERAL.
  - Steady state writes nothing: a test where no member's nick or meta has changed performs ZERO
    setNickname calls and ZERO members-meta pushes.
  - The failure arm asserts the CACHE, not just a call count: a rejected PATCH leaves the cached
    nick unchanged, so the next sweep retries.
  - The echo loop is closed: a PATCH that produces a GUILD_MEMBER_UPDATE carrying exactly what
    the bot wrote results in no members-meta POST, while a genuine third-party update still
    pushes.
  - Coalescing: several GUILD_CREATE events arriving during an in-flight sweep produce exactly
    one additional sweep, not one per event.
  - Overlap: a run that takes longer than its interval never starts a second concurrent run.
  - The scheduler pure core imports no timer and no clock, and every test drives it with
    tests/helpers/synthetic_clock.ts.
  - L11 and L12 are either closed with a test each, or recorded in state.md with the reason.
  - `npx tsc --noEmit`, the bot test files, `npm run build:bot`, `npm run ci:changed`, and
    `npm run gate` all green (modulo the two known gate failures above).

STEP 6 - DOCS: update docs/discord-bot-stability/progress.md (the Phase 3 status row and its five
checkboxes, plus the release-sync line) and docs/discord-bot-stability/state.md ("Current phase",
the "Created by this packet" list: bot/scheduler.ts, the new diff helpers, the new interval env
keys with defaults, and the new test files) in the SAME commit as the work, with explicit paths.
If bot/CLAUDE.md's "Poll loops" section no longer describes reality after the migration, update it
in the same change. Record genuinely reusable traps to memory as one file per fact plus its
MEMORY.md pointer line, and verify the file exists after writing it.

STEP 7 - FINAL RESPONSE: phase status, files touched (absolute paths), validation results
(command plus outcome for each), reviewer verdicts, anything deferred with the reason, the new
env key names and defaults, the L11/L12/L7 decisions, and a one-line handoff for the Phase 3 QA
session.

STOPPING RULES:
  - Stop and surface if migrating a loop would change user-visible sync behavior beyond cadence:
    which members are synced, the ordering of operations inside a sweep, or what gets pushed. A
    cadence change is the whole point; a behavior change is not.
  - Stop if a diff decision would need the game server to tell the bot what changed. That is the
    Phase 5 change feed, not this phase.
  - Stop if closing L11 or L12 would mean rewriting the governor's dispatch loop rather than
    extending it; report it as a finding for the Phase 3 QA session instead.
  - Stop if the work appears to need a new npm dependency (D7) or an edit under src/ or server/.
  - Stop if the worktree is dirty with work that is not yours.
```
