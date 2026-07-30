# Phase 7: Supervision + deploy hardening

Phases 1 to 6 made the bot behave; this phase makes the box behave. Today a fatal gateway
close (bad token, bad intents) logs one line and returns, leaving a process that is alive,
idle, and forever useless: `restart: unless-stopped` only acts on process exit, so Docker
never notices. The bot container also has no healthcheck, no `mem_limit`, and no
`stop_grace_period`, all of which the game service already has, and `/internal/*` is
reachable from the public internet with the shared header secret as its only gate. This
phase closes those four gaps and writes the operator documentation that did not exist when
the 2026-07-29 incident happened (DEPLOY.md currently contains no Discord section at all).

Starter prompt for the session:

```
This is Phase 7 of the Discord Bot Stability packet: Supervision + deploy hardening.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).
No ultracode Workflow for this phase: it is three small independent slices, so a parallel
Agent fan-out is the lightest orchestration that fits. Its QA session runs ultracode.

Goal: a Discord bot process that cannot zombie (fatal close exits, stale heartbeat fails
the container healthcheck) and an internal HTTP surface that no longer answers the public
edge, both pinned by tests and documented in DEPLOY.md.

STEP 0 - PRE-FLIGHT: git status clean in the worktree (ask if dirty; another session may
share the checkout). Memory scan of MEMORY.md for: deploy and compose (docker health
watchdog gotchas, compose override ports merge, node heap cgroup and compose mem), the
docs mirror and worktree hook gotchas, and the shared-worktree commit rule (explicit
paths, never git add -A).

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly): spawn an Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md, this phase
file, and:
  - bot/gateway.ts (FATAL_CLOSE_CODES near :20, onClose near :135-142, plus whatever
    injectable seam Phase 1 added to the constructor)
  - bot/main.ts (process wiring and the fatal handler at the bottom of the file),
    bot/config.ts (env loading shape and defaults), bot/scheduler.ts (the Phase 3 module
    that now owns the loops; confirm its actual name and API)
  - docker-compose.yml (the discord-bot service block, and the game service block above
    it: its healthcheck, stop_grace_period, mem_limit and memswap_limit are the parity
    exemplar, including the comment style that explains WHY each value)
  - Dockerfile (the runtime stage: node:26-slim, USER node, WORKDIR /app, dist-bot copy)
  - deploy/user-data.sh (the Caddy Caddyfile heredocs, around :83-115)
  - tests/deploy_discord_bot.test.ts and tests/deploy_watchdog.test.ts
  - DEPLOY.md (section layout; the ops-endpoint claims around :61-62, :125-131, :342-348,
    :394-403)
  - docs/discord-bot-stability/incident-2026-07-29.md (the diagnostic commands section)
It returns: the exact current text of every line the phase must change; the game service's
healthcheck/limit block verbatim as the parity template; every place in the repo that
pins the Caddy ops-path string or restates it in prose; the name and API of the Phase 3
scheduler; whether the runtime image can write to the heartbeat path you intend (the
container runs as USER node and only /app/dist/media is chowned, so /app is NOT writable);
and the env-key naming convention Phases 2, 3 and 6 established in bot/config.ts.

STEP 2 - EXECUTE: three parallel Agents, one per vertical slice, each owning its code plus
its tests. Give each the Explore summary, not the raw planning docs.

  Agent A, bot supervision (bot/ + tests):
  - Fatal gateway close exits nonzero. bot/gateway.ts onClose currently logs
    "gateway closed with fatal code" and returns; it must log and then exit. Route the
    exit through an injectable dependency (default process.exit, following the seam
    Phase 1 already added to this class) so a Vitest can assert it fired without killing
    the test process, and keep the close-code decision itself in a pure, directly tested
    helper. Use the same exit code the existing top-level fatal handler in bot/main.ts
    uses, so operators see one convention.
  - Heartbeat file: a small module (its own file, not a block appended to main.ts) that
    writes or touches a file on a cadence, wired into the Phase 3 scheduler so it proves
    the process's loop is still turning, not merely that the process exists. Path and
    cadence are env-configurable with defaults (D13). The default path must be writable
    by the non-root `node` user in the runtime image: verify this against the Dockerfile
    rather than assuming, and pick the default accordingly.
  - Tests: fatal close exits with the expected code; a non-fatal close does NOT exit and
    still schedules the reconnect; heartbeat writes on cadence; heartbeat failure (an
    unwritable path) is logged and does not crash the bot.

  Agent B, deploy assets (docker-compose.yml + deploy/user-data.sh + deploy tests):
  - discord-bot service gains a healthcheck that tests heartbeat-file FRESHNESS (not file
    existence): a `node -e` one-liner in exec form, exiting nonzero when the file is
    missing, unreadable, or older than the staleness bound. The runtime image is
    node:26-slim with no curl and no wget, so node is the only probe available; the game
    service healthcheck at the top of its block is the shape to copy.
  - discord-bot service gains mem_limit and stop_grace_period sized for a bot, not a game
    server, each with a comment saying why that number (game service comment style).
  - The heartbeat path in the healthcheck literal and the default in bot/config.ts must
    agree; if compose passes the path as an env key, pass it once and use it on both
    sides. Add a test that pins the agreement, because silent drift here produces a
    healthcheck that is always red or always green.
  - Caddy: /internal/* joins the @ops 404 block in BOTH heredocs in deploy/user-data.sh
    (the public site vhost and the admin vhost). They must stay character-identical:
    tests/deploy_watchdog.test.ts:136-137 counts occurrences with split() and fails on any
    drift between the two.
  - Update the pins your change falsifies, in the same commit: tests/deploy_watchdog.test.ts
    :136 and :146 pin the exact string '@ops path /livez /readyz /metrics'. R12 (state.md
    rulings block) puts ALL fallout of the Caddy change in this phase, so this is sanctioned
    scope, not creep.
  - Extend tests/deploy_discord_bot.test.ts per the plan: restart policy, the discord
    profile, healthcheck presence, mem_limit and stop_grace_period presence, and the Caddy
    block content for /internal/*.

  Agent C, documentation (DEPLOY.md):
  - A new Discord bot section (DEPLOY.md has none today). It documents: every env key the
    bot reads, including every key Phases 2, 3, 6, 7 added (D13), with its default and what
    raising or lowering it does during an incident; how to verify bot health (container
    health status, heartbeat freshness, what a red healthcheck means); and the incident
    runbook, which is the diagnostic command block from incident-2026-07-29.md (request
    rate by route, internal versus external source IPs, the bot 429 timeline, established
    connections to :8787) with one line each saying what a healthy reading looks like.
  - Fix every claim this phase falsifies (R12 in the state.md rulings block puts all of them
    in Phase 7, including the prose ones): the "the edge hides /livez /readyz /metrics
    but not /internal/*" parenthetical near :127, the metrics-scrape note near :342-348
    that says the edge 404s "all three ops paths", and the by-hand Caddy retrofit snippet
    near :394-403 (an operator copying the old snippet leaves /internal/* public). Say in
    the runbook that the edge change lands only at the next prod rollout (O7), and keep the
    existing guidance that the internal secret is still a real production secret: the edge
    404 is defense in depth, not the gate.
  - Do not change the restart-countdown runbook step: that curl already targets
    127.0.0.1:8787 directly and never traverses Caddy.

INVARIANTS IN PLAY:
- D15 (deploy hardening, this phase's headline): the bot service gets a healthcheck built
  on the heartbeat file, plus mem_limit and stop_grace_period; a fatal gateway close exits
  the process nonzero so `restart: unless-stopped` can act; Caddy 404s /internal/* next to
  /livez, /readyz and /metrics.
- D13 (operator levers): every cadence and threshold this phase adds is env-configurable
  with a safe default, and every new env key is documented in DEPLOY.md in this change.
- D7 (zero new npm dependencies): the healthcheck and the heartbeat use node and node:fs
  only. No curl, no wget, no health library, no new package.
- D8 (pure/IO split): the close-code decision and the staleness comparison are pure and
  directly tested; gateway.ts and the heartbeat writer stay thin IO shells.
- Non-negotiables from state.md: src/sim/ is untouched; secrets stay env-only and nothing
  resembling a token or secret lands in a doc, a compose default, or a test fixture; commit
  with explicit paths, never git add -A; no em dashes, en dashes, or emojis anywhere,
  including DEPLOY.md prose and commit bodies.
- R9 (state.md rulings block): the pre-existing em dash in the bot/gateway.ts
  FATAL_CLOSE_CODES comment was already fixed in Phase 1, so Phase 7 need not act on it.

OUT OF SCOPE: all server/ code (Phase 8 and 9 own the server side); any change to the
governor, the scheduler's cadences, or the sweep; the game service's own healthcheck,
limits, or Caddy behavior; adding a listening port or an HTTP endpoint to the bot; the
prod rollout itself (O7: the operator applies it manually after the packet merges);
Grafana or metric series (Phase 8).

STEP 3 - VALIDATION + REVIEW: run the state.md matrix rows that match the diff:
`npx tsc --noEmit`; `npx vitest run tests/discord_bot.test.ts` plus the new bot test files;
`npm run build:bot`; `npx vitest run tests/deploy_discord_bot.test.ts
tests/deploy_watchdog.test.ts`; `npm run ci:changed` (scoped --write only on files you
changed, never whole-tree). Then dispatch reviewers per the Review Dispatch Matrix in
implementation-plan.md, matching rows only: privacy-security-review matches (this diff
touches deploy and secret-adjacent files: docker-compose.yml, deploy/user-data.sh,
DEPLOY.md). migration-safety, database-performance-reviewer, cross-platform-sync,
architecture-reviewer and frontend-seam-reviewer do NOT match; if one of them does match,
the phase went out of scope, so stop and re-read this file. Prompt every reviewer for
COVERAGE, not filtering. Resume a truncated reviewer with: "Stop reading more files. Output
the full report now. No more tool calls. Format: BLOCKING / SHOULD-FIX / NICE-TO-HAVE /
VERDICT." Do not commit while a BLOCKING finding stands.

STEP 4 - COMMITS (Conventional Commits with a scope, explicit paths, every commit carries a
body of 1 to 4 plain sentences saying what changed and why, no em dashes, no emojis):
1. feat(bot): exit on a fatal gateway close and heartbeat the run loop
2. feat(deploy): healthcheck, limits, and an edge 404 for the bot's internal surface
   (carries the extended tests/deploy_discord_bot.test.ts and the updated
   tests/deploy_watchdog.test.ts Caddy pins, since they pin exactly what this commit
   changes)
3. docs(deploy): document the Discord bot env keys, health checks, and incident runbook

STEP 5 - ACCEPTANCE (each item verifiable, not asserted):
- A test proves a fatal close code exits with a nonzero code and that a non-fatal code does
  not exit and still reconnects.
- A test proves the heartbeat file is written on cadence and that an unwritable path is
  logged without crashing the process.
- `docker compose config` (or the deploy test) shows the discord-bot service with
  restart: unless-stopped, the discord profile, a healthcheck, mem_limit, and
  stop_grace_period.
- The healthcheck command literal and bot/config.ts agree on the heartbeat path, pinned by
  a test that fails if either side moves.
- deploy/user-data.sh 404s /internal/* on BOTH vhosts, with the two heredocs identical, and
  tests/deploy_watchdog.test.ts still counts occurrences correctly.
- `grep -n "internal" DEPLOY.md` shows no surviving claim that the edge leaves /internal/*
  public, and the by-hand Caddy retrofit snippet includes /internal/*.
- DEPLOY.md lists every env key the bot reads today, and the incident runbook commands run
  as written.
- `npx tsc --noEmit`, `npm run build:bot`, the bot and deploy test files, and
  `npm run ci:changed` are all green.

STEP 6 - DOCS: tick the Phase 7 boxes in progress.md and set its status row; update state.md
(the "Created by this packet" env-key and module lists, plus any gotcha you hit that the
next session would otherwise rediscover, for example the heartbeat path writability
constraint or a Caddy matcher subtlety). Same commit as the work, explicit paths. Record
genuinely surprising rules to memory.

STEP 7 - FINAL RESPONSE: phase status; files touched; validation results (command by
command); reviewer verdicts; anything deferred and why; and a one-line handoff for the
Phase 7 QA session.

STOPPING RULES:
- Stop and surface if the healthcheck approach you land on would require a new dependency
  (curl, wget, or any npm package) or a new listening port exposed outside the container.
  Neither is authorized; the heartbeat file plus a node one-liner is the sanctioned shape.
- Do NOT stop over the crash loop: R13 (state.md rulings block) settles it. Exiting on a
  fatal close crash-loops under restart: unless-stopped when the cause is unrecoverable (bad
  token, bad intents), and a visible crash loop with Docker's backoff is the desired outcome
  over today's silent zombie. No retry limiter, no supervisor, no backoff of your own, and no
  re-litigating it in QA.
- Stop if the Caddy change would break a documented runbook step that traverses the public
  edge. Report which step and do not proceed with that part.
- Stop if a BLOCKING reviewer finding cannot be fixed inside this phase's scope.
```
