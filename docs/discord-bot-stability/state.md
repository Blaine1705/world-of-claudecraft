# State: Discord Bot Stability (cross-phase cheat sheet)

Current phase: Phase 2 built (2026-07-30), QA pending. Next: Phase 2 QA, then Phase 3,
the loop scheduler and diff-before-write.

## Locked decisions

- D1 Transport: one consolidated `GET /internal/discord/outbox` poll draining relay,
  activity, daily-reward winners, and linked-member changes in a single response.
  Adaptive cadence: 3s while the previous drain returned items, decaying to 15s idle.
  No long-poll, no bot WebSocket.
- D2 Governor: a pure, tested module owning ALL Discord REST dispatch. Bucket-keyed
  serialized queues remapped onto `X-RateLimit-Bucket` hashes; proactive gating (never
  dispatch at `Remaining == 0`, wait `Reset-After`); process-wide pause on any
  global-scope 429 honoring the FULL `retry_after` (no ceiling); a non-JSON 429 body is
  treated as a Cloudflare ban: global pause of `DISCORD_BAN_PAUSE_MS` (default 600000)
  and an error log. Target send rate `DISCORD_MAX_RPS` default 8 (limit is 50).
- D3 Circuit breaker: rolling 10-minute window counting local 401/403/429 (excluding
  scope `shared`); at `DISCORD_BREAKER_LIMIT` (default 300, vs Discord's 10,000 ban
  threshold) all sweeps and non-essential writes stop; half-open probe after a full
  quiet window.
- D4 Permanent-failure cache: a 401/403 for a member is never retried until the bot's
  own role position changes or `DISCORD_FORBIDDEN_TTL_MS` (default 24h) expires.
- D5 Diff-before-write is universal: nickname PATCH only when the computed nick differs
  from the gateway-cached member nick; members-meta pushed only for members whose meta
  changed since last successful push; self-caused `GUILD_MEMBER_UPDATE` echoes
  suppressed (compare incoming state to what we just wrote).
- D6 Sweep iterates linked members only, discovered via `flex-batch` and maintained by
  the outbox change feed; never the whole online-Discord-user set.
- D7 Zero new npm dependencies (bot/CLAUDE.md stands). No discord.js, no rate-limiter
  package. Connection bounding comes from app-level serialization (governor queues +
  scheduler overlap guards) over default keep-alive fetch; a hand-rolled node:http
  agent wrapper only if measurements force it (escalate to the user first).
- D8 Pure/IO split stands: governor and scheduler are DOM-free pure modules with Vitest
  coverage; `discord_api.ts` and `server_client.ts` stay thin IO shells; wiring only in
  `main.ts`.
- D9 New server endpoints (`flex-batch`, `outbox`) are RouteDef-only (no legacy twins),
  behind `requireInternalSecret`, with HAND-ADDED rows in
  `tests/server/http/surface_inventory.ts`. Behavior edits to EXISTING internal routes
  (members-meta, presence) land on BOTH the RouteDef and the frozen legacy
  `handleDiscordInternal` arm in the same change, or get a ledgered deviation in
  `tests/server/http/known_deviations.ts`.
- D10 members-meta becomes ONE multi-row upsert (unnest arrays) skipping unchanged rows
  (`IS DISTINCT FROM`); the 1000-member server cap and 200-member bot batch stand.
- D11 Existing per-endpoint GET routes (relay, activity, winners, flex) stay in place;
  the bot stops calling them; retirement is a post-ladder-deletion follow-up issue.
- D12 `reward_ledger` gets an explicit keep-forever comment at its DDL (audit ledger),
  satisfying the retention rule without a prune.
- D13 Cadences and thresholds are env-configurable with safe defaults; the operator
  incident lever the bot currently lacks. All new env keys documented in DEPLOY.md.
- D14 Discord REST base pinned to `/api/v10`; valid `User-Agent` kept;
  `X-Audit-Log-Reason` sent on member PATCHes; `X-RateLimit-Scope` logged from day one.
- D15 Deploy hardening: bot service gets healthcheck (heartbeat file + compose test),
  `mem_limit`, `stop_grace_period`; fatal gateway close exits the process (nonzero) so
  `restart: unless-stopped` acts; Caddy 404s `/internal/*` alongside `/metrics`.
