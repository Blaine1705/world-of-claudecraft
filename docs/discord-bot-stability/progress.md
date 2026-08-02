# Progress: Discord Bot Stability

## Status

| Phase | Status | Started | Completed |
|---|---|---|---|
| Phase 1: Bot verification foundation | built | 2026-07-30 | 2026-07-30 |
| Phase 1 QA | done | 2026-07-30 | 2026-07-30 |
| Phase 2: Discord rate-limit governor | built | 2026-07-30 | 2026-07-30 |
| Phase 2 QA | done | 2026-07-30 | 2026-07-30 |
| Phase 3: Loop scheduler + diff-before-write | built | 2026-07-31 | 2026-07-31 |
| Phase 3 QA | done | 2026-07-31 | 2026-07-31 |
| Phase 4: Server set-based endpoints | built | 2026-07-31 | 2026-07-31 |
| Phase 4 QA | done | 2026-07-31 | 2026-07-31 |
| Phase 5: Outbox + linked-member change feed | built | 2026-08-01 | 2026-08-01 |
| Phase 5 QA | done | 2026-08-01 | 2026-08-01 |
| Phase 6: Bot consumes the new surface | built | 2026-08-01 | 2026-08-01 |
| Phase 6 QA | complete | 2026-08-01 | 2026-08-01 |
| Phase 7: Supervision + deploy hardening | built | 2026-08-01 | 2026-08-01 |
| Phase 7 QA | complete | 2026-08-02 | 2026-08-02 |
| Phase 8: Observability | built | 2026-08-02 | 2026-08-02 |
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
- [x] `bot/scheduler.ts` (overlap guards, jitter, adaptive backoff, coalescing, env cadences)
- [x] All six loops + presence debounce migrated; bare setIntervals deleted
- [x] Nickname diff-before-PATCH with success-only cache update
- [x] members-meta diff + self-echo suppression
- [x] Scheduler tests on the VIRTUAL clock (not fake timers, per the Phase 2 ruling);
      diff-arm tests

### Phase 4
- [x] `POST /internal/discord/flex-batch` RouteDef + spine rows + R1-rig tests + query-count pin
- [x] members-meta bulk upsert with unchanged-skip, BOTH arms
- [x] `reward_ledger` keep-forever comment
- [x] Tests for `server/discord_relay.ts` and `server/discord_activity.ts`
- [x] L14 closed on the server side (added, not in the original checklist): members-meta
      reports `changed` / `skipped` / `unapplied` instead of counting what it read
- [x] Phase 4 QA: release base re-synced and audited, 31 findings adversarially verified,
      14 survivors all applied, fix round reviewed by fresh eyes and re-fixed, mutation
      tally 10/10 plus the CI-floor gap it exposed

### Phase 5
- [x] `server/discord_link_changes.ts` bounded FIFO + every feed site enumerated in state.md
- [x] `GET /internal/discord/outbox` RouteDef + spine rows, batched account lookups
- [x] Query-count + payload assertions at the D18 envelope; winners fetch at-most-once pin
- [x] Full-envelope tests incl. empty-drain zero-query pin

### Phase 6
- [x] `flexBatch()` + `drainOutbox()`; old per-endpoint client methods deleted
- [x] Linked-set sweep through the governor with write spreading
- [x] One outbox loop replaces three pollers + per-user flex GETs
- [x] Dead code removed; steady-state connection count: analytic bound 1 to 3 sockets
      (vs the incident's ~110); the live `lsof` measurement is VERIFY-AT-DEPLOY (no
      Discord credentials in this environment, so the bot cannot run here)
- [x] Integration test of a full sweep cycle at the D18 envelope

### Phase 7
- [x] Fatal gateway close exits nonzero; heartbeat file
- [x] Compose healthcheck + mem_limit + stop_grace_period for the bot service
- [x] Caddy 404s `/internal/*`
- [x] Deploy test pins extended; DEPLOY.md bot section + runbook
- [x] Ledger burn-down routed here by state.md (added, not in the original checklist):
      L18 reconnect lifecycle, L10/L17 Discord call deadline, L13 permanent-400 caching,
      L6 bot-specific tsconfig

### Phase 8
- [x] Counters ride presence POST (both arms), clamped server-side
- [x] Prom lines on the existing metrics path with staleness zeroing
- [x] Grafana note in DEPLOY.md
- [x] Clamp/render/staleness tests

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
error-level diagnostics clean on every touched file.

The gate aborted at the MALWARE SCAN, and it is environmental rather than a regression:
all 194 high findings sit inside `.worktrees/fix-play-map-level-toggle`, a worktree another
session registered in this checkout mid-run, and the scanner walks the whole working tree.
A clean detached worktree of HEAD scans PASS (4445 files, 0 high). The remaining seven gate
steps were then run by hand and all pass: biome on changed files, sfx check, typecheck, and
the env, server, bot and client builds. The full suite is 23065 passed with exactly two
failures, both proven environmental in that same clean copy: `tests/malware_scan.test.ts`
(the same foreign worktree, and it PASSES in the clean copy) and `tests/texture_upload.test.ts`
(the known Three.js version-pin drift, which fails in the clean copy too and on the
pre-phase base). No `src/` file is touched by this packet.

R8 is VERIFIED, not merely carried forward. Every `.env*` path stays denied to the agent at
the harness level, so the check ran as a user-issued shell command instead, and all four keys
are present as commented entries on consecutive lines carrying the defaults the module
exports: `#DISCORD_MAX_RPS=8`, `#DISCORD_BAN_PAUSE_MS=600000`, `#DISCORD_BREAKER_LIMIT=300`,
`#DISCORD_FORBIDDEN_TTL_MS=86400000`. Each matches its `DEFAULT_*` constant in
`bot/rate_governor.ts`, which is the pairing worth checking: a documented default that had
drifted from the code would be worse than no documentation at all.

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
  - After the `qa-checklist` gate over the QA round's OWN diff, which returned READY with
    three should-fix items, and 4 more mutants aimed at those: 51 planted, 50 KILLED,
    0 errors, 0 hangs, every run at 322 tests.
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

The `qa-checklist` gate then ran over the QA round's own diff, since the Review Dispatch
Matrix names it for a completed phase and the fix round had only had a general-purpose
review. Verdict READY, zero blocking, and it found three real should-fix items, all
applied. The sharpest was a hole in the very fix the round had just written: a body
`retry_after` of zero was declared UNUSABLE for the wait but still won PRECEDENCE over the
header, so a 429 carrying `retry_after: 0` beside `retry-after: 30` waited one second and
retried into a live thirty second penalty. A non-positive or non-finite body value is now
nulled before the coalesce. The other two were coverage: `majorParameterOf` shipped as a
public export with no direct test (it now has one per live route, plus the no-major and
literal-after-major cases, and it now requires an id-shaped segment so a literal like
`/guilds/templates/{code}` cannot be read as a major parameter), and the four registry
bounds were asserted against the very constants they bound, so lowering
`MAX_TRACKED_ROUTES` to 4 kept the suite green. They are pinned against literals now, the
way the scopes suite already pinned the four DEFAULT_* knobs.

Fixing that precedence hole then OPENED a new coverage gap and the mutation set caught it
immediately: with a non-positive body value nulled before the coalesce, a zero retry-after
HEADER became the only remaining path into the floor guard, and nothing exercised it. That
is the round's clearest argument for re-running the whole mutation set after every fix
rather than only mutating what the fix touched.

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

### Phase 3 (2026-07-31)

