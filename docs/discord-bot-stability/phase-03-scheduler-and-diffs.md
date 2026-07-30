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
Worktree: /Users/fernando/Documents/wocc-discord-bot (branch feature/discord-bot-stability).
No Workflow needed: two independent module slices plus one serial wiring stage. Use a 2-agent
fan-out in STEP 2 stage 1 and keep the bot/main.ts migration in the main loop.

Goal: replace the six bare interval loops with one pure scheduler that cannot overlap or storm,
and make every nickname and members-meta write conditional on an actual change.

STEP 0 - PRE-FLIGHT: run `git status` in the worktree and confirm it is clean with Phase 2
committed; another session may share this checkout, so ASK before touching anything you did not
create. Scan MEMORY.md for the domains in play: bot/Discord work, fake-timer and captured-clock
traps, test-pin traps, Biome on changed files, and shared-worktree commit care.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn one Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-03-scheduler-and-diffs.md, and these source files: bot/main.ts,
bot/logic.ts, bot/config.ts, bot/discord_api.ts, bot/server_client.ts, bot/gateway.ts,
bot/rate_governor.ts (Phase 2), bot/CLAUDE.md, the root CLAUDE.md, tests/discord_bot.test.ts plus
the Phase 1 and Phase 2 bot test files, scripts/build_bot.mjs, scripts/gate.mjs, and
tsconfig.json.
It returns, as conclusions rather than file dumps:
  a. each of the six interval loops at bot/main.ts:518-537: what it calls, at what cadence, what
     it does on failure, and every other place that same function is invoked (GUILD_CREATE and
     the member-chunk completion both kick some of them);
  b. the presence debounce (schedulePresencePush) and its exact timing semantics;
  c. the nickname write path (bot/main.ts:203-251) and which caches hold a member's live nick
     versus their display name, including what displayNameOf falls back to;
  d. the members-meta push paths (single member, full roster, and the clearing paths on
     GUILD_MEMBER_REMOVE and in clearDepartedFlair), with the byte-batching contract;
  e. the computeRoleSync update-cache-only-after-success pattern as the exemplar to copy;
  f. the Phase 2 governor's public surface, so the scheduler composes with it and does not
     re-implement pacing.

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
      * Env-configurable intervals (D13) whose defaults are today's values: ROLE_SYNC_INTERVAL_MS
        300000, PRESENCE_DEBOUNCE_MS 4000, RELAY_POLL_MS 3000. Key names go in bot/config.ts next
        to the Phase 2 keys, with the same empty-or-non-numeric-falls-back-to-default handling
        (memory: env-empty-numeric-default-shift).
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

Stage 3 (serial): the wiring-level tests. Fake-timer scheduler suites (overlap, backoff,
coalescing, jitter band), the nick-diff arms (no-op, changed, failure leaves the cache
untouched), the meta-diff arms, and the echo-suppression arms. Before writing timing tests, read
the memory entries cachedread-captured-clock-vs-fake-timers (a clock captured at construction
does not move under fake timers) and settimeout-fractional-delay-fires-early (a fractional delay
fires EARLY).

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
outbox endpoint and its bot-side consumption (Phases 5 and 6), governor internals (Phase 2 owns
pacing; the scheduler must not re-implement it), deploy and compose files plus the DEPLOY.md bot
section (Phase 7), and observability counters (Phase 8). Do not change what a sweep DOES beyond
skipping writes that would have been no-ops.

STEP 3 - VALIDATION + REVIEW: run the state.md bot-only row: `npx tsc --noEmit`,
`npx vitest run tests/discord_bot.test.ts` plus every Phase 1 to Phase 3 bot test file,
`npm run build:bot`, and `npm run ci:changed` (scoped
`npx @biomejs/biome check --write <file>` for fixes, never a whole-repo write). At phase close
run `npm run gate` (exit-code-safe; never an ad-hoc && chain).
Dispatch reviewers per the Review Dispatch Matrix in implementation-plan.md, matching rows ONLY:
a bot-only diff matches no row, so `qa-checklist` at phase end is the reviewer set. A row match
for server/, src/, or deploy files means the phase went out of scope. Prompt every reviewer for
COVERAGE, not filtering. Resume a truncated reviewer with: "Stop reading more files. Output the
full report now. No more tool calls. Format: BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do
not commit while a BLOCKING finding stands.

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
    key; the defaults still equal 300000, 4000, and 3000.
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
  - The scheduler pure core imports no timer and no clock, and its tests drive it with a
    synthetic clock or fake timers.
  - `npx tsc --noEmit`, the bot test files, `npm run build:bot`, `npm run ci:changed`, and
    `npm run gate` all green.

STEP 6 - DOCS: update docs/discord-bot-stability/progress.md (the Phase 3 status row and its five
checkboxes) and docs/discord-bot-stability/state.md ("Current phase", the "Created by this
packet" list: bot/scheduler.ts, the new diff helpers, the new interval env keys with defaults,
and the new test files) in the SAME commit as the work, with explicit paths. If bot/CLAUDE.md's
"Poll loops" section no longer describes reality after the migration, update it in the same
change. Record surprising rules to memory as one file per fact plus its MEMORY.md pointer.

STEP 7 - FINAL RESPONSE: phase status, files touched (absolute paths), validation results
(command plus outcome for each), reviewer verdicts, anything deferred with the reason, the new
env key names and defaults, and a one-line handoff for the Phase 3 QA session.

STOPPING RULES:
  - Stop and surface if migrating a loop would change user-visible sync behavior beyond cadence:
    which members are synced, the ordering of operations inside a sweep, or what gets pushed. A
    cadence change is the whole point; a behavior change is not.
  - Stop if a diff decision would need the game server to tell the bot what changed. That is the
    Phase 5 change feed, not this phase.
  - Stop if the work appears to need a new npm dependency (D7) or an edit under src/ or server/.
  - Stop if the worktree is dirty with work that is not yours.
```