- D16 Observability: bot counters (requests, 429s by scope, breaker state and opens,
  queue depths, sweep durations, outbox drain sizes) piggyback on the existing presence
  POST (both arms per D9), held in server memory, exposed as prom lines on the existing
  metrics path. No new tables.
- D17 `/api/discord`: per-account short-TTL cached read via the `createCachedRead` seam
  with moderation busts wired in the same change; presence block stays as is.
- D18 Scale envelope for design and assertions: 1,000 concurrent players, 5,000 guild
  members (10x today). Query-count and payload assertions pin against fixtures at this
  scale where practical.
- D19 QA rigor: EVERY phase's QA session runs ultracode (adversarial-verify workflow)
  plus mutation spot checks on that phase's new pure modules. Consult the memory
  test-pin trap index before writing or mutation-checking any pin.
- D20 Interim prod: left as is by explicit user decision (2026-07-30). No hotfix
  branch, no container stop. Do not re-raise.

## Non-negotiable constraints

- `src/sim/` is untouched by this packet. No IWorld, wire-protocol, or renderer surface
  is involved; if a phase finds itself editing `src/`, stop and re-read the phase file.
- Server authority stands: the bot never computes rewards; the server validates grants
  via dedupe keys.
- Secrets are env only; `DISCORD_BOT_SECRET` must match server and bot; never commit env.
- Discord-facing copy is English by existing convention, but repo copy rules still
  apply: no em dashes, no en dashes, no emojis in any new string, comment, doc, or
  commit. No player-visible game-client strings are added by this packet (if one
  appears, it needs the full i18n treatment per root CLAUDE.md).
- Handlers are req/res-free `(ctx) => Awaitable<unknown>`; SQL lives only in `db.ts` /
  `*_db.ts`; errors are stable codes from the append-only `error_codes.ts`.
- Shared-worktree care: commit with EXPLICIT paths, never `git add -A`.
- WS `maxPayload` 16 KiB is not widened; the game wire protocol is not touched.

## Every phase starts here (standing rules, set by the user 2026-07-30)

1. **Sync the release base FIRST.** `git fetch origin release/v0.33.0`, then
   `git rev-list --left-right --count HEAD...origin/release/v0.33.0`. If behind, merge
   the release branch into `feature/discord-bot-stability` BEFORE doing the phase's
   work, so each phase eats one small conflict set instead of handing a huge one to a
   later phase. Compare against the FRESHLY fetched tip, not a stale tracking ref.
   After any non-empty merge, run the `release-merge-audit` skill and re-run the gate
   (a gate that was green before a merge says nothing about the merged result). Record
   the sync in progress.md, including "no-op, already current".
2. **Install what the toolchain needs.** A fresh worktree has no `node_modules`, and
   the main checkout's install is stale (TypeScript 5.9.3, no ffmpeg-static). Run
   `npm ci` in THIS worktree; do not degrade the verification to avoid it. This does
   NOT relax D7: no new packages.
3. **Apply EVERY review finding**, blocking, should-fix, nice-to-have, and nit alike,
   before the phase is called done. If a finding is genuinely not a defect, say so and
   why; do not silently drop it. The fix round is itself unreviewed code, so
   mutation-check the tests it adds too.

## Validation matrix

- bot-only change: `npx tsc --noEmit` + `npx vitest run tests/discord_bot.test.ts` plus
  the phase's new bot test files + `npm run build:bot`.
- server-only change: `npx tsc --noEmit` + `npx vitest run tests/server/internal.test.ts
  tests/discord_server.test.ts tests/server/discord.test.ts tests/discord_db.test.ts` +
  the http spine (`npx vitest run tests/server/http/parity.test.ts
  tests/server/http/completeness.test.ts tests/server/http/ownership_coverage.test.ts`)
  + `npm run build:server`.
- deploy-asset change: `npx vitest run tests/deploy_discord_bot.test.ts`.
- any code change: `npm run ci:changed` (Biome, changed files only; scoped `--write` for
  fixes, never whole-tree).
- pre-merge / phase close: `npm run gate` (exit-code-safe; never an ad-hoc chain).
- Full `npm test` runs go through a Monitor with bounded workers (memory:
  full-npm-test-contention-flakes).

## Key file paths

