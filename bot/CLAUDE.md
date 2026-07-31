# bot/: World of ClaudeCraft Discord bot

A standalone Node process (separate from the game server) that bridges the
official Discord server and the game two ways:

- **In Discord:** `/whoami` (link status + reward points) and `/link` (connect
  instructions); status-tier roles + a level-on-name nickname synced from in-game
  data (the `/flex` command was removed; `FlexData` survives because the role-sync
  poll reads it); in-game "!" community posts relayed as embeds with a respond
  deep-link button; a significant-activity feed (max level, rare drops, duels,
  arena); daily-rewards top-10 winner posts; a member reward on guild join
  (server-deduped; no welcome message is posted, intentionally quiet).
- **Into the game:** presence (online count + the featured voice room) and member
  metadata (guild join date + top staff role) pushed to the server, which renders
  the HUD Discord widget and the in-world name color + role tag.

Built like the server: `npm run bot` (esbuild bundle to `dist-bot/bot.cjs`, then run).
Zero new dependencies: Gateway over the existing `ws`, REST via built-in `fetch`.

## Files (one line each; each file's header comment is the reference)
- `logic.ts`: **pure, IO-free** protocol/diff/message-builder logic. Unit-tested in
  `tests/discord_bot.test.ts`, except the diff-before-write predicates
  (`nicknameNeedsWrite`, `memberMetaChanged`/`changedMemberMeta`, `isSelfNickEcho`), which
  are pinned in `tests/discord_bot_diffs.test.ts` beside the write paths they serve.
- `gateway.ts`: ws Gateway (v10) IO shell (HELLO/heartbeat, IDENTIFY, RESUME).
  Tested in `tests/discord_bot_gateway.test.ts`.
- `rate_governor.ts`: **pure, IO-free** Discord rate-limit governor. Owns ALL REST
  pacing: serialized FIFO queues keyed by the PROVISIONAL route template, rate state
  keyed by the `X-RateLimit-Bucket` hash PAIRED WITH the major parameter (the hash alone
  names a route shape, not one bucket: Discord documents it as non-inclusive of the
  top-level resource, so two channels share a hash and not a limit), proactive gating at
  `Remaining == 0`, the global pause (full `retry_after`, no ceiling), the Cloudflare ban
  pause on a non-JSON 429, the invalid-request breaker, the 401/403 cache, and the Phase 8
  counters. Only the rate state is remapped; the queues are never re-keyed, which is what
  makes the remap safe mid-flight. Time is injected; it reads no clock.
- `discord_api.ts`: thin Discord REST client (bot-token authed), an IO shell over the
  governor. Also owns the governor's production IO (`systemGovernorClock`,
  `consoleGovernorLog`) and `governorFromConfig`, the ONE construction site for a
  production governor: `main.ts` calls it, and `DiscordApi`'s own default routes through
  it. Tested in `tests/discord_bot_discord_api.test.ts`.
- `server_client.ts`: client for the game server's secret-gated `/internal/discord/*`
  endpoints (`x-woc-discord-secret`); grep `/internal/discord/` there for the live set.
  Tested in `tests/discord_bot_server_client.test.ts`.
- `config.ts`: env to `BotConfig` (throws on missing required). Tested in
  `tests/discord_bot_config.test.ts`.
- `cadence.ts`: the poll-loop interval DEFAULTS, importable without booting `main.ts`.
  `config.ts` layers the D13 env overrides over them; `main.ts` reads the resolved
  `BotConfig` fields, never these constants.
- `scheduler.ts`: the loop scheduler. A **pure, IO-free** decision core (overlap guard,
  coalescing kicks, jitter, the adaptive active-to-idle backoff) plus a thin driver that
  owns the one timer. Chained timeouts, never `setInterval`. NOT IO-free as a whole, unlike
  `logic.ts` and `rate_governor.ts`: `LoopScheduler` calls `setTimeout`/`clearTimeout` and
  defaults its random source to `Math.random`, both as injected trailing parameters with
  forwarding production defaults. Tested in `tests/discord_bot_scheduler.test.ts` against
  the virtual clock.
- `member_writes.ts`: the diff-before-write paths (nickname, members-meta, the
  member-update echo decision) with their cache bookkeeping, behind injected IO. Tested in
  `tests/discord_bot_member_writes.test.ts`.
