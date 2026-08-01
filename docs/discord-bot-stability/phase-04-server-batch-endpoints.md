# Phase 4: Server set-based endpoints

Root cause 5 of the 2026-07-29 incident was server-side amplification: the bot's sweep asked
`/internal/discord/flex` once per online Discord user and each call paid 1 to 4 uncached Postgres
queries, while `members-meta` ran one serial UPDATE per member with no change detection. This
phase makes the game side cheap per call, before Phase 6 rewires the bot onto it: one batched
flex endpoint that answers for linked members only with set-based queries, one multi-row
members-meta upsert that skips rows whose stored meta already matches, the `reward_ledger`
retention decision recorded at its DDL (D12), and first tests for `server/discord_relay.ts` and
`server/discord_activity.ts` so Phase 5 refactors those queues against a green baseline. No bot
code changes here; the existing per-endpoint routes stay exactly where they are (D11).

Phase 3 QA (2026-07-31) added a mandate this phase did not originally carry: ledger item L14.
`members-meta` reports every record it ITERATED as updated rather than every row it actually
wrote, so a push for a Discord member with no link row applies to zero rows and is still
answered as accepted. The bot caches that as pushed and never re-sends it, so the member's join
date and staff flair never reach the game after they link. Phase 3 QA capped the damage bot-side
with an hourly full re-push, which is a ceiling and not a fix. The fix is here, in the same
statement this phase was already rewriting.

## Starter prompt