Bot: `bot/main.ts` (wiring, the six intervals, sync, dispatch), `bot/cadence.ts` (the
three poll-loop constants, moved out of `main.ts` by Phase 1 per R6), `bot/logic.ts`
(pure), `bot/discord_api.ts` (REST shell, one `request()` funnel), `bot/server_client.ts`
(game API shell, one `call()` funnel), `bot/gateway.ts` (ws shell, fatal closes),
`bot/config.ts`. Build: `scripts/build_bot.mjs` -> `dist-bot/bot.cjs`; `package.json`
`build:bot`, in the gate and both CI build jobs since Phase 1.

Server: `server/internal.ts` (RouteDef table :329-549, FROZEN legacy twins :75-241),
`server/discord.ts` (flex :950, status payload :798, presence cache :185),
`server/discord_db.ts` (accountForDiscord :134, setDiscordMemberMeta :590,
reward_ledger DDL :86-95), `server/discord_relay.ts` (cap 50),
`server/discord_activity.ts` (cap 100, 30s dedupe), `server/db.ts`
(highestCharacterForAccount :2669), `server/http/middleware/require_internal_secret.ts`,
`server/http/registry.ts` (:33, :123), `server/main.ts` (retention :3080-3087,
GameStateSource :3008-3022), `server/reports.ts` (site-presence :285).

Deploy: `docker-compose.yml` (bot service :201-224, game healthcheck exemplar
:171-199), `deploy/user-data.sh` (Caddy 404 block :84-92), `Dockerfile` (:11, :29,
:37), `DEPLOY.md`, `deploy/game_watchdog.sh`.

Tests: `tests/discord_bot.test.ts` (logic only today), `tests/server/internal.test.ts`,
`tests/server/http/{surface_inventory,parity,completeness,ownership_coverage,
known_deviations}.ts`, `tests/deploy_discord_bot.test.ts`, `tests/server/helpers/`. Test rigs per ruling R1
below: reuse the rig the matching suite already uses (`tests/server/internal.test.ts`
vi.mock module fakes + `runRoute`; `tests/discord_db.test.ts` `makePool` fake, whose
`calls` array is the sanctioned statement counter); never invent a raw pg mock. Trap:
`tests/discord_relay.test.ts` covers `src/sim/discord_relay.ts`, NOT the server module
of the same name.

Config: `tsconfig.json` (`include` carries `bot` as of Phase 1, so all SEVEN bot files
are type-checked, `bot/main.ts` among them; pinned by `tests/deploy_discord_bot.test.ts`
because dropping the one word is otherwise silent),
`scripts/gate.mjs` (the `steps` list, which now carries the `bot build` step).

## Created by this packet (update per phase)

- Phase 1: `bot` added to the tsconfig `include` (it surfaced ZERO latent type errors,
  so no behavior-preserving fixes were needed); `build:bot` added to the gate step list
  and to both CI jobs that build the server (`pr-checks`, and `release-gate` under
  `if: matrix.shard == 1`); injected IO seams on all three shells; cadence constants
  extracted per R6.
- Phase 2: `bot/rate_governor.ts`, the pure governor every Discord REST call is now
  dispatched through; `bot/discord_api.ts` reduced to an IO shell over it (the 10 second
  retry clamp and the 1 second non-JSON-429 retry are both gone); ledger item L1 closed
  in the same rewrite.
- New env keys (Phase 2, the first four; DEPLOY.md documentation is still Phase 7 per
  D13, and the commented `.env.example` block is R8):
  `DISCORD_MAX_RPS` (8), `DISCORD_BAN_PAUSE_MS` (600000),
  `DISCORD_BREAKER_LIMIT` (300), `DISCORD_FORBIDDEN_TTL_MS` (86400000).
  The defaults are exported from `bot/rate_governor.ts` as `DEFAULT_MAX_RPS`,
  `DEFAULT_BAN_PAUSE_MS`, `DEFAULT_BREAKER_LIMIT`, and `DEFAULT_FORBIDDEN_TTL_MS`, and
  `bot/config.ts` imports them, so the config fallback and the governor's own
  construction default cannot drift apart.
- Counter names Phase 8 consumes (D16), the snapshot from `RateGovernor.snapshot()`:
  `requests`, `rateLimited`, `rateLimitedByScope` (`user`/`global`/`shared`/`unknown`),
  `globalPauses`, `banPauses`, `breakerState`, `breakerOpens`, `queueDepth`,
  `trackedBuckets`, `forbiddenEntries`, `forbiddenBlocks`, `breakerBlocks`.
  `DiscordApi.counters()` is the accessor the wiring will read.