- `main.ts`: wiring only: guild state seeded from `GUILD_CREATE` (plus the op 8
  member backfill for large guilds), kept live by the `GUILD_MEMBER_*` events,
  event dispatch, and the scheduler task registrations.

## New bot feature recipe (module-first)
1. Pure message-builder/diff/shaping logic in `logic.ts`, with a test in the suite that
   owns that family: message builders and protocol shaping in `tests/discord_bot.test.ts`,
   diff-before-write predicates in `tests/discord_bot_diffs.test.ts`. Bug fixes are
   test-first: a failing test that reproduces the bug, then the smallest change that turns
   it green.
2. If it talks to the game: a method in `server_client.ts` plus the matching
   secret-gated `RouteDef` in `server/internal.ts` (registered via `server/http/registry.ts`).
3. Only the wiring (a dispatch case or a poll loop) lands in `main.ts`.

## Invariants
- **The game server is the authority for rewards.** The bot never computes points
  or status; it reads them and pushes grants the server validates (dedupe keys).
  Discord (gateway/REST) state lives only here.
- **Pure/IO split** (like `wallet_link.ts` vs `wallet.ts`): protocol/diff/embed
  logic in `logic.ts` (tested), ws/fetch IO in the shells. Don't inline opcode or
  role-diff logic into `gateway.ts`/`main.ts`.
- **One injection convention in the three shells.** Each shell takes its IO as
  TRAILING parameters with production defaults, on a constructor or on a factory
  (`governorFromConfig`), so `main.ts` keeps
  constructing with the leading arguments only and gets exactly production IO.
  Every default FORWARDS to the global, `(...args) => fetch(...args)` and
  `(cb, ms) => setTimeout(cb, ms)`, never `= fetch` or `= { setTimeout }`: the
  forwarding form reads the global at CALL time, so a test that swaps a global
  after construction is still seen, and the global is never invoked with the
  instance as its `this`. Every shell also has a test that drives the DEFAULT
  path, not just the injected one; keep that pair when adding a shell, and write
  it so that it can actually fail, which takes BOTH of these:
  **construct the shell BEFORE stubbing the global** (stub-then-construct passes
  for a capturing `= fetch`, so it does not guard this rule at all), and
  **assert every argument the default forwards**, not just the first (a
  one-parameter stub passes for `(input) => fetch(input)`, which type-checks
  because TypeScript accepts an arity-reduced function, and which would strip
  the auth header off every request in production).
- **Every Discord REST call goes through the governor.** `discord_api.ts` never paces,
  retries, or sleeps on its own; it normalizes one response and hands the decision to
  `rate_governor.ts`. A new REST method is a `request()` call with the right options
  (`subjectKey` for a member write so the 401/403 cache can see it, `essential: true`
  only for traffic that must survive an open breaker, such as a slash-command reply and
  its 3 second deadline), never a bare call to the injected sender.
- **No credential ever reaches a bucket key, a log line, or a thrown message.** Three
  interaction routes carry a live ~15 minute bearer token in the PATH. `routeTemplate`
  emits `:token` and `redactPath` redacts the throw; ids are deliberately kept.
- **Secrets are env only**; never commit them. `DISCORD_BOT_SECRET` must match the server's.
- **Privileged intents:** `GUILD_MEMBERS` + `GUILD_PRESENCES` must be enabled for the
  application in the Discord developer portal, or IDENTIFY is rejected (close 4014).

## Poll loops (all on `scheduler.ts`, wired in main.ts)
**There are no bare `setInterval` loops in `main.ts`, and a new loop must not add one**
(pinned by `tests/discord_bot_main_wiring.test.ts`, which also bans a bare `setTimeout`,
requires EXACTLY the registrations listed below with each reading its own `cfg` cadence field
AND running its own sweep, pins every event `kick()` call site with an exact count, and
asserts `startAll()` precedes `gateway.connect()`; the gateway heartbeat in `gateway.ts` is a
different concern and stays). A repeating timer fires whether or not the previous run
finished, so once a sweep ran long the sweeps stacked and a slow minute became a storm that
survived restarts. Every loop is a `scheduler.add({...})` task instead: the next delay is
armed only after the previous run SETTLES, delays are jittered so loops armed in one boot do
not stay phase-locked, and repeated event kicks coalesce into exactly one follow-up run.
- Role sync (`role-sync`) and special-roles refresh + members-meta push
  (`special-roles-and-meta`): every `cfg.roleSyncIntervalMs` (5 min), plus a coalescing
  `kick()` on `GUILD_CREATE`; the meta task is also kicked when the op 8 member backfill
  finishes. The refresh and the push are ONE task because the push reads the index the
  refresh rebuilds, so their ordering is load bearing. Tier-role refresh (`tier-roles`) runs
  once at startup (before the gateway connects) and on the same 5 min cadence.
  The role sync also sets the level-on-name nickname (`buildLevelNick`; the base name
  fallback can be the member's own already-suffixed live nick, so `buildLevelNick` strips any
  existing suffix first to stay idempotent across re-syncs; `DISCORD_SYNC_NICKNAMES=0`
  disables).