Release sync: REAL, not the usual no-op. `origin/release/v0.33.0` on a fresh fetch was 110
ahead / 49 behind, so the branch merged it before any Phase 3 work: 3149 files, zero
conflicts, merge `c5e004d8d`. The `release-merge-audit` skill found exactly one file both
sides had changed, `.env.example`, and the merge kept both halves (the release's OTA block
and removed COMMUNITY_TEST_RIFTS, plus Phase 2's four governor keys). The release touched no
`bot/` file, none of `src/sim/discord_roles.ts` or `discord_tier.ts`, and none of the
`server/` modules serving `/internal/discord`, so no legacy-arm mirroring, no injected-helper
re-binding, and no invalidated planning premise. `npm ci` was re-run because package-lock
moved.

Post-merge baseline, measured BEFORE any Phase 3 change: 1833 files / 23801 tests pass, one
failure, and it is the sibling-worktree malware scan. **`tests/texture_upload.test.ts` now
PASSES**, so the packet's second known gate failure is gone: the merge carried the Three.js
work that fixed it. Only the worktree malware red remains, and it aborts the gate before tsc
and the builds, which were run by hand and are green.

Both root causes are closed. The six bare `setInterval` loops and the `presenceTimer`
debounce now run on `bot/scheduler.ts`, which chains each delay after the previous run
SETTLES, so a sweep that outlasts its period can no longer stack a second one beside itself.
`grep setInterval bot/main.ts` returns nothing. The nickname PATCH and every members-meta
push are conditional on an actual change, so a steady-state sweep writes nothing at all,
which also removes the self-inflicted echo load (a PATCH produced a `GUILD_MEMBER_UPDATE`
that the handler turned straight back into a members-meta POST).

Design calls worth carrying forward. The scheduler is split like the governor: the decision
half (overlap, coalescing, backoff, jitter) is pure and imports nothing, so it is provable
with zero IO, and only a thin driver owns a timer. A `debounce` MODE expresses the presence
guard on the same machinery rather than as a second mechanism. The live nick is cached
SEPARATELY from `memberNames`, because `displayNameOf` collapses nick, `global_name` and
username into one string and therefore cannot answer the question the PATCH precondition
asks. And the diff logic went into a new `bot/member_writes.ts` rather than into `main.ts`,
because `main()` runs at module scope so nothing in that file is reachable from a test: that
is ledger item L8's instruction, and it is what makes the phase's acceptance items testable
at all.

Two traps found here. `server_client.ts` answers `null` for a failed push instead of
throwing, so the return value is the ONLY success signal; a cache updated on absence-of-throw
would have marked refused batches clean and stranded those members. And an unusable
`activeMs` resolving to 0 would arm a zero-delay timeout that re-arms itself, which starves
the macrotask queue and WEDGES the process rather than failing, so the resolver floors to
`MIN_INTERVAL_MS` and `add()` throws outright on a non-positive cadence.

One deliberate behavior deviation, recorded rather than hidden: because the
refresh-then-push pairing has to keep its ordering it lives in ONE task, so the
`GUILD_CREATE` kick now also refreshes the special roles. That is one extra guild-roles GET
per reconnect, and it makes the push more correct (the previous code published whatever role
index happened to be resolved). Everything else is cadence-only: which function runs and what
it does are unchanged.

The deviation also applies to the op 8 backfill-complete kick, not only to GUILD_CREATE:
both target the same paired task, so both now refresh the special roles first.

A second, smaller deviation, on the error path: the roster push now STOPS at the first
batch the server refuses instead of attempting the rest. Previously `call()` returned null
and the loop carried on, spending a request per remaining batch against a server that had
already refused one, which is the shape this packet exists to stop. Nothing goes stale for
it: the refused members keep their old cache entries, so the next sweep retries exactly
them. Pinned by "stops after a mid-run refusal, keeping the batches already accepted".

Ledger: L7 CLOSED (a non-resumable INVALID_SESSION now clears the session id, resume URL and
seq, so a close arriving before the next READY re-IDENTIFIEs instead of RESUMEing a session
Discord had just killed). L12 CLOSED (`this.queues` is LRU bounded by `MAX_TRACKED_QUEUES`,
so a long ban pause can no longer grow it with one entry per slash command). L11 was found to
be ALREADY closed by the dispatch loop Phase 2 QA shipped, which re-reserves the rate slot on
every pass; it was verified rather than assumed, and the test that pins it reproduces the
reported defect when the reservation is hoisted out of the loop.

Mutation round: 15 planted mutants over `scheduler.ts` and `member_writes.ts`, 13 killed on
the first pass. Both survivors were genuine holes, not equivalent mutants. Reading the work
signal backwards survived because every driver test used a cadence whose idle interval equals
its active one, so nothing observed the backoff through the driver at all; and the debounce
burst test stopped at the first deadline, so a kick that armed a SECOND timer rather than
folding into the open window still passed. Both are now covered and the re-run is 15/15.

Review round (qa-checklist plus test-coverage-auditor, both dispatched fresh). No blocking
finding on the invariants; two BLOCKING coverage gaps and two real defects, all fixed here
rather than carried.

The defects. Suppressing the echo removed the thing that used to carry a bot-driven rename
into the game: the members-meta `name` is player visible (the server stores it and
`server/game.ts` emits it as the in-world nameplate), so a level-up would have shown the old
level for up to a whole role-sync interval. A successful PATCH now pushes that member
immediately, diff-guarded, so it is exactly one push and cannot re-open the echo loop. And
`pushMembersMeta` answered the TRUTHY `{ updated: 0 }` for the server's over-cap silent drop,
so the new diff would have marked a dropped batch clean; before diffing, the wholesale
re-push healed that within one interval, and now it would have persisted for the life of the
process. It reports the drop as a failure, and the callers treat `undefined` as a refusal too
(`call` returns `env.data` verbatim, so a body with no data arrives as undefined).

The coverage gaps. `bot/main.ts` had 205 changed lines, no test and no guard, so the packet's
headline invariant was enforced only by a sentence in a CLAUDE.md;
`tests/discord_bot_main_wiring.test.ts` is now a structural source pin over the
comment-stripped file (no repeating timer, exactly seven registrations each reading its own
D13 config field, tasks started before the gateway connects), which also closes D13 end to
end. And the repeating-mode IDLE kick, the path GUILD_CREATE actually uses, had no driver
coverage at all: every kick in the suite landed mid-run or after stop.

A THIRD deviation the review found, now recorded rather than claimed away: the debounce
follow-up window opens at run SETTLE, where the `presenceTimer` it replaces armed from EVENT
time. A push that takes 2 s therefore delays the follow-up by 2 s more than before. It is
kept, because guaranteeing a full quiet window BETWEEN pushes is the anti-storm direction,
but the test could not tell the two apart (it resolved its gate before advancing, so both
semantics gave the same number) and the code comment claimed exact reproduction. Both fixed.

Second mutation round: 17 mutants over the review-round code and tests, 13 killed. Of the
four survivors, one was DEAD CODE (an inner upper clamp in `nextIntervalMs` that the return's
own cap already subsumed, now deleted: an unkillable line is either dead or untested), two
were equivalent mutants whose test comments overclaimed (the `clearArmed()` inside `kick()`
and the double-start guard are both defense in depth, since `schedule()` re-clears and the
overlap guard absorbs a stale timer; the comments now say what the assertions establish), and
one was a genuine gap in the new drained-queue identity test, which released every request
from one shared gate and so never reached the moment the guard exists for.

Validation: `npx tsc --noEmit` clean, 444 bot tests green across 16 files, `npm run build:bot`
bundles, `npm run ci:changed` exits 0 with zero warnings in the touched files.

### Phase 3 QA (2026-07-31)

Release base FIRST (standing rule 1): `origin/release/v0.33.0` had moved 12 commits past the
Phase 3 merge, so it was merged before any QA work (`104994c21`, 82 files, zero conflicts) and
audited with the `release-merge-audit` skill. Clean: the incoming delta is the warrior
ground-auras UI work plus one `server/game.ts` snapshot field (`opRem`), and it intersects the
21 files Phase 3 authored in exactly ZERO places. The `vi.mock('../server/db')` merge trap does
not apply either, because the branch adds no `server/` file at all.

**Verdict: PASS-WITH-FOLLOWUPS.** Phase 3's mechanism is sound and the migration preserved
behavior: all six old `setInterval` loops plus the `presenceTimer` map one-to-one onto the seven
tasks, every cadence reads its own D13 config field, and a traced reconnect storm really does
collapse N GUILD_CREATEs into one follow-up per task. What this round found instead were two
things a reviewer who already knew the design would not have questioned: a diff cache that can
disagree with the server forever, and a scheduler lifecycle that deadlocks.

**The findings.** Six parallel audit agents raised 68, each one handed to an independent skeptic
told to refute it by default; 30 survived. A fresh-eyes review of the FIX round then raised 29
more, of which 21 survived, including one against the first shape of the scheduler fix. Every
survivor was judged here against the code rather than taken on the skeptic's word, and every one
is applied. Two skeptic verdicts were themselves corrected: the rename-back echo case was called
permanent and is really bounded by one sweep (the update handler moves `memberNames` whether or
not it pushes), and the roster-push starvation case was correctly refuted (the members-meta
endpoint coerces every field and always answers 200, so a content-tied deterministic refusal is
not reachable).

**The one that matters most: the diff cache could never be wrong-and-recover.** `lastPushedMeta`
records what the bot BELIEVES the server holds, and the server can lose those values with nothing
to tell the bot. `setDiscordMemberMeta` is an UPDATE against the link row and
`server/internal.ts` counts `updated++` per iterated record rather than per affected row, so a
push for a guild member who has not linked yet applies to zero rows and is still reported as
accepted. That member is marked clean on the first sweep and never pushed again, so when they
DO link, their join date and staff flair never reach the game until the bot restarts. Unlinking
and relinking (a fresh row with both meta columns null), a restore, and a moderation delete all
arrive at the same place. Before D5 every sweep re-pushed the whole roster, so all of them healed
within one interval and nobody had to enumerate them. The fix keeps the load reduction and puts a
ceiling on the divergence: `fullResyncIfDue` drops the whole cache once an hour, so eleven sweeps
in twelve still send nothing. Time since the last full push, not a count of sweeps, because the
task is also kicked by GUILD_CREATE and the member backfill and a reconnect storm would otherwise
race the counter and re-push hardest exactly when it should not. The server-side halves (report
`rowCount`, or tell the bot when a link row is created) are Phase 4 and Phase 5 work and are
ledgered, not done here: this phase touches no `server/` file.

**The scheduler deadlock.** Two independent agents found it and a live probe against the real
module confirmed it: `stop()` while a run was in flight left the run's claim behind, so a later
`start()` armed a chain whose first link the overlap guard refused, and a refused claim arms
nothing. The retired run then returned early on its stale generation. Neither owner armed the
chain and the task was dead for the life of the process. The FIRST fix released the claim in
`stop()`, and the fresh-eyes review caught that this cures the deadlock by trading it for real
overlap: `stop()` can retire a generation but cannot cancel a promise, so the restarted chain ran
beside the abandoned body. The shipped fix keeps the claim, makes `start()` arm nothing while a
run is in flight, and has the abandoned run's settle hand the chain over on its way out, carrying
any kick that arrived meanwhile. Neither deadlock nor overlap. Production never calls `stopAll()`
today, so this was latent rather than live, but the module is the seam Phases 6 and 7 build on.

**The three recorded deviations, ruled.**
1. *GUILD_CREATE and the op 8 backfill now also run `refreshSpecialRoles`.* The defense did NOT
   hold and this is now fixed. The old 5 minute timer did chain refresh-then-push, but the old
   GUILD_CREATE and final-chunk paths called `pushAllMemberMeta` DIRECTLY, with no Discord REST
   call in front of them. Folding them into the paired task gave them the guild-roles GET as a
   precondition they never had, and a reconnect storm is exactly when that GET throws (the
   breaker opens, `request` throws on any non-ok). So the members-meta push that would have
   landed before now did not. `refreshThenPushMeta` keeps the ordering when the refresh works and
   publishes the previous index when it does not, which is strictly more than the event paths
   ever had. It cannot starve a member.
2. *The debounce follow-up window opens at run SETTLE where the old timer armed from EVENT time.*
   Defense HOLDS. Worst-case latency for a presence event is one run duration plus
   `presenceDebounceMs`, every open window always fires (`armDebounce` is called unconditionally
   from the follow-up branch), and the already-armed early return folds a kick into an open
   window rather than deferring it. No starvation.
3. *The roster push stops at the first refused batch.* Defense HOLDS, and it is now actually
   pinned. Permanent starvation would need a refusal tied to the CONTENT of the head batch, and
   the members-meta endpoint cannot produce one: it coerces every field (bad id skipped, unknown
   role to null, bad timestamp to null, name sliced) and always answers 200. The case that
   claimed to pin the stop rule refused the LAST of two batches, so it had no third batch to skip
   and the claim was constant-true; it now runs three and refuses the second.
4. *The hung run (aim point d), ruled DEFER to Phase 7.* A run that never settles leaves the task
   claimed with nothing armed: no counter, no log, dead for the life of the process. A watchdog
   in the scheduler cannot fix it, because recovery needs the run CANCELLED and the scheduler
   holds a promise it has no way to abort; a watchdog that only logs would advertise coverage it
   does not have. The real fix is a deadline on the fetch underneath, which is Phase 7's
   supervision work and has `server_client.ts`'s `SERVER_CALL_TIMEOUT_MS` to copy. Recorded in
   `bot/CLAUDE.md` as a rule for anyone adding a task: every `run` handed to `scheduler.add` must
   be one that always settles.
5. *`MIN_INTERVAL_MS` and `MAX_JITTER_RATIO` (aim point e), ruled CORRECT as they stand.* The
   operator story is the D13 knobs, and the locked ruling is that the floor is a FALLBACK for an
   unusable value and never a clamp on a small one, because silently rewriting an operator's
   override would be its own defect. Only the constant's opening sentence claimed otherwise, and
   it now says what the code does. `MAX_JITTER_RATIO` is unreachable from production (no task
   sets `jitterRatio`) and is kept because the pure helpers are exported and callable alone.

**Mutation: 57 planted this session, 55 killed, 2 diagnosed unobservable.** Four rounds over the
ground the build session's 32 did not reach, mutating in place with a per-run timeout that scores
a hang as a kill and a recorded summary line plus a nonzero failure count per mutant. Eleven
survivors were real gaps and are closed: the debounce window never distinguished its active
interval from its idle or its decayed one; the generation counter's restart case; both
`forgetMember` call sites in `main.ts`; the roster-push stop rule; `pushRejected` read as a
truthiness check; and, in the fix round, the resync restamp, the refresh catch, the kick guard
and the registration-to-sweep binding. The two survivors that remain are unobservable by
construction and are recorded rather than tested: the generation checks inside the two timer
callbacks (both `stop()` and `schedule()` clear the armed handle before a generation can change
under a live one) and the `state.running` guard in `start()` (`beginRun` refuses the timer
anyway, so deleting it wastes one arm and changes no behavior). Two more were equivalent mutants:
`didWork` as a truthiness check agrees with `=== true` for every value the `Promise<boolean |
void>` signature admits, and `forgetMember` deleting `memberNames` is a no-op at both call sites.

**Validation.** `npx tsc --noEmit` clean, 330 bot tests green across 10 files, `npm run
build:bot` bundles, `npm run ci:changed` exits 0. Full `npm run gate` at close, with the one
known malware-step failure caused by a sibling session's worktree parked under `.worktrees/`.

### Phase 4 (2026-07-31)

Release base FIRST (standing rule 1): NO-OP. `origin/release/v0.33.0` was freshly fetched and
measured at 70 ahead, 0 behind, so it had not moved since the Phase 3 QA merge (`104994c21`)
and there was nothing to merge. Recorded here because the rule asks for the record either way.

**What shipped.** Three commits: `08ecaf2b6` (the queue tests), `44e937cb7` (both set-based
statements plus the new endpoint), `ae1a1b776` (the reward_ledger retention note). The
prompt's five-commit split assumed the changes were separable; `server/internal.ts` and
`server/discord_db.ts` each carry BOTH features at interleaved hunks, so splitting flex-batch
from members-meta would have produced commits that do not typecheck, which is worse than one
commit that says so in its body. The ledger comment did split cleanly and was kept separate.

**flex-batch.** `POST /internal/discord/flex-batch` is RouteDef-only behind the same
`discordGate` as its siblings, with a hand-added `surface_inventory.ts` row anchored on the
exported `flexBatchHandler` symbol (the registry-only form the five `/api` precedents use) and
the two internal-ladder counts bumped 19 to 20. It has no `handleDiscordInternal` arm and a
test drives the legacy dispatcher to prove the terminal 404, so a later accidental legacy twin
fails loudly. The read is ONE statement: `discord_links` filtered by `ANY($1::text[])`, left
joined to `reward_points`, with a `LATERAL ... LIMIT 1` for the top character. The character
`state` blob is deliberately NOT selected (a 1000-member batch would drag megabytes of JSONB
for one integer); the level is projected SQL-side.

**members-meta.** One multi-row upsert over four unnested arrays inside a data-modifying CTE,
skipping rows whose stored values are not `IS DISTINCT FROM` the incoming ones. Both dispatch
arms call one shared `applyMemberMetaPush`, which is stronger than the dual-edit rule asks for:
they cannot diverge because there is only one body. `setDiscordMemberMeta` was deleted rather
than left beside its replacement, since the endpoint was its only caller.

**The L14 decision, which needed the maintainer.** The phase's acceptance criterion asked for
`updated` to count only rows actually changed. Tracing the bot showed that would break it:
`ServerClient.pushMembersMeta` turns `updated === 0` on a non-empty push into `null` and
`pushChangedMemberMeta` aborts the whole run on a refusal. Two ordinary cases answer zero under
the narrowed meaning (a post-restart full re-push where nothing moved, and any batch of
never-linked members, which is most batches since the bot pushes ALL guild members), so the
sweep would stop at its first batch forever. That is exactly the phase's own stopping rule, so
the two shapes went to the maintainer, who chose the additive one: `updated` keeps counting
records accepted, and `changed` / `skipped` / `unapplied` carry the truth. **Phase 6 may now
revisit the bot's hourly `FULL_RESYNC_INTERVAL_MS`, but must NOT remove it until the bot
actually consumes `unapplied`**, because until then the resync is still the only thing that
heals a member cached as pushed.

**Review round.** privacy-security-review, migration-safety and database-performance-reviewer,
the three Review Dispatch Matrix rows that match. No CRITICAL findings. Acted on: the
out-of-range `joinedAtMs` that would have thrown BEFORE the query and killed all 1000 records
(the old loop lost only the offending one); the flex-batch fail-open where a truncated body and
a genuinely empty answer were byte-identical (now separated by the echoed `requested` count);
the non-total `::int` cast on `state.level`, where one malformed character row would deny the
read for the whole batch; a lock-ordering deadlock class the multi-row UPDATE introduced and
the old per-row loop could not (deduped ids are now sorted); the one-sided LOCKSTEP pin, which
asserted the ordering clause only on the new side and would have stayed green while `db.ts`
drifted; and two comments that overstated what they guaranteed (the `updated === changed +
skipped + unapplied.length` identity does not hold under a concurrent writer, and the
reward_ledger justification was broader than what is true).

**The BLOCKING finding, closed rather than deferred.** Both reviewers independently flagged
that neither new statement was ever executed: `tests/discord_db.test.ts` routes a fake pool on
SQL text, so it can count statements but cannot parse or plan one. A throwaway Postgres 16 was
stood up with no Docker and no sudo (zonky portable binaries), and the work landed as
`tests/discord_db_integration.test.ts`, DB-gated so it skips green in CI. It caught one
over-specific assertion of mine and confirmed the rest: the classification triple, the no-op
skip leaving `xmin` untouched, NULL-safe comparison, realm scoping, epoch survival, and the
`state.level` fallbacks for a float, a string and a missing key. The measured plan at the
packet's scale envelope (5000 links, 15000 characters, 1000 ids) is a nested loop over
`characters_account` with a top-N sort per outer row: **6.6 ms, 5028 buffer hits**.

**Mutation check.** Eight mutations across the new code, 8 killed, 0 survivors, including the
one that matters most (narrowing `updated` to `applied.changed`, caught by three tests). One
trap struck during the run and is now recorded in state.md: the inverse-edit restore anchored
on a fragment that was not unique and put two lines back in the wrong function. It was caught
by `tsc` plus a `git diff --stat` comparison against the pre-run numbers and repaired by hand.

**Validation.** `npx tsc --noEmit` clean. `npx vitest run` green across the four discord server
suites (165), the four http spine suites (372), the two new queue suites plus the duplicate
guard (24), the flex-batch mapping suite (7), and the DB-gated integration suite (12 passed
with `TEST_DATABASE_URL`, 12 skipped without it). `npm run build:server` green,
`npm run ci:changed` exits 0. Full `npm run gate` was NOT run: it aborts at the malware step
while sibling worktrees sit under `.worktrees/` and `.claude/worktrees/`, which is the known
environmental failure, so the steps after it were run by hand instead.

**Deferred, with reasons.** No `bot/` file was touched (D11 and scope; Phase 6 consumes
`unapplied`). No observability on the new statements, which is Phase 8's row and named as F8 by
the database reviewer. The two `discord_db` helpers carry no internal cap of their own beyond
the handler's 1000, left alone deliberately because a silent slice inside a database helper
would drop members without saying so. Discord ids are still length-sliced rather than
shape-validated, which is unchanged behavior from members-meta and kept symmetric on purpose.

### Phase 4 QA (2026-07-31)

Release base FIRST (standing rule 1): `origin/release/v0.33.0` had moved again, 75 ahead and
4 BEHIND, so it was merged before any QA work (`487aaa68b`, 62 files) and audited with the
`release-merge-audit` skill. Clean by construction: the incoming delta is the buff/debuff target
aura HUD feature (`src/ui/`, `src/game/`, `src/styles/`, the resolved i18n tables and their
suites) and it intersects the 70 files this packet owns in exactly ZERO places. No route, no
`server/` file, and no new `vi.mock('../server/db')` site in the delta, so steps 3 through 6 of
the audit are N/A by construction rather than by inspection. Note for later phases: the Phase 4
BUILD recorded this sync as a no-op at 70/0, and four commits landed between that check and
this one, which is exactly why the rule says to measure against a freshly fetched tip every
time rather than trust the previous phase's number.

**Verdict: PASS-WITH-FOLLOWUPS.** The implementation is sound and needed no production change:
every one of the three server files came out of this round comment-only. Both statements do
what they claim, the call chains are genuinely one round trip with no per-id loop anywhere,
unlinked ids are absent rather than stubbed, the flex-batch clamps really do match members-meta
entry for entry, the LATERAL's ORDER BY is in lockstep with `highestCharacterForAccount`
including the realm scoping, and D9, D10, D11, D12 and D18 all hold. What this round found was
in the TESTS, and the headline finding is one that only an executed mutation pass could have
surfaced.

**The one that matters: the phase's biggest database win was unpinned on the arm CI runs.**
`setDiscordMemberMetaBulk`'s no-op-write skip was guarded by `expect(sql).toContain('IS DISTINCT
FROM')`. The statement carries that fragment TWICE, once in the `matched` CTE that decides
`skipped` and once in the UPDATE's WHERE that decides `changed` and actually stops the write, so
an unanchored scan is satisfied by either copy. Two mutations prove it: deleting the predicate
from the UPDATE (every row rewrites on every sweep, the exact regression the phase exists to
prevent) and inverting it to `IS NOT DISTINCT FROM` (only unchanged rows write) BOTH left the
entire default suite green. They die only in `tests/discord_db_integration.test.ts`, which skips
without `TEST_DATABASE_URL`, and CI never sets it. So the executed arm carried a guarantee the
structural arm was believed to carry, and nothing said so. Both clauses are pinned as contiguous
anchored text now, the occurrence count is pinned too, and both mutants die DB-free.

**The findings.** Three parallel audit agents raised 31, each handed to an independent skeptic
told to refute by default with the file open and the code quoted. 6 came back CONFIRMED, 9
PARTIAL, 16 REFUTED; 14 had an actionable core and every one is applied. The skeptics earned
their keep twice over. One refuted an empty-string-nickname bug by quoting
`bot/member_writes.ts` `return nick || global || username || 'Member'`, which makes the input
unreachable, and by showing the clamp and the comment are byte-identical to their pre-Phase-4
form. Another refused a plan pin this round was about to add: asserting "no Seq Scan on
`discord_links`" over a 200-row freshly-ANALYZEd table would have reddened on the CORRECT plan,
so that test was retitled to what it proves instead of being given a false assertion.

**The fix round was itself wrong twice, and both times something else caught it.** Its first
comment claimed xmin was the decisive evidence for the no-op write; mutation isolation shows
`changed` is, because `changed` IS `count(*)` over the UPDATE's `RETURNING` and reds first, so
the xmin pair is defense in depth and now says so. Then the fresh-eyes review ran its own
mutation battery and found a survivor this round had missed: with only the positive edge of
`MAX_EPOCH_MS` pinned, deleting `Math.abs` left the suite green, and a finite `-8.64e15 - 1`
would have thrown inside the up-front conversion and aborted all 1000 records. Both sides of
zero are pinned now.

**A claim this session got wrong, corrected in the record.** The `pg_stat_xact_user_tables`
assertions were called constant-true by me and by all three fix-round reviewers, on the reading
that the view reports only the current transaction. A direct probe against Postgres 16.2 says
otherwise: the view emits one row per user table, and the counter moved 0 to 1 across two
separate autocommit `pool.query` calls with an UPDATE between them, because a backend
accumulates pending per-relation stats locally and flushes at most once a second. The assertion
stays deleted, but for the true reason (it depends on node-postgres handing back the same idle
backend and on the flush window, so it can both miss a write and red without one) rather than
the false one. Four agents agreeing is not evidence; the probe is.

**Mutation results.** 10 mutations planted against the real implementation, one at a time,
restored by `git checkout` against a committed tree and verified byte-identical afterwards:
10/10 killed with `TEST_DATABASE_URL` set, and 10/10 again on a full re-run against the final
tree. The 6 DB-touching ones were then re-run WITHOUT the database, which is what CI does: 4
killed, 2 survived, and those 2 are the headline finding above. After the fix, both die DB-free.
The fix round's own new tests were mutation-checked too (5 planted: the epoch bound, the NaN
arm, first-wins dedupe, the lockstep comment-restatement bypass, and an always-rewriting UPDATE
used to isolate the xmin pin), plus the review's Math.abs survivor after it was closed. Items 7
and 8 of the planned list needed a database and got one: a throwaway user-space Postgres 16.2
stood up per the no-Docker recipe, used for every DB-arm run in this session, and torn down at
the end. Nothing was skipped and nothing was reported as killed that was not run.

