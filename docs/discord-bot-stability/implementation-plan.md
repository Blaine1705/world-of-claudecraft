# Implementation Plan: Discord Bot Stability

Nine implementation phases, each followed by its own QA session (18 sessions total).
Every session is fresh, runs the starter prompt from its `phase-XX-*.md` file, and obeys
`state.md`. Model per session: Opus 4.8 or newer at xhigh effort. Every QA session runs
ultracode (D19).

## Canonical workflow (every phase)

1. **Step 0, pre-flight**: `git status` clean in the worktree
   (`/Users/fernando/Documents/wocc-discord-bot`); memory scan of `MEMORY.md` for the
   phase domain.
2. **Step 1, load context**: spawn an Explore agent over `state.md`, `progress.md`, the
   phase file, and the phase's listed source files. The main loop reads conclusions,
   not raw files.
3. **Step 2, execute**: pick the lightest orchestration (parallel Agent fan-out for
   independent slices, ultracode Workflow for batch or adversarial work). Request
   fan-out explicitly; give agents the Explore summary, not raw planning docs.
4. **Step 3, validate + review**: run the `state.md` validation matrix rows matching
   the diff, then dispatch review agents per the matrix below (only matching rows).
   Prompt every reviewer for COVERAGE, not filtering; resume truncated reviewers with
   "Stop reading more files. Output the full report now. No more tool calls. Format:
   BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do not commit until no BLOCKING
   remains.
5. **Step 4, docs**: update `progress.md` + `state.md` (same commit as the work,
   explicit paths). Record surprising rules to memory.

**Agent scaling**: split by vertical slice (a module plus its tests), never by file
type. Merge trivial sides into one agent. Escalate to a Workflow past ~5 parallel
agents or for uniform batch work. Use `isolation: "worktree"` only when agents mutate
overlapping files concurrently.

**Code hygiene**: module-first behind existing seams; new code gets decisive tests;
delete replaced code, imports, and types; no generated-file hand-edits; Conventional
Commits with a scope and a body; no em dashes, en dashes, or emojis anywhere.

## Review Dispatch Matrix (the one canonical copy; phase files reference it)

| Agent | Spawn ONLY when the diff touches | Skip it for |
|-------|----------------------------------|-------------|
| `privacy-security-review` | `server/`, `src/admin/`, `src/net/`, a deploy/secret file (Docker/compose/env/CI yml/`DEPLOY.md`/`deploy/`), OR introduces SQL / auth / a secret handling change | a pure `bot/`-logic, docs, or test-only change |
| `migration-safety` | `server/db.ts`, `server/social_db.ts`, any `server/*_db.ts` DDL, or a persisted-state shape change | any diff with no DDL and no persisted-shape change |
| `database-performance-reviewer` | SQL or a database call site, query cadence or cardinality, indexes, pool/lock/timeout behavior, or stored-data growth | any diff that cannot change database work or growth |
| `cross-platform-sync` | `src/world_api*`, `src/sim/` behavior, `src/net/online.ts`, `server/game.ts` wire/dispatch, the sim/server i18n matchers, or the RL surface | this packet's expected diffs (bot/, server REST, deploy); if it matches, the phase went out of scope |
| `architecture-reviewer` | any `src/sim/` change | everything this packet should touch |
| `frontend-seam-reviewer` | `src/ui/`, `src/render/`, `src/game/`, `src/styles/` | everything this packet should touch |
| `qa-checklist` | a phase is COMPLETE | mid-phase work |

Bot-specific note: `bot/` appears in no row by design; a bot-only diff gets
`qa-checklist` at phase end plus the phase's own adversarial QA session. If NO row
matches, spawn no reviewer.

## Phase summary

Sizing note: each phase is one slice, 3 to 5 deliverables, completable in one focused
session. QA phases apply D19 rigor: ultracode adversarial-verify plus mutation spot
checks on that phase's new pure modules, plus the review matrix.

### Phase 1: Bot verification foundation
Make the bot verifiable before changing its behavior.
- Add `bot` to `tsconfig.json` include; fix every latent type error that surfaces
  (behavior-preserving fixes only).
