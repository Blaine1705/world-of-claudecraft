# Phase 9: /api/discord caching

The incident report measured `/api/discord` at 7,356 requests per hour from site visitors,
and every one of them ran four uncached database reads. It scales with people looking at the
site, not with people playing, and it is the last hot read in this packet's blast radius that
still hits Postgres on every request. This phase puts the account-scoped part of the payload
behind the repo's existing `createCachedRead` seam with a short TTL, wires the busts in the
same change so a link, an unlink, a points grant or a swag claim is never served stale, and
leaves the presence block exactly as live as it is today. It is deliberately the smallest
phase in the packet, and its QA session closes the packet.

Verified against the tree on 2026-07-30 (re-confirm before relying on it): `GET /api/discord`
has TWO arms, the RouteDef in `server/discord.ts` (near :1382, handler `discordStatusHandler`
at :1322) and the frozen legacy arm in `server/main.ts` (near :2229). Both funnel into
`handleDiscordStatus` (`server/discord.ts:790`), which calls `discordStatusPayload` (:798).
Caching inside `discordStatusPayload` therefore covers both arms parity-identically by
construction, which is what makes this phase small.

Starter prompt for the session:

```
This is Phase 9 of the Discord Bot Stability packet: /api/discord caching.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).
No ultracode Workflow for this phase: it is one small server slice. Its QA session runs
ultracode and closes the packet.

Goal: the account-scoped part of the GET /api/discord payload is served from a keyed,
bounded, short-TTL cached read with every bust wired in the same change, so a cache-hit
request performs zero payload queries and no caller can be served stale data after a change
it just made.

STEP 0 - PRE-FLIGHT: git status clean in the worktree (ask if dirty; another session may
share the checkout). Memory scan of MEMORY.md for: cached-read-bust-inflight-joiner (a bust
during an in-flight refresh), cachedread-captured-clock-vs-fake-timers (why a cached read
built at module load binds Date.now and defeats fake timers), daily-rewards-module-memo-reset
and beforeEach-busts-the-cache (test isolation between cases), and the shared-worktree commit
rule (explicit paths, never git add -A).

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly): spawn an Explore agent over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md, this phase file,
and:
  - server/discord.ts: discordStatusPayload (near :798) and every read it performs
    (discordForAccount, loadRewardState, listSwagClaims, accountById) plus the
    discordPresenceCache() call it composes in; handleDiscordStatus (near :790); the
    RouteDef table entry for GET /api/discord (near :1382) and discordStatusHandler (near
    :1322); handleDiscordUnlink (near :846) and the swag claim handler
  - server/main.ts: the legacy GET /api/discord arm (near :2229) and its rate guard
  - server/cached_read.ts (the whole file: TTL, single-flight, the epoch guard, stale-serve,
    the injected clock)
  - server/main.ts:809 (projectStatsCache), server/admin_overview_cache.ts,
    server/daily_rewards_board_cache.ts, and every existing .bust() call site: these are the
    bust-wiring exemplars
  - server/discord_db.ts and wherever else the payload's inputs are WRITTEN: the OAuth link
    callback, unlink, guild-member updates, reward-point grants (including the internal
    grant and member routes and the daily-rewards path), swag claims, and the password-set
    path that flips accounts.password_set
  - the rate guard on both arms (discordActiveRateGuard and discordRateLimited): what the
    limit is and where it is enforced
  - server/CLAUDE.md "Hot paths" (the cached-read, single-flight, and unbounded-growth rules)
  - the test rigs R1 (state.md rulings block) sanctions: tests/server/internal.test.ts (its
    vi.mock module fakes plus the runRoute helper) and tests/discord_db.test.ts (the
    hand-rolled makePool fake whose calls array is the sanctioned way to count SQL
    statements), plus tests/server/discord.test.ts and any existing test that pins the
    /api/discord response. Never invent a raw pg mock
It returns: the two arms and whether they still share discordStatusPayload; the exhaustive
list of write sites that can change any field in the payload, each with file:line; whether
any keyed cached-read wrapper already exists in server/ (as of 2026-07-30 there is none:
every existing caller of createCachedRead holds a single value); the rate-guard limits on
both arms; and the test helpers and fixtures already available for this route.

STEP 2 - EXECUTE: one agent is enough for the implementation; run a second agent in parallel
to do nothing but enumerate and verify the bust sites (that enumeration is where this phase
actually fails). Give both the Explore summary, not the raw planning docs.

  Implementation:
  - A small keyed cache module of its own, sanctioned as this phase's scope by R11 in the
    state.md rulings block (not a Map open-coded inside server/discord.ts):
    it owns per-account CachedRead instances built on createCachedRead, exposes a read for
    one account, a bust for one account, and a bust-all, and it is BOUNDED. An unbounded map
    keyed by account id is exactly the "table that grows without bound" defect server/CLAUDE.md
    names, so it needs an eviction story (a cap with eviction, or a sweep of idle entries)
    and a test that pins the bound. Take the clock injection through to createCachedRead's
    opts.now so tests can drive the TTL.
  - The cached unit is the DATABASE-BACKED part of the payload only. discordPresenceCache()
    is read fresh on every request and composed into the response, so the presence block
    stays exactly as live as it is today, and a cache hit still performs zero queries because
    presence is already an in-memory read. This is the confirmed reading of D17, settled as
    R10 in the state.md rulings block: presence is never frozen behind the payload TTL, and
    the reading is not open for re-litigation.
  - Cache inside the shared payload assembly so both arms get identical behavior from one
    change. Same for the busts: wire each bust in the shared handler or the shared write
    function, never in a route-table entry, or the legacy arm will diverge.
  - TTL: short, env-configurable with a safe default (D13), documented with the other new
    env keys.
  - Every write site the enumeration agent found gets its bust wired in THIS change (D17).
    A bust that is "obviously" covered by the TTL is not covered: a user who unlinks and
    immediately reloads must not see themselves still linked.
  - The 15-per-minute rate guard stays exactly as it is on both arms. Caching is not a
    reason to loosen it.

  Tests (reuse the rig the matching suite already uses, per R1; never a raw pg mock):
  - Miss then hit: the second request inside the TTL performs ZERO payload queries (assert
    the query count, not just the response body).
  - TTL expiry refreshes, driven by the injected clock, not by sleeping.
  - Bust arms: one bust per enumerated write site, each proving the next read reflects the
    change. Drive them through the real code path (call the unlink or grant function), not
    by calling bust() directly, or the test proves only that bust() exists.
  - The in-flight joiner arm: a bust landing during a refresh must not let a post-bust reader
    join the pre-bust flight (memory: cached-read-bust-inflight-joiner).
  - Cross-account isolation: account A's cached payload is never served to account B. This is
    the highest-severity failure mode in the phase, so give it its own decisive test.
  - The bound: filling the cache past its cap evicts rather than growing forever.
  - Both arms return identical payloads for the same account and cache state.

INVARIANTS IN PLAY:
- D17 (this phase's headline): /api/discord gets a per-account short-TTL cached read through
  the createCachedRead seam, with moderation and mutation busts wired in the SAME change;
  the presence block stays as is.
- D9 (dual-arm rule): /api/discord HAS a frozen legacy arm. A behavior edit lands on both the
  RouteDef and the legacy arm in the same change, or carries a ledgered deviation in
  tests/server/http/known_deviations.ts. Caching inside the shared payload function satisfies
  this by construction; verify that the two arms still share it before relying on that.
- D13 (operator levers): the TTL and any cap are env-configurable with safe defaults and
  documented in DEPLOY.md.
- D18 (scale envelope): the cache is bounded at 1,000 concurrent players and beyond; state
  the bound and what happens past it.
- Non-negotiables from state.md: no DDL and no new persisted state (this is process-local
  memory); SQL stays in db.ts / *_db.ts; handlers stay req/res-free; errors stay stable codes
  from the append-only error_codes.ts; commit with explicit paths, never git add -A; no em
  dashes, en dashes, or emojis anywhere.

OUT OF SCOPE: /api/site-presence (explicitly untouched by this packet); the presence cache
itself; any change to the payload's SHAPE or to what the endpoint returns; the DELETE
/api/discord and swag-claim behaviors beyond adding their busts; retiring the legacy ladder
(owned by the pipeline packet); new endpoints, new tables, and new indexes; bot/ changes of
any kind.

STEP 3 - VALIDATION + REVIEW: run the state.md matrix rows that match the diff: `npx tsc
--noEmit`; `npx vitest run tests/server/internal.test.ts tests/discord_server.test.ts
tests/server/discord.test.ts tests/discord_db.test.ts` plus the new cache test file; the http
spine (`npx vitest run tests/server/http/parity.test.ts tests/server/http/completeness.test.ts
tests/server/http/ownership_coverage.test.ts`); `npm run build:server`; `npm run ci:changed`
(scoped --write only on files you changed). Dispatch reviewers per the Review Dispatch Matrix
in implementation-plan.md, matching rows only: privacy-security-review matches (server/
change, and a per-account cache is an account-data-privacy surface: a keying bug leaks one
player's Discord identity to another) and database-performance-reviewer matches (this changes
query cadence on a hot read). migration-safety does not match (no DDL, no persisted-shape
change). cross-platform-sync, architecture-reviewer and frontend-seam-reviewer do not match;
if one does, the phase went out of scope. Prompt every reviewer for COVERAGE, not filtering.
Resume a truncated reviewer with: "Stop reading more files. Output the full report now. No
more tool calls. Format: BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT." Do not commit while
a BLOCKING finding stands.

STEP 4 - COMMITS (Conventional Commits with a scope, explicit paths, every commit carries a
body of 1 to 4 plain sentences saying what changed and why, no em dashes, no emojis):
1. feat(server): add a bounded per-account keyed cached read
2. feat(server): serve /api/discord from the keyed cache and bust it on every write
3. test(server): pin the cache hit, TTL, bust, isolation, and bound arms
(Collapsing 1 and 2 into one commit is fine if the module and its only caller land together;
do not split the busts away from the caching, they are one change.)

STEP 5 - ACCEPTANCE (each item verifiable, not asserted):
- A cache-hit request performs zero payload queries, asserted by counting statements on the
  makePool fake's calls array (the R1 rig), not by inspecting the response body.
- Every enumerated write site has a test proving the next read reflects its change, driven
  through the real code path.
- Account A's payload is provably never served to account B.
- The TTL is driven by an injected clock in tests, and the cache is not built at module load
  in a way that binds a real Date.now where a test needs otherwise.
- The cache is bounded, with the bound pinned by a test.
- Both /api/discord arms return identical payloads for the same account and cache state, or
  a ledgered deviation exists with a written justification.
- The 15-per-minute rate guard is unchanged on both arms, pinned by an existing or new test.
- `npx tsc --noEmit`, the server suites, the http spine, `npm run build:server`, and
  `npm run ci:changed` are green.

STEP 6 - DOCS: tick the Phase 9 boxes in progress.md and set its status row; update state.md
(the new module, the new env keys, and the enumerated bust-site list, which is the artifact a
future reader will need most). Same commit as the work, explicit paths. Record surprising
rules to memory.

STEP 7 - FINAL RESPONSE: phase status; files touched; validation results (command by
command); reviewer verdicts; the bust-site enumeration; deferrals; and a one-line handoff for
the Phase 9 QA session, noting that it is the packet-close session.

STOPPING RULES:
- Stop and surface if GET /api/discord has a legacy arm that cannot be kept parity-identical
  (for example the two arms no longer share the payload assembly). Report the divergence and
  the options; do not silently cache one arm.
- Do NOT stop over the caching unit: R10 settles it. Cache the database-backed part, compose
  presence fresh per request, and never let the presence block sit behind the TTL.
- Stop if bounding the keyed cache would require an eviction policy that could serve one
  account's entry to another. Correctness beats the bound; report it.
- Stop if a BLOCKING reviewer finding cannot be fixed inside this phase's scope.
```