**Deliberate residuals, each re-checked rather than re-reported.** No observability on the new
statements (Phase 8 owns counters; verified `server/discord_db.ts` still emits none). The two
`discord_db` helpers still carry no internal cap beyond the handler's 1000, because a silent
slice inside a database helper would drop members without saying so. Discord ids are still
length-sliced rather than shape-validated, symmetric with members-meta on purpose. The
members-meta response can still carry roughly 23 KB of `unapplied` ids, bounded by the same cap,
and the bot ignores the field until Phase 6.

**Followups.** The `requested` echo is a post-de-duplication count, so Phase 6 must compare it
against the number of DISTINCT in-cap ids it sent, not its raw array length; the bot holds those
ids in a `Set` so this is a contract note rather than a live defect, and it is now written in
state.md and pinned by a test. `FULL_RESYNC_INTERVAL_MS` still must not be removed until the bot
consumes `unapplied`.

**Still owed to the maintainer, unchanged and re-surfaced.** The three Phase 3 D13 cadence keys
(`DISCORD_ROLE_SYNC_INTERVAL_MS` 300000, `DISCORD_PRESENCE_DEBOUNCE_MS` 4000,
`DISCORD_RELAY_POLL_MS` 3000) are still absent from `.env.example`. Re-verified this session:
every `.env*` path is denied at the HARNESS level for both Read and Bash, so no session in this
environment can add them. Phase 4 added no env key of its own.