- New endpoints: (pending; planned `POST /internal/discord/flex-batch`,
  `GET /internal/discord/outbox`)
- New modules: `bot/cadence.ts` (the three poll-loop constants, values only),
  `bot/rate_governor.ts` (Phase 2, pure and clock-injected). Still planned: scheduler,
  change feed.
- New tests: `tests/discord_bot_config.test.ts` (config arms + the cadence pins),
  `tests/discord_bot_server_client.test.ts` (call envelope, secret header, deadline,
  production-default path), `tests/discord_bot_discord_api.test.ts` (auth headers, the
  v10 base, the 429 retry clamps and the retry-once bound, production-default path),
  `tests/discord_bot_gateway.test.ts` (module-mocks `ws`; both defaults, the injected
  factory, the whole opcode surface, the heartbeat tick with its zombie-terminate and ACK
  arms, RESUME versus IDENTIFY, and every fatal close code).
  `tests/discord_bot.test.ts` stays pure-logic only. The Phase 1 QA round widened all four
  well past the arm lists above; treat the files, not this summary, as the inventory.
  Phase 2 adds the governor suite, split by concern rather than one large file:
  `tests/discord_bot_governor_pacing.test.ts` (header gating, bucket serialization,
  the rate cap, the bucket remap, route templates),
  `tests/discord_bot_governor_scopes.test.ts` (the three 429 scopes, the FULL
  retry_after, the non-JSON ban pause),
  `tests/discord_bot_governor_breaker.test.ts` (both edges, window ageing, the half-open
  probe), `tests/discord_bot_governor_forbidden.test.ts` (the 401/403 cache and its
  invalidation hook), `tests/discord_bot_governor_counters.test.ts` (the D16 snapshot),
  and `tests/discord_bot_governor_determinism.test.ts` (recorded-schedule equality plus
  the pure helpers). `tests/discord_bot_discord_api.test.ts` gained the shell-side pins
  (the v10 literal, the audit-log reason, scope logging, token redaction, the forbidden
  short circuit) and LOST the three clamp arms, which pinned behavior this phase deletes
  on purpose.
- New shared test helper: `tests/helpers/synthetic_clock.ts`, a fully virtual clock.
  Phase 3's scheduler should drive it rather than vitest fake timers.
- New exported constant: `SERVER_CALL_TIMEOUT_MS` (8000) in `bot/server_client.ts`,
  named so the suite can pin the deadline against a literal.
- Touched pins: `tests/ci_workflow.test.ts` structural counts (release-gate
  single-shard conditions 8 to 9, release-gate steps 12 to 13) plus the pr-checks
  build-step coverage loop. Phase 1 QA then rewrote that file's gate and CI pins per
  R17 (comment-stripped source, line and adjacency anchors, a pr-checks step count, and
  a workflow trust-posture test) and extended `tests/deploy_discord_bot.test.ts` with the
  bot build and typecheck surface.

## Rulings settled during authoring (2026-07-30)

- R1 Test rigs: reuse the rig the matching suite already uses; never invent a raw pg
  mock. `tests/server/internal.test.ts` drives routes via its vi.mock module fakes and
  `runRoute` helper; `tests/discord_db.test.ts` uses the hand-rolled `makePool` fake
  with a `calls` array, and that `calls` array is the sanctioned way to count SQL
  statements for query-count pins. The earlier "FakeDb + fakeCtx" phrasing in this file
  is superseded by this ruling.
- R2 (extends D1): Phase 5 wraps the winners lookup (`unannouncedWinnerDays`) in a
  short TTL cache (30 to 60s) busted at day finalization, so a warm empty outbox drain
  is fully query-free. The zero-query pin covers the in-memory streams unconditionally
  and the winners stream on a warm cache. This cache is Phase 5 scope; Phase 9 owns
  only the public `/api/discord` route.
- R3: Phase 4 MAY add batched set-based variants of per-account reads
  (`highestCharacterForAccount` and friends) in `db.ts`/`*_db.ts` for flex-batch,
  keeping the per-account originals for existing callers. That is the point of the
  phase, not scope creep.
- R4: New RouteDef-only routes anchor their `surface_inventory.ts` rows on the RouteDef
  symbol/route string (the post-migration scaffold precedent), never by adding a legacy
  twin (D9 forbids it).
