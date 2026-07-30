# Phase 6: Bot consumes the new surface

Phases 4 and 5 built the cheap server surface; this phase is where the incident's load profile
actually changes. The bot stops asking for one flex payload per online Discord user and starts
asking for the linked set in batches; the three 3-second pollers and their per-user GETs
collapse into one outbox loop on the Phase 3 scheduler at the D1 adaptive cadence; the sweep
iterates ONLY linked members (D6), dispatches every Discord write through the Phase 2 governor,
and spreads those writes across the sweep window instead of firing them in one burst. The old
client methods and poll wiring are deleted in the same change, because a dead path that still
compiles is a path a future session will re-enable. The measurable outcome is the one the
incident named: roughly 110 established sockets to the game server at steady state becomes a
handful.

```
This is Phase 6 of the Discord Bot Stability packet: Bot consumes the new surface.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).
ULTRACODE: not required. Use parallel Agent fan-out (STEP 2), not a Workflow.

Goal: rewire the bot onto flex-batch plus the outbox, sweep only linked members through the
governor with writes spread across the sweep window, and delete every path the new surface
replaces.

STEP 0 - PRE-FLIGHT: run `git status` in the worktree and confirm it is clean; ASK before
touching anything if it is dirty (this checkout may be shared, and commits use EXPLICIT paths,
never `git add -A`). Memory scan of MEMORY.md for: fake-timer and captured-clock traps,
scheduler and backoff traps, test-pin traps, and any bot-domain entries.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn an Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-06-bot-new-surface.md, and these files:
  - bot/main.ts (the wiring; the role sync around :203-251 including the per-user
    `server.flex` read and the nickname write; the gateway dispatch around :254-390 including
    GUILD_CREATE, PRESENCE_UPDATE, GUILD_MEMBER_ADD/UPDATE/REMOVE and GUILD_MEMBERS_CHUNK; the
    poll wiring and the interval block around :518-537)
  - bot/server_client.ts (the call envelope at :32-57 and every method on the class)
  - bot/logic.ts (the pure protocol and diff helpers, computeRoleSync, buildLevelNick, the
    members-meta batch constant), bot/config.ts, bot/discord_api.ts, bot/gateway.ts
  - bot/rate_governor.ts and bot/scheduler.ts (the Phase 2 and Phase 3 modules this phase must
    use rather than work around) plus their test files
  - bot/CLAUDE.md (the pure/IO split convention) and tests/discord_bot.test.ts
  - the Phase 4 and Phase 5 server surface for the exact response shapes:
    server/internal.ts (the flex-batch and outbox RouteDefs), server/discord_link_changes.ts,
    and the Phase 5 outbox tests in tests/server/internal.test.ts
It returns, as conclusions:
  (a) an inventory of every outbound call the bot makes today: which method, which loop or
      event drives it, at what cadence, and which of them the new surface replaces;
  (b) the exact request and response shapes of flex-batch and the outbox, field by field, and
      which existing bot-side handler consumes each stream;
  (c) the governor's public seam (how a caller enqueues work, how it reports completion or
      failure) and the scheduler's public seam (how a loop is registered, how coalescing and
      the adaptive idle backoff are configured);
  (d) every reference to each ServerClient method the phase plans to delete, INCLUDING
      references from outside bot/ (tests import from bot/, for example
      tests/server/internal.test.ts imports a constant from bot/logic.ts);
  (e) which Phase 3 diff-before-write caches (nickname, members-meta) the linked-set sweep
      must keep feeding, so this phase does not regress D5.

STEP 2 - EXECUTE: three agents. A and B both edit bot/main.ts, so run B after A returns; C
touches the client and its tests and can run in PARALLEL with A.
  - Agent C (client surface): add `flexBatch()` and `drainOutbox()` to bot/server_client.ts
    following the existing `call()` envelope (secret header, timeout abort, envelope unwrap,
    null on failure). Delete the per-user flex, relay, activity, and winners methods ONCE they
    are unreferenced (keep `roles()`, which the /whoami interaction uses; keep the winners
    MARK method, the presence push, grant, setMember, pushMembersMeta, and flairedIds). Tests
    for the two new methods: request shape, batching, and the failure arms.
  - Agent A (linked set and sweep): maintain the linked-member set from flex-batch results plus
    the outbox link-change stream. The sweep iterates ONLY that set (D6), never the
    presence-derived online-user set, and every Discord write it makes goes through the Phase 2
    governor. Spread the writes across the sweep window rather than dispatching them in one
    burst, using the Phase 3 scheduler's existing facilities; do not add a second timer
    mechanism. Keep the Phase 3 nickname and members-meta diffs in force: a steady-state sweep
    with nothing changed performs ZERO Discord writes. Put the set maintenance itself in a
    pure, tested module (bot/CLAUDE.md pure/IO split, D8), not inline in main.ts.
  - Agent B (loop consolidation and deletion, runs after A): replace the three 3-second pollers
    and the flex sweep's per-user GETs with ONE outbox loop registered on the Phase 3 scheduler
    at the D1 adaptive cadence (3s while the previous drain returned items, decaying to 15s
    idle, env-configurable per D13). Fan the drained envelope out to the existing per-stream
    handlers. Presence push behavior is unchanged. Delete the replaced poll functions, their
    interval wiring, and any logic helper left unreferenced.
Give each agent the Explore summary, not the raw planning docs.

INVARIANTS IN PLAY:
  - D1 (transport): one consolidated outbox poll, adaptive 3s active decaying to 15s idle. No
    long-poll, no bot WebSocket, no second poller sneaking back in.
  - D2 / D3 / D4 (governor): ALL Discord REST dispatch goes through the Phase 2 governor. Do
    not add a bypass path, do not call the REST shell directly from the sweep, and do not
    defeat the breaker or the forbidden cache with a retry of your own.
  - D5 (diff before write): nickname PATCH only when the computed nick differs from the cached
    member nick; members-meta pushed only for members whose meta changed since the last
    SUCCESSFUL push; self-caused GUILD_MEMBER_UPDATE echoes stay suppressed. Phase 3 landed
    this; Phase 6 must not regress it.
  - D6 (sweep set): the sweep iterates linked members only, discovered via flex-batch and
    maintained by the outbox change feed. Never the whole online-Discord-user set.
  - D7 (dependencies): zero new npm packages. Connection bounding comes from app-level
    serialization (governor queues plus scheduler overlap guards) over default keep-alive
    fetch.
  - D8 (pure/IO split): new logic is a DOM-free pure module with Vitest coverage;
    server_client.ts and discord_api.ts stay thin IO shells; wiring only in main.ts.
  - D11 (server routes stay): the old per-endpoint internal routes remain on the server; the
    bot simply stops calling them. Do not delete or edit a server route in this phase.
  - D13 (operator levers): every cadence and threshold this phase introduces is
    env-configurable with a safe default, and gets recorded for the Phase 7 DEPLOY.md section.
  - D18 (scale envelope): integration assertions run at 1,000 concurrent players and 5,000
    guild members.
  - Copy and commit rules: no em dashes, no en dashes, no emojis anywhere; commit with EXPLICIT
    paths, never `git add -A`.
  - src/sim/ and the wire protocol are untouched.

OUT OF SCOPE: any server/ change (Phases 4 and 5 shipped the surface; if the bot needs a shape
the server does not provide, that is a stopping rule, not a server edit); deploy assets, the
compose healthcheck, and the fatal-close exit (Phase 7); observability counters (Phase 8);
/api/discord caching (Phase 9); retiring the now-unused server routes (D11); two-way relay or
any new bot feature.

STEP 3 - VALIDATION + REVIEW: run the state.md bot-only row: `npx tsc --noEmit`, then
`npx vitest run tests/discord_bot.test.ts` plus every bot test file this phase added or
changed, then `npm run build:bot`, then `npm run ci:changed` (scoped `--write` on changed files
only if it reports format diffs, never a whole-tree write). Per the Review Dispatch Matrix in
implementation-plan.md, a bot-only diff matches NO reviewer row: spawn no domain reviewer and
run qa-checklist at phase end instead. If the diff turns out to touch server/ or a deploy file,
the phase went out of scope: stop and re-read this file. Prompt qa-checklist for COVERAGE, not
filtering. Resume a truncated agent with: "Stop reading more files. Output the full report now.
No more tool calls. Format: BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do not commit
while any BLOCKING finding stands.

STEP 4 - COMMITS (Conventional Commits with a scope, explicit paths, bodies required, no em
dashes, no emojis):
  1. `feat(bot): add flex-batch and outbox client methods`
  2. `feat(bot): sweep only linked members through the governor with spread writes`
  3. `refactor(bot): replace the three pollers with one outbox loop and delete the old paths`
  4. `test(bot): cover linked-set maintenance, outbox fan-out, and a full sweep cycle`
Fold docs/discord-bot-stability/progress.md and docs/discord-bot-stability/state.md into the
final commit.

STEP 5 - ACCEPTANCE (each item verifiable, check them off explicitly in the final response):
  - `grep` proves no remaining call to the deleted client methods anywhere in the repo, and the
    methods themselves are gone (not merely unused).
  - The sweep's iteration source is the linked set: a test drives a fixture where the online
    set is much larger than the linked set and asserts the sweep touched only the linked
    members (D6).
  - A test proves every Discord write in the sweep path goes through the governor (no direct
    REST shell call survives in the sweep).
  - A test proves writes are spread: at the D18 envelope the sweep does not dispatch its whole
    write set in one tick.
  - A steady-state test at the D18 envelope with nothing changed performs ZERO Discord writes
    and ZERO members-meta pushes (D5 not regressed).
  - Exactly ONE outbox loop exists; the three 3-second pollers and their intervals are gone; a
    test proves each drained stream (relay, activity, winners, link changes) reaches its
    handler, one assertion per stream.
  - The outbox loop's cadence adapts (busy drain keeps the fast cadence, an empty drain decays
    toward idle) and both bounds are env-configurable with safe defaults (D13); the new env
    keys are recorded in state.md for the Phase 7 DEPLOY.md section.
  - An end-to-end test runs one full sweep cycle against a fake server at the D18 envelope.
  - Connection count: derive the steady-state expectation analytically from the final loop
    inventory (one outbox loop, the presence push, the sweep's serialized governor queue) and
    state it. Where a local run is possible (`npm run server` plus the built bot pointed at
    it), measure with `lsof -nP -iTCP:8787 -sTCP:ESTABLISHED | wc -l` and report the number
    against the incident's ~110. If no Discord credentials are available to run the bot, record
    the analytic bound plus the loop inventory and mark the socket count as verify-at-deploy in
    progress.md; do not claim a measurement you did not take.
  - `npx tsc --noEmit` clean, `npm run build:bot` green, `npm run ci:changed` clean.

STEP 6 - DOCS: update docs/discord-bot-stability/progress.md (Phase 6 status row and every
Phase 6 checkbox) and docs/discord-bot-stability/state.md (new env keys, new modules, deleted
client methods, and the connection-count result or its verify-at-deploy status). Record
surprising rules to memory, one fact per file.

STEP 7 - FINAL RESPONSE: phase status, files touched (absolute paths), the before-and-after
outbound call inventory, validation results command by command, the qa-checklist verdict,
deferrals, and a one-line handoff for the Phase 6 QA session.

STOPPING RULES:
  - STOP if deleting an old client method would break a caller OUTSIDE bot/. Name the caller
    and the file, and do not delete the method until the phase is re-scoped.
  - STOP if the Phase 2 governor or the Phase 3 scheduler lacks a seam the sweep needs. Report
    what is missing. Do NOT add a second dispatch path around the governor or a bare timer
    beside the scheduler.
  - STOP if the linked set cannot be maintained without a full-roster scan or a periodic
    re-discovery sweep; that would reintroduce the load profile this packet exists to remove.
  - STOP if the server surface returns a shape the bot cannot consume. Editing server/ is out
    of scope for this phase; report the gap instead.
```
