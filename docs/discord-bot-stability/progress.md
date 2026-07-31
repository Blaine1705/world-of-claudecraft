# Progress: Discord Bot Stability

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| Phase 1: Bot verification foundation | built | 2026-07-30 | 2026-07-30 |
| Phase 1 QA | done | 2026-07-30 | 2026-07-30 |
| Phase 2: Discord rate-limit governor | built | 2026-07-30 | 2026-07-30 |
| Phase 2 QA | done | 2026-07-30 | 2026-07-30 |
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
- [x] `bot/rate_governor.ts` pure module (buckets, proactive gating, global pause, breaker, forbidden cache, counters)
- [x] `DiscordApi.request()` rewired; `/api/v10` pinned; audit-log reason on member PATCH; scope logging
- [x] New env keys in `bot/config.ts` with defaults
- [x] Governor test suite (all 429 arms, HTML 429, breaker, pacing determinism)

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

### Phase 2 (2026-07-30)

Release sync: NO-OP. `origin/release/v0.33.0` on a fresh fetch was 0 behind / 20 ahead,
so there was nothing to merge and no release-merge audit.

`bot/rate_governor.ts` is pure with zero imports: a grep for fetch, ws, Date.now,
setTimeout, setInterval and performance.now returns nothing, and every test drives it
through `tests/helpers/synthetic_clock.ts`, a fully VIRTUAL clock rather than vitest
fake timers. That choice is load bearing twice over: a clock captured at construction
does not move under fake timers, so a suite built on them can pass for an
implementation that quietly reads the wall clock, and a fractional delay is allowed to
fire early, which would make every boundary assertion a coin flip.

Design calls worth carrying forward. Queues are keyed by the PROVISIONAL route
template while rate state is keyed by the RESOLVED bucket, which is what makes "the two
keys must not double count" true without a mid-flight chain swap. Interaction callbacks
get a per-interaction bucket and skip the global RPS cap, which is Discord's documented
contract and without which a saturated sweep would blow the hard 3 second interaction
deadline; they still respect every pause. Credentials never enter a bucket key or a log
line (`:token`), which is also how ledger item L1 was closed, in the THROW.

Three registries would otherwise have grown without bound, because a per-interaction
bucket means a new entry per slash command: live rate state and the learned
route-to-bucket map are LRU capped, and a drained queue is dropped. All three sizes are
reported in the counter snapshot so the bounds are observable at all.

The test matrix was fanned out over six agents, one per arm group with its own file,
each followed by an independent skeptic. That earned its keep: the skeptics found three
REAL module defects, not just test gaps. The half-open probe never settled on an
ordinary JSON 429, so the breaker parked in half-open and every later request claimed a
fresh probe; `settleProbe(true)` fired on ANY success rather than the probe's, so one
essential slash-command reply closed the breaker on the sweeps' behalf; and a probe
whose send threw or whose retries ran out never settled at all. A fourth, that opening
the breaker did not restart the quiet window, surfaced when the regression test for the
third was written.

The `qa-checklist` gate then found the phase's worst defect, which every one of those
agents had missed: `setNickname` and the two role writes shared ONE permanent-failure
subject key per member. Discord 403s a nickname PATCH permanently for the guild owner
and for anyone above the bot in the role hierarchy, so from the next sweep that member's
role writes were refused unsent for 24 hours, and with MANAGE_NICKNAMES absent every
member 403d and all tier-role sync stopped guild-wide. That is a change in the
user-visible effect of the calls, which this phase's scope forbids. Keys are now scoped
per permission. The same review found the pause was not re-checked after the bucket and
rate-slot waits, that a 429 with no retry_after retried with zero delay, and that the
four config knobs had no test at all behind their acceptance item.

Mutation tally: 13 mutants, all killed, each run proving the patch applied and the tests
actually ran. Three initially SURVIVED and every one was a defect in the test rather
than the code: the probe-ownership arm only ran with the breaker open, where
settleProbe early-returns; the registry-bound arm built interaction ids by adding to a
numeric literal past Number.MAX_SAFE_INTEGER, so hundreds of iterations collapsed onto
the same few ids and the map never grew; and the remap arm let its second response carry
fresh headers, which rebuilt the state the migration was meant to move.

Gate: the full suite has ONE failure, `tests/texture_upload.test.ts`, which reproduces
identically on the pre-phase base commit `91e9ac4461` in a clean detached worktree and
is a Three.js version-pin drift unrelated to this phase (no `src/` file is touched).
The steps the gate abort skipped were run by hand: `tsc --noEmit`, `build:bot`,
`build:server`, and `ci:changed` all green.