- R5: QA prompts keep the template's STEP numbering (STEP 5 exists only in the final
  phase's QA); non-final QA files jump STEP 4 to STEP 6 by design.
- R6: The three cadence constants move OUT of `bot/main.ts` in Phase 1 via a
  behavior-preserving extraction into a small module (`bot/cadence.ts`) that `main.ts`
  imports and tests import directly. No source-text pins for them. This also seeds
  Phase 3's D13 env-overridable cadences, which layer env parsing over the same module.
- R7: `build:bot` mirrors into every CI job that builds the server (the gate.mjs header
  demands step-list sync with `.github/workflows/ci.yml`). Editing a CI yml makes the
  `privacy-security-review` matrix row match for Phase 1; dispatch it.
- R8: Phase 2 adds its four new env keys to the existing commented Discord block in
  `.env.example` in the same change that introduces them; the full operator
  documentation still lands in DEPLOY.md in Phase 7 (D13 unchanged).
- R9: The pre-existing em dash in the `bot/gateway.ts` FATAL_CLOSE_CODES comment is
  fixed as a one-character copy fix inside Phase 1 (the phase touches that file for the
  socket seam anyway, and the repo copy rule bans em dashes outright). Scoped to that
  one comment; QA must not flag it as scope creep. Phase 7 need not act on it.
  Correction (Phase 1, verified): the original rationale said the Stop hook would have
  blocked the diff. It would not have. `.claude/hooks/qa-stop.sh` scans ADDED lines
  only, so an untouched pre-existing comment never trips it. The fix stands on the copy
  rule alone. Do not reason from the old premise.
- R10 (D17 reading, confirmed): Phase 9 caches only the database-backed part of the
  `/api/discord` payload; `discordPresenceCache()` is composed fresh per request so
  presence is never frozen behind the payload TTL. Both routes (RouteDef
  `server/discord.ts:1382` and legacy arm `server/main.ts:2229`) funnel through
  `discordStatusPayload`, so parity holds by construction; verify, do not fork it.
- R11: `createCachedRead` is single-value; Phase 9 builds a NEW small keyed cached-read
  sibling module with a hard entry bound and eviction (an unbounded per-account map is
  the exact growth defect server/CLAUDE.md forbids). Sanctioned scope with its own
  acceptance item and mutant.
- R12: Phase 7 owns ALL fallout of the Caddy change: the occurrence-count pins in
  `tests/deploy_watchdog.test.ts` (:136-137, :146-147) and every DEPLOY.md restatement
  of the ops-path claim, including the line that currently says the edge does NOT hide
  `/internal/*`. Leaving the branch red or the docs wrong is not an option.
- R13: Exit-on-fatal-close stands even though an unrecoverable cause (bad token, bad
  intents) crash-loops under `restart: unless-stopped`: a visible crash-loop with
  Docker's backoff is the desired behavior over today's silent zombie. No retry
  limiter, no supervisor. The Counter-versus-Gauge shape for pushed bot counters is
  DELIBERATELY delegated to the Phase 8 runner (pick, justify, record here).
- R14 (settled in Phase 1): naming the previously inline `8000` as the exported
  `SERVER_CALL_TIMEOUT_MS` is sanctioned, even though acceptance item 6 enumerates only
  "type annotations, defaulted constructor parameters, comments, the cadence move, and
  the gateway comment fix". It is value-identical, and a named export is what lets the
  suite pin the deadline against a literal instead of re-reading the source (the
  constant-self-comparison trap). Do not re-litigate it in QA.
- R15 (settled in Phase 1): the three IO shells share ONE injection convention. Every
  default FORWARDS to the global (`(...args) => fetch(...args)`, `(cb, ms) =>
  setTimeout(cb, ms)`) rather than capturing it (`= fetch`, `= { setTimeout }`). Two
  reasons: the global is then read at CALL time, so a test that swaps a global after
  construction is still seen (this matters for the fake-timer work in Phases 2 and 3);
  and the global is never invoked with the instance as its `this`, which is harmless on
  Node today but is a real trap on any other host. New shells follow this. Recorded in
  `bot/CLAUDE.md`.
- R16 (settled in Phase 1 QA): a default-path test must construct the shell BEFORE
  stubbing the global, and must observe EVERY argument the default forwards. Both halves
  are load-bearing and neither is obvious. Stub-then-construct passes for a capture-form
  default (`= fetch`), so it cannot guard R15 at all. A one-parameter stub passes for
  `(input) => fetch(input)`, which type-checks because TypeScript accepts an
  arity-reduced function where a wider signature is expected, and which would strip the
  auth header off every request in production. Adding `bot` to the tsconfig include does
  NOT catch either one.
