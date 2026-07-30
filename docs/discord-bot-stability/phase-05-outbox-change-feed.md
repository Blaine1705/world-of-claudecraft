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
Worktree: /Users/fernando/Documents/wocc-discord-bot (branch feature/discord-bot-stability).
ULTRACODE: not required, but the feed-site enumeration in STEP 1 must be EXHAUSTIVE; give the
Explore agent "very thorough" breadth and treat its output as a deliverable, not a hint.

Goal: one server-side outbox that the bot can drain in a single request, fed by a bounded
linked-member change feed wired at EVERY site where the server already learns a linked
account's flex-relevant state changed.

STEP 0 - PRE-FLIGHT: run `git status` in the worktree and confirm it is clean; ASK before
touching anything if it is dirty (this checkout may be shared, and commits use EXPLICIT paths,
never `git add -A`). Memory scan of MEMORY.md for: server hot-path and cached-read traps, pg
traps, HTTP pipeline traps, and the daily-rewards module memo traps.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn an Explore agent, breadth
"very thorough", over docs/discord-bot-stability/state.md, docs/discord-bot-stability/
progress.md, docs/discord-bot-stability/phase-05-outbox-change-feed.md, and these files:
  - server/internal.ts (the RouteDef table around :329-549, especially the relay, activity, and
    daily-rewards-winners handlers and their enrichment loops; the FROZEN legacy ladder
    :75-241; the Phase 4 flex-batch route as the template for a new RouteDef)
  - server/discord_relay.ts and server/discord_activity.ts (the bounded-FIFO pattern the new
    module copies: cap constant, drain splice, depth accessor, injected `now` dedupe)
  - server/discord_db.ts (discordForAccount :122, accountForDiscord :134, linkDiscordToAccount
    :146, unlinkDiscord :190, grantRewardPoints :382, setDiscordGuildMember :210)
  - server/discord.ts (discordFlexForAccount around :950, the link and unlink call sites, the
    status tier helper) and server/db.ts (highestCharacterForAccount around :2669)
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
