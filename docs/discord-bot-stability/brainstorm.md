# Brainstorm: Discord Bot Stability

## Vision

The Discord bot becomes a well-behaved citizen of both ecosystems it touches: it never
exceeds Discord's documented rate-limit contract (and structurally cannot, even under
fault), and it imposes near-constant load on the game server regardless of population.
The 2026-07-29 incident class becomes impossible by construction, not by tuning.

Approved direction (user sign-off 2026-07-30):
- Transport for game-to-bot events: one consolidated outbox poll endpoint with adaptive cadence.
- Deploy hardening in scope: bot container healthcheck + fatal-close exit, and Caddy 404 for `/internal/*`.
- `/api/discord` public caching included as its own phase; `/api/site-presence` untouched.
- Interim prod: left as is; no hotfix branch, no container stop. The packet is the fix.
- QA: full rigor every phase (ultracode adversarial workflows + mutation spot checks).
- Scale envelope: 10x today (1,000 concurrent players, 5,000 guild members).
- Scope: stability only; feature additions (two-way relay etc.) are follow-up issues.

## Incident summary (full report: incident-2026-07-29.md)

~600,000 failed Discord requests over 2 days, peaking at 35 to 38k 429s/hr, with Discord
issuing a global temporary API ban around 22:00 both nights. Separately, the bot
generated ~13.5k of the game server's ~30k HTTP requests in a sample hour (about 45%)
and held ~110 established TCP connections to :8787. The game itself stayed healthy
(19.99 Hz). A restart re-ignites the storm within the hour.

## Root causes (five compounding defects)

1. **Unconditional nickname PATCH** (`bot/main.ts:241-247`). Roles are diffed before
   writing (`computeRoleSync`, `bot/logic.ts:136`); nicknames are not. Every linked
   online member gets a guild-member PATCH every 5-minute sweep forever. Each PATCH
   makes Discord emit `GUILD_MEMBER_UPDATE`, whose handler (`bot/main.ts:319-333`)
   unconditionally POSTs `/internal/discord/members-meta` back into the game: the bot
   generates its own inbound load (~63/min observed).
2. **The 429 handler escalates instead of backing off** (`bot/discord_api.ts:26-31`).
   The wait is clamped to a 10-second ceiling (global penalties run far longer); a
   non-JSON 429 body (the Cloudflare ban response) falls through to a 1-second retry;
   the `global` flag and all `X-RateLimit-*` headers are ignored; every error is
   swallowed at the call sites so the sweep continues.
3. **No overlap guards.** Six bare `setInterval` loops (`bot/main.ts:518-537`) fire
   whether or not the previous run finished. Once backoff stretches a sweep past its
   5-minute period, sweeps stack and volume climbs. This converts a burst into a
   sustained storm that restarts re-ignite.
4. **The ban mechanism is Discord's invalid-request counter**: ~10,000 requests
   returning 401/403/429 per 10 minutes per IP triggers a temporary ban. Ignored 429s
   count toward it, and permanent 403s (members whose top role outranks the bot) were
   retried every sweep forever.
5. **Server-side amplification.** The sweep iterates every online Discord user (not
   linked players; `onlineUsers` populated from `PRESENCE_UPDATE`, `bot/main.ts:298-306`)
   paying 1 to 4 uncached Postgres queries each via `/internal/discord/flex`
   (`accountForDiscord` `server/discord_db.ts:134`, then `discordFlexForAccount`
   `server/discord.ts:950` fanning to `highestCharacterForAccount` `server/db.ts:2669`
   with its JSONB-expression sort). `members-meta` runs one serial UPDATE per member
   with no change detection (`server/internal.ts:533` -> `setDiscordMemberMeta`
   `server/discord_db.ts:590`). Three pollers fire every 3 seconds against queues that
   are almost always empty, while the only free endpoint (presence, zero DB) polls least.
   No `/internal/*` route uses the cached-read seam; none is rate-limited.

Ops gaps that let it fester: only `bot/logic.ts` is type-checked (tsconfig `include`
lacks `bot`; `scripts/gate.mjs` has no `build:bot` step; the bundle first compiles on
the prod host during `docker compose up --build`); the bot container has no healthcheck,
no `mem_limit`, no `stop_grace_period` (`docker-compose.yml:201-224`) and a fatal
gateway close (`bot/gateway.ts:135-142`) logs and returns without exiting, leaving a
zombie process Docker never restarts; `/internal/*` is publicly reachable through Caddy
(`deploy/user-data.sh:84-92` 404s only `/livez /readyz /metrics`) with the shared header
secret (`server/http/middleware/require_internal_secret.ts`) as the only gate.

Ruled out early: "use the gateway instead of polling Discord" is already done. The bot
consumes `GUILD_MEMBER_UPDATE`/`ADD`/`REMOVE`, presences, and voice states over a real
Gateway v10 connection with the `GUILD_MEMBERS` + `GUILD_PRESENCES` privileged intents
(`bot/logic.ts:12-17`). The polling exists to observe game-side changes (level ups, tier
changes), which Discord cannot report. The fix is a game-to-bot change feed.

## Existing assets to reuse

- The pure/IO split (`bot/CLAUDE.md`): protocol and diff logic in `bot/logic.ts` with
  real tests (`tests/discord_bot.test.ts`, 635 lines); ws/fetch IO in thin shells. The
  governor and scheduler land as pure tested modules under this convention.
- `computeRoleSync` (`bot/logic.ts:136`): the correct diff-before-write exemplar,
  including update-cache-only-after-success.