R8 is DONE: the four keys are in the commented Discord block of `.env.example`,
carrying their defaults. Getting there needed a detour worth recording, because the
next phase that touches an env or deploy file will hit the same wall. Every `.env*`
path is denied to the agent at the HARNESS level, for Read and for Bash alike, and the
project's own settings carry no permission rules to relax. A narrowly scoped allow rule
for the single file (written to the gitignored `.claude/settings.local.json`) did NOT
lift it in-session, so the edit was applied through a user-run shell command instead,
anchored on the `#DISCORD_SYNC_NICKNAMES=1` line so a missing anchor would abort rather
than write to the wrong place.

### Phase 2 QA (2026-07-30)

Release sync: NO-OP. `origin/release/v0.33.0` on a fresh fetch was 0 behind / 32 ahead,
so there was nothing to merge and no release-merge audit.

Verdict PASS-WITH-FOLLOWUPS. The governor was in far better shape than Phase 1's diff
had been: 26 of the round's first 34 mutants died against a named test on the code as
committed, purity held, the copy rules held, and the diff touched no `src/`, no
`server/`, and no `package.json`. But the round found ONE defect that the phase's own
adversarial pass, its `qa-checklist` gate, and its `privacy-security-review` had all
missed, and it is the failure D2 exists to prevent.

**Rate state was keyed by the bare `X-RateLimit-Bucket` hash.** Discord documents that
header as non-inclusive of the top-level (major) resource, so the hash names a route
SHAPE rather than one live bucket: two channels, or two guilds, hit on the same route
answer with the SAME hash while holding genuinely separate limits. The bot posts to up to
four distinct channel ids through one `createMessage` route, so this was live traffic. It
failed both ways. One channel reporting headroom overwrote another's exhausted window and
the next post went out at `Remaining == 0`; and one channel's spent window gated every
other channel. `trackedBuckets` under-reported to match. Worse, the wrong contract was
FROZEN by a passing test that asserted two templates with different major parameters and
one hash counted as a single bucket.

That finding is also the round's method paying for itself. It was raised by the
Discord-contract audit agent, independently confirmed by a skeptic that had the file open
and built its own repro, and then re-verified by hand in a throwaway probe against the
real module before a line was changed: a control run gated correctly at `[0, 10000]`,
and one response from a second channel sharing the hash collapsed it to `[0, 1, 2]`. The
fix pairs the hash with the major parameter, which is the composition every Discord
client makes for the same reason, and it keeps merging two templates that share a hash
AND a major parameter, which is the case the remap was written for.

Four smaller code fixes rode along, each confirmed the same way: the
`MISSING_RETRY_AFTER_MS` floor did not cover a `retry_after` that was present but zero
(not nullish, so it slipped the fallback and produced a zero-delay retry on the one path
with no rate cap); a bucket-hash CHANGE deleted state that other templates still resolved
to; the bucket gate was not re-checked after the rate slot although the pause deliberately
was; and one constant bounded two registries with different lifetimes.

The test story is the other half. Five of the eight first-round survivors were exactly
the behaviors the phase shipped BEYOND its original spec, which is where the phase notes
said the risk had moved and where the tests had not followed: the missing-retry_after
floor, the post-bucket-gate pause re-check, the `/callback` suffix half of the rate
exemption, the `MAX_FORBIDDEN_ENTRIES` bound, and the "loop, not a single sleep" in
`waitForPause`. Two existing pins were not merely thin but VACUOUS: the cache-bound test
stored 42 entries against a cap of 4096 and asserted `42 <= 4096`, which no
implementation can fail (its comment claimed the size was "injected", but the cap is a
module constant with no seam), and the route-map LRU test passed unchanged when the LRU
was turned back into a plain FIFO, because a hot route that loses its mapping simply keys
rate state under its own template and gates identically. Reading that state through a
SIBLING template is what makes the re-insertion line load bearing.

The fresh-eyes pass over the fix round earned its keep, which is the whole reason the
standing rule asks for one: the fix round had introduced a REGRESSION of its own. Adding a
bucket re-check after the pause re-check made the bucket the last gate, and that gate is a
long sleep in precisely the case it was added for, so a ban pause declared while a request
slept there was never re-read and the request sent into it. Ordering cannot fix that at
all: whichever gate goes last, its predecessor is the one that goes stale. The gates are
now a LOOP that re-reads until none is in force, re-reserving the rate slot on each pass
so a slot sat on for a whole bucket window no longer paces nothing. The same pass found
that a `retry_after` of Infinity (JSON.parse turns `1e999` into one, and its `typeof` IS
`number`) set `pausedUntil` to Infinity, which the platform clamps to about a millisecond,
so the pause loop spun forever and the bot never sent again.

