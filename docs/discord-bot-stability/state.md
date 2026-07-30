# State: Discord Bot Stability (cross-phase cheat sheet)

Current phase: Phase 1 not started.

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

Bot: `bot/main.ts` (wiring, intervals at :518-537, sync at :203-251, dispatch at
:254-390), `bot/logic.ts` (pure), `bot/discord_api.ts` (REST shell, request() :11-38),
`bot/server_client.ts` (game API shell, call() :32-57), `bot/gateway.ts` (ws shell,
fatal closes :135-142), `bot/config.ts`. Build: `scripts/build_bot.mjs` ->
`dist-bot/bot.cjs`; `package.json:80`.

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

Config: `tsconfig.json` (`include` lacks `bot` until Phase 1), `scripts/gate.mjs`
(steps :56-74).

## Created by this packet (update per phase)

- Phase 1: (pending)
- New env keys: (pending)
- New endpoints: (pending; planned `POST /internal/discord/flex-batch`,
  `GET /internal/discord/outbox`)
- New modules: (pending; planned governor, scheduler, change feed)
- New tests: (pending)

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
  socket seam and the Stop hook would otherwise block the diff). Scoped to that one
  comment; QA must not flag it as scope creep. Phase 7 need not act on it.
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

## OPEN items

See brainstorm.md O1 to O7. O4 (Developer Portal intent toggles) needs the user.
O5 (member-write 429 scope) resolves from logs after first prod deploy.

## Known gotchas for implementers

- Only `bot/logic.ts` is currently type-checked; expect latent type errors in the other
  five bot files when Phase 1 adds `bot` to tsconfig.
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
- Fake timers vs captured clocks: see memory entries cachedread-captured-clock-vs-fake-
  timers and settimeout-fractional-delay-fires-early before testing scheduler timing.
