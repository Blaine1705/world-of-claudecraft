# Progress: Discord Bot Stability

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| Phase 1: Bot verification foundation | built | 2026-07-30 | 2026-07-30 |
| Phase 1 QA | not started | | |
| Phase 2: Discord rate-limit governor | not started | | |
| Phase 2 QA | not started | | |
| Phase 3: Loop scheduler + diff-before-write | not started | | |
| Phase 3 QA | not started | | |
| Phase 4: Server set-based endpoints | not started | | |
| Phase 4 QA | not started | | |
| Phase 5: Outbox + linked-member change feed | not started | | |
| Phase 5 QA | not started | | |
| Phase 6: Bot consumes the new surface | not started | | |
| Phase 6 QA | not started | | |
| Phase 7: Supervision + deploy hardening | not started | | |
| Phase 7 QA | not started | | |
| Phase 8: Observability | not started | | |
| Phase 8 QA | not started | | |
| Phase 9: /api/discord caching | not started | | |
| Phase 9 QA (packet close) | not started | | |

## Deliverable checklists

### Phase 1
- [x] `bot` in tsconfig include, latent type errors fixed behavior-preserving
      (the include surfaced none; all six bot files are in the checked set)
- [x] `build:bot` in `scripts/gate.mjs` (and in both CI jobs that build the server, R7)
- [x] Injectable fetch/socket/clock seams in `discord_api.ts`, `server_client.ts`, `gateway.ts`
- [x] Cadence constants extracted into `bot/cadence.ts` as a pure move (R6)
- [x] Baseline tests: config arms, server_client envelope/secret/timeout, cadence pins via the module

### Phase 2
- [ ] `bot/rate_governor.ts` pure module (buckets, proactive gating, global pause, breaker, forbidden cache, counters)
- [ ] `DiscordApi.request()` rewired; `/api/v10` pinned; audit-log reason on member PATCH; scope logging
- [ ] New env keys in `bot/config.ts` with defaults
- [ ] Governor test suite (all 429 arms, HTML 429, breaker, pacing determinism)

### Phase 3
- [ ] `bot/scheduler.ts` (overlap guards, jitter, adaptive backoff, coalescing, env cadences)
- [ ] All six loops + presence debounce migrated; bare setIntervals deleted
- [ ] Nickname diff-before-PATCH with success-only cache update
- [ ] members-meta diff + self-echo suppression
- [ ] Fake-timer scheduler tests; diff-arm tests

### Phase 4
- [ ] `POST /internal/discord/flex-batch` RouteDef + spine rows + R1-rig tests + query-count pin
- [ ] members-meta bulk upsert with unchanged-skip, BOTH arms
- [ ] `reward_ledger` keep-forever comment
- [ ] Tests for `server/discord_relay.ts` and `server/discord_activity.ts`

### Phase 5
- [ ] `server/discord_link_changes.ts` bounded FIFO + every feed site enumerated in state.md
- [ ] `GET /internal/discord/outbox` RouteDef + spine rows, batched account lookups
- [ ] Query-count + payload assertions at the D18 envelope; winners fetch at-most-once pin
- [ ] Full-envelope tests incl. empty-drain zero-query pin

### Phase 6
- [ ] `flexBatch()` + `drainOutbox()`; old per-endpoint client methods deleted
- [ ] Linked-set sweep through the governor with write spreading
- [ ] One outbox loop replaces three pollers + per-user flex GETs
- [ ] Dead code removed; steady-state connection count verified small
- [ ] Integration test of a full sweep cycle at the D18 envelope

### Phase 7
- [ ] Fatal gateway close exits nonzero; heartbeat file
- [ ] Compose healthcheck + mem_limit + stop_grace_period for the bot service
- [ ] Caddy 404s `/internal/*`
- [ ] Deploy test pins extended; DEPLOY.md bot section + runbook

### Phase 8
- [ ] Counters ride presence POST (both arms), clamped server-side
- [ ] Prom lines on the existing metrics path with staleness zeroing
- [ ] Grafana note in DEPLOY.md
- [ ] Clamp/render/staleness tests