- Add `build:bot` to `scripts/gate.mjs` so the bundle compiles in the gate and CI, not
  first on the prod host.
- Introduce injectable seams for testability: `discord_api.ts`, `server_client.ts`, and
  `gateway.ts` accept an injected fetch/socket/clock (constructor args with production
  defaults; no behavior change).
- Baseline tests: `bot/config.ts` (required/optional/fallback arms),
  `bot/server_client.ts` (call envelope, secret header, timeout abort), and pins for
  the three cadence constants (`bot/main.ts:46-48`) so later phases consciously move
  them.
Out of scope: any behavior change. Commits: `chore(bot)` + `test(bot)`.

### Phase 2: Discord rate-limit governor
The pure module that makes exceeding Discord's contract structurally impossible.
- `bot/rate_governor.ts` (pure, no IO): bucket registry with provisional
  method+route+majorParam keys remapped onto `X-RateLimit-Bucket` hashes; per-bucket
  serialized queues; proactive gating (`Remaining == 0` waits `Reset-After`); global
  send-rate cap (`DISCORD_MAX_RPS`, D2); process-wide global pause honoring full
  `retry_after` with the non-JSON-429 Cloudflare arm (D2); the invalid-request circuit
  breaker with half-open recovery (D3); the 401/403 permanent-failure cache (D4);
  counter outputs for Phase 8.
- Rewire `DiscordApi.request()` through the governor; pin the REST base to `/api/v10`;
  add `X-Audit-Log-Reason` to member PATCHes; log `X-RateLimit-Scope` on every 429 (O5).
- Config: new env keys (D2/D3/D4 names) in `bot/config.ts` with defaults.
- Tests (the heart of the phase): header-driven pacing, 429 user/global/shared arms,
  HTML-body 429, breaker trip and half-open, forbidden-cache no-retry, queue ordering,
  counter correctness. Same-inputs-same-schedule determinism with an injected clock.
Out of scope: touching the sweep, loops, or server. Commits: `feat(bot)` x2 + `test(bot)`.

### Phase 3: Loop scheduler + diff-before-write
Kill the storm mechanics: stacking loops and pointless writes.
- `bot/scheduler.ts` (pure core + thin driver): chained-timeout loops with overlap
  guards, jitter, adaptive idle backoff (D1 cadences), coalescing for event-triggered
  runs (the `GUILD_CREATE` re-sweep trap), env-configurable intervals (D13).
- Migrate all six `main.ts` loops and the presence debounce onto it; delete the bare
  `setInterval`s.
- Nickname diff-before-PATCH: cache member nicks from `GUILD_CREATE` / chunk /
  `GUILD_MEMBER_UPDATE`; skip the PATCH when the computed nick matches (D5); update the
  cache only after success (the `computeRoleSync` pattern).
- members-meta diff: track last-successfully-pushed meta per member; push only deltas;
  suppress self-caused `GUILD_MEMBER_UPDATE` echoes (D5).
- Tests: fake-timer scheduler suites (overlap, backoff, coalescing), nick-diff arms
  (no-op, changed, cache-update-on-success-only), meta-diff and echo-suppression arms.
Out of scope: the sweep's iteration set (Phase 6), server changes. Commits:
`feat(bot)` x2 + `refactor(bot)` + `test(bot)`.

### Phase 4: Server set-based endpoints
Make the game side cheap per call.
- `POST /internal/discord/flex-batch` (new RouteDef in `server/internal.ts`, D9): a
  list of Discord user ids returns flex payloads for LINKED members only, via set-based
  queries (one `discord_links` IN pass, then batched loads), input capped and clamped
  like members-meta; hand-added `surface_inventory.ts` rows; tests on the R1 rigs
  including a query-count assertion (makePool `calls` array) at the D18 envelope.
- members-meta bulk upsert (BOTH arms, D9/D10): one multi-row statement with
  `IS DISTINCT FROM` skip; response gains an unchanged-skipped count; existing clamp
  and cap pins stay green.
- `reward_ledger` keep-forever comment at its DDL (D12).
- Tests for the untested queue modules `server/discord_relay.ts` and
  `server/discord_activity.ts` (caps, dedupe TTL, drain semantics), landing here so
  Phase 5 refactors against a green baseline.