- Presence push (`presence-push`): a `debounce` task, so voice/presence events open one
  `cfg.presenceDebounceMs` (4 s) window and every event inside it folds into one push.
- Relay, activity feed, daily-rewards winners: drained every `cfg.relayPollMs` (3 s), one
  task each. Daily-rewards days are marked back on the server only after a successful post,
  so a failed post retries (at-least-once).
- Daily engagement grant: first message or voice-join per member per day, deduped
  bot-side AND server-side (grant dedupe key), so it is exactly-once.
- The adaptive active-to-idle backoff exists in the scheduler but no task uses it yet: every
  task above sets `activeMs` only, so its cadence is constant. The consolidated outbox poll
  (D1: 3 s active decaying to 15 s idle) is the first consumer, in Phase 6.
- **A run that never settles stops its loop for the life of the process** (ledger L10, open
  until Phase 7). The next delay is armed only after the previous run settles, which is the
  whole overlap guarantee, so a `run` that never resolves leaves the task claimed with
  nothing armed, no counter and no log. A watchdog in the scheduler cannot fix it: recovery
  needs the run CANCELLED, and the scheduler holds a promise it has no way to abort. The
  real fix is a deadline on the fetch underneath (Phase 7 owns it, and `server_client.ts`
  already has `SERVER_CALL_TIMEOUT_MS` to copy). Until then, every `run` handed to
  `scheduler.add` must be one that always settles.

## Diff before write (D5): nothing is written unless it changed
`member_writes.ts` owns all three decisions, over the pure predicates in `logic.ts`, because
`main.ts` calls `main()` at module scope and so is unreachable from any test.
- **Nickname PATCH** only when the computed nick differs from the member's cached RAW nick.
  The raw nick is cached separately from `memberNames`: `displayNameOf` collapses nick,
  `global_name` and username into one string, so it cannot tell "the nick is X" from "there
  is no nick and the global name is X".
- **members-meta** pushed only for members whose record changed since the last SUCCESSFUL
  push, still byte-batched. A cleared record IS a change, so both clearing paths push, and
  they drop the member's cache entries so a rejoin re-pushes.
- **Self-echo suppression**: Discord answers every nickname PATCH with a
  `GUILD_MEMBER_UPDATE`, and answering that with a members-meta POST is the bot generating
  load against itself. An update carrying only the nick we just wrote, with an unchanged role
  SET (order is not promised), is dropped; anything else still pushes.
- **Caches move only after the write succeeded**, the `computeRoleSync` pattern. A cache
  written optimistically claims a failed write landed, and the retry never happens. Note
  `server_client.ts` answers `null` for a failed push rather than throwing, so the RETURN
  VALUE is the only success signal there is (and `undefined` counts too: a success envelope
  with no data comes back as `env.data` verbatim).
- **The diff cache is dropped wholesale every `FULL_RESYNC_INTERVAL_MS` (1 h).** It records
  what the bot BELIEVES the server holds, and the server can lose those values with nothing
  to tell the bot: a member in the guild who has not linked yet is written by an UPDATE that
  matches no row and is still counted as accepted, an unlink-relink inserts a fresh row with
  both meta columns null, and a restore or a moderation delete edits the table out of band.
  Before D5 every sweep re-pushed everything, so all of those healed within one interval
  without anyone enumerating them; the periodic resync is what keeps that property while
  still sending nothing for eleven sweeps out of twelve. **Do not "optimize" it away.**