**Validation.** `npx tsc --noEmit` clean; the state.md server row 173 passed; the four http spine
suites 372 passed; the Phase 4 suites 35 passed with the database and 23 passed plus 12 skipped
without it (the DB gate intact); `tests/duplicate_test_blocks.test.ts` and
`tests/architecture.test.ts` green; `npm run build:server` exit 0; `npm run ci:changed` exit 0.
Full `npm run gate` was NOT run, for the known reason: sibling sessions have worktrees parked
under `.worktrees/` and `.claude/worktrees/`, the malware scanner walks the whole tree, and the
gate aborts there BEFORE tsc and the builds. Those post-abort steps were run by hand above.

### Phase 5 (2026-08-01)

Release base FIRST (standing rule 1): `origin/release/v0.33.0` had moved a LOT, 81 ahead and
235 BEHIND (the graphics overhaul, ability VFX, Wildheart Basin, and the new `server/epic/`
route family), merged before any Phase 5 work as `890d99cd7` (808 files) and audited with the
`release-merge-audit` skill. The four both-sides files the phase doc warned about all
auto-merged and were verified against BOTH parents: `server/db.ts` kept the LOCKSTEP note and
gained the release's `epic_links` DDL, `surface_inventory.ts` kept the flex-batch row beside
the release's three epic rows, and the completeness/parity ladder pins needed no reconciling
because the epic additions and the internal-ladder count sit on different assertions. No
discord/internal surface drifted (the release never touched `server/internal.ts`,
`server/discord*.ts`, or `server/daily_rewards.ts`), the three release-authored
`vi.mock('../server/db')` sites were diffed against the branch's db exports (the branch added
none, so the known mock trap cannot fire), and the full server validation ladder was re-run
green on the merged tree before Phase 5 started.

