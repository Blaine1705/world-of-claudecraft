# Phase 8: Observability

The 2026-07-29 incident ran for two days before anyone looked, and it was found by reading
container logs by hand. Everything the governor and the scheduler now know (429s by scope,
breaker state and opens, queue depths, sweep durations, outbox drain sizes) exists only
inside the bot process. This phase carries those numbers out on a channel that already
exists and already costs nothing: the presence POST the bot sends every few seconds. The
server holds them in memory exactly like the presence snapshot, and renders them as
Prometheus lines on the metrics path Grafana already scrapes. No new endpoint, no new
table, no new poll: the point is to see the next storm forming, not to build a metrics
system.

Starter prompt for the session:

```
This is Phase 8 of the Discord Bot Stability packet: Observability.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-discord-bot (branch feature/discord-bot-stability).
No ultracode Workflow for this phase: it is one bot slice, one server slice, and a doc
note, so a parallel Agent fan-out is the lightest orchestration that fits. Its QA session
runs ultracode.

Goal: the bot's rate-limit and loop counters ride the existing presence POST, are clamped
and held server-side like presence, and render as Prometheus series on the existing metrics
path, with the two alert-worthy signals (breaker opens, 429 rate) documented.

STEP 0 - PRE-FLIGHT: git status clean in the worktree (ask if dirty; another session may
share the checkout). Memory scan of MEMORY.md for: prom-counter-no-scrape-backfill (READ
IT, it decides the Counter versus Gauge shape below), the cached-read and captured-clock
entries (staleness testing), and the shared-worktree commit rule (explicit paths, never
git add -A).

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly): spawn an Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md, this phase
file, and:
  - bot/rate_governor.ts (the Phase 2 counter outputs: what is exposed, in what shape, and
    whether the values are cumulative or windowed), bot/scheduler.ts (queue depth and run
    duration, if exposed), and the Phase 6 outbox loop (drain sizes)
  - bot/main.ts (the presence push site and its debounce), bot/server_client.ts (the
    presence call envelope)
  - server/internal.ts: the presence handler on BOTH arms, the frozen legacy arm near
    :107-119 and the RouteDef near :376-394. Report the clamp helpers they use (clampInt,
    the string slice bounds, the voice array cap) and the body-size limit readBody enforces
  - server/discord.ts near :168-204: the presence snapshot type, setDiscordPresenceCache,
    and discordPresenceCache with its 5-minute staleness zeroing (note WHICH fields it
    zeroes and which it preserves)
  - server/http/metrics.ts (createHttpMetrics, the private Registry, metricsText),
    server/http/business_metrics.ts (the Gauge-with-collect pattern, the Counter touched
    at registration with inc(labels, 0), the naming convention), server/http/game_metrics.ts
    (registerGameStateMetrics reading a live source object)
  - server/main.ts around :2595 and :3008-3030 (where the exporter is built and where the
    register functions are called at boot), and :2800 (the /metrics route)
  - tests/server/http/business_metrics.test.ts (how metric rendering is asserted today),
    tests/server/internal.test.ts (how the presence route is tested today),
    tests/server/http/{parity,completeness,ownership_coverage}.test.ts and
    known_deviations.ts
  - DEPLOY.md around :342-348 (the metrics endpoint and scrape section this phase extends)
It returns: the exact counter surface the bot can offer today; the exact clamp idiom used by
the presence handlers on both arms; the presence staleness rule verbatim; the metric naming
convention and registration wiring; and whether any existing test pins the presence request
or response shape in a way this change must update.

STEP 2 - EXECUTE: two parallel Agents (bot slice, server slice), then a short doc pass. Give
each agent the Explore summary, not the raw planning docs.

  Agent A, bot slice (bot/ + tests):
  - A small pure module that collects the counter sources into ONE bounded snapshot with a
    FIXED key set (never an open map, never a caller-supplied key), and its own tests. Do
    not append this to main.ts.
  - The presence push attaches the snapshot to the existing presence POST body. Presence
    keeps working unchanged when the snapshot is absent or partial: this is telemetry, and
    it must never be able to fail a presence push.
  - Decide and record whether the bot sends cumulative totals or per-interval deltas. That
    choice constrains the server rendering shape (see Agent B), so make it first, state the
    reasoning, and record it in state.md.
  - Tests: snapshot shape and bounds; presence push still succeeds with counters missing;
    counters never throw out of the push path.

  Agent B, server slice (server/ + tests):
  - Both presence arms accept the counters block: the RouteDef arm AND the frozen legacy
    handleDiscordInternal arm, in this same change (D9). Every field is clamped with the
    same idiom the surrounding presence fields use; unknown or malformed fields are dropped,
    not stored. Confirm the enlarged body still fits whatever limit readBody enforces, and
    say what that limit is in the final response.
  - Hold the snapshot in a sibling module (its own file next to the presence cache, not a
    new block inside a big file), following the presence-cache pattern: a setter the route
    calls, a getter the metrics registration reads, and staleness zeroing that mirrors the
    presence rule. Say explicitly which fields zero and which persist when the bot goes
    quiet, and test the boundary.
  - Render the series on the EXISTING metrics path by adding a register function in the
    style of business_metrics.ts / game_metrics.ts, wired at boot next to the existing
    register calls. Follow the existing metric naming convention.
  - Respect the prom-counter no-backfill rule (memory: prom-counter-no-scrape-backfill): a
    prom-client Counter has no set(), so a pushed value CANNOT be backfilled at scrape time.
    Only two shapes work: a Gauge with collect() reading the cached snapshot, or a real
    Counter incremented from the push event by a computed delta. Pick one consciously,
    record the decision and its reasoning in state.md, and handle the consequence you chose:
    a Gauge of a cumulative total resets to a lower value when the bot restarts (rate() is
    not meaningful on it), and a delta-incremented Counter needs an explicit guard for that
    same restart, where the pushed value goes DOWN.
  - Bound label cardinality hard: the 429 scope label takes values from a fixed allowlist
    (user, global, shared) and nothing else. A bot-supplied string must never become a label
    value directly. Decide whether an unrecognized scope is dropped or bucketed, and pin it.
  - Touch every fixed labeled series once at registration so it renders at 0 before the
    first push (an absent series and a zero series look different to a dashboard and to an
    alert).
  - Tests: clamp arms for each new field on BOTH presence arms (in range, over the cap,
    wrong type, missing); the rendered exposition text contains the expected series with
    expected values after a push; the series render at 0 before any push; staleness zeroes
    the values at the boundary (inject the clock, do not sleep; see the captured-clock
    memory entries before writing a fake-timer test).

  Doc pass (DEPLOY.md): extend the existing metrics section with a short Grafana note that
  names each new series and states the two alert-worthy signals: breaker opens (any open is
  worth an alert) and the 429 rate. Keep it to what an operator needs at 2am. Do not invent
  threshold numbers that nobody has validated; say what to watch and what "normal" looks
  like after this packet (429s near zero).

INVARIANTS IN PLAY:
- D16 (this phase's headline): bot counters piggyback the existing presence POST, held in
  server memory, exposed as prom lines on the existing metrics path. No new tables.
- D9 (dual-arm rule): presence is an EXISTING internal route, so this behavior edit lands on
  BOTH the RouteDef and the frozen legacy handleDiscordInternal arm in the same change, or
  carries a ledgered deviation in tests/server/http/known_deviations.ts. A deviation is a
  deliberate, justified choice, never the accident of forgetting an arm.
- D13 (operator levers): any new cadence or threshold this phase adds is env-configurable
  with a safe default and documented in DEPLOY.md.
- D18 (scale envelope): the counter block is fixed-size and bounded regardless of guild size
  or player count; nothing here grows with 5,000 members.
- D8 (pure/IO split): the bot-side collector and the server-side snapshot module are pure
  and directly tested; the route handlers and the registration function stay thin.
- Non-negotiables from state.md: no SQL and no DDL in this phase; handlers stay
  req/res-free; secrets stay env-only; commit with explicit paths, never git add -A; no em
  dashes, en dashes, or emojis anywhere.

OUT OF SCOPE: new tables, new endpoints, and new routes of any kind; changing the presence
cadence or the presence payload's existing fields; the /metrics auth gate; touching the
governor's or scheduler's behavior (read their counters, do not change what they count);
Grafana dashboards or alert rules as artifacts (a DEPLOY.md note only); /api/discord (Phase
9).

STEP 3 - VALIDATION + REVIEW: run the state.md matrix rows that match the diff. Bot side:
`npx tsc --noEmit`, `npx vitest run tests/discord_bot.test.ts` plus the new bot test files,
`npm run build:bot`. Server side: `npx vitest run tests/server/internal.test.ts
tests/discord_server.test.ts tests/server/discord.test.ts tests/discord_db.test.ts` plus the
new metrics test file, the http spine (`npx vitest run tests/server/http/parity.test.ts
tests/server/http/completeness.test.ts tests/server/http/ownership_coverage.test.ts`), and
`npm run build:server`. Then `npm run ci:changed` (scoped --write only on files you changed).
Dispatch reviewers per the Review Dispatch Matrix in implementation-plan.md, matching rows
only: privacy-security-review matches (server/ change). database-performance-reviewer
matches ONLY if you touched a database call site or added stored growth, which this phase
should not; if it matches, ask yourself why. migration-safety does not match (no DDL, no
persisted-shape change: an in-memory snapshot is not persisted state). cross-platform-sync,
architecture-reviewer and frontend-seam-reviewer do not match; if one does, the phase went
out of scope. Prompt every reviewer for COVERAGE, not filtering. Resume a truncated reviewer
with: "Stop reading more files. Output the full report now. No more tool calls. Format:
BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do not commit while a BLOCKING finding
stands.

STEP 4 - COMMITS (Conventional Commits with a scope, explicit paths, every commit carries a
body of 1 to 4 plain sentences saying what changed and why, no em dashes, no emojis):
1. feat(bot): report governor and loop counters on the presence push
2. feat(server): accept and expose the bot counters as prometheus series (both presence
   arms, clamped, with staleness zeroing)
3. test(server): pin the counter clamps, exposition rendering, and staleness boundary
4. docs(deploy): name the new bot series and the two alert-worthy signals

STEP 5 - ACCEPTANCE (each item verifiable, not asserted):
- A test drives a presence POST with counters through BOTH arms and asserts identical
  stored state, or a ledgered deviation exists with a written justification.
- Each new field has an over-cap, wrong-type, and missing arm asserted; no clamp that
  existed before this phase is loosened.
- The exposition text (metricsText) contains every new series at 0 before any push, and the
  pushed values after one.
- Staleness zeroing is asserted AT the boundary in both directions with an injected clock,
  not a sleep.
- The 429 scope label can only take allowlisted values; a test drives a hostile scope string
  and proves it cannot create a new series.
- `npx tsc --noEmit`, the bot and server suites, the http spine, both builds, and
  `npm run ci:changed` are green.
- DEPLOY.md names every new series and both alert signals.

STEP 6 - DOCS: tick the Phase 8 boxes in progress.md and set its status row; update state.md
with the recorded decisions (cumulative versus delta, Gauge versus Counter, the unknown-scope
rule, the staleness field list) and any new env keys. Same commit as the work, explicit
paths. Record surprising rules to memory.

STEP 7 - FINAL RESPONSE: phase status; files touched; validation results (command by
command); reviewer verdicts; the recorded decisions and the readBody body-size limit you
confirmed; deferrals; and a one-line handoff for the Phase 8 QA session.

STOPPING RULES:
- Stop and surface if a counter cannot ride the presence body without widening a documented
  clamp unsafely, or without pushing the body past the size limit readBody enforces. Drop
  the counter and report it rather than loosening a validation bound that exists for a
  reason.
- Stop and surface if the counters cannot land on both presence arms identically. A ledgered
  deviation is allowed, but only as a deliberate decision you state and justify, never as a
  silent one-arm change.
- Stop if this phase finds itself adding a table, a route, or a poll. None of the three is
  authorized here.
- Stop if a BLOCKING reviewer finding cannot be fixed inside this phase's scope.
```
