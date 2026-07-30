# Phase 2: Discord rate-limit governor

The 429 handler at `bot/discord_api.ts:26-31` is the incident's escalation engine: the wait is
clamped to 10 seconds while global penalties run far longer, a non-JSON 429 body (Cloudflare's
ban response) falls through to a 1 second retry, the `global` flag and every `X-RateLimit-*`
header are ignored, and call sites swallow the error so the sweep keeps going. This phase
replaces it with one pure, tested module that owns ALL Discord REST dispatch, so exceeding
Discord's contract becomes structurally impossible instead of a tuning problem: bucket-keyed
serialized queues remapped onto the returned bucket hashes, proactive gating that never
dispatches at `Remaining == 0`, a process-wide pause honoring the full `retry_after`, an
invalid-request circuit breaker that opens far below Discord's ban line, and a permanent-failure
cache for the 403s the old sweep retried forever. The module is pure and clock-injected, so its
behavior is provable in tests rather than observable only in production.

## Starter prompt

```
This is Phase 2 of the Discord Bot Stability packet: Discord rate-limit governor.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-discord-bot (branch feature/discord-bot-stability).
ULTRACODE: yes. This is the packet's highest-risk module and its test matrix is uniform batch
work (one arm per Discord response shape), so build the module serially and fan the test matrix
plus an adversarial pass out through a Workflow.

Goal: make every Discord REST call flow through one pure, tested governor that cannot exceed
Discord's documented rate-limit contract, even under fault.

STEP 0 - PRE-FLIGHT: run `git status` in the worktree and confirm it is clean with Phase 1
committed; another session may share this checkout, so ASK before touching anything you did not
create. Scan MEMORY.md for the domains in play: bot/Discord work, clock and fake-timer traps,
env parsing traps, test-pin traps, Biome on changed files, and shared-worktree commit care.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn one Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-02-rate-limit-governor.md, and these source files:
bot/discord_api.ts, bot/config.ts, bot/main.ts, bot/logic.ts, bot/server_client.ts,
bot/gateway.ts, bot/CLAUDE.md, the root CLAUDE.md, tests/discord_bot.test.ts plus the Phase 1
test files, scripts/build_bot.mjs, scripts/gate.mjs, and tsconfig.json.
It returns, as conclusions rather than file dumps:
  a. every Discord REST call the bot makes today, with its method, path shape, which path
     segment is the major parameter (guild_id, channel_id, webhook_id), and the call site;
  b. the current request/429/retry path line by line, and exactly which behaviors are load
     bearing for callers (what throws, what returns null, what is swallowed where);
  c. the Phase 1 injected-fetch seam signature on DiscordApi and how its tests drive it;
  d. bot/config.ts structure and how Phase 1's config tests are written;
  e. the repo's exemplar of a pure module with an injected clock, if one exists (name file and
     line), and the fake-timer conventions used in tests/.

STEP 2 - EXECUTE.

Stage 1 (serial, in the main loop): write bot/rate_governor.ts, a pure module with no IO. It
imports no fetch, no ws, no node timer, and never reads a wall clock directly: time comes from
an injected clock and a wait/sleep the caller provides. Whether the governor invokes an injected
dispatch callback or returns a "wait this long, then go" decision is your design call; both keep
the module IO-free, and both must be fully drivable from a test with a synthetic clock. Deliver:
  - Bucket registry: a provisional key of method plus route TEMPLATE plus major parameter, where
    the template keeps major parameter ids and does NOT interpolate non-major ids (a per-user key
    would defeat bucketing), remapped onto the `X-RateLimit-Bucket` hash after the first response
    from that route. The two keys must not double count once remapped.
  - Per-bucket serialized FIFO queues, so two writes into the same bucket never race.
  - Proactive gating (D2): never dispatch from a bucket whose last response reported
    `Remaining == 0`; wait out `Reset-After` first. Headers drive everything: no hard-coded
    per-route numeric limits anywhere (O2, they are runtime-discoverable only).
  - Global send-rate cap: DISCORD_MAX_RPS, default 8 (Discord's ceiling is 50).
  - Process-wide pause on any global-scope 429 for the FULL `retry_after` with no ceiling (D2),
    plus the Cloudflare arm: a 429 whose body is not JSON is treated as a ban response and pauses
    for DISCORD_BAN_PAUSE_MS (default 600000) with an error log.
  - Invalid-request circuit breaker (D3): a rolling 10 minute window counting local 401, 403, and
    429 responses, EXCLUDING scope `shared` (shared-scope 429s do not count toward Discord's ban
    counter); at DISCORD_BREAKER_LIMIT (default 300, against Discord's 10000 per 10 minutes per
    IP) sweeps and non-essential writes stop; a single half-open probe after a full quiet window,
    closing on success and re-opening on failure.
  - Permanent-failure cache (D4): a member that answers 401 or 403 is not retried until
    DISCORD_FORBIDDEN_TTL_MS (default 86400000, 24h) expires or the bot's own role position
    changes. Expose the invalidation hook even though nothing calls it until a later phase.
  - Counter outputs for Phase 8 (D16): requests, 429s by scope, breaker state and breaker opens,
    queue depths. A snapshot getter, no IO, no formatting.

Stage 2 (serial, in the main loop): rewire `DiscordApi.request()` through the governor.
  - Keep the REST base pinned at /api/v10 and pin it in a test (D14); keep the existing valid
    User-Agent.
  - Add `X-Audit-Log-Reason` (1 to 512 characters, plain ASCII, no em dashes or emojis) to member
    PATCHes.
  - Log `X-RateLimit-Scope` on every 429 (O5 is answered from these logs after deploy: whether
    member-write 429s come back as `user` or `shared` scope decides ban-counter exposure).
  - Preserve every caller-visible contract the Explore step identified. Pacing and error handling
    may change; WHICH calls the bot makes may not.
  - Add the new env keys to bot/config.ts with the defaults above and their BotConfig fields.
    Numeric env parsing has a known trap: an empty or non-numeric value must fall back to the
    default, not to 0 (memory: env-empty-numeric-default-shift).
  - Add the same four keys to the existing commented Discord block in .env.example, commented and
    carrying their defaults, in this change (ruling R8 in state.md). The full operator
    documentation of these keys still lands in DEPLOY.md in Phase 7 (D13 unchanged).

Stage 3 (ULTRACODE Workflow fan-out, uniform batch work): the governor test suite, one agent per
arm group, each agent owning its own test file section and none editing bot/rate_governor.ts:
  - Header-driven pacing: a response's Remaining and Reset-After gate the next dispatch in that
    bucket; two calls to the same bucket serialize; different buckets proceed in parallel up to
    the RPS cap; the provisional key remaps onto the returned bucket hash.
  - The three 429 scopes: `user`, `global` (process-wide pause), and `shared` (paused and
    retried, but NOT counted by the breaker). Every arm asserts the FULL retry_after is honored:
    a retry_after of 60 waits 60 seconds, not the old 10 second clamp. Pin that explicitly as the
    incident regression.
  - The HTML-body 429: a non-JSON body pauses for DISCORD_BAN_PAUSE_MS and logs an error, and
    does NOT fall through to a short retry.
  - Breaker: does not trip one below the limit, trips at the limit, old entries age out of the
    rolling window, the half-open probe runs only after a full quiet window, closes on success,
    re-opens on failure.
  - Forbidden cache: a 403 suppresses the next attempt for that member, TTL expiry allows a
    retry, and the role-position invalidation clears it early.
  - Counters: each counter moves exactly once per event, and the snapshot shape matches what
    Phase 8 will ship.
  - Determinism: the same inputs with the same injected clock produce the same dispatch schedule
    on two consecutive runs (record the schedule and compare, do not eyeball it).
  Before writing timing tests, read the memory entries cachedread-captured-clock-vs-fake-timers
  (a clock captured at construction does not move under fake timers) and
  settimeout-fractional-delay-fires-early (a fractional delay fires EARLY).

INVARIANTS IN PLAY (from state.md):
  - D2, the governor owns ALL Discord REST dispatch: bucket-keyed serialized queues, proactive
    gating at Remaining == 0, full retry_after with no ceiling, the non-JSON 429 ban pause,
    DISCORD_MAX_RPS default 8.
  - D3, the invalid-request breaker: rolling 10 minute window over local 401/403/429 excluding
    scope shared, DISCORD_BREAKER_LIMIT default 300, half-open probe after a quiet window.
  - D4, the permanent-failure cache: a 401/403 member is not retried until the role position
    changes or DISCORD_FORBIDDEN_TTL_MS expires.
  - D7, zero new npm dependencies: no rate-limiter package, no discord.js, no HTTP agent package.
    Connection bounding comes from app-level serialization over default keep-alive fetch.
  - D8, the pure/IO split: the governor is a DOM-free pure module with Vitest coverage,
    bot/discord_api.ts stays a thin IO shell, wiring stays in bot/main.ts.
  - D13, new cadences and thresholds are env-configurable with safe defaults; the DEPLOY.md
    documentation of these keys lands in Phase 7, so record the key names in state.md now.
  - D14, /api/v10 pinned, valid User-Agent kept, X-Audit-Log-Reason on member PATCHes,
    X-RateLimit-Scope logged from day one.
  - D16, the counters this phase emits are the ones Phase 8 ships on the presence POST.
  - D19, the QA session mutation-tests this module, so every guard needs a decisive test.
  - Packet non-negotiables: no src/ edit; secrets env only; no em dashes, en dashes, or emojis in
    code, comments, log lines, docs, or commits; commit with EXPLICIT paths, never `git add -A`.

OUT OF SCOPE: the sweep and its iteration set (Phase 3 and Phase 6), the poll loops and the
presence debounce (Phase 3), every server/ change (Phases 4 and 5), deploy and compose files plus
the DEPLOY.md bot section (Phase 7, with the .env.example key block the one exception R8 puts in
this phase), the presence-counter transport (Phase 8), and retiring any server endpoint the bot
calls (Phase 6). Do not change which Discord calls the bot makes, only
how they are dispatched.

STEP 3 - VALIDATION + REVIEW: run the state.md bot-only row: `npx tsc --noEmit`,
`npx vitest run tests/discord_bot.test.ts` plus the Phase 1 and Phase 2 bot test files,
`npm run build:bot`, and `npm run ci:changed` (scoped
`npx @biomejs/biome check --write <file>` for fixes, never a whole-repo write). At phase close
run `npm run gate` (exit-code-safe; never an ad-hoc && chain).
Dispatch reviewers per the Review Dispatch Matrix in implementation-plan.md, matching rows ONLY:
the bot code itself matches no row, but this phase edits .env.example, which the
`privacy-security-review` row lists as an env/deploy file, so spawn that reviewer plus
`qa-checklist` at phase end. If any OTHER matrix row matches (server/, src/net/, compose, CI),
the phase went out of scope. Prompt every reviewer for COVERAGE, not filtering. Resume a
truncated reviewer with: "Stop reading more files. Output the full report now. No more tool
calls. Format: BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do not commit while a BLOCKING
finding stands.

STEP 4 - COMMITS: Conventional Commits with a scope, explicit paths, and a BODY on every commit
(1 to 4 plain sentences saying what changed and why, wrapped near 72 columns). No em dashes, no
en dashes, no emojis, no trailers. The plan suggests `feat(bot)` twice plus `test(bot)`:
  1. feat(bot): add the pure Discord rate-limit governor
  2. feat(bot): dispatch every Discord REST call through the governor
  3. feat(bot): add the governor env knobs with safe defaults (bot/config.ts and .env.example)
  4. test(bot): cover pacing, every 429 scope, the breaker, and the forbidden cache
Fold 3 into 1 if the config change is a few lines; keep the tests as their own commit. Never
commit a real .env; only the commented example keys.

STEP 5 - ACCEPTANCE (every item verifiable by a command or an assertion, not by claim):
  - bot/rate_governor.ts is pure: a grep for fetch, ws, Date.now, setTimeout, setInterval, and
    performance.now in that file returns nothing, and every test drives it with a synthetic
    clock.
  - No hard-coded per-route rate numbers: every limit in the module comes from a response header
    or a config key (O2).
  - Every Discord REST call in bot/discord_api.ts is dispatched through the governor; no direct
    fetch remains except the single injected dispatch the governor drives.
  - The old behavior is provably gone: a test pins that a retry_after of 60 seconds waits 60
    seconds (no 10 second clamp) and that a non-JSON 429 body pauses for the ban interval instead
    of retrying after 1 second.
  - A test pins the /api/v10 base as a literal, a member PATCH carrying X-Audit-Log-Reason, and a
    429 log line that includes the scope.
  - Config defaults assert 8, 600000, 300, and 86400000, each with an empty-string env arm that
    still yields the default.
  - All four keys appear commented, with their defaults, in the .env.example Discord block (R8).
  - The breaker asserts both edges (limit minus one does not trip, the limit does), and the
    half-open probe has its own arm.
  - The determinism test compares two recorded schedules and passes on a repeat run.
  - `npx tsc --noEmit`, the bot test files, `npm run build:bot`, `npm run ci:changed`, and
    `npm run gate` all green.

STEP 6 - DOCS: update docs/discord-bot-stability/progress.md (the Phase 2 status row and its four
checkboxes) and docs/discord-bot-stability/state.md ("Current phase", the "Created by this
packet" list: bot/rate_governor.ts, the four new env keys with their defaults, the new test
files, and the counter names Phase 8 will consume) in the SAME commit as the work, with explicit
paths. The .env.example entries land with the config change itself per R8, not in this step, and
the operator documentation in DEPLOY.md stays Phase 7 work. Record surprising rules to memory as
one file per fact plus its MEMORY.md pointer.

STEP 7 - FINAL RESPONSE: phase status, files touched (absolute paths), validation results
(command plus outcome for each), reviewer verdicts, anything deferred with the reason, the four
env key names and defaults, and a one-line handoff for the Phase 2 QA session.

STOPPING RULES:
  - Stop and surface if the governor cannot be pure without a new dependency (D7). No
    rate-limiter package, no discord.js, no HTTP agent package. If measurements say a
    hand-rolled node:http agent wrapper is genuinely required, escalate to the user before
    writing it.
  - Stop if the rewire would change WHICH Discord calls the bot makes or their user-visible
    effect. Pacing and error handling are in scope; the call set is not.
  - Stop if the work appears to need an edit under src/ or server/, which means the phase went
    out of scope.
  - Stop if the worktree is dirty with work that is not yours.
```
