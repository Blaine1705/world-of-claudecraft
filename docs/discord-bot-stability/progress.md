# Progress: Discord Bot Stability

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| Phase 1: Bot verification foundation | not started | | |
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
- [ ] `bot` in tsconfig include, latent type errors fixed behavior-preserving
- [ ] `build:bot` in `scripts/gate.mjs`
- [ ] Injectable fetch/socket/clock seams in `discord_api.ts`, `server_client.ts`, `gateway.ts`
- [ ] Cadence constants extracted into `bot/cadence.ts` as a pure move (R6)
- [ ] Baseline tests: config arms, server_client envelope/secret/timeout, cadence pins via the module

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

(fill in after each session)