- The server's RouteDef pipeline (`server/http/`): all 12 internal routes are already
  proper RouteDef modules in `server/internal.ts:329-549` behind
  `requireInternalSecret`, with strong tests (`tests/server/internal.test.ts`) and the
  characterization spine (`surface_inventory.ts`, `parity.test.ts`, `completeness`).
- The bounded FIFO queue pattern (`server/discord_relay.ts` cap 50,
  `server/discord_activity.ts` cap 100 + 30s dedupe): the template for the new
  linked-member change feed. Note both modules currently have NO tests
  (`tests/discord_relay.test.ts` tests the unrelated `src/sim/discord_relay.ts`).
- The in-memory presence cache (`setDiscordPresenceCache`, `server/discord.ts:185`,
  staleness zeroing at `:191-203`): the zero-cost push exemplar, and the piggyback
  vehicle for bot observability counters.
- Server hot-path seams (`server/CLAUDE.md`): `createCachedRead`/`singleFlight` with
  moderation busts (currently unused by every Discord route), the retention sweep
  (`server/main.ts:3080-3087`), `teeMetricSink` (`server/http/middleware/metric_sink.ts:26`),
  and the `GameStateSource` readout object (`server/main.ts:3008-3022`).

## New work needed

Bot: rate-limit governor (pure), loop scheduler with overlap guards and adaptive
cadence (pure), nickname + members-meta diff-before-write with echo suppression,
linked-set sweep, bounded keep-alive transport, fatal-close exit + heartbeat, counters.

Server: `POST /internal/discord/flex-batch`, linked-member change feed module,
`GET /internal/discord/outbox` (drains relay + activity + winners + changes with
batched account lookups), members-meta multi-row upsert with unchanged-row skip,
`reward_ledger` retention story, `/api/discord` keyed cached-read with moderation busts.

Deploy: bot healthcheck/limits in compose, Caddy 404 for `/internal/*`, DEPLOY.md bot
section + incident runbook.

Verification: `bot` in tsconfig include, `build:bot` in the gate, tests for the five
untested bot files, tests for `discord_relay.ts`/`discord_activity.ts`, query-count
assertions, cadence pins, deploy pins.

## Discord contract research (primary sources, verified 2026-07-30)

Full citations in the research brief summarized here; canonical docs now live at
docs.discord.com (old discord.com/developers URLs 301-redirect).

- 429 body: `retry_after` (float seconds), `global` flag, plus `Retry-After` header and
  the normal `X-RateLimit-*` set (`Limit`, `Remaining`, `Reset`, `Reset-After`,
  `Bucket`, and on 429 `Scope`: `user` | `global` | `shared`). Shared-scope 429s do NOT
  count toward the ban counter; everything else invalid does.
- Buckets key on route + major parameter (`guild_id`/`channel_id`/`webhook_id`); track
  them via the `X-RateLimit-Bucket` hash (bootstrap with a provisional
  method+route+majorParam key, remap after the first response). Proactive rule: never
  dispatch from a bucket at `Remaining == 0`; wait out `Reset-After`.
- Global: 50 req/s per bot. Invalid-request ban: 10,000 requests returning 401/403/429
  per 10 minutes per IP; ban duration undocumented (design as indefinite).
- No published numeric limit for `PATCH /guilds/{guild.id}/members/{user.id}`; per-route
  limits are runtime-discoverable only. Never hard-code numbers; headers drive.
- Gateway full-member chunk requests (opcode 8, `limit: 0`) are rate limited to 1 per
  guild per bot per 30 seconds (changelog 2025-08-14, enforced everywhere 2025-10-01);
  backfill once at connect, maintain incrementally, never re-chunk on a timer.
- IDENTIFY: 1,000 per 24h (exceeding resets the bot token). Gateway sends cap: 120
  events per connection per 60s. Privileged-intent policy changed 2026-06-10: threshold
  is now 10,000 unique users (we are far under; self-toggle in the portal).
- Requests must carry a valid `User-Agent` (`DiscordBot ($url, $versionNumber)`); pin
  the API version in the base URL explicitly (`/api/v10`); `X-Audit-Log-Reason`
  (1-512 chars) is supported on member PATCH with no rate-limit cost.

## OPEN items (flagged, not blockers)

- O1: Ban duration undocumented; the breaker treats it as indefinite.
- O2: Member-PATCH per-route numeric limits undocumented; the governor learns them from
  headers at runtime.
- O3: A stricter hidden nickname-write limit is community-reported but unconfirmed;
  headers drive either way.
- O4 (human): confirm `GUILD_MEMBERS` + `GUILD_PRESENCES` stay enabled in the Developer
  Portal under the 2026-06-10 policy (self-serve under 10,000 users).
- O5: Whether member-write 429s return `user` or `shared` scope decides ban-counter
  exposure; instrument `X-RateLimit-Scope` from day one and check logs after deploy.
- O6: The gateway `RATE_LIMITED` event payload shape is unconfirmed; irrelevant unless
  someone reintroduces timed re-chunking (do not).
- O7: The Caddy `/internal/*` change takes effect at the next prod rollout, a deliberate
  manual step after the packet merges.

## Follow-ups deliberately out of scope (file as issues after the packet)

- Two-way chat relay (Discord into the world): moderation/sanitization/i18n surface.
- `/api/site-presence` write cadence.
- Retiring the now-unused per-endpoint internal GET routes (relay, activity, winners)
  once the frozen legacy ladder deletion lands (dual-arm churn makes it wrong to do now).
- Retiring the legacy `handleDiscordInternal` ladder itself (`server/internal.ts:75-241`),
  owned by the pipeline packet, not this one.