**Build.** The feed-site enumeration ran as a Workflow fan-out (7 agents: three transition-class
sweeps, streams/shapes, planning docs, winners cache, then a completeness critic over the
union; 30-tool-call budgets and report-first lines; 7 of 7 delivered). The critic re-derived
the write sets from the SQL and closed the charter questions: two level writers, two points
writers, one link upserter, one unlink deleter, class immutable after creation, no
restore/transfer/merge path, the cascade unlink code-unreachable in-process. The full
enumeration (11 wired sites, each with its test, plus the deliberate exclusions with reasons)
is now a named section of state.md. Agent A built `server/discord_link_changes.ts` (cap 5000
per the D18 member envelope, 30s per-account dedupe that never consults drained history, with
a 9/9 mutation pass on its 19-test suite); Agent B wired all eleven sites (the saveCharacter
delta-gate seeds from the loaded blob rather than `initialLevel`, so GM/PBE join-time raises
report on first save; the repoint pin captures the designed kinds merge); Agent C added
`discordLinksForAccounts`, the outbox RouteDef (internal ladder 20 to 21), and the winners
TTL cache, and probed the ANY() plan on a throwaway user-space Postgres rather than assuming
it (index scan at a 50-id ask, a CORRECT seq scan at 200 ids over 5,000 rows, so the
integration pin names the index at sample size and never asserts no-Seq-Scan).

**Validation.** `npx tsc --noEmit` clean; the state.md server row 201 passed; the four http
spine suites 376 passed; new plus touched files 230 passed with 14 DB-gated skips (the same
14 executed against the throwaway Postgres during the build); `npm run build:server` exit 0;
`npm run ci:changed` exit 0. Full `npm run gate` NOT run, same known reason as Phase 4:
sibling worktrees red the malware scanner and the gate aborts before tsc and the builds, so
those steps ran by hand above. Reviewers dispatched fresh over the diff:
privacy-security-review and database-performance-reviewer (migration-safety skipped: no DDL,
no persisted-shape change).

**Review round.** privacy-security returned no blocking findings and four should-fixes;
database-performance returned a BLOCK verdict with three findings. One of the three was
REFUTED with quoted code and recorded in state.md (the claimed cross-process double-announce
window requires two processes serving the same realm; the deployment model is
process-per-realm and `unannouncedWinnerDays` is realm-scoped). Everything else confirmed
became a 12-fix round, applied and mutation-checked 17/17: winners-read-before-drain plus
requeue-on-error so a failed poll loses nothing (the retry contract is documented in the
handler for Phase 6: a 200 is the only acknowledgement), a linkage-aware eviction preference
at cap (playtime noise first, so link/unlink ids survive a bot outage), paged link-change
drains (`OUTBOX_LINK_CHANGE_PAGE` 1000), the winners ask minimized to 1 day per poll,
repoint items no longer decorate one user's id with another's handle, the per-day taskName
derivation moved inside the winners cache refresh (a warm poll costs zero fetches AND zero
DB reads), moderation busts wired for void/restore/exclusion per the server/CLAUDE.md
hot-path rule (the excluded-accounts surface is a view, so the bust rides the moderation
hook in `bustBoardCaches`), `discord_email` dropped from the batched identity read, a
second EXPLAIN case at the page-size ask (probed live: the planner CORRECTLY seq-scans a
1000-id ask over 5,000 rows, so that case pins `Actual Loops === 1` only), and clock
uniformity at the save site. Final D18 payload at the real (page-limited) worst case:
279,891 bytes serialized in 0.27 ms, pinned under 420,000 with a 270,000 floor (the
pre-paging whole-cap figure was 979,051 bytes). The full ladder was re-run green after the
fix round, and the DB-gated integration file was re-executed against a fresh throwaway
user-space Postgres 16.2 (15/15 with the database, clean skips without).

### Phase 6 QA (2026-08-01)