- R17 (settled in Phase 1 QA): a source-text pin over `scripts/gate.mjs` or
  `.github/workflows/ci.yml` must be matched against a COMMENT-STRIPPED source and be
  either line-anchored or name-to-run adjacent. A bare `toContain` is satisfied by the
  step commented out, by `|| true`, by `continue-on-error`, and by an `if:` slipped
  between the name and the run line. Keep the whitespace in such a pin tolerant so a
  biome re-wrap does not red it falsely.

## OPEN items

See brainstorm.md O1 to O7. O4 (Developer Portal intent toggles) needs the user.
O5 (member-write 429 scope) resolves from logs after first prod deploy.

### Ledgered during Phase 1 (found, deliberately NOT fixed there)

Phase 1 forbids any runtime behavior change, and each of these changes behavior or
adds a guard, so they were recorded rather than landed. The Phase 1 QA session should
route each to a phase or file it.

- L1 CLOSED by Phase 2. The throw now formats `redactPath(path)` (exported from
  `bot/rate_governor.ts`), which replaces only the CREDENTIAL segment on the
  `/interactions/<id>/<token>/...` and `/webhooks/<id>/<token>/...` shapes and leaves
  every id intact, so the operator keeps the diagnosable detail. The redaction is in the
  THROW, as the Phase 1 security review required, not in the one named catch, so the 15
  other bare `console.error(e)` handlers cannot re-open it. Token segments are kept out
  of bucket keys and log lines too (`routeTemplate` emits `:token`). Original report,
  kept for the record:
- L1 (should-fix, security): `bot/discord_api.ts` throws
  `[bot] discord ${method} ${path} -> ...` with `path` interpolated verbatim, and three
  interaction call sites (`respondInteraction`, `deferInteraction`,
  `editOriginalResponse`) carry the INTERACTION TOKEN inside `path`. The throw is caught
  by the `console.error('[bot] interaction error', e)` handler in `bot/main.ts`, so a
  400/401/404 (or a twice-429) on a slash-command reply writes a live ~15 minute bearer
  credential into the container log. PRE-EXISTING, not a regression of Phase 1. Fix
  shape: redact the token segment, or log a safe label beside the real path. Natural
  home is Phase 2, which already rewrites `request()` for the governor.
- L2 (nice-to-have, privacy): `bot/server_client.ts` non-ok log line prints `path`,
  which for `flex()` and `roles()` carries `?discord_user_id=<id>`. Low sensitivity
  (a Discord id is pseudonymous and guild-visible) but it is user-identifying data in
  an operator log. Pre-existing.
- L3 RESOLVED (conclusion stands, RATIONALE CORRECTED in Phase 1 QA). Do not add the pin.
  The concern was that nothing stops a future call site from passing a wrapping
  `fetchImpl` that observes the bot token or the shared secret. The original rationale
  said `tsc` "proves the arity of every construction site". **That is false and must not
  be reasoned from:** the seams are OPTIONAL trailing parameters, so `tsc` accepts the
  leading arguments alone or any prefix of the seams as well (2 to 4 for `DiscordApi` and
  `ServerClient`, 3 to 5 for `Gateway`), and the suite itself constructs with all of them.
  Verified with a `tsc` probe under the repo's own compiler options, with a negative
  control to prove the probe was not vacuous. The
  real reason no pin is needed is the one the security review gave: passing a wrapping
  `fetchImpl` requires editing `bot/main.ts`, which is code-execution the attacker
  already has, so this is not a privilege boundary. A text pin would also carry the
  documented source-scrape traps. No pin.
- L4 CLOSED, genuinely, as of Phase 1 QA. Phase 1's own claim ("closed outright") was
  overstated: the file covered the CONNECT handshake only, and 16 of the first 18 gateway
  mutants survived it. `tests/discord_bot_gateway.test.ts` now also pins seq tracking,
  the heartbeat tick including the zombie-terminate and ACK arms, stopHeartbeat on close,
  RESUME versus IDENTIFY with the session and resume-URL capture, all six fatal close
  codes plus five reconnecting ones with the reconnect actually fired, INVALID_SESSION
  both arms, op 7, the send readyState guard, op 8, and the dispatch and parse catches.
  20 of 20 gateway mutants now die. Phases 3 and 7 extend it.