```
This is Phase 4 of the Discord Bot Stability packet: Server set-based endpoints.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).
ULTRACODE: not required for this phase (D19 makes it mandatory for QA sessions, not build ones).
Fan out anyway, but see AGENT DELIVERY below: prefer a Workflow over Agent-tool background
agents, which is a correction Phase 3 QA earned the hard way.

Goal: make the game server answer the bot's needs with set-based work: one batched flex endpoint
covering linked members only, one multi-row members-meta upsert that skips unchanged rows AND
tells the caller what it could not apply, and a green test baseline for the two in-memory queue
modules Phase 5 will refactor.

STEP 0 - PRE-FLIGHT.
  - SYNC THE RELEASE BASE FIRST (standing rule 1; the original draft of this prompt omitted it).
    `git fetch origin release/v0.33.0`, then
    `git rev-list --left-right --count HEAD...origin/release/v0.33.0` against the FRESHLY fetched
    tip. Phase 3 QA merged it at `104994c21` (base tip `2ae71a7fb`, 82 files, zero conflicts) on
    2026-07-31, so the base was current then. MEASURE rather than trust that. If it moved, merge
    BEFORE any phase work, run the `release-merge-audit` skill, and record the sync in
    progress.md either way, including "no-op, already current".
  - `git status` must be clean. Another session shares this checkout and foreign worktrees are
    registered under `.worktrees/` and `.claude/worktrees/`. LEAVE THEM ALONE and ASK before
    touching anything you did not create. Commits in this packet use EXPLICIT paths, never
    `git add -A`.
  - `npm ci` if node_modules is stale. `node -v` should be v26.5.0.

MEMORY SCAN. Read these, which EXIST: no-docker-userspace-postgres (there is no Docker here, so
`npm run db:up` cannot work; the DB-gated suites skip green without TEST_DATABASE_URL),
vacuous-bound-pin-trap, early-exit-pins-need-work-remaining, round-trip-pins-reference-aliasing,
diff-cache-needs-an-expiry, unkillable-mutant-diagnosis, mutation-checks-commit-first,
worktree-cwd-drift-misroutes-git, fanout-agent-delivery-traps, big-diff-reviewer-turn-budgets,
background-task-notifications-unreliable, malware-scan-comment-keywords, node25-breaks-jsdom-gate.
Do NOT go looking for a "test-pin trap index"; it does not exist and never did (verified twice,
2026-07-31). The equivalent list is "Known gotchas for implementers" at the bottom of state.md,
which is where this packet's real traps live. If you find yourself citing a memory entry, confirm
the file exists first.

AGENT DELIVERY, settled by Phase 3 QA and not to be re-litigated. Agent-tool BACKGROUND agents on
this repo idle without ever reporting: 3 of 3 failed across that session, including the STEP 1
Explore agent, which had to be superseded by reading directly. Workflow agents delivered 106 of
106 in the same session. So: run the fan-out as a Workflow, and if you do spawn an Agent-tool
background agent, budget for one nudge and a fallback to reading directly. Give EVERY agent, in
either harness, a hard 30-tool-call budget and a report-first line ("at call 25, STOP and write
your report with whatever you have"), or it dies at the turn limit with nothing recoverable.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): ONE context agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md (the Phase 3 QA
section is where L14 and L15 are argued), docs/discord-bot-stability/phase-04-server-batch-endpoints.md,
and these source files. The line numbers below are from the original draft and rot: treat them as
hints and re-find the symbol.
  - server/internal.ts (the RouteDef table; the FROZEN legacy handleDiscordInternal ladder; the
    members-meta arms on BOTH sides; clampInt and the ok/fail envelope helpers)
  - server/discord.ts (discordFlexForAccount, the status payload, the presence cache)
  - server/discord_db.ts (accountForDiscord, discordForAccount, setDiscordMemberMeta,
    discordIdsWithGuildFlair, the reward_ledger DDL)
  - server/discord_relay.ts (cap 50, drain splice) and server/discord_activity.ts (cap 100,
    30s dedupe TTL, the 512-key sweep)
  - server/db.ts (highestCharacterForAccount and its JSONB-expression sort)
  - server/http/registry.ts, server/http/middleware/require_internal_secret.ts
  - tests/server/http/surface_inventory.ts, parity.test.ts, completeness.test.ts,
    ownership_coverage.test.ts, known_deviations.ts
  - tests/server/internal.test.ts (the runRoute rig, the hoisted module mocks, the members-meta
    cases), tests/discord_db.test.ts (the makePool fake with its `calls` array),
    tests/server/helpers/ (fakeCtx, the FakeDb classes, the barrel)
  - bot/member_writes.ts (`pushRejected`, `pushChangedMemberMeta`, `dueForFullResync`) READ ONLY,
    so the new response shape is one the Phase 6 bot can actually consume
  - server/CLAUDE.md and server/http/CLAUDE.md
It returns, as CONCLUSIONS not file dumps:
  (a) the exact RouteDef shape a new internal route must have (method/path/surface/meta/
      middleware/handler, which gate const, how ok/fail write the envelope);
  (b) the current members-meta behavior on BOTH arms, field by field, including every clamp and
      cap, so the bulk rewrite can be proven behavior-identical;
  (c) the full query fan-out of one flex payload today (which functions, how many statements,
      which are per-account) and which of them can be batched by account id;
  (d) how tests/server/internal.test.ts drives a route and how tests/discord_db.test.ts counts SQL
      statements. Ruling R1 in state.md governs: reuse the rig the matching suite already uses,
      count every query-count pin off that `calls` array, and never invent a raw pg mock;
  (e) the exact surface_inventory row shape for an internal Discord route, and what parity /
      completeness / ownership_coverage will demand of a RouteDef-only route with no legacy twin;
  (f) whether tests/discord_relay.test.ts (which covers src/sim/discord_relay.ts, NOT the server
      module of the same name) forces a different file name for the new queue tests;
  (g) exactly what the bot does with the members-meta response today, so agent B knows which
      response shapes are safe to change: `pushRejected` treats BOTH null and undefined as a
      refusal, and any truthy body reads as accepted.

STEP 2 - EXECUTE: four slices. C and D touch files nobody else touches and run in PARALLEL with A.
A and B both edit server/internal.ts, server/discord_db.ts, and tests/server/internal.test.ts, so
run B only after A returns (do not run them concurrently and do not reach for worktree isolation
for a two-slice sequence).
  - Slice A (flex-batch): add the batched read to server/discord_db.ts (or server/discord.ts if
    the context report shows the payload assembly belongs there; SQL lives only in db.ts /
    *_db.ts either way). Ruling R3: this phase MAY add batched set-based variants of per-account
    reads to serve flex-batch, and that is the point of the phase, not scope creep. Keep every
    per-account original in place for its existing callers and do not re-point those callers.
    Then add `POST /internal/discord/flex-batch` to the routes table behind the same discordGate.
    Body is a list of Discord user ids; validate and clamp it the way members-meta does (array
    cap, per-id length slice, drop non-strings). Resolve links with ONE `discord_links` IN pass,
    then batch the follow-on loads by account id. UNLINKED ids get no fabricated payload. Tests
    in tests/server/internal.test.ts plus tests/discord_db.test.ts, including a query-count
    assertion that the statement count for a 200-id batch equals the count for a 1-id batch.
  - Slice B (members-meta bulk upsert + L14, runs after A): replace the per-member serial UPDATE
    with ONE multi-row statement (unnest arrays) that skips rows whose stored values are not
    `IS DISTINCT FROM` the incoming ones, and land it on BOTH the RouteDef arm and the frozen
    legacy handleDiscordInternal arm in this same change (D9).
    **L14 is the load-bearing half and it is new since the original draft.** Today the handler
    increments `updated` once per record it ITERATED, so a record whose UPDATE matched no row
    (a Discord member with no `discord_links` row, which is every unlinked guild member) is
    reported as accepted. The bot caches it as pushed and never re-sends it, so after that member
    links, their join date and staff flair never reach the game until the bot restarts. The new
    statement must report what it ACTUALLY did:
      * `updated`: rows whose stored values really changed. Keeps its existing meaning.
      * `skipped`: rows that existed and already matched (the `IS DISTINCT FROM` no-ops).
      * the ids it could NOT apply because no link row exists. A count is not enough: the bot has
        to know WHICH ids to leave dirty, so return the id list (bounded by the same 1000 cap the
        request already carries). Phase 6 consumes it; do NOT change bot/ here (D11 and scope).
    Sanity check the shape against `pushRejected` before choosing it: the bot treats null and
    undefined as a refusal and ANY truthy body as accepted, so an all-unapplied push must not
    come back as a bare success. Also add the `reward_ledger` keep-forever comment (D12).
  - Slice C (queue tests): first tests for server/discord_relay.ts and server/discord_activity.ts.
    Cover: enqueue then drain returns items in FIFO order and leaves the queue empty; overflow
    past the cap drops the OLDEST items and keeps the cap; the depth accessor tracks both;
    activity dedupe suppresses a repeat key inside the TTL and admits it at and past the boundary
    (both sides of the boundary, with the injected `now`, never a real clock); the 512-key sweep
    prunes only expired keys. File names must not collide with tests/discord_relay.test.ts, which
    covers the unrelated src/sim/discord_relay.ts; put a comment in the new files naming that trap.
  - Slice D (spine rows): hand-add the surface_inventory.ts row for the new route (dispatcher
    internal, the secret-discord auth scope, the same content-type class as its siblings, handler
    anchored on a symbol or route string, never a line number) and run the four spine tests. This
    row is for a RouteDef-only route with NO legacy twin; if completeness or parity demands a
    legacy counterpart, STOP and report rather than adding a legacy arm (D9 forbids one).
Give each agent the context summary, not the raw planning docs.

TEST-PIN TRAPS THAT APPLY HERE, from state.md's gotchas and this packet's own history:
  - **Reach the real cap.** A "bounds the X" test whose input never reaches the bound is
    constant-true. The queue cap tests must push PAST the cap, assert `toBe(CAP)`, and pin WHICH
    entries survived (oldest dropped, not newest).
  - **An early-exit claim needs work remaining after the exit point.** Phase 3 QA found a "stops
    at the first refusal" test that refused the LAST of two batches, so `return` and `continue`
    were indistinguishable and the claim was constant-true. If any loop here aborts the rest, use
    three items, fail the SECOND, and assert the attempt log by value.
  - **Do not drive an assertion by the same expression the source uses**, and do not compare a
    payload against the object the code under test stored by reference. Build expectation
    literals fresh.
  - **Both sides of a boundary.** The dedupe TTL needs at, just before, and just past.
  - Query-count pins come off the `calls` array of the suite's existing makePool fake (R1).

INVARIANTS IN PLAY:
  - D9 (endpoint placement): new endpoints are RouteDef-only, no legacy twin, behind
    requireInternalSecret, with HAND-ADDED rows in tests/server/http/surface_inventory.ts; a
    behavior edit to an EXISTING internal route (members-meta here) lands on BOTH the RouteDef
    and the frozen legacy arm in the same change, or gets a ledgered deviation in
    tests/server/http/known_deviations.ts.
  - D10 (members-meta shape): ONE multi-row upsert (unnest arrays) skipping unchanged rows via
    `IS DISTINCT FROM`; the 1000-member server cap and the 200-member bot batch both stand.
  - D11 (no retirement yet): the existing per-endpoint GET routes stay in place and keep working.
  - D12 (retention): `reward_ledger` is an audit ledger and gets an explicit keep-forever comment
    at its DDL instead of a prune.
  - D18 (scale envelope): design and assert at 1,000 concurrent players and 5,000 guild members.
  - D7 (dependencies): zero new npm packages.
  - Pipeline contract: handlers are req/res-free `(ctx) => Awaitable<unknown>` writing through the
    module's ok/fail helpers; SQL lives only in db.ts / *_db.ts; SQL is parameterized; errors are
    stable codes from the append-only error_codes.ts.
  - Copy and commit rules: no em dashes, no en dashes, no emojis anywhere (code, comments, docs,
    commit text); commit with EXPLICIT paths, never `git add -A`.
  - src/sim/ and the wire protocol are untouched by this packet.

OUT OF SCOPE: the outbox endpoint and the linked-member change feed (Phase 5, which owns L15, the
missing link-created signal); any bot/ change including consuming the new unapplied-ids field or
relaxing the hourly `FULL_RESYNC_INTERVAL_MS` (Phase 6); retiring the existing per-endpoint
internal routes (D11); deploy assets (Phase 7); observability counters (Phase 8); /api/discord
caching (Phase 9); any new table or DDL beyond the reward_ledger comment; the presence route.

STEP 3 - VALIDATION + REVIEW: run the state.md server-only row: `npx tsc --noEmit`, then
`npx vitest run tests/server/internal.test.ts tests/discord_server.test.ts
tests/server/discord.test.ts tests/discord_db.test.ts`, then the http spine
(`npx vitest run tests/server/http/parity.test.ts tests/server/http/completeness.test.ts
tests/server/http/ownership_coverage.test.ts tests/server/http/surface_inventory.test.ts`), then
the new queue test files, then `npm run build:server`, then `npm run ci:changed` (scoped `--write`
on changed files only, never a whole-tree write).
Dispatch reviewers per the Review Dispatch Matrix in implementation-plan.md, matching rows only:
privacy-security-review (server/ plus SQL and secret-gated surface), migration-safety (a
server/*_db.ts DDL edit), database-performance-reviewer (new SQL, query cadence and cardinality,
write amplification). Do NOT spawn cross-platform-sync, architecture-reviewer, or
frontend-seam-reviewer; if a matrix row for those matches, the phase went out of scope. Prompt
every reviewer for COVERAGE, not filtering. Do not commit while any BLOCKING finding stands.
The fix round is itself unreviewed code (standing rule 3): review it with a FRESH agent and
mutation-check any test it adds. Phase 3 QA's first scheduler fix cured a deadlock by introducing
overlap, and only the review OF THE FIX caught it.

STEP 4 - COMMITS (Conventional Commits with a scope, explicit paths, every commit carries a body
of 1 to 4 plain sentences saying what changed and why, no em dashes, no emojis):
  1. `feat(server): add POST /internal/discord/flex-batch for linked-member batch reads`
  2. `feat(server): collapse members-meta into one multi-row upsert that skips unchanged rows`
  3. `fix(server): report the rows members-meta actually applied, not the rows it read`
  4. `test(server): cover the discord relay and activity queue modules`
  5. `docs(server): record the reward_ledger keep-forever retention decision`
Fold docs/discord-bot-stability/progress.md and state.md into the final commit of the phase.

STEP 5 - ACCEPTANCE (each item verifiable, check them off explicitly in the final response):
  - `POST /internal/discord/flex-batch` exists in the routes table behind discordGate, and has NO
    arm in handleDiscordInternal.
  - A test proves the SQL statement count for a 200-id batch equals the count for a 1-id batch,
    counted off the makePool `calls` array per R1 (state the number in the final response).
  - Any per-account read that gained a batched variant still exists in its per-account form and
    its existing callers are unchanged (R3).
  - A test proves an unlinked id yields no payload for that id, and that an over-cap array,
    over-long ids, and non-string entries are clamped or dropped exactly like members-meta.
  - members-meta issues ONE statement per request regardless of member count.
  - **L14 closed:** a test drives a members-meta push containing an id with NO link row and proves
    the response does NOT count it as updated and DOES name it as unapplied; a second test proves
    re-pushing identical meta for an existing row reports zero updated and a non-zero skipped;
    a third proves `updated` still counts exactly the rows whose values really changed. State in
    the final response whether the response shape is safe against the bot's current
    `pushRejected` (null and undefined are refusals, any truthy body is accepted).
  - Both members-meta arms produce identical responses for identical bodies (spine parity green),
    or a ledgered deviation exists in known_deviations.ts with a stated reason.
  - The surface_inventory row was hand-added; surface_inventory, parity, completeness, and
    ownership_coverage tests are green.
  - The reward_ledger DDL carries the keep-forever comment and no prune was added.
  - Tests for server/discord_relay.ts and server/discord_activity.ts exist under names that do not
    collide with tests/discord_relay.test.ts, and cover cap overflow (reaching the real cap and
    pinning which entries survived), drain-empties, both sides of the dedupe TTL boundary, and the
    key sweep.
  - `npx tsc --noEmit` clean, `npm run build:server` green, `npm run ci:changed` exits 0.

STEP 6 - DOCS: update progress.md (Phase 4 status row and every Phase 4 checkbox, plus a
per-phase note) and state.md ("Created by this packet": the new endpoint, the new modules or
functions, the new test files; the L14 entry moved from OPEN to closed with the commit that closed
it; plus any drift you found in the key file paths section). If L14 is closed, say explicitly in
progress.md that Phase 6 may now revisit the bot's hourly `FULL_RESYNC_INTERVAL_MS`, and that it
must NOT be removed until the bot consumes the unapplied-ids signal. Record genuinely reusable
traps to memory as one file per fact plus its MEMORY.md pointer line, and VERIFY the file exists
after writing it.

STEP 7 - FINAL RESPONSE: phase status, files touched (absolute paths), validation results command
by command, reviewer verdicts, anything deferred, and a one-line handoff for the Phase 4 QA
session.

KNOWN GATE FAILURE, exactly ONE, do not chase it and do not report it as a regression:
`tests/malware_scan.test.ts` and the gate's malware step fail while a sibling session has a
worktree parked under `.worktrees/` or `.claude/worktrees/`, because the scanner walks the whole
tree. Phase 3 QA measured it: 194 high findings, 194 of them inside those worktrees, zero in the
branch's own files. Diagnose by running the scanner from INSIDE a clean detached worktree of HEAD
created OUTSIDE the repo root (`git worktree add --detach <path-outside-repo> HEAD`, then `cd`
there and run it; it passed there on 2026-07-31: 4548 files, 0 high), and remove your own
worktree before gating. The gate aborts at that step BEFORE tsc and the builds, so run those by
hand. `tests/texture_upload.test.ts` is NOT a known failure; treat a red there as real.

OWED TO THE MAINTAINER, do not work around it: the three Phase 3 D13 env keys
(`DISCORD_ROLE_SYNC_INTERVAL_MS`=300000, `DISCORD_PRESENCE_DEBOUNCE_MS`=4000,
`DISCORD_RELAY_POLL_MS`=3000) are still absent from `.env.example`, and every `.env*` path is
denied at the HARNESS level here for both Read and Bash, so no session can add them. If this
phase adds an env key, it inherits the same obstacle: do the rest and re-surface the request.

STOPPING RULES:
  - STOP if the bulk upsert cannot keep BOTH members-meta arms behavior-identical. Report the
    exact divergence, the proposed known_deviations.ts row text, and wait. Do not invent a
    deviation and do not silently let the arms drift.
  - STOP if closing L14 would require a response shape the bot's current `pushRejected` reads as a
    refusal for an ordinary successful push. Report the shape and wait; a bot-side change is
    Phase 6, and silently breaking the current client is worse than leaving L14 one phase longer.
  - Do NOT stop on the per-account reads: R3 permits adding batched set-based variants for
    flex-batch with the per-account originals left in place. STOP only on the hidden-N+1 failure:
    never ship a per-item loop dressed up as "batched". If some read genuinely cannot be batched,
    report the shape and cost of what a batched version would need before writing any loop.
  - STOP if any work would require touching src/, the wire protocol, or a new table.
  - STOP and surface the proposed code first if the new route seems to need an error code that
    error_codes.ts does not already have.
  - STOP if the worktree is dirty with work that is not yours.
```
