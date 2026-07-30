# Phase 1: Bot verification foundation

Nothing in the repo currently verifies the Discord bot. `tsconfig.json` includes `src`,
`headless`, `tests`, `server`, and `private`, so the only bot file that gets type-checked is
`bot/logic.ts` (pulled in by the test that imports it); the other five files are unchecked, and
the bundle first compiles on the production host during `docker compose up --build`. This phase
changes no behavior at all. It makes the bot verifiable: `bot` joins the tsconfig include and
every latent type error that surfaces is fixed behavior-preserving, `build:bot` joins the
pre-merge gate and CI, the three IO shells accept an injected fetch, socket, and clock (plain
constructor parameters with production defaults) so Phases 2 and 3 can test them, the three
cadence constants move into their own module (ruling R6) so tests can read them without executing
the bot, and a baseline test suite pins today's config arms, the server call envelope, and those
cadence values.

## Starter prompt

```
This is Phase 1 of the Discord Bot Stability packet: Bot verification foundation.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-discord-bot (branch feature/discord-bot-stability).
No Workflow needed: this phase is small and mostly serial, and a 2-agent fan-out in STEP 2 is
the right size.

Goal: make the Discord bot verifiable (type-checked, gate-built, and testable through injected
IO seams) without changing one line of its runtime behavior.

STEP 0 - PRE-FLIGHT: run `git status` in the worktree and confirm it is clean; another session
may share this checkout, so ASK before touching anything you did not create. Scan MEMORY.md for
the domains in play: bot/Discord work, tsconfig and toolchain rules, the gate and CI step lists,
Biome on changed files, test-pin traps, and shared-worktree commit care.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): spawn one Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-01-verification-foundation.md, and these source files:
bot/config.ts, bot/discord_api.ts, bot/server_client.ts, bot/gateway.ts, bot/main.ts,
bot/logic.ts, bot/CLAUDE.md, the root CLAUDE.md, tsconfig.json, scripts/gate.mjs,
scripts/build_bot.mjs, tests/discord_bot.test.ts, package.json (scripts block), and
.github/workflows/ci.yml.
It returns, as conclusions rather than file dumps:
  a. every IO call each of the three shells makes (global fetch, `new WebSocket` from ws,
     setTimeout / setInterval / AbortController / Date) with the constructor signature of each
     class and its construction site in bot/main.ts;
  b. how tests/discord_bot.test.ts is organized, what it already pins, and its import style;
  c. the gate step list in scripts/gate.mjs and the CI jobs that carry the equivalent build
     steps (there is more than one job), naming where a bot build step slots in each;
  d. whether bot/main.ts can be imported by a test without side effects, with the evidence;
  e. any existing repo exemplar for a constructor-injected dependency with a production default
     (name the file and line);
  f. a candidate list of bot code that will likely fail `tsc` once `bot` is included (a list to
     verify, never a fix, and never a substitute for actually running the check).

STEP 2 - EXECUTE in two stages so no two agents ever edit the same file.

Stage 1 (serial, in the main loop):
  - Add "bot" to the `include` array in tsconfig.json. Run `npx tsc --noEmit` (the native
    TypeScript 7 binary; a full-repo run takes about 2 seconds, so run it liberally). Fix EVERY
    error it reports with behavior-preserving edits only: a type annotation, a boundary cast at
    a point the code already validates, a narrowing guard that cannot change a runtime branch.
    Which errors exist is unknown until you run it. DISCOVER them; do not assume the candidate
    list from STEP 1 is right or complete. Never silence an error with a blanket `any`, a
    ts-ignore, or a widened include exclusion.
  - Add a bot build step to the `steps` list in scripts/gate.mjs next to the existing server
    build step, then mirror it into .github/workflows/ci.yml. Per ruling R7 in state.md it goes
    into EVERY CI job that builds the server (the header comment of scripts/gate.mjs demands the
    two step lists stay in sync, and more than one job carries the build steps). Find those jobs;
    do not guess their names.
  - Extract the three cadence constants at bot/main.ts:46-48 (ROLE_SYNC_INTERVAL_MS 300000,
    PRESENCE_DEBOUNCE_MS 4000, RELAY_POLL_MS 3000) into a new module bot/cadence.ts, per ruling
    R6 in state.md. This is a MOVE only: no value, name, or ordering change, and bot/main.ts
    imports them from the new module. It exists because bot/main.ts calls `main()` at module
    scope, so a test cannot import the constants from there, and it seeds Phase 3's D13
    env-overridable cadences, which layer env parsing over the same module. Doing it in Stage 1
    keeps bot/main.ts out of the Stage 2 agents' hands.

Stage 2 (two parallel agents, disjoint files, each given the STEP 1 summary rather than the
planning docs):
  - Agent A, Discord IO seams: give `DiscordApi` (bot/discord_api.ts) an injected fetch, and
    `Gateway` (bot/gateway.ts) an injected socket factory plus an injected timer/clock, as
    constructor parameters that DEFAULT to exactly today's production values (global `fetch`,
    `new WebSocket(url)` from ws, setInterval / setTimeout). No call-site change and no behavior
    change: bot/main.ts must keep constructing both exactly as it does today.
    Note: the comment above FATAL_CLOSE_CODES in bot/gateway.ts contains a pre-existing em dash.
    The repo copy rule bans em dashes and the Stop hook (.claude/hooks/qa-stop.sh) checks the
    diff, so once that file is in your diff the Stop hook would block on it. Ruling R9 in
    state.md sanctions replacing that one character here (a comma or parentheses reads fine),
    scoped to that one comment; do not extend it to files this phase does not otherwise touch.
    QA will not treat it as scope creep.
  - Agent B, server-client seam plus the baseline tests: the same injected-fetch treatment for
    `ServerClient` (bot/server_client.ts), including its 8000 ms abort timer so a test can drive
    the deadline without a real wait. Then the new tests. Agent B does not edit bot/main.ts,
    bot/discord_api.ts, or bot/gateway.ts.

Baseline test arms Agent B owns (decisive assertions on literals, never smoke tests):
  - bot/config.ts: each of the four required keys throws with its own name when absent; the
    GAME_SERVER_URL and PUBLIC_GAME_URL defaults; the relay fallback (relay, then test) and the
    activity fallback (activity, then relay, then test) including the arm where only the test
    channel is set; DISCORD_SYNC_NICKNAMES is off ONLY for the exact string "0" (assert that
    "false" leaves it ON, which is the arm a careless rewrite breaks).
  - bot/server_client.ts: the call envelope (method, URL built from baseUrl plus path, the
    `x-woc-discord-secret` header carrying the configured secret, the JSON content type, body
    omitted when undefined), an envelope with success false returning null, a non-ok HTTP status
    returning null, and the abort timer firing at its deadline (drive it with the injected
    clock or fake timers).
  - The three cadence constants, imported from the bot/cadence.ts module Stage 1 extracted:
    assert each value against a literal (300000, 4000, 3000), never against a value re-read from
    the source that defines it. Do not change any of the three values in this phase.
  - Put the new tests in new file(s) alongside tests/discord_bot.test.ts, which stays pure-logic
    only. Suggested names: tests/discord_bot_config.test.ts and
    tests/discord_bot_server_client.test.ts. Consolidating into one file is fine; record the
    final names in state.md.

INVARIANTS IN PLAY (from state.md):
  - D7, zero new npm dependencies: no discord.js, no rate-limiter package, no mocking library.
    Injection is plain constructor parameters.
  - D8, the pure/IO split stands: bot/logic.ts stays pure, the three shells stay thin IO shells,
    and wiring stays in bot/main.ts.
  - D13, cadences become env-configurable in Phase 3: this phase moves the constants into
    bot/cadence.ts and PINS their values (R6), it does not parameterize them or read any env.
  - D19, every phase's QA session runs mutation spot checks on what the new tests claim to
    cover, so write assertions that would actually fail on a regression.
  - Packet non-negotiables: no src/ edit at all (src/sim is untouched by this packet); secrets
    are env only and .env is never committed; no em dashes, en dashes, or emojis anywhere in
    code, comments, docs, or commit text; commit with EXPLICIT paths, never `git add -A`,
    because the worktree is shared.

OUT OF SCOPE: any behavior change whatsoever, including "obvious" bug fixes found while
type-checking (record them for the QA session instead). No rate-limit or retry work (Phase 2),
no scheduler or diff-before-write work (Phase 3), no server/ change, no deploy or compose file,
no DEPLOY.md prose (Phase 7), no new env keys (Phase 2 adds the first ones).

STEP 3 - VALIDATION + REVIEW: run the state.md bot-only row: `npx tsc --noEmit`,
`npx vitest run tests/discord_bot.test.ts` plus every new test file, `npm run build:bot`, and
`npm run ci:changed` (Biome on changed files; fix with a scoped
`npx @biomejs/biome check --write <file>`, never a whole-repo write). Prove the include actually
took effect instead of assuming: `npx tsc --noEmit --listFiles` should list bot/main.ts, or
introduce a deliberate type error in a bot file, watch the check fail, and revert it. At phase
close run `npm run gate` (exit-code-safe; never an ad-hoc && chain).
Dispatch reviewers per the Review Dispatch Matrix in implementation-plan.md, matching rows ONLY:
a bot-only diff matches no row, so `qa-checklist` at phase end is the baseline. This phase edits
.github/workflows/ci.yml, so the `privacy-security-review` row matches (CI yml is a listed deploy
file) and you spawn it too, per ruling R7. Prompt every reviewer for COVERAGE, not filtering.
Resume a truncated reviewer with: "Stop reading more files. Output the full report now. No more tool
calls. Format: BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do not commit while a BLOCKING
finding stands.

STEP 4 - COMMITS: Conventional Commits with a scope, explicit paths, and a BODY on every commit
(1 to 4 plain sentences saying what changed and why, wrapped near 72 columns). No em dashes, no
en dashes, no emojis, and no session-link or other trailers. The plan suggests `chore(bot)` plus
`test(bot)`; expanded:
  1. chore(bot): type-check bot/ and fix the errors the include surfaces
  2. chore(bot): build the bot bundle in the pre-merge gate and CI
  3. refactor(bot): move the cadence constants into bot/cadence.ts
  4. refactor(bot): accept an injected fetch, socket, and clock in the IO shells
  5. test(bot): pin the config arms, server call envelope, and cadence constants
Fold 1 and 2 together if the type fixes turn out trivial; keep the tests as their own commit.

STEP 5 - ACCEPTANCE (every item verifiable by a command or an assertion, not by claim):
  - tsconfig.json `include` contains "bot" and `npx tsc --noEmit` exits 0, with bot/main.ts
    proven to be in the checked file set.
  - `npm run build:bot` exits 0 and writes dist-bot/bot.cjs; the gate step list contains the bot
    build; every CI job that builds the server also builds the bot.
  - Constructing DiscordApi, ServerClient, and Gateway with no extra arguments still yields
    today's production IO, and a test asserts the DEFAULT path, not only the injected one.
  - The new tests fail if the pinned behavior changes: every config arm, the secret header, the
    timeout abort, and each cadence value asserts against a literal, never against a value
    re-read from the same source (memory: test-pin-constant-self-comparison).
  - bot/cadence.ts holds the three constants, bot/main.ts imports them, and the diff shows a pure
    move: the same names, the same values, no new logic in the module.
  - `git diff` over bot/ shows no runtime behavior change: no altered branch, no altered
    constant, no added or removed call; only type annotations, defaulted constructor parameters,
    comments, the cadence move, and the one sanctioned gateway comment fix (R9).
  - `npm run ci:changed` clean on the touched files and `npm run gate` green.

STEP 6 - DOCS: update docs/discord-bot-stability/progress.md (the Phase 1 status row and its
four checkboxes) and docs/discord-bot-stability/state.md ("Current phase" and the "Created by
this packet" list: bot/cadence.ts, the new test file names, and "none" for new env keys this
phase) in the SAME commit as the work, with explicit paths. Correct the state.md "Key file paths"
bot line too, since the cadence constants no longer live in bot/main.ts. Record any surprising
rule you hit to memory as one file per fact plus its MEMORY.md pointer line.

STEP 7 - FINAL RESPONSE: phase status, files touched (absolute paths), validation results
(command plus outcome for each), reviewer verdicts, anything deferred with the reason, and a
one-line handoff for the Phase 1 QA session.

STOPPING RULES:
  - Stop and surface if fixing a latent type error requires a behavior change. Report the error,
    the file, and the options you weighed; do not change what the code does to make tsc happy,
    and do not suppress the error to keep moving.
  - Stop if the work appears to need a new npm dependency (D7) or any edit under src/ (a src/
    edit means the phase went out of scope).
  - Stop if the worktree is dirty with work that is not yours, or if a shared-checkout conflict
    appears mid-phase.
```
