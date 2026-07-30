# Progress: Discord Bot Stability

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| Phase 1: Bot verification foundation | built | 2026-07-30 | 2026-07-30 |
| Phase 1 QA | done | 2026-07-30 | 2026-07-30 |
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
      (the include surfaced none; all seven bot files are in the checked set)
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
live two ways rather than assumed: `tsc --noEmit --listFiles` lists all seven bot files
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

The killed mutants: all three cadence constants, the `'0'` nickname arm, the `||` default
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

### Phase 1 QA (2026-07-30)

Release sync: NO-OP again. `origin/release/v0.33.0` was still `b0acba0adc` on a fresh
fetch, 0 behind / 7 ahead, so there was nothing to merge and no release-merge audit.

Verdict PASS-WITH-FOLLOWUPS. Zero behavior defects: the diff really is behavior-neutral.
Every injected default was traced against the code it replaced and each reproduces the
original exactly, no await or call order moved, no timer handle stopped being cleared,
the cadence move is verbatim, and `bot/main.ts`'s three construction sites are
byte-identical to the base. What the audit found was almost entirely a gap between what
the phase's docs CLAIMED and what its tests ENFORCED, which is the debt a verification
foundation exists to remove.

Method: 12 read-only finder agents over the diff with one independent skeptic per
finding (96 agents, 64 confirmed / 20 refuted), plus `qa-checklist`,
`privacy-security-review`, and `test-coverage-auditor`, plus a mutation pass in an
ISOLATED worktree at the phase tip with its own `npm ci`. Most of the 20 refutations
were verify agents racing the fix commits and reading a tree where the finding was
already closed; none hid a real defect.

Mutation tally, all NEW mutants beyond Phase 1's own 31: 162 mutant runs (discovery,
re-verification after each fix, and the fix round's own pins), in an isolated worktree
with its own `npm ci`, with the un-mutated baseline re-run green at the end and the
worktree left clean. Every run proved the patch APPLIED (cmp against a backup) and that
tests actually RAN, so a silently-unapplied patch could not be scored as a survivor.

  - Against the phase as committed: 58 planted, 9 killed, **49 SURVIVED**. That is the
    real story of this round. `bot/gateway.ts` was the worst, 16 of 18 protocol mutants
    alive, including the zombie-terminate branch, RESUME versus IDENTIFY, and seq
    tracking.
  - After the fixes: 46 of those 49 die against a named test.
  - The fix round's own new pins were then mutated in turn: 12 more mutants, all killed.

Three survivors are deliberate and must not be "fixed":
  - `M01`/`M02`, swapping which cadence constant a `bot/main.ts` loop uses. `main.ts`
    calls `main()` at module scope so it cannot be imported, and R6 forbids a source-text
    pin. Ruled-acceptable residual.
  - `S05`, deleting the `body === undefined ? undefined :` ternary in `ServerClient.call`.
    `JSON.stringify(undefined)` IS `undefined`, so the guard is a semantic no-op and no
    assertion can distinguish it. The test comment was corrected instead of the test.

Four traps are worth carrying forward, because each looked like a passing test:

  - The HELLO heartbeat test asked for `heartbeat_interval: 41250`, which is exactly
    `heartbeatIntervalMs`'s own fallback default, so a gateway that ignored the payload
    entirely still produced 41250 and the assertion could not fail.
  - `rejects.toThrow(string)` is a SUBSTRING match in vitest, so the 200-character
    truncation pin passed with a 300-character message. An Error argument is equality.
  - The default-path tests stubbed the global BEFORE constructing, which passes for a
    capture-form default, and stubbed with a ONE-parameter function, which passes for
    `(input) => fetch(input)`. That second form type-checks and would strip the auth
    header off every request. Both are now R16.
  - The gate.mjs step pin was a bare substring, so commenting the step out kept it
    green. Now R17.

Also corrected: L3's rationale was false (the seams are OPTIONAL parameters, so `tsc`
proves nothing about construction-site arity; the conclusion still stands for the
reason the security review gave), L4 was overclaimed as closed when only the connect
handshake was covered, and the "six bot files" count was stale within its own commit.
L5 was closed here instead of deferred. L6 is new and open: `bot/` type-checks against
lib DOM, so a Node-missing DOM global passes both `tsc` and `build:bot`.

A second workflow then reviewed the FIX ROUND, which is unreviewed code, and it earned
its keep: the round had broken the very rule it had just written into `bot/CLAUDE.md`.
Two new default-path tests installed the fake clock BEFORE constructing, the ordering
R16 exists to forbid, so a capture-form default would have passed them. The sleep test
also awaited its pending promise before asserting, and awaiting waits out a REAL timer,
so a captured `setTimeout` still settled and passed. Both are fixed and both mutants now
die. R17 had the same shape of problem: it was minted and then applied to only one of
six `scripts/gate.mjs` pins, so the rest still matched the raw source.

Deferred, with reasons: L1 and L2 (the interaction token and the discord_user_id in log
lines) stay routed to Phase 2, which rewrites `request()` anyway; the security review
added that the redaction must live in the THROW in `discord_api.ts`, not in the one
named catch, because 15 other bare `console.error(e)` handlers would re-open it. L6 is
a toolchain restructure, routed to Phase 7. L7 is a genuine gateway behavior defect (a
non-resumable INVALID_SESSION never clears `sessionId`, so a close before the next READY
RESUMEs a session Discord already declared dead); fixing it changes runtime behavior,
which this phase forbids, so it is ledgered for Phase 3 or 7. L8 records that
`bot/main.ts`'s two pure helpers are unreachable from any test.

The cadence constants remain unpinned against `bot/main.ts`'s USE of them (a swap
survives): `main.ts` calls `main()` at module scope so it cannot be imported, and R6
forbids a source-text pin, so this is a ruled-acceptable residual rather than a finding.

Gate: PASS, all 12 steps.
