# Whole-feature QA matrix (run at Phase 9 QA, packet close)

This packet touches `bot/`, `server/`, deploy assets, and one public route. It must NOT
touch `src/sim/`, `src/world_api*`, `src/net/`, `src/ui/`, `src/render/`, or the wire
protocol; the first check is that it did not.

- **Scope containment**: `git diff --name-only release/v0.33.0...HEAD` contains no
  `src/` path except (possibly) none at all; no wire/snapshot suite changed behavior.
- **Discord contract**: the governor provably never dispatches at `Remaining == 0`,
  honors full `retry_after` on all three scopes, hard-pauses on the HTML-body 429, and
  the breaker opens far below Discord's 10,000/10min line (D3). No hard-coded per-route
  numbers anywhere (O2). `/api/v10` pinned; valid User-Agent; scope logged on every 429.
- **Diff-before-write**: a steady-state sweep at the D18 envelope (1,000 players /
  5,000 members, nothing changing) performs ZERO Discord writes and ZERO members-meta
  row updates. The echo loop (PATCH -> GUILD_MEMBER_UPDATE -> members-meta POST) is
  demonstrably closed.
- **Load profile**: steady-state internal traffic is one outbox poll cadence (~20/min
  active, less idle) plus presence; no per-user flex GETs remain; established
  connections to :8787 at steady state are a small handful. The empty outbox drain is
  zero Postgres queries.
- **Dual-arm parity**: every behavior edit to an existing internal route landed on both
  the RouteDef and the legacy arm, or carries a ledgered deviation (D9); the http spine
  (surface_inventory, parity, completeness, ownership_coverage) is green.
- **Server authority + security**: the bot still never computes rewards; new endpoints
  sit behind `requireInternalSecret` with clamped inputs; Caddy 404s `/internal/*`; no
  secret is committed; parameterized SQL only.
- **Supervision**: a fatal gateway close exits the process nonzero; the compose
  healthcheck fails on a stale heartbeat; `restart: unless-stopped` + healthcheck +
  limits pinned by `tests/deploy_discord_bot.test.ts`.
- **Persistence**: no DDL beyond the `reward_ledger` comment; `discord_links` upsert is
  idempotent and back-compatible; retention rules satisfied (D12).
- **Copy rules**: no em dashes, en dashes, or emojis anywhere in the diff (code,
  comments, docs, commits, Discord-facing strings); no new player-visible game-client
  strings (if any exist, full i18n treatment applies).
- **Tests**: every new module has decisive tests; mutation tallies recorded per QA
  phase; the `discord_relay`/`discord_activity` name-collision trap documented where a
  future reader will hit it; cadence constants pinned.
- **Observability**: counters visible as prom lines; staleness zeroing works; the two
  alert signals (breaker opens, 429 rate) documented in DEPLOY.md.
- **Build gate**: `npm run gate` green in the worktree, including `build:bot`.
- **Docs**: DEPLOY.md bot section complete (env keys, health verification, runbook);
  follow-up issues from brainstorm.md "out of scope" actually filed; OPEN items O4/O5
  surfaced to the user in the final report.
- **Deploy verification** (after the user's manual rollout, not part of the packet):
  `curl -s localhost:8787/api/status` ok; bot 429 count near zero over 24h; Grafana
  internal-request panel roughly halved; O5 scope question answered from logs.