### Phase 9
- [ ] `/api/discord` payload behind keyed `createCachedRead` + moderation busts
- [ ] Legacy-arm status checked and honored
- [ ] Cache-hit zero-query assertion; rate guard intact
- [ ] Hit/miss/bust/TTL tests

## Per-phase notes

### Phase 1 (2026-07-30)

Release sync: NO-OP. `origin/release/v0.33.0` was still at `b0acba0adc`, the commit
this branch was cut from, so there was nothing to merge (6 ahead, 0 behind). Every
later phase repeats the check at its START, per the standing rules at the top of
state.md.

Environment: this worktree had no `node_modules`; `npm ci` was run in it to get the
real TypeScript 7 native binary and a runnable gate.

The tsconfig include surfaced ZERO latent type errors, so the "fix the errors the
include surfaces" commit collapsed into the include itself. The include was proven
live two ways rather than assumed: `tsc --noEmit --listFiles` lists all six bot files
including `bot/main.ts`, and a deliberate type error added to `bot/main.ts` failed the
check before being reverted.

The bot build had fallout the plan did not name: `tests/ci_workflow.test.ts` pins the
release-gate structure by count, so adding a step moved the single-shard condition
count from 8 to 9 and the release-gate step count from 12 to 13. Both new pins were
mutation-checked (dropping either new CI step turns the suite red).

Seam shapes chosen, all trailing parameters with production defaults so every
existing call site in `bot/main.ts` is untouched: `DiscordApi(token, fetchImpl, sleep)`,
`ServerClient(baseUrl, secret, fetchImpl, timers)`, and
`Gateway(token, gatewayUrl, handlers, socketFactory, timers)`. The Gateway socket
factory returns `ws`'s own `WebSocket` type deliberately, because widening it to a
structural interface would strip the contextual parameter types off the
`on('message'|'close'|'error', ...)` callbacks and put `WebSocket.OPEN` out of reach.

Verification: 98 tests green across the seven bot-related suites, and two independent
mutation rounds killed 31/31.

The review round changed the shape of the phase in three ways worth carrying forward.
The `qa-checklist` pass found the acceptance criterion "a test asserts the DEFAULT
path" was met for `ServerClient` only, while `DiscordApi` and `Gateway` had no test
importing them at all. That is not cosmetic: this phase INTRODUCED the failure mode
(`request()` used to call the global `fetch` directly and now calls `this.fetchImpl`),
so a broken default parameter would have shipped silently. Both are now covered, the
Gateway one by module-mocking `ws`, which also closed the L4 ledger item outright
rather than deferring it to Phase 3.

Second, the three shells had drifted into two different injection conventions
(capture-the-global versus forward-to-the-global). They are now uniformly
forward-to-the-global, which is both fake-timer friendly for Phases 2 and 3 and avoids
calling a global with the instance as its `this`. Recorded as R15 and in `bot/CLAUDE.md`.

Third, the CI guard was compensable: `build:bot` in `release-gate` was pinned only by
two counts, so deleting it and adding any other single-shard step kept the suite green.
It is now also pinned by name, along with the other three builds and the four gate
steps. The decoy-swap mutation confirms the hole is closed.

The killed mutants: both cadence constants, the `'0'` nickname arm, the `||` default
fallback, the `!v` required guard, the activity ladder rung, two channel key swaps, the
secret header name, the 8000 ms deadline, the success-flag check, the `finally`
clearTimeout, the Content-Type header, the non-ok short circuit, the injected-fetch
routing, the `Bot` versus `Bearer` prefix, the v10 base, all three retry-clamp bounds,
the retry-once bound, the User-Agent, both Gateway default-socket arms, the v10/json
query string, the 4014 fatal-close code, the reconnect delay, the deleted gate step,
and the count-preserving CI decoy swap.

Worktree note for later phases: this checkout had no `node_modules`, and the main
checkout's install is stale (TypeScript 5.9.3, no ffmpeg-static). A local `npm ci` in
the worktree is what gets the real TypeScript 7 native binary and a runnable gate.