- L5 CLOSED by Phase 1 QA rather than deferred to Phase 5: both halves were a few lines.
  `flairedIds()` has all three arms (the `typeof x === 'string'` filter, a genuinely
  empty array, and null for an unreachable server or a malformed payload), and
  `pushMembersMeta()`'s zero-updated warning is pinned on both sides of its non-empty
  guard. Phase 5 inherits the pins instead of writing them.
### Found during Phase 1 QA (2026-07-30), OPEN

- L6 (nice-to-have, toolchain, OPEN): `bot/` type-checks against the shared tsconfig,
  whose `lib` is `["ES2022","DOM","DOM.Iterable"]` with `types: ["vite/client","node"]`.
  A Node-missing DOM global therefore passes BOTH `tsc` and `build:bot` (esbuild does not
  typecheck) and only fails at runtime in the container. A bot-specific tsconfig would
  close it; that is a toolchain restructure, not a QA-round edit. Natural home is Phase 7,
  which already owns the bot's deploy hardening.

- L7 (should-fix, behavior, OPEN): a NON-resumable `INVALID_SESSION` (op 9 with `d:false`)
  never clears `this.sessionId` in `bot/gateway.ts`; the field is only ever assigned in the
  READY handler. So after Discord tells the bot its session is dead, a socket close that
  arrives before the next READY takes `reconnect(true)` to
  `this.resuming = resume && this.sessionId !== null`, which is still true, and the bot
  RESUMEs a session it was just told is gone. Discord answers with another
  INVALID_SESSION, so it self-corrects at the cost of a wasted round trip and a slower
  recovery during exactly the reconnect storms this packet exists to tame. Fixing it is a
  RUNTIME BEHAVIOR CHANGE, which Phase 1 forbids, so it is recorded rather than landed.
  Natural home is Phase 3 (scheduler and reconnect coalescing) or Phase 7 (supervision).
- L8 (nice-to-have, coverage, OPEN): the two pure helpers at the bottom of `bot/main.ts`
  are unreachable from any test, because `main.ts` calls `main()` at module scope. If a
  later phase needs them pinned, extract them into a sibling module first (the same move
  R6 made for the cadences); do not add a source-text pin.

## Known gotchas for implementers

- RESOLVED by Phase 1: all seven bot files are type-checked. The include surfaced ZERO
  latent type errors, so there were none to fix. Do not plan around the old warning.
- The bot reuses the `eastbrook-game` image (compose `discord` profile), so bot and
  server always deploy in lockstep; wire-format changes between them need no
  cross-version compatibility story.
- An empty relay/activity drain costs zero Postgres queries (in-memory splice); the
  expense is the HTTP request itself plus N+1 `discordForAccount` lookups when items
  DO exist. The outbox batches those into one IN query.
- `GUILD_CREATE` fires on every re-IDENTIFY and today triggers a full sweep; the
  scheduler must coalesce, or a reconnect storm multiplies sweeps.
- The game server's keep-alive window is 5s (`server/http/server_timeouts.ts`); a 3s
  poller reuses its connection, the 5-minute loops never do.
- Fake timers vs captured clocks: a clock captured at construction does not move under
  fake timers, and a fractional delay fires EARLY. Phase 2 sidesteps both by testing
  against a fully VIRTUAL clock, `tests/helpers/synthetic_clock.ts`, rather than vitest
  fake timers; reuse it for the Phase 3 scheduler. The two memory entries this line used
  to name (cachedread-captured-clock-vs-fake-timers,
  settimeout-fractional-delay-fires-early) do not exist in the memory store, and neither
  does env-empty-numeric-default-shift, which phase-02 cites; the rules themselves are
  real and are now written down here and at the seams that depend on them.
- Numeric env parsing: `Number('')` is 0, so an unguarded parse turns a blank line in a
  .env into a hard 0. `positiveNumberFromEnv` in `bot/config.ts` falls back to the
  default for empty, non-numeric, and non-positive alike. It takes the VALUE rather than
  the key on purpose: a second dynamic `process.env[...]` lookup would slip past the
  env-key inventory guard in `tests/discord_bot_config.test.ts`, which asserts exactly
  one dynamic lookup and pins the whole key set.