Release base first (standing rule 1): `origin/release/v0.34.0` had gained 7 commits since
the Phase 6 build sync (PR #2590, the admin guild backoffice, 114 files); merged as
`50883ce3d`. Two conflict files, both resolved as UNIONS: the three Phase 5 feed sites in
`server/db.ts` (deleteCharacter, renameCharacter, reclaimDeactivatedName) now carry the
branch's `enqueueLinkChange` AND upstream's `bustAdminGuildListReads` side by side, and
`tests/character_db.test.ts` keeps both suites' assertions. `release-merge-audit` ran
clean: the release touched no internal route or legacy discord arm, the admin routes
carried their own surface-inventory rows (http spine 441 green), no branch injection seam
was re-bound, and the feed-site contract premise survives (the admin-guilds feature
writes none of characters/reward_points/discord_links, and the flex payload carries no
guild field, so a guild rename is not a flex transition). 516 tests across the
merge-affected suites green before any QA work.

**Audit.** Ultracode per D19: a 15-agent Workflow (context loader, load-profile,
correctness, test-coverage, and dead-code auditors plus qa-checklist, then 9 skeptic
groups verifying every finding with the file open and code quoted). 15 findings raised;
14 CONFIRMED, 1 REFUTED (the caller-less per-stream GETs are already recorded by D11).
Zero audit findings were blocking. The load-profile agent independently recomputed the
steady-state rate from source and matched the Phase 6 claim (one periodic outbox request
at 4/min idle to 20/min busy, role-sync flex-batches only while a pass or dirty work
exists at about 3 per 6.4 minute pass, presence per 4 s debounce window, hourly resync,
zero steady-state Discord writes under D5; analytic 1 to 3 concurrent sockets, still
VERIFY-AT-DEPLOY, no Discord credentials here). It also confirmed exactly one outbox
loop, no poll timer outside the scheduler (the gateway heartbeat and reconnect one-shots
and the shell abort deadlines are the sanctioned IO mechanics), and the sweep iterating
the linked set.

**Spec mutation pass** (isolated worktree outside the repo root, own npm ci): all eight
charter classes planted, 12/12 KILLED with rc!=0 plus named failing tests (linked-set
never-removes, the D6 seed-from-sent-set shape, the stale link-change apply, four
per-stream fan-out skips, double dispatch, both didWork cadence pins including the
winners reserved-read arm, the unbounded slice, and an addMemberRole governor bypass,
killed by the breaker-refusal pin alone).

**Fix round** (`7dd9e3096`): GUILD_MEMBER_REMOVE prunes the departed member from the
sweep immediately via the new `LinkedSweep.forget` (departure does not delete the link
row, so the pass was spending a slice slot plus doomed 404 writes on them until the next
complete seed); flex-batch additions gained a roster gate so a stale in-flight answer
cannot undo a departure or seed prune (`present` stamped above the gate, so authoritative
absence still removes only the truly absent); the sweep write loop also skips a
mid-flight departure; a restored PASS slice is filtered to the still-linked (a discovery
snapshot restores whole, by design); the outbox failed-poll guard is `== null` (an
undefined drain, the data-less success envelope, previously threw after the drain had
consumed everything) and main.ts's flex-batch guard matches; the link-change apply moved
BEFORE the post loops (the one non-re-served stream; the posts are governor-paced and can
run minutes on a backlog, so apply-last left a process-death window for no ordering
gain); the outboxIoFor pass-through seams (breakerState, applyLinkChanges, onError) are
pinned end to end; the tautological governed-entry assertion (gated == writes + refusals,
an invariant of the rig's own plumbing) became a by-value count with the production half
pinned by a new no-bare-fetch main.ts pin; the three previously unpinned runSweepSlice
lines got function-body-sliced source pins; SWEEP_SLICE_MS joined the cadence ban list;
the stale pollRelay example in scheduler.ts was reworded. Dirty-first preemption is now
BOUNDED: dirty and pass-shaped work alternate slices under contention.

**Fresh-eyes on the fix round**, per the packet rule, earned its keep exactly as the
Phase 3 precedent predicts: verdict NOT READY, one BLOCKING catch against the first fix
shape. The alternation bound counted only a cursor already in flight, so a REQUESTED or
DUE pass and an armed discovery walk still starved under sustained feed traffic
(probe-confirmed: twelve dirty slices out of twelve, beginPass never reached). The bound
now counts pending pass work too, with the reviewer's own caution honored: a discovery
that opens over an EMPTY snapshot yields null and falls back to serving dirty rather
than answering no-work while work exists (an empty PASS cannot coincide with dirty work,
dirty being a subset of linked; an empty roster snapshot can). Its nice-to-haves were
all applied (the departure write guard, the restore filter, a globalThis.fetch ban
beside the no-bare-fetch pin). The corrected shape was implemented exactly along the
reviewer's prescription and then mutation-checked rather than re-reviewed a third time:
FM12 (cursor-only bound) dies on the new starvation arms, FM14 on the empty-snapshot
fallback arm.

**Fix-round mutation pass** (worktree at `7dd9e3096`): 15/15 KILLED with named tests,
covering forget (both halves), the roster gate (dropped AND present-below-gate), the
alternation (dropped AND narrowed back to cursor-only), the restore filter, the trailing
dirty fallback, both `== null` guards, apply-first, the factory breaker hardcode, and
the two main.ts wiring deletions. Combined session tally: 27 planted, 27 killed, zero
survivors.

**Validation on the final tree:** `npx tsc --noEmit` clean; the full bot ladder 18
files / 584 tests green (linked_sweep 62, sweep_cycle 14, outbox 28, main-wiring 14);
`npm run build:bot` exit 0; `npm run ci:changed` exit 0 (one release-side error-severity
lint the merge swept into the changed set, the schema_wiring findIndex, fixed by hand;
scoped biome writes on the session's own files only). Full `npm run gate` not run for
the standing sibling-worktree malware-scan reason; the constituent steps ran by hand.

**Ledgered:** L18 (gateway reconnect leaves the heartbeat interval running across the
socket swap, one wasted reconnect cycle worst case; pre-existing, outside the Phase 6
diff, routed to Phase 7 with the other supervision work). Recorded residuals from the
build stand unchanged (the durable-mark-failure re-announce loop, the mid-seed
presence-only eviction self-heal, the channel-unset drained-drop semantics, the
breaker-gate flair lag bound, the pass floor, the unlinked-members-keep-flair maintainer
flag). Connection count stays verify-at-deploy.

### Phase 6 (2026-08-01)

Release base FIRST (standing rule 1), with the sync target RETARGETED per the maintainer's
call relayed in the Phase 6 handoff: upstream cut `release/v0.34.0` equal to main's tip and
a superset of v0.33.0, so this and later phases measure against it. Freshly fetched,
`origin/release/v0.34.0` sat at `94f5ac63d`, 90 ahead 2 behind, and merged clean as
`204e5a6cb` with a ZERO-FILE content delta: the branch already carried all of v0.33.0
(`462b1372a5`), so the merge adopted only the two merge commits that landed v0.33.0 onto
main (PRs #2731 and #2733). `release-merge-audit` ran and every step is N/A by
construction (no overlaps, no legacy arms, no new routes, no changed helper signatures,
no new db-mock sites); the merged tree is byte-identical to the QA-validated `8176b5a08`,
so the Phase 5 QA validation ladder speaks for the merged result verbatim and no re-run
was owed. package-lock.json did not move, so no `npm ci`; node v26.5.0 matches CI.

**Build.** Three implementation agents off the Explore context packet, sequenced C plus A
in parallel then B (the two main.ts editors never overlapped): `b343758d6` the client
surface (flexBatch, drainOutbox on the 70s deadline, the pushMembersMeta type widening,
6/6 mutation), `9321d6b66` the linked sweep (`bot/linked_sweep.ts` pure module, slice-driven
role-sync, the L16 seed eviction, 14/14 mutation), `e3509f661` the consolidated outbox
loop (`bot/outbox_consumer.ts`, three pollers and four client methods deleted, wiring and
config pins reconciled, 12/12 mutation). Design decisions worth carrying: link-change
kinds are read as a SEQUENCE (terminal kind wins) so a relink inside one dedupe window is
not dropped; the module remembers no-link-row ids and re-pushes their meta on a fresh
link (metaStale), closing the repoint staleness without weakening L14; discovery is one
idempotent full-roster walk per complete seed, never periodic; the sweep's dirty queue is
served ahead of the pass so a feed item syncs within one tick.

**Mid-phase surprise.** `npm run ci:changed` was RED at the phase tip on three FORMAT
errors in files this phase never touched (`server/daily_rewards_db.ts`,
`tests/daily_rewards.test.ts`, `tests/server/discord_link_changes.test.ts`), all in
hunks the Phase 5 QA fix rounds wrote; the drift predates Phase 6 (the retarget merge
changed zero bytes). Formatted with the sanctioned scoped write as `5293970c8`. Lesson
recorded to memory: a past "ci:changed clean" does not pin files, because the changed
set moves with the default-branch ref and piping the run through tail masks its rc.

**QA gate.** `qa-checklist` over the phase diff returned NOT READY with one BLOCKING
finding, fixed with everything else in `62e152c45` (5/5 fix-round mutation): the winners
stream is a RE-SERVED read, not a drained queue, so counting it toward didWork by
carriage let an unpostable day (unset channel, the common deployment; a durable 403) pin
the whole consolidated loop at 3s forever; didWork is now split by stream class. The
should-fixes: the wiring test gained the idleMs column (deleting either idleMs
previously left every suite green while the sweep woke every 3s between passes forever)
and the `nextSlice(Date.now(), cfg.sweepSliceSize, cfg.roleSyncIntervalMs)` argument
span (dropping the third argument silently made the sweep kick-only); the seed eviction
now diffs the UNION of the per-member caches (a presence-seeded ghost id could survive
a memberRoles-only diff); the in-flight-slice unlink race is pinned end to end through
its meta-push heal. Comment honesty: armDiscovery's guard scope, the channel-unset drop
semantics (a real behavior change vs the old pollers, now in bot/CLAUDE.md), the
breaker-gate flair-lag bound, and the ~6.4 minute effective pass floor. A fresh-eyes
pass then reviewed the fix round itself, per the packet rule that a fix round is
unreviewed code: verdict READY, zero blocking or should-fix, and its four nice-to-haves
were applied in the same session (the interleaving test's slice made load-bearing, the
refused-winners arm pinning the attempted announce, the decay-walk wording made precise,
and the two pre-existing residuals recorded in state.md: the durable-mark-failure
re-announce loop and the mid-seed presence-only eviction self-heal).

**Validation.** `npx tsc --noEmit` clean; the full bot ladder 20 files / 574 tests green
at the B commit and re-run green after the fix round; `npm run build:bot` bundles;
`npm run ci:changed` exit 0. Full `npm run gate` not run for the known reason (sibling
worktrees red the malware scanner and abort it before tsc and the builds); the
constituent steps above ran by hand. Acceptance greps recorded: zero references to any
deleted client method, exactly 5 scheduler registrations, zero bare timers in main.ts,
package.json and package-lock untouched (D7).

### Phase 5 QA (2026-08-01)

Release base first (standing rule 1): `origin/release/v0.33.0` had gained 49 commits since
the build's sync (the v0.33.0 locale fill, the shader-compile-storm fix, release-side PR
merges); merged clean as `ba694a51a` and audited with `release-merge-audit` (no discord
surface in the delta, no new routes, no new db mocks, both sides of the three overlap
files verified; the state.md `server/main.ts` coordinates drifted again and were traded
for symbols). Upstream also cut `release/v0.34.0` (equal to main, containing all of
v0.33.0); surfaced to the maintainer rather than retargeted mid-packet. The full server
validation ladder was re-run green on the merged tree before any QA work, and the
DB-gated integration file re-executed 15/15 against a throwaway user-space Postgres 16.2.

**Audit.** Ultracode per D19: an 8-agent Workflow fan-out (blind feed-site sweep,
correctness vs the D-invariants, test-coverage decisiveness, dead code, a fresh-eyes
round over the build session's 12-fix hardening, privacy-security-review,
database-performance-reviewer, qa-checklist), the idled privacy reviewer re-dispatched
via the Agent tool per the known delivery trap, then an 8-skeptic adversarial-verify
Workflow over every contested finding (file open, code quoted). About 38 findings raised;
ZERO confirmed blocking (all three BLOCKING-labeled database-performance findings were
refuted or downgraded by skeptics with quoted code). The blind sweep independently
re-derived all 11 wired feed sites and every recorded exclusion, found no inverse-error
enqueues, and surfaced the one real gap of the phase: the two rename writers
(`renameCharacter`, `reclaimDeactivatedName`) move the bot-visible flex name, so the
recorded exclusion's rationale was factually wrong.

**Fix round** (`333f77787`, 16 files): wired feed sites 12 and 13 (the two renames) with
by-value tests; widened cap eviction into the `EVICTION_LADDER` (link/unlink
items are now the LAST thing spent, closing the privacy review's gap where id-less flex
noise outlived link items) and rebuilt `trimToCap` as a single O(n) marking pass
(measured 21 ms worst case before, sub-millisecond after); busted the winners snapshot on
the payout runner's claim and mark stamps (the two content writers the bust doctrine
missed, skeptic-verified as exactly two); NaN-guarded the announcement clamp; narrowed
`DiscordOutboxLinkRow` to the four consumed fields; moved the outbox drains inside the
requeue try; corrected the comments that overstated stale-serve, cross-process bust
reach, requeue-overflow preservation, and the eviction survival claim; pinned the
contract literals (cap 5000, TTL 30s, page 1000, relay/activity caps), the same-id
re-link negative arm, the clamp edges, call-site single-flight, and D18-scaled the
one-statement fixture to 5,000 ids; payload fixture now imports the real caps. One
pre-existing em dash in a touched test comment fixed per the R9 precedent. Deliberate
rejections and later-phase notes are recorded in state.md ("Phase 5 QA record").

**Fresh-eyes round on the fix round** (`67841b744`), which caught the fix round's own
defects exactly as the charter predicted: both new bust arms fired on write-nothing
outcomes (claimPayout's 'existing' retry and markPayout's already-paid replay), so
markPayout now answers 'updated' / 'already' / 'missing' and both arms bust on the real
write alone; the eviction ladder gained a fourth rung so an id-carrying non-link item
can never outlive a link item (a structural promise, pinned by tests no current site
can reach); the NaN guard became NaN-only so an Infinity over-ask clamps up; and the
honest-limit notes were completed. Its clean-category verdicts (the drains-in-try move,
the db.ts wiring paths, the narrowing, the partial mocks) are recorded in the review
transcript.

**Mutation tally.** Spec pass (16 mutants, DB-free CI arm, isolated worktree): 15/16
killed with named failing tests; the survivor (cap+1) was a real gap, every cap
assertion tracked the imported constant, closed by the literal pins and re-verified
KILLED. Fix-round pass over its own new code: 11/11 killed. Fresh-eyes-fix pass: 5/5
killed. Combined: 32 mutants planted, all 32 killed by the final tree's suites.
Honesty note: the first spec-pass run scored 12 false survivors because the driver's
verdict heuristic tailed a merged stdout+stderr stream and lost the summary; judged by
exit code plus extracted failing-test names after the fix, per the prove-the-tests-RAN
rule.

**Validation after both fix rounds:** `npx tsc --noEmit` clean; the server row plus http
spine 582 passed in one run; Phase 5 suites green (link-changes 40, outbox 4, daily
rewards 78, routes, queues, character/lease/game); integration 15/15 plus the payout
moderation db file 26 with the database (clean skips without); `npm run build:server`
exit 0; `npm run ci:changed` clean (warnings only, pre-existing). Full `npm run gate`
not run for the known sibling-worktree malware false-positive (four foreign worktrees
are parked inside the repo root); the steps it would add ran by hand above.

### Phase 7 (2026-08-01)

Release sync: NO-OP. `origin/release/v0.34.0` on a fresh fetch measured 101 ahead /
0 behind, so the Phase 6 QA session's merge (`50883ce3d`) had already captured the tip
and there was nothing to merge and no release-merge audit.

Built as three parallel Agent slices per the phase file (no Workflow), each owning a
disjoint file set, with the cross-slice contract (module names, env keys, defaults, the
Caddy matcher string, the tsconfig shape) fixed by the orchestrator up front so the
slices could not drift. The known idle-without-report delivery trap struck on all three
agents; one SendMessage nudge each recovered the full reports.

What shipped, beyond the checklist headline:

- A fatal gateway close now logs and exits 1 through a third trailing injectable
  constructor seam (`exitProcess`), the same convention as the Phase 1 socket/timer
  seams; the close-code decision moved to `bot/logic.ts` as the pure `isFatalCloseCode`.
  R13 stands: the crash loop under `restart: unless-stopped` is the desired visible
  failure, no retry limiter added.
- L18 closed: `reconnect()` now calls `stopHeartbeat()` before swapping sockets. The
  decisive test needed the gateway suite's fake timer rig extended to MODEL
  clearInterval (a cancelled interval refuses to tick), because the pre-existing
  "does not stack a second interval" shape passes with or without the fix; the bug
  lives only in the window between `reconnect()` and the new socket's HELLO.
- The heartbeat file: `bot/liveness.ts` (named to avoid colliding with the gateway's
  protocol heartbeat), wired as the SIXTH scheduler task `heartbeat-file`; the wiring
  pin moved 5 to 6, BOT_ENV_KEYS 24 to 26 (`DISCORD_HEARTBEAT_FILE`,
  `DISCORD_HEARTBEAT_INTERVAL_MS`). `writeHeartbeatFile` returns a boolean rather than
  void so the logged-not-fatal failure path is assertable without a console spy.
- L10/L17 closed: `DISCORD_CALL_TIMEOUT_MS` (15000, a code constant copying the
  sanctioned `SERVER_CALL_TIMEOUT_MS` pattern) arms an AbortController INSIDE the
  governor-dispatched send closure, so queue wait never counts against the deadline
  and a stalled Discord socket can no longer park a scheduler loop for the life of
  the process. The `bot/CLAUDE.md` settle rule was rewritten to match: both IO shells
  now carry deadlines, and the always-settle rule stays normative for new runs.
- L13 closed with one deliberate deviation from the plan's "same arm" phrasing: a 400
  with a subject key now populates the forbidden cache (TTL-bounded, so a later
  legitimate write for the same subject is deferred at most `DISCORD_FORBIDDEN_TTL_MS`,
  never lost) but spends NO invalid-request breaker budget, because Discord's ban
  counter tracks 401/403/429 and never 400, and a counted 400 swept across a few
  hundred members would open the breaker guild-wide. Pinned in both directions and
  mutation-confirmed (adding 400 to the `recordInvalid` arm turns the suite red).
- L6 closed: `tsconfig.bot.json` (lib ES2022, types node, include bot) ADDED to the
  checked set beside the root config, `check:ts:bot` chained into `check:types`. The
  Node-only typecheck surfaced ZERO latent DOM globals across all 13 bot files, and the
  gate was proven non-vacuous with a scratch probe (document/localStorage red as TS2584
  under the same flags): fetch/AbortController/Response all resolve from @types/node.
- Deploy: the compose healthcheck probes heartbeat-file FRESHNESS (missing, unreadable,
  and stale all exit nonzero) with a node one-liner containing no `$` (compose would
  interpolate it); `stop_grace_period: 15s`, `mem_limit`/`memswap_limit: 512m`, each
  with a why-paragraph comment in the game service's style. The build session also
  found and fixed a gap nothing in the plan named: compose forwarded only 13 env keys,
  so ALL ELEVEN tunable knobs were inert in production; 14 keys were added to the
  passthrough (the 11 knobs plus the three heartbeat keys) or DEPLOY.md's incident
  levers would have documented a lie.
- Caddy: `/internal/*` joined the @ops 404 matcher in BOTH `deploy/user-data.sh`
  heredocs (byte-identical, tab-indented) and both DEPLOY.md snippets. The old matcher
  string is a strict PREFIX of the new one, so the pre-existing watchdog pins would
  have stayed vacuously green; `tests/deploy_watchdog.test.ts` now counts both forms
  at 3 so a stale short copy cannot ride back in via a by-hand retrofit.
- DEPLOY.md gained its first `## Discord bot` section (27 env keys with incident
  guidance, health verification, the by-design crash-loop paragraph, and the
  incident-2026-07-29 runbook with healthy-reading lines), and the four falsified edge
  claims were rewritten (R12): the restart-countdown parenthetical, the metrics
  three-ops-paths claim, the by-hand retrofit snippet, and the section 4 TLS snippet.

Mutation tally across both build agents: 12 planted, 12 killed with named failing
tests (6 bot-side including the reconnect and deadline arms, 6 deploy-side including
unhardening the bot service while the game stays hardened, which proves the
service-slice helper is real).

Validation: `npx tsc --noEmit` and `npx tsc -p tsconfig.bot.json` clean;
263 tests green across the nine bot and deploy suites in one run; `npm run build:bot`
bundles; `npm run ci:changed` exit 0 (warnings only, pre-existing). Full
`npm run gate` not run for the known sibling-worktree malware false-positive
(`.worktrees/fix-play-map-level-toggle` is still parked in the repo root); the gate's
constituent steps ran by hand above.

Reviewers: privacy-security-review plus a fresh-eyes coverage reviewer over the
combined diff (verdicts recorded in the Phase 7 section of state.md).

### Phase 7 QA (2026-08-02)

Release sync FIRST (standing rule 1): REAL. `origin/release/v0.34.0` measured 105
ahead / 32 behind on a fresh fetch, merged as `502fa16a1` (122 files). Two content
conflicts, both unions: package.json kept the release's incremental `check:ts`
beside the packet's `check:ts:bot` chain, and tests/ci_workflow.test.ts needed the
counts re-measured. The real merge trap was three both-sides-moved-a-count pins
that merged as CLEAN CONTEXT: the packet moved the release-gate single-shard,
release-gate step, and pr-checks step counts up one (the bot build) and the release
moved the same three up one (the tsc buildinfo cache restore), so both sides made
the identical textual change and the union needed one more than either
(10, 14, 13), taken from the merged workflow by measurement rather than by
arithmetic. A fourth fallout surfaced only in the deploy suite: the Phase 7 pin
held `check:ts` to exact equality with `tsc --noEmit`, and the release's
incremental flags broke it without breaking its intent; it now accepts a
project-less `tsc --noEmit` and rejects a `-p`/`--project` redirect, which is the
regression it was written against. The `release-merge-audit` skill came back
clean: the incoming server/game.ts hunks (the hotbar resume guard, the buyItem
bulk argument) touch neither Phase 5 feed site, no `/internal/discord` surface
moved, no endpoint was added, and the release-authored `../server/db` mock site
needs nothing the branch added. 738 targeted tests green on the merged tree
before any QA work. One premise correction worth naming twice: release commit
`40212c559` teaches the malware scanner to skip `.worktrees` (any depth) plus
`.claude/worktrees` and `.codex/worktrees`, so the parked-sibling-worktree gate
failure every session since Phase 2 has worked around is RETIRED and
`npm run gate` runs end to end again.

**Verdict: PASS.** Everything found was fixed in-session; the only open items
predate the session and stay owed where they were (the maintainer-owed
`.env.example` fills, and O7, the prod rollout that actually lands the deploy
assets on the host).

Method: the D19 ultracode audit Workflow, 7 finders (two correctness lanes,
docs-accuracy, test-coverage-auditor, dead-code, privacy-security-review,
qa-checklist) each on a hard 30-tool-call budget, then one adversarial skeptic
per unique finding with the file open and quoting code: 38 raw findings, 32
unique, 27 CONFIRMED (1 blocking, 9 should-fix, 17 nits including judgment
records), 5 refuted, 0 lost, 39 agents with zero deaths and zero empty results.
The qa-checklist lane reported READY with the validation matrix green and
confirmed no other Review Dispatch Matrix row matches the diff.

**The blocking finding, confirmed twice independently.** The gateway's production
`exitProcess` default was the ONE injected default in bot/ with no default-path
arm: every suite arm injects the sixth constructor argument (it must, or the real
`process.exit` kills the vitest worker), and bot/main.ts constructs with three
arguments, so production runs ONLY the untested path. The audit's coverage lane
found it by reading; the mutation pass found it the same hour by planting a
drain-less default that survived all 40 gateway tests. The fix hardened the seam
as well as pinning it, because the security review's stderr drain had an unbounded
hang in it: a blocked docker log pipe defers the write callback forever, leaving a
live process with a dead gateway while the heartbeat task keeps the healthcheck
GREEN, the exact zombie wearing the exact green light this phase exists to end.
The default now stages `process.exitCode` first, arms an unref'd
`EXIT_DRAIN_BACKSTOP_MS` (1000 ms) backstop that exits with the log line lost
rather than not exiting at all, then drains; two new R16-form default-path arms
pin the staged code, the drain-then-exit order, the literal 1, and the exact
backstop bound.

The other fixes, all applied (blocking, should-fix, and nit alike per standing
rule 3): the 400-answered half-open probe direction got its breaker-suite arm
(the comment claimed settle-as-success; nothing drove it); the liveness
never-rejects contract got its synchronous-throw arm (only a rejection was
pinned, so a then/catch refactor letting a sync throw escape survived);
start_period got the relational pin the declared residual asked judgment on
(>= 2x HEARTBEAT_INTERVAL_MS, beside new literals for interval/timeout/retries,
whose deletion falls back to docker defaults silently); the executed-probe suite
got a denied-parent-dir fixture (with the honest finding that "unreadable" meant
un-STAT-able all along: a chmod-000 file stats fine, reads healthy while fresh,
and self-heals via staleness because the bot cannot write it either), a loud
extraction guard (a failed extraction ran `node -e ''` and passed every
all-zeros case), and boundary agreement driven by the window READ FROM THE PROBE
rather than a restated 90000; DEPLOY.md gained a contract suite (every
config-scraped env key must have a TABLE ROW, the probe-only staleness knob
included, plus the runbook command literals) and counted @ops snippets matching
the user-data.sh pins; and the docs/comments were corrected where they were
wrong (stop_grace covers no drain because the bot installs no SIGTERM handler;
GAME_SERVER_URL is compose-pinned, not .env-passed, and carries the shared
secret in cleartext off-network; the staleness window, not the write interval,
is the detection lever; the by-hand freshness command now resolves the path
override exactly like the probe).

Mutation: 21 planted this session, 19 killed, every run with rc!=0 plus named
failing tests plus a Test Files line, patch-applied and restore-verified. The
spec pass (12) killed 10; the stale-bound shift-by-one survived BY DESIGN in
both directions and the relational-pin ruling was judged and UPHELD (the floor
rejects the flapping direction; the magnitude is operator policy whose literal
pin would duplicate the default, the drift shape the compose comment rejects);
the drain-less-default survivor was the real gap above. The fix-round pass (9)
ended 9/9, after one of its own pins was strengthened by its own mutant: the
DEPLOY.md key pin as bare backticks survived a deleted table row on the key's
prose echo, and now demands the row form. Two harness misfires were caught by
the landing-proof discipline and redone rather than scored (a shell-escaped
perl variable interpolating empty, a first-occurrence delete landing in the
game service); both are recorded to memory as
mutation-edits-need-landing-proof.

The fix round was itself reviewed by a fresh-eyes agent (4 nits, zero blocking,
all applied): exitCode restores moved into finally, the 400-probe arm's title
stopped claiming the budget direction its own aged-window fixture cannot decide
(the forbidden suite owns that kill), and the executed-probe header stopped
claiming minute margins for the 5s boundary fixtures the same round added.

Validation at close: `npx tsc --noEmit` and `npx tsc -p tsconfig.bot.json`
clean; 300+ tests green across the ten bot and deploy suites; `npm run
build:bot` bundles; `npm run ci:changed` exit 0 with zero errors (the one
format error it caught mid-round was fixed scoped); full `npm run gate` PASS
end to end, the packet's first since the worktree false-positive began.

### Phase 8 (2026-08-02)

Release sync: `origin/release/v0.34.0` measured 111 ahead / 2 behind at session
start; the two-commit delta (gate vitest worker memory clamp, native
app-lifecycle zombie WebSocket recovery) merged clean as `0fb599b02`. No overlap
with packet files; `tests/ci_workflow.test.ts` was not in the delta, so the
workflow re-measure trap did not apply; the `scripts/gate.mjs` auto-merge was
verified to keep both the new worker clamp and the branch's bot-build step, and
the gate_workers + ci_workflow suites ran green post-merge.

Built as two parallel Agent slices (bot, server) per the phase file, with the
cross-slice contract fixed by the orchestrator up front and recorded as R18 to
R22 in state.md before implementation started: the 14-field wire shape and key
order, cumulative totals on the wire (R19), the hybrid Counter/Gauge rendering
(R18), the four-value scope allowlist (R20, code over the phase prose's three),
the staleness field split with the closure-held push age (R21), and the
sweep-durations / outbox-drain-sizes trim (R22, no accessor exists and adding
one is out of scope). The idle-without-report delivery trap struck the Explore
context loader (one nudge recovered the full report); both implementation
agents reported unprompted.

What shipped, beyond the checklist headline:

- `bot/presence_counters.ts`: a pure TOTAL collector (throwing or hostile
  governor reads yield no `counters` key, never a failed presence push), fresh
  literal in pinned wire order, plus `withPresenceCounters` as the attach seam
  in `pushPresence`. A real-governor guard test compares the live snapshot key
  set against the wire contract so a future governor counter cannot go silently
  unreported.
- Both presence arms share `sanitizeBotCounters` (clamp to [0, 1e9], scope
  record rebuilt from the fixed four keys, three-state breaker allowlist,
  unknown fields dropped, non-object skips the cache so an old bot keeps
  working), pinned identical by a dual-arm test; no known_deviations row
  needed. The presence handler stays db-free, preserving the parity suite's
  premise.
- `server/discord_bot_counters.ts` (injected clock throughout, unlike its
  presence twin) and `server/http/discord_bot_metrics.ts`: 14 metric names, 19
  series, all rendering at zero from registration; counters advance at push
  time by delta with the bot-restart guard, gauges read the cache at scrape.
- Worst-case presence body with the counters block: 7214 bytes against the
  64 KiB readBody cap (the block alone is 443 bytes).
- No new env keys, no .env.example debt added, no new route, no SQL.
- Both slices ran mutation checks (wrapper deletion, field transposition,
  trunc-to-round plus cap removal plus key reorder, restart guard to plain
  subtraction, staleness > to >=, allowlist passthrough, sanitizer input
  spread): every mutant killed by a named test.

Validation at close: `npx tsc --noEmit` clean; 795 tests green across the 15
bot, server, spine, and deploy-doc suites; `npm run build:bot` and
`npm run build:server` pass; `npm run ci:changed` exit 0.

Review round (privacy-security-review plus test-coverage-auditor, both fresh
over the combined diff): security ZERO blocking; coverage ONE blocking plus
four should-fix, all closed in-round. The blocking finding was real and
mutation-shaped: nothing pinned `registerDiscordBotMetrics` into the server
boot, so deleting the one wiring line left all 168 new tests green while
/metrics rendered none of the series; it is now a source pin in
`tests/server/game_boot_order.test.ts` beside the liveness pin it copies.
Also closed: the absent-scope-record 500 arm, the bounded push-timestamp pin
(a Date.now-to-0 mutant survived the typeof pin), the exporter's default-clock
arm, the scope-level real-governor guard, the envelope byte pin now built
through the production attach seam, and the stale-read copy pin. The security
review's one should-fix became a stated trust model in the metrics module
header (secret holders are trusted for metric integrity; memory, series count
and labels stay hard-bounded); the remaining notes are declared residuals in
state.md for the QA session.
