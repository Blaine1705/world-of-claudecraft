# Phase 2 QA: Discord rate-limit governor

The governor is the module that has to hold under fault, in production, where nobody is watching:
if a guard is inverted or a boundary is off by one, the failure mode is another temporary API ban
rather than a red test. This session verifies that every D2, D3, and D4 behavior is actually
implemented and actually asserted, that nothing in the rewire changed which Discord calls the bot
makes, and it mutation-checks bot/rate_governor.ts guard by guard.

Phase 2 already ran its own adversarial round: a six-agent test fan-out with an independent
skeptic per file, plus `qa-checklist` and `privacy-security-review`, plus 15 mutants. That round
found six real defects in the module. This session's value is therefore NOT to repeat it, but to
audit the FIXES (which are unreviewed code), to plant mutants the first round did not, and to
judge the residuals and deferrals it declared rather than take them on faith.

## Starter prompt

```
This is Phase 2 QA of the Discord Bot Stability packet: verify the Discord rate-limit governor.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent before it
counts) plus mutation checks on bot/rate_governor.ts. Judge every refutation yourself rather than
taking it on faith, and require the skeptic to have the file open before a refutation counts.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch
feature/discord-bot-stability).

Phase 2 is committed. The diff is 91e9ac4461..HEAD: 11 commits, 37 files, roughly +5231/-154.
HEAD was b3a018061 when this prompt was written; use the real HEAD.

STEP 0 - PRE-FLIGHT: run `git status` and confirm it is clean with Phase 2 committed; another
session may share this checkout, so ASK before touching anything you did not create. Sync the
release base per the standing rules in state.md (`git fetch origin release/v0.33.0`, then
`git rev-list --left-right --count HEAD...origin/release/v0.33.0`); it was 0 behind at the end of
Phase 2.

Memory scan. Read these, which EXIST: mutation-checks-commit-first (commit before planting any
mutation), round-trip-pins-reference-aliasing (the self-comparison pin trap),
big-diff-reviewer-turn-budgets (give every reviewer a hard tool-call budget and a report-first
line), fanout-agent-delivery-traps (Agent-tool background agents idle WITHOUT reporting by
default; prefer Workflow for fan-outs and budget a nudge round), node25-breaks-jsdom-gate (the
shell default is now Node v26.5.0, so verify `node -v` rather than prepending),
dotenv-files-harness-blocked, and the workflow-* entries if you orchestrate.

Do NOT go looking for these: cachedread-captured-clock-vs-fake-timers,
settimeout-fractional-delay-fires-early, env-empty-numeric-default-shift,
mutation-harness-must-prove-tests-ran, mutation-test-uncommitted-revert-trap,
worktree-symlink-vitest-limitation, stale-node-modules-fullsuite-failure-set. Earlier drafts of
this packet cited all seven by name and NONE of them exist in the memory store. The underlying
rules are real and are written down in state.md "Known gotchas for implementers"; read them
there. If you find yourself citing a memory entry, confirm the file exists first.

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
docs/discord-bot-stability/progress.md (the Phase 2 note is long and is the real briefing),
docs/discord-bot-stability/phase-02-rate-limit-governor.md, and the Phase 2 diff
(`git diff 91e9ac4461..HEAD`). It returns: the promised deliverables and acceptance criteria, the
files touched with a one-line summary of each, the governor's public surface and internal state
machine in prose, the env keys with defaults, and a map of which test covers which D2/D3/D4
behavior. Give it a hard 30-tool-call budget and a report-first line; if it idles without
reporting, nudge it once rather than respawning.

WHAT PHASE 2 SHIPPED BEYOND THE ORIGINAL SPEC (audit these as first-class, they are where the
risk now lives; each was a deliberate call, so judge the call, do not just confirm it exists):
  - Subject keys for the permanent-failure cache are scoped PER PERMISSION, `nick:<g>:<u>` and
    `roles:<g>:<u>`, not per member. One key per member was a real regression found late: Discord
    403s a nickname PATCH permanently for the guild owner and for anyone above the bot in the role
    hierarchy, so a shared key suppressed that member's tier-role sync for the full TTL, and a
    missing MANAGE_NICKNAMES stopped role sync guild-wide.
  - Interaction callbacks are exempt from the global send-rate cap (Discord's documented contract)
    and get a per-interaction bucket. They still pay bucket gating and every pause. The exemption
    matches the `/callback` SUFFIX, not just the `POST /interactions/` prefix.
  - MISSING_RETRY_AFTER_MS (1000): a 429 carrying no retry_after in body or header waits a second
    rather than retrying with zero delay.
  - `redactPath` closes ledger item L1 in the THROW: an interaction or webhook token never reaches
    a thrown message, a bucket key, a queue key, a log field, or a counter. Ids are deliberately
    KEPT. Verify per call site, not from the tests.
  - The pause is re-checked AFTER the bucket gate and the rate slot, since either can block long
    enough for another queue to declare a pause.
  - Three registries are bounded and their sizes are reported as counters so the bounds are
    observable: `limits` (LRU), `resolved` (LRU, re-inserted on each sighting so a hot route is
    never the victim), and `queues` (dropped on drain). Plus MAX_QUEUE_DEPTH and
    MAX_FORBIDDEN_ENTRIES.
  - Counters gained `trackedRoutes` and `activeQueues` beyond the D16 list. Confirm state.md's
    counter list and the snapshot agree, since Phase 8 ships exactly these.
  - Tests drive tests/helpers/synthetic_clock.ts, a fully VIRTUAL clock. Vitest fake timers are
    deliberately not used anywhere in the governor suites. A clock captured at construction does
    not move under fake timers, and a fractional delay may fire early; the virtual clock has
    neither problem.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering: report every gap with confidence and
severity, do not pre-filter; hard tool-call budget and a report-first line each):
  - Correctness agent, Discord contract: does the governor provably never dispatch at
    `Remaining == 0`? Is the FULL retry_after honored on all three scopes with no ceiling (the old
    10 second clamp gone)? Does a non-JSON 429 body pause for DISCORD_BAN_PAUSE_MS and log, rather
    than short-retrying? Does the breaker exclude scope `shared` from its count AND from failing a
    half-open probe, trip at DISCORD_BREAKER_LIMIT, roll its 10 minute window, and half-open only
    after a full quiet window? Does opening the breaker restart that quiet window on EVERY path,
    including a probe whose send threw? Does the forbidden cache suppress retries for its TTL and
    expose a role-position invalidation? Are the provisional key and the returned bucket hash
    reconciled without double counting, including the migration case where the first response
    carries rate headers but no hash? Any hard-coded per-route numeric limits (O2 says none)? Is
    /api/v10 pinned, the User-Agent valid, X-Audit-Log-Reason on member PATCHes, X-RateLimit-Scope
    logged on every 429 (O5)?
  - Correctness agent, rewire: did the call set change? Every Discord REST call made before must
    still be made with the same method, path, and payload, and the caller-visible contracts (what
    throws, what returns null, what is swallowed) intact or deliberately and documentedly changed.
    Pay attention to the interaction exemption and to the bounded retry replacing an unbounded
    one. Purity: no fetch, ws, Date.now, setTimeout, setInterval, performance.now, and no imports
    at all in bot/rate_governor.ts. D-invariants: D7 (no new dependency), D8 (pure module plus thin
    shell plus wiring in main.ts), no src/ or server/ edit, no secret committed, no em dash, en
    dash, or emoji anywhere in the diff including log strings and commit messages.
  - Test coverage agent: is every arm decisive? For each test ask the one question that matters:
    if I deleted the line this is about, does this test go red? Name the ones that would stay
    green. Confirm the env defaults are asserted with an empty-string arm and a non-numeric arm,
    not only an unset arm, and that each knob is read from its OWN key with a distinct value (a
    transposition must fail). Confirm the four keys are in the commented .env.example Discord block
    with their defaults (R8, DONE in Phase 2).
  - Dead-code agent: the old retry path fully deleted (no orphaned constant, no unused import, no
    unreachable branch from the 10 second clamp), unused exports, types with no consumer.
  - Review Dispatch Matrix rows matching the diff, per implementation-plan.md: the bot code matches
    no row, the sanctioned .env.example edit (R8) matches `privacy-security-review`, so that
    reviewer plus `qa-checklist` is the expected set and the .env.example edit is NOT scope creep.
    Any OTHER matching row (server/, src/net/, compose, CI) is a finding: the phase went out of
    scope.

  AUDIT THE FIXES SPECIFICALLY. Phase 2's own review round found six real defects and fixed them
  late, which makes those fixes the least-reviewed code in the diff. Verify each fix is right, not
  merely present: (1) the half-open probe settling on an ordinary JSON 429; (2) probe settlement
  tied to `isProbe` rather than to any success, so an essential reply cannot close the breaker on
  the sweeps' behalf; (3) a probe whose send threw or whose retries ran out settling in a
  `finally`; (4) opening the breaker restarting the quiet window; (5) the per-permission subject
  keys; (6) MAX_TRACKED_BUCKETS enforced on the absorb429 insert path and eviction falling back to
  a live victim when nothing is idle.

  MUTATION PASS on bot/rate_governor.ts, in an ISOLATED worktree created from the Phase 2 HEAD
  commit (never check out over uncommitted work; commit first). Phase 2 already planted and killed
  these 15, so plant NEW ones rather than repeating them: secondsToMs ceil to floor; the probe
  `finally` settle; forbidden status widened to >= 400; probe not tied to isProbe; a 429 not
  failing the probe; openBreaker not restarting the quiet window; the resolved LRU cap; the
  drained-queue drop; the remap state migration; shared-scope counted by the breaker; the
  absorb429 cap enforcement; idle-only eviction; both subject-key helpers collapsed to one key; a
  bare Number() env parse; a knob transposition.
  New mutants worth planting:
    - Guard inversions: dispatch WHEN Remaining is 0; skip the global pause on a global-scope 429;
      treat a non-JSON 429 as a normal 429; make `essential` bypass the forbidden cache too.
    - Boundary shifts: `Remaining <= 0` to `< 0`; Reset-After read as ms instead of seconds (and
      the reverse); breaker limit off by one each way; an entry exactly at the 10 minute window
      edge; the forbidden TTL edge; MAX_QUEUE_DEPTH off by one.
    - Dropped calls: never record a 429; never write the forbidden cache; never increment a
      counter; never reserve the global slot; drop the `/callback` suffix from the exemption.
    - Ordering: move the global-slot reservation after an await so two callers can take one slot;
      swap waitForBucket and waitForGlobalSlot.
  Each mutant must be killed by a NAMED test. Prove the suite actually RAN for every mutant:
  record the vitest summary line and confirm a nonzero failure count, since a config or path
  mistake that runs zero tests looks exactly like a pass. Prove the patch APPLIED (cmp against a
  backup) before scoring a survivor, and confirm your mutant really recreates the defect it names:
  in Phase 2 a subject-key mutant "survived" only because it collapsed one of the two key helpers
  and left them still distinct.

  DECLARED RESIDUAL, do NOT "fix" it and do not score it as a survivor: the drain loop in
  `evictBuckets` is observationally identical to a single `if` while entries are inserted one at a
  time, so no assertion can distinguish them. It is kept as defense against a future batch insert,
  on the same footing as R14 and the S05 precedent.

  TRAPS THAT ACTUALLY STRUCK IN PHASE 2, all of which looked like passing tests:
    - An id built as `1000000000000000000 + i` exceeds Number.MAX_SAFE_INTEGER, so hundreds of
      loop iterations collapsed onto the same few ids and a registry-bound test passed with the
      bound deleted.
    - A literal accented character in a fixture depends on whether the file stores it precomposed
      or decomposed, which changes the expected string. Use escapes.
    - A fixture value equal to the implementation's own fallback default cannot fail.
    - `rejects.toThrow(string)` is a SUBSTRING match; pass an Error for equality.
    - The shared `call` helper in the breaker suite drains the whole virtual clock, so any state
      that only exists mid-flight (a probe in flight, a non-zero queue depth) is unobservable
      unless you hold it open with a deferred you resolve by hand.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). If a finding
is genuinely not a defect, say so and why; do not silently drop it. Then review the fix round
itself with a fresh-eyes agent, because the fixes are unreviewed code, and mutation-check any new
pins it adds. Then re-run the state.md bot-only validation row: `npx tsc --noEmit`, `npx vitest
run` over tests/discord_bot.test.ts plus every tests/discord_bot_* and
tests/discord_bot_governor_* file, `npm run build:bot`, `npm run ci:changed` (scoped
`npx @biomejs/biome check --write <file>` for fixes, never a whole-repo write), and `npm run gate`
at close. Commit with explicit paths, a scoped Conventional Commit subject, and a body; never
`git add -A`.

KNOWN GATE FAILURE, do not chase it and do not report it as a regression:
`tests/texture_upload.test.ts` fails on the full suite and reproduces identically on the pre-phase
base commit 91e9ac4461 in a clean detached worktree. It is Three.js version-pin drift and this
packet touches no src/ file. The gate aborts at vitest BEFORE tsc and the builds, so finish those
by hand. Judge the phase on the bot suites plus the hand-run steps.

KNOWN ENVIRONMENT BLOCK: every `.env*` path is denied to the agent at the HARNESS level, for Read
and for Bash alike. A narrowly scoped allow rule in .claude/settings.local.json did not lift it
in-session. If you need to verify or edit .env.example, ask the user to run a `! <command>` in the
session rather than burning turns on workarounds.

JUDGE THESE DEFERRALS rather than rediscovering them; each is recorded in state.md with its
reason, and your job is to decide whether the reason holds:
  - `invalidateForbidden()` ships as a hook with NO caller, so a cached 401/403 clears only on TTL
    (24h default). Is deferring the role-position wiring to a later phase actually acceptable, given
    a suppressed `removeMemberRole` leaves a status role granted that should have been revoked?
  - The four env knobs are validated positive-finite but not RANGE clamped, so an operator can
    defeat the control they configure (MAX_RPS above Discord's 50 ceiling, a 1 ms ban pause, a
    breaker limit that never trips).
  - The interaction-callback path has every ceiling off at once by design (own bucket, exempt from
    the rate cap, essential so the breaker never stops it) and a guild member can trigger it at
    will.

STEP 4 - DOCS: update docs/discord-bot-stability/progress.md (Phase 2 QA row complete, plus
deferrals under the per-phase notes) and docs/discord-bot-stability/state.md (drift the audit
found, the final env key names and defaults, the counter names Phase 8 will consume, and any new
implementer gotcha). If the audit answered or sharpened an OPEN item (O2, O5), say so in state.md
rather than closing it silently. Record genuinely reusable traps to memory as one file per fact
plus its MEMORY.md pointer line, and verify the file exists after writing it.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts found and fixed by
severity, the mutation kill tally (planted, killed, survived, each survivor explained), deferrals
with reasons, and a one-line handoff for the Phase 3 session.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing Phase 2's
scope (for example a contract gap whose fix belongs to the Phase 3 scheduler or the Phase 6 sweep
rewrite). Stop if a surviving mutant can only be killed by changing behavior rather than by adding
a test, and report it as a finding instead of changing behavior here. Stop if closing a gap would
need a new npm dependency (D7): escalate to the user instead. Stop if the mutation worktree cannot
run the suite, rather than reporting an unproven kill. Stop if the worktree is dirty with work that
is not yours.
```