Out of scope: the outbox (Phase 5). Commits: `feat(server)` x2 + `test(server)` +
`docs(server)`.

### Phase 5: Outbox + linked-member change feed
The one poll that replaces four.
- `server/discord_link_changes.ts`: a bounded FIFO with dedupe (the
  `discord_activity.ts` pattern), enqueued wherever the server already learns a linked
  account's flex-relevant state changed (level up, class change, points/tier change,
  link/unlink); the Explore step locates every feed site and the phase enumerates them
  in `state.md`.
- `GET /internal/discord/outbox` (new RouteDef, D9): drains relay + activity + winners
  + link changes in one envelope; the per-item `discordForAccount` N+1 collapses into
  one IN query across all four streams; hand-added spine rows; a `since`/cursor-free
  drain (destructive read, matching existing relay semantics).
- Query-count and payload-size assertions at the D18 envelope; winners' outbound
  daily-reward-service fetch stays TTL-cached and is pinned as at-most-once per drain.
- Tests: full-envelope RouteDef tests on the R1 rigs, empty-drain zero-query pin,
  mixed-stream ordering, cap behavior under overflow.
Out of scope: bot-side consumption (Phase 6). Commits: `feat(server)` x2 +
`test(server)`.

### Phase 6: Bot consumes the new surface
Rewire the bot onto flex-batch + outbox and delete the old paths.
- `server_client.ts`: `flexBatch()` and `drainOutbox()` methods; delete the per-user
  flex, relay, activity, and winners methods once unreferenced.
- Sweep rewrite: maintain the linked-member set from flex-batch results plus outbox
  link-change events; sweep iterates ONLY that set (D6) through the governor; spread
  writes across the sweep window.
- Replace the three 3-second pollers and the flex sweep's per-user GETs with one
  outbox loop on the Phase 3 scheduler at D1 cadence; presence push unchanged.
- Delete dead code (old poll wiring, unused logic helpers); the connection-count
  acceptance check (a handful of established sockets at steady state, not ~110).
- Tests: linked-set maintenance arms, outbox dispatch fan-out (relay/activity/winners/
  changes each reach their handler), end-to-end fake-server integration of one sweep
  cycle at the D18 envelope.
Out of scope: deploy files. Commits: `feat(bot)` x2 + `refactor(bot)` + `test(bot)`.

### Phase 7: Supervision + deploy hardening
The process can no longer zombie, and the internal surface leaves the public internet.
- Fatal gateway close (`FATAL_CLOSE_CODES`) exits nonzero after logging; heartbeat file
  touched by the main loop; compose healthcheck testing heartbeat freshness plus
  `mem_limit` and `stop_grace_period` for the bot service (game service parity).
- Caddy: `/internal/*` joins the 404 block in `deploy/user-data.sh` (D15, O7).
- `tests/deploy_discord_bot.test.ts` pins extended: restart policy, profile,
  healthcheck presence, Caddy block content.
- DEPLOY.md: a bot section (env keys from D13, health verification, the incident
  runbook commands from incident-2026-07-29.md).
Out of scope: server code. Commits: `feat(bot)` + `feat(deploy)` + `docs(deploy)`.

### Phase 8: Observability
See the next storm before Discord does.
- Bot counters (Phase 2 governor outputs plus queue depths, sweep durations, outbox
  drain sizes) ride the existing presence POST body (BOTH arms per D9), clamped and
  validated server-side like the rest of presence.
- Server holds them in the presence-cache module pattern and emits prom lines on the
  existing metrics path (respecting the prom-counter no-backfill gotcha); staleness
  zeroing mirrors presence.
- A short Grafana note in DEPLOY.md naming the new series and the two alert-worthy
  signals (breaker opens, 429 rate).
- Tests: presence-body clamp arms for the new fields, metric line rendering, staleness.
Out of scope: new tables, new endpoints. Commits: `feat(bot)` + `feat(server)` +
`test(server)`.

