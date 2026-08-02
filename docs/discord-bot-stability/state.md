# State: Discord Bot Stability (cross-phase cheat sheet)

Current phase: Phases 1 to 6 built and QA'd (Phase 6 QA closed 2026-08-01). Next:
Phase 7 (supervision and deploy hardening).
The packet's sync target is `origin/release/v0.34.0` (the maintainer's retarget call,
relayed in the Phase 6 handoff). Phase 6 QA's sync merged the admin guild backoffice
(PR #2590, 7 commits) as `50883ce3d`; the three Phase 5 feed sites in `server/db.ts`
conflicted with upstream's `bustAdminGuildListReads` calls and were resolved as UNIONS
(both effects side by side), audited with `release-merge-audit` (no internal-route or
legacy-arm contact, admin routes carried their own inventory rows, feed-site contract
premise intact: admin-guilds writes none of the feed tables and the flex payload has no
guild field). The header numbers here go stale fast: MEASURE the freshly fetched tip at
every phase start per the standing rules, never trust this line.

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
  plus mutation spot checks on that phase's new pure modules. The trap list to hold while
  writing or mutation-checking a pin is "Known gotchas for implementers" at the bottom of
  this file; there is no memory "test-pin trap index" and there never was (verified
  2026-07-31). Two additions Phase 3 QA proved out: an adversarial skeptic must have the
  file OPEN and quote the code before a refutation counts, and the FIX round needs its own
  fresh-eyes review, because the first shape of Phase 3 QA's scheduler fix cured a deadlock
  by introducing overlap and only that second review caught it.
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

1. **Sync the release base FIRST.** `git fetch origin release/v0.34.0` (the sync target
   since Phase 6; earlier phases tracked v0.33.0), then
   `git rev-list --left-right --count HEAD...origin/release/v0.34.0`. If behind, merge
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

Server: `server/internal.ts` (the `routes` RouteDef table, the FROZEN legacy twins under
`handleDiscordInternal`, plus the Phase 4 helpers `sanitizeDiscordIdList`,
`parseMemberMetaRecords`, `applyMemberMetaPush`, `flexBatchHandler`),
`server/discord.ts` (discordFlexForAccount, discordFlexForAccounts, the status payload,
the presence cache), `server/discord_db.ts` (accountForDiscord, setDiscordMemberMetaBulk,
discordFlexRowsForDiscordIds, reward_ledger DDL with its keep-forever note),
`server/discord_relay.ts` (cap 50),
`server/discord_activity.ts` (cap 100, 30s dedupe), `server/discord_link_changes.ts`
(Phase 5: cap 5000, 30s per-account dedupe, drained only by the outbox), `server/db.ts`
(highestCharacterForAccount, with the LOCKSTEP note above it),
`server/http/middleware/require_internal_secret.ts`,
`server/http/registry.ts` (the `import { routes as internalRoutes }` block and the
`...internalRoutes` spread in the apiRoutes assembly; coordinates traded for symbols in
Phase 5 because the v0.33.0 merge landed the epic route family around both),
`server/main.ts` (the retention-sweep registration block and the `gameStateSource`
assembly; coordinates traded for symbols by Phase 5 QA because its release sync moved
them again, the exact drift the working rule below predicts),
`server/reports.ts` (site-presence :285, re-verified after the Phase 5 release merge).

The line numbers that survive above are the files NO phase of this packet has
edited, so their coordinates are as good as the day they were written; the ones
this packet moves carry symbol names instead. That split is the working rule for
this paragraph, not an oversight: Phase 4 QA removed the `server/internal.ts`,
`server/discord.ts` and `server/db.ts` coordinates specifically because Phase 4
had moved every one of them (the routes table alone slid from :329 to :451) while
the stale span still read as correct. Any phase that edits `registry.ts`,
`main.ts` or `reports.ts` should trade their numbers for symbols in the same
change rather than re-measure them.

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

Config: `tsconfig.json` (`include` carries `bot` as of Phase 1, so all EIGHT bot files
are type-checked (Phase 2 added `rate_governor.ts`), `bot/main.ts` among them; pinned by `tests/deploy_discord_bot.test.ts`
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
- Phase 3: `bot/scheduler.ts`, the pure loop scheduler every background loop and the
  presence debounce now run on (chained timeouts, overlap guard, coalescing kicks, jitter,
  adaptive active-to-idle backoff; pure decision core plus a thin timer-owning driver);
  `bot/member_writes.ts`, the diff-before-write paths and their cache bookkeeping behind
  injected IO; three new pure predicates in `bot/logic.ts` (`nicknameNeedsWrite`,
  `memberMetaChanged` with `changedMemberMeta`, `isSelfNickEcho`) plus the now-named
  `MemberMetaRecord`. `bot/main.ts` holds no `setInterval` at all. Ledger items L7 and L12
  closed here, L11 found already closed and pinned.
- New env keys (Phase 3, the D13 cadences; DEPLOY.md documentation landed in Phase 7):
  `DISCORD_ROLE_SYNC_INTERVAL_MS` (300000), `DISCORD_PRESENCE_DEBOUNCE_MS` (4000),
  `DISCORD_RELAY_POLL_MS` (3000). Unlike the governor knobs the defaults are NOT new
  constants: they are the existing `bot/cadence.ts` values, which `bot/config.ts` imports,
  so the value the suite pins and the value the bot falls back to cannot drift apart. Each
  falls back for empty, non-numeric and non-positive alike, never to 0. **These are STILL
  NOT in `.env.example`, re-verified during Phase 3 QA on 2026-07-31** (`git grep -l
  DISCORD_ROLE_SYNC_INTERVAL_MS HEAD` returns no `.env.example`, where the Phase 2 governor
  knobs do), and every `.env*` path remains blocked at the harness level for both Read and
  Bash, so no session in this environment can add them. R8's equivalent for these three keys
  is OWED and needs the maintainer. The values are the real defaults, not placeholders: an
  operator who uncomments a wrong number gets the storm this packet exists to prevent. Add,
  commented, beside the existing governor block:
  `#DISCORD_ROLE_SYNC_INTERVAL_MS=300000`, `#DISCORD_PRESENCE_DEBOUNCE_MS=4000`,
  `#DISCORD_RELAY_POLL_MS=3000`.
- New env keys (Phase 2, the first four; R8 satisfied and re-verified in Phase 2 QA against
  the file itself, each commented default matching its exported `DEFAULT_*` constant. DEPLOY.md documentation landed in Phase 7 per D13):
  `DISCORD_MAX_RPS` (8), `DISCORD_BAN_PAUSE_MS` (600000),
  `DISCORD_BREAKER_LIMIT` (300), `DISCORD_FORBIDDEN_TTL_MS` (86400000).
  The defaults are exported from `bot/rate_governor.ts` as `DEFAULT_MAX_RPS`,
  `DEFAULT_BAN_PAUSE_MS`, `DEFAULT_BREAKER_LIMIT`, and `DEFAULT_FORBIDDEN_TTL_MS`, and
  `bot/config.ts` imports them, so the config fallback and the governor's own
  construction default cannot drift apart.
- Counter names Phase 8 consumes (D16), the snapshot from `RateGovernor.snapshot()`.
  FOURTEEN fields, not twelve: the list below was short by `trackedRoutes` and
  `activeQueues` until the Phase 2 QA round, and Phase 8 ships exactly this list, so
  read it from the `GovernorCounters` interface rather than from any prose summary.
  `requests`, `rateLimited`, `rateLimitedByScope` (`user`/`global`/`shared`/`unknown`),
  `globalPauses`, `banPauses`, `breakerState`, `breakerOpens`, `queueDepth`,
  `trackedBuckets`, `trackedRoutes`, `activeQueues`, `forbiddenEntries`,
  `forbiddenBlocks`, `breakerBlocks`.
  `DiscordApi.counters()` is the accessor the wiring will read. The three registry
  sizes (`trackedBuckets`, `trackedRoutes`, `activeQueues`) exist so the LRU bounds are
  observable at all; the first two are capped by `MAX_TRACKED_BUCKETS` and
  `MAX_TRACKED_ROUTES` (separate constants, same value, different populations).
- New endpoints: `POST /internal/discord/flex-batch` (Phase 4, RouteDef-ONLY: the first
  `/internal/*` route with no legacy `handleDiscordInternal` arm, since a route born after
  the pipeline migration never gets one). Body `{ discord_user_ids: [...] }`, capped at 1000
  and validated exactly like the members-meta member list; answers
  `{ requested, members: [...] }` where each member is the per-id flex payload plus
  `discord_user_id` and `linked: true`, and an UNLINKED id is ABSENT rather than stubbed.
  `requested` echoes the accepted id count so a caller can tell a dropped request from a
  genuinely empty answer. **Phase 6 must compare it against the number of DISTINCT in-cap id
  strings it sent, not its raw array length**: the count is taken after the cap, the
  non-string drop and the de-duplication, so a caller that sent repeats would read a
  perfectly delivered response as a truncated one. The bot holds its sweep ids in a `Set`,
  so this is a contract note rather than a live defect (Phase 4 QA).
  BUILT in Phase 5: `GET /internal/discord/outbox` (RouteDef-only behind `discordGate`, the
  SECOND no-legacy-twin internal row after flex-batch; internal ladder counts moved 20 to 21
  in `completeness.test.ts` and `ownership_coverage.test.ts`). One request drains all four
  streams into `{ relay: { items }, activity: { items }, winners, linkChanges: { items } }`,
  envelope key order pinned, per-endpoint item shapes preserved byte-for-byte so Phase 6
  reuses the bot-side handlers (proved by running one fixture through both the old GETs and
  the outbox). Identity resolution is ONE `discordLinksForAccounts` IN query over the
  deduplicated union of relay, activity, and link-change account ids (zero
  `discordForAccount` calls); an empty drain performs zero identity queries unconditionally
  and zero winners queries on a warm cache. Link-change items enrich as
  `{ accountId, kinds, discordUserId, discordUsername, discordAvatar }`; the carried
  discordId takes precedence (an unlink's row is gone by drain time) and items with neither
  a carried id nor a link row are DROPPED as unlinked-account noise (the playtime grant
  path enqueues for unlinked accounts by design).
  Review-round hardening (2026-08-01, privacy-security + database-performance):
  - RETRY CONTRACT, written in the handler doc comment for Phase 6: winners is read FIRST
    (before any drain) and is an idempotent at-least-once read; the three in-memory streams
    are PRESERVED ON ERROR (the catch requeues all three drains front-of-queue via the new
    `requeueRelay` / `requeueActivity` / `requeueLinkChanges` helpers, then rethrows) and
    consumed only by a 200, which is the sole acknowledgement.
  - Link changes drain a PAGE per poll (`OUTBOX_LINK_CHANGE_PAGE` 1000, the flex-batch cap
    ceiling); a backlog pages out across successive polls, bounding both the serialization
    spike and the amount at risk per failed poll.
  - The winners ask is `OUTBOX_WINNER_DAY_LIMIT` 1 (the bot announces one day per poll;
    minimizes routine wallet-pubkey exposure; the standalone GET serves up to 5 until D11
    retirement).
  - Repoint identity: name/avatar decorate ONLY when the resolved row's id equals the id
    being emitted; a repoint item (old id carried, row holds the new identity) emits nulls
    rather than one user's id wearing another's handle.
  - REFUTED reviewer finding, recorded so it is not re-litigated: a claimed cross-process
    double-announce window on the winners cache requires two processes serving the SAME
    realm, and the deployment model is process-per-realm (`server/realm.ts`: "each instance
    hosts exactly one realm"; `unannouncedWinnerDays` filters `WHERE d.realm = $1` on the
    process REALM), so no second process can hold a warm cache containing another realm's
    day. If same-realm horizontal scaling ever arrives it breaks the ENTIRE in-memory feed
    transport (relay, activity, this feed), not just the cache; the hardening to take then
    is mark-as-claim (`AND discord_announced_at IS NULL`, rowCount decides) plus bot-side
    mark-first-announce-on-ok.
  - Kept deliberately, with reasons: link-change items carry `accountId` (relay items
    already expose it, and Phase 6 may want it; revisit at minimization) and the noise
    class evicted first at cap (kinds exactly ['points'], no carried id) includes LINKED
    accounts' point changes too, because the enqueue site cannot tell them apart; points
    staleness heals on the bot's periodic resync, a lost link/unlink id does not.
- New modules: `bot/cadence.ts` (the three poll-loop DEFAULTS, values only; `config.ts`
  layers the env overrides over them as of Phase 3), `bot/rate_governor.ts` (Phase 2, pure
  and clock-injected), `bot/scheduler.ts` and `bot/member_writes.ts` (Phase 3), and
  `server/discord_link_changes.ts` (Phase 5: the linked-member change feed, pure and
  dependency-free; `enqueueLinkChange(change, now)` / `drainLinkChanges()` /
  `linkChangeDepth()`, `LINK_CHANGE_MAX_QUEUE` 5000 sized to the D18 member envelope
  because dedupe bounds live entries to distinct accounts, `LINK_CHANGE_DEDUPE_TTL_MS`
  30_000 matching `discord_activity.ts`. Dedupe merges kinds set-union into the account's
  OPEN item, first-observed discordId wins, the TTL window is minted-anchored so a merge
  never slides it, and dedupe NEVER consults drained or evicted history: a change deduped
  against an item the bot already received would be a change the bot never sees, which is
  the exact staleness bug this packet exists to kill. Review round added
  `drainLinkChanges(max)` paging that clears only the page's dedupe entries, and
  `requeueLinkChanges` (front-insert restoring each item's ORIGINAL mint stamp via a
  WeakMap so a requeue can never extend a dedupe window; a newer open item keeps pending
  ownership). The QA round upgraded eviction to a four-rung LADDER in a single O(n)
  marking pass (`EVICTION_LADDER`): playtime noise (kinds exactly ['points'], no id)
  oldest-first, then any other id-less non-link/unlink item, then ANY non-link/unlink
  item (id-carrying included, so the link/unlink-last promise is structural rather than
  an accident of today's sites), then plain oldest-first. 'link'/'unlink' items (whose
  carried id the bot can never re-learn from a resync) are the LAST thing the cap
  spends; the old two-rung rule let an id-less flex item outlive a link item, and the
  old per-eviction findIndex rescan cost 21 ms for a page requeue at cap (measured),
  versus sub-millisecond now).
- Phase 5 server additions (existing modules): `discordLinksForAccounts` in
  `server/discord_db.ts` (the set-based sibling of `discordForAccount`,
  `account_id = ANY($1::int[])`, empty input short-circuits with zero statements, executed
  and plan-probed in `tests/discord_db_integration.test.ts` at a 5,000-row seed; the QA
  round narrowed `DiscordOutboxLinkRow` and the SELECT to the four fields the outbox
  reads, dropping guild_member and linked_at as dead payload);
  `outboxHandler` RouteDef in `server/internal.ts`; the winners TTL cache in
  `server/daily_rewards.ts` (`DAILY_REWARD_WINNERS_TTL_MS` 30_000 over
  `unannouncedWinnerDays(5)` via `createCachedRead`, rows copied on the way out, busted at
  `finalizeRewardDay` after `db.finalizeDay` resolves 'finalized' AND at
  `markDiscordWinnersAnnounced` on a successful mark, AND per the review round at every
  moderation-reachable content mutation: `voidPayout` / `restorePayout` success arms, and
  the excluded-accounts surface; the QA round added the payout runner's REAL writes,
  claimPayout 'claimed' and markPayout 'updated' only (markPayout now answers
  'updated' / 'already' / 'missing', `DailyRewardPayoutMarkOutcome`, so an idempotent
  replay never evicts a healthy snapshot), and the resend arms stay unbusted because
  they write only the attempts table (a VIEW over `daily_reward_bans` / `daily_reward_ip_bans`
  whose backing writes fire the moderation hook, so the bust rides `bustBoardCaches` in
  `server/main.ts`), per the server/CLAUDE.md rule that anything a moderation action can
  change must be bust-wired in the same change. The per-day taskName derivation also moved
  INTO the cache refresh, so a warm poll costs zero DB reads AND zero config fetches and
  the single-slot `dailyRewardRuntimeConfig` cache is no longer thrashed by polling;
  `bustWinnersCache()` / `bustDailyRewardWinnersCache()` are the bust plus test-reset
  hooks, and the service constructor takes an optional injected `now`).
- New tests (Phase 5): `tests/server/discord_link_changes.test.ts` (19 tests at build, 9/9
  mutation pass, extended by the review round for eviction preference, paging, and requeue)
  and `tests/server/discord_outbox.test.ts` (the D18 payload bound at the REAL worst case,
  the page-limited drain: measured 279,891 bytes serialized in 0.27 ms, pinned under
  420,000 with a 270,000 floor against hollow fixtures; the pre-paging whole-cap figure was
  979,051 bytes, kept here for the record; plus the paging continuity pin and the
  link-change overflow survivor pin), with
  extensions in `tests/server/internal.test.ts` (the ONE-identity-query pin over a mixed
  drain, the zero-query empty-drain pin, shape-preservation fixtures through old and new
  routes), `tests/discord_db.test.ts`, `tests/discord_db_integration.test.ts`,
  `tests/daily_rewards.test.ts` (cache hit/miss/bust arms on an injected clock),
  `tests/server/daily_rewards_routes.test.ts` (cache reset in setup),
  `tests/character_db.test.ts`, `tests/character_lease_game.test.ts`,
  `tests/game_sessions.test.ts`, `tests/discord_server.test.ts` (the per-transition-class
  enqueue pins).
- New server functions (Phase 4, all in existing modules; no new server module was needed):
  `discordFlexRowsForDiscordIds` and `setDiscordMemberMetaBulk` in `server/discord_db.ts`,
  `discordFlexForAccounts` in `server/discord.ts`, and `flexBatchHandler` plus the shared
  `applyMemberMetaPush` / `parseMemberMetaRecords` / `sanitizeDiscordIdList` in
  `server/internal.ts`. `setDiscordMemberMeta` (the per-member serial UPDATE) was REMOVED,
  not kept beside its replacement: `server/internal.ts` was its only caller, so leaving it
  would have been dead code. Both members-meta dispatch arms now call one shared function
  rather than each reproducing the body, which is a stronger form of the dual-edit rule.
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
  Phase 3 adds `tests/discord_bot_scheduler.test.ts` (the pure cadence math, the jitter
  band, the run-state machine, and the driver arms: overlap, coalescing, chaining, the
  adaptive walk to the idle ceiling and the snap back, the error arm, stop, and the whole
  debounce mode, all at EXACT virtual times), `tests/discord_bot_diffs.test.ts` (the three
  pure predicates, one negative case per meta field), and
  `tests/discord_bot_member_writes.test.ts` (the composed write paths: the zero-write steady
  state, the failure arm asserting the CACHE rather than a call count, the batching, and the
  echo arms). `tests/discord_bot_governor_pacing.test.ts` gained the L11 and L12 arms.
  Phase 4 adds four SERVER files. `tests/server/discord_relay_queue.test.ts` and
  `tests/server/discord_activity_queue.test.ts` are the first coverage either in-memory queue
  has ever had (FIFO drain, the caps REACHED and the survivors pinned, the dedupe TTL on both
  sides of the boundary, the 512-key sweep); their names avoid `tests/discord_relay.test.ts`,
  which covers the unrelated sim module, and each says so in a header comment.
  `tests/server/discord_flex_batch.test.ts` owns the row-to-payload mapping, including the
  parity pin that runs `discordFlexForAccount` and `discordFlexForAccounts` over the SAME
  account data and compares their output rather than restating the fields twice.
  `tests/discord_db_integration.test.ts` is the DB-gated arm (skips green without
  `TEST_DATABASE_URL`) that actually EXECUTES the two new statements: `tests/discord_db.test.ts`
  drives them through a fake pool routing on SQL text, so nothing there parses or plans a line
  of them. It proves the changed/skipped/unapplied classification, the no-op skip writing no
  row version, NULL-safe comparison, realm scoping, the malformed-`state.level` fallbacks, and
  the plan shape at scale.
- New shared test helper: `tests/helpers/synthetic_clock.ts`, a fully virtual clock.
  Phase 3's scheduler drives it rather than vitest fake timers, as ruled.
- OPEN, from the Phase 2 privacy-security review (no blocking findings; L1 confirmed
  closed per call site and no secret committed). Three tracked follow-ups it raised that
  Phase 2 did NOT close, each with its reason:
  - The four env knobs are validated as positive-finite but not RANGE clamped, so an
    operator can defeat the very control they configure: `DISCORD_MAX_RPS=1000` turns
    the global cap into an accelerator well past Discord's own 50 rps ceiling,
    `DISCORD_BAN_PAUSE_MS=1` is a disabled ban pause, and a huge `DISCORD_BREAKER_LIMIT`
    means the breaker never opens. Operator-controlled rather than attacker-controlled,
    which is why it is not blocking. A clamp to documented ranges is the fix.
  - The interaction-callback path has every ceiling off at once BY DESIGN: its own
    bucket per interaction id (so MAX_QUEUE_DEPTH never binds), exempt from the global
    rate cap per Discord's contract, and `essential` so the breaker never stops it. Not
    a regression, since the replaced client had no pacing at all, but it is the one path
    through the governor with no ceiling and a guild member can trigger it at will. A
    per-process in-flight cap would close it without touching the documented exemption.
  - `redactPath` preserves a query string verbatim while `routeTemplate` strips it. The
    asymmetry is DELIBERATE and pinned on both sides
    (`tests/discord_bot_governor_determinism.test.ts`, the query-string cases), so do not
    "fix" it by making them agree. What is genuinely open is the risk it carries: a future
    Discord call with a token or signature in the query would reach the thrown message
    intact. Phase 2 QA sharpened the recorded reason, because "no current call site uses a
    query" is true of `bot/discord_api.ts` today but is a fact about the CALLERS, not a
    property of `redactPath`, so it stops being true the moment a phase adds a query
    parameter. Whichever phase adds one owns redacting it.
- Ruled-acceptable residuals from PHASE 3, same footing as the Phase 2 ones below: the
  `clearArmed()` inside `LoopTask.kick()` and the `if (this.active) return` guard in
  `start()` both survive deletion and cannot be killed by any assertion. `schedule()` clears
  the previously armed handle before arming the next, and the overlap guard absorbs a stale
  timer that fires during a slow run, so both lines are defense in depth rather than load
  bearing. They are kept because each is locally correct on its own terms; the test comments
  say so explicitly rather than claiming coverage they do not have. Do not score either as a
  surviving mutant.
- Ruled-acceptable residuals, do NOT "fix" either and do not score either as a surviving
  mutant. Neither can be distinguished by any assertion, so a test for them is impossible
  rather than merely missing:
  - The drain loop in `evictBuckets` is observationally identical to a single `if` while
    entries are inserted one at a time. Kept as defense against a future batch insert,
    exactly as R14 and the S05 precedent were kept.
  - The loop inside `waitForPause` became observationally identical to a single sleep once
    the dispatch gates were made a LOOP (Phase 2 QA): a pause extended while a request is
    already asleep is now re-read by the OUTER loop's `isGated` check, whichever shape the
    inner one takes. It is kept because `waitForPause` has to be correct on its own terms,
    not only in the one composition that currently calls it. Same footing as the
    `evictBuckets` drain.
- `waitForBucket` and the pre-send `isGated` check BOTH read `bucketBlockedUntil` and must
  keep doing so. When the condition was written out twice, a change to one alone made the
  dispatch loop spin hot, and a hot spin in an async loop starves the macrotask queue: the
  process HANGS rather than failing, which is the worst shape a guard failure can take.
  This was found by mutation, not by a test, so keep the single predicate.
- DEFERRED to a later phase, recorded here rather than left implicit: D4's
  role-position arm ships as a HOOK with no caller. `RateGovernor.invalidateForbidden()`
  (exposed as `DiscordApi.invalidateForbidden()`) is never invoked, so today a cached
  401/403 clears only when `DISCORD_FORBIDDEN_TTL_MS` expires. Whichever phase owns the
  bot's own role-position tracking must wire it, because until then an operator who
  grants a missing permission sees no effect for up to 24 hours.
- The permanent-failure cache is keyed PER PERMISSION, not per member
  (`nick:<guild>:<user>` and `roles:<guild>:<user>`). One key per member is a real
  defect, found by the Phase 2 QA gate: Discord 403s a nickname PATCH permanently for
  the guild owner and for anyone above the bot in the role hierarchy, so a shared key
  let a nickname failure suppress that member's tier-role sync for the whole TTL, and a
  missing MANAGE_NICKNAMES stopped role sync guild-wide. Keep any future subject key
  scoped to the permission that can fail.
- Phase 2 QA (2026-07-30) changed the module in one load-bearing way, plus four smaller
  ones. Read this before reasoning about bucket identity:
  - **Rate state is keyed by the bucket hash PAIRED WITH the major parameter**
    (`` `${hash}|${majorParameterOf(template)}` ``), never by the bare hash. Discord
    documents `X-RateLimit-Bucket` as non-inclusive of the top-level resource, so the
    hash names a route SHAPE: two channels, or two guilds, hit on one route answer with
    the SAME hash while holding genuinely separate limits. The bare-hash key merged them
    into one `LimitState`, and since the bot posts to up to four distinct channel ids
    through one `createMessage` route this was live traffic, not a corner case. The
    failure ran both ways: one channel reporting headroom erased another's exhausted
    window and the next post dispatched at `Remaining == 0` (the exact thing D2 exists to
    prevent), and one channel's spent window gated every other channel. `majorParameterOf`
    is exported and pinned. Two templates that share a hash AND a major parameter still
    merge, which is the case the remap was written for.
  - The `MISSING_RETRY_AFTER_MS` floor now covers a wait that is PRESENT but zero.
    `retry_after: 0` is not nullish, so it slipped past the absent-value fallback and
    produced a 0 ms wait; on the interaction path, which is exempt from the global rate
    cap, that is `MAX_ATTEMPTS` back-to-back sends with nothing pacing them. A genuine
    sub-second `retry_after` is still honored exactly.
  - A bucket-hash CHANGE no longer deletes the old key's state. Other templates may still
    resolve to it, and the delete destroyed their gating over a rotation that had nothing
    to do with them. Only the first provisional-to-hash migration copies state now.
  - **The dispatch gates are a LOOP, not an ordered sequence.** The pause, the bucket gate,
    and the rate slot each re-read until none is in force, with a synchronous `isGated`
    check immediately before the send. Ordering alone provably cannot work here: each gate
    can block for minutes, another queue can raise a different one meanwhile, and whichever
    gate is checked LAST is the one whose predecessor goes stale. The QA round first shipped
    the ordered form (pause, bucket, slot, pause, bucket) and its own fresh-eyes review
    caught that this had merely moved the hole: a ban pause declared while a request slept
    in the final bucket gate was never re-read. The loop also RE-RESERVES the rate slot on
    every pass, because a slot taken and then sat on for a whole bucket window paces nothing
    by the time the send happens, and every request coming off that window would fire
    together with no spacing at all.
  - A `retry_after` of Infinity is rejected. `JSON.parse` turns `1e999` into `Infinity` and
    its `typeof` IS `'number'`, so it passed the old guard, set `pausedUntil` to Infinity,
    and a sleep of Infinity is clamped by the platform to about a millisecond: the pause
    loop then spun at a thousand iterations a second and the bot never sent again.
    `headerNumber` already had the finiteness guard; the body path now matches it.
  - `MAX_TRACKED_ROUTES` is now its own constant (same value as `MAX_TRACKED_BUCKETS`).
    One constant bounded two populations with different lifetimes.
- New exports from Phase 2 QA: `majorParameterOf` and `MAX_TRACKED_ROUTES`
  (`bot/rate_governor.ts`), and `governorFromConfig` plus the `GovernorConfig` shape
  (`bot/discord_api.ts`). `governorFromConfig` exists because `bot/main.ts` calls `main()`
  at module scope, so its construction site is unreachable from any test and a transposed
  pair of knobs shipped in silence; the mapping is now pinned. `GovernorSend` was deleted
  (a fully dead export).
- New exported constant: `SERVER_CALL_TIMEOUT_MS` (8000) in `bot/server_client.ts`,
  named so the suite can pin the deadline against a literal.
- Touched pins: `tests/ci_workflow.test.ts` structural counts (release-gate
  single-shard conditions 8 to 9, release-gate steps 12 to 13) plus the pr-checks
  build-step coverage loop. Phase 1 QA then rewrote that file's gate and CI pins per
  R17 (comment-stripped source, line and adjacency anchors, a pr-checks step count, and
  a workflow trust-posture test) and extended `tests/deploy_discord_bot.test.ts` with the
  bot build and typecheck surface.

- Phase 6 (bot consumes the new surface, built 2026-08-01; QA session still owed):
  - New modules: `bot/linked_sweep.ts` (pure: the linked-member set fed by flex-batch
    answers under the requested-echo contract, the outbox link-change stream read as a
    KIND SEQUENCE via `terminalLinkKind` so a relink is not dropped, and the members-meta
    `unapplied` signal, which the bot finally consumes per L14's condition; the noLinkRow
    plus metaStale memory that re-pushes a member's meta on a fresh link, closing the
    repoint staleness without touching L14; dirty-first slicing; pass windowing where the
    window is a FLOOR; one idempotent discovery per complete seed, never periodic) and
    `bot/outbox_consumer.ts` (injected-IO: breaker gate BEFORE the drain, per-item
    catches, winners announce-then-mark, channel routing bound in the factory so a swap
    is testable, didWork split by stream class: drained streams count by carriage, the
    re-served winners read by successful announce).
  - Client surface: `ServerClient.flexBatch` (list sent verbatim, `FLEX_BATCH_LIMIT`
    1000) and `drainOutbox` on a per-call deadline (`DEFAULT_OUTBOX_TIMEOUT_MS` 70000,
    above the server's 65s read deadline because a 200 is the outbox's only
    acknowledgement); `pushMembersMeta` return widened to `MembersMetaPushResult`
    (changed/skipped/unapplied were already flowing at runtime; the updated===0 refusal
    stands). DELETED: `flex`, `drainRelay`, `drainActivity`, `dailyRewardWinners` (zero
    references remain; the server-side same-name queue functions are unrelated and
    untouched).
  - Loops: 7 scheduler tasks became 5. The three 3s pollers are ONE `outbox` task
    (activeMs `DISCORD_OUTBOX_POLL_MS` 3000 decaying to `DISCORD_OUTBOX_IDLE_MS` 15000,
    poll deadline `DISCORD_OUTBOX_TIMEOUT_MS` 70000); `role-sync` is slice-driven
    (activeMs `DISCORD_SWEEP_SLICE_MS` 3000, slice size `DISCORD_SWEEP_SLICE_SIZE` 100
    chosen against the governor's 256 per-queue depth, idleMs the pass interval).
    `DISCORD_RELAY_POLL_MS`, `relayPollMs` and `RELAY_POLL_MS` are DELETED; the key must
    NOT be resurrected in `.env.example`. The five NEW keys are owed to `.env.example`
    (harness-blocked, maintainer-only), commented beside the governor block:
    `#DISCORD_SWEEP_SLICE_MS=3000`, `#DISCORD_SWEEP_SLICE_SIZE=100`,
    `#DISCORD_OUTBOX_POLL_MS=3000`, `#DISCORD_OUTBOX_IDLE_MS=15000`,
    `#DISCORD_OUTBOX_TIMEOUT_MS=70000`; Phase 7 documented all of them in DEPLOY.md
    (D13, done 2026-08-01; the `.env.example` fills remain owed to the maintainer).
  - Phase 5 QA contract notes, honored: exactly one serialized outbox poll (the
    scheduler task overlap guard, pinned behaviorally); client timeout 70s above the
    server deadline; winners consumption and mark on the ONE sequential task; a repoint
    feed item is read as who to STOP flairing (the old id), the new identity arriving
    via flex-batch or the resync. The flex-batch `requested` echo is compared against
    the DISTINCT ids sent; a suspect answer applies positive evidence only.
  - The hourly `FULL_RESYNC_INTERVAL_MS` meta resync is RETAINED unchanged (still the
    heal for feed eviction, the cascade unlink, and the repoint identity); the bot now
    also consumes `unapplied`, so L14's blocking condition is met, but shortening or
    removing the resync stays a separate maintainer decision.
  - Steady-state outbound profile (the incident metric): ONE periodic game-server
    request (the outbox poll, 4/min idle, 20/min busy), role-sync flex-batch requests
    only while a pass or dirty work exists, presence push per debounce window, plus
    short-lived event-driven calls. Analytic bound: 1 to 3 concurrent established
    sockets to the game server versus the incident's ~110. No Discord credentials exist
    in this environment, so the live `lsof` measurement is VERIFY-AT-DEPLOY (recorded in
    progress.md).
  - Known accepted behavior changes, recorded in bot/CLAUDE.md: with a stream's channel
    id unset, drained relay/activity items are dropped after a once-per-channel notice
    (the old pollers checked the channel before draining); while the breaker is open the
    skipped drain also delays link-change consumption (worst case about an hour if the
    Phase 5 ladder evicted the items, healed by the resync); the pass window is a floor
    (effective default gap about 6.4 minutes, event kicks bypass it).
    Two residuals from the fresh-eyes round, pre-existing shapes recorded rather than
    changed: a day that announces but whose MARK durably fails re-announces every poll
    at the fast cadence (the at-least-once contract; a bounded re-announce is a Phase 7
    or 8 candidate), and a presence-only id that arrives MID-seed can be evicted at
    completeness and self-heals on its next presence event.
  - Flagged for the maintainer, pre-existing, NOT changed here: a departed or unlinked
    member keeps their tier role and level-nick suffix on Discord (`syncRolesFor` has
    always returned early on unlinked); Phase 6 made the sweep set explicit, so a
    clear-on-unlink would now be easy to add if wanted.
  - New tests: `tests/discord_bot_linked_sweep.test.ts` (62 after the QA session),
    `tests/discord_bot_sweep_cycle.test.ts` (14, the D18 composed harness: 5000 roster /
    1000 online / 300 linked, D6 by value, the spread pinned at exactly one slice's
    writes per tick, steady-state zero writes and zero meta pushes, discovery, the
    governor-refusal arm, the composed null-answer re-serve and unasked-id-injection
    arms), `tests/discord_bot_outbox.test.ts` (28). Extended: config (34), main-wiring
    (14, including the idle-column and nextSlice-argument pins the build's gate added
    and the QA session's runSweepSlice body pins, GUILD_MEMBER_REMOVE forget pin,
    no-bare-fetch pin, and SWEEP_SLICE_MS cadence-ban entry), server_client (49 at the
    client commit, 26 after the deletions landed).
    Mutation tallies, build phase: C 6/6, A 14/14, B 12/12, build QA-gate fix round
    5/5. QA session (2026-08-01): spec pass 12/12 (all eight charter classes, the
    governor bypass killed by the breaker-refusal pin), fix-round pass 15/15. All with
    rc!=0 plus named failing tests.
  - Phase 6 QA session record (2026-08-01), the module-surface changes a later phase
    must know: `LinkedSweep.forget(id)` is the single-member prune GUILD_MEMBER_REMOVE
    now calls (drops linked/dirty/pass-cursor AND the noLinkRow memory, unlike an
    unlink; a discovery cursor is deliberately not spliced); `applyFlexBatchResult`
    takes an optional third `rosterHas` gate on ADDITIONS (main.ts and the rig pass
    `(id) => memberRoles.has(id)`; `present` is stamped ABOVE the gate so authoritative
    absence still removes only the truly absent); dirty-first preemption is BOUNDED by
    alternation with pass-shaped work INCLUDING pending work (an in-flight cursor, an
    armed discovery, a requested or due pass; the fresh-eyes round proved the
    cursor-only bound starvable, and a pass or discovery that opens over an empty
    candidate list falls back to serving dirty rather than answering null over work);
    `restoreSlice` filters a 'pass' slice to the still-linked and restores a
    'discovery' snapshot whole; the sweep write loop skips ids not in `memberRoles`
    (mid-flight departure); the outbox failed-poll guard and main.ts's flex-batch
    guard are `== null` (an undefined drain is the reachable data-less success
    envelope); the outbox link-change apply runs BEFORE the post loops (the one
    non-re-served stream; the ordered call-log pins in the outbox suite pin
    'links' immediately after 'drain'). The didWork split and the breaker gate are
    unchanged.

- Phase 7 (supervision + deploy hardening, built 2026-08-01; QA session still owed):
  - New modules: `bot/liveness.ts` (exports `DEFAULT_HEARTBEAT_FILE`
    '/tmp/discord-bot-heartbeat', the pure `isHeartbeatFresh(mtimeMs, nowMs, staleMs)`,
    and `writeHeartbeatFile(path)`, which returns a boolean, true written, false
    logged-and-failed, and ALWAYS settles); `tsconfig.bot.json` (lib ES2022, types node,
    include bot, extending the root config; ADDED beside it, root include keeps `bot`,
    `check:ts:bot` chained into `check:types`, `check:ts` unchanged). `bot/logic.ts`
    gained `isFatalCloseCode` (the FATAL_CLOSE_CODES set moved out of gateway.ts so the
    close-code decision is pure and directly tested, D8).
  - Gateway: a THIRD trailing injectable constructor seam `exitProcess` (default
    `process.exit`, forward-to-the-global per R15). A fatal close now logs and exits 1
    (matching main.ts's fatal handler; R13: the crash loop is the desired visible
    failure). `reconnect()` calls `stopHeartbeat()` before swapping sockets, closing
    L18 at all three entry points (onClose timeout, INVALID_SESSION, op 7).
  - discord_api: `DISCORD_CALL_TIMEOUT_MS` 15000, a CODE CONSTANT copying the
    sanctioned `SERVER_CALL_TIMEOUT_MS` pattern (R14), deliberately not an env key; a
    trailing `TimerSeam` param (type imported from server_client.ts); the
    AbortController is armed INSIDE the governor-dispatched send closure, so queue wait
    (a ban pause can be minutes) never counts against the deadline. Closes L10 and,
    structurally, L17: every run now settles because both IO shells carry deadlines.
  - Governor (L13): a 400 on a subject-keyed request now populates the forbidden cache
    exactly like 401/403 (TTL-bounded by `DISCORD_FORBIDDEN_TTL_MS`, so a later
    legitimate write for the same subject is deferred at most one TTL, never lost) but
    spends NO invalid-request breaker budget: Discord's ban counter tracks 401, 403 and
    429, never 400, and a counted 400 swept across a few hundred members would open the
    breaker guild-wide. Pinned in both directions; the pre-dispatch refusal message now
    says "subject previously answered 400, 401 or 403".
  - New env keys (Phase 7): `DISCORD_HEARTBEAT_FILE` ('/tmp/discord-bot-heartbeat',
    default exported from `bot/liveness.ts`) and `DISCORD_HEARTBEAT_INTERVAL_MS`
    (30000, default `HEARTBEAT_INTERVAL_MS` in `bot/cadence.ts`), both in BOT_ENV_KEYS
    (now 26). Probe-side only: `DISCORD_HEARTBEAT_STALE_MS` (90000), read by the
    compose healthcheck one-liner and NEVER by the bot, so it is deliberately NOT in
    BOT_ENV_KEYS. All three are forwarded by compose. The two bot keys are OWED to
    `.env.example` (harness-blocked, maintainer-only), commented beside the Phase 6
    cadence keys: `#DISCORD_HEARTBEAT_FILE=/tmp/discord-bot-heartbeat`,
    `#DISCORD_HEARTBEAT_INTERVAL_MS=30000` (and `#DISCORD_HEARTBEAT_STALE_MS=90000`
    beside them if the maintainer wants the probe knob visible too).
  - Scheduler tasks 5 to 6: `heartbeat-file` (activeMs `cfg.heartbeatIntervalMs`, run
    `writeHeartbeatFile`); the wiring pin moved to 6 with a TASKS row, and
    `HEARTBEAT_INTERVAL_MS` joined the cadence-literal ban and value pins.
  - Compose (discord-bot service): freshness healthcheck (node one-liner, no `$`
    anywhere in it because compose interpolates; the staleness knob is guarded
    `s>0?s:90000` on purpose, since an unset host key arrives as '' and Number('')
    is 0, a garbage value is NaN, and a negative would pin the container
    permanently unhealthy, so empty, non-numeric and non-positive all fall back;
    missing, un-stat-able (a denied path) and stale all exit nonzero; interval 15s,
    timeout 5s, retries 4, start_period 60s covering the first jittered write);
    `stop_grace_period: 15s`; `mem_limit`/`memswap_limit` 512m; and a 14-key env
    passthrough (the 11 tunable knobs plus the three heartbeat keys). Before this the
    container saw only 13 keys and EVERY knob was inert in production, a gap nothing
    in the plan had named.
  - Caddy: the @ops matcher is now `@ops path /livez /readyz /metrics /internal/*` in
    BOTH user-data.sh heredocs (byte-identical, tab-indented) and both DEPLOY.md
    snippets; the edge 404 is defense in depth, the shared secret header remains the
    gate; lands on a live host only at the next prod rollout (O7) or via the by-hand
    retrofit in DEPLOY.md.
  - DEPLOY.md gained its first `## Discord bot` section (27 env keys with defaults and
    incident guidance, health verification, the by-design crash-loop paragraph, the
    incident-2026-07-29 runbook with healthy-reading lines) and the four falsified
    edge claims were rewritten per R12.
  - Mutation tallies, build phase: bot slice 6/6 killed, deploy slice 6/6 killed, all
    with rc!=0 plus named failing tests.
  - Review round (privacy-security-review plus a fresh-eyes coverage reviewer, both
    over the combined uncommitted diff): ZERO blocking either side. Applied from the
    security review: the default `exitProcess` drains stderr before `process.exit`
    (console.error to docker's log pipe is async and a bare exit can eat the fatal
    close-code line the crash loop's diagnosability depends on); the DEPLOY.md Caddy
    retrofit now covers BOTH Caddyfile shapes (a bare `respond` never runs inside a
    `handle { reverse_proxy }` block, which is exactly what user-data.sh writes,
    because `handle` precedes `respond` in Caddy's directive order; hosts with an
    existing @ops matcher just extend its path list); a /tmp-isolation caveat in the
    liveness header (the world-writable path is safe only while the container's /tmp
    is private; a shared mount would make it a symlink write primitive). Applied from
    the coverage review: the probe pin now runs THROUGH the comparison and both exit
    arms; the probe string is EXECUTED against real files (fresh, stale, missing,
    padded path, non-positive knob); the probe trims the path exactly as config.ts
    does (the asymmetric trim was a real bug: a padded override sent the write and
    the stat to two different names, container permanently unhealthy); the staleness
    guard became `s>0?s:90000` so a negative falls back instead of pinning unhealthy;
    a GAME_SERVER_URL row warning (a bot outside the compose network must use a
    private address, the edge now 404s /internal/*); and the "401 or 403" wording in
    config.ts and DEPLOY.md now includes 400.
  - Declared residuals for the Phase 7 QA session, judged not worth code this round:
    `start_period: 60s` has no relational pin against `HEARTBEAT_INTERVAL_MS` (the
    stale window does, `>= 2x`), so raising the interval erodes the boot margin
    silently; the gateway's exit code 1 and main.ts's fatal-handler 1 are two
    unlinked literals (one convention, no shared constant, would drift silently);
    the staleness bound is probe-side-only BY DESIGN (the writer must not widen the
    window it is judged by), so the "either side moves" agreement pin is
    deliberately half-scoped to the path; and nothing asserts the negative
    direction that the GAME service's own hardening block was left untouched
    (the service-slice helper plus the unhardened-bot mutant cover the inverse).
  - Phase 7 QA session (2026-08-02, verdict PASS; the full narrative is in
    progress.md). What a later phase must know:
    - The gateway default `exitProcess` is HARDENED and PINNED: it stages
      `process.exitCode = code`, arms an unref'd backstop
      (`EXIT_DRAIN_BACKSTOP_MS`, 1000, exported from `bot/gateway.ts` per the R14
      pattern), then drains stderr and exits. Two R16-form default-path arms in
      `tests/discord_bot_gateway.test.ts` pin the staged code, drain-then-exit
      order, the literal 1, and the backstop bound. It had been the ONE injected
      default in bot/ with no default-path test, over the phase's headline
      behavior (found by the audit and by mutation independently).
    - Residual outcomes: start_period now has the relational pin
      (>= 2x `HEARTBEAT_INTERVAL_MS`, plus literals for interval/timeout/retries
      whose deletion silently falls back to docker defaults); the two exit-code 1
      literals stay unlinked, judged ACCEPTED (docker restarts on any exit code,
      so drift has no production consequence and the gateway side is pinned per
      fatal code); the stale-window relational-only pin was mutation-tested in
      both one-interval directions and UPHELD; the game-service-untouched
      negative stays with the service-slice helper.
    - The 400 arm's three directions are split across two suites on purpose:
      cache-and-no-budget in `tests/discord_bot_governor_forbidden.test.ts`,
      probe-settles-as-success in `tests/discord_bot_governor_breaker.test.ts`
      (whose fixture's opening 401s age out by probe time, so it deliberately
      does not claim the budget direction).
    - `writeHeartbeatFile` is pinned against a SYNCHRONOUSLY throwing writer as
      well as a rejecting one (a then/catch refactor letting a sync throw escape
      into the scheduler survived until then).
    - Adding a bot env key is now FOUR places, the fourth enforced:
      `bot/config.ts` + BOT_ENV_KEYS, the compose passthrough, and a DEPLOY.md
      TABLE ROW; `tests/deploy_discord_bot.test.ts` scrapes config.ts and
      demands `| \`KEY\` |` per key (row form, see the gotcha below), plus the
      probe-only `DISCORD_HEARTBEAT_STALE_MS` row and the runbook command
      literals; `tests/deploy_watchdog.test.ts` counts the DEPLOY.md @ops
      snippets 3/3 like the user-data.sh pins.
    - Probe truth, in the comments now: the catch arm guards MISSING and
      un-STAT-able (denied parent dir; executed fixture, skipped as root); a
      chmod-000 heartbeat FILE stats fine and correctly reads healthy while
      fresh, then self-heals via staleness because the bot cannot write it
      either. stop_grace_period covers no drain (no SIGTERM handler; safety is
      server-side outbox redelivery). GAME_SERVER_URL is compose-pinned, never
      .env-passed, and carries the shared secret in cleartext off-network.
    - Mutation tally: 21 planted / 19 killed / 1 designed survivor (the stale
      bound, ruling upheld) / 1 real gap (the exit default, fixed and re-proven
      9/9 in the fix-round pass). Fresh-eyes round over the fixes: 4 nits, all
      applied.
## Phase 5 feed-site enumeration (the linked-member change feed contract)

Every server-side site where a linked account's flex-relevant state changes (level, class,
top character, reward points or the derived status tier, link/unlink), enumerated by a
7-agent Workflow fan-out whose completeness critic re-derived the write sets from the SQL
independently of the sweeps. This list is the contract: a transition NOT wired below is
either covered by a listed chokepoint or deliberately excluded with its reason. If a future
change adds a NEW writer of `characters.level`, `characters` rows, `reward_points`, or
`discord_links`, it must enqueue into `server/discord_link_changes.ts` in the same change.

Chokepoint proof (critic-verified, 2026-08-01): `characters.level` is written ONLY by
`saveCharacterState` and `saveCharacterAndMarketState` (server/db.ts); `characters` rows are
inserted only by `createCharacterCapped` and the community-test roster INSERT inside
`createAccount`, and deleted only by `deleteCharacter`; `reward_points` is written only by
`grantRewardPoints` and `claimSwag` (server/discord_db.ts); links move only through
`linkDiscordToAccount` / `unlinkDiscord`, whose only callers live in server/discord.ts.
Sim-side, every XP source funnels through the single exported `grantXp`
(src/sim/combat/damage.ts), which owns the only `p.level++` and the only 'levelup' emit;
`Sim.setPlayerLevel` emits NO event (dev_level, the GM join arm, PBE boost), which is why
the save-time delta gate exists. Class is immutable after creation (no UPDATE sets it).
There is no restore, undelete, realm-transfer, or account-merge path.

Wired sites (11), each with an enqueue and a by-value test:

| # | kind | site | transition | test |
|---|---|---|---|---|
| 1 | flex | `server/game.ts` `GameServer.detectActivity`, 'levelup' arm | every organic level-up, real time (DB lags until next save; site 2 heals) | `tests/game_sessions.test.ts` |
| 2 | flex | `server/game.ts` `GameServer.saveCharacter`, post-save block after the `saved === false` fence | delta-gated persisted level change; covers autosave, leave, shutdown, and every silent `setPlayerLevel` path; tracker seeds from the LOADED blob, not `initialLevel`, so GM/PBE join raises report on first save | `tests/character_lease_game.test.ts` |
| 3 | flex | `server/db.ts` `createCharacterCapped`, post-commit | character created (top-character candidate; class fixed forever here) | `tests/character_db.test.ts` |
| 4 | flex | `server/db.ts` `deleteCharacter`, rowCount > 0 only | character deleted (top character can change) | `tests/character_db.test.ts` |
| 5 | flex | `server/db.ts` `createAccount`, community-test roster arm, post-commit | flag-gated roster insert instantly defines the top character | `tests/character_db.test.ts` |
| 6 | points | `server/discord_db.ts` `grantRewardPoints`, post-commit | every grant and clawback (link, guild, playtime, booster, daily_active); BOTH no-op arms excluded (zero/non-finite delta, dedupe-key replay); fires for unlinked accounts by design, the outbox drain filters | `tests/discord_db.test.ts` |
| 7 | points | `server/discord_db.ts` `claimSwag`, ok AND price > 0 | spendable points decrease on a paid claim (tier never moves, lifetime untouched) | `tests/discord_db.test.ts` |
| 8 | link/unlink | `server/discord.ts` `completeLink` | settings-page OAuth link; a REPOINT pre-reads the old row and emits old-id unlink before new-id link (the per-account dedupe merges them, old id wins, by design) | `tests/discord_server.test.ts` |
| 9 | link | `server/discord.ts` `handleDiscordLoginNew`, fresh-provision arm | first-time Discord signup links the new account | `tests/discord_server.test.ts` |
| 10 | link | `server/discord.ts` `handleDiscordLoginLink` | chooser links an existing account; same pre-read plus repoint treatment as site 8 | `tests/discord_server.test.ts` |
| 11 | unlink | `server/discord.ts` `handleDiscordUnlink` | the ONLY `unlinkDiscord` caller; the pre-read is both the discordId source and the no-op discriminator (a repeat DELETE enqueues nothing) | `tests/discord_server.test.ts` |
| 12 | flex | `server/db.ts` `renameCharacter`, on the RETURNING row only | moderation-sanctioned rename; the name rides the flex payload (`character.name` plus the profileUrl derived from it), added by Phase 5 QA after the blind sweep showed the original exclusion's reason was wrong | `tests/character_db.test.ts` |
| 13 | flex | `server/db.ts` `reclaimDeactivatedName`, post-COMMIT on the released path | archival rename of a deactivated holder's character; deactivation keeps the link row, so the account can still be linked and bot-visible (the holder SELECT gained `c.account_id` for this) | `tests/character_db.test.ts` |

Sites 8, 10, and 11 carry the two sanctioned cold-path pre-reads (`discordForAccount`
before the link write): rare user-initiated flows, and the only way to carry the discordId
an unlink item needs (the row is gone by drain time).

Deliberately NOT wired, each with its reason (do not re-litigate without new facts):
- lifetimeXp-only movement: affects only the `highestCharacterForAccount` tiebreak between
  same-level siblings; enqueueing it would turn the 30s autosave sweep into a per-player
  metronome; the bot's periodic full resync heals the rare tiebreak flip.
- `moderationForceRename`: sets the `force_rename` FLAG only, no name change, so there is
  no transition until the player's sanctioned rename lands, which is site 12. (The two
  actual rename writers, `renameCharacter` and `reclaimDeactivatedName`, were wired as
  sites 12 and 13 by Phase 5 QA: the earlier exclusion claimed "the name is outside the
  flex definition", which the code contradicts, `discordFlexForAccount` ships
  `character.name` and a name-derived profileUrl. The CURRENT bot renders neither
  persistently, the nickname base is the Discord display name, so the staleness was
  latent, but Phase 6 rebuilds the consumer and the feed must not lie about
  payload-visible changes.)
- The one-time boot schema migration in `server/social_db.ts` that renames colliding
  characters: runs inside ensureSchema DDL before the bot can poll this process; healed
  by the bot's full resync. Accepted, not wired.
- `discord_links` ON DELETE CASCADE: code-unreachable in-process. The only
  `DELETE FROM accounts` is `deleteUnusedFederatedProvision`, whose NOT EXISTS
  `discord_links` guard refuses linked accounts; the cascade fires only on out-of-band SQL,
  where no server code runs. Heal: the bot's periodic full resync (the
  diff-cache-needs-an-expiry rule).
- Account deactivation (`handleAccountDeactivate`): outside the flex definition today; the
  link row survives, and the flex read paths do not consult deactivation status, so the bot
  keeps flexing deactivated accounts. Pre-existing behavior, flagged for the maintainer,
  not a Phase 5 change.
- members-meta / `setDiscordGuildMember` mirror writes: bot-driven mirrors of bot-side
  state; the one server-decided consequence (the one-time guild grant) rides site 6.
- `touchCharacterLogin` (last_login only) and the hotbar UPDATE: not flex-relevant.

## Phase 5 QA record (2026-08-01): judged NOT defects, and notes later phases own

Every finding below was adversarially verified by a skeptic with the file open before
being ruled; do not re-litigate without new facts.

- The D1 no-N+1 invariant IS guarded (a reviewer scored it unguarded from
  `tests/server/discord_outbox.test.ts` alone): the call-count pin, union-argument pin,
  per-item-read exclusion, and empty-drain zero-read pin all live in
  `tests/server/internal.test.ts` describe('discord/outbox'), and the mutation pass
  killed both shapes of the regression (per-id calls; dropped union members). A pointer
  comment in discord_outbox.test.ts now says where the guard lives.
- Playtime-noise page pollution (unlinked accounts' ['points'] items consuming outbox
  page slots) is the recorded, compensated compromise, not a defect: it only bites after
  a multi-minute bot outage, costs a few extra 3-15s polls, and the eviction ladder plus
  the full resync bound it. A drain-side filter is IMPOSSIBLE as proposed (linkage is
  unknowable pre-drain, and shape-based filtering would drop LINKED accounts' points
  items, which share the exact shape). The one in-scope alternative, gating the enqueue
  in `grantPlaytimePoints` on the sim entity's 60s-fresh `discordTier` (>= 1 iff linked),
  trades queue noise for a new 60s-staleness belief; Phase 6 may take it if page
  pollution ever matters in production.
- The winners cache reading 5 days to serve the outbox's 1 is FORCED by the standalone
  GET (limit clamp 1..5) sharing the same cache until D11 retirement; the config fan-out
  is deduplicated, runs at most once per 30s TTL, and is 2 fetches in the steady state.
  At D11 retirement (Phase 9 or the follow-up): drop `DAILY_REWARD_WINNERS_CACHE_LIMIT`
  to match `OUTBOX_WINNER_DAY_LIMIT`, and consider a small per-day config map to remove
  the residual once-per-TTL single-slot eviction.
- The pre-bust-joiner window on the winners cache (a reader that joined a refresh before
  a bust gets the pre-bust snapshot) is unreachable with the actual consumer: one bot,
  strictly sequential read -> announce -> mark inside one scheduler task with an overlap
  guard. It becomes reachable only if a second concurrent winners consumer appears.
- Stale-serve on a warm winners cache during a DB brownout is CORRECT behavior, not a
  hole: it can only re-serve an UNMARKED day (at-least-once by contract), because the
  mark's bust cold-starts the cache and a cold failing refresh refuses the poll. The
  outbox doc comment that overstated "a winners failure refuses the poll" was corrected
  instead.
- Two overlapping failed polls could requeue streams out of order, and the outbox has no
  per-poll concurrency guard; both are Phase 6/7 contract notes, not Phase 5 fixes (the
  charter freezes drain semantics): the Phase 6 bot MUST run exactly one serialized
  outbox poll loop, and its client timeout for the poll must exceed the server's read
  deadline (above DB_QUERY_TIMEOUT_MS 65s is safest, above statement_timeout 15s the
  minimum).
- The retained legacy relay/activity GETs still lose drained items on a failed
  enrichment (no requeue). D11 freezes them, the bot stops calling them in Phase 6, and
  they retire in the post-ladder-deletion follow-up; retrofitting durability there was
  ruled not worth touching frozen surface.
- Winners rows still carry tx_signature and voided_by_* operator identity, which
  announcing does not need. Narrowing is BLOCKED by the D11 byte-parity pin against the
  standalone GET; recorded in the handler comment as a deliberate deferral owned by the
  D11-retirement follow-up.
- requeueRelay/requeueActivity overflow-trim spends the REQUEUED (oldest) items first.
  Kept: these queues are rolling windows of recent social traffic, and preserving stale
  items at the expense of the current conversation is the worse trade; the comments now
  state the honest limit ("preserved on error" holds up to the cap).
- Phase 6 contract note (repoint): a repoint's merged feed item carries only the OLD
  Discord id (first-observed wins, by design), so the feed tells the bot who to STOP
  flairing; the new identity arrives via the periodic full resync. Phase 6 must not
  treat the feed as the sole repoint source.
- Reasoned keeps: `LinkChangeKind` stays exported (self-documenting API, zero runtime
  cost); the pre-existing unused `resolveActiveWeaponSkin` import in `server/main.ts` is
  whole-repo lint debt, not this packet's regression; the three cold-path link pre-reads
  keep using full `discordForAccount` (nothing echoes or logs the row); the empty-drain
  zero-query property is proven by composition across the three rigs R1 sanctions, an
  end-to-end variant would need a new rig R1 forbids; the outbox relay/activity item
  shapes stay pinned differentially against the live legacy handlers (that differential
  IS the D11 contract).

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

Phase 2 QA sharpened two of them rather than closing either:
- O2 (no hard-coded per-route rate numbers) is CONFIRMED for the governor: every numeric
  limit in `bot/rate_governor.ts` comes from a response header or a constructor option,
  audited line by line. It stays open only in the sense that the claim has to be
  re-checked whenever a phase adds a route.
- O5 (whether member-write 429s come back at `user` or `shared` scope) is unchanged and
  still resolves from production logs, but the question is now narrower than "log the
  scope": every 429 already logs `route`, `scope`, `retryAfterMs`, and `global`, and the
  scope arm is pinned for all five header shapes including a missing and an unrecognized
  one. Reading those log lines after the first deploy is the whole remaining task.

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
### Found during Phase 2 QA (2026-07-30), routed rather than fixed

Each of these is real and confirmed by an independent skeptic, and each was left for a
later phase because its fix belongs to that phase's scope, not because it was dismissed.

- L9 CLOSED by Phase 6, via the outbox transport plus a bot-side gate rather than a
  bot-side mark protocol. The systematic loss window (a whole breaker quiet window of
  drained-then-refused posts) is gone two ways: the server preserves all three in-memory
  streams unless a poll answers 200 (the Phase 5 retry contract), and `runOutboxPoll`
  refuses to DRAIN at all while the breaker is not closed, so nothing is pulled into
  refusals in the first place; the sweep's own cheap refused writes keep supplying the
  half-open probe, so the gate cannot deadlock recovery. The RESIDUAL, recorded not
  fixed: a breaker that trips MID-fan-out still loses the already-drained items behind
  it (bounded by one poll's drain), and a per-item post failure still costs that item,
  both the pre-outbox loss shape. Winners were never exposed: at-least-once by mark.
  Original report, kept for the record:
- L9 (was: should-fix, at-least-once, natural home Phase 5 or 6): a `GovernorBlockedError`
  permanently LOSES already-drained relay and activity items. `createMessage` is not
  `essential`, so while the breaker is open every relay and activity post is refused
  unsent, and `bot/main.ts` has already drained those items server-side with only a
  `console.error` handler behind it: each refusal is a player-visible message deleted
  rather than delayed. The pre-Phase-2 client lost them on a failed post too, so the loss
  PATH is not new; what Phase 2 added is a systematic loss WINDOW of at least one breaker
  quiet window. Phases 5 and 6 own the drain protocol (the outbox change feed), so the
  fix belongs there: mark-after-successful-post, the way the daily-rewards winners
  already work.
- L10 CLOSED by Phase 7: `DISCORD_CALL_TIMEOUT_MS` (15000, the sanctioned
  `SERVER_CALL_TIMEOUT_MS` pattern per R14) arms an AbortController inside the
  governor-dispatched send closure, so the deadline covers dispatch, never queue wait.
  Original entry: `bot/discord_api.ts`
  passes no `AbortSignal` or timeout to `fetch`, unlike `bot/server_client.ts` with its
  `SERVER_CALL_TIMEOUT_MS`. A Discord call that stalls therefore holds its bucket's FIFO
  and, if it was the half-open probe, the probe latch, for as long as the runtime's own
  fetch timeouts allow. It is a stall rather than a permanent latch (the platform's fetch
  imposes its own header and body deadlines, so it unwinds eventually), which is why this
  is not blocking, but the bound is the runtime's rather than ours and it is invisible in
  the counters. Phase 7 owns supervision and deploy hardening; adding a deadline there
  means adding one injected timer seam to the shell, which is a seam change rather than a
  QA-round edit.
- L11 CLOSED by Phase 3, but NOT by a change: the dispatch loop Phase 2 QA shipped already
  re-reserves the rate slot on every pass, which is exactly the fix this entry asked for, so
  the entry was stale from the moment that loop landed. It was VERIFIED rather than assumed:
  `tests/discord_bot_governor_pacing.test.ts` drives three requests holding pre-pause slots
  and asserts they come off the ban pause one full spacing apart (123000, 124000, 125000),
  and hoisting the reservation out of the gate loop reproduces the reported defect exactly,
  all three firing at 123000. Original report, kept for the record:
- L11 (was: nice-to-have, pacing, natural home Phase 3): requests that reserved a global
  rate slot BEFORE a pause was declared do not re-reserve one when the pause lifts, so
  they all fire at the same instant. It is bounded by how many requests were between the
  first pause check and the send when the pause landed, and the correct fix is a gate
  loop that re-reserves after any blocking wait, which burns slots and belongs with the
  Phase 3 scheduler rather than in a QA round.
- L12 CLOSED by Phase 3. `this.queues` is now LRU bounded by `MAX_TRACKED_QUEUES` (512, a
  THIRD separate constant for the same reason `MAX_TRACKED_ROUTES` is one: a third
  population with a third lifetime), and `queueFor` re-inserts on every sighting so the
  chain evicted is always the coldest. Evicting a chain that still has a request parked on
  it is safe: the parked request holds its own reference, and the job's `finally` only
  deletes a chain the map still holds. The only cost is that a LATER request on an evicted
  template mints a fresh chain, and LRU makes that theoretical, since the cold end is
  exactly the single-use per-interaction templates. Two tests: the bound REACHED
  (`activeQueues` is `toBe(512)` with 552 parked, and back to 0 once they drain) and the
  eviction ORDER (a touched hot chain survives and still serializes, an untouched cold one
  does not). Original report, kept for the record:
- L12 (was: nice-to-have, memory, natural home Phase 3): `this.queues` is the one
  governor map with no size cap. A request parked in `waitForPause` never reaches the
  job's `finally` that drops a drained queue, and interaction callbacks mint a unique
  template per interaction id, so during a long ban pause the map, its pending sleeps,
  and `queueDepth` all grow with however many slash commands arrive. `activeQueues`
  makes it observable. The existing record framed the uncapped interaction path as a WIRE
  concern; this is the MEMORY dimension of the same thing.

### Judged during Phase 2 QA and ruled NOT defects (do not re-litigate)

Recorded with the reasoning so a later round does not spend agents rediscovering them.

- A probe whose three attempts are all SHARED-scope 429s does reopen the breaker, via the
  blanket `settle(false)` in the `finally`. That is deliberate: D3's shared-scope
  exclusion is about the ban COUNTER, and the `finally` covers "the probe never got an
  answer", which exhausted attempts is. The conservative reading is correct.
- A queue-full refusal leaves the breaker in `half-open` with no probe in flight. It
  self-heals: the next non-essential request claims the probe, which is exactly what the
  aborted one would have been, and only one probe is ever in flight. The quiet window was
  already satisfied when the state moved to half-open.
- An empty or unreadable 429 body is classified as a Cloudflare ban and pauses for
  `banPauseMs`. The two errors are not symmetric: a false ban pause costs 10 idle minutes,
  a false short retry into a real ban is the 2026-07-29 incident. The conservative
  direction is the right one.
- `addMemberRole` and `removeMemberRole` share one `roles:` subject key, so a 403 on one
  role suppresses the member's other role writes. Both realistic causes of that 403
  (MANAGE_ROLES missing, or the bot's role below the target's) are guild-wide rather than
  per-role, so a per-role key would multiply retries of a call that cannot succeed.
- `essential` does not exempt a request from the process-wide pause. A pause means
  Discord has told us to stop entirely; the exemption is breaker survival only.
- `maxRps <= 0` disabling global spacing is the module's intentional escape hatch, used
  by the test rigs and documented at their call sites.

### Found during Phase 1 QA (2026-07-30), OPEN

- L6 CLOSED by Phase 7: `tsconfig.bot.json` (lib ES2022, types node, include bot) is
  ADDED beside the root config and `check:ts:bot` is chained into `check:types`, so a
  Node-missing DOM global now fails a pinned check; the Node-only pass surfaced ZERO
  latent errors across all 13 bot files, and the gate was proven non-vacuous with a
  scratch probe (document/localStorage red as TS2584 under the same flags). Original
  entry: `bot/` type-checks against the shared tsconfig,
  whose `lib` is `["ES2022","DOM","DOM.Iterable"]` with `types: ["vite/client","node"]`.
  A Node-missing DOM global therefore passes BOTH `tsc` and `build:bot` (esbuild does not
  typecheck) and only fails at runtime in the container. A bot-specific tsconfig would
  close it; that is a toolchain restructure, not a QA-round edit. Natural home is Phase 7,
  which already owns the bot's deploy hardening.

- L7 CLOSED by Phase 3, which is where it was judged to belong: reconnect behavior is this
  phase's subject matter, and Phase 1's no-behavior-change rule (the only reason it was
  ledgered) no longer applies. A non-resumable INVALID_SESSION now clears `sessionId`,
  `resumeUrl` and `seq` together, so the two reconnect paths that call `reconnect(true)` (a
  socket close, and op 7) re-IDENTIFY instead of RESUMEing a dead session. Each of the three
  fields is independently pinned in `tests/discord_bot_gateway.test.ts`, with a negative
  control proving a RESUMABLE op 9 still keeps the session. Original report, kept for the
  record:
- L7 (was: should-fix, behavior): a NON-resumable `INVALID_SESSION` (op 9 with `d:false`)
  never clears `this.sessionId` in `bot/gateway.ts`; the field is only ever assigned in the
  READY handler. So after Discord tells the bot its session is dead, a socket close that
  arrives before the next READY takes `reconnect(true)` to
  `this.resuming = resume && this.sessionId !== null`, which is still true, and the bot
  RESUMEs a session it was just told is gone. Discord answers with another
  INVALID_SESSION, so it self-corrects at the cost of a wasted round trip and a slower
  recovery during exactly the reconnect storms this packet exists to tame. Fixing it is a
  RUNTIME BEHAVIOR CHANGE, which Phase 1 forbids, so it is recorded rather than landed.
  Natural home is Phase 3 (scheduler and reconnect coalescing) or Phase 7 (supervision).
- L8 ACTED ON by Phase 3 rather than closed outright. `displayNameOf` and `nickOf` moved
  into `bot/member_writes.ts` and are tested there, following this entry's own instruction
  (extract, never add a source-text pin). The underlying condition stands: `main.ts` still
  calls `main()` at module scope, so anything left in it is still unreachable, which is why
  the diff logic went into a sibling module too. Original report:
- L8 (was: nice-to-have, coverage): the two pure helpers at the bottom of `bot/main.ts`
  are unreachable from any test, because `main.ts` calls `main()` at module scope. If a
  later phase needs them pinned, extract them into a sibling module first (the same move
  R6 made for the cadences); do not add a source-text pin.

### Found during the Phase 3 review round (2026-07-31), OPEN

- L13 CLOSED by Phase 7, via the first of the two fix shapes below: a subject-keyed 400
  now populates the forbidden cache like 401/403 (TTL-bounded), while deliberately
  spending NO invalid-request breaker budget (Discord's ban counter tracks 401/403/429,
  never 400; a counted 400 swept across a few hundred members would open the breaker
  guild-wide). Original entry:
  a PERMANENTLY rejected nickname PATCH now retries every sweep forever with no backoff, and
  after D5 it is the only remaining steady-state write. The governor's permanent-failure
  cache covers 401 and 403 only, so a 400 (a computed nick Discord will never accept, an
  over-long name after an unusual base) is retried indefinitely. Pre-existing, but D5 is what
  made it the visible residue rather than one write among many. The fix shape is either
  caching non-retryable 4xx per subject the way 401/403 already are, or a per-member failure
  counter; both are governor surface, which Phase 2 owns and a QA round should not rewrite.

### Found during Phase 3 QA (2026-07-31), routed rather than fixed

- L14 CLOSED by Phase 4 (`44e937cb7`), on the SERVER side only; the bot half is Phase 6.
  members-meta now reports what it applied: `changed` (rows whose stored values really moved),
  `skipped` (rows that existed and already matched), and `unapplied` (the ids with NO link
  row). The report is the id LIST, not the `rowCount` this entry originally asked for, because
  a count cannot tell the pusher WHICH members to leave dirty; the phase-04 file supersedes the
  wording below on that point.
  ONE THING THIS ENTRY ASKED FOR WAS DELIBERATELY NOT DONE, and Phase 6 must not undo the
  reason. `updated` still counts records ACCEPTED, not rows written. Narrowing it, which is
  what "report rowCount" reads as, breaks the CURRENT bot: `ServerClient.pushMembersMeta`
  (`bot/server_client.ts`) turns `updated === 0` on a non-empty push into `null`, and
  `pushChangedMemberMeta` (`bot/member_writes.ts`) ABORTS the whole run on a refusal, skipping
  every later batch. Two ordinary situations would then answer zero: a post-restart full
  re-push where nothing changed, and any batch of guild members who never linked (the bot
  pushes ALL members, so most batches). The result would be a sweep that never populates its
  cache and never reaches its later batches. The stopping rule in the phase-04 file covers
  exactly this and the shape was taken to the maintainer, who chose the additive one.
  Proof: `tests/server/internal.test.ts` "discord/members-meta applied-vs-read reporting"
  (an unlinked id is named in `unapplied` and not counted in `changed`; an identical re-push
  reports zero changed and non-zero skipped; a regression pin asserts a non-empty push never
  answers `updated` 0), plus `tests/discord_db_integration.test.ts` running the real statement
  against Postgres 16. Phase 6 may now revisit the bot's hourly `FULL_RESYNC_INTERVAL_MS`, but
  it must NOT be removed until the bot actually consumes `unapplied`: until then the resync is
  still the only thing that heals a member whose meta was cached as pushed. Original report,
  kept for the record:
- L14 (correctness, server side of the diff, was OPEN, natural home Phase 4 with the set-based
  endpoints): `/internal/discord/members-meta` reports every record it ITERATED as updated
  (`server/internal.ts`, `updated++` per record), not every row it actually wrote.
  `setDiscordMemberMeta` is a bare `UPDATE discord_links ... WHERE discord_user_id = $1`, so a
  push for a guild member with no link row matches zero rows and is still answered as accepted.
  The bot then caches it as pushed. Phase 3 QA bounded the damage bot-side with the hourly
  `fullResyncIfDue`, which is the right ceiling but not the right signal: the endpoint should
  report `rowCount` and the bot should cache only what the server confirms. Both the legacy
  ladder and the RouteDef arm carry the same body byte for byte, so a change lands on BOTH.
- L15 (correctness, the other side of the same gap, OPEN, natural home Phase 5 with the change
  feed): nothing tells the bot when a link row is CREATED or reset. A member who links after
  their first sweep, or who unlinks and relinks (a fresh row with `discord_joined_at` and
  `discord_role` both null), is a server-side state change the bot cannot observe, so the diff
  has nothing to react to. The hourly resync is the interim answer; the linked-member change
  feed is the real one, and it removes the need for a periodic full push entirely.
- L16 CLOSED by Phase 6, exactly along this entry's fix shape: `seedSessionIds`
  accumulates the ids seen across one COMPLETE seed (GUILD_CREATE resets it, chunks and
  GUILD_MEMBER_ADD extend it), and `completeSeed()` diffs the UNION of every per-member
  cache against it (memberRoles, memberNames, memberJoined, onlineUsers, voiceStates,
  both nickname caches, lastPushedMeta; the QA round widened it from memberRoles alone so
  a presence-seeded ghost id cannot survive), evicts the departed, prunes the linked
  sweep set, and only then runs the flaired-ids reconcile, which therefore finally sees
  an honest roster. Gated on `rosterComplete` so a partial seed can never evict live
  members. `dailyActive.seen` is the one deliberate exclusion (empties on the day
  rollover; the server-side grant dedupe key makes a rejoin grant a no-op). Pinned by
  the union pin and forgetMember count in `tests/discord_bot_main_wiring.test.ts`.
  Original report, kept for the record:
- L16 (was: correctness, roster seeding, natural home Phase 6 with the D6 sweep-iteration
  work): `seedGuild` and the op 8 chunk handler only UPSERT, they never prune. A member who
  leaves while the gateway is disconnected fires no `GUILD_MEMBER_REMOVE`, and on reconnect they
  stay in `memberRoles` forever. `staleFlairedIds` diffs the server's flagged ids against
  `memberRoles.keys()`, so that member is never classified as stale and their flair is never
  cleared, which defeats the whole point of the flaired-ids reconcile. Every per-member cache
  also grows monotonically. The fix is to collect the ids present across a COMPLETE seed and
  drop every cached id outside that set, which is real new state on the seed path and belongs
  with the sweep-iteration change rather than in a QA round.
- L17 CLOSED by Phase 7 along this entry's own fix shape: the deadline landed on the
  Discord shell (`DISCORD_CALL_TIMEOUT_MS`), and server_client already had its two, so
  every current run settles structurally; the always-settle rule in `bot/CLAUDE.md`
  stays normative for any NEW run behind a seam without a deadline. Original entry: a
  run handed to `scheduler.add` that
  never settles stops that loop for the life of the process, with no counter and no log. Ruled
  DEFER rather than watchdogged: recovery needs the run CANCELLED, and the scheduler holds a
  promise it cannot abort, so a watchdog that only logs would advertise coverage it does not
  have. The real fix is a deadline on the fetch underneath (`server_client.ts` already has
  `SERVER_CALL_TIMEOUT_MS` to copy). Until then the rule is in `bot/CLAUDE.md`: every `run` must
  be one that always settles.

### Judged during Phase 3 QA and ruled NOT defects (do not re-litigate)

- **The roster push stopping at the first refused batch cannot starve anyone.** Permanent
  starvation needs a refusal tied to the CONTENT of the head batch, and the members-meta
  endpoint cannot produce one: it coerces every field (bad id skipped, unknown role key to null,
  bad timestamp to null, name sliced) and always answers 200 `{updated: n}`.
- **`MIN_INTERVAL_MS` is a fallback, not a clamp, and that is correct.** Already a locked
  ruling; the constant's own opening sentence was the only thing claiming otherwise and now
  matches the code. A valid-but-small D13 override passes through untouched on purpose.
- **A kick resetting the periodic phase is not a fourth deviation.** The spec authorizes exactly
  this ("the next run is scheduled only after the previous run settles, for event-triggered
  kicks as well"), the kick runs the identical `run()`, and no fixed wall-clock grid survives
  jitter or idle backoff anyway.
- **A coalesced follow-up firing unpaced and unjittered is the contract, not a gap.** The idle
  arm of `kick()` has always run at once and is test-pinned as doing so; the follow-up is only
  the deferred half of the same kick, and jitter decorrelates chain arms, which an event
  trigger does not have.

### Found during Phase 6 QA (2026-08-01), routed rather than fixed

- L18 CLOSED by Phase 7: `reconnect()` now calls `stopHeartbeat()` before swapping
  sockets, covering all three entry points (the onClose timeout, INVALID_SESSION,
  op 7). The decisive test needed the gateway suite's fake timer rig extended to MODEL
  clearInterval (a cancelled interval refuses to tick), because the pre-existing
  "does not stack a second interval" shape passes with or without the fix. Original
  entry: `Gateway.reconnect()` never stops the heartbeat interval, and `removeAllListeners()`
  strips the old socket's close handler, which is the only close-path caller of
  `stopHeartbeat()`. A stale unacked-beat tick in the window before the new socket's
  HELLO therefore terminates the NEW socket (`this.ws` is re-read at tick time), whose
  close handler schedules another reconnect: one wasted reconnect cycle, self-healing.
  Pre-existing and OUTSIDE the Phase 6 diff (found because the QA charter required
  tracing the re-IDENTIFY path); skeptic-confirmed with quoted code. Phase 7 owns the
  gateway's supervision surface, so the reconnect lifecycle fix (stop the heartbeat in
  `reconnect()` or scope the tick to its own socket) lands there with its own tests.

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
- **RETIRED by the v0.34.0 sync (Phase 7 QA, 2026-08-02): a sibling session's parked
  worktree no longer fails the gate.** Release commit `40212c559` taught
  `scripts/malware_scan.mjs` to skip `.worktrees` by basename at any depth, plus
  `.claude/worktrees` and `.codex/worktrees` by path, so the recurring
  194-high-findings malware-step abort (struck first in Phase 2 QA, then every phase
  with `.worktrees/fix-play-map-level-toggle` parked) is gone and `npm run gate` runs
  end to end again. Kept for the record: the failure mode was a whole-tree scan
  reading a nested checkout's `child_process` imports as `rce-obfuscation` findings;
  if a worktree is ever parked somewhere OUTSIDE the skipped roots it would resurface,
  and the diagnosis is still "run the scanner in a clean detached worktree of HEAD",
  never triaging the findings.
- **Discord's `X-RateLimit-Bucket` is NOT a bucket identity on its own.** It is
  documented as non-inclusive of the top-level (major) resource, so two channels or two
  guilds hit on the same route answer with the SAME hash while holding separate limits.
  Any map keyed by the bare hash silently merges them. Pair it with the major parameter
  (`majorParameterOf` in `bot/rate_governor.ts`). This shipped as a real defect in Phase 2
  and was caught only by the QA round.
- **Interaction callbacks now get one rate-state entry per interaction id**, because
  `interactions` is in `MAJOR_PARENTS` and the rate key pairs the hash with the major
  parameter. That is deliberate and consistent (the route template, and therefore the
  queue, was already per interaction), and it is the correct reading: an interaction token
  is single use, so one callback's `Remaining 0` must not gate every other user's reply.
  The cost is one LRU insert per slash command, which `MAX_TRACKED_BUCKETS` bounds.
- **A bound test that never reaches the bound is vacuous.** Phase 2's permanent-failure
  cache test stored 42 entries against a cap of 4096 and asserted `42 <= 4096`, which
  holds for every implementation including one with the eviction deleted. Its comment
  claimed the size was "injected", but the cap is a module constant with no seam. Either
  reach the real cap or give the module a seam; never assert `toBeLessThanOrEqual` against
  a cap the test cannot approach, and prefer `toBe(CAP)` so over-eviction fails too.
- **`bot/server_client.ts` answers `null` for a failed call, it does NOT throw.** Every
  `/internal/discord/*` method funnels through `call()`, which logs and returns null on a
  non-ok status, a non-success envelope, or a thrown fetch. So for any write whose success
  gates a cache update, the RETURN VALUE is the only signal there is: a cache updated merely
  because nothing threw marks refused work as done and strands it until some unrelated field
  moves. Phase 3 hit this on the members-meta push. The Discord side is the opposite,
  `discord_api.ts` throws, so the two need different shapes and neither pattern transfers.
- **An interval of 0 does not run fast, it WEDGES the process.** A chained-timeout loop with
  a zero delay arms a timer whose callback arms another, which starves the macrotask queue,
  so the failure looks like a hang rather than a red test (the same shape as the Phase 2 hot
  spin). `bot/scheduler.ts` guards it twice: `resolveCadence` floors an unusable value at
  `MIN_INTERVAL_MS` rather than 0, and `LoopScheduler.add` throws outright on a non-positive
  `activeMs` so a wiring bug is loud at boot. A VALID value is passed through untouched
  however small, because the floor is a fallback and not a clamp: silently rewriting a D13
  operator override would be its own defect.
- **The nickname diff needs the RAW nick, not `memberNames`.** `displayNameOf` returns
  `nick || global_name || username`, so it cannot distinguish "the nick is exactly X" from
  "there is no nick and the global name is X", and the PATCH precondition is about the nick
  field specifically. Phase 3 caches `member.nick` separately for this. The same asymmetry is
  why a successful PATCH updates BOTH caches: after the write the member's nick IS the
  computed value, which is what makes the echo Discord sends back genuinely redundant.
- Numeric env parsing: `Number('')` is 0, so an unguarded parse turns a blank line in a
  .env into a hard 0. `positiveNumberFromEnv` in `bot/config.ts` falls back to the
  default for empty, non-numeric, and non-positive alike. It takes the VALUE rather than
  the key on purpose: a second dynamic `process.env[...]` lookup would slip past the
  env-key inventory guard in `tests/discord_bot_config.test.ts`, which asserts exactly
  one dynamic lookup and pins the whole key set.
- **A diff cache is a one-sided belief, so it needs an expiry.** Diffing before a write is the
  right shape and it removes a property nobody notices they were relying on: that a wholesale
  re-push heals every divergence within one interval. The cache records what the bot believes
  the REMOTE side holds, and the remote side can lose those values with nothing to tell the bot
  (a write that matched no row and was still reported as accepted, a row deleted out of band, a
  restore). Whenever a phase adds a diff, ask what bounds how long a wrong belief can last, and
  if the answer is "nothing", add the bound in the same change. Phase 3 QA's
  `FULL_RESYNC_INTERVAL_MS` is the reference: an hour against a 5 minute sweep keeps eleven
  twelfths of the load reduction while capping the divergence at one hour. Prefer TIME since
  the last full push over a count of sweeps, because an event-kicked task lets a reconnect
  storm race a counter and re-push hardest exactly when it should not.
- **A stop() that cannot cancel must not release the claim it holds.** `LoopScheduler.stop()`
  retires a run's generation but has no way to abort the promise, so the abandoned body keeps
  executing. Both obvious readings are wrong: keeping the claim AND arming on `start()` deadlocks
  (the armed timer is refused by the overlap guard, and a refused claim arms nothing), while
  releasing the claim lets the restarted chain run BESIDE the body it abandoned. The shape that
  works is to keep the claim, have `start()` arm nothing while a run is in flight, and have the
  abandoned run's settle hand the chain over on its way out, carrying any kick that arrived
  meanwhile. Both failure modes were found by review, not by the build session, and the second
  one only by reviewing the fix.
- **A "stops there" test that refuses the LAST batch pins nothing.** With two batches and the
  refusal on the second there is no third batch to skip, so `return` and `continue` are
  indistinguishable and the assertion is constant-true. Same family as the vacuous-bound trap:
  an early-exit claim needs work REMAINING after the exit point, so use three batches and refuse
  the second.
- **A regex source pin over a coordinator is weaker than it reads, in three specific ways.**
  `main.ts` runs `main()` at module scope so a source pin is the only tool, and Phase 3 QA
  shipped three that its own review then broke. (1) A `[\s\S]{0,N}` span between two tokens runs
  straight into the NEXT declaration, so a per-registration pattern needs
  `((?!scheduler\.add\()[\s\S])` to stay inside one; without it, swapping two same-cadence task
  bodies is caught by one of the two patterns and not the other. (2) Proximity is not
  containment: `chunk_index ... memberMetaTask.kick()` matched with the `idx >= count - 1` guard
  replaced by `if (true)`. (3) A `try { ... } catch` pin cannot tell a catch that SWALLOWS from
  one that rethrows, which is the entire behavior it was written to guard. When the claim is
  behavioral, extract the pair into a tested helper and let the pin say only that main.ts routes
  through it.
- **Per-name counts do not bound a set; pin the total too.** `KICKS` asserting one
  `roleSyncTask.kick()` and two `memberMetaTask.kick()` catches a deletion or a duplication of a
  known kick, and says nothing about a kick added for a NEW task. The registration count already
  did this right (`expect(matches).toBe(TASKS.length)`); any table of named call sites needs the
  same total beside it.
- **`not.toContain('3000')` is a substring scan and will red on 30000 or 130000.** Phase 3 QA's
  first cut of the config seam pin forbade the bare cadence literals that way, which would have
  gone red the day an unrelated knob gained a plausible default. Word-bound both sides:
  `new RegExp('(?<![0-9_])' + value + '(?![0-9_])')`.
- **A surviving mutant in this packet has been dead code, an unobservable rig, and a real gap in
  roughly equal measure, so diagnose before writing a test.** Phase 3 QA planted 57 and left 2
  standing, both unobservable by construction (the generation checks inside the two timer
  callbacks, which `clearArmed()` makes unreachable, and the `state.running` guard in `start()`,
  which `beginRun` already enforces). Two more were equivalent mutants rather than survivors:
  `didWork` as a truthiness check agrees with `=== true` for every value a
  `Promise<boolean | void>` can hold, and `forgetMember` deleting `memberNames` is a no-op at
  both of its call sites. Record the diagnosis where the next reader will look, the way this
  file's suites already record their honest limits, rather than inventing a rig to kill it.
- **The bot's members-meta client refuses on `updated === 0`, one layer ABOVE `pushRejected`.**
  Reading `pushRejected` alone (it only refuses null and undefined) says any truthy body is
  accepted, and that is the trap: `ServerClient.pushMembersMeta` turns `updated === 0` on a
  non-empty push into `null` FIRST, and `pushChangedMemberMeta` then aborts the whole run,
  skipping every later batch. So the server cannot narrow `updated` to "rows written" without a
  paired bot change: a post-restart re-push (nothing changed) and any all-unlinked batch would
  both read as total failures. Phase 4 hit this against its own acceptance criterion and the
  additive shape was chosen deliberately (see L14). Whenever a phase changes a response field
  the bot reads, trace the WHOLE client path, not just the obvious predicate.
- **An inverse-edit restore must be anchored on something UNIQUE.** Mutation checks in an
  uncommitted tree cannot use `git checkout` (it destroys the work), so the restore is a
  reverse string replace, and a first-occurrence replace of a GENERIC fragment lands in the
  wrong function. Struck live in Phase 4: restoring `  const res = await pool.query(` put an
  early return from one function into a different one further up the file, and the "did the
  original text come back" assertion passed because the text WAS back, just in the wrong place.
  Include enough surrounding context to make the anchor unique, and after any mutation run
  verify with `git diff --stat` against the pre-run numbers, not just a grep for the symbol.
- **Novel SQL needs an executed test, not a text pin.** `tests/discord_db.test.ts` drives
  `discord_db` through a fake pool that routes on SQL text: excellent for statement COUNTS and
  bound parameters, blind to whether the statement parses, plans, or means what it says. Phase 4
  shipped a data-modifying CTE, multi-argument `unnest`, a row-constructor `IS DISTINCT FROM`
  and a `LATERAL`, none of which any text pin can validate. The answer is a DB-gated
  `*_integration.test.ts` (skips green without `TEST_DATABASE_URL`), and a throwaway Postgres
  can be stood up here with no Docker and no sudo from the zonky portable PG16 binaries on
  Maven Central. It caught a real over-specific plan assertion and confirmed the level guard;
  do not let the next phase's SQL ship on text pins alone.
- **`jsonb_typeof(x) = 'number'` does NOT make `::int` safe.** JSON numbers include floats, and
  `'40.5'::int` raises just like `'boom'::int` does; `numeric::int` still raises out of range.
  A total guard needs all three parts (type check, cast through `numeric`, bounds test). In a
  batched read this matters far more than in a per-row one: one malformed row denies the read
  for every OTHER member in the batch, where the per-account TypeScript path shrugged.
- **A text pin over SQL must name its CLAUSE, because a statement can carry the same
  fragment twice.** `setDiscordMemberMetaBulk` spells the row comparison in two places
  that decide different numbers: the `matched` CTE decides `skipped`, the UPDATE's WHERE
  decides `changed` and is the only thing that stops the write. A bare
  `expect(sql).toContain('IS DISTINCT FROM')` is satisfied by EITHER, so deleting the
  UPDATE's copy (every row rewrites every sweep) or inverting it to `IS NOT DISTINCT FROM`
  (only unchanged rows write) both survived the whole DB-free suite. Proved by mutation in
  Phase 4 QA, not argued. Pin the contiguous normalized clause including its neighbours
  (`makePool` collapses whitespace, so the anchor survives reformatting), and pin the
  OCCURRENCE COUNT as well, since the entire argument for anchoring is that the count
  matters. The same trap has a source-file form: the Phase 4 lockstep pin searched all of
  `server/db.ts` for the shared ORDER BY, and this phase's own LOCKSTEP COMMENT restates
  that clause, so deleting `, id ASC` from the live query while the comment stood would
  have passed. Slice to the function body first.
- **A DB-gated suite is not coverage for CI, and reasoning about the gap is not enough.**
  `tests/*_integration.test.ts` skips green without `TEST_DATABASE_URL` and CI never sets
  it, so anything only the executed arm can catch is unguarded in the pipeline. The way to
  find out which guarantees those are is mechanical: run the mutation pass TWICE, once with
  the database and once without, and treat every mutant that survives the DB-free run as a
  missing structural pin. Phase 4 QA did this and found two, both on the phase's headline
  behavior. Doing it costs one extra run; not doing it is how an executed guarantee gets
  believed to be a structural one.
- **A no-op-write test cannot be proved by the counter derived from the write.** In
  `setDiscordMemberMetaBulk`, `changed` IS `count(*)` over the UPDATE's `RETURNING`, so it
  can never disagree with what the statement wrote and it reds FIRST on any mutation of
  that statement. An xmin comparison sitting after it is therefore defense in depth against
  a rewrite arriving from OUTSIDE the statement (a trigger, a second statement added later),
  never the proof, and a test comment that calls it "the decisive evidence" is telling a
  future reader they may delete the line that actually discriminates. Sample xmin ACROSS the
  write all the same (two consecutive reads afterwards compare a value with itself), and add
  a positive-direction case so the signal is known to move at all.
- **`pg_stat_xact_user_tables` is not what its name implies, and four agents got this
  wrong.** The reading is not "only the current transaction, so a standalone SELECT always
  sees zero". Probed directly against Postgres 16.2 in Phase 4 QA: the view emits one row
  per user table (so a `?? 0` fallback never fires) and `n_tup_upd` really does move 0 to 1
  across two separate autocommit `pool.query` calls with an UPDATE between them, because a
  backend accumulates pending per-relation stats locally and flushes them at most once a
  second. It is still the wrong pin, but for a different reason: it depends on node-postgres
  handing back the same idle backend and on the flush window not turning over, so it can
  both miss a real write and red without one. Use xmin. The wider rule is the one that cost
  the time here: on a question about what a database actually does, one probe outranks any
  number of agents agreeing from the documentation.
- **The runtime image writes almost nowhere.** The bot container runs as `USER node` and
  only `/app/dist/media` is chowned; `/app` and everything else under it is root-owned
  COPY output. A file the bot must write (the Phase 7 heartbeat) has exactly three honest
  homes: `/tmp/<name>` (the Debian base ships /tmp as 1777; no Dockerfile change), a new
  chowned dir in the Dockerfile, or a compose `tmpfs:` mount. Phase 7 chose /tmp. Verify
  writability against the Dockerfile, never assume it.
- **An env key the compose service does not forward is INERT in production.** Until Phase 7
  the discord-bot service forwarded 13 of 24 keys, so every governor and cadence knob the
  packet had shipped read its default in the container no matter what the host `.env`
  said. Adding a bot env key now means THREE places in one change: `bot/config.ts` +
  BOT_ENV_KEYS, the compose passthrough (pinned by the key-array test in
  `tests/deploy_discord_bot.test.ts`), and DEPLOY.md (D13).
- **Extending a pinned string keeps the OLD pin vacuously green when the old text is a
  prefix of the new.** `'@ops path /livez /readyz /metrics'` is a prefix of the Phase 7
  matcher, so every toContain/split pin on the short form still passed after the change.
  When a phase extends a pinned literal, re-pin the LONG form and keep a counted pin on
  the short form so a stale copy of the old text cannot ride back in (shape in
  `tests/deploy_watchdog.test.ts`).
- **A window bug needs a fake that can REFUSE to fire.** L18 lived only in the gap between
  `reconnect()` and the new socket's HELLO, and the obvious "does not stack a second
  interval" test passes with or without the fix because `startHeartbeat` clears the old
  timer itself eventually. The gateway suite's timer rig now MODELS clearInterval
  (`timers.tick(i)` refuses a cancelled interval, `timers.live()` lists armed ones);
  driving a stored callback with `.fn()` directly bypasses cancellation and proves
  nothing.
- **The gateway's production `exitProcess` default is a real `process.exit`.** Any test
  that emits a fatal close through a hand-built `Gateway` must inject the sixth
  constructor argument or it takes the vitest worker down with it; the suite's `rig()`
  injects it in every arm, not only the fatal ones.
- **A documentation-table pin needs the ROW form, because keys echo in prose.** A
  DEPLOY.md env key appears both as its table row and in incident-guidance prose, so
  `toContain('\`KEY\`')` survives the row's deletion on the prose echo: proved by
  mutation in Phase 7 QA (the DISCORD_MAX_RPS row deleted, bare-backtick pin green).
  Pin `| \`KEY\` |`. Same family as the SQL clause-anchor rule: when the same
  fragment legitimately appears twice deciding different things, anchor the copy
  that carries the contract.
- **The compose healthcheck probe guards its staleness knob with `s>0?s:default`, and
  the shape is load bearing, do not "simplify" it.** Compose passes '' for an unset
  host key and `Number('')` is 0; a garbage value is NaN; a negative would make
  `age < stale` unsatisfiable and pin the container permanently unhealthy. None of the
  three is `> 0`, so all fall back, matching the bot side's `positiveNumberFromEnv`.
  A `||` accepts a negative (truthy) and a `??` accepts '' as 0; both ship a
  permanently red healthcheck for an operator typo. The probe is also EXECUTED by
  `tests/deploy_discord_bot.test.ts` (real node, real files, fresh/stale/missing/
  padded/non-positive), because every structural pin over a YAML string is a substring
  scan that an unparsable or verdict-inverted one-liner slips straight through.