- **Echo suppression is consumed, not remembered.** One PATCH produces one
  `GUILD_MEMBER_UPDATE`, so `decideMemberUpdate` reports `forgetWrittenNick` and the caller
  drops the entry. Holding it lets a moderator's rename BACK to a value the bot once wrote
  be misread as our own echo.

## Roles
- **Status tiers** (`WoC Initiate` up to `WoC Mythic`; ladder in
  `src/sim/discord_tier.ts`) are auto-provisioned at startup with per-rung colors
  (needs MANAGE_ROLES; idempotent). Without that permission, missing rungs are
  logged and skipped: create them by hand only in that case. A member holds
  exactly the role for their current rung (`computeRoleSync`).
- **Staff/special roles** (e.g. Levy St, Core Dev, Mods) live in the shared catalog
  `src/sim/discord_roles.ts`, matched by exact name or alias (case-insensitive);
  the member's top-priority role is pushed via members-meta and drives the
  in-world name color + tag. Grants and revokes are observed live
  (`GUILD_MEMBER_UPDATE` re-pushes that member's meta immediately), and EVERY
  guild role id matching a catalog key is indexed, so duplicate-named roles
  (an `Admin` and an `Admins`) both resolve. **A guild-side rename silently
  breaks the match**: add an alias to the catalog instead of renaming.

## Env (see .env.example; the live set is `grep process.env bot/config.ts`)
Required: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`,
`DISCORD_BOT_SECRET`. Optional: `GAME_SERVER_URL`, `PUBLIC_GAME_URL`,
`DISCORD_VOICE_CHANNEL_ID` (featured voice room), `DISCORD_TEST_CHANNEL_ID`
(one-time startup announcement), `DISCORD_RELAY_CHANNEL_ID` (falls back to test),
`DISCORD_ACTIVITY_CHANNEL_ID` (falls back to relay, then test),
`DISCORD_DAILY_REWARDS_CHANNEL_ID`, `DISCORD_SYNC_NICKNAMES` (`0` disables, default
on). Governor knobs (all optional, safe defaults): `DISCORD_MAX_RPS` (8),
`DISCORD_BAN_PAUSE_MS` (600000), `DISCORD_BREAKER_LIMIT` (300),
`DISCORD_FORBIDDEN_TTL_MS` (86400000). Loop cadences (D13, all optional):
`DISCORD_ROLE_SYNC_INTERVAL_MS` (300000), `DISCORD_PRESENCE_DEBOUNCE_MS` (4000),
`DISCORD_RELAY_POLL_MS` (3000); the defaults are `bot/cadence.ts`, so the value the suite
pins and the value the bot falls back to cannot drift apart. Each of these knobs falls back
to its default for an empty or non-numeric value, never to 0. `DISCORD_WELCOME_CHANNEL_ID` is read but currently
unwired (no welcome message is posted). Boot loads `.env`/`.env.local` when present but
runs fine from ambient env alone (`process.loadEnvFile`).

Adding an env key means adding it to `BOT_ENV_KEYS` in
`tests/discord_bot_config.test.ts` too: that suite pins the complete key set and asserts
exactly one dynamic `process.env[...]` lookup, so read a new key as a direct
`process.env.NAME` and pass the VALUE to a parser.

## Limits / notes
- Guild state is seeded from `GUILD_CREATE` and then kept live: `GUILD_MEMBER_ADD`
  seeds a joiner's roles/join date, `GUILD_MEMBER_UPDATE` reconciles a member's
  role set (so a role granted or revoked after boot reflects on the next push), and
  `GUILD_MEMBER_REMOVE` clears their stored flair. Guilds above the IDENTIFY
  `large_threshold` (250, the gateway max) omit offline members from
  `GUILD_CREATE`, so the bot backfills the full roster with
  `REQUEST_GUILD_MEMBERS` (op 8, streamed back as `GUILD_MEMBERS_CHUNK`). After
  every COMPLETE seed it also reconciles stored flair against the roster
  (`/internal/discord/flaired-ids`), clearing members who left while the bot was
  offline. Member-meta pushes are batched by BYTES (`MEMBERS_META_BATCH`), sized
  so a worst-case batch stays under the server's 64 KiB JSON body cap; the
  server's 1000-entry slice is defense in depth, never the binding constraint.
- "Speaking" indicators are not live (that needs a voice-gateway connection); the
  voice list shows membership + self-mute.