### Phase 9: /api/discord caching
The last uncached hot read the report measured.
- Wrap the per-account `/api/discord` payload assembly in the `createCachedRead` seam
  (short TTL, keyed by account) with moderation busts wired in the same change (D17);
  the presence block keeps its existing cache.
- Check the route's legacy-arm status first and honor D9 dual-arm rules if one exists.
- Query-count assertions: a cache-hit request performs zero payload queries; the
  15/min rate guard stays.
- Tests: hit/miss/bust arms (including the bust-refuses-inflight-joiners gotcha),
  fake-timer TTL, moderation-action bust wiring.
Out of scope: `/api/site-presence`. Commits: `feat(server)` + `test(server)`.
Phase 9 QA additionally runs the whole-feature `qa-checklist.md` matrix, the full
`npm run gate`, and offers packet teardown.

## Starter prompt templates

Phase files embed these verbatim with the braces filled. Implementation template:

```
This is Phase N of the Discord Bot Stability packet: {title}.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-discord-bot (branch feature/discord-bot-stability).
{ULTRACODE line if the phase warrants a Workflow}

Goal: {one sentence}

STEP 0 - PRE-FLIGHT: git status clean in the worktree (ask if dirty; another session
may share the checkout); memory scan of MEMORY.md for {domains}.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly): spawn an Explore agent over
docs/discord-bot-stability/state.md, progress.md, this phase file, and: {file list}.
It returns: {summary spec}.

STEP 2 - EXECUTE: {orchestration and agent split with per-agent deliverables}.

INVARIANTS IN PLAY: {the D-numbers from state.md this phase must keep, spelled out}.

OUT OF SCOPE: {exclusions}.

STEP 3 - VALIDATION + REVIEW: {matrix rows from state.md}; dispatch reviewers per the
Review Dispatch Matrix in implementation-plan.md (only matching rows); COVERAGE not
filtering; no commit while BLOCKING findings stand.

STEP 4 - COMMITS: {2 to 5 Conventional Commit headlines, explicit paths, bodies
required, no em dashes or emojis}.

STEP 5 - ACCEPTANCE: {verifiable checklist}.

STEP 6 - DOCS: update progress.md and state.md (same commit as the work); record
surprising rules to memory.

STEP 7 - FINAL RESPONSE: phase status, files touched, validation results, reviewer
verdicts, deferrals, one-line handoff for the QA session.

STOPPING RULES: {phase-specific stops}.
```

QA template (D19 applies to every phase):

```
This is Phase N QA of the Discord Bot Stability packet: verify {title}.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent
before it counts) plus mutation spot checks on {the phase's new pure modules}.
Worktree: /Users/fernando/Documents/wocc-discord-bot.

STEP 0 - PRE-FLIGHT: git status clean (Phase N committed); memory scan including the
test-pin trap index (READ IT before judging or writing any pin).

STEP 1 - LOAD CONTEXT: Explore agent over state.md, progress.md, phase-N file, and the
Phase N diff (git diff against the phase-start commit). Returns: promised deliverables,
files touched, acceptance criteria.

STEP 2 - AUDIT (parallel, COVERAGE not filtering): correctness agent (every deliverable
and acceptance criterion actually met; edge cases; the D-invariants in play); test
coverage agent (decisive assertions, missing arms, orphaned tests); dead-code agent
(unused imports/types, leftover replaced code); plus the Review Dispatch Matrix rows
matching the diff, plus qa-checklist. Mutation pass: mutate {named modules} (guard
inversions, boundary shifts, dropped calls) in an ISOLATED worktree and prove the suite
kills each mutant; prove the tests RAN (memory: mutation-harness-must-prove-tests-ran).

STEP 3 - FIX: apply ALL findings (blocking, should-fix, AND nits per standing user
rule); review the fix round itself (fresh eyes agent); re-run the validation matrix.

STEP 4 - DOCS: progress.md (QA complete, deferrals), state.md (drift found).

STEP 5 - {final phase only: whole-feature qa-checklist.md matrix, full npm run gate,
teardown offer per README; otherwise omit}.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts found and
fixed, mutation kill tally, deferrals, one-line handoff.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing
phase scope.
```
