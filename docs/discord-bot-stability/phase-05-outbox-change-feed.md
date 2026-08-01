# Phase 5: Outbox + linked-member change feed

Three of the bot's loops poll every 3 seconds against queues that are almost always empty, and
the only way the bot learns that a linked player levelled up, changed class, or crossed a
status tier is to re-read every online user's flex payload on a timer. This phase replaces both
with one server-side change feed and one consolidated drain: `server/discord_link_changes.ts`
is a bounded FIFO, enqueued wherever the server ALREADY learns that a linked account's
flex-relevant state changed, and `GET /internal/discord/outbox` drains relay, activity, daily
reward winners, and link changes in a single envelope, collapsing the per-item
`discordForAccount` N+1 into one IN query across all four streams (D1). The failure mode of
this phase is a MISSED feed site: a state transition nobody enqueued is a change the bot never
sees, and it will look like an intermittent staleness bug months later. Enumerating every site
is therefore a first-class deliverable, not a side effect.

```
This is Phase 5 of the Discord Bot Stability packet: Outbox + linked-member change feed.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).
ULTRACODE: not required for the build, but the feed-site enumeration in STEP 1 must be
EXHAUSTIVE. Run it as a WORKFLOW fan-out, not as background Agent-tool agents: settled across
Phases 3 and 4, Agent-tool background agents on this repo idle without reporting, while Workflow
agents deliver (Phase 4 QA: 37 of 37 across three fan-outs, zero deaths). Give EVERY agent a hard
30-tool-call budget plus a report-first line ("at call 25, STOP and write your report with
whatever you have"), or it dies at the turn limit with nothing recoverable.

Goal: one server-side outbox that the bot can drain in a single request, fed by a bounded
linked-member change feed wired at EVERY site where the server already learns a linked
account's flex-relevant state changed.

STEP 0 - PRE-FLIGHT.
  - SYNC THE RELEASE BASE FIRST (standing rule 1). `git fetch origin release/v0.33.0`, then
    `git rev-list --left-right --count HEAD...origin/release/v0.33.0` against the FRESHLY fetched
    tip. MEASURE rather than trust any number written here: the Phase 4 BUILD recorded 70/0 and
    was 4 commits behind by the time QA checked hours later.
    **AS OF 2026-08-01 THIS IS A BIG ONE: 80 ahead / 235 BEHIND, and unlike the last two syncs
    it genuinely collides.** The release brought the graphics overhaul, ability VFX integration,
    the Wildheart Basin dungeon, and a whole new `server/epic/` route family. Budget real time
    for STEP 0; it is not a formality this round.
      - `git merge-tree` reports FOUR files changed on both sides, and all four are packet-owned:
        `server/db.ts` (the packet added the LOCKSTEP note above `highestCharacterForAccount`;
        the release adds 13 lines to the same file), `tests/server/http/surface_inventory.ts`
        (the release adds 33 rows for the epic routes, the packet added the flex-batch row),
        `tests/server/http/completeness.test.ts` and `tests/server/http/parity.test.ts` (both
        carry ladder COUNT assertions the packet bumped 19 to 20 for flex-batch, and the release
        moves them too). Expect count assertions to need reconciling by ADDING both sides, never
        by taking one side's number.
      - `release-merge-audit` is mandatory here and its Step 4 will actually bite: the new
        `server/epic/` routes register in `server/http/registry.ts` and need their
        `surface_inventory.ts` rows, so verify the merged corpus covers BOTH families before
        trusting the four spine suites.
      - Re-run the FULL validation ladder after the merge, not just the Phase 5 suites: a gate
        that was green before a merge says nothing about the merged result.
    Record the sync in progress.md either way, including "no-op, already current".
  - `git status` must be clean; ASK before touching anything if it is dirty. Another session
    shares this checkout and foreign worktrees are registered under `.worktrees/` and
    `.claude/worktrees/`. LEAVE THEM ALONE. Commits use EXPLICIT paths, never `git add -A`.
  - `node -v` should be v26.5.0.
  - Memory scan of MEMORY.md for: server hot-path and cached-read traps, pg traps, HTTP pipeline
    traps, the daily-rewards module memo traps, and these, which Phase 4 QA proved out live:
    novel-sql-needs-an-executed-test, no-docker-userspace-postgres (the exact working recipe),
    vacuous-bound-pin-trap, early-exit-pins-need-work-remaining, regex-source-pins-are-weaker-
    than-they-read, mutation-checks-commit-first, inverse-edit-restore-needs-unique-anchor,
    worktree-cwd-drift-misroutes-git, fanout-agent-delivery-traps, big-diff-reviewer-turn-budgets.
    Confirm a memory file exists before citing it; there is no "test-pin trap index" and never
    was. The equivalent list is "Known gotchas for implementers" at the bottom of state.md,
    which Phase 4 QA extended by four entries that bear directly on this phase.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn an Explore agent, breadth
"very thorough", over docs/discord-bot-stability/state.md, docs/discord-bot-stability/
progress.md, docs/discord-bot-stability/phase-05-outbox-change-feed.md, and these files:
  - server/internal.ts (the `routes` RouteDef table, especially the relay, activity, and
    daily-rewards-winners handlers and their enrichment loops; the FROZEN legacy ladder under
    `handleDiscordInternal`; the Phase 4 `flexBatchHandler` route as the template for a new
    RouteDef, and `applyMemberMetaPush` as the template for sharing one body across both arms).
    Cite SYMBOLS, never line numbers: Phase 4 moved every anchor in this file (the routes table
    slid from :329 to :451) while the stale span still read as correct, which is why the
    coordinates that used to be printed here are gone
  - server/discord_relay.ts and server/discord_activity.ts (the bounded-FIFO pattern the new
    module copies: cap constant, drain splice, depth accessor, injected `now` dedupe)
  - server/discord_db.ts (discordForAccount, accountForDiscord, linkDiscordToAccount,
    unlinkDiscord, grantRewardPoints, setDiscordGuildMember, and the two Phase 4 set-based
    statements discordFlexRowsForDiscordIds and setDiscordMemberMetaBulk)
  - server/discord.ts (discordFlexForAccount and its batched sibling discordFlexForAccounts, the
    link and unlink call sites, the status tier helper) and server/db.ts
    (highestCharacterForAccount, whose ORDER BY the Phase 4 LATERAL restates in lockstep)
  - server/daily_rewards.ts (discordWinnerAnnouncements and markDiscordWinnersAnnounced, and
    whatever caching or memoization already sits under them)
  - server/http/registry.ts, server/http/middleware/require_internal_secret.ts
  - tests/server/http/surface_inventory.ts, parity.test.ts, completeness.test.ts,
    ownership_coverage.test.ts, known_deviations.ts
  - tests/server/internal.test.ts (the runRoute rig), tests/discord_db.test.ts (the makePool
    fake and its `calls` array for statement counting), tests/server/helpers/ (fakeCtx, FakeDb).
    Ruling R1 in state.md governs the rigs: reuse the rig the matching suite already uses,
    count every query-count pin off the makePool `calls` array, never invent a raw pg mock
  - server/CLAUDE.md (hot-path seams: cached reads, single-flight, retention) and
    server/http/CLAUDE.md (RouteDef contract)
It returns, as conclusions:
  (a) THE FEED-SITE ENUMERATION, the load-bearing output of this step: every server-side site
      where a LINKED account's flex-relevant state changes. Flex-relevant means anything the
      bot renders or acts on: character level, character class or which character is the
      account's top character, reward points or the derived status tier, and link or unlink
      itself. Sweep server/ exhaustively; the enqueueActivity call sites in server/game.ts,
      the linkDiscordToAccount and unlinkDiscord callers in server/discord.ts, and the
      grantRewardPoints callers are KNOWN STARTING POINTS, not the answer. For each site
      return: file path, enclosing symbol, which transition it represents, whether an account
      id is in hand there, and whether the code path already knows the account is linked.
  (b) the exact enrichment loop each existing stream does today (relay per item, activity per
      participant, winners) and which account ids each stream needs resolved;
  (c) the winners lookup: discordWinnerAnnouncements calls unannouncedWinnerDays on every
      request today, so report what caching or memoization already exists beneath it, the
      createCachedRead and single-flight seam server/CLAUDE.md offers, and the site where a
      reward day is FINALIZED (that site is what must bust the new cache);
  (d) the existing drain semantics (destructive splice, no cursor, no ack) so the outbox
      matches them;
  (e) the RouteDef and surface_inventory shapes to copy from the Phase 4 route.

STEP 2 - EXECUTE: three agents, run in the order below.
  - Agent A (change feed module, runs first, others depend on its exported surface):
    server/discord_link_changes.ts, modelled on server/discord_activity.ts. A bounded FIFO of
    change records keyed by account id (carry the Discord user id too when the site has it),
    with a cap constant, dedupe over a short TTL with an INJECTED `now` so a burst of
    transitions for one account collapses to one item, a destructive `drain`, and a depth
    accessor. Pure and dependency-free: no DB, no IO, no Discord types. Its tests land with
    it (FIFO order, cap drops oldest, dedupe inside and outside the TTL boundary, depth).
  - Agent B (feed wiring, runs after A): enqueue at EVERY site from the STEP 1 enumeration.
    Wiring must be cheap and must not change the behavior of the call site it hooks: no extra
    query to discover linkage where the site does not already know it (if a site would need
    one, record it and apply the stopping rule below). Add a test per transition class proving
    the enqueue happens.
  - Agent C (outbox endpoint, runs after A): `GET /internal/discord/outbox` as a new RouteDef
    in server/internal.ts behind the same discordGate, draining relay + activity + winners +
    link changes into ONE envelope with a named field per stream. Collect the account ids
    every stream needs, resolve them in ONE IN query, then enrich from that map: the per-item
    discordForAccount calls disappear. Keep the existing per-stream item shapes so Phase 6 can
    reuse the bot-side handlers. Hand-add the surface_inventory row, anchored on the RouteDef
    symbol or route string per ruling R4 (never by adding a legacy twin), and run the spine
    tests. Also wrap the winners lookup (unannouncedWinnerDays) in a short TTL cache, 30 to 60
    seconds, busted at day finalization, using the existing createCachedRead seam rather than a
    bespoke timer, so a warm empty drain is fully query-free. Ruling R2 in state.md puts this
    cache in Phase 5 scope; Phase 9 owns only the public /api/discord route. If the
    day-finalization bust site cannot be located, surface that rather than shipping a cache
    that can serve a stale winner day.
Give each agent the Explore summary, not the raw planning docs.

WHAT PHASE 4 HANDED YOU, so you build against the real surface rather than the plan's memory:
  - `POST /internal/discord/flex-batch` already exists and is the TEMPLATE for the outbox route:
    RouteDef-only behind `discordGate`, no legacy arm, `surface_inventory.ts` row hand-added and
    anchored on the exported `flexBatchHandler` symbol, internal ladder counts bumped to 20.
    Copy that shape exactly; do not invent a second one.
  - members-meta already answers `{ updated, changed, skipped, unapplied }`. `updated` counts
    records ACCEPTED, not rows written, by maintainer ruling (L14, CLOSED). Do not narrow it.
  - `requested` on flex-batch is a POST-de-duplication count. If this phase adds any similar
    echo, say in its doc comment what it counts, and pin it with a test; Phase 4 QA had to add
    both after the fact.
  - Two set-based statements now exist to copy from: `discordFlexRowsForDiscordIds` (the ANY()
    plus LATERAL read) and `setDiscordMemberMetaBulk` (the data-modifying CTE). The outbox's
    "one IN query across all four streams" is the same shape as the first.

TEST-PIN RULES this phase inherits, every one paid for by a real defect in Phase 4 QA:
  - Run the mutation pass TWICE, once with `TEST_DATABASE_URL` and once WITHOUT. CI never sets
    it, so a mutant that dies only in an `*_integration.test.ts` is an unguarded regression in
    the pipeline. Phase 4's headline finding was exactly this, and it was invisible to reading.
  - A `toContain` over SQL must anchor its CLAUSE and pin the OCCURRENCE COUNT. A statement can
    spell the same predicate twice in places that decide different numbers, and a bare fragment
    scan is satisfied by either.
  - A source-file `toContain` must slice to the function body first. A comment restating the
    clause satisfies a whole-file search, and this packet writes exactly such comments.
  - Do not assert "no Seq Scan" on a small fixture: over a few hundred freshly-ANALYZEd rows a
    seq scan IS the correct plan, so the assertion reds on correctness. Pin plans by PROPERTY
    (loop counts, index name present) and seed AT the D18 envelope, 5,000 members, so the
    planner sees production-sized statistics.
  - If this phase adds SQL beyond the module's existing vocabulary, it needs a DB-gated
    `*_integration.test.ts` that EXECUTES it. Stand up the throwaway Postgres with the
    no-docker-userspace-postgres recipe (about 3 minutes, no Docker, no sudo) and tear it down
    after. If you skip it, say so rather than implying coverage.

INVARIANTS IN PLAY:
  - D1 (transport): ONE consolidated outbox poll draining relay, activity, winners, and linked
    member changes in a single response; adaptive cadence lives on the bot side (Phase 6), not
    here. No long-poll, no bot WebSocket, no server push.
  - D9 (endpoint placement): the outbox is RouteDef-only, no legacy twin, behind
    requireInternalSecret, with a HAND-ADDED surface_inventory row.
  - D11 (no retirement yet): the existing relay, activity, and winners GET routes stay in place
    and keep working; the bot stops calling them in Phase 6, and retiring them is a post-packet
    follow-up issue.
  - D18 (scale envelope): 1,000 concurrent players, 5,000 guild members; query-count and
    payload-size assertions pin at that envelope.
  - D7 (dependencies): zero new npm packages.
  - Drain semantics: destructive read with no cursor and no ack, matching the existing relay
    and activity behavior. Do NOT invent an acknowledgement protocol in this phase.
  - Pipeline contract: handlers are req/res-free `(ctx) => Awaitable<unknown>` writing through
    the module's ok/fail helpers; SQL lives only in db.ts / *_db.ts; SQL is parameterized;
    errors are stable codes from the append-only error_codes.ts.
  - Server authority: the feed reports state the server already computed. The bot never
    computes rewards and this phase does not move any decision to it.
  - Copy and commit rules: no em dashes, no en dashes, no emojis anywhere; commit with EXPLICIT
    paths, never `git add -A`.
  - src/sim/ and the wire protocol are untouched.

OUT OF SCOPE: every bot-side change, including consuming the outbox and deleting the old
pollers (Phase 6); retiring the existing per-endpoint routes (D11); deploy assets (Phase 7);
observability counters (Phase 8); /api/discord caching (Phase 9); new tables or DDL; changing
what the daily-rewards service COMPUTES (wrapping its winners lookup in a TTL cache is IN scope
per R2; changing the winner set it returns is not); a two-way relay.

STEP 3 - VALIDATION + REVIEW: run the state.md server-only row: `npx tsc --noEmit`, then
`npx vitest run tests/server/internal.test.ts tests/discord_server.test.ts
tests/server/discord.test.ts tests/discord_db.test.ts`, then the http spine
(`npx vitest run tests/server/http/parity.test.ts tests/server/http/completeness.test.ts
tests/server/http/ownership_coverage.test.ts tests/server/http/surface_inventory.test.ts`),
then the new change-feed and outbox test files, then `npm run build:server`, then
`npm run ci:changed` (scoped `--write` on changed files only if it reports format diffs).
Dispatch reviewers per the Review Dispatch Matrix in implementation-plan.md, matching rows
only: privacy-security-review (server/, SQL, a secret-gated surface),
database-performance-reviewer (the new IN query, drain cadence, cardinality at the D18
envelope, and whether the feed wiring added work to any hot path), and migration-safety ONLY
if the diff ends up touching a *_db.ts DDL or a persisted shape (it should not). Do not spawn
cross-platform-sync, architecture-reviewer, or frontend-seam-reviewer. Prompt every reviewer
for COVERAGE, not filtering. Resume a truncated reviewer with: "Stop reading more files. Output
the full report now. No more tool calls. Format: BLOCKING / SHOULD-FIX / NICE-TO-HAVE /
VERDICT." Do not commit while any BLOCKING finding stands.

STEP 4 - COMMITS (Conventional Commits with a scope, explicit paths, bodies required, no em
dashes, no emojis):
  1. `feat(server): add the bounded linked-member change feed`
  2. `feat(server): add GET /internal/discord/outbox draining all four streams in one envelope`
  3. `test(server): pin outbox query counts, ordering, and overflow behavior`
The winners TTL cache rides commit 2 (it exists to keep the drain query-free), unless it grows
big enough to read on its own. Fold docs/discord-bot-stability/progress.md and
docs/discord-bot-stability/state.md into the final commit. If the feed wiring is large enough
to read as its own change, split it out as a fourth commit (`feat(server): enqueue link changes
at every flex-relevant transition`).

STEP 5 - ACCEPTANCE (each item verifiable, check them off explicitly in the final response):
  - state.md lists EVERY feed site found in STEP 1, with file path, symbol, and the transition
    it covers, and every listed site has an enqueue plus a test.
  - `GET /internal/discord/outbox` exists as a RouteDef behind discordGate with no legacy arm,
    and its surface_inventory row was hand-added; the four spine tests are green.
  - A test proves ONE account-lookup query serves all four streams: a drain containing relay,
    activity, winners, and change items performs exactly one identity IN query, counted off the
    makePool `calls` array per ruling R1 (state the number in the final response).
  - The winners lookup is wrapped in a 30 to 60 second TTL cache busted at day finalization,
    with tests for its hit, miss, and bust arms (memory: a cached-read bust refuses in-flight
    joiners, and a captured clock does not move under fake timers).
  - A test proves the zero-query pin: an empty drain performs ZERO Postgres queries on the
    in-memory streams unconditionally, and ZERO on the winners stream while its cache is warm.
    A second test pins the winners lookup to at most once per drain.
  - A test proves the drain is destructive: a second immediate drain returns empty.
  - A test proves mixed-stream ordering is stable and documented, and that per-stream cap
    overflow drops the oldest items rather than the newest.
  - A payload-size assertion at the D18 envelope: a full drain at cap on every stream stays
    within a stated size bound (state the measured size in the final response).
  - `npx tsc --noEmit` clean, `npm run build:server` green, `npm run ci:changed` clean.

STEP 6 - DOCS: update docs/discord-bot-stability/progress.md (Phase 5 status row and every
Phase 5 checkbox) and docs/discord-bot-stability/state.md (the feed-site enumeration as a named
section, the new endpoint and module under "Created by this packet", plus any drift found in
the key file paths). Record surprising rules to memory, one fact per file.

STEP 7 - FINAL RESPONSE: phase status, files touched (absolute paths), the feed-site
enumeration count and any transition deliberately not wired with its reason, validation results
command by command, reviewer verdicts, deferrals, and a one-line handoff for the Phase 5 QA
session.

KNOWN GATE FAILURE, exactly ONE, do not chase it and do not report it as a regression:
`tests/malware_scan.test.ts` and the gate's malware step fail whenever a sibling session has a
worktree parked under `.worktrees/` or `.claude/worktrees/`, because the scanner walks the whole
tree. Diagnose by running the scanner from INSIDE a clean detached worktree of HEAD created
OUTSIDE the repo root, and remove your OWN worktree before gating. The gate aborts there BEFORE
tsc and the builds, so run those by hand.

OWED TO THE MAINTAINER, do not work around it: the three Phase 3 D13 cadence keys
(`DISCORD_ROLE_SYNC_INTERVAL_MS`=300000, `DISCORD_PRESENCE_DEBOUNCE_MS`=4000,
`DISCORD_RELAY_POLL_MS`=3000) are still absent from `.env.example`. Every `.env*` path is denied
at the HARNESS level for both Read and Bash, so no session can add them. Phase 4 added no env
key. If Phase 5 adds one, it inherits the same block: do the rest and re-surface the request.

STOPPING RULES:
  - STOP AND SURFACE if a flex-relevant state transition has NO locatable server-side change
    feed site (for example, if a class change or top-character switch happens somewhere the
    server never learns about with an account id in hand). Name the transition, list where you
    searched, and give the options. Do not invent a new hook, do not add a polling fallback,
    and do not silently drop the transition.
  - STOP if wiring a site would require a new query on a hot path just to discover whether the
    account is linked. Report the site and the cost instead.
  - STOP if collapsing the identity lookups would change any existing item shape in a way
    Phase 6 cannot consume without also changing the existing per-endpoint routes (D11 keeps
    those frozen).
```
