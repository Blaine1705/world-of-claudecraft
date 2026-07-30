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

```
This is Phase 4 of the Discord Bot Stability packet: Server set-based endpoints.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).
ULTRACODE: not required for this phase. Use parallel Agent fan-out (STEP 2), not a Workflow.

Goal: make the game server answer the bot's needs with set-based work: one batched flex endpoint
covering linked members only, one multi-row members-meta upsert that skips unchanged rows, and a
green test baseline for the two in-memory queue modules Phase 5 will refactor.

STEP 0 - PRE-FLIGHT: run `git status` in the worktree and confirm it is clean; ASK before
touching anything if it is dirty (another session may share this checkout, and commits in this
packet use EXPLICIT paths, never `git add -A`). Memory scan of MEMORY.md for: server SQL and
pg traps, HTTP pipeline / RouteDef traps, test-pin traps, and cached-read traps.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn ONE Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-04-server-batch-endpoints.md, and these source files:
  - server/internal.ts (RouteDef table around :329-549; the FROZEN legacy
    handleDiscordInternal ladder around :75-241; the members-meta arms at :212-229 legacy and
    :514-538 RouteDef; clampInt and the ok/fail envelope helpers)
  - server/discord.ts (discordFlexForAccount around :950, the status payload around :798,
    the presence cache around :185)
  - server/discord_db.ts (accountForDiscord :134, discordForAccount :122,
    setDiscordMemberMeta :590, discordIdsWithGuildFlair :576, the reward_ledger DDL :86-95)
  - server/discord_relay.ts (cap 50, drain splice) and server/discord_activity.ts (cap 100,
    30s dedupe TTL, the 512-key sweep)
  - server/db.ts (highestCharacterForAccount around :2669 and its JSONB-expression sort)
  - server/http/registry.ts (the internal routes import and the route assembly)
  - server/http/middleware/require_internal_secret.ts
  - tests/server/http/surface_inventory.ts, tests/server/http/parity.test.ts,
    tests/server/http/completeness.test.ts, tests/server/http/ownership_coverage.test.ts,
    tests/server/http/known_deviations.ts
  - tests/server/internal.test.ts (the runRoute rig, the hoisted module mocks, the
    members-meta cases), tests/discord_db.test.ts (the makePool fake with its `calls` array),
    tests/server/helpers/ (fakeCtx, the FakeDb classes, the barrel)
  - server/CLAUDE.md (hot-path seams, SQL placement) and server/http/CLAUDE.md (RouteDef
    contract, `npm run new:endpoint`, spine artifacts)
It returns, as CONCLUSIONS not file dumps:
  (a) the exact RouteDef shape a new internal route must have (method/path/surface/meta/
      middleware/handler, which gate const, how ok/fail write the envelope);
  (b) the current members-meta behavior on BOTH arms, field by field, including every clamp
      and cap, so the bulk rewrite can be proven behavior-identical;
  (c) the full query fan-out of one flex payload today (which functions, how many statements,
      which are per-account) and which of them can be batched by account id;
  (d) how tests/server/internal.test.ts drives a route (its vi.mock module fakes plus the
      runRoute helper) and how tests/discord_db.test.ts counts SQL statements (the hand-rolled
      makePool fake and its `calls` array). Ruling R1 in state.md governs here: reuse the rig
      the matching suite already uses, count every query-count pin off that `calls` array, and
      never invent a raw pg mock;
  (e) the exact surface_inventory row shape for an internal Discord route, and what the
      parity / completeness / ownership_coverage tests will demand of a RouteDef-only route
      with no legacy twin;
  (f) whether tests/discord_relay.test.ts (which covers src/sim/discord_relay.ts, NOT the
      server module of the same name) forces a different file name for the new queue tests.

STEP 2 - EXECUTE: four agents. Agents C and D touch files nobody else touches and run in
PARALLEL with agent A. Agents A and B both edit server/internal.ts, server/discord_db.ts, and
tests/server/internal.test.ts, so run B only after A returns (do not run them concurrently and
do not reach for worktree isolation for a two-agent sequence).
  - Agent A (flex-batch slice): add the batched read function to server/discord_db.ts (or
    server/discord.ts if the Explore report shows the payload assembly belongs there; SQL
    lives only in db.ts / *_db.ts either way). Ruling R3 in state.md: this phase MAY add
    batched set-based variants of per-account reads (the top-character read and its friends)
    in db.ts / *_db.ts to serve flex-batch, and that is the point of the phase, not scope
    creep. Keep every per-account original in place for its existing callers and do not
    re-point those callers here. Then add the new RouteDef
    `POST /internal/discord/flex-batch` to the server/internal.ts routes table, behind the
    same discordGate the other Discord routes use. Body is a list of Discord user ids;
    validate and clamp it the way members-meta does (array cap, per-id length slice, drop
    non-strings). Resolve links with ONE `discord_links` IN pass, then batch the follow-on
    loads by account id. UNLINKED ids get no fabricated payload. Tests in
    tests/server/internal.test.ts plus tests/discord_db.test.ts, including a query-count
    assertion that the statement count for a 200-id batch equals the count for a 1-id batch.
  - Agent B (members-meta bulk upsert, runs after A): replace the per-member serial UPDATE
    with ONE multi-row statement (unnest arrays) that skips rows whose stored values are not
    `IS DISTINCT FROM` the incoming ones, and land it on BOTH the RouteDef arm and the frozen
    legacy handleDiscordInternal arm in this same change (D9). The response keeps `updated`
    and gains a count of unchanged rows skipped. Every existing clamp and cap pin stays
    green. Also add the `reward_ledger` keep-forever comment at its DDL (D12).
  - Agent C (queue tests): first tests for server/discord_relay.ts and
    server/discord_activity.ts. Cover: enqueue then drain returns items in FIFO order and
    leaves the queue empty; overflow past the cap drops the OLDEST items and keeps the cap;
    the depth accessor tracks both; activity dedupe suppresses a repeat key inside the TTL and
    admits it at and past the boundary (test both sides of the boundary, with the injected
    `now`, never a real clock); the 512-key sweep prunes only expired keys. File names must
    not collide with tests/discord_relay.test.ts, which covers the unrelated
    src/sim/discord_relay.ts; put a comment in the new files naming that trap.
  - Agent D (spine rows): hand-add the surface_inventory.ts row for the new route (dispatcher
    internal, the secret-discord auth scope, the same content-type class as its siblings,
    handler anchored on a symbol or route string, never a line number) and run the four spine
    tests. This row is for a RouteDef-only route with NO legacy twin; if completeness or
    parity demands a legacy-arm counterpart, STOP and report rather than adding a legacy arm
    (D9 forbids a legacy twin for new endpoints).
Give each agent the Explore summary, not the raw planning docs.

INVARIANTS IN PLAY:
  - D9 (endpoint placement): new endpoints are RouteDef-only, no legacy twin, behind
    requireInternalSecret, with HAND-ADDED rows in tests/server/http/surface_inventory.ts; a
    behavior edit to an EXISTING internal route (members-meta here) lands on BOTH the RouteDef
    and the frozen legacy arm in the same change, or gets a ledgered deviation in
    tests/server/http/known_deviations.ts.
  - D10 (members-meta shape): ONE multi-row upsert (unnest arrays) skipping unchanged rows via
    `IS DISTINCT FROM`; the 1000-member server cap and the 200-member bot batch both stand.
  - D11 (no retirement yet): the existing per-endpoint GET routes (relay, activity, winners,
    flex) stay in place and keep working; retiring them is a post-packet follow-up issue.
  - D12 (retention): `reward_ledger` is an audit ledger and gets an explicit keep-forever
    comment at its DDL instead of a prune.
  - D18 (scale envelope): design and assert at 1,000 concurrent players and 5,000 guild
    members; query-count and payload assertions pin against fixtures at that scale where
    practical.
  - D7 (dependencies): zero new npm packages.
  - Pipeline contract: handlers are req/res-free `(ctx) => Awaitable<unknown>` writing through
    the module's ok/fail helpers; SQL lives only in db.ts / *_db.ts; SQL is parameterized;
    errors are stable codes from the append-only error_codes.ts.
  - Copy and commit rules: no em dashes, no en dashes, no emojis anywhere (code, comments,
    docs, commit text); commit with EXPLICIT paths, never `git add -A`.
  - src/sim/ and the wire protocol are untouched by this packet.

OUT OF SCOPE: the outbox endpoint and the linked-member change feed (Phase 5); any bot/ change
(Phase 6); deleting or retiring the existing per-endpoint internal routes (D11); deploy assets
(Phase 7); observability counters (Phase 8); /api/discord caching (Phase 9); any new table or
DDL beyond the reward_ledger comment; any change to the presence route.

STEP 3 - VALIDATION + REVIEW: run the state.md server-only row: `npx tsc --noEmit`, then
`npx vitest run tests/server/internal.test.ts tests/discord_server.test.ts
tests/server/discord.test.ts tests/discord_db.test.ts`, then the http spine
(`npx vitest run tests/server/http/parity.test.ts tests/server/http/completeness.test.ts
tests/server/http/ownership_coverage.test.ts tests/server/http/surface_inventory.test.ts`),
then the new queue test files, then `npm run build:server`, then `npm run ci:changed` (scoped
`--write` on changed files only if it reports format diffs, never a whole-tree write).
Dispatch reviewers per the Review Dispatch Matrix in implementation-plan.md, matching rows only:
privacy-security-review (server/ plus SQL and secret-gated surface), migration-safety (a
server/*_db.ts DDL edit), database-performance-reviewer (new SQL, query cadence and
cardinality, write amplification). Do NOT spawn cross-platform-sync, architecture-reviewer, or
frontend-seam-reviewer; if a matrix row for those matches, the phase went out of scope.
Prompt every reviewer for COVERAGE, not filtering. Resume a truncated reviewer with: "Stop
reading more files. Output the full report now. No more tool calls. Format: BLOCKING /
SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do not commit while any BLOCKING finding stands.

STEP 4 - COMMITS (Conventional Commits with a scope, explicit paths, every commit carries a
body of 1 to 4 plain sentences saying what changed and why, no em dashes, no emojis):
  1. `feat(server): add POST /internal/discord/flex-batch for linked-member batch reads`
  2. `feat(server): collapse members-meta into one multi-row upsert that skips unchanged rows`
  3. `test(server): cover the discord relay and activity queue modules`
  4. `docs(server): record the reward_ledger keep-forever retention decision`
Fold docs/discord-bot-stability/progress.md and docs/discord-bot-stability/state.md into the
final commit of the phase.

STEP 5 - ACCEPTANCE (each item verifiable, check them off explicitly in the final response):
  - `POST /internal/discord/flex-batch` exists in the server/internal.ts routes table behind
    discordGate, and has NO arm in handleDiscordInternal.
  - A test proves the SQL statement count for a 200-id batch equals the count for a 1-id batch,
    counted off the makePool `calls` array per ruling R1 (state the number in the final
    response).
  - Any per-account read that gained a batched variant still exists in its per-account form and
    its existing callers are unchanged (R3).
  - A test proves an unlinked id yields no payload for that id, and that an over-cap array,
    over-long ids, and non-string entries are clamped or dropped exactly like members-meta.
  - members-meta issues ONE statement per request regardless of member count; re-pushing
    identical meta reports zero rows updated and a non-zero skipped count; `updated` keeps its
    existing meaning for changed rows.
  - Both members-meta arms produce identical responses for identical bodies (spine parity
    green), or a ledgered deviation exists in known_deviations.ts with a stated reason.
  - The surface_inventory row was hand-added; surface_inventory, parity, completeness, and
    ownership_coverage tests are green.
  - The reward_ledger DDL carries the keep-forever comment and no prune was added.
  - tests for server/discord_relay.ts and server/discord_activity.ts exist under names that do
    not collide with tests/discord_relay.test.ts, and cover cap overflow, drain-empties,
    both sides of the dedupe TTL boundary, and the key sweep.
  - `npx tsc --noEmit` clean, `npm run build:server` green, `npm run ci:changed` clean.

STEP 6 - DOCS: update docs/discord-bot-stability/progress.md (Phase 4 status row and every
Phase 4 checkbox) and docs/discord-bot-stability/state.md ("Created by this packet": the new
endpoint, the new modules or functions, the new test files; plus any drift you found in the
key file paths section). Record genuinely surprising rules to memory, one fact per file.

STEP 7 - FINAL RESPONSE: phase status, files touched (absolute paths), validation results
command by command, reviewer verdicts, anything deferred, and a one-line handoff for the
Phase 4 QA session.

STOPPING RULES:
  - STOP if the bulk upsert cannot keep BOTH members-meta arms behavior-identical. Report the
    exact divergence, the proposed known_deviations.ts row text, and wait. Do not invent a
    deviation and do not silently let the arms drift.
  - Do NOT stop on the per-account reads: ruling R3 permits adding batched set-based variants
    of them in db.ts / *_db.ts for flex-batch, with the per-account originals left in place for
    their existing callers. STOP only on the hidden-N+1 failure: never ship a per-item loop
    dressed up as "batched". If some read genuinely cannot be batched, report the shape and
    cost of what a batched version would need before writing any loop.
  - STOP if any work would require touching src/, the wire protocol, or a new table.
  - STOP and surface the proposed code first if the new route seems to need an error code that
    error_codes.ts does not already have.
```