Validation: `npx tsc --noEmit` clean, 308 tests green across the eleven bot suites (was
283 at the phase tip), `npm run build:bot` green, `npm run ci:changed` exit 0 with
error-level diagnostics clean on every touched file. `.env.example` could not be
re-verified by the QA session: every `.env*` path stays denied at the harness level, so
R8 is carried on the Phase 2 record and the four keys were not re-read here.

Mutation tally: 44 mutants across three rounds, in an ISOLATED worktree detached at the
phase tip, all NEW beyond the 15 Phase 2 planted itself. Every run proved the patch
APPLIED (cmp against a backup), proved the suite actually RAN (306 tests, never zero),
and proved the file RESTORED, so a silently-unapplied patch could not be scored as a
survivor.

  - Against the phase as committed: 34 planted, 26 killed, 8 SURVIVED. Five of the eight
    were the beyond-spec behaviors named above.
  - After the first fix round, with 10 new mutants added against the fix round's own
    code: 44 planted, 39 killed, 5 SURVIVED. Four of the five were pins for code the fix
    round had just written (the bucket re-check, the hash-rotation guard, the route-map
    LRU, the config knob mapping) and the fifth was the pause loop, whose new test the
    second pause re-check silently compensated for, so it needed TWO extensions rather
    than one to become decisive. That is the standing rule about the fix round being
    unreviewed code earning its keep.
  - After the fresh-eyes review round (the gate loop, the finiteness guard, the shared
    bucket predicate) and 3 more mutants aimed at those: 47 planted, 46 KILLED, 0 errors,
    0 hangs, every run at 308 tests.
  - The single remaining survivor is a DECLARED RESIDUAL, not a gap: the loop inside
    `waitForPause` became observationally identical to a single sleep once the gates
    themselves became a loop, because the outer `isGated` re-check now absorbs an extension
    whichever shape the inner one takes. No assertion can distinguish them, so it is kept
    on the same footing as the `evictBuckets` drain loop and recorded in state.md.

Two mutants were themselves defective and are worth recording. One HUNG the suite instead
of failing it, and the cause was a pin I had just written: a frozen `now` with a no-op
sleep makes `waitForBucket` spin on an immediately-resolved promise, starving the
macrotask queue so vitest's own timeout never fires. The harness now scores a hang as a
kill and bounds each run, rather than dying on a 900 second subprocess timeout with the
mutant left applied. The other "survived" only because it flipped a guard's CONDITION and
left the fixed BODY in place, so it never recreated the defect it named; rebuilt with the
genuine pre-fix shape, it dies. That is the same trap Phase 2 hit with its subject-key
mutant, and it is why a survivor is a claim to be checked rather than a result.

Method: a 6-agent audit fan-out over the diff with one independent skeptic per finding
(57 agents, 0 deaths, 0 empty results, 27 confirmed / 24 refuted), every refutation
judged by hand rather than taken on faith. Two of those judgements went AGAINST the
agents: `queue-full-latches-half-open` was reported confirmed by one skeptic and refuted
by another, and the refutation is right (the state self-heals, since the next request
claims the probe the aborted one would have been); and the shared-scope probe-exhaustion
finding is the `finally`'s documented conservatism, not a contradiction of D3. Both are
now written down so a later round does not rediscover them.

Not fixed here, and routed instead, each with its reason recorded in state.md as L9 to
L12: relay and activity items are permanently LOST when the breaker refuses their post
(Phase 5 or 6 owns the drain protocol); `bot/discord_api.ts` sets no fetch deadline
(Phase 7 owns supervision, and it is a stall rather than a permanent latch); requests
holding a pre-pause rate slot all fire at once when the pause lifts (Phase 3 owns the
scheduler); and `this.queues` is the one uncapped map, which matters for MEMORY during a
long ban pause rather than for the wire (Phase 3).

O2 is confirmed for the governor (every numeric limit comes from a header or an option,
audited line by line) and O5 is narrowed rather than closed: the scope arm is pinned for
all five header shapes, so the only remaining task is reading the log lines after the
first deploy.

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
